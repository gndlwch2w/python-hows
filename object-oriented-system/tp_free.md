下面按当前 Python 3.14 文档中 `tp_clear` 小节的顺序逐条解释。核心先记住一句：

> `tp_clear` 的职责不是“销毁对象”，而是“删除足够多的 Python 强引用，使循环引用断开”。

对象内存、非 Python 资源以及剩余字段，最终仍由 `tp_dealloc` 处理。文档也特意将 `tp_clear`、`tp_finalize` 和 `tp_dealloc` 视为三个不同生命周期阶段。([Python documentation][1])

---

# 1. “这是一个可选的清除函数，签名为 `int tp_clear(PyObject *)`”

```c
static int
MyType_clear(PyObject *op)
{
    MyTypeObject *self = (MyTypeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->dict);
    return 0;
}
```

“可选”不是说所有 GC 类型都可以随便省略，而是说：

* 类型在结构上确实不需要拆环时，可以为 `NULL`；
* 能证明由这种类型参与的所有循环一定会被其他对象的 `tp_clear` 打破，也可以省略；
* 一般的可变容器类型，通常应实现它。

`Py_tp_clear` 是稳定 ABI 中的 slot ID。使用 `PyType_FromSpec()` 创建类型时，可以通过：

```c
{Py_tp_clear, MyType_clear}
```

设置它，而不必直接访问 `PyTypeObject.tp_clear`。([Python documentation][1])

返回类型为 `int`，典型约定是：

```text
0   成功
-1  失败并设置异常
```

不过在 CPython 3.14 的自动 GC 路径中，`delete_garbage()` 实际忽略返回值，只检查是否遗留了异常；若有异常，会作为 unraisable exception 报告，然后继续 GC：

```c
Py_INCREF(op);
(void) clear(op);

if (_PyErr_Occurred(tstate)) {
    PyErr_FormatUnraisable(
        "Exception ignored in tp_clear of %s",
        Py_TYPE(op)->tp_name);
}

Py_DECREF(op);
```

因此 `tp_clear` 最好只做不容易失败的指针清除，不要设计成复杂的、可能中途失败的事务。

---

# 2. “其目的是打破造成 cyclic isolate 的引用循环”

假设有两个对象：

```text
A.peer ──> B
   ^        │
   └────────┘
```

外部已经没有任何引用：

```text
外部世界    A <──> B
   无连接
```

但引用计数仍然是：

```text
A.refcnt = 1   // B.peer
B.refcnt = 1   // A.peer
```

单纯的引用计数无法使它们降到零。

如果 `A.tp_clear()` 执行：

```c
Py_CLEAR(A->peer);
```

对象图变成：

```text
A       B ──> A
```

清除 `A.peer` 时会对 B 执行 `DECREF`：

```text
B.refcnt: 1 → 0
```

于是开始销毁 B。B 销毁时再释放 `B.peer`：

```text
A.refcnt: 1 → 0
```

整个循环随之解开。

所以 `tp_clear` 不需要直接释放整个循环里的全部对象；它只需要删除一条或若干条足以断环的强引用。文档把这一不可达的连通循环称为 cyclic isolate。([Python documentation][1])

---

# 3. “已清除对象是部分销毁的对象，不要求继续满足正常设计不变量”

假设类型正常状态要求：

```c
self->peer != NULL;
self->config != NULL;
self->state == STATE_READY;
```

正常方法可能直接使用：

```c
PyObject_CallNoArgs(self->peer);
```

但 `tp_clear` 后可能变成：

```c
self->peer = NULL;
self->config = NULL;
self->state = STATE_READY;   // 甚至未同步修改
```

这时对象的 C 内存仍然存在，`Py_TYPE(self)`、引用计数和供析构使用的字段仍须有效，但它已经不再是一个可以按正常业务规则使用的完整对象。

“部分销毁”不等于可以任意破坏内存，而是说可以放宽正常语义不变量：

