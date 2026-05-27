#!/usr/bin/env node
/**
 * Responsive site audit — capture screenshots at 4 viewports and detect
 * horizontal overflow / off-screen elements / scrollbar artifacts.
 *
 *   375  × 667   iPhone SE
 *   768  × 1024  iPad portrait
 *   1280 × 800   Laptop
 *   1920 × 1080  Desktop
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'docs', 'audit');
mkdirSync(OUT, { recursive: true });

const URL = process.env.AUDIT_URL || 'http://localhost:8765/';
const VIEWPORTS = [
  { name: 'mobile-375',   width:  375, height:  667 },
  { name: 'tablet-768',   width:  768, height: 1024 },
  { name: 'laptop-1280',  width: 1280, height:  800 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const PAGES = ['/', '/docs.html', '/404.html'];

async function audit() {
  const browser = await chromium.launch();
  const issues = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    for (const path of PAGES) {
      const url = URL.replace(/\/$/, '') + path;
      await page.goto(url, { waitUntil: 'networkidle' });

      // Detect horizontal overflow + circular-element distortion.
      const audit = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const docW = Math.max(html.scrollWidth, body.scrollWidth);
        const winW = window.innerWidth;
        const overflow = docW > winW + 1;
        const culprits = [];
        if (overflow) {
          for (const el of document.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.right > winW + 1 && rect.width > 0) {
              culprits.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 50),
                w: Math.round(rect.width),
                right: Math.round(rect.right),
              });
              if (culprits.length >= 5) break;
            }
          }
        }

        // Circular-element distortion check: every element with
        // border-radius: 50% should be width === height (within 1px).
        // Catches squished circles inside flex containers.
        const distorted = [];
        for (const el of document.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.borderRadius !== '50%') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (Math.abs(r.width - r.height) > 1) {
            distorted.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 50),
              w: Math.round(r.width),
              h: Math.round(r.height),
              ratio: +(r.width / r.height).toFixed(2),
            });
          }
        }
        return { docW, winW, overflow, culprits, distorted };
      });

      const tag = `${vp.name}_${path.replace(/[\/.]/g, '_') || 'index'}`;
      await page.screenshot({ path: resolve(OUT, `${tag}.png`), fullPage: true });

      const ovStatus = audit.overflow ? '✗ OVERFLOW' : '✓';
      const distStatus = audit.distorted.length ? `✗ ${audit.distorted.length} CIRCLE(S) DISTORTED` : '';
      const status = audit.overflow || audit.distorted.length
        ? `${ovStatus} ${distStatus}`.trim()
        : '✓';
      console.log(`${status.padEnd(36)}  ${vp.name}  ${path.padEnd(14)}  doc=${audit.docW}  win=${audit.winW}`);
      if (audit.overflow) {
        issues.push({ vp: vp.name, path, kind: 'overflow', ...audit });
        for (const c of audit.culprits) console.log(`        ↳ <${c.tag}.${c.cls}> w=${c.w} right=${c.right}`);
      }
      if (audit.distorted.length) {
        issues.push({ vp: vp.name, path, kind: 'distorted', distorted: audit.distorted });
        for (const d of audit.distorted) console.log(`        ↳ <${d.tag}.${d.cls}> ${d.w}×${d.h} ratio=${d.ratio}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nScreenshots → ${OUT}`);
  console.log(issues.length ? `\n${issues.length} issue(s) found` : '\n✓ No issues at any viewport');
  process.exit(issues.length ? 1 : 0);
}

audit().catch((e) => { console.error(e); process.exit(2); });
