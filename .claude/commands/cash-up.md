---
description: Cash and card collected against what the slot counts say sold, visit by visit, with every gap over the tolerance.
---

Run `npm run vending -- cash --json`.

Show each visit: machine, date, driver, expected, cash, card, difference. Group by driver and by machine and say whether a gap repeats (same machine: a coin mech, note reader or a price set differently on the machine; same driver: a conversation with the driver). Never accuse anyone; state the numbers. The tolerance is the `cash_tolerance_cents` setting.
