## 可调用对象

除 function 类型对象外，如类型实现 @@tp_call@@ 或 @@vectorcall@@，其实例都允许进行调用，称为可调用对象。Python 中许多特性是在 C 层面实现的，需要将它们封装为 @@PyObject@@ 以允许被 Python 用户感知。对于可调用对象也类似，类型 @@slot_tp_methods@@ 声明的方法需封装为相应的描述器对象、类型的 tp_xxx 接口槽也需要封装为描述器对象以及允许 Python 层面访问的 C 函数也需要封装为 @@PyCFunction_Type@@ 类型对象。尽管不同于 function 类型对象，但对于 Python 用户而言，它们都是可调用的 Python 对象，即用户界面是一致的。

### 封装 tp_methods 的描述器

在类型创建期间，@@slot_tp_methods@@ 槽声明的 @@PyMethodDef@@ 数组元素会以不同的描述器对象暴露到类实例字典中。对于不同的方法类型，所创建的描述器对象也是不同的，即为类方法创建 @@PyClassMethodDescr_Type@@ 类型描述对象、为静态方法创建 @@staticmethod@@ 对象、为实例方法创建 @@PyMethodDescr_Type@@ 类型描述器对象。

```c
// Objects/typeobject.c#add_methods
static int
add_methods(PyTypeObject *type, PyMethodDef *meth)
{
    PyObject *dict = type->tp_dict;
    PyObject *name;

    for (; meth->ml_name != NULL; meth++) {
        PyObject *descr;
        int err;
        int isdescr = 1;
        // 类方法（类实例方法）
        if (meth->ml_flags & METH_CLASS) {
            if (meth->ml_flags & METH_STATIC) {
                PyErr_SetString(PyExc_ValueError,
                     "method cannot be both class and static");
                return -1;
            }
            // 类实例的描述器绑定的 cls 即调用类实例
            descr = PyDescr_NewClassMethod(type, meth);
        }
        // 静态方法
        else if (meth->ml_flags & METH_STATIC) {
            PyObject *cfunc = PyCFunction_NewEx(meth, (PyObject*)type, NULL);
            if (cfunc == NULL)
                return -1;
            // 建立描述器对象是保持 C 和 Python 的 __dict__ 感知一致性
            descr = PyStaticMethod_New(cfunc);
            isdescr = 0;  // PyStaticMethod is not PyDescrObject
            Py_DECREF(cfunc);
        }
        // 实例方法
        else {
            // 实例的描述器绑定的 self 即调用实例
            descr = PyDescr_NewMethod(type, meth);
        }
        if (descr == NULL)
            return -1;

        if (isdescr) {
            name = PyDescr_NAME(descr);
        }
        else {
            name = PyUnicode_FromString(meth->ml_name);
            if (name == NULL) {
                Py_DECREF(descr);
                return -1;
            }
        }

        // 冲突处理
        if (!(meth->ml_flags & METH_COEXIST)) {
            if (PyDict_GetItemWithError(dict, name)) {
                if (!isdescr) {
                    Py_DECREF(name);
                }
                Py_DECREF(descr);
                continue;
            }
            else if (PyErr_Occurred()) {
                if (!isdescr) {
                    Py_DECREF(name);
                }
                return -1;
            }
        }
        err = PyDict_SetItem(dict, name, descr);
        if (!isdescr) {
            Py_DECREF(name);
        }
        Py_DECREF(descr);
        if (err < 0)
            return -1;
    }
    return 0;
}
```

1. 对于类方法，将其 @@PyMethodDef@@ 封装到 PyMethodDescrObject 对象中。该对象允许两种方式调用，

    * 当从元类上访问类方法成员，返回的是描述器对象本身。此时描述器对象表现为普通函数，即需要手动传递第一个位置的 *cls* 参数，然后由 _PyMethodDef_RawFastCallDict() 执行 @@PyMethodDef@@ 声明函数。

    * 当从类上或其实例上访问类方法成员，返回的都是 @@PyCFunction_Type@@ 类型对象，其封装 @@PyMethodDef@@ 声明的 C 函数，允许被直接调用。注意到，在类方法调用时 @@CAPI_PyCFunction_NewEx@@ 接口中的 *self* 参数会自动传递到类方法的第一个参数。

