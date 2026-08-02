### 实现生成器

生成器函数是指函数体中包含 `yield` 语句的函数，与普通函数调用不同，生成器函数在调用时不会立即执行，而是可暂停的执行。参考如下例子，生成器函数 gen() 在调用时，返回一个生成器对象。通过 next() 可驱动生成器对象执行，当执行到 `yield` 后会暂停函数体的执行，并如同普通函数执行结束时那样返回一个值。在下一次 next() 时会接着上次的 `yield` 后继续执行，若后续没有 `yield` 则在执行结束后抛出 StopIteration(rtnval)，即将返回值 *rtnval* 一并带出。

```python
>>> def gen():
...     print("#1 gen")
...     yield 10
...     print("#2 gen")
...     return 20
... 
>>> g = gen()
>>> g
<generator object gen at 0x1051760b0>
>>> bool(gen.__code__.co_flags | inspect.CO_GENERATOR)
True
>>> for x in dir(g):
...     if x.startswith("gi_"):
...             print(f"{x}: {getattr(g, x)}")
... 
gi_code: <code object gen at 0x1051980e0, file "<stdin>", line 1>
gi_frame: <frame at 0x105199040, file '<stdin>', line 1, code gen>
gi_running: False
gi_yieldfrom: None
>>> next(g)
#1 gen
10
>>> next(g)
#2 gen
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
StopIteration: 20
>>> g.gi_frame is None
True
```

`yield` 的完整语法如下所示。如需委派子生成器<sup>@@PEP-380@@</sup>，可采用 `yield from` 语法，其等价于逐个 `yield` 子生成器的值。

```peg
yield_stmt: yield_expr

yield_expr: 'yield' [yield_arg]
yield_arg: ('from' test) | testlist_star_expr
```

更多的生成器例子可参考如下。

```python
>>> def gen(val=None):
...     while True:
...         val = yield val
...         if str(val).lower() is "break":
...             return "bye"
... 
>>> g = gen()
>>> g.send("hello")  # 第一个 send 值必须是 None
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: can't send non-None value to a just-started generator
>>> next(g) is None  # 等价于 g.send(None)
True
>>> g.send(10)
10
>>> g.send("break")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
StopIteration: bye

>>> def gen():
...     try:
...         raise ValueError("a")
...     except:
...         yield "b"
...         raise  # 异常保存在生成器对象中
... 
>>> g = gen()
>>> next(g)
'b'
>>> try:
...     raise ValueError("c")
... except:
...     next(g)
... 
Traceback (most recent call last):
  File "<stdin>", line 4, in <module>
  File "<stdin>", line 3, in gen
ValueError: a

>>> def subgen():
...     try:
...         yield 10
...         yield 20
...         yield 30
...     except:
...         raise
... 
>>> def gen():
...     yield from subgen()
... 
>>> g = gen()
>>> next(g)
10
>>> g.throw(RuntimeError)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "<stdin>", line 2, in gen
  File "<stdin>", line 3, in subgen
RuntimeError
>>> next(g)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
StopIteration
```

下面分析生成器对象的实现机制。对于生成器函数，其创建与普通函数无异，那么执行暂停的机制即由 @@YIELD_VALUE@@ 实现。另外，若 `yield` 具有返回值，则在 @@YIELD_VALUE@@ 之后从栈顶设置。当第一次执行生成器对象时，由于没有从 `yield` 后恢复执行，无法接受有效 send() 值，故规定只能为 *None* 值。

