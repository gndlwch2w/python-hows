## 什么是类和对象？
各种面向对象编程语言中都有类的概念和支持。如在 Java 中，通过 `class` 关键字用户可自定义各种各样的类。`extends` 和 `implements` 关键字实现了面向对象的继承协议，子类可以**继承**父类的属性或方法，也可以覆盖父类的方法。同时，父类或接口的引用能够依据继承关系**动态**的调用实例的方法。`pulic`、`protected` 和 `private` 支持对类别成员进行不同访问级别的**封装**。
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
Python 中同样提供了对面向对象协议的支持，即也支持继承和封装，而对于多态，鉴于 Python 为弱类型动态语言，从用户视角来看，几乎所有调用都是多态的。在 Python 中，广为熟知通过 `class` 关键字可以类似 Java 那样用户自定义类，在类名紧接着的括号内可以指定要继承的类，在类的声明里可以继承或覆盖父类的成员。
```python
class Animal:
    def speak(self):
        raise NotImplementedError("speak")

class Felidae:
    def __init__(self, full_name):
        # 封装
        self.__full_name = full_name
    def get_full_name(self):
        return self.__full_name

# 继承
class Cat(Felidae, Animal):
    def __init__(self, full_name=None):
        super(Cat, self).__init__(full_name or "Felis silvestris catus")
    # 覆盖
    def speak(self):
        print(f"{self.get_full_name()} says:  Meow!")

class Tiger(Felidae, Animal):
    def __init__(self):
        super(Tiger, self).__init__("Panthera tigris")
    def speak(self):
        print(f"{self.get_full_name()} says:  Roar!")

if __name__ == "__main__":
    cat = Cat("Kitty")
    tiger = Tiger()
    # 多态
    cat.speak()
    # Kitty says:  Meow!
    tiger.speak()
    # Panthera tigris says:  Roar!
```
到这里，似乎一切都如出一辙，仅是一些语法和形式上的差异。我们进一步输出和观察 Python 给用户暴露的类和实例，可以看到，用关键字 `class` 定义的 `Cat` 是一个 class，实例化的 `cat` 是一个 object。
```ipython
>>> Cat
<class '__main__.Cat'>
>>> cat
<__main__.Cat object at 0x100a75bb0>
```
进一步，我们观察 Python 给用户暴露的其他接口，似乎一切开始诡异，数、字符串、函数、方法、常量以及类本身都是某种 class 的实例对象，例如 `2147483647` 是 `int` 的实例，而 `int` 是 `type` 的实例，`type` 是自身的实例。我们不直接打印实例本身是因为这些内置实例的类型都实现了相应的 `repr` 方法，直接输出无法看到想要的结果。
```ipython
>>> int
<class 'int'>
>>> type(int)
<class 'type'>
>>> type(2147483647)
<class 'int'>
>>> type(3.1415926)
<class 'float'>
>>> type("Hello, Class")
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
>>> type(type)
<class 'type'>
```
这得出一个结论，似乎 Python 向用户暴露的界面都是对象，即用户看到的所有接口都是对象，我们都可以以类似 `obj.member` 的方式使用，并且它们都具有类型属性，即 `type(obj)`。对于普通实例的类型，称之为 class，而类型实例的类型，称之为 meta class。例如，通过 `def` 或 `lambda` 定义的函数是 `function` 类型的实例，而 `function` 类型实例本身是 `type` 类型的实例，这里的 `function` 称为 class，而 `type` 称为 meta class。

