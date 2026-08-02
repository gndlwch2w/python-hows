### 静态类型的创建

首先，先分析 @@PyTypeObject@@ 结构体各字段的作用，其字段有的是为类本身服务的、有的是为实例服务的以及有的是为创建类服务的：

* 为类本身服务的字段是指类的元信息和为类本身实现功能的字段。具体来说，@@tp_name@@ 记录类名称。@@tp_doc@@ 记录类文档。@@tp_flags@@ 记录类支持的特性位标记，如 @@Py_TPFLAGS_HAVE_VECTORCALL@@ 标记表明类支持 @@vectorcall-protocol@@ 调用。@@tp_subclasses@@ 记录了类的所有子类。@@tp_dict@@ 表示类的成员字典，即类的 \_\_dict__ 属性。@@tp_weaklist@@ 用于实现类的弱引用。@@tp_vectorcall@@ 是类本身实现的 @@vectorcall-protocol@@ 调用函数指针，同时元类的 @@tp_vectorcall_offset@@ 偏移地址为 @@tp_vectorcall@@ 槽相对 @@PyTypeObject@@ 的偏移，调用元类时就能调用类实现的 @@vectorcall-protocol@@ 调用。

* 为实例服务的字段是指描述实例的状态和行为的字段，实例的状态即内存布局，实例的行为即各种接口。为不同接口定义为不同的槽而不是由一个统一的字典管理，是为了加速接口的访问。这些字段可依据功能的不同分为内存布局、生命周期、成员访问和其它各类接口协议（如迭代器接口、比较接口等）四类：

    * 内存布局相关字段描述创建实例需要多少内存空间，而如何解释空间则由实例接口确定。@@tp_basicsize@@ 声明实例的基本内存大小。若实例是变长的（如 str），由 @@tp_itemsize@@ 声明变长项的内存大小。若是定长的，则设置 @@tp_itemsize@@ 为 *0*。若实例具有 \_\_dict__ 属性，则需要算进 @@tp_basicsize@@ 中，并设置 @@tp_dictoffset@@ 为 \_\_dict__ 属性指针相对于实例内存起始位置的偏移。同理，若实例支持弱引用，则 @@tp_weaklistoffset@@ 需设置为 \_\_weakref__ 属性指针相对于实例内存起始位置的偏移。

    * 实例生命周期相关字段用于管理实例的创建和销毁。@@tp_alloc@@ 函数用于为实例分配内存空间，@@tp_new@@ 函数用于创建实例对象，@@tp_init@@ 函数用于初始化实例对象。TODO: 对象清理

    * 实例允许以 `.` 进行成员的访问，其由 @@tp_getattro@@ 和 @@tp_setattro@@ 接口支持，分别用于成员的读取和设置。@@tp_getattr@@ 和 @@tp_setattr@@ 属于旧版接口，现已弃用。

    * 其它各类接口协议属于类型的可选实现，如实现了 @@tp_hash@@ 就能对实例进行如 `hash(obj)` 的哈希操作，其它协议接口同理。此外，还有一些字段为实例的属性字段，如 @@tp_base@@ 和 @@tp_bases@@ 记录实例的父类，@@tp_mro@@ 记录成员查找解析顺序。

* 最后一类字段是为创建静态类型服务的：@@tp_methods@@ 允许为类型声明额外的方法。@@tp_members@@ 允许将 @@PyTypeObject@@ 中的属性字段以接口的形式暴露出去，如将 @@tp_base@@ 暴露为实例的 \_\_base__ 属性，但对类型来说 \_\_base__ 是一个方法。@@tp_getset@@ 允许为实例添加计算属性，如实例的 \_\_dict__ 属性需动态从 @@tp_dictoffset@@ 计算得到。后两种添加属性的方式本质上都是给类添加一个数据接口，这么做是因为实例是多态的，又不能直接写死，只能设计接口接收不同的实例动态获得其结果。

注意，上述所提到的实例可以是任意 @@PyObject@@ 对象，包括 @@PyTypeObject@@。所以当实例是类对象时，其元类实现的方法是作用到类上的。另外，尽管上述将各字段按服务对象进行分类讨论，但本质上都是类成员，从持有的角度，类对象才具有 \_\_basicsize__ 属性（对应 @@tp_basicsize@@ 字段的值），而其实例可能不具有。

```c
// Include/cpython/object.h#PyTypeObject
typedef struct _typeobject {
    PyObject_VAR_HEAD
    /* 类型名称 */
    const char *tp_name; /* For printing, in format "<module>.<name>" */
    /* 实例的大小 */
    Py_ssize_t tp_basicsize, tp_itemsize; /* For allocation */

    /* Methods to implement standard operations */

    /* 实例析构函数指针 */
    destructor tp_dealloc;
    /* tp_call 的 vectorcall 协议实现的偏移 */
    Py_ssize_t tp_vectorcall_offset;
    /* tp_getattro */
    getattrfunc tp_getattr;
    /* tp_setattro */
    setattrfunc tp_setattr;
    PyAsyncMethods *tp_as_async; /* formerly known as tp_compare (Python 2)
                                    or tp_reserved (Python 3) */
    /* repr() 函数指针 */
    reprfunc tp_repr;

    /* Method suites for standard classes */

    /* 数字协议相关的函数指针组 */
    PyNumberMethods *tp_as_number;
    /* 序列协议相关的函数指针组 */
    PySequenceMethods *tp_as_sequence;
    /* 映射协议相关的函数指针组 */
    PyMappingMethods *tp_as_mapping;

    /* More standard operations (here for binary compatibility) */

    /* hash() 函数指针 */
    hashfunc tp_hash;
    /* 实例调用指向的函数指针 */
    ternaryfunc tp_call;
    /* str() 函数指针 */
    reprfunc tp_str;
    /* 获取属性的函数指针 */
    getattrofunc tp_getattro;
    /* 设置和删除属性的函数指针 */
    setattrofunc tp_setattro;

    /* Functions to access object as input/output buffer */
    /* 缓冲区协议相关的函数指针组 */
    PyBufferProcs *tp_as_buffer;

    /* Flags to define presence of optional/expanded features */
    unsigned long tp_flags;

    const char *tp_doc; /* Documentation string */

    /* Assigned meaning in release 2.0 */
    /* call function for all accessible objects */
    traverseproc tp_traverse;

    /* delete references to contained objects */
    inquiry tp_clear;

    /* Assigned meaning in release 2.1 */
    /* rich comparisons */
    richcmpfunc tp_richcompare;

    /* weak reference enabler */
    Py_ssize_t tp_weaklistoffset;

    /* Iterators */
    getiterfunc tp_iter;
    iternextfunc tp_iternext;

    /* Attribute descriptor and subclassing stuff */
    /* 声明类型的常规方法组 */
    struct PyMethodDef *tp_methods;
    /* 声明类型的常规数据成员组 */
    struct PyMemberDef *tp_members;
    /* 声明实例中的被计算属性组 */
    struct PyGetSetDef *tp_getset;
    /* 所继承的基类型 */
    struct _typeobject *tp_base;
    /* 类型初始属性的字典 */
    PyObject *tp_dict;
    descrgetfunc tp_descr_get;
    descrsetfunc tp_descr_set;
    /* 实例属性字典偏移 */
    Py_ssize_t tp_dictoffset;
    /* 实例初始化函数的指针 */
    initproc tp_init;
    /* 实例分配函数的可选指针 */
    allocfunc tp_alloc;
    /* 实例创建函数的指针 */
    newfunc tp_new;
    /* 实例释放函数的指针 */
    freefunc tp_free; /* Low-level free-memory routine */
    /* 垃圾回收器所调用的函数的指针 */
    inquiry tp_is_gc; /* For PyObject_IS_GC */
    /* 基类型的元组 */
    PyObject *tp_bases;
    /* 基类型的扩展集的元组 */
    PyObject *tp_mro; /* method resolution order */
    PyObject *tp_cache;
    PyObject *tp_subclasses;
    PyObject *tp_weaklist;
    destructor tp_del;

    /* Type attribute cache version tag. Added in version 2.6 */
    unsigned int tp_version_tag;

    destructor tp_finalize;
    vectorcallfunc tp_vectorcall;

    /* bpo-37250: kept for backwards compatibility in CPython 3.8 only */
    Py_DEPRECATED(3.8) int (*tp_print)(PyObject *, FILE *, int);

#ifdef COUNT_ALLOCS
    /* these must be last and never explicitly initialized */
    Py_ssize_t tp_allocs;
    Py_ssize_t tp_frees;
    Py_ssize_t tp_maxalloc;
    struct _typeobject *tp_prev;
    struct _typeobject *tp_next;
#endif
} PyTypeObject;
```

在设计上，object 类是所有类的父类，其元类是 type 类。

