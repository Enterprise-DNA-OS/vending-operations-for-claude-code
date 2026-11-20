---
description: Record a route visit: what was counted in each slot, what was removed, what was filled, the cash in the box and the card sales. Works out what sold and checks the cash against it.
---

Collect, from the driver's notes or a photo of the visit sheet: machine, date, each slot as counted/filled (and removed if anything was pulled), the use-by date of fresh stock if it was loaded, cash counted and card sales since the last visit.

Run `npm run vending -- visit <machine> --slots=A1:3/7,A2:0/8/1,A3:2/4@2026-11-25 --cash=120.50 --cashless=88.20 [--date=YYYY-MM-DD] --actor=NAME`.

Read back the result: expected sales, collected, the difference and every warning. A warning about cash, a count that went up or stock past its date needs a person. A missed visit: `npm run vending -- visit <machine> --missed --note="Site closed" --actor=NAME`.
