### 类成员访问的案例分析

类对象成员中，描述器对象的访问较为特殊，下面以 type 为例分析元类中描述器对象的工作机制。如 @@class-creation-static@@ 所述，类型对象的 @@tp_members@@、@@tp_getset@@、@@tp_methods@@ 以及接口槽的会在类型对象初始化期间以不同的描述器类型暴露到类实例字典中，下面分析数据描述器的实现，对于暴露方法的描述器可参考 @@callable@@。

#### PyMemberDescr_Type 描述器

类型 @@tp_members@@ 槽声明的 @@PyMemberDef@@ 数组元素会逐个封装为 PyMemberDescrObject 对象然后设置到类实例字典。

```c
// Objects/typeobject.c#type_members
static PyMemberDef type_members[] = {
    // name, type, offset, flags, doc
    {"__basicsize__", T_PYSSIZET, offsetof(PyTypeObject,tp_basicsize),READONLY},
    {"__itemsize__", T_PYSSIZET, offsetof(PyTypeObject, tp_itemsize), READONLY},
    {"__flags__", T_ULONG, offsetof(PyTypeObject, tp_flags), READONLY},
    {"__weakrefoffset__", T_PYSSIZET,
     offsetof(PyTypeObject, tp_weaklistoffset), READONLY},
    {"__base__", T_OBJECT, offsetof(PyTypeObject, tp_base), READONLY},
    {"__dictoffset__", T_PYSSIZET,
     offsetof(PyTypeObject, tp_dictoffset), READONLY},
    {"__mro__", T_OBJECT, offsetof(PyTypeObject, tp_mro), READONLY},
    {0}
};

// Objects/typeobject.c#add_members
static int
add_members(PyTypeObject *type, PyMemberDef *memb)
{
    PyObject *dict = type->tp_dict;

    for (; memb->name != NULL; memb++) {
        PyObject *descr = PyDescr_NewMember(type, memb);
        if (descr == NULL)
            return -1;

        if (PyDict_GetItemWithError(dict, PyDescr_NAME(descr))) {
            Py_DECREF(descr);
            continue;
        }
        else if (PyErr_Occurred()) {
            Py_DECREF(descr);
            return -1;
        }
        if (PyDict_SetItem(dict, PyDescr_NAME(descr), descr) < 0) {
            Py_DECREF(descr);
            return -1;
        }
        Py_DECREF(descr);
    }
    return 0;
}

// Objects/descrobject.c#PyDescr_NewMember
PyObject *
PyDescr_NewMember(PyTypeObject *type, PyMemberDef *member)
{
    PyMemberDescrObject *descr;

    descr = (PyMemberDescrObject *)descr_new(&PyMemberDescr_Type,
                                             type, member->name);
    if (descr != NULL)
        descr->d_member = member;
    return (PyObject *)descr;
}

// Include/descrobject.h#PyDescrObject
typedef struct {
    PyObject_HEAD
    PyTypeObject *d_type;  // 描述器对象绑定的类型
    PyObject *d_name;      // 描述器对象绑定的成员名称
    PyObject *d_qualname;
} PyDescrObject;

// Include/descrobject.h#PyDescr_COMMON
#define PyDescr_COMMON PyDescrObject d_common

// Include/descrobject.h#PyMemberDescrObject
typedef struct {
    PyDescr_COMMON;
    struct PyMemberDef *d_member;  // 描述器对象绑定的 PyMemberDef
} PyMemberDescrObject;

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
```

在对这类属性成员的访问时，成员访问系统会从类实例字典中找到相应的描述器实例。可以看到 @@PyMemberDescr_Type@@ 实现了 @@tp_descr_get@@ 和 @@tp_descr_set@@ 槽，属于数据描述器，其查找和修改都由自身的实现接管。

* 属性查找时即从对应 C 槽进行读取，然后转换为相应的 @@PyObject@@ 对象返回。注意到，member_get() 会检查 *obj* 参数是否有效，因为该描述器对象是类实例相关的，成员访问系统会默认传递类型对象，而若从 type 调用，则需要手动传递。

