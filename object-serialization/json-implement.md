### JSON 实现

对于序列化接口的实现，当用户使用默认参数的情况下，由单例编码器 *_default_encoder* 提供支持，否则由 `cls or JSONEncoder` 提供支持。另外，流形式输出由 iterencode() 序列化，字符串形式输出由 encode() 序列化。

```python
# Lib/json/__init__.py#_default_encoder
_default_encoder = JSONEncoder(
    skipkeys=False,
    ensure_ascii=True,
    check_circular=True,
    allow_nan=True,
    indent=None,
    separators=None,
    default=None,
)

# Lib/json/__init__.py#dump
def dump(obj, fp, *, skipkeys=False, ensure_ascii=True, check_circular=True,
        allow_nan=True, cls=None, indent=None, separators=None,
        default=None, sort_keys=False, **kw):
    # cached encoder
    if (not skipkeys and ensure_ascii and
        check_circular and allow_nan and
        cls is None and indent is None and separators is None and
        default is None and not sort_keys and not kw):
        # 使用默认参数配置情况
        iterable = _default_encoder.iterencode(obj)
    else:
        if cls is None:
            cls = JSONEncoder
        iterable = cls(skipkeys=skipkeys, ensure_ascii=ensure_ascii,
            check_circular=check_circular, allow_nan=allow_nan, indent=indent,
            separators=separators,
            default=default, sort_keys=sort_keys, **kw).iterencode(obj)
    # could accelerate with writelines in some versions of Python, at
    # a debuggability cost
    for chunk in iterable:
        fp.write(chunk)

# Lib/json/__init__.py#dumps
def dumps(obj, *, skipkeys=False, ensure_ascii=True, check_circular=True,
        allow_nan=True, cls=None, indent=None, separators=None,
        default=None, sort_keys=False, **kw):
    # cached encoder
    if (not skipkeys and ensure_ascii and
        check_circular and allow_nan and
        cls is None and indent is None and separators is None and
        default is None and not sort_keys and not kw):
        # 使用默认参数配置情况
        return _default_encoder.encode(obj)
    if cls is None:
        cls = JSONEncoder
    return cls(
        skipkeys=skipkeys, ensure_ascii=ensure_ascii,
        check_circular=check_circular, allow_nan=allow_nan, indent=indent,
        separators=separators, default=default, sort_keys=sort_keys,
        **kw).encode(obj)
```

编码器是一个生产者，有两种实现，当需要一次性生成序列化字符串且无需格式化输出时，由性能更好的 C 实现，其它情况下由 Python 的生成器实现。

```python
# Lib/json/encoder.py#JSONEncoder
class JSONEncoder(object):
    item_separator = ', '
    key_separator = ': '
    def __init__(self, *, skipkeys=False, ensure_ascii=True,
            check_circular=True, allow_nan=True, sort_keys=False,
            indent=None, separators=None, default=None):
        self.skipkeys = skipkeys
        self.ensure_ascii = ensure_ascii
        self.check_circular = check_circular
        self.allow_nan = allow_nan
        self.sort_keys = sort_keys
        self.indent = indent
        if separators is not None:
            self.item_separator, self.key_separator = separators
        elif indent is not None:
            self.item_separator = ','
        if default is not None:
            self.default = default

    def default(self, o):
        raise TypeError(f'Object of type {o.__class__.__name__} '
                        f'is not JSON serializable')

    def encode(self, o):
        # This is for extremely simple cases and benchmarks.
        if isinstance(o, str):
            if self.ensure_ascii:
                return encode_basestring_ascii(o)
            else:
                return encode_basestring(o)
        # This doesn't pass the iterator directly to ''.join() because the
        # exceptions aren't as detailed.  The list call should be roughly
        # equivalent to the PySequence_Fast that ''.join() would do.
        chunks = self.iterencode(o, _one_shot=True)
        if not isinstance(chunks, (list, tuple)):
            chunks = list(chunks)
        return ''.join(chunks)

    def iterencode(self, o, _one_shot=False):
        if self.check_circular:
            markers = {}
        else:
            markers = None
        if self.ensure_ascii:
            _encoder = encode_basestring_ascii
        else:
            _encoder = encode_basestring

        def floatstr(o, allow_nan=self.allow_nan,
                _repr=float.__repr__, _inf=INFINITY, _neginf=-INFINITY):
            # Check for specials.  Note that this type of test is processor
            # and/or platform-specific, so do tests which don't depend on the
            # internals.

            if o != o:
                text = 'NaN'
            elif o == _inf:
                text = 'Infinity'
            elif o == _neginf:
                text = '-Infinity'
            else:
                return _repr(o)

            if not allow_nan:
                raise ValueError(
                    "Out of range float values are not JSON compliant: " +
                    repr(o))

            return text

        if (_one_shot and c_make_encoder is not None
                and self.indent is None):
            _iterencode = c_make_encoder(
                markers, self.default, _encoder, self.indent,
                self.key_separator, self.item_separator, self.sort_keys,
                self.skipkeys, self.allow_nan)
        else:
            _iterencode = _make_iterencode(
                markers, self.default, _encoder, self.indent, floatstr,
                self.key_separator, self.item_separator, self.sort_keys,
                self.skipkeys, _one_shot)
        return _iterencode(o, 0)
```

