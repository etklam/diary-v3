#!/usr/bin/env node
// Verifies the two rules DESIGN.md states about the platform boundary — the
// edges where this system used to stop and the browser's defaults took over.
//
//   node scripts/check-native-edges.mjs
//
// 1. Every disclosure goes through `Disclosure`/`DisclosureSummary` in ui.tsx.
//    A raw `<details>`/`<summary>` renders the OS triangle, which is how 29 of
//    35 disclosures came to look different from each other (ticket 122).
// 2. `window.confirm` appears nowhere. A native confirm cannot be styled or
//    translated by the app's own i18n, names the origin rather than the
//    product, and cannot show what is about to be destroyed. `ConfirmDialog`
//    does all three.
//
// Exits non-zero on either. Both rules are prose in DESIGN.md and prose drifts;
// this is the same precedent as scripts/check-design-contrast.mjs.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import console from 'node:console'
import process from 'node:process'
import { dirname, join, relative } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'apps/web/app')

// ui.tsx owns both primitives, so it is the one file allowed to write them.
const owner = 'ui.tsx'

function sources(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...sources(path))
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

const rules = [
  {
    name: 'raw disclosure element',
    pattern: /<(?:details|summary)[\s>]/g,
    fix: 'Use `Disclosure` / `DisclosureSummary` from ui.tsx.',
  },
  {
    name: 'window.confirm',
    pattern: /\bwindow\.confirm\s*\(/g,
    fix: 'Use `ConfirmDialog` from ui.tsx, naming the object it destroys.',
  },
]

const failures = []
let checked = 0

for (const file of sources(appDir)) {
  const name = relative(appDir, file)
  const text = readFileSync(file, 'utf8')
  checked += 1
  for (const rule of rules) {
    if (name === owner && rule.name === 'raw disclosure element') continue
    for (const match of text.matchAll(rule.pattern)) {
      const line = text.slice(0, match.index).split('\n').length
      failures.push({ file: name, line, rule })
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} native edge(s) left unfinished:\n`)
  for (const failure of failures) {
    console.error(`  apps/web/app/${failure.file}:${failure.line} — ${failure.rule.name}`)
    console.error(`      ${failure.rule.fix}`)
  }
  console.error('')
  process.exit(1)
}

console.log(`${checked} source files checked.`)
console.log("Every disclosure and every confirmation is the system's own.")
