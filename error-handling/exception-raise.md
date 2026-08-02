### 抛出异常

当业务函数检测到输入不合法，导致无法继续推进业务流程，可向调用者抛出异常，并说明错误产生的原因。在 Python 层面，允许通过 `raise` 语法抛出异常，其语法规则如下。test 为表达式，求值结果需为 @@exception-object@@，其后允许接另一个异常对象表明导致当前异常的原因。

```peg
raise_stmt: 'raise' [test ['from' test]]
```

参考 @@raise-statement@@，`raise` 语法具有三种参数形式，无参表示重新引发当前正在处理的异常，一个参数则为需引发的异常，而两个参数用于异常的串连，即第二个异常对象作为第一个的原因。

```python
>>> dis("raise")                 # 重新引发当前正在处理的异常
  1           0 RAISE_VARARGS            0
              2 LOAD_CONST               0 (None)
              4 RETURN_VALUE

>>> dis("raise obj")             # 将第一个表达式求值为异常对象
  1           0 LOAD_NAME                0 (obj)
              2 RAISE_VARARGS            1
              4 LOAD_CONST               0 (None)
              6 RETURN_VALUE

>>> dis("raise obj1 from obj2")  # 异常串连
  1           0 LOAD_NAME                0 (obj1)
              2 LOAD_NAME                1 (obj2)
              4 RAISE_VARARGS            2
              6 LOAD_CONST               0 (None)
              8 RETURN_VALUE
```

可进一步参考如下例子，了解 `raise` 语法的功能。

```python
>>> try:
...     raise RuntimeError("a") from RuntimeError("b")
... except Exception as e:
...     print(e, e.__cause__, e.__suppress_context__)
... 
a b True

>>> try:
...     try:
...         raise RuntimeError("a")
...     except:
...         raise RuntimeError("b")
... except Exception as e:
...     print(e, e.__context__, e.__suppress_context__)
... 
b a False

>>> def f():
...     raise RuntimeError("a")
... 
>>> try:
...     f()
... except Exception as e:
...     import traceback
...     traceback.print_tb(e.__traceback__)
... 
  File "<stdin>", line 2, in <module>
  File "<stdin>", line 2, in f
```

