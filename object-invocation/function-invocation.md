### 调用函数

如 `<function f at 0x1052c03a0>` 的函数对象，允许以如 `f(arglist)` 形式进行调用。这里 `f` 为函数对象，故称为函数调用，若为任意对象，则称对象调用。在语法层面，调用遵循如下 @@BNF@@ 语法规则，即任意对象名称之后允许接 `(arglist)` 形式的语法表明对其进行调用。括号中的参数 *arglist* 允许是简单表达式语句、其它变量名或为空。注意到关键字传参等号 `=` 两边都允许是表达式，即如 `f(b if cond else a = 1)` 是可通过匹配的，而实际上是不允许的。这是为了在构建 @@CST@@ 时 @@LL_k@@ 解析器能够区分 `NAME '=' test`（如 `f(x=1)`）和 `test [comp_for]`（如 `f(x if cond else y)`）两种路径而设计的（即因为 `x` 都是 NAME，而 @@LL_k@@ 解析器只能基于第一个 TOKEN 来决定匹配哪个分支），然后在将 @@CST@@ 转换为 @@AST@@ 时，再断言关键字参数是否为 NAME 节点。

```peg
arglist: argument (',' argument)*  [',']

# The reason that keywords are test nodes instead of NAME is that using NAME
# results in an ambiguity. ast.c makes sure it's a NAME.
# "test '=' test" is really "keyword '=' test", but we have no such token.
# These need to be in a single rule to avoid grammar that is ambiguous
# to our LL(1) parser. Even though 'test' includes '*expr' in star_expr,
# we explicitly match '*' here, too, to give it proper precedence.
# Illegal combinations and orderings are blocked in ast.c:
# multiple (test comp_for) arguments are blocked; keyword unpackings
# that precede iterable unpackings are blocked; etc.
argument: ( test [comp_for] |
            test ':=' test |
            test '=' test |
            '**' test |
            '*' test )

test: or_test ['if' or_test 'else' test] | lambdef
lambdef: 'lambda' [varargslist] ':' test
or_test: and_test ('or' and_test)*
and_test: not_test ('and' not_test)*
not_test: 'not' not_test | comparison
comparison: expr (comp_op expr)*
comp_op: '<'|'>'|'=='|'>='|'<='|'<>'|'!='|'in'|'not' 'in'|'is'|'is' 'not'
expr: xor_expr ('|' xor_expr)*
xor_expr: and_expr ('^' and_expr)*
and_expr: shift_expr ('&' shift_expr)*
shift_expr: arith_expr (('<<'|'>>') arith_expr)*
arith_expr: term (('+'|'-') term)*
term: factor (('*'|'@'|'/'|'%'|'//') factor)*
factor: ('+'|'-'|'~') factor | power
power: atom_expr ['**' factor]
atom_expr: [AWAIT] atom trailer*
atom: ('(' [yield_expr|testlist_comp] ')' |
       '[' [testlist_comp] ']' |
       '{' [dictorsetmaker] '}' |
       NAME | NUMBER | STRING+ | '...' | 'None' | 'True' | 'False')
trailer: '(' [arglist] ')' | '[' subscriptlist ']' | '.' NAME
```

考虑如下两种合法的调用，即是否有关键字传递参数。其余传递参数的方式，如条件判断表达式 `f(x if cond else y)` 等本质上是在调用函数前先计算出表达式的值再传递参数。没有采用关键字传递参数的使用 @@CALL_FUNCTION@@ 字节码进行调用，有的则使用 @@CALL_FUNCTION_KW@@。二者字节码的的参数都为总传递参数的数量，@@CALL_FUNCTION@@ 的值栈为逆序的位置参数，而 @@CALL_FUNCTION_KW@@ 的值栈先是同 @@BUILD_CONST_KEY_MAP@@ 的值栈（即键元组，然后依次为逆序值），然后是逆序的位置参数。

```python
>>> dis("f(1, 2, 3)")
  1           0 LOAD_NAME                0 (f)
              2 LOAD_CONST               0 (1)
              4 LOAD_CONST               1 (2)
              6 LOAD_CONST               2 (3)
              8 CALL_FUNCTION            3
             10 RETURN_VALUE

>>> dis("f(1, b=2, c=3)")
  1           0 LOAD_NAME                0 (f)
              2 LOAD_CONST               0 (1)
              4 LOAD_CONST               1 (2)
              6 LOAD_CONST               2 (3)
              8 LOAD_CONST               3 (('b', 'c'))
             10 CALL_FUNCTION_KW         3
             12 RETURN_VALUE
```

从字节码的实现来看，二者的区别是在调用 `call_function(tstate, pp_stack, oparg, kwnames)` 函数时，*kwnames* 参数传递的不同，即 @@CALL_FUNCTION_KW@@ 会弹出栈顶的关键字元组并传递给 *kwnames*。调用字节码并没有解析出参数列表，而是直接将值栈指针和总参数数量传递给 *pp_stack* 和 *oparg* 待后续解析，这是为了兼容 @@vectorcall@@ 调用。函数调用完成后，其结果会设置到值栈的栈顶。

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

            case TARGET(CALL_FUNCTION_KW): {
                PyObject **sp, *res, *names;

                names = POP();
                assert(PyTuple_CheckExact(names) && PyTuple_GET_SIZE(names) <= oparg);
                sp = stack_pointer;
                res = call_function(tstate, &sp, oparg, names);
                stack_pointer = sp;
                PUSH(res);
                Py_DECREF(names);

                if (res == NULL) {
                    goto error;
                }
                DISPATCH();
            }
        }
    }
}
```

call_function() 采用 @@inline_function@@ 实现，可消除 C 函数调用的固有开销。具体实现中：

* 先从值栈中解析出被调用对象 *pfunc*，然后计算出关键字参数个数和位置参数个数 *nargs*，进而计算出对象调用的参数数组 *stack*。注意到该数组的前一项 `*(stack - 1)` 是被调用对象，属于调用期间的可控范围。

* 然后把被调用对象 *pfunc*、参数数组 *stack*、位置参数数量 *nargs* 和关键字参数名称 *kwnames* 作为参数调用 _PyObject_Vectorcall() 函数。注意到 *nargs* 加上了 `PY_VECTORCALL_ARGUMENTS_OFFSET = ((size_t)1 << (8 * sizeof(size_t) - 1))` 标记位，在 @@PEP-590@@ 中 @@PY_VECTORCALL_ARGUMENTS_OFFSET@@ 标记用于表明后续被调用者允许临时修改 `stack[-1]` 项以便于方法对象的调用（即可将 *self* 设置到 `stack[-1]`）。而 *stack* 的前一项也确实在调用的控制范围内，故允许支持该特性。

* 调用结束后，清理调用期间写入值栈的中间值，使之恢复到调用之前。

```c
// Python/ceval.c#call_function
/* Issue #29227: Inline call_function() into _PyEval_EvalFrameDefault()
   to reduce the stack consumption. */
Py_LOCAL_INLINE(PyObject *) _Py_HOT_FUNCTION
call_function(PyThreadState *tstate, PyObject ***pp_stack, Py_ssize_t oparg, PyObject *kwnames)
{
    PyObject **pfunc = (*pp_stack) - oparg - 1;
    PyObject *func = *pfunc;
    PyObject *x, *w;
    Py_ssize_t nkwargs = (kwnames == NULL) ? 0 : PyTuple_GET_SIZE(kwnames);  // 关键字传参个数
    Py_ssize_t nargs = oparg - nkwargs;                                      // 位置传参个数
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
        Py_DECREF(w);
    }

    return x;
}
```

@@CAPI_PyObject_Vectorcall@@ 在 3.9 版本后调整为开头不带下划线的 C 接口，其作用是检查被调用对象是否支持 @@vectorcall@@ 调用，若不支持则回退到 @@tp_call@@ 调用。具体来说：

* @@tp_call@@ 是指类型的 @@slot_tp_call@@ 槽具有签名为 `PyObject *tp_call(PyObject *callable, PyObject *args, PyObject *kwargs)` 的函数实现，则称该类型对象为可被调用对象，那么该类型对象就能以 `obj(...)` 的形式进行调用。函数类型 @@PyFunction_Type@@ 实现了该槽，故其实例函数对象 @@PyFunctionObject@@ 是可调用的。

* @@vectorcall@@ 是对 @@tp_call@@ 调用的一种优化，其中 @@tp_call@@ 的被调用函数签名中，需要先将调用参数打包为元组对象 *args* 和字典对象 *kwargs*，而考虑到许多调用的实现中不需要打包对象，则又需要进行解包，从而产生了不必要的工作。因此 @@vectorcall@@ 设计被调用函数的签名为 `PyObject *(*vectorcallfunc)(PyObject *callable, PyObject *const *args, size_t nargsf, PyObject *kwnames)`，即直接将未经打包的参数数组传递给被调用者从而规避不必要的参数处理。

若被调用类型具有 @@Py_TPFLAGS_HAVE_VECTORCALL@@ 标记，则说明该类型实现了 @@vectorcall@@ 调用，那么依据类型的 @@slot_tp_vectorcall_offset@@ 槽中记录的基于对象的函数指针偏移地址就能得到被调用对象实现的 @@vectorcall@@ 调用函数指针。反之，若类型不支持该协议，则默认由 @@slot_tp_call@@ 槽实现的函数进行调用。此外，获取位置参数数量需要通过 @@CAPI_PyVectorcall_NARGS@@ 获取，其会去除相关标记位。

```c
// Include/cpython/abstract.h#PyVectorcall_NARGS
static inline Py_ssize_t
PyVectorcall_NARGS(size_t n)
{
    return n & ~PY_VECTORCALL_ARGUMENTS_OFFSET;
}

// Include/cpython/abstract.h#_PyVectorcall_Function
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

