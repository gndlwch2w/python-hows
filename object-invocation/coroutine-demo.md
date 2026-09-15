### asyncio 用例

#### 等待事件发生

asyncio.run() 会自动为 main() 创建一个 Task 并加入到就绪队列中，之后 asyncio 调度器会从就绪队列中取出 Task 来执行。当执行到 `await retry(...)` 时，则类似函数调用般跳转到 retry() 继续执行。假若 retry() 内没有 `await` 语句，那么函数体可正常执行返回或抛出异常退出。若存在 `await` 语句则跳转到目标执行，重复类似的逻辑。当 `await` 无需等任何事件的时候，行为表现与普通函数调用无异。当需要等如 asyncio.sleep() 事件时，asyncio 的调度器会向事件注册 Task 的唤醒回调，待事件发生时，继续 Task 的执行。注意到，下例中实际实际上只有一个 Task。

```python
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

class Backoff:
    def __init__(self, attempt: int, base: float = 0.05, cap: float = 0.5):
        self.delay = min(cap, base * (2 ** attempt))

    def __await__(self):
        return asyncio.sleep(self.delay).__await__()

class TemporaryError(Exception):
    pass

async def retry(operation: Callable[[], Awaitable[T]], attempts: int = 4) -> T:
    last_error = None
    for attempt in range(attempts):
        try:
            return await operation()
        except TemporaryError as exc:
            last_error = exc
            if attempt == attempts - 1:
                break
            print("temporary failure; backoff={:.2f}s".format(
                min(0.5, 0.05 * (2 ** attempt))
            ))
            await Backoff(attempt)
    raise RuntimeError("operation failed") from last_error

class InventoryService:
    def __init__(self):
        self.calls = 0

    async def reserve(self) -> str:
        self.calls += 1
        await asyncio.sleep(0.02)
        if self.calls < 3:
            raise TemporaryError("inventory service busy")
        return "reservation-1001"

async def main() -> None:
    service = InventoryService()
    reservation_id = await retry(service.reserve)
    print("reserved:", reservation_id)

if __name__ == "__main__":
    asyncio.run(main())
```

#### 支付网关超时和重试

当 `await` 一个协程对象时，其又需 `await` 另一个事件，asyncio.wait_for() 允许超时取消协程的执行，即超时抛出 asyncio.TimeoutError 异常。其本质是通过 `await asyncio.sleep(timeout)` 事件，当该事件发生时，检查协程仍未执行结束，则抛出超时异常。如若是协程提前结束，则取消该睡眠事件。

```python
import asyncio
import random
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

class TransientGatewayError(Exception):
    pass

async def retry_with_timeout(
    operation: Callable[[], Awaitable[T]],
    attempts: int,
    timeout: float,
    base_delay: float = 0.05,
) -> T:
    last_error = None

    for attempt in range(attempts):
        try:
            return await asyncio.wait_for(operation(), timeout=timeout)
        except (asyncio.TimeoutError, TransientGatewayError) as exc:
            last_error = exc
            if attempt == attempts - 1:
                break
            delay = base_delay * (2 ** attempt) + random.uniform(0, 0.02)
            print(f"attempt {attempt + 1} failed: {type(exc).__name__}; retry in {delay:.2f}s")
            await asyncio.sleep(delay)

    raise RuntimeError("all attempts failed") from last_error

class PaymentGateway:
    def __init__(self):
        self.calls = 0

    async def charge(self, order_id: str, idempotency_key: str) -> str:
        self.calls += 1
        if self.calls == 1:
            await asyncio.sleep(0.02)
            raise TransientGatewayError("gateway overloaded")
        if self.calls == 2:
            await asyncio.sleep(0.30)  # 会被 wait_for 取消

        await asyncio.sleep(0.03)
        return "paid:{}:{}".format(order_id, idempotency_key)

async def main() -> None:
    gateway = PaymentGateway()
    result = await retry_with_timeout(
        lambda: gateway.charge("order-42", "order-42-charge-v1"),
        attempts=4,
        timeout=0.10,
    )
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
```

#### 受限在途请求的批量查询

