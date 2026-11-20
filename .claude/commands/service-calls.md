---
description: Open and close machine service calls: jams, note readers, card readers, refrigeration, host complaints.
---

List open calls: `npm run vending -- calls --json`.
Open one: `npm run vending -- call <machine> <issue> [--reported-by=NAME] --actor=NAME`.
Close one: `npm run vending -- close-call <call> <resolution> --actor=NAME`.

Calls open longer than the `service_call_days` setting appear in `/attention`. Say so when one machine has had the same fault three times in a month.
