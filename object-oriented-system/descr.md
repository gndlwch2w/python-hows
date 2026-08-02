## 描述器

描述器是一类实现了特殊接口的类型，描述器对象被广泛用于如成员访问系统的设计，详细用例可参考 @@descriptor-guide@@。如下所示，描述器是指实现了 @@__get__[1]@@、@@__set__[1]@@ 或 @@__delete__[1]@@ 中任意接口的类型。

* @@__get__@@ 接口的作用是返回一个值，其中 *obj* 和 *objtype* 分别表示描述器对象所支持访问的实例对象及其类型，返回的值与二者相关。

* @@__set__@@ 接口即为 *obj* 设置一个值 *value*，相应 @@__delete__@@ 接口为删除 *obj* 的某个成员。

一般来说，若描述器仅实现了 @@__get__[1]@@ 接口则称为非数据描述器，若进而实现了 @@__set__[1]@@ 或 @@__delete__[1]@@ 接口则称为数据描述器。此外，若描述器具有 @@Py_TPFLAGS_METHOD_DESCRIPTOR@@ 标记时，表明 @@__get__@@ 返回的是可调用对象，其中：

* `meth.__get__(obj, cls)(*args, **kwds)` (其中 *obj* 不为 *None*) 必须等价于 `meth(obj, *args, **kwds)` 表明方法调用。

* `meth.__get__(None, cls)(*args, **kwds)` 必须等价于 `meth(*args, **kwds)` 表明函数调用。

对于成员访问而言，描述器类似 @@JavaBeans@@ 中为属性实习的 getter 和 setter 接口。

```python
class Descr:
    def __get__(self, obj, objtype=None): pass
    def __set__(self, obj, value):        pass
    def __delete__(self, obj):            pass
```

在 @@PyTypeObject@@ 中，上述描述器接口分别对应到 @@tp_descr_get@@ 和 @@tp_descr_set@@ 槽，当写入的值为 *NULL* 时表明删除。