```text
正常对象：
    peer 和 config 必须存在

cleared 对象：
    peer 和 config 可以为 NULL
    只能安全地继续 clear、dealloc 或执行专门容忍该状态的操作
```

因此所有可能在清除后再次执行的内部代码，都必须检查字段是否为 `NULL`，而不能假定对象仍处于完整初始化状态。([Python documentation][1])

---

# 4. “不需要清除不能参与循环的对象，如字符串或整数”

考虑：

```c
typedef struct {
    PyObject_HEAD
    PyObject *peer;       // 容器，可能参与循环
    PyObject *dict;       // 容器，可能参与循环
    PyObject *name;       // str
    PyObject *serial;     // int
} NodeObject;
```

为了打破引用循环，理论上只需要：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->dict);
    return 0;
}
```

没有必要为了循环 GC 而清除：

```c
self->name;
self->serial;
```

因为普通字符串和整数不会持有任意 Python 对象的强引用，不可能形成一条返回 `self` 的引用路径：

```text
self → str
```

不会变成：

```text
self → str → ... → self
```

所以它们不可能是循环中的“连接边”。([Python documentation][1])

但这里说的是“不需要”，不是“禁止”。也可以把所有 Python 字段都清掉。

---

# 5. “为了复用代码，可以让 `tp_dealloc` 调用 `tp_clear`”

如果 `tp_dealloc` 和 `tp_clear` 分别写相同的清理逻辑：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;
    Py_CLEAR(self->peer);
    Py_CLEAR(self->dict);
    return 0;
}

static void
Node_dealloc(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->dict);
    Py_CLEAR(self->name);

    Py_TYPE(op)->tp_free(op);
}
```

代码重复且容易漏字段。

通常可以写成：

```c
static void
Node_dealloc(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    PyObject_GC_UnTrack(op);

    Node_clear(op);          // 清理可能参与循环的字段
    Py_CLEAR(self->name);    // 清理其余 Python 引用

    Py_TYPE(op)->tp_free(op);
}
```

但必须记住：

```text
Node_clear() 可能之前已经被 GC 调用过
```

因此它必须能够安全地再次运行。文档推荐使用 `Py_CLEAR()`，因为对 `NULL` 再次执行 `Py_CLEAR()` 是安全的。([Python documentation][1])

---

# 6. “`tp_clear` 可能已经调用过，应使用幂等操作”

幂等的含义是：

```text
调用一次后的状态
==
调用多次后的状态
```

例如：

```c
Py_CLEAR(self->peer);
```

概念上类似：

```c
if (self->peer != NULL) {
    PyObject *tmp = self->peer;
    self->peer = NULL;
    Py_DECREF(tmp);
}
```

第一次调用：

```text
peer: B → NULL
B.refcnt--
```

第二次调用：

```text
peer 已经是 NULL
什么都不做
```

错误写法则可能是：

```c
Py_DECREF(self->peer);
self->peer = NULL;
```

第二次运行时会对 `NULL` 或已经释放的对象操作。

另一个错误是维护非幂等计数：

```c
self->active_children--;
Py_CLEAR(self->child);
```

若 `tp_clear` 执行两次：

```text
active_children: 1 → 0 → -1
```

状态就损坏了。

正确写法应先判断实际资源是否仍存在：

```c
if (self->child != NULL) {
    Py_CLEAR(self->child);
    self->active_children = 0;
}
```

文档不保证自动清除的次数；而且即使自动 GC 只调用了一次，稍后的 `tp_dealloc` 也可能再次调用同一个 `tp_clear`。([Python documentation][1])

---

# 7. “非平凡清理应放在 `tp_finalize`，而不是 `tp_clear`”

`tp_clear` 适合做：

```c
Py_CLEAR(self->peer);
Py_CLEAR(self->callback);
Py_CLEAR(self->dict);
```

不适合做：

```c
flush_network_buffer(self);
commit_database_transaction(self);
call_user_callback(self);
save_document(self);
remove_file(self->path);
```

