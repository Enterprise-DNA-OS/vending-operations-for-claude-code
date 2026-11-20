---
description: Slots found empty on arrival in the last 28 days: sales lost between visits, and whether par, capacity or the visit interval should change.
---

Run `npm run vending -- stockouts --json`, then `npm run vending -- planogram <machine> --json` for the worst machines.

For each slot empty two or more times, suggest one fix: a higher par (if capacity allows), a second slot for the product, or a shorter visit interval. Make the change only when the operator says so, with `/planogram`.
