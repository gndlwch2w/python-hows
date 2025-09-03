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
到这里，似乎一切都如出一辙，仅是不同编程语言语法上的差异。我们进一步输出和观察 Python 给用户暴露的类和实例，关键字 `class` 定义的 `Cat` 是一个 class，而实例化的 `cat` 是一个 object。
```python
>>> Cat
<class '__main__.Cat'>
>>> cat
<__main__.Cat object at 0x100a75bb0>
```
进一步，我们观察 Python 暴露的其他接口。似乎一切开始诡异，数、字符串、函数、方法、常量以及类本身都是某种 class 的实例对象。例如 `2147483647` 是 `int` 的实例，而 `int` 是 `type` 的实例，`type` 是自身的实例。
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
这得出一个结论，Python 向用户暴露的界面都是对象，即用户看到的所有东西都是对象，包括如数、字符串、函数、方法、类和模块等都是对象。从面向对象角度来说，对象或实例都有类型，表明它们是从哪实例化（或模板是什么），为此每个对象都可以通过 `type(obj)` 获取它们的类型；另外，我们总可以通过 `obj.member` 的方式来访问它们暴露的属性或方法。需要特殊说明的是类本身也是对象，因此也有类型，默认为 type。一般我们指类的类型为元类（meta class），其它对象的类型为类（class）。例如，通过 `def` 或 `lambda` 定义的函数对象是 `function` 类型的实例，而 `function` 类型对象本身是 `type` 类型的实例，这里的 `function` 称为 class，而 `type` 称为 meta class。

另一个有趣的观察是，Python 的所有对象都是同一*类型*的对象。我们研究如下的函数 `f`，先不将 `f` 视作为函数而是一个普通的数据结构（如图结构那样，包含顶点集和边集成员）。通过 `dir(f)` 看到 `f` 这种数据结构包含有很多成员（这里的成员不区分属性和方法），而这些成员本身也如同 `f` 一样具有相同的成员，也就是说 `f` 的数据结构和其递归成员的数据结构应当派生自同一父数据结构，而它们作为父数据结构的扩展，拥有独特成员。从用户视角看，一切都是对象，且 `f` 和其成员在某个层面上具有相同的类型。实际中，如函数的类型是 `function`，`function` 的类型是 `type`，可以广义的说所有对象的类型都是 `type`。通常所说的类型只是第一层级的类型，如 `123` 的类型为 `int` 而不是 `type`。另外，`type` 和如 `int` 的 class 属于同一类对象。
```python
>>> f = lambda: 0
>>> dir(f)
['__annotations__', '__call__', '__class__', '__closure__', '__code__', '__defaults__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__get__', '__getattribute__', '__globals__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__kwdefaults__', '__le__', '__lt__', '__module__', '__name__', '__ne__', '__new__', '__qualname__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__']
>>> set(dir(f)) & set(dir(f.__name__))
{'__setattr__', '__format__', '__le__', '__init_subclass__', '__gt__', '__reduce__', '__str__', '__getattribute__', '__subclasshook__', '__hash__', '__lt__', '__init__', '__reduce_ex__', '__class__', '__new__', '__eq__', '__repr__', '__doc__', '__delattr__', '__ne__', '__sizeof__', '__dir__', '__ge__'}
>>> set(dir(f)) - set(dir(f.__name__))
{'__globals__', '__get__', '__defaults__', '__name__', '__call__', '__module__', '__kwdefaults__', '__code__', '__qualname__', '__closure__', '__annotations__', '__dict__'}
```

从实现层面来看，将所有的东西都视作为具有某种性质的数据，然后以某种方式定义数据结构 `D` 来承载这些数据，并为这些数据结构提供相关的操作函数 `F`，然后再定义另一个数据结构 `T` 将 `D` 和 `F` 封装起来，并为 `T` 提供统一的接口访问封装的 `D` 和 `F`。对应到上面提到的函数 `f`，`D` 定义了 `f` 的属性；`F` 定义了相关的操作方法；`T` 为 `f` 的类型，以统一的方式封装 `D` 和 `F` 后向外暴露接口。由于所有的对象都是按照这个逻辑实现，那么对所有对象的访问都是一致的。这里统一的接口如 `type()`、`id()` 和 `dir()` 等，其作用到具体的数据结构 `D` 上，然后从 `D` 中获得 `T`，然后调用 `T` 的相关函数实现对 `D` 访问。

