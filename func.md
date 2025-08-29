## 为什么函数（或实例）可以被调用？
在 Python 中，我们可以调用各种广义的函数，即通过形如 `func(args)` 的方式调用函数或实例。如下为这种范例的一些例子：
```python
# 内置函数
>>> type(type)
<class 'type'>
>>> type
<class 'type'>
>>> type(...)
<class 'ellipsis'>

>>> type(print)
<class 'builtin_function_or_method'>
>>> print
<built-in function print>
>>> print('Hello CPython!')
Hello CPython!

# 自定义函数
def fib(n):
    if n <= 1:
        return 1
    return fib(n - 1) + fib(n - 2)

>>> type(fib)
<class 'function'>
>>> fib
<function fib at 0x100fcd670>
>>> fib(5)
8

# 内置类
>>> type(int)
<class 'type'>
>>> int
<class 'int'>
>>> int('2147483648')
2147483648

# 自定义类
class User:
    def __init__(self, name):
        self.name = name
    
    def __call__(self):
        return f'Hello, I\'m {self.name}'

>>> user = User('Xukun Cai')  # 调用类名
>>> type(user)
<class '__main__.User'>
>>> user
<__main__.User object at 0x100f74190>
>>> user()  # 调用实例名
"Hello, I'm Xukun Cai"
```
可以看出错综复杂的函数、类和对象都可以被调用。通过 `dis` 查看各种调用的字节码：
```text
# type(type)
  1           0 LOAD_NAME                0 (type)
              2 LOAD_NAME                0 (type)
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# print('Hello CPython!')
  1           0 LOAD_NAME                0 (print)
              2 LOAD_CONST               0 ('Hello CPython!')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# int('2147483648')
  1           0 LOAD_NAME                0 (int)
              2 LOAD_CONST               0 ('2147483648')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# User('Xukun Cai')
  1           0 LOAD_NAME                0 (User)
              2 LOAD_CONST               0 ('Xukun Cai')
              4 CALL_FUNCTION            1
              6 RETURN_VALUE

# user()
  1           0 LOAD_NAME                0 (user)
              2 CALL_FUNCTION            0
              4 RETURN_VALUE
```
容易看出，上述所有的调用均由 `CALL_FUNCTION` 字节码实现。那么，其内部是如何知道不同的对象的调用入口以及如何区别处理 C 函数的调用和 Python 函数的调用的。我们从该字节码出发，追溯调用栈：
```c
/* ceval.c */
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    int opcode;
main_loop:
    for (;;) {
        opcode = _Py_OPCODE(*next_instr);
        switch (opcode) {
            case TARGET(CALL_FUNCTION): {
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

Py_LOCAL_INLINE(PyObject *) _Py_HOT_FUNCTION
call_function(PyThreadState *tstate, PyObject ***pp_stack, Py_ssize_t oparg, PyObject *kwnames)
{
    x = _PyObject_Vectorcall(func, stack, nargs | PY_VECTORCALL_ARGUMENTS_OFFSET, kwnames);
    return x;
}
```
```c
/* cpython/abstract.h */
static inline PyObject *
_PyObject_Vectorcall(PyObject *callable, PyObject *const *args,
                     size_t nargsf, PyObject *kwnames)
{
    PyObject *res;
    vectorcallfunc func;
    func = _PyVectorcall_Function(callable);
    if (func == NULL) {
        Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
        return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
    }
    res = func(callable, args, nargsf, kwnames);
    return _Py_CheckFunctionResult(callable, res, NULL);
}

static inline vectorcallfunc
_PyVectorcall_Function(PyObject *callable)
{
    PyTypeObject *tp = Py_TYPE(callable);
    Py_ssize_t offset = tp->tp_vectorcall_offset;
    vectorcallfunc ptr;
    if (!PyType_HasFeature(tp, _Py_TPFLAGS_HAVE_VECTORCALL)) {
        return NULL;
    }
    assert(PyCallable_Check(callable));
    assert(offset > 0);
    memcpy(&ptr, (char *) callable + offset, sizeof(ptr));
    return ptr;
}
```