* object 类采用静态分配方式创建，由 @@PyBaseObject_Type@@ 表示，其中给出一些槽的默认实现，如 @@__repr__@@、@@__str__@@、@@__hash__@@、@@__eq__@@ 等比较方法以及实例成员访问槽。若子类不对其覆盖，则会按照规则进行继承。

* 另外，object 的实例为 @@PyObject@@ 对象，其中没有额外的实例字段，也没有 \_\_dict__ 和 \_\_weakref__ 属性，即将 @@tp_dictoffset@@ 和 @@tp_weaklistoffset@@ 设置为 *0* 表示没有实现。依据 @@supporting-cyclic-garbage-collection@@，object 实例没有对其它对象的引用，故不是容器对象，则不需要实现 GC 功能。在实例没有外部引用时，由 @@tp_dealloc@@ 槽实现的析构函数调用 @@tp_free@@ 实现的函数释放实例内存。

```c
// Include/object.h#PyObject
typedef struct _object {
    _PyObject_HEAD_EXTRA
    Py_ssize_t ob_refcnt;
    struct _typeobject *ob_type;
} PyObject;

// Objects/typeobject.c#PyBaseObject_Type
PyTypeObject PyBaseObject_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "object",                                   /* tp_name */
    sizeof(PyObject),                           /* tp_basicsize */
    0,                                          /* tp_itemsize */
    object_dealloc,                             /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    object_repr,                                /* tp_repr, __repr__() */
    0,                                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    (hashfunc)_Py_HashPointer,                  /* tp_hash, __hash__() */
    0,                                          /* tp_call */
    object_str,                                 /* tp_str, __str__() */
    PyObject_GenericGetAttr,                    /* tp_getattro */
    PyObject_GenericSetAttr,                    /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE,   /* tp_flags */
    object_doc,                                 /* tp_doc */
    0,                                          /* tp_traverse */
    0,                                          /* tp_clear */
    object_richcompare,                         /* tp_richcompare, 如 __eq__() 等 */
    0,                                          /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    object_methods,                             /* tp_methods */
    0,                                          /* tp_members */
    object_getsets,                             /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    0,                                          /* tp_dictoffset */
    object_init,                                /* tp_init */
    PyType_GenericAlloc,                        /* tp_alloc */
    object_new,                                 /* tp_new */
    PyObject_Del,                               /* tp_free */
};
```

* 另一些没有槽的实例方法和属性由 @@tp_members@@ 和 @@tp_getset@@ 提供，同样可被子类覆盖与继承。具体来说：

    * @@tp_members@@ 槽指向的是 @@PyMethodDef@@ 数组，其通过方法名称 *ml_name*、函数指针 *ml_meth*、类型标记 *ml_flags* 和文档 *ml_doc* 声明实例额外的方法。一般来说，@@PyCFunction@@ 的第一参数为 *self*，第二个参数为参数列表 *args*。常见的 *ml_flags* 有如 @@METH_CLASS@@ 表明方法是一个类方法，那么方法的第一个参数就为 @@PyTypeObject@@ 类型的 *cls*。而  @@METH_NOARGS@@、@@METH_O@@ 和 @@METH_VARARGS@@ 则表明方法第二个参数需转换为 *NULL*、非元组的单独对象和元组对象。

    * @@tp_getset@@ 槽指向的是 @@PyGetSetDef@@ 数组，其通过属性名称 *name*、访问属性的 *get* 和 *set* 函数、文档和用户数据 *closure* 为实例声明额外的属性。其中 *get* 和 *set* 函数的第一个参数为 *self*，最后一个参数为 *closure*。

```c
// Include/methodobject.h#PyCFunction
typedef PyObject *(*PyCFunction)(PyObject *, PyObject *);

// Include/methodobject.h#PyMethodDef
struct PyMethodDef {
    const char  *ml_name;   /* The name of the built-in function/method */
    PyCFunction ml_meth;    /* The C function that implements it */
    int         ml_flags;   /* Combination of METH_xxx flags, which mostly
                               describe the args expected by the C func */
    const char  *ml_doc;    /* The __doc__ attribute, or NULL */
};
typedef struct PyMethodDef PyMethodDef;

// Objects/typeobject.c#object_methods
static PyMethodDef object_methods[] = {
    OBJECT___REDUCE_EX___METHODDEF
    OBJECT___REDUCE___METHODDEF
    {"__subclasshook__", object_subclasshook, METH_CLASS | METH_VARARGS,
     object_subclasshook_doc},
    {"__init_subclass__", object_init_subclass, METH_CLASS | METH_NOARGS,
     object_init_subclass_doc},
    OBJECT___FORMAT___METHODDEF
    OBJECT___SIZEOF___METHODDEF
    OBJECT___DIR___METHODDEF
    {0}
};

#define OBJECT___REDUCE_EX___METHODDEF {"__reduce_ex__", (PyCFunction)object___reduce_ex__, METH_O, object___reduce_ex____doc__},
#define OBJECT___REDUCE___METHODDEF {"__reduce__", (PyCFunction)object___reduce__, METH_NOARGS, object___reduce____doc__},
#define OBJECT___FORMAT___METHODDEF {"__format__", (PyCFunction)object___format__, METH_O, object___format____doc__},
#define OBJECT___SIZEOF___METHODDEF {"__sizeof__", (PyCFunction)object___sizeof__, METH_NOARGS, object___sizeof____doc__},
#define OBJECT___DIR___METHODDEF {"__dir__", (PyCFunction)object___dir__, METH_NOARGS, object___dir____doc__},

// Include/descrobject.h#getter,setter
typedef PyObject *(*getter)(PyObject *, void *);
typedef int (*setter)(PyObject *, PyObject *, void *);

// Include/descrobject.h#PyGetSetDef
typedef struct PyGetSetDef {
    const char *name;  // 属性名
    getter get;        // 获取属性的函数指针
    setter set;        // 设置属性的函数指针
    const char *doc;   // 文档
    void *closure;     // 传递给 getter 和 setter 的闭包指针
} PyGetSetDef;

// Objects/typeobject.c#object_getsets
static PyGetSetDef object_getsets[] = {
    {"__class__", object_get_class, object_set_class,
     PyDoc_STR("the object's class")},
    {0}
};
```

类似 object 类，元类 type 也采用静态分配方式创建，由 @@PyType_Type@@ 表示。除额外指定外，元类 @@PyType_Type@@ 是所有类的类型，即可称类 object 为元类 type 的实例，同时 type 是自己的元类。

* 从继承关系上讲，type 覆盖了 object 的部分槽实现，如 @@__repr__@@、成员访问、@@__init__@@ 和 @@__new__@@ 等接口，同时也继承了如 @@__hash__@@ 接口的实现。之所以重新实现目的是为了区别类对象和普通对象，如 `repr(object)` 和 `repr(object())` 的结果是不同的，以及如成员访问时 `object.__repr__` 和 `object().__repr__` 的结果也是不同的。

* 元类的实例设置为 PyHeapTypeObject 而不是 @@PyTypeObject@@ 是因为便于 @@heap-types@@ 的实现，后续会提到 PyHeapTypeObject 的前缀是 @@PyTypeObject@@，故可安全转换为 @@PyTypeObject@@ 类型。另外，类实例是变长的，其变长项为 @@PyMemberDef@@，即与 @@tp_members@@ 槽指向数组的类型相同，其目的是为了加速堆类型成员的访问。

* 类实例具有 \_\_dict__ 和 \_\_weakref__ 属性，故 type 的 @@tp_dictoffset@@ 和 @@tp_weaklistoffset@@ 设置为 @@PyTypeObject@@ 中 @@tp_dict@@ 和 @@tp_weaklist@@ 槽的偏移地址。类实例持有其它对象的引用，为容器对象，因此 type 的 @@tp_flags@@ 设置了 @@Py_TPFLAGS_HAVE_GC@@ 标记表明类实例由 GC 管理，同时实现了 @@tp_traverse@@、@@tp_is_gc@@ 和 @@tp_free@@ 等槽以支持类实例的回收。

* 一般情况下，类实例允许如 `object()` 的调用来创建实例，type 实现了 @@tp_call@@ 槽提供支持。注意到，type 并没有设置 @@tp_vectorcall_offset@@，因为如 @@__new__@@ 等创建实例接口接收的参数需要打包为元组和字典对象。

