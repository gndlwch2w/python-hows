### 函数作用域

函数是 Python 中常见的可独立执行的单元（或称为 @@codeblock@@），其它常见的代码块如类定义和模块。在代码块中允许声明和使用变量，变量的可见性称之为变量的作用域，承载变量的空间称为命名空间。

* 定义在模块内的变量，其作用域对模块中的所有代码块可见，称为全局变量。而定义在函数体内的变量，其作用域仅会扩展到该函数所包含的任何代码块（即如内嵌函数等），称为局部变量。另外，函数体内无论使用先后只要出现对某变量的声明，则认为其是局部变量，若某局部变量使用前没有绑定值，则抛出 UnboundLocalError 异常。

* 当一个变量被使用时需要动态地依据就近作用域原则解析其值，如在正常情况下，全局命名空间和局部命名空间都包含变量名称相同的变量，则会从局部命名空间中解析。若对某变量进行如 `global var` 的声明，则当前函数体内会从全局命名空间中解析 *var* 变量，即先在所处模块中查找，若找不到再从 builtins 模块中查找，都找不到则抛出 NameError 异常。另外，`nonlocal var` 允许声明内嵌函数引用外部函数的局部变量，对于内部使用外部局部变量的情况，称为闭包变量的访问。

如从下面例子可以看出，对于 f() 而言，*x* 没有定义过，即只能到全局命名空间中查找，由 @@LOAD_GLOBAL@@ 字节码进行访问。*print* 同样没有定义，@@LOAD_GLOBAL@@ 会在模块的 \_\_builtins__ 字典中找到它。而 *y* 是显示声明的，即作为普通局部变量，由 @@LOAD-STORE_FAST@@ 字节码进行访问（这是由于普通函数默认支持 @@CO_OPTIMIZED@@，对于其它代码块则由 @@LOAD-STORE_NAME@@ 进行访问）。同样 *z* 也是显示声明，但其被内嵌函数 g() 使用了，在 f() 执行前会转换为闭包变量，由 @@LOAD-STORE_DEREF@@ 字节码进行访问。对于 g() 而言，允许访问定义在 f() 中的局部变量，也允许访问模块中的全局变量。另外需要注意，`global x` 写与不写作用是相同的，但 `nonlocal z` 必须写，因为如不写 *z* 对 g() 而言就是局部变量，声明 *z* 又使用到其本身就会触发 UnboundLocalError 异常。

```python
x = 1          # 全局变量
def f():
    global x
    y = x      # 局部变量
    z = y + 1  # 闭包变量
    def g():
        nonlocal z
        z = x + z
    g()
    print(z)

>>> dis(f.__code__)
  3           0 LOAD_GLOBAL              0 (x)
              2 STORE_FAST               0 (y)

  4           4 LOAD_FAST                0 (y)
              6 LOAD_CONST               1 (1)
              8 BINARY_ADD
             10 STORE_DEREF              0 (z)

  5          12 LOAD_CLOSURE             0 (z)
             14 BUILD_TUPLE              1
             16 LOAD_CONST               2 (<code object g at 0x10100a450, line 5>)
             18 LOAD_CONST               3 ('f.<locals>.g')
             20 MAKE_FUNCTION            8 (closure)
             22 STORE_FAST               1 (g)

  8          24 LOAD_FAST                1 (g)
             26 CALL_FUNCTION            0
             28 POP_TOP

  9          30 LOAD_GLOBAL              1 (print)
             32 LOAD_DEREF               0 (z)
             34 CALL_FUNCTION            1
             36 POP_TOP
             38 LOAD_CONST               0 (None)
             40 RETURN_VALUE

Disassembly of <code object g at 0x10100a450, line 5>:
  7           0 LOAD_GLOBAL              0 (x)
              2 LOAD_DEREF               0 (z)
              4 BINARY_ADD
              6 STORE_DEREF              0 (z)
              8 LOAD_CONST               0 (None)
             10 RETURN_VALUE
```

如下是上述变量访问字节码的实现，具体来说，