// Include/cpython/abstract.h#_PyObject_Vectorcall
static inline PyObject *
_PyObject_Vectorcall(PyObject *callable, PyObject *const *args,
                     size_t nargsf, PyObject *kwnames)
{
    PyObject *res;
    vectorcallfunc func;
    assert(kwnames == NULL || PyTuple_Check(kwnames));
    assert(args != NULL || PyVectorcall_NARGS(nargsf) == 0);
    func = _PyVectorcall_Function(callable);
    if (func == NULL) {
        Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
        return _PyObject_MakeTpCall(callable, args, nargs, kwnames);
    }
    res = func(callable, args, nargsf, kwnames);
    // 结果与异常状态的合法性校验
    return _Py_CheckFunctionResult(callable, res, NULL);
}
```

@@PyFunction_Type@@ 支持 @@vectorcall@@ 调用，默认实现为 _PyFunction_Vectorcall()。按照约定，两种协议的功能应是完全相同的，因此如下仅分析 @@vectorcall@@ 调用。函数体的执行依据参数传递的不同区分快路径和正常路径：

* 若 @@codeobject@@ 没有关键字参数，也没有关键字传参，且同时具有 @@CO_OPTIMIZED@@（如采用 @@LOAD-STORE_FAST@@ 快速访问局部变量）、@@CO_NEWLOCALS@@（需要为 @@frameobject@@ 创建新局部命名空间字典）和 @@CO_NOFREE@@（没有闭包变量）标记的情况下，若位置传参完整，或是所有位置都由默认参数提供，则走快路径。

* 其它情况下则走普通路径，即需要应对不同输入情况下参数的解析以及闭包变量的处理等。具体来说，将函数体（*co*）、命名空间（全局 *globals* 和局部 *locals*）、参数列表（位置传参数组 *args*、位置传参个数 *argcount*、关键字传参键 *kwnames*、关键字传参值 *kwargs*、关键字传参个数 *kwcount*）、默认值（可按位置传递参数默认值数组 *defs*、可按位置传递参数默认值个数 *defcount*、关键字参数默认值字典 *kwdefs*）、闭包自由变量元组（*closure*）和函数名称（*name* 和 *qualname*）六类参数整理并传递给 _PyEval_EvalCodeWithName() 进行下一步处理。

```c
PyObject *
_PyFunction_Vectorcall(PyObject *func, PyObject* const* stack,
                       size_t nargsf, PyObject *kwnames)
{
    PyCodeObject *co = (PyCodeObject *)PyFunction_GET_CODE(func);  // func_code
    PyObject *globals = PyFunction_GET_GLOBALS(func);              // func_globals
    PyObject *argdefs = PyFunction_GET_DEFAULTS(func);             // func_defaults
    PyObject *kwdefs, *closure, *name, *qualname;
    PyObject **d;
    Py_ssize_t nkwargs = (kwnames == NULL) ? 0 : PyTuple_GET_SIZE(kwnames);
    Py_ssize_t nd;

    assert(PyFunction_Check(func));
    Py_ssize_t nargs = PyVectorcall_NARGS(nargsf);
    assert(nargs >= 0);
    assert(kwnames == NULL || PyTuple_CheckExact(kwnames));
    assert((nargs == 0 && nkwargs == 0) || stack != NULL);
    /* kwnames must only contains str strings, no subclass, and all keys must
       be unique */
    
    // 没有关键字参数 & 没有关键字传参
    if (co->co_kwonlyargcount == 0 && nkwargs == 0 &&
        (co->co_flags & ~PyCF_MASK) == (CO_OPTIMIZED | CO_NEWLOCALS | CO_NOFREE))
    {
        // 没有默认参数 & 位置参数传递完整
        if (argdefs == NULL && co->co_argcount == nargs) {
            return function_code_fastcall(co, stack, nargs, globals);
        }
        // 有默认参数 & 所有参数都使用默认参数
        else if (nargs == 0 && argdefs != NULL
                 && co->co_argcount == PyTuple_GET_SIZE(argdefs)) {
            /* function called with no arguments, but all parameters have
               a default value: use default values as arguments .*/
            stack = _PyTuple_ITEMS(argdefs);
            return function_code_fastcall(co, stack, PyTuple_GET_SIZE(argdefs),
                                          globals);
        }
    }

    kwdefs = PyFunction_GET_KW_DEFAULTS(func);  // func_kwdefaults
    closure = PyFunction_GET_CLOSURE(func);     // func_closure
    name = ((PyFunctionObject *)func) -> func_name;
    qualname = ((PyFunctionObject *)func) -> func_qualname;

    if (argdefs != NULL) {
        d = _PyTuple_ITEMS(argdefs);
        nd = PyTuple_GET_SIZE(argdefs);
    }
    else {
        d = NULL;
        nd = 0;
    }
    return _PyEval_EvalCodeWithName(
        (PyObject*)co,              // co
        globals,                    // globals
        (PyObject *)NULL,           // locals
        stack,                      // args
        nargs,                      // argcount
        nkwargs ? _PyTuple_ITEMS(kwnames) : NULL,  // kwnames
        stack + nargs,              // kwargs
        nkwargs,                    // kwcount
        1,                          // kwstep
        d,                          // defs
        (int)nd,                    // defcount
        kwdefs,                     // kwdefs
        closure,                    // closure
        name,                       // name
        qualname                    // qualname
    );
}
```
 
_PyEval_EvalCodeWithName() 是 @@CAPI_PyEval_EvalCode@@ 和 @@CAPI_PyEval_EvalCodeEx@@ 接口的具体实现，主要工作是在给定的参数和环境下执行 @@codeobject@@ 对象。而 @@codeobject@@ 的每次执行都会伴随产生一个运行时 @@frameobject@@ 对象，用于动态追踪代码的运行时状态（如执行到第几行代码、栈的情况等）。本质上执行 @@codeobject@@ 相当于在执行 @@frameobject@@，即 _PyEval_EvalCodeWithName() 会创建为待执行的 @@codeobject@@ 创建一个新的 @@frameobject@@ 对象，然后基于输入初始化该对象，最后再调用 @@CAPI_PyEval_EvalFrameEx@@ 接口执行该对象。注意到，若 @@codeobject@@ 是生成器或协程类型不会立即执行 @@frameobject@@，而是返回一个包装对象。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(PyObject *_co, PyObject *globals, PyObject *locals,
           PyObject *const *args, Py_ssize_t argcount,
           PyObject *const *kwnames, PyObject *const *kwargs,
           Py_ssize_t kwcount, int kwstep,
           PyObject *const *defs, Py_ssize_t defcount,
           PyObject *kwdefs, PyObject *closure,
           PyObject *name, PyObject *qualname)
{
    PyCodeObject* co = (PyCodeObject*)_co;
    PyFrameObject *f;
    PyObject *retval = NULL;
    PyObject **fastlocals, **freevars;
    PyObject *x, *u;
    /* co_argcount = p-only count + p-or-kw count */
    const Py_ssize_t total_args = co->co_argcount + co->co_kwonlyargcount;
    Py_ssize_t i, j, n;
    PyObject *kwdict;

    PyThreadState *tstate = _PyThreadState_GET();
    assert(tstate != NULL);

    if (globals == NULL) {
        _PyErr_SetString(tstate, PyExc_SystemError,
                         "PyEval_EvalCodeEx: NULL globals");
        return NULL;
    }

    /* Create the frame */
    f = _PyFrame_New_NoTrack(tstate, co, globals, locals);
    if (f == NULL) {
        return NULL;
    }
    fastlocals = f->f_localsplus;
    freevars = f->f_localsplus + co->co_nlocals;

    /* Create a dictionary for keyword parameters (**kwags) */
    if (co->co_flags & CO_VARKEYWORDS) {
        kwdict = PyDict_New();
        if (kwdict == NULL)
            goto fail;
        i = total_args;
        if (co->co_flags & CO_VARARGS) {
            i++;
        }
        SETLOCAL(i, kwdict);  // fastlocals[total_args] = kwdict
    }
    else {
        kwdict = NULL;
    }

    /* Copy all positional arguments into local variables */
    if (argcount > co->co_argcount) {
        n = co->co_argcount;  // 其余位置参数由 *args 接收
    }
    else {
        n = argcount;
    }
    for (j = 0; j < n; j++) {  // 设置 p-only 或 p-or-kw 参数
        x = args[j];
        Py_INCREF(x);
        SETLOCAL(j, x);
    }

    /* Pack other positional arguments into the *args argument */
    if (co->co_flags & CO_VARARGS) {  
        // 剩余的为 *args，若位置参数不多余，则 *args 为 ()
        u = _PyTuple_FromArray(args + n, argcount - n);
        if (u == NULL) {
            goto fail;
        }
        SETLOCAL(total_args, u);  // locals[n] = *args
    }

    /* Handle keyword arguments passed as two strided arrays */
    kwcount *= kwstep;
    for (i = 0; i < kwcount; i += kwstep) {
        PyObject **co_varnames;
        PyObject *keyword = kwnames[i];
        PyObject *value = kwargs[i];
        Py_ssize_t j;

        if (keyword == NULL || !PyUnicode_Check(keyword)) {
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() keywords must be strings",
                          co->co_name);
            goto fail;
        }

        /* Speed hack: do raw pointer compares. As names are
           normally interned this should almost always hit. */
        co_varnames = ((PyTupleObject *)(co->co_varnames))->ob_item;
        // 从 co_posonlyargcount 之后查找 co_varnames，找不到则可能作为关键字参数传递
        for (j = co->co_posonlyargcount; j < total_args; j++) {
            PyObject *name = co_varnames[j];
            if (name == keyword) {
                goto kw_found;
            }
        }

        /* Slow fallback, just in case */
        for (j = co->co_posonlyargcount; j < total_args; j++) {
            PyObject *name = co_varnames[j];
            int cmp = PyObject_RichCompareBool( keyword, name, Py_EQ);
            if (cmp > 0) {
                goto kw_found;
            }
            else if (cmp < 0) {
                goto fail;
            }
        }

        // 找不到匹配的 keyword 参数
        assert(j >= total_args);
        if (kwdict == NULL) {
            // 检查是否将位置参数作为关键字参数传递
            if (co->co_posonlyargcount
                && positional_only_passed_as_keyword(tstate, co,
                                                     kwcount, kwnames))
            {
                goto fail;
            }
            
            // 没定义 **kwargs 则无法接收 co_varnames 外的参数
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() got an unexpected keyword argument '%S'",
                          co->co_name, keyword);
            goto fail;
        }

        // 由 **kwargs 接收 co_varnames 定义外的关键字参数
        if (PyDict_SetItem(kwdict, keyword, value) == -1) {
            goto fail;
        }
        continue;

      kw_found:
        if (GETLOCAL(j) != NULL) {  
            // 普通参数已经通过位置传参，又通过关键字重复传参
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() got multiple values for argument '%S'",
                          co->co_name, keyword);
            goto fail;
        }
        Py_INCREF(value);
        SETLOCAL(j, value);
    }

    /* Check the number of positional arguments */
    // 以位置传递参数过多，且没有 *args 参数处理多余部分
    if ((argcount > co->co_argcount) && !(co->co_flags & CO_VARARGS)) {
        too_many_positional(tstate, co, argcount, defcount, fastlocals);
        goto fail;
    }

    /* Add missing positional arguments (copy default values from defs) */
    if (argcount < co->co_argcount) {
        // 检查位置参数是否有值，对于普通参数若采用的是关键字传参也能看到
        Py_ssize_t m = co->co_argcount - defcount;
        Py_ssize_t missing = 0;
        for (i = argcount; i < m; i++) {
            if (GETLOCAL(i) == NULL) {
                missing++;
            }
        }
        if (missing) {
            // 位置参数/普通参数缺失参数，抛出异常
            missing_arguments(tstate, co, missing, defcount, fastlocals);
            goto fail;
        }
        if (n > m)
            i = n - m;
        else
            i = 0;  // 没有传参，都使用默认值
        for (; i < defcount; i++) {
            if (GETLOCAL(m+i) == NULL) {
                PyObject *def = defs[i];
                Py_INCREF(def);
                SETLOCAL(m+i, def);
            }
        }
    }

    /* Add missing keyword arguments (copy default values from kwdefs) */
    if (co->co_kwonlyargcount > 0) {
        Py_ssize_t missing = 0;
        for (i = co->co_argcount; i < total_args; i++) {
            PyObject *name;
            if (GETLOCAL(i) != NULL)
                continue;
            name = PyTuple_GET_ITEM(co->co_varnames, i);
            if (kwdefs != NULL) {
                PyObject *def = PyDict_GetItemWithError(kwdefs, name);
                if (def) {
                    Py_INCREF(def);
                    SETLOCAL(i, def);
                    continue;
                }
                else if (_PyErr_Occurred(tstate)) {
                    goto fail;
                }
            }
            missing++;
        }
        if (missing) {
            missing_arguments(tstate, co, missing, -1, fastlocals);
            goto fail;
        }
    }

    /* Allocate and initialize storage for cell vars, and copy free
       vars into frame. */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_cellvars); ++i) {
        PyObject *c;
        Py_ssize_t arg;
        /* Possibly account for the cell variable being an argument. */
        if (co->co_cell2arg != NULL &&
            (arg = co->co_cell2arg[i]) != CO_CELL_NOT_AN_ARG) {
            c = PyCell_New(GETLOCAL(arg));
            /* Clear the local copy. */
            SETLOCAL(arg, NULL);
        }
        else {
            c = PyCell_New(NULL);
        }
        if (c == NULL)
            goto fail;
        SETLOCAL(co->co_nlocals + i, c);
    }

    /* Copy closure variables to free variables */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_freevars); ++i) {
        PyObject *o = PyTuple_GET_ITEM(closure, i);
        Py_INCREF(o);
        freevars[PyTuple_GET_SIZE(co->co_cellvars) + i] = o;
    }

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

    retval = PyEval_EvalFrameEx(f,0);

fail: /* Jump here from prelude on failure */

    /* decref'ing the frame can cause __del__ methods to get invoked,
       which can call back into Python.  While we're done with the
       current Python frame (f), the associated C stack is still in use,
       so recursion_depth must be boosted for the duration.
    */
    assert(tstate != NULL);
    if (Py_REFCNT(f) > 1) {
        Py_DECREF(f);
        _PyObject_GC_TRACK(f);
    }
    else {
        ++tstate->recursion_depth;
        Py_DECREF(f);
        --tstate->recursion_depth;
    }
    return retval;
}
```

