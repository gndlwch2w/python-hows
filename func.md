## 为什么函数（或实例）可以被调用？
在 Python 中，我们可以调用各种广义的函数，即通过形如 `func(args)` 的方式调用 Python 对象。如下为这种范例的一些例子：
```python
# 内置函数
>>> type(type)
<class 'type'>
>>> type
<class 'type'>
>>> type(...)
<class 'ellipsis'>

>>> type(print)
<class 'builtin_function_or_method'>
>>> print
<built-in function print>
>>> print('Hello CPython!')
Hello CPython!

# 自定义函数
def fib(n):
    if n <= 1:
        return 1
    return fib(n - 1) + fib(n - 2)

>>> type(fib)
<class 'function'>
>>> fib
<function fib at 0x100fcd670>
>>> fib(5)
8

# 内置类
>>> type(int)
<class 'type'>
>>> int
<class 'int'>
>>> int('2147483648')
2147483648

# 用户定义类
class User:
    def __init__(self, name):
        self.name = name
    
    def __call__(self):
        return f'Hello, I\'m {self.name}'
    
    def dance(self):
        return 'Just because you are so beautiful'

>>> user = User('Xukun Cai')  # 调用类名
>>> type(user)
<class '__main__.User'>
>>> user
<__main__.User object at 0x100f74190>
>>> user()  # 调用实例名
"Hello, I'm Xukun Cai"

>>> type(user.dance)
<class 'method'>
>>> user.dance
<bound method User.dance of <__main__.User object at 0x101211af0>>
>>> user.dance()
'Just because you are so beautiful'
```
从上面例子中可以总结出：type 类本身、builtin_function_or_method 类实例 built-in function、function 类实例、形如 int 的内置类、用户定义类、用户定义类实例和自定义类实例方法都可以以 `func(args)` 形式被调用。 如下通过 `dis` 查看各种方法调用的字节码：
```text
# type(type)
  1           0 LOAD_NAME                0 (type)
              2 LOAD_NAME                0 (type)
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# print('Hello CPython!')
  1           0 LOAD_NAME                0 (print)
              2 LOAD_CONST               0 ('Hello CPython!')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# int('2147483648')
  1           0 LOAD_NAME                0 (int)
              2 LOAD_CONST               0 ('2147483648')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# User('Xukun Cai')
  1           0 LOAD_NAME                0 (User)
              2 LOAD_CONST               0 ('Xukun Cai')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# user()
  1           0 LOAD_NAME                0 (user)
              2 CALL_FUNCTION            0
              4 RETURN_VALUE

# user.dance()
  1           0 LOAD_NAME                0 (user)
              2 LOAD_METHOD              1 (dance)
              4 CALL_METHOD              0
              6 RETURN_VALUE
```
容易看出，上述几乎所有的调用均由 `CALL_FUNCTION` 字节码完成，除实例方法通过 `CALL_METHOD` 字节码实现（详见：[附：实例方法的调用机制](#附实例方法的调用机制)）。那么其内部是如何知道不同的对象的调用入口以及如何区别处理 C 函数的调用和 Python 函数的调用的。我们从 `CALL_FUNCTION` 字节码出发，追溯其调用栈：
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
/* cpython/abstract.h */
static inline PyObject *
_PyObject_Vectorcall(PyObject *callable, PyObject *const *args,
                     size_t nargsf, PyObject *kwnames)
{
    PyObject *res;
    vectorcallfunc func;
    func = _PyVectorcall_Function(callable);
    /* 未实现 Vectorcall 的会走向一般的调用分支：_PyObject_MakeTpCall */
    if (func == NULL) {
        Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
        return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
    }
    res = func(callable, args, nargsf, kwnames);
    return _Py_CheckFunctionResult(callable, res, NULL);
}
```
`_PyVectorcall_Function` 是 [PEP 590](https://peps.python.org/pep-0590/)（Python 3.8）提出的特性，旨在避免函数调用时参数的打包和解包所带来的性能开销，以加速函数的调用。详细内容可参考：[附：Vectorcall 的实现机制](#附vectorcall-的实现机制)。
```c
/* call.c */
PyObject *
_PyObject_MakeTpCall(PyObject *callable, PyObject *const *args, Py_ssize_t nargs, PyObject *keywords)
{
    ternaryfunc call = Py_TYPE(callable)->tp_call;

    PyObject *result = NULL;
    if (Py_EnterRecursiveCall(" while calling a Python object") == 0)
    {
        result = call(callable, argstuple, kwdict);
        Py_LeaveRecursiveCall();
    }

    result = _Py_CheckFunctionResult(callable, result, NULL);
    return result;
}
```
从 `Py_TYPE(callable)->tp_call` 可以看出，函数的入口为被调用实例类型的 `tp_call` 槽位指向的 C 函数指针。按照上述的各个被调用的类型或实例，通过依次分析他们对应的 `tp_call` 的内部实现了解其内部的调用机制。

- type 类本身
```c
/* typeobject.c */
PyTypeObject PyType_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "type",                                     /* tp_name */
    (ternaryfunc)type_call,                     /* tp_call */
};