原因有几个。

第一，调用 `tp_clear` 时，对象已经处于部分销毁阶段，直接和间接引用对象可能已经先被 clear，不能依赖完整对象图。

第二，`tp_clear` 可能执行多次，复杂操作很难自然保证幂等。

第三，自动 GC 不传播 `tp_clear` 异常；异常只会被报告为 unraisable。

第四，`tp_finalize` 在 GC 拆环前运行，此时整个 cyclic isolate 的对象字段原则上尚未被 `tp_clear` 破坏，更适合执行需要完整状态的终结逻辑。([Python documentation][1])

例如：

```c
static void
Node_finalize(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    if (self->native_handle != INVALID_HANDLE) {
        close_handle(self->native_handle);
        self->native_handle = INVALID_HANDLE;
    }
}

static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->callback);
    return 0;
}
```

职责是：

```text
tp_finalize：
    高层终结、关闭外部资源、需要完整状态的操作

tp_clear：
    删除 Python 强引用，打破环

tp_dealloc：
    释放所有剩余资源和对象内存
```

---

# 8. “如果 `tp_clear` 没有打破环，对象可能永久泄漏”

假设自定义对象有两条可能形成循环的引用：

```c
self->peer;
self->callback;
```

但错误的 clear 只处理：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;
    Py_CLEAR(self->peer);
    return 0;
}
```

实际循环却是：

```text
A.callback → B
B.callback → A
```

那么执行两者的 clear 后：

```text
A.callback → B
B.callback → A
```

循环完全没变。

真实引用计数仍然大于零，`tp_dealloc` 不会发生，于是这组不可达对象会一直存在。

因此 `tp_clear` 必须清除所有**可能成为无法由其他类型保证打断的循环边**。不是每个字段都必须清除，但遗漏任何关键循环边都可能导致泄漏。([Python documentation][1])

---

# 9. “直接或间接引用对象可能已经被清除，状态不保证一致”

假设有：

```text
A → B → C → A
```

GC 调用顺序可能是：

```text
B.tp_clear()
A.tp_clear()
C.tp_clear()
```

当执行 `A.tp_clear()` 时：

```text
B 对象可能仍在内存中
但 B 的字段已经部分置为 NULL
```

例如：

```c
static int
A_clear(PyObject *op)
{
    AObject *self = (AObject *)op;

    /* 错误：试图在 clear 阶段调用 referent 的正常方法 */
    PyObject_CallMethodNoArgs(self->b, &_Py_ID(shutdown));

    Py_CLEAR(self->b);
    return 0;
}
```

`self->b` 虽然仍是有效对象指针，但 B 可能已经处于：

```c
b->config = NULL;
b->peer = NULL;
```

调用其正常方法可能崩溃或产生错误。

间接引用同样如此：

```text
self → B → C
```

即使 B 尚未 clear，C 也可能已经 clear。

所以 `tp_clear` 不应遍历对象图并调用其他对象的高层方法。它应尽可能局部地删除自己拥有的强引用。([Python documentation][1])

---

# 10. “`tp_clear` 可以从任何线程调用”

这里不是说解释器会随意无同步地调用 C 函数，而是说类型不能假设：

```text
tp_clear 一定在创建对象的线程执行
```

例如对象在工作线程中创建：

```text
线程 A：创建对象
线程 B：触发 GC
线程 B：调用对象的 tp_clear
```

即使是传统带 GIL 的构建，执行 GC 的也可以是任意获得 GIL 的 Python 线程。在 free-threaded 构建中，GC 实现和同步方式不同，但公开契约仍然要求 `tp_clear` 不依赖固定线程身份。([Python documentation][1])

因此不要在 `tp_clear` 中无条件做线程关联操作，例如：

```c
/* 危险：必须在创建线程销毁的 GUI 资源 */
destroy_gui_window(self->window);
```

这类操作更适合由显式 `close()`、受控的 `tp_finalize` 或线程调度机制处理。

文档同时保证：

```text
Python 不会自动并发地多次调用同一对象的 tp_clear
```

但这不等于：

* 永远只调用一次；
* 每次都在同一线程；
* 类型的其他方法绝不会与手工清理逻辑产生竞争。

---

# 11. “不能保证在 `tp_dealloc` 前自动调用 `tp_clear`”

最常见的非循环对象：

```python
x = MyObject()
del x
```

如果 `del x` 使引用计数直接降到零，流程通常是：

```text
Py_DECREF(x)
    ↓
