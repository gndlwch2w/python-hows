### 堆类型的创建

在运行时动态创建的类型统称为 @@heap-types@@，Python 层最常见创建堆类型的方式即通过 `class` 语法，下面分析该关键字的实现。观察如下语法规则，类名后允许跟着类似函数调用时传递的参数列表。类体允许定义多条简单语句或复杂语句，其类似函数体作为独立的 @@structure-of-a-program@@。

```peg
classdef: 'class' NAME ['(' [arglist] ')'] ':' suite
suite: simple_stmt | NEWLINE INDENT stmt+ DEDENT
stmt: simple_stmt | compound_stmt

simple_stmt: small_stmt (';' small_stmt)* [';'] NEWLINE
small_stmt: (expr_stmt | del_stmt | pass_stmt | flow_stmt |
             import_stmt | global_stmt | nonlocal_stmt | assert_stmt)
expr_stmt: testlist_star_expr (annassign | augassign (yield_expr|testlist) |
                     [('=' (yield_expr|testlist_star_expr))+ [TYPE_COMMENT]] )
annassign: ':' test ['=' (yield_expr|testlist_star_expr)]
testlist_star_expr: (test|star_expr) (',' (test|star_expr))* [',']
augassign: ('+=' | '-=' | '*=' | '@=' | '/=' | '%=' | '&=' | '|=' | '^=' |
            '<<=' | '>>=' | '**=' | '//=')

compound_stmt: if_stmt | while_stmt | for_stmt | try_stmt | with_stmt | funcdef | classdef | decorated | async_stmt
```

基于语法规则构建如下演示类 MyClass 分析 `class` 的实现机制。

* 参数列表部分允许位置传参和关键字传参。位置传参表明继承的父类，关键字传参可控制类构建行为，如通过 *metaclass* 设置元类。类体与函数体类似，即可声明文档、定义属性和嵌套函数。

* 除 `@staticmethod` 修饰的函数外，其他函数的第一个参数会视作为 *self* 或 *cls* 且无需手动传参，表明实例方法或类方法。如 \_\_new__() 等特殊方法无需 `@classmethod` 标识第一个参数为 *cls*，在类构建期间会检查和装饰。更多的特殊方法定义在 @@special-method-names@@，实现它们会使得类支持对应特性，如实现了 @@__add__@@ 则类实例允许加法操作。

```python
class MyClass(Base, Parent1, Parent2, metaclass=MyMeta):
    """MyClass docstring"""

    a = 0                               # 类变量
    __slots__ = ("b", "c", "__dict__")  # 实例属性成员声明表

    def __init__(self, b): 
        self.b = b                      # 实例变量

    def __new__(cls, b):                # 覆盖 object 的 __new__
        return super().__new__(cls)

    def f(self, *args, **kwargs):       # 实例方法
        pass
    
    @classmethod
    def g(cls, *args, **kwargs):        # 类方法
        pass
    
    @staticmethod
    def z(*args, **kwargs):             # 静态方法
        pass

    def __add__(self, other):           # 覆盖 C 槽方法
        pass
```

MyClass 类定义字节码如下所示，先由 @@LOAD_BUILD_CLASS@@ 字节码将 builtins.\_\_build_class__() 函数压入值栈，然后再由 @@MAKE_FUNCTION@@ 将类体 @@codeobject@@ 创建名为 MyClass() 的函数压入值栈，接着将类名 `"MyClass"` 和参数列表压入值栈，最后由 @@CALL_FUNCTION_KW@@ 字节码调用 \_\_build_class__() 函数构建类，然后存储到声明类的命名空间中。有关函数的创建和调用的实现可参考 @@function@@。

```python
>>> dis("class MyClass(Base, ...")
  3           0 LOAD_BUILD_CLASS
              2 LOAD_CONST               0 (<code object MyClass at 0x1017c2870, line 3>)
              4 LOAD_CONST               1 ('MyClass')
              6 MAKE_FUNCTION            0
              8 LOAD_CONST               1 ('MyClass')
             10 LOAD_NAME                0 (Base)
             12 LOAD_NAME                1 (Parent1)
             14 LOAD_NAME                2 (Parent2)
             16 LOAD_NAME                3 (MyMeta)
             18 LOAD_CONST               2 (('metaclass',))
             20 CALL_FUNCTION_KW         6
             22 STORE_NAME               4 (MyClass)
             24 LOAD_CONST               3 (None)
             26 RETURN_VALUE

Disassembly of <code object MyClass at 0x1017c2870, line 3>:   ...
Disassembly of <code object __init__ at 0x1017c2450, line 7>:  ...
Disassembly of <code object __new__ at 0x1017c2500, line 9>:   ...
Disassembly of <code object f at 0x100efa0e0, line 13>:        ...
Disassembly of <code object g at 0x100efa190, line 15>:        ...
Disassembly of <code object z at 0x100efa240, line 18>:        ...
Disassembly of <code object __add__ at 0x100efa2f0, line 21>:  ...
```

\_\_build_class__() 由 `builtin___build_class__(self, args, nargs, kwnames)` 实现，调用时 @@CALL_FUNCTION_KW@@ 会将值栈的参数转换为 C 函数的参数格式传入，其中 *args* 为 `{MyClass(), "MyClass", Base, Parent1, Parent2, MyMeta}` 数组，*nargs* 为 *args* 的长度。*kwnames* 为关键字参数的键 `("metatype",)`，若没有则为 *NULL*。

* \_\_build_class__() 是衔接 `class` 与 @@type@@ 的中间接口，即 \_\_build_class__() 负责将 `class` 输出转换为 @@type[1]@@ 的输入来创建类型。类名 *name* 和父类 *bases* 通过参数 *args* 传递进来，可直接获得。类成员需要通过 *ns* 字典传入，但 *args* 给的是类体函数，需执行该函数以获得其中定义的成员。

```c
// Python/bltinmodule.c#builtin___build_class__
static PyObject *
builtin___build_class__(PyObject *self, PyObject *const *args, Py_ssize_t nargs,
                        PyObject *kwnames)
{
    PyObject *func, *name, *winner, *prep;
    PyObject *cls = NULL, *cell = NULL, *ns = NULL, *meta = NULL, *orig_bases = NULL;
    PyObject *mkw = NULL, *bases = NULL;
    int isclass = 0;   /* initialize to prevent gcc warning */

    if (nargs < 2) {
        PyErr_SetString(PyExc_TypeError,
                        "__build_class__: not enough arguments");
        return NULL;
    }
    func = args[0];   /* Better be callable */
    if (!PyFunction_Check(func)) {
        PyErr_SetString(PyExc_TypeError,
                        "__build_class__: func must be a function");
        return NULL;
    }
    name = args[1];
    if (!PyUnicode_Check(name)) {
        PyErr_SetString(PyExc_TypeError,
                        "__build_class__: name is not a string");
        return NULL;
    }
    orig_bases = _PyTuple_FromArray(args + 2, nargs - 2);  // 原始基类
    if (orig_bases == NULL)
        return NULL;

    bases = update_bases(orig_bases, args + 2, nargs - 2);  // 展开 __mro_entries__ 后的基类
    if (bases == NULL) {
        Py_DECREF(orig_bases);
        return NULL;
    }

    if (kwnames == NULL) {
        meta = NULL;
        mkw = NULL;
    }
    else {
        mkw = _PyStack_AsDict(args + nargs, kwnames);
        if (mkw == NULL) {
            goto error;
        }

        // A(*bases, metaclass=Meta)
        meta = _PyDict_GetItemIdWithError(mkw, &PyId_metaclass);
        if (meta != NULL) {
            Py_INCREF(meta);
            if (_PyDict_DelItemId(mkw, &PyId_metaclass) < 0) {
                goto error;
            }
            /* metaclass is explicitly given, check if it's indeed a class */
            isclass = PyType_Check(meta);
        }
        else if (PyErr_Occurred()) {
            goto error;
        }
    }
    if (meta == NULL) {
        /* if there are no bases, use type: */
        if (PyTuple_GET_SIZE(bases) == 0) {
            meta = (PyObject *) (&PyType_Type);
        }
        /* else get the type of the first base */
        else {
            PyObject *base0 = PyTuple_GET_ITEM(bases, 0);
            meta = (PyObject *) (base0->ob_type);
        }
        Py_INCREF(meta);
        isclass = 1;  /* meta is really a class */
    }

    if (isclass) {
        /* meta is really a class, so check for a more derived
           metaclass, or possible metaclass conflicts: */
        winner = (PyObject *)_PyType_CalculateMetaclass((PyTypeObject *)meta,
                                                        bases);
        if (winner == NULL) {
            goto error;
        }
        if (winner != meta) {
            Py_DECREF(meta);
            meta = winner;
            Py_INCREF(meta);
        }
    }
    /* else: meta is not a class, so we cannot do the metaclass
       calculation, so we will use the explicitly given object as it is */
    // type.__prepare__(name, bases, **kwds) 创建类的命名空间
    if (_PyObject_LookupAttrId(meta, &PyId___prepare__, &prep) < 0) {
        ns = NULL;
    }
    else if (prep == NULL) {
        ns = PyDict_New();
    }
    else {
        PyObject *pargs[2] = {name, bases};
        ns = _PyObject_FastCallDict(prep, pargs, 2, mkw);
        Py_DECREF(prep);
    }
    if (ns == NULL) {
        goto error;
    }
    if (!PyMapping_Check(ns)) {
        PyErr_Format(PyExc_TypeError,
                     "%.200s.__prepare__() must return a mapping, not %.200s",
                     isclass ? ((PyTypeObject *)meta)->tp_name : "<metaclass>",
                     Py_TYPE(ns)->tp_name);
        goto error;
    }
    // 类初始化函数返回 __class__ cell
    cell = PyEval_EvalCodeEx(PyFunction_GET_CODE(func), PyFunction_GET_GLOBALS(func), ns,
                             NULL, 0, NULL, 0, NULL, 0, NULL,
                             PyFunction_GET_CLOSURE(func));
    if (cell != NULL) {
        if (bases != orig_bases) {
            if (PyMapping_SetItemString(ns, "__orig_bases__", orig_bases) < 0) {
                goto error;
            }
        }
        // 确保 __class__ cell 被正确设置为 cls
        PyObject *margs[3] = {name, bases, ns};
        cls = _PyObject_FastCallDict(meta, margs, 3, mkw);
        if (cls != NULL && PyType_Check(cls) && PyCell_Check(cell)) {
            PyObject *cell_cls = PyCell_GET(cell);
            if (cell_cls != cls) {
                if (cell_cls == NULL) {
                    const char *msg =
                        "__class__ not set defining %.200R as %.200R. "
                        "Was __classcell__ propagated to type.__new__?";
                    PyErr_Format(PyExc_RuntimeError, msg, name, cls);
                } else {
                    const char *msg =
                        "__class__ set to %.200R defining %.200R as %.200R";
                    PyErr_Format(PyExc_TypeError, msg, cell_cls, name, cls);
                }
                Py_DECREF(cls);
                cls = NULL;
                goto error;
            }
        }
    }
error:
    Py_XDECREF(cell);
    Py_XDECREF(ns);
    Py_XDECREF(meta);
    Py_XDECREF(mkw);
    if (bases != orig_bases) {
        Py_DECREF(orig_bases);
    }
    Py_DECREF(bases);
    return cls;
}
```

