### 异常对象

类似传统错误处理中的错误消息结构体，异常对象是一类用于现代异常处理机制中记录程序运行时错误消息的对象，允许被捕获或继续传播。具体实现上，使用 @@Py_TPFLAGS_BASE_EXC_SUBCLASS@@ 类型标志位识别异常对象。一般来说，期望异常对象拥有如下特性：

* 具有如 \_\_context__ 和 \_\_cause__ 等异常上下文属性，用于记录在处理一个异常期间又引发新异常的情况。

* 具有如 \_\_traceback__ 的异常回溯属性，用于记录异常发生处的调用栈等信息。

* 可通过如 exctype()、exctype(obj) 和 exctype(obj1, obj2, ...) 等方式构建异常对象。

基于期望特性以及便于区分不同事件导致不同异常的目的，CPython 采用先由 @@BaseException@@ 实现异常对象共有的特性，再从其派生出具体异常的方式实现内置异常。依据不同目的，实现了如下 @@exception-hierarchy@@：

```text
BaseException
 ├── SystemExit
 ├── KeyboardInterrupt
 ├── GeneratorExit
 └── Exception
      ├── StopIteration
      ├── StopAsyncIteration
      ├── ArithmeticError
      |    ├── FloatingPointError
      |    ├── OverflowError
      |    └── ZeroDivisionError
      ├── AssertionError
      ├── AttributeError
      ├── BufferError
      ├── EOFError
      ├── ImportError
      |    └── ModuleNotFoundError
      ├── LookupError
      |    ├── IndexError
      |    └── KeyError
      ├── MemoryError
      ├── NameError
      |    └── UnboundLocalError
      ├── OSError
      |    ├── BlockingIOError
      |    ├── ChildProcessError
      |    └── ConnectionError
      |    |    ├── BrokenPipeError
      |    |    ├── ConnectionAbortedError
      |    |    ├── ConnectionRefusedError
      |    |    └── ConnectionResetError
      |    ├── FileExistsError
      |    ├── FileNotFoundError
      |    ├── InterruptedError
      |    ├── IsADirectoryError
      |    ├── NotADirectoryError
      |    ├── PermissionError
      |    ├── ProcessLookupError
      |    └── TimeoutError
      ├── ReferenceError
      ├── RuntimeError
      |    ├── NotImplementedError
      |    └── RecursionError
      ├── SyntaxError
      |    └── IndentationError
      |         └── TabError
      ├── SystemError
      ├── TypeError
      ├── ValueError
      |    └── UnicodeError
      |         ├── UnicodeDecodeError
      |         ├── UnicodeEncodeError
      |         └── UnicodeTranslateError
      └── Warning
           ├── DeprecationWarning
           ├── PendingDeprecationWarning
           ├── RuntimeWarning
           ├── SyntaxWarning
           ├── UserWarning
           ├── FutureWarning
           ├── ImportWarning
           ├── UnicodeWarning
           ├── BytesWarning
           └── ResourceWarning
```

异常对象 PyXXXExceptionObject 采用 PyException_HEAD 实现共有的成员，并允许继续扩展异常专属字段。

```c
// Include/cpython/pyerrors.h#PyException_HEAD
/* PyException_HEAD defines the initial segment of every exception class. */
#define PyException_HEAD PyObject_HEAD PyObject *dict;\
             PyObject *args; PyObject *traceback;\
             PyObject *context; PyObject *cause;\
             char suppress_context;

// Include/cpython/pyerrors.h#PyBaseExceptionObject
typedef struct {
    PyException_HEAD
} PyBaseExceptionObject;

// Include/cpython/pyerrors.h#PyStopIterationObject
typedef struct {
    PyException_HEAD
    PyObject *value;
} PyStopIterationObject;
```

异常类型 PyExc_XXXException 从 @@BaseException@@ 类型的实现进行扩展，即采用 XXXExtendsException 宏派生出子类异常。

