## 为什么需要异常？
异常存在于计算机系统结构的不同层级，如硬件层级的中断、操作系统层级的 Trap 以及到编程语言层级的异常对象。无论处于哪一个层级，异常机制都服务于控制流的切换。如当 CPU 收到时钟中断事件时，该机制会使得 CPU 跳转到中断向量表中指定的中断处理程序响应相应的外部事件。推广到编程语言层面，由于程序的执行存在若干可能的路径，异常机制能够提供一种**更为清晰的业务逻辑与错误处理逻辑分离的结构化编程技巧**。如下分别采用 C、Java 和 Python 语言实现文件复制功能来说明这一点。

C 语言中没有提供结构化的异常处理机制，只能通过函数返回值等判断程序的运行时状态。通过如下代码可以看到，实现文件复制逻辑与文件操作错误处理逻辑高度耦合，编码容易出错且不易阅读。并且 `fileCopy` 接口返回值又有若干种状态，不利于复杂异常的传播和处理。
```c
#define FILECOPY_SUCCESS        1
#define FILECOPY_ERR_SRC_OPEN  -1
#define FILECOPY_ERR_DST_OPEN  -2
#define FILECOPY_ERR_READ      -3
#define FILECOPY_ERR_WRITE     -4

int fileCopy(const char *srcFn, const char *dstFn) {
    FILE *src = fopen(srcFn, "rb");
    if (src == NULL) {
        perror("Error opening source file");
        return FILECOPY_ERR_SRC_OPEN;
    }

    FILE *dst = fopen(dstFn, "wb");
    if (dst == NULL) {
        perror("Error opening destination file");
        fclose(src);
        return FILECOPY_ERR_DST_OPEN;
    }

    char buffer[1024];
    size_t n;
    while ((n = fread(buffer, 1, sizeof(buffer), src)) > 0) {
        if (fwrite(buffer, 1, n, dst) != n) {
            perror("Error writing to destination file");
            fclose(src);
            fclose(dst);
            return FILECOPY_ERR_WRITE;
        }
    }

    if (ferror(src)) {
        perror("Error reading from source file");
        fclose(src);
        fclose(dst);
        return FILECOPY_ERR_READ;
    }

    fclose(src);
    fclose(dst);
    return FILECOPY_SUCCESS;
}
```

Java 语言提供了异常类树和 `try-catch` 的异常处理机制。同样实现如上的功能，文件复制逻辑与文件操作错误处理逻辑实现了较好的分离，代码也变的更简洁和易读。同时，用户很容易对异常类进行扩展，从而以更为优雅的方式实现异常的传播。
```java
static class FileCopyException extends Exception {
    public FileCopyException(String message, Throwable cause) {
        super(message, cause);
    }

    public FileCopyException(String message) {
        super(message);
    }
}

/* try-with-resources 语法提供更简单的方式处理流 */
public static void fileCopy(String srcFn, String dstFn) throws FileCopyException {
    FileInputStream src = null;
    FileOutputStream dst = null;

    try {
        src = new FileInputStream(srcFn);
        dst = new FileOutputStream(dstFn);

        byte[] buffer = new byte[1024];
        int bytesRead;
        while ((bytesRead = src.read(buffer)) != -1) {
            dst.write(buffer, 0, bytesRead);
        }
    } catch (FileNotFoundException e) {
        if (e.getMessage().contains(srcFn)) {
            throw new FileCopyException("Source file not found: " + srcFn, e);
        } else {
            throw new FileCopyException("Cannot open destination file: " + dstFn, e);
        }
    } catch (IOException e) {
        throw new FileCopyException("I/O error during file copy: " + e.getMessage(), e);
    } finally {
        if (src != null) {
            try { src.close(); } catch (IOException ignore) {}
        }
        if (dst != null) {
            try { dst.close(); } catch (IOException ignore) {}
        }
    }
}
```

Python 语言类似 Java 语言也提供了类似的异常处理机制，即通过 `try-except` 处理异常。但是，流的清理逻辑以 `with` 机制实现，这也允许用户扩展到自定义资源的清理逻辑。
```python
def file_copy(src_fn, dst_fn):
    try:
        with open(src_fn, "rb") as src, open(dst_fn, "wb") as dst:
            dst.write(src.read())
    except FileNotFoundError:
        raise RuntimeError(f"Source file '{src_fn}' not found")
    except PermissionError:
        raise RuntimeError(f"Permission denied when accessing '{dst_fn}'")
    except OSError as e:
        raise RuntimeError(f"I/O error during file copy: {e}")
```

在现代的异常处理机制中，如 Python 3.11+ 允许处理异常组，从而便于统一处理错误。而 Go 语言采用值化异常，即不再采用异常的抛出和捕获机制，避免了隐式异常传播不可预测和性能开销等问题，如下为文件复制的 Go 语言实现。
```go
var (
	ErrSrcOpen = errors.New("cannot open source file")
	ErrDstOpen = errors.New("cannot open destination file")
	ErrRead    = errors.New("error reading from source file")
	ErrWrite   = errors.New("error writing to destination file")
)

func fileCopy(srcFn, dstFn string) error {
	src, err := os.Open(srcFn)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrSrcOpen, err)
	}
	defer src.Close()

	dst, err := os.Create(dstFn)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrDstOpen, err)
	}
	defer dst.Close()

	buf := make([]byte, 1024)
	for {
		n, err := src.Read(buf)
		if err != nil && err != io.EOF {
			return fmt.Errorf("%w: %v", ErrRead, err)
		}
		if n == 0 {
			break
		}
		if _, err := dst.Write(buf[:n]); err != nil {
			return fmt.Errorf("%w: %v", ErrWrite, err)
		}
	}

	return nil
}
```

## 异常是如何被引发和传播？
粗略的讲，Python 中存在两种类型的异常，分别为可捕获异常和不可捕获的异常。我们讨论的异常主要是可捕获异常，即能被 `try-expcet` 处理的异常，后文提及的异常除特别说明外都是可捕获异常。不可捕获的异常可称为错误，如 `SyntaxError`。这种异常和可捕获异常并无区别，只是引发的阶段不同。不可捕获的异常处于解析阶段，而可捕获异常引发阶段在解释执行阶段，因而不能够通过 Python 层面捕获和处理。如下案例说明异常被引发的不同情形。