```python
>>> dis("""
... def gen():
...     yield 10
... """)
  2           0 LOAD_CONST               0 (<code object gen at 0x105196ea0, line 2>)
              2 LOAD_CONST               1 ('gen')
              4 MAKE_FUNCTION            0
              6 STORE_NAME               0 (gen)
              8 LOAD_CONST               2 (None)
             10 RETURN_VALUE

Disassembly of <code object gen at 0x105196ea0, line 2>:
  3           0 LOAD_CONST               1 (10)
              2 YIELD_VALUE
              4 POP_TOP
              6 LOAD_CONST               0 (None)
              8 RETURN_VALUE

>>> dis("""
... def gen():
...     rtn = yield 10
... """)
  2           0 LOAD_CONST               0 (<code object gen at 0x1058c45b0, line 2>)
              2 LOAD_CONST               1 ('gen')
              4 MAKE_FUNCTION            0
              6 STORE_NAME               0 (gen)
              8 LOAD_CONST               2 (None)
             10 RETURN_VALUE

Disassembly of <code object gen at 0x1058c45b0, line 2>:
  3           0 LOAD_CONST               1 (10)
              2 YIELD_VALUE
              4 STORE_FAST               0 (rtn)
              6 LOAD_CONST               0 (None)
              8 RETURN_VALUE
```

生成器函数在执行时，会将待执行的 @@frameobject@@ 封装为 @@PyGenObject@@ 生成器对象返回，其类型为 @@PyGen_Type@@。生成器实现了如 send()、throw() 和 close() 等方法控制生成器对象的执行行为。另外，next() 方法的实现由 send(None) 实现。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(PyObject *_co, ...) {
    ...

    /* Handle generator/coroutine/asynchronous generator */
    if (co->co_flags & (CO_GENERATOR | CO_COROUTINE | CO_ASYNC_GENERATOR)) {
        PyObject *gen;
        int is_coro = co->co_flags & CO_COROUTINE;

        /* Don't need to keep the reference to f_back, it will be set
         * when the generator is resumed. */
        Py_CLEAR(f->f_back);

        /* Create a new generator that owns the ready to run frame
         * and return that as the value. */
        if (is_coro) {
            gen = PyCoro_New(f, name, qualname);
        } else if (co->co_flags & CO_ASYNC_GENERATOR) {
            gen = PyAsyncGen_New(f, name, qualname);
        } else {
            gen = PyGen_NewWithQualName(f, name, qualname);
        }
        if (gen == NULL) {
            return NULL;
        }

        _PyObject_GC_TRACK(f);

        return gen;
    }

    ...
}

// Objects/genobject.c#PyGen_NewWithQualName
PyObject *
PyGen_NewWithQualName(PyFrameObject *f, PyObject *name, PyObject *qualname)
{
    return gen_new_with_qualname(&PyGen_Type, f, name, qualname);
}

// Objects/genobject.c#gen_new_with_qualname
static PyObject *
gen_new_with_qualname(PyTypeObject *type, PyFrameObject *f,
                      PyObject *name, PyObject *qualname)
{
    PyGenObject *gen = PyObject_GC_New(PyGenObject, type);
    if (gen == NULL) {
        Py_DECREF(f);
        return NULL;
    }
    gen->gi_frame = f;
    f->f_gen = (PyObject *) gen;
    Py_INCREF(f->f_code);
    gen->gi_code = (PyObject *)(f->f_code);
    gen->gi_running = 0;
    gen->gi_weakreflist = NULL;
    gen->gi_exc_state.exc_type = NULL;
    gen->gi_exc_state.exc_value = NULL;
    gen->gi_exc_state.exc_traceback = NULL;
    gen->gi_exc_state.previous_item = NULL;
    if (name != NULL)
        gen->gi_name = name;
    else
        gen->gi_name = ((PyCodeObject *)gen->gi_code)->co_name;
    Py_INCREF(gen->gi_name);
    if (qualname != NULL)
        gen->gi_qualname = qualname;
    else
        gen->gi_qualname = gen->gi_name;
    Py_INCREF(gen->gi_qualname);
    _PyObject_GC_TRACK(gen);
    return (PyObject *)gen;
}

// Include/genobject.c#_PyGenObject_HEAD
/* _PyGenObject_HEAD defines the initial segment of generator
   and coroutine objects. */
