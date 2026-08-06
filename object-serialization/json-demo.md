### JSON 序列化用例

#### 序列化接口

* json.dump(obj, fp, *, skipkeys=False, ensure_ascii=True, check_circular=True, allow_nan=True, cls=None, indent=None, separators=None, default=None, sort_keys=False, **kw)

* json.dumps(obj, *, skipkeys=False, ensure_ascii=True, check_circular=True, allow_nan=True, cls=None, indent=None, separators=None, default=None, sort_keys=False, **kw)

```python
>>> import json
>>> 
>>> json.dumps({
...   "dict": {"k": "v"},
...   "list": [1, 2, 3],
...   "str": "hahha",
...   "number": [1234, 1e-3, 3.140],
...   "bool": [True, False],
...   "None": None
... })
'{"dict": {"k": "v"}, "list": [1, 2, 3], "str": "hahha", '
'"number": [1234, 0.001, 3.14], "bool": [true, false], "None": null}'

>>> json.dumps({("k",): "v"})
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
TypeError: keys must be str, int, float, bool or None, not tuple
>>> json.dumps({("k",): "v"}, skipkeys=True)
'{}'

>>> json.dumps("中文")
'"\\u4e2d\\u6587"'
>>> json.dumps("中文", ensure_ascii=False)
'"中文"'

>>> d = {"k": "v"}
>>> d["d"] = d
>>> json.dumps(d)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
ValueError: Circular reference detected
>>> json.dumps(d, check_circular=False)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
RecursionError: maximum recursion depth exceeded while encoding a JSON object

>>> json.dumps([float("-nan"), float("inf")])
'[NaN, Infinity]'
>>> json.dumps([float("-nan"), float("inf")], allow_nan=False)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
ValueError: Out of range float values are not JSON compliant

>>> json.dumps(datetime.now())
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
TypeError: Object of type datetime is not JSON serializable
>>> class MyEncoder(json.JSONEncoder):
...     def default(self, o):
...         if isinstance(o, datetime):
...             return o.strftime("%Y-%m-%d %H:%M:%S")
...         return super().default(o)
...
>>> json.dumps(datetime.now(), cls=MyEncoder)
'"2026-08-06 10:45:22"'

>>> json.dumps({"k1": "v1", "k2": {"kk1": "vv2"}})
'{"k1": "v1", "k2": {"kk1": "vv2"}}'
>>> print(json.dumps({"k1": "v1", "k2": {"kk1": "vv2"}}, indent=2))
{
  "k1": "v1",
  "k2": {
    "kk1": "vv2"
  }
}

>>> json.dumps({"k1": "v1", "k2": [1, 2, 3]})
'{"k1": "v1", "k2": [1, 2, 3]}'
>>> json.dumps({"k1": "v1", "k2": [1, 2, 3]}, separators=('@', '*'))
'{"k1"*"v1"@"k2"*[1@2@3]}'

>>> def to_time(o):
...     if isinstance(o, datetime):
...         return o.strftime("%Y-%m-%d %H:%M:%S")
...     raise TypeError
... 
>>> json.dumps(datetime.now(), default=to_time)
'"2026-08-06 10:53:03"'

>>> json.dumps({"k2": "v2", "k1": "v1"})
'{"k2": "v2", "k1": "v1"}'
>>> json.dumps({"k2": "v1", "k1": "v1"}, sort_keys=True)
'{"k1": "v1", "k2": "v1"}'

>>> class MyEncoder(json.JSONEncoder):
...     def __init__(self, **kwargs):
...         print("MyEncoder", kwargs.pop("hahha", None))
...         super().__init__(**kwargs)
... 
>>> json.dumps(1, cls=MyEncoder)
MyEncoder None
'1'
>>> json.dumps(1, cls=MyEncoder, hahha=2)
MyEncoder 2
'1'
```

#### 反序列化接口

* json.load(fp, *, cls=None, object_hook=None, parse_float=None, parse_int=None, parse_constant=None, object_pairs_hook=None, **kw)

* json.loads(s, *, cls=None, object_hook=None, parse_float=None, parse_int=None, parse_constant=None, object_pairs_hook=None, **kw)

