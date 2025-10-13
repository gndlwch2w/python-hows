## 什么是类和对象？
各种面向对象编程语言中都有类的概念和支持。如在 Java 中，实现了一组技术来支持面向对象协议。`class` 关键字允许用户可自定义类。`extends` 和 `implements` 关键字实现类的继承，子类可以**继承**父类的属性或方法，也可以覆盖父类的方法。同时，父类或接口的引用能够依据具体实例的继承关系**动态**的调用合适的方法。`pulic`、`protected` 和 `private` 支持对类别成员进行不同访问级别的**封装**。
```java
interface Animal {
    public String speak();
}

class Felidae {
    /* 封装 */
    protected String fullName;
    public Felidae(String fullName) {
        this.fullName = fullName;
    }
    public String getFullName() {
        return self.fullName;
    }
}

/* 继承 */
public class Cat extends Felidae implements Animal {
    public Cat() {
        super("Felis silvestris catus");
    }
    public Cat(String fullName) {
        super(fullName);
    }
    /* 覆盖 */
    @Override
    public void speak() {
        System.out.println(getFullName() + " says: Meow!");
    }
}

class Tiger extends Felidae implements Animal {
    public Tiger() {
        super("Panthera tigris");
    }
    @Override
    public void speak() {
        System.out.println(getFullName() + " says: Roar!");
    }
}

class Main {
    public static void main(String[] args) {
        Animal cat = new Cat("Kitty");
        Animal tiger = new Tiger();
        /* 多态 */
        cat.speak();
        // Kitty says: Meow!
        tiger.speak();
        // Panthera tigris says: Roar!
    }
}
```
上述三个特性，几乎所有面向对象编程语言都支持，Python 同样也不例外。而对于多态，由于 Python 为弱类型的动态语言，从用户视角来看，几乎所有调用都是多态的。在 Python 中，通过 `class` 关键字可以类似 Java 那样定义类，在类名紧接着的括号内可以指定要继承的类且支持多继承，在类的声明里可以定义成员、继承或覆盖父类的成员。对于访问级别，Python 采用在成员名称的定义规则上实现：`_var` 对应 `protected` 变量、`__var` 对应到 `private` 变量、其它则为 `pulic` 变量。如下是上述案例的 Python 实现：
```python
class Animal:
    def speak(self):
        raise NotImplementedError("speak")

class Felidae:
    def __init__(self, full_name):
        # 封装
        self._full_name = full_name
    def get_full_name(self):
        return self._full_name

# 继承
class Cat(Felidae, Animal):
    def __init__(self, full_name=None):
        super(Cat, self).__init__(full_name or "Felis silvestris catus")
    # 覆盖
    def speak(self):
        print(f"{self.get_full_name()} says: Meow!")

class Tiger(Felidae, Animal):
    def __init__(self):
        super(Tiger, self).__init__("Panthera tigris")
    def speak(self):
        print(f"{self.get_full_name()} says: Roar!")

if __name__ == "__main__":
    cat = Cat("Kitty")
    tiger = Tiger()
    # 多态
    cat.speak()
    # Kitty says: Meow!
    tiger.speak()
    # Panthera tigris says: Roar!
```
我们输出上述创建的类 `Cat` 和对象 `cat`，以关键字 `class` 定义的 `Cat` 是一个 class，实例化的 `cat` 是一个 object。到这里，我们大致了解到无论是 Java 还是 Python，类就是通过 class 关键字定义的一种满足面向对象协议的结构，而对象就是依据类（或模板）实例化出来的内存表示。
```python
>>> Cat
<class '__main__.Cat'>
>>> cat
<__main__.Cat object at 0x100a75bb0>
```
更进一步，我们输出 Python 暴露给用户的其他接口。似乎发现了一些不一样：数、字符串、函数、方法、常量以及类本身都是某种 class 的实例对象。按上述观点，可以说 `2147483647` 是 `int` 的实例，而 `int` 是 `type` 的实例，`type` 是自身的实例。
```python
>>> int
<class 'int'>
>>> type(int)
<class 'type'>
>>> type(2147483647)
<class 'int'>
>>> type(type)
<class 'type'>
>>> type(3.1415926)
<class 'float'>
>>> type("Hello, Python")
<class 'str'>
>>> type(print)
<class 'builtin_function_or_method'>
>>> type(...)
<class 'ellipsis'>
>>> type(None)
<class 'NoneType'>
>>> type(lambda: 0)
<class 'function'>
>>> type(object().__init__)
<class 'method-wrapper'>
>>> super
<class 'super'>
```
这因此得出一个结论，不同于 Java 或其它语言那样，Python 向用户暴露的界面都是对象，即用户看到的所有东西都是对象，包括如数、字符串、函数、方法、类和模块等都是对象。那么从面向对象角度来说，对象或实例都是有类型的，表明它们是从哪实例化（或模板是什么）。为此 Python 中每个对象都可以通过 `type(obj)` 获取它们的类型；另外，我们总可以通过 `obj.member` 的方式来访问它们暴露的属性或方法。另外，我们看到类本身也是对象，因此也有类型，默认为 `type`。

一般我们指类的类型为元类（meta class），其它对象的类型为类（class）。例如，通过 `def` 或 `lambda` 定义的函数对象是 `function` 类型的实例，而 `function` 类型对象本身是 `type` 类型的实例，这里的 `function` 称为 class，而 `type` 称为 meta class。

另一个有趣的观察是，Python 的所有对象都是仿佛都是同一*类型*的对象。我们研究如下的函数 `f`，先不将 `f` 视作为函数而是一个普通的数据结构（如图结构那样，包含顶点集和边集成员）。通过 `dir(f)` 看到 `f` 这种数据结构包含有很多成员（这里的成员不区分属性和方法），而这些成员本身也如同 `f` 一样具有相同的成员，也就是说 `f` 的数据结构和其递归成员的数据结构应当派生自同一父数据结构，而它们作为父数据结构的扩展，拥有独特成员。从用户视角看，`f` 和其成员应该在某个层面上具有相同的类型。上述的输出也能说明，如函数的类型是 `function`，`function` 的类型是 `type`，可以广义的说所有对象的类型都是 `type`。通常所说的类型只是第一层级的类型，如 `123` 的类型为 `int` 而不是 `type`。
```python
>>> f = lambda: 0
>>> dir(f)
['__annotations__', '__call__', '__class__', '__closure__', '__code__', '__defaults__', '__delattr__', 
'__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__get__', '__getattribute__', 
'__globals__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__kwdefaults__', '__le__', '__lt__', 
'__module__', '__name__', '__ne__', '__new__', '__qualname__', '__reduce__', '__reduce_ex__', '__repr__', 
'__setattr__', '__sizeof__', '__str__', '__subclasshook__']
>>> set(dir(f)) & set(dir(f.__name__))
{'__setattr__', '__format__', '__le__', '__init_subclass__', '__gt__', '__reduce__', '__str__', 
'__getattribute__', '__subclasshook__', '__hash__', '__lt__', '__init__', '__reduce_ex__', '__class__', 
'__new__', '__eq__', '__repr__', '__doc__', '__delattr__', '__ne__', '__sizeof__', '__dir__', '__ge__'}
>>> set(dir(f)) - set(dir(f.__name__))
{'__globals__', '__get__', '__defaults__', '__name__', '__call__', '__module__', '__kwdefaults__', '__code__', 
'__qualname__', '__closure__', '__annotations__', '__dict__'}
```

综合上述的观察，要想实现这样的效果（即实现层面），设计思想为将所有的东西都视作为具有某种性质的数据，然后以某种方式定义数据结构 `D` 来承载这些数据，并为这些数据结构提供相关的操作函数 `F`。然后关键是再定义另一个数据结构 `T` 将 `D` 和 `F` 封装起来，并为 `T` 提供统一的接口来访问封装的 `D` 和 `F`。例如，对应到上面提到的函数 `f`，`D` 定义了 `f` 的属性；`F` 定义了相关的操作方法；`T` 以统一的方式封装 `f` 的 `D` 和 `F` 后向外暴露接口，称 `T` 为 `f` 的类型。而又由于所有的对象都是按照这个逻辑实现，那么对所有对象的访问都是一致的，因此可以做到同样的接口作用到不同类型的对象上。这里统一的接口如 `type()`、`id()` 和 `dir()` 等，其作用到具体的数据结构 `D` 上，然后从 `D` 中获得 `T`，然后调用 `T` 的相关函数实现对 `D` 访问。

进一步可以将 `D` 和 `F` 划分为两个子集。子集的第一部分为所有类型数据结构成员的交集，第二部分为特有的成员集。这样可以将共有的部分统一增加到数据结构 `T` 上，那么等同于给所有数据结构暴露统一的接口，然后将 `T` 视作为特殊的 `D`，提供默认的接口实现。那么对于任意 `D`，其 `F` 中若提供了相应接口实现则覆盖，否则继承默认。对于子集的第二部分，可以通过定义某种协议将特有属性和方法封装起来，然后提供相应的函数去访问它们，最后在 `T` 的操作函数中统一二者便能实现统一的接口。