#define _PyGenObject_HEAD(prefix)                                           \
    PyObject_HEAD                                                           \
    /* Note: gi_frame can be NULL if the generator is "finished" */         \
    struct _frame *prefix##_frame;                                          \
    /* True if generator is being executed. */                              \
    char prefix##_running;                                                  \
    /* The code object backing the generator */                             \
    PyObject *prefix##_code;                                                \
    /* List of weak reference. */                                           \
    PyObject *prefix##_weakreflist;                                         \
    /* Name of the generator. */                                            \
    PyObject *prefix##_name;                                                \
    /* Qualified name of the generator. */                                  \
    PyObject *prefix##_qualname;                                            \
    _PyErr_StackItem prefix##_exc_state;

// Include/genobject.c#PyGenObject
typedef struct {
    /* The gi_ prefix is intended to remind of generator-iterator. */
    _PyGenObject_HEAD(gi)
} PyGenObject;

// Objects/genobject.c#PyGen_Type
PyTypeObject PyGen_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "generator",                                /* tp_name */
    sizeof(PyGenObject),                        /* tp_basicsize */
    0,                                          /* tp_itemsize */
    ...
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC,    /* tp_flags */
    ...
    PyObject_SelfIter,                          /* tp_iter */
    (iternextfunc)gen_iternext,                 /* tp_iternext */
    gen_methods,                                /* tp_methods */
    ...
};

// Objects/object.c#PyObject_SelfIter
PyObject *
PyObject_SelfIter(PyObject *obj)
{
    Py_INCREF(obj);
    return obj;
}

// Objects/genobject.c#gen_iternext
static PyObject *
gen_iternext(PyGenObject *gen)
{
    return gen_send_ex(gen, NULL, 0, 0);
}

// Objects/genobject.c#gen_methods
static PyMethodDef gen_methods[] = {
    {"send",(PyCFunction)_PyGen_Send, METH_O, send_doc},
    {"throw",(PyCFunction)gen_throw, METH_VARARGS, throw_doc},
    {"close",(PyCFunction)gen_close, METH_NOARGS, close_doc},
    {NULL, NULL}        /* Sentinel */
};
```

send() 是驱动生成器对象执行的关键函数，

* 生成器对象同时只能在一个线程里执行，即由 *gi_running* 记录生成器的状态。

* 生成器对象执行结束后或抛出异常时不能从新再执行，任一事件发生都会将 *gi_frame* 置为 *NULL*。对于生成器对象，若再次执行时会触发 StopIteration 异常。

* 第一次执行生成器对象时会检查 send() 的参数是否为 *None*。因为此时没有 `yield` 接收该值，故规定为 *None*。若不是第一次执行，则会将 send() 的参数置到栈顶，@@YIELD_VALUE@@ 后的 @@STORE_FAST@@ 会从弹出栈顶并设置到接收 `yield` 的变量。

* 进入 @@frameobject@@ 的执行前，需动态将其 *f_back* 指向当前执行的生成器的 @@frameobject@@。必须动态设置是因为生成器对象可能在不同的上下文中被调用，以便于退出时返回。另外，还需将生成器对象的异常上下文 *gi_exc_state* 挂到 @@PyThreadState@@ 的 *exc_info*。因为生成器对象执行时可能触发异常，并且可能在处理异常时 `yield` 退出，若恰巧 *f_back* 也正在处理异常，若不保存异常上下文，返回时就无法知道正在处理的异常。

* 执行 @@frameobject@@ 返回时，可能有如下情况：

    * 若结果不为 *NULL* 且 @@frameobject@@ 正常执行结束，那么抛出 StopIteration 异常，并将返回值结果带在异常中。

    * 若结果为 *NULL* 且生成器内抛出 StopIteration，则转换为 RuntimeError 以区分正常情况下的 StopIteration 异常。对于其它异常则不变，并且在 send() 退出前需提前清理 *gi_exc_state*，然后退出，向上继续传播异常。

```c
// Objects/genobject.c#_PyGen_Send
PyObject *
_PyGen_Send(PyGenObject *gen, PyObject *arg)
{
    return gen_send_ex(gen, arg, 0, 0);
}