### 内置功能引发异常
`divide` 函数的正常执行流会返回结果，但当除数为 `0` 特例下无法计算得到合法结果。在 Python 的异常机制下，CPython 中执行 `/` 的函数会抛出 `ZeroDivisionError` 异常，Python 解释器检测到异常后就会跳转到异常处理逻辑，接着寻找相应的异常处理逻辑，没有找到就中断程序的执行并向控制台打印异常信息。
```python
>>> def divide(a, b):
...     return a / b
... 
>>> divide(1, 0)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "<stdin>", line 2, in divide
ZeroDivisionError: division by zero
```

### 用户手动引发异常
Python 层面允许用户手动引发异常，即通过 `raise` 语法抛出一个异常，抛出的对象需要是 `BaseException` 的实例。用户自定义的异常建议派生自 `Exception` 类，而不是 `BaseException` 类。
```python
>>> raise RuntimeError("ohho, F**k")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
RuntimeError: ohho, F**k

>>> raise type('KfcException', (Exception,), {})('v me 50')
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
__main__.KfcException: v me 50
```

异常的引发还可能存在异常链，即一个异常处理过程中又引发了另一个异常。一般在 `except` 或 `finally` 中出现异常都会引发异常链。
```python
>>> try:
...     1 / 0
... except ZeroDivisionError as e:
...     raise RuntimeError("ohho, F**k")
... 
Traceback (most recent call last):
  File "<stdin>", line 2, in <module>
ZeroDivisionError: division by zero

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "<stdin>", line 4, in <module>
RuntimeError: ohho, F**k
```

另外，`raise A from B` 语法允许显示表明异常 `A` 是异常 `B` 的直接后果。当 `B` 为 `None` 时禁用自动异常链。
```python
>>> raise RuntimeError("ohho, F**k") from ZeroDivisionError("division by zero")
ZeroDivisionError: division by zero

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
RuntimeError: ohho, F**k

>>> try:
...     1 / 0
... except ZeroDivisionError as e:
...     raise RuntimeError("ohho, F**k") from None
Traceback (most recent call last):
  File "<stdin>", line 4, in <module>
RuntimeError: ohho, F**k
```

了解了 Python 层面异常的引发，下面从 CPython 层面看它们的具体实现。

### 内置功能引发异常机制
对于 `/` 引发的异常，从 `1.0 / 0` 的字节码开始分析，`/` 的功能由 `BINARY_TRUE_DIVIDE` 字节码实现。
```python
>>> dis.dis('1.0 / 0')
  1           0 LOAD_CONST               0 (1.0)
              2 LOAD_CONST               1 (0)
              4 BINARY_TRUE_DIVIDE
              6 RETURN_VALUE
```

在 `main_loop` 中 `BINARY_TRUE_DIVIDE` 字节码调用 `PyNumber_TrueDivide` 函数完成除法运算。并且注意到，当函数返回值为 `NULL` 时通过 `goto error` 跳转到异常处理部分。因此 `NULL` 在 CPython 中表明异常发生标记。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(BINARY_TRUE_DIVIDE): {
                PyObject *divisor = POP();
                PyObject *dividend = TOP();
                PyObject *quotient = PyNumber_TrueDivide(dividend, divisor);
                Py_DECREF(dividend);
                Py_DECREF(divisor);
                SET_TOP(quotient);
                if (quotient == NULL)
                    goto error;
                DISPATCH();
            }
        }
    }
}
```

在 `PyNumber_TrueDivide` 函数内，以 `nb_true_divide` 为 `op_slot` 参数调用 `binary_op` 函数，表明查找 `PyObject` 类型中 `nb_true_divide` 插槽指向的函数完成具体运算。接着 `binary_op1` 函数核心依据 `NB_BINOP(v->ob_type->tp_as_number, op_slot)` 找到具体的函数指针，然后调用找到的函数指针。
```c
// Objects/abstract.c
PyObject *
PyNumber_TrueDivide(PyObject *v, PyObject *w)
{
    return binary_op(v, w, NB_SLOT(nb_true_divide), "/");
}

static PyObject *
binary_op(PyObject *v, PyObject *w, const int op_slot, const char *op_name)
{
    PyObject *result = binary_op1(v, w, op_slot);
    if (result == Py_NotImplemented) {
        Py_DECREF(result);

        if (op_slot == NB_SLOT(nb_rshift) &&
            PyCFunction_Check(v) &&
            strcmp(((PyCFunctionObject *)v)->m_ml->ml_name, "print") == 0)
        {
            PyErr_Format(PyExc_TypeError,
                "unsupported operand type(s) for %.100s: "
                "'%.100s' and '%.100s'. Did you mean \"print(<message>, "
                "file=<output_stream>)\"?",
                op_name,
                v->ob_type->tp_name,
                w->ob_type->tp_name);
            return NULL;
        }

        return binop_type_error(v, w, op_name);
    }
    return result;
}

static PyObject *
binary_op1(PyObject *v, PyObject *w, const int op_slot)
{
    PyObject *x;
    binaryfunc slotv = NULL;
    binaryfunc slotw = NULL;

    if (v->ob_type->tp_as_number != NULL)
        slotv = NB_BINOP(v->ob_type->tp_as_number, op_slot);
    if (w->ob_type != v->ob_type &&
        w->ob_type->tp_as_number != NULL) {
        slotw = NB_BINOP(w->ob_type->tp_as_number, op_slot);
        if (slotw == slotv)
            slotw = NULL;
    }
    if (slotv) {
        if (slotw && PyType_IsSubtype(w->ob_type, v->ob_type)) {
            x = slotw(v, w);
            if (x != Py_NotImplemented)
                return x;
            Py_DECREF(x); /* can't do it */
            slotw = NULL;
        }
        x = slotv(v, w);
        if (x != Py_NotImplemented)
            return x;
        Py_DECREF(x); /* can't do it */
    }
    if (slotw) {
        x = slotw(v, w);
        if (x != Py_NotImplemented)
            return x;
        Py_DECREF(x); /* can't do it */
    }
    Py_RETURN_NOTIMPLEMENTED;
}
```

对于 `float` 类型对象，`nb_true_divide` 插槽指向的函数为 `float_div`。
```c
// Objects/floatobject.c
PyTypeObject PyFloat_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "float",
    sizeof(PyFloatObject),
    &float_as_number,                           /* tp_as_number */
};

