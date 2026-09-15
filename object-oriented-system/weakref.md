是的，这段 `handle_weakrefs()` 可以算 CPython GC 里最“反直觉”的代码之一。复杂的根源不是 weakref 的数据结构，而是它同时撞上了四件危险的事：

**循环引用、弱引用回调、任意 Python 代码执行、对象复活（resurrection）。**

而 GC 最怕的状态就是：

> “我已经判定你是垃圾，甚至已经开始拆你了；结果 Python 代码突然又拿到了你。”

CPython 自己的 `gc_weakref.txt` 把最核心的不变量说得非常直接：

> GC 一旦计算出了 unreachable 集合，就不能允许 Python 层代码再次访问其中的对象。

否则，一个已经执行过部分 `tp_clear()` 的对象可能重新逃回正常程序。PEP 442 把这种已经开始被拆解的 cyclic trash 称为潜在的 “zombie / broken object”；后果轻则奇怪的 `AttributeError`，重则 C 层状态损坏甚至 segfault。([Python Enhancement Proposals (PEPs)][1])

下面从头拆这段代码。

---

# 1. 先建立三个对象：O、W、C

理解整个函数，只需要始终记住三个角色：

```text
O = 被弱引用的对象，referent
W = weakref 对象
C = W 的 callback
```

关系大致是：

```text
                 强引用
            W ───────────> C
            │
            │ 弱引用
            ▼
            O
```

非常重要：

```text
W -> O    不增加 O 的引用计数
W -> C    是真正的强引用
```

也就是说：

```python
w = weakref.ref(o, callback)
```

`w` 不保活 `o`，但 **w 会保活 callback**。

这是后面判断

```c
if (gc_is_collecting(AS_GC(wr)))
```

为什么有理论依据的关键。

---

# 2. 普通引用计数释放其实很简单

先不考虑循环 GC。

例如：

```python
import weakref

class A:
    pass

def callback(w):
    print("A died")

a = A()
w = weakref.ref(a, callback)

a = None
```

最后一个强引用消失：

```text
A.refcnt
   ↓
   0
```

于是正常析构路径大致可以理解成：

```text
A 要销毁
 ↓
清除指向 A 的 weakref
 ↓
w->wr_object = None
 ↓
调用 callback(w)
 ↓
销毁 A
```

这里基本没有矛盾。

因为：

> A 的死亡是引用计数明确触发的。

没有“GC 已经决定一整个对象图都是垃圾，然后又有人偷偷访问其中一个”的问题。

---

# 3. 循环引用完全不同

例如：

```python
class A:
    pass

a = A()
a.self = a
```

然后：

```python
a = None
```

此时：

```text
       ┌───────┐
       │       ▼
      [ A ] ───┘
```

`A.ob_refcnt` 仍然不是 0。

所以引用计数无法回收。

循环 GC 会做近似这样的事情：

```text
所有候选对象
      │
      ▼
复制实际 refcount → gc_refs
      │
      ▼
减掉候选集合内部引用
      │
      ▼
gc_refs > 0        gc_refs == 0
reachable          tentatively unreachable
                       │
                       ▼
                  unreachable
```

此时 GC 作出了一个非常重要的逻辑判断：

```text
这些对象从 GC 之外已经没有强引用路径了。
```

接下来最终会：

```c
tp_clear()
```

把内部引用拆掉。

CPython 3.8 的大体顺序是：

```text
找出 unreachable
        ↓
处理 legacy finalizer
        ↓
handle_weakrefs()
        ↓
调用 tp_finalize / __del__
        ↓
检查是否 resurrection
        ↓
delete_garbage()
        ↓
tp_clear() 拆循环
```

CPython 后续版本的源码仍清楚保留了这个整体结构。([Chromium Git Repositories][2])

---

# 4. weakref 最大的问题：callback 是任意 Python 代码

假设：

```text
O = unreachable
W = weakref(O)
C = callback
```

GC 回收 O 时，如果直接：

```c
callback(W);
```

那么 callback 里面理论上什么都能做：

```python
def callback(w):
    import xxx
    global something
    ...
```

甚至线程切换后，其他 Python 线程也可能运行。

`gc_weakref.txt` 特别强调了这一点：问题甚至不要求 callback “故意作恶”；**只要执行任何 Python 代码，就可能有机会通过其它 weakref 重新接触 cyclic trash。** 