为了理解一切皆对象，我们研究如下的函数 `f`，先不将 `f` 视作为函数而是一个普通的数据结构，如图结构那样，包含顶点和边成员。通过 `dir(f)` 可以看到，`f` 这种数据结构包含很多与之相关的成员，而这些成员本身也如同 `f` 一样具有相同的成员，也就是说 `f` 的数据结构和其成员的数据结构应当派生自某个父数据结构，而它们作为父数据结构的扩展，拥有独特成员。从用户和面向对象视角看，仿佛可以说，`f` 和其成员具有相同的类型，它们都继承自同一父类型，并可以覆盖父类型的成员（如不同数据结构都具有的 `__ge__` 成员在不同数据结构上具有不同的行为）以及继续扩展自己的成员。因此可以说，一切皆对象是把所有东西共有成员抽象为某一数据结构，再将其作为所有子数据结构的父数据结构，这些子数据结构可以继承或覆盖父数据结构成员，也可以继续扩展孙数据结构，继承和覆盖满足面向对象协议。那么，所有对父数据结构的操作都能运算在任意子数据结构上，如 `dir()`、`type()`、`id()` 等。
```python
>>> f = lambda: 0
>>> dir(f)
['__annotations__', '__call__', '__class__', '__closure__', '__code__', '__defaults__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__get__', '__getattribute__', '__globals__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__kwdefaults__', '__le__', '__lt__', '__module__', '__name__', '__ne__', '__new__', '__qualname__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__']
>>> set(dir(f)) & set(dir(f.__name__))
{'__setattr__', '__format__', '__le__', '__init_subclass__', '__gt__', '__reduce__', '__str__', '__getattribute__', '__subclasshook__', '__hash__', '__lt__', '__init__', '__reduce_ex__', '__class__', '__new__', '__eq__', '__repr__', '__doc__', '__delattr__', '__ne__', '__sizeof__', '__dir__', '__ge__'}
>>> set(dir(f)) - set(dir(f.__name__))
{'__globals__', '__get__', '__defaults__', '__name__', '__call__', '__module__', '__kwdefaults__', '__code__', '__qualname__', '__closure__', '__annotations__', '__dict__'}
```

一切皆对象的模式带来一种有趣的特性，从实现层面来看，将所有的东西都视作为具有某种性质的数据，然后以某种方式规范数据结构来承载这些数据，并为这些数据结构提供相关的运算函数，最后再以统一的满足面向对象协议的用户界面将数据和运算暴露给用户。例如，class 在实现层面看来就是数据，包含如类名、属性、方法等字段，允许被创建、销毁等操作；function 在实现层面也是数据，包含函数名、函数体、说明文档等字段，允许被修改名字，被调用等操作。然后通过另外一个数据结构规范和承载如 class 和 function 的属性字段和操作函数，然后这个数据结构的相关操作函数提供如 `obj.member` 的用户界面向用户屏蔽不同数据结构内部的调用和处理逻辑。而如自定义的 class 或 function 则也是通过该数据结构的操作函数将用户提供的数据（属性、方法、函数）封装为这种数据结构，从而也一致兼容 `obj.member` 的用户界面。

CPython 层面将数据模型抽象为 `PyObject` 的结构体，它是所有数据结构的父数据结构，即其它任意子数据结构指针都可以转换为这种类型指针。如下为它的定义：
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
在 `PyObject` 中仅定义了两个字段，`ob_refcnt` 为引用计数，与垃圾回收有关；`ob_type` 为该对象的类型对象。它的定义非常简单，可以理解为 CPython 所有对象的父对象，即所有子对象都可以转换为父对象，且所有子对象拥有父对象的所有成员。而由于 `PyObject` 在分配内存后不会再进行移动或 `remalloc` 操作，这是因为移动操作会导致所有与该对象有关的指针都需要调整。那么针对如 `int`、`str` 和 `tuple` 等这种内存需求可变的类型对象，`PyVarObject` 提供 `ob_size` 字段表明可变部分的内存大小。

