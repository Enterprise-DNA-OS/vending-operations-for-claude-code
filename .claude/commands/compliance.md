---
description: Check the machines against the rules in docs/compliance.md: food past its use-by, healthy food policies at hospital sites (Everyday share, no sugar-sweetened drinks) and kilojoule labels a host asks for, with the rule cited.
---

1. Read `docs/compliance.md`. Each rule has a name, its source, what a breach looks like in the data and the check that finds it.
2. Run `npm run vending -- compliance --json`.
3. Report as a table: rule, record, finding, source. Use-by breaches first: that stock must come out today.
4. For each breach, draft the fix the operator can approve: the slot change (`/planogram`), the stock to pull on the next visit, or the label to add. Make no change without a yes.
5. If a rule in `docs/compliance.md` looks out of date, say so and stop. Do not guess at the rules. The operator confirms the rule, then you update the doc and the check together.

Nothing here is legal advice. The doc records the rules the operator has told the system to enforce, with sources.