@@PyFrameObject@@ 为 @@frameobject@@ 对象的实际表示，所有的 @@frameobject@@ 由 *f_back* 指针串为单链表，其它字段有：

* 代码执行环境：内建命名空间字典 *f_builtins*、全局命名空间字典 *f_globals* 和局部命名空间字典 *f_locals*；快速局部变量、闭包变量和值栈空间 *f_localsplus*，直接指向的是快速局部变量和闭包变量空间，后面紧接着的连续空间为值栈。

* 字节码的执行：值栈的栈底指针 *f_valuestack* 与 @@frameobject@@ 临时挂起时的栈顶指针 *f_stacktop*；字节码指令计数器 *f_lasti*、所属源代码行号 *f_lineno*、@@frameobject@@ 的执行状态 *f_executing*。

* 代码块执行管理：正在执行的代码块编号 *f_iblock* 和代码块栈 *f_blockstack*。

* 调试相关：追踪函数 *f_trace*、逐行追踪 *f_trace_lines* 或逐操作码追踪 *f_trace_opcodes* 开关。

* 其它：指回所属生成器对象指针 *f_gen*。

_PyFrame_New_NoTrack() 是 @@CAPI_PyFrame_New@@ 没有 GC 初始化的接口版本，常规执行 @@frameobject@@ 期间，其不会被 GC 管理，以避免被错误回收，执行结束后才交给 GC 管理。

* 为 @@frameobject@@ 对象分配内存具有多种优化机制。一种是从僵尸 @@frameobject@@ 恢复，即在 @@frameobject@@ 执行结束后判断其是否可复用（如 @@frameobject@@ 没有外部引用等条件），若支持复用则将 @@frameobject@@ 对象缓存到其 @@codeobject@@ 的 *co_zombieframe* 字段，那么在重新执行 @@codeobject@@ 时不需要再重新创建新的 @@frameobject@@。另一种是从全局链表 *free_list* 中获取，其是 @@frameobject@@ 对象销毁时由 *f_back* 指针串起来的待销毁对象链表，若 *free_list* 非空则从中获取来避免频繁的 @@frameobject@@ 重复内存分配。但不同 @@codeobject@@ 的 @@frameobject@@ 内存需求可能不一致，因此可能需要内存空间调整。若上述的机制都失效，则按照需求给 @@frameobject@@ 分配内存。

* 除第一个 @@frameobject@@ 外，如同函数调用栈，新 @@frameobject@@ 的创建总是在另一个 @@frameobject@@ 的执行期间进行的，当前线程的 *frame* 字段维持着正在执行的 @@frameobject@@ 对象指针，那么后续 @@frameobject@@ 的 *f_back* 应指向它，而首个 @@frameobject@@ 的 *f_back* 为 *NULL*。

* 一般来说 @@frameobject@@ 会在某个模块中执行，那么由所处模块的 \_\_builtins__ 属性提供内建命名空间。若子 @@frameobject@@ 所处模块与父 @@frameobject@@ 相同（即全局命名空间是同一个），则复用父 @@frameobject@@ 的 *f_builtins* 指针以避免重复的字典查询。若进入到新的模块，则需从全局命名空间中查找该属性进行设置，而如某些情形可能找不到，则创建一个只包含 *None* 的最小内建命名空间。