Semaphore 持有有限个资源数，在 acquire() 会将资源数减 1，当资源数为 0 时会将 Task 阻塞。在 release() 时会将资源数加 1，同时唤醒一个获取资源的 Task。`with` 语句的进入和退出本质上是 `await` Semaphore 对象的相应方法协程对象。

```python
import asyncio
from typing import Dict

async def remote_risk_call(account_id: int) -> Dict[str, int]:
    delay = 0.03 + (account_id % 5) * 0.02
    await asyncio.sleep(delay)

    if account_id % 7 == 0:
        raise RuntimeError("risk service rejected account {}".format(account_id))

    return {
        "account_id": account_id,
        "score": (account_id * 17) % 100,
    }

async def query_risk(account_id: int, limiter: asyncio.Semaphore) -> Dict[str, int]:
    async with limiter:
        return await asyncio.wait_for(
            remote_risk_call(account_id), timeout=0.15,
        )

async def main() -> None:
    limiter = asyncio.Semaphore(4)
    tasks = [
        asyncio.create_task(
            query_risk(account_id, limiter), name=f"risk-{account_id}",
        ) for account_id in range(1, 21)
    ]

    success = 0
    failed = 0
    for completed in asyncio.as_completed(tasks):
        try:
            result = await completed
        except (asyncio.TimeoutError, RuntimeError) as exc:
            failed += 1
            print("failed:", exc)
        else:
            success += 1
            print("result:", result)

    print("summary: success={}, failed={}".format(success, failed))

if __name__ == "__main__":
    asyncio.run(main())
```

#### 日志生产消费流水线

不同生产者分别从不同日志文件读取，然后将待处理日志行统一入大小受限队列，然后多个消费者从队列中取出待处理日志行进行处理。生产者退出后，继续向队列入消费者数量个哨兵对象使得消费者退出，然后调用队列的 join() 方法等待消费者都返回。队列满时，进行 put() 的 Task 会被阻塞。get() 消费队列后，会唤醒一个生产者 Task，队列为空时，阻塞试图消费的 Task。生产者 put() 对象到队列时会记录待消费的对象数，当待消费数不为空，调用 join() 的 Task 会被阻塞，直到 task_done() 调用将待消费对象消费完毕时唤醒所有被 join() 阻塞的 Task。

```python
import asyncio
import json
import tempfile
from collections import Counter
from pathlib import Path
from typing import Counter as CounterType, List, Optional, Tuple

def read_lines(path: Path) -> List[str]:
    with path.open("r", encoding="utf-8") as file:
        return file.readlines()

async def produce(path: Path, queue: asyncio.Queue) -> None:
    loop = asyncio.get_running_loop()
    lines = await loop.run_in_executor(None, read_lines, path)
    for line_no, line in enumerate(lines, 1):
        await queue.put((path.name, line_no, line))

async def consume(
    worker_id: int,
    queue: asyncio.Queue,
) -> CounterType[str]:
    local: CounterType[str] = Counter()
    while True:
        item: Optional[Tuple[str, int, str]] = await queue.get()
        try:
            if item is None:
                return local

            filename, line_no, raw = item
            try:
                event = json.loads(raw)
                local[event.get("level", "UNKNOWN")] += 1
            except json.JSONDecodeError:
                local["INVALID"] += 1
                print(f"worker {worker_id} invalid {filename}:{line_no}")
        finally:
            queue.task_done()

def create_input(directory: Path) -> List[Path]:
    paths = []
    for file_index in range(3):
        path = directory / "app-{}.jsonl".format(file_index)
        with path.open("w", encoding="utf-8") as file:
            for index in range(15):
                event = {
                    "level": ["INFO", "WARNING", "ERROR"][index % 3],
                    "message": "event-{}-{}".format(file_index, index),
                }
                file.write(json.dumps(event) + "\n")
            file.write("{broken json\n")
        paths.append(path)
    return paths

async def main() -> None:
    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    worker_count = 3

    with tempfile.TemporaryDirectory() as temp_dir:
        paths = create_input(Path(temp_dir))
        workers = [
            asyncio.create_task(
                consume(index, queue), name="worker-{}".format(index)
            ) for index in range(worker_count)
        ]

        await asyncio.gather(*(produce(path, queue) for path in paths))
        # 通知 consumer 退出
        for _ in range(worker_count):
            await queue.put(None)

        # 等待 consumer 完成退出
        await queue.join()
        counters = await asyncio.gather(*workers)

    total: CounterType[str] = Counter()
    for counter in counters:
        total.update(counter)
    print("summary:", dict(total))

if __name__ == "__main__":
    asyncio.run(main())
```