```c
// Objects/typeobject.c#PyType_Type
PyTypeObject PyType_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "type",                                     /* tp_name */
    sizeof(PyHeapTypeObject),                   /* tp_basicsize */
    sizeof(PyMemberDef),                        /* tp_itemsize */
    (destructor)type_dealloc,                   /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    (reprfunc)type_repr,                        /* tp_repr, __repr__() */
    0,                                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    (ternaryfunc)type_call,                     /* tp_call */
    0,                                          /* tp_str */
    (getattrofunc)type_getattro,                /* tp_getattro */
    (setattrofunc)type_setattro,                /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
        Py_TPFLAGS_BASETYPE | Py_TPFLAGS_TYPE_SUBCLASS,         /* tp_flags */
    type_doc,                                   /* tp_doc */
    (traverseproc)type_traverse,                /* tp_traverse */
    (inquiry)type_clear,                        /* tp_clear */
    0,                                          /* tp_richcompare */
    offsetof(PyTypeObject, tp_weaklist),        /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    type_methods,                               /* tp_methods */
    type_members,                               /* tp_members */
    type_getsets,                               /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    offsetof(PyTypeObject, tp_dict),            /* tp_dictoffset */
    type_init,                                  /* tp_init, __init__() */
    0,                                          /* tp_alloc */
    type_new,                                   /* tp_new, __new__() */
    PyObject_GC_Del,                            /* tp_free */
    (inquiry)type_is_gc,                        /* tp_is_gc */
};
```

* type 的 @@tp_methods@@、@@tp_members@@ 和 @@tp_getset@@ 槽实现了类实例的共有方法和属性，如任意类可通过 `object.__dict__` 获得其类实例字典，其是 @@tp_getset@@ 进行实现的。以及可以 `dir(object)` 查看类拥有的成员，注意到 object 也实现了 dir() 接口，这里针对 @@PyTypeObject@@ 进行了覆盖。

    * @@tp_members@@ 用于对 @@PyTypeObject@@ 属性槽的暴露，实际指向 @@PyMemberDef@@ 数组，其中 *name* 为成员名称、*type* 为字段的数据类型、*offset* 为槽的偏移、*flags* 为槽的标记位，如标记槽是否可写等、最后 *doc* 为文档。object 没有定义 @@tp_members@@ 是因为 @@PyObject@@ 没有额外属性字段，定义在 type 中是因为 @@PyTypeObject@@ 中的属性字段属于类实例的。

```c
// Objects/typeobject.c#type_methods
static PyMethodDef type_methods[] = {
    TYPE_MRO_METHODDEF
    TYPE___SUBCLASSES___METHODDEF
    {"__prepare__", (PyCFunction)(void(*)(void))type_prepare,
     METH_FASTCALL | METH_KEYWORDS | METH_CLASS,
     PyDoc_STR("__prepare__() -> dict\n"
               "used to create the namespace for the class statement")},
    TYPE___INSTANCECHECK___METHODDEF
    TYPE___SUBCLASSCHECK___METHODDEF
    TYPE___DIR___METHODDEF
    TYPE___SIZEOF___METHODDEF
    {0}
};

// Include/structmember.h#PyMemberDef
typedef struct PyMemberDef {
    const char *name;   // 成员名称
    int type;           // 字段类型
    Py_ssize_t offset;  // 偏移量
    int flags;          // 标志位
    const char *doc;    // 文档
} PyMemberDef;

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

// Objects/typeobject.c#type_getsets
static PyGetSetDef type_getsets[] = {
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
```

上述简要介绍了 @@PyTypeObject@@ 结构体和两个基本类型的静态实现。此外，注意到如类字典 \_\_dict__ 等属性还未初始化，以及槽的继承也尚未完成。静态类型的创建在为 @@PyTypeObject@@ 设置值后，还有一个最终化阶段（或叫初始化阶段），即由 @@CAPI_PyType_Ready@@ 接口完成该过程。如 object 和 type 等内置类型，在 Python 初始化期间会自动进行：

```c
// Objects/object.c#_PyTypes_Init
PyStatus
_PyTypes_Init(void)
{
#define INIT_TYPE(TYPE, NAME) \
    do { \
        if (PyType_Ready(TYPE) < 0) { \
            return _PyStatus_ERR("Can't initialize " NAME " type"); \
        } \
    } while (0)

    INIT_TYPE(&PyBaseObject_Type, "object");
    INIT_TYPE(&PyType_Type, "type");
    /* 其余类型初始化 */
}
```

@@CAPI_PyType_Ready@@ 核心工作为将类型实现的接口暴露到类实例字典 \_\_dict__ 中和依据 @@method-resolution-order@@ 确定的线性继承序列确定各槽的继承值。统一暴露到实例字典中是便于如 @@tp_getattro@@ 接口的成员访问，确定槽的继承值是因为静态类型在初始化后就不能发生修改，同时依赖槽的接口无需关心槽的值是如何确定的，如 repr() 只需检查对象 @@tp_repr@@ 槽是否有实现，有则直接调用而无需成员查找。

* 类的初始化只会执行一次，由 @@Py_TPFLAGS_READY@@ 标记标识。为避免并发初始化问题，类只能由一个线程进行初始化，即当 @@Py_TPFLAGS_READYING@@ 标记位有效时，其它线程无法进入。初始化完成后，置 @@Py_TPFLAGS_READY@@ 标志位有效表明类已经初始化了，同时置 @@Py_TPFLAGS_READYING@@ 无效。

* 若没有指定父类，默认继承至 object 类。type 的父类会设置为 object，而 object 的父类会设置为 *NULL*。若没有指定元类，则默认继承父类的元类。一般情况下，静态类型都采用的都是单继承，因为不同类型实例的内存布局通常不一致，多继承会出现内存冲突问题。实际上可以做到，即手动为 @@tp_bases@@ 设置值，即在 @@CAPI_PyType_Ready@@ 之前创建基类元组对象，然后再设置到 @@tp_bases@@。