refcount == 0
    ↓
tp_dealloc(x)
```

循环 GC 根本不参与，因此不会先自动调用：

```text
tp_clear(x)
```

所以错误的 `tp_dealloc` 是：

```c
static void
Node_dealloc(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    /* 错误地假设 GC 已经清空这些字段 */
    assert(self->peer == NULL);
    assert(self->dict == NULL);

    Py_TYPE(op)->tp_free(op);
}
```

正确设计必须兼容两条路径：

```text
路径一：普通引用计数销毁
    tp_dealloc
    字段可能全部仍非 NULL

路径二：循环 GC
    tp_finalize
    tp_clear
    refcount 降为 0
    tp_dealloc
    部分字段可能已经为 NULL
```

所以 `tp_dealloc` 必须负责所有剩余资源，并允许部分字段已被清空。([Python documentation][1])

---

# 12. `tp_clear` 与 `tp_dealloc` 的第一个区别：职责范围

文档说 `tp_dealloc` 的职责是 `tp_clear` 的超集。

## `tp_clear`

只需删除可能参与循环的 Python 引用：

```c
Py_CLEAR(self->peer);
Py_CLEAR(self->dict);
```

## `tp_dealloc`

必须处理全部资源：

```text
可能参与循环的 Python 引用
不能参与循环的 Python 引用
malloc 分配的 C 内存
文件描述符
锁
操作系统句柄
对象自身的内存
```

例如：

```c
static void
Node_dealloc(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    PyObject_GC_UnTrack(op);

    Node_clear(op);

    /* tp_clear 没必要处理，但 dealloc 必须处理 */
    Py_CLEAR(self->name);
    Py_CLEAR(self->serial);

    PyMem_Free(self->native_buffer);

    if (self->fd >= 0) {
        close(self->fd);
    }

    Py_TYPE(op)->tp_free(op);
}
```

`tp_clear` 是“断边”，`tp_dealloc` 是“彻底销毁”。([Python documentation][1])

---

# 13. 第二个区别：`tp_clear` 不能释放 `self` 的内存

调用 `tp_clear(A)` 时，完全可能仍有：

```text
B.peer → A
C.owner → A
GC 临时保护引用 → A
```

尤其当前 CPython 的 `delete_garbage()` 会显式执行：

```c
Py_INCREF(op);
clear(op);
Py_DECREF(op);
```

因此进入 `tp_clear` 时：

```text
Py_REFCNT(self) > 0
```

对象仍被引用，也必须继续存在。

如果在 `tp_clear` 中执行：

```c
Py_TYPE(self)->tp_free(self);
```

调用者返回后还会继续访问 `self` 或执行：

```c
Py_DECREF(self);
```

这会导致 use-after-free 或 double-free。

所以：

```text
tp_clear：
    只能修改对象内容
    不能释放 self 本身

tp_dealloc：
    在引用计数归零后执行
    最终必须调用 tp_free 释放 self
```

---

# 14. 第三个区别：`tp_clear` 可能永远不自动执行

以下对象通常不会自动执行 `tp_clear`：

```python
obj = MyObject()
del obj
```

因为没有循环，引用计数已经足以销毁。

以下对象虽然有循环，但也可能不被自动 clear：

```python
gc.disable()