```c
// Objects/descrobject.c#PyDescr_NewClassMethod
PyObject *
PyDescr_NewClassMethod(PyTypeObject *type, PyMethodDef *method)
{
    PyMethodDescrObject *descr;

    descr = (PyMethodDescrObject *)descr_new(&PyClassMethodDescr_Type,
                                             type, method->ml_name);
    if (descr != NULL)
        descr->d_method = method;
    return (PyObject *)descr;
}

// Include/descrobject.h#PyMethodDescrObject
typedef struct {
    PyDescr_COMMON;
    PyMethodDef *d_method;
    vectorcallfunc vectorcall;
} PyMethodDescrObject;

// Include/descrobject.h#PyDescrObject
typedef struct {
    PyObject_HEAD
    PyTypeObject *d_type;
    PyObject *d_name;
    PyObject *d_qualname;
} PyDescrObject;

// Include/descrobject.h#PyDescr_COMMON
#define PyDescr_COMMON PyDescrObject d_common

// Objects/descrobject.c#descr_new
static PyDescrObject *
descr_new(PyTypeObject *descrtype, PyTypeObject *type, const char *name)
{
    PyDescrObject *descr;

    descr = (PyDescrObject *)PyType_GenericAlloc(descrtype, 0);
    if (descr != NULL) {
        Py_XINCREF(type);
        descr->d_type = type;
        descr->d_name = PyUnicode_InternFromString(name);
        if (descr->d_name == NULL) {
            Py_DECREF(descr);
            descr = NULL;
        }
        else {
            descr->d_qualname = NULL;
        }
    }
    return descr;
}

// Objects/descrobject.c#PyClassMethodDescr_Type
PyTypeObject PyClassMethodDescr_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "classmethod_descriptor",
    sizeof(PyMethodDescrObject),
    0,
    ...
    (ternaryfunc)classmethoddescr_call,         /* tp_call */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC, /* tp_flags */
    ...
    (descrgetfunc)classmethod_get,              /* tp_descr_get */
    0,                                          /* tp_descr_set */
};

// Objects/descrobject.c#classmethoddescr_call
static PyObject *
classmethoddescr_call(PyMethodDescrObject *descr, PyObject *args,
                      PyObject *kwds)
{
    Py_ssize_t argc;
    PyObject *self, *result;

    /* Make sure that the first argument is acceptable as 'self' */
    assert(PyTuple_Check(args));
    argc = PyTuple_GET_SIZE(args);
    if (argc < 1) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' of '%.100s' "
                     "object needs an argument",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name);
        return NULL;
    }
    self = PyTuple_GET_ITEM(args, 0);
    if (!PyType_Check(self)) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' requires a type "
                     "but received a '%.100s' instance",
                     descr_name((PyDescrObject *)descr), "?",
                     self->ob_type->tp_name);
        return NULL;
    }
    if (!PyType_IsSubtype((PyTypeObject *)self, PyDescr_TYPE(descr))) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' requires a subtype of '%.100s' "
                     "but received '%.100s'",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name,
                     ((PyTypeObject*)self)->tp_name);
        return NULL;
    }

    result = _PyMethodDef_RawFastCallDict(descr->d_method, self,
                                          &_PyTuple_ITEMS(args)[1], argc - 1,
                                          kwds);
    result = _Py_CheckFunctionResult((PyObject *)descr, result, NULL);
    return result;
}

// Objects/descrobject.c#classmethod_get
static PyObject *
classmethod_get(PyMethodDescrObject *descr, PyObject *obj, PyObject *type)
{
    /* Ensure a valid type.  Class methods ignore obj. */
    if (type == NULL) {
        if (obj != NULL)
            type = (PyObject *)obj->ob_type;
        else {
            /* Wot - no type?! */
            PyErr_Format(PyExc_TypeError,
                         "descriptor '%V' for type '%.100s' "
                         "needs either an object or a type",
                         descr_name((PyDescrObject *)descr), "?",
                         PyDescr_TYPE(descr)->tp_name);
            return NULL;
        }
    }
    if (!PyType_Check(type)) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' for type '%.100s' "
                     "needs a type, not a '%.100s' as arg 2",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name,
                     type->ob_type->tp_name);
        return NULL;
    }
    if (!PyType_IsSubtype((PyTypeObject *)type, PyDescr_TYPE(descr))) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' requires a subtype of '%.100s' "
                     "but received '%.100s'",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name,
                     ((PyTypeObject *)type)->tp_name);
        return NULL;
    }
    return PyCFunction_NewEx(descr->d_method, type, NULL);
}
```

