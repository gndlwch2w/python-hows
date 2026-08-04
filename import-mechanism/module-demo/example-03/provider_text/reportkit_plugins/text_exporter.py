"""Text exporter for order data."""

EXPORTER_NAME = "text"


def export(orders):
    lines = ["Order Report", "=" * 30]

    total = 0.0
    for order in orders:
        order_id = order["order_id"]
        amount = float(order["amount"])
        total += amount
        lines.append(f"Order ID: {order_id:<8} Amount: {amount:>8.2f}")

    lines.extend([
        "=" * 30,
        f"Total Orders: {len(orders)}",
        f"Total Amount: {total:.2f}",
    ])
    return "\n".join(lines)