a.peer = b
b.peer = a
del a, b
```

如果之后始终没有显式执行适当的 GC，这个 cyclic isolate 可能一直存在。

又或者扩展类型漏掉了：

```c
Py_TPFLAGS_HAVE_GC
```

或 `tp_traverse` 实现不完整，GC 就无法正确识别循环。

因此 `tp_clear` 不能被当成“一定会运行的资源释放回调”。必须释放的资源最终仍要由 `tp_dealloc` 兜底，重要的高层终结逻辑则应合理使用 `tp_finalize`。([Python documentation][1])

---

# 15. “Python 不保证何时、是否、调用多少次 `tp_clear`”

这是公开 API 的前向兼容约束。

不能依赖：

```c
assert(self->clear_count == 0);
self->clear_count++;
```

也不能依赖：

```text
只在第 2 代 GC 调用
只在程序退出调用
只在对象彻底不可达时调用一次
```

当前 CPython 3.14 的实现是在确认终结器没有复活对象后，对最终仍不可达的集合调用 `delete_garbage()`，然后逐个调用 `tp_clear`。但文档明确保留了未来修改自动清除策略的权利。

实现应满足：

```text
可以不调用
可以延迟调用
可以顺序调用多次
调用后对象仍可能暂时存在
```

---

# 16. 保证一：“普通可达对象不会被自动 clear”

若存在正常外部引用：

```text
global variable → A
```

而 A 不是 cyclic isolate 的成员，Python 不会自动把 A 的字段清空。

否则普通程序可能发生：

```python
obj = MyObject()
gc.collect()
obj.peer       # 无缘无故变成 NULL
```

这是不允许的。

注意“存在引用”本身不够，因为 cyclic isolate 中的对象也互相持有引用：

```text
A → B
B → A
```

文档中的“可达”是指从循环外部可达，而不是“引用计数大于零”。([Python documentation][1])

---

# 17. 保证二：“对象尚未自动 finalize，就不会自动 clear”

GC 顺序必须是：

```text
tp_finalize
    ↓
确认没有复活
    ↓
tp_clear
```

而不能是：

```text
tp_clear
    ↓
tp_finalize
```

否则终结器看到的是被破坏的对象。

例如：

```c
static void
Node_finalize(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    /* 合法地需要读取 peer */
    log_relationship(self->name, self->peer);
}
```

如果先 clear：

```c
self->peer = NULL;
```

终结器就无法完成工作。

因此对象有 `tp_finalize` 时，自动 GC 必须先完成终结阶段，再进入 clear 阶段。对一个 cyclic isolate，甚至要保证其中所有需要自动终结的成员都已终结，才开始清除其中任何成员。([Python documentation][1])

文档括号中关于“复活后可能会或不会再次 finalize”的说明，是提醒你不要依赖复活对象的 finalized 标志在所有版本和类型中有完全相同的重置行为。

---

# 18. 保证三：“循环中的任何成员未 finalize，整个循环都不能开始 clear”

考虑：

```text
A <──> B
```

二者都有终结器：

```c
A_finalize(A) {
    inspect(B);
}

B_finalize(B) {
    inspect(A);
}
```

如果顺序是：

```text
finalize(A)
clear(A)
finalize(B)
```

那么 `B_finalize()` 看到的 A 已经部分清除。

正确顺序必须是：

```text
finalize(A)
finalize(B)
重新检查是否复活
clear(A)
clear(B)
```

或者先 B 后 A，但总之：

> 所有终结器阶段先完成，任何 clear 阶段后开始。

这样终结器可能看到“另一个对象已经 finalized”，但不会看到“另一个对象已经被 GC clear”。([Python documentation][1])

---

# 19. 保证四：“`tp_clear` 返回前不会销毁 `self`”

这是非常重要的生命周期保证。

假设：

```text
A.peer → B
B.peer → A
```

正在调用：

```c
A_clear(A)
```

其中：

```c
Py_CLEAR(A->peer);
```

可能使 B 的引用计数归零，于是销毁 B；B 的销毁又清除：

```c
B->peer
```

从而使 A 的真实引用计数也降到零。

如果没有额外保护，A 可能在自己的 `tp_clear` 尚未返回时被释放：

```text
A_clear 正在执行
    ↓