@@RAISE_VARARGS@@ 字节码为 `raise` 的实现，其具有三种输入参数，分别处理 `raise` 的三种输入情况。接收输入参数后，调用 do_raise() 在线程状态中设置异常标记，即类似 @@CAPI_PyErr_SetString@@ 接口的功能。若该函数返回 1，则直接跳转到 exception_unwind 寻找异常处理器处理异常，否则跳转到 error 先对异常做处理后才进入 exception_unwind。

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
        
        case TARGET(RAISE_VARARGS): {
            PyObject *cause = NULL, *exc = NULL;
            switch (oparg) {
            case 2:  // 异常串连
                cause = POP(); /* cause */
                /* fall through */
            case 1:  // 第一个表达式求值为异常对象
                exc = POP(); /* exc */
                /* fall through */
            case 0:  // 重新引发当前正在处理的异常
                if (do_raise(tstate, exc, cause)) {  // 设置异常到 curexc_*
                    goto exception_unwind;
                }
                break;
            default:
                _PyErr_SetString(tstate, PyExc_SystemError,
                                 "bad RAISE_VARARGS oparg");
                break;
            }
            goto error;
        }

        }
    }
}
```

* do_raise() 的功能类似 PyErr_SetXXX() 接口，即作为中间桥梁转换 `raise` 的输入为 @@CAPI_PyErr_SetObject@@ 的输入来实现异常的抛出。

    * 对于无参的方式，即待抛出的异常对象 *exc* 为 *NULL*。先从线程状态 @@PyThreadState@@ 的异常栈 *exc_info* 中获取最近抛出的一个有效异常，然后再调用 @@CAPI_PyErr_Restore@@ 将异常信息设置到 @@PyThreadState@@ 的 curexc_* 字段表明正在传播的异常。若异常栈没有异常，则默认抛出 RuntimeError。注意到，异常栈 *exc_info* 中可能临时插入如生成器的异常栈，因此需要在其中寻找到有效的异常。

    * 对于一个参数的形式，若 *exc* 为异常类型，则调用其无参构造创建异常对象。

    * 对于两个参数的形式，将第二个异常对象设置到第一个异常对象的 \_\_cause__ 属性表明异常原因。

```c
// Python/ceval.c#do_raise
static int
do_raise(PyThreadState *tstate, PyObject *exc, PyObject *cause)
{
    PyObject *type = NULL, *value = NULL;

    if (exc == NULL) {
        /* Reraise */
        _PyErr_StackItem *exc_info = _PyErr_GetTopmostException(tstate);
        PyObject *tb;
        type = exc_info->exc_type;
        value = exc_info->exc_value;
        tb = exc_info->exc_traceback;
        if (type == Py_None || type == NULL) {
            // 没有异常，则引发 RuntimeError
            _PyErr_SetString(tstate, PyExc_RuntimeError,
                             "No active exception to reraise");
            return 0;
        }
        Py_XINCREF(type);
        Py_XINCREF(value);
        Py_XINCREF(tb);
        _PyErr_Restore(tstate, type, value, tb);  // 设置到 curexc_*
        return 1;
    }

    /* We support the following forms of raise:
       raise
       raise <instance>
       raise <type> */

    if (PyExceptionClass_Check(exc)) {  // raise <exc-type>
        type = exc;
        value = _PyObject_CallNoArg(exc);  // value = exc()
        if (value == NULL)
            goto raise_error;
        if (!PyExceptionInstance_Check(value)) {
            _PyErr_Format(tstate, PyExc_TypeError,
                          "calling %R should have returned an instance of "
                          "BaseException, not %R",
                          type, Py_TYPE(value));
             goto raise_error;
        }
    }
    else if (PyExceptionInstance_Check(exc)) {  // raise <exc-instance>
        value = exc;
        type = PyExceptionInstance_Class(exc);  // type(exc)
        Py_INCREF(type);
    }
    else {
        /* Not something you can raise.  You get an exception
           anyway, just not what you specified :-) */
        Py_DECREF(exc);
        _PyErr_SetString(tstate, PyExc_TypeError,
                         "exceptions must derive from BaseException");
        goto raise_error;
    }

    assert(type != NULL);
    assert(value != NULL);

    if (cause) {
        PyObject *fixed_cause;
        if (PyExceptionClass_Check(cause)) {  
            // raise xxx from <exc-type>
            fixed_cause = _PyObject_CallNoArg(cause);
            if (fixed_cause == NULL)
                goto raise_error;
            Py_DECREF(cause);
        }
        else if (PyExceptionInstance_Check(cause)) {  
            // raise xxx from <exc-instance>
            fixed_cause = cause;
        }
        else if (cause == Py_None) {
            // raise xxx from None
            Py_DECREF(cause);
            fixed_cause = NULL;
        }
        else {
            _PyErr_SetString(tstate, PyExc_TypeError,
                             "exception causes must derive from "
                             "BaseException");
            goto raise_error;
        }
        // value.__cause__ = fixed_cause
        // value.__suppress_context__ = True
        PyException_SetCause(value, fixed_cause);
    }

    _PyErr_SetObject(tstate, type, value);
    /* PyErr_SetObject incref's its arguments */
    Py_DECREF(value);
    Py_DECREF(type);
    return 0;

raise_error:
    Py_XDECREF(value);
    Py_XDECREF(type);
    Py_XDECREF(cause);
    return 0;
}

