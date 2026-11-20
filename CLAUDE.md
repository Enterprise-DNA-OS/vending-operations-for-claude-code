# Vending Operations for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Add a route, a site, a product, a machine or a setting | `/add` |
| What needs a person this week | `/attention` |
| Is the cash right, cash against the counts | `/cash-up` |
| Host commission paid and owed | `/commissions` |
| Check the machines against the rules in docs/compliance.md | `/compliance` |
| Make this system yours in plain language | `/customise` |
| Draft a host's monthly commission statement | `/draft-commission` |
| Save the weekly review as a draft file | `/draft-weekly-review` |
| Which machines are due a visit | `/due` |
| What is near or past its date in the machines | `/expiry` |
| Export every record to one JSON file | `/export` |
| Bring records in from CSV or a Cantaloupe Seed export | `/import` |
| Ten questions a route app does not answer | `/insights` |
| Add a note to a machine or a site | `/log` |
| Record a route visit: counts, removed, filled, cash and card | `/log-visit` |
| Move a machine, send it for repair or take it out | `/move` |
| Add a read-only HTML view from a plain-language description | `/new-view` |
| Which machines earn and which do not | `/performance` |
| What to load on the van for a route | `/pick-list` |
| Show or change a machine's slots | `/planogram` |
| Change a price on a slot or a product | `/price` |
| Record a warehouse delivery | `/receive` |
| Open, list and close service calls | `/service-calls` |
| Prepare for a review with one host | `/site-review` |
| Warehouse stock and reorders | `/stock` |
| Slots that sell out between visits | `/stockouts` |
| What was pulled and what it cost | `/waste` |
| The Monday review | `/weekly-review` |

If an ask fits nothing here, run the CLI directly (`npm run vending -- --help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- Never pay a host or say a commission is paid. `pay-commission` records a payment made in the bank or accounts system.
- A commission statement or any letter to a host goes only from the operator's own email. Draft it with `/draft-commission`.
- Every write command takes `--actor=NAME`: use the operator's name.
- Record visits in date order, one per machine per day. Sales come from the counts: never type a sales figure in.
- Food past its use-by is pulled on the next visit and recorded as removed. Never suggest leaving it in.
- Money is in integer cents in the database; show it in dollars with the currency.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the compliance rules with sources and the guide for moving off Cantaloupe Seed.
- `views.json` and `documents.json` the dashboards (`npm run view`) and the paperwork (`npm run docs`).

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/cantaloupe-seed
