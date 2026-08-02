### 生成器用例

#### 流式扫描大型日志

日志文件可能很大，调用者不应先把所有行或所有错误记录装入列表。只需逐行扫描日志，只返回错误记录。

```python
from collections.abc import Iterator
from pathlib import Path, Tuple

def iter_error_logs(path: Path) -> Iterator[Tuple[int, str]]:
    with path.open("r", encoding="utf-8", errors="replace") as file:
        for line_number, line in enumerate(file, start=1):
            if "ERROR" in line:
                yield line_number, line.rstrip("\n")
```

#### 递归遍历目录树

目录结构是递归的，`yield from` 可以把子目录生成器产生的结果直接转发给最外层调用者，同时保留自然的递归结构。

```python
import os
from collections.abc import Generator
from pathlib import Path

def walk_files(root: Path) -> Generator[Path, None, int]:
    total_size = 0
    with os.scandir(root) as entries:
        for entry in entries:
            if entry.is_dir(follow_symlinks=False):
                subtree_size = yield from walk_files(Path(entry.path))
                total_size += subtree_size
            elif entry.is_file(follow_symlinks=False):
                size = entry.stat(follow_symlinks=False).st_size
                total_size += size
                yield Path(entry.path)
    return total_size
```

#### 汇聚流式任务的最终结果

数据导入程序逐条产生处理结果，并在整个数据源处理完成后返回统计信息。具体由 `yield` 产生过程中的结果，最后由 `return` 返回整个生成任务的最终结果。

```python
from collections.abc import Generator, Iterable, Dict

def import_records(
    records: Iterable[Dict],
) -> Generator[Dict, None, Dict[str, int]]:
    imported = 0
    rejected = 0

    for record in records:
        if not record.get("id"):
            rejected += 1
            continue

        save_record(record)
        imported += 1
        yield record

    return {
        "imported": imported,
        "rejected": rejected,
    }
```

#### 基于下游反馈动态调整批次

批量写入数据库或上传远程服务时，根据实际响应延迟调整下一批的数据量。send() 支持消费者到生产者的反向通信，允许消费者动态调整生产者的行为。

```python
from collections.abc import Generator, Iterable
from itertools import islice
from typing import TypeVar, Union, List

T = TypeVar("T")

def adaptive_batches(
    records: Iterable[T],
    initial_size: int = 1_000,
) -> Generator[List[T], Union[int, None], int]:
    msg = "must be greater than 0"
    if initial_size <= 0:
        raise ValueError("initial_size " + msg)

    iterator = iter(records)
    batch_size = initial_size
    total = 0
    while True:
        batch = list(islice(iterator, batch_size))
        if not batch:
            return total

        total += len(batch)
        requested_size = yield batch
        if requested_size is not None:
            if requested_size <= 0:
                raise ValueError("batch size " + msg)
            batch_size = requested_size
```

#### 把外部执行失败送回调度器

生成器负责控制任务的重试策略，而真正的网络请求、文件上传或远程调用由外部执行器完成。任务的异常发生在生成器外部，但生成器需要知道异常，才能决定是否重试。throw(error) 会在生成器当前暂停的 yield 位置引发异常，因此生成器可以用普通的 try/except 实现重试逻辑。

```python
from collections.abc import Generator
from typing import TypeVar, Tuple

T = TypeVar("T")

class RetryableError(Exception):
    pass

def retry_job(
    job: T,
    max_attempts: int = 3,
) -> Generator[Tuple[T, int], object, object]:
    if max_attempts <= 0:
        raise ValueError("max_attempts must be greater than 0")

    for attempt in range(1, max_attempts + 1):
        try:
            result = yield job, attempt
        except RetryableError:
            if attempt == max_attempts:
                raise
        else:
            return result
```

#### 停止无限数据流并释放资源

持续跟踪正在写入的日志文件，例如实现类似 `tail -f` 的日志监控。这种生成器理论上不会自然结束，当监控任务被取消时，必须关闭文件。close() 会在生成器当前暂停的位置引发 GeneratorExit，使其退出，并执行 finally 中的资源清理代码。

```python
import os
import time
from collections.abc import Generator
from pathlib import Path

def follow_log(
    path: Path,
    poll_interval: float = 0.2,
) -> Generator[str, None, None]:
    file = path.open("r", encoding="utf-8", errors="replace")
    try:
        file.seek(0, os.SEEK_END)
        while True:
            line = file.readline()
            if line:
                yield line.rstrip("\n")
            else:
                time.sleep(poll_interval)
    finally:
        file.close()
```
