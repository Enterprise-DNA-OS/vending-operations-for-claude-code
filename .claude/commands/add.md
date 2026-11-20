---
description: Add a route, a site, a product, a machine or a setting.
---

Write the record as JSON to a temp file, then run `npm run vending -- add route|site|product|machine|setting <file.json> --actor=NAME`.

Site fields: code, name, address, region, country, currency, gst_bps (1000 AU, 1500 NZ), contact_name, contact_email, commission_bps, commission_basis (net_sales or gross_sales), healthy_policy (none, nsw_health, qld_health, nz_health, school), everyday_min_pct, kj_display, agreement_ends.
Product fields: code, name, category, cost_cents, default_price_cents, case_size, date_mark (use_by, best_before, none), kj_per_serve, healthy_rating (everyday, occasional, not_permitted), sugar_sweetened.
Machine fields: code, site, route, kind (snack, drink, combo, coffee, fresh_food, micro_market), location_note, make_model, serial, visit_interval_days.
Setting: key, value, note. Then set the machine's slots with `/planogram`.
