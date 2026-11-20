---
description: Change a price on one slot, on every slot holding a product, or on a product at one site, and keep the history.
---

One slot: `npm run vending -- price <machine>:<slot> <amount> --actor=NAME`. A product everywhere: `npm run vending -- price <product> <amount> --actor=NAME`. One site: add `--site=CODE`.

Show how many slots changed. Remind the operator that the price on the machine itself (or through the telemetry provider) must change too, or the cash check will show a gap. History: `npm run vending -- prices`.