```c
// Include/frameobject.h#PyFrameObject
typedef struct _frame {
    PyObject_VAR_HEAD
    struct _frame *f_back;      /* previous frame, or NULL */
    PyCodeObject *f_code;       /* code segment */
    PyObject *f_builtins;       /* builtin symbol table (PyDictObject) */
    PyObject *f_globals;        /* global symbol table (PyDictObject) */
    PyObject *f_locals;         /* local symbol table (any mapping) */
    PyObject **f_valuestack;    /* points after the last local */
    /* Next free slot in f_valuestack.  Frame creation sets to f_valuestack.
       Frame evaluation usually NULLs it, but a frame that yields sets it
       to the current stack top. */
    PyObject **f_stacktop;
    PyObject *f_trace;          /* Trace function */
    char f_trace_lines;         /* Emit per-line trace events? */
    char f_trace_opcodes;       /* Emit per-opcode trace events? */

    /* Borrowed reference to a generator, or NULL */
    PyObject *f_gen;

    int f_lasti;                /* Last instruction if called */
    /* Call PyFrame_GetLineNumber() instead of reading this field
       directly.  As of 2.3 f_lineno is only valid when tracing is
       active (i.e. when f_trace is set).  At other times we use
       PyCode_Addr2Line to calculate the line from the current
       bytecode index. */
    int f_lineno;               /* Current line number */
    int f_iblock;               /* index in f_blockstack */
    char f_executing;           /* whether the frame is still executing */
    PyTryBlock f_blockstack[CO_MAXBLOCKS]; /* for try and loop blocks */
    PyObject *f_localsplus[1];  /* locals+stack, dynamically sized */
} PyFrameObject;

// Objects/frameobject.c#_PyFrame_New_NoTrack
PyFrameObject* _Py_HOT_FUNCTION
_PyFrame_New_NoTrack(PyThreadState *tstate, PyCodeObject *code,
                     PyObject *globals, PyObject *locals)
{
    PyFrameObject *back = tstate->frame;
    PyFrameObject *f;
    PyObject *builtins;
    Py_ssize_t i;

#ifdef Py_DEBUG
    if (code == NULL || globals == NULL || !PyDict_Check(globals) ||
        (locals != NULL && !PyMapping_Check(locals))) {
        PyErr_BadInternalCall();
        return NULL;
    }
#endif
    // 第一个 frame 或进入到新模块
    if (back == NULL || back->f_globals != globals) {
        builtins = _PyDict_GetItemIdWithError(globals, &PyId___builtins__);
        if (builtins) {
            if (PyModule_Check(builtins)) {
                builtins = PyModule_GetDict(builtins);
                assert(builtins != NULL);
            }
        }
        if (builtins == NULL) {
            if (PyErr_Occurred()) {
                return NULL;
            }
            /* No builtins! Make up a minimal one
               Give them 'None', at least. */
            builtins = PyDict_New();
            if (builtins == NULL ||
                PyDict_SetItemString(
                    builtins, "None", Py_None) < 0)
                return NULL;
        }
        else
            Py_INCREF(builtins);

    }
    else {
        /* If we share the globals, we share the builtins.
           Save a lookup and a call. */
        builtins = back->f_builtins;
        assert(builtins != NULL);
        Py_INCREF(builtins);
    }
    if (code->co_zombieframe != NULL) {  // TODO
        f = code->co_zombieframe;
        code->co_zombieframe = NULL;
        _Py_NewReference((PyObject *)f);
        assert(f->f_code == code);
    }
    else {
        Py_ssize_t extras, ncells, nfrees;
        ncells = PyTuple_GET_SIZE(code->co_cellvars);  // 存储别人引用的
        nfrees = PyTuple_GET_SIZE(code->co_freevars);  // 存储引用别人的
        extras = code->co_stacksize + code->co_nlocals + ncells +
            nfrees;

        // 创建空 frame 对象
        if (free_list == NULL) {
            f = PyObject_GC_NewVar(PyFrameObject, &PyFrame_Type,
            extras);
            if (f == NULL) {
                Py_DECREF(builtins);
                return NULL;
            }
        }
        else {
            assert(numfree > 0);
            --numfree;
            f = free_list;
            free_list = free_list->f_back;
            if (Py_SIZE(f) < extras) {
                PyFrameObject *new_f = PyObject_GC_Resize(PyFrameObject, f, extras);
                if (new_f == NULL) {
                    PyObject_GC_Del(f);
                    Py_DECREF(builtins);
                    return NULL;
                }
                f = new_f;
            }
            _Py_NewReference((PyObject *)f);
        }

        f->f_code = code;
        extras = code->co_nlocals + ncells + nfrees;
        f->f_valuestack = f->f_localsplus + extras;  // 值栈
        for (i=0; i<extras; i++)
            f->f_localsplus[i] = NULL;
        f->f_locals = NULL;
        f->f_trace = NULL;
    }
    f->f_stacktop = f->f_valuestack;  // 值栈栈顶
    f->f_builtins = builtins;
    Py_XINCREF(back);
    f->f_back = back;
    Py_INCREF(code);
    Py_INCREF(globals);
    f->f_globals = globals;
    /* Most functions have CO_NEWLOCALS and CO_OPTIMIZED set. */
    if ((code->co_flags & (CO_NEWLOCALS | CO_OPTIMIZED)) ==
        (CO_NEWLOCALS | CO_OPTIMIZED))
        ; /* f_locals = NULL; will be set by PyFrame_FastToLocals() */
    else if (code->co_flags & CO_NEWLOCALS) {
        locals = PyDict_New();
        if (locals == NULL) {
            Py_DECREF(f);
            return NULL;
        }
        f->f_locals = locals;
    }
    else {
        if (locals == NULL)
            locals = globals;
        Py_INCREF(locals);
        f->f_locals = locals;
    }

    f->f_lasti = -1;
    f->f_lineno = code->co_firstlineno;
    f->f_iblock = 0;
    f->f_executing = 0;
    f->f_gen = NULL;
    f->f_trace_opcodes = 0;
    f->f_trace_lines = 1;

    return f;
}
```

* @@frameobject@@ 对象的内存分配除基本的 @@PyFrameObject@@ 结构体大小外，还会依据 @@codeobject@@ 的需求顺序分配额外的内存空间。从内存布局来看，在基本 @@frameobject@@ 对象之后的顺序内存中，依次有 *co_nlocals* 长度的局部变量表、`co_cellvars + co_freevars` 长度的闭包变量表和 *co_stacksize* 大小的值栈。*f_localsplus* 直接指向局部变量表，*f_valuestack* 指向值栈的栈底。

| 字段 | 描述 |
| --- | --- |
| PyFrameObject | 基本 @@frameobject@@ 对象 |
| fastlocals    | 局部变量表（由 *f_localsplus* 管理）|
| cellvars      | cell 闭包变量表 |
| freevars      | free 闭包变量表 |
| valuestack    | 值栈（由 *f_stacktop* 和 *f_valuestack* 管理） |

* 正常情况下，每次 @@codeobject@@ 的执行都会创建新的局部命名空间字典（注意区别于局部变量表，其是 @@codeobject@@ 静态分析的局部变量，而局部命名空间为动态局部变量服务），但如构建 `class` 的 @@codeobject@@ 没有 `CO_NEWLOCALS | CO_OPTIMIZED` 标记，则采用参数传递的 *locals*。常规函数的 @@codeobject@@ 具有 `CO_NEWLOCALS | CO_OPTIMIZED` 标记，其局部命名空间字典需要动态维护，即需要将局部变量和闭包变量映射到字典中，如此 `locals()` 才能获取到对应的最新值。注意到，尽管 `locals()` 返回的确实是 @@frameobject@@ 的局部命名空间字典，但是其每次都会调用 @@CAPI_PyFrame_FastToLocals@@ 将 *f_localsplus* 数组的值更新到该字典，导致如 `locals()[fastlocalvar] = xxx` 的修改没有效果。

```c
// Objects/frameobject.c#PyFrame_FastToLocalsWithError
int
PyFrame_FastToLocalsWithError(PyFrameObject *f)
{
    /* Merge fast locals into f->f_locals */
    PyObject *locals, *map;
    PyObject **fast;
    PyCodeObject *co;
    Py_ssize_t j;
    Py_ssize_t ncells, nfreevars;

    if (f == NULL) {
        PyErr_BadInternalCall();
        return -1;
    }
    locals = f->f_locals;
    if (locals == NULL) {
        locals = f->f_locals = PyDict_New();
        if (locals == NULL)
            return -1;
    }
    co = f->f_code;
    map = co->co_varnames;
    if (!PyTuple_Check(map)) {
        PyErr_Format(PyExc_SystemError,
                     "co_varnames must be a tuple, not %s",
                     Py_TYPE(map)->tp_name);
        return -1;
    }
    fast = f->f_localsplus;
    j = PyTuple_GET_SIZE(map);
    if (j > co->co_nlocals)
        j = co->co_nlocals;
    if (co->co_nlocals) {
        if (map_to_dict(map, j, locals, fast, 0) < 0)
            return -1;
    }
    ncells = PyTuple_GET_SIZE(co->co_cellvars);
    nfreevars = PyTuple_GET_SIZE(co->co_freevars);
    if (ncells || nfreevars) {
        if (map_to_dict(co->co_cellvars, ncells,
                        locals, fast + co->co_nlocals, 1))
            return -1;

        /* If the namespace is unoptimized, then one of the
           following cases applies:
           1. It does not contain free variables, because it
              uses import * or is a top-level namespace.
           2. It is a class namespace.
           We don't want to accidentally copy free variables
           into the locals dict used by the class.
        */
        if (co->co_flags & CO_OPTIMIZED) {
            if (map_to_dict(co->co_freevars, nfreevars,
                            locals, fast + co->co_nlocals + ncells, 1) < 0)
                return -1;
        }
    }
    return 0;
}
```

@@frameobject@@ 对象创建完成后，_PyEval_EvalCodeWithName() 的另一个主要工作是将调用参数解析到 @@frameobject@@ 的 *f_localsplus* 数组中，这是因为如函数声明的参数是显示定义的局部变量，可通过静态分析得到，如 @@codeobject@@ 具有 @@CO_OPTIMIZED@@ 标记，则将这些局部变量映射到快速局部变量表，同时配套 @@LOAD-STORE_FAST@@ 字节码访问它们，以避免如 @@LOAD-STORE_NAME@@ 字节码频繁的局部变量字典查询。

* 如 @@codeobject@@ 具有 @@CO_VARKEYWORDS@@ 标记，表明具有如 `**kwargs` 参数，则创建一个空字典对象设置到局部变量表的最后。注意到，如同时具有 @@CO_VARARGS@@ 标记，表明有变长位置参数 `*args`，其对象会置于局部变量表的倒数第二个位置。

```c
// Python/ceval.c#GETLOCAL
#define GETLOCAL(i)     (fastlocals[i])

// Python/ceval.c#SETLOCAL
#define SETLOCAL(i, value)      do { PyObject *tmp = GETLOCAL(i); \
                                     GETLOCAL(i) = value; \
                                     Py_XDECREF(tmp); } while (0)

// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(...) 
{
    const Py_ssize_t total_args = co->co_argcount + co->co_kwonlyargcount;
    fastlocals = f->f_localsplus;
    
    /* Create a dictionary for keyword parameters (**kwags) */
    if (co->co_flags & CO_VARKEYWORDS) {
        kwdict = PyDict_New();
        if (kwdict == NULL)
            goto fail;
        i = total_args;
        if (co->co_flags & CO_VARARGS) {
            i++;
        }
        SETLOCAL(i, kwdict);  // fastlocals[total_args] = kwdict
    }
    else {
        kwdict = NULL;
    }
}
```