// Python/errors.c#_PyErr_GetTopmostException
_PyErr_StackItem *
_PyErr_GetTopmostException(PyThreadState *tstate)
{
    _PyErr_StackItem *exc_info = tstate->exc_info;
    /* 生成器、协程和异步生成器每次恢复执行时，都会把自己的 _PyErr_StackItem 链到 
       tstate->exc_info 顶部，即使它自己的异常状态当前为空，也照样会入栈 */
    while ((exc_info->exc_type == NULL || exc_info->exc_type == Py_None) &&
           exc_info->previous_item != NULL)
    {
        exc_info = exc_info->previous_item;
    }
    return exc_info;
}
```

* 如之前例子中提及，当 except 中又引发异常，则新异常的 \_\_context__ 属性会自动设置为旧异常，即 @@CAPI_PyErr_SetObject@@ 抛出异常时，会先检查异常栈 *exc_info* 中是否有正在被 except 处理的异常，若有则将其设置为当前抛出异常对象的上下文，然后再调用 @@CAPI_PyErr_Restore@@ 将异常设置到 curexc_* 字段表明表明当前抛出但还未被处理的异常。注意到，无参 `raise` 的异常抛出未调用 @@CAPI_PyErr_SetObject@@，而是直接 @@CAPI_PyErr_Restore@@，因为其抛出的异常要么没有上下文，要么正在被 except 处理，只需重新设置到 curexc_* 字段。

```c
// Python/errors.c#_PyErr_SetObject
void
_PyErr_SetObject(PyThreadState *tstate, PyObject *exception, PyObject *value)
{
    /* 异常的值 value 可为任意 Python 对象 */
    PyObject *exc_value;
    PyObject *tb = NULL;

    if (exception != NULL &&
        !PyExceptionClass_Check(exception)) {
        _PyErr_Format(tstate, PyExc_SystemError,
                      "exception %R not a BaseException subclass",
                      exception);
        return;
    }

    Py_XINCREF(value);
    exc_value = _PyErr_GetTopmostException(tstate)->exc_value;
    if (exc_value != NULL && exc_value != Py_None) {
        /* Implicit exception chaining */
        Py_INCREF(exc_value);
        if (value == NULL || !PyExceptionInstance_Check(value)) {
            /* We must normalize the value right now */
            PyObject *fixed_value;

            /* Issue #23571: functions must not be called with an
               exception set */
            _PyErr_Clear(tstate);

            // fixed_value = exception(value)
            fixed_value = _PyErr_CreateException(exception, value);
            Py_XDECREF(value);
            if (fixed_value == NULL) {
                Py_DECREF(exc_value);
                return;
            }

            value = fixed_value;
        }

        /* Avoid reference cycles through the context chain.
           This is O(chain length) but context chains are
           usually very short. Sensitive readers may try
           to inline the call to PyException_GetContext. */
        // 检查 value -> exc_value -> ... -> value ?
        if (exc_value != value) {
            PyObject *o = exc_value, *context;
            // context = o.__context__
            while ((context = PyException_GetContext(o))) {
                Py_DECREF(context);
                if (context == value) {
                    PyException_SetContext(o, NULL);
                    break;
                }
                o = context;
            }
            // value.__context__ = exc_value
            PyException_SetContext(value, exc_value);
        }
        else {
            // 多次抛出相同异常
            Py_DECREF(exc_value);
        }
    }
    if (value != NULL && PyExceptionInstance_Check(value))
        tb = PyException_GetTraceback(value);  // value.__traceback__
    Py_XINCREF(exception);
    // 设置到 curexc_*
    _PyErr_Restore(tstate, exception, value, tb);
}
```

另外，CPython 提供了一类如 PyErr_SetXXX()、PyErr_FormatX() 和 PyErr_XXX() 的接口用于 C 层面异常的抛出，其实现上基本是依据不同的参数创建不同的异常对象，然后再调用 @@CAPI_PyErr_SetObject@@ 接口抛出异常，如 @@CAPI_PyErr_FormatV@@ 实现，详细的接口说明可参考 @@raising-exceptions@@。

```c
// Python/errors.c#_PyErr_FormatV
static PyObject *
_PyErr_FormatV(PyThreadState *tstate, PyObject *exception,
               const char *format, va_list vargs)
{
    PyObject* string;

    /* Issue #23571: PyUnicode_FromFormatV() must not be called with an
       exception set, it calls arbitrary Python code like PyObject_Repr() */
    _PyErr_Clear(tstate);

    string = PyUnicode_FromFormatV(format, vargs);

    _PyErr_SetObject(tstate, exception, string);
    Py_XDECREF(string);
    return NULL;
}
```
