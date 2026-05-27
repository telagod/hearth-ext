#!/usr/bin/env node
/**
 * Render Hearth brand SVG to crisp PNGs at the four manifest sizes.
 * Source of truth = public/icons/hearth.svg. Update SVG, re-run this script.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'public', 'icons');
const SRC = resolve(OUT, 'hearth.svg');
const svg = readFileSync(SRC, 'utf-8');

const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
    shapeRendering: 2,    // 2 = geometricPrecision
    textRendering: 1,
    imageRendering: 0,
  });
  const png = r.render().asPng();
  const dst = resolve(OUT, `hearth-${size}.png`);
  writeFileSync(dst, png);
  console.log(`wrote icons/hearth-${size}.png  (${png.length} bytes)`);
}
