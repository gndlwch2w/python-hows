"""Order data model."""

from dataclasses import dataclass


@dataclass
class Order:
    order_id: str
    amount: float

    def __post_init__(self):
        if not self.order_id:
            raise ValueError("order id cannot be empty")
        if self.amount < 0:
            raise ValueError("order amount cannot be negative")
