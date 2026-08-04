"""Calculating order prices module."""

TAX_RATE = 0.06

def subtotal(prices):
    return sum(prices)

def calculate_total(prices, discount=0):
    amount = subtotal(prices)
    return amount * (1 - discount) * (1 + TAX_RATE)