所以真正的问题不是：

```text
callback 能不能通过 w 自己拿回 O？
```

因为 GC 可以先：

```c
_PyWeakref_ClearRef(w);
```

让：

```python
w() is None
```

真正的问题是：

> callback 会不会通过 **另一个仍然活着的 weakref** 拿回另一个 unreachable 对象？

这正是第一遍扫描必须“全部 clear 完，再执行 callback”的原因。

---

# 5. 为什么不能边 clear 边 callback？

这是理解整个函数最关键的一点。

假设有两个垃圾对象：

```text
O1       O2
```

外面还有两个活着的 weakref：

```text
W1 ---> O1
W2 ---> O2
```

其中：

```text
W1.callback = C1
```

而 `C1` 可以访问全局变量 `W2`。

也就是：

```python
def callback1(w):
    x = W2()
```

GC 如果这么处理：

```text
处理 O1
 ↓
clear W1
 ↓
立即 callback1(W1)
 ↓
callback1 调 W2()
```

但此时如果 O2 还没处理：

```text
W2 ---> O2
```

仍然有效。

于是：

```python
x = W2()
```

就产生了：

```text
强引用 x ---> O2
```

而 O2 已经被 GC 判定：

```text
unreachable
```

灾难：

```text
GC: O2 是垃圾，我马上 tp_clear(O2)

程序: 不，O2 现在被 x 引用了！
```

于是产生 resurrection。

所以：

```c
/* cannot invoke any callbacks until
 * all weakrefs to unreachable objects are cleared
 */
```

不是保守设计，而是必须如此。

正确顺序是：

```text
第一遍：

O1 → clear W1
O2 → clear W2
O3 → clear W3
...
全部完成

此刻所有：
Wn() == None

           ↓

第二遍：

callback(W1)
callback(W2)
...
```

于是：

```python
callback1():
    W2()
```

只能得到：

```python
None
```

不会复活 O2。

这就是：

```c
PyGC_Head wrcb_to_call;
```

存在的根本理由。

它本质上是：

```text
“已经解除，但稍后需要兑现 callback 的 weakref 队列”
```

---

# 6. 接下来出现真正的 Headache：W 自己是不是垃圾？

现在来看注释最著名的：

```c
/* Headache time. */
```

对于：

```text
W ---> O
```

已知：

```text
O ∈ unreachable
```

但 W 有两种完全不同的情况。

---

## 情况 A：O 是垃圾，但 W 活着

例如：

```python
o = Node()
o.self = o

w = weakref.ref(o, callback)

o = None
gc.collect()
```

对象图：

```text
外部程序
   │
   │ strong
   ▼
   W ─ ─ ─weak─ ─ ─> O
   │                  ▲
   │                  │
   ▼                  └── self
 callback
```

这里：

```text
O = unreachable
W = reachable
```

这意味着：

> 用户特意保留了这个 weakref。

那么用户有合理预期：

```python
callback(W)
```

应该执行。

所以这种 callback 必须 honor。

也就是：

```c
if (!gc_is_collecting(AS_GC(wr))) {
    ...
    queue callback
}
```

---

# 7. 情况 B：O 是垃圾，W 自己也是垃圾

例如一种概念上的结构：

```text
      cyclic trash

       ┌─────────────┐
       │             │
       ▼             │
      W ───strong──> C
      │              │
      │ weak         │
      ▼              │
      O              │
      ▲              │
      └──── cycle ───┘
```

更简单地说：

```text
外界没人引用 O
外界也没人引用 W
外界也没人引用 C
```

那么：

```text
O ∈ CT
W ∈ CT
C ∈ CT
```

这时候 callback 要不要调用？

CPython 的答案：

```text
绝对不要。
```

有两个理由。

### 理由 1：完全没有必要

因为：

```text
O 要死
W 也要死
```

那么完全可以认为：

```text
W 先死
O 后死
```

而 weakref 的语义本来就不保证：

> weakref 自己都已经死了以后，它的 callback 还必须执行。

CPython 文件里的说法也是：如果用户要求 callback 有可靠机会执行，就必须确保 weakref 本身比 referent 活得久。

---

### 理由 2：调用可能极度危险

因为 C 自己也是垃圾的一部分。

它可能指向：

