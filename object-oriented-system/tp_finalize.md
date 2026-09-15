复杂的根源在于：

> `tp_finalize` 不是普通的“释放内存函数”，而是一个允许执行任意 Python 代码、修改对象图、复活对象的终结器。

因此，调用 `tp_finalize` 时，GC 不能假设：

* 当前对象调用后仍然存在；
* 链表中的下一个对象仍然存在；
* 原来的引用关系保持不变；
* 对象仍然不可达；
* 终结器不会间接触发其他对象析构。

CPython 必须先让所有终结器在**对象图仍完整、一致**的状态下运行，然后重新判断对象图是否仍然不可达，最后才能调用 `tp_clear` 拆环。这正是 PEP 442 引入的“安全对象终结”流程。([Python Enhancement Proposals (PEPs)][1])

## 一、先看整个 GC 终结流程

CPython 3.8 的核心顺序是：

```c
handle_weakrefs(&unreachable, old);

finalize_garbage(&unreachable);

if (check_garbage(&unreachable)) {
    /* 有对象被复活：本轮不清除 */
    gc_list_merge(&unreachable, old);
}
else {
    /* 仍然完全不可达：调用 tp_clear 拆环 */
    delete_garbage(state, &unreachable, old);
}
```

即：

```text
发现 cyclic isolate
        │
        ▼
清除 weakref
        │
        ▼
调用所有 tp_finalize
对象之间的引用尚未清除
        │
        ▼
重新计算外部引用
        │
        ├── 有外部引用：发生复活，取消清理
        │
        └── 无外部引用：调用 tp_clear 拆环
                              │
                              ▼
                        refcount 降到 0
                              │
                              ▼
                         tp_dealloc
```

CPython 3.8 源码正是在 `finalize_garbage()` 后调用 `check_garbage()`，只有确认没有终结器复活对象后，才进入 `delete_garbage()` 调用 `tp_clear`。

## 二、为什么必须先 finalize，再调用 tp_clear

假设有一个循环：

```python
class Node:
    def __init__(self, name):
        self.name = name
        self.peer = None

    def __del__(self):
        print(self.name, self.peer.name)

a = Node("a")
b = Node("b")

a.peer = b
b.peer = a

del a, b
```

对象图：

```text
a ──peer──> b
^           │
└──peer─────┘
```

如果 GC 先对 `a` 调用 `tp_clear`：

```text
a.peer = NULL
```

然后再调用 `a.__del__()`：

```python
print(self.peer.name)
```

`self.peer` 已经不存在，终结器看到的是一个被破坏了一半的对象。

更严重的是，C 扩展对象可能在 `tp_finalize` 中访问结构体成员：

```c
self->peer->some_field
```

如果 `peer` 已经被清除甚至释放，就可能出现悬空指针和崩溃。

因此 PEP 442 规定：

1. cyclic isolate 中的所有对象首先保持完整；
2. 调用所有终结器；
3. 重新判断是否被复活；
4. 确认仍不可达后才调用 `tp_clear`。

这保证 `tp_finalize` 执行时，对象尚未进入“cyclic trash”状态。([Python Enhancement Proposals (PEPs)][1])

---

# 三、逐行分析 `finalize_garbage()`

## 1. 为什么要有临时 `seen` 链表

```c
PyGC_Head seen;
gc_list_init(&seen);
```

初始状态：

```text
collectable: A <-> B <-> C
seen:        empty
```

循环每次不是保存 `next` 后继续遍历，而是总取当前 `collectable` 的第一个：

```c
while (!gc_list_is_empty(collectable)) {
    PyGC_Head *gc = GC_NEXT(collectable);
```

然后在调用终结器前，将它移到 `seen`：

```c
gc_list_move(gc, &seen);
```

状态变成：

```text
collectable: B <-> C
seen:        A
```

这样做是为了避免**迭代器失效和 use-after-free**。

## 2. 一个终结器删除其他对象的例子

```python
class A:
    def __del__(self):
        # 删除 B 对 A 的引用
        self.peer.back = None

class B:
    pass

a = A()
b = B()

a.peer = b
b.back = a

del a, b
```