static PyObject *
type_call(PyTypeObject *type, PyObject *args, PyObject *kwds);
```
在调用 `type()` 时，`tp_call` 指向了 `type_call` 函数指针，其完全由 C 实现，直接执行编译的指令。

- builtin_function_or_method 类实例 built-in function
```c
/* methodobject.c */
PyTypeObject PyCFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "builtin_function_or_method",
    offsetof(PyCFunctionObject, vectorcall),    /* tp_vectorcall_offset */
    PyCFunction_Call,                           /* tp_call */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL,                /* tp_flags */
};

/* methodobject.h */
#define PyCFunction_GET_FUNCTION(func) \
        (((PyCFunctionObject *)func) -> m_ml -> ml_meth)

/* call.c */
PyObject *
PyCFunction_Call(PyObject *func, PyObject *args, PyObject *kwargs)
{
    /* METH_VARARGS 表明该 C 函数的参数将会以 tuple 的形式传递进来，这时避免使用 Vectorcall 方式调用。
    因为 Vectorcall 协议接受的参数为 C 数组，这需要解包和再次打包的过程，造成不必要的性能开销。因此 CPython 
    的实现中将 METH_VARARGS | METH_KEYWORDS 类型函数的 vectorcall 置为 NULL。 */
    if (PyCFunction_GET_FLAGS(func) & METH_VARARGS) {
        return cfunction_call_varargs(func, args, kwargs);
    }
    return PyVectorcall_Call(func, args, kwargs);
}

static PyObject *
cfunction_call_varargs(PyObject *func, PyObject *args, PyObject *kwargs)
{
    /* 获取 PyCFunctionObject 内封装的 C 函数 */
    PyCFunction meth = PyCFunction_GET_FUNCTION(func);
    PyObject *self = PyCFunction_GET_SELF(func);
    PyObject *result;

    if (PyCFunction_GET_FLAGS(func) & METH_KEYWORDS) {
        result = (*(PyCFunctionWithKeywords)(void(*)(void))meth)(self, args, kwargs);
        Py_LeaveRecursiveCall();
    }
    else {
        if (Py_EnterRecursiveCall(" while calling a Python object")) {
            return NULL;
        }

        result = (*meth)(self, args);
        Py_LeaveRecursiveCall();
    }

    return _Py_CheckFunctionResult(func, result, NULL);
}

PyObject *
PyVectorcall_Call(PyObject *callable, PyObject *tuple, PyObject *kwargs)
{
    /* get vectorcallfunc as in _PyVectorcall_Function, but without
     * the _Py_TPFLAGS_HAVE_VECTORCALL check */
    vectorcallfunc func;
    Py_ssize_t offset = Py_TYPE(callable)->tp_vectorcall_offset;
    memcpy(&func, (char *) callable + offset, sizeof(func));
    if (func == NULL) {
        PyErr_Format(PyExc_TypeError, "'%.200s' object does not support vectorcall",
                     Py_TYPE(callable)->tp_name);
        return NULL;
    }

    PyObject *result = func(callable, args, nargs, kwnames);
    return _Py_CheckFunctionResult(callable, result, NULL);
}
```
`builtin_function_or_method` 类实例对象 `PyCFunctionObject` 为 Python 对内置函数 C 实现的封装。其被调用时，`tp_call` 指向 `PyCFunction_Call` 函数会调用封装在自身实例对象中 `m_ml` 槽位指向的 C 函数。

- function 类实例
```c
PyTypeObject PyFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "function",
    offsetof(PyFunctionObject, vectorcall),     /* tp_vectorcall_offset */
    function_call,                              /* tp_call */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL |
    Py_TPFLAGS_METHOD_DESCRIPTOR,               /* tp_flags */
}

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
`function` 类实例对象 `PyFunctionObject` 为用户实现 Python 函数的封装，通过 `_PyEval_EvalCodeWithName` 执行其编译的 `codeobject` 实现函数的调用。

