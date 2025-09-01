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

## 附：`codeobject` 是什么？