// Objects/genobject.c#gen_send_ex
static PyObject *
gen_send_ex(PyGenObject *gen, PyObject *arg, int exc, int closing)
{
    PyThreadState *tstate = _PyThreadState_GET();
    PyFrameObject *f = gen->gi_frame;
    PyObject *result;

    if (gen->gi_running) {
        const char *msg = "generator already executing";
        if (PyCoro_CheckExact(gen)) {
            msg = "coroutine already executing";
        }
        else if (PyAsyncGen_CheckExact(gen)) {
            msg = "async generator already executing";
        }
        PyErr_SetString(PyExc_ValueError, msg);
        return NULL;
    }
    if (f == NULL || f->f_stacktop == NULL) {  // 生成器执行结束
        if (PyCoro_CheckExact(gen) && !closing) {
            /* `gen` is an exhausted coroutine: raise an error,
               except when called from gen_close(), which should
               always be a silent method. */
            PyErr_SetString(
                PyExc_RuntimeError,
                "cannot reuse already awaited coroutine");
        }
        else if (arg && !exc) {
            /* `gen` is an exhausted generator:
               only set exception if called from send(). */
            if (PyAsyncGen_CheckExact(gen)) {
                PyErr_SetNone(PyExc_StopAsyncIteration);
            }
            else {
                PyErr_SetNone(PyExc_StopIteration);
            }
        }
        return NULL;
    }

    if (f->f_lasti == -1) {  
        /* 生成器刚开始执行，send 的参数必须是 None，
           因为此时还没有 yield 接收 send 的值，send 其它值没意义 */ 
        if (arg && arg != Py_None) {
            const char *msg = "can't send non-None value to a "
                              "just-started generator";
            if (PyCoro_CheckExact(gen)) {
                msg = NON_INIT_CORO_MSG;
            }
            else if (PyAsyncGen_CheckExact(gen)) {
                msg = "can't send non-None value to a "
                      "just-started async generator";
            }
            PyErr_SetString(PyExc_TypeError, msg);
            return NULL;
        }
    } else {
        /* Push arg onto the frame's value stack */
        result = arg ? arg : Py_None;
        Py_INCREF(result);
        // send 的值放在值栈中，若 yield 是赋值语句，则存到其变量中，否则弹出
        *(f->f_stacktop++) = result;
    }

    /* Generators always return to their most recent caller, not
     * necessarily their creator. */
    Py_XINCREF(tstate->frame);
    assert(f->f_back == NULL);
    /* 需动态指向当前执行的生成器的 frame，
       因为生成器可能在不同的上下文中被调用，以便于退出时返回 */ 
    f->f_back = tstate->frame;

    gen->gi_running = 1;
    /* 生成器执行期间，需将生成器的异常上下文挂在线程状态的 exc_info 中，以便于恢复 */
    gen->gi_exc_state.previous_item = tstate->exc_info;
    tstate->exc_info = &gen->gi_exc_state;
    result = PyEval_EvalFrameEx(f, exc);
    tstate->exc_info = gen->gi_exc_state.previous_item;
    gen->gi_exc_state.previous_item = NULL;
    gen->gi_running = 0;

    /* Don't keep the reference to f_back any longer than necessary.  It
     * may keep a chain of frames alive or it could create a reference
     * cycle. */
    assert(f->f_back == tstate->frame);
    Py_CLEAR(f->f_back);

    /* If the generator just returned (as opposed to yielding), signal
     * that the generator is exhausted. */
    if (result && f->f_stacktop == NULL) {
        if (result == Py_None) {  // 生成器正常执行完毕
            /* Delay exception instantiation if we can */
            if (PyAsyncGen_CheckExact(gen)) {
                PyErr_SetNone(PyExc_StopAsyncIteration);
            }
            else {
                PyErr_SetNone(PyExc_StopIteration);
            }
        }
        else {
            /* Async generators cannot return anything but None */
            assert(!PyAsyncGen_CheckExact(gen));
            _PyGen_SetStopIterationValue(result);
        }
        Py_CLEAR(result);
    }
    else if (!result && PyErr_ExceptionMatches(PyExc_StopIteration)) {
        const char *msg = "generator raised StopIteration";
        if (PyCoro_CheckExact(gen)) {
            msg = "coroutine raised StopIteration";
        }
        else if PyAsyncGen_CheckExact(gen) {
            msg = "async generator raised StopIteration";
        }
        _PyErr_FormatFromCause(PyExc_RuntimeError, "%s", msg);

    }
    else if (!result && PyAsyncGen_CheckExact(gen) &&
             PyErr_ExceptionMatches(PyExc_StopAsyncIteration))
    {
        /* code in `gen` raised a StopAsyncIteration error:
           raise a RuntimeError.
        */
        const char *msg = "async generator raised StopAsyncIteration";
        _PyErr_FormatFromCause(PyExc_RuntimeError, "%s", msg);
    }

    if (!result || f->f_stacktop == NULL) {  
        /* 出现异常，生成器无法重新运行，需清理生成器的异常链，
           传播的异常处于 curexc_*，可继续向上传播 */
        /* generator can't be rerun, so release the frame */
        /* first clean reference cycle through stored exception traceback */
        exc_state_clear(&gen->gi_exc_state);
        gen->gi_frame->f_gen = NULL;
        gen->gi_frame = NULL;
        Py_DECREF(f);
    }

    return result;
}
```

若生成器对象持有的 @@frameobject@@ 执行期间没有 @@YIELD_VALUE@@ 字节码，那么生成器对象在 send(None) 后的执行效果与普通函数相差无几。但当遇到该字节码时，会先保存 @@frameobject@@ 当前的栈顶，然后如同 @@RETURN_VALUE@@ 退出 @@frameobject@@ 的执行。函数能够自由暂停源自其每次执行都绑定一个新的 @@frameobject@@ 对象，该对象动态记录函数体执行期间的上下文状态，如当前执行的字节码、值栈等，使得 @@YIELD_VALUE@@ 可轻松实现退出。

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
        
        case TARGET(YIELD_VALUE): {
            retval = POP();

            if (co->co_flags & CO_ASYNC_GENERATOR) {
                PyObject *w = _PyAsyncGenValueWrapperNew(retval);
                Py_DECREF(retval);
                if (w == NULL) {
                    retval = NULL;
                    goto error;
                }
                retval = w;
            }

            f->f_stacktop = stack_pointer;
            goto exit_yielding;
        }

        }
    }

exit_yielding:
    /* tracing, profiling */

    /* pop frame */
exit_eval_frame:
    if (PyDTrace_FUNCTION_RETURN_ENABLED())
        dtrace_function_return(f);
    Py_LeaveRecursiveCall();
    f->f_executing = 0;
    tstate->frame = f->f_back;

    return _Py_CheckFunctionResult(NULL, retval, "PyEval_EvalFrameEx");
}
```