```c
// Objects/descrobject.c#PyMemberDescr_Type
PyTypeObject PyMemberDescr_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "member_descriptor",
    sizeof(PyMemberDescrObject),
    0,
    (destructor)descr_dealloc,                  /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    (reprfunc)member_repr,                      /* tp_repr */
    0,                                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */
    PyObject_GenericGetAttr,                    /* tp_getattro */
    0,                                          /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC, /* tp_flags */
    0,                                          /* tp_doc */
    descr_traverse,                             /* tp_traverse */
    0,                                          /* tp_clear */
    0,                                          /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    descr_methods,                              /* tp_methods */
    descr_members,                              /* tp_members */
    member_getset,                              /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    (descrgetfunc)member_get,                   /* tp_descr_get */
    (descrsetfunc)member_set,                   /* tp_descr_set */
};

// Objects/descrobject.c#member_get
static PyObject *
member_get(PyMemberDescrObject *descr, PyObject *obj, PyObject *type)
{
    PyObject *res;

    if (descr_check((PyDescrObject *)descr, obj, &res))
        return res;

    if (descr->d_member->flags & READ_RESTRICTED) {
        if (PySys_Audit("object.__getattr__", "Os",
            obj ? obj : Py_None, descr->d_member->name) < 0) {
            return NULL;
        }
    }

    return PyMember_GetOne((char *)obj, descr->d_member);
}

// Objects/descrobject.c#descr_check
static int
descr_check(PyDescrObject *descr, PyObject *obj, PyObject **pres)
{
    // obj 为 NULL 表明当前是类属性访问，直接返回 descr
    if (obj == NULL) {
        Py_INCREF(descr);
        *pres = (PyObject *)descr;
        return 1;
    }
    if (!PyObject_TypeCheck(obj, descr->d_type)) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' for '%.100s' objects "
                     "doesn't apply to a '%.100s' object",
                     descr_name((PyDescrObject *)descr), "?",
                     descr->d_type->tp_name,
                     obj->ob_type->tp_name);
        *pres = NULL;
        return 1;
    }
    return 0;
}

// Python/structmember.c#PyMember_GetOne
PyObject *
PyMember_GetOne(const char *addr, PyMemberDef *l)
{
    PyObject *v;

    addr += l->offset;  // 属性槽地址
    switch (l->type) {  // 将 C 类型转换为 Python 类型
    case T_BOOL:
        v = PyBool_FromLong(*(char*)addr);
        break;
    case T_BYTE:
        v = PyLong_FromLong(*(char*)addr);
        break;
    case T_UBYTE:
        v = PyLong_FromUnsignedLong(*(unsigned char*)addr);
        break;
    case T_SHORT:
        v = PyLong_FromLong(*(short*)addr);
        break;
    case T_USHORT:
        v = PyLong_FromUnsignedLong(*(unsigned short*)addr);
        break;
    case T_INT:
        v = PyLong_FromLong(*(int*)addr);
        break;
    case T_UINT:
        v = PyLong_FromUnsignedLong(*(unsigned int*)addr);
        break;
    case T_LONG:
        v = PyLong_FromLong(*(long*)addr);
        break;
    case T_ULONG:
        v = PyLong_FromUnsignedLong(*(unsigned long*)addr);
        break;
    case T_PYSSIZET:
        v = PyLong_FromSsize_t(*(Py_ssize_t*)addr);
        break;
    case T_FLOAT:
        v = PyFloat_FromDouble((double)*(float*)addr);
        break;
    case T_DOUBLE:
        v = PyFloat_FromDouble(*(double*)addr);
        break;
    case T_STRING:
        if (*(char**)addr == NULL) {
            Py_INCREF(Py_None);
            v = Py_None;
        }
        else
            v = PyUnicode_FromString(*(char**)addr);
        break;
    case T_STRING_INPLACE:
        v = PyUnicode_FromString((char*)addr);
        break;
    case T_CHAR:
        v = PyUnicode_FromStringAndSize((char*)addr, 1);
        break;
    case T_OBJECT:
        v = *(PyObject **)addr;
        if (v == NULL)
            v = Py_None;
        Py_INCREF(v);
        break;
    case T_OBJECT_EX:
        v = *(PyObject **)addr;
        if (v == NULL)
            PyErr_SetString(PyExc_AttributeError, l->name);
        Py_XINCREF(v);
        break;
    case T_LONGLONG:
        v = PyLong_FromLongLong(*(long long *)addr);
        break;
    case T_ULONGLONG:
        v = PyLong_FromUnsignedLongLong(*(unsigned long long *)addr);
        break;
    case T_NONE:
        v = Py_None;
        Py_INCREF(v);
        break;
    default:
        PyErr_SetString(PyExc_SystemError, "bad memberdescr type");
        v = NULL;
    }
    return v;
}
```

