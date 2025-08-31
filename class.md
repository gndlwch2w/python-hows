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
因此，除编译阶段外，研究 Python 执行阶段中的各种功能等于同研究 CPython 中的 `PyTypeObject` 和除 `PyTypeObject` 外的 `PyObject`。所以，类或对象就是 `PyObject`，或更广义，都是 `PyObject`。