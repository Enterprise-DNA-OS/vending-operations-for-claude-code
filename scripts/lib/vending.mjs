// Vending operations: sites, machines, the planogram, route visits, cash, stock and commission.
// Every function takes the db handle from lib/db.mjs. Nothing here sends, pays or deletes.
import fs from 'node:fs';
import { parseCsv, pick, yesNo } from './csv.mjs';

export const TABLES = ['settings', 'routes', 'sites', 'machines', 'products', 'slots', 'price_changes', 'stock_lots', 'import_batches', 'visits', 'visit_lines', 'service_calls', 'commission_payments', 'notes'];

export function required(v, what) {
  if (v === undefined || v === null || v === true || String(v).trim() === '') throw new Error(`Missing ${what}`);
  return String(v).trim();
}
export function isoDate(v, what = 'date') {
  const s = required(v, what);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) throw new Error(`${what} must be YYYY-MM-DD, got "${s}"`);
  return s;
}
// "1,234.50", "$1234.5", "12" -> integer cents
export function cents(v, what = 'amount') {
  const s = required(v, what).replace(/[$,\s]/g, '').replace(/^(NZD|AUD)/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`${what} is not a money amount: "${v}"`);
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
export function whole(v, what) {
  const s = required(v, what);
  if (!/^\d+$/.test(s)) throw new Error(`${what} must be a whole number, got "${s}"`);
  return Number(s);
}
const today = () => new Date().toISOString().slice(0, 10);

// Find one row by code or name. Ambiguous: throw with the candidates (the CLI exits 1).
const FINDERS = {
  machines: { sql: 'select m.id, m.code, s.name as site, m.kind, m.status from machines m join sites s on s.id = m.site_id', keys: ['code', 'site'] },
  sites: { sql: 'select id, code, name, region from sites', keys: ['code', 'name'] },
  routes: { sql: 'select id, code, name, driver from routes', keys: ['code', 'name', 'driver'] },
  products: { sql: 'select id, code, name, category from products', keys: ['code', 'name'] },
  service_calls: { sql: 'select c.id, c.code, m.code as machine, c.issue, c.status from service_calls c join machines m on m.id = c.machine_id', keys: ['code'] },
};
export async function resolve(db, kind, ref) {
  const q = required(ref, `${kind.replace(/s$/, '').replace('_', ' ')} reference`).toLowerCase();
  const rows = await db.query(FINDERS[kind].sql);
  const val = (r, k) => String(r[k] ?? '').toLowerCase();
  const exact = rows.filter((r) => FINDERS[kind].keys.some((k) => val(r, k) === q));
  const hits = exact.length ? exact : rows.filter((r) => FINDERS[kind].keys.some((k) => val(r, k).includes(q)) || String(r.id).startsWith(q));
  if (hits.length === 1) return hits[0];
  const e = new Error(hits.length ? `"${ref}" matches ${hits.length} ${kind.replace('_', ' ')}; be more specific` : `No ${kind.replace('_', ' ')} matches "${ref}"`);
  e.candidates = hits.map(({ id, ...rest }) => ({ id: String(id).slice(0, 8), ...rest }));
  throw e;
}

export async function transaction(db, actor, fn) {
  required(actor, '--actor=NAME (who is making this change)');
  await db.exec('BEGIN');
  try {
    const out = await fn();
    await db.exec('COMMIT');
    return out;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}
async function setting(db, key, fallback) {
  const [r] = await db.query('select value from settings where key = $1', [key]);
  return r ? Number(r.value) : fallback;
}

// ---------------------------------------------------------------- reads

export const COMPLIANCE_SQL = `
select 'USE_BY' as rule, 'high' as severity, m.machine || ' ' || m.slot as record, m.product_name as detail,
       'use-by ' || m.use_by || ', still in the machine' as finding, 'Food Standards Code 1.2.5-4' as source
from slot_state m join products p on p.code = m.product
where p.date_mark = 'use_by' and m.use_by < current_date and coalesce(m.last_qty, 0) > 0
union all
select 'HEALTHY_NOT_PERMITTED', 'high', ss.machine || ' ' || ss.slot, ss.product_name,
       'on sale at ' || ss.site || ' (' || si.healthy_policy || ' policy)',
       case si.healthy_policy when 'nsw_health' then 'NSW Health GL2024_011' when 'qld_health' then 'Queensland Health directive (A Better Choice)' when 'nz_health' then 'Health NZ National Food and Drink Policy' else 'Site healthy food policy' end
from slot_state ss join products p on p.code = ss.product join machines m on m.id = ss.machine_id join sites si on si.id = m.site_id
where si.healthy_policy <> 'none' and (p.healthy_rating = 'not_permitted' or p.sugar_sweetened)
union all
select 'HEALTHY_SHARE', 'medium', si.code || ' ' || si.name, count(*) filter (where p.healthy_rating = 'everyday') || ' of ' || count(*) || ' slots hold Everyday items',
       round(100.0 * count(*) filter (where p.healthy_rating = 'everyday') / count(*)) || '% against ' || coalesce(si.everyday_min_pct, (select value::int from settings where key = 'min_everyday_default_pct'), 75) || '% required',
       case si.healthy_policy when 'nsw_health' then 'NSW Health GL2024_011' when 'qld_health' then 'Queensland Health directive (A Better Choice)' when 'nz_health' then 'Health NZ National Food and Drink Policy' else 'Site healthy food policy' end
from slot_state ss join products p on p.code = ss.product join machines m on m.id = ss.machine_id join sites si on si.id = m.site_id
where si.healthy_policy <> 'none'
group by si.code, si.name, si.healthy_policy, si.everyday_min_pct
having 100.0 * count(*) filter (where p.healthy_rating = 'everyday') / count(*) < coalesce(si.everyday_min_pct, (select value::int from settings where key = 'min_everyday_default_pct'), 75)
union all
select 'KJ_DISPLAY', 'medium', ss.machine || ' ' || ss.slot, ss.product_name, 'no kilojoule figure on file; the host asks for kilojoules on the machine', 'Site agreement with the host'
from slot_state ss join products p on p.code = ss.product join machines m on m.id = ss.machine_id join sites si on si.id = m.site_id
where si.kj_display and p.kj_per_serve is null
order by 2, 1, 3`;

export const reads = {
  machines: `select m.code as machine, s.name as site, r.code as route, m.kind, m.location_note as location, m.visit_interval_days as every_days, m.cashless, m.telemetry, m.status
             from machines m join sites s on s.id = m.site_id left join routes r on r.id = m.route_id order by m.code`,
  sites: `select s.code, s.name, s.region, (s.commission_bps / 100.0)::numeric(5,2) as commission_pct, s.commission_basis, s.healthy_policy, s.kj_display, s.agreement_ends,
                 (select count(*)::int from machines m where m.site_id = s.id and m.status = 'active') as machines
          from sites s where s.active order by s.code`,
  routes: `select r.code, r.name, r.driver, r.service_days, count(m.id)::int as machines from routes r left join machines m on m.route_id = r.id and m.status = 'active' group by r.id order by r.code`,
  products: `select code, name, category, cost_cents, default_price_cents as price_cents, date_mark, kj_per_serve, healthy_rating from products where active order by category, code`,
  due: `select machine, site, route, kind, last_visit, next_due, days_overdue from machine_due where next_due <= current_date + 1 order by next_due, machine`,
  expiry: `select machine, slot, product_name as product, date_mark, use_by, days_left, est_qty from expiry order by use_by, machine, slot`,
  stockouts: `select machine, site, slot, product, times_empty, last_empty, par, capacity from stockouts order by times_empty desc, machine, slot`,
  cash: `select visit, machine, site, visit_date, driver, currency, expected_cents, cash_cents, cashless_cents, variance_cents from cash_variance order by visit_date desc`,
  performance: `select machine, site, kind, currency, units, weekly_sales_cents, sales_cents, waste_cents, margin_cents from machine_performance order by weekly_sales_cents`,
  commissions: `select site, name, month, currency, collected_cents, net_sales_cents, (commission_bps / 100.0)::numeric(5,2) as pct, commission_basis as basis, commission_cents, paid_cents, (commission_cents - paid_cents) as owed_cents, paid_on
                from site_commission order by month desc, site`,
  calls: `select c.code, m.code as machine, s.name as site, c.opened_on, (current_date - c.opened_on) as days_open, c.issue, c.reported_by
          from service_calls c join machines m on m.id = c.machine_id join sites s on s.id = m.site_id where c.status = 'open' order by c.opened_on`,
  stock: `select product, name, on_hand, earliest_date, fleet_daily_rate as sells_a_day, days_cover from warehouse order by days_cover nulls last, product`,
  waste: `select m.code as machine, p.name as product, sum(vl.removed)::int as units, sum(vl.removed * p.cost_cents)::bigint as cost_cents, s.currency
          from visit_lines vl join visits v on v.id = vl.visit_id join machines m on m.id = v.machine_id join sites s on s.id = v.site_id join products p on p.id = vl.product_id
          where vl.removed > 0 and v.visit_date > current_date - 28 group by m.code, p.name, s.currency order by cost_cents desc`,
  attention: `select item, what, why, due from attention order by due, item`,
  compliance: COMPLIANCE_SQL,
};

export const QUESTIONS = [
  ['Which machines earn the least per week, and where are they?',
    `select machine, site, kind, currency, weekly_sales_cents, margin_cents from machine_performance order by weekly_sales_cents limit 5`],
  ['Which slots keep selling out before the driver gets there?',
    `select machine, slot, product, times_empty, par, capacity from stockouts order by times_empty desc limit 8`],
  ['Which products sell best per slot across the fleet?',
    `select p.name as product, count(distinct ss.slot_id)::int as slots, round(sum(ss.daily_rate) / count(distinct ss.slot_id), 2) as a_day_per_slot from slot_state ss join products p on p.code = ss.product group by p.name order by a_day_per_slot desc limit 8`],
  ['Where is the cash short of what the counts say sold?',
    `select visit, machine, visit_date, driver, currency, expected_cents, (cash_cents + cashless_cents) as collected_cents, variance_cents from cash_variance order by variance_cents limit 8`],
  ['Which products do we throw out most, and what does it cost?',
    `select p.name as product, sum(vl.removed)::int as units, sum(vl.removed * p.cost_cents)::bigint as cost_cents from visit_lines vl join visits v on v.id = vl.visit_id join products p on p.id = vl.product_id where vl.removed > 0 and v.visit_date > current_date - 28 group by p.name order by cost_cents desc limit 8`],
  ['What does each site earn us after commission, product cost and waste?',
    `select s.code as site, s.name, sum(mp.sales_cents)::bigint as sales_cents, sum(mp.margin_cents)::bigint as margin_cents, s.currency from machine_performance mp join machines m on m.code = mp.machine join sites s on s.id = m.site_id group by s.code, s.name, s.currency order by margin_cents`],
  ['Which machines are overdue a visit?',
    `select machine, site, route, last_visit, next_due, days_overdue from machine_due where days_overdue > 0 order by days_overdue desc`],
  ['How many days of stock does the warehouse hold for each product?',
    `select product, name, on_hand, sells_a_day, days_cover from (select product, name, on_hand, fleet_daily_rate as sells_a_day, days_cover from warehouse) w order by days_cover nulls last limit 8`],
  ['Which slots carry far more than sells between visits?',
    `select ss.machine, ss.slot, ss.product_name as product, ss.par, round(ss.daily_rate * md.visit_interval_days, 1) as sells_between_visits from slot_state ss join machine_due md on md.machine_id = ss.machine_id where ss.daily_rate > 0 and ss.par > 2 * ss.daily_rate * md.visit_interval_days + 2 order by ss.par - ss.daily_rate * md.visit_interval_days desc limit 8`],
  ['Which hosts are owed commission, and how much?',
    `select site, name, month, currency, commission_cents, paid_cents, (commission_cents - paid_cents) as owed_cents from site_commission where paid_cents < commission_cents and month < to_char(current_date, 'YYYY-MM') order by month, site`],
];

export async function insights(db) {
  const out = [];
  for (const [question, sql] of QUESTIONS) out.push({ question, rows: await db.query(sql) });
  return out;
}

export async function planogram(db, ref) {
  const m = await resolve(db, 'machines', ref);
  const [machine] = await db.query(`select m.code, s.name as site, r.code as route, m.kind, m.location_note as location, m.visit_interval_days as every_days, m.status
                                    from machines m join sites s on s.id = m.site_id left join routes r on r.id = m.route_id where m.id = $1`, [m.id]);
  const slots = await db.query(`select ss.slot, ss.product, ss.product_name, ss.capacity, ss.par, ss.price_cents, ss.last_qty, ss.est_qty, ss.daily_rate, ss.use_by
                                from slot_state ss where ss.machine_id = $1 order by ss.slot`, [m.id]);
  const visits = await db.query(`select r.visit, r.visit_date, r.driver, r.currency, r.expected_cents, r.cash_cents, r.cashless_cents, r.variance_cents from visit_reconciliation r join visits v on v.id = r.id
                                 where v.machine_id = $1 order by r.visit_date desc limit 6`, [m.id]);
  const calls = await db.query('select code, opened_on, issue, status, resolution from service_calls where machine_id = $1 order by opened_on desc', [m.id]);
  const notes = await db.query('select created_at::date as on, actor, body from notes where machine_id = $1 order by created_at desc', [m.id]);
  return { machine, slots, visits, service_calls: calls, notes };
}

// Pre-kit: what to load on the van for one route, for the machines due by a date.
export async function pickList(db, routeRef, { by } = {}) {
  const date = by ? isoDate(by, '--by') : today();
  const params = [date];
  let filter = '';
  if (routeRef) {
    const r = await resolve(db, 'routes', routeRef);
    params.push(r.id);
    filter = 'and m.route_id = $2';
  }
  const lines = await db.query(`select pn.route, pn.machine, pn.slot, pn.product, pn.product_name, pn.est_qty, pn.par, pn.to_fill
    from pick_needs pn join machines m on m.code = pn.machine
    where pn.next_due <= $1::date ${filter} order by pn.route, pn.machine, pn.slot`, params);
  const totals = new Map();
  for (const l of lines) {
    const t = totals.get(l.product) || { product: l.product, name: l.product_name, units: 0, machines: new Set() };
    t.units += l.to_fill;
    t.machines.add(l.machine);
    totals.set(l.product, t);
  }
  const stock = new Map((await db.query('select product, on_hand from warehouse')).map((r) => [r.product, r.on_hand]));
  const load = [...totals.values()].map((t) => ({ product: t.product, name: t.name, units: t.units, machines: t.machines.size, on_hand: stock.get(t.product) ?? 0, short: Math.max(0, t.units - (stock.get(t.product) ?? 0)) }))
    .sort((a, b) => a.product.localeCompare(b.product));
  return { due_by: date, machines: [...new Set(lines.map((l) => l.machine))], load, by_slot: lines };
}

// ---------------------------------------------------------------- the route visit

// "A1:3/7", "A1:3/7/2", "A1:3/7@2026-11-25": slot:counted/filled[/removed][@date mark]
export function parseSlots(spec) {
  return required(spec, '--slots').split(',').map((part) => {
    const m = part.trim().match(/^([A-Za-z0-9 ]+):(\d+)\/(\d+)(?:\/(\d+))?(?:@(\d{4}-\d{2}-\d{2}))?$/);
    if (!m) throw new Error(`Slot "${part}" must look like A1:3/7 (counted/filled), A1:3/7/2 (removed 2) or A1:3/7@2026-11-25`);
    return { slot: m[1].trim().toUpperCase(), counted: Number(m[2]), filled: Number(m[3]), removed: Number(m[4] || 0), useBy: m[5] || null };
  });
}

// Take filled units out of the warehouse, earliest date first. Returns the earliest date used.
async function takeStock(db, productId, qty) {
  let left = qty;
  let earliest = null;
  const lots = await db.query('select id, qty_left, date_mark_on from stock_lots where product_id = $1 and qty_left > 0 order by date_mark_on nulls last, received_on', [productId]);
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.qty_left);
    await db.query('update stock_lots set qty_left = qty_left - $2 where id = $1', [lot.id, take]);
    left -= take;
    if (lot.date_mark_on && (!earliest || String(lot.date_mark_on) < earliest)) earliest = String(lot.date_mark_on).slice(0, 10);
  }
  return { earliest, short: left };
}