* 属性写入时与查找相反，即将值写入相应 C 槽。期间需要做权限校验，如是否可写，以及将 @@PyObject@@ 类型转换为槽能接受的 C 类型后设置。

```c
// Objects/descrobject.c#member_set
static int
member_set(PyMemberDescrObject *descr, PyObject *obj, PyObject *value)
{
    int res;

    if (descr_setcheck((PyDescrObject *)descr, obj, value, &res))
        return res;
    return PyMember_SetOne((char *)obj, descr->d_member, value);
}

// Objects/descrobject.c#descr_setcheck
static int
descr_setcheck(PyDescrObject *descr, PyObject *obj, PyObject *value,
               int *pres)
{
    assert(obj != NULL);
    if (!PyObject_TypeCheck(obj, descr->d_type)) {
        PyErr_Format(PyExc_TypeError,
                     "descriptor '%V' for '%.100s' objects "
                     "doesn't apply to a '%.100s' object",
                     descr_name(descr), "?",
                     descr->d_type->tp_name,
                     obj->ob_type->tp_name);
        *pres = -1;
        return 1;
    }
    return 0;
}

// Python/structmember.c#PyMember_SetOne
int
PyMember_SetOne(char *addr, PyMemberDef *l, PyObject *v)
{
    PyObject *oldv;

    addr += l->offset;  // 属性成员槽地址

    if ((l->flags & READONLY))  // 访问权限校验
    {
        PyErr_SetString(PyExc_AttributeError, "readonly attribute");
        return -1;
    }
    if (v == NULL) {
        if (l->type == T_OBJECT_EX) {
            /* Check if the attribute is set. */
            if (*(PyObject **)addr == NULL) {
                PyErr_SetString(PyExc_AttributeError, l->name);
                return -1;
            }
        }
        else if (l->type != T_OBJECT) {
            PyErr_SetString(PyExc_TypeError,
                            "can't delete numeric/char attribute");
            return -1;
        }
    }
    switch (l->type) {  // Python 类型转换为 C 类型
    case T_BOOL:{
        if (!PyBool_Check(v)) {
            PyErr_SetString(PyExc_TypeError,
                            "attribute value type must be bool");
            return -1;
        }
        if (v == Py_True)
            *(char*)addr = (char) 1;
        else
            *(char*)addr = (char) 0;
        break;
        }
    case T_BYTE:{
        long long_val = PyLong_AsLong(v);
        if ((long_val == -1) && PyErr_Occurred())
            return -1;
        *(char*)addr = (char)long_val;
        /* XXX: For compatibility, only warn about truncations
           for now. */
        if ((long_val > CHAR_MAX) || (long_val < CHAR_MIN))
            WARN("Truncation of value to char");
        break;
        }
    case T_UBYTE:{
        long long_val = PyLong_AsLong(v);
        if ((long_val == -1) && PyErr_Occurred())
            return -1;
        *(unsigned char*)addr = (unsigned char)long_val;
        if ((long_val > UCHAR_MAX) || (long_val < 0))
            WARN("Truncation of value to unsigned char");
        break;
        }
    case T_SHORT:{
        long long_val = PyLong_AsLong(v);
        if ((long_val == -1) && PyErr_Occurred())
            return -1;
        *(short*)addr = (short)long_val;
        if ((long_val > SHRT_MAX) || (long_val < SHRT_MIN))
            WARN("Truncation of value to short");
        break;
        }
    case T_USHORT:{
        long long_val = PyLong_AsLong(v);
        if ((long_val == -1) && PyErr_Occurred())
            return -1;
        *(unsigned short*)addr = (unsigned short)long_val;
        if ((long_val > USHRT_MAX) || (long_val < 0))
            WARN("Truncation of value to unsigned short");
        break;
        }
    case T_INT:{
        long long_val = PyLong_AsLong(v);
        if ((long_val == -1) && PyErr_Occurred())
            return -1;
        *(int *)addr = (int)long_val;
        if ((long_val > INT_MAX) || (long_val < INT_MIN))
            WARN("Truncation of value to int");
        break;
        }
    case T_UINT:{
        unsigned long ulong_val = PyLong_AsUnsignedLong(v);
        if ((ulong_val == (unsigned long)-1) && PyErr_Occurred()) {
            /* XXX: For compatibility, accept negative int values
               as well. */
            PyErr_Clear();
            ulong_val = PyLong_AsLong(v);
            if ((ulong_val == (unsigned long)-1) &&
                PyErr_Occurred())
                return -1;
            *(unsigned int *)addr = (unsigned int)ulong_val;
            WARN("Writing negative value into unsigned field");
        } else
            *(unsigned int *)addr = (unsigned int)ulong_val;
        if (ulong_val > UINT_MAX)
            WARN("Truncation of value to unsigned int");
        break;
        }
    case T_LONG:{
        *(long*)addr = PyLong_AsLong(v);
        if ((*(long*)addr == -1) && PyErr_Occurred())
            return -1;
        break;
        }
    case T_ULONG:{
        *(unsigned long*)addr = PyLong_AsUnsignedLong(v);
        if ((*(unsigned long*)addr == (unsigned long)-1)
            && PyErr_Occurred()) {
            /* XXX: For compatibility, accept negative int values
               as well. */
            PyErr_Clear();
            *(unsigned long*)addr = PyLong_AsLong(v);
            if ((*(unsigned long*)addr == (unsigned long)-1)
                && PyErr_Occurred())
                return -1;
            WARN("Writing negative value into unsigned field");
        }
        break;
        }
    case T_PYSSIZET:{
        *(Py_ssize_t*)addr = PyLong_AsSsize_t(v);
        if ((*(Py_ssize_t*)addr == (Py_ssize_t)-1)
            && PyErr_Occurred())
                        return -1;
        break;
        }
    case T_FLOAT:{
        double double_val = PyFloat_AsDouble(v);
        if ((double_val == -1) && PyErr_Occurred())
            return -1;
        *(float*)addr = (float)double_val;
        break;
        }
    case T_DOUBLE:
        *(double*)addr = PyFloat_AsDouble(v);
        if ((*(double*)addr == -1) && PyErr_Occurred())
            return -1;
        break;
    case T_OBJECT:
    case T_OBJECT_EX:
        Py_XINCREF(v);
        oldv = *(PyObject **)addr;
        *(PyObject **)addr = v;
        Py_XDECREF(oldv);
        break;
    case T_CHAR: {
        const char *string;
        Py_ssize_t len;

        string = PyUnicode_AsUTF8AndSize(v, &len);
        if (string == NULL || len != 1) {
            PyErr_BadArgument();
            return -1;
        }
        *(char*)addr = string[0];
        break;
        }
    case T_STRING:
    case T_STRING_INPLACE:
        PyErr_SetString(PyExc_TypeError, "readonly attribute");
        return -1;
    case T_LONGLONG:{
        long long value;
        *(long long*)addr = value = PyLong_AsLongLong(v);
        if ((value == -1) && PyErr_Occurred())
            return -1;
        break;
        }
    case T_ULONGLONG:{
        unsigned long long value;
        /* ??? PyLong_AsLongLong accepts an int, but PyLong_AsUnsignedLongLong
            doesn't ??? */
        if (PyLong_Check(v))
            *(unsigned long long*)addr = value = PyLong_AsUnsignedLongLong(v);
        else
            *(unsigned long long*)addr = value = PyLong_AsLong(v);
        if ((value == (unsigned long long)-1) && PyErr_Occurred())
            return -1;
        break;
        }
    default:
        PyErr_Format(PyExc_SystemError,
                     "bad memberdescr type for %s", l->name);
        return -1;
    }
    return 0;
}
```

