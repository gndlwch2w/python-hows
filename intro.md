## Python 是什么？
当你在 wiki 上检索这个问题，你会得到如下正式且无歧义的描述。
```text
Python（英语发音：/ˈpaɪθən/；英语发音：/ˈpaɪθɑːn/），是一种广泛使用的解释型、高级和通用的编程语言。
```
然而，这种描述方法更多是站在计算机理论的分类树层级进行的描述，不容易具体了解它与我们常用的工具有什么共同点与不同点。**从用户的视角来说，Python 就是一个软件**。除所提供的功能不同，和常用的 Word、Latex、微信没有什么区别。对于使用者来说，如下图所示，存载源码的 `.py` 文件同 `.txt` 文件也没有什么不同，其作为输入，经过 Python 的处理得到输出。

<div align="center">
    <img src="img/intro_light.png#gh-light-mode-only" alt="Python intro" width="75%">
    <img src="img/intro_dark.png#gh-dark-mode-only" alt="Python intro" width="75%">
</div>

关于 Python 的学习和使用，通常是 `.py` 文件的内容，即如何以 Python 的语法进行编码。除了这部分以外，我们还关心 Python 是如何处理和执行我们提供的源码文件。官方支持的 Python 软件是通过 C 实现的，简称为 CPython，这里的 Python 软件就是通过编译 CPython 源码得到的可执行文件。

