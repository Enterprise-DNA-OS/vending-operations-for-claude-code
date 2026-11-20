---
description: Show or change what sits in each slot of a machine: product, capacity, par and price, with the current estimate and sales rate.
---

Show: `npm run vending -- planogram <machine> --json`, slot by slot with the sales rate a day, then the last six visits and open service calls.

Change a slot: `npm run vending -- set-slot <machine> <slot> <product> [--capacity=N] [--par=N] [--price=3.50] --actor=NAME`. A new product in a slot starts its sales count again at the next visit. Check the site's healthy food policy before putting a product in (see `/compliance`).