static PyNumberMethods float_as_number = {
    float_div,          /* nb_true_divide */
};
```

最终由 `float_div` 函数完成具体的 `1.0 / 0` 的运算。在函数中，当除数 `b` 为 `0`，调用 `PyErr_SetString` 函数抛出 `PyExc_ZeroDivisionError` 异常，并返回 `NULL`。`PyExc_ZeroDivisionError` 是 `ZeroDivisionError` 的 C 实现。
```c
// Objects/floatobject.c
static PyObject *
float_div(PyObject *v, PyObject *w)
{
    double a,b;
    CONVERT_TO_DOUBLE(v, a);
    CONVERT_TO_DOUBLE(w, b);
    if (b == 0.0) {
        PyErr_SetString(PyExc_ZeroDivisionError,
                        "float division by zero");
        return NULL;
    }
    PyFPE_START_PROTECT("divide", return 0)
    a = a / b;
    PyFPE_END_PROTECT(a)
    return PyFloat_FromDouble(a);
}
```

`PyErr_Set*()` 类函数为 CPython 层面抛出异常的接口。在 `PyErr_SetString` 函数内将异常类型和异常消息作为参数调用 `_PyErr_SetObject` 函数抛出异常。
```c
// Python/errors.c
void
PyErr_SetString(PyObject *exception, const char *string)
{
    PyThreadState *tstate = _PyThreadState_GET();
    _PyErr_SetString(tstate, exception, string);
}

void
_PyErr_SetString(PyThreadState *tstate, PyObject *exception,
                 const char *string)
{
    PyObject *value = PyUnicode_FromString(string);
    _PyErr_SetObject(tstate, exception, value);
    Py_XDECREF(value);
}
```

在 `_PyErr_SetObject` 函数内完成所有的异常抛出逻辑。线程状态中 `exc_info` 字段是一个单链表结构，保存着当前正在处理的异常链，每个项存储异常的类型（exc_type）、值（exc_value）和异常栈（exc_traceback）。`_PyErr_GetTopmostException` 函数能够获取异常链最近的非 `None` 值。若异常链上没有异常，调用 `_PyErr_Restore` 函数设置异常。否则，依据异常链设置当前异常的 `__context__` 字段，然后调用 `_PyErr_Restore` 函数设置异常。
```c
// Python/errors.c
_PyErr_StackItem *
_PyErr_GetTopmostException(PyThreadState *tstate)
{
    _PyErr_StackItem *exc_info = tstate->exc_info;
    while ((exc_info->exc_type == NULL || exc_info->exc_type == Py_None) &&
           exc_info->previous_item != NULL)
    {
        exc_info = exc_info->previous_item;
    }
    return exc_info;
}

void
_PyErr_SetObject(PyThreadState *tstate, PyObject *exception, PyObject *value)
{
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
        /* 如果 value 不是一个异常实例，创建为 exception 实例 */
        if (value == NULL || !PyExceptionInstance_Check(value)) {
            /* We must normalize the value right now */
            PyObject *fixed_value;

            /* Issue #23571: functions must not be called with an
               exception set */
            _PyErr_Clear(tstate);

            fixed_value = _PyErr_CreateException(exception, value);
            Py_XDECREF(value);
            if (fixed_value == NULL) {
                Py_DECREF(exc_value);
                return;
            }

            value = fixed_value;
        }

        /* 将当前异常的 __context__ 设置为异常链的最近一个异常 */
        /* Avoid reference cycles through the context chain.
           This is O(chain length) but context chains are
           usually very short. Sensitive readers may try
           to inline the call to PyException_GetContext. */
        if (exc_value != value) {
            PyObject *o = exc_value, *context;
            while ((context = PyException_GetContext(o))) {
                Py_DECREF(context);
                if (context == value) {
                    PyException_SetContext(o, NULL);
                    break;
                }
                o = context;
            }
            PyException_SetContext(value, exc_value);
        }
        else {
            Py_DECREF(exc_value);
        }
    }
    /* 获得当前异常的调用堆栈信息对象 */
    if (value != NULL && PyExceptionInstance_Check(value))
        tb = PyException_GetTraceback(value);
    Py_XINCREF(exception);
    _PyErr_Restore(tstate, exception, value, tb);
}
```

`_PyErr_Restore` 函数将当前抛出的异常类型、异常值（可能是异常消息字符串或是异常实例）和异常栈分别设置到当前线程状态的 `curexc_type`、`curexc_value` 和 `curexc_traceback` 完成异常的抛出。
```c
void
_PyErr_Restore(PyThreadState *tstate, PyObject *type, PyObject *value,
               PyObject *traceback)
{
    PyObject *oldtype, *oldvalue, *oldtraceback;

    if (traceback != NULL && !PyTraceBack_Check(traceback)) {
        /* XXX Should never happen -- fatal error instead? */
        /* Well, it could be None. */
        Py_DECREF(traceback);
        traceback = NULL;
    }

    /* Save these in locals to safeguard against recursive
       invocation through Py_XDECREF */
    oldtype = tstate->curexc_type;
    oldvalue = tstate->curexc_value;
    oldtraceback = tstate->curexc_traceback;

    tstate->curexc_type = type;
    tstate->curexc_value = value;
    tstate->curexc_traceback = traceback;

    Py_XDECREF(oldtype);
    Py_XDECREF(oldvalue);
    Py_XDECREF(oldtraceback);
}
```

总结来说，CPython 内异常的抛出主要是调用 `PyErr_Set*()` 接口将异常的信息设置到当前线程状态的相应 `curexc_*` 字段上。

### 用户手动引发异常机制
`raise` 语法通过 `RAISE_VARARGS` 字节码引发异常。
```python
>>> dis.dis('raise RuntimeError("ohho, F**k")')
  1           0 LOAD_NAME                0 (RuntimeError)
              2 LOAD_CONST               0 ('ohho, F**k')
              4 CALL_FUNCTION            1
              6 RAISE_VARARGS            1
              8 LOAD_CONST               1 (None)
             10 RETURN_VALUE
