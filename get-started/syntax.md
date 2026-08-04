## Python 语法实现

### 文本处理

Python 毫无疑问是一门编程语言，但本质上是一个命令处理器，即输入一个遵从所谓 Python 语法规范的文本，然后该软件会按照事先商定的协议完成文本相应的功能。那么如何描述规范语法和如何实现语法的相应功能是这类软件应该关心的，也是研究它们的实现时应该关心的。从 Python 源码文本到字节码的生成过程大概如下所示，

```mermaid
graph LR
   A["源码"]
   C["词法分析"]
   D["语法分析"]
   E["具体语法树 CST"]
   F["抽象语法树 AST"]
   G["符号表分析"]
   H["控制流与字节码生成"]
   I["代码对象"]
   A --> C --> D --> E --> F --> G --> H --> I
```

* 词法分析的目的是将源码 token 化为 token 流。该阶段只识别 token，不负责判断完整语句是否符合 Python 文法。token 通常可分为 NAME、NUMBER、STRING、OP 和结构化 Token，详细映射定义在 `Grammer/Tokens` 文件。

```python
>>> import tokenize
>>> from io import BytesIO
>>> code = BytesIO(b"c = a + b * 2")
>>> for t in tokenize.tokenize(code.readline):
...     print(tokenize.tok_name[t.type], t.string)
... 
ENCODING utf-8
NAME c
OP =
NAME a
OP +
NAME b
OP *
NUMBER 2
NEWLINE 
```

```text
Token
├── NAME
│   ├── 如 a、b、c 等变量名
│   ├── 如 for、class 等关键字
│   └── 如 print 等函数名
├── NUMBER
│   ├── 10
│   ├── 3.14
│   ├── 0xff
│   └── 2j
├── STRING
│   ├── "text"
│   ├── b"bytes"
│   └── f"{value}"
├── OP
│   ├── 如 +、-、*、// 等运算符
│   └── 如 (、)、:、, 等分隔符号
└── 结构 token
    ├── NEWLINE
    ├── INDENT
    ├── DEDENT
    └── ENDMARKER
```

* 语法分析阶段负责将 token 流转换为具体语法树 CST。具体来说，将 `Grammar/Grammar` 文件被交给解析器生成器，由其生成 LL(1) 解析表。运行时解析器根据当前语法状态和下一个 token，选择要进入的文法分支。如 `c = a + b * 2` 可依据 @@EBNF@@ 文法规则得到如下 CST 树，其保存大量文法层级和语法符号，作用是表达输入如何符合 Grammar 语法。

```python
file_input
└── stmt
    └── simple_stmt
        └── small_stmt
            └── expr_stmt
                ├── testlist_star_expr
                │   └── NAME("c")
                ├── '='
                └── testlist_star_expr
                    └── test
                        └── ...
                            └── arith_expr
                                ├── term
                                │   └── NAME("a")
                                ├── '+'
                                └── term
                                    ├── NAME("b")
                                    ├── '*'
                                    └── NUMBER("2")

>>> import libcst as cst
>>> cst.parse_module("c = a + b * 2")
Module(body=[
    SimpleStatementLine(body=[
        Assign(
            targets=[
                AssignTarget(
                    target=Name(value='c', lpar=[], rpar=[],),
                    whitespace_before_equal=SimpleWhitespace(value=' ',),
                    whitespace_after_equal=SimpleWhitespace(value=' ',),
                ),],
                value=BinaryOperation(
                    left=Name(value='a', lpar=[], rpar=[],),
                    operator=Add(
                        whitespace_before=SimpleWhitespace(value=' ',),
                        whitespace_after=SimpleWhitespace(value=' ',),
                    ),
                    right=BinaryOperation(
                        left=Name(value='b', lpar=[], rpar=[],),
                        operator=Multiply(
                            whitespace_before=SimpleWhitespace(value=' ',),
                            whitespace_after=SimpleWhitespace(value=' ',),
                        ),
                        right=Integer(value='2', lpar=[], rpar=[],),
                        lpar=[], rpar=[],
                    ),
                    lpar=[], rpar=[],),
                semicolon=MaybeSentinel.DEFAULT,
            ),
    ],
    leading_lines=[],
        trailing_whitespace=TrailingWhitespace(
            whitespace=SimpleWhitespace(value='',),
            comment=None,
            newline=Newline(value=None,),
        ),
    ),
],
header=[],
footer=[],
encoding='utf-8',
default_indent='    ',
default_newline='\n',
has_trailing_newline=False,)
```

