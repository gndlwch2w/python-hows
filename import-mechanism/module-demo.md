### 模块用例

#### 导入 Python 脚本文件

如示例中的 `pricing.py` 文件，可称之其为 Python 脚本或模块。其允许被其它模块通过 `import` 语法导入，模块中也允许导入其它模块，并允许模块内声明全局变量和函数等。模块是独立的代码块，即模块被导入时，会以单独的 @@frameobject@@ 执行它，然后将结果封装为 @@PyModule_Type@@ 类型对象（即 module 对象）。定义模块顶层成员会存入 module 的实例字典 \_\_dict__ 中，除显式声明的成员外，导入模块时还会自动往其对象实例字典中添加如 \_\_name__ 等成员。

```text
module-demo/
    └── example-01/
        └── pricing.py
```

```python
"""Calculating order prices module."""

TAX_RATE = 0.06

def subtotal(prices):
    return sum(prices)

def calculate_total(prices, discount=0):
    amount = subtotal(prices)
    return amount * (1 - discount) * (1 + TAX_RATE)
```

```python
>>> import pricing

>>> pricing
<module 'pricing' from '/.../pricing.py'>

>>> for k, v in pricing.__dict__.items():
...     print(k, v)
... 
__name__ pricing
__doc__ Calculating order prices module.
__package__ 
__loader__ <_frozen_importlib_external.SourceFileLoader object at 0x1057a7b30>
__spec__ ModuleSpec(name='pricing', loader=<_frozen_importlib_external.SourceFileLoader object at 0x1057a7b30>, origin='/.../pricing.py')
__file__ /.../pricing.py
__cached__ /.../__pycache__/pricing.cpython-38.pyc
__builtins__ {'__name__': 'builtins', ...}
TAX_RATE 0.06
subtotal <function subtotal at 0x1057f1bc0>
calculate_total <function calculate_total at 0x1057f1c60>
```

模块对象的额外成员的功能描述。

| 名称 | 描述 |
| -- | -- |
| \_\_name__       | 模块名称，如脚本名称 |
| \_\_doc__        | 模块文档，即定义在模块最开头的字符串 |
| \_\_package__    | 模块所属包，依据导入语法自动计算 |
| \_\_loader__     | 模块加载器，导入模块时负责加载模块的对象 |
| \_\_spec__       | 模块规格说明，查找模块时所搜集关于加载模块的信息 |
| \_\_file__       | 模块所处位置，脚本文件的绝对路径 |
| \_\_cached__     | 模块 pyc 缓存文件路径 |
| \_\_builtins__   | builtins 模块的 \_\_dict__ 副本 |

#### 执行 Python 脚本文件

例如如下的 `main.py` 模块，通常允许以 `python main.py` 方式进行执行。此时，默认创建一个名为 `__main__` 的模块进行执行，即通常情况下 `if __name__ == "__main__"` 的代码只有在直接执行时 `main.py` 才可能执行。

```text
module-demo/
    └── example-01/
        ├── pricing.py
        └── main.py
```

```python
import pricing

def main():
    sample_prices = [19.9, 35.0, 8.5]
    print(pricing.calculate_total(sample_prices))

if __name__ == "__main__":
    main()
```

#### 导入文件夹

如 `reportkit` 的文件夹可称为包，其中若包含 `__init__.py` 模块则称为普通包，否则称为命名空间包。可以看到，普通包本质上和模块一样，在导入时会封装为 module 对象，不过其文件位置指向的是 `__init__.py` 文件，也就是说，导入普通包时，会找到文件夹下的该文件进行执行。另外，包的 `__spec__.submodule_search_locations` 记录了子模块的搜索位置，以便于导入其中的子模块。最后，普通包中允许定义 `__main__.py` 模块，通过 `python -m reportkit` 命令可以执行它。

```text
module-demo/
    └── example-02/
        └── reportkit/
            ├── __init__.py
            ├── calculator.py
            ├── formatter.py
            ├── models.py
            └── __init__.py
```

```python
# reportkit/__init__.py
from .calculator import *
from .formatter import build_report
from .models import Order

# reportkit/calculator.py
from collections.abc import Iterable

__all__ = ["calculate_average", "calculate_total"]

def calculate_total(orders: Iterable) -> float:
    return sum(order.amount for order in orders)

def calculate_average(orders: Iterable) -> float:
    order_list = list(orders)
    if not order_list:
        return 0.0
    return calculate_total(order_list) / len(order_list)
```

```python
>>> import reportkit

>>> reportkit
<module 'reportkit' from '/.../reportkit/__init__.py'>

>>> for k, v in reportkit.__dict__.items():
...     print(k, v)
... 
__name__ reportkit
__doc__ None
__package__ reportkit
__loader__ <_frozen_importlib_external.SourceFileLoader object at 0x100ddca60>
__spec__ ModuleSpec(name='reportkit', loader=<_frozen_importlib_external.SourceFileLoader object at 0x100ddca60>, origin='/.../reportkit/__init__.py', submodule_search_locations=['/.../reportkit'])
__path__ ['/.../reportkit']
__file__ /.../reportkit/__init__.py
__cached__ /.../reportkit/__pycache__/__init__.cpython-38.pyc
__builtins__ {'__name__': 'builtins', ...>}
calculator <module 'reportkit.calculator' from '/.../reportkit/calculator.py'>
calculate_average <function calculate_average at 0x100f0b1f0>
calculate_total <function calculate_total at 0x100dc61f0>
formatter <module 'reportkit.formatter' from '/.../formatter.py'>
build_report <function build_report at 0x100f0b310>
Order <class 'reportkit.models.Order'>
```

当文件夹中不存在 `__init__.py` 文件，则会被视作为命名空间包，在 `sys.path` 的搜索路径中，允许多个同名的命名空间包，即允许不同机构同时为相同包扩展不同的插件或实现，它们可以放在不同的路径下或网络上。直接导入命名空间包，其也会被封装为 module 对象，只是没有任何脚本会被执行。该模块对象的作用是提供检索其子模块的信息，以便于后续导入其子模块。

```text
module-demo/
    └── example-03/
        ├── provider_json/
        |   └── reportkit_plugins
        |       └── json_exporter.py
        └── provider_text/
            └── reportkit_plugins
                └── text_exporter.py
```

```python
>>> sys.path.insert(0, "provider_json")
>>> sys.path.insert(0, "provider_text")
>>> import reportkit_plugins

>>> reportkit_plugins
<module 'reportkit_plugins' (namespace)>

>>> for k, v in reportkit_plugins.__dict__.items():
...     print(k, v)
... 
__name__ reportkit_plugins
__doc__ None
__package__ reportkit_plugins
__loader__ <_frozen_importlib_external._NamespaceLoader object at 0x1032be6d0>
__spec__ ModuleSpec(name='reportkit_plugins', loader=<_frozen_importlib_external._NamespaceLoader object at 0x1032be6d0>, submodule_search_locations=_NamespacePath(['/.../provider_text/reportkit_plugins', '/.../provider_json/reportkit_plugins']))
__file__ None
__path__ _NamespacePath(['/.../provider_text/reportkit_plugins', '/.../provider_json/reportkit_plugins'])
```