#### PyGetSetDescr_Type 描述器

与 @@tp_members@@ 类似，类型的 @@tp_getset@@ 声明的 @@PyGetSetDef@@ 数组元素也会相应包装为 PyGetSetDescrObject 描述器对象设置到类实例字典。

```c
// Objects/typeobject.c#type_getsets
static PyGetSetDef type_getsets[] = {
    // name, get, set, doc, closure
    {"__name__", (getter)type_name, (setter)type_set_name, NULL},
    {"__qualname__", (getter)type_qualname, (setter)type_set_qualname, NULL},
    {"__bases__", (getter)type_get_bases, (setter)type_set_bases, NULL},
    {"__module__", (getter)type_module, (setter)type_set_module, NULL},
    {"__abstractmethods__", (getter)type_abstractmethods,
     (setter)type_set_abstractmethods, NULL},
    {"__dict__",  (getter)type_dict,  NULL, NULL},
    {"__doc__", (getter)type_get_doc, (setter)type_set_doc, NULL},
    {"__text_signature__", (getter)type_get_text_signature, NULL, NULL},
    {0}
};

// Objects/typeobject.c#add_getset
static int
add_getset(PyTypeObject *type, PyGetSetDef *gsp)
{
    PyObject *dict = type->tp_dict;

    for (; gsp->name != NULL; gsp++) {
        PyObject *descr = PyDescr_NewGetSet(type, gsp);
        if (descr == NULL)
            return -1;

        if (PyDict_GetItemWithError(dict, PyDescr_NAME(descr))) {
            Py_DECREF(descr);
            continue;
        }
        else if (PyErr_Occurred()) {
            Py_DECREF(descr);
            return -1;
        }
        if (PyDict_SetItem(dict, PyDescr_NAME(descr), descr) < 0) {
            Py_DECREF(descr);
            return -1;
        }
        Py_DECREF(descr);
    }
    return 0;
}

// Objects/descrobject.c#PyDescr_NewGetSet
PyObject *
PyDescr_NewGetSet(PyTypeObject *type, PyGetSetDef *getset)
{
    PyGetSetDescrObject *descr;

    descr = (PyGetSetDescrObject *)descr_new(&PyGetSetDescr_Type,
                                             type, getset->name);
    if (descr != NULL)
        descr->d_getset = getset;
    return (PyObject *)descr;
}

// Include/descrobject.h#PyGetSetDescrObject
typedef struct {
    PyDescr_COMMON;
    PyGetSetDef *d_getset;
} PyGetSetDescrObject;
```