```text
C ─strong→ X
```

而 X 也位于 cyclic trash。

于是调用：

```python
C(W)
```

意味着运行一个：

```text
自身属于垃圾对象图
```

的 Python callable。

甚至它里面依赖的对象可能已经被：

```c
tp_clear()
```

过。

于是你可能调用的是类似：

```text
一个 __dict__ 已清空的对象
一个 closure 已损坏的 function
一个内部 C 指针已经 NULL 的类型
```

这不是普通逻辑错误，而可能直接 crash。

因此源码说：

```c
if (gc_is_collecting(AS_GC(wr))) {
    /* weakref 本身也是 trash */
    continue;
}
```

关键是前面已经做过：

```c
_PyWeakref_ClearRef(wr);
```

所以虽然：

```text
callback 指针仍保留
```

但这个 weakref 已经变成：

```text
wr->wr_object == Py_None
```

因此以后 referent 死亡时也不会通过它触发 callback。

---

# 8. 为什么只检查 W，就知道 callback C 是否安全？

这是这段代码里很漂亮的图论推理。

源码的结论是：

> 如果 W 不属于 cyclic trash，那么它的 callback 也不可能属于 cyclic trash。

为什么？

因为：

```text
W ──strong──> C
```

假设：

```text
W reachable
```

那么存在外部强引用路径：

```text
ROOT → ... → W
```

又因为：

```text
W → C
```

是强引用，所以：

```text
ROOT → ... → W → C
```

于是 C 也是 reachable。

所以：

```text
W reachable
⇒ C reachable
```

进一步：

假设 C 强引用：

```text
C → X
```

那么：

```text
ROOT → W → C → X
```

所以 X 也不可能属于 unreachable。

因此：

```text
W reachable

⇒ callback reachable

⇒ callback 通过普通强引用能到达的对象
   都不属于 cyclic trash
```

这就给出了 callback 安全执行的理论基础。

---

# 9. 但 callback 仍可能通过 weakref 访问 CT

上面的推理只适用于：

```text
强引用路径
```

weakref 不算。

比如：

```text
ROOT
 │
 ▼
 W1 ─strong→ callback
              │
              │ 可以访问
              ▼
              W2 ─ ─weak─ ─> O2(unreachable)
```

这里：

```text
callback reachable
W2 reachable
```

但：

```text
O2
```

照样可以是 unreachable，因为：

```text
W2 → O2
```

不是强引用。

于是 callback 可以：

```python
O2 = W2()
```

把它复活。

所以两个安全条件要组合起来：

```text
1. 只有 reachable W 的 callback 才允许执行
2. 执行任何 callback 之前，必须 clear 所有指向 CT 的 weakref
```

少任何一个都不安全。

这其实就是整个 `handle_weakrefs()` 的理论核心。

---

# 10. 第一段为什么先检查 `PyWeakref_Check(op)`？

来看你贴的 3.8 代码：

```c
if (PyWeakref_Check(op)) {
    _PyWeakref_ClearRef((PyWeakReference *)op);
}
```

注意：

这里并不是在问：

```text
op 有没有 weakref？
```

而是在问：

```text
op 自己是不是一个 weakref 对象？
```

这是 3.8 这里很容易漏看的一个额外保护层。

假设：

```text
W 本身 ∈ unreachable
```

那么 CPython 首先无条件：

```c
_PyWeakref_ClearRef(W);
```

即使：

```text
W 的 referent O
```

并没有被 GC 正确归类进 `unreachable`。

为什么？

因为后面的：

```c
delete_garbage()
```

会拆循环。

拆循环可能间接导致 O：

```text
refcnt → 0
```

于是正常对象析构路径可能尝试调用：

```text
W.callback
```

问题来了：

```text
W 本身属于 cyclic trash
```

那么 W 的 callback 很可能也属于那片垃圾对象图，并且可能已经被 `tp_clear()` 损坏。

因此必须提前把：

```text
W → O
```

这个 weak link 作废。

---

# 11. 这正是 bpo-38006 修复的问题

你代码中的这段注释：

```c
See bpo-38006 for one example.
```

不是随便留下的历史注释。

Python 3.8 发布前确实发现过一个实际 segfault：`WeakValueDictionary` 的 callback function 在 GC 过程中被清理损坏，之后 referent 被销毁时又尝试调用这个 callback，导致解释器 crash。问题涉及扩展类型没有正确向 GC 暴露对象图等复杂情况。([Python Bugs][3])

