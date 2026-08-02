## 类的创建

在 CPython 中，类本身也是对象，由 @@PyTypeObject@@ 结构体表示。既是对象则有类型，类的类型称之为元类，一般情况下类的元类是 @@PyType_Type@@（即 type）。同时 @@PyType_Type@@ 是 @@PyTypeObject@@ 的一种特例，因此某种程度上也可以定义元类的类。类的创建方式通常具有两种：

* 对于 C 用户来说，可以直接为 @@PyTypeObject@@ 结构体的字段设置值来创建类型，这种创建方式称为 @@static-allocation@@。另外也可以通过如 @@CAPI_PyType_FromSpec@@ 接口动态创建类型，同理称为 @@dynamic-allocation@@。两种方式得到的类型分别称为 @@static-types@@ 和 @@heap-types@@。 

* 对于 Python 用户来说，通常采用如 `class` 关键字或 @@type@@ 接口创建类型，由于其是运行时创建的，故创建的类型属于 @@heap-types@@。

[[class-creation-static.md]]

[[class-creation-heap.md]]
