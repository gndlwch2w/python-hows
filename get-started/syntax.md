```peg
file_input
└── (NEWLINE | stmt)* ENDMARKER

single_input
├── NEWLINE
├── simple_stmt
└── compound_stmt NEWLINE

eval_input
└── testlist NEWLINE* ENDMARKER

stmt
├── simple_stmt
│   └── small_stmt (';' small_stmt)* [';'] NEWLINE
│       ├── expr_stmt
│       ├── del_stmt
│       ├── pass_stmt
│       ├── flow_stmt
│       │   ├── break_stmt | continue_stmt
│       │   ├── return_stmt [testlist_star_expr]
│       │   ├── yield_stmt (yield_expr)
│       │   └── raise_stmt ['from' test]
│       ├── import_stmt
│       │   ├── import_name ('import' dotted_as_names)
│       │   └── import_from ('from' ... 'import' ...)
│       ├── global_stmt | nonlocal_stmt
│       └── assert_stmt
└── compound_stmt
    ├── if_stmt | while_stmt | for_stmt
    ├── try_stmt | with_stmt
    ├── funcdef | async_funcdef | classdef
    ├── decorated
    └── async_stmt (ASYNC ...)

compound_stmt
├── if_stmt
│   └── 'if' namedexpr_test ':' suite
│       ('elif' namedexpr_test ':' suite)*
│       ['else' ':' suite]
├── while_stmt
│   └── 'while' namedexpr_test ':' suite ['else' ':' suite]
├── for_stmt
│   └── 'for' exprlist 'in' testlist ':' [TYPE_COMMENT] suite
│       ['else' ':' suite]
├── try_stmt
│   └── 'try' ':' suite
│       ( (except_clause ':' suite)+ ['else' ':' suite] ['finally' ':' suite]
│       | 'finally' ':' suite )
├── with_stmt
│   └── 'with' with_item (',' with_item)* ':' [TYPE_COMMENT] suite
├── funcdef / async_funcdef
├── classdef
├── decorated (decorators + def/class)
└── async_stmt (ASYNC (funcdef | with_stmt | for_stmt))

suite
├── simple_stmt
└── NEWLINE INDENT stmt+ DEDENT

test
├── lambdef
│   └── 'lambda' [varargslist] ':' test
└── or_test ['if' or_test 'else' test]  # 三元表达式
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
                                                            ├── 'None' | 'True' | 'False'

funcdef
├── 'def' NAME parameters ['->' test] ':' [TYPE_COMMENT] func_body_suite
│   └── func_body_suite
│       ├── simple_stmt
│       └── NEWLINE [TYPE_COMMENT NEWLINE] INDENT stmt+ DEDENT

parameters
└── '(' [typedargslist] ')'

typedargslist / varargslist  # 位置参数、/、*、**、关键字-only
└── (tfpdef ['=' test] ... | '*' ... | '**' ... )  # 完整展开见 Grammar（支持 / 分隔 pos-only）

classdef
└── 'class' NAME ['(' [arglist] ')'] ':' suite

decorators
└── decorator+
    └── '@' dotted_name ['(' [arglist] ')'] NEWLINE

async_funcdef
└── ASYNC funcdef

argument
├── test [comp_for]
├── test ':=' test
├── test '=' test
├── '*' test
└── '**' test

import_stmt
├── import_name
│   └── 'import' dotted_as_names
│       └── dotted_as_name (',' ...)*
│           └── dotted_name ['as' NAME]
│               └── NAME ('.' NAME)*
└── import_from
    └── 'from' (('.' | '...')* dotted_name | ('.' | '...')+)
        'import' ('*' | '(' import_as_names ')' | import_as_names)

yield_expr
└── 'yield' [yield_arg]
    ├── 'from' tests
    └── testlist_star_expr

comp_for / comp_if                   # 推导式
├── [ASYNC] 'for' exprlist 'in' or_test [comp_iter]
└── 'if' test_nocond [comp_iter]
```

