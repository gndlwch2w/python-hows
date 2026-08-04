import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

TEXT_PROVIDER = PROJECT_ROOT / "provider_text"
JSON_PROVIDER = PROJECT_ROOT / "provider_json"

sys.path[:0] = [
    str(TEXT_PROVIDER),
    str(JSON_PROVIDER),
]

from reportkit_plugins import json_exporter, text_exporter


def main():
    orders = [
        {
            "order_id": "A001",
            "amount": 29.90,
        },
        {
            "order_id": "A002",
            "amount": 18.50,
        },
        {
            "order_id": "A003",
            "amount": 42.00,
        },
    ]

    print("文本导出结果")
    print("-" * 50)
    print(text_exporter.export(orders))

    print("JSON 导出结果")
    print("-" * 50)
    print(json_exporter.export(orders))


if __name__ == "__main__":
    main()