@@PyGetSetDescr_Type@@ 同属于数据描述器，其访问与修改即相应调用 @@PyGetSetDef@@ 中声明的 *get* 和 *set* 函数来实现。如 type 实现的 \_\_dict__ 计算属性成员，其每次查找都会将 @@tp_dict@@ 包装为代理字典返回，同时不允许修改类实例字典本身。

```c
// Objects/descrobject.c#PyGetSetDescr_Type
PyTypeObject PyGetSetDescr_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "getset_descriptor",
    sizeof(PyGetSetDescrObject),
    0,
    (destructor)descr_dealloc,                  /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    (reprfunc)getset_repr,                      /* tp_repr */
    0,                                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */
    PyObject_GenericGetAttr,                    /* tp_getattro */
    0,                                          /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC, /* tp_flags */
    0,                                          /* tp_doc */
    descr_traverse,                             /* tp_traverse */
    0,                                          /* tp_clear */
    0,                                          /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    0,                                          /* tp_methods */
    descr_members,                              /* tp_members */
    getset_getset,                              /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    (descrgetfunc)getset_get,                   /* tp_descr_get */
    (descrsetfunc)getset_set,                   /* tp_descr_set */
};

// Objects/descrobject.c#getset_get
static PyObject *
getset_get(PyGetSetDescrObject *descr, PyObject *obj, PyObject *type)
{
    PyObject *res;

    if (descr_check((PyDescrObject *)descr, obj, &res))
        return res;
    if (descr->d_getset->get != NULL)
        return descr->d_getset->get(obj, descr->d_getset->closure);
    PyErr_Format(PyExc_AttributeError,
                 "attribute '%V' of '%.100s' objects is not readable",
                 descr_name((PyDescrObject *)descr), "?",
                 PyDescr_TYPE(descr)->tp_name);
    return NULL;
}

// Objects/descrobject.c#getset_set
static int
getset_set(PyGetSetDescrObject *descr, PyObject *obj, PyObject *value)
{
    int res;

    if (descr_setcheck((PyDescrObject *)descr, obj, value, &res))
        return res;
    if (descr->d_getset->set != NULL)
        return descr->d_getset->set(obj, value,
                                    descr->d_getset->closure);
    PyErr_Format(PyExc_AttributeError,
                 "attribute '%V' of '%.100s' objects is not writable",
                 descr_name((PyDescrObject *)descr), "?",
                 PyDescr_TYPE(descr)->tp_name);
    return -1;
}

// Objects/typeobject.c#type_dict
static PyObject *
type_dict(PyTypeObject *type, void *context)
{
    if (type->tp_dict == NULL) {
        Py_RETURN_NONE;
    }
    return PyDictProxy_New(type->tp_dict);
}
```
