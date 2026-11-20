#!/usr/bin/env node
// Vending Operations for Claude Code: the one CLI. Human tables by default, --json for machines.
//   npm run vending -- --help
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import {
  TABLES, reads, insights, planogram, pickList, recordVisit, setSlot, changePrice, receive, openCall, closeCall, payCommission,
  moveMachine, add, transaction, resolve, required, importProducts, importMachines, importPlanogram, importVisits,
} from './lib/vending.mjs';

const money = (v, row) => {
  if (v === null || v === undefined) return '';
  const n = Number(v) / 100;
  return `${row.currency ? row.currency + ' ' : ''}${n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const cell = (v, k, row) => {
  if (k.endsWith('_cents')) return money(v, row);
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};
function grid(rows) {
  if (!rows.length) return '  (none)';
  const keys = Object.keys(rows[0]).filter((k) => k !== 'currency' || !Object.keys(rows[0]).some((x) => x.endsWith('_cents')));
  const labels = keys.map((k) => k.replace(/_cents$/, ''));
  const body = rows.map((r) => keys.map((k) => cell(r[k], k, r)));
  const widths = keys.map((_, i) => Math.min(70, Math.max(labels[i].length, ...body.map((b) => b[i].length))));
  const fit = (s, i) => (s.length > widths[i] ? s.slice(0, widths[i] - 3) + '...' : s.padEnd(widths[i]));
  const line = (arr) => '  ' + arr.map(fit).join('  ').trimEnd();
  return [line(labels), '  ' + widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
export function format(result) {
  if (Array.isArray(result)) {
    if (result[0]?.question) return result.map((x, i) => `${i + 1}. ${x.question}\n${grid(x.rows)}`).join('\n\n');
    return grid(result);
  }
  if (result && typeof result === 'object') {
    const entries = Object.entries(result);
    const scalars = entries.filter(([, v]) => !v || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => typeof x !== 'object'))).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') || '(none)' : v ?? ''}`);
    const blocks = entries.filter(([, v]) => v && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => typeof x !== 'object'))).map(([k, v]) => `${k}\n${format(Array.isArray(v) ? v : [v])}`);
    return [scalars.join('\n'), ...blocks].filter(Boolean).join('\n\n');
  }
  return String(result);
}

export function parseArgs(args) {
  const opts = {};
  const pos = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=');
      opts[a.slice(2, i < 0 ? undefined : i)] = i < 0 ? true : a.slice(i + 1);
    } else pos.push(a);
  }
  return { opts, pos };
}
const ALLOWED = ['json', 'actor', 'dry-run', 'map', 'date', 'driver', 'cash', 'cashless', 'slots', 'note', 'missed', 'par', 'capacity', 'price', 'site', 'route', 'status', 'by', 'date-mark', 'ref', 'on', 'reported-by', 'month', 'help'];

function writePrivate(dir, name, text) {
  const out = path.join(process.env.OUTPUT_DIR || REPO_ROOT, dir);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const file = path.join(out, name);
  fs.writeFileSync(file, text, { mode: 0o600 });
  return file;
}
const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