清除 A.peer
    ↓
销毁 B
    ↓
B 释放对 A 的引用
    ↓
销毁 A
    ↓
A_clear 继续使用已释放的 self
```

CPython 当前通过：

```c
Py_INCREF(op);
clear(op);
Py_DECREF(op);
```

临时保活 `self`，保证其内存至少持续到 `tp_clear` 返回。

但这个保证仅针对 `self`。你清除或访问的其他 referent 可能随时因 `DECREF` 被销毁。

---

# 20. 保证五：“不会并发地多次自动调用同一个 `tp_clear`”

不会出现：

```text
线程 A：self.tp_clear()
线程 B：self.tp_clear()
```

两个由 Python 自动发起的 clear 同时操作同一对象。

但仍应实现幂等，因为可能顺序发生：

```text
第一次：GC 自动调用 tp_clear
第二次：tp_dealloc 调用 tp_clear
```

或者未来另一轮生命周期处理再次调用。

所以“不会并发多次”解决的是数据竞争问题，不是“只调用一次”的承诺。([Python documentation][1])

---

# 21. “当前 CPython 只在打破 cyclic isolate 时自动 clear，但未来可能扩大用途”

这是文档复杂的主要原因之一。

如果只针对当前实现编程，可能写出：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    /* 错误假设：进入这里必然没有外部引用 */
    assert(Py_REFCNT(op) == 1);

    ...
}
```

当前实现中也未必等于 1，因为还有循环内部引用和 GC 临时保护引用。

更重要的是，未来 Python 可能在对象即将销毁之前预先调用 clear，例如为了：

* 尽早释放大型引用图；
* 降低析构链深度；
* 统一对象清理流程；
* 改进并行或 free-threaded 生命周期管理。

因此公开契约要求 `tp_clear` 只依赖文档明确给出的保证，不依赖当前 `delete_garbage()` 的具体调用位置。([Python documentation][1])

---

# 22. “系统中所有 `tp_clear` 必须共同打破所有循环”

这不意味着每个对象必须清除每一个引用。

例如：

```text
tuple T → list L → tuple T
```

tuple 没有 `tp_clear`，但 list 有：

```c
list_clear(L)
```

只要 list 删除：

```text
L → T
```

循环就被打破：

```text
T → L
```

随后引用计数可以级联归零。

所以是整个循环中各类型的 `tp_clear` **共同**负责断环，而不是每个成员都必须独立断开所有边。([Python documentation][1])

反例：

```text
A → B → C → A
```

如果：

* A 没有 `tp_clear`；
* B 没有 `tp_clear`；
* C 也没有 `tp_clear`；

则没有任何地方删除环上的边，循环永远不会断开。

因此只有能严格证明“由我的类型形成的循环一定包含另一个会负责断环的类型”时，才适合省略 `tp_clear`。

---

# 23. “tuple 为什么可以没有 `tp_clear`”

文档给出的理由是：无法由合法构造的 exact tuple 单独组成纯 tuple 循环。

tuple 一旦构造完成就是不可变的：

```text
T1 → T2
```

若 T2 在 T1 构造前已经完成，它不能随后再增加：

```text
T2 → T1
```

合法 C API 只允许 `PyTuple_SET_ITEM()` 用于填充全新的、尚未投入使用的 tuple；在已经被其他对象使用或引用计数大于 1 的 tuple 上修改可能导致未定义行为。([Python documentation][2])

确实可以尝试用 C API 构造：

```text
T1 → T2
T2 → T1
```

但在填充 T1 后，未完成的 T2 已经通过 T1 暴露；继续把 T2 当作“尚未暴露的全新 tuple”修改，违反了 tuple 构造协议。

不过 tuple 可以参与混合循环：

```text
tuple → list → tuple
tuple → dict → tuple
```