* @@PyMethodDef@@ 中声明了 C 函数 *ml_meth*，允许被调用。如 _PyMethodDef_RawFastCallDict() 在调用时，会依据不同的参数标记进行参数传递，

    * @@METH_NOARGS@@ 表明无需参数，默认给 @@PyCFunction@@ 函数指针的第二个参数传递 *NULL*。

    * @@METH_O@@ 表明第二个参数为 @@PyObject@@ 对象，直接传递即可。

    * @@METH_VARARGS@@ 表明需将位置传参打包为元组对象再传递，而 @@METH_KEYWORDS@@ 则表明需接收第三个关键字字典参数，二者可以同时有效。

    * @@METH_FASTCALL@@ 表明接收 @@vectorcall@@ 参数形式，即无需打包。当 @@METH_KEYWORDS@@ 也有效时需将关键字字典解包后再传递。

```c
// Include/methodobject.h#PyMethodDef
struct PyMethodDef {
    const char  *ml_name;   /* The name of the built-in function/method */
    PyCFunction ml_meth;    /* The C function that implements it */
    int         ml_flags;   /* Combination of METH_xxx flags, which mostly
                               describe the args expected by the C func */
    const char  *ml_doc;    /* The __doc__ attribute, or NULL */
};
typedef struct PyMethodDef PyMethodDef;

// Objects/call.c#_PyMethodDef_RawFastCallDict
PyObject *
_PyMethodDef_RawFastCallDict(PyMethodDef *method, PyObject *self,
                             PyObject *const *args, Py_ssize_t nargs,
                             PyObject *kwargs)
{
    /* _PyMethodDef_RawFastCallDict() must not be called with an exception set,
       because it can clear it (directly or indirectly) and so the
       caller loses its exception */
    assert(!PyErr_Occurred());

    assert(method != NULL);
    assert(nargs >= 0);
    assert(nargs == 0 || args != NULL);
    assert(kwargs == NULL || PyDict_Check(kwargs));

    PyCFunction meth = method->ml_meth;
    int flags = method->ml_flags & ~(METH_CLASS | METH_STATIC | METH_COEXIST);
    PyObject *result = NULL;

    if (Py_EnterRecursiveCall(" while calling a Python object")) {
        return NULL;
    }

    switch (flags)  // 参数解析
    {
    case METH_NOARGS:  // 无参
        if (kwargs != NULL && PyDict_GET_SIZE(kwargs) != 0) {
            goto no_keyword_error;
        }

        if (nargs != 0) {
            PyErr_Format(PyExc_TypeError,
                "%.200s() takes no arguments (%zd given)",
                method->ml_name, nargs);
            goto exit;
        }

        result = (*meth) (self, NULL);
        break;

    case METH_O:  // 参数为 PyObject
        if (kwargs != NULL && PyDict_GET_SIZE(kwargs) != 0) {
            goto no_keyword_error;
        }

        if (nargs != 1) {
            PyErr_Format(PyExc_TypeError,
                "%.200s() takes exactly one argument (%zd given)",
                method->ml_name, nargs);
            goto exit;
        }

        result = (*meth) (self, args[0]);
        break;

    case METH_VARARGS:  // 参数为 PyTupleObject
        if (kwargs != NULL && PyDict_GET_SIZE(kwargs) != 0) {
            goto no_keyword_error;
        }
        /* fall through */

    case METH_VARARGS | METH_KEYWORDS:  // 参数中具有关键字参数
    {
        /* Slow-path: create a temporary tuple for positional arguments */
        PyObject *argstuple = _PyTuple_FromArray(args, nargs);
        if (argstuple == NULL) {
            goto exit;
        }

        if (flags & METH_KEYWORDS) {
            result = (*(PyCFunctionWithKeywords)(void(*)(void))meth) (self, argstuple, kwargs);
        }
        else {
            result = (*meth) (self, argstuple);
        }
        Py_DECREF(argstuple);
        break;
    }

    case METH_FASTCALL:  // 无需封装参数也没有关键字参数
    {
        if (kwargs != NULL && PyDict_GET_SIZE(kwargs) != 0) {
            goto no_keyword_error;
        }

        result = (*(_PyCFunctionFast)(void(*)(void))meth) (self, args, nargs);
        break;
    }

    case METH_FASTCALL | METH_KEYWORDS:  // 无需封装参数但有关键字参数
    {
        PyObject *const *stack;
        PyObject *kwnames;
        _PyCFunctionFastWithKeywords fastmeth = (_PyCFunctionFastWithKeywords)(void(*)(void))meth;

        // 解包参数，将关键字参数值放到 stack 后面，键放到 kwnames
        if (_PyStack_UnpackDict(args, nargs, kwargs, &stack, &kwnames) < 0) {
            goto exit;
        }

        result = (*fastmeth) (self, stack, nargs, kwnames);
        if (kwnames != NULL) {
            Py_ssize_t i, n = nargs + PyTuple_GET_SIZE(kwnames);
            for (i = 0; i < n; i++) {
                Py_DECREF(stack[i]);
            }
            PyMem_Free((PyObject **)stack);
            Py_DECREF(kwnames);
        }
        break;
    }

    default:
        PyErr_SetString(PyExc_SystemError,
                        "Bad call flags in _PyMethodDef_RawFastCallDict. "
                        "METH_OLDARGS is no longer supported!");
        goto exit;
    }

    goto exit;

no_keyword_error:
    PyErr_Format(PyExc_TypeError,
                 "%.200s() takes no keyword arguments",
                 method->ml_name);

exit:
    Py_LeaveRecursiveCall();
    return result;
}
```