进一步可以将 `D` 和 `F` 划分为两个子集。子集的第一部分为所有类型数据结构成员的交集，第二部分为特有的成员集。这样可以将共有的部分统一增加到数据结构 `T` 上，那么等同于给所有数据结构暴露统一的接口，然后将 `T` 视作为特殊的 `D`，提供默认的接口实现。那么对于任意 `D`，其 `F` 中若提供了相应接口实现则覆盖，否则继承默认。对于子集的第二部分，可以通过定义某种协议将特有属性和方法封装起来，然后提供相应的函数去访问它们，最后在 `T` 的操作函数中统一二者便能实现统一的接口。

对于 C 实现的内置对象来说，直接提供相应的 `D`、`F` 和 `T` 即可。另一类特殊的对象是 Python 层面用户自定义的 class，其中综合包含了这三部分。所需要做的是，创建 `T` 的新实例，将用户提供的成员和方法分别封装到对应的位置，这样也同其它任何对象一样支持相同的访问接口，那么就可以得到自定义类型的 class。而实例化的时候，只用封装其类型 `T` 和初始化新的实例字段，便可以得到实例 `D`。

CPython 层面将数据结构 `D` 定义为 `PyObject` 的结构体，不过这里对数据结构的成员也做了抽象，而不是直接具体实现某一个 `D`。如上面提到任意数据结构 `D` 具有其类型 `T`，那么这个属性就是所有数据结构共有的，可以将其单独抽离作为所有数据结构的前缀。这样可以额外获得一个益处，即任意子数据结构指针都可以转换为这种类型指针，统一了所有 `T` 接口的输入输出数据结构类型，而将实际的类型转换下调到具体的实现中，因为 `F` 中的操作函数肯定是明确类型就是 `D`。如下为 `PyObject` 的定义：
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
作为所有数据结构的共同属性，其中仅定义了两个字段，`ob_refcnt` 为引用计数，与垃圾回收有关；`ob_type` 为该对象的类型对象。它的一个扩展 `PyVarObject`，在其基础上增加了 `ob_size` 属性表明内存需求可变数据结构的可变部分所占内存大小，这样的对象如 int、tuple、type 和 str 等。需要它的原因是由于 `PyObject` 在分配内存后不会再进行移动或 `remalloc` 操作，这是因为移动操作会导致所有与该对象有关的指针都需要调整，故直接不允许移动操作来简化系统复杂度。

