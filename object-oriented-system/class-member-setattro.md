### 类成员的写入

对类对象成员写入的设计逻辑如下：

* 类对象的成员修改仅支持 @@heap-types@@，即如 `class` 创建的动态类型。禁止对静态类型的修改是因为基于 C 本身有加速实现的目的，若允许在 Python 层修改，不仅动态更新 C 槽麻烦，而且调用也更加缓慢，但允许通过继承扩展的方式进行定制化。

* 类对象本身是一种特殊的对象，其成员写入由 _PyObject_GenericSetAttrWithDict() 实现，其会先检查被修改成员是否为数据描述器对象，若是则调用其 @@__set__[1]@@ 方法执行写入，否则只能寻找对象的实例字典进行写入，相关实现参照 @@object-member-setattro@@。

* 若修改成功则需要一致性更新，首先调用 @@CAPI_PyType_Modified@@ 标记当前类型及其子类的 @@Py_TPFLAGS_VALID_VERSION_TAG@@ 缓存标志位失效，如成员之间的相互依赖，其中一个修改其它值也会可能发生变化。然后检查修改是否影响到 C 槽，如修改 @@__repr__@@ 的实现，需要相应更新到 @@tp_repr@@ 槽以确保一致性。

```c
// Objects/typeobject.c#type_setattro
static int
type_setattro(PyTypeObject *type, PyObject *name, PyObject *value)
{
    int res;
    // 禁止修改静态分配类型的成员
    if (!(type->tp_flags & Py_TPFLAGS_HEAPTYPE)) {
        PyErr_Format(
            PyExc_TypeError,
            "can't set attributes of built-in/extension type '%s'",
            type->tp_name);
        return -1;
    }
    if (PyUnicode_Check(name)) {
        if (PyUnicode_CheckExact(name)) {
            if (PyUnicode_READY(name) == -1)
                return -1;
            Py_INCREF(name);
        }
        else {
            name = _PyUnicode_Copy(name);
            if (name == NULL)
                return -1;
        }
        if (!PyUnicode_CHECK_INTERNED(name)) {
            PyUnicode_InternInPlace(&name);
            if (!PyUnicode_CHECK_INTERNED(name)) {
                PyErr_SetString(PyExc_MemoryError,
                                "Out of memory interning an attribute name");
                Py_DECREF(name);
                return -1;
            }
        }
    }
    else {
        /* Will fail in _PyObject_GenericSetAttrWithDict. */
        Py_INCREF(name);
    }
    res = _PyObject_GenericSetAttrWithDict((PyObject *)type, name, value, NULL);
    if (res == 0) {
        /* Clear the VALID_VERSION flag of 'type' and all its
           subclasses.  This could possibly be unified with the
           update_subclasses() recursion in update_slot(), but carefully:
           they each have their own conditions on which to stop
           recursing into subclasses. */
        PyType_Modified(type);

        if (is_dunder_name(name)) {
            res = update_slot(type, name);
        }
        assert(_PyType_CheckConsistency(type));
    }
    Py_DECREF(name);
    return res;
}
```

标记缓存失效的 @@CAPI_PyType_Modified@@ 接口实现如下，其核心依赖类型的 @@tp_subclasses@@ 槽指向的子类字典，即先递归标记子类的缓存标志位 @@Py_TPFLAGS_VALID_VERSION_TAG@@ 失效，然后再标记当前类型缓存失效。必须标记所有子类是因为子类可能继承自父类的成员，父类发生成员修改后，子类必须重新获取最新的值。

```c
// Objects/typeobject.c#PyType_Modified
void
PyType_Modified(PyTypeObject *type)
{
    /* Invalidate any cached data for the specified type and all
       subclasses.  This function is called after the base
       classes, mro, or attributes of the type are altered.

       Invariants:

       - Py_TPFLAGS_VALID_VERSION_TAG is never set if
         Py_TPFLAGS_HAVE_VERSION_TAG is not set (in case of a
         bizarre MRO, see type_mro_modified()).

       - before Py_TPFLAGS_VALID_VERSION_TAG can be set on a type,
         it must first be set on all super types.

       This function clears the Py_TPFLAGS_VALID_VERSION_TAG of a
       type (so it must first clear it on all subclasses).  The
       tp_version_tag value is meaningless unless this flag is set.
       We don't assign new version tags eagerly, but only as
       needed.
     */
    PyObject *raw, *ref;
    Py_ssize_t i;

    if (!PyType_HasFeature(type, Py_TPFLAGS_VALID_VERSION_TAG))
        return;

    raw = type->tp_subclasses;
    if (raw != NULL) {
        assert(PyDict_CheckExact(raw));
        i = 0;
        while (PyDict_Next(raw, &i, NULL, &ref)) {
            assert(PyWeakref_CheckRef(ref));
            ref = PyWeakref_GET_OBJECT(ref);
            if (ref != Py_None) {
                PyType_Modified((PyTypeObject *)ref);
            }
        }
    }
    type->tp_flags &= ~Py_TPFLAGS_VALID_VERSION_TAG;
}
```