2. 对于静态方法，采用 @@PyStaticMethod_Type@@ 类型描述器对象来封装实际的可调用对象。结合 @@class-member-getattro@@ 机制，在实例或类型上获取静态方法时，自动调用其 @@__get__@@ 方法返回封装的可调用对象。对于 @@PyMethodDef@@ 声明的方法，会先构建 @@PyCFunction_Type@@ 类型对象，然后再由 staticmethod 对象对其封装。另外，采用 `@staticmethod` 包装 function 类型对象声明静态方法的机制与此相同。

```c
// Objects/funcobject.c#PyStaticMethod_New
PyObject *
PyStaticMethod_New(PyObject *callable)
{
    staticmethod *sm = (staticmethod *)
        PyType_GenericAlloc(&PyStaticMethod_Type, 0);
    if (sm != NULL) {
        Py_INCREF(callable);
        sm->sm_callable = callable;
    }
    return (PyObject *)sm;
}

// Objects/funcobject.c#staticmethod
typedef struct {
    PyObject_HEAD
    PyObject *sm_callable;
    PyObject *sm_dict;
} staticmethod;

// Objects/funcobject.c#PyStaticMethod_Type
PyTypeObject PyStaticMethod_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "staticmethod",
    sizeof(staticmethod),
    0,
    ...
    sm_descr_get,                               /* tp_descr_get */
    0,                                          /* tp_descr_set */
    ...
};

// Objects/funcobject.c#sm_descr_get
static PyObject *
sm_descr_get(PyObject *self, PyObject *obj, PyObject *type)
{
    staticmethod *sm = (staticmethod *)self;

    if (sm->sm_callable == NULL) {
        PyErr_SetString(PyExc_RuntimeError,
                        "uninitialized staticmethod object");
        return NULL;
    }
    Py_INCREF(sm->sm_callable);
    return sm->sm_callable;
}
```

