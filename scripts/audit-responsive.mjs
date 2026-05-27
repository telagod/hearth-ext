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

      // Detect horizontal overflow.
      const audit = await page.evaluate(() => {
        const html = document.documentElement;
        const body = document.body;
        const docW = Math.max(html.scrollWidth, body.scrollWidth);
        const winW = window.innerWidth;
        const overflow = docW > winW + 1;
        // Find any element wider than the viewport
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
        return { docW, winW, overflow, culprits };
      });

      const tag = `${vp.name}_${path.replace(/[\/.]/g, '_') || 'index'}`;
      await page.screenshot({ path: resolve(OUT, `${tag}.png`), fullPage: true });

      const status = audit.overflow ? '✗ OVERFLOW' : '✓';
      console.log(`${status}  ${vp.name}  ${path.padEnd(14)}  doc=${audit.docW}  win=${audit.winW}`);
      if (audit.overflow) {
        issues.push({ vp: vp.name, path, ...audit });
        for (const c of audit.culprits) console.log(`        ↳ <${c.tag}.${c.cls}> w=${c.w} right=${c.right}`);
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nScreenshots → ${OUT}`);
  console.log(issues.length ? `\n${issues.length} overflow issue(s) found` : '\n✓ No overflow at any viewport');
  process.exit(issues.length ? 1 : 0);
}

audit().catch((e) => { console.error(e); process.exit(2); });