export async function recordVisit(db, machineRef, { date, driver, cash, cashless, slots, note = '', missed = false }) {
  const m = await resolve(db, 'machines', machineRef);
  const [machine] = await db.query('select * from machines where id = $1', [m.id]);
  if (machine.status === 'removed') throw new Error(`${machine.code} is removed; move it back to a site first`);
  const visitDate = date ? isoDate(date, '--date') : today();
  const [later] = await db.query("select code, visit_date from visits where machine_id = $1 and status = 'done' and visit_date > $2 limit 1", [m.id, visitDate]);
  if (later) throw new Error(`${machine.code} already has a later visit (${later.code} on ${later.visit_date}); visits go in date order`);
  const [route] = machine.route_id ? await db.query('select driver from routes where id = $1', [machine.route_id]) : [];
  const who = driver || route?.driver || '';
  if (missed) {
    const [v] = await db.query("insert into visits (machine_id, site_id, route_id, visit_date, driver, status, note) values ($1,$2,$3,$4,$5,'missed',$6) returning code", [m.id, machine.site_id, machine.route_id, visitDate, who, required(note, 'a reason for the missed visit')]);
    return { visit: v.code, machine: machine.code, status: 'missed' };
  }
  const lines = parseSlots(slots);
  const [v] = await db.query('insert into visits (machine_id, site_id, route_id, visit_date, driver, cash_cents, cashless_cents, note) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, code',
    [m.id, machine.site_id, machine.route_id, visitDate, who, cents(cash ?? '0', '--cash'), cents(cashless ?? '0', '--cashless'), note]);
  const warnings = [];
  let expected = 0;
  for (const l of lines) {
    const [slot] = await db.query('select s.*, p.date_mark from slots s left join products p on p.id = s.product_id where s.machine_id = $1 and upper(s.slot) = $2 and s.active', [m.id, l.slot]);
    if (!slot) throw new Error(`${machine.code} has no active slot ${l.slot}`);
    if (l.removed > l.counted) throw new Error(`${l.slot}: removed ${l.removed} is more than the ${l.counted} counted`);
    const after = l.counted - l.removed + l.filled;
    if (after > slot.capacity) throw new Error(`${l.slot}: ${after} would be over the slot capacity of ${slot.capacity}`);
    const [prev] = await db.query('select product_id, qty_after, use_by from slot_last where slot_id = $1', [slot.id]);
    let sold = null;
    if (prev && prev.product_id === slot.product_id) {
      if (l.counted <= prev.qty_after) sold = prev.qty_after - l.counted;
      else warnings.push(`${l.slot}: counted ${l.counted}, more than the ${prev.qty_after} left last visit; sales not worked out for this slot`);
    }
    let useBy = l.useBy;
    if (!useBy && l.filled > 0 && slot.product_id) {
      const took = await takeStock(db, slot.product_id, l.filled);
      if (took.short) warnings.push(`${l.slot}: ${took.short} filled with no matching warehouse stock`);
      useBy = took.earliest;
    } else if (l.filled > 0 && slot.product_id) {
      const took = await takeStock(db, slot.product_id, l.filled);
      if (took.short) warnings.push(`${l.slot}: ${took.short} filled with no matching warehouse stock`);
    }
    const keepOld = l.counted - l.removed > 0 && prev?.use_by && prev.product_id === slot.product_id;
    if (keepOld && (!useBy || String(prev.use_by) < useBy)) useBy = String(prev.use_by).slice(0, 10);
    if (slot.date_mark === 'use_by' && useBy && useBy < visitDate && after > 0) warnings.push(`${l.slot}: stock dated ${useBy} left in the machine, past its use-by`);
    await db.query(`insert into visit_lines (visit_id, slot_id, product_id, price_cents, counted, removed, filled, qty_after, sold, use_by)
                    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [v.id, slot.id, slot.product_id, slot.price_cents, l.counted, l.removed, l.filled, after, sold, useBy]);
    expected += (sold ?? 0) * slot.price_cents;
  }
  const [missing] = await db.query("select string_agg(slot, ', ' order by slot) as slots from slots where machine_id = $1 and active and upper(slot) <> all($2::text[])", [m.id, lines.map((l) => l.slot)]);
  if (missing.slots) warnings.push(`not counted: ${missing.slots}`);
  const [rec] = await db.query('select expected_cents, collected_cents, variance_cents, slots_unknown from visit_reconciliation where id = $1', [v.id]);
  const tolerance = await setting(db, 'cash_tolerance_cents', 500);
  if (!rec.slots_unknown && Math.abs(Number(rec.variance_cents)) > tolerance) warnings.push(`cash and card differ from the counts by ${(Number(rec.variance_cents) / 100).toFixed(2)}`);
  return { visit: v.code, machine: machine.code, date: visitDate, expected: (expected / 100).toFixed(2), collected: (Number(rec.collected_cents) / 100).toFixed(2), variance: (Number(rec.variance_cents) / 100).toFixed(2), warnings };
}

// ---------------------------------------------------------------- planogram, prices, stock, calls, commission

export async function setSlot(db, machineRef, slotName, productRef, { par, capacity, price, actor }) {
  const m = await resolve(db, 'machines', machineRef);
  const p = await resolve(db, 'products', productRef);
  const [prod] = await db.query('select default_price_cents from products where id = $1', [p.id]);
  const slot = required(slotName, 'slot').toUpperCase();
  const [existing] = await db.query('select * from slots where machine_id = $1 and upper(slot) = $2', [m.id, slot]);
  const cap = capacity ? whole(capacity, '--capacity') : existing?.capacity;
  const parN = par ? whole(par, '--par') : existing?.par ?? cap;
  if (!cap) throw new Error('A new slot needs --capacity');
  const priceC = price ? cents(price, '--price') : existing?.price_cents ?? prod.default_price_cents;
  if (existing) {
    if (existing.price_cents !== priceC) await db.query('insert into price_changes (slot_id, old_cents, new_cents, actor) values ($1,$2,$3,$4)', [existing.id, existing.price_cents, priceC, actor]);
    await db.query('update slots set product_id = $2, capacity = $3, par = $4, price_cents = $5, active = true where id = $1', [existing.id, p.id, cap, parN, priceC]);
  } else {
    await db.query('insert into slots (machine_id, slot, product_id, capacity, par, price_cents) values ($1,$2,$3,$4,$5,$6)', [m.id, slot, p.id, cap, parN, priceC]);
  }
  return { machine: m.code, slot, product: p.code, capacity: cap, par: parN, price: (priceC / 100).toFixed(2) };
}

// Change a price on one slot, or every slot holding a product (all machines, or one site).
export async function changePrice(db, target, amount, { site, actor }) {
  const priceC = cents(amount, 'price');
  let rows;
  if (target.includes(':')) {
    const [mRef, slot] = target.split(':');
    const m = await resolve(db, 'machines', mRef);
    rows = await db.query('select id, price_cents from slots where machine_id = $1 and upper(slot) = upper($2) and active', [m.id, slot]);
    if (!rows.length) throw new Error(`${m.code} has no slot ${slot}`);
  } else {
    const p = await resolve(db, 'products', target);
    const params = [p.id];
    let filter = '';
    if (site) { const s = await resolve(db, 'sites', site); params.push(s.id); filter = 'and m.site_id = $2'; }
    rows = await db.query(`select s.id, s.price_cents from slots s join machines m on m.id = s.machine_id where s.product_id = $1 and s.active and m.status = 'active' ${filter}`, params);
  }
  let changed = 0;
  for (const r of rows) {
    if (r.price_cents === priceC) continue;
    await db.query('insert into price_changes (slot_id, old_cents, new_cents, actor) values ($1,$2,$3,$4)', [r.id, r.price_cents, priceC, actor]);
    await db.query('update slots set price_cents = $2 where id = $1', [r.id, priceC]);
    changed++;
  }
  return { slots_changed: changed, new_price: (priceC / 100).toFixed(2), note: 'Recorded here. Change the price on the machine or through your telemetry provider as well.' };
}

export async function receive(db, productRef, qty, { dateMark, ref = '', on }) {
  const p = await resolve(db, 'products', productRef);
  const n = whole(qty, 'quantity');
  if (n <= 0) throw new Error('quantity must be more than 0');
  const [lot] = await db.query('insert into stock_lots (product_id, received_on, qty_received, qty_left, date_mark_on, supplier_ref) values ($1,$2,$3,$3,$4,$5) returning received_on',
    [p.id, on ? isoDate(on, '--on') : today(), n, dateMark ? isoDate(dateMark, '--date-mark') : null, ref]);
  return { product: p.code, received: n, on: lot.received_on, date_mark: dateMark || null };
}

export async function openCall(db, machineRef, issue, { reportedBy = '' }) {
  const m = await resolve(db, 'machines', machineRef);
  const [c] = await db.query('insert into service_calls (machine_id, issue, reported_by) values ($1,$2,$3) returning code, opened_on', [m.id, required(issue, 'issue'), reportedBy]);
  return { call: c.code, machine: m.code, opened_on: c.opened_on };
}
export async function closeCall(db, ref, resolution) {
  const c = await resolve(db, 'service_calls', ref);
  if (c.status === 'closed') throw new Error(`${c.code} is already closed`);
  await db.query("update service_calls set status = 'closed', closed_on = current_date, resolution = $2 where id = $1", [c.id, required(resolution, 'resolution')]);
  return { call: c.code, status: 'closed' };
}

export async function payCommission(db, siteRef, month, reference, { on, actor }) {
  const s = await resolve(db, 'sites', siteRef);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('month must be YYYY-MM');
  const [due] = await db.query('select commission_cents, paid_cents, currency from site_commission where site_id = $1 and month = $2', [s.id, month]);
  if (!due) throw new Error(`No sales recorded at ${s.code} in ${month}`);
  if (Number(due.paid_cents) > 0) throw new Error(`${s.code} ${month} is already recorded as paid`);
  await db.query('insert into commission_payments (site_id, month, amount_cents, reference, paid_on, actor) values ($1,$2,$3,$4,$5,$6)',
    [s.id, month, due.commission_cents, required(reference, 'payment reference'), on ? isoDate(on, '--on') : today(), actor]);
  return { site: s.code, month, recorded: (Number(due.commission_cents) / 100).toFixed(2), currency: due.currency, note: 'A record that it was paid. Payment happens in your bank or accounts system.' };
}

export async function moveMachine(db, machineRef, siteRef, { route, status }) {
  const m = await resolve(db, 'machines', machineRef);
  const updates = [];
  if (siteRef) { const s = await resolve(db, 'sites', siteRef); updates.push(['site_id', s.id]); }
  if (route) { const r = await resolve(db, 'routes', route); updates.push(['route_id', r.id]); }
  if (status) {
    if (!['active', 'repair', 'removed'].includes(status)) throw new Error('--status must be active, repair or removed');
    updates.push(['status', status]);
  }
  if (!updates.length) throw new Error('Say where: a site, --route=CODE or --status=');
  for (const [col, val] of updates) await db.query(`update machines set ${col} = $2 where id = $1`, [m.id, val]);
  const [after] = await db.query('select m.code, s.name as site, r.code as route, m.status from machines m join sites s on s.id = m.site_id left join routes r on r.id = m.route_id where m.id = $1', [m.id]);
  return after;
}

// ---------------------------------------------------------------- add from JSON

const ADDABLE = {
  route: { table: 'routes', fields: ['code', 'name', 'driver', 'service_days'] },
  site: { table: 'sites', fields: ['code', 'name', 'address', 'region', 'country', 'currency', 'gst_bps', 'contact_name', 'contact_email', 'commission_bps', 'commission_basis', 'healthy_policy', 'everyday_min_pct', 'kj_display', 'agreement_ends'] },
  product: { table: 'products', fields: ['code', 'name', 'category', 'cost_cents', 'default_price_cents', 'case_size', 'date_mark', 'kj_per_serve', 'healthy_rating', 'sugar_sweetened'] },
  machine: { table: 'machines', fields: ['code', 'site_id', 'route_id', 'kind', 'location_note', 'make_model', 'serial', 'cashless', 'telemetry', 'visit_interval_days', 'installed_on'] },
};
export async function add(db, kind, data) {
  if (kind === 'setting') {
    await db.query('insert into settings (key, value, note) values ($1,$2,$3) on conflict (key) do update set value = excluded.value, note = excluded.note', [required(data.key, 'key'), String(required(data.value, 'value')), data.note || '']);
    return { setting: data.key, value: String(data.value) };
  }
  const spec = ADDABLE[kind];
  if (!spec) throw new Error(`add takes ${Object.keys(ADDABLE).join('|')}|setting`);
  const row = { ...data };
  if (kind === 'machine') {
    row.site_id = (await resolve(db, 'sites', required(data.site, 'site'))).id;
    if (data.route) row.route_id = (await resolve(db, 'routes', data.route)).id;
  }
  const cols = spec.fields.filter((f) => row[f] !== undefined);
  const [out] = await db.query(`insert into ${spec.table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning code`, cols.map((c) => row[c]));
  return { added: kind, code: out.code };
}

// ---------------------------------------------------------------- import

function mapped(row, map, field, ...fallbacks) {
  const names = map?.[field] ? [].concat(map[field]) : [field, ...fallbacks];
  return pick(row, ...names);
}
function readRows(file, mapFile) {
  const rows = parseCsv(fs.readFileSync(required(file, 'CSV file'), 'utf8'));
  const map = mapFile ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : null;
  return { rows, map };
}
async function batch(db, kind, file, read, loaded, actor) {
  const [b] = await db.query('insert into import_batches (kind, source_file, rows_read, rows_loaded, actor) values ($1,$2,$3,$4,$5) returning id', [kind, String(file).split(/[\\/]/).pop(), read, loaded, actor]);
  return b.id;
}
const moneyOrNull = (v) => (String(v ?? '').trim() === '' ? null : cents(v));

// Products: one row each. Existing codes are updated, new ones added.
export async function importProducts(db, file, { map: mapFile, dryRun, actor }) {
  const { rows, map } = readRows(file, mapFile);
  const out = [];
  for (const [i, r] of rows.entries()) {
    const code = mapped(r, map, 'code', 'product code', 'item code', 'sku', 'upc', 'barcode');
    const name = mapped(r, map, 'name', 'product', 'product name', 'item', 'description');
    if (!code || !name) throw new Error(`row ${i + 2}: needs a product code and a name`);
    out.push({ code, name, category: mapped(r, map, 'category', 'product category') || 'snack', cost: moneyOrNull(mapped(r, map, 'cost', 'unit cost', 'cost price')) ?? 0,
      price: moneyOrNull(mapped(r, map, 'price', 'vend price', 'retail price', 'sell price')) ?? 0, case_size: Number(mapped(r, map, 'case_size', 'case size', 'pack size') || 1),
      kj: mapped(r, map, 'kj', 'kj per serve', 'energy kj') });
  }
  if (dryRun) return { would_load: out.length, first: out.slice(0, 3) };
  for (const p of out) {
    await db.query(`insert into products (code, name, category, cost_cents, default_price_cents, case_size, kj_per_serve) values ($1,$2,$3,$4,$5,$6,$7)
      on conflict (code) do update set name = excluded.name, category = excluded.category, cost_cents = excluded.cost_cents, default_price_cents = excluded.default_price_cents, case_size = excluded.case_size,
      kj_per_serve = coalesce(excluded.kj_per_serve, products.kj_per_serve)`, [p.code, p.name, p.category, p.cost, p.price, p.case_size, p.kj === '' ? null : Number(p.kj)]);
  }
  await batch(db, 'products', file, rows.length, out.length, actor);
  return { loaded: out.length };
}

// Machines with their site and route. Sites and routes that do not exist yet are created.
export async function importMachines(db, file, { map: mapFile, dryRun, actor }) {
  const { rows, map } = readRows(file, mapFile);
  const out = rows.map((r, i) => {
    const code = mapped(r, map, 'machine', 'asset', 'asset number', 'device', 'machine id', 'machine name');
    const site = mapped(r, map, 'site', 'location', 'location name', 'customer', 'account');
    if (!code || !site) throw new Error(`row ${i + 2}: needs a machine and a site`);
    return { code, site, route: mapped(r, map, 'route', 'route name'), kind: (mapped(r, map, 'kind', 'machine type', 'type') || 'snack').toLowerCase().replace(/[^a-z_]/g, '_'),
      location: mapped(r, map, 'location_note', 'placement', 'position'), model: mapped(r, map, 'make_model', 'model', 'make'), serial: mapped(r, map, 'serial', 'serial number'),
      every: Number(mapped(r, map, 'visit_interval_days', 'service interval', 'frequency days') || 7), cashless: yesNo(mapped(r, map, 'cashless', 'card reader'), true) };
  });
  const kinds = ['snack', 'drink', 'combo', 'coffee', 'fresh_food', 'micro_market'];
  for (const m of out) if (!kinds.includes(m.kind)) m.kind = m.kind.includes('drink') || m.kind.includes('bev') || m.kind.includes('cold') ? 'drink' : m.kind.includes('market') ? 'micro_market' : m.kind.includes('food') ? 'fresh_food' : m.kind.includes('coffee') ? 'coffee' : 'snack';
  if (dryRun) return { would_load: out.length, first: out.slice(0, 3) };
  let loaded = 0;
  for (const m of out) {
    let [site] = await db.query('select id from sites where lower(name) = lower($1) or lower(code) = lower($1)', [m.site]);
    if (!site) [site] = await db.query('insert into sites (code, name) values ($1,$2) returning id', [m.site.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 24), m.site]);
    let route = null;
    if (m.route) {
      [route] = await db.query('select id from routes where lower(name) = lower($1) or lower(code) = lower($1)', [m.route]);
      if (!route) [route] = await db.query('insert into routes (code, name) values ($1,$2) returning id', [m.route.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 16), m.route]);
    }
    await db.query(`insert into machines (code, site_id, route_id, kind, location_note, make_model, serial, visit_interval_days, cashless) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (code) do update set site_id = excluded.site_id, route_id = excluded.route_id, kind = excluded.kind`, [m.code, site.id, route?.id ?? null, m.kind, m.location, m.model, m.serial, m.every, m.cashless]);
    loaded++;
  }
  await batch(db, 'machines', file, rows.length, loaded, actor);
  return { loaded };
}

// The planogram: machine, slot, product, capacity, par, price. Missing products must be imported first.
export async function importPlanogram(db, file, { map: mapFile, dryRun, actor }) {
  const { rows, map } = readRows(file, mapFile);
  const out = rows.map((r, i) => {
    const o = { machine: mapped(r, map, 'machine', 'asset', 'device', 'machine id'), slot: mapped(r, map, 'slot', 'coil', 'column', 'selection', 'position'),
      product: mapped(r, map, 'product', 'product code', 'item code', 'sku'), capacity: mapped(r, map, 'capacity', 'cap', 'max'), par: mapped(r, map, 'par', 'par level', 'fill to'),
      price: mapped(r, map, 'price', 'vend price') };
    if (!o.machine || !o.slot || !o.product || !o.capacity) throw new Error(`row ${i + 2}: needs machine, slot, product and capacity`);
    return o;
  });
  if (dryRun) return { would_load: out.length, first: out.slice(0, 3) };
  for (const o of out) await setSlot(db, o.machine, o.slot, o.product, { capacity: o.capacity, par: o.par || o.capacity, price: o.price || undefined, actor });
  await batch(db, 'planogram', file, rows.length, out.length, actor);
  return { loaded: out.length };
}

// Visit history: one row per slot per visit (machine, date, slot, counted, filled, removed),
// cash and card on any row of that visit. Visits load in date order and never load twice.
export async function importVisits(db, file, { map: mapFile, dryRun, actor }) {
  const { rows, map } = readRows(file, mapFile);
  const groups = new Map();
  for (const [i, r] of rows.entries()) {
    const machine = mapped(r, map, 'machine', 'asset', 'device', 'machine id');
    const date = mapped(r, map, 'date', 'visit date', 'service date');
    const slot = mapped(r, map, 'slot', 'coil', 'column', 'selection');
    if (!machine || !date || !slot) throw new Error(`row ${i + 2}: needs machine, date and slot`);
    const key = `${machine}|${isoDate(date, `row ${i + 2} date`)}`;
    const g = groups.get(key) || { machine, date, driver: mapped(r, map, 'driver', 'route driver', 'user'), cash: '0', cashless: '0', lines: [] };
    const cash = mapped(r, map, 'cash', 'cash collected', 'cash in box');
    const card = mapped(r, map, 'cashless', 'card', 'cashless sales');
    if (cash) g.cash = cash;
    if (card) g.cashless = card;
    g.lines.push(`${slot}:${Number(mapped(r, map, 'counted', 'inventory', 'count', 'on hand') || 0)}/${Number(mapped(r, map, 'filled', 'added', 'fill', 'units added') || 0)}/${Number(mapped(r, map, 'removed', 'spoiled', 'waste', 'pulled') || 0)}`);
    groups.set(key, g);
  }
  const visits = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (dryRun) return { would_load: visits.length, lines: rows.length, first: visits.slice(0, 2) };
  const loaded = [];
  const skipped = [];
  for (const g of visits) {
    const m = await resolve(db, 'machines', g.machine);
    const [dupe] = await db.query("select code from visits where machine_id = $1 and visit_date = $2 and status = 'done'", [m.id, g.date]);
    if (dupe) { skipped.push(`${m.code} ${g.date}`); continue; }
    const r = await recordVisit(db, m.code, { date: g.date, driver: g.driver, cash: g.cash, cashless: g.cashless, slots: g.lines.join(',') });
    loaded.push(r.visit);
  }
  await batch(db, 'visits', file, rows.length, loaded.length, actor);
  return { loaded: loaded.length, skipped_already_loaded: skipped };
}