3. 对于实例方法，与类方法类似，都由 PyMethodDescrObject 对象对 @@PyMethodDef@@ 进行封装。类似地，其调用方式也有两种，

    * 当直接从类对象上获取实例方法，那么返回的是描述器对象本身，因为此时没有关联具体实例。描述器对象本身是可以调用的，但需要手动传递 *self* 参数，由于 @@PyMethodDescr_Type@@ 实现了 @@vectorcall@@，调用时则由 PyMethodDescrObject 对象的 *vectorcall* 实现负责。创建该对象时，会依据不同的参数标记类型，为 *vectorcall* 设置相应的包装函数，即负责将 @@vectorcall@@ 参数转换为 @@PyMethodDef@@ 声明函数能接收的类型后再调用。注意到，类方法没有实现 @@vectorcall@@，但是实例方法实现了，因为直接访问到类方法描述对象的几率很小（即 `cls.__dict__["classmethod"]` 访问），但直接访问到实例方法描述器对象本身的机会很多。

    * 当从实例对象上获取实例方法时，与类方法类似，会将方法声明 @@PyMethodDef@@ 和当前实例封装到 @@PyCFunction_Type@@ 类型对象返回，后续则不需要手动传递 *self* 参数。

```c
// Objects/funcobject.c#PyDescr_NewMethod
PyObject *
PyDescr_NewMethod(PyTypeObject *type, PyMethodDef *method)
{
    /* Figure out correct vectorcall function to use */
    vectorcallfunc vectorcall;
    switch (method->ml_flags & (METH_VARARGS | METH_FASTCALL | METH_NOARGS | METH_O | METH_KEYWORDS))
    {
        case METH_VARARGS:
            vectorcall = method_vectorcall_VARARGS;
            break;
        case METH_VARARGS | METH_KEYWORDS:
            vectorcall = method_vectorcall_VARARGS_KEYWORDS;
            break;
        case METH_FASTCALL:
            vectorcall = method_vectorcall_FASTCALL;
            break;
        case METH_FASTCALL | METH_KEYWORDS:
            vectorcall = method_vectorcall_FASTCALL_KEYWORDS;
            break;
        case METH_NOARGS:
            vectorcall = method_vectorcall_NOARGS;
            break;
        case METH_O:
            vectorcall = method_vectorcall_O;
            break;
        default:
            PyErr_Format(PyExc_SystemError,
                         "%s() method: bad call flags", method->ml_name);
            return NULL;
    }

    PyMethodDescrObject *descr;

    descr = (PyMethodDescrObject *)descr_new(&PyMethodDescr_Type,
                                             type, method->ml_name);
    if (descr != NULL) {
        descr->d_method = method;
        descr->vectorcall = vectorcall;
    }
    return (PyObject *)descr;
}

// Objects/funcobject.c#PyMethodDescr_Type
PyTypeObject PyMethodDescr_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "method_descriptor",
    sizeof(PyMethodDescrObject),
    0,
    ...
    PyVectorcall_Call,                          /* tp_call */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL |
    Py_TPFLAGS_METHOD_DESCRIPTOR,               /* tp_flags */
    ...
    (descrgetfunc)method_get,                   /* tp_descr_get */
    0,                                          /* tp_descr_set */
};

// Objects/funcobject.c#method_get
static PyObject *
method_get(PyMethodDescrObject *descr, PyObject *obj, PyObject *type)
{
    PyObject *res;

    if (descr_check((PyDescrObject *)descr, obj, &res))
        return res;
    return PyCFunction_NewEx(descr->d_method, obj, NULL);
}

// Objects/funcobject.c#method_vectorcall_VARARGS_KEYWORDS
static PyObject *
method_vectorcall_VARARGS_KEYWORDS(
    PyObject *func, PyObject *const *args, size_t nargsf, PyObject *kwnames)
{
    Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
    if (method_check_args(func, args, nargs, NULL)) {
        return NULL;
    }
    PyObject *argstuple = _PyTuple_FromArray(args+1, nargs-1);
    if (argstuple == NULL) {
        return NULL;
    }
    PyObject *result = NULL;
    /* Create a temporary dict for keyword arguments */
    PyObject *kwdict = NULL;
    if (kwnames != NULL && PyTuple_GET_SIZE(kwnames) > 0) {
        kwdict = _PyStack_AsDict(args + nargs, kwnames);
        if (kwdict == NULL) {
            goto exit;
        }
    }
    PyCFunctionWithKeywords meth = (PyCFunctionWithKeywords)
                                   method_enter_call(func);
    if (meth == NULL) {
        goto exit;
    }
    result = meth(args[0], argstuple, kwdict);
    Py_LeaveRecursiveCall();
exit:
    Py_DECREF(argstuple);
    Py_XDECREF(kwdict);
    return result;
}
```

