### 引用计数

为便于对象的管理，为每个 Python 对象的头部设计了两个共有字段，记录对象的强引用数字段 *ob_refcnt* 和对象的类型字段 *ob_type*。一般而言，当一个对象创建成功时，会将其 *ob_refcnt* 初始化为 *1*。新对象一定在某个 C 函数里诞生，然后可能以参数或返回值的形式在不同函数间传递。假设能持有 PyObject 对象指针的对象都称为容器，那么新对象要么被转移到其它容器存储，要么在传递过程中同时被多个容器存储，或者新对象未被存储，在某个函数处理期间作为中间对象。

```c
// Include/object.h#PyObject
/* Nothing is actually declared to be a PyObject, but every pointer to
 * a Python object can be cast to a PyObject*.  This is inheritance built
 * by hand.  Similarly every pointer to a variable-size Python object can,
 * in addition, be cast to PyVarObject*.
 */
typedef struct _object {
    _PyObject_HEAD_EXTRA
    Py_ssize_t ob_refcnt;
    struct _typeobject *ob_type;
} PyObject;

// Include/object.h#PyObject
typedef struct {
    PyObject ob_base;
    Py_ssize_t ob_size; /* Number of items in variable part */
} PyVarObject;
```

为避免内存泄露问题，对象在转移、存储和处理期间需要维持引用计数正确工作，在对象没有任何容器持有时将其销毁。一般来说，创建对象的函数最先持有新对象的引用，其可以通过返回的形式将引用转移给其调用者，其调用者也可以将引用转移给某容器。若对象创建作为中间对象，那么在中间对象完成使命后需将其引用计数修改为 *0* 以销毁对象。最基本操作对象引用计数的工具是 @@CAPI_Py_INCREF@@ 和 @@CAPI_Py_DECREF@@ 宏，前者能够增加一个对象的强引用（或称转换一个借引用为强引用），后者则能够释放一个强引用，表明不再需要持有对象，同时在引用计数为 *0* 时触发对象的销毁。

```c
// Include/object.h#Py_INCREF
#define Py_INCREF(op) _Py_INCREF(_PyObject_CAST(op))

// Include/object.h#_Py_INCREF
static inline void _Py_INCREF(PyObject *op)
{
    _Py_INC_REFTOTAL;
    op->ob_refcnt++;
}

// Include/object.h#Py_DECREF
#define Py_DECREF(op) _Py_DECREF(__FILE__, __LINE__, _PyObject_CAST(op))

// Include/object.h#_Py_DECREF
static inline void _Py_DECREF(const char *filename, int lineno,
                              PyObject *op)
{
    (void)filename; /* may be unused, shut up -Wunused-parameter */
    (void)lineno; /* may be unused, shut up -Wunused-parameter */
    _Py_DEC_REFTOTAL;
    if (--op->ob_refcnt != 0) {
#ifdef Py_REF_DEBUG
        if (op->ob_refcnt < 0) {
            _Py_NegativeRefcount(filename, lineno, op);
        }
#endif
    }
    else {
        _Py_Dealloc(op);
    }
}
```

下面是一些例子说明如何维护引用计数，

* 对于赋值操作，

    * 先由 @@LOAD_NAME@@ 从局部命名空间 *f_locals*、全局命名空间 *f_globals* 或 内建命名空间 *f_builtins* 查找对象，涉及到字典查询接口 @@CAPI_PyDict_GetItemWithError@@ 或通用对象查询接口 @@CAPI_PyObject_GetItem@@，前者返回一个借引用对象，后者返回一个强引用对象。若查询对象存在于字典中，那么字典一定持有它的强引用，那么返回对象无论如何传递，字典都负责对象的管理。而通用查询接口返回的对象不一定被其容器对象持有，如返回一个新创建的对象，那么调用接口的函数负责管理该对象。若成功找到目标对象，之后需将对象存储到值栈中，即值栈同时持有对象，对于借引用对象，需将其转换为强引用对象，即使用 @@CAPI_Py_INCREF@@ 宏将引用计数加 *1*。

    * 然后由 @@STORE_NAME@@ 将值栈管理的对象转移到局部命名空间，涉及到字典设置接口 @@CAPI_PyDict_SetItem@@ 或通用对象设置接口 @@CAPI_PyObject_SetItem@@，二者都不会窃取待设置对象的引用，因为不确定待设置对象是否为借引用，而容器需要存储对象，则必须持有其强引用，故内部将引用计数加 *1*。在设置完成后，值栈不需要再持有对象的引用，故使用 @@CAPI_Py_DECREF@@ 将引用计数减 *1*。

