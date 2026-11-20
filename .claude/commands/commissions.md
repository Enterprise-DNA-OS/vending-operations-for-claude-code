---
description: Host commission by site and month: collected, GST, the commission on the agreed basis, what is paid and what is owed.
---

Run `npm run vending -- commissions --json`.

Show what is owed first. Commission is worked out on sales excluding GST or on gross sales, per the site agreement. To record a payment made from the bank: `npm run vending -- pay-commission <site> <YYYY-MM> <reference> --actor=NAME` (a record only; nothing is paid from here). Offer `/draft-commission` for the statement.