对应修复的核心提交描述就是：

> 必须清除 garbage 中的 weakref，避免它们的 callback 在之后执行并造成 crash。([Python Bugs][4])

这项修复进入了 Python 3.8.0 RC1 的 changelog。([Python documentation][5])

所以你看到的：

```c
if (PyWeakref_Check(op)) {
    _PyWeakref_ClearRef((PyWeakReference *)op);
}
```

可以理解成：

```text
不仅要处理：
“unreachable O 被谁 weakref”

还必须处理：
“unreachable 集合里有没有 W 本身”
```

是两个不同方向。

---

# 12. 第二个循环到底在遍历什么？

接下来：

```c
if (!PyType_SUPPORTS_WEAKREFS(Py_TYPE(op)))
    continue;
```

这里：

```text
op ∈ unreachable
```

我们现在问：

> 有没有 weakref 指向 op？

支持弱引用的对象内部有：

```c
tp_weaklistoffset
```

从而找到：

```c
wrlist = PyObject_GET_WEAKREFS_LISTPTR(op);
```

概念上：

```text
op
 ▲
 │ weak
 W1
 W2
 W3
```

对应内部链：

```text
*wrlist -> W1 -> W2 -> W3
```

这里非常关键：

> 这个列表同时可能包含 reachable W 和 unreachable W。

因为 weakref 本身不保活 referent。

---

# 13. 为什么循环写成这么怪？

```c
for (wr = *wrlist; wr != NULL; wr = *wrlist)
```

而不是：

```c
for (wr = *wrlist; wr != NULL; wr = wr->wr_next)
```

因为：

```c
_PyWeakref_ClearRef(wr);
```

会把 W 从 O 的 weakref 链表中摘掉。

源码甚至专门写：

```c
/* Obscure: it also changes *wrlist. */
```

例如原来：

```text
*wrlist
   │
   ▼
  W1 → W2 → W3
```

执行：

```c
_PyWeakref_ClearRef(W1);
```

后：

```text
*wrlist
   │
   ▼
  W2 → W3
```

所以每一轮直接：

```c
wr = *wrlist;
```

永远处理链表头。

相当于：

```text
while (链表不空):
    pop_front()
```

---

# 14. `_PyWeakref_ClearRef()` 为什么这么关键？

注意它不是普通的：

```text
完全销毁 weakref
```

它做的是一个非常精确的操作：

```text
之前：

W:
    wr_object   = O
    wr_callback = C
```

执行：

```c
_PyWeakref_ClearRef(W);
```

之后：

```text
W:
    wr_object   = Py_None
    wr_callback = C
```

也就是：

```text
断开 referent
但暂时保留 callback
```

为什么不顺手把 callback 也 DECREF 掉？

因为：

```text
DECREF callback
```

本身可能导致：

```text
callback refcnt → 0
        ↓
callback 被析构
        ↓
callback 自己也有 weakref
        ↓
触发另一个 weakref callback
        ↓
执行 Python
```

于是你又在最危险的 GC 阶段意外执行 Python 代码了。

历史上的 `gc_weakref.txt` 专门讲了这个问题，这也是 `_PyWeakref_ClearRef()` 这种“只做一半清理”的内部 API 存在的主要原因。

所以它其实是在做：

```text
先解除“访问 cyclic trash”的能力

但暂时不要因为 refcount 连锁反应
触发任意 Python 代码
```

---

# 15. 接着判断 callback

代码：

```c
if (wr->wr_callback == NULL) {
    continue;
}
```

没有 callback：

```text
clear 完就结束
```

因为目的已经达到：

```python
wr() is None
```

---

# 16. 最重要的判断

然后：

```c
if (gc_is_collecting(AS_GC(wr))) {
    continue;
}
```

这里最好不要把 `gc_is_collecting()` 单纯理解成：

```text
“GC 正在运行吗？”
```

它实际是在检查这个 GC object 当前是不是属于这次 collecting/unreachable 状态。

在这里逻辑意义近似：

```text
wr 自己是不是 cyclic trash？
```

所以：

```text
O trash + W trash
    ↓
callback 不执行
```

而：