* 若实际传递的位置参数数量 *argcount* 大于 @@codeobject@@ 记录的可通过位置传递参数的数量 *co_argcount*，则从 *co_argcount* 截断，将局部变量表的前 *co_argcount* 位置依次设置为传递的参数值，其余位置参数交由 `*args` 元组接收，而若没有 `*args` 参数则抛出异常（注意实际过程中 *unexpected keyword argument* 异常先于 *takes n positional arguments but k* 异常，这里前置仅为了简化说明）。反之若位置参数不足 *co_argcount*，则先处理已传递的位置参数，其余的值从关键字参数（普通参数允许位置和关键字传参）或默认参数中寻找。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(..., 
    PyObject *const *args, Py_ssize_t argcount, ...) 
{
    const Py_ssize_t total_args = co->co_argcount + co->co_kwonlyargcount;
    fastlocals = f->f_localsplus;
    
    /* Copy all positional arguments into local variables */
    if (argcount > co->co_argcount) {
        n = co->co_argcount;  // 其余位置参数由 *args 接收
    }
    else {
        n = argcount;
    }
    for (j = 0; j < n; j++) {  // 设置 p-only 或 p-or-kw 参数
        x = args[j];
        Py_INCREF(x);
        SETLOCAL(j, x);
    }

    /* Pack other positional arguments into the *args argument */
    if (co->co_flags & CO_VARARGS) {  
        // 剩余的为 *args，若位置参数不多余，则 *args 为 ()
        u = _PyTuple_FromArray(args + n, argcount - n);
        if (u == NULL) {
            goto fail;
        }
        SETLOCAL(total_args, u);  // locals[n] = *args
    }

    /* Check the number of positional arguments */
    if ((argcount > co->co_argcount) && !(co->co_flags & CO_VARARGS)) {
        too_many_positional(tstate, co, argcount, defcount, fastlocals);
        goto fail;
    }
}
```

* 普通参数有可能通过关键字传参方式进行设置，而关键字参数则必须通过关键字传参，即局部变量表 *co_posonlyargcount* 后的参数都可能采用关键字传参。那么只需在传递的关键字参数中依次查找存在于 `co_varnames[co_posonlyargcount:]` 中的变量，若匹配成功则设置到局部变量表的对应位置，匹配失败则设置到 `**kwargs` 字典中，而若没有 `**kwargs` 参数则抛出异常。注意到，变量名称匹配先按指针匹配，若匹配不到再走富匹配，这是因为一般情况下字符串对象是单例实现的。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(..., 
    PyObject *const *kwnames, PyObject *const *kwargs,
    Py_ssize_t kwcount, int kwstep, ...) 
{
    const Py_ssize_t total_args = co->co_argcount + co->co_kwonlyargcount;
    fastlocals = f->f_localsplus;
    
    /* Handle keyword arguments passed as two strided arrays */
    kwcount *= kwstep;
    for (i = 0; i < kwcount; i += kwstep) {
        PyObject **co_varnames;
        PyObject *keyword = kwnames[i];
        PyObject *value = kwargs[i];
        Py_ssize_t j;

        if (keyword == NULL || !PyUnicode_Check(keyword)) {
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() keywords must be strings",
                          co->co_name);
            goto fail;
        }

        /* Speed hack: do raw pointer compares. As names are
           normally interned this should almost always hit. */
        co_varnames = ((PyTupleObject *)(co->co_varnames))->ob_item;
        // 从 co_posonlyargcount 之后查找 co_varnames，找不到则可能作为关键字参数传递
        for (j = co->co_posonlyargcount; j < total_args; j++) {
            PyObject *name = co_varnames[j];
            if (name == keyword) {
                goto kw_found;
            }
        }

        /* Slow fallback, just in case */
        for (j = co->co_posonlyargcount; j < total_args; j++) {
            PyObject *name = co_varnames[j];
            int cmp = PyObject_RichCompareBool(keyword, name, Py_EQ);
            if (cmp > 0) {
                goto kw_found;
            }
            else if (cmp < 0) {
                goto fail;
            }
        }

        // 找不到匹配的 keyword 参数
        assert(j >= total_args);
        if (kwdict == NULL) {
            // 检查是否将位置参数作为关键字参数传递
            if (co->co_posonlyargcount
                && positional_only_passed_as_keyword(tstate, co,
                                                     kwcount, kwnames))
            {
                goto fail;
            }
            
            // 没定义 **kwargs 则无法接收 co_varnames 外的参数
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() got an unexpected keyword argument '%S'",
                          co->co_name, keyword);
            goto fail;
        }

        // 由 **kwargs 接收 co_varnames 定义外的关键字参数
        if (PyDict_SetItem(kwdict, keyword, value) == -1) {
            goto fail;
        }
        continue;

      kw_found:
        if (GETLOCAL(j) != NULL) {  
            // 普通参数已经通过位置传参，又通过关键字重复传参
            _PyErr_Format(tstate, PyExc_TypeError,
                          "%U() got multiple values for argument '%S'",
                          co->co_name, keyword);
            goto fail;
        }
        Py_INCREF(value);
        SETLOCAL(j, value);
    }
}
```

* 若位置参数没有显式传递，则可能采用默认参数。对于位置参数和普通参数，其默认参数统一存储到 *defcount* 列表中，该列表长度应小于等于 *co_argcount*，差值的前半部分则为表明没有设置默认参数，若其仍没有值则抛出参数传递不足异常，否则将默认值设置到后半部分没有显式传递值的参数中。类似的，若 @@codeobject@@ 具有关键字参数，且存在空值，则尝试从关键字默认参数字典 *kwdefs* 中查找，若找不到则抛出异常。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(..., 
    PyObject *const *args, Py_ssize_t argcount,
    PyObject *const *defs, Py_ssize_t defcount, 
    PyObject *kwdefs, ...) 
{
    const Py_ssize_t total_args = co->co_argcount + co->co_kwonlyargcount;
    fastlocals = f->f_localsplus;
    
    /* Add missing positional arguments (copy default values from defs) */
    if (argcount < co->co_argcount) {
        // 检查位置参数是否有值，对于普通参数若采用的是关键字传参也能看到
        Py_ssize_t m = co->co_argcount - defcount;
        Py_ssize_t missing = 0;
        for (i = argcount; i < m; i++) {
            if (GETLOCAL(i) == NULL) {
                missing++;
            }
        }
        if (missing) {
            // 位置参数/普通参数缺失参数，抛出异常
            missing_arguments(tstate, co, missing, defcount, fastlocals);
            goto fail;
        }
        if (n > m)
            i = n - m;
        else
            i = 0;  // 没有传参，都使用默认值
        for (; i < defcount; i++) {
            if (GETLOCAL(m+i) == NULL) {
                PyObject *def = defs[i];
                Py_INCREF(def);
                SETLOCAL(m+i, def);
            }
        }
    }

    /* Add missing keyword arguments (copy default values from kwdefs) */
    if (co->co_kwonlyargcount > 0) {
        Py_ssize_t missing = 0;
        for (i = co->co_argcount; i < total_args; i++) {
            PyObject *name;
            if (GETLOCAL(i) != NULL)
                continue;
            name = PyTuple_GET_ITEM(co->co_varnames, i);
            if (kwdefs != NULL) {
                PyObject *def = PyDict_GetItemWithError(kwdefs, name);
                if (def) {
                    Py_INCREF(def);
                    SETLOCAL(i, def);
                    continue;
                }
                else if (_PyErr_Occurred(tstate)) {
                    goto fail;
                }
            }
            missing++;
        }
        if (missing) {
            missing_arguments(tstate, co, missing, -1, fastlocals);
            goto fail;
        }
    }
}
```

* 闭包变量具有 cell 变量和 free 变量两种，其存放在局部变量表之后。对于 cell 变量，其是被嵌套函数访问的变量，其可能是顶层函数的参数或是普通局部变量，若是参数，则通过 *co_cell2arg* 映射表在局部变量表找到其值，并创建 @@PyCellObject@@ 对象包裹该值，然后将局部变量表中的值置为 *NULL* 以规避修改同步问题；而若是普通局部变量，则创建空 @@PyCellObject@@ 即可，其局部变量表的对应值本身就是 *NULL*。对于 free 变量，其是当前函数访问顶层函数的变量，由 *closure* 参数传递进来，只需将对于位置的 @@PyCellObject@@ 读出设置到闭包变量表的相应位置即可。闭包变量的访问由 @@LOAD-STORE_DEREF@@ 字节码提供支持，即读取或修改 @@PyCellObject@@ 管理的值实现函数间变量的互相同步。注意到，闭包变量是静态分析阶段产生的，而运行时不需要区分是否为闭包变量，因为只要拿到相应对象指针即可自主控制。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(..., PyObject *closure, ...) 
{
    fastlocals = f->f_localsplus;

    /* Allocate and initialize storage for cell vars, and copy free
       vars into frame. */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_cellvars); ++i) {
        PyObject *c;
        Py_ssize_t arg;
        /* Possibly account for the cell variable being an argument. */
        if (co->co_cell2arg != NULL &&
            (arg = co->co_cell2arg[i]) != CO_CELL_NOT_AN_ARG) {
            c = PyCell_New(GETLOCAL(arg));
            /* Clear the local copy. */
            SETLOCAL(arg, NULL);
        }
        else {
            c = PyCell_New(NULL);
        }
        if (c == NULL)
            goto fail;
        SETLOCAL(co->co_nlocals + i, c);
    }

    /* Copy closure variables to free variables */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_freevars); ++i) {
        PyObject *o = PyTuple_GET_ITEM(closure, i);
        Py_INCREF(o);
        freevars[PyTuple_GET_SIZE(co->co_cellvars) + i] = o;
    }
}
```

