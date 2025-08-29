
## 生成器是什么？
首先考虑如下的计数器，功能类似于 `range`，它实现了迭代器的接口（`__iter__`，`__next__`）。
```python
class Counter:
    """
    该代码参考于：
        CPython internals - User-defined classes and objects - Lecture 8,
        https://youtu.be/Wbu2wMCcTKo?si=ynVQnbcpYzZ6P4iw.
    """
    def __init__(self, end, start=0, step=1):
        self.current = start
        self.end = end
        self.step = step

    def __iter__(self):
        return self

    def __next__(self):
        if self.current < self.end:
            value = self.current
            self.current += self.step
            return value
        raise StopIteration
```
在 Python 中，我们可以使用另一种方式实现类似的功能，即生成器：
```python
def counter(end, start=0, step=1):
    current = start
    while current < end:
        value = current
        current += step
        yield value
        # 或者
        # yield current
        # current += step
```
简单的类比，生成器就像是通过函数的方式实现了迭代器接口，所定义函数的实现会*覆盖*父类的 `__next__`，而其他方法则*继承*自父类。从这个角度看，定义一个生成器函数就像是定义了一个继承自生成器对象的类，并实现了 `__next__` 接口。因此，它们的使用逻辑也是十分的类似：
```python
c1 = Counter(5)
print("Iterator:", c1)
for i in c1:
    print(i)
# Iterator: <__main__.Counter object at 0x102664cd0>
# 0
# 1
# 2
# 3
# 4

c2 = counter(5)
print("Generator:", c2)
for i in c2:
    print(i)
# Generator: <generator object counter at 0x102818f90>
# 0
# 1
# 2
# 3
# 4
```
可以看到，生成器函数与一般函数不同，直接调用该函数并不会执行其函数体，而是返回了一个生成器对象。这类似于手动初始化一个迭代器实例，实例的 `__next__` 方法只会在调用 `next()` 时才会执行，这与生成器是一致的。因此，简单来说，生成器可以视为 Python 提供给用户实现迭代器的便捷方式。