export async function run(db, args) {
  const { opts, pos } = parseArgs(args);
  for (const k of Object.keys(opts)) if (!ALLOWED.includes(k)) throw new Error(`Unknown option --${k}`);
  const [cmd, a, b, ...rest] = pos;
  const actor = opts.actor;
  const words = (...xs) => xs.filter(Boolean).join(' ');

  if (cmd in reads) return db.query(reads[cmd]);
  if (cmd === 'insights') return insights(db);
  if (cmd === 'planogram' || cmd === 'machine') return planogram(db, a);
  if (cmd === 'pick-list') return pickList(db, a, { by: opts.by });
  if (cmd === 'history') return db.query('select created_at, kind, source_file, rows_read, rows_loaded, actor from import_batches order by created_at desc');
  if (cmd === 'prices') return db.query(`select pc.changed_on, m.code as machine, s.slot, p.name as product, pc.old_cents, pc.new_cents, pc.actor
    from price_changes pc join slots s on s.id = pc.slot_id join machines m on m.id = s.machine_id left join products p on p.id = s.product_id order by pc.changed_on desc, m.code, s.slot limit 60`);
  if (cmd === 'weekly-review') {
    return {
      attention: await db.query(reads.attention),
      due_this_week: await db.query('select machine, site, route, next_due, days_overdue from machine_due where next_due <= current_date + 7 order by next_due'),
      cash: await db.query(reads.cash),
      performance: await db.query(reads.performance),
      compliance: await db.query(reads.compliance),
    };
  }
  if (cmd === 'visit') {
    return transaction(db, actor, () => recordVisit(db, a, { date: opts.date, driver: opts.driver, cash: opts.cash, cashless: opts.cashless, slots: opts.slots, note: opts.note || '', missed: Boolean(opts.missed) }));
  }
  if (cmd === 'set-slot') return transaction(db, actor, () => setSlot(db, a, b, rest[0], { par: opts.par, capacity: opts.capacity, price: opts.price, actor }));
  if (cmd === 'price') return transaction(db, actor, () => changePrice(db, required(a, 'machine:slot or product'), required(b, 'new price'), { site: opts.site, actor }));
  if (cmd === 'receive') return transaction(db, actor, () => receive(db, a, b, { dateMark: opts['date-mark'], ref: opts.ref || '', on: opts.on }));
  if (cmd === 'call') return transaction(db, actor, () => openCall(db, a, words(b, ...rest), { reportedBy: opts['reported-by'] || '' }));
  if (cmd === 'close-call') return transaction(db, actor, () => closeCall(db, a, words(b, ...rest)));
  if (cmd === 'pay-commission') return transaction(db, actor, () => payCommission(db, a, b, words(...rest), { on: opts.on, actor }));
  if (cmd === 'move') return transaction(db, actor, () => moveMachine(db, a, b, { route: opts.route, status: opts.status }));
  if (cmd === 'log') {
    return transaction(db, actor, async () => {
      const body = required(words(b, ...rest), 'note');
      try {
        const m = await resolve(db, 'machines', a);
        return db.query('insert into notes (machine_id, actor, body) values ($1,$2,$3) returning body', [m.id, actor, body]);
      } catch (e) {
        if (e.candidates?.length) throw e;
        const s = await resolve(db, 'sites', a);
        return db.query('insert into notes (site_id, actor, body) values ($1,$2,$3) returning body', [s.id, actor, body]);
      }
    });
  }
  if (cmd === 'add') {
    const data = JSON.parse(fs.readFileSync(required(b, 'JSON file'), 'utf8'));
    return transaction(db, actor, () => add(db, a, data));
  }
  if (cmd === 'import') {
    const common = { map: opts.map, dryRun: Boolean(opts['dry-run']), actor };
    const doIt = (fn) => (common.dryRun ? fn() : transaction(db, actor, fn));
    if (a === 'products') return doIt(() => importProducts(db, b, common));
    if (a === 'machines') return doIt(() => importMachines(db, b, common));
    if (a === 'planogram') return doIt(() => importPlanogram(db, b, common));
    if (a === 'visits') return doIt(() => importVisits(db, b, common));
    if (a === 'seed') {
      const report = opts.map ? JSON.parse(fs.readFileSync(opts.map, 'utf8'))._report : null;
      if (!opts.map || !report) throw new Error('import seed needs --map=FILE naming the report (_report: products|machines|planogram|visits) and your Seed columns (see docs/replace-cantaloupe-seed.md)');
      const fn = { products: importProducts, machines: importMachines, planogram: importPlanogram, visits: importVisits }[report];
      if (!fn) throw new Error('_report must be products, machines, planogram or visits');
      return doIt(() => fn(db, b, common));
    }
    throw new Error('Use: import products|machines|planogram|visits|seed <csv>');
  }
  if (cmd === 'export') {
    const data = { format: 'vending-operations-v1', exported_at: new Date().toISOString(), tables: {} };
    await db.exec('BEGIN READ ONLY');
    try { for (const t of TABLES) data.tables[t] = await db.query(`select * from ${t} order by ${t === 'settings' ? 'key' : 'created_at, id'}`); } finally { await db.exec('ROLLBACK'); }
    const file = writePrivate('exports', `vending-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`, JSON.stringify(data, null, 2) + '\n');
    return { file, counts: Object.fromEntries(TABLES.map((t) => [t, data.tables[t].length])) };
  }
  if (cmd === 'draft-commission') {
    const s = await resolve(db, 'sites', a);
    const month = b || opts.month || lastMonth();
    const [c] = await db.query('select * from site_commission where site_id = $1 and month = $2', [s.id, month]);
    if (!c) throw new Error(`No sales recorded at ${s.code} in ${month}`);
    const [site] = await db.query('select contact_name, contact_email from sites where id = $1', [s.id]);
    const machines = await db.query(`select m.code as machine, m.location_note as location, count(v.id)::int as visits, sum(v.cash_cents + v.cashless_cents)::bigint as collected_cents, $3::text as currency
      from visits v join machines m on m.id = v.machine_id where v.site_id = $1 and to_char(v.visit_date, 'YYYY-MM') = $2 and v.status = 'done' group by m.code, m.location_note order by m.code`, [s.id, month, c.currency]);
    const rows = machines.map((r) => `| ${r.machine} | ${r.location} | ${r.visits} | ${money(r.collected_cents, r)} |`).join('\n');
    const text = `# DRAFT: not sent\n\nTo: ${site.contact_name}${site.contact_email ? ` <${site.contact_email}>` : ''}\nSubject: Vending commission statement, ${c.name}, ${month}\n\nHello ${site.contact_name || ''},\n\nHere is the commission statement for the machines at ${c.name} for ${month}.\n\n| Machine | Location | Visits | Collected |\n|---|---|---|---|\n${rows}\n\nCollected: ${money(c.collected_cents, c)}\nGST included: ${money(c.gst_cents, c)}\nCommission at ${(c.commission_bps / 100).toFixed(2)}% of ${c.commission_basis === 'gross_sales' ? 'gross sales' : 'sales excluding GST'}: ${money(c.commission_cents, c)}\n${Number(c.paid_cents) > 0 ? `Paid ${c.paid_on}: ${money(c.paid_cents, c)}` : 'This amount will be paid to your nominated account.'}\n\nSales are counted from the cash and card collected on each visit in the month.\n\nRegards,\n[Your name]\n`;
    return { file: writePrivate('drafts', `commission-${s.code}-${month}.md`, text), commission: money(c.commission_cents, c) };
  }
  if (cmd === 'draft-weekly-review') {
    const data = await run(db, ['weekly-review']);
    return { file: writePrivate('drafts', `weekly-review-${new Date().toISOString().slice(0, 10)}.md`, `# Vending: weekly review (draft for the operator)\n\n\`\`\`\n${format(data)}\n\`\`\`\n`) };
  }
  throw new Error(`Unknown command "${cmd || ''}". Run --help`);
}