```c
// Objects/typeobject.c#PyType_Ready
int
PyType_Ready(PyTypeObject *type)
{
    PyObject *dict, *bases;
    PyTypeObject *base;
    Py_ssize_t i, n;

    if (type->tp_flags & Py_TPFLAGS_READY) {  // 只用初始化一次
        assert(_PyType_CheckConsistency(type));
        return 0;
    }
    _PyObject_ASSERT((PyObject *)type,
                     (type->tp_flags & Py_TPFLAGS_READYING) == 0);

    /* Consistency checks for PEP 590:
     * - Py_TPFLAGS_METHOD_DESCRIPTOR requires tp_descr_get
     * - _Py_TPFLAGS_HAVE_VECTORCALL requires tp_call and
     *   tp_vectorcall_offset > 0
     * To avoid mistakes, we require this before inheriting.
     */
    if (type->tp_flags & Py_TPFLAGS_METHOD_DESCRIPTOR) {
        // https://docs.python.org/zh-cn/3.14/c-api/typeobj.html#c.Py_TPFLAGS_METHOD_DESCRIPTOR
        _PyObject_ASSERT((PyObject *)type, type->tp_descr_get != NULL);
    }
    if (type->tp_flags & _Py_TPFLAGS_HAVE_VECTORCALL) {
        // https://docs.python.org/zh-cn/3.14/c-api/typeobj.html#c.Py_TPFLAGS_HAVE_VECTORCALL
        _PyObject_ASSERT((PyObject *)type, type->tp_vectorcall_offset > 0);
        _PyObject_ASSERT((PyObject *)type, type->tp_call != NULL);
    }

    type->tp_flags |= Py_TPFLAGS_READYING;

#ifdef Py_TRACE_REFS
    /* PyType_Ready is the closest thing we have to a choke point
     * for type objects, so is the best place I can think of to try
     * to get type objects into the doubly-linked list of all objects.
     * Still, not all type objects go through PyType_Ready.
     */
    _Py_AddToAllObjects((PyObject *)type, 0);
#endif

    if (type->tp_name == NULL) {
        PyErr_Format(PyExc_SystemError,
                     "Type does not define the tp_name field.");
        goto error;
    }

    /* Initialize tp_base (defaults to BaseObject unless that's us) */
    base = type->tp_base;
    if (base == NULL && type != &PyBaseObject_Type) {  // 非 object 的默认父类设置为 object
        base = type->tp_base = &PyBaseObject_Type;
        Py_INCREF(base);
    }

    /* Now the only way base can still be NULL is if type is
     * &PyBaseObject_Type.
     */

    /* Initialize the base class */
    if (base != NULL && base->tp_dict == NULL) {
        if (PyType_Ready(base) < 0)
            goto error;
    }

    /* Initialize ob_type if NULL. This means extensions that want to be
       compilable separately on Windows can call PyType_Ready() instead of
       initializing the ob_type field of their type objects. */
    /* The test for base != NULL is really unnecessary, since base is only
       NULL when type is &PyBaseObject_Type, and we know its ob_type is
       not NULL (it's initialized to &PyType_Type). But coverity doesn't
       know that. */
    if (Py_TYPE(type) == NULL && base != NULL)
        Py_TYPE(type) = Py_TYPE(base);

    /* Initialize tp_bases */
    bases = type->tp_bases;
    if (bases == NULL) {
        if (base == NULL)  // object 设置为 ()
            bases = PyTuple_New(0);
        else
            bases = PyTuple_Pack(1, base);
        if (bases == NULL)
            goto error;
        type->tp_bases = bases;
    }

    /* Initialize tp_dict */
    dict = type->tp_dict;
    if (dict == NULL) {  // 静态初始化类一般会在这里初始化 __dict__
        dict = PyDict_New();
        if (dict == NULL)
            goto error;
        type->tp_dict = dict;
    }

    /* Add type-specific descriptors to tp_dict */
    if (add_operators(type) < 0)  // 为实现的 tp_* 槽添加描述器
        goto error;
    if (type->tp_methods != NULL) {
        if (add_methods(type, type->tp_methods) < 0)
            goto error;
    }
    if (type->tp_members != NULL) {
        if (add_members(type, type->tp_members) < 0)
            goto error;
    }
    if (type->tp_getset != NULL) {
        if (add_getset(type, type->tp_getset) < 0)
            goto error;
    }

    /* Calculate method resolution order tp_mro
       以及初始化缓存相关标记 */
    if (mro_internal(type, NULL) < 0)
        goto error;

    /* Inherit special flags from dominant base */
    if (type->tp_base != NULL)
        inherit_special(type, type->tp_base);

    /* Initialize tp_dict properly */
    bases = type->tp_mro;
    assert(bases != NULL);
    assert(PyTuple_Check(bases));
    n = PyTuple_GET_SIZE(bases);
    for (i = 1; i < n; i++) {
        PyObject *b = PyTuple_GET_ITEM(bases, i);
        /* 继承 tp_* 槽，保证如 repr() 等直接调用槽的函数能正确执行
           继承并不会写入 tp_dict，因为涉及成员查找时会重新从 mro 中查找 */
        if (PyType_Check(b))
            inherit_slots(type, (PyTypeObject *)b);
    }

    /* All bases of statically allocated type should be statically allocated */
    if (!(type->tp_flags & Py_TPFLAGS_HEAPTYPE))
        for (i = 0; i < n; i++) {
            PyObject *b = PyTuple_GET_ITEM(bases, i);
            if (PyType_Check(b) &&
                (((PyTypeObject *)b)->tp_flags & Py_TPFLAGS_HEAPTYPE)) {
                PyErr_Format(PyExc_TypeError,
                             "type '%.100s' is not dynamically allocated but "
                             "its base type '%.100s' is dynamically allocated",
                             type->tp_name, ((PyTypeObject *)b)->tp_name);
                goto error;
            }
        }

    /* Sanity check for tp_free. */
    if (PyType_IS_GC(type) && (type->tp_flags & Py_TPFLAGS_BASETYPE) &&
        (type->tp_free == NULL || type->tp_free == PyObject_Del)) {  // GC 类型不能继承 object 的 tp_free
        /* This base class needs to call tp_free, but doesn't have
         * one, or its tp_free is for non-gc'ed objects.
         */
        PyErr_Format(PyExc_TypeError, "type '%.100s' participates in "
                     "gc and is a base type but has inappropriate "
                     "tp_free slot",
                     type->tp_name);
        goto error;
    }

    /* if the type dictionary doesn't contain a __doc__, set it from
       the tp_doc slot.
     */
    if (_PyDict_GetItemIdWithError(type->tp_dict, &PyId___doc__) == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        if (type->tp_doc != NULL) {
            const char *old_doc = _PyType_DocWithoutSignature(type->tp_name,
                type->tp_doc);
            PyObject *doc = PyUnicode_FromString(old_doc);
            if (doc == NULL)
                goto error;
            if (_PyDict_SetItemId(type->tp_dict, &PyId___doc__, doc) < 0) {
                Py_DECREF(doc);
                goto error;
            }
            Py_DECREF(doc);
        } else {
            if (_PyDict_SetItemId(type->tp_dict,
                                  &PyId___doc__, Py_None) < 0)
                goto error;
        }
    }

    /* Hack for tp_hash and __hash__.
       If after all that, tp_hash is still NULL, and __hash__ is not in
       tp_dict, set tp_hash to PyObject_HashNotImplemented and
       tp_dict['__hash__'] equal to None.
       This signals that __hash__ is not inherited.
     */
    if (type->tp_hash == NULL) {
        if (_PyDict_GetItemIdWithError(type->tp_dict, &PyId___hash__) == NULL) {
            if (PyErr_Occurred() ||
               _PyDict_SetItemId(type->tp_dict, &PyId___hash__, Py_None) < 0)
            {
                goto error;
            }
            type->tp_hash = PyObject_HashNotImplemented;
        }
    }

    /* Some more special stuff */
    base = type->tp_base;
    if (base != NULL) {
        if (type->tp_as_async == NULL)
            type->tp_as_async = base->tp_as_async;
        if (type->tp_as_number == NULL)
            type->tp_as_number = base->tp_as_number;
        if (type->tp_as_sequence == NULL)
            type->tp_as_sequence = base->tp_as_sequence;
        if (type->tp_as_mapping == NULL)
            type->tp_as_mapping = base->tp_as_mapping;
        if (type->tp_as_buffer == NULL)
            type->tp_as_buffer = base->tp_as_buffer;
    }

    /* Link into each base class's list of subclasses */
    bases = type->tp_bases;
    n = PyTuple_GET_SIZE(bases);
    for (i = 0; i < n; i++) {
        PyObject *b = PyTuple_GET_ITEM(bases, i);
        if (PyType_Check(b) &&
            add_subclass((PyTypeObject *)b, type) < 0)  // tp_subclasses
            goto error;
    }

    /* All done -- set the ready flag */
    type->tp_flags =
        (type->tp_flags & ~Py_TPFLAGS_READYING) | Py_TPFLAGS_READY;
    assert(_PyType_CheckConsistency(type));
    return 0;

  error:
    type->tp_flags &= ~Py_TPFLAGS_READYING;
    return -1;
}
```

* 若类的 @@tp_dict@@ 没有初始化，则创建一个空字典对象作为类实例字典。然后将 @@PyTypeObject@@ 中与 Python 层有关的接口暴露到类实例字典中，如 add_operators() 负责检查类实现了哪些槽，若实现了 @@tp_repr@@ 槽，则将该槽实现的函数封装为可调用 Python 对象并设置到 `__dict__["__repr__"]` 中。类似地，若类定义了 @@tp_methods@@、@@tp_members@@ 或 @@tp_getset@@ 数组，则也会依据声明创建相应的可调用 Python 对象设置到类实例字典。注意，这里的可调用 Python 对象一般是 @@descriptor-objects@@，其主要用于配合实例成员访问的功能实现。

```c
// Objects/typeobject.c#PyType_Ready
int
PyType_Ready(PyTypeObject *type)
{
    ...

    /* Initialize tp_dict */
    dict = type->tp_dict;
    if (dict == NULL) {  // 静态初始化类一般会在这里初始化 __dict__
        dict = PyDict_New();
        if (dict == NULL)
            goto error;
        type->tp_dict = dict;
    }

    /* Add type-specific descriptors to tp_dict */
    if (add_operators(type) < 0)  // 为实现的 tp_* 槽添加描述器
        goto error;
    if (type->tp_methods != NULL) {
        if (add_methods(type, type->tp_methods) < 0)
            goto error;
    }
    if (type->tp_members != NULL) {
        if (add_members(type, type->tp_members) < 0)
            goto error;
    }
    if (type->tp_getset != NULL) {
        if (add_getset(type, type->tp_getset) < 0)
            goto error;
    }

    ...
}
```

* add_operators() 负责将 @@PyTypeObject@@ 中已经实现的接口槽以 Python 层的接口名暴露到类实例字典，即 \_\_xxx__() 方法。具体来说，接口槽声明表 *slotdefs* 定义了所有支持的接口名称到对应槽偏移地址的映射，然后 add_operators() 逐个遍历各接口定义，若对应槽具有实现的同时类实例字典中没有出现同名接口，则将实现封装为 @@PyWrapperDescr_Type@@ 类型描述器对象并设置到类实例字典。此外，还值得注意的有：

    * 接口槽声明表 *slotdefs* 是按照槽的偏移地址的排序进行定义的，那么先遍历到的槽会先添加到字典中，如 @@mp_subscript@@ 和 @@sq_item@@ 都对应 \_\_getitem__() 接口，若同时实现，则 @@mp_subscript@@ 具有更高的优先级。这么设计是因为具有更好通用性的接口越靠前，如 @@mp_subscript@@ 可处理任意类型的对象，而 @@sq_item@@ 只能处理 int 类型，通用性更差。

    * @@tp_hash@@ 槽具有一个特殊实现，即 PyObject_HashNotImplemented。当实现为该指针时，会往类实例字典的 \_\_hash__ 值写入 *None*，表明该类型不支持哈希操作。

    * 注意到，@@PyWrapperDescr_Type@@ 描述器对象持有的类创建时是槽实现的函数指针 *\*ptr*，而不是运行时动态从当前类型的槽读取，这么做是避免若子类型槽的实现从类实例字典中直接调用描述器对象时导致的无限递归。

    * *slotdef* 中除了定义接口名称和槽偏移地址外，还有槽的默认实现 *function*，作用在当 Python 层函数覆盖槽的实现时，会将符合槽函数接口的默认实现置于相应槽。中间接口 *wrapper*，用于将 Python 层调用的参数转换为 C 函数接口能够接收的参数。*flags* 标记位主要用于 *wrapper* 判断参数类型，如 PyWrapperFlag_KEYWORDS 表明具有关键字参数。