### 封装 tp_xxx 接口槽的描述器

对于通用类型的接口，类型对象为其提供了 C 槽以便于快速访问。与 @@slot_tp_methods@@ 声明的方法类似，也需要将槽实现的 C 函数封装为描述器对象后暴露到类实例字典中。与封装实例方法的描述器类似，槽描述器对象也支持两种调用方式，

* 对于直接调用描述器对象本身，由于未绑定实例对象，需要手动传递 *self* 参数。在实际调用时，参数的转换由槽声明的 *wrapper* 函数实现，实际调用的函数是类型创建是槽实现的函数。

```c
// Include/descrobject.h#wrapperbase
struct wrapperbase {
    const char *name;       // Python 层的方法名
    int offset;             // slot 在 PyHeapTypeObject 中的偏移量
    void *function;         // 默认的 slot 函数
    wrapperfunc wrapper;    // 如何把 Python 调用转换为 C slot 调用
    const char *doc;        // 文档
    int flags;              // wrapper 的行为标志
    PyObject *name_strobj;  // name 的 Unicode 对象
};

// Objects/typeobject.c#slotdef
typedef struct wrapperbase slotdef;

// Objects/typeobject.c#add_operators
static int
add_operators(PyTypeObject *type)
{
    PyObject *dict = type->tp_dict;
    slotdef *p;
    PyObject *descr;
    void **ptr;

    init_slotdefs();
    for (p = slotdefs; p->name; p++) {
        if (p->wrapper == NULL)          // 接口不支持
            continue;
        ptr = slotptr(type, p->offset);  // 获得 offset 对应的 slot 指针
        if (!ptr || !*ptr)               // 类型没有实现该 slot
            continue;
        /* 若 type.__dict__ 中已经存在方法则不覆盖
           堆类型覆盖的方法会事先添加到 __dict__ 中 */
        if (PyDict_GetItemWithError(dict, p->name_strobj))
            continue;
        if (PyErr_Occurred()) {
            return -1;
        }
        if (*ptr == (void *)PyObject_HashNotImplemented) {
            /* Classes may prevent the inheritance of the tp_hash
               slot by storing PyObject_HashNotImplemented in it. Make it
               visible as a None value for the __hash__ attribute. */
            if (PyDict_SetItem(dict, p->name_strobj, Py_None) < 0)
                return -1;
        }
        else {
            // 创建方法描述器（slot wrapper）
            descr = PyDescr_NewWrapper(type, p, *ptr);
            if (descr == NULL)
                return -1;
            if (PyDict_SetItem(dict, p->name_strobj, descr) < 0) {
                Py_DECREF(descr);
                return -1;
            }
            Py_DECREF(descr);
        }
    }
    if (type->tp_new != NULL) {
        if (add_tp_new_wrapper(type) < 0)
            return -1;
    }
    return 0;
}

// Objects/descrobject.c#PyDescr_NewWrapper
PyObject *
PyDescr_NewWrapper(PyTypeObject *type, struct wrapperbase *base, void *wrapped)
{
    PyWrapperDescrObject *descr;

    descr = (PyWrapperDescrObject *)descr_new(&PyWrapperDescr_Type,
                                             type, base->name);
    if (descr != NULL) {
        descr->d_base = base;
        descr->d_wrapped = wrapped;
    }
    return (PyObject *)descr;
}

// Include/descrobject.h#PyWrapperDescrObject
typedef struct {
    PyDescr_COMMON;
    struct wrapperbase *d_base;
    void *d_wrapped; /* This can be any function pointer */
} PyWrapperDescrObject;

// Objects/descrobject.c#PyWrapperDescr_Type
PyTypeObject PyWrapperDescr_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "wrapper_descriptor",
    sizeof(PyWrapperDescrObject),
    0,
    ...
    (ternaryfunc)wrapperdescr_call,             /* tp_call */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    Py_TPFLAGS_METHOD_DESCRIPTOR,               /* tp_flags */
    ...
    (descrgetfunc)wrapperdescr_get,             /* tp_descr_get */
    0,                                          /* tp_descr_set */
};

// Objects/descrobject.c#wrapperdescr_call
static PyObject *
wrapperdescr_call(PyWrapperDescrObject *descr, PyObject *args, PyObject *kwds)
{
    Py_ssize_t argc;
    PyObject *self, *result;

    /* Make sure that the first argument is acceptable as 'self' */
    assert(PyTuple_Check(args));
    argc = PyTuple_GET_SIZE(args);
    if (argc < 1) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' of '%.100s' "
                     "object needs an argument",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name);
        return NULL;
    }
    self = PyTuple_GET_ITEM(args, 0);
    if (!_PyObject_RealIsSubclass((PyObject *)Py_TYPE(self),
                                  (PyObject *)PyDescr_TYPE(descr))) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' "
                     "requires a '%.100s' object "
                     "but received a '%.100s'",
                     descr_name((PyDescrObject *)descr), "?",
                     PyDescr_TYPE(descr)->tp_name,
                     self->ob_type->tp_name);
        return NULL;
    }

    args = PyTuple_GetSlice(args, 1, argc);
    if (args == NULL) {
        return NULL;
    }
    result = wrapperdescr_raw_call(descr, self, args, kwds);
    Py_DECREF(args);
    return result;
}

// Objects/descrobject.c#wrapperdescr_raw_call
Py_LOCAL_INLINE(PyObject *)
wrapperdescr_raw_call(PyWrapperDescrObject *descr, PyObject *self,
                      PyObject *args, PyObject *kwds)
{
    wrapperfunc wrapper = descr->d_base->wrapper;

    if (descr->d_base->flags & PyWrapperFlag_KEYWORDS) {
        wrapperfunc_kwds wk = (wrapperfunc_kwds)(void(*)(void))wrapper;
        return (*wk)(self, args, descr->d_wrapped, kwds);
    }

    if (kwds != NULL && (!PyDict_Check(kwds) || PyDict_GET_SIZE(kwds) != 0)) {
        PyErr_Format(PyExc_TypeError,
                     "wrapper %s() takes no keyword arguments",
                     descr->d_base->name);
        return NULL;
    }
    return (*wrapper)(self, args, descr->d_wrapped);
}
```

