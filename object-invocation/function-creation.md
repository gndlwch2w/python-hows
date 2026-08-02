### 创建函数

如下是 @@BNF@@ 描述函数定义的部分语法，完整语法参考 @@grammar@@，从中可以看出：

* 函数定义之前，允许被 `@` 装饰器修饰。

* 函数分为普通函数 `def` 和协程函数 `async def` 两种。

* 参数定义在 `(...)` 中；参数项允许采用 `name : type` 进行类型标注，也允许以如 `# type: int` 方式标注（旧版本类型注释语法，TYPE_COMMENT 负责识别如 `# type: ... NEWLINE` 的注释）；参数项允许以 `name = value` 方式设置默认值；参数项可分为普通参数（可由位置传参或关键字传参任一方式传递）、位置参数（仅允许通过位置传参一种方式传递，即定义在 `/` 之前的参数）、关键字参数（仅允许以关键字传参一种方式传递，即定义在 `*` 之后的参数）、额外位置参数 `*args` 以及额外关键字参数 `**kwargs` 五种类型，位置参数和普通参数又可称为可按位置传递参数。

* 函数头以 `:` 表明定义结束，在其之前允许以 `-> type` 方式标注函数返回值类型，或在其之后允许以如 `# type: (int, int) -> str` 标注函数签名。

* 函数体允许在 `:` 后不换行接简单语句，或换行后定义旧式函数声明且至少一句有效语句。

```peg
# NB: due to the way TYPE_COMMENT is tokenized it will always be followed by a NEWLINE

decorator: '@' dotted_name [ '(' [arglist] ')' ] NEWLINE
decorators: decorator+
decorated: decorators (classdef | funcdef | async_funcdef)

arglist: argument (',' argument)*  [',']

async_funcdef: ASYNC funcdef
funcdef: 'def' NAME parameters ['->' test] ':' [TYPE_COMMENT] func_body_suite

parameters: '(' [typedargslist] ')'

# The following definition for typedarglist is equivalent to this set of rules:
#
#     arguments = argument (',' [TYPE_COMMENT] argument)*
#     argument = tfpdef ['=' test]
#     kwargs = '**' tfpdef [','] [TYPE_COMMENT]
#     args = '*' [tfpdef]
#     kwonly_kwargs = (',' [TYPE_COMMENT] argument)* (TYPE_COMMENT | [',' [TYPE_COMMENT] [kwargs]])
#     args_kwonly_kwargs = args kwonly_kwargs | kwargs
#     poskeyword_args_kwonly_kwargs = arguments ( TYPE_COMMENT | [',' [TYPE_COMMENT] [args_kwonly_kwargs]])
#     typedargslist_no_posonly  = poskeyword_args_kwonly_kwargs | args_kwonly_kwargs
#     typedarglist = (arguments ',' [TYPE_COMMENT] '/' [',' [[TYPE_COMMENT] typedargslist_no_posonly]])|(typedargslist_no_posonly)"
#
# It needs to be fully expanded to allow our LL(1) parser to work on it.

typedargslist: (
  (tfpdef ['=' test] (',' [TYPE_COMMENT] tfpdef ['=' test])* ',' [TYPE_COMMENT] '/' [',' [ [TYPE_COMMENT] tfpdef ['=' test] (
        ',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] [
        '*' [tfpdef] (',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] ['**' tfpdef [','] [TYPE_COMMENT]]])
      | '**' tfpdef [','] [TYPE_COMMENT]]])
  | '*' [tfpdef] (',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] ['**' tfpdef [','] [TYPE_COMMENT]]])
  | '**' tfpdef [','] [TYPE_COMMENT]]] )
|  (tfpdef ['=' test] (',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] [
   '*' [tfpdef] (',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] ['**' tfpdef [','] [TYPE_COMMENT]]])
  | '**' tfpdef [','] [TYPE_COMMENT]]])
  | '*' [tfpdef] (',' [TYPE_COMMENT] tfpdef ['=' test])* (TYPE_COMMENT | [',' [TYPE_COMMENT] ['**' tfpdef [','] [TYPE_COMMENT]]])
  | '**' tfpdef [','] [TYPE_COMMENT])
)
tfpdef: NAME [':' test]

func_body_suite: simple_stmt | NEWLINE [TYPE_COMMENT NEWLINE] INDENT stmt+ DEDENT
```