@@frameobject@@ 的准备工作结束后即可执行，但函数体可能是生成器或协程，这类函数通常不会立即执行，而是返回一个包装对象，在后续运行时阶段性执行。而对于普通函数对象，则由 @@CAPI_PyEval_EvalCodeEx@@ 接口直接执行所创建的 @@frameobject@@。执行结束后，若 @@frameobject@@ 的引用数大于 *1* 则表明具有用户变量引用到当前 @@frameobject@@ 对象，则将其交予 GC 管理。否则调用 `Py_DECREF(f)` 销毁 @@frameobject@@，其对 \_\_del__() 的调用可能触发再次进入 Python 代码的解释执行形成隐式递归，因此需要在其前后管理栈深 *recursion_depth* 以允许触发 RecursionError。

```c
// Python/ceval.c#_PyEval_EvalCodeWithName
PyObject *
_PyEval_EvalCodeWithName(..., 
    PyObject *name, PyObject *qualname) 
{
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

    retval = PyEval_EvalFrameEx(f,0);

fail: /* Jump here from prelude on failure */

    /* decref'ing the frame can cause __del__ methods to get invoked,
       which can call back into Python.  While we're done with the
       current Python frame (f), the associated C stack is still in use,
       so recursion_depth must be boosted for the duration.
    */
    assert(tstate != NULL);
    if (Py_REFCNT(f) > 1) {
        Py_DECREF(f);
        _PyObject_GC_TRACK(f);
    }
    else {
        ++tstate->recursion_depth;
        Py_DECREF(f);
        --tstate->recursion_depth;
    }
    return retval;
}
```

在初始化期间，解释器状态 @@PyInterpreterState@@ 的 *eval_frame* 字段默认初始化为 _PyEval_EvalFrameDefault()。考虑到该函数的实现较为复杂，采用分块对其进行分析，且忽视部分调试相关的代码实现。首先关心字节码的译码与执行，若 @@frameobject@@ 的 *f_lasti* 为 *-1* 表明从头开始执行字节码，即从 *co_code* 读取字节码，否则从 *f_lasti* 位置开始执行。字节码由 *16* 位的字构成，前 *8* 位表示操作码，后 *8* 位表示操作数，由 `NEXTOPARG()` 宏解析并自动累加 *next_instr* 指令计数器。取出当前字节码的操作码 *opcode* 和操作数 *oparg* 后，经由 switch 跳转到不同的操作码分支进行执行，执行结束后继续循环读取并执行下一条字节码直至如 @@RETURN_VALUE@@ 字节码退出或异常退出。

```c
// Python/ceval.c#PyEval_EvalFrameEx
PyObject *
PyEval_EvalFrameEx(PyFrameObject *f, int throwflag)
{
    PyInterpreterState *interp = _PyInterpreterState_GET_UNSAFE();
    return interp->eval_frame(f, throwflag);  // _PyEval_EvalFrameDefault
}

// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    PyObject **stack_pointer;  /* Next free slot in value stack */
    const _Py_CODEUNIT *next_instr;
    int opcode;        /* Current opcode */
    int oparg;         /* Current opcode argument, if any */
    PyObject **fastlocals, **freevars;
    PyObject *retval = NULL;            /* Return value */
    _PyRuntimeState * const runtime = &_PyRuntime;
    PyThreadState * const tstate = _PyRuntimeState_GetThreadState(runtime);
    struct _ceval_runtime_state * const ceval = &runtime->ceval;
    _Py_atomic_int * const eval_breaker = &ceval->eval_breaker;
    PyCodeObject *co;

    const _Py_CODEUNIT *first_instr;
    PyObject *names;
    PyObject *consts;
    _PyOpcache *co_opcache;

/* Code access macros */

/* The integer overflow is checked by an assertion below. */
#define INSTR_OFFSET()  \
    (sizeof(_Py_CODEUNIT) * (int)(next_instr - first_instr))
#define NEXTOPARG()  do { \
        _Py_CODEUNIT word = *next_instr; \
        opcode = _Py_OPCODE(word);  /* 前 8 位是操作码 */ \  
        oparg = _Py_OPARG(word);  /* 后 8 位是操作数 */ \
        next_instr++; \
    } while (0)
// 绝对跳转到指定的字节码位置
#define JUMPTO(x)       (next_instr = first_instr + (x) / sizeof(_Py_CODEUNIT))
// 相对跳转到指定的字节码位置
#define JUMPBY(x)       (next_instr += (x) / sizeof(_Py_CODEUNIT))

/* 其余宏定义 */

/* Start of code */

    /* push frame */
    if (Py_EnterRecursiveCall(""))
        return NULL;

    tstate->frame = f;

    co = f->f_code;
    names = co->co_names;
    consts = co->co_consts;
    fastlocals = f->f_localsplus;
    freevars = f->f_localsplus + co->co_nlocals;
    assert(PyBytes_Check(co->co_code));
    assert(PyBytes_GET_SIZE(co->co_code) <= INT_MAX);
    assert(PyBytes_GET_SIZE(co->co_code) % sizeof(_Py_CODEUNIT) == 0);
    assert(_Py_IS_ALIGNED(PyBytes_AS_STRING(co->co_code), sizeof(_Py_CODEUNIT)));
    first_instr = (_Py_CODEUNIT *) PyBytes_AS_STRING(co->co_code);

    /*
       f->f_lasti refers to the index of the last instruction,
       unless it's -1 in which case next_instr should be first_instr.

       YIELD_FROM sets f_lasti to itself, in order to repeatedly yield
       multiple values.

       When the PREDICT() macros are enabled, some opcode pairs follow in
       direct succession without updating f->f_lasti.  A successful
       prediction effectively links the two codes together as if they
       were a single new opcode; accordingly,f->f_lasti will point to
       the first code in the pair (for instance, GET_ITER followed by
       FOR_ITER is effectively a single opcode and f->f_lasti will point
       to the beginning of the combined pair.)
    */
    assert(f->f_lasti >= -1);
    next_instr = first_instr;
    if (f->f_lasti >= 0) {
        assert(f->f_lasti % sizeof(_Py_CODEUNIT) == 0);
        next_instr += f->f_lasti / sizeof(_Py_CODEUNIT) + 1;
    }
    stack_pointer = f->f_stacktop;
    assert(stack_pointer != NULL);
    f->f_stacktop = NULL;       /* remains NULL unless yield suspends frame */
    f->f_executing = 1;

    if (throwflag) /* support for generator.throw() */
        goto error;

main_loop:
    for (;;) {
        assert(stack_pointer >= f->f_valuestack); /* else underflow */
        assert(STACK_LEVEL() <= co->co_stacksize);  /* else overflow */
        assert(!_PyErr_Occurred(tstate));

        /* 事件、信号检查和处理逻辑 */

    fast_next_opcode:
        f->f_lasti = INSTR_OFFSET();

        /* tracing 相关逻辑 */

        /* Extract opcode and argument */

        NEXTOPARG();

        switch (opcode) {

        /* BEWARE!
           It is essential that any operation that fails must goto error
           and that all operation that succeed call [FAST_]DISPATCH() ! */

        case TARGET(NOP): {
            FAST_DISPATCH();
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

        case TARGET(RETURN_VALUE): {
            retval = POP();
            assert(f->f_iblock == 0);
            goto exit_returning;
        }

        /* 其余字节码逻辑 */

#if USE_COMPUTED_GOTOS
        _unknown_opcode:
#endif
        default:
            fprintf(stderr,
                "XXX lineno: %d, opcode: %d\n",
                PyFrame_GetLineNumber(f),
                opcode);
            _PyErr_SetString(tstate, PyExc_SystemError, "unknown opcode");
            goto error;

        } /* switch */

        /* This should never be reached. Every opcode should end with DISPATCH()
           or goto error. */
        Py_UNREACHABLE();

error:
        /* 其余错误处理逻辑 */

        /* End the loop as we still have an error */
        break;
    } /* main loop */

    assert(retval == NULL);
    assert(_PyErr_Occurred(tstate));

exit_returning:

    /* Pop remaining stack entries. */
    while (!EMPTY()) {
        PyObject *o = POP();
        Py_XDECREF(o);
    }

/* 其余返回处理逻辑 */

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

普通 switch 语句一般会优化为统一的分支表 *branches* 和固定的跳转语句 `jmp branches[opcode]` 进行跳转，那么在 CPU 看来，所有的分支之间几乎是没有区别的。然而对于字节码的执行，可观察到如比较字节码 @@COMPARE_OP@@ 之后通常为如 @@POP_JUMP_IF_FALSE@@ 的条件跳转字节码。现代 CPU 通常会预测将来可能执行指令来提前执行，若预测失败则重新读取正确的指令来执行。未经优化的 switch 语句在执行期间，CPU 预测器看到的是 `jmp` 每次都会跳转到不同的地方执行，然后又回到相同的 `jmp` 处跳转。对于某分支的字节码来说，预测其下一个字节码 `P(opcode)` 几乎服从均匀分布，即 CPU 几乎不可能正确预测下一个字节码。为打破这一窘境，采取避免 switch 分支编译后优化为统一的指令跳转来解决。具体来说，将 `case op` 拓展为 `case op: TARGET_##op:`，配合各字节码实现中最后 `[FAST_]DISPATCH()` 宏展开的 `goto *opcode_targets[opcode]` 语句显式地跳转到下一条字节码执行。对于 CPU 预测器，其在运行时动态学习 `P(next_opcode|opcode)` 以提高预测的准确率。同时，由于各字节码最后都是相同的代码，编译器可能会对其优化，因此需要在编译期间设置如 `-fno-gcse` 参数来避免。