委派子生成器的 `yield from` 语法由如下偏移 *4* 到偏移 *10* 的字节码段实现，核心即 @@YIELD_FROM@@ 字节码。@@GET_YIELD_FROM_ITER@@ 负责参数检查，即判断栈顶对象是否可迭代。@@LOAD_CONST@@ 将 *None* 设置到栈顶表示首次 send() 的参数。接着 @@YIELD_FROM@@ 取出值栈中的 send() 参数和可迭代对象，相应调用其 send() 方法或 next() 方法获取值，然后类似 @@YIELD_VALUE@@ 保存栈顶退出 @@frameobject@@ 的执行。

```python
def subgen(val=None):
    while True:
        val = yield val
        if str(val).lower() == "break":
            break

def gen():
    yield from subgen()

>>> def subgen(val=None):
...     while True:
...         val = yield val
...         if str(val).lower() == "break":
...             break
... 
>>> def gen():
...     yield from subgen()
... 
>>> g = gen()
>>> g.send(None)
>>> g.send(1)
1
>>> g.send(2)
2
>>> g.send("break")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
StopIteration

>>> dis(gen)
  2           0 LOAD_GLOBAL              0 (subgen)
              2 CALL_FUNCTION            0
              4 GET_YIELD_FROM_ITER
              6 LOAD_CONST               0 (None)
              8 YIELD_FROM
             10 POP_TOP
             12 LOAD_CONST               0 (None)
             14 RETURN_VALUE
```

