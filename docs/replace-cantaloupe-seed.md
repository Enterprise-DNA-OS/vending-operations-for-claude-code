# Moving off Cantaloupe Seed

Switching takes a day of setup and one route week of running both side by side. You bring across what you need to keep operating: products, machines and sites, the planogram, and as much visit history as you want the sales rates to learn from.

## 1. Export from Seed

Seed's reports can be exported from the web portal. Pull four files as CSV (save Excel exports as CSV):

1. **Products**: code, name, category, cost and price.
2. **Machines and locations**: asset number, location, route, machine type, model and serial.
3. **Planogram or product map**: machine, coil, product, capacity, par and price.
4. **Visit or service history** for the last six to eight weeks: machine, date, coil, inventory found, units added, spoils, cash collected and card sales.

Report names and column headings depend on your Seed set-up and the options you pick, and we have not tested against a real Seed export. Look at the headings in your own files before you map them.

## 2. Map the columns

The importer already knows common headings ("Asset Number", "Location Name", "Coil", "Inventory", "Units Added", "Spoiled", "Cash Collected"). Where yours differ, copy `examples/seed-map.example.json`, set `_report` to `products`, `machines`, `planogram` or `visits`, and name the column that holds each field.

## 3. Load, test first

```bash
npm run migrate
npm run vending -- import seed products.csv --map=products-map.json --dry-run
npm run vending -- import seed products.csv --map=products-map.json --actor="Your Name"
# then machines, planogram, visits, in that order
```

Every import runs `--dry-run` first and shows what would load. Sites and routes that do not exist yet are created from the machine file; set each site's commission rate, GST and healthy food policy afterwards with `/add` or by asking Claude Code. A visit already loaded is skipped, so a file can be loaded again safely.

## 4. Check it

- `npm run vending -- machines` and `npm run vending -- planogram <machine>` for two or three machines against Seed.
- `npm run vending -- performance` against Seed's sales report for the same four weeks.
- `npm run vending -- cash` should show only the gaps you already knew about.

## 5. Run a week side by side

Record each visit here (`/log-visit`) as well as in Seed for one route week. Compare the pick list, the sales and the cash. Then switch.

## What does not carry over

- **Live telemetry and card reader data.** Seed reads DEX and sales from the device on the machine. This free version works from route counts and the card sales total you enter at each visit. Reading your telemetry or card provider's sales export each night is part of what Enterprise DNA builds into your version.
- **Remote price changes.** Changing a price here records it and shows the cash check against it; the price on the machine is still changed on the machine or through your telemetry provider.
- **The driver's handheld app.** Drivers record visits by message, a shared sheet or a photo of the visit sheet that Claude Code reads. A phone screen for drivers is a customisation.
- **Seed's own report history** beyond the visits you import. Keep the export files.