```python
>>> import json
>>>
>>> json.loads(
...     '{"dict": {"k": "v"}, '
...     '"list": [1, 2, 3], '
...     '"str": "hahha", '
...     '"number": [1234, 0.001, 3.14], '
...     '"bool": [true, false], '
...     '"None": null}'
... )
{'dict': {'k': 'v'}, 'list': [1, 2, 3], 'str': 'hahha', 
'number': [1234, 0.001, 3.14], 'bool': [True, False], 'None': None}

>>> json.loads('"中文"')
'中文'
>>> json.loads('"\\u4e2d\\u6587"')
'中文'

>>> json.loads(b'{"k": "v"}')
{'k': 'v'}
>>> json.loads(bytearray(b'[1, 2, 3]'))
[1, 2, 3]

>>> json.loads("{'k': 'v'}")
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: 
line 1 column 2 (char 1)

>>> json.loads('{"k": True}')
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
json.decoder.JSONDecodeError: Expecting value: line 1 column 7 (char 6)

>>> json.loads('{"k": 1}{"k": 2}')
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
json.decoder.JSONDecodeError: Extra data: line 1 column 9 (char 8)

>>> try:
...     json.loads('{1.2: 3.4}')
... except json.JSONDecodeError as e:
...     print(e.msg, e.pos, e.lineno, e.colno)
...
Expecting property name enclosed in double quotes 1 1 2

>>> def as_datetime(d):
...     if "__datetime__" in d:
...         return datetime.strptime(d["__datetime__"], "%Y-%m-%d %H:%M:%S")
...     return d
...
>>> json.loads('{"__datetime__": "2026-08-06 10:45:22"}', object_hook=as_datetime)
datetime.datetime(2026, 8, 6, 10, 45, 22)

>>> def show_object(d):
...     print("object_hook:", d)
...     return d
...
>>> json.loads('{"outer": {"inner": 1}}', object_hook=show_object)
object_hook: {'inner': 1}
object_hook: {'outer': {'inner': 1}}
{'outer': {'inner': 1}}

>>> json.loads('{"x": 1, "x": 2, "x": 3}')
{'x': 3}

>>> json.loads('{"x": 1, "x": 2, "x": 3}', object_pairs_hook=list)
[('x', 1), ('x', 2), ('x', 3)]

>>> def reject_duplicate_keys(pairs):
...     result = {}
...     for k, v in pairs:
...         if k in result:
...             raise ValueError("duplicate key: {!r}".format(k))
...         result[k] = value
...     return result
...
>>> json.loads('{"x": 1, "x": 2}', object_pairs_hook=reject_duplicate_keys)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
ValueError: duplicate key: 'x'

>>> level = 0
>>> def show_pairs(pairs):
...     global level
...     print(f"show_pairs-{level}", pairs)
...     level += 1
...     return pairs
... 
>>> json.loads('{"x": 1, "y": {"z": 2}}', object_pairs_hook=show_pairs)
show_pairs-0 [('z', 2)]
show_pairs-1 [('x', 1), ('y', [('z', 2)])]
[('x', 1), ('y', [('z', 2)])]

>>> json.loads(
...     '{"k": "v"}',
...     object_hook=lambda d: "object_hook",
...     object_pairs_hook=lambda pairs: "object_pairs_hook"
... )
'object_pairs_hook'

>>> json.loads('1.10', parse_float=Decimal)
Decimal('1.10')
>>> json.loads(
...     '[1, 1.20, 1e3]', 
...     parse_int=lambda s: ("int", s), 
...     parse_float=lambda s: ("float", s)
... )
...
[('int', '1'), ('float', '1.20'), ('float', '1e3')]
>>> json.loads('[NaN, Infinity, -Infinity]')
[nan, inf, -inf]
>>> def reject_constant(value):
...     raise ValueError(f"invalid JSON constant: {value}")
...
>>> json.loads('[NaN, Infinity, -Infinity]', parse_constant=reject_constant)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
ValueError: invalid JSON constant: NaN
>>> json.loads('[NaN, Infinity, -Infinity]', parse_constant=lambda value: None)
[None, None, None]

>>> json.loads('"line1\nline2"')
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  ...
json.decoder.JSONDecodeError: Invalid control character at: line 1 column 7 (char 6)
>>> json.loads('"line1\nline2"', strict=False)
'line1\nline2'

>>> class MyDecoder(json.JSONDecoder):
...     def __init__(self, **kwargs):
...         print("MyDecoder", kwargs.pop("hahha", None))
...         super().__init__(**kwargs)
...
>>> json.loads('1', cls=MyDecoder)
MyDecoder None
1
>>> json.loads('1', cls=MyDecoder, hahha=2)
MyDecoder 2
1

>>> class DateTimeDecoder(json.JSONDecoder):
...     def __init__(self, **kwargs):
...         kwargs["object_hook"] = self.object_hook
...         super().__init__(**kwargs)
...
...     @staticmethod
...     def object_hook(d):
...         value = d.get("__datetime__")
...         if value is None:
...             return d
...         return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
...
>>> json.loads('{"__datetime__": "2026-08-06 10:53:03"}', cls=DateTimeDecoder)
datetime.datetime(2026, 8, 6, 10, 53, 3)
```