原始引用关系：

```text
A ──peer──> B
^           │
└──back─────┘
```

假设 GC 正在执行 `A.tp_finalize`：

```python
self.peer.back = None
```

这会删除：

```text
B ──back──> A
```

终结器返回后，A 可能立即因为引用计数降到 0 而销毁；A 的销毁又会清除 `A.peer`，导致 B 也立即销毁。

于是一次 `finalize(A)` 可能导致：

```text
A 消失
B 消失
collectable 链表被修改
seen 链表也被修改
```

如果 GC 使用普通写法：

```c
next = GC_NEXT(gc);
finalize(op);
gc = next;
```

那么 `next` 所指的 B 可能已经被释放，下一次循环就会访问悬空地址。

现在的算法则是：

```text
先把 A 移入 seen
调用 finalize(A)
不保存 B 的地址
下一轮重新读取 collectable 的第一个元素
```

如果 B 已经消失，链表会自然变成：

```text
collectable: C
seen:        可能为空，也可能仍有 A
```

GC 不关心哪些对象中途消失，只处理仍留在链表中的对象。源码注释明确说明，终结器可能使当前对象或其他对象因为引用计数归零而被回收，因此不能依赖输入链表跨越调用保持不变。([GitHub][2])

## 3. 为什么不能只在循环末尾移动到 `seen`

错误方式：

```c
op = first(collectable);
finalize(op);
gc_list_move(gc, &seen);
```

如果 `finalize(op)` 使 `op` 自己销毁，那么返回后：

```c
gc
```

已经是悬空指针，无法再执行 `gc_list_move()`。

所以必须先移动：

```c
gc_list_move(gc, &seen);
finalize(op);
```

---

# 四、为什么要先设置 `FINALIZED`

```c
if (!_PyGCHead_FINALIZED(gc) &&
        (finalize = Py_TYPE(op)->tp_finalize) != NULL) {
    _PyGCHead_SET_FINALIZED(gc);
```

这个标记表示：

```text
该对象的 tp_finalize 已经调用过
```

而且必须在调用之前设置，而不是调用之后。

## 递归终结问题

假设顺序是：

```c
finalize(op);
SET_FINALIZED(op);
```

终结器可能删除最后一些引用，使对象进入 `tp_dealloc`。自定义 `tp_dealloc` 通常会调用：

```c
PyObject_CallFinalizerFromDealloc(op);
```

它检查对象是否已经终结。此时如果标记尚未设置，就可能再次调用：

```text
tp_finalize
    └── tp_dealloc
          └── tp_finalize
                └── ...
```

提前设置标记可以保证即使终结过程中出现重入，也不会重复调用终结器。

此外，对象可能被终结器复活：

```python
saved = []

class A:
    def __del__(self):
        saved.append(self)
```

以后 `saved` 被清空，对象再次变得不可达。对于支持 GC 的对象，CPython 会保留 `FINALIZED` 标记，因此下一轮 GC 不会再次调用 `__del__`。CPython 3.8 的通用 finalizer 调用代码也会检查和设置 GC 对象的 finalized 标记。([GitHub][3])

## 一个完整复活例子

```python
import gc

saved = []

class A:
    def __del__(self):
        print("A finalized")
        saved.append(self)

class B:
    pass

a = A()
b = B()

a.peer = b
b.peer = a

del a, b
gc.collect()
```

第一次 GC：

```text
1. 发现 A <-> B 是不可达循环
2. 调用 A.__del__
3. A 被放入 saved
4. saved 是循环外部的根引用
5. check_garbage 发现外部引用
6. 不调用 tp_clear
7. A 和 B 整体存活
```

此时：

```python
saved[0].peer
```

仍然可以访问 B，因为 GC 没有拆环。

随后：

```python
saved.clear()
gc.collect()
```

第二次 GC 中，A 的 `FINALIZED` 标记已经存在，所以 `A.__del__` 不再调用；如果没有其他外部引用，GC 会调用 `tp_clear` 拆掉循环。PEP 442 将这种通过终结器产生新的外部引用定义为 resurrection，并要求在终结后重新检查整个循环隔离区。([Python Enhancement Proposals (PEPs)][1])