具体来说，@@YIELD_FROM@@ 检查可迭代对象若是生成器，则直接调用其 send() 方法获取值。否则检查栈顶的值是否为 *None*，若是则寻找其 next() 方法获取值，否则寻找其 send() 方法获取值。

* 若值为 *NULL*，可能是子生成器结束，则获取 StopIteration 异常携带的值，并设置到栈顶，之后作为 `yield from` 表达式的值。若子生成器抛出的不是 StopIteration 异常，则跳转到异常处理。

* 正常情况下值不为 *NULL*，则保存栈顶，然后将 *f_lasti* 向前走一行，即重新回到 @@YIELD_FROM@@ 字节码。下一次执行时，栈顶为新的 send() 参数，然后 @@YIELD_FROM@@ 可从新继续上述流程。

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

        case TARGET(GET_YIELD_FROM_ITER): {
            /* before: [obj]; after [getiter(obj)] */
            PyObject *iterable = TOP();
            PyObject *iter;
            if (PyCoro_CheckExact(iterable)) {
                /* `iterable` is a coroutine */
                if (!(co->co_flags & (CO_COROUTINE | CO_ITERABLE_COROUTINE))) {
                    /* and it is used in a 'yield from' expression of a
                       regular generator. */
                    Py_DECREF(iterable);
                    SET_TOP(NULL);
                    _PyErr_SetString(tstate, PyExc_TypeError,
                                     "cannot 'yield from' a coroutine object "
                                     "in a non-coroutine generator");
                    goto error;
                }
            }
            else if (!PyGen_CheckExact(iterable)) {
                /* `iterable` is not a generator. */
                iter = PyObject_GetIter(iterable);
                Py_DECREF(iterable);
                SET_TOP(iter);
                if (iter == NULL)
                    goto error;
            }
            PREDICT(LOAD_CONST);
            DISPATCH();
        }
        
        case TARGET(YIELD_FROM): {
            PyObject *v = POP();
            PyObject *receiver = TOP();
            int err;
            if (PyGen_CheckExact(receiver) || PyCoro_CheckExact(receiver)) {
                retval = _PyGen_Send((PyGenObject *)receiver, v);
            } else {
                _Py_IDENTIFIER(send);
                if (v == Py_None)
                    retval = Py_TYPE(receiver)->tp_iternext(receiver);
                else
                    retval = _PyObject_CallMethodIdObjArgs(receiver, &PyId_send, v, NULL);
            }
            Py_DECREF(v);
            if (retval == NULL) {
                PyObject *val;
                if (tstate->c_tracefunc != NULL
                        && _PyErr_ExceptionMatches(tstate, PyExc_StopIteration))
                    call_exc_trace(tstate->c_tracefunc, tstate->c_traceobj, tstate, f);
                err = _PyGen_FetchStopIterationValue(&val);
                if (err < 0)
                    goto error;
                Py_DECREF(receiver);
                SET_TOP(val);
                DISPATCH();
            }
            /* receiver remains on stack, retval is value to be yielded */
            f->f_stacktop = stack_pointer;
            /* and repeat... */
            assert(f->f_lasti >= (int)sizeof(_Py_CODEUNIT));
            f->f_lasti -= sizeof(_Py_CODEUNIT);
            goto exit_yielding;
        }

        }
    }

exit_yielding:
    /* tracing, profiling */

    /* pop frame */