对于 C 实现的内置对象来说，直接提供相应的 `D`、`F` 和 `T` 即可。另一类特殊的对象是 Python 层面用户自定义的 class，其中综合包含了这三部分。所需要做的是，创建 `T` 的新实例，将用户提供的成员和方法分别封装到对应的位置，这样也同其它任何对象一样支持相同的访问接口，那么就可以得到自定义类型的 class。而实例化的时候，只用封装其类型 `T` 和初始化新的实例字段，便可以得到实例 `D`。

具体到 CPython 的实现层面，其将数据结构 `D` 定义为 `PyObject` 的结构体，不过这里对数据结构的成员也做了抽象，而不是直接具体实现某一个 `D`。如上面提到任意数据结构 `D` 具有其类型 `T`，那么这个属性就是所有数据结构共有的，可以将其单独抽离作为所有数据结构的前缀。这样还可以额外获得一个益处，即任意子数据结构指针都可以转换为这种类型指针，那么统一了所有 `T` 接口的输入输出数据结构类型，然后将实际的类型转换下调到具体的实现中，因为 `F` 中的操作函数肯定是明确类型就是 `D`。如下为 `PyObject` 的定义：
```c
/* object.h */
#define _PyObject_HEAD_EXTRA
#define PyObject_HEAD                   PyObject ob_base;

/* Nothing is actually declared to be a PyObject, but every pointer to
 * a Python object can be cast to a PyObject*.  This is inheritance built
 * by hand.  Similarly every pointer to a variable-size Python object can,
 * in addition, be cast to PyVarObject*.
 */
typedef struct _object {
    _PyObject_HEAD_EXTRA
    Py_ssize_t ob_refcnt;
    struct _typeobject *ob_type;
} PyObject;

typedef struct {
    PyObject ob_base;
    Py_ssize_t ob_size; /* Number of items in variable part */
} PyVarObject;
```
作为所有数据结构的共同属性，其中仅定义了两个字段，`ob_refcnt` 为引用计数，与垃圾回收有关；`ob_type` 为该对象的类型对象。它的一个扩展 `PyVarObject`，在其基础上增加了 `ob_size` 属性表明内存需求可变数据结构的可变部分所占内存大小，这样的对象如 `int`、`tuple`、`type` 和 `str` 等。需要它的原因是由于 `PyObject` 在分配内存后不会再进行移动或 `remalloc` 操作，这是因为移动操作会导致所有与该对象有关的指针都需要调整，故直接不允许移动操作来简化系统复杂度。