```text
O trash + W reachable
    ↓
callback 应执行
```

可以总结成这个表：

| referent O    | weakref W   | callback                  |
| ------------- | ----------- | ------------------------- |
| unreachable   | reachable   | **必须调用**                  |
| unreachable   | unreachable | **禁止调用**                  |
| reachable     | reachable   | GC 不处理                    |
| reachable/漏识别 | unreachable | 先 clear W，防止以后错误 callback |

第三、四种里第四种就是 bpo-38006 防御逻辑特别关心的异常场景。

---

# 17. 为什么 reachable W 的 callback 是“必须调用”？

因为 weakref 还活着。

例如：

```python
cache = weakref.ref(obj, callback)
```

用户一直保留：

```text
cache → W
```

现在：

```text
obj 被 GC 回收
```

用户当然合理期待：

```python
callback(W)
```

执行。

否则 weakref callback 的行为就会取决于 referent：

```text
是 refcount 归零死的

还是 cyclic GC 死的
```

这会严重破坏 weakref 的可用语义。

所以 CPython 不能简单粗暴地说：

```text
循环垃圾里的 weakref callback 全都不执行
```

历史文档甚至专门讨论过一种更简单的设计：

> 带 weakref callback 的循环对象全部不收集。

但那样意味着一个完全无泄漏的类，只因为**外部代码给它创建了 weakref**，突然就可能开始内存泄漏；这是不可接受的设计。

所以实现才被迫复杂化。

---

# 18. 为什么要 `Py_INCREF(wr)`？

决定 callback 应该执行后：

```c
Py_INCREF(wr);
```

原因是：

```text
稍后才会执行 callback
```

在这之间必须保证：

```text
W 不会消失。
```

你可能会问：

> W 不是 reachable 吗？为什么还会消失？

因为 callback 本身可能删除那个最后的引用。

最经典例子就是：

```python
WeakValueDictionary
```

逻辑近似：

```text
dict:
    key → W
```

referent 死亡：

```text
callback(W)
    ↓
把 key → W 从 dict 删除
```

那么：

```text
W 最后一条外部强引用
```

可能就在 callback 内被删掉。

因此 GC 自己必须临时持有：

```c
Py_INCREF(wr);
```

相当于：

```text
“我答应稍后处理你，在我处理完成前你不许死。”
```

---

# 19. 为什么还要把 W 移到 `wrcb_to_call`？

```c
gc_list_move(wrasgc, &wrcb_to_call);
```

这不是 Python 引用关系。

它是在操作：

```text
GC 自己维护的 intrusive linked list。
```

把：

```text
W
```

从原来的 generation 链表暂时摘出来：

```text
old generation
      │
      └── W
```

变成：

```text
wrcb_to_call
      │
      └── W
```

于是第一阶段完成后，有：

```text
wrcb_to_call:
    W1
    W2
    W3
```

全部满足：

```text
1. referent 是垃圾
2. W 本身不是垃圾
3. callback != NULL
4. W 已经 clear
5. callback 应该兑现
6. W 被临时 INCREF 保活
```

这是一个非常精确的集合。

---

# 20. 为什么 `next = GC_NEXT(gc)` 必须提前保存？

外层循环：

```c
for (gc = GC_NEXT(unreachable);
     gc != unreachable;
     gc = next) {

    next = GC_NEXT(gc);
```

因为这个函数会修改各种 GC 链表。

尤其：

```c
gc_list_move(...)
```

会摘节点、插节点。

在修改链表之前先保存：

```text
当前 unreachable 的下一个节点
```

是典型 intrusive-list 安全遍历方式。

---

# 21. 这个 assert 又是什么意思？

```c
assert(wrasgc != next);
```

注释：

```c
/* wrasgc is reachable, but
   next isn't, so they can't be the same */
```

现在：

```text
wrasgc = W
```

前面已经确认：

```c
!gc_is_collecting(W)
```

也就是 W reachable。

而：

```text
next
```

来自：

```text
unreachable 链表
```

所以：

```text
next = unreachable
W    = reachable
```

理论上不可能是同一对象。

这个 assert 同时保护了一个非常重要的遍历假设：

```text
把 W 移走不能把我们保存的 next 节点移走。
```

---

# 22. 第一阶段结束后的最重要不变量

源码开头说：