---

# 五、为什么要 `Py_INCREF(op)`

```c
Py_INCREF(op);
finalize(op);
Py_DECREF(op);
```

GC 链表本身并不持有 Python 强引用。对象在 `collectable` 或 `seen` 链表中，并不会增加：

```c
op->ob_refcnt
```

终结器可以修改对象图，使当前对象的所有真实引用消失。

所以调用前必须临时加一个引用：

```text
GC 的临时保护引用
```

保证在整个：

```c
finalize(op)
```

调用期间，`op` 本身不会被释放。

调用结束后：

```c
Py_DECREF(op);
```

撤销临时保护。如果终结器没有复活对象，并且其他引用已经消失，这个 `DECREF` 可能立刻触发：

```text
tp_dealloc
    ↓
PyObject_GC_UnTrack
    ↓
对象从 seen 链表中消失
```

这也解释了为什么注释说 `seen` 中的对象也可能消失。

## 为什么不能仅靠 `self` 参数保活

C 函数：

```c
void tp_finalize(PyObject *self);
```

收到的只是一个裸指针。裸指针本身不增加引用计数。

与普通 Python 方法调用不同，这里不是创建一个 bound method 再调用；GC 是直接调用 C slot：

```c
finalize(op);
```

所以调用者必须显式保证 `op` 的生命周期。

---

# 六、为什么处理完还要把 `seen` 合并回来

```c
gc_list_merge(&seen, collectable);
```

`seen` 只是“已经尝试过终结”的临时工作队列，并不表示对象已经安全回收。

终结后，剩余对象仍需要参加：

```c
check_garbage(collectable)
```

以及可能的：

```c
delete_garbage(collectable, old)
```

因此，仍然存活的对象必须重新回到同一个 `collectable` 集合：

```text
seen 中仍存在的对象
        +
collectable 中仍存在的对象
        ↓
重新组成完整候选集合
```

被终结器导致引用计数归零的对象已经自动从链表消失，不会被合并回来。

---

# 七、为什么必须在所有 finalizer 完成后重新检查

```c
if (check_garbage(&unreachable)) {
    gc_list_merge(&unreachable, old);
}
```

GC 在调用终结器之前已经确认：

```text
这些对象没有外部引用
```

但这个结论只对**调用终结器之前**的对象图成立。

终结器允许做：

```python
global_object.append(self)
```

于是对象图从：

```text
外部世界      A <-> B
   无连接
```

变成：

```text
global list ──> A <-> B
```

原来的不可达集合已经变成可达集合。

`check_garbage()` 会重新执行一次类似的引用分析：

```c
gc_set_refs(gc, Py_REFCNT(op));
subtract_refs(collectable);
```

如果扣除集合内部引用后，任何对象仍有引用计数，说明存在来自集合外部的新引用，即发生复活。CPython 3.8 随后保守地将整个剩余 `unreachable` 链表移入老年代，而不是调用 `tp_clear`。([GitHub][2])

## 为什么不在每个 finalizer 后马上检查

因为后续终结器仍可能继续修改对象图。

例如：

```text
A.__del__ 不复活任何对象
B.__del__ 将 A 放入全局列表
```

如果在 A 之后立即决定清除 A，就可能破坏 B 的终结器将要访问的对象。

因此规则是：

```text
先让整个 cyclic isolate 的所有终结器运行
然后统一重新检查
然后才允许清除任何对象
```

PEP 442 明确要求循环隔离区中的全部终结器先运行，然后重新遍历判断是否仍然隔离。([Python Enhancement Proposals (PEPs)][1])

---

# 八、官网所说“有些引用对象可能已终结但尚未清除”是什么意思

考虑：

```python
class Node:
    def __init__(self, name):
        self.name = name
        self.peer = None
        self.finalized = False

    def __del__(self):
        print(
            self.name,
            "peer finalized:",
            self.peer.finalized
        )
        self.finalized = True

a = Node("a")
b = Node("b")
a.peer = b
b.peer = a

del a, b
```

