## Python 是什么？
当你在 wiki 上检索这个问题，你会得到如下正式的定义。
```text
Python（英语发音：/ˈpaɪθən/；英语发音：/ˈpaɪθɑːn/），是一种广泛使用的解释型、高级和通用的编程语言。
```
然而，这种描述方法更多是站在编程语言分类树进行的描述，不容易了解到与其它工具的共同点与不同点。**从用户的视角来说，Python 类似一个软件**。除所提供的功能和用户界面不同，它与常用的如 Word、Latex、微信等各种软件非常类似。如下图所示，用户需要提供源码文件（如 `.py` 文件，其类似 `.txt` 文件，用于存储文本信息）作为输入，然后输入到 Python 中，经过它的处理后得到输出。具体完成的任务由用户和 Python 提供的基础服务决定，就像是微信提供向某好友发送信息的基础服务，而用户决定向哪个好友以及发送什么信息来作为服务的输入。

<div align="center">
    <img src="img/intro_light.png#gh-light-mode-only" alt="Python intro" width="75%">
    <img src="img/intro_dark.png#gh-dark-mode-only" alt="Python intro" width="75%">
</div>

现存的资料，如 [3.8.20 Documentation - Full Grammar specification](https://docs.python.org/3/reference/grammar.html)，包含很多关于 Python 语法和工具层面的学习和使用，旨在用户学习后能够提供满足语法要求的 Python 源码。除了编写源码以外，我们可能还关心 Python 程序是如何处理和执行我们提供的源码，这属于 Python 实现层面的范畴。任何软件都是由一种或多种编程语言实现，Python 同样不例外。Python 有许多语言实现，如 [PyPy](https://pypy.org)、[Jython](https://www.jython.org) 等。目前官方支持的 Python 主要通过 C 实现，称为 [CPython](https://github.com/python/cpython)。用户运行的 Python 程序是通过编译某个版本的 CPython 源码所得到的，其可直接下载官方发布的可执行程序，也可自行编译。

在 CPython 的实现中，为便于理解，解释器的运行过程可大致分为两个阶段：编译阶段和执行阶段。编译阶段负责将我们提供的源码编译为字节码字节序列，并封装为 code 对象，更多阅读：[附：code 对象是什么？](#附code-对象是什么)。而执行阶段负责执行 code 对象。可以通过如下例子理解这一点，Python 向用户暴露了两个内置函数接口：[`compile(source, filename, mode, **kwargs)`](https://docs.python.org/3/library/functions.html#compile) 和 [`exec(source, globals=None, locals=None, **kwargs)`](https://docs.python.org/3/library/functions.html#exec)。`compile` 能够将用户输入的源码编译为 code 对象，而 `exec` 能在给定的命名空间中执行 code 对象。另外，`dis` 模块能够将 code 对象内存储的字节码字节序列输出为可读的字符串。执行阶段所做的就是依据 code 对象中的字节码一条一条执行的，直到指令全部执行后结束或出现无法处理的异常退出程序。
```python
# 将源码 x = 1 编译为 codeobject 对象
>>> c = compile('x = 1', '<stdin>', 'exec')
>>> c
<code object <module> at 0x102e70710, file "<stdin>", line 1>
>>> ns = {}
# 在命名空间 ns 解释执行提供的 codeobject 对象
>>> exec(c, ns)
>>> ns
{'x': 1}
>>> import dis
# 查看源码编译的字节码序列
>>> dis.dis(c.co_code)
  1           0 LOAD_CONST               0 (1)
              2 STORE_NAME               0 (x)
              4 LOAD_CONST               1 (None)
              6 RETURN_VALUE
```
将 Python 源码编译为字节码的过程属于编译原理的内容，不属于我们讨论的范畴，更多阅读可参考 [CPython Internals: Your Guide to the  Python 3 Interpreter - The Compiler](https://realpython.com/products/cpython-internals-book)、[Inside The Python Virtual Machine - Compiling Python Source Code](https://leanpub.com/insidethepythonvirtualmachine) 和 [CS143](https://web.stanford.edu/class/cs143/)。我们仅关心对于 Python 提供给用户的某个功能在 CPython 层面是如何实现的，即关心执行阶段的实现。

## Python 程序是如何运行起来的？
我们编写了如下 `demo.py` 的 Python 程序，实现计算变量 `x` 和变量 `y` 的和，然后保存到变量 `z`，最后打印 `z`。
```python
# demo.py
x = 1
y = 2
z = x + y
print(z)
```
在控制台通过命令 `python demo.py`，我们就可以看到输出 `3`。
```bash
~ python demo.py
3
```
那么 Python 是如何做到的？我们逐步分析 CPython 的实现，从程序入口跟随调用栈了解 CPython 的运行过程。CPython 各发布版本的源码文件可从 [cpython - tags](https://github.com/python/cpython/tags) 获取。所有的源码都参考自 [v3.8.20](https://github.com/python/cpython/releases/tag/v3.8.20) 的实现。首先 CPython 的程序入口在 `Programs` 文件夹下的 `python.c`，其中包含了一个 `main` 函数，即 `python` 命令的执行入口，命令行参数 `demo.py` 通过 `argv` 传入。不同的操作系统，入口略微不同，这里参考非 Windows 系统版本的入口。
- `Py_BytesMain` 函数初步将命令行参数进行封装。
- `pymain_main` 函数主要完成了 Python 解释器的初始化，包括如运行时配置（如设置内存分配函数、垃圾回收处理函数、代码执行函数、线程锁和一些运行时控制参数等）、命令行参数解析、环境变量读取与配置（如配置 `sys.path` 等）。
- `pymain_run_python` 函数则根据配置信息确定 python 的运行模式，如以 `python -c` 执行提供的源码字符串、以 `python -m` 执行某个 python 模块、以 `python demo.py` 执行某个脚本、以 `python code/` 或 `python code.zip` 执行某个项目、以 `python` 或 `python -i` 进入交互式环境（REPL）。
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
由于我们脚本 `python demo.py` 方式运行的程序，调用栈从 `pymain_run_file(config, &cf)` 进入。
- `pymain_run_file` 函数对输入的源码文件进行检查、读取和一些简单处理，然后转换文件名为 `unicode` 编码便于后续使用。
- `PyRun_AnyFileExFlags` 函数判断是否是以 `python -i file.py` 的模式运行。若是则先执行 `file.py` 文件然后进入 REPL 模式。否则以普通脚本方式运行，这种方式在执行完毕给定的脚本后会退出程序，不会进入 REPL 模式。
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
同样，`python demo.py` 的执行方式应以 `PyRun_SimpleFileExFlags` 函数继续。
- `PyRun_SimpleFileExFlags` 函数将文件名转换为 `PyUnicodeObject` 对象后继续。
- `pyrun_simple_file` 函数为执行脚本创建了一个 `__main__` 模块，然后将如 `__file__` 等相关信息写入到模块的 `__dict__` 中。接着判断当前脚本是否存在预编译的 `.pyc` 文件，若存在则通过 `run_pyc_file` 方式运行。否则以 `pyrun_file` 方式运行。

`.pyc` 文件是 `.py` 文件编译后的字节码文件，通常会放在 `__pycache__` 文件夹下，当运行一个 `.py` 文件或导入一个模块后，相关文件会被生成，以加速程序的运行。
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
我们由于是第一次运行 `python demo.py`，从 `pyrun_file` 函数继续，这里的传入参数的 `globals` 和 `locals` 都指向 `__main__` 模块的 `__dict__`。
- `pyrun_file` 函数从 Python 的内存管理中申请了一块 4kb 的 arena，后续的对象会在里面进行存储。然后编译源码文件为抽象语法树（AST）对象（粗略包括：具体语法树生成 -> 抽象语法树生成以及相关的符号表等），这些对象就存储在统一内存管理的 arena 中。接着运行 AST 对象。
- `run_mod` 函数将 AST 对象编译为 code 对象（粗略包含：字节码发射、字节码优化和封装为 code 对象），然后运行生成的 code 对象。
- `run_eval_code_obj` 函数检查基础依赖如 `__builtins__` 是否被包含到命名空间中，然后继续运行。
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
万事俱备后，调用到了 `PyEval_EvalCode` 函数，开始真正进入代码的执行阶段，其中传递了编译的代码对象、全局变量和局部变量命名空间参数。接着直到调用到 `_PyEval_EvalCodeWithName` 函数。
- `_PyEval_EvalCodeWithName` 函数内核心创建了 code 对象的执行环境 frame 对象，更多阅读：[附：frame 对象是什么？](#附frame-对象是什么)。以及将传递的参数进行解析，如解析函数调用时传递进入的各种参数、闭包等。然后判断执行的模式，如是生成器或 coroutine 时需要特殊处理。将相关的参数和代码对象封装到 frame 对象后，执行 frame 对象。
- `PyEval_EvalFrameEx` 函数获取到 `pymain_main` 函数内初始化的 frame 执行函数，默认为 `_PyEval_EvalFrameDefault`。
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
`_PyEval_EvalFrameDefault` 是真正字节码执行的函数，其中所有依赖的上下文都来自 frame 对象，其中包含了一个巨大的 `switch` 代码块，用于执行给定的字节码，即从代码对象中读取到的每一条字节码都依次在一个无限循环中通过 `switch-case` 来逐个执行。到此，我们了解到 Python 是如何把用户提供的程序变成可以执行的字节码，以及针对不同的字节码是如何处理的。
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
下面我们先先通过 `dis` 查看 `demo.py` 的字节码，然后在分析它如何在 `_PyEval_EvalFrameDefault` 函数中执行的。
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
在编译得到的字节码中，`LOAD_CONST` 从 code 对象的常量表里获取到对象，然后压入 `frame` 的值栈中，接着 `STORE_NAME` 从名字常量元组中获得变量名 `'x'`，将栈顶元素弹出，然后存储到 `locals` 中，完成 `x = 1` 的赋值操作。同理，`y = 1` 也一样。然后，`LOAD_NAME` 从 `locals` 里读取到变量 `x` 和 `y` 的值，并分别压入栈中，`BINARY_ADD` 先弹出一个栈顶对象，在获取到当前的栈顶对象，调用 `PyNumber_Add` 函数执行两个对象求和，将结果设置为栈顶。然后通过 `STORE_NAME` 赋值到变量 `z`。紧接着继续将 `print` 和 `z` 压入栈，调用 `CALL_FUNCTION` 执行 `print` 函数。然后 `POP_TOP` 弹出 `print` 的返回值，最后返回 `None` 完成 `frame` 的执行后退出。

到此，我们了解到 CPython 是基于一条条字节码的执行来实现运行我们编码的程序，而字节码的运行是基于栈实现的。因此研究每个 Python 提供的功能，首先需要了解其通过什么字节码实现的（如通过 `dis` 模块能够便捷的实现这一点），然后再从字节码的实现顺着调用栈就可以了解具体的实现逻辑。

## 附：code 对象是什么？
code 对象是封装编译 Python 源码后的对象，由 `PyCodeObject` 定义，是 `PyCode_Type` 的实例。`PyCodeObject` 的结构如下，是一个静态对象，即编译后就不会发生改变以及只会在内存中存在一份。
```c
/* codeobject.h */
typedef struct {
    PyObject_HEAD
    int co_argcount;            /* #arguments, except *args */
    int co_posonlyargcount;     /* #positional only arguments */
    int co_kwonlyargcount;      /* #keyword only arguments */
    int co_nlocals;             /* #local variables */
    int co_stacksize;           /* #entries needed for evaluation stack */
    int co_flags;               /* CO_..., see below */
    int co_firstlineno;         /* first source line number */
    PyObject *co_code;          /* instruction opcodes */
    PyObject *co_consts;        /* list (constants used) */
    PyObject *co_names;         /* list of strings (names used) */
    PyObject *co_varnames;      /* tuple of strings (local variable names) */
    PyObject *co_freevars;      /* tuple of strings (free variable names) */
    PyObject *co_cellvars;      /* tuple of strings (cell variable names) */
    /* The rest aren't used in either hash or comparisons, except for co_name,
       used in both. This is done to preserve the name and line number
       for tracebacks and debuggers; otherwise, constant de-duplication
       would collapse identical functions/lambdas defined on different lines.
    */
    Py_ssize_t *co_cell2arg;    /* Maps cell vars which are arguments. */
    PyObject *co_filename;      /* unicode (where it was loaded from) */
    PyObject *co_name;          /* unicode (name, for reference) */
    PyObject *co_lnotab;        /* string (encoding addr<->lineno mapping) See
                                   Objects/lnotab_notes.txt for details. */
    void *co_zombieframe;       /* for optimization only (see frameobject.c) */
    PyObject *co_weakreflist;   /* to support weakrefs to code objects */
    /* Scratch space for extra data relating to the code object.
       Type is a void* to keep the format private in codeobject.c to force
       people to go through the proper APIs. */
    void *co_extra;

    /* Per opcodes just-in-time cache
     *
     * To reduce cache size, we use indirect mapping from opcode index to
     * cache object:
     *   cache = co_opcache[co_opcache_map[next_instr - first_instr] - 1]
     */

    // co_opcache_map is indexed by (next_instr - first_instr).
    //  * 0 means there is no cache for this opcode.
    //  * n > 0 means there is cache in co_opcache[n-1].
    unsigned char *co_opcache_map;
    _PyOpcache *co_opcache;
    int co_opcache_flag;  // used to determine when create a cache.
    unsigned char co_opcache_size;  // length of co_opcache.
} PyCodeObject;
```
我们通过分析如下几个源码编译的案例，了解其中各字段的含义。首先定义一个函数 `print_code` 用于输出 code 对象暴露给用户的属性。
```python
def print_code(code):
    for name in dir(code):
        if name.startswith('co_') and (v := getattr(code, name)):
            print(f'{name}: {v}')
```
第一个案例为编译 `x = 1` 得到的 code 对象中各字段的取值。
```python
>>> c = compile('x = 1', '<stdin>', 'exec')
>>> print_code(c)
# 源码编译后的经压缩的操作码字节序列
co_code: b'd\x00Z\x00d\x01S\x00'
# 常量表，表示程序所有使用到的常量对象 tuple
co_consts: (1, None)
# 文件名，表示源码来自什么地方
co_filename: <stdin>
# 提供了如函数、类、模块等代码段在源文件的起始位置
co_firstlineno: 1
# 标志位，表明代码段是否是生成器、coroutine 等
co_flags: 64
# 代码对象的名称，如模块名、函数名或类名等
co_name: <module>
# 如全局变量名、属性名、函数名的常量表，不包含局部变量名
co_names: ('x',)
# 执行过程需要的最大栈深
co_stacksize: 1
```
第二个案例是编译一个具有不同传参方式的函数 `f`。Python 的函数传参方式大概可以分为如下几种：普通位置传参，指如 `f(1, 2, 3)` 这种通过相对位置关系区分传递参数；positional-only 传参，指如只能以 `f(1, 2)` 方式传递参数，不能以如 `f(1, b=2)` 方式传递，因此是普通位置传参的子集；keyword-only 传参，指如只能以 `f(1, 2, 3, d=4)` 方式传参，不能以如 `f(1, 2, 3, 4)` 方式传递；可变传参：指以 *args 和 **kwargs 方式传递参数。
```python
>>> def f(a, b, /, c, *, d, e=5): pass
>>> print_code(demo.f.__code__)
# 普通位置参数个数；不包括 keyword-only 参数、*args、**kwargs
co_argcount: 3
co_code: b'd\x00S\x00'
co_consts: (None,)
co_filename: <stdin>
co_firstlineno: 1
co_flags: 67
# keyword-only 参数个数（仅限 k=v 传参）；不包括普通位置参数、*args、**kwargs；如 d 和 e
co_kwonlyargcount: 2
co_name: f
# 局部变量的个数
co_nlocals: 5
# positional-only 的参数个数（仅限位置传参）；不包括 *args、**kwargs；如 a 和 b
co_posonlyargcount: 2
co_stacksize: 1
# 局部变量名的常量表
co_varnames: ('a', 'b', 'c', 'd', 'e')
```
第三个案例编译一个具有函数闭包的函数 `f`。Python 中支持嵌套函数定义，允许内部函数引用外部函数的变量，那么就需要将引用的变量以特殊方式记录下来，以便于访问。在编译阶段，就能找出哪些变量属于函数闭包变量，分别存储在 `co_freevars` 和 `co_cellvars` 中。
```python
>>> def f(x):
...     def g(y):
...         return x + y
...     return g
...
>>> print_code(f.__code__)
co_argcount: 1
# 内嵌函数引用的局部变量名表
co_cellvars: ('x',)
co_code: b'\x87\x00f\x01d\x01d\x02\x84\x08}\x01|\x01S\x00'
co_consts: (None, <code object g at 0x1036ced40, file "<stdin>", line 2>, 'f.<locals>.g')
co_filename: <stdin>
co_firstlineno: 1
co_flags: 3
# 描述字节码指令和源码行号之间的映射关系，即一行源码对应几条字节码
co_lnotab: b'\x00\x01\x0c\x02'
co_name: f
co_nlocals: 2
co_stacksize: 3
co_varnames: ('x', 'g')

>>> g = f(10)
>>> print_code(g.__code__)
co_argcount: 1
co_code: b'\x88\x00|\x00\x17\x00S\x00'
co_consts: (None,)
co_filename: <stdin>
co_firstlineno: 2
co_flags: 19
# 引用外部函数的局部变量名表
co_freevars: ('x',)
co_lnotab: b'\x00\x01'
co_name: g
co_nlocals: 1
co_stacksize: 2
co_varnames: ('y',)
```
因此，总结来说 code 对象就是封装执行 Python 代码时的所需要信息的数据结构，属于只读对象，在 Python 层面修改其属性会引发 `AttributeError: readonly attribute` 错误。

## 附：frame 对象是什么？
frame 对象的功能是为 Python 的代码段提供执行环境，在 C 实现中定义为 `PyFrameObject`，是 `PyFrame_Type` 的实例。每当 Python 执行一个代码段就会建立一个新的 frame 对象，如调用函数、导入新模块、初始化类和调用方法等，这些部分可以视作不同的命名空间，因此需要不同的 frame 来存储如局部变量、全局变量的信息。如下为 `PyFrameObject` 的结构体定义：
```c
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
```
其中的字段如 `f_back` 是 frame 对象的单链表指针，当如调用一个函数时，建立新的 frame 对象中的 `f_back` 就会指向父层级的 frame 对象。`f_code` 就是 code 对象，即 frame 真正执行的字节码。`f_builtins` 指向 `__builtins__.__dict__`。`f_globals` 和 `f_locals` 表示代码段的全局变量和局部变量命名空间。`f_valuestack` 表示值栈的起始指针，而 `f_stacktop` 表示栈顶指针。`f_trace`、`f_trace_lines` 和 `f_trace_opcodes` 与调试和追踪机制相关。`f_gen` 在函数时生成器时会指向生成器函数对象。`f_lasti` 为指令计数器，表明当前执行到第几条字节码。`f_lineno` 表示当前正在执行的源码行号。`f_iblock` 和 `f_blockstack` 与 `with` 和 `try-catch-finally` 块执行相关。`f_localsplus` 是实现高效的访问执行期间的本地变量，如 `freevars`。

`inspect` 模块提供获取 `currentframe` 接口用于获取当前正在执行的 frame 对象。如下输出了 REPL 模式下 frame 对象的属性。
```python
>>> import inspect
>>> f = inspect.currentframe()
>>> f
<frame at 0x102cc9440, file '<stdin>', line 1, code <module>>
>>> for name in dir(f):
...     if name.startswith('f_'):
...             print(name, getattr(f, name))
...
f_back None
f_builtins {'__name__': 'builtins', ...}
f_code <code object <module> at 0x1028157a0, file "<stdin>", line 1>
f_globals {'__name__': '__main__', ...}
f_lasti 36
f_lineno 1
f_locals {'__name__': '__main__', ...}
f_trace None
f_trace_lines True
f_trace_opcodes False
```