```

类似地，`main_loop` 中也提供了 `RAISE_VARARGS` 的实现，`RAISE_VARARGS` 的参数决定 `raise` 的不同语法格式调用，`2` 表示 `raise A from B`，`1` 为 `raise A`，`0` 为 `raise`。处理了参数的接受后，调用 `do_raise` 函数实现异常抛出。并且在函数调用结束后，类似通过 `goto error` 跳转到异常处理部分。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(RAISE_VARARGS): {
                PyObject *cause = NULL, *exc = NULL;
                switch (oparg) {
                case 2:
                    cause = POP(); /* cause */
                    /* fall through */
                case 1:
                    exc = POP(); /* exc */
                    /* fall through */
                case 0:
                    if (do_raise(tstate, exc, cause)) {
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

`do_raise` 函数内完成用户手动异常抛出的全部逻辑。当参数 `exc` 为 `NULL` 表明在 `except` 中使用无参方式抛出异常，这种情形下会从异常链获取到最近的异常，然后调用 `_PyErr_Restore` 设置到线程状态的当前异常字段，即重抛出。若 `exc` 是一个异常类型，创建对应的无参异常实例。若带有 `cause` 参数，那么将其设置到当前异常的 `__cause__` 字段。最后调用 `_PyErr_SetObject` 函数抛出异常。
```c
/* Logic for the raise statement (too complicated for inlining).
   This *consumes* a reference count to each of its arguments. */
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
            _PyErr_SetString(tstate, PyExc_RuntimeError,
                             "No active exception to reraise");
            return 0;
        }
        Py_XINCREF(type);
        Py_XINCREF(value);
        Py_XINCREF(tb);
        _PyErr_Restore(tstate, type, value, tb);
        return 1;
    }

    /* We support the following forms of raise:
       raise
       raise <instance>
       raise <type> */

    if (PyExceptionClass_Check(exc)) {
        type = exc;
        value = _PyObject_CallNoArg(exc);
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
    else if (PyExceptionInstance_Check(exc)) {
        value = exc;
        type = PyExceptionInstance_Class(exc);
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
            fixed_cause = _PyObject_CallNoArg(cause);
            if (fixed_cause == NULL)
                goto raise_error;
            Py_DECREF(cause);
        }
        else if (PyExceptionInstance_Check(cause)) {
            fixed_cause = cause;
        }
        else if (cause == Py_None) {
            Py_DECREF(cause);
            fixed_cause = NULL;
        }
        else {
            _PyErr_SetString(tstate, PyExc_TypeError,
                             "exception causes must derive from "
                             "BaseException");
            goto raise_error;
        }
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
```

总结来说，用户手动通过 `raise` 语法抛出异常的实现和 CPython 内部抛出异常机制类似。

## 异常是如何被捕获和处理？
从上一小结了解到异常抛出时除设置相关异常信息到当前的线程状态，还会通过 `goto error` 跳转到异常处理部分。从 `try-except-finally` 的字节码出发了解异常机制的处理逻辑。

`divide` 函数内提供了 `try-except-finally` 异常处理逻辑。正常情况下，先执行 `try`，然后 `finally` 和剩余代码。`ZeroDivisionError` 情形下，执行顺序依次为 `try`、`except`、`finally` 和剩余代码，并且不会执行 `try` 出现异常后的代码。`Exception` 情形类似 `ZeroDivisionError` 情形，不过新抛出异常由于没有相应的异常处理器会中断程序继续执行并输出。 
```python
def divide(a, b):
    try:
        print('try start')
        c = a / b
        print('try end')
    except ZeroDivisionError as e:
        print('except', e)
        c = None
    except Exception as e:
        raise RuntimeError('damn') from e
    finally:
        print('finally')
    print('remain')
    return c

>>> divide(1, 2)
try start
try end
finally
remain
0.5
>>> divide(1, 0)
try start
except division by zero
finally
remain
>>> divide('1', 0)
try start
finally
Traceback (most recent call last):
  File "<stdin>", line 4, in divide
TypeError: unsupported operand type(s) for /: 'str' and 'int'

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "<stdin>", line 10, in divide
RuntimeError: damn
```

### divide(1, 2) 执行流
下面从 `divide` 函数的字节码出发了解程序的执行流程。总体来看，函数开始的 `SETUP_FINALLY` 字节码分别设置指向 `finally` 部分和第一个 `except ZeroDivisionError` 部分。然后进入 `try` 内部的代码执行，如果正常执行到 `JUMP_FORWARD` 字节码，则跳转到 `finally` 部分开始执行，然后执行剩余代码部分。前面章节了解到，`BINARY_TRUE_DIVIDE` 字节码可能会引发异常，使得 `main_loop` 通过 `goto error` 跳转到异常处理部分，而不是正常执行后续的字节码序列。
```python
>>> dis.dis(divide)
  2           0 SETUP_FINALLY          124 (to 126)
              2 SETUP_FINALLY           28 (to 32)

  3           4 LOAD_GLOBAL              0 (print)
              6 LOAD_CONST               2 ('try start')
              8 CALL_FUNCTION            1
             10 POP_TOP

  4          12 LOAD_FAST                0 (a)
             14 LOAD_FAST                1 (b)
             16 BINARY_TRUE_DIVIDE
             18 STORE_FAST               2 (c)

  5          20 LOAD_GLOBAL              0 (print)
             22 LOAD_CONST               3 ('try end')
             24 CALL_FUNCTION            1
             26 POP_TOP
             28 POP_BLOCK
             30 JUMP_FORWARD            90 (to 122)

  6     >>   32 DUP_TOP
             34 LOAD_GLOBAL              1 (ZeroDivisionError)
             36 COMPARE_OP              10 (exception match)
             38 POP_JUMP_IF_FALSE       78
             40 POP_TOP
             42 STORE_FAST               3 (e)
             44 POP_TOP
             46 SETUP_FINALLY           18 (to 66)

  7          48 LOAD_GLOBAL              0 (print)
             50 LOAD_CONST               4 ('except')
             52 LOAD_FAST                3 (e)
             54 CALL_FUNCTION            2
             56 POP_TOP

  8          58 LOAD_CONST               0 (None)
             60 STORE_FAST               2 (c)
             62 POP_BLOCK
             64 BEGIN_FINALLY
        >>   66 LOAD_CONST               0 (None)
             68 STORE_FAST               3 (e)
             70 DELETE_FAST              3 (e)
             72 END_FINALLY
             74 POP_EXCEPT
             76 JUMP_FORWARD            44 (to 122)

  9     >>   78 DUP_TOP
             80 LOAD_GLOBAL              2 (Exception)
             82 COMPARE_OP              10 (exception match)
             84 POP_JUMP_IF_FALSE      120
             86 POP_TOP
             88 STORE_FAST               3 (e)
             90 POP_TOP
             92 SETUP_FINALLY           14 (to 108)

 10          94 LOAD_GLOBAL              3 (RuntimeError)
             96 LOAD_CONST               5 ('damn')
             98 CALL_FUNCTION            1
            100 LOAD_FAST                3 (e)
            102 RAISE_VARARGS            2
            104 POP_BLOCK
            106 BEGIN_FINALLY
        >>  108 LOAD_CONST               0 (None)
            110 STORE_FAST               3 (e)
            112 DELETE_FAST              3 (e)
            114 END_FINALLY
            116 POP_EXCEPT
            118 JUMP_FORWARD             2 (to 122)
        >>  120 END_FINALLY
        >>  122 POP_BLOCK
            124 BEGIN_FINALLY

 12     >>  126 LOAD_GLOBAL              0 (print)
            128 LOAD_CONST               1 ('finally')
            130 CALL_FUNCTION            1
            132 POP_TOP
            134 END_FINALLY

 13         136 LOAD_GLOBAL              0 (print)
            138 LOAD_CONST               6 ('remain')
            140 CALL_FUNCTION            1
            142 POP_TOP

 14         144 LOAD_FAST                2 (c)
            146 RETURN_VALUE
```

### 相关字节码的功能和实现
下面首先了解上面关键字节码的功能和实现。`SETUP_FINALLY` 的功能是为后面的代码块设置一个异常处理器。当发生异常时，恢复值栈的级别恢复到该指令的执行时的状态（即清空代码块的执行上下文），并将控制权移交给位于参数指向的异常处理器。因此，实现中 `PyFrame_BlockSetup` 函数将处理器类型、异常处理器入口地址和栈级别作为参数压入当前 frame 的 `PyTryBlock` 栈中。当出现异常时，会恢复上下文和执行相应异常处理器代码。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(SETUP_FINALLY): {
                /* NOTE: If you add any new block-setup opcodes that
                are not try/except/finally handlers, you may need
                to update the PyGen_NeedsFinalizing() function.
                */
                PyFrame_BlockSetup(f, SETUP_FINALLY, INSTR_OFFSET() + oparg,
                                STACK_LEVEL());
                DISPATCH();
            }
        }
    }
}

// Objects/frameobject.c
void
PyFrame_BlockSetup(PyFrameObject *f, int type, int handler, int level)
{
    PyTryBlock *b;
    if (f->f_iblock >= CO_MAXBLOCKS)
        Py_FatalError("XXX block stack overflow");
    b = &f->f_blockstack[f->f_iblock++];
    b->b_type = type;
    b->b_level = level;
    b->b_handler = handler;
}
```

`POP_BLOCK` 字节码的作用是标记与最近一个 `SETUP_FINALLY`、`SETUP_CLEANUP` 或 `SETUP_WITH` 类型异常处理器相关联的代码块的结束。具体实现为出栈最近一个 `PyTryBlock`。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(POP_BLOCK): {
                PREDICTED(POP_BLOCK);
                PyFrame_BlockPop(f);
                DISPATCH();
            }
        }
    }
}

