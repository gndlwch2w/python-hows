from reportkit.formatter import build_report
from reportkit.models import Order


def main():
    orders = [
        Order("A001", 29.90),
        Order("A002", 18.50),
        Order("A003", 42.00),
    ]

    report = build_report(orders)
    print(report)


if __name__ == "__main__":
    main()