## 如何通过函数实现生成器？
通常调用一个函数，我们会得到其返回结果，而生成器的存在似乎违背这一直觉，依据上述观察，其并没有执行函数体却返回了一个生成器实例。首先，通过 `dis` 得到对应字节码：
```text
 43     >>   64 LOAD_NAME                2 (counter)
             66 LOAD_CONST               7 (5)
             68 CALL_FUNCTION            1
             70 STORE_NAME               6 (c2)

 44          72 LOAD_NAME                4 (print)
             74 LOAD_CONST               9 ('Generator:')
             76 LOAD_NAME                6 (c2)
             78 CALL_FUNCTION            2
             80 POP_TOP

 47          82 LOAD_NAME                6 (c2)
             84 GET_ITER
        >>   86 FOR_ITER                12 (to 100)
             88 STORE_NAME               5 (i)

 48          90 LOAD_NAME                4 (print)
             92 LOAD_NAME                5 (i)
             94 CALL_FUNCTION            1
             96 POP_TOP
             98 JUMP_ABSOLUTE           86
        >>  100 LOAD_CONST              10 (None)
            102 RETURN_VALUE

Disassembly of <code object counter at 0x100b1ba80, file "gen.py", line 26>:
 27           0 LOAD_FAST                1 (start)
              2 STORE_FAST               3 (current)

 28     >>    4 LOAD_FAST                3 (current)
              6 LOAD_FAST                0 (end)
              8 COMPARE_OP               0 (<)
             10 POP_JUMP_IF_FALSE       32

 29          12 LOAD_FAST                3 (current)
             14 STORE_FAST               4 (value)

 30          16 LOAD_FAST                3 (current)
             18 LOAD_FAST                2 (step)
             20 INPLACE_ADD
             22 STORE_FAST               3 (current)

 33          24 LOAD_FAST                4 (value)
             26 YIELD_VALUE
             28 POP_TOP
             30 JUMP_ABSOLUTE            4
        >>   32 LOAD_CONST               0 (None)
             34 RETURN_VALUE
```
观察 `counter` 的字节码，其就是常规的函数实现。那么，魔法大概率是发生在 `CALL_FUNCTION` 字节码的内部。我们逐步从该字节码的函数调用栈出发，寻找魔法存在的位置：
```c
/* ceval.c */
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(CALL_FUNCTION): {
                PREDICTED(CALL_FUNCTION);
                PyObject **sp, *res;
                sp = stack_pointer;
                res = call_function(tstate, &sp, oparg, NULL);
                stack_pointer = sp;
                PUSH(res);
                if (res == NULL) {
                    goto error;
                }
                DISPATCH();
            }
        }
    }
}

Py_LOCAL_INLINE(PyObject *) _Py_HOT_FUNCTION
call_function(PyThreadState *tstate, PyObject ***pp_stack, Py_ssize_t oparg, PyObject *kwnames)
{
    x = _PyObject_Vectorcall(func, stack, nargs | PY_VECTORCALL_ARGUMENTS_OFFSET, kwnames);
    return x;
}
```
```c
/* cpython/abstract.c */
static inline PyObject *
_PyObject_Vectorcall(PyObject *callable, PyObject *const *args,
                     size_t nargsf, PyObject *kwnames)
{
    return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
}

/* call.c */
PyObject *
_PyObject_MakeTpCall(PyObject *callable, PyObject *const *args, Py_ssize_t nargs, PyObject *keywords)
{
    ternaryfunc call = Py_TYPE(callable)->tp_call;
    result = call(callable, argstuple, kwdict);
    return result;
}
```
因为 Python 在执行 `CALL_FUNCTION` 之前，需要进行 `MAKE_FUNCTION` 操作，其会将待调用的函数的 `codeobject` 封装为 `PyFunction_Type` 的实例，那么 `Py_TYPE(callable)->tp_call` 指向的指针就为 `function_call`。
```c
/* funcobject.c */
PyTypeObject PyFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "function",
    function_call,                              /* tp_call */
};

static PyObject *
function_call(PyObject *func, PyObject *args, PyObject *kwargs)
{
    PyObject **stack;
    Py_ssize_t nargs;

    stack = _PyTuple_ITEMS(args);
    nargs = PyTuple_GET_SIZE(args);
    return _PyFunction_FastCallDict(func, stack, nargs, kwargs);
}

/* call.c */
PyObject *
_PyFunction_FastCallDict(PyObject *func, PyObject *const *args, Py_ssize_t nargs,
                         PyObject *kwargs)
{
    PyCodeObject *co = (PyCodeObject *)PyFunction_GET_CODE(func);
    PyObject *globals = PyFunction_GET_GLOBALS(func);
    PyObject *argdefs = PyFunction_GET_DEFAULTS(func);
    PyObject *kwdefs, *closure, *name, *qualname;
    PyObject *kwtuple, **k;
    PyObject **d;
    Py_ssize_t nd, nk;
    PyObject *result;

    result = _PyEval_EvalCodeWithName((PyObject*)co, globals, (PyObject *)NULL,
                                      args, nargs,
                                      k, k != NULL ? k + 1 : NULL, nk, 2,
                                      d, nd, kwdefs,
                                      closure, name, qualname);
    return result;
}
```
```c
/* code.h */
#define CO_GENERATOR    0x0020

/* ceval.c */
PyObject *
_PyEval_EvalCodeWithName(PyObject *_co, PyObject *globals, PyObject *locals,
           PyObject *const *args, Py_ssize_t argcount,
           PyObject *const *kwnames, PyObject *const *kwargs,
           Py_ssize_t kwcount, int kwstep,
           PyObject *const *defs, Py_ssize_t defcount,
           PyObject *kwdefs, PyObject *closure,
           PyObject *name, PyObject *qualname)
{
    PyFrameObject *f;
    if (co->co_flags & (CO_GENERATOR | CO_COROUTINE | CO_ASYNC_GENERATOR)) {
        PyObject *gen;
        gen = PyGen_NewWithQualName(f, name, qualname);
        return gen;
    }
    retval = PyEval_EvalFrameEx(f,0);
    return retval;
}
```
调用到最后发现，当 `codeobject` 的 `co_flags`（在编译阶段确定）对应的 `CO_GENERATOR` 标志位为 `1` 时，表明该函数是一个生成器函数，然后将其封装为生成器对象并返回，而常规函数则正常执行其函数体。
```c
/* genobject.c */
PyObject *
PyGen_NewWithQualName(PyFrameObject *f, PyObject *name, PyObject *qualname)
{
    return gen_new_with_qualname(&PyGen_Type, f, name, qualname);
}

static PyObject *
gen_new_with_qualname(PyTypeObject *type, PyFrameObject *f,
                      PyObject *name, PyObject *qualname)
{
    PyGenObject *gen = PyObject_GC_New(PyGenObject, type);
    gen->gi_frame = f;
    f->f_gen = (PyObject *) gen;
    gen->gi_code = (PyObject *)(f->f_code);
    gen->gi_running = 0;
    gen->gi_name = name;
    gen->gi_qualname = qualname;
    return (PyObject *)gen;
}
```
## 生成器是如何实现迭代的？
一个生成器对象被建立后，我们可以像使用任何一个迭代器一样去使用它。因此，`PyGen_Type` 的 `gen_iternext` 会在调用 `next()` 时被调用。同时，生成器对象实现了 `tp_iter`（即 `__iter__`）接口，因此是一个迭代器。
```c
/* genobject.h */
typedef struct {
    PyObject_HEAD
    /* Note: gi_frame can be NULL if the generator is "finished" */
    struct _frame *gi_frame;
    /* True if generator is being executed. */
    char gi_running;
    /* The code object backing the generator */
    PyObject *gi_code;
    /* List of weak reference. */
    PyObject *gi_weakreflist;
    /* Name of the generator. */
    PyObject *gi_name;
    /* Qualified name of the generator. */
    PyObject *gi_qualname;
    _PyErr_StackItem gi_exc_state;
} PyGenObject;

/* genobject.c */
PyTypeObject PyGen_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "generator",                                /* tp_name */
    (iternextfunc)gen_iternext,                 /* tp_iternext */
    PyObject_SelfIter,                          /* tp_iter */
    gen_methods,                                /* tp_methods */
};

PyObject *
PyObject_SelfIter(PyObject *obj)
{
    Py_INCREF(obj);
    return obj;
}
```
```c
/* genobject.c */
static PyObject *
gen_iternext(PyGenObject *gen)
{
    return gen_send_ex(gen, NULL, 0, 0);
}

static PyObject *
gen_send_ex(PyGenObject *gen, PyObject *arg, int exc, int closing)
{
    PyFrameObject *f = gen->gi_frame;
    PyObject *result;

    gen->gi_running = 1;
    result = PyEval_EvalFrameEx(f, exc);
    gen->gi_running = 0;
    return result;
}
```
可以看到，在 `gen_iternext` 执行时，通过获取并执行保存在所建立的生成器对象 `PyGenObject` 中的 `PyFrameObject` 对象来获得当前迭代的值。那么 `PyEval_EvalFrameEx` 执行函数体过程中会暂停和返回的特性应该由 `yield` 对应的字节码 `YIELD_VALUE` 来完成：
```c
/* ceval.c */
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
    PyThreadState * const tstate = _PyRuntimeState_GetThreadState(runtime);

main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(YIELD_VALUE): {
                retval = POP();
                f->f_stacktop = stack_pointer;
                goto exit_yielding;
            }
        }
    }

exit_yielding:
    /* pop frame */
exit_eval_frame:
    f->f_executing = 0;
    tstate->frame = f->f_back;

    return _Py_CheckFunctionResult(NULL, retval, "PyEval_EvalFrameEx");
}
```
从 `YIELD_VALUE` 可以看出，首先 `POP` 所需返回的值（即 `yield value` 中的 `value`），然后退出 frame 的执行并返回结果。

