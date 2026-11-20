#!/usr/bin/env node
// npm run demo: a throwaway database under .data/demo-*, the demo operator loaded, three answers,
// then the dashboards and documents. Never touches DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, format } from './vending.mjs';

fs.mkdirSync(path.join(REPO_ROOT, '.data'), { recursive: true });
const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.data', 'demo-'));
process.env.DATABASE_URL = '';
process.env.DATA_DIR = path.join(dir, 'db');
process.env.OUTPUT_DIR = dir;
const db = await getDb();
try {
  await migrate(db);
  await seed(db);
  for (const cmd of ["attention", "due", "performance"]) console.log(`\n${cmd}\n${format(await run(db, [cmd]))}`);
} finally {
  await db.close();
}
for (const script of ['view', 'docs']) {
  const r = spawnSync(process.execPath, [path.join('scripts', `${script}.mjs`)], { cwd: REPO_ROOT, env: process.env, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${script} failed`);
}
console.log(`\nDemo database, dashboards and documents: ${path.relative(REPO_ROOT, dir)}`);