exit_eval_frame:
    if (PyDTrace_FUNCTION_RETURN_ENABLED())
        dtrace_function_return(f);
    Py_LeaveRecursiveCall();
    f->f_executing = 0;
    tstate->frame = f->f_back;

    return _Py_CheckFunctionResult(NULL, retval, "PyEval_EvalFrameEx");
}
```

throw() 用于控制生成器对象在暂停位置引发一个异常，若生成器捕获了该异常并 `yield` 一个值，那么 throw() 的返回值即为该值。具体实现中，

* 若对非正在执行 `yield from` 的生成器进行 throw()，等价于先将异常设置到 @@PyThreadState@@ 的 curexc_* 字段上进行传播，然后再调用 send(None) 恢复 *gi_frame* 的执行，其中 _PyEval_EvalFrameDefault(f, throwflag) 的参数 *throwflag* 设置为 *1* 表明立即跳转到 error 部分处理异常。

* 对于正在委派子生成器的生成器对象进行 throw()，先从栈顶获取 `yield from` 的迭代对象（此时还未调用 send()，原栈顶的 send() 参数已被消费，故为可迭代对象），然后依据对象类型和异常进行处理：

    * 若异常为 GeneratorExit，表明退出生成器，则先调用 close() 关闭子生成器，再由当前生成器处理 GeneratorExit 异常。

    * 若可迭代对象是生成器对象，则调用其 throw() 方法抛出异常。对于其它可迭代对象，若能找到 throw() 方法则调用，否则不进行处理。若子生成器捕获了异常，则先跳过 @@YIELD_FROM@@ 字节码，然后调用 send(None) 恢复 *gi_frame* 来处理异常。

```c
// Objects/genobject.c#gen_throw
static PyObject *
gen_throw(PyGenObject *gen, PyObject *args)
{
    PyObject *typ;
    PyObject *tb = NULL;
    PyObject *val = NULL;

    if (!PyArg_UnpackTuple(args, "throw", 1, 3, &typ, &val, &tb)) {
        return NULL;
    }

    return _gen_throw(gen, 1, typ, val, tb);
}

// Objects/genobject.c#_gen_throw
static PyObject *
_gen_throw(PyGenObject *gen, int close_on_genexit,
           PyObject *typ, PyObject *val, PyObject *tb)
{
    PyObject *yf = _PyGen_yf(gen);
    _Py_IDENTIFIER(throw);

    if (yf) {
        PyObject *ret;
        int err;
        if (PyErr_GivenExceptionMatches(typ, PyExc_GeneratorExit) &&
            close_on_genexit
        ) {
            /* Asynchronous generators *should not* be closed right away.
               We have to allow some awaits to work it through, hence the
               `close_on_genexit` parameter here.
            */
            gen->gi_running = 1;
            err = gen_close_iter(yf);
            gen->gi_running = 0;
            Py_DECREF(yf);
            if (err < 0)
                return gen_send_ex(gen, Py_None, 1, 0);
            goto throw_here;
        }
        if (PyGen_CheckExact(yf) || PyCoro_CheckExact(yf)) {
            /* `yf` is a generator or a coroutine. */
            gen->gi_running = 1;
            /* Close the generator that we are currently iterating with
               'yield from' or awaiting on with 'await'. */
            ret = _gen_throw((PyGenObject *)yf, close_on_genexit,
                             typ, val, tb);
            gen->gi_running = 0;
        } else {
            /* `yf` is an iterator or a coroutine-like object. */
            PyObject *meth;
            if (_PyObject_LookupAttrId(yf, &PyId_throw, &meth) < 0) {
                Py_DECREF(yf);
                return NULL;
            }
            if (meth == NULL) {
                Py_DECREF(yf);
                goto throw_here;
            }
            gen->gi_running = 1;
            ret = PyObject_CallFunctionObjArgs(meth, typ, val, tb, NULL);
            gen->gi_running = 0;
            Py_DECREF(meth);
        }
        Py_DECREF(yf);
        if (!ret) {
            PyObject *val;
            /* Pop subiterator from stack */
            ret = *(--gen->gi_frame->f_stacktop);
            assert(ret == yf);
            Py_DECREF(ret);
            /* Termination repetition of YIELD_FROM */
            assert(gen->gi_frame->f_lasti >= 0);
            gen->gi_frame->f_lasti += sizeof(_Py_CODEUNIT);
            if (_PyGen_FetchStopIterationValue(&val) == 0) {
                ret = gen_send_ex(gen, val, 0, 0);
                Py_DECREF(val);
            } else {
                ret = gen_send_ex(gen, Py_None, 1, 0);
            }
        }
        return ret;
    }

throw_here:
    /* First, check the traceback argument, replacing None with
       NULL. */
    if (tb == Py_None) {
        tb = NULL;
    }
    else if (tb != NULL && !PyTraceBack_Check(tb)) {
        PyErr_SetString(PyExc_TypeError,
            "throw() third argument must be a traceback object");
        return NULL;
    }

    Py_INCREF(typ);
    Py_XINCREF(val);
    Py_XINCREF(tb);

    if (PyExceptionClass_Check(typ))
        PyErr_NormalizeException(&typ, &val, &tb);

    else if (PyExceptionInstance_Check(typ)) {
        /* Raising an instance.  The value should be a dummy. */
        if (val && val != Py_None) {
            PyErr_SetString(PyExc_TypeError,
              "instance exception may not have a separate value");
            goto failed_throw;
        }
        else {
            /* Normalize to raise <class>, <instance> */
            Py_XDECREF(val);
            val = typ;
            typ = PyExceptionInstance_Class(typ);
            Py_INCREF(typ);

            if (tb == NULL)
                /* Returns NULL if there's no traceback */
                tb = PyException_GetTraceback(val);
        }
    }
    else {
        /* Not something you can raise.  throw() fails. */
        PyErr_Format(PyExc_TypeError,
                     "exceptions must be classes or instances "
                     "deriving from BaseException, not %s",
                     Py_TYPE(typ)->tp_name);
            goto failed_throw;
    }

    PyErr_Restore(typ, val, tb);
    return gen_send_ex(gen, Py_None, 1, 0);

failed_throw:
    /* Didn't use our arguments, so restore their original refcounts */
    Py_DECREF(typ);
    Py_XDECREF(val);
    Py_XDECREF(tb);
    return NULL;
}