* 对于 Python 实现的生成器函数，一个有趣的实现是，将生成器热点访问的全局对象设置到函数参数中，这样内部访问时则由快速局部变量数组提供访问，相比查询全局字典更快。生产过程以递归形式实现，即采取先访问的深度优先遍历。另外，其没有对 chunk 大小进行假设，生成器以非常细的粒度实现序列化结果输出以适应上层的需求。

```python
# Lib/json/encoder.py#_make_iterencode
def _make_iterencode(markers, _default, _encoder, _indent, _floatstr,
        _key_separator, _item_separator, _sort_keys, _skipkeys, _one_shot,
        ## HACK: hand-optimized bytecode; turn globals into locals
        ValueError=ValueError,
        dict=dict,
        float=float,
        id=id,
        int=int,
        isinstance=isinstance,
        list=list,
        str=str,
        tuple=tuple,
        _intstr=int.__repr__,
    ):

    if _indent is not None and not isinstance(_indent, str):
        _indent = ' ' * _indent

    def _iterencode_list(lst, _current_indent_level):
        if not lst:
            yield '[]'
            return
        if markers is not None:
            markerid = id(lst)
            if markerid in markers:
                raise ValueError("Circular reference detected")
            markers[markerid] = lst
        buf = '['
        if _indent is not None:
            _current_indent_level += 1
            newline_indent = '\n' + _indent * _current_indent_level
            separator = _item_separator + newline_indent
            buf += newline_indent
        else:
            newline_indent = None
            separator = _item_separator
        first = True
        for value in lst:
            if first:
                # 第一个元素 '[' 后不需要加分隔符
                first = False
            else:
                # 其他元素前需要加分隔符
                buf = separator
            if isinstance(value, str):
                yield buf + _encoder(value)
            elif value is None:
                yield buf + 'null'
            elif value is True:
                yield buf + 'true'
            elif value is False:
                yield buf + 'false'
            elif isinstance(value, int):
                # Subclasses of int/float may override __repr__, but we still
                # want to encode them as integers/floats in JSON. One example
                # within the standard library is IntEnum.
                yield buf + _intstr(value)
            elif isinstance(value, float):
                # see comment above for int
                yield buf + _floatstr(value)
            else:
                # <separator><value>
                yield buf
                if isinstance(value, (list, tuple)):
                    chunks = _iterencode_list(value, _current_indent_level)
                elif isinstance(value, dict):
                    chunks = _iterencode_dict(value, _current_indent_level)
                else:
                    chunks = _iterencode(value, _current_indent_level)
                yield from chunks
        if newline_indent is not None:
            _current_indent_level -= 1
            yield '\n' + _indent * _current_indent_level
        yield ']'
        if markers is not None:
            del markers[markerid]

    def _iterencode_dict(dct, _current_indent_level):
        if not dct:
            yield '{}'
            return
        if markers is not None:
            markerid = id(dct)
            if markerid in markers:
                raise ValueError("Circular reference detected")
            markers[markerid] = dct
        yield '{'
        if _indent is not None:
            _current_indent_level += 1
            newline_indent = '\n' + _indent * _current_indent_level
            item_separator = _item_separator + newline_indent
            yield newline_indent
        else:
            newline_indent = None
            item_separator = _item_separator
        first = True
        if _sort_keys:
            items = sorted(dct.items())
        else:
            items = dct.items()
        for key, value in items:
            # 转换 key 为字符串类型
            if isinstance(key, str):
                pass
            # JavaScript is weakly typed for these, so it makes sense to
            # also allow them.  Many encoders seem to do something like this.
            elif isinstance(key, float):
                # see comment for int/float in _make_iterencode
                key = _floatstr(key)
            elif key is True:
                key = 'true'
            elif key is False:
                key = 'false'
            elif key is None:
                key = 'null'
            elif isinstance(key, int):
                # see comment for int/float in _make_iterencode
                key = _intstr(key)
            elif _skipkeys:
                continue
            else:
                raise TypeError(f'keys must be str, int, float, bool or None, '
                                f'not {key.__class__.__name__}')

            # 如果是第一个元素，不需要加分隔符
            if first:
                first = False
            else:
                yield item_separator
            yield _encoder(key)
            yield _key_separator
            if isinstance(value, str):
                yield _encoder(value)
            elif value is None:
                yield 'null'
            elif value is True:
                yield 'true'
            elif value is False:
                yield 'false'
            elif isinstance(value, int):
                # see comment for int/float in _make_iterencode
                yield _intstr(value)
            elif isinstance(value, float):
                # see comment for int/float in _make_iterencode
                yield _floatstr(value)
            else:
                if isinstance(value, (list, tuple)):
                    chunks = _iterencode_list(value, _current_indent_level)
                elif isinstance(value, dict):
                    chunks = _iterencode_dict(value, _current_indent_level)
                else:
                    chunks = _iterencode(value, _current_indent_level)
                yield from chunks
        if newline_indent is not None:
            _current_indent_level -= 1
            yield '\n' + _indent * _current_indent_level
        yield '}'
        if markers is not None:
            del markers[markerid]

    def _iterencode(o, _current_indent_level):
        if isinstance(o, str):
            yield _encoder(o)
        elif o is None:
            yield 'null'
        elif o is True:
            yield 'true'
        elif o is False:
            yield 'false'
        elif isinstance(o, int):
            # see comment for int/float in _make_iterencode
            yield _intstr(o)
        elif isinstance(o, float):
            # see comment for int/float in _make_iterencode
            yield _floatstr(o)
        elif isinstance(o, (list, tuple)):
            yield from _iterencode_list(o, _current_indent_level)
        elif isinstance(o, dict):
            yield from _iterencode_dict(o, _current_indent_level)
        else:
            if markers is not None:
                markerid = id(o)
                if markerid in markers:
                    raise ValueError("Circular reference detected")
                markers[markerid] = o
            o = _default(o)
            yield from _iterencode(o, _current_indent_level)
            if markers is not None:
                del markers[markerid]
    return _iterencode
```