此时 list 或 dict 的 `tp_clear` 负责断环。

这也解释了为什么文档强调：

> 省略 `tp_clear` 所需的证明通常并不直观；没有充分理由时应当实现。

([Python documentation][1])

---

# 24. “实现应删除成员引用，并把成员指针置为 `NULL`”

标准形式是：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->callback);
    Py_CLEAR(self->dict);

    return 0;
}
```

必须同时完成两件事：

```text
1. 释放所拥有的强引用：DECREF
2. 更新自身字段：设为 NULL
```

只 `DECREF` 不置空：

```c
Py_DECREF(self->peer);
```

会让 `self->peer` 成为悬空指针。

只置空不 `DECREF`：

```c
self->peer = NULL;
```

会泄漏原有引用。

`Py_CLEAR()` 将二者以正确顺序组合。([Python documentation][1])

---

# 25. 为什么必须“先置 NULL，再 DECREF”

错误实现：

```c
Py_DECREF(self->peer);
self->peer = NULL;
```

假设：

```text
self.peer → B
B 的最后一个引用就是 self.peer
```

执行：

```c
Py_DECREF(B);
```

会立即进入：

```text
B.tp_dealloc
B.tp_finalize
弱引用回调
其他对象的析构
任意 Python 代码
```

这些代码可能间接重新访问 `self`：

```python
def B.__del__():
    inspect(owner.peer)
```

此时错误实现中的：

```c
self->peer
```

还没有置为 `NULL`，却指向正在析构或已经释放的 B，可能造成 use-after-free。

安全顺序是：

```c
PyObject *tmp = self->peer;
self->peer = NULL;
Py_DECREF(tmp);
```

重入代码看到：

```text
self.peer == NULL
```

就知道该字段已经不可用。

`Py_CLEAR()` 的核心价值不只是少写几行，而是保证这个重入安全顺序。文档明确指出，`DECREF` 可能触发级联回收、终结器、弱引用回调以及任意 Python 代码。([Python documentation][1])

---

# 26. managed dict 的特殊要求

若类型使用：

```c
Py_TPFLAGS_MANAGED_DICT
```

实例字典不一定存放在你自己结构体中的显式：

```c
PyObject *dict;
```

字段里，因此不能只写：

```c
Py_CLEAR(self->dict);
```

必须调用：

```c
PyObject_ClearManagedDict((PyObject *)self);
```

相应地，`tp_traverse` 中要调用：

```c
PyObject_VisitManagedDict(
    (PyObject *)self,
    visit,
    arg);
```

这是因为 managed dict 的实际存储和生命周期由 CPython 管理，扩展类型不能假定其内部布局。([Python documentation][1])

---

# 27. `tp_traverse` 和 `tp_clear` 必须对应

假设：

```c
self->peer;
self->callback;
self->dict;
```

都可能参与循环。

`tp_traverse` 应报告这些边：

```c
static int
Node_traverse(PyObject *op, visitproc visit, void *arg)
{
    NodeObject *self = (NodeObject *)op;

    Py_VISIT(self->peer);
    Py_VISIT(self->callback);
    Py_VISIT(self->dict);

    return 0;
}
```

`tp_clear` 应能删除足够多的这些边：

```c
static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    Py_CLEAR(self->peer);
    Py_CLEAR(self->callback);
    Py_CLEAR(self->dict);

    return 0;
}
```

如果 `tp_traverse` 漏掉 `callback`：

```text
GC 可能无法正确发现循环
```

如果 traverse 报告了 callback，但 clear 从不删除它：

```text
GC 能发现循环，但可能无法拆开循环
```

因此三项通常作为一组继承和实现：

```text
Py_TPFLAGS_HAVE_GC
tp_traverse
tp_clear
```

文档规定，当子类型中三者均为空或未设置时，它们可以作为一组从基类继承；不能随意只改变其中一部分而破坏协议。([Python documentation][1])

---

# 28. 一个推荐的最小实现

```c
typedef struct {
    PyObject_HEAD

    /* 可能参与循环 */
    PyObject *peer;
    PyObject *callback;
    PyObject *dict;

    /* 不能参与循环，但 dealloc 仍需释放 */
    PyObject *name;       /* str */

    /* 非 Python 资源 */
    int fd;
} NodeObject;


