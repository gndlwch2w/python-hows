"""Order calculator module."""

from collections.abc import Iterable

__all__ = ["calculate_average", "calculate_total"]


def calculate_total(orders: Iterable) -> float:
    return sum(order.amount for order in orders)


def calculate_average(orders: Iterable) -> float:
    order_list = list(orders)
    if not order_list:
        return 0.0
    return calculate_total(order_list) / len(order_list)