然而，并非所有情况都会开启快路径，如需要做字节码执行统计时，则回退到普通的 switch 分支跳转以避免统计低估问题。另外，也并非所有的字节码后面都能走快路径，还需要做如信号检查和处理等工作。一般来说，只有简单的字节码，如栈操作、跳转等可接 `FAST_DISPATCH()` 宏走快路径来立即执行下一条字节码。而对于如结果计算、需要及时相应的字节码则接 `DISPATCH()` 宏，其会在下一条字节码执行前检查如信号请求、GIL 请求等确保及时响应，而如没有请求处理则又回退到快路径。总之，其是执行速度与用户响应之间的权衡，如较短的 `for` 循环可优化为快路径，而耗时的则退回到正常路径。

```c
// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{ 
/* Computed GOTOs, or
       the-optimization-commonly-but-improperly-known-as-"threaded code"
   using gcc's labels-as-values extension
   (http://gcc.gnu.org/onlinedocs/gcc/Labels-as-Values.html).

   The traditional bytecode evaluation loop uses a "switch" statement, which
   decent compilers will optimize as a single indirect branch instruction
   combined with a lookup table of jump addresses. However, since the
   indirect jump instruction is shared by all opcodes, the CPU will have a
   hard time making the right prediction for where to jump next (actually,
   it will be always wrong except in the uncommon case of a sequence of
   several identical opcodes).

   "Threaded code" in contrast, uses an explicit jump table and an explicit
   indirect jump instruction at the end of each opcode. Since the jump
   instruction is at a different address for each opcode, the CPU will make a
   separate prediction for each of these instructions, which is equivalent to
   predicting the second opcode of each opcode pair. These predictions have
   a much better chance to turn out valid, especially in small bytecode loops.

   A mispredicted branch on a modern CPU flushes the whole pipeline and
   can cost several CPU cycles (depending on the pipeline depth),
   and potentially many more instructions (depending on the pipeline width).
   A correctly predicted branch, however, is nearly free.

   At the time of this writing, the "threaded code" version is up to 15-20%
   faster than the normal "switch" version, depending on the compiler and the
   CPU architecture.

   We disable the optimization if DYNAMIC_EXECUTION_PROFILE is defined,
   because it would render the measurements invalid.

   NOTE: care must be taken that the compiler doesn't try to "optimize" the
   indirect jumps by sharing them between all opcodes. Such optimizations
   can be disabled on gcc by using the -fno-gcse flag (or possibly
   -fno-crossjumping).
*/

#ifdef DYNAMIC_EXECUTION_PROFILE
#undef USE_COMPUTED_GOTOS
#define USE_COMPUTED_GOTOS 0
#endif

#ifdef HAVE_COMPUTED_GOTOS
    #ifndef USE_COMPUTED_GOTOS
    #define USE_COMPUTED_GOTOS 1
    #endif
#else
    #if defined(USE_COMPUTED_GOTOS) && USE_COMPUTED_GOTOS
    #error "Computed gotos are not supported on this compiler."
    #endif
    #undef USE_COMPUTED_GOTOS
    #define USE_COMPUTED_GOTOS 0
#endif

#if USE_COMPUTED_GOTOS
/* Import the static jump table */
#include "opcode_targets.h"

#define TARGET(op) \
    op: \
    TARGET_##op  /* Computed goto target */

#ifdef LLTRACE
#define FAST_DISPATCH() \
    { \
        if (!lltrace && !_Py_TracingPossible(ceval) && !PyDTrace_LINE_ENABLED()) { \
            f->f_lasti = INSTR_OFFSET(); \
            NEXTOPARG(); \
            goto *opcode_targets[opcode]; \
        } \
        goto fast_next_opcode; \
    }
#else
#define FAST_DISPATCH() \
    { \
        if (!_Py_TracingPossible(ceval) && !PyDTrace_LINE_ENABLED()) { \
            f->f_lasti = INSTR_OFFSET(); \
            NEXTOPARG(); \
            goto *opcode_targets[opcode]; \
        } \
        goto fast_next_opcode; \
    }
#endif

#define DISPATCH() \
    { \
        if (!_Py_atomic_load_relaxed(eval_breaker)) { \
            FAST_DISPATCH(); \
        } \
        continue; \
    }

#else
#define TARGET(op) op
#define FAST_DISPATCH() goto fast_next_opcode
#define DISPATCH() continue
#endif
}

// Python/opcode_targets.h#opcode_targets
static void *opcode_targets[256] = {
    &&_unknown_opcode,
    &&TARGET_POP_TOP,
    &&TARGET_ROT_TWO,
    &&TARGET_ROT_THREE,
    &&TARGET_DUP_TOP,
    &&TARGET_DUP_TOP_TWO,
    ...
}
```

早期还使用了另一类种技术手动优化字节码的执行，即定义 `PREDICTED(opcode)` 和 `PREDICT(opcode)` 对，前者定义在待跳转字节码实现的开始，后者定义在欲跳转字节码实现的最后。若 `PREDICT(opcode)` 能与下一条执行的字节码匹配，则直接 `goto` 到 `PREDICTED(opcode)` 的位置形成一种快路径，在 @@COMPARE_OP@@ 和 @@POP_JUMP_IF_FALSE@@ 字节码的例子中可以说明这一点。由于 Computed GOTOs 技术的实现，这种方案可以完全可以被 CPU 预测，因此在开启 *USE_COMPUTED_GOTOS* 时则不会再启用类似优化。

```c
// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
/* OpCode prediction macros
    Some opcodes tend to come in pairs thus making it possible to
    predict the second code when the first is run.  For example,
    COMPARE_OP is often followed by POP_JUMP_IF_FALSE or POP_JUMP_IF_TRUE.

    Verifying the prediction costs a single high-speed test of a register
    variable against a constant.  If the pairing was good, then the
    processor's own internal branch predication has a high likelihood of
    success, resulting in a nearly zero-overhead transition to the
    next opcode.  A successful prediction saves a trip through the eval-loop
    including its unpredictable switch-case branch.  Combined with the
    processor's internal branch prediction, a successful PREDICT has the
    effect of making the two opcodes run as if they were a single new opcode
    with the bodies combined.

    If collecting opcode statistics, your choices are to either keep the
    predictions turned-on and interpret the results as if some opcodes
    had been combined or turn-off predictions so that the opcode frequency
    counter updates for both opcodes.

    Opcode prediction is disabled with threaded code, since the latter allows
    the CPU to record separate branch prediction information for each
    opcode. 
*/

#if defined(DYNAMIC_EXECUTION_PROFILE) || USE_COMPUTED_GOTOS
#define PREDICT(op)             if (0) goto PRED_##op
#else
#define PREDICT(op) \
    do{ \
        _Py_CODEUNIT word = *next_instr; \
        opcode = _Py_OPCODE(word); \
        if (opcode == op){ \
            oparg = _Py_OPARG(word); \
            next_instr++; \
            goto PRED_##op; \
        } \
    } while(0)
#endif
#define PREDICTED(op)           PRED_##op:

main_loop:
    for (;;) {
        switch (opcode) {
            case TARGET(COMPARE_OP): {
                PyObject *right = POP();
                PyObject *left = TOP();
                PyObject *res = cmp_outcome(tstate, oparg, left, right);
                Py_DECREF(left);
                Py_DECREF(right);
                SET_TOP(res);
                if (res == NULL)
                    goto error;
                PREDICT(POP_JUMP_IF_FALSE);
                PREDICT(POP_JUMP_IF_TRUE);
                DISPATCH();
            }

            case TARGET(POP_JUMP_IF_FALSE): {
                PREDICTED(POP_JUMP_IF_FALSE);
                PyObject *cond = POP();
                int err;
                if (cond == Py_True) {
                    Py_DECREF(cond);
                    FAST_DISPATCH();
                }
                if (cond == Py_False) {
                    Py_DECREF(cond);
                    JUMPTO(oparg);
                    FAST_DISPATCH();
                }
                err = PyObject_IsTrue(cond);
                Py_DECREF(cond);
                if (err > 0)
                    ;
                else if (err == 0)
                    JUMPTO(oparg);
                else
                    goto error;
                DISPATCH();
            }
        }
    }
}
```

还有一类宏用在字节码执行期间对数据的访问，如元组元素访问、值栈的操作和局部变量的访问。注意到，`SETLOCAL()` 在设置局部变量的时候，需要对原对象减引用，其做法必须是先将旧值读出，写入新值，然后再减引用旧值，这么做的目的是避免减引用时触发 \_\_del__，而若其它线程又访问了当前 @@frameobject@@ 的局部变量，就会访问到已经释放的内存。