```c
When this returns,
no object in `unreachable` is weakly referenced anymore.
```

准确地说，第一遍之后：

```text
对于每个 O ∈ unreachable：

不存在还能通过 wr() 得到 O 的 weakref。
```

全部变成：

```text
W ─X─> O
```

于是现在任意 safe callback 即使运行：

```python
some_weakref()
```

也无法得到 cyclic trash。

此时才允许进入第二阶段。

---

# 23. 第二阶段开始真正调用 callback

```c
temp = PyObject_CallFunctionObjArgs(callback, wr, NULL);
```

也就是 Python 层的：

```python
callback(wr)
```

注意 callback 收到的是：

```text
weakref W
```

不是：

```text
referent O
```

而且此时：

```python
wr() is None
```

这非常重要。

callback 无法通过自己的参数复活 O。

同时所有其它指向 unreachable 的 weakref 也已经被清除。

所以：

```text
通过 weakref 复活 cyclic trash
```

这条路已经整体封死。

---

# 24. callback 抛异常怎么办？

```c
if (temp == NULL)
    PyErr_WriteUnraisable(callback);
```

weakref callback 没有正常的调用者等待结果。

因此异常不能向：

```python
gc.collect()
```

正常传播成业务异常。

它采用类似 `__del__` 的处理：

```text
unraisable exception
```

报告后继续 GC。

---

# 25. 然后这个 `Py_DECREF(op)` 非常有意思

之前：

```c
Py_INCREF(wr);
```

现在：

```c
Py_DECREF(op);
```

归还 GC 自己临时持有的引用。

这时候 W 有可能立刻死亡。

例如：

```text
WeakValueDictionary
      │
      └── W
```

callback 执行：

```text
删除 dictionary 中的 W
```

现在除了 GC 临时的：

```text
+1
```

已经没有任何引用。

于是：

```c
Py_DECREF(op);
```

变成：

```text
1 → 0
```

W 当场析构。

所以执行这句后：

```c
Py_DECREF(op);
```

**绝对不能直接读取 `op`。**

因为：

```text
op 可能已经 free()。
```

---

# 26. 那 CPython 怎么知道 W 到底死没死？

这段非常巧：

```c
if (wrcb_to_call._gc_next == (uintptr_t)gc) {
    /* object is still alive */
    gc_list_move(gc, old);
}
else {
    ++num_freed;
}
```

注意：

```c
Py_DECREF(op);
```

之后它没有：

```c
Py_REFCNT(op)
```

也没有解引用 `gc`。

只比较：

```text
链表头现在是否仍然指向那个地址。
```

调用 callback 前：

```text
wrcb_to_call
      │
      ▼
      W
```

如果 `Py_DECREF` 后 W 仍活着：

```text
wrcb_to_call
      │
      ▼
      W
```

所以：

```c
head->_gc_next == gc
```

成立。

于是：

```c
gc_list_move(gc, old);
```

把它放回正常 generation。

---

如果 W 死了，它的 deallocator 会把自身从 GC list 中摘掉：

```text
before:

HEAD → W → next
```

变成：

```text
after:

HEAD → next
```

因此：

```c
head->_gc_next != gc
```

注意这里仅仅比较旧地址值，没有访问已经释放的 W。

所以安全。

这是非常典型的 CPython C 层技巧：

```text
不访问可能已释放对象，
而通过外部数据结构变化判断它是否还存在。
```

---

# 27. 为什么 W 活着要放进 `old`？

因为之前为了排队：

```c
gc_list_move(W, &wrcb_to_call);
```

已经把它从正常 GC generation 链表摘走了。

callback 执行结束后，如果它仍然活：

```text
必须重新加入 GC 管理。
```

于是：

```c
gc_list_move(gc, old);
```

放入：

```text
old generation
```

这里可以把 `old` 理解为：

```text
本次 collection 后 survivor 应该进入的 generation 链表。
```

---

# 28. `num_freed` 为什么只数这些 W？

开头注释说：

```c
Some weakrefs with callbacks may be reclaimed
directly by this routine;
the number reclaimed is the return value.
```

假设 W 最初是 reachable：

```text
W ∉ unreachable
```

那么 GC 原先统计垃圾对象时，并没有把 W 算进去。

但 callback：

```text
删除最后一个 W 强引用
```

然后 GC 的临时引用释放：