#### 配置热加载与版本通知

```python
import asyncio
from typing import Dict

class ConfigStore:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._changed = asyncio.Condition(self._lock)
        self.ready = asyncio.Event()
        self._version = 0
        self._data: Dict[str, int] = {}

    async def update(self, data: Dict[str, int]) -> None:
        async with self._changed:
            self._version += 1
            self._data = dict(data)
            self.ready.set()
            self._changed.notify_all()
            print("config updated to version", self._version)

    async def snapshot(self) -> Dict[str, int]:
        async with self._lock:
            return dict(self._data)

    async def wait_for_version(self, target: int) -> Dict[str, int]:
        await self.ready.wait()
        async with self._changed:
            await self._changed.wait_for(lambda: self._version >= target)
            return dict(self._data)

async def loader(store: ConfigStore) -> None:
    for config in (
        {"timeout_ms": 100},
        {"timeout_ms": 150, "retries": 2},
        {"timeout_ms": 200, "retries": 3},
    ):
        await asyncio.sleep(0.05)
        await store.update(config)

async def service(name: str, store: ConfigStore, target_version: int) -> None:
    config = await store.wait_for_version(target_version)
    print("{} started with {}".format(name, config))

async def main() -> None:
    store = ConfigStore()
    await asyncio.gather(
        loader(store),
        service("api", store, 1),
        service("worker", store, 2),
        service("scheduler", store, 3),
    )
    print("final snapshot:", await store.snapshot())

if __name__ == "__main__":
    asyncio.run(main())
```

#### 并发 TCP KV 服务

```python
import asyncio
from typing import Dict, List, Tuple

class KVServer:
    def __init__(self):
        self._data: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def execute(self, line: str) -> str:
        parts = line.strip().split(" ", 2)
        command = parts[0].upper() if parts else ""

        if command == "SET" and len(parts) == 3:
            async with self._lock:
                self._data[parts[1]] = parts[2]
            return "OK"

        if command == "GET" and len(parts) == 2:
            async with self._lock:
                return self._data.get(parts[1], "NOT_FOUND")

        if command == "DEL" and len(parts) == 2:
            async with self._lock:
                existed = self._data.pop(parts[1], None) is not None
            return "1" if existed else "0"

        if command == "QUIT":
            return "BYE"

        return "ERROR usage: SET key value | GET key | DEL key | QUIT"

    async def handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        peer = writer.get_extra_info("peername")
        writer.write(b"READY\n")
        await writer.drain()

        try:
            while True:
                raw = await reader.readline()
                if not raw:
                    break

                command = raw.decode("utf-8").rstrip("\r\n")
                response = await self.execute(command)
                writer.write((response + "\n").encode("utf-8"))
                await writer.drain()

                if command.upper() == "QUIT":
                    break
        except (ConnectionResetError, asyncio.IncompleteReadError):
            pass
        finally:
            print("client closed:", peer)
            writer.close()
            await writer.wait_closed()

async def client(
    host: str,
    port: int,
    commands: List[str],
    start_delay: float = 0.0,
) -> List[Tuple[str, str]]:
    await asyncio.sleep(start_delay)
    reader, writer = await asyncio.open_connection(host, port)
    await reader.readline()  # READY

    responses = []
    try:
        for command in commands:
            writer.write((command + "\n").encode("utf-8"))
            await writer.drain()
            response = (await reader.readline()).decode("utf-8").strip()
            responses.append((command, response))
    finally:
        writer.close()
        await writer.wait_closed()
    return responses

async def main() -> None:
    application = KVServer()
    server = await asyncio.start_server(
        application.handle_client, "127.0.0.1", 0,
    )
    host, port = server.sockets[0].getsockname()[:2]
    print("listening on {}:{}".format(host, port))

    async with server:
        results = await asyncio.gather(
            client(host, port, ["SET user:1 Alice", "GET user:1", "QUIT"]),
            client(host, port, ["GET user:1", "DEL user:1", "QUIT"], 0.08),
        )

    for result in results:
        print(result)

if __name__ == "__main__":
    asyncio.run(main())
```