```peg
file_input
└── (NEWLINE | stmt)* ENDMARKER

single_input
├── NEWLINE
├── simple_stmt
└── compound_stmt NEWLINE

eval_input
└── testlist NEWLINE* ENDMARKER

stmt
├── simple_stmt
└── compound_stmt

simple_stmt
└── small_stmt (';' small_stmt)* [';'] NEWLINE

small_stmt
├── expr_stmt
├── del_stmt
│   └── 'del' exprlist
├── pass_stmt
│   └── 'pass'
├── flow_stmt
│   ├── break_stmt      # 'break'
│   ├── continue_stmt   # 'continue'
│   ├── return_stmt     # 'return' [testlist_star_expr]
│   ├── yield_stmt      # yield_expr
│   └── raise_stmt      # 'raise' [test ['from' test]]
├── import_stmt
├── global_stmt
│   └── 'global' NAME (',' NAME)*
├── nonlocal_stmt
│   └── 'nonlocal' NAME (',' NAME)*
└── assert_stmt
    └── 'assert' test [',' test]

expr_stmt
└── testlist_star_expr
    ├── annassign
    │   └── ':' test ['=' (yield_expr | testlist_star_expr)]         # 标注赋值 x: int = 5
    ├── augassign (yield_expr | testlist)                            # 增强赋值 x += 1
    │   └── ('+=' | '-=' | '*=' | '@=' | '/=' | '%=' |
    │        '&=' | '|=' | '^=' | '<<=' | '>>=' | '**=' | '//=')
    └── [ ('=' (yield_expr | testlist_star_expr))+ [TYPE_COMMENT] ]  # 普通赋值（可链式 a = b = c = 1）

testlist_star_expr
└── (test | star_expr) (',' (test | star_expr))* [',']
    └── star_expr
        └── '*' expr  # 解包表达式 *args

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
                                └── shift_expr (('<<'|'>>') arith_expr)*
                                    └── arith_expr (('+'|'-') term)*
                                        └── term (('*'|'@'|'/'|'%'|'//') factor)*
                                            └── factor
                                                ├── ('+'|'-'|'~') factor
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

compound_stmt
├── if_stmt
│   └── 'if' namedexpr_test ':' suite
│       ('elif' namedexpr_test ':' suite)*
│       ['else' ':' suite]
├── while_stmt
│   └── 'while' namedexpr_test ':' suite ['else' ':' suite]
├── for_stmt
│   └── 'for' exprlist 'in' testlist ':' [TYPE_COMMENT] suite
│       ['else' ':' suite]
├── try_stmt
│   └── 'try' ':' suite
│       ( (except_clause ':' suite)+ ['else' ':' suite] ['finally' ':' suite]
│       | 'finally' ':' suite )
├── with_stmt
│   └── 'with' with_item (',' with_item)* ':' [TYPE_COMMENT] suite
├── funcdef / async_funcdef
├── classdef
│   └── 'class' NAME ['(' [arglist] ')'] ':' suite
├── decorated
│   └── decorators (funcdef | classdef | async_funcdef)
└── async_stmt
    └── ASYNC (funcdef | with_stmt | for_stmt)

funcdef
├── 'def' NAME parameters ['->' test] ':' [TYPE_COMMENT] func_body_suite

parameters
└── '(' [typedargslist] ')'
    # 支持位置参数、/、*args、关键字-only、**kwargs 等完整形式

classdef
└── 'class' NAME ['(' [arglist] ')'] ':' suite

import_stmt
├── import_name
│   └── 'import' dotted_as_names
│       └── dotted_as_name (',' dotted_as_name)*
│           └── dotted_name ['as' NAME]
│               └── NAME ('.' NAME)*
└── import_from
    └── 'from' (('.' | '...')* dotted_name | ('.' | '...')+)
        'import' ('*' | '(' import_as_names ')' | import_as_names)
```

```peg
test
├── lambdef
│   └── test
└── or_test (or)
    └── and_test (and)
        └── not_test (not)
            └── comparison (<, >, ==, is, in, ...)
                └── expr (|)
                    └── xor_expr (^)
                        └── and_expr (&)
                            └── shift_expr (<<, >>)
                                └── arith_expr (+, -)
                                    └── term (*, @, /, //, %)
                                        └── factor (+, -, ~)
                                            └── power (**)
                                                └── atom_expr ((), [], .)
                                                    └── atom
                                                        ├── NAME
                                                        ├── NUMBER
                                                        ├── STRING
                                                        ├── (...)
                                                        ├── [...]
                                                        ├── {...}
                                                        └── ...
```