终结顺序未定义。假设顺序是：

```text
先 B，后 A
```

执行 B 的终结器前：

```text
A.finalized = False
B.finalized = False
```

B 输出：

```text
b peer finalized: False
```

然后：

```text
B.finalized = True
```

接下来执行 A 的终结器。此时：

```text
A.peer 仍然是 B
B 还没有被 tp_clear
但 B 的终结器已经执行过
```

所以 A 输出：

```text
a peer finalized: True
```

这就是文档所描述的状态：

```text
对象仍然完整、引用尚未清除
但其中一部分已经运行过 finalizer
另一部分还没有运行
```

因此终结器不能假设：

```text
“我引用的所有对象都还没被终结”
```

它只能假设：

```text
“它们尚未被 GC 的 tp_clear 自动破坏”
```

文档将这种阶段称为“已终结和未终结对象的混合”；终结顺序不保证，因此已终结对象仍需保持合理的不变式，供尚未终结的对象访问。([Python documentation][4])

---

# 九、为什么文档又说 finalizer 之后引用对象可能被清除

所有终结器完成并且没有复活后，GC 开始：

```c
delete_garbage()
```

它逐个调用：

```c
op->tp_clear(op);
```

假设仍然是：

```text
A <-> B
```

可能先执行：

```text
A.tp_clear()
    A.peer = NULL
```

此时 B 尚未清除：

```text
A：已经 cleared
B：尚未 cleared
```

随后才执行：

```text
B.tp_clear()
    B.peer = NULL
```

所以清除期间也会存在混合状态：

```text
一部分对象已经 cleared
一部分对象尚未 cleared
```

而且清除 A 的引用可能使 B 或其他对象的引用计数归零，从而立即触发析构。`delete_garbage()` 因此也使用“总取链表第一个元素”的方式，并在 `tp_clear` 前临时 `INCREF`，因为链表同样可能随时变化。([GitHub][2])

---

# 十、`tp_finalize`、`tp_clear`、`tp_dealloc` 的职责

| Slot          | 调用时对象状态   | 主要职责                | 能否执行 Python 代码 | 能否复活                |
| ------------- | --------- | ------------------- | -------------- | ------------------- |
| `tp_finalize` | 对象应仍然完整   | 高层终结、资源清理、`__del__` | 可以             | 可以                  |
| `tp_clear`    | 正在拆解循环    | 清除强引用、打破引用环         | 原则上应谨慎         | 不应依赖复活              |
| `tp_dealloc`  | 引用计数已经到 0 | 最终释放成员和对象内存         | 应非常谨慎          | 通过 finalizer 可能中止析构 |

`tp_clear` 是“拆环”，不是最终释放内存；真正释放对象通常仍然由引用计数下降到 0 后调用 `tp_dealloc` 完成。官方生命周期文档将这个过程描述为两阶段销毁：先用 `tp_clear` 解开对象之间的引用，再由 `tp_dealloc` 完成最终销毁。([Python documentation][4])

---

# 十一、为什么文档说不保证 `tp_dealloc` 前自动调用 `tp_finalize`

`finalize_garbage()` 只覆盖：

```text
循环 GC 发现的不可达 GC 对象
```

但对象也可能由普通引用计数直接销毁：

```python
obj = SomeObject()
del obj
```

此时：

```text
Py_DECREF
   ↓
ob_refcnt == 0
   ↓
tp_dealloc
```

对于自定义 C 类型，CPython 不会凭空知道其 `tp_dealloc` 应该如何配合 `tp_finalize`。因此官方建议在 `tp_dealloc` 开头调用：

```c
if (PyObject_CallFinalizerFromDealloc(self) < 0) {
    /* 对象被复活，必须停止析构 */
    return;
}
```

CPython 3.8 中，这个函数会先把引用计数从 0 临时设为 1，调用终结器，然后撤销临时引用；如果终结器增加了其他引用，函数返回 `-1`，表示对象已复活，`tp_dealloc` 必须中止。([GitHub][3])