static int
Node_traverse(PyObject *op, visitproc visit, void *arg)
{
    NodeObject *self = (NodeObject *)op;

    Py_VISIT(self->peer);
    Py_VISIT(self->callback);
    Py_VISIT(self->dict);

    return 0;
}


static int
Node_clear(PyObject *op)
{
    NodeObject *self = (NodeObject *)op;

    /*
     * 只做局部、幂等、低风险的断环操作。
     * 不调用 peer 的方法，不假定 referent 状态完整。
     */
    Py_CLEAR(self->peer);
    Py_CLEAR(self->callback);
    Py_CLEAR(self->dict);

    return 0;
}
```

这个实现满足：

```text
可重复调用
字段先置 NULL 再 DECREF
不释放 self
不依赖 referent 的完整状态
不执行复杂终结逻辑
能删除可能参与循环的强引用
```

`tp_dealloc` 仍需额外负责：

```text
name
fd
其他 C 内存
weakrefs
对象自身的 tp_free
```

---

# 29. 对照 CPython 的实际 `delete_garbage()`

当前 CPython 3.14 的自动清除路径可以概括为：

```c
while (collectable 非空) {
    op = collectable 中第一个对象;

    if (op->tp_clear != NULL) {
        Py_INCREF(op);      // 保证 self 在 clear 返回前有效
        op->tp_clear(op);   // 可能引发级联析构
        report_exception_if_any();
        Py_DECREF(op);
    }

    if (op 仍在 collectable 链表中) {
        move_to_old_generation(op);
    }
}
```

这里同样不能预先保存“下一个对象”，因为 `tp_clear(op)` 可能使：

* 当前对象销毁；
* 其他 collectable 对象销毁；
* 多个对象引用计数级联归零；
* GC 链表结构发生变化。

所以它和你之前看到的 `finalize_garbage()` 一样，总是重新取链表首元素。区别在于：

```text
finalize_garbage：
    对象图仍应保持完整
    允许高层终结和复活

delete_garbage / tp_clear：
    已确认最终不可达
    开始主动破坏对象图
    对象可能随时级联销毁
```



---

# 总结

`tp_clear` 的完整契约可以压缩成以下几条：

```text
目的：
    删除 Python 强引用，打破循环，不是释放 self

对象状态：
    self 内存仍有效，但可以已经部分清空
    其他 referent 也可能已经部分清空

实现要求：
    局部
    幂等
    允许字段已为 NULL
    使用 Py_CLEAR
    不执行复杂清理
    不调用 tp_free

与其他槽位关系：
    tp_finalize 先做需要完整状态的终结
    tp_clear 再拆环
    tp_dealloc 最终释放全部资源和内存

调用保证：
    普通可达对象不会自动 clear
    所有必要 finalizer 完成前不会自动 clear
    clear 返回前 self 不会被销毁
    不会对同一对象并发执行多个自动 clear

不能依赖：
    一定调用
    只调用一次
    固定线程
    固定代
    referent 状态完整
    调用后立即销毁
```

文档之所以写得复杂，是因为 `tp_clear` 处在一个特殊阶段：**对象已被判定为垃圾，但其引用计数仍大于零、内存仍存在、对象图正在逐步被破坏，并且一次 `DECREF` 就可能触发整串重入和析构。**

[1]: https://docs.python.org/zh-cn/3.14/c-api/typeobj.html "类型对象结构体 — Python 3.14.7 文档"
[2]: https://docs.python.org/zh-cn/3.14/c-api/tuple.html?utm_source=chatgpt.com "元组对象 — Python 3.14.6 文档"