```c
// Objects/typeobject.c#add_operators
/* This function is called by PyType_Ready() to populate the type's
   dictionary with method descriptors for function slots.  For each
   function slot (like tp_repr) that's defined in the type, one or more
   corresponding descriptors are added in the type's tp_dict dictionary
   under the appropriate name (like __repr__).  Some function slots
   cause more than one descriptor to be added (for example, the nb_add
   slot adds both __add__ and __radd__ descriptors) and some function
   slots compete for the same descriptor (for example both sq_item and
   mp_subscript generate a __getitem__ descriptor).

   In the latter case, the first slotdef entry encountered wins.  Since
   slotdef entries are sorted by the offset of the slot in the
   PyHeapTypeObject, this gives us some control over disambiguating
   between competing slots: the members of PyHeapTypeObject are listed
   from most general to least general, so the most general slot is
   preferred.  In particular, because as_mapping comes before as_sequence,
   for a type that defines both mp_subscript and sq_item, mp_subscript
   wins.

   This only adds new descriptors and doesn't overwrite entries in
   tp_dict that were previously defined.  The descriptors contain a
   reference to the C function they must call, so that it's safe if they
   are copied into a subtype's __dict__ and the subtype has a different
   C function in its slot -- calling the method defined by the
   descriptor will call the C function that was used to create it,
   rather than the C function present in the slot when it is called.
   (This is important because a subtype may have a C function in the
   slot that calls the method from the dictionary, and we want to avoid
   infinite recursion here.) */
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

// Objects/typeobject.c#slotdefs_initialized,init_slotdefs
static int slotdefs_initialized = 0;
/* Initialize the slotdefs table by adding interned string objects for the
   names. */
static void
init_slotdefs(void)
{
    slotdef *p;

    if (slotdefs_initialized)
        return;
    for (p = slotdefs; p->name; p++) {
        /* Slots must be ordered by their offset in the PyHeapTypeObject. */
        assert(!p[1].name || p->offset <= p[1].offset);
        p->name_strobj = PyUnicode_InternFromString(p->name);
        if (!p->name_strobj || !PyUnicode_CHECK_INTERNED(p->name_strobj))
            Py_FatalError("Out of memory interning slotdef names");
    }
    slotdefs_initialized = 1;
}

// Objects/typeobject.c#slotdefs,slotdef
static slotdef slotdefs[] = {
    // name, offset, function, wrapper, doc
    TPSLOT("__getattribute__", tp_getattr, NULL, NULL, ""),
    TPSLOT("__getattr__", tp_getattr, NULL, NULL, ""),
    TPSLOT("__setattr__", tp_setattr, NULL, NULL, ""),
    TPSLOT("__delattr__", tp_setattr, NULL, NULL, ""),
    TPSLOT("__repr__", tp_repr, slot_tp_repr, wrap_unaryfunc,
           "__repr__($self, /)\n--\n\nReturn repr(self)."),
    TPSLOT("__hash__", tp_hash, slot_tp_hash, wrap_hashfunc,
           "__hash__($self, /)\n--\n\nReturn hash(self)."),
    FLSLOT("__call__", tp_call, slot_tp_call, (wrapperfunc)(void(*)(void))wrap_call,
           "__call__($self, /, *args, **kwargs)\n--\n\nCall self as a function.",
           PyWrapperFlag_KEYWORDS),
    TPSLOT("__str__", tp_str, slot_tp_str, wrap_unaryfunc,
           "__str__($self, /)\n--\n\nReturn str(self)."),
    TPSLOT("__getattribute__", tp_getattro, slot_tp_getattr_hook,
           wrap_binaryfunc,
           "__getattribute__($self, name, /)\n--\n\nReturn getattr(self, name)."),
    ...
}
typedef struct wrapperbase slotdef;

// Objects/descrobject.h#wrapperbase
struct wrapperbase {
    const char *name;       // Python 层的方法名
    int offset;             // slot 在 PyHeapTypeObject 中的偏移量
    void *function;         // 默认的 slot 函数
    wrapperfunc wrapper;    // 如何把 Python 调用转换为 C slot 调用
    const char *doc;        // 文档
    int flags;              // wrapper 的行为标志
    PyObject *name_strobj;  // name 的 Unicode 对象
};
```

* 在 C 槽中，对于 @@__new__@@ 方法的暴露较为特殊，其没有采用描述器进行包装，而是直接包装为 @@PyCFunction@@ 可调用对象。因为 @@__new__@@ 属于类方法，而其它槽方法都是实例方法，因此需要特殊处理。

```c
static struct PyMethodDef tp_new_methoddef[] = {
    {"__new__", (PyCFunction)(void(*)(void))tp_new_wrapper, METH_VARARGS|METH_KEYWORDS,
     PyDoc_STR("__new__($type, *args, **kwargs)\n--\n\n"
               "Create and return a new object.  "
               "See help(type) for accurate signature.")},
    {0}
};

static int
add_tp_new_wrapper(PyTypeObject *type)
{
    PyObject *func;

    if (_PyDict_GetItemIdWithError(type->tp_dict, &PyId___new__) != NULL)
        return 0;
    if (PyErr_Occurred())
        return -1;
    func = PyCFunction_NewEx(tp_new_methoddef, (PyObject *)type, NULL);
    if (func == NULL)
        return -1;
    if (_PyDict_SetItemId(type->tp_dict, &PyId___new__, func)) {
        Py_DECREF(func);
        return -1;
    }
    Py_DECREF(func);
    return 0;
}
```

* 若静态类型定义了 @@PyMethodDef@@ 数组，则也需添加到类实例字典中。不同的方法类型，所创建的描述器对象也不同。对于类方法，创建 @@PyClassMethodDescr_Type@@ 类型的描述器对象，注意该对象不是 `@classmethod` 返回的对象。对于静态方法，则创建 @@staticmethod@@ 类型的对象，与 `@staticmethod` 作用相同。对于普通实例方法，则创建 @@PyMethodDescr_Type@@ 类型的描述器对象。不同的类型的描述器对象具有不同的调用行为，如类方法的第一个参数自动传递 *cls* 而普通实例方法的一个参数自动传递 *self*。 

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

* 同理，静态类型若定义了 @@PyMemberDef@@ 或 @@PyGetSetDef@@ 数组，则也会添加到相应描述器对象到类实例字典中。尽管二者定义的是属性，但本质上向类实例字典添加的是描述器对象而不是属性值，因为若设计为数据接口，那么很容易对属性的访问进行控制，如限制修改等。对于 @@PyMemberDef@@ 声明的成员，绑定的是 @@PyMemberDescr_Type@@ 类型描述器对象，而 @@PyGetSetDef@@ 则是 @@PyGetSetDescr_Type@@。

```c
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
```

* 暴露完接口后，由于 Python 支持多继承，父类之间的继承关系可能是非线性的，需先计算类型的 @@method-resolution-order@@，然后再依据 @@tp_mro@@ 计算的线性继承顺序进行 @@PyTypeObject@@ 字段的继承。由于不同字段之间可能存在互相约束，需要确保一致性，继承规则可参考 @@type-object-structures@@。注意到，是先将类已经实现的槽暴露到类实例字典，后做槽继承，以此保证类实例字典中的接口都是类本身的实现。

```c
// Objects/typeobject.c#PyType_Ready
int
PyType_Ready(PyTypeObject *type)
{
    ...

    /* Calculate method resolution order tp_mro
       以及初始化缓存相关标记 */
    if (mro_internal(type, NULL) < 0)
        goto error;

    /* Inherit special flags from dominant base */
    if (type->tp_base != NULL)
        inherit_special(type, type->tp_base);

    /* Initialize tp_dict properly */
    bases = type->tp_mro;
    assert(bases != NULL);
    assert(PyTuple_Check(bases));
    n = PyTuple_GET_SIZE(bases);
    for (i = 1; i < n; i++) {
        PyObject *b = PyTuple_GET_ITEM(bases, i);
        /* 继承 tp_* 槽，保证如 repr() 等直接调用槽的函数能正确执行
           继承并不会写入 tp_dict，因为涉及成员查找时会重新从 mro 中查找 */
        if (PyType_Check(b))
            inherit_slots(type, (PyTypeObject *)b);
    }

    ...
}
```

