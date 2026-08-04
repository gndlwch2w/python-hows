"""Order formatter module."""

from collections.abc import Iterable

from .calculator import calculate_average, calculate_total  # 相对导入


def build_report(orders: Iterable) -> str:
    order_list = list(orders)
    
    lines = ["Order Report", "=" * 30]
    if not order_list:
        lines.append("No orders available")
        lines.append("=" * 30)
        lines.append("Total Orders: 0")
        lines.append("Total Amount: 0.00")
        lines.append("Average Amount: 0.00")
        return "\n".join(lines)
    
    for order in order_list:
        lines.append(
            f"Order ID: {order.order_id:<10} "
            f"Amount: {order.amount:>8.2f}"
        )

    total = calculate_total(order_list)
    average = calculate_average(order_list)
    lines.extend([
        "=" * 30,
        f"Total Orders: {len(order_list)}",
        f"Total Amount: {total:.2f}",
        f"Average Amount: {average:.2f}",
    ])
    return "\n".join(lines)