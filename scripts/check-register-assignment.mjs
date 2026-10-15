#!/usr/bin/env node
// Verifies the density ruling DESIGN.md records: every route is written in one
// of three registers — capture, ledger, reading — and the assignment lives in
// `apps/web/app/registers.ts` beside the route table it mirrors.
//
//   node scripts/check-register-assignment.mjs
//
// Exits non-zero when `routes.ts` and `registers.ts` disagree: a route with no
// register, or a register for a route that no longer exists.
//
// What this check can and cannot do is worth stating, because the ticket that
// asked for it (120) asked for a check that fails "when a route drifts from its
// assigned register". A register is a measure, a rhythm and a heading step —
// properties of rendered layout, not of source text — so drift is only
// measurable against a running browser, which is what the e2e register cases
// do for one surface per register. What is statically checkable, and what
// actually decays, is the *assignment*: a new route arriving with no register
// at all, which is exactly how the single-texture default reasserted itself
// before the ruling existed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps/web/app');

const routesSource = readFileSync(join(appDir, 'routes.ts'), 'utf8');
const registersSource = readFileSync(join(appDir, 'registers.ts'), 'utf8');

const routePaths = new Set();
if (/\bindex\(/u.test(routesSource)) routePaths.add('');
for (const match of routesSource.matchAll(/\broute\(\s*'([^']*)'/gu)) routePaths.add(match[1]);

const table = registersSource.slice(registersSource.indexOf('ROUTE_REGISTERS'));
const end = table.indexOf('\n}\n');
const body = table.slice(0, end === -1 ? table.length : end);
const assigned = new Map();
for (const match of body.matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z][\w]*))\s*:\s*'(capture|ledger|reading|none)'/gmu)) {
  assigned.set(match[1] ?? match[2] ?? match[3], match[4]);
}
// The index route is keyed by the empty string, which the pattern above cannot
// express; accept it explicitly.
if (/^\s*'':\s*'(capture|ledger|reading|none)'/mu.test(body)) {
  assigned.set('', body.match(/^\s*'':\s*'(capture|ledger|reading|none)'/mu)[1]);
}

const missing = [...routePaths].filter(path => !assigned.has(path)).sort();
const stale = [...assigned.keys()].filter(path => !routePaths.has(path)).sort();

if (missing.length) {
  console.error(`\n${missing.length} route(s) in routes.ts have no register:\n`);
  for (const path of missing) console.error(`  ${path === '' ? '(index)' : path}`);
  console.error('\nAssign each one in apps/web/app/registers.ts — capture for a writing');
  console.error('surface, ledger for figures in rows, reading for an entry or an article.');
  console.error('A route that renders no page takes `none`.\n');
  process.exit(1);
}

if (stale.length) {
  console.error(`\n${stale.length} register assignment(s) no longer match a route:\n`);
  for (const path of stale) console.error(`  ${path}`);
  console.error('\nThe route moved or was removed. Remove the assignment.\n');
  process.exit(1);
}

const counts = { capture: 0, ledger: 0, reading: 0, none: 0 };
for (const register of assigned.values()) counts[register] += 1;
console.log(`${routePaths.size} routes assigned: ${counts.capture} capture, ${counts.ledger} ledger, ${counts.reading} reading, ${counts.none} not a page.`);
