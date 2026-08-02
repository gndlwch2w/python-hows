### yield 前夕

基于回调函数方案，生产者每找到一个 token，就调用一次由消费者提供的回调函数，

* 生产者的实现较自然，找到一个 token，就调用一次回调。

* 消费者却不能主动取得下一个 token，而只能被生产者反复调用。因此，消费者必须将原本可以保存在局部变量中的状态，提升为全局变量、对象属性，或者显式设计的状态机。消费者找到结果后，通常也无法直接使用 break 停止生产过程，而需要让回调返回特殊值、设置共享标志，或者抛出特定异常，并要求生产者配合处理。

```python
source = """
x = 1
def f(a, b):
    return a + b
def g(): pass
"""

# Producer
def tokenize_with_callback(source, tokeneater):
    i = 0
    while i < len(source):
        ch = source[i]
        if ch.isspace():
            i += 1
            continue
        if ch.isalpha() or ch == "_":
            start = i
            i += 1
            while i < len(source):
                if not (source[i].isalnum() or source[i] == "_"):
                    break
                i += 1
            tokeneater("NAME", source[start:i])
            continue
        tokeneater("SYMBOL", ch)
        i += 1

# Consumer
waiting_for_function_name = False
function_name = None

def tokeneater(kind, value):
    global waiting_for_function_name
    global function_name

    if kind != "NAME":
        return
    if waiting_for_function_name:  # 额外处理
        function_name = value
        waiting_for_function_name = False
        return
    if value == "def":
        waiting_for_function_name = True

tokenize_with_callback(source, tokeneater)
print(function_name)  # f
```

另一种方案是先生成全部 token，将其存入列表，再交给消费者处理。如此消费者就可以自然地使用循环和局部变量，

* 消费者恢复了正常的局部控制流，即状态保存在局部变量中，可以使用 for、break、continue 和 嵌套的 if 等。

* 对于大型输入，其空间复杂度与 token 总数成正比。相比之下，流式处理通常只需要保存当前 token 和少量解析状态。此外，消费者执行 break 时已经太晚，因为生产者早已完成了整个文件的解析，无法节省前面的解析时间。

```python
# Producer
def tokenize_as_list(source):
    result = []
    tokenize_with_callback(source, result.append)
    return result

# Consumer
tokens = tokenize_as_list(source)
waiting_for_function_name = False
for kind, value in tokens:
    if kind != "NAME":
        continue
    if waiting_for_function_name:
        print(value)
        break
    waiting_for_function_name = value == "def"
```

基于手工迭代器实现。此时消费者体验很好，同时具备惰性求值和提前退出能力，但必须由生产者手工保存所有暂停状态，

* 如下的 TokenIterator 只需手动保存 *position* 状态，实际词法分析器需要保存更多的状态，如 *line_number*、*column* 等。

* 此外，仅仅保存变量还不够，生产者还必须记住如上一次 \_\_next__() 返回时，程序执行到了哪一个分支、哪一个循环、哪一层调用中等信息。当生产逻辑包含复杂分支、嵌套循环或递归调用时，手工维护这些状态会迅速变得繁琐。

```python
# Producer
class TokenIterator:
    def __init__(self, source):
        self.source = source
        self.position = 0

    def __iter__(self):
        return self

    def __next__(self):
        source = self.source
        while self.position < len(source):
            ch = source[self.position]
            if ch.isspace():
                self.position += 1
                continue
            if ch.isalpha() or ch == "_":
                start = self.position
                self.position += 1
                while self.position < len(source):
                    ch = source[self.position]
                    if not (ch.isalnum() or ch == "_"):
                        break
                    self.position += 1
                return "NAME", source[start:self.position]
            self.position += 1
            return "SYMBOL", ch
        raise StopIteration

# Consumer
waiting_for_function_name = False
for kind, value in TokenIterator(source):
    if kind != "NAME":
        continue
    if waiting_for_function_name:
        print(value)
        break
    waiting_for_function_name = value == "def"
```

基于多线程实现，即生产者运行在一个线程中，而消费者运行在另一个线程中，两者通过队列传递 token。

* 线程天然提供了两套独立的执行状态，生产者可以暂停在 queue.put()，消费者可以暂停在 queue.get()，双方都可以按顺序代码编写。

* 但线程远比生成器重量级，需要线程创建、调度、同步队列、取消信号、异常传播和资源清理等额外机制。其次，部分平台可能不支持多线程，这种方式不具有通用性。

```python
from queue import Queue
from threading import Event, Thread

END = object()

def threaded_tokens(source):
    queue = Queue(maxsize=1)
    cancelled = Event()

    # Producer
    def emit(token):
        if cancelled.is_set():
            raise RuntimeError("consumer stopped")
        queue.put(token)

    def producer():
        try:
            tokenize_with_callback(source, emit)
        finally:
            queue.put(END)

    thread = Thread(target=producer)
    thread.start()

    # Consumer
    waiting_for_function_name = False
    try:
        while True:
            token = queue.get()
            if token is END:
                return
            kind, value = token
            if waiting_for_function_name:
                print(value)
                cancelled.set()
            waiting_for_function_name = value == "def"
    finally:
        cancelled.set()
```

然而，使用生成器，生产者仍然是一个普通函数，只是把产生一个值并暂停写成 yield，生产者和消费者都可以使用自然的局部控制流，而无需手工保存任何状态，同时具有高效的性能。

```python
def tokenize(source):
    i = 0
    while i < len(source):
        ch = source[i]
        if ch.isspace():
            i += 1
            continue
        if ch.isalpha() or ch == "_":
            start = i
            i += 1
            while i < len(source):
                if not (source[i].isalnum() or source[i] == "_"):
                    break
                i += 1
            yield "NAME", source[start:i]
            continue
        yield "SYMBOL", ch
        i += 1

def find_first_function_name(source):
    waiting_for_function_name = False
    for kind, value in tokenize(source):
        if kind != "NAME":
            continue
        if waiting_for_function_name:
            return value
        waiting_for_function_name = value == "def"
    return None

print(find_first_function_name(source))
```