* 类型 @@method-resolution-order[1]@@的计算由 mro_internal() 实现，具体来说：

    * mro_internal() 在计算 MRO 的期间可能会发生重入，如当计算 MRO 的算法由用户提供时，其中又动态修改当前类型的 \_\_class__ 属性，此时会触发 MRO 的重新计算；又或是在计算 MRO 期间，某个类型的回收触发了当前类型 MRO 的重新计算。为此，mro_internal() 会在计算 MRO 之前先备份 @@tp_mro@@ 的值，在计算之后比较 @@tp_mro@@ 是否发生修改来判断是否出现重入，若发生重入则保留重入计算结果。

    * 计算 MRO 的方法默认由 `type.mro()` 实现的 @@C3-linearization@@ 算法提供，但当用户元类自定义覆盖 mro() 实现时则由用户算法提供，对于用户计算结果会做类型匹配校验，因为其可能返回 \_\_bases__ 定义之外的类。

    * 确定 @@tp_mro@@ 结果之后，因为继承结构发生了改变，需要重置成员查找缓存机制。type_mro_modified() 会先检查当前类型的 MRO 是否由标准实现计算得到，若不是则设置 @@Py_TPFLAGS_HAVE_VERSION_TAG@@ 标记无效表明不支持缓存，因为非标准算法提供的继承结构可能会导致缓存错误更新。然后再分别检查 \_\_mro__ 和 \_\_bases__ 中定义的父类是否都支持缓存，即是否 @@Py_TPFLAGS_HAVE_VERSION_TAG@@ 标记都有效。最后由 @@CAPI_PyType_Modified@@ 标记类型的所有子类缓存失效，即设置 @@Py_TPFLAGS_VALID_VERSION_TAG@@ 无效。有关成员查找缓存机制的实现可参考 @@class-member-getset@@。

```c
// Objects/typeobject.c#mro_internal
/* Calculates and assigns a new MRO to type->tp_mro.
   Return values and invariants:

     - Returns 1 if a new MRO value has been set to type->tp_mro due to
       this call of mro_internal (no tricky reentrancy and no errors).

       In case if p_old_mro argument is not NULL, a previous value
       of type->tp_mro is put there, and the ownership of this
       reference is transferred to a caller.
       Otherwise, the previous value (if any) is decref'ed.

     - Returns 0 in case when type->tp_mro gets changed because of
       reentering here through a custom mro() (see a comment to mro_invoke).

       In this case, a refcount of an old type->tp_mro is adjusted
       somewhere deeper in the call stack (by the innermost mro_internal
       or its caller) and may become zero upon returning from here.
       This also implies that the whole hierarchy of subclasses of the type
       has seen the new value and updated their MRO accordingly.

     - Returns -1 in case of an error.
*/
static int
mro_internal(PyTypeObject *type, PyObject **p_old_mro)
{
    PyObject *new_mro, *old_mro;
    int reent;

    /* Keep a reference to be able to do a reentrancy check below.
       Don't let old_mro be GC'ed and its address be reused for
       another object, like (suddenly!) a new tp_mro.  */
    old_mro = type->tp_mro;
    Py_XINCREF(old_mro);
    new_mro = mro_invoke(type);  /* might cause reentrance */
    reent = (type->tp_mro != old_mro);  // 在计算 mro 中间是否发生 mro 的重新计算
    Py_XDECREF(old_mro);
    if (new_mro == NULL)  // mro 计算失败，返回 -1
        return -1;

    if (reent) {  // 发生重入返回 0，表示由重入设置的 mro
        Py_DECREF(new_mro);
        return 0;
    }

    type->tp_mro = new_mro;

    type_mro_modified(type, type->tp_mro);  // 检查是否能缓存
    /* corner case: the super class might have been hidden
       from the custom MRO */
    type_mro_modified(type, type->tp_bases);

    PyType_Modified(type);  // 标记缓存失效

    if (p_old_mro != NULL)
        *p_old_mro = old_mro;  /* transfer the ownership */
    else
        Py_XDECREF(old_mro);

    return 1;
}

// Objects/typeobject.c#mro_invoke
/* Lookups an mcls.mro method, invokes it and checks the result (if needed,
   in case of a custom mro() implementation).

   Keep in mind that during execution of this function type->tp_mro
   can be replaced due to possible reentrance (for example,
   through type_set_bases):

      - when looking up the mcls.mro attribute (it could be
        a user-provided descriptor);

      - from inside a custom mro() itself;

      - through a finalizer of the return value of mro().
*/
static PyObject *
mro_invoke(PyTypeObject *type)
{
    PyObject *mro_result;
    PyObject *new_mro;
    int custom = (Py_TYPE(type) != &PyType_Type);

    if (custom) {  // 寻找自定义元类的 mro() 方法
        _Py_IDENTIFIER(mro);
        int unbound;
        PyObject *mro_meth = lookup_method((PyObject *)type, &PyId_mro,
                                           &unbound);
        if (mro_meth == NULL)
            return NULL;
        mro_result = call_unbound_noarg(unbound, mro_meth, (PyObject *)type);
        Py_DECREF(mro_meth);
    }
    else { // type.mro()
        mro_result = mro_implementation(type);
    }
    if (mro_result == NULL)
        return NULL;

    new_mro = PySequence_Tuple(mro_result);
    Py_DECREF(mro_result);
    if (new_mro == NULL)
        return NULL;

    if (custom && mro_check(type, new_mro) < 0) {
        Py_DECREF(new_mro);
        return NULL;
    }

    return new_mro;
}

// Objects/typeobject.c#type_mro_modified
static void
type_mro_modified(PyTypeObject *type, PyObject *bases) {
    /*
       Check that all base classes or elements of the MRO of type are
       able to be cached.  This function is called after the base
       classes or mro of the type are altered.

       Unset HAVE_VERSION_TAG and VALID_VERSION_TAG if the type
       has a custom MRO that includes a type which is not officially
       super type, or if the type implements its own mro() method.

       Called from mro_internal, which will subsequently be called on
       each subclass when their mro is recursively updated.
     */
    Py_ssize_t i, n;
    int custom = (Py_TYPE(type) != &PyType_Type);
    int unbound;
    PyObject *mro_meth = NULL;
    PyObject *type_mro_meth = NULL;

    if (!PyType_HasFeature(type, Py_TPFLAGS_HAVE_VERSION_TAG))
        return;

    if (custom) {
        _Py_IDENTIFIER(mro);
        mro_meth = lookup_maybe_method(
            (PyObject *)type, &PyId_mro, &unbound);
        if (mro_meth == NULL)
            goto clear;
        type_mro_meth = lookup_maybe_method(
            (PyObject *)&PyType_Type, &PyId_mro, &unbound);
        if (type_mro_meth == NULL)
            goto clear;
        if (mro_meth != type_mro_meth)
            goto clear;  // 非标准 mro 不支持缓存
        Py_XDECREF(mro_meth);
        Py_XDECREF(type_mro_meth);
    }
    n = PyTuple_GET_SIZE(bases);
    for (i = 0; i < n; i++) {
        PyObject *b = PyTuple_GET_ITEM(bases, i);
        PyTypeObject *cls;

        assert(PyType_Check(b));
        cls = (PyTypeObject *)b;

        if (!PyType_HasFeature(cls, Py_TPFLAGS_HAVE_VERSION_TAG) ||
            !PyType_IsSubtype(type, cls)) {
            goto clear;  // 确保所有的基类都具有缓存能力
        }
    }
    return;
 clear:
    Py_XDECREF(mro_meth);
    Py_XDECREF(type_mro_meth);
    type->tp_flags &= ~(Py_TPFLAGS_HAVE_VERSION_TAG|
                        Py_TPFLAGS_VALID_VERSION_TAG);
}
```

* 计算完 MRO 后，先从 \_\_base__ 继承与实例内存相关的槽，即实例本质由最直接父类主导，下面称作基类。

    * 若基类支持 GC 以及当前类有关 GC 字段尚未设置，则从基类继承 @@Py_TPFLAGS_HAVE_GC@@ 标记和 @@tp_traverse@@ 和 @@tp_clear@@ 槽实现。

    * 若基类不是 object 或当前类是堆类型（即具有 @@Py_TPFLAGS_HEAPTYPE@@ 标记），则允许从基类继承 @@tp_new@@。在基类是 object 时不继承 object.\_\_new__ 是因为部分扩展模块刻意设置 @@tp_new@@ 为 *NULL*，而是使用工厂方法创建类型。堆类型可以继承是因为创建堆类型的过程不会出现类似情况。

    * 若当前类没有设置实例内存布局相关字段，则默认从基类继承。同时，若基类属于基础类型，则为当前类型设置相关标记以支持 @@CAPI_PyType_FastSubclass@@ 快速子类判断。