前面提到，需要数据结构 `T` 作用是统一封装 `D` 和 `F`，并暴露统一的接口，而 `T` 本身也是特殊的 `D`，相关的 `F` 就是向外暴露的接口。在 CPython 中它是一个 `PyObject`，定义为 `PyTypeObject`，各字段的注释参考自：[PyTypeObject](https://docs.python.org/zh-cn/3.8/c-api/typeobj.html#c.PyTypeObject)。可以看到其中包含了所有对象共有的函数接口，如 `tp_as_number`、`tp_as_sequence` 和 `tp_as_mapping` 等；也包含了共有的属性，如 `tp_name` 和 `tp_doc` 等。而特有的属性和方法通过 `tp_methods` 和 `tp_members` 相应的协议进行封装，并有相应的函数支持访问。这里仅对 `PyTypeObject` 的作用说明，暂不对其各字段的功能做讨论，具体到运用由其它章节涉及。
```c
/* cpython/object.h */
typedef struct _typeobject {
    PyObject_VAR_HEAD
    const char *tp_name; /* For printing, in format "<module>.<name>", sush as __main__.Cat */
    Py_ssize_t tp_basicsize, tp_itemsize; /* For allocation */

    /* Methods to implement standard operations */

    /* 指向实例析构函数的指针 */
    destructor tp_dealloc;
    /* vectorcall 协议函数指针偏移 */
    Py_ssize_t tp_vectorcall_offset;
    /* 该字段已弃用。当它被定义时，应该和 tp_getattro 指向同一个函数，但接受一个 C 字符串参数表示属性名，而不是 Python 字符串对象 */
    getattrfunc tp_getattr;
    /* 该字段已弃用。当它被定义时，应该和 tp_setattro 指向同一个函数，但接受一个 C 字符串参数表示属性名，而不是 Python 字符串对象 */
    setattrfunc tp_setattr;
    /* 指向一个包含仅与在 C 层级上实现 awaitable 和 asynchronous iterator 协议的对象相关联的字段的附加结构体 */
    PyAsyncMethods *tp_as_async; /* formerly known as tp_compare (Python 2)
                                    or tp_reserved (Python 3) */
    /* 一个实现了内置函数 repr() 的函数的可选指针 */
    reprfunc tp_repr;

    /* Method suites for standard classes */

    /* 指向一个附加结构体的指针，其中包含只与执行数字协议的对象相关的字段 */
    PyNumberMethods *tp_as_number;
    /* 指向一个附加结构体的指针，其中包含只与执行序列协议的对象相关的字段 */
    PySequenceMethods *tp_as_sequence;
    /* 指向一个附加结构体的指针，其中包含只与执行映射协议的对象相关的字段 */
    PyMappingMethods *tp_as_mapping;

    /* More standard operations (here for binary compatibility) */

    /* 一个指向实现了内置函数 hash() 的函数的可选指针 */
    hashfunc tp_hash;
    /* 一个可选的实现对象调用的指向函数的指针，如果对象不是可调用对象则该值应为 NULL */
    ternaryfunc tp_call;
    /* 一个可选的实现内置 str() 操作的函数的指针 */
    reprfunc tp_str;
    /* 一个指向获取属性字符串函数的可选指针 */
    getattrofunc tp_getattro;
    /* 一个指向函数以便设置和删除属性的可选指针 */
    setattrofunc tp_setattro;

    /* Functions to access object as input/output buffer */
    PyBufferProcs *tp_as_buffer;

    /* Flags to define presence of optional/expanded features */
    unsigned long tp_flags;

    const char *tp_doc; /* Documentation string */

    /* Assigned meaning in release 2.0 */
    /* call function for all accessible objects */
    /* An optional pointer to a traversal function for the garbage collector */
    traverseproc tp_traverse;

    /* delete references to contained objects */
    /* An optional pointer to a clear function for the garbage collector */
    inquiry tp_clear;

    /* Assigned meaning in release 2.1 */
    /* rich comparisons */
    richcmpfunc tp_richcompare;

    /* weak reference enabler */
    Py_ssize_t tp_weaklistoffset;

    /* Iterators */
    /* An optional pointer to a function that returns an iterator for the object */
    getiterfunc tp_iter;
    /* An optional pointer to a function that returns the next item in an iterator */
    iternextfunc tp_iternext;

    /* Attribute descriptor and subclassing stuff */
    /* 一个可选的指向 PyMethodDef 结构体的以 NULL 结束的静态数组的指针，它声明了此类型的常规方法 */
    struct PyMethodDef *tp_methods;
    /* 一个可选的指向 PyMemberDef 结构体的以 NULL 结束的静态数组的指针，它声明了此类型的常规数据成员（字段或槽位） */
    struct PyMemberDef *tp_members;
    /* 一个可选的指向 PyGetSetDef 结构体的以 NULL 结束的静态数组的指针，它声明了此类型的实例中的被计算属性 */
    struct PyGetSetDef *tp_getset;
    /* 一个可选的指向类型特征属性所继承的基类型的指针 */
    struct _typeobject *tp_base;
    /* 类型的字典将由 PyType_Ready() 存储到这里 */
    PyObject *tp_dict;
    /* 一个可选的指向“描述器获取”函数的指针 */
    descrgetfunc tp_descr_get;
    /* 一个指向用于设置和删除描述器值的函数的选项指针 */
    descrsetfunc tp_descr_set;
    /* 如果该类型的实例具有一个包含实例变量的字典，则此字段将为非零值并包含该实例变量字典的类型的实例的偏移量；
    该偏移量将由 PyObject_GenericGetAttr() 使用 */
    Py_ssize_t tp_dictoffset;
    /* 一个可选的指向实例初始化函数的指针 */
    initproc tp_init;
    /* 指向一个实例分配函数的可选指针 */
    allocfunc tp_alloc;
    /* 一个可选的指向实例创建函数的指针 */
    newfunc tp_new;
    /* 一个可选的指向实例释放函数的指针 */
    freefunc tp_free; /* Low-level free-memory routine */
    /* 可选的指向垃圾回收器所调用的函数的指针 */
    inquiry tp_is_gc; /* For PyObject_IS_GC */
    /* 基类型的元组 */
    PyObject *tp_bases;
    /* 包含基类型的扩展集的元组，以类型本身开始并以 object 作为结束，使用方法解析顺序 */
    PyObject *tp_mro; /* method resolution order */
    /* 尚未使用，仅供内部使用 */
    PyObject *tp_cache;
    /* 由对子类的弱引用组成的列表，仅供内部使用 */
    PyObject *tp_subclasses;
    /* 弱引用列表头，用于指向该类型对象的弱引用，仅限内部使用 */
    PyObject *tp_weaklist;
    /* 该字段已被弃用，请改用 tp_finalize */
    destructor tp_del;

    /* Type attribute cache version tag. Added in version 2.6 */
    unsigned int tp_version_tag;

    /* 一个可选的指向实例最终化函数的指针 */
    destructor tp_finalize;
    vectorcallfunc tp_vectorcall;

    /* bpo-37250: kept for backwards compatibility in CPython 3.8 only */
    Py_DEPRECATED(3.8) int (*tp_print)(PyObject *, FILE *, int);

    /* The remaining fields are only defined if the feature test macro COUNT_ALLOCS is defined, 
    and are for internal use only. */
#ifdef COUNT_ALLOCS
    /* these must be last and never explicitly initialized */
    /* Number of allocations */
    Py_ssize_t tp_allocs;
    /* Number of frees */
    Py_ssize_t tp_frees;
    /* Maximum simultaneously allocated objects */
    Py_ssize_t tp_maxalloc;
    /* Pointer to the previous type object with a non-zero tp_allocs field */
    struct _typeobject *tp_prev;
    /* Pointer to the next type object with a non-zero tp_allocs field */
    struct _typeobject *tp_next;
#endif
} PyTypeObject;
```
在 CPython 中，由于用户界面都是对象，那么几乎一切都是围绕 `PyObject` 实现的，所有的数据结构都是 `PyObject` 的扩展。因此，简单来说，对象就是 `PyObject` 的内存表示，而类（或类型）作为一种特殊的 `PyObject`，是 `PyTypeObject` 的内存表示。因此在 CPython 中，研究各种类/对象的实现等同研究不同的 `Py*Object` 和 `Py*_Type`。为更好理解 `Py*Object` 和 `Py*_Type` 的关系和作用，参考：[内置对象是如何封装成员暴露接口的？](#内置对象是如何封装成员暴露接口的) 和 [用户自定义类对象是如何被创建的？](#用户自定义类对象是如何被创建的)。

## 内置对象类型是如何封装成员并暴露接口的？
我们以 `tuple` 为例，研究其成员封装、接口暴露。首先在 Python 层面可以看到 `tuple` 是一个 class，其类型为 `type`，其实例 `t` 的类型为 `tuple`，拥有和 `tuple` 类型相同的成员。
```python
>>> tuple
<class 'tuple'>
>>> type(tuple)
<class 'type'>
>>> dir(tuple)
['__add__', '__class__', '__contains__', '__delattr__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__',
 '__getattribute__', '__getitem__', '__getnewargs__', '__gt__', '__hash__', '__init__', '__init_subclass__', 
 '__iter__', '__le__', '__len__', '__lt__', '__mul__', '__ne__', '__new__', '__reduce__', '__reduce_ex__',
 '__repr__', '__rmul__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__', 'count', 'index']
>>> t = tuple((1, 2, 3))
>>> t
(1, 2, 3)
>>> type(t)
<class 'tuple'>
>>> set(dir(t)) - set(dir(tuple))
set()
```
`tuple` 在 C 层级是 `PyTypeObject` 的一个实例，实例名称为 `PyTuple_Type`；`t` 在 C 层级为 `PyTupleObject` 的内存表示。另外，`tuple` 的功能是存储一组 Python 对象序列，实例创建后不能修改这组序列本身。所以实现 `tuple` 的 `PyTupleObject` 内拥有一个 `ob_item` 数组成员，用于保存 `tuple` 持有的这组 Python 对象序列。`PyTupleObject` 是一个 `PyVarObject`，因为不同元素个数的 tuple 所需要的 `ob_item` 长度不同，因此需要 `ob_size` 来记录额外所需的内存大小。
```c
/* object.h */
#define PyObject_VAR_HEAD      PyVarObject ob_base;

/* tupleobject.h */
typedef struct {
    PyObject_VAR_HEAD
    /* ob_item contains space for 'ob_size' elements.
       Items must normally not be NULL, except during construction when
       the tuple is not yet visible outside the function that builds it. */
    PyObject *ob_item[1];
} PyTupleObject;
```
另外，在 `PyTupleObject` 被实例化时，其成员 `ob_type` 会指向 `PyTuple_Type`。之前提到 `PyTypeObject` 是用于封装 `Py*Object` 的成员和暴露统一的接口，那么 `PyTuple_Type` 就是对 `PyTupleObject` 的封装，并实现 `PyTypeObject` 所定义的接口。如下是 `PyTuple_Type` 的具体实现，`0` 的项表示 `tuple` 类型不支持这一接口。
```c
PyTypeObject PyTuple_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "tuple",
    sizeof(PyTupleObject) - sizeof(PyObject *),
    sizeof(PyObject *),
    (destructor)tupledealloc,                   /* tp_dealloc */
    0,                                          /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    (reprfunc)tuplerepr,                        /* tp_repr */
    0,                                          /* tp_as_number */
    &tuple_as_sequence,                         /* tp_as_sequence */
    &tuple_as_mapping,                          /* tp_as_mapping */
    (hashfunc)tuplehash,                        /* tp_hash */
    0,                                          /* tp_call */
    0,                                          /* tp_str */
    PyObject_GenericGetAttr,                    /* tp_getattro */
    0,                                          /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
        Py_TPFLAGS_BASETYPE | Py_TPFLAGS_TUPLE_SUBCLASS, /* tp_flags */
    tuple_new__doc__,                           /* tp_doc */
    (traverseproc)tupletraverse,                /* tp_traverse */
    0,                                          /* tp_clear */
    tuplerichcompare,                           /* tp_richcompare */
    0,                                          /* tp_weaklistoffset */
    tuple_iter,                                 /* tp_iter */
    0,                                          /* tp_iternext */
    tuple_methods,                              /* tp_methods */
    0,                                          /* tp_members */
    0,                                          /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    0,                                          /* tp_descr_get */
    0,                                          /* tp_descr_set */
    0,                                          /* tp_dictoffset */
    0,                                          /* tp_init */
    0,                                          /* tp_alloc */
    tuple_new,                                  /* tp_new */
    PyObject_GC_Del,                            /* tp_free */
};
```
以 `tp_repr` 实现的 `tuplerepr` 举例来说，这些接口是何时被调用，我们通过 `repr()` 函数输出 `tuple` 实例的可读字符串，并通过 `dis` 给出执行的字节码，其通过 `CALL_FUNCTION` 调用 `builtin` 中的 `repr()` 函数来实现的功能。
```python
>>> repr((1, 2, 3))
'(1, 2, 3)'
>>> dis.dis('repr((1, 2, 3))')
  1           0 LOAD_NAME                0 (repr)
              2 LOAD_CONST               0 ((1, 2, 3))
              4 CALL_FUNCTION            1
              6 RETURN_VALUE
```
我们可以看到 `repr()` 函数内部通过 `v->ob_type->tp_repr` 调用具体实例的类型的 `tp_repr` 来完成输出，这里的 `PyObject` 为 `PyTupleObject`，因此调用的具体函数为 `tuplerepr`。这里就容易理解为什么说 `PyTypeObject` 是封装各种对象的成员并暴露统一的接口了。
```c
/* bltinmodule.c */
static PyObject *
builtin_repr(PyObject *module, PyObject *obj)
{
    return PyObject_Repr(obj);
}

/* object.c */
PyObject *PyObject_Repr(PyObject *v)
{
    PyObject *res;
    res = (*v->ob_type->tp_repr)(v);
    if (res == NULL)
        return NULL;
    return res;
}
```
接下来，我们看 `tuplerepr` 的具体实现，其封装了对 `PyTupleObject` 的操作函数，并基于这种数据结构的特性实现了 `tp_repr` 的接口协议，这是类型转换下放的例子。
```c
/* tupleobject.c */
static PyObject *
tuplerepr(PyTupleObject *v)
{
    Py_ssize_t i, n;
    _PyUnicodeWriter writer;

    n = Py_SIZE(v);
    if (n == 0)
        return PyUnicode_FromString("()");

    /* While not mutable, it is still possible to end up with a cycle in a
       tuple through an object that stores itself within a tuple (and thus
       infinitely asks for the repr of itself). This should only be
       possible within a type. */
    i = Py_ReprEnter((PyObject *)v);
    if (i != 0) {
        return i > 0 ? PyUnicode_FromString("(...)") : NULL;
    }

    _PyUnicodeWriter_Init(&writer);
    writer.overallocate = 1;
    if (Py_SIZE(v) > 1) {
        /* "(" + "1" + ", 2" * (len - 1) + ")" */
        writer.min_length = 1 + 1 + (2 + 1) * (Py_SIZE(v) - 1) + 1;
    }
    else {
        /* "(1,)" */
        writer.min_length = 4;
    }

    if (_PyUnicodeWriter_WriteChar(&writer, '(') < 0)
        goto error;

    /* Do repr() on each element. */
    for (i = 0; i < n; ++i) {
        PyObject *s;

        if (i > 0) {
            if (_PyUnicodeWriter_WriteASCIIString(&writer, ", ", 2) < 0)
                goto error;
        }

        s = PyObject_Repr(v->ob_item[i]);
        if (s == NULL)
            goto error;

        if (_PyUnicodeWriter_WriteStr(&writer, s) < 0) {
            Py_DECREF(s);
            goto error;
        }
        Py_DECREF(s);
    }

    writer.overallocate = 0;
    if (n > 1) {
        if (_PyUnicodeWriter_WriteChar(&writer, ')') < 0)
            goto error;
    }
    else {
        if (_PyUnicodeWriter_WriteASCIIString(&writer, ",)", 2) < 0)
            goto error;
    }

    Py_ReprLeave((PyObject *)v);
    return _PyUnicodeWriter_Finish(&writer);

error:
    _PyUnicodeWriter_Dealloc(&writer);
    Py_ReprLeave((PyObject *)v);
    return NULL;
}
```
另外，我们注意到 `tp_methods` 属性，其以 `PyMethodDef` 协议封装了 `tuple` 特有的函数，其中的函数我们在 `dir(tuple)` 均有见过。这些成员以及其它成员通过各种明确的协议向外暴露，因此可以被统一的方式进行处理。
```c
/* tupleobject.c */
static PyMethodDef tuple_methods[] = {
    TUPLE___GETNEWARGS___METHODDEF
    TUPLE_INDEX_METHODDEF
    TUPLE_COUNT_METHODDEF
    {NULL,              NULL}           /* sentinel */
};

/* clinic/tupleobject.c.h */
#define TUPLE___GETNEWARGS___METHODDEF    \
    {"__getnewargs__", (PyCFunction)tuple___getnewargs__, METH_NOARGS, tuple___getnewargs____doc__},

#define TUPLE_INDEX_METHODDEF    \
    {"index", (PyCFunction)(void(*)(void))tuple_index, METH_FASTCALL, tuple_index__doc__},

#define TUPLE_COUNT_METHODDEF    \
    {"count", (PyCFunction)tuple_count, METH_O, tuple_count__doc__},
```
除了 `tuple` 以外，Python 还提供了一组常见对象的类似机理实现，详见：[附：常见对象的实现机制](#附常见对象的实现机制)。

## 用户自定义类对象是如何被创建的？
如下我们自定义了 `Singer` 类，在模块被导入或在 REPL 模式下定义完 `Singer` 类后后回车，`Singer` 类实例就会被自动创建，其类型是 `type`，表明其可能与 `tuple` 一样，是一个 `PyTypeObject` 对象。同时，`dir(Singer)` 内不仅包含了公共的成员，还包含了独特成员，如 `default_lyric` 和 `sing`。
```python
class Singer(object):
    default_lyric = "Only because you are so beautiful"
    def __init__(self, name='Xukun Cai'):
        self.name = name
    def sing(self):
        return f"{self.name} sings: {self.default_lyric}"

>>> Singer
<class '__main__.Singer'>
>>> type(Singer)
<class 'type'>
>>> dir(Singer)
['__class__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', 
'__getattribute__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__le__', '__lt__', '__module__', 
'__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', 
'__subclasshook__', '__weakref__', 'default_lyric', 'sing']
```
通过 `dis` 查看 `Singer` 类创建过程的字节码。观察发现，类实例是通过 `LOAD_BUILD_CLASS` 字节码创建，然后保存到 `Singer` 变量的。它的参数包含 `Singer` 类体声明函数 `Singer()`、类名 `'Singer'` 和父类 `object`。
```text
  2           0 LOAD_BUILD_CLASS
              2 LOAD_CONST               0 (<code object Singer at 0x100fa7240, file "<dis>", line 2>)
              4 LOAD_CONST               1 ('Singer')
              6 MAKE_FUNCTION            0
              8 LOAD_CONST               1 ('Singer')
             10 LOAD_NAME                0 (object)
             12 CALL_FUNCTION            3
             14 STORE_NAME               1 (Singer)
             16 LOAD_CONST               2 (None)
             18 RETURN_VALUE

Disassembly of <code object Singer at 0x100fa7240, file "<dis>", line 2>:
  2           0 LOAD_NAME                0 (__name__)
              2 STORE_NAME               1 (__module__)
              4 LOAD_CONST               0 ('Singer')
              6 STORE_NAME               2 (__qualname__)

  3           8 LOAD_CONST               1 ('Only because you are so beautiful')
             10 STORE_NAME               3 (default_lyric)

  4          12 LOAD_CONST               8 (('Xukun Cai',))
             14 LOAD_CONST               3 (<code object __init__ at 0x100fa70e0, file "<dis>", line 4>)
             16 LOAD_CONST               4 ('Singer.__init__')
             18 MAKE_FUNCTION            1 (defaults)
             20 STORE_NAME               4 (__init__)

  6          22 LOAD_CONST               5 (<code object sing at 0x100fa7190, file "<dis>", line 6>)
             24 LOAD_CONST               6 ('Singer.sing')
             26 MAKE_FUNCTION            0
             28 STORE_NAME               5 (sing)
             30 LOAD_CONST               7 (None)
             32 RETURN_VALUE

Disassembly of <code object __init__ at 0x100fa70e0, file "<dis>", line 4>:
  5           0 LOAD_FAST                1 (name)
              2 LOAD_FAST                0 (self)
              4 STORE_ATTR               0 (name)
              6 LOAD_CONST               0 (None)
              8 RETURN_VALUE

Disassembly of <code object sing at 0x100fa7190, file "<dis>", line 6>:
  7           0 LOAD_FAST                0 (self)
              2 LOAD_ATTR                0 (name)
              4 FORMAT_VALUE             0
              6 LOAD_CONST               1 (' sings: ')
              8 LOAD_FAST                0 (self)
             10 LOAD_ATTR                1 (default_lyric)
             12 FORMAT_VALUE             0
             14 BUILD_STRING             3
             16 RETURN_VALUE
```
观察 `Singer` 类体声明函数，可大致可以对应为 `Singer()` 函数，作用是类成员初始化。`Singer()` 函数内的赋值操作都是通过 `STORE_NAME` 字节码实现的，因此在函数执行期间，这些成员变量都会存储到一个 frame 的局部变量的字典中。这可能作为在初始化类实例成员时，获得用户提供的类成员和方法的途径。
```python
def Singer():
    __module__ = __name__
    __qualname__ = "Singer"
    default_lyric = "Only because you are so beautiful"
    def __init__(self, name="Xukun Cai"):
        self.name = name
    __init__.__qualname__ = "Singer.__init__"
    def sing(self):
        return f"{self.name} sings: {self.default_lyric}"
    sing.__qualname__ = "Singer.sing"
    return None
```
现在，我们进入 `LOAD_BUILD_CLASS` 的实现分析类实例是如何被创建的。从实现看到，它的作用是从 `builtins` 中找到 `__build_class__` 函数并压栈，也就说，真正被调用的函数是 `__build_class__`。
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
            case TARGET(LOAD_BUILD_CLASS): {
                _Py_IDENTIFIER(__build_class__);

                PyObject *bc;
                if (PyDict_CheckExact(f->f_builtins)) {
                    bc = _PyDict_GetItemIdWithError(f->f_builtins, &PyId___build_class__);
                    if (bc == NULL) {
                        if (!_PyErr_Occurred(tstate)) {
                            _PyErr_SetString(tstate, PyExc_NameError,
                                            "__build_class__ not found");
                        }
                        goto error;
                    }
                    Py_INCREF(bc);
                }
                PUSH(bc);
                DISPATCH();
            }
        }
    }
}
```
具体到 Singer 类的创建，其中参数 `self` 为 `__build_class__` 对象本身；`args` 为 frame 的值栈，包含的参数依次为 `Singer` 类体声明函数 `Singer()`、类名 `'Singer'` 和父类 `object`；`nargs` 为参数个数，`kwnames` 为额外的参数，这里为 `NULL`。在 `__build_class__` 函数中，首先是从值栈中解析出上述的参数列表；然后为类实例的创建匹配一个合适的元类，默认情况下为 `type`；紧接着调用类体声明函数 `Singer()` 并指定命名空间字典，这样函数内执行的赋值操作就会存到命名空间字典中；最后以类名、继承的父类元组和类体函数执行的命名空间字典作为参数将元类视为函数进行调用得到类实例，默认情况下类似调用 [`type('Singer', (object,), {...})`](https://docs.python.org/zh-cn/3.8/library/functions.html#type) 创建类实例对象，这同样是 Python 暴露的一个动态创建类的接口。
```c
/* Python/bltinmodule.c */
static PyObject *
builtin___build_class__(PyObject *self, PyObject *const *args, Py_ssize_t nargs,
                        PyObject *kwnames)
{
    PyObject *func, *name, *winner, *prep;
    PyObject *cls = NULL, *cell = NULL, *ns = NULL, *meta = NULL, *orig_bases = NULL;
    PyObject *mkw = NULL, *bases = NULL;
    int isclass = 0;   /* initialize to prevent gcc warning */

    /* 类体函数 */
    func = args[0];   /* Better be callable */
    /* 类名 */
    name = args[1];
    /* 父类 tuple，若没有指定为 () */
    orig_bases = _PyTuple_FromArray(args + 2, nargs - 2);
    /* PEP 560 __mro_entries__ 协议，默认同 orig_bases */
    bases = update_bases(orig_bases, args + 2, nargs - 2);

    if (kwnames == NULL) {
        meta = NULL;
        mkw = NULL;
    }
    else {
        mkw = _PyStack_AsDict(args + nargs, kwnames);
        if (mkw == NULL) {
            goto error;
        }

        /* 若指定了 metaclass */
        meta = _PyDict_GetItemIdWithError(mkw, &PyId_metaclass);
        if (meta != NULL) {
            /* metaclass is explicitly given, check if it's indeed a class */
            isclass = PyType_Check(meta);
        }
    }
    /* 没有指定 metaclass */
    if (meta == NULL) {
        /* if there are no bases, use type: */
        if (PyTuple_GET_SIZE(bases) == 0) {
            meta = (PyObject *) (&PyType_Type);
        }
        /* else get the type of the first base */
        else {
            PyObject *base0 = PyTuple_GET_ITEM(bases, 0);
            meta = (PyObject *) (base0->ob_type);
        }
        Py_INCREF(meta);
        isclass = 1;  /* meta is really a class */
    }

    /* 若存在多个父类，找最顶层类作为 metaclass */
    if (isclass) {
        /* meta is really a class, so check for a more derived
           metaclass, or possible metaclass conflicts: */
        winner = (PyObject *)_PyType_CalculateMetaclass((PyTypeObject *)meta,
                                                        bases);
        if (winner != meta) {
            Py_DECREF(meta);
            meta = winner;
            Py_INCREF(meta);
        }
    }
    /* 查找元类是否定义了 __prepare__ 函数，未定义返回 0 */
    if (_PyObject_LookupAttrId(meta, &PyId___prepare__, &prep) < 0) {
        ns = NULL;
    }
    else if (prep == NULL) {
        ns = PyDict_New();
    }
    /* 若定义则调用 meta.__prepare__(self, name, bases) */
    else {
        PyObject *pargs[2] = {name, bases};
        ns = _PyObject_FastCallDict(prep, pargs, 2, mkw);
        Py_DECREF(prep);
    }
    if (ns == NULL) {
        goto error;
    }
    /* 以 ns 为 locals 调用类体函数，那么执行产生的对象将保存在 ns 中 */
    cell = PyEval_EvalCodeEx(PyFunction_GET_CODE(func), PyFunction_GET_GLOBALS(func), ns,
                             NULL, 0, NULL, 0, NULL, 0, NULL,
                             PyFunction_GET_CLOSURE(func));
    /* 正常 cell 返回 None 对象 */
    if (cell != NULL) {
        if (bases != orig_bases) {
            if (PyMapping_SetItemString(ns, "__orig_bases__", orig_bases) < 0) {
                goto error;
            }
        }
        PyObject *margs[3] = {name, bases, ns};
        /* 调用 meta(self, name, bases, ns, mkw) 构建类对象 */
        cls = _PyObject_FastCallDict(meta, margs, 3, mkw);
    }
error:
    Py_XDECREF(cell);
    Py_XDECREF(ns);
    Py_XDECREF(meta);
    Py_XDECREF(mkw);
    if (bases != orig_bases) {
        Py_DECREF(orig_bases);
    }
    Py_DECREF(bases);
    return cls;
}
```
尽管 `Singer` 继承了 `object` 类，但是在元类匹配时 `meta = (PyObject *) (base0->ob_type)` 获取到 `object` 类实例的类型，其为 `type`。因此，实际是调用 `type` 来创建对象，由于 `type` 在 C 层面初始化为 `PyType_Type`，而调用 `type` 就相当于调用 `PyType_Type` 的 `tp_call` 槽指向的函数指针，即 `type_call`。关于为什么是这样调用的，参考：[为什么对象可以被调用？](https://github.com/gndlwch2w/python-hows/blob/main/func.md#%E4%B8%BA%E4%BB%80%E4%B9%88%E5%AF%B9%E8%B1%A1%E5%8F%AF%E4%BB%A5%E8%A2%AB%E8%B0%83%E7%94%A8)。在 `tp_call` 中，实质是调用 `PyType_Type` 的 `tp_new` 槽指向的函数指针，即 `type_new`。
```c
/* typeobject.c */
static PyObject *
type_call(PyTypeObject *type, PyObject *args, PyObject *kwds)
{
    PyObject *obj;

    /* 调用元类的 tp_new 构建类 */
    obj = type->tp_new(type, args, kwds);
    obj = _Py_CheckFunctionResult((PyObject*)type, obj, NULL);
    if (obj == NULL)
        return NULL;

    /* If the returned object is not an instance of type,
       it won't be initialized. */
    /* 这里构建的 obj 为类，其类型为 type，直接返回 */
    if (!PyType_IsSubtype(Py_TYPE(obj), type))
        return obj;
}
```
`tp_new` 就是真正魔法发挥作用的地方，它的调用参数同 `type_call`。
- 检查调用是否为 `type(obj)` 的调用，若是则直接返回 `obj` 的类型，否则就是创建实例。
- 对输入参数的解析，如类名、基类 tuple 和命名空间字典。
- 处理继承的问题，按照一定规则，找出合适的元类和基类，在默认情况下为 `type` 和 `object`。
- 处理 `__slots__` 和 `__dict__`、`__weakref__`，若没有定义 `__slots__` 和基类也没有 `__dict__` 或 `__weakref__`，则允许子类添加 `__dict__` 和或 `__weakref__`。否则需要处理 `__slots__`，如检查 slots 定义是否命名冲突和符合变量命名规则等、以及处理 `__slots__` 允许 `__dict__` 的情况，是否存在重复指定，`__weakref__` 也类似。更多内容参考：[附：\_\_slots__ 机制如何使实例属性访问变快的？](#附slots-机制如何使实例属性访问变快的)。
- 依据元类和 `nslots` 分配内存，但是堆内存布局不完全等同于 `PyTypeObject`，而是它的扩充版本 `PyHeapTypeObject`，可以认为这是 `PyTypeObject` 的前缀。然后就是设置一些字段值，如类名、slots、标志位和一些公共接口的指针引用，使得 `PyTypeObject` 的指向和 `PyHeapTypeObject` 一致；以及基类、`tp_dict`、`__module__`、`__qualname__`、`tp_doc`；若实现了 `__new__`、`__init_subclass__` 和 `__class_getitem__` 则封装为静态方法或类方法。
- 将 `__slots__` 的成员封装在 `PyHeapTypeObject` 的后面，依据基类是否定义 `__dict__` 而决定是否需要设置 `tp_dictoffset`。

```c
static PyObject *
type_new(PyTypeObject *metatype, PyObject *args, PyObject *kwds)
{
    PyObject *name, *bases = NULL, *orig_dict, *dict = NULL;
    PyObject *qualname, *slots = NULL, *tmp, *newslots, *cell;
    PyTypeObject *type = NULL, *base, *tmptype, *winner;
    PyHeapTypeObject *et;
    PyMemberDef *mp;
    Py_ssize_t i, nbases, nslots, slotoffset, name_size;
    int j, may_add_dict, may_add_weak, add_dict, add_weak;
    _Py_IDENTIFIER(__qualname__);
    _Py_IDENTIFIER(__slots__);
    _Py_IDENTIFIER(__classcell__);

    assert(args != NULL && PyTuple_Check(args));
    assert(kwds == NULL || PyDict_Check(kwds));

    /* 判断是否是 type(obj) 的调用 */
    /* Special case: type(x) should return x->ob_type */
    /* We only want type itself to accept the one-argument form (#27157)
       Note: We don't call PyType_CheckExact as that also allows subclasses */
    if (metatype == &PyType_Type) {
        const Py_ssize_t nargs = PyTuple_GET_SIZE(args);
        const Py_ssize_t nkwds = kwds == NULL ? 0 : PyDict_GET_SIZE(kwds);

        if (nargs == 1 && nkwds == 0) {
            PyObject *x = PyTuple_GET_ITEM(args, 0);
            Py_INCREF(Py_TYPE(x));
            return (PyObject *) Py_TYPE(x);
        }

        /* SF bug 475327 -- if that didn't trigger, we need 3
           arguments. but PyArg_ParseTuple below may give
           a msg saying type() needs exactly 3. */
        if (nargs != 3) {
            PyErr_SetString(PyExc_TypeError,
                            "type() takes 1 or 3 arguments");
            return NULL;
        }
    }

    /* 参数解析 */
    /* Check arguments: (name, bases, dict) */
    if (!PyArg_ParseTuple(args, "UO!O!:type.__new__", &name, &PyTuple_Type,
                          &bases, &PyDict_Type, &orig_dict))
        return NULL;

    /* Adjust for empty tuple bases */
    nbases = PyTuple_GET_SIZE(bases);
    if (nbases == 0) {
        /* 没有给父类，默认继承 object */
        base = &PyBaseObject_Type;
        bases = PyTuple_Pack(1, base);
        if (bases == NULL)
            return NULL;
        nbases = 1;
    }
    else {
        _Py_IDENTIFIER(__mro_entries__);
        for (i = 0; i < nbases; i++) {
            tmp = PyTuple_GET_ITEM(bases, i);
            if (PyType_Check(tmp)) {
                continue;
            }
            /* 断言所有父类不能实现 mro_entries */
            if (_PyObject_LookupAttrId(tmp, &PyId___mro_entries__, &tmp) < 0) {
                return NULL;
            }
            if (tmp != NULL) {
                PyErr_SetString(PyExc_TypeError,
                                "type() doesn't support MRO entry resolution; "
                                "use types.new_class()");
                Py_DECREF(tmp);
                return NULL;
            }
        }
        /* 从继承的父类中找到最佳的元类，即所有类的最顶层类型，一般为 type */
        /* Search the bases for the proper metatype to deal with this: */
        winner = _PyType_CalculateMetaclass(metatype, bases);
        if (winner == NULL) {
            return NULL;
        }

        /* 若找到的元类不是 type，那么调用给定元类的 tp_new */
        if (winner != metatype) {
            if (winner->tp_new != type_new) /* Pass it to the winner */
                return winner->tp_new(winner, args, kwds);
            metatype = winner;
        }

        /* 
        由于 Python 支持多继承，即可以继承多个父类，通过 C3 MRO 计算找出最适合的父类，
        一方面检查是否所有类之间是否有冲突，比如存在多个变长类型基类、基类的结构体布局冲突等
        另一方面就是选出一个内存布局兼容性最强的父类作为 base 返回
        */
        /* Calculate best base, and check that all bases are type objects */
        base = best_base(bases);
        if (base == NULL) {
            return NULL;
        }

        Py_INCREF(bases);
    }

    /* Use "goto error" from this point on as we now own the reference to "bases". */

    dict = PyDict_Copy(orig_dict);
    if (dict == NULL)
        goto error;

    /* Check for a __slots__ sequence variable in dict, and count it */
    slots = _PyDict_GetItemIdWithError(dict, &PyId___slots__);
    nslots = 0;
    add_dict = 0;
    add_weak = 0;
    may_add_dict = base->tp_dictoffset == 0;
    may_add_weak = base->tp_weaklistoffset == 0 && base->tp_itemsize == 0;
    if (slots == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        /* 父类没有 __dict__ 槽，则子类添加 */
        if (may_add_dict) {
            add_dict++;
        }
        if (may_add_weak) {
            add_weak++;
        }
    }
    else {
        /* Have slots */

        /* Make it into a tuple */
        if (PyUnicode_Check(slots))         /* __slots = '...' */
            slots = PyTuple_Pack(1, slots); /* slots = ('...', ) */
        else
            slots = PySequence_Tuple(slots);
        if (slots == NULL)
            goto error;
        assert(PyTuple_Check(slots));

        /* Are slots allowed? */
        nslots = PyTuple_GET_SIZE(slots);
        /*
        可变类型对象，如 int、tuple、str，不允许有 __slots__

            >>> class A(int):
            ...     __slots__ = ('x',)
            ...
            Traceback (most recent call last):
            File "<stdin>", line 1, in <module>
            TypeError: nonempty __slots__ not supported for subtype of 'int'
        */
        if (nslots > 0 && base->tp_itemsize != 0) {
            PyErr_Format(PyExc_TypeError,
                         "nonempty __slots__ "
                         "not supported for subtype of '%s'",
                         base->tp_name);
            goto error;
        }

        /* Check for valid slot names and two special cases */
        for (i = 0; i < nslots; i++) {
            PyObject *tmp = PyTuple_GET_ITEM(slots, i);
            /* 检查定义的 slots 项是否符合变量命名规则 */
            if (!valid_identifier(tmp))
                goto error;
            assert(PyUnicode_Check(tmp));
            if (_PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) {
                /*
                slots 内指定 __dict__，若父类存在 __dict__ 或子类已经标记则不能重复指定

                    >>> class A:
                    ...     pass
                    ...
                    >>> class B(A):
                    ...     __slots__ = ('__dict__',)
                    ...
                    Traceback (most recent call last):
                    File "<stdin>", line 1, in <module>
                    TypeError: __dict__ slot disallowed: we already got one
                */
                if (!may_add_dict || add_dict) {
                    PyErr_SetString(PyExc_TypeError,
                                    "__dict__ slot disallowed: "
                                    "we already got one");
                    goto error;
                }
                /* 使得 __slots__ 类也支持 __dict__ */
                add_dict++;
            }
            if (_PyUnicode_EqualToASCIIString(tmp, "__weakref__")) {
                if (!may_add_weak || add_weak) {
                    PyErr_SetString(PyExc_TypeError,
                                    "__weakref__ slot disallowed: "
                                    "either we already got one, "
                                    "or __itemsize__ != 0");
                    goto error;
                }
                add_weak++;
            }
        }

        /* Copy slots into a list, mangle names and sort them.
           Sorted names are needed for __class__ assignment.
           Convert them back to tuple at the end.
        */
        /* 单独处理 __dict__ 和 __weakref__ slots */
        newslots = PyList_New(nslots - add_dict - add_weak);
        if (newslots == NULL)
            goto error;
        for (i = j = 0; i < nslots; i++) {
            tmp = PyTuple_GET_ITEM(slots, i);
            /* 不复制 __dict__ 和 __weakref__ 到 newslots 中 */
            if ((add_dict &&
                 _PyUnicode_EqualToASCIIId(tmp, &PyId___dict__)) ||
                (add_weak &&
                 _PyUnicode_EqualToASCIIString(tmp, "__weakref__")))
                continue;
            /* 私有属性变量名改写：__<变量名> -> _<类名>__<变量名> */
            tmp = _Py_Mangle(name, tmp);
            if (!tmp) {
                Py_DECREF(newslots);
                goto error;
            }
            PyList_SET_ITEM(newslots, j, tmp);
            /*
            不允许为 __slots__ 内的类变量进行赋值，因为 __slots__ 定义的属性会使用描述器实现，
            赋值会覆盖描述器，需要排除 __qualname__ 和 __classcell__，它们是类创建时自动生成的。

                >>> class A:
                ...     __slots__ = ('x',)
                ...     x = 1
                ...
                Traceback (most recent call last):
                File "<stdin>", line 1, in <module>
                ValueError: 'x' in __slots__ conflicts with class variable
            */
            if (PyDict_GetItemWithError(dict, tmp)) {
                /* CPython inserts __qualname__ and __classcell__ (when needed)
                   into the namespace when creating a class.  They will be deleted
                   below so won't act as class variables. */
                if (!_PyUnicode_EqualToASCIIId(tmp, &PyId___qualname__) &&
                    !_PyUnicode_EqualToASCIIId(tmp, &PyId___classcell__)) {
                    PyErr_Format(PyExc_ValueError,
                                 "%R in __slots__ conflicts with class variable",
                                 tmp);
                    Py_DECREF(newslots);
                    goto error;
                }
            }
            else if (PyErr_Occurred()) {
                Py_DECREF(newslots);
                goto error;
            }
            j++;
        }
        assert(j == nslots - add_dict - add_weak);
        nslots = j;
        Py_CLEAR(slots);
        /* 对 newslots 进行排序 */
        if (PyList_Sort(newslots) == -1) {
            Py_DECREF(newslots);
            goto error;
        }
        /* 然后将 newslots 转换为 tuple，覆盖 slots */
        slots = PyList_AsTuple(newslots);
        Py_DECREF(newslots);
        if (slots == NULL)
            goto error;

        /* Secondary bases may provide weakrefs or dict */
        /* 存在多个父类，并且当前父类 base 没有 __dict__，也没有添加 __dict__ 标记 */
        if (nbases > 1 &&
            ((may_add_dict && !add_dict) ||
             (may_add_weak && !add_weak))) {
            for (i = 0; i < nbases; i++) {
                tmp = PyTuple_GET_ITEM(bases, i);
                if (tmp == (PyObject *)base)
                    continue; /* Skip primary base */
                assert(PyType_Check(tmp));
                tmptype = (PyTypeObject *)tmp;
                /* 找到是否有可以继承 __dict__ 的父类 */
                if (may_add_dict && !add_dict &&
                    tmptype->tp_dictoffset != 0)
                    add_dict++;
                if (may_add_weak && !add_weak &&
                    tmptype->tp_weaklistoffset != 0)
                    add_weak++;
                /* 找到了，就退出寻找 */
                if (may_add_dict && !add_dict)
                    continue;
                if (may_add_weak && !add_weak)
                    continue;
                /* Nothing more to check */
                break;
            }
        }
    }

    /* Allocate the type object */
    /* 调用 PyType_GenericAlloc(metatype, nslots) 分配大小为 size(metatype) + nslots + 1 的内存
    分配对象的 heap 的布局为 PyHeapTypeObject，type 指向 PyHeapTypeObject 的第一部分 ht_type */
    type = (PyTypeObject *)metatype->tp_alloc(metatype, nslots);
    if (type == NULL)
        goto error;

    /* Keep name and slots alive in the extended type object */
    et = (PyHeapTypeObject *)type;
    Py_INCREF(name);
    et->ht_name = name;
    et->ht_slots = slots;
    slots = NULL;

    /* Initialize tp_flags */
    // All heap types need GC, since we can create a reference cycle by storing
    // an instance on one of its parents:
    type->tp_flags = Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HEAPTYPE |
                     Py_TPFLAGS_BASETYPE | Py_TPFLAGS_HAVE_GC;

    /* Initialize essential fields */
    type->tp_as_async = &et->as_async;
    type->tp_as_number = &et->as_number;
    type->tp_as_sequence = &et->as_sequence;
    type->tp_as_mapping = &et->as_mapping;
    type->tp_as_buffer = &et->as_buffer;
    type->tp_name = PyUnicode_AsUTF8AndSize(name, &name_size);
    if (!type->tp_name)
        goto error;
    if (strlen(type->tp_name) != (size_t)name_size) {
        PyErr_SetString(PyExc_ValueError,
                        "type name must not contain null characters");
        goto error;
    }

    /* Set tp_base and tp_bases */
    type->tp_bases = bases;
    bases = NULL;
    Py_INCREF(base);
    type->tp_base = base;

    /* Initialize tp_dict from passed-in dict */
    Py_INCREF(dict);
    /* 类体定义的类属性、方法都存如 tp_dict */
    type->tp_dict = dict;

    /* Set __module__ in the dict */
    if (_PyDict_GetItemIdWithError(dict, &PyId___module__) == NULL) {
        if (PyErr_Occurred()) {
            goto error;
        }
        /* 若命名空间没有，那么从当前 frame 的 globals()['__name__'] 获取 */
        tmp = PyEval_GetGlobals();
        if (tmp != NULL) {
            tmp = _PyDict_GetItemIdWithError(tmp, &PyId___name__);
            if (tmp != NULL) {
                if (_PyDict_SetItemId(dict, &PyId___module__,
                                      tmp) < 0)
                    goto error;
            }
            else if (PyErr_Occurred()) {
                goto error;
            }
        }
    }

    /* ns['__qualname__'] -> ht_qualname */
    /* Set ht_qualname to dict['__qualname__'] if available, else to
       __name__.  The __qualname__ accessor will look for ht_qualname.
    */
    qualname = _PyDict_GetItemIdWithError(dict, &PyId___qualname__);
    if (qualname != NULL) {
        if (!PyUnicode_Check(qualname)) {
            PyErr_Format(PyExc_TypeError,
                         "type __qualname__ must be a str, not %s",
                         Py_TYPE(qualname)->tp_name);
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }
    et->ht_qualname = qualname ? qualname : et->ht_name;
    Py_INCREF(et->ht_qualname);
    /* 将 __qualname__ 从 __dict__ 中去掉 */
    if (qualname != NULL && _PyDict_DelItemId(dict, &PyId___qualname__) < 0)
        goto error;

    /* ns[__doc__] -> tp_doc */
    /* Set tp_doc to a copy of dict['__doc__'], if the latter is there
       and is a string.  The __doc__ accessor will first look for tp_doc;
       if that fails, it will still look into __dict__.
    */
    {
        PyObject *doc = _PyDict_GetItemIdWithError(dict, &PyId___doc__);
        if (doc != NULL && PyUnicode_Check(doc)) {
            Py_ssize_t len;
            const char *doc_str;
            char *tp_doc;

            doc_str = PyUnicode_AsUTF8(doc);
            if (doc_str == NULL)
                goto error;
            /* Silently truncate the docstring if it contains null bytes. */
            len = strlen(doc_str);
            tp_doc = (char *)PyObject_MALLOC(len + 1);
            if (tp_doc == NULL) {
                PyErr_NoMemory();
                goto error;
            }
            memcpy(tp_doc, doc_str, len + 1);
            type->tp_doc = tp_doc;
        }
        else if (doc == NULL && PyErr_Occurred()) {
            goto error;
        }
    }

    /* 若覆盖了 __new__、__init_subclass__ 和 __class_getitem__，
    则将其包装为 staticmethod，再放入 __dict__ */

    /* Special-case __new__: if it's a plain function,
       make it a static function */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___new__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyStaticMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___new__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    /* Special-case __init_subclass__ and __class_getitem__:
       if they are plain functions, make them classmethods */
    tmp = _PyDict_GetItemIdWithError(dict, &PyId___init_subclass__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___init_subclass__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    tmp = _PyDict_GetItemIdWithError(dict, &PyId___class_getitem__);
    if (tmp != NULL && PyFunction_Check(tmp)) {
        tmp = PyClassMethod_New(tmp);
        if (tmp == NULL)
            goto error;
        if (_PyDict_SetItemId(dict, &PyId___class_getitem__, tmp) < 0) {
            Py_DECREF(tmp);
            goto error;
        }
        Py_DECREF(tmp);
    }
    else if (tmp == NULL && PyErr_Occurred()) {
        goto error;
    }

    /* 为 __slots__ 添加描述器 */
    /* Add descriptors for custom slots from __slots__, or for __dict__ */
    mp = PyHeapType_GET_MEMBERS(et);  /* 位置在所有成员之后，类型为 PyMemberDef */
    slotoffset = base->tp_basicsize;
    if (et->ht_slots != NULL) {
        for (i = 0; i < nslots; i++, mp++) {
            mp->name = PyUnicode_AsUTF8(
                PyTuple_GET_ITEM(et->ht_slots, i));
            if (mp->name == NULL)
                goto error;
            mp->type = T_OBJECT_EX;
            /* 计算成员的偏移地址 */
            mp->offset = slotoffset;

            /* __dict__ and __weakref__ are already filtered out */
            assert(strcmp(mp->name, "__dict__") != 0);
            assert(strcmp(mp->name, "__weakref__") != 0);

            slotoffset += sizeof(PyObject *);
        }
    }
    /* 在 slots 后添加 __dict__，指定地址偏移 tp_dictoffset */
    if (add_dict) {
        if (base->tp_itemsize)
            type->tp_dictoffset = -(long)sizeof(PyObject *);
        else
            type->tp_dictoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    if (add_weak) {
        assert(!base->tp_itemsize);
        type->tp_weaklistoffset = slotoffset;
        slotoffset += sizeof(PyObject *);
    }
    /* 设置 type 的总占用内存 */
    type->tp_basicsize = slotoffset;
    type->tp_itemsize = base->tp_itemsize;
    /* 将 tp_members 指针指向对象尾部的 slots/__dict__/__weakref__ */
    type->tp_members = PyHeapType_GET_MEMBERS(et);

    /* 封装 __dict__ 和 __weakref__ 为描述器 */
    if (type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_full;
    else if (type->tp_weaklistoffset && !type->tp_dictoffset)
        type->tp_getset = subtype_getsets_weakref_only;
    else if (!type->tp_weaklistoffset && type->tp_dictoffset)
        type->tp_getset = subtype_getsets_dict_only;
    else
        type->tp_getset = NULL;

    /* Special case some slots */
    if (type->tp_dictoffset != 0 || nslots > 0) {
        if (base->tp_getattr == NULL && base->tp_getattro == NULL)
            type->tp_getattro = PyObject_GenericGetAttr;
        if (base->tp_setattr == NULL && base->tp_setattro == NULL)
            type->tp_setattro = PyObject_GenericSetAttr;
    }
    type->tp_dealloc = subtype_dealloc;

    /* Always override allocation strategy to use regular heap */
    type->tp_alloc = PyType_GenericAlloc;
    type->tp_free = PyObject_GC_Del;
    type->tp_traverse = subtype_traverse;
    type->tp_clear = subtype_clear;

    /* store type in class' cell if one is supplied */
    cell = _PyDict_GetItemIdWithError(dict, &PyId___classcell__);
    if (cell != NULL) {
        /* At least one method requires a reference to its defining class */
        if (!PyCell_Check(cell)) {
            PyErr_Format(PyExc_TypeError,
                         "__classcell__ must be a nonlocal cell, not %.200R",
                         Py_TYPE(cell));
            goto error;
        }
        PyCell_Set(cell, (PyObject *) type);
        if (_PyDict_DelItemId(dict, &PyId___classcell__) < 0) {
            goto error;
        }
    }
    else if (PyErr_Occurred()) {
        goto error;
    }

    /* Initialize the rest */
    if (PyType_Ready(type) < 0)
        goto error;

    /* Put the proper slots in place */
    fixup_slot_dispatchers(type);

    if (type->tp_dictoffset) {
        et->ht_cached_keys = _PyDict_NewKeysForClass();
    }

    if (set_names(type) < 0)
        goto error;

    if (init_subclass(type, kwds) < 0)
        goto error;

    Py_DECREF(dict);
    return (PyObject *)type;

error:
    Py_XDECREF(dict);
    Py_XDECREF(bases);
    Py_XDECREF(slots);
    Py_XDECREF(type);
    return NULL;
}

int PyType_Ready(PyTypeObject *type)
{
    PyObject *dict, *bases;
    PyTypeObject *base;
    Py_ssize_t i, n;

    if (type->tp_flags & Py_TPFLAGS_READY)
    {
        assert(_PyType_CheckConsistency(type));
        return 0;
    }
    type->tp_flags |= Py_TPFLAGS_READYING;

    /* Initialize tp_dict */
    dict = type->tp_dict;
    if (dict == NULL)
    {
        dict = PyDict_New();
        if (dict == NULL)
            goto error;
        type->tp_dict = dict;
    }

    /* Add type-specific descriptors to tp_dict */
    if (add_operators(type) < 0)
        goto error;
    if (type->tp_methods != NULL)
    {
        /* 将 tp_methods 中的方法封装为描述器存入 tp_dict */
        if (add_methods(type, type->tp_methods) < 0)
            goto error;
    }
    if (type->tp_members != NULL)
    {
        /* 将 tp_members 中的字段封装为描述器存入 tp_dict */
        if (add_members(type, type->tp_members) < 0)
            goto error;
    }
    if (type->tp_getset != NULL)
    {
        /* 将 tp_getset 中的 PyGetSetDef 封装为描述器存入 tp_dict */
        if (add_getset(type, type->tp_getset) < 0)
            goto error;
    }

    /* Calculate method resolution order */
    /* 计算 mro 存入 tp_mro */
    if (mro_internal(type, NULL) < 0)
        goto error;

    /* Some more special stuff */
    base = type->tp_base;
    /* 继承父类的方法 */
    if (base != NULL)
    {
        if (type->tp_as_async == NULL)
            type->tp_as_async = base->tp_as_async;
        if (type->tp_as_number == NULL)
            type->tp_as_number = base->tp_as_number;
        if (type->tp_as_sequence == NULL)
            type->tp_as_sequence = base->tp_as_sequence;
        if (type->tp_as_mapping == NULL)
            type->tp_as_mapping = base->tp_as_mapping;
        if (type->tp_as_buffer == NULL)
            type->tp_as_buffer = base->tp_as_buffer;
    }

    type->tp_flags =
        (type->tp_flags & ~Py_TPFLAGS_READYING) | Py_TPFLAGS_READY;
    assert(_PyType_CheckConsistency(type));
    return 0;

error:
    type->tp_flags &= ~Py_TPFLAGS_READYING;
    return -1;
}
```
对象的创建过程非常复杂，需要不仅需要处理继承，还要实现各种各样的技术，如 slots 的实现，将方法封装为方法描述器等。总之，这里核心关注在一个用户自定义类，本质上是一个 `PyTypeObject`，用户自定义的各种字段通过一个函数执行后保存到 `dict` 中，最后设置到该 `PyTypeObject` 的 `tp_dict` 指针。逐个细节在附中依次拆解。

## 附：常见对象的实现机制
Python 内的 `PyObject` 大致包含两种，一种是在 C 层级实现的 `Py*Object`，另一种用户自定义实现的类型或实例。常见的对象，如 int（long）、float、bool、str（unicode）、tuple、list、dict、set、bytes 等。在已有的资料中已经包含大量这部分的论述，如下罗列：
- int、bool（long）
    - [CPython-Internals - long/int](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/long/long_cn.md)
    - [码农高天 - 看似简单的加法，背后究竟有多少代码需要运行？看了才知道！](https://www.bilibili.com/video/BV1Db4y1x7di/?spm_id_from=333.1387.collection.video_card.click&vd_source=1e075be878ba55c5ebe75119b13bb41a)
    - [junnplus - Python中的整数对象](https://github.com/Junnplus/blog/issues/12)
    - [CPython Internals: Your Guide to the  Python 3 Interpreter - Object and Variable Object Types](https://realpython.com/products/cpython-internals-book)
    - [3.8.20 Documentation - PyLongObject](https://docs.python.org/zh-cn/3.8/c-api/long.html?highlight=pylongobject#c.PyLongObject)
    - [CPython Main - boolobject.c](https://github.com/python/cpython/blob/main/Objects/boolobject.c)
    - [CPython Main - longobject.c](https://github.com/python/cpython/blob/main/Objects/longobject.c)
- float
    - [CPython-Internals - float](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/float/float_cn.md)
    - [3.8.20 Documentation - PyFloatObject](https://docs.python.org/zh-cn/3.8/c-api/float.html?highlight=float#c.PyFloatObject)
    - [CPython Main - floatobject.c](https://github.com/python/cpython/blob/main/Objects/floatobject.c)
- str（unicode）
    - [CPython-Internals - unicode/str](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/str/str_cn.md)
    - [码农高天 - 你绝对不知道的字符串缓存机制！这个知识点有点太偏了](https://www.bilibili.com/video/BV1Q14y157v8/?spm_id_from=333.1387.collection.video_card.click&vd_source=1e075be878ba55c5ebe75119b13bb41a)
    - [junnplus - Python中的字符串对象](https://github.com/Junnplus/blog/issues/13)
    - [CPython internals - Example Python data types - Lecture 5](https://www.youtube.com/watch?v=ngkl95AMl5M&list=PLzV58Zm8FuBL6OAv1Yu6AwXZrnsFbbR0S&index=5)
    - [CPython Internals: Your Guide to the  Python 3 Interpreter - The Unicode String Type](https://realpython.com/products/cpython-internals-book)
    - [3.8.20 Documentation - unicode-objects](https://docs.python.org/zh-cn/3.8/c-api/unicode.html?highlight=pyunicode#unicode-objects)
    - [CPython Main - unicodeobject.c](https://github.com/python/cpython/blob/main/Objects/unicodeobject.c)
- tuple
    - [CPython-Internals - tuple](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/tuple/tuple_cn.md)
    - [CPython internals - Example Python data types - Lecture 5](https://www.youtube.com/watch?v=ngkl95AMl5M&list=PLzV58Zm8FuBL6OAv1Yu6AwXZrnsFbbR0S&index=5)
    - [Inside The Python Virtual Machine - Type Object Case Studies](https://leanpub.com/insidethepythonvirtualmachine)
    - [3.8.20 Documentation - PyTupleObject](https://docs.python.org/zh-cn/3.8/c-api/tuple.html?highlight=pytuple#c.PyTupleObject)
    - [CPython Main - tupleobject.c](https://github.com/python/cpython/blob/main/Objects/tupleobject.c)
- list
    - [CPython-Internals - list(timsort)](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/list/list_cn.md)
    - [junnplus - Python中的列表对象](https://github.com/Junnplus/blog/issues/14)
    - [CPython internals - Example Python data types - Lecture 5](https://www.youtube.com/watch?v=ngkl95AMl5M&list=PLzV58Zm8FuBL6OAv1Yu6AwXZrnsFbbR0S&index=5)
    - [3.8.20 Documentation - PyListObject](https://docs.python.org/zh-cn/3.8/c-api/list.html?highlight=pylistobject#c.PyListObject)
    - [CPython Main - listobject.c](https://github.com/python/cpython/blob/main/Objects/listobject.c)
- dict
    - [CPython-Internals - dict](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/dict/dict_cn.md)
    - [junnplus - Python中的字典对象](https://github.com/Junnplus/blog/issues/15)
    - [CPython Internals: Your Guide to the  Python 3 Interpreter - The Dictionary Type](https://realpython.com/products/cpython-internals-book)
    - [3.8.20 Documentation - PyDictObject](https://docs.python.org/zh-cn/3.8/c-api/dict.html?highlight=dict#c.PyDictObject)
    - [CPython Main - dictobject.c](https://github.com/python/cpython/blob/main/Objects/dictobject.c)
- set
    - [CPython-Internals - set](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/set/set_cn.md)
    - [码农高天 - 同样的set，不同的输出顺序？深度解析你肯定不知道的set背后的奥秘！](https://www.bilibili.com/video/BV1CU4y1y7Sg/?spm_id_from=333.1387.collection.video_card.click&vd_source=1e075be878ba55c5ebe75119b13bb41a)
    - [3.8.20 Documentation - PySetObject](https://docs.python.org/zh-cn/3.8/c-api/set.html?highlight=pysetobject#c.PySetObject)
    - [CPython Main - setobject.c](https://github.com/python/cpython/blob/main/Objects/setobject.c)
- bytes
    - [CPython-Internals - bytes](https://github.com/zpoint/CPython-Internals/blob/master/BasicObject/bytes/bytes_cn.md)
    - [3.8.20 Documentation - PyBytesObject](https://docs.python.org/zh-cn/3.8/c-api/bytes.html?highlight=pybytesobject#c.PyBytesObject)
    - [CPython Main - bytesobject.c](https://github.com/python/cpython/blob/main/Objects/bytesobject.c)

## 附：__slots__ 机制如何使实例属性访问变快的？