* `class` 的位置参数除可传递如 object 的类型对象外，还能传递实现了 @@__mro_entries__@@ 方法的普通对象，那么所继承的父类则是对象该方法的返回值，该接口在 @@PEP-560@@ 中为实现 typing 而设计。update_bases() 即负责由 @@__mro_entries__[1]@@ 将非类型对象展开，对于没有实现该接口的对象则保持不变待后续处理。

```c
// Python/bltinmodule.c#update_bases
static PyObject*
update_bases(PyObject *bases, PyObject *const *args, Py_ssize_t nargs)
{
    Py_ssize_t i, j;
    PyObject *base, *meth, *new_base, *result, *new_bases = NULL;
    PyObject *stack[1] = {bases};
    assert(PyTuple_Check(bases));

    for (i = 0; i < nargs; i++) {
        base  = args[i];
        // 判断是否为类型对象
        if (PyType_Check(base)) {
            if (new_bases) {
                /* If we already have made a replacement, then we append every normal base,
                   otherwise just skip it. */
                if (PyList_Append(new_bases, base) < 0) {
                    goto error;
                }
            }
            continue;
        }
        // obj.__mro_entries__(ori_bases) 返回一个 tuple
        if (_PyObject_LookupAttrId(base, &PyId___mro_entries__, &meth) < 0) {
            goto error;
        }
        if (!meth) {
            if (new_bases) {
                if (PyList_Append(new_bases, base) < 0) {
                    goto error;
                }
            }
            continue;
        }
        new_base = _PyObject_FastCall(meth, stack, 1);
        Py_DECREF(meth);
        if (!new_base) {
            goto error;
        }
        if (!PyTuple_Check(new_base)) {
            PyErr_SetString(PyExc_TypeError,
                            "__mro_entries__ must return a tuple");
            Py_DECREF(new_base);
            goto error;
        }
        // 替换原来位置的 obj 为 __mro_entries__() 返回的类型
        if (!new_bases) {
            /* If this is a first successful replacement, create new_bases list and
               copy previously encountered bases. */
            if (!(new_bases = PyList_New(i))) {
                Py_DECREF(new_base);
                goto error;
            }
            for (j = 0; j < i; j++) {
                base = args[j];
                PyList_SET_ITEM(new_bases, j, base);
                Py_INCREF(base);
            }
        }
        j = PyList_GET_SIZE(new_bases);
        if (PyList_SetSlice(new_bases, j, j, new_base) < 0) {
            Py_DECREF(new_base);
            goto error;
        }
        Py_DECREF(new_base);
    }
    if (!new_bases) {
        return bases;
    }
    result = PyList_AsTuple(new_bases);
    Py_DECREF(new_bases);
    return result;

error:
    Py_XDECREF(new_bases);
    return NULL;
}
```

* `class` 的关键字参数中允许通过 *metaclass* 设置元类，如没有传递则采用父类的元类。一般情况下，会在父类中找出最具体的元类作为当前类的元类，即它是所有其它父类元类的子类。若当前类没有声明父类，则默认采用 object 的元类 type 作为元类。

```c
// Objects/typeobject.c#_PyType_CalculateMetaclass
/* Determine the most derived metatype. */
PyTypeObject *
_PyType_CalculateMetaclass(PyTypeObject *metatype, PyObject *bases)
{
    Py_ssize_t i, nbases;
    PyTypeObject *winner;
    PyObject *tmp;
    PyTypeObject *tmptype;

    /* Determine the proper metatype to deal with this,
       and check for metatype conflicts while we're at it.
       Note that if some other metatype wins to contract,
       it's possible that its instances are not types. */

    nbases = PyTuple_GET_SIZE(bases);
    winner = metatype;
    for (i = 0; i < nbases; i++) {
        tmp = PyTuple_GET_ITEM(bases, i);
        tmptype = Py_TYPE(tmp);
        if (PyType_IsSubtype(winner, tmptype))
            continue;
        if (PyType_IsSubtype(tmptype, winner)) {
            winner = tmptype;
            continue;
        }
        /* else: */
        PyErr_SetString(PyExc_TypeError,
                        "metaclass conflict: "
                        "the metaclass of a derived class "
                        "must be a (non-strict) subclass "
                        "of the metaclasses of all its bases");
        return NULL;
    }
    return winner;
}
```

* @@type[1]@@ 需接收一个字典来为类型初始化成员，而 `class` 编译后的结果为类体函数，需想办法获得类体函数执行期间的局部变量。

    * 类体的 @@codeobject@@ 区别于普通函数体，其没有 @@CO_OPTIMIZED@@ 标记，那么局部变量的访问由 @@LOAD-STORE_NAME@@ 字节码完成，即会写入到 @@frameobject@@ 的 *f_locals* 字典中。同时，其没有 @@CO_NEWLOCALS@@ 标记，那么在构建 @@frameobject@@ 时可手动设置 *f_locals* 字典，待 @@frameobject@@ 执行结束后，设置的字典中就会包含类体中定义的局部变量。有关 @@frameobject@@ 的构建与执行可参考 @@function-invocation@@。
    
    * 具体来说，类体函数由 @@CAPI_PyEval_EvalCodeEx@@ 接口执行，其中需额外传递 *locals*、*globals* 和 *closure* 参数。*locals* 由元类的 @@preparing-the-class-namespace@@ 构建，通常为空字典对象，用作类体执行期间的局部命名空间字典。*globals* 为类所在模块的全局命名空间字典，因此类体看得见模块中定义的变量。*closure* 为类体函数所需的 free 闭包变量，通常为 *NULL*。

```c
// Python/bltinmodule.c#builtin___build_class__
static PyObject *
builtin___build_class__(PyObject *self, PyObject *const *args, Py_ssize_t nargs,
                        PyObject *kwnames)
{
    ...

    if (_PyObject_LookupAttrId(meta, &PyId___prepare__, &prep) < 0) {
        ns = NULL;
    }
    else if (prep == NULL) {
        ns = PyDict_New();
    }
    else {
        PyObject *pargs[2] = {name, bases};
        ns = _PyObject_FastCallDict(prep, pargs, 2, mkw);
        Py_DECREF(prep);
    }
    if (ns == NULL) {
        goto error;
    }
    if (!PyMapping_Check(ns)) {
        PyErr_Format(PyExc_TypeError,
                     "%.200s.__prepare__() must return a mapping, not %.200s",
                     isclass ? ((PyTypeObject *)meta)->tp_name : "<metaclass>",
                     Py_TYPE(ns)->tp_name);
        goto error;
    }
    // 类初始化函数返回 __class__ cell
    cell = PyEval_EvalCodeEx(PyFunction_GET_CODE(func), PyFunction_GET_GLOBALS(func), ns,
                             NULL, 0, NULL, 0, NULL, 0, NULL,
                             PyFunction_GET_CLOSURE(func));
    
    ...
}
```

* 如下是 MyClass 类体的 @@codeobject@@ 字节码表示，其中：

    * 除显式定义的成员外，还隐式添加了 \_\_name__ 和 \_\_qualname__ 局部变量，取值为所处模块名称 \_\_module__ 和类名称 MyClass。另外，类文档会保存到 \_\_doc__ 局部变量中。

    * 其余显式定义的变量或函数都会由 @@STORE_NAME@@ 设置到局部变量字典中。注意到，在构建 \_\_new__() 时还传递了 \_\_class__ 闭包变量，因为其函数体间接访问了该变量，即 super() 需要该变量访问当前类型。该变量由类体提供，即类体 @@codeobject@@ 的 *cellvars* 为 `("__class__",)`，会在类体执行期间为其创建 @@cell-objects@@ 以供 @@LOAD_CLOSURE@@ 读取。但该 @@cell-objects@@ 此时还是空的，需要在类构建完成时才能设置真实类对象到其中，为此会将该对象设置到局部变量字典的 *\_\_classcell__* 中并返回。