#### 流式读取大型 JSONL 文件

```python
import asyncio
import json
import tempfile
from functools import partial
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, TextIO

class AsyncJSONLReader:
    def __init__(self, path: Path, batch_size: int = 20):
        self.path = path
        self.batch_size = batch_size
        self._file: Optional[TextIO] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def __aenter__(self) -> "AsyncJSONLReader":
        self._loop = asyncio.get_running_loop()
        opener = partial(self.path.open, "r", encoding="utf-8")
        self._file = await self._loop.run_in_executor(None, opener)
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:
        if self._file is not None and self._loop is not None:
            await self._loop.run_in_executor(None, self._file.close)

    def _read_batch(self) -> List[str]:
        assert self._file is not None
        lines = []
        for _ in range(self.batch_size):
            line = self._file.readline()
            if not line:
                break
            lines.append(line)
        return lines

    async def records(self) -> AsyncIterator[Dict[str, Any]]:
        assert self._loop is not None

        while True:
            lines = await self._loop.run_in_executor(None, self._read_batch)
            if not lines:
                return

            for line in lines:
                yield json.loads(line)

            # 大批次处理时显式让出执行权。
            await asyncio.sleep(0)

def create_input(path: Path) -> None:
    with path.open("w", encoding="utf-8") as file:
        for index in range(100):
            file.write(json.dumps({
                "id": index,
                "status": "active" if index % 3 else "disabled",
            }) + "\n")

async def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "users.jsonl"
        create_input(path)

        active_ids = []
        async with AsyncJSONLReader(path, batch_size=16) as reader:
            async for record in reader.records():
                if record["status"] == "active":
                    active_ids.append(record["id"])

        print("active count:", len(active_ids))
        print("first five:", active_ids[:5])

if __name__ == "__main__":
    asyncio.run(main())
```

#### 隔离阻塞 I/O 和 CPU 计算

```python
import asyncio
import json
import tempfile
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List

def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8") as file:
        return file.read()

def summarize_json(raw: str) -> Dict[str, int]:
    records = json.loads(raw)
    total = 0
    checksum = 0

    for record in records:
        value = record["value"]
        total += value
        # 纯 Python 计算，用于代表规则引擎、解析或特征计算。
        for factor in range(1, 80):
            checksum = (checksum + value * factor) % 1000000007

    return {
        "records": len(records),
        "total": total,
        "checksum": checksum,
    }

def create_inputs(directory: Path) -> List[Path]:
    paths = []
    for file_index in range(4):
        path = directory / "batch-{}.json".format(file_index)
        records = [
            {"id": index, "value": (index + file_index) % 97}
            for index in range(5000)
        ]
        path.write_text(json.dumps(records), encoding="utf-8")
        paths.append(path)
    return paths

async def audit_file(
    path: Path,
    thread_pool: ThreadPoolExecutor,
    process_pool: ProcessPoolExecutor,
) -> Dict[str, int]:
    loop = asyncio.get_running_loop()
    # 阻塞文件读取放线程池
    raw = await loop.run_in_executor(thread_pool, read_text, path)
    # CPU 密集计算放进程池，避免占住事件循环线程。
    result = await loop.run_in_executor(process_pool, summarize_json, raw)
    result["file_index"] = int(path.stem.split("-")[-1])
    return result

async def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        paths = create_inputs(Path(temp_dir))

        with ThreadPoolExecutor(max_workers=4) as thread_pool:
            with ProcessPoolExecutor(max_workers=2) as process_pool:
                results = await asyncio.gather(*(
                    audit_file(path, thread_pool, process_pool)
                    for path in paths
                ))

    for result in sorted(results, key=lambda item: item["file_index"]):
        print(result)

if __name__ == "__main__":
    asyncio.run(main())
```

#### 旧 SDK 线程回调接入 asyncio

```python

```