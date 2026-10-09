#!/usr/bin/env node
// Verifies the Figure Rule DESIGN.md states: every number the user is asked to
// judge is set in the monospace cut. A rule block that asks for tabular figures
// is declaring itself a figure surface, so it must also name the mono family —
// otherwise the figures get tabular spacing and render in the prose face, which
// is exactly the drift the 2026-10-09 page score found on 72 blocks.
//
//   node scripts/check-figure-rule.mjs
//
// Exits non-zero if an unlisted block sets tabular-nums without the mono family.
//
// `tests/unit/figure-formatting-boundary.test.ts` guards which function formats
// a figure; this guards what face the figure renders in. Both are needed.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps/web/app');

// Blocks that legitimately ask for tabular figures without being a figure
// surface: containers whose own text is prose, pagination and status lines, and
// selectors whose figures are already mono through the global `.num`/`time`
// rule in styles.css. Each entry is "<file>::<selector>" and needs a reason.
const allowed = new Map([
  ['achievements.css::.goal-meta', 'flex container; the date inside is a <time>, already mono'],
  ['achievements.css::.achievement-list time', '<time> is mono globally (styles.css)'],
  ['alerts.css::.reminders-page time', '<time> is mono globally'],
  ['company-context.css::.company-context-list time', '<time> is mono globally'],
  ['trade-plan.css::.picker-list time', '<time> is mono globally'],
  ['markdown.css::.safe-markdown td.num, .safe-markdown th.num', '.num is mono globally'],
  ['command-palette.css::.palette-hint', 'keyboard hint prose'],
  ['command-palette.css::.palette-detail', 'result subtitle prose'],
  ['diary-list.css::.diary-pagination', 'container holding buttons and a status line'],
  ['review-queue.css::.queue-pagination', 'container holding buttons and a status line'],
  ['routes/admin-gurus.css::.admin-gurus-pagination span', 'page-of-page status text'],
  ['routes/admin-institutional-mappings.css::.admin-mapping-pagination span', 'page-of-page status text'],
  ['routes/admin-research.css::.research-pagination span', 'page-of-page status text'],
  ['routes/admin-users.css::.admin-users-pagination span', 'page-of-page status text'],
  ['routes/admin-institutional-mappings.css::.admin-mapping-count', 'sentence: "0 matching holdings"'],
  ['routes/guru-notifications.css::.guru-notifications-detail', 'flex container of meta prose'],
  ['routes/market-rotation.css::.rotation-summary-meta', 'sentence'],
  ['routes/market-rotation.css::.rotation-comparison-note', 'sentence'],
  ['position-sizing.css::.position-sizing-ratios', 'sentence: "40 / 30 / 20 / 10 · larger first batches"'],
  ['styles.css::.nav-badge', 'decorative count; the link name carries the number'],
  ['styles.css::.mobile-diary-badge', 'decorative count; the link name carries the number'],
  ['styles.css::.foreground-reminders', 'flex container'],
  ['timeline.css::.timeline-filter-range', 'select showing a range label'],
  ['timeline.css::.timeline-count', 'sentence: "12 records loaded"'],
  ['ledger.css::.ledger-reading dd', 'mixed: diary ledger holds notes and emotion; figures marked .num'],
  ['routes/ai-reports.css::.ai-quota', 'sentence'],
  // Table rules that style `th` alongside `td`: the column labels are prose, so
  // the family is set on a `tbody td` rule beside each of these instead.
  ['market-research.css::.market-scenario-table th, .market-scenario-table td, .market-history-table th, .market-history-table td', 'th are labels; tbody td rule carries the family'],
  ['market-research.css::.seasonality-table th:nth-child(2), .seasonality-table td:nth-child(2)', 'th is a label; tbody td rule carries the family'],
  ['position-sizing.css::.position-sizing-table td, .position-sizing-table th', 'th are labels; tbody rule carries the family'],
  ['routes/sec-filings.css::.sec-filing-table th, .sec-filing-table td', 'th are labels; tbody td rule carries the family'],
  ['routes/market-rotation.css::.rotation-table-scroll th:nth-child(n+4), .rotation-table-scroll td:nth-child(n+4)', 'th are labels; tbody rule carries the family'],
  ['routes/market-rotation.css::.rotation-history-scroll th:not(:first-child), .rotation-history-scroll td:not(:first-child)', 'th are labels; tbody rule carries the family'],
  ['ledger.css::.holdings-table table', 'table-level spacing; tbody rule carries the family'],
  ['portfolio-exposure.css::.portfolio-exposure-table-scroll table', 'table-level spacing; tbody rule carries the family'],
  ['stock-guru-panel.css::.stock-guru-chart-row', 'grid container; figures are in child spans'],
  ['trade-plan.css::.execution-selected-list li', 'grid row container'],
]);

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith('.css')) out.push(path);
  }
  return out;
}

const failures = [];
let checked = 0;
let exempt = 0;
const seen = new Set();

for (const file of cssFiles(appDir)) {
  const name = relative(appDir, file);
  const css = readFileSync(file, 'utf8');
  let offset = 0;
  for (const block of css.split('}')) {
    const start = offset;
    offset += block.length + 1;
    if (!block.includes('tabular-nums')) continue;
    const brace = block.lastIndexOf('{');
    if (brace === -1) continue;
    // Splitting on "}" can start a block mid-comment, so drop everything up to
    // the last comment close, then normalise the selector to single spaces.
    const head = block.slice(0, brace);
    const commentEnd = head.lastIndexOf('*/');
    const selector = head
      .slice(commentEnd === -1 ? 0 : commentEnd + 2)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
    const body = block.slice(brace + 1);
    checked++;
    if (/font-family/.test(body) && /--font-mono|monospace/.test(body)) continue;
    const key = `${name}::${selector}`;
    seen.add(key);
    if (allowed.has(key)) { exempt++; continue; }
    failures.push({ key, line: css.slice(0, start).split('\n').length, file: name });
  }
}

const stale = [...allowed.keys()].filter(key => !seen.has(key));

if (failures.length) {
  console.error(`\nThe Figure Rule is not met by ${failures.length} rule block(s):\n`);
  for (const failure of failures) {
    console.error(`  ${failure.file}:${failure.line}`);
    console.error(`      ${failure.key.split('::')[1].replace(/\n/g, ' ')}`);
  }
  console.error(`\nEach block asks for tabular figures but does not name the mono family.`);
  console.error(`Add "font-family: var(--font-mono);" — or, if the block is prose, a`);
  console.error(`container or already mono through .num/time, add it to \`allowed\` in`);
  console.error(`scripts/check-figure-rule.mjs with the reason.\n`);
  process.exit(1);
}

if (stale.length) {
  console.error(`\n${stale.length} exemption(s) in check-figure-rule.mjs no longer match a rule block:\n`);
  for (const key of stale) console.error(`  ${key.replace(/\n/g, ' ')}`);
  console.error(`\nThe selector moved or gained the mono family. Remove the exemption.\n`);
  process.exit(1);
}

console.log(`${checked} tabular-figure blocks checked, ${exempt} exempt with a stated reason.`);
console.log('Every figure surface names the mono family.');
