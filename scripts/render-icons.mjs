#!/usr/bin/env node
// Renders the PWA / favicon PNGs from their SVG sources so the raster icons can
// never drift from the brand colour in apps/web/public/*.svg.
//
//   node scripts/render-icons.mjs

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import console from 'node:console';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps/web/public');

const jobs = [
  ['icon-192.svg', 'icon-192.png', 192],
  ['icon-512.svg', 'icon-512.png', 512],
  ['icon-maskable-192.svg', 'icon-maskable-192.png', 192],
  ['icon-maskable-512.svg', 'icon-maskable-512.png', 512],
  // iOS composites apple-touch-icon on an opaque tile and applies its own mask,
  // so it renders from the full-bleed source, never the rounded one.
  ['icon-maskable-512.svg', 'apple-touch-icon.png', 180],
];

const browser = await chromium.launch();
try {
  for (const [src, out, size] of jobs) {
    const svg = readFileSync(join(dir, src), 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      { waitUntil: 'load' },
    );
    writeFileSync(join(dir, out), await page.locator('svg').screenshot({ omitBackground: true }));
    await page.close();
    console.log(`  ${out}  ${size}x${size}`);
  }
} finally {
  await browser.close();
}