// Objects/frameobject.c
PyTryBlock *
PyFrame_BlockPop(PyFrameObject *f)
{
    PyTryBlock *b;
    if (f->f_iblock <= 0)
        Py_FatalError("XXX block stack underflow");
    b = &f->f_blockstack[--f->f_iblock];
    return b;
}
```

`BEGIN_FINALLY` 字节码会将 `NULL` 推入值栈以便在后续操作中使用 `END_FINALLY`、`POP_FINALLY`、`WITH_CLEANUP_START` 和 `WITH_CLEANUP_FINISH`。表明开始 `finally` 块。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(BEGIN_FINALLY): {
                /* Push NULL onto the stack for using it in END_FINALLY,
                POP_FINALLY, WITH_CLEANUP_START and WITH_CLEANUP_FINISH.
                */
                PUSH(NULL);
                FAST_DISPATCH();
            }
        }
    }
}
```

`END_FINALLY` 的功能是终止 `finally` 子句。会依据栈顶的值（TOS）决定解释器的执行方式。如果 TOS 是 `NULL`（即由 `BEGIN_FINALLY` 设置）继续下一条指令。如果 TOS 是一个整数（由 `CALL_FINALLY` 设置），则将字节码计数器设置为 TOS。如果 TOS 是异常类型（在引发异常时被设置），则从堆栈中弹出 6 个值，前三个弹出值用于重新引发异常，最后三个弹出值用于恢复异常状态。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(END_FINALLY): {
                PREDICTED(END_FINALLY);
                /* At the top of the stack are 1 or 6 values:
                Either:
                    - TOP = NULL or an integer
                or:
                    - (TOP, SECOND, THIRD) = exc_info()
                    - (FOURTH, FITH, SIXTH) = previous exception for EXCEPT_HANDLER
                */
                PyObject *exc = POP();
                if (exc == NULL) {
                    FAST_DISPATCH();
                }
                else if (PyLong_CheckExact(exc)) {
                    int ret = _PyLong_AsInt(exc);
                    Py_DECREF(exc);
                    if (ret == -1 && _PyErr_Occurred(tstate)) {
                        goto error;
                    }
                    JUMPTO(ret);
                    FAST_DISPATCH();
                }
                else {
                    assert(PyExceptionClass_Check(exc));
                    PyObject *val = POP();
                    PyObject *tb = POP();
                    _PyErr_Restore(tstate, exc, val, tb);
                    goto exception_unwind;
                }
            }
        }
    }
}
```

`POP_EXCEPT` 字节码实现从块堆栈中弹出栈顶 `PyTryBlock`。弹出的块必须是 `EXCEPT_HANDLER` 类型的 `PyTryBlock`。其在进入 `except` 处理程序时隐式创建。另外，除了从帧堆栈弹出无关值之外，最后三个弹出值还用于恢复异常状态，设置在异常链上。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(POP_EXCEPT): {
                PyObject *type, *value, *traceback;
                _PyErr_StackItem *exc_info;
                PyTryBlock *b = PyFrame_BlockPop(f);
                if (b->b_type != EXCEPT_HANDLER) {
                    _PyErr_SetString(tstate, PyExc_SystemError,
                                    "popped block is not an except handler");
                    goto error;
                }
                assert(STACK_LEVEL() >= (b)->b_level + 3 &&
                    STACK_LEVEL() <= (b)->b_level + 4);
                exc_info = tstate->exc_info;
                type = exc_info->exc_type;
                value = exc_info->exc_value;
                traceback = exc_info->exc_traceback;
                exc_info->exc_type = POP();
                exc_info->exc_value = POP();
                exc_info->exc_traceback = POP();
                Py_XDECREF(type);
                Py_XDECREF(value);
                Py_XDECREF(traceback);
                DISPATCH();
            }
        }
    }
}
```