概念上是：

```c
self->ob_refcnt = 1;   /* 临时复活，保证 finalizer 安全 */

tp_finalize(self);

self->ob_refcnt--;

if (self->ob_refcnt != 0) {
    /* finalizer 创建了真实的新引用 */
    return RESURRECTED;
}
```

---

# 十二、为什么文档还提到线程、关闭阶段和异常状态

因为 3.14 文档描述的是 `tp_finalize` 的完整公开契约，而不只是你贴出的 CPython 3.8 `finalize_garbage()`。

## 1. 可能在其他线程运行

哪个线程使对象引用计数降到 0，或者哪个线程触发 GC，终结器就可能在哪个线程执行。因此扩展类型不能假定终结器一定在创建对象的线程运行。官方文档说明调用时会持有相应的 Python 执行保护，但线程身份本身不固定。([Python documentation][5])

## 2. 可能在解释器关闭期间运行

例如：

```python
logger = SomeLogger()

class A:
    def __del__(self):
        logger.close()
```

解释器关闭时，模块全局状态可能已经被部分清理；`logger` 可能已不存在或状态不完整。因此终结器不能无条件依赖模块全局对象。([Python documentation][5])

## 3. 必须保持异常状态

`tp_finalize` 返回类型是：

```c
void
```

它没有办法把异常正常返回给调用者。

如果终结器调用了可能失败的 API，应当：

```c
保存原来的异常状态
执行清理
将新异常作为 unraisable 报告
恢复原来的异常状态
```

在 GC 路径中，CPython 3.8 在调用后执行：

```c
assert(!PyErr_Occurred());
```

这要求 `tp_finalize` 返回时不能遗留未处理异常。当前官方文档同样要求终结器保持调用前的异常状态。([GitHub][2])

---

# 十三、把 `finalize_garbage()` 翻译成算法

原代码可以理解为：

```c
seen = empty;

while (collectable 非空) {
    op = collectable 的第一个对象;

    /* 先从待处理队列移走，防止重复处理 */
    move(op, seen);

    if (op 尚未终结 && op 有 tp_finalize) {
        /* 防止递归和二次终结 */
        mark_finalized(op);

        /* 保证 finalizer 调用期间 op 不会释放 */
        incref(op);

        /* 可以执行任意 Python 代码并修改任意引用 */
        tp_finalize(op);

        /* 撤销保护；op 可能在这里立即释放 */
        decref(op);
    }
}

/* 把仍然存在的对象重新组成候选集合 */
merge(seen, collectable);
```

后续：

```c
if (重新检查后发现外部引用) {
    /* 终结器复活了对象 */
    取消本轮清除;
}
else {
    /* 所有对象仍然不可达 */
    逐个 tp_clear，打破循环;
}
```

## 最核心的三个不变量

`finalize_garbage()` 的复杂设计是在保证：

1. **调用 `tp_finalize` 时，对象图尚未被 GC 清除。**
2. **每个 GC 对象的终结器最多执行一次。**
3. **终结器任意修改引用关系后，GC 不使用失效的链表指针，也不会错误清除被复活的对象。**

因此复杂的不是“调用一个函数”本身，而是：

> 在允许用户代码任意改变对象生命周期和对象图的情况下，安全地继续执行垃圾回收。

[1]: https://peps.python.org/pep-0442/ "PEP 442 – Safe object finalization | peps.python.org"
[2]: https://github.com/python/cpython/blob/v3.8.20/Modules/gcmodule.c "cpython/Modules/gcmodule.c at v3.8.20 · python/cpython · GitHub"
[3]: https://github.com/python/cpython/blob/v3.8.20/Objects/object.c "cpython/Objects/object.c at v3.8.20 · python/cpython · GitHub"
[4]: https://docs.python.org/3.14/c-api/lifecycle.html "Object Life Cycle — Python 3.14.7 documentation"
[5]: https://docs.python.org/zh-cn/3.14/c-api/typeobj.html "类型对象结构体 — Python 3.14.7 文档"