在 CPython 的实现中，其包含两个核心部分，即编译器和解释器。编译器负责将我们编码的 Python 源代码编译为字节码，并封装为 `codeobject` 对象，更多阅读：[附：`codeobject` 是什么？](#附codeobject-是什么)。而解释器负责执行 `codeobject` 中的字节码。Python 向用户暴露了两个接口：`compile` 和 `exec`。`compile` 能够将用户输入的源码编译为 `codeobject` 对象，而 `exec` 能在指定的命名空间中执行给定的 `codeobject` 对象。另外，`dis` 能够将 `codeobject` 内存储的字节码二进制表示输出为可读的字符串。解释器就是依据 `codeobject` 中的字节码一条一条执行的，直到指令全部执行后结束或出现无法处理的异常退出程序。
```python
>>> c = compile('x = 1', '<stdin>', 'exec')
>>> c
<code object <module> at 0x102e70710, file "<stdin>", line 1>
>>> ns = {}
>>> exec(c, ns)
>>> ns
{'x': 1}
>>> import dis
>>> dis.dis(c.co_code)
  1           0 LOAD_CONST               0 (1)
              2 STORE_NAME               0 (x)
              4 LOAD_CONST               1 (None)
              6 RETURN_VALUE
```
将 Python 的源代码编译为字节码的过程属于编译原理的内容，不属于我们讨论的范畴，我们仅关心对于 Python 提供给用户的某个功能，在 CPython 层面是如何实现的，即关心其解释器的部分的实现。

## Python 程序是如何运行起来的？
我们编写了如下 `demo.py` 的 Python 程序，实现计算变量 `x` 和变量 `y` 的和，然后保存到变量 `z`，最后打印 `z`。
```python
# demo.py
x = 1
y = 2
z = x + y
print(z)
```
在控制台通过命令 `python demo.py`，我们就可以看到输出 `3`。那么，在 CPython 这是如何做到的，我们逐步分析 CPython 的实现源码，跟随调用栈了解我们编写程序的执行过程。CPython 的程序入口在 `Programs` 文件夹下的 `python.c`，即 `python` 命令的执行入口，后面的参数 `demo.py` 通过 `argv` 传入。
```c
/* Programs/python.c */
int
main(int argc, char **argv)
{
    return Py_BytesMain(argc, argv);
}

/* Modules/main.c */
int
Py_BytesMain(int argc, char **argv)
{
    /* 将参数封装为 _PyArgv */
    _PyArgv args = {
        .argc = argc,
        .use_bytes_argv = 1,
        .bytes_argv = argv,
        .wchar_argv = NULL};
    return pymain_main(&args);
}

static int
pymain_main(_PyArgv *args)
{
    /* 解析参数、设置相关环境变量、准备运行时所需的依赖，为解释器启动准备 */
    PyStatus status = pymain_init(args);
    if (_PyStatus_IS_EXIT(status)) {
        pymain_free();
        return status.exitcode;
    }
    if (_PyStatus_EXCEPTION(status)) {
        pymain_exit_error(status);
    }

    /* 准备完毕后，继续 */
    return Py_RunMain();
}

int
Py_RunMain(void)
{
    int exitcode = 0;
    /* 继续运行，返回退出状态码 */
    pymain_run_python(&exitcode);

    if (Py_FinalizeEx() < 0) {
        /* Value unlikely to be confused with a non-error exit status or
           other special meaning */
        exitcode = 120;
    }

    pymain_free();

    if (_Py_UnhandledKeyboardInterrupt) {
        exitcode = exit_sigint();
    }

    return exitcode;
}

static void
pymain_run_python(int *exitcode)
{
    PyInterpreterState *interp = _PyInterpreterState_GET_UNSAFE();
    /* pymain_run_stdin() modify the config */
    /* 读取解析的命令行参数 */
    PyConfig *config = &interp->config;

    /* 在运行路径和 zip 场景时，判断 Python 解释器在启动时是否需要把脚本的路径加入 sys.path */
    PyObject *main_importer_path = NULL;
    if (config->run_filename != NULL) {
        /* If filename is a package (ex: directory or ZIP file) which contains
           __main__.py, main_importer_path is set to filename and will be
           prepended to sys.path.

           Otherwise, main_importer_path is left unchanged. */
        if (pymain_get_importer(config->run_filename, &main_importer_path,
                                exitcode)) {
            return;
        }
    }

    if (main_importer_path != NULL) {
        if (pymain_sys_path_add_path0(interp, main_importer_path) < 0) {
            goto error;
        }
    }
    else if (!config->isolated) {
        PyObject *path0 = NULL;
        int res = _PyPathConfig_ComputeSysPath0(&config->argv, &path0);
        if (res < 0) {
            goto error;
        }

        if (res > 0) {
            if (pymain_sys_path_add_path0(interp, path0) < 0) {
                Py_DECREF(path0);
                goto error;
            }
            Py_DECREF(path0);
        }
    }

    PyCompilerFlags cf = _PyCompilerFlags_INIT;

    /* 调试模式下，输出在 python 启动时输出头部信息 */
    pymain_header(config);
    /* 为交互式解释器导入并初始化 readline 模块 */
    pymain_import_readline(config);

    /* 判断当前 python 的启动模式 */
    if (config->run_command) {
        /* python -c 'print(\'Hello, Python\')' */
        *exitcode = pymain_run_command(config->run_command, &cf);
    }
    else if (config->run_module) {
        /* python -m dis demo.py */
        *exitcode = pymain_run_module(config->run_module, 1);
    }
    else if (main_importer_path != NULL) {
        /* python path_or_zip_file，会执行目录下的 __main__.py 文件 */
        *exitcode = pymain_run_module(L"__main__", 0);
    }
    else if (config->run_filename != NULL) {
        /* python demo.py */
        *exitcode = pymain_run_file(config, &cf);
    }
    else {
        /* python，进入交互解释器模式 */
        *exitcode = pymain_run_stdin(config, &cf);
    }

    /* python，进入交互解释器模式 */
    pymain_repl(config, &cf, exitcode);
    goto done;

error:
    *exitcode = pymain_exit_err_print();

done:
    Py_XDECREF(main_importer_path);
}
```
到这里，我们以 `python demo.py` 方式运行的程序，从 `pymain_run_file(config, &cf)` 进入。
```c
static int
pymain_run_file(PyConfig *config, PyCompilerFlags *cf)
{
    /* 被执行源码文件的路径 demo.py */
    const wchar_t *filename = config->run_filename;
    if (PySys_Audit("cpython.run_file", "u", filename) < 0) {
        return pymain_exit_err_print();
    }
    /* 读取源码文件 */
    FILE *fp = _Py_wfopen(filename, L"rb");
    if (fp == NULL) {
        /* 处理文件无法读取或不存在的错误，并退出 */
        char *cfilename_buffer;
        const char *cfilename;
        int err = errno;
        cfilename_buffer = _Py_EncodeLocaleRaw(filename, NULL);
        if (cfilename_buffer != NULL)
            cfilename = cfilename_buffer;
        else
            cfilename = "<unprintable file name>";
        fprintf(stderr, "%ls: can't open file '%s': [Errno %d] %s\n",
                config->program_name, cfilename, err, strerror(err));
        PyMem_RawFree(cfilename_buffer);
        return 2;
    }

    /* 是否跳过定义在第一行的 "#!<命令>" */
    if (config->skip_source_first_line) {
        int ch;
        /* Push back first newline so line numbers remain the same */
        while ((ch = getc(fp)) != EOF) {
            if (ch == '\n') {
                (void)ungetc(ch, fp);
                break;
            }
        }
    }

    /* 检查是否是目录文件，若是则退出 */
    struct _Py_stat_struct sb;
    if (_Py_fstat_noraise(fileno(fp), &sb) == 0 && S_ISDIR(sb.st_mode)) {
        fprintf(stderr,
                "%ls: '%ls' is a directory, cannot continue\n",
                config->program_name, filename);
        fclose(fp);
        return 1;
    }

    /* 处理回调函数，如信号处理、子线程唤醒主线程 */
    /* call pending calls like signal handlers (SIGINT) */
    if (Py_MakePendingCalls() == -1) {
        fclose(fp);
        return pymain_exit_err_print();
    }

    PyObject *unicode, *bytes = NULL;
    const char *filename_str;

    /* 将文件名以 unicode 编码以便于后续接口处理 */
    unicode = PyUnicode_FromWideChar(filename, wcslen(filename));
    if (unicode != NULL) {
        bytes = PyUnicode_EncodeFSDefault(unicode);
        Py_DECREF(unicode);
    }
    if (bytes != NULL) {
        filename_str = PyBytes_AsString(bytes);
    }
    else {
        PyErr_Clear();
        filename_str = "<filename encoding error>";
    }

    /* 将打开的源码文件、文件名作为参数，继续 */
    /* PyRun_AnyFileExFlags(closeit=1) calls fclose(fp) before running code */
    int run = PyRun_AnyFileExFlags(fp, filename_str, 1, cf);
    Py_XDECREF(bytes);
    return (run != 0);
}

/* Python/pythonrun.c */
/* Parse input from a file and execute it */
int
PyRun_AnyFileExFlags(FILE *fp, const char *filename, int closeit,
                     PyCompilerFlags *flags)
{
    if (filename == NULL)
        filename = "???";
    /* 检查是否是交互式终端，如以 python -i 方式启动 */
    if (Py_FdIsInteractive(fp, filename)) {
        /* 以交互模式运行 */
        int err = PyRun_InteractiveLoopFlags(fp, filename, flags);
        if (closeit)
            fclose(fp);
        return err;
    }
    else
        /* 以脚本方式运行，如 python demo.py */
        return PyRun_SimpleFileExFlags(fp, filename, closeit, flags);
}
```
当以如以 `python -i demo.py` 方式运行，会在交互式环境下执行 `demo.py`。这里以 `PyRun_SimpleFileExFlags` 方式继续。
```c
/* Python/pythonrun.c */
int
PyRun_SimpleFileExFlags(FILE *fp, const char *filename, int closeit,
                        PyCompilerFlags *flags)
{   
    /* 将文件名转换为 PyUnicodeObject 实例 */
    PyObject *filename_obj = PyUnicode_DecodeFSDefault(filename);
    if (filename_obj == NULL) {
        return -1;
    }
    /* 继续运行 */
    int res = pyrun_simple_file(fp, filename_obj, closeit, flags);
    Py_DECREF(filename_obj);
    return res;
}

static int
pyrun_simple_file(FILE *fp, PyObject *filename, int closeit,
                  PyCompilerFlags *flags)
{
    PyObject *m, *d, *v;
    int set_file_name = 0, ret = -1;

    /* 默认入口文件为 __main__ 模块，创建一个名为 __main__ 的模块，加入到 sys.modules 中 */
    m = PyImport_AddModule("__main__");
    if (m == NULL)
        return -1;
    Py_INCREF(m);
    d = PyModule_GetDict(m);
    /* 执行 globals['__file__'] = filename */
    if (PyDict_GetItemString(d, "__file__") == NULL) {
        if (PyDict_SetItemString(d, "__file__", filename) < 0) {
            goto done;
        }
        if (PyDict_SetItemString(d, "__cached__", Py_None) < 0) {
            goto done;
        }
        set_file_name = 1;
    }

    /* 检查是否存在预编译的 pyc 文件，若存在则能跳过编译阶段，加速 python 的执行 */
    int pyc = maybe_pyc_file(fp, filename, closeit);
    if (pyc < 0) {
        goto done;
    }

    /* 若存在 pyc 文件则直接运行 pyc 文件 */
    if (pyc) {
        FILE *pyc_fp;
        /* Try to run a pyc file. First, re-open in binary */
        if (closeit) {
            fclose(fp);
        }

        pyc_fp = _Py_fopen_obj(filename, "rb");
        if (pyc_fp == NULL) {
            fprintf(stderr, "python: Can't reopen .pyc file\n");
            goto done;
        }

        if (set_main_loader(d, filename, "SourcelessFileLoader") < 0) {
            fprintf(stderr, "python: failed to set __main__.__loader__\n");
            ret = -1;
            fclose(pyc_fp);
            goto done;
        }
        v = run_pyc_file(pyc_fp, d, d, flags);
    } else {
        /* When running from stdin, leave __main__.__loader__ alone */
        /* 为 __main__ 模块设置 __loader__ 用于 import */
        if (PyUnicode_CompareWithASCIIString(filename, "<stdin>") != 0 &&
            set_main_loader(d, filename, "SourceFileLoader") < 0) {
            fprintf(stderr, "python: failed to set __main__.__loader__\n");
            ret = -1;
            goto done;
        }
        /* 不存在则继续 */
        v = pyrun_file(fp, filename, Py_file_input, d, d,
                       closeit, flags);
    }
    flush_io();
    if (v == NULL) {
        Py_CLEAR(m);
        PyErr_Print();
        goto done;
    }
    Py_DECREF(v);
    ret = 0;
  done:
    if (set_file_name) {
        if (PyDict_DelItemString(d, "__file__")) {
            PyErr_Clear();
        }
        if (PyDict_DelItemString(d, "__cached__")) {
            PyErr_Clear();
        }
    }
    Py_XDECREF(m);
    return ret;
}
```
`.pyc` 文件是 `.py` 文件编译后的字节码文件，通常会放在 `__pycache__` 文件夹下，当运行一个 `.py` 文件或导入一个模块后，这个文件会被生成，以加速程序的运行。这里第一次运行 `demo.py`，从 `pyrun_file` 继续，这里的 `globals` 和 `locals` 都指向 `__main__` 模块的 `__dict__`。
```c
/* Python/pythonrun.c */
static PyObject *
pyrun_file(FILE *fp, PyObject *filename, int start, PyObject *globals,
           PyObject *locals, int closeit, PyCompilerFlags *flags)
{
    /* 初始化一块空内存，大小为 4kb */
    PyArena *arena = PyArena_New();
    if (arena == NULL) {
        return NULL;
    }

    /* 将源码文件编译为抽象语法树对象 AST */
    mod_ty mod;
    mod = PyParser_ASTFromFileObject(fp, filename, NULL, start, 0, 0,
                                     flags, NULL, arena);
    if (closeit) {
        fclose(fp);
    }

    /* 运行编译的抽象语法树对象 */
    PyObject *ret;
    if (mod != NULL) {
        ret = run_mod(mod, filename, globals, locals, flags, arena);
    }
    else {
        ret = NULL;
    }
    PyArena_Free(arena);

    return ret;
}

static PyObject *
run_mod(mod_ty mod, PyObject *filename, PyObject *globals, PyObject *locals,
            PyCompilerFlags *flags, PyArena *arena)
{
    PyCodeObject *co;
    PyObject *v;
    /* 将 AST 对象编译为 codeobject 对象 */
    co = PyAST_CompileObject(mod, filename, flags, -1, arena);
    if (co == NULL)
        return NULL;

    if (PySys_Audit("exec", "O", co) < 0) {
        Py_DECREF(co);
        return NULL;
    }

    /* 运行编译的 codeobject 对象 */
    v = run_eval_code_obj(co, globals, locals);
    Py_DECREF(co);
    return v;
}

static PyObject *
run_eval_code_obj(PyCodeObject *co, PyObject *globals, PyObject *locals)
{
    PyObject *v;
    /*
     * We explicitly re-initialize _Py_UnhandledKeyboardInterrupt every eval
     * _just in case_ someone is calling into an embedded Python where they
     * don't care about an uncaught KeyboardInterrupt exception (why didn't they
     * leave config.install_signal_handlers set to 0?!?) but then later call
     * Py_Main() itself (which _checks_ this flag and dies with a signal after
     * its interpreter exits).  We don't want a previous embedded interpreter's
     * uncaught exception to trigger an unexplained signal exit from a future
     * Py_Main() based one.
     */
    _Py_UnhandledKeyboardInterrupt = 0;

    /* 将 __builtins__ 保存到 globals */
    /* Set globals['__builtins__'] if it doesn't exist */
    if (globals != NULL && PyDict_GetItemString(globals, "__builtins__") == NULL) {
        PyInterpreterState *interp = _PyInterpreterState_Get();
        if (PyDict_SetItemString(globals, "__builtins__", interp->builtins) < 0) {
            return NULL;
        }
    }

    /* 执行 codeobject */
    v = PyEval_EvalCode((PyObject*)co, globals, locals);
    if (!v && PyErr_Occurred() == PyExc_KeyboardInterrupt) {
        _Py_UnhandledKeyboardInterrupt = 1;
    }
    return v;
}
```
万事俱备后，调用到了 `PyEval_EvalCode` 函数，开始真正进入代码的执行阶段。
```c
/* Python/ceval.c */
PyObject *
PyEval_EvalCode(PyObject *co, PyObject *globals, PyObject *locals)
{
    return PyEval_EvalCodeEx(co,
                      globals, locals,
                      (PyObject **)NULL, 0,
                      (PyObject **)NULL, 0,
                      (PyObject **)NULL, 0,
                      NULL, NULL);
}

PyObject *
PyEval_EvalCodeEx(PyObject *_co, PyObject *globals, PyObject *locals,
                  PyObject *const *args, int argcount,
                  PyObject *const *kws, int kwcount,
                  PyObject *const *defs, int defcount,
                  PyObject *kwdefs, PyObject *closure)
{
    return _PyEval_EvalCodeWithName(_co, globals, locals,
                                    args, argcount,
                                    kws, kws != NULL ? kws + 1 : NULL,
                                    kwcount, 2,
                                    defs, defcount,
                                    kwdefs, closure,
                                    NULL, NULL);
}

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

    /* 创建 frame 来执行字节码 */
    /* Create the frame */
    f = _PyFrame_New_NoTrack(tstate, co, globals, locals);
    if (f == NULL) {
        return NULL;
    }
    fastlocals = f->f_localsplus;
    freevars = f->f_localsplus + co->co_nlocals;

    /* 解析参数到 fastlocals */
    /* Create a dictionary for keyword parameters (**kwags) */
    if (co->co_flags & CO_VARKEYWORDS) {
        /* 省略 */
    }
    else {
        kwdict = NULL;
    }

    /* Copy all positional arguments into local variables */
    /* 省略 */

    /* Pack other positional arguments into the *args argument */
    /* 省略 */

    /* Handle keyword arguments passed as two strided arrays */
    kwcount *= kwstep;
    for (i = 0; i < kwcount; i += kwstep) {
        /* 省略 */
    }

    /* Check the number of positional arguments */
    if ((argcount > co->co_argcount) && !(co->co_flags & CO_VARARGS)) {
        too_many_positional(tstate, co, argcount, defcount, fastlocals);
        goto fail;
    }

    /* Add missing positional arguments (copy default values from defs) */
    if (argcount < co->co_argcount) {
        /* 省略 */
    }

    /* Add missing keyword arguments (copy default values from kwdefs) */
    if (co->co_kwonlyargcount > 0) {
        /* 省略 */
    }

    /* Allocate and initialize storage for cell vars, and copy free
       vars into frame. */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_cellvars); ++i) {
        /* 省略 */
    }

    /* Copy closure variables to free variables */
    for (i = 0; i < PyTuple_GET_SIZE(co->co_freevars); ++i) {
        /* 省略 */
    }

    /* 处理生成器/coroutine */
    /* Handle generator/coroutine/asynchronous generator */
    if (co->co_flags & (CO_GENERATOR | CO_COROUTINE | CO_ASYNC_GENERATOR)) {
        /* 省略 */
        return gen;
    }

    /* 处理完毕参数，执行 frameobject */
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

PyObject *
PyEval_EvalFrameEx(PyFrameObject *f, int throwflag)
{
    PyInterpreterState *interp = _PyInterpreterState_GET_UNSAFE();
    return interp->eval_frame(f, throwflag);
}
```
Python 中，执行 `codeobject` 的最后阶段是执行 `frameobject`，其还是执行 `codeobject` 中的字节码，`frame` 为执行过程提供环境。在 `PyEval_EvalFrameEx` 调用到解释器状态初始化的 `eval_frame` 函数指针，其默认为 `_PyEval_EvalFrameDefault`。
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
            case TARGET(LOAD_CONST): {
                PREDICTED(LOAD_CONST);
                PyObject *value = GETITEM(consts, oparg);
                Py_INCREF(value);
                PUSH(value);
                FAST_DISPATCH();
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

            case TARGET(BINARY_ADD): {
                PyObject *right = POP();
                PyObject *left = TOP();
                PyObject *sum;
                /* NOTE(haypo): Please don't try to micro-optimize int+int on
                CPython using bytecode, it is simply worthless.
                See http://bugs.python.org/issue21955 and
                http://bugs.python.org/issue10044 for the discussion. In short,
                no patch shown any impact on a realistic benchmark, only a minor
                speedup on microbenchmarks. */
                if (PyUnicode_CheckExact(left) &&
                        PyUnicode_CheckExact(right)) {
                    sum = unicode_concatenate(tstate, left, right, f, next_instr);
                    /* unicode_concatenate consumed the ref to left */
                }
                else {
                    sum = PyNumber_Add(left, right);
                    Py_DECREF(left);
                }
                Py_DECREF(right);
                SET_TOP(sum);
                if (sum == NULL)
                    goto error;
                DISPATCH();
            }

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

            case TARGET(POP_TOP): {
                PyObject *value = POP();
                Py_DECREF(value);
                FAST_DISPATCH();
            }

            case TARGET(RETURN_VALUE): {
                retval = POP();
                assert(f->f_iblock == 0);
                goto exit_returning;
            }
        }
    }
}
```
我们先通过 `dis` 查看 `demo.py` 的字节码，然后在分析它如何在 `_PyEval_EvalFrameDefault` 中执行的。
```text
# python -m dis demo.py
  2           0 LOAD_CONST               0 (1)
              2 STORE_NAME               0 (x)

  3           4 LOAD_CONST               1 (2)
              6 STORE_NAME               1 (y)

  4           8 LOAD_NAME                0 (x)
             10 LOAD_NAME                1 (y)
             12 BINARY_ADD
             14 STORE_NAME               2 (z)

  5          16 LOAD_NAME                3 (print)
             18 LOAD_NAME                2 (z)
             20 CALL_FUNCTION            1
             22 POP_TOP
             24 LOAD_CONST               2 (None)
             26 RETURN_VALUE
```
在编译得到的字节码中，`LOAD_CONST` 从 `codeobject` 的常量表里获取到对象，然后压入 `frame` 的值栈中，接着 `STORE_NAME` 从名字常量元组中获得变量名 `'x'`，将栈顶元素弹出，然后存储到 `locals` 中，完成 `x = 1` 的赋值操作。同理，`y = 1` 也一样。然后，`LOAD_NAME` 从 `locals` 里读取到变量 `x` 和 `y` 的值，并分别压入栈中，`BINARY_ADD` 先弹出一个栈顶对象，在获取到当前的栈顶对象，调用 `PyNumber_Add` 函数执行两个对象求和，将结果设置为栈顶。然后通过 `STORE_NAME` 赋值到变量 `z`。紧接着继续将 `print` 和 `z` 压入栈，调用 `CALL_FUNCTION` 执行 `print` 函数。然后 `POP_TOP` 弹出 `print` 的返回值，最后返回 `None` 完成 `frame` 的执行后退出。

## 附：`codeobject` 是什么？