* 另一种调用方式即实例方法调用，其将 PyWrapperDescrObject 描述器对象和实例对象封装为 wrapperobject 对象返回。该对象类型实现了 @@tp_call@@，允许被直接调用。在调用时，与调用 PyWrapperDescrObject 描述器对象本身类似，只是传递 *self* 的参数来自 wrapperobject 的 *self* 字段。

```c
// Objects/descrobject.c#wrapperdescr_get
static PyObject *
wrapperdescr_get(PyWrapperDescrObject *descr, PyObject *obj, PyObject *type)
{
    PyObject *res;

    if (descr_check((PyDescrObject *)descr, obj, &res))
        return res;
    return PyWrapper_New((PyObject *)descr, obj);
}

// Objects/descrobject.c#PyWrapper_New
PyObject *
PyWrapper_New(PyObject *d, PyObject *self)
{
    wrapperobject *wp;
    PyWrapperDescrObject *descr;

    assert(PyObject_TypeCheck(d, &PyWrapperDescr_Type));
    descr = (PyWrapperDescrObject *)d;
    assert(_PyObject_RealIsSubclass((PyObject *)Py_TYPE(self),
                                    (PyObject *)PyDescr_TYPE(descr)));

    wp = PyObject_GC_New(wrapperobject, &_PyMethodWrapper_Type);
    if (wp != NULL) {
        Py_INCREF(descr);
        wp->descr = descr;
        Py_INCREF(self);
        wp->self = self;
        _PyObject_GC_TRACK(wp);
    }
    return (PyObject *)wp;
}

// Objects/descrobject.c#wrapperobject
typedef struct {
    PyObject_HEAD
    PyWrapperDescrObject *descr;
    PyObject *self;
} wrapperobject;

// Objects/descrobject.c#_PyMethodWrapper_Type
PyTypeObject _PyMethodWrapper_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "method-wrapper",                           /* tp_name */
    sizeof(wrapperobject),                      /* tp_basicsize */
    0,                                          /* tp_itemsize */
    ...
    (ternaryfunc)wrapper_call,                  /* tp_call */
    ...
};

// Objects/descrobject.c#wrapper_call
static PyObject *
wrapper_call(wrapperobject *wp, PyObject *args, PyObject *kwds)
{
    return wrapperdescr_raw_call(wp->descr, wp->self, args, kwds);
}
```