依据上述语法规则，声明如下函数 `f`，其定义了除装饰器外的所有特性，以分析它们的实现原理。

```python
def f(
    a: str, b: int = 1,      # 位置参数 (positional-only)
    /, 
    c: int = 2, d: int = 3,  # 普通参数 (positional-or-keyword)
    *args,                   # 额外位置参数 (var-positional)
    e: int = 4, f: int = 5,  # 关键字参数 (keyword-only)
    **kwargs                 # 额外关键字参数 (var-keyword)
) -> None:
    pass
```

从创建函数对象 `f` 的字节码可以看出，`f` 由 @@MAKE_FUNCTION@@ 字节码创建，其参数从值栈底到值栈顶依次为：按顺序排列的可按位置传递参数的默认值元组、关键字参数的默认值字典、类型注释字典以及函数的 @@codeobject@@ 对象。字节码参数（如 `7 = 0x04 | 0x02 | 0x01`）为位标记表明需处理的输入参数类型和数量。其中，@@BUILD_CONST_KEY_MAP@@ 字节码用于构建字典对象，字节码参数表明键值对个数，值栈栈顶为键元组，然后逆序为键的对应值，字节码执行结束后结果字典会被设置到值栈栈顶。

```python
>>> dis("def f(...")
  2           0 LOAD_CONST              10 ((1, 2, 3))

  7           2 LOAD_CONST               3 (4)
              4 LOAD_CONST               4 (5)

  2           6 LOAD_CONST               5 (('e', 'f'))
              8 BUILD_CONST_KEY_MAP      2

  5          10 LOAD_NAME                0 (int)
             12 LOAD_NAME                0 (int)

  3          14 LOAD_NAME                1 (str)
             16 LOAD_NAME                0 (int)

  7          18 LOAD_NAME                0 (int)
             20 LOAD_NAME                0 (int)

  9          22 LOAD_CONST               6 (None)

  2          24 LOAD_CONST               7 (('c', 'd', 'a', 'b', 'e', 'f', 'return'))
             26 BUILD_CONST_KEY_MAP      7
             28 LOAD_CONST               8 (<code object f at 0x105216870>)
             30 LOAD_CONST               9 ('f')
             32 MAKE_FUNCTION            7 (defaults, kwdefaults, annotations)
             34 STORE_NAME               2 (f)
             36 LOAD_CONST               6 (None)
             38 RETURN_VALUE
```

函数对象 `f` 的 \_\_code__ 属性指向函数体的 @@codeobject@@ 对象，该对象的成员通常以 `co_` 前缀命名，影响函数执行时的行为，具体来说：

* *co_code* 为函数体的字节码指令序列，每条字节码由 *16* 位的字构成，前 *8* 位为操作码，后 *8* 位为操作数。

* *co_argcount*、*co_kwonlyargcount*、*co_posonlyargcount* 和 *co_varnames* 记录函数头定义的参数信息，依次为可按位置传递参数总数、关键字参数个数、位置参数个数和按定义顺序排列的参数名称表（不包括 `*args` 和 `**kwargs`）。

* *co_cellvars* 和 *co_freevars* 表明函数中显式定义的 cell 变量和 free 变量的名称列表，用于实现变量的闭包访问。

* *co_consts* 为函数执行期间 @@LOAD_CONST@@ 字节码读取的常量表；*co_names* 为函数执行期间 @@LOAD-STORE_NAME@@ 字节码访问变量时字节码参数到变量名称的映射表，二者都是函数静态解析期间确定的。

* *co_lnotab* 用于实现字节码到 Python 源码行号的映射；*co_firstlineno* 为函数第一行代码对应行号。

