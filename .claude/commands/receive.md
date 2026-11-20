---
description: Record a delivery into the warehouse, with its date mark, so the earliest dated stock goes out first.
---

Run `npm run vending -- receive <product> <qty> [--date-mark=YYYY-MM-DD] [--ref=PO] --actor=NAME` for each line on the delivery docket.

Fills take stock earliest date first. Read back the new on-hand and days of cover from `npm run vending -- stock`.