// Objects/genobject.c#_PyGen_yf
PyObject *
_PyGen_yf(PyGenObject *gen)
{
    PyObject *yf = NULL;
    PyFrameObject *f = gen->gi_frame;

    if (f && f->f_stacktop) {
        PyObject *bytecode = f->f_code->co_code;
        unsigned char *code = (unsigned char *)PyBytes_AS_STRING(bytecode);

        if (f->f_lasti < 0) {
            /* Return immediately if the frame didn't start yet. YIELD_FROM
               always come after LOAD_CONST: a code object should not start
               with YIELD_FROM */
            assert(code[0] != YIELD_FROM);
            return NULL;
        }

        if (code[f->f_lasti + sizeof(_Py_CODEUNIT)] != YIELD_FROM)
            return NULL;
        yf = f->f_stacktop[-1];
        Py_INCREF(yf);
    }

    return yf;
}

// Objects/genobject.c#gen_close_iter
static int
gen_close_iter(PyObject *yf)
{
    PyObject *retval = NULL;
    _Py_IDENTIFIER(close);

    if (PyGen_CheckExact(yf) || PyCoro_CheckExact(yf)) {
        retval = gen_close((PyGenObject *)yf, NULL);
        if (retval == NULL)
            return -1;
    }
    else {
        PyObject *meth;
        if (_PyObject_LookupAttrId(yf, &PyId_close, &meth) < 0) {
            PyErr_WriteUnraisable(yf);
        }
        if (meth) {
            retval = _PyObject_CallNoArg(meth);
            Py_DECREF(meth);
            if (retval == NULL)
                return -1;
        }
    }
    Py_XDECREF(retval);
    return 0;
}
```

总结来说，@@PEP-255@@ 阐述引入生成器的必要性，其能简化生产者、消费者函数的设计。同时，生成器的实现也极为巧妙，天生具备保存执行点上下文的能力，使得生成器的实现十分容易。
