## 类成员的访问

对于任意对象，Python 层允许其后缀进行如 `obj.name` 的操作，称之为成员访问。如限定被访问对象为类对象，则称之为类成员访问。成员访问一般具有读和写两种操作，即成员获取和赋值，赋值的规则参考 @@grammer@@。另外，C 层也提供了如 @@CAPI_PyObject_Get-SetAttr@@ 的 API 来访问任意 @@PyObject@@ 对象成员。

```peg
atom_expr: [AWAIT] atom trailer*
atom: (
      '(' [yield_expr|testlist_comp] ')'
    | '[' [testlist_comp] ']' 
    | '{' [dictorsetmaker] '}' 
    | NAME | NUMBER | STRING+ | '...' | 'None' | 'True' | 'False'
)

trailer: 
      '(' [arglist] ')' 
    | '[' subscriptlist ']' 
    | '.' NAME  # obj.name 访问
```

对于获取对象的成员，如 @@CAPI_PyObject_GetAttr@@ 接口实现，其本质是调用该对象类型 @@tp_getattro@@ 槽的函数进行查找的。部分类型可能实现的是旧版 @@tp_getattr@@ 槽，其接收 char* 类型的的成员名称。相应地，如 @@CAPI_PyObject_SetAttr@@ 接口实现，成员赋值本质调用该类型 @@tp_setattro@@ 槽的函数进行设置。

```c
// Objects/object.c#PyObject_GetAttr
PyObject *
PyObject_GetAttr(PyObject *v, PyObject *name)
{
    PyTypeObject *tp = Py_TYPE(v);

    if (!PyUnicode_Check(name)) {
        PyErr_Format(PyExc_TypeError,
                     "attribute name must be string, not '%.200s'",
                     name->ob_type->tp_name);
        return NULL;
    }
    if (tp->tp_getattro != NULL)
        return (*tp->tp_getattro)(v, name);
    if (tp->tp_getattr != NULL) {
        const char *name_str = PyUnicode_AsUTF8(name);
        if (name_str == NULL)
            return NULL;
        return (*tp->tp_getattr)(v, (char *)name_str);
    }
    PyErr_Format(PyExc_AttributeError,
                 "'%.50s' object has no attribute '%U'",
                 tp->tp_name, name);
    return NULL;
}

// Objects/object.c#PyObject_SetAttr
int
PyObject_SetAttr(PyObject *v, PyObject *name, PyObject *value)
{
    PyTypeObject *tp = Py_TYPE(v);
    int err;

    if (!PyUnicode_Check(name)) {
        PyErr_Format(PyExc_TypeError,
                     "attribute name must be string, not '%.200s'",
                     name->ob_type->tp_name);
        return -1;
    }
    Py_INCREF(name);

    PyUnicode_InternInPlace(&name);
    if (tp->tp_setattro != NULL) {
        err = (*tp->tp_setattro)(v, name, value);
        Py_DECREF(name);
        return err;
    }
    if (tp->tp_setattr != NULL) {
        const char *name_str = PyUnicode_AsUTF8(name);
        if (name_str == NULL) {
            Py_DECREF(name);
            return -1;
        }
        err = (*tp->tp_setattr)(v, (char *)name_str, value);
        Py_DECREF(name);
        return err;
    }
    Py_DECREF(name);
    _PyObject_ASSERT(name, name->ob_refcnt >= 1);
    if (tp->tp_getattr == NULL && tp->tp_getattro == NULL)
        PyErr_Format(PyExc_TypeError,
                     "'%.100s' object has no attributes "
                     "(%s .%U)",
                     tp->tp_name,
                     value==NULL ? "del" : "assign to",
                     name);
    else
        PyErr_Format(PyExc_TypeError,
                     "'%.100s' object has only read-only attributes "
                     "(%s .%U)",
                     tp->tp_name,
                     value==NULL ? "del" : "assign to",
                     name);
    return -1;
}
```

在 Python 层面，对象成员访问由 @@LOAD-STORE_ATTR@@ 字节码完成，其内部又继续调用 @@CAPI_PyObject_Get-SetAttr@@ 接口。

```c
>>> dis("obj.name")
  1           0 LOAD_NAME                0 (obj)
              2 LOAD_ATTR                1 (name)
              4 RETURN_VALUE

>>> dis("obj.name = val")
  1           0 LOAD_NAME                0 (val)
              2 LOAD_NAME                1 (obj)
              4 STORE_ATTR               2 (name)
              6 LOAD_CONST               0 (None)
              8 RETURN_VALUE

// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    PyObject **stack_pointer;  // f->f_stacktop
    int opcode;                // Current opcode
    int oparg;                 // Current opcode argument, if any
    PyObject *names;           // f->f_code->co_names

main_loop:
    for (;;) {
        switch (opcode) {
        
        case TARGET(LOAD_ATTR): {
            PyObject *name = GETITEM(names, oparg);
            PyObject *owner = TOP();
            PyObject *res = PyObject_GetAttr(owner, name);
            Py_DECREF(owner);
            SET_TOP(res);
            if (res == NULL)
                goto error;
            DISPATCH();
        }

        case TARGET(STORE_ATTR): {
            PyObject *name = GETITEM(names, oparg);
            PyObject *owner = TOP();
            PyObject *v = SECOND();
            int err;
            STACK_SHRINK(2);
            err = PyObject_SetAttr(owner, name, v);
            Py_DECREF(v);
            Py_DECREF(owner);
            if (err != 0)
                goto error;
            DISPATCH();
        }

        }
    }
}
```

对于类对象，仅考虑一般情况，类的元类是 type，那么访问类对象的成员时会分别调用 @@PyType_Type@@ 中实现的 type_getattr() 和 type_setattro() 函数来完成。另外，由于描述器与成员访问系统关联紧密，在进一步分析之前，建议先了解 @@descr@@ 的基础概念。

```c
// Objects/typeobject.c#PyType_Type
PyTypeObject PyType_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "type",                                     /* tp_name */
    ...
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    ...
    (getattrofunc)type_getattro,                /* tp_getattro */
    (setattrofunc)type_setattro,                /* tp_setattro */
    ...
};
```

[[class-member-getattro.md]]

[[class-member-setattro.md]]

[[class-member-cases.md]]