需要更新 C 槽的成员往往是名称形如 \_\_xxx__ 的成员，如 @@__repr__@@ 等。

```c
// Objects/typeobject.c#is_dunder_name
/* Check if the "readied" PyUnicode name
   is a double-underscore special name. */
static int
is_dunder_name(PyObject *name)
{
    Py_ssize_t length = PyUnicode_GET_LENGTH(name);
    int kind = PyUnicode_KIND(name);
    /* Special names contain at least "__x__" and are always ASCII. */
    if (length > 4 && kind == PyUnicode_1BYTE_KIND) {
        Py_UCS1 *characters = PyUnicode_1BYTE_DATA(name);
        return (
            ((characters[length-2] == '_') && (characters[length-1] == '_')) &&
            ((characters[0] == '_') && (characters[1] == '_'))
        );
    }
    return 0;
}
```

在具体的更新之前，需要先确定成员名称对应的 C 槽，即遍历接口槽声明表 *slotdefs* 查找：

* 在 *slotdefs* 中会出现同名的接口指向不同的槽，如 @@mp_subscript@@ 和 @@sq_item@@ 槽都同时指向 @@__getitem__@@ 接口。由于不知道具体覆盖的是哪个槽，则需要都找出来，找到的接口声明存储到 *ptrs* 数组。

* 另外，*slotdefs* 中还会出现不同名的接口指向相同的槽，如 @@__setitem__@@ 和 @@__delitem__@@ 接口同时表示 @@sq_ass_item@@ 槽实现。在定义 *slotdefs* 时相同会按相同的偏移地址进行分组，并且最一般的接口名称放在组的最前面。更新组内任一接口都需组内检查后才能确定槽的具体实现，即需要将 *ptrs* 数组中的各接口声明替换为其组内的第一个接口声明以支持组内遍历。

```c
// Objects/typeobject.c#MAX_EQUIV
/* Length of array of slotdef pointers used to store slots with the
   same __name__.  There should be at most MAX_EQUIV-1 slotdef entries with
   the same __name__, for any __name__. Since that's a static property, it is
   appropriate to declare fixed-size arrays for this. */
#define MAX_EQUIV 10

// Objects/typeobject.c#slotdefs
static slotdef slotdefs[] = {
    ...
    BINSLOT("__add__", nb_add, slot_nb_add, "+"),
    RBINSLOT("__radd__", nb_add, slot_nb_add, "+"),
    ...
    MPSLOT("__getitem__", mp_subscript, slot_mp_subscript,
           wrap_binaryfunc,
           "__getitem__($self, key, /)\n--\n\nReturn self[key]."),
    ...
    SQSLOT("__getitem__", sq_item, slot_sq_item, wrap_sq_item,
           "__getitem__($self, key, /)\n--\n\nReturn self[key]."),
    ...
}

// Objects/typeobject.c#update_slot
/* Update the slots after assignment to a class (type) attribute. */
static int
update_slot(PyTypeObject *type, PyObject *name)
{
    slotdef *ptrs[MAX_EQUIV];
    slotdef *p;
    slotdef **pp;
    int offset;

    assert(PyUnicode_CheckExact(name));
    assert(PyUnicode_CHECK_INTERNED(name));

    init_slotdefs();
    /* 寻找到所有名称相同的 slotdef
       如 "__getitem__" 同时映射到 mp_subscript 和 sq_item 两个 slot 上
       那么就把这两个 slotdef 都放到 ptrs 数组里，供后续处理 */
    pp = ptrs;
    for (p = slotdefs; p->name; p++) {
        if (p->name_strobj == name)
            *pp++ = p;
    }

    /* 对于每个 slotdef 寻找到第一个相同 offset 的 slotdef 替代
       如 "__radd__" 和 "__add__" 都指向 nb_add
       将 "__radd__" 的 slotdef 替换为 "__add__" 的 slotdef */
    *pp = NULL;
    for (pp = ptrs; *pp; pp++) {
        p = *pp;
        offset = p->offset;
        while (p > slotdefs && (p-1)->offset == offset)
            --p;
        *pp = p;
    }
    if (ptrs[0] == NULL)
        return 0; /* Not an attribute that affects any slots */
    return update_subclasses(type, name,
                             update_slots_callback, (void *)ptrs);
}
```

