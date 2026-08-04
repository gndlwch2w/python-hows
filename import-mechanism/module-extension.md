### 扩展模块

除 Python 层通过 `import` 语法隐式创建 @@PyModule_Type@@ 类型对象，也可在 C 层直接创建模块，如 builtins 等许多内置模块都是这样实现的。具体来说，先通过模块定义 @@PyModuleDef@@ 进行声明模块包含的内容，如模块名称、方法等。注意，方法定义声明的函数第一个参数为 *self* 对象，表明为模块对象的方法。模块定义的头部包含导入模块的实现字段，如 *m_index* 为查找模块的快速索引。

```c
// Include/moduleobject.h#PyModuleDef_Base
typedef struct PyModuleDef_Base {
    PyObject_HEAD
    /*  旧模块初始化函数，指向 PyInit_xxx */
    PyObject* (*m_init)(void);
    
    /* 模块在内部表中的索引，配合 InterpreterState.modules_by_index 使用。
       当 m_index 为 0 时，会在 PyModuleDef_Init 中分配一个新的索引值 */
    Py_ssize_t m_index;
    /* 模块 __dict__ 的副本，用于重复导入时恢复模块状态 */
    PyObject* m_copy;
} PyModuleDef_Base;

// Include/moduleobject.h#PyModuleDef
typedef struct PyModuleDef {
	PyModuleDef_Base m_base;
	const char* m_name;                // 模块的名称
	const char* m_doc;                 // 模块的文档字符串
	Py_ssize_t m_size;                 // 模块解释器级私有内存大小
	PyMethodDef *m_methods;            // 模块函数表
	struct PyModuleDef_Slot* m_slots;  // 多阶段初始化函数表
	traverseproc m_traverse;           // GC 遍历函数
	inquiry m_clear;                   // GC 清理函数
	freefunc m_free;                   // 模块销毁函数
} PyModuleDef;

// Include/moduleobject.h#PyModuleDef_HEAD_INIT
#define PyModuleDef_HEAD_INIT { \
    PyObject_HEAD_INIT(NULL)    \
    NULL, /* m_init */          \
    0,    /* m_index */         \
    NULL, /* m_copy */          \
  }

// Python/bltinmodule.c#builtinsmodule
static struct PyModuleDef builtinsmodule = {
    PyModuleDef_HEAD_INIT,
    "builtins",
    builtin_doc,
    -1, /* multiple "initialization" just copies the module dict. */
    builtin_methods,
    NULL,
    NULL,
    NULL,
    NULL
};

// Python/bltinmodule.c#builtin_methods
static PyMethodDef builtin_methods[] = {
    {"__build_class__", (PyCFunction)(void(*)(void))builtin___build_class__,
     METH_FASTCALL | METH_KEYWORDS, build_class_doc},
    {"__import__",      (PyCFunction)(void(*)(void))builtin___import__, METH_VARARGS | METH_KEYWORDS, import_doc},
    ...
}
```

扩展模块 `.c` 文件内还需提供形如 `PyInit_<module-name>()` 的函数，以支持 `import` 语法对其进行导入时进行模块初始化。builtins 模块较为特殊，其在 Python 启动时会自动调用 _PyBuiltin_Init() 进行初始化，以及通常只会初始化一次，`import` 后续只会从 `sys.modules` 中读取，没有遵从该协定也无关紧要。初始化函数需要返回 PyModuleObject 对象，通常先由 @@CAPI_PyModule_Create@@ 接口完成从 @@PyModuleDef@@ 构建 PyModuleObject，然后在自定义设定其它成员后返回。

```c
// Python/bltinmodule.c#_PyBuiltin_Init
PyObject *
_PyBuiltin_Init(void)
{
    PyObject *mod, *dict, *debug;

    const PyConfig *config = &_PyInterpreterState_GET_UNSAFE()->config;

    if (PyType_Ready(&PyFilter_Type) < 0 ||
        PyType_Ready(&PyMap_Type) < 0 ||
        PyType_Ready(&PyZip_Type) < 0)
        return NULL;

    mod = _PyModule_CreateInitialized(&builtinsmodule, PYTHON_API_VERSION);
    if (mod == NULL)
        return NULL;
    dict = PyModule_GetDict(mod);

#ifdef Py_TRACE_REFS
    /* "builtins" exposes a number of statically allocated objects
     * that, before this code was added in 2.3, never showed up in
     * the list of "all objects" maintained by Py_TRACE_REFS.  As a
     * result, programs leaking references to None and False (etc)
     * couldn't be diagnosed by examining sys.getobjects(0).
     */
#define ADD_TO_ALL(OBJECT) _Py_AddToAllObjects((PyObject *)(OBJECT), 0)
#else
#define ADD_TO_ALL(OBJECT) (void)0
#endif

#define SETBUILTIN(NAME, OBJECT) \
    if (PyDict_SetItemString(dict, NAME, (PyObject *)OBJECT) < 0)       \
        return NULL;                                                    \
    ADD_TO_ALL(OBJECT)

    SETBUILTIN("None",                  Py_None);
    SETBUILTIN("Ellipsis",              Py_Ellipsis);
    ...
    SETBUILTIN("zip",                   &PyZip_Type);
    debug = PyBool_FromLong(config->optimization_level == 0);
    if (PyDict_SetItemString(dict, "__debug__", debug) < 0) {
        Py_DECREF(debug);
        return NULL;
    }
    Py_DECREF(debug);

    return mod;
#undef ADD_TO_ALL
#undef SETBUILTIN
}
```