```c
// Objects/exceptions.c#_PyExc_BaseException
static PyTypeObject _PyExc_BaseException = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "BaseException", /*tp_name*/
    sizeof(PyBaseExceptionObject), /*tp_basicsize*/
    0,                          /*tp_itemsize*/
    (destructor)BaseException_dealloc, /*tp_dealloc*/
    0,                          /*tp_vectorcall_offset*/
    0,                          /*tp_getattr*/
    0,                          /*tp_setattr*/
    0,                          /*tp_as_async*/
    (reprfunc)BaseException_repr, /*tp_repr*/
    0,                          /*tp_as_number*/
    0,                          /*tp_as_sequence*/
    0,                          /*tp_as_mapping*/
    0,                          /*tp_hash */
    0,                          /*tp_call*/
    (reprfunc)BaseException_str,  /*tp_str*/
    PyObject_GenericGetAttr,    /*tp_getattro*/
    PyObject_GenericSetAttr,    /*tp_setattro*/
    0,                          /*tp_as_buffer*/
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC |
        Py_TPFLAGS_BASE_EXC_SUBCLASS,  /*tp_flags*/
    PyDoc_STR("Common base class for all exceptions"), /* tp_doc */
    (traverseproc)BaseException_traverse, /* tp_traverse */
    (inquiry)BaseException_clear, /* tp_clear */
    0,                          /* tp_richcompare */
    0,                          /* tp_weaklistoffset */
    0,                          /* tp_iter */
    0,                          /* tp_iternext */
    BaseException_methods,      /* tp_methods */
    BaseException_members,      /* tp_members */
    BaseException_getset,       /* tp_getset */
    0,                          /* tp_base */
    0,                          /* tp_dict */
    0,                          /* tp_descr_get */
    0,                          /* tp_descr_set */
    offsetof(PyBaseExceptionObject, dict), /* tp_dictoffset */
    (initproc)BaseException_init, /* tp_init */
    0,                          /* tp_alloc */
    BaseException_new,          /* tp_new */
};

// Objects/exceptions.c#SimpleExtendsException
#define SimpleExtendsException(EXCBASE, EXCNAME, EXCDOC) \
static PyTypeObject _PyExc_ ## EXCNAME = { \
    PyVarObject_HEAD_INIT(NULL, 0) \
    # EXCNAME, \
    sizeof(PyBaseExceptionObject), \
    0, (destructor)BaseException_dealloc, 0, 0, 0, 0, 0, 0, 0, \
    0, 0, 0, 0, 0, 0, 0, \
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC, \
    PyDoc_STR(EXCDOC), (traverseproc)BaseException_traverse, \
    (inquiry)BaseException_clear, 0, 0, 0, 0, 0, 0, 0, &_ ## EXCBASE, \
    0, 0, 0, offsetof(PyBaseExceptionObject, dict), \
    (initproc)BaseException_init, 0, BaseException_new,\
}; \
PyObject *PyExc_ ## EXCNAME = (PyObject *)&_PyExc_ ## EXCNAME

// Objects/exceptions.c#MiddlingExtendsException
#define MiddlingExtendsException(EXCBASE, EXCNAME, EXCSTORE, EXCDOC) ...
// Objects/exceptions.c#ComplexExtendsException
#define ComplexExtendsException(EXCBASE, EXCNAME, EXCSTORE, EXCNEW, \
                                EXCMETHODS, EXCMEMBERS, EXCGETSET, \
                                EXCSTR, EXCDOC) ...

// Objects/exceptions.c#PyExc_ExceptionException
SimpleExtendsException(PyExc_BaseException, Exception,
                       "Common base class for all non-exit exceptions.");
```

注意到，XXXExtendsException 宏派生的异常没有设置 @@Py_TPFLAGS_BASE_EXC_SUBCLASS@@ 标记，其在 Python 初始化期间，自动调用 _PyExc_Init()，然后 @@CAPI_PyType_Ready@@ 各异常类型时从父类继承。另外，builtins 模块初始化时，会自动调用 _PyBuiltins_AddExceptions() 将内置异常类型暴露给用户。

```c
// Objects/exceptions.c#errnomap
/* The dict map from errno codes to OSError subclasses */
static PyObject *errnomap = NULL;

// Objects/exceptions.c#_PyExc_Init
PyStatus
_PyExc_Init(void)
{
#define PRE_INIT(TYPE) \
    if (!(_PyExc_ ## TYPE.tp_flags & Py_TPFLAGS_READY)) { \
        if (PyType_Ready(&_PyExc_ ## TYPE) < 0) { \
            return _PyStatus_ERR("exceptions bootstrapping error."); \
        } \
        Py_INCREF(PyExc_ ## TYPE); \
    }

#define ADD_ERRNO(TYPE, CODE) \
    do { \
        PyObject *_code = PyLong_FromLong(CODE); \
        assert(_PyObject_RealIsSubclass(PyExc_ ## TYPE, PyExc_OSError)); \
        if (!_code || PyDict_SetItem(errnomap, _code, PyExc_ ## TYPE)) { \
            Py_XDECREF(_code); \
            return _PyStatus_ERR("errmap insertion problem."); \
        } \
        Py_DECREF(_code); \
    } while (0)

    PRE_INIT(BaseException);
    PRE_INIT(Exception);
    ...
    PRE_INIT(TimeoutError);

    if (preallocate_memerrors() < 0) {
        return _PyStatus_ERR("Could not preallocate MemoryError object");
    }

    /* Add exceptions to errnomap */
    if (!errnomap) {
        errnomap = PyDict_New();
        if (!errnomap) {
            return _PyStatus_ERR("Cannot allocate map from errnos to OSError subclasses");
        }
    }

    ADD_ERRNO(BlockingIOError, EAGAIN);
    ...
    ADD_ERRNO(TimeoutError, ETIMEDOUT);

    return _PyStatus_OK();

#undef PRE_INIT
#undef ADD_ERRNO
}

// Objects/exceptions.c#_PyBuiltins_AddExceptions
PyStatus
_PyBuiltins_AddExceptions(PyObject *bltinmod)
{
#define POST_INIT(TYPE) \
    if (PyDict_SetItemString(bdict, # TYPE, PyExc_ ## TYPE)) { \
        return _PyStatus_ERR("Module dictionary insertion problem."); \
    }

#define INIT_ALIAS(NAME, TYPE) \
    do { \
        Py_INCREF(PyExc_ ## TYPE); \
        Py_XDECREF(PyExc_ ## NAME); \
        PyExc_ ## NAME = PyExc_ ## TYPE; \
        if (PyDict_SetItemString(bdict, # NAME, PyExc_ ## NAME)) { \
            return _PyStatus_ERR("Module dictionary insertion problem."); \
        } \
    } while (0)

    PyObject *bdict;

    bdict = PyModule_GetDict(bltinmod);
    if (bdict == NULL) {
        return _PyStatus_ERR("exceptions bootstrapping error.");
    }

    POST_INIT(BaseException);
    POST_INIT(Exception);
    ...
    POST_INIT(TimeoutError);

    return _PyStatus_OK();

#undef POST_INIT
#undef INIT_ALIAS
}
```