```c
// Objects/typeobject.c#inherit_special
static void
inherit_special(PyTypeObject *type, PyTypeObject *base)
{
    /* Copying tp_traverse and tp_clear is connected to the GC flags */
    if (!(type->tp_flags & Py_TPFLAGS_HAVE_GC) &&
        (base->tp_flags & Py_TPFLAGS_HAVE_GC) &&
        (!type->tp_traverse && !type->tp_clear)) {
        type->tp_flags |= Py_TPFLAGS_HAVE_GC;
        if (type->tp_traverse == NULL)
            type->tp_traverse = base->tp_traverse;
        if (type->tp_clear == NULL)
            type->tp_clear = base->tp_clear;
    }

    {
        /* The condition below could use some explanation.
           It appears that tp_new is not inherited for static types
           whose base class is 'object'; this seems to be a precaution
           so that old extension types don't suddenly become
           callable (object.__new__ wouldn't insure the invariants
           that the extension type's own factory function ensures).
           Heap types, of course, are under our control, so they do
           inherit tp_new; static extension types that specify some
           other built-in type as the default also
           inherit object.__new__. */
        if (base != &PyBaseObject_Type ||
            (type->tp_flags & Py_TPFLAGS_HEAPTYPE)) {
            if (type->tp_new == NULL)
                type->tp_new = base->tp_new;
        }
    }
    /* 继承父类的内存格局 */
    if (type->tp_basicsize == 0)
        type->tp_basicsize = base->tp_basicsize;

    /* Copy other non-function slots */

#undef COPYVAL
#define COPYVAL(SLOT) \
    if (type->SLOT == 0) type->SLOT = base->SLOT

    COPYVAL(tp_itemsize);
    COPYVAL(tp_weaklistoffset);
    COPYVAL(tp_dictoffset);

    /* Setup fast subclass flags */
    if (PyType_IsSubtype(base, (PyTypeObject*)PyExc_BaseException))
        type->tp_flags |= Py_TPFLAGS_BASE_EXC_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyType_Type))
        type->tp_flags |= Py_TPFLAGS_TYPE_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyLong_Type))
        type->tp_flags |= Py_TPFLAGS_LONG_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyBytes_Type))
        type->tp_flags |= Py_TPFLAGS_BYTES_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyUnicode_Type))
        type->tp_flags |= Py_TPFLAGS_UNICODE_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyTuple_Type))
        type->tp_flags |= Py_TPFLAGS_TUPLE_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyList_Type))
        type->tp_flags |= Py_TPFLAGS_LIST_SUBCLASS;
    else if (PyType_IsSubtype(base, &PyDict_Type))
        type->tp_flags |= Py_TPFLAGS_DICT_SUBCLASS;
}
```

* 然后按顺序从 @@tp_mro@@ 中定义的父类继承其它接口槽，注意仅会继承父类自己实现的槽，不会继承父类继承至其父类的槽。如 @@tp_as_async@@ 的协议组会按子成员继承，而不是一整个继承。如 @@tp_getattr@@ 和 @@tp_getattro@@ 等实现相同功能的接口需要同时继承以确保行为的一致性，类似如 @@tp_vectorcall_offset@@ 与 @@Py_TPFLAGS_HAVE_VECTORCALL@@ 标志位绑定的槽也需要同时继承。详细的继承规则参考 @@type-object-structures@@。

```c
// Objects/typeobject.c#inherit_slots
static void
inherit_slots(PyTypeObject *type, PyTypeObject *base)
{
    PyTypeObject *basebase;

#undef SLOTDEFINED
#undef COPYSLOT
#undef COPYNUM
#undef COPYSEQ
#undef COPYMAP
#undef COPYBUF

// 仅继承父类真正实现的槽
#define SLOTDEFINED(SLOT) \
    (base->SLOT != 0 && \
     (basebase == NULL || base->SLOT != basebase->SLOT))

#define COPYSLOT(SLOT) \
    if (!type->SLOT && SLOTDEFINED(SLOT)) type->SLOT = base->SLOT

#define COPYASYNC(SLOT) COPYSLOT(tp_as_async->SLOT)
#define COPYNUM(SLOT) COPYSLOT(tp_as_number->SLOT)
#define COPYSEQ(SLOT) COPYSLOT(tp_as_sequence->SLOT)
#define COPYMAP(SLOT) COPYSLOT(tp_as_mapping->SLOT)
#define COPYBUF(SLOT) COPYSLOT(tp_as_buffer->SLOT)

    /* This won't inherit indirect slots (from tp_as_number etc.)
       if type doesn't provide the space. 
       
       对于tp_as_async/number/sequence/mapping/buffer, 
       只要父类具有相应的槽空间，子成员就可以直接继承，不会管是否来自 basebase */

    if (type->tp_as_number != NULL && base->tp_as_number != NULL) {
        basebase = base->tp_base;
        if (basebase->tp_as_number == NULL)
            basebase = NULL;
        COPYNUM(nb_add);
        COPYNUM(nb_subtract);
        COPYNUM(nb_multiply);
        COPYNUM(nb_remainder);
        COPYNUM(nb_divmod);
        COPYNUM(nb_power);
        COPYNUM(nb_negative);
        COPYNUM(nb_positive);
        COPYNUM(nb_absolute);
        COPYNUM(nb_bool);
        COPYNUM(nb_invert);
        COPYNUM(nb_lshift);
        COPYNUM(nb_rshift);
        COPYNUM(nb_and);
        COPYNUM(nb_xor);
        COPYNUM(nb_or);
        COPYNUM(nb_int);
        COPYNUM(nb_float);
        COPYNUM(nb_inplace_add);
        COPYNUM(nb_inplace_subtract);
        COPYNUM(nb_inplace_multiply);
        COPYNUM(nb_inplace_remainder);
        COPYNUM(nb_inplace_power);
        COPYNUM(nb_inplace_lshift);
        COPYNUM(nb_inplace_rshift);
        COPYNUM(nb_inplace_and);
        COPYNUM(nb_inplace_xor);
        COPYNUM(nb_inplace_or);
        COPYNUM(nb_true_divide);
        COPYNUM(nb_floor_divide);
        COPYNUM(nb_inplace_true_divide);
        COPYNUM(nb_inplace_floor_divide);
        COPYNUM(nb_index);
        COPYNUM(nb_matrix_multiply);
        COPYNUM(nb_inplace_matrix_multiply);
    }

    if (type->tp_as_async != NULL && base->tp_as_async != NULL) {
        basebase = base->tp_base;
        if (basebase->tp_as_async == NULL)
            basebase = NULL;
        COPYASYNC(am_await);
        COPYASYNC(am_aiter);
        COPYASYNC(am_anext);
    }

    if (type->tp_as_sequence != NULL && base->tp_as_sequence != NULL) {
        basebase = base->tp_base;
        if (basebase->tp_as_sequence == NULL)
            basebase = NULL;
        COPYSEQ(sq_length);
        COPYSEQ(sq_concat);
        COPYSEQ(sq_repeat);
        COPYSEQ(sq_item);
        COPYSEQ(sq_ass_item);
        COPYSEQ(sq_contains);
        COPYSEQ(sq_inplace_concat);
        COPYSEQ(sq_inplace_repeat);
    }

    if (type->tp_as_mapping != NULL && base->tp_as_mapping != NULL) {
        basebase = base->tp_base;
        if (basebase->tp_as_mapping == NULL)
            basebase = NULL;
        COPYMAP(mp_length);
        COPYMAP(mp_subscript);
        COPYMAP(mp_ass_subscript);
    }

    if (type->tp_as_buffer != NULL && base->tp_as_buffer != NULL) {
        basebase = base->tp_base;
        if (basebase->tp_as_buffer == NULL)
            basebase = NULL;
        COPYBUF(bf_getbuffer);
        COPYBUF(bf_releasebuffer);
    }

    basebase = base->tp_base;

    COPYSLOT(tp_dealloc);
    if (type->tp_getattr == NULL && type->tp_getattro == NULL) {
        type->tp_getattr = base->tp_getattr;
        type->tp_getattro = base->tp_getattro;
    }
    if (type->tp_setattr == NULL && type->tp_setattro == NULL) {
        type->tp_setattr = base->tp_setattr;
        type->tp_setattro = base->tp_setattro;
    }
    COPYSLOT(tp_repr);
    /* tp_hash see tp_richcompare */
    {
        /* Always inherit tp_vectorcall_offset to support PyVectorcall_Call().
         * If _Py_TPFLAGS_HAVE_VECTORCALL is not inherited, then vectorcall
         * won't be used automatically. */
        COPYSLOT(tp_vectorcall_offset);

        /* Inherit _Py_TPFLAGS_HAVE_VECTORCALL for non-heap types
        * if tp_call is not overridden */
        if (!type->tp_call &&
            (base->tp_flags & _Py_TPFLAGS_HAVE_VECTORCALL) &&
            !(type->tp_flags & Py_TPFLAGS_HEAPTYPE))
        {
            type->tp_flags |= _Py_TPFLAGS_HAVE_VECTORCALL;
        }
        COPYSLOT(tp_call);
    }
    COPYSLOT(tp_str);
    {
        /* Copy comparison-related slots only when
           not overriding them anywhere */
        if (type->tp_richcompare == NULL &&
            type->tp_hash == NULL &&
            !overrides_hash(type))
        {
            type->tp_richcompare = base->tp_richcompare;
            type->tp_hash = base->tp_hash;
        }
    }
    {
        COPYSLOT(tp_iter);
        COPYSLOT(tp_iternext);
    }
    {
        COPYSLOT(tp_descr_get);
        /* Inherit Py_TPFLAGS_METHOD_DESCRIPTOR if tp_descr_get was inherited,
         * but only for extension types */
        if (base->tp_descr_get &&
            type->tp_descr_get == base->tp_descr_get &&
            !(type->tp_flags & Py_TPFLAGS_HEAPTYPE) &&
            (base->tp_flags & Py_TPFLAGS_METHOD_DESCRIPTOR))
        {
            type->tp_flags |= Py_TPFLAGS_METHOD_DESCRIPTOR;
        }
        COPYSLOT(tp_descr_set);
        COPYSLOT(tp_dictoffset);
        COPYSLOT(tp_init);
        COPYSLOT(tp_alloc);
        COPYSLOT(tp_is_gc);
        COPYSLOT(tp_finalize);
        if ((type->tp_flags & Py_TPFLAGS_HAVE_GC) ==
            (base->tp_flags & Py_TPFLAGS_HAVE_GC)) {
            /* They agree about gc. */
            COPYSLOT(tp_free);
        }
        else if ((type->tp_flags & Py_TPFLAGS_HAVE_GC) &&
                 type->tp_free == NULL &&
                 base->tp_free == PyObject_Free) {
            /* A bit of magic to plug in the correct default
             * tp_free function when a derived class adds gc,
             * didn't define tp_free, and the base uses the
             * default non-gc tp_free.
             */
            type->tp_free = PyObject_GC_Del;
        }
        /* else they didn't agree about gc, and there isn't something
         * obvious to be done -- the type is on its own.
         */
    }
}
```

