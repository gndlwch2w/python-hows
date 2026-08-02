## 异常机制

现代编程语言的异常机制在传统处理错误方式的基础上，进一步拓展出异常的自动传播（即不需要每次调用都需手动判断返回值是否正常）和统一的异常处理机制（即不采用逐 if 判断的方式检查异常，而是设计专门的语法统一捕获和处理异常）。结合如下例子来进一步说明这些特性：

```c
#include <stdio.h>

typedef enum {
    ORDER_OK,
    ORDER_ARGUMENT_ERROR,
    ORDER_FILE_ERROR,
    ORDER_FORMAT_ERROR,
    ORDER_RANGE_ERROR,
    ORDER_UNDERSTOCK
} OrderError;

typedef struct {
    OrderError code;
    const char *func;
    const char *message;
} OrderStatus;

static OrderStatus order_ok(void) {
    return (OrderStatus){ORDER_OK, NULL, NULL};
}

static OrderStatus order_error(OrderError code,
                               const char *func,
                               const char *message) {
    return (OrderStatus){code, func, message};
}

static int order_failed(OrderStatus status) {
    return status.code != ORDER_OK;
}

#define ORDER_ERROR(code, message) \
    order_error((code), __func__, (message))

static int generate_order_id(void) {
    static int next_id = 1000;
    return next_id++;
}

/* 异常流占据返回值 */
static OrderStatus load_quantity(const char *filename, int *quantity) {
    FILE *file;
    int value;
    char extra;

    /* 异常处理与业务处理高度耦合 */
    if (filename == NULL || quantity == NULL)
        return ORDER_ERROR(ORDER_ARGUMENT_ERROR,
                           "Invalid argument");

    file = fopen(filename, "r");
    if (file == NULL)
        return ORDER_ERROR(ORDER_FILE_ERROR,
                           "Cannot read quantity file");

    if (fscanf(file, " %d %c", &value, &extra) != 1) {
        fclose(file);
        return ORDER_ERROR(ORDER_FORMAT_ERROR,
                           "Quantity must be an integer");
    }

    fclose(file);
    if (value <= 0)
        return ORDER_ERROR(ORDER_RANGE_ERROR,
                           "Quantity must be greater than 0");

    *quantity = value;
    return order_ok();
}

static OrderStatus save_quantity(const char *filename, int quantity) {
    FILE *file;

    file = fopen(filename, "w");
    if (file == NULL)
        return ORDER_ERROR(ORDER_FILE_ERROR,
                           "Cannot write quantity file");

    if (fprintf(file, "%d\n", quantity) < 0) {
        fclose(file);
        return ORDER_ERROR(ORDER_FILE_ERROR,
                           "Cannot save quantity");
    }

    if (fclose(file) != 0)
        return ORDER_ERROR(ORDER_FILE_ERROR,
                           "Cannot close quantity file");

    return order_ok();
}

static OrderStatus create_order(const char *filename,
                                int requires,
                                int *order_id) {
    int quantity;
    OrderStatus status;

    if (requires <= 0 || order_id == NULL)
        return ORDER_ERROR(ORDER_ARGUMENT_ERROR,
                           "Required quantity must be greater than 0");

    status = load_quantity(filename, &quantity);
    /* 手动异常传播 */
    if (order_failed(status))
        return status;

    if (requires > quantity)
        return ORDER_ERROR(ORDER_UNDERSTOCK,
                           "Insufficient stock");

    status = save_quantity(filename, quantity - requires);
    if (order_failed(status))
        return status;

    *order_id = generate_order_id();
    return order_ok();
}

int main(void) {
    int requires = 200;
    int order_id;
    OrderStatus status;

    status = create_order("quantity.txt", requires, &order_id);
    if (order_failed(status)) {
        fprintf(stderr, "%s: %s\n",
                status.func != NULL ? status.func : "order",
                status.message != NULL
                    ? status.message
                    : "Unknown error");
        return 1;
    }

    printf("Order complete: id=%d\n", order_id);
    return 0;
}
```

容易观察到，

* 传统的错误处理方式需要大量的 if 判断，同时这些代码片段散落在业务逻辑代码中，形成了异常处理和业务处理高度耦合。而在现代异常处理中，如 Python，将业务逻辑写在 try 中，异常处理统一写在 except 中。

* 另外，传统的错误依赖函数的返回值或参数来感知，并且调用者必须负责检查它们，如出现错误，手动向上传播。而在 Python 中，最底层业务代码在无法继续时可直接抛出异常，其调用者可处理或不处理它们，那么异常则继续沿着调用栈向上传播，直到被处理或程序失败退出。现代的异常传播不占用返回值或参数位，而是具有独立的传播通道。

* 相似的地方在于，都把错误抽象为单独的异常对象或结构体，以便于统一的处理。同时，总体对待错误的思路是相似的，即业务函数负责检查和抛出不合法输入可能导致的错误，其调用者可处理或继续向上传播错误，错误交由合适的调用层级进行处理。

```python
import re
import sys
from itertools import count

class OrderError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.func = sys._getframe(1).f_code.co_name
        self.message = message

class OrderArgumentError(OrderError): pass
class OrderFileError(OrderError): pass
class OrderFormatError(OrderError): pass
class OrderRangeError(OrderError): pass
class OrderUnderstockError(OrderError): pass

def generate_order_id() -> int: 
    if not hasattr(globals(), "_order_ids"): 
        globals()["_order_ids"] = count(1000) 
    return next(_order_ids)

def load_quantity(filename: str) -> int:
    if filename is None:
        # 独立的异常传播流，不占用返回值或参数
        raise OrderArgumentError("Invalid argument")

    try:
        file = open(filename, "r")
        content = file.read()
    # 统一异常处理，无需 if 判断
    except OSError as exc:  
        raise OrderFileError("Cannot read quantity file") from exc
    finally:
        try:
            file.close()
        except OSError as exc:
            raise OrderFileError("Cannot close quantity file") from exc

    match = re.fullmatch(r"\s*([+-]?\d+)\s*", content)
    if match is None:
        raise OrderFormatError("Quantity must be an integer")

    quantity = int(match.group(1))
    if quantity <= 0:
        raise OrderRangeError("Quantity must be greater than 0")
    return quantity

def save_quantity(filename: str, quantity: int) -> None:
    try:
        file = open(filename, "w")
        content = "{}\n".format(quantity)
        written = file.write(content)
        if written != len(content):
            raise OSError("Cannot save quantity")
    # 统一异常处理，无需 if 判断
    except OSError as exc:
        raise OrderFileError("Cannot write quantity file") from exc
    finally:
        try:
            file.close()
        except OSError as exc:
            raise OrderFileError("Cannot close quantity file") from exc

def create_order(filename: str, requires: int) -> int:
    if requires <= 0:
        raise OrderArgumentError("Required quantity must be greater than 0")

    quantity = load_quantity(filename)
    if requires > quantity:
        raise OrderUnderstockError("Insufficient stock")
    save_quantity(filename, quantity - requires)
    return generate_order_id()


def main() -> int:
    requires = 200

    try:
        order_id = create_order("quantity.txt", requires)
    except OrderError as exc:
        print("{}: {}".format(exc.func, exc.message),file=sys.stderr)
        return 1
    except Exception:
        print("order: Unknown error", file=sys.stderr)
        return 1

    print("Order complete: id={}".format(order_id))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

[[exception-object.md]]

[[exception-raise.md]]

[[exception-catch.md]]