上面提到需要一种数据结构来规范和承载各种数据，其定义为 `PyObject`，对于如 class 和 function，它们是具有不同性质的数据，派生自 `PyObject`。可以看到 function 的数据结构在 C 层面定义为 `PyFunctionObject`，它的前缀是 `PyObject`，其中包含了如函数名称、函数体等相关的成员，这些成员同样也是 `PyObject` 类型。
```c
/* funcobject.h */
typedef struct {
    PyObject_HEAD
    PyObject *func_code;        /* A code object, the __code__ attribute */
    PyObject *func_globals;     /* A dictionary (other mappings won't do) */
    PyObject *func_defaults;    /* NULL or a tuple */
    PyObject *func_kwdefaults;  /* NULL or a dict */
    PyObject *func_closure;     /* NULL or a tuple of cell objects */
    PyObject *func_doc;         /* The __doc__ attribute, can be anything */
    PyObject *func_name;        /* The __name__ attribute, a string object */
    PyObject *func_dict;        /* The __dict__ attribute, a dict or NULL */
    PyObject *func_weakreflist; /* List of weak references */
    PyObject *func_module;      /* The __module__ attribute, can be anything */
    PyObject *func_annotations; /* Annotations, a dict or NULL */
    PyObject *func_qualname;    /* The qualified name */
    vectorcallfunc vectorcall;
} PyFunctionObject;
```
另外，我们提到，不同 `PyObject` 的子数据结构包含各式各样的属性和方法，为提供统一满足面向对象协议的用户界面，每个 `PyObject` 都包含有一个成员 `ob_type`，作为上面提到的另外一个数据结构来规范和承载各种数据结构的属性和方法，从而可以向外暴露统一的接口。这种数据结构在 CPython 中被定义为 `PyTypeObject`，其也是 `PyObject` 的子数据结构，它的成员如下，各字段的注释参考自：[PyTypeObject](https://docs.python.org/zh-cn/3.8/c-api/typeobj.html#c.PyTypeObject)。这种数据结构的功能是规范和承载各种非 `PyTypeObject` 的 `PyObject`，将它们的成员以统一的方式进行组织，如 `tp_methods` 和 `tp_members`，并提供相关的操作函数向外暴露统一的用户界面来访问其承载的各种 `PyObject`。
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
因此，除编译阶段外，研究 Python 执行阶段中的各种功能等于同研究 CPython 中的 `PyTypeObject` 和除 `PyTypeObject` 外的 `PyObject`。所以，类或对象就是 `PyObject`，或更广义，都是 `PyObject`。一些常见的对象实现机制，详见：[附：常见对象的实现机制](#附常见对象的实现机制)。

## 内置对象是如何封装成员暴露接口的？
我们以 `tuple` 为例，研究其成员封装、接口暴露。如下可以看到 `tuple` 是一个 class，其类型为 type，其实例 `t` 的类型为 tuple，拥有和 `tuple` 相同的成员。`tuple` 在 C 层级为 `PyTypeObject` 的实例，实例名称为 `PyTuple_Type`；`t` 在 C 层级为 `PyTupleObject` 的实例。
```python
>>> tuple
<class 'tuple'>
>>> type(tuple)
<class 'type'>
>>> dir(tuple)
['__add__', '__class__', '__contains__', '__delattr__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__getattribute__', '__getitem__', '__getnewargs__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__iter__', '__le__', '__len__', '__lt__', '__mul__', '__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__rmul__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__', 'count', 'index']
>>> t = tuple((1, 2, 3))
>>> t
(1, 2, 3)
>>> type(t)
<class 'tuple'>
>>> set(dir(t)) - set(dir(tuple))
set()
```
`tuple` 的功能是存储一组 Python 对象序列，实例创建后不能修改这组序列本身。所以实现 `tuple` 的 `PyTupleObject` 内拥有一个 `ob_item` 数组成员，用于保存 `tuple` 持有的这组 Python 对象序列。`PyTupleObject` 是一个 `PyVarObject`，因为不同元素个数的 tuple 所需要的 `ob_item` 长度不同，因此需要 `ob_size` 来记录额外所需的内存大小。
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
另外，在 `PyTupleObject` 被实例化时，其成员 `ob_type` 会指向 `PyTuple_Type`。之前提到 `PyTypeObject` 是用于封装 `Py*Object` 的成员和暴露统一的接口，那么 `PyTuple_Type` 就是对 `PyTupleObject` 的封装，并实现 `PyTypeObject` 所定义的接口，从而字节码层面看到的都是各种 `PyTypeObject` 和统一的接口，它们的处理逻辑一致，调用的是不同运行时的函数。如下是 `PyTuple_Type` 的具体实现，`0` 的项表示 `tuple` 类型不支持这一接口。
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
以 `tp_repr` 实现的 `tuplerepr` 举例来说，这些接口是何时被调用，我们通过 `repr` 函数输出 `tuple` 实例的可读字符串，并通过 `dis` 给出执行的字节码，其通过 `CALL_FUNCTION` 调用 `builtin` 中的 `repr` 函数来实现的功能。
```python
>>> repr((1, 2, 3))
'(1, 2, 3)'
>>> dis.dis('repr((1, 2, 3))')
  1           0 LOAD_NAME                0 (repr)
              2 LOAD_CONST               0 ((1, 2, 3))
              4 CALL_FUNCTION            1
              6 RETURN_VALUE
```
我们可以看到 `repr` 函数通过 `v->ob_type->tp_repr` 调用 `tuple` 实例的类型的 `tp_repr` 来完成输出。这里就容易理解为什么说 `PyTypeObject` 是封装各种对象的成员并暴露统一的接口了。
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
接下来，我们看 `tuple` 类型的 `tuplerepr` 实现，可以看到，其封装了对 `PyTupleObject` 的操作函数，并基于这种数据结构的特性实现了 `tp_repr` 的接口协议。
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