* 找到需更新的接口声明后，可对类型的槽进行更新。更新由 update_slots_callback() 回调进行，分别作用到当前类型及其子类型，因为子类型的槽可能继承自当前类型的实现，对那些继承的子类需要进行槽更新。

```c
// Objects/typeobject.c#update_subclasses
/* recurse_down_subclasses() and update_subclasses() are mutually
   recursive functions to call a callback for all subclasses,
   but refraining from recursing into subclasses that define 'name'. */
static int
update_subclasses(PyTypeObject *type, PyObject *name,
                  update_callback callback, void *data)
{
    if (callback(type, data) < 0)
        return -1;
    return recurse_down_subclasses(type, name, callback, data);
}

// Objects/typeobject.c#recurse_down_subclasses
static int
recurse_down_subclasses(PyTypeObject *type, PyObject *name,
                        update_callback callback, void *data)
{
    PyTypeObject *subclass;
    PyObject *ref, *subclasses, *dict;
    Py_ssize_t i;

    subclasses = type->tp_subclasses;
    if (subclasses == NULL)
        return 0;
    assert(PyDict_CheckExact(subclasses));
    i = 0;
    while (PyDict_Next(subclasses, &i, NULL, &ref)) {
        assert(PyWeakref_CheckRef(ref));
        subclass = (PyTypeObject *)PyWeakref_GET_OBJECT(ref);
        assert(subclass != NULL);
        if ((PyObject *)subclass == Py_None)
            continue;
        assert(PyType_Check(subclass));
        /* Avoid recursing down into unaffected classes */
        dict = subclass->tp_dict;
        if (dict != NULL && PyDict_Check(dict)) {
            if (PyDict_GetItemWithError(dict, name) != NULL) {
                continue;
            }
            if (PyErr_Occurred()) {
                return -1;
            }
        }
        if (update_subclasses(subclass, name, callback, data) < 0)
            return -1;
    }
    return 0;
}
```

* 对于需更新的类型，遍历需更新的接口声明数组，逐个接口组进行更新。确定槽的值等价确定 *generic*、*specific* 和 *use_generic* 决策变量的值，即确定槽的值是否填入通用值 *generic* 还是专用值 *specific*。通用值为槽声明 slotdef 的 *function* 值，其依赖运行时动态 MRO 查找实现功能，而专用值则为具体符合槽接口的函数，可直接调用。容易看出，专用值比通用值更快，但受到诸多的限制。

    * 若更新值是 @@PyWrapperDescr_Type@@ 类型（即封装槽的描述器类型）且同名，
        
        * 首先检查当前类型的同名槽是否具有实现，若没有实现或实现的槽与正在处理的槽声明一致，则允许使用槽声明的通用实现。

        * 然后检查组内接口的实现是否一致（如 @@__setitem__@@ 与 @@__delitem__@@ 未单独实现）、描述器对象的接口说明是否与槽声明一致和当前类型是否是描述器对象绑定类型的子类型，若三个条件都满足则允许使用该描述器对象的专用实现。这种情况一般发生在堆类型继承静态类型。
    
    * 若更新值为 tp_new_wrapper() 且更新的是 @@tp_new@@ 槽，则无需处理，因为该方法在执行时会动态查找 @@tp_new@@ 的槽进行调用。

    * 若如 @@__hash__@@ 或 @@__next__@@ 槽未实现，则设置相应的哨兵值到槽以确保一致性。

    * 若上述情况都无法找到专用实现，则默认采用通用实现。

* 另外，在 `class` 创建堆类型的时候，由 fixup_slot_dispatchers() 调用 update_one_slot() 将 @@tp_dict@@ 中覆盖的特殊方法实现同步到相应 C 槽。