```python
Disassembly of <code object MyClass at 0x1017c2870, line 3>:
  3           0 LOAD_NAME                0 (__name__)
              2 STORE_NAME               1 (__module__)
              4 LOAD_CONST               0 ('MyClass')
              6 STORE_NAME               2 (__qualname__)

  4           8 LOAD_CONST               1 ('MyClass docstring')
             10 STORE_NAME               3 (__doc__)

  5          12 LOAD_CONST               2 (0)
             14 STORE_NAME               4 (a)

  6          16 LOAD_CONST               3 (('b', 'c', '__dict__'))
             18 STORE_NAME               5 (__slots__)

  7          20 LOAD_CONST               4 (<code object __init__ at 0x1017c2450, line 7>)
             22 LOAD_CONST               5 ('MyClass.__init__')
             24 MAKE_FUNCTION            0
             26 STORE_NAME               6 (__init__)

  9          28 LOAD_CLOSURE             0 (__class__)
             30 BUILD_TUPLE              1
             32 LOAD_CONST               6 (<code object __new__ at 0x1017c2500, line 9>)
             34 LOAD_CONST               7 ('MyClass.__new__')
             36 MAKE_FUNCTION            8 (closure)
             38 STORE_NAME               7 (__new__)

 11          40 LOAD_CONST               8 (<code object f at 0x1017c25b0, line 11>)
             42 LOAD_CONST               9 ('MyClass.f')
             44 MAKE_FUNCTION            0
             46 STORE_NAME               8 (f)

 13          48 LOAD_NAME                9 (classmethod)

 14          50 LOAD_CONST              10 (<code object g at 0x1017c2660, line 13>)
             52 LOAD_CONST              11 ('MyClass.g')
             54 MAKE_FUNCTION            0
             56 CALL_FUNCTION            1
             58 STORE_NAME              10 (g)

 16          60 LOAD_NAME               11 (staticmethod)

 17          62 LOAD_CONST              12 (<code object z at 0x1017c2710, line 16>)
             64 LOAD_CONST              13 ('MyClass.z')
             66 MAKE_FUNCTION            0
             68 CALL_FUNCTION            1
             70 STORE_NAME              12 (z)

 19          72 LOAD_CONST              14 (<code object __add__ at 0x1017c27c0, line 19>)
             74 LOAD_CONST              15 ('MyClass.__add__')
             76 MAKE_FUNCTION            0
             78 STORE_NAME              13 (__add__)
             80 LOAD_CLOSURE             0 (__class__)
             82 DUP_TOP
             84 STORE_NAME              14 (__classcell__)
             86 RETURN_VALUE

Disassembly of <code object __new__ at 0x1017c2500, line 9>:
 10           0 LOAD_GLOBAL              0 (super)
              2 CALL_FUNCTION            0
              4 LOAD_METHOD              1 (__new__)
              6 LOAD_FAST                0 (cls)
              8 CALL_METHOD              1
             10 RETURN_VALUE
```

* 上述类体字节码可粗略对应到如下函数，与普通函数体不同的有嵌套函数的名称，函数体的嵌套函数一般命名为 `MyClass.<locals>.__init__`，而类体中为 `MyClass.__init__`。以及普通函数中 \_\_class__ 需显式在 MyClass() 中定义，然后被嵌套函数访问后才能编译为闭包变量。还需注意，定义的方法本质上还是普通函数对象 function，因为其实现了描述器接口，故在效果上表现为方法。以及 `@classmethod` 和 `@staticmethod` 装饰器本身可以修饰任何函数对象，其作用到方法上时，配合成员访问机制来表现出不同的行为。

```python
def MyClass():
    __name__ = __module__
    __qualname__ = "MyClass"
    __doc__ = "MyClass docstring"
    a = 0
    __slots__ = ('b', 'c', '__dict__')

    def __init__(self, b): 
        self.b = b
    __init__.name = "MyClass.__init__"

    def __new__(cls, b):
        return super().__new__(cls)
    __new__.name = "MyClass.__new__"

    def f(self, *args, **kwargs): pass
    f.name = "MyClass.f"
    
    @classmethod
    def g(cls, *args, **kwargs): pass
    g.name = "MyClass.g"
    
    @staticmethod
    def z(*args, **kwargs): pass
    z.name = "MyClass.z"

    def __add__(self, other): pass
    __add__.name = "MyClass.__add__"

    __classcell__ = __class__
    return __class__
```

准备完毕类名、父类和包含类成员的字典后，即可调用元类进行类对象的创建。一般情况下，创建类的元类默认为 type。

* _PyObject_FastCallDict() 调用 type 相当于调用其 @@tp_call@@ 槽指向的函数，其中 *args* 为 `("MyClass", (Base, ...), {"__name__": ....})` 元组，*kwds* 为不包含 *metaclass* 的字典。

* type_call() 又会以相同参数继续调用 @@tp_new@@ 槽指向的函数。注意到，当只传递一个参数时，即以 @@type[2]@@ 方式调用，会直接返回 *obj* 的类型。当传递三个参数时，即以 @@type@@ 方式调用，会创建新类型。在创建完毕后，还会调用 @@__init__@@ 方法初始化新类型对象。在用户实现的元类中，新类型的元类可能不是创建它的子类，则不对类对象进行初始化，因为当前元类的 @@tp_init@@ 实现不是新类型对象的实例方法。

```c
// Objects/typeobject.c#type_call
static PyObject *
type_call(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    PyObject *obj;

    if (type->tp_new == NULL) {
        PyErr_Format(PyExc_TypeError,
                     "cannot create '%.100s' instances",
                     type->tp_name);
        return NULL;
    }

#ifdef Py_DEBUG
    /* type_call() must not be called with an exception set,
       because it can clear it (directly or indirectly) and so the
       caller loses its exception */
    assert(!PyErr_Occurred());
#endif

    // 创建类型实例 PyType_Type.tp_new(PyType_Type, args, kwds)
    // 创建类实例 PyXXX_Type.tp_new(PyXXX_Type, args, kwds)
    obj = type->tp_new(type, args, kwds);
    obj = _Py_CheckFunctionResult((PyObject*)type, obj, NULL);
    if (obj == NULL)
        return NULL;

    /* Ugly exception: when the call was type(something),
       don't call tp_init on the result. */
    if (type == &PyType_Type &&
        PyTuple_Check(args) && PyTuple_GET_SIZE(args) == 1 &&
        (kwds == NULL ||
         (PyDict_Check(kwds) && PyDict_GET_SIZE(kwds) == 0)))
        return obj;

    /* If the returned object is not an instance of type,
       it won't be initialized. */
    if (!PyType_IsSubtype(Py_TYPE(obj), type))
        return obj;

    type = Py_TYPE(obj);
    if (type->tp_init != NULL) {
        int res = type->tp_init(obj, args, kwds);
        if (res < 0) {
            assert(PyErr_Occurred());
            Py_DECREF(obj);
            obj = NULL;
        }
        else {
            assert(!PyErr_Occurred());
        }
    }
    return obj;
}
```

总体来说，@@type@@ 创建堆类型可粗略分为以下环节：

1. 检查当前元类是否是最适合创建类对象的元类，即从父类中找到最具体的元类来创建类型。对于 `class` 方式创建类型，已经在 \_\_build_class__() 期间确定。然后需要从父类中找到实例内存布局最兼容的一个类作为基类，即 \_\_bases__。

2. 计算实例的内存需求，若类成员中声明了 @@__slots__@@ 属性，则需要为它们分配额外内存。另外，需要特殊处理实例的 \_\_dict__ 和 \_\_weakref__ 属性，因为它们会受到 @@__slots__@@ 的约束并可以从父类继承。

3. 为类对象分配内存空间，堆类型由 PyHeapTypeObject 表示，其相比 @@PyTypeObject@@ 在后面多了协议槽的扩展。在定义 @@__slots__@@ 属性的情况下，还会在最后扩展出连续 @@PyMemberDef@@ 数组，以加速成员的访问。

4. 为类对象 PyHeapTypeObject 的各字段设置默认值，如设置类名、槽的默认实现、对 @@PyMemberDef@@ 数组进行初始化以及对类实例字典的必要调整。最后，若类字典中存在 \_\_classcell__ 属性，则将创建的类型设置到其中，使得依赖 \_\_class__ 的方法能够访问到类型对象本身。

5. 类似静态类型创建，在为 @@PyTypeObject@@ 设置值后继续调用 @@CAPI_PyType_Ready@@ 对类型进行初始化。

6. 更新 PyHeapTypeObject 的接口槽，因为用户的实现均体现在类字典上，而 C 槽要么是继承值要么没有值，因此需要将类实例字典的实现更新到 C 槽中。

