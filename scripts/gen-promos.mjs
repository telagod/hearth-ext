#!/usr/bin/env node
/**
 * Generate Chrome Web Store promo images by rendering a styled SVG with resvg.
 * Outputs 1280×800 marquee + 440×280 tile + a 128×128 store icon.
 *
 * Re-run any time by `node scripts/gen-promos.mjs`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'docs', 'promo');
mkdirSync(OUT, { recursive: true });

function tileSvg(w, h, opts = {}) {
  const big = opts.size === 'big';
  const title = opts.title ?? 'Hearth';
  const subtitle = opts.subtitle ?? 'Your reading, remembered. Quietly.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="bg" cx="78%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#ff9b2d" stop-opacity="0.40"/>
      <stop offset="60%" stop-color="#262620" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#131210" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="orb" cx="35%" cy="30%" r="65%">
      <stop offset="0%"  stop-color="#fff3c8"/>
      <stop offset="35%" stop-color="#ffd89a"/>
      <stop offset="70%" stop-color="#ff9b2d"/>
      <stop offset="100%" stop-color="#c0420c" stop-opacity="0.9"/>
    </radialGradient>
    <radialGradient id="halo" cx="35%" cy="30%" r="58%">
      <stop offset="0%"  stop-color="#ff9b2d" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ff9b2d" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="url(#bg)"/>

  <!-- Decorative grain -->
  <g opacity="0.06" fill="white">
    ${Array.from({ length: 80 }, () => {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.5 + Math.random() * 1.5;
      return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}"/>`;
    }).join('\n    ')}
  </g>

  <!-- Orb cluster on the right -->
  <g transform="translate(${w * 0.78}, ${h * 0.45})">
    <circle cx="0" cy="0" r="${big ? 220 : 120}" fill="url(#halo)"/>
    <circle cx="0" cy="0" r="${big ? 140 : 75}" fill="url(#orb)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    <!-- flame glyph inside orb -->
    <g transform="translate(${big ? -50 : -28}, ${big ? -52 : -28}) scale(${big ? 4.2 : 2.4})">
      <path d="M12 3 C9 7 7.5 10 8 13 Q9 17 12 18 Q15 17 16 13 C16.5 10 15 7 12 3 Z" fill="rgba(45,18,0,0.85)"/>
    </g>
  </g>

  <!-- Text block on the left -->
  <g transform="translate(${big ? 70 : 32}, ${big ? 200 : 80})">
    <text x="0" y="0" font-family="Noto Serif SC, serif" font-weight="700"
          font-size="${big ? 86 : 36}" fill="#ebe9e0" letter-spacing="-1">${title}</text>
    <text x="0" y="${big ? 130 : 60}" font-family="Inter, sans-serif" font-weight="500"
          font-size="${big ? 32 : 16}" fill="#b8b4a4">${subtitle}</text>
    ${big ? `
    <g transform="translate(0, 200)">
      <rect x="0" y="0" width="180" height="44" rx="22" fill="#ff9b2d"/>
      <text x="90" y="29" text-anchor="middle" font-family="Inter, sans-serif"
            font-weight="600" font-size="16" fill="#fff">Install ☕</text>
    </g>
    ` : ''}
  </g>

  <!-- Bottom-left tagline (big only) -->
  ${big ? `
  <g transform="translate(70, ${h - 60})">
    <text font-family="JetBrains Mono, monospace" font-size="14" fill="#898577"
          letter-spacing="2" text-transform="uppercase">
      LOCAL-FIRST  ·  BYOK  ·  MIT OPEN SOURCE
    </text>
  </g>
  ` : ''}
</svg>`;
}

function render(name, w, h, opts) {
  const svg = tileSvg(w, h, opts);
  // also save the source SVG for manual editing
  writeFileSync(resolve(OUT, `${name}.svg`), svg, 'utf-8');
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: w } });
  const png = r.render().asPng();
  writeFileSync(resolve(OUT, `${name}.png`), png);
  console.log(`wrote promo/${name}.png  (${(png.length / 1024).toFixed(1)} KB)`);
}

render('marquee-1400x560', 1400, 560, { size: 'big' });
render('tile-440x280',      440,  280);
render('screenshot-fallback-1280x800', 1280, 800, {
  size: 'big',
  title: 'Hearth',
  subtitle: 'Bring your old notes back into the moment.',
});

// Small store icon (128x128) re-uses brand SVG via resvg
import { readFileSync } from 'node:fs';
const brand = readFileSync(resolve(here, '..', 'public', 'icons', 'hearth.svg'), 'utf-8');
const r128 = new Resvg(brand, { fitTo: { mode: 'width', value: 128 }, background: 'rgba(0,0,0,0)' });
writeFileSync(resolve(OUT, 'store-icon-128.png'), r128.render().asPng());
console.log('wrote promo/store-icon-128.png');

console.log(`\n✓ promo materials in ${OUT}`);