### error 异常处理逻辑
了解了相关的字节码功能和实现后，从 `goto error` 部分了解异常处理的核心逻辑。处于 `try` 代码块内的 `BINARY_TRUE_DIVIDE` 字节码抛出异常后，将会跳转到执行 `error` 部分的代码。总体来说，会从当前 `frame` 的块堆栈 `f_iblock` 中弹出最近的一个异常处理器，一般情况下是 `SETUP_FINALLY` 类型的。然后清空 `try` 代码块执行的栈上下文。然后隐式入块栈一个 `EXCEPT_HANDLER` 类型的异常处理器表明进入 `except` 块。然后将异常链上当前指向的指针入值栈。然后通过 `_PyErr_Fetch` 获取当前抛出的异常，并设置到异常链和压入值栈中。最后跳转到异常处理器指向的代码块。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(BINARY_TRUE_DIVIDE): {
                ....
                goto error;
                ....
            }
        }

error:
        /* Double-check exception status. */
#ifdef NDEBUG
        if (!_PyErr_Occurred(tstate)) {
            _PyErr_SetString(tstate, PyExc_SystemError,
                             "error return without exception set");
        }
#else
        assert(_PyErr_Occurred(tstate));
#endif

        /* Log traceback info. */
        PyTraceBack_Here(f);

        if (tstate->c_tracefunc != NULL)
            call_exc_trace(tstate->c_tracefunc, tstate->c_traceobj,
                           tstate, f);

exception_unwind:
        /* Unwind stacks if an exception occurred */
        while (f->f_iblock > 0) {
            /* Pop the current block. */
            PyTryBlock *b = &f->f_blockstack[--f->f_iblock];

            if (b->b_type == EXCEPT_HANDLER) {
                UNWIND_EXCEPT_HANDLER(b);
                continue;
            }
            /* 恢复栈状态为 try 开始时 */
            UNWIND_BLOCK(b);
            if (b->b_type == SETUP_FINALLY) {
                PyObject *exc, *val, *tb;
                int handler = b->b_handler;
                /* 异常链 */
                _PyErr_StackItem *exc_info = tstate->exc_info;
                /* Beware, this invalidates all b->b_* fields */
                /* 当进入 except 时隐式设置一个 EXCEPT_HANDLER 类型的异常处理器 */
                PyFrame_BlockSetup(f, EXCEPT_HANDLER, -1, STACK_LEVEL());
                /* 将上一个异常的 traceback、value 和 type 压入栈中 */
                PUSH(exc_info->exc_traceback);
                PUSH(exc_info->exc_value);
                if (exc_info->exc_type != NULL) {
                    PUSH(exc_info->exc_type);
                }
                else {
                    Py_INCREF(Py_None);
                    PUSH(Py_None);
                }
                /* 获取并重置当前线程状态的异常标志位 curexc_* */
                _PyErr_Fetch(tstate, &exc, &val, &tb);
                /* Make the raw exception data
                   available to the handler,
                   so a program can emulate the
                   Python main loop. */
                /* 检查并包装当前的 exc_value 为异常对象 */
                _PyErr_NormalizeException(tstate, &exc, &val, &tb);
                if (tb != NULL)
                    PyException_SetTraceback(val, tb);
                else
                    PyException_SetTraceback(val, Py_None);
                Py_INCREF(exc);
                /* 将当前的 traceback、value 和 type 设为线程状态的异常信息 */
                exc_info->exc_type = exc;
                Py_INCREF(val);
                exc_info->exc_value = val;
                exc_info->exc_traceback = tb;
                if (tb == NULL)
                    tb = Py_None;
                Py_INCREF(tb);
                /* 压入栈中 */
                PUSH(tb);
                PUSH(val);
                PUSH(exc);
                JUMPTO(handler);
                /* Resume normal execution */
                goto main_loop;
            }
        } /* unwind stack */

        /* End the loop as we still have an error */
        break;
    } /* main loop */
}
```

### divide(1, 0) 执行流
对于 `divide(1, 0)` 的情形。执行到 `BINARY_TRUE_DIVIDE` 字节码出现异常，进入 `error`，然后跳转到 `32` 行开始执行。当前的值栈为 `[crt_exc, crt_val, crt_tb, pre_exc, pre_val, pre_tb, ...]`，以及块栈为 `[EXCEPT_HANDLER, SETUP_FINALLY(126)]`。接着，`DUP_TOP` 重新将 `crt_exc` 入栈，用于后面的 `except` 比较操作。然后通过 `COMPARE_OP` 字节码比较异常类型，比较结果为 `True` 则 `POP_JUMP_IF_FALSE` 不跳转。然后弹出 `crt_exc` 和 `crt_tb` 并将 `crt_val` 存到局部变量 `e`。设置一个新的 `SETUP_FINALLY(66)` 用于 `except` 结束后重置局部变量 `e`。然后正常执行 except 块的内容。执行结束后 `POP_BLOCK` 弹出 `SETUP_FINALLY(66)` 块，因为这里没有出现异常，顺序执行就能执行清理程序。`BEGIN_FINALLY` 压 `NULL` 入值栈表明开始进入 `finally` 块，这里的 `finally` 为清理程序的。`END_FINALLY` 弹出 `NULL` 表明 `finally` 块结束。然后 `POP_EXCEPT` 弹出 `EXCEPT_HANDLER` 块，表明 `except` 块执行结束。然后跳转到 `122` 行执行。类似，由于 except 没有出现新异常，`POP_BLOCK` 弹出 `SETUP_FINALLY(126)` 进入 `finally` 块的执行。最后，正常执行剩余的字节码。
```python
>>> dis.dis(divide)
  2           0 SETUP_FINALLY          124 (to 126)
              2 SETUP_FINALLY           28 (to 32)

  3           4 LOAD_GLOBAL              0 (print)
              6 LOAD_CONST               2 ('try start')
              8 CALL_FUNCTION            1
             10 POP_TOP

  4          12 LOAD_FAST                0 (a)
             14 LOAD_FAST                1 (b)
             16 BINARY_TRUE_DIVIDE

  6     >>   32 DUP_TOP
             34 LOAD_GLOBAL              1 (ZeroDivisionError)
             36 COMPARE_OP              10 (exception match)
             38 POP_JUMP_IF_FALSE       78
             40 POP_TOP
             42 STORE_FAST               3 (e)
             44 POP_TOP
             46 SETUP_FINALLY           18 (to 66)

  7          48 LOAD_GLOBAL              0 (print)
             50 LOAD_CONST               4 ('except')
             52 LOAD_FAST                3 (e)
             54 CALL_FUNCTION            2
             56 POP_TOP

  8          58 LOAD_CONST               0 (None)
             60 STORE_FAST               2 (c)
             62 POP_BLOCK
             64 BEGIN_FINALLY
        >>   66 LOAD_CONST               0 (None)
             68 STORE_FAST               3 (e)
             70 DELETE_FAST              3 (e)
             72 END_FINALLY
             74 POP_EXCEPT
             76 JUMP_FORWARD            44 (to 122)

        >>  122 POP_BLOCK
            124 BEGIN_FINALLY

 12     >>  126 LOAD_GLOBAL              0 (print)
            128 LOAD_CONST               1 ('finally')
            130 CALL_FUNCTION            1
            132 POP_TOP
            134 END_FINALLY

 13         136 LOAD_GLOBAL              0 (print)
            138 LOAD_CONST               6 ('remain')
            140 CALL_FUNCTION            1
            142 POP_TOP

 14         144 LOAD_FAST                2 (c)
            146 RETURN_VALUE