### 封装 C 函数的 PyCFunction_Type

在封装静态方法和实例方法等都需要将 C 函数封装为 @@PyCFunction_Type@@ 类型的对象返回。一般情况下，由 @@CAPI_PyCFunction_NewEx[1]@@ 接口将 @@PyMethodDef@@ 封装为可调用的 PyCFunctionObject 对象。其类型 @@PyCFunction_Type@@ 支持 @@vectorcall@@ 调用，PyCFunctionObject 对象的 *vectorcall* 字段会依据 @@PyMethodDef@@ 声明的函数接收参数情形设置不同的包装函数，其创建和调用与实例方法的创建和调用类似。

```c
// Objects/methodobject.c#PyCFunction_NewEx
PyObject *
PyCFunction_NewEx(PyMethodDef *ml, PyObject *self, PyObject *module)
{
    /* Figure out correct vectorcall function to use */
    vectorcallfunc vectorcall;
    switch (ml->ml_flags & (METH_VARARGS | METH_FASTCALL | METH_NOARGS | METH_O | METH_KEYWORDS))
    {
        case METH_VARARGS:
        case METH_VARARGS | METH_KEYWORDS:
            /* For METH_VARARGS functions, it's more efficient to use tp_call
             * instead of vectorcall. */
            vectorcall = NULL;
            break;
        case METH_FASTCALL:
            vectorcall = cfunction_vectorcall_FASTCALL;
            break;
        case METH_FASTCALL | METH_KEYWORDS:
            vectorcall = cfunction_vectorcall_FASTCALL_KEYWORDS;
            break;
        case METH_NOARGS:
            vectorcall = cfunction_vectorcall_NOARGS;
            break;
        case METH_O:
            vectorcall = cfunction_vectorcall_O;
            break;
        default:
            PyErr_Format(PyExc_SystemError,
                         "%s() method: bad call flags", ml->ml_name);
            return NULL;
    }

    PyCFunctionObject *op;
    op = free_list;
    if (op != NULL) {
        free_list = (PyCFunctionObject *)(op->m_self);
        (void)PyObject_INIT(op, &PyCFunction_Type);
        numfree--;
    }
    else {
        op = PyObject_GC_New(PyCFunctionObject, &PyCFunction_Type);
        if (op == NULL)
            return NULL;
    }
    op->m_weakreflist = NULL;
    op->m_ml = ml;
    Py_XINCREF(self);
    op->m_self = self;
    Py_XINCREF(module);
    op->m_module = module;  // func.__module__
    op->vectorcall = vectorcall;
    _PyObject_GC_TRACK(op);
    return (PyObject *)op;
}

// Include/methodobject.h#PyCFunctionObject
typedef struct {
    PyObject_HEAD
    PyMethodDef *m_ml;           /* Description of the C function to call */
    PyObject    *m_self;         /* Passed as 'self' arg to the C func, can be NULL */
    PyObject    *m_module;       /* The __module__ attribute, can be anything */
    PyObject    *m_weakreflist;  /* List of weak references */
    vectorcallfunc vectorcall;
} PyCFunctionObject;

// Objects/methodobject.c#PyCFunction_Type
PyTypeObject PyCFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "builtin_function_or_method",
    sizeof(PyCFunctionObject),
    0,
    (destructor)meth_dealloc,                   /* tp_dealloc */
    offsetof(PyCFunctionObject, vectorcall),    /* tp_vectorcall_offset */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL,                /* tp_flags */
    ...
};

// Objects/methodobject.c#cfunction_vectorcall_FASTCALL
static PyObject *
cfunction_vectorcall_FASTCALL(
    PyObject *func, PyObject *const *args, size_t nargsf, PyObject *kwnames)
{
    if (cfunction_check_kwargs(func, kwnames)) {
        return NULL;
    }
    Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
    _PyCFunctionFast meth = (_PyCFunctionFast)
                            cfunction_enter_call(func);
    if (meth == NULL) {
        return NULL;
    }
    PyObject *result = meth(PyCFunction_GET_SELF(func), args, nargs);
    Py_LeaveRecursiveCall();
    return result;
}
```