export const help = `Vending Operations for Claude Code
Read:    ${Object.keys(reads).join(', ')}
         insights, weekly-review, history, prices, planogram <machine>, pick-list [route] [--by=YYYY-MM-DD]
Route:   visit <machine> --slots=A1:3/7,A2:0/8/1,A3:2/4@2026-11-25 --cash=120.50 --cashless=88.20 [--date=] [--driver=] [--note=] --actor=NAME
           each slot is counted/filled[/removed][@date mark]; sales are worked out from the counts
         visit <machine> --missed --note="Site closed" --actor=NAME
Stock:   receive <product> <qty> [--date-mark=YYYY-MM-DD] [--ref=PO] [--on=YYYY-MM-DD] --actor=NAME
Machine: set-slot <machine> <slot> <product> [--capacity=N] [--par=N] [--price=3.50] --actor=NAME
         price <machine:slot|product> <amount> [--site=CODE] --actor=NAME
         move <machine> [site] [--route=CODE] [--status=active|repair|removed] --actor=NAME
         call <machine> <issue> [--reported-by=NAME] --actor=NAME
         close-call <call> <resolution> --actor=NAME
Money:   pay-commission <site> <YYYY-MM> <reference> [--on=YYYY-MM-DD] --actor=NAME   a record; nothing is paid from here
Add:     add route|site|product|machine|setting <json-file> --actor=NAME
         log <machine|site> <note> --actor=NAME
Import:  import products|machines|planogram|visits <csv> [--map=FILE] [--dry-run] --actor=NAME
         import seed <csv> --map=FILE [--dry-run] --actor=NAME     a Cantaloupe Seed export, columns named in the map
Out:     export, draft-commission <site> [YYYY-MM], draft-weekly-review
Names match partly and case-insensitively; an ambiguous name lists the candidates and exits 1.
All commands take --json. No command sends email, pays a host or deletes a record.`;

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) console.log(help);
  else {
    let db;
    try {
      db = await getDb();
      const result = await run(db, args);
      console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : format(result));
    } catch (e) {
      console.error(args.includes('--json') ? JSON.stringify({ error: e.message, candidates: e.candidates || [] }) : e.message + (e.candidates?.length ? '\n' + format(e.candidates) : ''));
      process.exitCode = 1;
    } finally {
      await db?.close();
    }
  }
}
