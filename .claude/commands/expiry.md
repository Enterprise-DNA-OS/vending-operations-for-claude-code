---
description: Stock in machines near or past its date mark, slot by slot, with the use-by items first.
---

Run `npm run vending -- expiry --json`.

Anything past its use-by goes first, in plain words: it must come out on the next visit (record it as removed). Then items due today and tomorrow. Group by route so the driver can pull them. The warning window is the `date_warning_days` setting.