```text
W refcount → 0
```

于是：

```text
W 实际上也是这次 gc.collect() 导致释放的
```

所以需要：

```c
++num_freed;
```

最终：

```c
m += handle_weakrefs(...)
```

把这些额外释放的 weakref 计入 collection 数量。

---

# 29. 现在把整个函数压缩成伪代码

其实 `handle_weakrefs()` 的本质可以写成：

```text
callbacks = []

for O in unreachable:

    # 防御：如果 O 自己就是 weakref，
    # 让这个垃圾 weakref 永远不能在以后触发 callback
    if O is WeakRef:
        clear_referent(O)

    # 找所有指向垃圾 O 的 weakref
    for W in weakrefs_pointing_to(O):

        clear_referent(W)

        if W has no callback:
            continue

        if W itself is unreachable:
            # W 和 O 一起死
            # callback 不执行
            continue

        # W 比 O 活得长
        # 用户应得到 callback
        INCREF(W)
        move W to callbacks


# 此刻：
# 所有指向任何 unreachable object 的 weakref 都已经失效

for W in callbacks:

    callback(W)

    DECREF(W)

    if W survived:
        move W back to old generation
    else:
        num_freed += 1
```

你会发现复杂性几乎都集中在一句话：

```text
什么时候 callback 可以执行？
```

答案不是：

```text
referent 死了就执行
```

而是：

```text
referent 死了
AND
weakref 自己活着
AND
callback 自己因此也必定活着
AND
所有可以暴露 cyclic trash 的 weakref 已经全部失效
THEN
callback 才能安全执行
```

---

# 30. 用对象图看四种情况最清楚

### Case 1：最普通、安全

```text
          reachable
ROOT ───────► W ─────► callback
              ╲
               ╲ weak
                ╲
                 ▼
                 O
                 ▲
                 └─cycle

                 O = unreachable
```

处理：

```text
clear W
callback(W)
```

正确。

---

### Case 2：W 自己也是垃圾

```text
           unreachable

       ┌──── W ──strong──► callback
       │     │
       │     │ weak
       │     ▼
       │     O
       │     ▲
       └─────┘
```

处理：

```text
clear W
不 callback
```

正确。

---

### Case 3：多个 reachable weakref 指向 garbage

```text
ROOT → W1 -weak-> O1
 │
 ├──→ W2 -weak-> O2
 │
 └──→ callback1
        │
        └──可以访问 W2
```

错误算法：

```text
clear W1
callback1
  ↓
W2() → O2
  ↓
resurrect
```

正确算法：

```text
clear W1
clear W2

然后：

callback1
  ↓
W2() → None
```

所以必须两遍。

---

### Case 4：垃圾 weakref 的 referent 没正确进入垃圾集合

```text
unreachable W
       │
       │ weak
       ▼
       O   ← GC 因对象图不完整等原因没有正确看到
```

如果不提前：

```c
_PyWeakref_ClearRef(W);
```

后面的 cycle breaking 可能导致：

```text
O refcnt → 0
```

进而尝试：

```text
callback(W)
```

而 callback 可能已经随 garbage 被 `tp_clear()`。

结果：

```text
call damaged Python object
        ↓
      segfault
```

这就是 bpo-38006 类问题为什么逼出了第一段额外保护。([Python Bugs][3])

---

# 31. 一个特别容易误解的点：为什么说 callback “不能访问 unreachable”？

严格说，并不是：

```text
callback 这个函数里面绝对不允许写任何碰垃圾的代码
```

而是 GC 通过图论保证：

```text
reachable W
    ↓ strong
reachable callback
    ↓ strong
callback 的普通强引用可达对象也 reachable
```

所以 callback 无法通过正常强引用路径碰 CT。

唯一漏洞是：

```text
weakref
```

因为：

```text
callback → W2
```

虽然 W2 reachable：

```text
W2 -weak-> O2
```

却不保活 O2。

所以：

```text
O2 仍可能是 CT
```

这也是为什么整个算法真正的安全证明是：

```text
reachable callback 的强引用图
                 +
所有 CT weakref 已经失效
                 =
callback 无法访问 CT
```

少半边都不成立。

---

# 32. 和 `__del__` 为什么又不完全一样？

PEP 442 之后，CPython 对：

```python
__del__
```

允许的事情更多。