* CST 随后转换为抽象语法树 AST，其删除了大量只为解析服务的中间节点，只保留程序的语义结构。类似地，如 `c = a + b * 2` 的 AST 树所示，其相比 CST 更简化，也更容易理解程序的语意。得到 AST 树之后，还要做 AST 合法性检查。这是由于 `Grammar/Grammar` 主要描述语法形状，但部分限制不能完全由 LL(1) 文法表达，如 `1 = value` 符合文法规则但不是合法的赋值目标，因此需要在 CST 转 AST 或编译阶段继续检查。

```python
>>> import ast
>>> ast.dump(ast.parse("c = a + b * 2"))
Module(body=[
    Assign(
        targets=[Name(id='c', ctx=Store())], 
        value=BinOp(
            left=Name(id='a', ctx=Load()), 
            op=Add(), 
            right=BinOp(
                left=Name(id='b', ctx=Load()),
                op=Mult(), 
                right=Constant(value=2, kind=None)
            )
        ), 
        type_comment=None
    )
], type_ignores=[])
```

* AST 合法后，下一步将建立符号表，即确定每个名称属于哪一种作用域，如局部变量、全局变量等。这些信息会影响后续操作变量的字节码，如全局变量使用 @@LOAD-STORE_GLOBAL@@ 字节码，而局部变量使用 @@LOAD-STORE_FAST@@ 字节码。

```python
code = """
x = 10
def foo(y):
    z = x + y
return z
"""

>>> import symtable
>>> st = symtable.symtable("""
... x = 10
... def foo(y):
...     z = x + y
... return z
... """, "example.py", "exec")

>>> for x in st.get_identifiers():
...     sym = st.lookup(x)
...     print(x, sym.is_global())
... 
x True
foo True
z True

>>> for child in st.get_children():
...     print(child)
...     print(child.get_parameters())
...     print(child.get_locals())
... 
<Function SymbolTable for foo in example.py>
('y',)
('y', 'z')
```

* 最后阶段是遍历 AST，根据节点类型生成控制流和字节码指令。编译的字节码通常存放到代码对象 @@codeobject@@ 中，其中不仅持有编译的字节码，还有各种关于代码块的状态信息，如常量表、值栈需求大小等。

```python
>>> from dis import dis
>>> compile("c = a + b * 2", "", "exec")
<code object <module> at 0x10553e870, file "", line 1>
>>> dis(_)
  1           0 LOAD_NAME                0 (a)
              2 LOAD_NAME                1 (b)
              4 LOAD_CONST               0 (2)
              6 BINARY_MULTIPLY
              8 BINARY_ADD
             10 STORE_NAME               2 (c)
             12 LOAD_CONST               1 (None)
             14 RETURN_VALUE
```

上面简单描述了从 Python 源码到字节码的重要环节，各步骤的算法已经十分成熟，同时也不是 Python 的独特之处，因此不过多讨论，更多的细节可参考 @@compiler-principle@@ 等资源。

### EBNF 规则

* 终结符是指不能再通过 `Grammar/Grammer` 展开，直接对应输入 token，如字面终结符 `'if'`、`'for'`、`'='` 等以及 token 类型终结符，如 NAME、NUMBER、INDENT 等。非终结符是其他语法规则的名称，可以递归展开。

* 文法记号，

    | 记号 |  含义 | 示例 |
    | -- | -- | -- |
    | `A B`       | 先匹配 A，再匹配 B | `'return' test` |
    | `A \| B`    | A 或 B | `simple_stmt \| compound_stmt` |
    | `[A]`       | A 可出现零次或一次 | `['else' ':' suite]` |
    | `A*`        | A 出现零次或多次 | `(',' test)*` |
    | `A+`        | A 至少出现一次 | `stmt+` |
    | `(A B)`     | 对规则进行分组 | `('+' term)` |
    | `'text'`    | 字面 token | `'if'` |
    | `NAME`      | token 类型 | 标识符 |
    | `xxx` | 非终结符 | `test` |