```

### divide('1', 0) 执行流
对于 `divide('1', 0)` 的情形。同样执行到 `BINARY_TRUE_DIVIDE` 字节码出现异常，进入 `error`，然后跳转到 `32` 行开始执行。当前的值栈为 `[crt_exc, crt_val, crt_tb, pre_exc, pre_val, pre_tb, ...]`，以及块栈为 `[EXCEPT_HANDLER, SETUP_FINALLY(126)]`。不同的地方在于 `COMPARE_OP` 执行的结果为 `False`，`POP_JUMP_IF_FALSE` 跳转到 `78` 行执行。接着是类似的异常匹配、局部变量设置和局部变量清理程序设置，然后执行 `except` 块代码。在 `except` 内 `RAISE_VARARGS` 抛出了新的异常，进入 `error`。当前的值栈为 `[new_exc, new_val, new_tb, crt_exc, crt_val, crt_tb, pre_exc, pre_val, pre_tb, ...]` 和 以及块栈为 `[SETUP_FINALLY(108), EXCEPT_HANDLER, SETUP_FINALLY(126)]`。最近的一个异常处理器为局部变量清理程序 `SETUP_FINALLY(108)`，则跳转到 `108` 行开始执行。执行到 `END_FINALLY`，TOS 为 `6` 个异常对象的情形，重新抛出当前异常。然后跳转到 `exception_unwind` 部分执行，即先弹出 `EXCEPT_HANDLER`，然后执行 `SETUP_FINALLY(126)`，执行到 `END_FINALLY`，TOS 也为 `6` 个异常对象的情形，继续抛出异常，跳转到 `exception_unwind` 部分执行，当前块栈为空，跳出 `main_loop` 循环。
```c
>>> dis.dis(divide)
  2           0 SETUP_FINALLY          124 (to 126)
              2 SETUP_FINALLY           28 (to 32)

  3           4 LOAD_GLOBAL              0 (print)
              6 LOAD_CONST               2 ('try start')
              8 CALL_FUNCTION            1
             10 POP_TOP

  4          12 LOAD_FAST                0 (a)
             14 LOAD_FAST                1 (b)
             16 BINARY_TRUE_DIVIDE
             18 STORE_FAST               2 (c)

  5          20 LOAD_GLOBAL              0 (print)
             22 LOAD_CONST               3 ('try end')
             24 CALL_FUNCTION            1
             26 POP_TOP
             28 POP_BLOCK
             30 JUMP_FORWARD            90 (to 122)

  6     >>   32 DUP_TOP
             34 LOAD_GLOBAL              1 (ZeroDivisionError)
             36 COMPARE_OP              10 (exception match)
             38 POP_JUMP_IF_FALSE       78

  9     >>   78 DUP_TOP
             80 LOAD_GLOBAL              2 (Exception)
             82 COMPARE_OP              10 (exception match)
             84 POP_JUMP_IF_FALSE      120
             86 POP_TOP
             88 STORE_FAST               3 (e)
             90 POP_TOP
             92 SETUP_FINALLY           14 (to 108)

 10          94 LOAD_GLOBAL              3 (RuntimeError)
             96 LOAD_CONST               5 ('damn')
             98 CALL_FUNCTION            1
            100 LOAD_FAST                3 (e)
            102 RAISE_VARARGS            2
            104 POP_BLOCK
            106 BEGIN_FINALLY
        >>  108 LOAD_CONST               0 (None)
            110 STORE_FAST               3 (e)
            112 DELETE_FAST              3 (e)
            114 END_FINALLY
            116 POP_EXCEPT
            118 JUMP_FORWARD             2 (to 122)
        >>  120 END_FINALLY
        >>  122 POP_BLOCK
            124 BEGIN_FINALLY

 12     >>  126 LOAD_GLOBAL              0 (print)
            128 LOAD_CONST               1 ('finally')
            130 CALL_FUNCTION            1
            132 POP_TOP
            134 END_FINALLY

 13         136 LOAD_GLOBAL              0 (print)
            138 LOAD_CONST               6 ('remain')
            140 CALL_FUNCTION            1
            142 POP_TOP

 14         144 LOAD_FAST                2 (c)
            146 RETURN_VALUE