_PyModule_CreateInitialized() 是 @@CAPI_PyModule_Create@@ 的具体实现，

* `PyModuleDef.m_base` 属于内部字段，PyModuleDef_Init() 首先对其进行初始化，其中为 C 模块分配 *m_index* 索引。所有基于 C 实现的模块该索引都有效，解释器会持有一个索引到模块对象的映射以加速对模块的访问。

* `PyModuleDef.m_slots` 是多阶段初始化模块的配置，其配合 `import` 语法进行工作，而形如 builtins 等未实现 *m_slots* 的模块称单阶段初始化模块，其 `PyInit_<module-name>()` 函数返回的是 PyModuleObject，而多阶段初始化返回的是 @@PyModuleDef@@，故 @@CAPI_PyModule_Create@@ 不支持创建多阶段初始化模块。

* 对于 C 模块，自动设置其包名较麻烦。在导入该模块时，会推导出模块的包名并设置到 *_Py_PackageContext* 变量，那么后面创建模块对象时就能构建正确的模块名称。

```c
// Objects/moduleobject.c#_PyModule_CreateInitialized
PyObject *
_PyModule_CreateInitialized(struct PyModuleDef* module, int module_api_version)
{
    const char* name;
    PyModuleObject *m;

    if (!PyModuleDef_Init(module))
        return NULL;
    name = module->m_name;
    if (!check_api_version(name, module_api_version)) {
        return NULL;
    }
    if (module->m_slots) {  // 直接创建模块的不支持多阶段初始化
        PyErr_Format(
            PyExc_SystemError,
            "module %s: PyModule_Create is incompatible with m_slots", name);
        return NULL;
    }
    /* Make sure name is fully qualified.

       This is a bit of a hack: when the shared library is loaded,
       the module name is "package.module", but the module calls
       PyModule_Create*() with just "module" for the name.  The shared
       library loader squirrels away the true name of the module in
       _Py_PackageContext, and PyModule_Create*() will substitute this
       (if the name actually matches).
    */
    // 对于 C 实现的包内模块，在加载时会将模块的全名保存在 _Py_PackageContext 中
    // 然后在创建模块对象时，即执行到这里，若模块名与其匹配，则作为该模块的全量名
    if (_Py_PackageContext != NULL) {
        const char *p = strrchr(_Py_PackageContext, '.');
        if (p != NULL && strcmp(module->m_name, p+1) == 0) {
            name = _Py_PackageContext;
            _Py_PackageContext = NULL;
        }
    }
    if ((m = (PyModuleObject*)PyModule_New(name)) == NULL)  // types.ModuleType(name)
        return NULL;

    if (module->m_size > 0) {  // 模块私有内存空间
        m->md_state = PyMem_MALLOC(module->m_size);
        if (!m->md_state) {
            PyErr_NoMemory();
            Py_DECREF(m);
            return NULL;
        }
        memset(m->md_state, 0, module->m_size);
    }

    if (module->m_methods != NULL) {  // m.setattr(name, method)
        if (PyModule_AddFunctions((PyObject *) m, module->m_methods) != 0) {
            Py_DECREF(m);
            return NULL;
        }
    }
    if (module->m_doc != NULL) {  // m.__doc__ = doc
        if (PyModule_SetDocString((PyObject *) m, module->m_doc) != 0) {
            Py_DECREF(m);
            return NULL;
        }
    }
    m->md_def = module;
    return (PyObject*)m;
}

// Objects/moduleobject.c#PyModuleDef_Init
PyObject*
PyModuleDef_Init(struct PyModuleDef* def)
{
    if (PyType_Ready(&PyModuleDef_Type) < 0)
         return NULL;
    if (def->m_base.m_index == 0) {
        max_module_number++;
        Py_REFCNT(def) = 1;
        Py_TYPE(def) = &PyModuleDef_Type;
        def->m_base.m_index = max_module_number;
    }
    return (PyObject*)def;
}
```

* @@CAPI_PyModule_New@@ 创建模块时，会在对象实例字典中初始化模块对象特有的成员。若成员有值，则会在后续中覆盖。