* 一条规则通常写成 `规则名称: 规则内容`，如 `stmt: simple_stmt | compound_stmt`，左侧的 `stmt` 定义非终结符，而右侧则描述它可以由哪些终结符和非终结符组成。

另外，需要说明 Python 3.8 采用 LL(1) 约束，即从左向右读取输入，构造最左推导，只看一个 token，因此两个候选分支不能具有无法区分的共同起始 token，如 `expr: expr '+' term | term`。

### 完整规则

Python 3.8 的完整语法规则在 @@grammar@@，如下以树状结构进行简化，以便于理解。总体语法结构如下，

```text
Python 3.8 Grammar
├── 输入入口
│   ├── file_input (脚本入口)
│   ├── single_input (单行命令)
│   ├── eval_input (eval() 输入)
│   └── func_type_input (PEP 484 type comment)
│
├── stmt (语句)
│   ├── simple_stmt (简单语句)
│   └── compound_stmt (符合语句)
│
├── 语句块 suite
│   ├── 单行 simple_stmt
│   └── 缩进块
│       └── NEWLINE INDENT stmt+ DEDENT
│
├── 表达式
│   ├── lambda 表达式
│   ├── 条件表达式
│   ├── 布尔表达式
│   ├── 比较表达式
│   ├── 位运算
│   ├── 算术运算
│   ├── 一元运算
│   ├── 幂运算
│   └── 原子与 trailer
│
├── 定义
│   ├── funcdef (def)
│   ├── async_funcdef (async def)
│   ├── classdef (class)
│   └── decorated (@ 装饰器)
│
├── 容器与推导式
│   ├── list ([a, b, c])
│   ├── tuple ((a, b, c))
│   ├── dict ({a=b})
│   ├── set ({a, b, c})
│   ├── generator (生成器)
│   ├── comp_for (i for i in xxx)
│   └── comp_if (c if a else b)
│
├── 调用与访问
│   ├── argument (参数)
│   ├── arglist (参数列表)
│   ├── trailer (obj.xxx, obj(xxx))
│   ├── subscript (obj[xxx])
│   └── slice (obj[a:b])
│
├── 导入
│   ├── import_name (import xxx)
│   └── import_from (from xxx import xxx)
│
└── 特殊表达式
    ├── yield_expr (yield xxx)
    ├── star_expr (*a)
    ├── namedexpr_test (a := b)
    └── await (await xxx)
```

* 简单语句，允许写在一行，也可由 `;` 分隔串在一行。

```text
stmt
├── simple_stmt
└── compound_stmt

simple_stmt
└── small_stmt (';' small_stmt)* [';'] NEWLINE

small_stmt
├── expr_stmt
├── del_stmt       ('del' exprlist)
├── pass_stmt      ('pass')
├── flow_stmt 
├── import_stmt 
├── global_stmt    ('global' NAME (',' NAME)*)
├── nonlocal_stmt  ('nonlocal' NAME (',' NAME)*)
└── assert_stmt    ('assert' test [',' test])

expr_stmt
├── testlist_star_expr  # 如 a, b, c = ... 中 = 的前面部分或 *xxx
│   └── (test | star_expr)
│       ├── (',' (test | star_expr))*  # 如 *a, b, *c
│       └── [',']
│
├── annassign
│   └── ':' test        # 如 x: int 或 x: int = y
│       └── ['=' (yield_expr | testlist_star_expr)]
│
├── augassign           # 如 x += 1
│   ├── +=
│   ├── -=
│   ├── *=
│   ├── @=
│   ├── /=
│   ├── %=
│   ├── &=
│   ├── |=
│   ├── ^=
│   ├── <<=
│   ├── >>=
│   ├── **=
│   └── //=
│
└── 普通赋值
    └── ('=' (yield_expr | testlist_star_expr))+
        └── [TYPE_COMMENT]

flow_stmt
├── break_stmt      # 'break'
├── continue_stmt   # 'continue'
├── return_stmt     # 'return' [testlist_star_expr]
├── raise_stmt      # 'raise' [test ['from' test]]
└── yield_stmt
    └── yield_expr  # 'yield' [yield_arg]
```