* *co_stacksize* 为字节码执行期间所需的最大栈深度（注意区别 Python 函数的调用的栈深度）；*co_nlocals* 为函数可显式解析的局部变量个数，函数执行前需提前为其分配内存空间。

* *@@slot_co_flags@@* 会影响字节码的发射和在解释期间的行为，如函数 `f` 的 `79 = CO_OPTIMIZED (0x01) | CO_NEWLOCALS (0x02) | CO_VARARGS (0x04) | CO_VARKEYWORDS (0x08) | CO_NOFREE (0x40)`，其中 @@CO_VARARGS@@ 表明函数具有 `*args` 参数，而 @@CO_VARKEYWORDS@@ 表明具有 `**kwrags` 参数，其它标志位的功能参考 @@slot_co_flags[1]@@。

* 其它属性如 *co_filename* 和 *co_name* 分别表示产生 @@codeobject@@ 对象来源和名称。

```python
>>> for name in dir(f.__code__):
...     if name.startswith("co_"):
...             print(name, getattr(f.__code__, name))
...
co_argcount 4
co_cellvars ()
co_code b'd\x00S\x00'
co_consts (None,)
co_filename <stdin>
co_firstlineno 1
co_flags 79
co_freevars ()
co_kwonlyargcount 2
co_lnotab b'\x00\x08'
co_name f
co_names ()
co_nlocals 8
co_posonlyargcount 2
co_stacksize 1
co_varnames ('a', 'b', 'c', 'd', 'e', 'f', 'args', 'kwargs')
```

接下来详细分析 @@MAKE_FUNCTION@@ 的实现。总体来说，先从值栈中弹出函数名称和 @@codeobject@@ 对象创建出函数对象 @@PyFunctionObject@@，然后再依据字节码参数将其余的参数弹出并设置到 @@PyFunctionObject@@ 结构体的相应字段，最后在将结果函数对象设置到值栈栈顶。

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
            case TARGET(MAKE_FUNCTION): {
                PyObject *qualname = POP();
                PyObject *codeobj = POP();
                PyFunctionObject *func = (PyFunctionObject *)
                    PyFunction_NewWithQualName(codeobj, f->f_globals, qualname);

                Py_DECREF(codeobj);
                Py_DECREF(qualname);
                if (func == NULL) {
                    goto error;
                }

                if (oparg & 0x08) {  // 闭包变量
                    assert(PyTuple_CheckExact(TOP()));
                    func->func_closure = POP();
                }
                if (oparg & 0x04) {  // 类型标注
                    assert(PyDict_CheckExact(TOP()));
                    func->func_annotations = POP();
                }
                if (oparg & 0x02) {  // kw-only 默认参数
                    assert(PyDict_CheckExact(TOP()));
                    func->func_kwdefaults = POP();
                }
                if (oparg & 0x01) {  // p-only 或 p-or-kw 默认参数
                    assert(PyTuple_CheckExact(TOP()));
                    func->func_defaults = POP();
                }

                PUSH((PyObject *)func);
                DISPATCH();
            }
        }
    }
}
```

函数对象 @@PyFunctionObject@@ 的创建由 @@CAPI_PyFunction_NewWithQualName@@ 接口实现，值得注意的有，函数对象的 \_\_module__ 属性默认从函数所处模块的 \_\_name__ 属性进行设置，以及 *func_globals* 会设置为当前 @@frameobject@@ 的 *f_globals*，此时 *f_globals* 指向的是函数所处模块的全局命名空间字典。函数对象 @@PyFunctionObject@@ 由 GC 进行管理的，其类型为 @@PyFunction_Type@@。函数对象支持 @@vectorcall@@ 调用，默认由 _PyFunction_Vectorcall() 实现。其它与函数执行相关字段要么从 @@codeobject@@ 设置，要么由 @@MAKE_FUNCTION@@ 设置。

```c
// Include/funcobject.h#PyFunctionObject
typedef struct {
    PyObject_HEAD
    PyObject *func_code;        /* A code object, the __code__ attribute */
    PyObject *func_globals;     /* A dictionary (other mappings won't do), __globals__ */
    PyObject *func_defaults;    /* NULL or a tuple, __defaults__ */
    PyObject *func_kwdefaults;  /* NULL or a dict, __kwdefaults__ */
    PyObject *func_closure;     /* NULL or a tuple of cell objects, __closure__ */
    PyObject *func_doc;         /* The __doc__ attribute, can be anything */
    PyObject *func_name;        /* The __name__ attribute, a string object */
    PyObject *func_dict;        /* The __dict__ attribute, a dict or NULL */
    PyObject *func_weakreflist; /* List of weak references */
    PyObject *func_module;      /* The __module__ attribute, can be anything */
    PyObject *func_annotations; /* Annotations, a dict or NULL, __annotations__ */
    PyObject *func_qualname;    /* The qualified name, __qualname__ */
    vectorcallfunc vectorcall;

    /* Invariant:
     *     func_closure contains the bindings for func_code->co_freevars, so
     *     PyTuple_Size(func_closure) == PyCode_GetNumFree(func_code)
     *     (func_closure may be NULL if PyCode_GetNumFree(func_code) == 0).
     */
} PyFunctionObject;

