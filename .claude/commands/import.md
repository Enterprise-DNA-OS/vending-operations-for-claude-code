---
description: Bring records in from CSV: products, machines, the planogram, visit history, or a Cantaloupe Seed export by column map.
---

Always run with `--dry-run` first and show the operator what would load. Load in this order:

1. `npm run vending -- import products <file.csv> --actor=NAME`
2. `npm run vending -- import machines <file.csv> --actor=NAME` (sites and routes that do not exist yet are created)
3. `npm run vending -- import planogram <file.csv> --actor=NAME`
4. `npm run vending -- import visits <file.csv> --actor=NAME` (one row per slot per visit; a visit already loaded is skipped)

A Cantaloupe Seed report: `npm run vending -- import seed <file.csv> --map=<map.json> --actor=NAME`. Start from `examples/seed-map.example.json`, set `_report`, and match the column headings in the operator's own export. Full guide: `docs/replace-cantaloupe-seed.md`.
