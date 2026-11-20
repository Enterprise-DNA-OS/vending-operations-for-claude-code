#!/usr/bin/env node
// npm test: a temporary database, the demo data, every command, the imports, the dashboards and
// the documents. Set TEST_DATABASE_URL to also run it against a disposable Postgres (its public
// schema is dropped first; never point it at real data).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run } from './vending.mjs';
import { reads } from './lib/vending.mjs';

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

async function suite(label, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vending-test-'));
  Object.assign(process.env, { OUTPUT_DIR: tmp, DATA_DIR: path.join(tmp, 'db'), DATABASE_URL: env.DATABASE_URL || '' });
  let db = await getDb();
  try {
    if (db.mode === 'postgres') await db.exec('drop schema public cascade; create schema public;');
    assert.equal((await migrate(db)).ran.length, 1);
    assert.equal((await migrate(db)).ran.length, 0, 'migrate is repeatable');
    await seed(db);
    await seed(db);
    assert.equal((await db.query('select count(*)::int as n from routes'))[0].n, 3, 'seed is idempotent');

    // Every read answers.
    for (const cmd of Object.keys(reads)) assert(Array.isArray(await run(db, [cmd])), cmd);
    for (const cmd of ['insights', 'weekly-review', 'history', 'prices']) assert(await run(db, [cmd]), cmd);
    assert.equal((await run(db, ['insights'])).length, 10);
    assert.equal((await run(db, ['planogram', 'VM-101'])).slots.length, 8);

    // The demo hides what an operator meets.
    const att = (await run(db, ['attention'])).map((a) => a.item);
    for (const want of ['visit overdue', 'service call open', 'cash short', 'past use-by in machine', 'selling out', 'warehouse date mark', 'placement agreement ending']) assert(att.includes(want), `attention lacks ${want}`);
    const rules = (await run(db, ['compliance'])).map((c) => `${c.rule}:${c.record}`);
    for (const want of ['USE_BY:VM-110 A2', 'HEALTHY_NOT_PERMITTED:VM-106 A3', 'HEALTHY_NOT_PERMITTED:VM-106 B3', 'HEALTHY_SHARE:S02 Demo Northern Hospital', 'KJ_DISPLAY:VM-109 A3']) assert(rules.includes(want), `compliance lacks ${want}`);
    const short = (await run(db, ['cash'])).find((c) => c.machine === 'VM-102');
    assert.equal(Number(short.variance_cents), -2350, 'the short cash box is found');
    assert((await run(db, ['performance']))[0].machine === 'VM-111', 'the quiet machine is last');
    const pick = await run(db, ['pick-list', 'R2']);
    assert(pick.machines.includes('VM-108') && pick.load.length > 0, 'the overdue machine is on the pick list');

    // A route visit: the counts work out the sales, and the cash matches.
    await assert.rejects(run(db, ['visit', 'VM-108', '--slots=A1:4/6']), /--actor/);
    await assert.rejects(run(db, ['visit', 'VM-108', '--slots=A1:4/20', '--actor=Test']), /capacity/);
    await assert.rejects(run(db, ['visit', 'VM-108', '--slots=A1:4', '--actor=Test']), /counted\/filled/);
    const v = await run(db, ['visit', 'VM-108', '--slots=A1:4/6,A2:8/0,A3:5/5,A4:8/0,B1:6/0,B2:2/4,B3:6/0', '--cash=25.00', '--cashless=37.50', '--actor=Test']);
    assert.equal(v.expected, '62.50');
    assert.equal(v.variance, '0.00');
    assert.deepEqual(v.warnings, []);
    assert(!(await run(db, ['attention'])).some((a) => a.item === 'visit overdue' && a.what.startsWith('VM-108')), 'visited machine no longer overdue');
    const partial = await run(db, ['visit', 'VM-111', '--slots=A1:9/1', '--cash=0', '--actor=Test']);
    assert(partial.warnings.some((w) => w.startsWith('not counted')));
    await assert.rejects(run(db, ['visit', 'VM-111', `--date=${day(-30)}`, '--slots=A1:9/1', '--actor=Test']), /later visit/);
    assert.equal((await run(db, ['visit', 'VM-107', '--missed', '--note=Campus closed', '--actor=Test'])).status, 'missed');

    // Planogram, prices, stock, calls, commission, moves, notes.
    await run(db, ['set-slot', 'VM-106', 'A3', 'WAT-600', '--price=3.00', '--actor=Test']);
    assert(!(await run(db, ['compliance'])).some((c) => c.record === 'VM-106 A3'), 'the sugary drink is out of the hospital slot');
    assert((await run(db, ['price', 'CHIP-SV', '3.20', '--actor=Test'])).slots_changed >= 4);
    assert.equal((await run(db, ['price', 'VM-101:A2', '3.10', '--actor=Test'])).slots_changed, 1);
    assert((await run(db, ['prices'])).some((p) => p.new_cents === 320));
    assert.equal((await run(db, ['receive', 'COLAZ-600', '48', `--date-mark=${day(200)}`, '--ref=PO-8001', '--actor=Test'])).received, 48);
    const call = await run(db, ['call', 'VM-103', 'Coin', 'return', 'stuck', '--actor=Test']);
    assert.equal((await run(db, ['close-call', call.call, 'Cleared on route', '--actor=Test'])).status, 'closed');
    await assert.rejects(run(db, ['close-call', call.call, 'again', '--actor=Test']), /already closed/);
    const paid = await run(db, ['pay-commission', 'S01', lastMonth(), 'EFT', '7781', '--actor=Test']);
    assert(Number(paid.recorded) > 0);
    await assert.rejects(run(db, ['pay-commission', 'S01', lastMonth(), 'EFT', '--actor=Test']), /already/);
    assert.equal((await run(db, ['move', 'VM-111', 'S03', '--route=R2', '--actor=Test'])).site, 'Parramatta Distribution Centre');
    await run(db, ['log', 'VM-101', 'Host asked for more fresh lines', '--actor=Test']);
    await run(db, ['log', 'Ryde', 'Pool closed over Christmas', '--actor=Test']);
    fs.writeFileSync(path.join(tmp, 'p.json'), JSON.stringify({ code: 'NUT-CA', name: 'Cashews 40g', cost_cents: 150, default_price_cents: 450, healthy_rating: 'everyday', kj_per_serve: 980 }));
    assert.equal((await run(db, ['add', 'product', path.join(tmp, 'p.json'), '--actor=Test'])).code, 'NUT-CA');
    await assert.rejects(run(db, ['planogram', 'VM-10']), (e) => e.candidates.length === 9);

    // Imports: products, a machine, its planogram, two visits (never twice), and a Seed export by column map.
    const ex = (f) => path.join(REPO_ROOT, 'examples', f);
    assert.equal((await run(db, ['import', 'products', ex('products.csv'), '--dry-run'])).would_load, 2);
    assert.equal((await run(db, ['import', 'products', ex('products.csv'), '--actor=Test'])).loaded, 2);
    assert.equal((await run(db, ['import', 'machines', ex('machines.csv'), '--actor=Test'])).loaded, 1);
    assert.equal((await run(db, ['import', 'planogram', ex('planogram.csv'), '--actor=Test'])).loaded, 2);
    assert.equal((await run(db, ['import', 'visits', ex('visits.csv'), '--actor=Test'])).loaded, 2);
    assert.deepEqual((await run(db, ['import', 'visits', ex('visits.csv'), '--actor=Test'])).skipped_already_loaded, ['VM-301 2026-11-02', 'VM-301 2026-11-09'], 'a visit never loads twice');
    const imported = (await db.query("select expected_cents, collected_cents from visit_reconciliation where machine = 'VM-301' order by visit_date desc limit 1"))[0];
    assert.equal(Number(imported.expected_cents), 2550);
    assert.equal(Number(imported.collected_cents), 2550);
    await assert.rejects(run(db, ['import', 'seed', ex('visits.csv'), '--actor=Test']), /--map/);
    const seedCsv = path.join(tmp, 'seed-export.csv');
    fs.writeFileSync(seedCsv, `Asset #,Service Date,Coil,Inventory,Added,Spoiled,Cash Collected,Cashless Sales,Route Driver\nVM-301,${day(0)},A1,6,6,0,10.00,5.00,Mel Carter\nVM-301,${day(0)},A2,8,0,0,,,Mel Carter\n`);
    assert.equal((await run(db, ['import', 'seed', seedCsv, `--map=${ex('seed-map.example.json')}`, '--actor=Test'])).loaded, 1);

    const exp = await run(db, ['export']);
    assert(JSON.parse(fs.readFileSync(exp.file, 'utf8')).tables.visits.length >= 70);
    const draft = await run(db, ['draft-commission', 'S02', lastMonth()]);
    assert(fs.readFileSync(draft.file, 'utf8').includes('DRAFT: not sent'));
    assert(fs.existsSync((await run(db, ['draft-weekly-review'])).file));
    await db.close();
    db = null;

    // The CLI as a person runs it, the dashboards and the documents.
    const cli = (args) => spawnSync(process.execPath, [path.join('scripts', 'vending.mjs'), ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    const ok = cli(['due', '--json']);
    assert.equal(ok.status, 0, ok.stderr);
    assert(Array.isArray(JSON.parse(ok.stdout)));
    const ambiguous = cli(['planogram', 'vm-10', '--json']);
    assert.equal(ambiguous.status, 1);
    assert(JSON.parse(ambiguous.stderr).candidates.length === 9);
    assert(cli(['--help']).stdout.includes('import seed'));
    for (const script of ['view', 'docs']) {
      const r = spawnSync(process.execPath, [path.join('scripts', `${script}.mjs`)], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
    }
    assert.equal(fs.readdirSync(path.join(tmp, 'views')).length, 3);
    const statements = fs.readdirSync(path.join(tmp, 'docs-out', 'commission-statement'));
    assert(statements.length >= 5);
    assert(statements.every((f) => !/[:<>"|?*]/.test(f)), 'file names are safe on Windows');
    assert(statements.some((f) => fs.readFileSync(path.join(tmp, 'docs-out', 'commission-statement', f), 'utf8').includes('Harbour Business Park')));
    assert(fs.readdirSync(path.join(tmp, 'docs-out', 'pick-sheet')).length >= 1);
    console.log(`PASS ${label}: migrate, seed, ${Object.keys(reads).length + 7} reads, route visits and cash, planogram and prices, stock, calls, commission, 5 imports, export, drafts, 3 dashboards, 2 documents`);
  } finally {
    await db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

await suite('embedded database', {});
if (process.env.TEST_DATABASE_URL) await suite('Postgres', { DATABASE_URL: process.env.TEST_DATABASE_URL });