// Objects/funcobject.c#PyFunction_NewWithQualName
PyObject *
PyFunction_NewWithQualName(PyObject *code, PyObject *globals, PyObject *qualname)
{
    PyFunctionObject *op;
    PyObject *doc, *consts, *module;
    static PyObject *__name__ = NULL;

    if (__name__ == NULL) {
        __name__ = PyUnicode_InternFromString("__name__");
        if (__name__ == NULL)
            return NULL;
    }

    /* __module__: If module name is in globals, use it.
       Otherwise, use None. */
    module = PyDict_GetItemWithError(globals, __name__);
    if (module) {
        Py_INCREF(module);
    }
    else if (PyErr_Occurred()) {
        return NULL;
    }

    op = PyObject_GC_New(PyFunctionObject, &PyFunction_Type);
    if (op == NULL) {
        Py_XDECREF(module);
        return NULL;
    }
    /* Note: No failures from this point on, since func_dealloc() does not
       expect a partially-created object. */

    op->func_weakreflist = NULL;
    Py_INCREF(code);
    op->func_code = code;
    Py_INCREF(globals);
    op->func_globals = globals;
    op->func_name = ((PyCodeObject *)code)->co_name;
    Py_INCREF(op->func_name);
    op->func_defaults = NULL; /* No default arguments */
    op->func_kwdefaults = NULL; /* No keyword only defaults */
    op->func_closure = NULL;
    op->vectorcall = _PyFunction_Vectorcall;
    op->func_module = module;

    consts = ((PyCodeObject *)code)->co_consts;
    if (PyTuple_Size(consts) >= 1) {
        doc = PyTuple_GetItem(consts, 0);
        if (!PyUnicode_Check(doc))
            doc = Py_None;
    }
    else
        doc = Py_None;
    Py_INCREF(doc);
    op->func_doc = doc;

    op->func_dict = NULL;
    op->func_annotations = NULL;

    if (qualname)
        op->func_qualname = qualname;
    else
        op->func_qualname = op->func_name;
    Py_INCREF(op->func_qualname);

    _PyObject_GC_TRACK(op);
    return (PyObject *)op;
}
```

总结来说，如 `<function f at 0x1052c03a0>` 的函数对象由 @@PyFunctionObject@@ 结构体表示，其 `func_*` 字段记录了函数执行期间所依赖的信息。创建函数对象一般具有两种途径，对于 Python 用户而言，声明函数的语句先解析为 @@AST@@ 再到字节码，最终由 @@MAKE_FUNCTION@@ 创建出函数对象；对于 C 用户而言，可调用如 @@CAPI_PyFunction_NewWithQualName@@ 等接口创建函数对象。