* 复合语句，

```text
compound_stmt
├── if_stmt
│   ├── 'if' namedexpr_test ':' suite
│   ├── ('elif' namedexpr_test ':' suite)*
│   └── ['else' ':' suite]
├── while_stmt
│   ├── 'while' namedexpr_test ':' suite
│   └── ['else' ':' suite]
├── for_stmt
│   ├── 'for' exprlist 'in' testlist ':' [TYPE_COMMENT] suite
│   └── ['else' ':' suite]
├── try_stmt
│   └── 'try' ':' suite
│       ├── except 形式
│       │   ├── (except_clause ':' suite)+
                # except_clause: 'except' [test ['as' NAME]]
│       │   ├── ['else' ':' suite]
│       │   └── ['finally' ':' suite]
│       └── finally 形式
│           └── 'finally' ':' suite
├── with_stmt
│   ├── 'with'
│   ├── with_item
│   │   └── test ['as' expr]
│   ├── (',' with_item)*
│   ├── ':'
│   ├── [TYPE_COMMENT]
│   └── suite
├── funcdef
│   ├── 'def' NAME parameters ['->' test] ':'
│   ├── [TYPE_COMMENT]
│   └── func_body_suite
├── classdef
│   ├── 'class' NAME ['(' [arglist] ')'] ':'
│   └── suite
├── decorated
│   └── decorators
│   │   └── decorator+
│   │       └── '@' dotted_name ['(' [arglist] ')'] NEWLINE
│   └── classdef | funcdef | async_funcdef
└── async_stmt
    └── ASYNC
        ├── funcdef
        ├── with_stmt
        └── for_stmt
```

* 表达式完整优先级树，从上到下，优先级逐渐升高。

```text
test
├── lambdef
│   └── 'lambda' [varargslist] ':' test
└── or_test ['if' or_test 'else' test]
    └── or_test ('or' and_test)*
        └── and_test ('and' not_test)*
            └── not_test
                ├── 'not' not_test
                └── comparison (comp_op expr)*
                    └── expr ('|' xor_expr)*
                        └── xor_expr ('^' and_expr)*
                            └── and_expr ('&' shift_expr)*
                                └── shift_expr (('<<' | '>>') arith_expr)*
                                    └── arith_expr (('+' | '-') term)*
                                        └── term (('*' | '@' | '/' | '%' | '//') factor)*
                                            └── factor
                                                ├── ('+' | '-' | '~') factor
                                                └── power ['**' factor]
                                                    └── atom_expr [AWAIT] trailer*
                                                        └── atom
                                                            ├── '(' [yield_expr | testlist_comp] ')'
                                                            ├── '[' [testlist_comp] ']'
                                                            ├── '{' [dictorsetmaker] '}'
                                                            ├── NAME
                                                            ├── NUMBER
                                                            ├── STRING+
                                                            ├── '...'
                                                            └── 'None' | 'True' | 'False'

低优先级
│
├── lambda
├── x if condition else y
├── or
├── and
├── not
├── < <= == != >= > in is
├── |
├── ^
├── &
├── << >>
├── + -
├── * @ / // %
├── 一元 + - ~
├── **
├── await
├── 调用、下标、属性访问
└── atom
│
高优先级
```

* 基本对象和推导式，

```text
testlist_comp
├── namedexpr_test | star_expr
└── 二选一
    ├── comp_for
    │   ├── [ASYNC]
    │   └── sync_comp_for
    │       ├── 'for'
    │       ├── exprlist
    │       ├── 'in'
    │       ├── or_test
    │       └── [comp_iter]
    │           ├── comp_for
    │           └── comp_if
    │               ├── 'if'
    │               ├── test_nocond
    │               └── [comp_iter]
    └── (',' (namedexpr_test | star_expr))* [',']

dictorsetmaker
├── 字典形式
│   ├── test ':' test
│   ├── '**' expr
│   ├── comp_for
│   └── 逗号分隔的字典项
└── 集合形式
    ├── test
    ├── star_expr
    ├── comp_for
    └── 逗号分隔的集合项
```
