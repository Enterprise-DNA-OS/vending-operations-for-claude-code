---
description: Pre-kit the van: what to load for one route, product by product, for the machines due by a date, worked out from each slot's sales since the last visit.
---

Ask which route if the operator did not say. Run `npm run vending -- pick-list <route> [--by=YYYY-MM-DD] --json`.

Show the load first (product, units, machines, on hand, short), then machine by machine. Call out anything short in the warehouse. Units are an estimate from the sales rate; the driver counts on arrival and fills to par.

To print it: `npm run docs -- pick-sheet` writes a pick sheet per route in the business brand.
