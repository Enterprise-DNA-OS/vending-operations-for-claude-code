<h1 align="center">Vending Operations for Claude Code</h1>

<p align="center">
  <strong>The open-source vending operations system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Cantaloupe Seed data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=cantaloupe-seed">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/cantaloupe-seed?utm_source=github&utm_medium=readme&utm_campaign=cantaloupe-seed">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-cantaloupe-seed">Instead of Cantaloupe Seed</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Vending Operations for Claude Code does the job you pay Cantaloupe Seed for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Cantaloupe Seed dashboard cannot.

Cantaloupe does not publish a price for Seed. Its [pricing page](https://www.cantaloupe.com/pricing/) says monthly service fees apply, and the Seed Pro page pitches it at operators with more than 200 machines (both checked 20 November 2026). Vending management systems that do publish prices charge per machine, every month: PayRange lists VendSights at $12.99 per machine a month as a stand-alone plan and VMFS lists its cloud plans from $7.99 per machine a month (USD, checked 20 November 2026). Telemetry and card reader fees come on top.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=cantaloupe-seed).

It is for a vending or micro market operator running snack, drink, combo, coffee and fresh food machines on routes. It holds your sites (the hosts) and their commission terms, machines, the planogram slot by slot, warehouse stock by date mark and every route visit: what was counted, pulled and filled, and the cash and card collected. From the counts it works out what sold, checks the cash against it, builds the van pick list for the next route, tells you what is selling out, what is near its date and which machines are not worth the visit, works out each host's commission and checks hospital sites against their healthy food rules.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/vending-operations-for-claude-code.git
cd vending-operations-for-claude-code
npm install
npm run demo
```

`npm run demo` builds a throwaway database under `.data/`, loads a fictional Sydney operator with 12 machines, a micro market and five weeks of route visits, and writes three dashboards and the documents. Then open the folder in Claude Code and type `/attention`, then `/pick-list`.

For a working copy of the demo: `npm run migrate && npm run seed`, then `npm run vending -- weekly-review`. Start a real database with `npm run migrate` only; never seed it.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/add` | Add a route, a site, a product, a machine or a setting. |
| `/attention` | What needs a person this week: visits overdue, service calls left open, cash short of the counts, slots selling out, stock past or near its date, host commission unpaid and placement agreements ending. |
| `/cash-up` | Cash and card collected against what the slot counts say sold, visit by visit, with every gap over the tolerance. |
| `/commissions` | Host commission by site and month: collected, GST, the commission on the agreed basis, what is paid and what is owed. |
| `/compliance` | Check the machines against the rules in docs/compliance.md: food past its use-by, healthy food policies at hospital sites (Everyday share, no sugar-sweetened drinks) and kilojoule labels a host asks for, with the rule cited. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/draft-commission` | Draft the monthly commission statement to a host: machines, visits, collected, GST and the commission on the agreed basis. |
| `/draft-weekly-review` | Save the weekly review as a draft file for the operator to read or forward. |
| `/due` | Machines due a visit today or tomorrow, and how far overdue each one is. |
| `/expiry` | Stock in machines near or past its date mark, slot by slot, with the use-by items first. |
| `/export` | Export every record to one JSON file the operator owns. |
| `/import` | Bring records in from CSV: products, machines, the planogram, visit history, or a Cantaloupe Seed export by column map. |
| `/insights` | Ten questions about the vending business that a route app does not answer, run against your records. |
| `/log-visit` | Record a route visit: what was counted in each slot, what was removed, what was filled, the cash in the box and the card sales. Works out what sold and checks the cash against it. |
| `/log` | Add a note to a machine or a site: a host request, a promise, a fault seen on route. |
| `/move` | Move a machine to another site or route, send it for repair or take it out of service. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/performance` | Machine earnings over the last 28 days: units, weekly sales, waste and margin after GST, commission and product cost, lowest first. |
| `/pick-list` | Pre-kit the van: what to load for one route, product by product, for the machines due by a date, worked out from each slot's sales since the last visit. |
| `/planogram` | Show or change what sits in each slot of a machine: product, capacity, par and price, with the current estimate and sales rate. |
| `/price` | Change a price on one slot, on every slot holding a product, or on a product at one site, and keep the history. |
| `/receive` | Record a delivery into the warehouse, with its date mark, so the earliest dated stock goes out first. |
| `/service-calls` | Open and close machine service calls: jams, note readers, card readers, refrigeration, host complaints. |
| `/site-review` | Prepare for a review with one host: the site's machines, sales, commission paid and owed, service calls, healthy food policy and agreement date, in one brief. |
| `/stock` | Warehouse stock by product: on hand, the earliest date mark, what the fleet sells a day and the days of cover. |
| `/stockouts` | Slots found empty on arrival in the last 28 days: sales lost between visits, and whether par, capacity or the visit interval should change. |
| `/waste` | What was pulled from machines in the last 28 days, by machine and product, and what it cost. |
| `/weekly-review` | The Monday review: what needs attention, machines due this week, cash gaps, machine earnings and compliance. |

Everything runs through one CLI, `npm run vending -- --help`. Every command takes `--json`. Names match partly and case-insensitively; an ambiguous name lists the candidates and exits 1. No command sends email, pays a host or deletes a record.

`npm run view` writes three read-only pages (this week, money, stock) and `npm run docs` writes a commission statement for each host and month and a pick sheet for each route due, in the business name, logo and colours from `brand.json`.

## Ten questions to ask today

`npm run vending -- insights` answers these from your records:

1. Which machines earn the least per week, and where are they?
2. Which slots keep selling out before the driver gets there?
3. Which products sell best per slot across the fleet?
4. Where is the cash short of what the counts say sold?
5. Which products do we throw out most, and what does it cost?
6. What does each site earn us after commission, product cost and waste?
7. Which machines are overdue a visit?
8. How many days of stock does the warehouse hold for each product?
9. Which slots carry far more than sells between visits?
10. Which hosts are owed commission, and how much?

## Your first hour: ten things to ask for

1. "What needs doing this week?" (`/attention`)
2. "What do I load for the West route tomorrow?" (`/pick-list`)
3. "Mel did VM-108: A1 four left, filled six, B2 two left, filled four, $25 cash, $37.50 card." (`/log-visit`)
4. "Is any cash short?" (`/cash-up`)
5. "What has to come out of the fresh food machine?" (`/expiry`)
6. "Which machines are not worth the visit?" (`/performance`)
7. "Put chips up to $3.20 everywhere." (`/price`)
8. "Draft Harbour Business Park's commission statement for last month." (`/draft-commission`)
9. "Does the hospital pass its healthy food rules?" (`/compliance`)
10. "Add a fridge temperature to every fresh food visit." (`/customise`)

## Instead of Cantaloupe Seed

Load your products, machines and planogram from the reports you can export, then your visit history, and keep going on routes the same week. A Cantaloupe Seed report comes in with a column map you write once. Step by step, including what does not carry over: [docs/replace-cantaloupe-seed.md](docs/replace-cantaloupe-seed.md). Rules checked by `/compliance`, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
vending-operations-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Vending Operations for Claude Code for your business, migrates your Cantaloupe Seed data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=cantaloupe-seed)
- Read more: [enterprisedna.co/omni/instead-of/cantaloupe-seed](https://enterprisedna.co/omni/instead-of/cantaloupe-seed?utm_source=github&utm_medium=readme&utm_campaign=cantaloupe-seed)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