```python
>>> dis("o = object")
  1           0 LOAD_NAME                0 (object)
              2 STORE_NAME               1 (o)
              4 LOAD_CONST               0 (None)
              6 RETURN_VALUE
```

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
                // 返回借引用
                v = PyDict_GetItemWithError(locals, name);
                if (v != NULL) {
                    // 需增加一个强引用，后面要将 v 存储到值栈
                    Py_INCREF(v);
                }
                else if (_PyErr_Occurred(tstate)) {
                    goto error;
                }
            }
            else {
                // 返回强引用，无需增加强引用，直接转移引用给值栈
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
        
        }
    }
}
```

* C 函数的调用参数通常传递的是借引用对象，即无论函数如何处理对象，调用者负责管理所传入的参数对象。函数的返回值具有不同情况，如 @@CAPI_PyNumber_Multiply@@ 成功时会创建新对象返回，此时返回的是强引用对象。当其结果设置到值栈，可直接将强引用转移给值栈。

```python
>>> dis("a * b")
  1           0 LOAD_NAME                0 (a)
              2 LOAD_NAME                1 (b)
              4 BINARY_MULTIPLY
              6 RETURN_VALUE
```

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
        
        case TARGET(BINARY_MULTIPLY): {
            PyObject *right = POP();
            PyObject *left = TOP();
            // 传递借引用给 C 函数
            PyObject *res = PyNumber_Multiply(left, right);
            Py_DECREF(left);
            Py_DECREF(right);
            // 返回值具有一个引用，转移给值栈
            SET_TOP(res);
            if (res == NULL)
                goto error;
            DISPATCH();
        }
        
        }
    }
}
```

* 包括 Python 函数调用也一样，值栈负责管理调用参数，传递借引用给内部函数调用。调用 Python 函数会递归进入 @@CAPI_PyEval_EvalCodeEx@@，其创建的新 @@frameobject@@ 会持有函数的参数，但对于当前值栈无需关心，只需在执行结束后不再持有参数对象的引用。以及 @@CAPI_PyEval_EvalCodeEx@@ 返回的是强引用对象，那么可以直接转移到当前值栈。如下例子中，一开始变量 *a* 的引用计数为 *2* 是因为同时被局部命名空间 *f_fastlocals* 和值栈 *f_valuestack* 持有，在函数 *f* 期间为 *4* 即被两个 @@frameobject@@ 分别持有。

```python
>>> dis("f(a, b, c)")
  1           0 LOAD_NAME                0 (f)
              2 LOAD_NAME                1 (a)
              4 LOAD_NAME                2 (b)
              6 LOAD_NAME                3 (c)
              8 CALL_FUNCTION            3
             10 RETURN_VALUE

>>> x = object()
>>> sys.getrefcount(x)
2
>>> def f(x):      
...     print(sys.getrefcount(x))
... 
>>> f(x)
4
```

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
        
        case TARGET(CALL_FUNCTION): {
            PREDICTED(CALL_FUNCTION);
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

// Python/ceval.c#call_function
Py_LOCAL_INLINE(PyObject *) _Py_HOT_FUNCTION
call_function(PyThreadState *tstate, PyObject ***pp_stack, Py_ssize_t oparg, PyObject *kwnames)
{
    PyObject **pfunc = (*pp_stack) - oparg - 1;
    PyObject *func = *pfunc;
    PyObject *x, *w;
    Py_ssize_t nkwargs = (kwnames == NULL) ? 0 : PyTuple_GET_SIZE(kwnames);  // 关键字参数个数
    Py_ssize_t nargs = oparg - nkwargs;                                      // 位置参数个数
    PyObject **stack = (*pp_stack) - nargs - nkwargs;                        // 函数调用参数数组

    if (tstate->use_tracing) {
        x = trace_call_function(tstate, func, stack, nargs, kwnames);
    }
    else {
        x = _PyObject_Vectorcall(func, stack, nargs | PY_VECTORCALL_ARGUMENTS_OFFSET, kwnames);
    }

    assert((x != NULL) ^ (_PyErr_Occurred(tstate) != NULL));

    /* Clear the stack of the function object. */
    while ((*pp_stack) > pfunc) {
        w = EXT_POP(*pp_stack);
        // 函数调用结束，将由值栈管理的参数清理
        Py_DECREF(w);
    }

    return x;
}
```

因此，在一般情况下，只要确保正确维护对象的引用计数，就能以低廉的手段实现对象的垃圾回收。
