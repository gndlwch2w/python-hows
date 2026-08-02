### 装饰函数

有关函数装饰器设计的讨论在 @@PEP-318@@ 中提及，以及 @@function-creation@@ 中的 @@BNF@@ 语法也描述了在函数声明之前允许使用 `@decorator` 进行装饰，下面分析装饰器的实现原理。对于函数 f()，最终的函数对象 *f* 相当于是 `decorate2(decorate1(f))` 调用的结果。而对于有参的装饰器，即对于函数 g()，最终的函数对象 *g* 相当于是 `decomaker(a, b, c)(g)` 调用的结果。

```python
@decorate2
@decorate1
def f(*args, **kwargs): 
    pass

@decomaker(a, b, c)
def g(*args, **kwargs):
    pass

>>> dis(f.__code__)
  1           0 LOAD_NAME                0 (decorate2)

  2           2 LOAD_NAME                1 (decorate1)

  3           4 LOAD_CONST               0 (<code object f at 0x10100a0e0, line 1>)
              6 LOAD_CONST               1 ('f')
              8 MAKE_FUNCTION            0
             10 CALL_FUNCTION            1
             12 CALL_FUNCTION            1
             14 STORE_NAME               2 (f)
             16 LOAD_CONST               2 (None)
             18 RETURN_VALUE

Disassembly of <code object f at 0x10100a0e0, line 1>:
  4           0 LOAD_CONST               0 (None)
              2 RETURN_VALUE

>>> dis(g.__code__)
  2           0 LOAD_NAME                0 (decomaker)
              2 LOAD_NAME                1 (a)
              4 LOAD_NAME                2 (b)
              6 LOAD_NAME                3 (c)
              8 CALL_FUNCTION            3

  3          10 LOAD_CONST               0 (<code object g at 0x10100a450, file "<dis>", line 2>)
             12 LOAD_CONST               1 ('g')
             14 MAKE_FUNCTION            0
             16 CALL_FUNCTION            1
             18 STORE_NAME               4 (g)
             20 LOAD_CONST               2 (None)
             22 RETURN_VALUE

Disassembly of <code object g at 0x10100a450, file "<dis>", line 2>:
  4           0 LOAD_CONST               0 (None)
              2 RETURN_VALUE
```

一般来说，原始函数对象会替换为装饰器返回的函数对象，此时的对象会丢失原始函数的元信息（如函数名称、文档等），可以给返回的包装函数进行如 `@wraps(f)` 的包装，即可将原始函数对象 *f* 的元信息拷贝到包装函数之上。展开来看，即 `wraps(f)(wrapper)`，`wraps(f)` 返回的 update_wrapper() 作用到 *wrapper* 之上，先将 *f* 在 *WRAPPER_ASSIGNMENTS* 中定义的属性拷贝到 *wrapper* 和将 *f* 在 *WRAPPER_UPDATES* 中定义的属性更新到 *wrapper*，再返回 *wrapper*。

```python
from functools import wraps

def decorate(f):
    @wraps(f)
    def wrapper(*args, **kwds):
        print('Calling decorated function')
        return f(*args, **kwds)
    return wrapper

@decorate
def f():
    """Docstring"""
    print("Called example function")

# Lib/functools.py#update_wrapper
WRAPPER_ASSIGNMENTS = ('__module__', '__name__', '__qualname__', '__doc__',
                       '__annotations__')
WRAPPER_UPDATES = ('__dict__',)
def update_wrapper(wrapper,  # 包装函数
                   wrapped,  # 原始函数
                   assigned = WRAPPER_ASSIGNMENTS,
                   updated = WRAPPER_UPDATES):
    """Update a wrapper function to look like the wrapped function

       wrapper is the function to be updated
       wrapped is the original function
       assigned is a tuple naming the attributes assigned directly
       from the wrapped function to the wrapper function (defaults to
       functools.WRAPPER_ASSIGNMENTS)
       updated is a tuple naming the attributes of the wrapper that
       are updated with the corresponding attribute from the wrapped
       function (defaults to functools.WRAPPER_UPDATES)
    """
    for attr in assigned:
        try:
            value = getattr(wrapped, attr)
        except AttributeError:
            pass
        else:
            setattr(wrapper, attr, value)
    for attr in updated:
        getattr(wrapper, attr).update(getattr(wrapped, attr, {}))
    # Issue #17482: set __wrapped__ last so we don't inadvertently copy it
    # from the wrapped function when updating __dict__
    wrapper.__wrapped__ = wrapped
    # Return the wrapper so this can be used as a decorator via partial()
    return wrapper

# Lib/functools.py#wraps
def wraps(wrapped,
          assigned = WRAPPER_ASSIGNMENTS,
          updated = WRAPPER_UPDATES):
    """Decorator factory to apply update_wrapper() to a wrapper function

       Returns a decorator that invokes update_wrapper() with the decorated
       function as the wrapper argument and the arguments to wraps() as the
       remaining arguments. Default arguments are as for update_wrapper().
       This is a convenience function to simplify applying partial() to
       update_wrapper().
    """
    return partial(update_wrapper, wrapped=wrapped,
                   assigned=assigned, updated=updated)
```