```c
/* In the type, update the slots whose slotdefs are gathered in the pp array.
   This is a callback for update_subclasses(). */
static int
update_slots_callback(PyTypeObject *type, void *data)
{
    slotdef **pp = (slotdef **)data;

    for (; *pp; pp++)  // 遍历同名的 slotdef 进行更新
        update_one_slot(type, *pp);
    return 0;
}

/* Common code for update_slots_callback() and fixup_slot_dispatchers().  This
   does some incredibly complex thinking and then sticks something into the
   slot.  (It sees if the adjacent slotdefs for the same slot have conflicting
   interests, and then stores a generic wrapper or a specific function into
   the slot.)  Return a pointer to the next slotdef with a different offset,
   because that's convenient  for fixup_slot_dispatchers(). */
static slotdef *
update_one_slot(PyTypeObject *type, slotdef *p)
{
    PyObject *descr;
    PyWrapperDescrObject *d;
    void *generic = NULL, *specific = NULL;
    int use_generic = 0;
    int offset = p->offset;
    int error;
    void **ptr = slotptr(type, offset);

    if (ptr == NULL) {  // 没有槽位
        do {
            ++p;
        } while (p->offset == offset);
        return p;
    }
    /* We may end up clearing live exceptions below, so make sure it's ours. */
    assert(!PyErr_Occurred());
    // 只要同 offset 的 slotdef 存在一个，就更新 C slot
    do {
        /* Use faster uncached lookup as we won't get any cache hits during type setup. */
        /* 对于当前类型，修改一定发生在 tp_dict 中 */
        descr = find_name_in_mro(type, p->name_strobj, &error);
        if (descr == NULL) {
            if (error == -1) {
                /* It is unlikely by not impossible that there has been an exception
                   during lookup. Since this function originally expected no errors,
                   we ignore them here in order to keep up the interface. */
                PyErr_Clear();
            }
            if (ptr == (void**)&type->tp_iternext) {
                specific = (void *)_PyObject_NextNotImplemented;
            }
            continue;
        }
        if (Py_TYPE(descr) == &PyWrapperDescr_Type &&
            ((PyWrapperDescrObject *)descr)->d_base->name_strobj == p->name_strobj) {
            /* tptr 为 NULL：type 没有实现，或实现了多个，如 "__getitem__"
               tptr 不为 NULL：type 具有唯一的实现 */
            void **tptr = resolve_slotdups(type, p->name_strobj);
            if (tptr == NULL || tptr == ptr)
                generic = p->function;
            d = (PyWrapperDescrObject *)descr;
            if ((specific == NULL || specific == d->d_wrapped) &&
                d->d_base->wrapper == p->wrapper &&
                PyType_IsSubtype(type, PyDescr_TYPE(d)))
            {
                specific = d->d_wrapped;
            }
            else {
                /* We cannot use the specific slot function because either
                   - it is not unique: there are multiple methods for this
                     slot and they conflict
                   - the signature is wrong (as checked by the ->wrapper
                     comparison above)
                   - it's wrapping the wrong class
                 */
                use_generic = 1;
            }
        }
        else if (Py_TYPE(descr) == &PyCFunction_Type &&
                 PyCFunction_GET_FUNCTION(descr) ==
                 (PyCFunction)(void(*)(void))tp_new_wrapper &&
                 ptr == (void**)&type->tp_new)
        {
            /* The __new__ wrapper is not a wrapper descriptor,
               so must be special-cased differently.
               If we don't do this, creating an instance will
               always use slot_tp_new which will look up
               __new__ in the MRO which will call tp_new_wrapper
               which will look through the base classes looking
               for a static base and call its tp_new (usually
               PyType_GenericNew), after performing various
               sanity checks and constructing a new argument
               list.  Cut all that nonsense short -- this speeds
               up instance creation tremendously. */
            specific = (void *)type->tp_new;
            /* XXX I'm not 100% sure that there isn't a hole
               in this reasoning that requires additional
               sanity checks.  I'll buy the first person to
               point out a bug in this reasoning a beer. */
        }
        else if (descr == Py_None &&
                 ptr == (void**)&type->tp_hash) {
            /* We specifically allow __hash__ to be set to None
               to prevent inheritance of the default
               implementation from object.__hash__ */
            specific = (void *)PyObject_HashNotImplemented;
        }
        else {
            use_generic = 1;
            generic = p->function;
        }
    } while ((++p)->offset == offset);
    if (specific && !use_generic)
        *ptr = specific;
    else
        *ptr = generic;
    return p;
}
```