```c
// Objects/moduleobject.c#PyModuleObject
typedef struct {
    PyObject_HEAD
    PyObject *md_dict;
    struct PyModuleDef *md_def;
    void *md_state;
    PyObject *md_weaklist;
    PyObject *md_name;  /* for logging purposes after md_dict is cleared */
} PyModuleObject;

// Objects/moduleobject.c#PyModule_New
PyObject *
PyModule_New(const char *name)
{
    PyObject *nameobj, *module;
    nameobj = PyUnicode_FromString(name);
    if (nameobj == NULL)
        return NULL;
    module = PyModule_NewObject(nameobj);
    Py_DECREF(nameobj);
    return module;
}

// Objects/moduleobject.c#PyModule_NewObject
PyObject *
PyModule_NewObject(PyObject *name)
{
    PyModuleObject *m;
    m = PyObject_GC_New(PyModuleObject, &PyModule_Type);
    if (m == NULL)
        return NULL;
    m->md_def = NULL;
    m->md_state = NULL;
    m->md_weaklist = NULL;
    m->md_name = NULL;
    m->md_dict = PyDict_New();
    if (module_init_dict(m, m->md_dict, name, NULL) != 0)
        goto fail;
    PyObject_GC_Track(m);
    return (PyObject *)m;

 fail:
    Py_DECREF(m);
    return NULL;
}

// Objects/moduleobject.c#module_init_dict
static int
module_init_dict(PyModuleObject *mod, PyObject *md_dict,
                 PyObject *name, PyObject *doc)
{
    _Py_IDENTIFIER(__name__);
    _Py_IDENTIFIER(__doc__);
    _Py_IDENTIFIER(__package__);
    _Py_IDENTIFIER(__loader__);
    _Py_IDENTIFIER(__spec__);

    if (md_dict == NULL)
        return -1;
    if (doc == NULL)
        doc = Py_None;

    if (_PyDict_SetItemId(md_dict, &PyId___name__, name) != 0)
        return -1;
    if (_PyDict_SetItemId(md_dict, &PyId___doc__, doc) != 0)
        return -1;
    if (_PyDict_SetItemId(md_dict, &PyId___package__, Py_None) != 0)
        return -1;
    if (_PyDict_SetItemId(md_dict, &PyId___loader__, Py_None) != 0)
        return -1;
    if (_PyDict_SetItemId(md_dict, &PyId___spec__, Py_None) != 0)
        return -1;
    if (PyUnicode_CheckExact(name)) {
        Py_INCREF(name);
        Py_XSETREF(mod->md_name, name);
    }

    return 0;
}
```

* 定义在 *m_methods* 中的 C 方法声明会逐一封装为 PyCFunctionObject 对象暴露到模块对象的 \_\_dict__ 中。

```c
// Objects/moduleobject.c#_PyModule_CreateInitialized
PyObject *
_PyModule_CreateInitialized(struct PyModuleDef* module, int module_api_version)
{
    ...

    if (module->m_methods != NULL) {  // m.setattr(name, method)
        if (PyModule_AddFunctions((PyObject *) m, module->m_methods) != 0) {
            Py_DECREF(m);
            return NULL;
        }
    }
    if (module->m_doc != NULL) {  // m.__doc__ = doc
        if (PyModule_SetDocString((PyObject *) m, module->m_doc) != 0) {
            Py_DECREF(m);
            return NULL;
        }
    }
    m->md_def = module;
    return (PyObject*)m;
}

// Objects/moduleobject.c#PyModule_AddFunctions
int
PyModule_AddFunctions(PyObject *m, PyMethodDef *functions)
{
    int res;
    PyObject *name = PyModule_GetNameObject(m);
    if (name == NULL) {
        return -1;
    }

    res = _add_methods_to_object(m, name, functions);
    Py_DECREF(name);
    return res;
}

// Objects/moduleobject.c#_add_methods_to_object
static int
_add_methods_to_object(PyObject *module, PyObject *name, PyMethodDef *functions)
{
    PyObject *func;
    PyMethodDef *fdef;

    // 模块内的 C 函数类似定义在类中的方法，self 是模块对象本身
    // 而 Python 模块中定义的函数则是普通函数
    for (fdef = functions; fdef->ml_name != NULL; fdef++) {
        if ((fdef->ml_flags & METH_CLASS) ||
            (fdef->ml_flags & METH_STATIC)) {
            PyErr_SetString(PyExc_ValueError,
                            "module functions cannot set"
                            " METH_CLASS or METH_STATIC");
            return -1;
        }
        // def func(module, args, kwargs): ...
        func = PyCFunction_NewEx(fdef, (PyObject*)module, name);
        if (func == NULL) {
            return -1;
        }
        // module.func = func
        if (PyObject_SetAttrString(module, fdef->ml_name, func) != 0) {
            Py_DECREF(func);
            return -1;
        }
        Py_DECREF(func);
    }

    return 0;
}
```