* 类型初始化的最后阶段主要是进行一些校验工作：

    * 若当前类型是静态类型，那么其所有父类都必须是静态类型。因为静态类型在最终化后就不会发生修改，而堆类型在运行时可能会发生修改，若静态类型继承了堆类型，已经确定的槽的实现就需要动态计算，与期望特性矛盾。

    * 若当前类型属于 GC 类型，按照 @@supporting-cyclic-garbage-collection@@ 协议，则必须使类型的相关槽支持 GC 操作，如 @@tp_free@@ 需实现为如 @@CAPI_PyObject_GC_Del@@ 函数而不是从 object 继承来的 PyObject_Del()。

    * 文档属性的一致性，若类实例字典存在 \_\_doc__ 则同步设置到 @@tp_doc@@。无需反向设置是因为 type 实现的 \_\_doc__ 会动态从 @@tp_doc@@ 读取，那么静态类型无需将 \_\_doc__ 添加到类实例字典。而堆类型一般是向类实例字典设置文档，因而需要同步。类似地，若类实例字典 \_\_hash__ 为 *None* 则需同步 @@tp_hash@@ 为 PyObject_HashNotImplemented。

    * 若当前类型的各协议槽为 *NULL* 可能因为当前类没有相关主槽而不能做子槽继承，则直接继承自基类的主槽。类型初始化完毕后，还会将当前类加入到父类的 @@tp_subclasses@@ 中。父类对子类持有的是弱引用，持有所有子类是为了实现如成员访问的缓存失效等功能。同时 type 是支持 @@tp_weaklistoffset@@ 的，所以类型是允许弱引用的。

```c
// Objects/typeobject.c#PyType_Ready
int
PyType_Ready(PyTypeObject *type)
{
    ...

    /* All bases of statically allocated type should be statically allocated */
    if (!(type->tp_flags & Py_TPFLAGS_HEAPTYPE))
        for (i = 0; i < n; i++) {
            PyObject *b = PyTuple_GET_ITEM(bases, i);
            if (PyType_Check(b) &&
                (((PyTypeObject *)b)->tp_flags & Py_TPFLAGS_HEAPTYPE)) {
                PyErr_Format(PyExc_TypeError,
                             "type '%.100s' is not dynamically allocated but "
                             "its base type '%.100s' is dynamically allocated",
                             type->tp_name, ((PyTypeObject *)b)->tp_name);
                goto error;
            }
        }

    /* Sanity check for tp_free. */
    if (PyType_IS_GC(type) && (type->tp_flags & Py_TPFLAGS_BASETYPE) &&
        (type->tp_free == NULL || type->tp_free == PyObject_Del)) {  // GC 类型不能继承 object 的 tp_free
        /* This base class needs to call tp_free, but doesn't have
         * one, or its tp_free is for non-gc'ed objects.
         */
        PyErr_Format(PyExc_TypeError, "type '%.100s' participates in "
                     "gc and is a base type but has inappropriate "
                     "tp_free slot",
                     type->tp_name);
        goto error;
    }

    /* if the type dictionary doesn't contain a __doc__, set it from
       the tp_doc slot.
     */
    if (_PyDict_GetItemIdWithError(type->tp_dict, &PyId___doc__) == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        if (type->tp_doc != NULL) {
            const char *old_doc = _PyType_DocWithoutSignature(type->tp_name,
                type->tp_doc);
            PyObject *doc = PyUnicode_FromString(old_doc);
            if (doc == NULL)
                goto error;
            if (_PyDict_SetItemId(type->tp_dict, &PyId___doc__, doc) < 0) {
                Py_DECREF(doc);
                goto error;
            }
            Py_DECREF(doc);
        } else {
            if (_PyDict_SetItemId(type->tp_dict,
                                  &PyId___doc__, Py_None) < 0)
                goto error;
        }
    }

    /* Hack for tp_hash and __hash__.
       If after all that, tp_hash is still NULL, and __hash__ is not in
       tp_dict, set tp_hash to PyObject_HashNotImplemented and
       tp_dict['__hash__'] equal to None.
       This signals that __hash__ is not inherited.
     */
    if (type->tp_hash == NULL) {
        if (_PyDict_GetItemIdWithError(type->tp_dict, &PyId___hash__) == NULL) {
            if (PyErr_Occurred() ||
               _PyDict_SetItemId(type->tp_dict, &PyId___hash__, Py_None) < 0)
            {
                goto error;
            }
            type->tp_hash = PyObject_HashNotImplemented;
        }
    }

    /* Some more special stuff */
    base = type->tp_base;
    if (base != NULL) {
        if (type->tp_as_async == NULL)
            type->tp_as_async = base->tp_as_async;
        if (type->tp_as_number == NULL)
            type->tp_as_number = base->tp_as_number;
        if (type->tp_as_sequence == NULL)
            type->tp_as_sequence = base->tp_as_sequence;
        if (type->tp_as_mapping == NULL)
            type->tp_as_mapping = base->tp_as_mapping;
        if (type->tp_as_buffer == NULL)
            type->tp_as_buffer = base->tp_as_buffer;
    }

    /* Link into each base class's list of subclasses */
    bases = type->tp_bases;
    n = PyTuple_GET_SIZE(bases);
    for (i = 0; i < n; i++) {
        PyObject *b = PyTuple_GET_ITEM(bases, i);
        if (PyType_Check(b) &&
            add_subclass((PyTypeObject *)b, type) < 0)  // tp_subclasses
            goto error;
    }

    /* All done -- set the ready flag */
    type->tp_flags =
        (type->tp_flags & ~Py_TPFLAGS_READYING) | Py_TPFLAGS_READY;
    assert(_PyType_CheckConsistency(type));
    return 0;

  error:
    type->tp_flags &= ~Py_TPFLAGS_READYING;
    return -1;
}

// Objects/typeobject.c#add_subclass
static int
add_subclass(PyTypeObject *base, PyTypeObject *type)
{
// base.tp_subclasses[id(type)] = type
    int result = -1;
    PyObject *dict, *key, *newobj;

    dict = base->tp_subclasses;
    if (dict == NULL) {
        base->tp_subclasses = dict = PyDict_New();
        if (dict == NULL)
            return -1;
    }
    assert(PyDict_CheckExact(dict));
    key = PyLong_FromVoidPtr((void *) type);
    if (key == NULL)
        return -1;
    newobj = PyWeakref_NewRef((PyObject *)type, NULL);
    if (newobj != NULL) {
        result = PyDict_SetItem(dict, key, newobj);
        Py_DECREF(newobj);
    }
    Py_DECREF(key);
    return result;
}
```

总结来说，静态类型的构建是最直接的类型构建方式。其 @@PyTypeObject@@ 的设计可递归定义任意层类，type 和 object 的设计有效利用继承的思想将任意对象的构建、调用等行为统一到一起，简化系统的设计与开发。