* @@LOAD_GLOBAL@@ 会依次从 @@frameobject@@ 的 *f_globals* 和 *f_builtins* 中进行查找，即所处模块的全局命名空间和 \_\_builtins__ 内建命名空间。其对查询结果的缓存的实现可参考 @@function-invocation@@。

* @@LOAD-STORE_FAST@@ 通过访问 *f_localsplus* 数组实现局部变量的快速读写。而 @@LOAD-STORE_NAME@@ 主要是对 *f_locals* 字典进行读写实现局部变量的访问，其中 @@LOAD_NAME@@ 会依次从 *f_locals*、*f_globals* 和 *f_builtins* 进行查找。

* @@LOAD-STORE_DEREF@@ 则是对 `freevars = f_localsplus + co_nlocals` 数组中的 @@PyCellObject@@ 进行读写实现闭包变量的访问。对于闭包变量提供者，其负责 @@PyCellObject@@ 对象的构建，然后置于 *freevars* 数组的相应位置；而闭包变量的使用者，在其构建期间会将所需的 @@PyCellObject@@ 传递到函数对象的 *func_closure* 中，然后待其执行时置于 @@frameobject@@ 的 *freevars* 的相应位置，那么 @@LOAD-STORE_DEREF@@ 就能正确访问它们。

```c
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
        
        case TARGET(LOAD_GLOBAL): {
            PyObject *name;
            PyObject *v;
            if (PyDict_CheckExact(f->f_globals)
                && PyDict_CheckExact(f->f_builtins))
            {
                OPCACHE_CHECK();
                if (co_opcache != NULL && co_opcache->optimized > 0) {
                    _PyOpcache_LoadGlobal *lg = &co_opcache->u.lg;

                    if (lg->globals_ver ==
                            ((PyDictObject *)f->f_globals)->ma_version_tag
                        && lg->builtins_ver ==
                           ((PyDictObject *)f->f_builtins)->ma_version_tag)
                    {
                        PyObject *ptr = lg->ptr;
                        OPCACHE_STAT_GLOBAL_HIT();
                        assert(ptr != NULL);
                        Py_INCREF(ptr);
                        PUSH(ptr);
                        DISPATCH();
                    }
                }

                name = GETITEM(names, oparg);
                v = _PyDict_LoadGlobal((PyDictObject *)f->f_globals,
                                       (PyDictObject *)f->f_builtins,
                                       name);
                if (v == NULL) {
                    if (!_PyErr_OCCURRED()) {
                        /* _PyDict_LoadGlobal() returns NULL without raising
                         * an exception if the key doesn't exist */
                        format_exc_check_arg(tstate, PyExc_NameError,
                                             NAME_ERROR_MSG, name);
                    }
                    goto error;
                }

                if (co_opcache != NULL) {
                    _PyOpcache_LoadGlobal *lg = &co_opcache->u.lg;

                    if (co_opcache->optimized == 0) {
                        /* Wasn't optimized before. */
                        OPCACHE_STAT_GLOBAL_OPT();
                    } else {
                        OPCACHE_STAT_GLOBAL_MISS();
                    }

                    co_opcache->optimized = 1;
                    lg->globals_ver =
                        ((PyDictObject *)f->f_globals)->ma_version_tag;
                    lg->builtins_ver =
                        ((PyDictObject *)f->f_builtins)->ma_version_tag;
                    lg->ptr = v; /* borrowed */
                }

                Py_INCREF(v);
            }
            else {
                /* Slow-path if globals or builtins is not a dict */

                /* namespace 1: globals */
                name = GETITEM(names, oparg);
                v = PyObject_GetItem(f->f_globals, name);
                if (v == NULL) {
                    if (!_PyErr_ExceptionMatches(tstate, PyExc_KeyError)) {
                        goto error;
                    }
                    _PyErr_Clear(tstate);

                    /* namespace 2: builtins */
                    v = PyObject_GetItem(f->f_builtins, name);
                    if (v == NULL) {
                        if (_PyErr_ExceptionMatches(tstate, PyExc_KeyError)) {
                            format_exc_check_arg(
                                        tstate, PyExc_NameError,
                                        NAME_ERROR_MSG, name);
                        }
                        goto error;
                    }
                }
            }
            PUSH(v);
            DISPATCH();
        }

        case TARGET(LOAD_FAST): {
            PyObject *value = GETLOCAL(oparg);
            if (value == NULL) {
                format_exc_check_arg(tstate, PyExc_UnboundLocalError,
                                     UNBOUNDLOCAL_ERROR_MSG,
                                     PyTuple_GetItem(co->co_varnames, oparg));
                goto error;
            }
            Py_INCREF(value);
            PUSH(value);
            FAST_DISPATCH();
        }

        case TARGET(STORE_FAST): {
            PREDICTED(STORE_FAST);
            PyObject *value = POP();
            SETLOCAL(oparg, value);
            FAST_DISPATCH();
        }

        case TARGET(LOAD_NAME): {
            PyObject *name = GETITEM(names, oparg);
            PyObject *locals = f->f_locals;
            PyObject *v;
            if (locals == NULL) {
                _PyErr_Format(tstate, PyExc_SystemError,
                              "no locals when loading %R", name);
                goto error;
            }
            if (PyDict_CheckExact(locals)) {
                v = PyDict_GetItemWithError(locals, name);
                if (v != NULL) {
                    Py_INCREF(v);
                }
                else if (_PyErr_Occurred(tstate)) {
                    goto error;
                }
            }
            else {
                v = PyObject_GetItem(locals, name);
                if (v == NULL) {
                    if (!_PyErr_ExceptionMatches(tstate, PyExc_KeyError))
                        goto error;
                    _PyErr_Clear(tstate);
                }
            }
            if (v == NULL) {
                v = PyDict_GetItemWithError(f->f_globals, name);
                if (v != NULL) {
                    Py_INCREF(v);
                }
                else if (_PyErr_Occurred(tstate)) {
                    goto error;
                }
                else {
                    if (PyDict_CheckExact(f->f_builtins)) {
                        v = PyDict_GetItemWithError(f->f_builtins, name);
                        if (v == NULL) {
                            if (!_PyErr_Occurred(tstate)) {
                                format_exc_check_arg(
                                        tstate, PyExc_NameError,
                                        NAME_ERROR_MSG, name);
                            }
                            goto error;
                        }
                        Py_INCREF(v);
                    }
                    else {
                        v = PyObject_GetItem(f->f_builtins, name);
                        if (v == NULL) {
                            if (_PyErr_ExceptionMatches(tstate, PyExc_KeyError)) {
                                format_exc_check_arg(
                                            tstate, PyExc_NameError,
                                            NAME_ERROR_MSG, name);
                            }
                            goto error;
                        }
                    }
                }
            }
            PUSH(v);
            DISPATCH();
        }

        case TARGET(STORE_NAME): {
            PyObject *name = GETITEM(names, oparg);
            PyObject *v = POP();
            PyObject *ns = f->f_locals;
            int err;
            if (ns == NULL) {
                _PyErr_Format(tstate, PyExc_SystemError,
                              "no locals found when storing %R", name);
                Py_DECREF(v);
                goto error;
            }
            if (PyDict_CheckExact(ns))
                err = PyDict_SetItem(ns, name, v);
            else
                err = PyObject_SetItem(ns, name, v);
            Py_DECREF(v);
            if (err != 0)
                goto error;
            DISPATCH();
        }

        case TARGET(LOAD_DEREF): {
            PyObject *cell = freevars[oparg];
            PyObject *value = PyCell_GET(cell);
            if (value == NULL) {
                format_exc_unbound(tstate, co, oparg);
                goto error;
            }
            Py_INCREF(value);
            PUSH(value);
            DISPATCH();
        }

        case TARGET(STORE_DEREF): {
            PyObject *v = POP();
            PyObject *cell = freevars[oparg];
            PyObject *oldobj = PyCell_GET(cell);
            PyCell_SET(cell, v);
            Py_XDECREF(oldobj);
            DISPATCH();
        }

        }
    }
}
```