```

在退出 frame 的执行时，`_Py_CheckFunctionResult` 函数检查当前 frame 是否存在异常，若存在这输出到控制台。
```c
// Python/ceval.c
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) { ... }

    assert(retval == NULL);
    assert(_PyErr_Occurred(tstate));

exit_returning:

    /* Pop remaining stack entries. */
    while (!EMPTY()) {
        PyObject *o = POP();
        Py_XDECREF(o);
    }

exit_yielding:
    if (tstate->use_tracing) {
        if (tstate->c_tracefunc) {
            if (call_trace_protected(tstate->c_tracefunc, tstate->c_traceobj,
                                     tstate, f, PyTrace_RETURN, retval)) {
                Py_CLEAR(retval);
            }
        }
        if (tstate->c_profilefunc) {
            if (call_trace_protected(tstate->c_profilefunc, tstate->c_profileobj,
                                     tstate, f, PyTrace_RETURN, retval)) {
                Py_CLEAR(retval);
            }
        }
    }

    /* pop frame */
exit_eval_frame:
    if (PyDTrace_FUNCTION_RETURN_ENABLED())
        dtrace_function_return(f);
    Py_LeaveRecursiveCall();
    f->f_executing = 0;
    tstate->frame = f->f_back;

    return _Py_CheckFunctionResult(NULL, retval, "PyEval_EvalFrameEx");
}

// Objects/call.c
PyObject*
_Py_CheckFunctionResult(PyObject *callable, PyObject *result, const char *where)
{
    int err_occurred = (PyErr_Occurred() != NULL);

    assert((callable != NULL) ^ (where != NULL));

    if (result == NULL) {
        if (!err_occurred) {
            if (callable)
                PyErr_Format(PyExc_SystemError,
                             "%R returned NULL without setting an error",
                             callable);
            else
                PyErr_Format(PyExc_SystemError,
                             "%s returned NULL without setting an error",
                             where);
#ifdef Py_DEBUG
            /* Ensure that the bug is caught in debug mode */
            Py_FatalError("a function returned NULL without setting an error");
#endif
            return NULL;
        }
    }
    else {
        if (err_occurred) {
            Py_DECREF(result);

            if (callable) {
                _PyErr_FormatFromCause(PyExc_SystemError,
                        "%R returned a result with an error set",
                        callable);
            }
            else {
                _PyErr_FormatFromCause(PyExc_SystemError,
                        "%s returned a result with an error set",
                        where);
            }
#ifdef Py_DEBUG
            /* Ensure that the bug is caught in debug mode */
            Py_FatalError("a function returned a result with an error set");
#endif
            return NULL;
        }
    }
    return result;
}
```

总结来说，`PyTryBlock` 栈存储进入各种类型处理器的入口，当程序抛出异常后会跳转到 `error` 部分执行相应的异常处理器，若找不到相应的处理器则退出 frame 的执行并输出异常信息。

## 内置异常是如何实现的？
Python 为用户提供了大量的内置异常类型，其[层次结构](https://docs.python.org/zh-cn/3.8/library/exceptions.html#exception-hierarchy)如下（这里删除了 `Warning` 相关的内容）：
```python
BaseException
 ├── GeneratorExit
 ├── KeyboardInterrupt
 ├── SystemExit
 └── Exception
      ├── ArithmeticError
      │    ├── FloatingPointError
      │    ├── OverflowError
      │    └── ZeroDivisionError
      ├── AssertionError
      ├── AttributeError
      ├── BufferError
      ├── EOFError
      ├── ImportError
      │    └── ModuleNotFoundError
      ├── LookupError
      │    ├── IndexError
      │    └── KeyError
      ├── MemoryError
      ├── NameError
      │    └── UnboundLocalError
      ├── OSError
      │    ├── BlockingIOError
      │    ├── ChildProcessError
      │    ├── ConnectionError
      │    │    ├── BrokenPipeError
      │    │    ├── ConnectionAbortedError
      │    │    ├── ConnectionRefusedError
      │    │    └── ConnectionResetError
      │    ├── FileExistsError
      │    ├── FileNotFoundError
      │    ├── InterruptedError
      │    ├── IsADirectoryError
      │    ├── NotADirectoryError
      │    ├── PermissionError
      │    ├── ProcessLookupError
      │    └── TimeoutError
      ├── ReferenceError
      ├── RuntimeError
      │    ├── NotImplementedError
      │    └── RecursionError
      ├── StopAsyncIteration
      ├── StopIteration
      ├── SyntaxError
      │    └── IndentationError
      │         └── TabError
      ├── SystemError
      ├── TypeError
      └── ValueError
           └── UnicodeError
                ├── UnicodeDecodeError
                ├── UnicodeEncodeError
                └── UnicodeTranslateError
```

这些异常是在 CPython 层级进行实现的。其中，`BaseException` 是所有异常的父类，实现如下：
```c
static PyTypeObject _PyExc_BaseException = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "BaseException", /*tp_name*/
    ....    
};

PyObject *PyExc_BaseException = (PyObject *)&_PyExc_BaseException;
```

其子类型的异常通过宏的方式创建，如下说明了 `Exception` 和 `TypeError` 类对象的创建。
```c
#define SimpleExtendsException(EXCBASE, EXCNAME, EXCDOC) \
static PyTypeObject _PyExc_ ## EXCNAME = { \
    PyVarObject_HEAD_INIT(NULL, 0) \
    # EXCNAME, \
    sizeof(PyBaseExceptionObject), \
    0, (destructor)BaseException_dealloc, 0, 0, 0, 0, 0, 0, 0, \
    0, 0, 0, 0, 0, 0, 0, \
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC, \
    PyDoc_STR(EXCDOC), (traverseproc)BaseException_traverse, \
    (inquiry)BaseException_clear, 0, 0, 0, 0, 0, 0, 0, &_ ## EXCBASE, \
    0, 0, 0, offsetof(PyBaseExceptionObject, dict), \
    (initproc)BaseException_init, 0, BaseException_new,\
}; \
PyObject *PyExc_ ## EXCNAME = (PyObject *)&_PyExc_ ## EXCNAME

SimpleExtendsException(PyExc_BaseException, Exception,
                       "Common base class for all non-exit exceptions.");

SimpleExtendsException(PyExc_Exception, TypeError,
                       "Inappropriate argument type.");
```