```c
// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    PyObject **stack_pointer;  /* Next free slot in value stack */
    PyObject **fastlocals, **freevars;
    PyObject *names;
    PyObject *consts;

/* Tuple access macros */

#ifndef Py_DEBUG
#define GETITEM(v, i) PyTuple_GET_ITEM((PyTupleObject *)(v), (i))
#else
#define GETITEM(v, i) PyTuple_GetItem((v), (i))
#endif

/* Stack manipulation macros */

/* The stack can grow at most MAXINT deep, as co_nlocals and
   co_stacksize are ints. */
#define STACK_LEVEL()     ((int)(stack_pointer - f->f_valuestack))
#define EMPTY()           (STACK_LEVEL() == 0)
#define TOP()             (stack_pointer[-1])
#define SECOND()          (stack_pointer[-2])
#define THIRD()           (stack_pointer[-3])
#define FOURTH()          (stack_pointer[-4])
#define PEEK(n)           (stack_pointer[-(n)])
#define SET_TOP(v)        (stack_pointer[-1] = (v))
#define SET_SECOND(v)     (stack_pointer[-2] = (v))
#define SET_THIRD(v)      (stack_pointer[-3] = (v))
#define SET_FOURTH(v)     (stack_pointer[-4] = (v))
#define SET_VALUE(n, v)   (stack_pointer[-(n)] = (v))
#define BASIC_STACKADJ(n) (stack_pointer += n)
#define BASIC_PUSH(v)     (*stack_pointer++ = (v))
#define BASIC_POP()       (*--stack_pointer)

#ifdef LLTRACE
#define PUSH(v)         { (void)(BASIC_PUSH(v), \
                          lltrace && prtrace(tstate, TOP(), "push")); \
                          assert(STACK_LEVEL() <= co->co_stacksize); }
#define POP()           ((void)(lltrace && prtrace(tstate, TOP(), "pop")), \
                         BASIC_POP())
#define STACK_GROW(n)   do { \
                          assert(n >= 0); \
                          (void)(BASIC_STACKADJ(n), \
                          lltrace && prtrace(tstate, TOP(), "stackadj")); \
                          assert(STACK_LEVEL() <= co->co_stacksize); \
                        } while (0)
#define STACK_SHRINK(n) do { \
                            assert(n >= 0); \
                            (void)(lltrace && prtrace(tstate, TOP(), "stackadj")); \
                            (void)(BASIC_STACKADJ(-n)); \
                            assert(STACK_LEVEL() <= co->co_stacksize); \
                        } while (0)
#define EXT_POP(STACK_POINTER) ((void)(lltrace && \
                                prtrace(tstate, (STACK_POINTER)[-1], "ext_pop")), \
                                *--(STACK_POINTER))
#else
#define PUSH(v)                BASIC_PUSH(v)
#define POP()                  BASIC_POP()
#define STACK_GROW(n)          BASIC_STACKADJ(n)
#define STACK_SHRINK(n)        BASIC_STACKADJ(-n)
#define EXT_POP(STACK_POINTER) (*--(STACK_POINTER))
#endif

/* Local variable macros */

#define GETLOCAL(i)     (fastlocals[i])

/* The SETLOCAL() macro must not DECREF the local variable in-place and
   then store the new value; it must copy the old value to a temporary
   value, then store the new value, and then DECREF the temporary value.
   This is because it is possible that during the DECREF the frame is
   accessed by other code (e.g. a __del__ method or gc.collect()) and the
   variable would be pointing to already-freed memory. */
#define SETLOCAL(i, value)      do { PyObject *tmp = GETLOCAL(i); \
                                     GETLOCAL(i) = value; \
                                     Py_XDECREF(tmp); } while (0)
}
```

考虑到部分字节码的执行结果多为查询结果，即很少发生改变，在 @@codeobject@@ 被多次执行时，可优化这类查询，其中较为典型的是 @@LOAD_GLOBAL@@。启用这类优化的条件是多次执行，触发的条件是同一个 @@codeobject@@ 至少被执行 *OPCACHE_MIN_RUNS* 次才由 _PyCode_InitOpcache() 初始化相关缓存。

* 缓存的设计由 @@codeobject@@ 的 *co_opcache_map* 和 *co_opcache* 字段共同完成，其中 *co_opcache_map* 是字节码行数到缓存表下标的映射，使用字节码行数作为键是因为不同位置的相同字节码结果可能不同，值使用二级索引是为了降低缓存的开销，即不是满分配字节码行数长的缓存表，而是依据缓存需求分配，那么 *co_opcache* 即作为 _PyOpcache 类型缓存表。

* 如 @@LOAD_GLOBAL@@ 字节码的实现中，会先通过 `OPCACHE_CHECK()` 宏检查是否具有缓存，若有则读取到 *co_opcache* 变量。然后 @@LOAD_GLOBAL@@ 判断缓存是否有效，即 @@LOAD_GLOBAL@@ 一般会从内建命名空间字典或全局命名空间字典中查询结果，若这两个字典没有发生过改变，则表明缓存有效。否则就正常回退到查询路径，并检查是否允许缓存和设置缓存。

```c
/* per opcode cache */
#ifdef Py_DEBUG
// --with-pydebug is used to find memory leak.  opcache makes it harder.
// So we disable opcache when Py_DEBUG is defined.
// See bpo-37146
#define OPCACHE_MIN_RUNS 0  /* disable opcache */
#else
#define OPCACHE_MIN_RUNS 1024  /* create opcache when code executed this time */
#endif
#define OPCACHE_STATS 0  /* Enable stats */

#if OPCACHE_STATS
static size_t opcache_code_objects = 0;
static size_t opcache_code_objects_extra_mem = 0;

static size_t opcache_global_opts = 0;
static size_t opcache_global_hits = 0;
static size_t opcache_global_misses = 0;
#endif

// Include/internal/pycore_code.h#_PyOpcache_LoadGlobal
typedef struct {
    PyObject *ptr;  /* Cached pointer (borrowed reference) */
    uint64_t globals_ver;  /* ma_version of global dict */
    uint64_t builtins_ver; /* ma_version of builtin dict */
} _PyOpcache_LoadGlobal;

// Include/internal/pycore_code.h#_PyOpcache
struct _PyOpcache {
    union {
        _PyOpcache_LoadGlobal lg;
    } u;
    char optimized;
};

// Python/ceval.c#_PyOpcache
typedef struct _PyOpcache _PyOpcache;

// Python/ceval.c#_PyEval_EvalFrameDefault
PyObject* _Py_HOT_FUNCTION
_PyEval_EvalFrameDefault(PyFrameObject *f, int throwflag)
{
    _PyOpcache *co_opcache;

/* macros for opcode cache */

#define OPCACHE_CHECK() \
    do { \
        co_opcache = NULL; \
        if (co->co_opcache != NULL) { \
            unsigned char co_opt_offset = \
                co->co_opcache_map[next_instr - first_instr]; \
            if (co_opt_offset > 0) { \
                assert(co_opt_offset <= co->co_opcache_size); \
                co_opcache = &co->co_opcache[co_opt_offset - 1]; \
                assert(co_opcache != NULL); \
            } \
        } \
    } while (0)

#if OPCACHE_STATS

#define OPCACHE_STAT_GLOBAL_HIT() \
    do { \
        if (co->co_opcache != NULL) opcache_global_hits++; \
    } while (0)

#define OPCACHE_STAT_GLOBAL_MISS() \
    do { \
        if (co->co_opcache != NULL) opcache_global_misses++; \
    } while (0)

#define OPCACHE_STAT_GLOBAL_OPT() \
    do { \
        if (co->co_opcache != NULL) opcache_global_opts++; \
    } while (0)

#else /* OPCACHE_STATS */

#define OPCACHE_STAT_GLOBAL_HIT()
#define OPCACHE_STAT_GLOBAL_MISS()
#define OPCACHE_STAT_GLOBAL_OPT()

#endif

    if (co->co_opcache_flag < OPCACHE_MIN_RUNS) {
        co->co_opcache_flag++;
        if (co->co_opcache_flag == OPCACHE_MIN_RUNS) {
            if (_PyCode_InitOpcache(co) < 0) {
                goto exit_eval_frame;
            }
#if OPCACHE_STATS
            opcache_code_objects_extra_mem +=
                PyBytes_Size(co->co_code) / sizeof(_Py_CODEUNIT) +
                sizeof(_PyOpcache) * co->co_opcache_size;
            opcache_code_objects++;
#endif
        }
    }

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
        }
    }
}

// Objects/codeobject.c#_PyCode_InitOpcache
int
_PyCode_InitOpcache(PyCodeObject *co)
{
    Py_ssize_t co_size = PyBytes_Size(co->co_code) / sizeof(_Py_CODEUNIT);
    co->co_opcache_map = (unsigned char *)PyMem_Calloc(co_size, 1);
    if (co->co_opcache_map == NULL) {
        return -1;
    }

    _Py_CODEUNIT *opcodes = (_Py_CODEUNIT*)PyBytes_AS_STRING(co->co_code);
    /* 用 opts 统计共需要缓存的表有多大，
       而不是把 co_opcache_map 设计为 _PyOpcache 表，更浪费空间 */ 
    Py_ssize_t opts = 0;

    for (Py_ssize_t i = 0; i < co_size;) {
        unsigned char opcode = _Py_OPCODE(opcodes[i]);
        i++;  // 'i' is now aligned to (next_instr - first_instr)

        // TODO: LOAD_METHOD, LOAD_ATTR
        if (opcode == LOAD_GLOBAL) {
            opts++;
            co->co_opcache_map[i] = (unsigned char)opts;
            if (opts > 254) {
                break;
            }
        }
    }

    if (opts) {
        co->co_opcache = (_PyOpcache *)PyMem_Calloc(opts, sizeof(_PyOpcache));
        if (co->co_opcache == NULL) {
            PyMem_FREE(co->co_opcache_map);
            return -1;
        }
    }
    else {
        PyMem_FREE(co->co_opcache_map);
        co->co_opcache_map = NULL;
        co->co_opcache = NULL;
    }

    co->co_opcache_size = (unsigned char)opts;
    return 0;
}
```

总结来说，Python 层面函数的调用是 @@CALL_FUNCTION[1]@@ 字节码实现的一种特例，该字节码抽象了对任意对象的调用。中间层接口 @@CAPI_PyObject_Vectorcall@@ 衔接了 @@tp_call@@ 和 @@vectorcall@@ 两种协议，其会依据被调用对象的具体实现区别调用。@@PyFunction_Type@@ 实现了 @@vectorcall@@ 协议，故优先于 @@tp_call@@ 实现进行调用，二者在功能上本质上是相同的，即将调用参数转换为 _PyEval_EvalCodeWithName() 接口形式以执行 @@codeobject@@。而 _PyEval_EvalCodeWithName() 内部则将参数解析和封装到 @@frameobject@@ 中，进一步由 @@CAPI_PyEval_EvalFrameEx@@ 接口来执行 @@frameobject@@。@@frameobject@@ 默认由 _PyEval_EvalFrameDefault() 实现，其中逐条读取 @@codeobject@@ 的 *co_code* 来执行函数体的功能。