因为 finalizer 本来就是：

```text
附着于 O 本身
```

它天然需要访问 O。

所以 CPython 3.8 的思路是：

```text
weakrefs 先处理
 ↓
tp_finalize / __del__
 ↓
重新检查对象有没有 resurrection
 ↓
如果复活：整片救回来
 ↓
如果仍 unreachable：
tp_clear
```

PEP 442 明确规定 cyclic isolate 的 finalizer 应在对象仍保持一致状态时运行，并在之后重新检测 resurrection。([Python Enhancement Proposals (PEPs)][1])

weakref callback 不一样：

```text
callback 理论上根本不应该重新得到 referent。
```

所以没有必要允许：

```text
callback resurrection of referent
```

反而应把这条路彻底堵死。

---

# 33. 为什么这段代码看起来像“过度防御”？

因为它确实是 **20 多年 crash case 积累出来的防御代码**。

`gc_weakref.txt` 的历史说明很有意思：

最早循环 GC 根本没怎么考虑 weakref，后来 Zope3 在 shutdown 阶段出现 segfault，CPython 才逐步发现：

```text
只清 CT 内部 weakref 不够
```

然后又发现：

```text
必须清所有指向 CT 的 weakref
```

然后又发现：

```text
不能边清边 callback
```

然后又发现：

```text
clear weakref 时不能随便 DECREF callback，
因为这也可能间接执行 Python
```

再后来 2019 年 bpo-38006 又暴露：

```text
连“weakref 自己属于 garbage、
但 referent 没被正确识别”的情况都需要保护
```

Tim Peters 在相关 issue 里也明确提到，weakref 最初的设计并没有充分考虑 cyclic GC，两者是多年通过实际 segfault 被迫磨合出来的。([Python Bugs][3])

所以你看到：

```c
/* Headache time. */
```

其实非常诚实。

---

# 34. 最后给你一个理解 `handle_weakrefs()` 的心智模型

以后再读这段，不要从：

```text
“怎么清理 weakref”
```

去想。

把它理解成一个 **安全屏障建立函数**：

```text
              handle_weakrefs()
                     │
                     ▼
      ┌──────────────────────────┐
      │ 建立一条安全边界          │
      │                          │
      │ unreachable 内的对象     │
      │ 从此不能通过 weakref      │
      │ 再被任何 Python 代码看到  │
      └──────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
     W 也是垃圾             W 仍然活着
          │                     │
     callback 丢弃          callback 应兑现
                                │
                                ▼
                    全部 weakref 清完以后
                           才允许调用
```

之后 GC 才敢继续：

```text
finalizer
   ↓
resurrection check
   ↓
tp_clear
   ↓
真正拆毁 cyclic garbage
```

因此整段代码真正维护的不是 “weakref 语义”，而是这个更底层的不变量：

> **在 GC 已经把对象划入待回收集合之后，任何可能执行的 Python 代码，都不能获得一个 GC 已经准备破坏的对象。**

weakref 恰好是最难堵住的“后门”，因为它：

```text
不影响 reachability
却能够瞬间转化成强引用：
    obj = wr()
```

所以 GC 必须在执行任何 callback 之前，把所有这些后门一次性关掉。这就是为什么一个看似只是“通知对象死了”的 weakref callback，最后需要这么多代码、两个 pass、一套 GC-list 搬运、临时 INCREF，以及一堆看起来近乎偏执的判断。

[1]: https://peps.python.org/pep-0442/?utm_source=chatgpt.com "PEP 442 – Safe object finalization | peps.python.org"
[2]: https://chromium.googlesource.com/external/github.com/python/cpython/%2B/refs/tags/v3.10.0a2/Modules/gcmodule.c?utm_source=chatgpt.com "Modules/gcmodule.c - external/github.com/python/cpython - Git at Google"
[3]: https://bugs.python.org/issue38006?utm_source=chatgpt.com "Issue 38006: Crash in remove() weak reference callback of weakref.WeakValueDictionary at Python exit - Python tracker"
[4]: https://bugs.python.org/msg353726?utm_source=chatgpt.com "Message 353726 - Python tracker"
[5]: https://docs.python.org/tr/3.8/whatsnew/changelog.html?utm_source=chatgpt.com "Changelog — Python 3.8.20 belgelendirme çalışması"