* 对于 C 实现，其基本逻辑与 Python 相似，其产生的中间字符串对象由 _PyAccu 进行管理，为避免频繁的字符串拼接以及过多的碎片小字符串，其设定 *100_000* 个小字符串做一次长拼接，最终结果再由各长字符串拼接得到。由于 C 的实现没有频繁的上下文切换，也无需频繁的字符拼接、字节码校验等等，故处理效率比 Python 高，缺点是不支持流式输出。

```c
// Modules/_json.c#PyInit__json
PyMODINIT_FUNC
PyInit__json(void)
{
    PyObject *m = PyModule_Create(&jsonmodule);
    ...
    if (PyModule_AddObject(m, "make_encoder", (PyObject*)&PyEncoderType) < 0) {
        Py_DECREF((PyObject*)&PyEncoderType);
        goto fail;
    }
    return m;
  fail:
    Py_DECREF(m);
    return NULL;
}

// Modules/_json.c#PyEncoderType
static
PyTypeObject PyEncoderType = {
    PyVarObject_HEAD_INIT(NULL, 0)
    "_json.Encoder",       /* tp_name */
    sizeof(PyEncoderObject), /* tp_basicsize */
    0,                    /* tp_itemsize */
    ...
    encoder_call,         /* tp_call */
    ...
    encoder_new,          /* tp_new */
    ...
};

// Include/internal/pycore_accu.h#_PyAccu
typedef struct {
    PyObject *large;  /* A list of previously accumulated large strings */
    PyObject *small;  /* Pending small strings */
} _PyAccu;

// Objects/accu.c#_PyAccu_Init
int
_PyAccu_Init(_PyAccu *acc)
{
    /* Lazily allocated */
    acc->large = NULL;
    acc->small = PyList_New(0);
    if (acc->small == NULL)
        return -1;
    return 0;
}

// Objects/accu.c#_PyAccu_Accumulate
int
_PyAccu_Accumulate(_PyAccu *acc, PyObject *unicode)
{
    Py_ssize_t nsmall;
    assert(PyUnicode_Check(unicode));

    if (PyList_Append(acc->small, unicode))
        return -1;
    nsmall = PyList_GET_SIZE(acc->small);
    /* Each item in a list of unicode objects has an overhead (in 64-bit
     * builds) of:
     *   - 8 bytes for the list slot
     *   - 56 bytes for the header of the unicode object
     * that is, 64 bytes.  100000 such objects waste more than 6 MiB
     * compared to a single concatenated string.
     */
    if (nsmall < 100000)
        return 0;
    return flush_accumulator(acc);
}

// Objects/accu.c#flush_accumulator
static int
flush_accumulator(_PyAccu *acc)
{
    Py_ssize_t nsmall = PyList_GET_SIZE(acc->small);
    if (nsmall) {
        int ret;
        PyObject *joined;
        if (acc->large == NULL) {
            acc->large = PyList_New(0);
            if (acc->large == NULL)
                return -1;
        }
        joined = join_list_unicode(acc->small);
        if (joined == NULL)
            return -1;
        if (PyList_SetSlice(acc->small, 0, nsmall, NULL)) {
            Py_DECREF(joined);
            return -1;
        }
        ret = PyList_Append(acc->large, joined);
        Py_DECREF(joined);
        return ret;
    }
    return 0;
}
```