## `send()` 是如何与函数内部进行交互的？
生成器对象除了可以使用 `next()` 获取值，还可以通过 `send()` 获取值并能够与函数内部进行互动。如下例：
```python
def counter(end, start=0, step=1):
    current = start
    while current < end:
        value = current
        current += step
        sent = yield value
        print('sent', sent)

c = counter(5)
for i in range(5):
    if i == 0:
        i = None
    print(c.send(i))
# 0
# sent 1
# 1
# sent 2
# 2
# sent 3
# 3
# sent 4
# 4
```
注意，第一次需要 `send(None)`，因为程序执行到 `yield` 就会暂停当前 frame 的执行并返回。那么下一次 `send()` 的时候，函数将从 `yield` 后面执行，那么当前 send 的值就会把上一次的值覆盖掉。因此，第一次的值将无法被访问到，故规定为 `None`。由 `gen_methods` 定义了生成器对象的方法，`send()` 的实现同 `gen_iternext`：
```c
/* genobject.c */
static PyMethodDef gen_methods[] = {
    {"send",(PyCFunction)_PyGen_Send, METH_O, send_doc},
    {NULL, NULL}        /* Sentinel */
};

PyObject *
_PyGen_Send(PyGenObject *gen, PyObject *arg)
{
    return gen_send_ex(gen, arg, 0, 0);
}

static PyObject *
gen_send_ex(PyGenObject *gen, PyObject *arg, int exc, int closing)
{
    PyThreadState *tstate = _PyThreadState_GET();
    PyFrameObject *f = gen->gi_frame;
    PyObject *result;

    if (f->f_lasti == -1) {
        /* 检查首次 send 值是否为 None */
        if (arg && arg != Py_None) {
            const char *msg = "can't send non-None value to a "
                              "just-started generator";
            PyErr_SetString(PyExc_TypeError, msg);
            return NULL;
        }
    } else {
        /* 将当前 send 的值 Push 至栈顶 */
        result = arg ? arg : Py_None;
        Py_INCREF(result);
        *(f->f_stacktop++) = result;
    }

    gen->gi_running = 1;
    result = PyEval_EvalFrameEx(f, exc);
    gen->gi_running = 0;
    return result;
}
```
可以观察到，`send()` 通过将值设置为当前 frame 的值栈栈顶，那么继 `yield` 恢复后，若有赋值语句，则通过 `STORE_FAST` 字节码设置给相应的局部变量，否则通过 `POP_TOP` 字节码丢弃。

## 附：普通函数与生成器函数 `codeobject` 的对象标志位
```ipython
def f():
    return 123

def g():
    yield 123

>>> f
<function f at 0x104bd3790>
>>> g
<function g at 0x104bd3700>
>>> f.__code__
<code object f at 0x104bcd920, file "<stdin>", line 1>
>>> g.__code__
<code object g at 0x104bcd9d0, file "<stdin>", line 1>
>>> bin(f.__code__.co_flags)
'0b1000011'
>>> bin(g.__code__.co_flags)
'0b1100011'
>>> bin(0x0020)
'0b0100000'
```
可以看出函数 `g` 的 `CO_GENERATOR` 标志位为 `1` 而函数 `f` 的为 `0`。