- 形如 int 的内置类

Python 中内置类，如 int（long）、float、bool、list、tuple、set、dict、str（unicode） 等，其定义在 `*object.h` 和 `*object.c` 中，在 C 中定义类型为 `Py*_Type` 和定义实例对象为 `Py*Object`。如下以 int 为例：
```c
/* longobject.c */
PyTypeObject PyLong_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "int",                                      /* tp_name */
    long_new,                                   /* tp_new */
}
```
由于 int 对象本身是类，而其类型为 `type`，故 `tp_call` 为 `type` 对象的定义的 `type_call`。
```c
/* typeobject.c */
static PyObject *
type_call(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    PyObject *obj;
    obj = type->tp_new(type, args, kwds);
    return obj;
}
```
可以看到通过调用 `type->tp_new()` 去执行类实例的创建，从而实现类对象的调用。

- 用户定义类

关于自定义类的创建机制，参考 [用户定义类](https://github.com/gndlwch2w/python-hows/blob/main/class.md)，这里仅关注用户定义类被调用时的入口函数。

- 用户定义类实例

## 附：Vectorcall 的实现机制
`CALL_FUNCTION` 的实现中 `call_function(tstate, &sp, oparg, NULL)` 将当前 frame 的值栈 `&sp` 和参数个数 `oparg` 传入 `_PyObject_Vectorcall` 中，然后区别处理 Vectorcall 调用和普通调用。
```c
/* cpython/abstract. */
static inline PyObject *
_PyObject_Vectorcall(PyObject *callable, PyObject *const *args,
                     size_t nargsf, PyObject *kwnames)
{
    PyObject *res;
    vectorcallfunc func;
    assert(kwnames == NULL || PyTuple_Check(kwnames));
    assert(args != NULL || PyVectorcall_NARGS(nargsf) == 0);
    /* 检查是否定义 Vectorcall 入口函数 */
    func = _PyVectorcall_Function(callable);
    if (func == NULL) {
        /* 普通函数调用协议 */
        Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
        return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
    }
    /* 支持 Vectorcall 函数调用协议 */
    res = func(callable, args, nargsf, kwnames);
    return _Py_CheckFunctionResult(callable, res, NULL);
}
```
首先是通过 `_PyVectorcall_Function` 判断当前被调用对象是否支持 Vectorcall 调用方式，若支持返回调用入口函数指针否则返回 `NULL`。具体就是检查类型的 `tp_flags` 的 `_Py_TPFLAGS_HAVE_VECTORCALL` 标志位是否为 `1`。
```c
/* object.h */
#define _Py_TPFLAGS_HAVE_VECTORCALL (1UL << 11)

/* cpython/abstract. */
static inline vectorcallfunc
_PyVectorcall_Function(PyObject *callable)
{
    PyTypeObject *tp = Py_TYPE(callable);
    Py_ssize_t offset = tp->tp_vectorcall_offset;
    vectorcallfunc ptr;
    if (!PyType_HasFeature(tp, _Py_TPFLAGS_HAVE_VECTORCALL)) {
        return NULL;
    }
    assert(PyCallable_Check(callable));
    assert(offset > 0);
    memcpy(&ptr, (char *) callable + offset, sizeof(ptr));
    return ptr;
}
```
若支持的话，直接 `func(callable, args, nargsf, kwnames)` 将栈指针传递到函数调用内，而不需要将参数打包和解包。若是常规函数调用，则需要为 `tp_call` 函数将 C 数组参数封装为 `tuple` 和 `dict` 对象。
```c
/* call.c */
PyObject *
_PyObject_MakeTpCall(PyObject *callable, PyObject *const *args, Py_ssize_t nargs, PyObject *keywords)
{
    /* Slow path: build a temporary tuple for positional arguments and a
     * temporary dictionary for keyword arguments (if any) */
    ternaryfunc call = Py_TYPE(callable)->tp_call;
    if (call == NULL) {
        PyErr_Format(PyExc_TypeError, "'%.200s' object is not callable",
                     Py_TYPE(callable)->tp_name);
        return NULL;
    }

    assert(nargs >= 0);
    assert(nargs == 0 || args != NULL);
    assert(keywords == NULL || PyTuple_Check(keywords) || PyDict_Check(keywords));
    /* 将栈内参数封装为 tuple 对象 */
    PyObject *argstuple = _PyTuple_FromArray(args, nargs);
    if (argstuple == NULL) {
        return NULL;
    }

    PyObject *kwdict;
    if (keywords == NULL || PyDict_Check(keywords)) {
        kwdict = keywords;
    }
    else {
        if (PyTuple_GET_SIZE(keywords)) {
            assert(args != NULL);
            /* 封装参数为 dict 对象 */
            kwdict = _PyStack_AsDict(args + nargs, keywords);
            if (kwdict == NULL) {
                Py_DECREF(argstuple);
                return NULL;
            }
        }
        else {
            keywords = kwdict = NULL;
        }
    }

    PyObject *result = NULL;
    if (Py_EnterRecursiveCall(" while calling a Python object") == 0)
    {
        result = call(callable, argstuple, kwdict);
        Py_LeaveRecursiveCall();
    }

    Py_DECREF(argstuple);
    if (kwdict != keywords) {
        Py_DECREF(kwdict);
    }

    result = _Py_CheckFunctionResult(callable, result, NULL);
    return result;
}

PyObject *
_PyStack_AsDict(PyObject *const *values, PyObject *kwnames)
{
    Py_ssize_t nkwargs;
    PyObject *kwdict;
    Py_ssize_t i;

    assert(kwnames != NULL);
    nkwargs = PyTuple_GET_SIZE(kwnames);
    kwdict = _PyDict_NewPresized(nkwargs);
    if (kwdict == NULL) {
        return NULL;
    }

    for (i = 0; i < nkwargs; i++) {
        PyObject *key = PyTuple_GET_ITEM(kwnames, i);
        PyObject *value = *values++;
        /* If key already exists, replace it with the new value */
        if (PyDict_SetItem(kwdict, key, value)) {
            Py_DECREF(kwdict);
            return NULL;
        }
    }
    return kwdict;
}

/* tupleobject.c */
PyObject *
_PyTuple_FromArray(PyObject *const *src, Py_ssize_t n)
{
    PyTupleObject *tuple = (PyTupleObject *)PyTuple_New(n);
    if (tuple == NULL) {
        return NULL;
    }
    PyObject **dst = tuple->ob_item;
    for (Py_ssize_t i = 0; i < n; i++) {
        PyObject *item = src[i];
        Py_INCREF(item);
        dst[i] = item;
    }
    return (PyObject *)tuple;
}
```

## 附：实例方法的调用机制
在 Python 调用实例方法通过 `LOAD_METHOD` 和 `CALL_METHOD` 实现。`LOAD_METHOD` 负责从实例上找到被调用方法对象，然后将方法对象和自身（self）压入栈中。正常情况下，`CALL_METHOD` 类似于 `CALL_FUNCION`，通过 `call_function` 进行方法调用。
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
            case TARGET(LOAD_METHOD): {
                /* Designed to work in tandem with CALL_METHOD. */
                PyObject *name = GETITEM(names, oparg);
                PyObject *obj = TOP();
                PyObject *meth = NULL;

                /* 类似进行 obj.name */
                int meth_found = _PyObject_GetMethod(obj, name, &meth);

                if (meth == NULL) {
                    /* Most likely attribute wasn't found. */
                    goto error;
                }
                
                /* 将 self 和方法压栈 */
                if (meth_found) {
                    /* We can bypass temporary bound method object.
                    meth is unbound method and obj is self.

                    meth | self | arg1 | ... | argN
                    */
                    SET_TOP(meth);
                    PUSH(obj);  // self
                }
                else {
                    /* meth is not an unbound method (but a regular attr, or
                    something was returned by a descriptor protocol).  Set
                    the second element of the stack to NULL, to signal
                    CALL_METHOD that it's not a method call.

                    NULL | meth | arg1 | ... | argN
                    */
                    SET_TOP(NULL);
                    Py_DECREF(obj);
                    PUSH(meth);
                }
                DISPATCH();
            }
        }

        case TARGET(CALL_METHOD): {
            /* Designed to work in tamdem with LOAD_METHOD. */
            PyObject **sp, *res, *meth;

            sp = stack_pointer;

            meth = PEEK(oparg + 2);
            if (meth == NULL) {
                /* `meth` is NULL when LOAD_METHOD thinks that it's not
                   a method call.

                   Stack layout:

                       ... | NULL | callable | arg1 | ... | argN
                                                            ^- TOP()
                                               ^- (-oparg)
                                    ^- (-oparg-1)
                             ^- (-oparg-2)

                   `callable` will be POPed by call_function.
                   NULL will will be POPed manually later.
                */
                res = call_function(tstate, &sp, oparg, NULL);
                stack_pointer = sp;
                (void)POP(); /* POP the NULL. */
            }
            /* 类似 CALL_FUNCTION 进行方法调用 */
            else {
                /* This is a method call.  Stack layout:

                     ... | method | self | arg1 | ... | argN
                                                        ^- TOP()
                                           ^- (-oparg)
                                    ^- (-oparg-1)
                           ^- (-oparg-2)

                  `self` and `method` will be POPed by call_function.
                  We'll be passing `oparg + 1` to call_function, to
                  make it accept the `self` as a first argument.
                */
                res = call_function(tstate, &sp, oparg + 1, NULL);
                stack_pointer = sp;
            }

            PUSH(res);
            if (res == NULL)
                goto error;
            DISPATCH();
        }
    }
}
```
通过 `call_function` 调用，由于方法对象是最先被压入栈的，表示该参数会被解析作为 `_PyObject_Vectorcall` 的 callable 参数。所以方法被调用的实现应当是 method 对象类型所指向的 `tp_call`。依据调用栈，最终的调用由 `_PyVectorcall_Function` 或 `_PyObject_MakeTpCall` 处理。
```c
/* classobject.h */
typedef struct {
    PyObject_HEAD
    PyObject *im_func;   /* The callable object implementing the method */
    PyObject *im_self;   /* The instance it is bound to */
    PyObject *im_weakreflist; /* List of weak references */
    vectorcallfunc vectorcall;
} PyMethodObject;