7. 回调函数的调用，类实例创建完成后，需完成对如 @@__set_name__@@ 和 @@__init_subclass__@@ 接口的调用。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    PyObject *name, *bases = NULL, *orig_dict, *dict = NULL;
    PyObject *qualname, *slots = NULL, *tmp, *newslots, *cell;
    PyTypeObject *type = NULL, *base, *tmptype, *winner;
    PyHeapTypeObject *et;
    PyMemberDef *mp;
    Py_ssize_t i, nbases, nslots, slotoffset, name_size;
    int j, may_add_dict, may_add_weak, add_dict, add_weak;
    _Py_IDENTIFIER(__qualname__);
    _Py_IDENTIFIER(__slots__);
    _Py_IDENTIFIER(__classcell__);

    assert(args != NULL && PyTuple_Check(args));
    assert(kwds == NULL || PyDict_Check(kwds));

    /* Special case: type(x) should return x->ob_type */
    /* We only want type itself to accept the one-argument form (#27157)
       Note: We don't call PyType_CheckExact as that also allows subclasses */
    if (metatype == &PyType_Type) {
        const Py_ssize_t nargs = PyTuple_GET_SIZE(args);
        const Py_ssize_t nkwds = kwds == NULL ? 0 : PyDict_GET_SIZE(kwds);

        if (nargs == 1 && nkwds == 0) {
            PyObject *x = PyTuple_GET_ITEM(args, 0);
            Py_INCREF(Py_TYPE(x));
            return (PyObject *) Py_TYPE(x);
        }

        /* SF bug 475327 -- if that didn't trigger, we need 3
           arguments. but PyArg_ParseTuple below may give
           a msg saying type() needs exactly 3. */
        if (nargs != 3) {
            PyErr_SetString(PyExc_TypeError,
                            "type() takes 1 or 3 arguments");
            return NULL;
        }
    }

    /* Check arguments: (name, bases, dict) */
    if (!PyArg_ParseTuple(args, "UO!O!:type.__new__", &name, &PyTuple_Type,
                          &bases, &PyDict_Type, &orig_dict))
        return NULL;

    /* Adjust for empty tuple bases */
    nbases = PyTuple_GET_SIZE(bases);
    if (nbases == 0) {  // 默认继承至 object
        base = &PyBaseObject_Type;
        bases = PyTuple_Pack(1, base);
        if (bases == NULL)
            return NULL;
        nbases = 1;
    }
    else {
        _Py_IDENTIFIER(__mro_entries__);
        for (i = 0; i < nbases; i++) {  // 确保 __mro_entries__ 已经扩展
            tmp = PyTuple_GET_ITEM(bases, i);
            if (PyType_Check(tmp)) {
                continue;
            }
            if (_PyObject_LookupAttrId(tmp, &PyId___mro_entries__, &tmp) < 0) {
                return NULL;
            }
            if (tmp != NULL) {
                // https://docs.python.org/zh-cn/3.14/library/types.html#types.new_class
                PyErr_SetString(PyExc_TypeError,
                                "type() doesn't support MRO entry resolution; "
                                "use types.new_class()");
                Py_DECREF(tmp);
                return NULL;
            }
        }
        /* Search the bases for the proper metatype to deal with this: */
        winner = _PyType_CalculateMetaclass(metatype, bases);
        if (winner == NULL) {
            return NULL;
        }

        if (winner != metatype) {
            if (winner->tp_new != type_new) /* Pass it to the winner */
                return winner->tp_new(winner, args, kwds);
            metatype = winner;
        }

        /* Calculate best base, and check that all bases are type objects */
        base = best_base(bases);
        if (base == NULL) {
            return NULL;
        }

        Py_INCREF(bases);
    }

    /* Use "goto error" from this point on as we now own the reference to "bases". */

    dict = PyDict_Copy(orig_dict);
    if (dict == NULL)
        goto error;

    /* Check for a __slots__ sequence variable in dict, and count it */
    // https://docs.python.org/zh-cn/3.14/reference/datamodel.html#object.__slots__
    slots = _PyDict_GetItemIdWithError(dict, &PyId___slots__);
    nslots = 0;
    add_dict = 0;  // 实际决定是否添加 __dict__
    add_weak = 0;
    may_add_dict = base->tp_dictoffset == 0;  // 理论上是否允许添加 __dict__
    may_add_weak = base->tp_weaklistoffset == 0 && base->tp_itemsize == 0;
    if (slots == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        if (may_add_dict) {
            add_dict++;
        }
        if (may_add_weak) {
            add_weak++;
        }
    }
    else {
        /* Have slots */

        /* Make it into a tuple */
        if (PyUnicode_Check(slots))
            slots = PyTuple_Pack(1, slots);
        else
            slots = PySequence_Tuple(slots);
        if (slots == NULL)
            goto error;
        assert(PyTuple_Check(slots));

        /* Are slots allowed? */
        nslots = PyTuple_GET_SIZE(slots);
        if (nslots > 0 && base->tp_itemsize != 0) {
            PyErr_Format(PyExc_TypeError,
                         "nonempty __slots__ "
                         "not supported for subtype of '%s'",
                         base->tp_name);
            goto error;
        }

        /* Check for valid slot names and two special cases */
        for (i = 0; i < nslots; i++) {
            PyObject *tmp = PyTuple_GET_ITEM(slots, i);
            if (!valid_identifier(tmp))  // 检查标识符是否有效
                goto error;
            assert(PyUnicode_Check(tmp));
            if (_PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) {
                if (!may_add_dict || add_dict) {  // || add_dict 避免如 ("__dict__", "__dict__")
                    PyErr_SetString(PyExc_TypeError,
                        "__dict__ slot disallowed: "
                        "we already got one");
                    goto error;
                }
                add_dict++;
            }
            if (_PyUnicode_EqualToASCIIString(tmp, "__weakref__")) {
                if (!may_add_weak || add_weak) {
                    PyErr_SetString(PyExc_TypeError,
                        "__weakref__ slot disallowed: "
                        "either we already got one, "
                        "or __itemsize__ != 0");
                    goto error;
                }
                add_weak++;
            }
        }

        /* Copy slots into a list, mangle names and sort them.
           Sorted names are needed for __class__ assignment.
           Convert them back to tuple at the end.
        */
        newslots = PyList_New(nslots - add_dict - add_weak);
        if (newslots == NULL)
            goto error;
        for (i = j = 0; i < nslots; i++) {
            tmp = PyTuple_GET_ITEM(slots, i);
            if ((add_dict &&
                 _PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) ||
                (add_weak &&
                 _PyUnicode_EqualToASCIIString(tmp, "__weakref__")))
                continue;
            tmp =_Py_Mangle(name, tmp);  // 名字转换，如 __x 变成 _<name>__x
            if (!tmp) {
                Py_DECREF(newslots);
                goto error;
            }
            PyList_SET_ITEM(newslots, j, tmp);
            if (PyDict_GetItemWithError(dict, tmp)) {  // 检查是否与类名冲突
                /* CPython inserts __qualname__ and __classcell__ (when needed)
                   into the namespace when creating a class.  They will be deleted
                   below so won't act as class variables. */
                if (!_PyUnicode_EqualToASCIIId(tmp, &PyId___qualname__) &&
                    !_PyUnicode_EqualToASCIIId(tmp, &PyId___classcell__)) {
                    PyErr_Format(PyExc_ValueError,
                                 "%R in __slots__ conflicts with class variable",
                                 tmp);
                    Py_DECREF(newslots);
                    goto error;
                }
            }
            else if (PyErr_Occurred()) {
                Py_DECREF(newslots);
                goto error;
            }
            j++;
        }
        assert(j == nslots - add_dict - add_weak);
        nslots = j;
        Py_CLEAR(slots);
        if (PyList_Sort(newslots) == -1) {
            Py_DECREF(newslots);
            goto error;
        }
        slots = PyList_AsTuple(newslots);
        Py_DECREF(newslots);
        if (slots == NULL)
            goto error;

        /* Secondary bases may provide weakrefs or dict */
        if (nbases > 1 &&
            ((may_add_dict && !add_dict) ||
             (may_add_weak && !add_weak))) {
            for (i = 0; i < nbases; i++) {
                tmp = PyTuple_GET_ITEM(bases, i);
                if (tmp == (PyObject *)base)
                    continue; /* Skip primary base */
                assert(PyType_Check(tmp));
                tmptype = (PyTypeObject *)tmp;
                if (may_add_dict && !add_dict &&
                    tmptype->tp_dictoffset != 0)
                    add_dict++;
                if (may_add_weak && !add_weak &&
                    tmptype->tp_weaklistoffset != 0)
                    add_weak++;
                if (may_add_dict && !add_dict)
                    continue;
                if (may_add_weak && !add_weak)
                    continue;
                /* Nothing more to check */
                break;
            }
        }
    }

    /* Allocate the type object */
    type = (PyTypeObject *)metatype->tp_alloc(metatype, nslots);
    if (type == NULL)
        goto error;

    /* Keep name and slots alive in the extended type object */
    et = (PyHeapTypeObject *)type;
    Py_INCREF(name);
    et->ht_name = name;
    et->ht_slots = slots;
    slots = NULL;

    /* Initialize tp_flags */
    // All heap types need GC, since we can create a reference cycle by storing
    // an instance on one of its parents:
    type->tp_flags = Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HEAPTYPE |
        Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC;

    /* Initialize essential fields */
    type->tp_as_async = &et->as_async;
    type->tp_as_number = &et->as_number;
    type->tp_as_sequence = &et->as_sequence;
    type->tp_as_mapping = &et->as_mapping;
    type->tp_as_buffer = &et->as_buffer;
    type->tp_name = PyUnicode_AsUTF8AndSize(name, &name_size);
    if (!type->tp_name)
        goto error;
    if (strlen(type->tp_name) != (size_t)name_size) {
        PyErr_SetString(PyExc_ValueError,
                        "type name must not contain null characters");
        goto error;
    }

    /* Set tp_base and tp_bases */
    type->tp_bases = bases;
    bases = NULL;
    Py_INCREF(base);
    type->tp_base = base;

    /* Initialize tp_dict from passed-in dict */
    Py_INCREF(dict);
    type->tp_dict = dict;

    /* Set __module__ in the dict */
    if (_PyDict_GetItemIdWithError(dict, &PyId___module__) == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        tmp = PyEval_GetGlobals();  // frame globals
        if (tmp != NULL) {
            tmp = _PyDict_GetItemIdWithError(tmp, &PyId___name__);
            if (tmp != NULL) {
                if (_PyDict_SetItemId(dict, &PyId___module__,
                                      tmp) < 0)
                    goto error;
            }
            else if (PyErr_Occurred()) {
                goto error;
            }
        }
    }

    /* Set ht_qualname to dict['__qualname__'] if available, else to
       __name__.  The __qualname__ accessor will look for ht_qualname.
    */
    qualname = _PyDict_GetItemIdWithError(dict, &PyId___qualname__);
    if (qualname != NULL) {
        if (!PyUnicode_Check(qualname)) {
            PyErr_Format(PyExc_TypeError,
                         "type __qualname__ must be a str, not %s",
                         Py_TYPE(qualname)->tp_name);
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }
    et->ht_qualname = qualname ? qualname : et->ht_name;
    Py_INCREF(et->ht_qualname);
    // 删除 dict["__qualname__"]，使之由 type.__qualname__ 提供
    if (qualname != NULL && _PyDict_DelItemId(dict, &PyId___qualname__) < 0)
        goto error;

    /* Set tp_doc to a copy of dict['__doc__'], if the latter is there
       and is a string.  The __doc__ accessor will first look for tp_doc;
       if that fails, it will still look into __dict__.
    */
    {
        PyObject *doc = _PyDict_GetItemIdWithError(dict, &PyId___doc__);
        if (doc != NULL && PyUnicode_Check(doc)) {
            Py_ssize_t len;
            const char *doc_str;
            char *tp_doc;

            doc_str = PyUnicode_AsUTF8(doc);
            if (doc_str == NULL)
                goto error;
            /* Silently truncate the docstring if it contains null bytes. */
            len = strlen(doc_str);
            tp_doc = (char *)PyObject_MALLOC(len + 1);
            if (tp_doc == NULL) {
                PyErr_NoMemory();
                goto error;
            }
            memcpy(tp_doc, doc_str, len + 1);
            type->tp_doc = tp_doc;
        }
        else if (doc == NULL && PyErr_Occurred()) {
            goto error;
        }
    }

    /* Special-case __new__: if it's a plain function,
       make it a static function */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___new__);
    if (tmp != NULL && PyFunction_Check(tmp)) {  // 当用户没 @staticmethod 包装，则自动包装
        tmp = PyStaticMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___new__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    /* Special-case __init_subclass__ and __class_getitem__:
       if they are plain functions, make them classmethods */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___init_subclass__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___init_subclass__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    tmp = _PyDict_GetItemIdWithError(dict, &PyId___class_getitem__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___class_getitem__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    /* Add descriptors for custom slots from __slots__, or for __dict__ */
    mp = PyHeapType_GET_MEMBERS(et);
    slotoffset = base->tp_basicsize;  // 在实例上的偏移地址
    if (et->ht_slots != NULL) {
        for (i = 0; i < nslots; i++, mp++) {
            mp->name = PyUnicode_AsUTF8(
                PyTuple_GET_ITEM(et->ht_slots, i));
            if (mp->name == NULL)
                goto error;
            mp->type = T_OBJECT_EX;
            mp->offset = slotoffset;

            /* __dict__ and __weakref__ are already filtered out */
            assert(strcmp(mp->name, "__dict__") != 0);
            assert(strcmp(mp->name, "__weakref__") != 0);

            slotoffset += sizeof(PyObject *);
        }
    }
    // __dict__ ptr
    if (add_dict) {
        if (base->tp_itemsize)
            type->tp_dictoffset = -(long)sizeof(PyObject *);
        else
            type->tp_dictoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    // __weakref__ ptr
    if (add_weak) {
        assert(!base->tp_itemsize);
        type->tp_weaklistoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    type->tp_basicsize = slotoffset;
    type->tp_itemsize = base->tp_itemsize;
    type->tp_members = PyHeapType_GET_MEMBERS(et);

    if (type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_full;
    else if (type->tp_weaklistoffset && !type->tp_dictoffset)
        type->tp_getset = subtype_getsets_weakref_only;
    else if (!type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_dict_only;
    else
        type->tp_getset = NULL;

    /* Special case some slots */
    if (type->tp_dictoffset != 0 || nslots > 0) {
        if (base->tp_getattr == NULL && base->tp_getattro == NULL)
            type->tp_getattro = PyObject_GenericGetAttr;
        if (base->tp_setattr == NULL && base->tp_setattro == NULL)
            type->tp_setattro = PyObject_GenericSetAttr;
    }
    type->tp_dealloc = subtype_dealloc;

    /* Always override allocation strategy to use regular heap */
    type->tp_alloc = PyType_GenericAlloc;
    type->tp_free = PyObject_GC_Del;
    type->tp_traverse = subtype_traverse;
    type->tp_clear = subtype_clear;

    /* store type in class' cell if one is supplied */
    cell = _PyDict_GetItemIdWithError(dict, &PyId___classcell__);
    if (cell != NULL) {
        /* At least one method requires a reference to its defining class */
        if (!PyCell_Check(cell)) {
            PyErr_Format(PyExc_TypeError,
                         "__classcell__ must be a nonlocal cell, not %.200R",
                         Py_TYPE(cell));
            goto error;
        }
        PyCell_Set(cell, (PyObject *) type);
        if (_PyDict_DelItemId(dict, &PyId___classcell__) < 0) {
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }

    /* Initialize the rest */
    if (PyType_Ready(type) < 0)
        goto error;

    /* Put the proper slots in place */
    fixup_slot_dispatchers(type);

    if (type->tp_dictoffset) {
        et->ht_cached_keys = _PyDict_NewKeysForClass();
    }

    if (set_names(type) < 0)
        goto error;

    if (init_subclass(type, kwds) < 0)
        goto error;

    Py_DECREF(dict);
    return (PyObject *)type;

error:
    Py_XDECREF(dict);
    Py_XDECREF(bases);
    Py_XDECREF(slots);
    Py_XDECREF(type);
    return NULL;
}
```

* 若没有定义父类，则默认继承自 object 类。否则需要对父类进行检查，其要求所有的父类都必须是 @@PyTypeObject@@ 对象。然后再从父类中寻找到最佳的元类，若当前元类不是最佳的，则由最佳元类进行类对象的创建。否则继续从父类中挑选出最佳的基类 \_\_base__，挑选规则为：

    * 对于每个父类，其必须是可继承的（即具有 @@Py_TPFLAGS_BASETYPE@@ 标记），然后从其基类链中找到决定实例内存布局最大的那个作为该父类的参考（如子类的 @@tp_itemsize@@ 与父类的不同则表明子类相对基类进行了扩展，即子类更具体，兼容性更好），最后再在父类的参考中找到一个最具体的类（即其它参考都是它的父类），那么选择参考对应的父类作为新类型的基类。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Adjust for empty tuple bases */
    nbases = PyTuple_GET_SIZE(bases);
    if (nbases == 0) {  // 默认继承至 object
        base = &PyBaseObject_Type;
        bases = PyTuple_Pack(1, base);
        if (bases == NULL)
            return NULL;
        nbases = 1;
    }
    else {
        _Py_IDENTIFIER(__mro_entries__);
        for (i = 0; i < nbases; i++) {  // 确保 __mro_entries__ 已经扩展
            tmp = PyTuple_GET_ITEM(bases, i);
            if (PyType_Check(tmp)) {
                continue;
            }
            if (_PyObject_LookupAttrId(tmp, &PyId___mro_entries__, &tmp) < 0) {
                return NULL;
            }
            if (tmp != NULL) {
                // https://docs.python.org/zh-cn/3.14/library/types.html#types.new_class
                PyErr_SetString(PyExc_TypeError,
                                "type() doesn't support MRO entry resolution; "
                                "use types.new_class()");
                Py_DECREF(tmp);
                return NULL;
            }
        }
        /* Search the bases for the proper metatype to deal with this: */
        winner = _PyType_CalculateMetaclass(metatype, bases);
        if (winner == NULL) {
            return NULL;
        }

        if (winner != metatype) {
            if (winner->tp_new != type_new) /* Pass it to the winner */
                return winner->tp_new(winner, args, kwds);
            metatype = winner;
        }

        /* Calculate best base, and check that all bases are type objects */
        base = best_base(bases);
        if (base == NULL) {
            return NULL;
        }

        Py_INCREF(bases);
    }

    ...
}

// Objects/typeobject.c#best_base
static PyTypeObject *
best_base(PyObject *bases)
{
    Py_ssize_t i, n;
    PyTypeObject *base, *winner, *candidate, *base_i;
    PyObject *base_proto;

    assert(PyTuple_Check(bases));
    n = PyTuple_GET_SIZE(bases);
    assert(n > 0);
    base = NULL;
    winner = NULL;
    for (i = 0; i < n; i++) {
        base_proto = PyTuple_GET_ITEM(bases, i);
        if (!PyType_Check(base_proto)) {
            PyErr_SetString(
                PyExc_TypeError,
                "bases must be types");
            return NULL;
        }
        base_i = (PyTypeObject *)base_proto;
        if (base_i->tp_dict == NULL) {
            if (PyType_Ready(base_i) < 0)
                return NULL;
        }
        if (!PyType_HasFeature(base_i, Py_TPFLAGS_BASETYPE)) {
            PyErr_Format(PyExc_TypeError,
                         "type '%.100s' is not an acceptable base type",
                         base_i->tp_name);
            return NULL;
        }
        candidate = solid_base(base_i);
        // 保留更具体的基类
        if (winner == NULL) {
            winner = candidate;
            base = base_i;
        }
        else if (PyType_IsSubtype(winner, candidate))
            ;
        else if (PyType_IsSubtype(candidate, winner)) {
            winner = candidate;
            base = base_i;
        }
        else {
            PyErr_SetString(
                PyExc_TypeError,
                "multiple bases have "
                "instance lay-out conflict");
            return NULL;
        }
    }
    assert (base != NULL);

    return base;
}

// Objects/typeobject.c#solid_base
static PyTypeObject *
solid_base(PyTypeObject *type)  // 返回决定内存布局的类
{
    PyTypeObject *base;

    if (type->tp_base)
        base = solid_base(type->tp_base);
    else
        base = &PyBaseObject_Type;
    if (extra_ivars(type, base))
        return type;
    else
        return base;
}

// Objects/typeobject.c#extra_ivars
static int
extra_ivars(PyTypeObject *type, PyTypeObject *base)  // 判断 type 是否相比 base 有额外的实例变量
{
    size_t t_size = type->tp_basicsize;
    size_t b_size = base->tp_basicsize;

    assert(t_size >= b_size); /* Else type smaller than base! */
    // 可变长实例判断
    if (type->tp_itemsize || base->tp_itemsize) {
        /* If itemsize is involved, stricter rules */
        return t_size != b_size ||
            type->tp_itemsize != base->tp_itemsize;
    }
    // __dict__, __weakref__ 位于实例变量末尾，不算做实例变量
    if (type->tp_weaklistoffset && base->tp_weaklistoffset == 0 &&
        type->tp_weaklistoffset + sizeof(PyObject *) == t_size &&
        type->tp_flags & Py_TPFLAGS_HEAPTYPE)
        t_size -= sizeof(PyObject *);
    if (type->tp_dictoffset && base->tp_dictoffset == 0 &&
        type->tp_dictoffset + sizeof(PyObject *) == t_size &&
        type->tp_flags & Py_TPFLAGS_HEAPTYPE)
        t_size -= sizeof(PyObject *);

    return t_size != b_size;
}
```

* @@__slots__@@ 影响类对象的大小以及 \_\_dict__ 和 \_\_weakref__ 成员的分配。若没有 @@__slots__@@ 成员的情况下，若基类没有 \_\_dict__ 或 \_\_weakref__ 属性，则堆类型的子类会默认添加，即为了便于实例对象的任意读写和弱引用的支持。对于有 @@__slots__@@ 成员情况下，其基类必须是固定长度的，否则无法确定 @@PyMemberDef@@ 数组的位置。此外，
    
    * @@__slots__@@ 中定义的字符串都必须符合变量名规范，使之能够作为 `.` 的后缀。
        
    * 若其中声明了 \_\_dict__ 或 \_\_weakref__ 成员，且父类也实现 \_\_dict__ 或 \_\_weakref__ 成员，则出现会冲突。若不能从父类继承，则只有定义了它们才支持对应的特性，即只有声明 \_\_dict__ 成员了实例才会具有实例字典，\_\_weakref__ 同理。另外，若具有多个父类且 @@__slots__@@ 也没声明相应属性，则可从其它父类继承。
    
    * 通常情况下，类对象需要 `len(__slots__)` 个 @@PyMemberDef@@ 额外空间，其中不包括 \_\_dict__ 或 \_\_weakref__ 在内，因为它们已经由 @@tp_dictoffset@@ 和 @@tp_weaklistoffset@@ 表示了。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Check for a __slots__ sequence variable in dict, and count it */
    slots = _PyDict_GetItemIdWithError(dict, &PyId___slots__);
    nslots = 0;
    add_dict = 0;  // 实际决定是否添加 __dict__
    add_weak = 0;
    may_add_dict = base->tp_dictoffset == 0;  // 理论上是否允许添加 __dict__
    may_add_weak = base->tp_weaklistoffset == 0 && base->tp_itemsize == 0;
    if (slots == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        if (may_add_dict) {
            add_dict++;
        }
        if (may_add_weak) {
            add_weak++;
        }
    }
    else {
        /* Have slots */

        /* Make it into a tuple */
        if (PyUnicode_Check(slots))
            slots = PyTuple_Pack(1, slots);
        else
            slots = PySequence_Tuple(slots);
        if (slots == NULL)
            goto error;
        assert(PyTuple_Check(slots));

        /* Are slots allowed? */
        nslots = PyTuple_GET_SIZE(slots);
        if (nslots > 0 && base->tp_itemsize != 0) {
            PyErr_Format(PyExc_TypeError,
                         "nonempty __slots__ "
                         "not supported for subtype of '%s'",
                         base->tp_name);
            goto error;
        }

        /* Check for valid slot names and two special cases */
        for (i = 0; i < nslots; i++) {
            PyObject *tmp = PyTuple_GET_ITEM(slots, i);
            if (!valid_identifier(tmp))  // 检查标识符是否有效
                goto error;
            assert(PyUnicode_Check(tmp));
            if (_PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) {
                if (!may_add_dict || add_dict) {  // || add_dict 避免如 ("__dict__", "__dict__")
                    PyErr_SetString(PyExc_TypeError,
                        "__dict__ slot disallowed: "
                        "we already got one");
                    goto error;
                }
                add_dict++;
            }
            if (_PyUnicode_EqualToASCIIString(tmp, "__weakref__")) {
                if (!may_add_weak || add_weak) {
                    PyErr_SetString(PyExc_TypeError,
                        "__weakref__ slot disallowed: "
                        "either we already got one, "
                        "or __itemsize__ != 0");
                    goto error;
                }
                add_weak++;
            }
        }

        /* Copy slots into a list, mangle names and sort them.
           Sorted names are needed for __class__ assignment.
           Convert them back to tuple at the end.
        */
        newslots = PyList_New(nslots - add_dict - add_weak);
        if (newslots == NULL)
            goto error;
        for (i = j = 0; i < nslots; i++) {
            tmp = PyTuple_GET_ITEM(slots, i);
            if ((add_dict &&
                 _PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) ||
                (add_weak &&
                 _PyUnicode_EqualToASCIIString(tmp, "__weakref__")))
                continue;
            tmp =_Py_Mangle(name, tmp);  // 名字转换，如 __x 变成 _<name>__x
            if (!tmp) {
                Py_DECREF(newslots);
                goto error;
            }
            PyList_SET_ITEM(newslots, j, tmp);
            if (PyDict_GetItemWithError(dict, tmp)) {  // 检查是否与类名冲突
                /* CPython inserts __qualname__ and __classcell__ (when needed)
                   into the namespace when creating a class.  They will be deleted
                   below so won't act as class variables. */
                if (!_PyUnicode_EqualToASCIIId(tmp, &PyId___qualname__) &&
                    !_PyUnicode_EqualToASCIIId(tmp, &PyId___classcell__)) {
                    PyErr_Format(PyExc_ValueError,
                                 "%R in __slots__ conflicts with class variable",
                                 tmp);
                    Py_DECREF(newslots);
                    goto error;
                }
            }
            else if (PyErr_Occurred()) {
                Py_DECREF(newslots);
                goto error;
            }
            j++;
        }
        assert(j == nslots - add_dict - add_weak);
        nslots = j;
        Py_CLEAR(slots);
        if (PyList_Sort(newslots) == -1) {
            Py_DECREF(newslots);
            goto error;
        }
        slots = PyList_AsTuple(newslots);
        Py_DECREF(newslots);
        if (slots == NULL)
            goto error;

        /* Secondary bases may provide weakrefs or dict */
        if (nbases > 1 &&
            ((may_add_dict && !add_dict) ||
             (may_add_weak && !add_weak))) {
            for (i = 0; i < nbases; i++) {
                tmp = PyTuple_GET_ITEM(bases, i);
                if (tmp == (PyObject *)base)
                    continue; /* Skip primary base */
                assert(PyType_Check(tmp));
                tmptype = (PyTypeObject *)tmp;
                if (may_add_dict && !add_dict &&
                    tmptype->tp_dictoffset != 0)
                    add_dict++;
                if (may_add_weak && !add_weak &&
                    tmptype->tp_weaklistoffset != 0)
                    add_weak++;
                if (may_add_dict && !add_dict)
                    continue;
                if (may_add_weak && !add_weak)
                    continue;
                /* Nothing more to check */
                break;
            }
        }
    }

    ...
}
```

* 由 type 的 @@tp_alloc@@ 实现为类型对象进行内存分配，其继承自 object 的 @@CAPI_PyType_GenericAlloc@@ 实现。

    * 为类型对象分配的内存有三个部分：PyHeapTypeObject 结构体的基本大小、额外的 @@PyMemberDef@@ 数组大小和对齐总内存大小到 `sizeof(void*)` 整数倍的额外大小。创建后的类对象，其类型为创建它的元类，头部的 *ob_size* 为数组长度。一般情况下，类型对象都支持 GC，需交由 GC 管理。

    * 堆类型由 PyHeapTypeObject 表示，PyTypeObject 作为其前缀，其后声明了各协议组接口成员槽，目的是便于内存的分配以及堆类型的动态扩展，如运行时动态使某类型支持某协议接口。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Allocate the type object */
    type = (PyTypeObject *)metatype->tp_alloc(metatype, nslots);
    if (type == NULL)
        goto error;
    
    ...
}

// Include/objimpl.h#_PyObject_VAR_SIZE
#define _PyObject_VAR_SIZE(typeobj, nitems)     \
    _Py_SIZE_ROUND_UP((typeobj)->tp_basicsize + \
        (nitems)*(typeobj)->tp_itemsize,        \
        SIZEOF_VOID_P)

// Objects/typeobject.c#PyType_GenericAlloc
PyObject *
PyType_GenericAlloc(PyTypeObject *type, Py_ssize_t nitems)
{
    PyObject *obj;
    const size_t size = _PyObject_VAR_SIZE(type, nitems+1);
    /* note that we need to add one, for the sentinel */

    if (PyType_IS_GC(type))
        obj = _PyObject_GC_Malloc(size);
    else
        obj = (PyObject *)PyObject_MALLOC(size);

    if (obj == NULL)
        return PyErr_NoMemory();

    memset(obj, '\0', size);

    if (type->tp_itemsize == 0)
        (void)PyObject_INIT(obj, type);
    else
        (void) PyObject_INIT_VAR((PyVarObject *)obj, type, nitems);

    if (PyType_IS_GC(type))
        _PyObject_GC_TRACK(obj);
    return obj;
}

// Include/cpython/object.h#PyHeapTypeObject
/* The *real* layout of a type object when allocated on the heap */
typedef struct _heaptypeobject {
    /* Note: there's a dependency on the order of these members
       in slotptr() in typeobject.c . */
    PyTypeObject ht_type;
    PyAsyncMethods as_async;
    PyNumberMethods as_number;
    PyMappingMethods as_mapping;
    PySequenceMethods as_sequence; /* as_sequence comes after as_mapping,
                                      so that the mapping wins when both
                                      the mapping and the sequence define
                                      a given operator (e.g. __getitem__).
                                      see add_operators() in typeobject.c . */
    PyBufferProcs as_buffer;
    PyObject *ht_name, *ht_slots, *ht_qualname;
    struct _dictkeysobject *ht_cached_keys;
    /* here are optional user slots, followed by the members. */
} PyHeapTypeObject;
```

* 为类对象分配内存后需类似静态创建类型那样为各字段设置值。添加 @@Py_TPFLAGS_HEAPTYPE@@ 标记表明类是堆类型。如 @@tp_as_async@@ 的接口协议槽分别指向 PyHeapTypeObject 中 @@PyTypeObject@@ 后面的实现，尽管它们内部都是空的，但使得类型拥有继承和扩展的能力。@@tp_dict@@ 槽指向传入类成员字典的备份，即将用户的实现体现到了类对象上。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Keep name and slots alive in the extended type object */
    et = (PyHeapTypeObject *)type;
    Py_INCREF(name);
    et->ht_name = name;
    et->ht_slots = slots;
    slots = NULL;

    /* Initialize tp_flags */
    // All heap types need GC, since we can create a reference cycle by storing
    // an instance on one of its parents:
    type->tp_flags = Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HEAPTYPE |
        Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC;

    /* Initialize essential fields */
    type->tp_as_async = &et->as_async;
    type->tp_as_number = &et->as_number;
    type->tp_as_sequence = &et->as_sequence;
    type->tp_as_mapping = &et->as_mapping;
    type->tp_as_buffer = &et->as_buffer;
    type->tp_name = PyUnicode_AsUTF8AndSize(name, &name_size);
    if (!type->tp_name)
        goto error;
    if (strlen(type->tp_name) != (size_t)name_size) {
        PyErr_SetString(PyExc_ValueError,
                        "type name must not contain null characters");
        goto error;
    }

    /* Set tp_base and tp_bases */
    type->tp_bases = bases;
    bases = NULL;
    Py_INCREF(base);
    type->tp_base = base;

    /* Initialize tp_dict from passed-in dict */
    Py_INCREF(dict);
    type->tp_dict = dict;

    ...
}
```

* 类对象具有 \_\_module__ 成员表明所处模块，若类实例字典中没有则从 @@frameobject@@ 的 *f_globals* 中查找并设置。同时，若类实例字典中具有文档 \_\_doc__ 则需同步到 @@tp_doc@@ 槽。另外，特殊方法中有一类属于类方法，如 @@__new__@@，若其没有 `@classmethod` 修饰，则需要对其进行修饰后重新设置到类实例字典。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Set __module__ in the dict */
    if (_PyDict_GetItemIdWithError(dict, &PyId___module__) == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        tmp = PyEval_GetGlobals();  // frame globals
        if (tmp != NULL) {
            tmp = _PyDict_GetItemIdWithError(tmp, &PyId___name__);
            if (tmp != NULL) {
                if (_PyDict_SetItemId(dict, &PyId___module__,
                                      tmp) < 0)
                    goto error;
            }
            else if (PyErr_Occurred()) {
                goto error;
            }
        }
    }

    /* Set ht_qualname to dict['__qualname__'] if available, else to
       __name__.  The __qualname__ accessor will look for ht_qualname.
    */
    qualname = _PyDict_GetItemIdWithError(dict, &PyId___qualname__);
    if (qualname != NULL) {
        if (!PyUnicode_Check(qualname)) {
            PyErr_Format(PyExc_TypeError,
                         "type __qualname__ must be a str, not %s",
                         Py_TYPE(qualname)->tp_name);
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }
    et->ht_qualname = qualname ? qualname : et->ht_name;
    Py_INCREF(et->ht_qualname);
    // 删除 dict["__qualname__"]，使之由 type.__qualname__ 提供
    if (qualname != NULL && _PyDict_DelItemId(dict, &PyId___qualname__) < 0)
        goto error;

    /* Set tp_doc to a copy of dict['__doc__'], if the latter is there
       and is a string.  The __doc__ accessor will first look for tp_doc;
       if that fails, it will still look into __dict__.
    */
    {
        PyObject *doc = _PyDict_GetItemIdWithError(dict, &PyId___doc__);
        if (doc != NULL && PyUnicode_Check(doc)) {
            Py_ssize_t len;
            const char *doc_str;
            char *tp_doc;

            doc_str = PyUnicode_AsUTF8(doc);
            if (doc_str == NULL)
                goto error;
            /* Silently truncate the docstring if it contains null bytes. */
            len = strlen(doc_str);
            tp_doc = (char *)PyObject_MALLOC(len + 1);
            if (tp_doc == NULL) {
                PyErr_NoMemory();
                goto error;
            }
            memcpy(tp_doc, doc_str, len + 1);
            type->tp_doc = tp_doc;
        }
        else if (doc == NULL && PyErr_Occurred()) {
            goto error;
        }
    }

    /* Special-case __new__: if it's a plain function,
       make it a static function */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___new__);
    if (tmp != NULL && PyFunction_Check(tmp)) {  // 当用户没 @staticmethod 包装，则自动包装
        tmp = PyStaticMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___new__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    /* Special-case __init_subclass__ and __class_getitem__:
       if they are plain functions, make them classmethods */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___init_subclass__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___init_subclass__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    tmp = _PyDict_GetItemIdWithError(dict, &PyId___class_getitem__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___class_getitem__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    ...
}
```

* PyHeapTypeObject 最后的 @@PyMemberDef@@ 数组需按照 @@__slots__@@ 进行初始化，然后将 @@tp_members@@ 指向该数组，由后续 @@CAPI_PyType_Ready@@ 添加描述器对象到类实例字典。另外，若当前类为实例提供 \_\_dict__ 或 \_\_weakref__，则需要计算到 @@tp_basicsize@@ 中，同时确定 @@tp_dictoffset@@ 和 @@tp_weaklistoffset@@ 的值。以及 \_\_dict__ 的 \_\_weakref__ 实现与否影响 @@tp_getset@@ 的设置，即按情况提供接口支持实例对它们的访问。由于 PyHeapTypeObject 是 GC 对象，与之相关的槽则设置为默认的 GC 实现。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* Add descriptors for custom slots from __slots__, or for __dict__ */
    mp = PyHeapType_GET_MEMBERS(et);
    slotoffset = base->tp_basicsize;  // 在实例上的偏移地址
    if (et->ht_slots != NULL) {
        for (i = 0; i < nslots; i++, mp++) {
            mp->name = PyUnicode_AsUTF8(
                PyTuple_GET_ITEM(et->ht_slots, i));
            if (mp->name == NULL)
                goto error;
            mp->type = T_OBJECT_EX;
            mp->offset = slotoffset;

            /* __dict__ and __weakref__ are already filtered out */
            assert(strcmp(mp->name, "__dict__") != 0);
            assert(strcmp(mp->name, "__weakref__") != 0);

            slotoffset += sizeof(PyObject *);
        }
    }
    // __dict__ ptr
    if (add_dict) {
        if (base->tp_itemsize)
            type->tp_dictoffset = -(long)sizeof(PyObject *);
        else
            type->tp_dictoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    // __weakref__ ptr
    if (add_weak) {
        assert(!base->tp_itemsize);
        type->tp_weaklistoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    type->tp_basicsize = slotoffset;
    type->tp_itemsize = base->tp_itemsize;
    type->tp_members = PyHeapType_GET_MEMBERS(et);

    if (type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_full;
    else if (type->tp_weaklistoffset && !type->tp_dictoffset)
        type->tp_getset = subtype_getsets_weakref_only;
    else if (!type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_dict_only;
    else
        type->tp_getset = NULL;

    /* Special case some slots */
    if (type->tp_dictoffset != 0 || nslots > 0) {
        if (base->tp_getattr == NULL && base->tp_getattro == NULL)
            type->tp_getattro = PyObject_GenericGetAttr;
        if (base->tp_setattr == NULL && base->tp_setattro == NULL)
            type->tp_setattro = PyObject_GenericSetAttr;
    }
    type->tp_dealloc = subtype_dealloc;

    /* Always override allocation strategy to use regular heap */
    type->tp_alloc = PyType_GenericAlloc;
    type->tp_free = PyObject_GC_Del;
    type->tp_traverse = subtype_traverse;
    type->tp_clear = subtype_clear;

    ...
}

// Objects/typeobject.c#subtype_getsets_full
static PyGetSetDef subtype_getsets_full[] = {
    {"__dict__", subtype_dict, subtype_setdict,
     PyDoc_STR("dictionary for instance variables (if defined)")},
    {"__weakref__", subtype_getweakref, NULL,
     PyDoc_STR("list of weak references to the object (if defined)")},
    {0}
};
```

* 为类对象 PyHeapTypeObject 设置完值后，若类实例字典中存在 \_\_classcell__，则将当前对象设置到其引用的 @@cell-objects@@ 中，此时设置而不是等到 @@CAPI_PyType_Ready@@ 初始化后才设置是因为若另一个线程访问了该未初始化对象时也会检查和初始化它。类似静态类型初始化，对堆类型进行 @@CAPI_PyType_Ready@@ 主要是将 @@tp_members@@ 和 @@tp_getset@@ 写入类实例字典及从父类继承 C 槽的实现。然而这些槽有可能被类实例字典中的方法覆盖，因此还需 fixup_slot_dispatchers() 将类实例的实现更新到 C 槽。这本质上和类成员修改的逻辑一致，即用户修改了类实例字典中某特殊方法的实现，则需同步到相应的槽，具体实现细节可参考 @@class-member-writing@@。

```c
// Objects/typeobject.c#type_new
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    ...

    /* store type in class' cell if one is supplied */
    cell = _PyDict_GetItemIdWithError(dict, &PyId___classcell__);
    if (cell != NULL) {
        /* At least one method requires a reference to its defining class */
        if (!PyCell_Check(cell)) {
            PyErr_Format(PyExc_TypeError,
                         "__classcell__ must be a nonlocal cell, not %.200R",
                         Py_TYPE(cell));
            goto error;
        }
        PyCell_Set(cell, (PyObject *) type);
        if (_PyDict_DelItemId(dict, &PyId___classcell__) < 0) {
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }

    /* Initialize the rest */
    if (PyType_Ready(type) < 0)
        goto error;

    /* Put the proper slots in place */
    fixup_slot_dispatchers(type);

    if (type->tp_dictoffset) {  // TODO
        et->ht_cached_keys = _PyDict_NewKeysForClass();
    }

    if (set_names(type) < 0)
        goto error;

    if (init_subclass(type, kwds) < 0)
        goto error;

    Py_DECREF(dict);
    return (PyObject *)type;

error:
    Py_XDECREF(dict);
    Py_XDECREF(bases);
    Py_XDECREF(slots);
    Py_XDECREF(type);
    return NULL;
}
```

* 类构建完成之后，还有一些回调函数需调用。@@__set_name__@@ 接口设计的目的是告诉类成员其绑定的成员名称，如某描述器实例本身是不知道自己绑定的成员名称，若实现了 @@__set_name__[1]@@ 接口则可轻松获得。@@__init_subclass__@@ 接口是定义在父类之上的，目的是告诉父类有一个子类被创建成功，可以用于如扩展的注册和类型的检查等方面。

```c
/* Call __set_name__ on all descriptors in a newly generated type */
static int
set_names(PyTypeObject *type)
{
    PyObject *names_to_set, *key, *value, *set_name, *tmp;
    Py_ssize_t i = 0;

    names_to_set = PyDict_Copy(type->tp_dict);
    if (names_to_set == NULL)
        return -1;

    while (PyDict_Next(names_to_set, &i, &key, &value)) {
        set_name = _PyObject_LookupSpecial(value, &PyId___set_name__);
        if (set_name != NULL) {
            tmp = PyObject_CallFunctionObjArgs(set_name, type, key, NULL);
            Py_DECREF(set_name);
            if (tmp == NULL) {
                _PyErr_FormatFromCause(PyExc_RuntimeError,
                    "Error calling __set_name__ on '%.100s' instance %R "
                    "in '%.100s'",
                    value->ob_type->tp_name, key, type->tp_name);
                Py_DECREF(names_to_set);
                return -1;
            }
            else
                Py_DECREF(tmp);
        }
        else if (PyErr_Occurred()) {
            Py_DECREF(names_to_set);
            return -1;
        }
    }

    Py_DECREF(names_to_set);
    return 0;
}

/* Call __init_subclass__ on the parent of a newly generated type */
static int
init_subclass(PyTypeObject *type, PyObject *kwds)
{
    PyObject *super, *func, *result;
    PyObject *args[2] = {(PyObject *)type, (PyObject *)type};

    super = _PyObject_FastCall((PyObject *)&PySuper_Type, args, 2);
    if (super == NULL) {
        return -1;
    }

    func = _PyObject_GetAttrId(super, &PyId___init_subclass__);
    Py_DECREF(super);
    if (func == NULL) {
        return -1;
    }

    result = _PyObject_FastCallDict(func, NULL, 0, kwds);
    Py_DECREF(func);
    if (result == NULL) {
        return -1;
    }

    Py_DECREF(result);
    return 0;
}
```

最后可参考如下 PyXXX_Type 的说明，其描述了堆类型在 @@CAPI_PyType_Ready@@ 执行前，type_new() 所做工作的类似静态类型定义那样中为各字段逐一设置值，然后进行初始化的设计逻辑。

```c
PyTypeObject PyXXX_Type = {
    /* ob_type = metatype, ob_size = nslots
       nslots 为普通 slot 的数量，不包含 "__dict__" 和 "__weakref__" */
    PyVarObject_HEAD_INIT(metatype, nslots)

    /* metatype(name, ....) 传入的类名 */
    name,                                       /* tp_name */

    /* 实例对象的大小 = base->tp_basicsize 
                    + nslots * sizeof(PyObject *)
                    + sizeof(PyObject *) if 添加 __dict__ else 0
                    + sizeof(PyObject *) if 添加 __weakref__ else 0 */
    basicsize,                                  /* tp_basicsize */

    /* 实例对象变长成员大小 */
    base->tp_itemsize,                          /* tp_itemsize */

    (destructor)subtype_dealloc,                /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */

    /* 指向 PyHeapTypeObject 内嵌的 as_async 成员 */
    &et.as_async,                               /* tp_as_async */

    0,                                          /* tp_repr */

    /* 指向 PyHeapTypeObject 内嵌的 as_number/sequence/mapping 成员 */
    &et.as_number,                              /* tp_as_number */
    &et.as_sequence,                            /* tp_as_sequence */
    &et.as_mapping,                             /* tp_as_mapping */

    0,                                          /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */

    /* 一般来说，若父类没有实现，则设置为 PyObject_GenericGetAttr */
    PyObject_GenericGetAttr or 0,               /* tp_getattro */

    /* 一般来说，若父类没有实现，则设置为 PyObject_GenericSetAttr */
    PyObject_GenericSetAttr or 0,               /* tp_setattro */

    /* 指向 PyHeapTypeObject 内嵌的 as_buffer 成员 */
    &et.as_buffer,                              /* tp_as_buffer */

    /* 堆类型的默认 flags */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HEAPTYPE | Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC,                         /* tp_flags */

    /* 若 metatype(..., {"__doc__": ...}) 传入的 ns 字典中存在 "__doc__"，则从中设置 */
    ns["__doc__"],                              /* tp_doc */

    (traverseproc)subtype_traverse,             /* tp_traverse */
    (inquiry)subtype_clear,                     /* tp_clear */
    0,                                          /* tp_richcompare */

    /* 实例对象 weakref 指针便宜，若存在一般位于实例最后，否则为 0 */
    weaklistoffset or 0,                        /* tp_weaklistoffset */

    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    0,                                          /* tp_methods */

    /* 指向 PyHeapTypeObject 尾部的 PyMemberDef 数组
       该数组依据 slots 进行初始化 {slot, T_OBJECT_EX, slotoffset} */
    PyHeapType_GET_MEMBERS(&et),                /* tp_members */

    /* 根据是否有实例 __dict__ 和 __weakref__ 属性设置

       if tp_weaklistoffset && tp_dictoffset:
          subtype_getsets_full
       elif tp_weaklistoffset && !tp_dictoffset:
          subtype_getsets_weakref_only
       elif !tp_weaklistoffset && tp_dictoffset:
          subtype_getsets_dict_only
       else:
          0 
    */
    subtype_getsets_* or 0,                     /* tp_getset */

    /* best_base(bases) 选出的主基类 */
    base,                                       /* tp_base */

    /* 从 metatype(..., {"__doc__": ...}) 传入的 ns 字典构建的 dict
       
       - 可能会补 __module__ = globals()["__name__"]
       - 若存在 __qualname__ 则删除，由 type.__qualname__ 提供访问
       - 若存在 __classcell__ 则设置其 ob_ref 为当前类型并从 dict 删除
       - 可能包装 __new__/__init_subclass__/__class_getitem__ 函数 
    */
    dict,                                       /* tp_dict */

    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */

    /* 实例对象的 __dict__ 偏移

       若允许当前类型添加 __dict__，则
          - 若 base->tp_itemsize，则偏移为 -(long)sizeof(PyObject *)
          - 否则偏移为实例 slots 组的后一个指针
       不允许则为 0
    */
    dictoffset or 0,                            /* tp_dictoffset */

    0,                                          /* tp_init */
    PyType_GenericAlloc,                        /* tp_alloc */
    0,                                          /* tp_new */
    PyObject_GC_Del,                            /* tp_free */
    0,                                          /* tp_is_gc */

    /* metatype(..., bases, ...) 传递的基类 */
    bases,                                      /* tp_bases */
};

typedef struct _heaptypeobject {
    /* Note: there's a dependency on the order of these members
       in slotptr() in typeobject.c . */
    PyTypeObject ht_type;          /* &PyXXX_Type */
    PyAsyncMethods as_async;
    PyNumberMethods as_number;
    PyMappingMethods as_mapping;
    PySequenceMethods as_sequence; /* as_sequence comes after as_mapping,
                                      so that the mapping wins when both
                                      the mapping and the sequence define
                                      a given operator (e.g. __getitem__).
                                      see add_operators() in typeobject.c . */
    PyBufferProcs as_buffer;
    PyObject *ht_name;             /* ht_type -> tp_name */
    PyObject *ht_slots;            /* __slots__ (w/o __dict__/__weakref__) */
    PyObject *ht_qualname;         /* dict.get("__qualname__") or *ht_name */
    struct _dictkeysobject *ht_cached_keys;
    /* here are optional user slots, followed by the members. */
} PyHeapTypeObject;

static PyMemberDef xxx_members[] = {
    // name, type, offset, flags, doc
    {ht_slots[0], T_OBJECT_EX, base->tp_basicsize, 0},
    {ht_slots[1], T_OBJECT_EX, base->tp_basicsize + sizeof(PyObject *), 0},
    ...
    {ht_slots[nslots - 1], T_OBJECT_EX, base->tp_basicsize + 
                                        (nslots - 1) * sizeof(PyObject *), 0},
    {0}
};
```

由 type 创建类型在 @@__new__@@ 之后还会调用 object 的 @@__init__@@ 进行初始化。对于类对象初始化而言，其已经是完全可用的对象，因而 @@__init__@@ 什么也不会做。

```c
// Objects/typeobject.c#type_init
static int
type_init(PyObject *cls, PyObject *args, PyObject *kwds)
{
    int res;

    assert(args != NULL && PyTuple_Check(args));
    assert(kwds == NULL || PyDict_Check(kwds));

    if (kwds != NULL && PyTuple_Check(args) && PyTuple_GET_SIZE(args) == 1 &&
        PyDict_Check(kwds) && PyDict_GET_SIZE(kwds) != 0) {
        PyErr_SetString(PyExc_TypeError,
                        "type.__init__() takes no keyword arguments");
        return -1;
    }

    if (args != NULL && PyTuple_Check(args) &&
        (PyTuple_GET_SIZE(args) != 1 && PyTuple_GET_SIZE(args) != 3)) {
        PyErr_SetString(PyExc_TypeError,
                        "type.__init__() takes 1 or 3 arguments");
        return -1;
    }

    /* Call object.__init__(self) now. */
    /* XXX Could call super(type, cls).__init__() but what's the point? */
    args = PyTuple_GetSlice(args, 0, 0);
    if (args == NULL) {
        return -1;
    }
    res = object_init(cls, args, NULL);  // object_init(cls, (), NULL)
    Py_DECREF(args);
    return res;
}

// Objects/typeobject.c#excess_args
static int
excess_args(PyObject *args, PyObject *kwds)
{
    return PyTuple_GET_SIZE(args) ||
        (kwds && PyDict_Check(kwds) && PyDict_GET_SIZE(kwds));
}

// Objects/typeobject.c#object_init
static int
object_init(PyObject *self, PyObject *args, PyObject *kwds)
{
    PyTypeObject *type = Py_TYPE(self);
    if (excess_args(args, kwds)) {
        if (type->tp_init != object_init) {
            PyErr_SetString(PyExc_TypeError,
                            "object.__init__() takes exactly one argument (the instance to initialize)");
            return -1;
        }
        if (type->tp_new == object_new) {
            PyErr_Format(PyExc_TypeError,
                         "%.200s.__init__() takes exactly one argument (the instance to initialize)",
                         type->tp_name);
            return -1;
        }
    }
    return 0;
}
```

总结来说，`class` 是创建堆类型的方法之一，其设计为若干层接口来实现，最顶层最直接处理 `class` 的输入，然后是通用堆类型的构建接口，最后是通用类型构建接口。各层职责分明，容易进行其它功能的扩展和实现。从实现上看，本质上与静态类型的构建非常相似，即先为类型对象的槽设置值，然后再初始化。