* 细粒度字符串流演示，上层应用为实现更高的传输效率，可缓存一定长度的输出后再传输。

```python
>>> for x in json._default_encoder.iterencode({
...     "aZ91": [
...         "hello",
...         ("x7P", {"kQ2": "abc"})
...     ],
...     "mn82": ("test", ["A1", "B2"])
... }):
...     print(x)
... 
{
"aZ91"
: 
["hello"
, 
["x7P"
, 
{
"kQ2"
: 
"abc"
}
]
]
, 
"mn82"
: 
["test"
, 
["A1"
, "B2"
]
]
}
```

反序列化由 `JSONDecoder.decode()` 完成，与编码不一样的地方在于，解码的遍历是深度优先后访问，这使得对象由内向外构建，同时 *object_hook* 和 *object_pairs_hook* 回调也是由内向外被调用的。最后，有关字符串的解析暂未关注。

```python
# Lib/json/__init__.py#_default_decoder
_default_decoder = JSONDecoder(object_hook=None, object_pairs_hook=None)

# Lib/json/__init__.py#load
def load(fp, *, cls=None, object_hook=None, parse_float=None,
        parse_int=None, parse_constant=None, object_pairs_hook=None, **kw):
    return loads(fp.read(),
        cls=cls, object_hook=object_hook,
        parse_float=parse_float, parse_int=parse_int,
        parse_constant=parse_constant, object_pairs_hook=object_pairs_hook, **kw)

# Lib/json/__init__.py#loads
def loads(s, *, cls=None, object_hook=None, parse_float=None,
        parse_int=None, parse_constant=None, object_pairs_hook=None, **kw):
    if isinstance(s, str):
        if s.startswith('\ufeff'):
            raise JSONDecodeError("Unexpected UTF-8 BOM (decode using utf-8-sig)",
                                  s, 0)
    else:
        if not isinstance(s, (bytes, bytearray)):
            raise TypeError(f'the JSON object must be str, bytes or bytearray, '
                            f'not {s.__class__.__name__}')
        s = s.decode(detect_encoding(s), 'surrogatepass')

    if "encoding" in kw:
        import warnings
        warnings.warn(
            "'encoding' is ignored and deprecated. It will be removed in Python 3.9",
            DeprecationWarning,
            stacklevel=2
        )
        del kw['encoding']

    if (cls is None and object_hook is None and
            parse_int is None and parse_float is None and
            parse_constant is None and object_pairs_hook is None and not kw):
        return _default_decoder.decode(s)
    if cls is None:
        cls = JSONDecoder
    if object_hook is not None:
        kw['object_hook'] = object_hook
    if object_pairs_hook is not None:
        kw['object_pairs_hook'] = object_pairs_hook
    if parse_float is not None:
        kw['parse_float'] = parse_float
    if parse_int is not None:
        kw['parse_int'] = parse_int
    if parse_constant is not None:
        kw['parse_constant'] = parse_constant
    return cls(**kw).decode(s)

# Lib/json/__init__.py#JSONDecoder
class JSONDecoder(object):
    def __init__(self, *, object_hook=None, parse_float=None,
            parse_int=None, parse_constant=None, strict=True,
            object_pairs_hook=None):
        self.object_hook = object_hook
        self.parse_float = parse_float or float
        self.parse_int = parse_int or int
        self.parse_constant = parse_constant or _CONSTANTS.__getitem__
        self.strict = strict
        self.object_pairs_hook = object_pairs_hook
        self.parse_object = JSONObject
        self.parse_array = JSONArray
        self.parse_string = scanstring
        self.memo = {}
        self.scan_once = scanner.make_scanner(self)

    def decode(self, s, _w=WHITESPACE.match):
        obj, end = self.raw_decode(s, idx=_w(s, 0).end())
        end = _w(s, end).end()
        if end != len(s):
            raise JSONDecodeError("Extra data", s, end)
        return obj

    def raw_decode(self, s, idx=0):
        try:
            obj, end = self.scan_once(s, idx)
        except StopIteration as err:
            raise JSONDecodeError("Expecting value", s, err.value) from None
        return obj, end
```