/* classobject.c */
PyTypeObject PyMethod_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "method",
    offsetof(PyMethodObject, vectorcall),       /* tp_vectorcall_offset */
    method_call,                                /* tp_call */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL,                /* tp_flags */
}

static PyObject *
method_call(PyObject *method, PyObject *args, PyObject *kwargs)
{
    PyObject *self, *func;

    self = PyMethod_GET_SELF(method);
    func = PyMethod_GET_FUNCTION(method);
    
    /* 从 PyMethodObject 获取 self 对象，作为第一个参数传入 */
    return _PyObject_Call_Prepend(func, self, args, kwargs);
}

/* call.c */
PyObject *
_PyObject_Call_Prepend(PyObject *callable,
                       PyObject *obj, PyObject *args, PyObject *kwargs)
{
    PyObject *small_stack[_PY_FASTCALL_SMALL_STACK];
    PyObject **stack;
    Py_ssize_t argcount;
    PyObject *result;

    result = _PyObject_FastCallDict(callable,
                                    stack, argcount + 1,
                                    kwargs);
    return result;
}

PyObject *
_PyObject_FastCallDict(PyObject *callable, PyObject *const *args,
                       size_t nargsf, PyObject *kwargs)
{
    vectorcallfunc func = _PyVectorcall_Function(callable);
    if (func == NULL) {
        /* Use tp_call instead */
        return _PyObject_MakeTpCall(callable, args, nargs, kwargs);
    }

    PyObject *res;
    if (kwargs == NULL) {
        res = func(callable, args, nargsf, NULL);
    }
    else {
        PyObject *kwnames;
        PyObject *const *newargs;
        if (_PyStack_UnpackDict(args, nargs, kwargs, &newargs, &kwnames) < 0) {
            return NULL;
        }
        res = func(callable, newargs, nargs, kwnames);
        if (kwnames != NULL) {
            Py_ssize_t i, n = PyTuple_GET_SIZE(kwnames) + nargs;
            for (i = 0; i < n; i++) {
                Py_DECREF(newargs[i]);
            }
            PyMem_Free((PyObject **)newargs);
            Py_DECREF(kwnames);
        }
    }
    return _Py_CheckFunctionResult(callable, res, NULL);
}
```