下面是数据结构 `D` 的一个具体例子，实现的是函数对象的数据结构，定义为 `PyFunctionObject`，前缀是 `PyObject`，其中包含了函数对象的特有属性，如函数名称、闭包等。而关于对应的 `F`，我们需要了解 `T` 的实现后在研究。
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
前面提到，需要数据结构 `T` 作用是统一封装 `D` 和 `F`，并暴露统一的接口，而 `T` 本身也是特殊的 `D`，相关的 `F` 就是向外暴露的接口。它是一个 `PyObject`，定义为 `PyTypeObject`，各字段的注释参考自：[PyTypeObject](https://docs.python.org/zh-cn/3.8/c-api/typeobj.html#c.PyTypeObject)。可以看到其中包含了所有对象共有的函数接口，如 `tp_as_number`、`tp_as_sequence` 和 tp_as_mapping 等；也包含了共有的属性，如 `tp_name` 和 `tp_doc` 等。特有的属性和方法通过 `tp_methods` 和 `tp_members` 相应的协议进行封装，并有相应的函数支持访问。这里仅对 `PyTypeObject` 的作用说明，暂不对其各字段的功能做讨论，具体到运用由其它章节涉及。
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
了解到 `T` 的实现后，我们继续 `function` 的案例，了解 `T` 是如何封装 `D` 和 `F` 的。可以看到 `PyFunctionObject` 的类型 `PyFunction_Type` 内封装了具体关于 `PyFunctionObject` 对象的方法和属性。以 `func_repr` 的实现，其类型是 `PyFunctionObject`，即具体类型转换下调。
```c
PyTypeObject PyFunction_Type = {
    PyVarObject_HEAD_INIT(&PyType_Type, 0)
    "function",
    sizeof(PyFunctionObject),
    0,
    (destructor)func_dealloc,                   /* tp_dealloc */
    offsetof(PyFunctionObject, vectorcall),     /* tp_vectorcall_offset */
    0,                                          /* tp_getattr */
    0,                                          /* tp_setattr */
    0,                                          /* tp_as_async */
    (reprfunc)func_repr,                        /* tp_repr */
    0,                                          /* tp_as_number */
    0,                                          /* tp_as_sequence */
    0,                                          /* tp_as_mapping */
    0,                                          /* tp_hash */
    function_call,                              /* tp_call */
    0,                                          /* tp_str */
    0,                                          /* tp_getattro */
    0,                                          /* tp_setattro */
    0,                                          /* tp_as_buffer */
    Py_TPFLAGS_DEFAULT | Py_TPFLAGS_HAVE_GC |
    _Py_TPFLAGS_HAVE_VECTORCALL |
    Py_TPFLAGS_METHOD_DESCRIPTOR,               /* tp_flags */
    func_new__doc__,                            /* tp_doc */
    (traverseproc)func_traverse,                /* tp_traverse */
    (inquiry)func_clear,                        /* tp_clear */
    0,                                          /* tp_richcompare */
    offsetof(PyFunctionObject, func_weakreflist), /* tp_weaklistoffset */
    0,                                          /* tp_iter */
    0,                                          /* tp_iternext */
    0,                                          /* tp_methods */
    func_memberlist,                            /* tp_members */
    func_getsetlist,                            /* tp_getset */
    0,                                          /* tp_base */
    0,                                          /* tp_dict */
    func_descr_get,                             /* tp_descr_get */
    0,                                          /* tp_descr_set */
    offsetof(PyFunctionObject, func_dict),      /* tp_dictoffset */
    0,                                          /* tp_init */
    0,                                          /* tp_alloc */
    func_new,                                   /* tp_new */
};

static PyObject*
func_repr(PyFunctionObject *op)
{
    return PyUnicode_FromFormat("<function %U at %p>",
                               op->func_qualname, op);
}
```
在 CPython 中，几乎一切都是围绕 `PyObject` 实现的，所有的数据结构都是 `PyObject` 的扩展。因此，简单来说，对象就是 `PyObject` 的内存表示，而类（或类型）作为一种特殊的 `PyObject`，是 `PyTypeObject` 的内存表示。因此在 CPython 中，研究各种类/对象的实现等同研究不同的 `Py*Object` 和 `Py*_Type`。一些常见的对象实现机制，详见：[附：常见对象的实现机制](#附常见对象的实现机制)。

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

## 用户自定义类对象是如何被创建的？
如下我们自定义了 Singer 类，在模块被导入或在 <stdin> 模式下完成 Singer 的输入后回车，Singer 实例被自动创建，其类型是 `type`，表明其可能与 `tuple` 一样，是一个 `PyTypeObject` 对象。
```python
class Singer(object):
    def __init__(self, name='Xukun Cai'):
        self.name = name
    def sing(self):
        return f'{self.name} sings: Only because you are so beautiful'

>>> Singer
<class '__main__.Singer'>
>>> type(Singer)
<class 'type'>
>>> dir(Singer)
['__class__', '__delattr__', '__dict__', '__dir__', '__doc__', '__eq__', '__format__', '__ge__', '__getattribute__', '__gt__', '__hash__', '__init__', '__init_subclass__', '__le__', '__lt__', '__module__', '__ne__', '__new__', '__reduce__', '__reduce_ex__', '__repr__', '__setattr__', '__sizeof__', '__str__', '__subclasshook__', '__weakref__', 'sing']
```
我们通过 `dis` 查看 `Singer` 类创建过程的字节码。观察我们发现，类是通过 `LOAD_BUILD_CLASS` 字节码创建并保存到 `Singer` 变量的，它的参数包含 `Singer` 类体的函数，类名 `'Singer'` 和父类 `object`。
```text
  2           0 LOAD_BUILD_CLASS
              2 LOAD_CONST               0 (<code object Singer at 0x1050ecb30, file "<dis>", line 2>)
              4 LOAD_CONST               1 ('Singer')
              6 MAKE_FUNCTION            0
              8 LOAD_CONST               1 ('Singer')
             10 LOAD_NAME                0 (object)
             12 CALL_FUNCTION            3
             14 STORE_NAME               1 (Singer)
             16 LOAD_CONST               2 (None)
             18 RETURN_VALUE

Disassembly of <code object Singer at 0x1050ecb30, file "<dis>", line 2>:
  2           0 LOAD_NAME                0 (__name__)
              2 STORE_NAME               1 (__module__)
              4 LOAD_CONST               0 ('Singer')
              6 STORE_NAME               2 (__qualname__)

  3           8 LOAD_CONST               7 (('Xukun Cai',))
             10 LOAD_CONST               2 (<code object __init__ at 0x1050ec920, file "<dis>", line 3>)
             12 LOAD_CONST               3 ('Singer.__init__')
             14 MAKE_FUNCTION            1 (defaults)
             16 STORE_NAME               3 (__init__)

  5          18 LOAD_CONST               4 (<code object sing at 0x1050eca80, file "<dis>", line 5>)
             20 LOAD_CONST               5 ('Singer.sing')
             22 MAKE_FUNCTION            0
             24 STORE_NAME               4 (sing)
             26 LOAD_CONST               6 (None)
             28 RETURN_VALUE
```
观察 `Singer` 类体的函数，其大致可以对应为 `Singer()` 函数，作用是类成员初始化。
```python
def Singer():
    __module__ = __name__
    __qualname__ = 'Singer'
    def __init__(self, name='Xukun Cai'):
        self.name = name
    __init__.__qualname__ = 'Singer.__init__'
    def sing(self):
        return f'{self.name} sings: Only because you are so beautiful'
    sing.__qualname__ = 'Singer.sing'
    return None
```
我们进一步分析 `LOAD_BUILD_CLASS` 的实现，可以看到，其功能是从 `builtins` 中找到 `__build_class__` 函数并压栈。
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
我们继续找到 `__build_class__` 的实现，其中参数 `self` 为 `__build_class__` 对象本身；`args` 为 frame 的值栈，代表的参数依次为 `Singer` 类体的函数、类名 `'Singer'` 和父类 `object`；`nargs` 为参数个数，`kwnames` 为额外的参数。
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
通过分析 `builtin___build_class__` 函数，真正构建类的逻辑被转发到了 metaclass 来完成。在 `Singer` 类中，我们指定了父类为 `object`，其类型 `type` 作为 metaclass 来构建类实例，关于调用参考：[为什么函数（或实例）可以被调用？](https://github.com/gndlwch2w/python-hows/blob/main/func.md#%E4%B8%BA%E4%BB%80%E4%B9%88%E5%87%BD%E6%95%B0%E6%88%96%E5%AE%9E%E4%BE%8B%E5%8F%AF%E4%BB%A5%E8%A2%AB%E8%B0%83%E7%94%A8)，那么 `type` 的 `tp_call` 指向的 `type_call` 被调用来构建实例。其中，第一个参数为 `type`；`args` 为 `{类名, 父类 tuple, 类体成员 dict}`；`kwds` 为额外参数。
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
在 `type_call` 中，将创建转发到 `type` 的 `tp_new` 来构建，它的调用参数同 `type_call`。
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

    dict = PyDict_Copy(orig_dict);
    if (dict == NULL)
        goto error;

    /* Allocate the type object */
    type = (PyTypeObject *)metatype->tp_alloc(metatype, nslots);
    if (type == NULL)
        goto error;

    /* Initialize tp_dict from passed-in dict */
    Py_INCREF(dict);
    type->tp_dict = dict;

    /* Initialize the rest */
    if (PyType_Ready(type) < 0)
        goto error;

    /* Put the proper slots in place */
    fixup_slot_dispatchers(type);

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
