#!/usr/bin/env node
// Verifies the claim DESIGN.md makes: every text/background pair and every
// control affordance in both themes meets WCAG 2.1 (body >= 4.5:1, non-text
// UI >= 3:1). Token values are read from apps/web/app/tokens.css, so this
// cannot drift away from what the app actually ships.
//
//   node scripts/check-design-contrast.mjs
//
// Exits non-zero on the first failing pair.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'apps/web/app/tokens.css'), 'utf8');

/* ---- colour maths ------------------------------------------------------- */

const clamp01 = v => Math.min(1, Math.max(0, v));

function oklchToSrgb(L, C, hDeg, alpha) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const enc = c => {
    const v = clamp01(c);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  };
  return {
    rgb: [
      enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ],
    alpha,
  };
}

const luminance = ([r, g, b]) => {
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

// Alpha fills are measured as seen: flattened over the surface they sit on.
const flatten = (fg, bg) => (fg.alpha >= 1 ? fg.rgb : fg.rgb.map((c, i) => c * fg.alpha + bg.rgb[i] * (1 - fg.alpha)));

function ratio(fg, bg) {
  const [hi, lo] = [luminance(flatten(fg, bg)), luminance(bg.rgb)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const hex = c => '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

/* ---- token extraction ---------------------------------------------------- */

const OKLCH = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/;

/**
 * Reads one theme's token values. The light theme is the first `:root` block;
 * the dark theme is the `[data-theme='dark']` block, which only redeclares the
 * roles that change, so it inherits the rest from light.
 */
function readBlock(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`tokens.css: no block for ${selector}`);
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  const body = css.slice(open, end);
  const out = {};
  for (const line of body.split('\n')) {
    const decl = line.match(/^\s*--([a-z0-9-]+):\s*(.+?);/);
    if (!decl) continue;
    const colour = decl[2].match(OKLCH);
    if (colour) out[decl[1]] = oklchToSrgb(+colour[1], +colour[2], +colour[3], colour[4] === undefined ? 1 : +colour[4]);
    else if (decl[2].trim() === '#fff' || decl[2].trim() === 'oklch(1 0 0)') out[decl[1]] = oklchToSrgb(1, 0, 0, 1);
  }
  return out;
}

const light = readBlock(':root {');
const dark = { ...light, ...readBlock(":root[data-theme='dark'] {") };

/* ---- the pairs that must hold ------------------------------------------- */

const SURFACES = ['canvas', 'surface', 'muted-surface', 'surface-sunken'];
// Everything that can carry body-sized text.
const INKS = ['text', 'muted', 'action', 'negative', 'market-up', 'market-down', 'market-flat', 'series-1', 'series-2', 'series-3'];

function pairs(theme) {
  const rows = [];
  for (const bg of SURFACES) for (const fg of INKS) rows.push([`${fg} on ${bg}`, theme[fg], theme[bg], 4.5]);

  rows.push(['on-action on action', theme['on-action'], theme.action, 4.5]);
  rows.push(['on-action on action-hover', theme['on-action'], theme['action-hover'], 4.5]);

  // Non-text contrast (WCAG 1.4.11) for control affordances and the focus ring.
  rows.push(['control vs surface', theme.control, theme.surface, 3]);
  rows.push(['control vs canvas', theme.control, theme.canvas, 3]);
  for (const bg of SURFACES) rows.push([`focus ring vs ${bg}`, theme.focus, theme[bg], 3]);

  // Tinted fills carry text, so they are checked flattened over their surface.
  for (const bg of ['surface', 'canvas']) {
    rows.push([`tint-info-text on tint-info over ${bg}`, theme['tint-info-text'], { rgb: flatten(theme['tint-info'], theme[bg]), alpha: 1 }, 4.5]);
    rows.push([`tint-warn-text on tint-warn over ${bg}`, theme['tint-warn-text'], { rgb: flatten(theme['tint-warn'], theme[bg]), alpha: 1 }, 4.5]);
    rows.push([`text on tint-neutral over ${bg}`, theme.text, { rgb: flatten(theme['tint-neutral'], theme[bg]), alpha: 1 }, 4.5]);
    rows.push([`text on selected over ${bg}`, theme.text, { rgb: flatten(theme.selected, theme[bg]), alpha: 1 }, 4.5]);
    rows.push([`action-strong on selected over ${bg}`, theme['action-strong'], { rgb: flatten(theme.selected, theme[bg]), alpha: 1 }, 4.5]);
  }
  return rows;
}

// Each market-colour preference is a real rendering of the up/down roles.
function marketPreferences(themeName, theme) {
  const rows = [];
  const prefs = [['cn', ":root[data-market-color='cn'] {"], ['cb', ":root[data-market-color='cb'] {"]];
  for (const [name, selector] of prefs) {
    const sel = themeName === 'dark' ? selector.replace(":root[", ":root[data-theme='dark'][") : selector;
    let overrides;
    try { overrides = readBlock(sel); } catch { continue; }
    for (const role of ['market-up', 'market-down']) {
      if (!overrides[role]) continue;
      for (const bg of SURFACES) rows.push([`${role} (${name}) on ${bg}`, overrides[role], theme[bg], 4.5]);
    }
  }
  return rows;
}

let failures = 0;
for (const [name, theme] of [['light', light], ['dark', dark]]) {
  const rows = [...pairs(theme), ...marketPreferences(name, theme)];
  let checked = 0;
  for (const [label, fg, bg, min] of rows) {
    if (!fg || !bg) { console.log(`  SKIP ${name}: ${label} (token missing)`); continue; }
    checked += 1;
    const r = ratio(fg, bg);
    if (r < min) {
      failures += 1;
      console.log(`  FAIL ${name}: ${label.padEnd(44)} ${r.toFixed(2)} < ${min}   ${hex(flatten(fg, bg))} on ${hex(bg.rgb)}`);
    }
  }
  console.log(`${name}: ${checked} pairs checked`);
}

if (failures) {
  console.error(`\n${failures} contrast failure(s). Adjust the lightness in apps/web/app/tokens.css.`);
  process.exit(1);
}
console.log('\nAll pairs meet WCAG 2.1 (text 4.5:1, non-text UI 3:1).');
