### 普通方法

在类中定义的普通函数，对于实例而言表现为方法，其第一个参数 *self* 表示当前实例，方法调用时自动设置。从如下例子也可以看出，类 A 的成员 say_hello() 对象是 function 函数对象，当从其实例 A() 上访问时表现为 bound method 方法对象。这是因为 @@PyFunction_Type@@ 实现了 @@slot_tp_descr_get@@ 槽，再配合 @@object-member-getset@@ 机制，故表现为方法。

```python
class A:
    def say_hello(self=None):
        name = repr(A.say_hello)
        if self is not None:
            name = repr(getattr(self, "say_hello"))
        print(f"Hi, I'm {name}")

>>> A.say_hello()
Hi, I'm <function A.say_hello at 0x102e9df70>
>>> A().say_hello()
Hi, I'm <bound method A.say_hello of <__main__.A object at 0x102e57610>>
```

当实例对象获取其类型的函数成员时，先在其类型上找到函数成员对象，然后调用其 @@__get__@@ 方法（即 @@slot_tp_descr_get@@ 槽实现的方法）获取值返回，即 func_descr_get() 会将函数对象和当前实例对象封装到 PyMethodObject 中返回。注意到，方法类型 PyMethod_Type 实现了 @@tp_call@@ 以及 @@vectorcall@@，因此返回的方法对象允许类似函数对象进行调用。

```c
// Objects/funcobject.c#PyFunction_Type
PyTypeObject PyFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "function",
    sizeof(PyFunctionObject),
    0,
    ...
    func_descr_get,                             /* tp_descr_get */
    0,                                          /* tp_descr_set */
    ...
};

// Objects/funcobject.c#func_descr_get
static PyObject *
func_descr_get(PyObject *func, PyObject *obj, PyObject *type)
{
    if (obj == Py_None || obj == NULL) {
        Py_INCREF(func);
        return func;
    }
    return PyMethod_New(func, obj);
}

// Objects/classobject.c#PyMethod_New
PyObject *
PyMethod_New(PyObject *func, PyObject *self)
{
    PyMethodObject *im;
    if (self == NULL) {
        PyErr_BadInternalCall();
        return NULL;
    }
    im = free_list;
    if (im != NULL) {
        free_list = (PyMethodObject *)(im->im_self);
        (void)PyObject_INIT(im, &PyMethod_Type);
        numfree--;
    }
    else {
        im = PyObject_GC_New(PyMethodObject, &PyMethod_Type);
        if (im == NULL)
            return NULL;
    }
    im->im_weakreflist = NULL;
    Py_INCREF(func);
    im->im_func = func;
    Py_XINCREF(self);
    im->im_self = self;
    im->vectorcall = method_vectorcall;
    _PyObject_GC_TRACK(im);
    return (PyObject *)im;
}

// Include/classobject.h#PyMethodObject
typedef struct {
    PyObject_HEAD
    PyObject *im_func;   /* The callable object implementing the method */
    PyObject *im_self;   /* The instance it is bound to */
    PyObject *im_weakreflist; /* List of weak references */
    vectorcallfunc vectorcall;
} PyMethodObject;

// Objects/classobject.c#PyMethod_New
PyTypeObject PyMethod_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "method",
    sizeof(PyMethodObject),
    0,
    (destructor)method_dealloc,                 /* tp_dealloc */
    offsetof(PyMethodObject, vectorcall),       /* tp_vectorcall_offset */
    ...
    method_call,                                /* tp_call */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL,                /* tp_flags */
    ...
};
```

依据 @@function-invocation@@，由于方法类型支持 @@vectorcall@@，那么当方法对象被调用时优先采用该方式执行函数体。从 method_vectorcall() 的实现可以看出，

* 与函数对象调用的不同之处在于需将 PyMethodObject 中存储的 *im_self* 对象置于调用参数的第一个，即自动的 *self* 参数传递。相同之处在于都由 _PyObject_Vectorcall() 执行实际的函数对象 *im_func*。

* 若参数个数中存在 @@PY_VECTORCALL_ARGUMENTS_OFFSET@@ 标记，表明参数数组的 `args[-1]` 位置可临时使用。那么可直接将 *im_self* 对象置于该位置，调用结束后再恢复即可。否则可能需要创建新的参数数组，即将 *im_self* 置于新数组的第一个位置，其它参数相应拷贝即可。基于 Python 语法创建的函数对象默认支持第一种设置参数方式，C 层面实现的可调用对象不一定支持。

```c
// Objects/classobject.c#method_vectorcall
static PyObject *
method_vectorcall(PyObject *method, PyObject *const *args,
                  size_t nargsf, PyObject *kwnames)
{
    assert(Py_TYPE(method) == &PyMethod_Type);
    PyObject *self, *func, *result;
    self = PyMethod_GET_SELF(method);
    func = PyMethod_GET_FUNCTION(method);
    Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);

    if (nargsf & PY_VECTORCALL_ARGUMENTS_OFFSET) {
        /* PY_VECTORCALL_ARGUMENTS_OFFSET is set, so we are allowed to mutate the vector */
        PyObject **newargs = (PyObject**)args - 1;
        nargs += 1;
        PyObject *tmp = newargs[0];
        newargs[0] = self;
        result = _PyObject_Vectorcall(func, newargs, nargs, kwnames);
        newargs[0] = tmp;
    }
    else {
        Py_ssize_t nkwargs = (kwnames == NULL) ? 0 : PyTuple_GET_SIZE(kwnames);
        Py_ssize_t totalargs = nargs + nkwargs;
        if (totalargs == 0) {
            return _PyObject_Vectorcall(func, &self, 1, NULL);
        }

        PyObject *newargs_stack[_PY_FASTCALL_SMALL_STACK];
        PyObject **newargs;
        if (totalargs <= (Py_ssize_t)Py_ARRAY_LENGTH(newargs_stack) - 1) {
            newargs = newargs_stack;
        }
        else {
            newargs = PyMem_Malloc((totalargs+1) * sizeof(PyObject *));
            if (newargs == NULL) {
                PyErr_NoMemory();
                return NULL;
            }
        }
        /* use borrowed references */
        newargs[0] = self;
        /* bpo-37138: since totalargs > 0, it's impossible that args is NULL.
         * We need this, since calling memcpy() with a NULL pointer is
         * undefined behaviour. */
        assert(args != NULL);
        memcpy(newargs + 1, args, totalargs * sizeof(PyObject *));
        result = _PyObject_Vectorcall(func, newargs, nargs+1, kwnames);
        if (newargs != newargs_stack) {
            PyMem_Free(newargs);
        }
    }
    return result;
}
```
