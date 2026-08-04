"""JSON exporter for order data."""

import json

EXPORTER_NAME = "json"


def export(orders):
    total = sum(float(order["amount"]) for order in orders)
    return json.dumps({
            "order_count": len(orders),
            "total": round(total, 2),
            "orders": orders,
        },
        ensure_ascii=False,
        indent=2,
    )