#!/usr/bin/env node
/**
 * Render Hearth README hero + feature triptych as production-quality SVG
 * → PNG via resvg. Outputs to docs/promo/.
 *
 * Why programmatic SVG over screenshots:
 *   1. Reproducible (re-run any time after design tweak)
 *   2. No need to load the extension just to take a screenshot
 *   3. Versionable — edit the script, see the diff
 *
 * Outputs:
 *   docs/promo/readme-hero.png        1600×720   GitHub README banner
 *   docs/promo/feat-recall.png         800×500   Reverse recall demo
 *   docs/promo/feat-floatbar.png       800×500   In-page float bar
 *   docs/promo/feat-chat.png           800×500   Sidepanel chat
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '..', 'docs', 'promo');
mkdirSync(OUT, { recursive: true });

// ────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────

const PALETTE = {
  ink_950: '#0c0c09',
  ink_900: '#181813',
  ink_800: '#262620',
  ink_700: '#3b3a32',
  ink_600: '#504e44',
  ink_400: '#8e8a7a',
  ink_300: '#b6b3a3',
  ink_200: '#d6d4ca',
  ink_100: '#ecebe6',
  ink_50:  '#f7f7f5',
  ember_200: '#ffd89a',
  ember_400: '#ff9b2d',
  ember_500: '#f87b15',
  ember_600: '#e85d0a',
  ember_700: '#c0420c',
  moss_400:  '#85a987',
  moss_500:  '#5f8a64',
};

const FONTS = `font-family="'Noto Serif SC', 'Inter', system-ui, sans-serif"`;
const FONT_MONO = `font-family="'JetBrains Mono', ui-monospace, monospace"`;

function defs() {
  return `
    <defs>
      <radialGradient id="bg" cx="80%" cy="20%" r="80%">
        <stop offset="0%" stop-color="${PALETTE.ember_500}" stop-opacity="0.40"/>
        <stop offset="55%" stop-color="${PALETTE.ink_800}"  stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${PALETTE.ink_950}" stop-opacity="1"/>
      </radialGradient>
      <radialGradient id="orb" cx="35%" cy="30%" r="65%">
        <stop offset="0%"  stop-color="#fff3c8"/>
        <stop offset="35%" stop-color="${PALETTE.ember_200}"/>
        <stop offset="70%" stop-color="${PALETTE.ember_400}"/>
        <stop offset="100%" stop-color="${PALETTE.ember_700}" stop-opacity="0.92"/>
      </radialGradient>
      <radialGradient id="halo" cx="35%" cy="30%" r="58%">
        <stop offset="0%"  stop-color="${PALETTE.ember_400}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${PALETTE.ember_400}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgba(38,38,32,0.92)"/>
        <stop offset="100%" stop-color="rgba(28,26,22,0.95)"/>
      </linearGradient>
      <linearGradient id="ember-text" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${PALETTE.ember_200}"/>
        <stop offset="100%" stop-color="${PALETTE.ember_500}"/>
      </linearGradient>
      <linearGradient id="ember-fill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${PALETTE.ember_400}"/>
        <stop offset="100%" stop-color="${PALETTE.ember_600}"/>
      </linearGradient>
      <symbol id="brand" viewBox="0 0 24 24">
        <path d="M3 11 Q3 9 5 9 L19 9 Q21 9 21 11 L20 16 Q19 20 16 20 L8 20 Q5 20 4 16 Z"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M12 3 C9 7 8 9 9 12 C9.6 14 11 14.6 12 14.6 C13 14.6 14.4 14 15 12 C16 9 15 7 12 3 Z"
              fill="currentColor"/>
      </symbol>
      <symbol id="flame" viewBox="0 0 24 24">
        <path d="M12 3 C9 7 7.5 10 8 13 Q9 17 12 18 Q15 17 16 13 C16.5 10 15 7 12 3 Z" fill="currentColor"/>
      </symbol>
      <symbol id="save" viewBox="0 0 24 24">
        <path d="M7 4 L17 4 Q18 4 18 5 L18 20 L12 16 L6 20 L6 5 Q6 4 7 4 Z"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      </symbol>
      <symbol id="spark" viewBox="0 0 24 24">
        <path d="M12 3 L13.5 8.2 L18.5 9.5 L13.5 10.8 L12 16 L10.5 10.8 L5.5 9.5 L10.5 8.2 Z" fill="currentColor"/>
      </symbol>
      <symbol id="thread" viewBox="0 0 24 24">
        <path d="M8 7 Q4 7 4 11 Q4 15 8 15 L11 15"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M16 9 L13 9 Q9 9 9 13 Q9 17 13 17 L16 17"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
        <path d="M16 17 Q20 17 20 13 Q20 9 16 9"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </symbol>
      <symbol id="feather" viewBox="0 0 24 24">
        <path d="M19 5 Q14 5 10 9 Q6 13 6 18 L7.5 16.5 Q11 13 14 12 Q11 14 9 17 L11 17 Q15 17 18 14 Q21 11 21 7 Q21 5 19 5 Z"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M6 18 L4 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </symbol>
      <symbol id="shield" viewBox="0 0 24 24">
        <path d="M12 3 L20 6 L20 12 Q20 18 12 21 Q4 18 4 12 L4 6 Z"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M9 12 L11.4 14.4 L15 10.6"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </symbol>
      <symbol id="search" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M16 16 L21 21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </symbol>
      <filter id="grain">
        <feTurbulence baseFrequency="0.85" numOctaves="2"/>
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.85  0 0 0 0 0.5  0 0 0 0.04 0"/>
      </filter>
    </defs>`;
}

function bgRect(w, h) {
  return `
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.6"/>`;
}

// ────────────────────────────────────────────────────────────────────
// 1. README hero — 1600×720
// ────────────────────────────────────────────────────────────────────

function heroSvg() {
  const w = 1600, h = 720;

  // Mini sidepanel mock on the left
  const spX = 90, spY = 110, spW = 360, spH = 500;

  // A few sample notes (truncated content)
  const notes = [
    {
      site: 'developer.mozilla.org',
      time: '14:32',
      body: 'Service Worker idle timeout is 30 seconds in Manifest V3 — long-running tasks must hop through an offscreen document.',
      tags: ['Chrome MV3', 'service-worker'],
    },
    {
      site: 'arxiv.org · 2024.11',
      time: '11:08',
      body: 'Hybrid retrieval consistently outperforms pure dense retrieval when the corpus contains domain terminology.',
      tags: ['RAG', 'retrieval'],
      starred: true,
    },
    {
      site: 'obsidian.md · forum',
      time: '22:14',
      body: '"A second brain doesn\\u2019t help if it\\u2019s not actually a second. It has to be where your first brain runs into limits."',
      tags: ['知识管理'],
    },
  ];

  function renderNote(n, y) {
    return `
      <g transform="translate(0, ${y})">
        <rect x="0" y="0" width="${spW - 32}" height="92" rx="10"
              fill="rgba(38,36,30,0.88)" stroke="rgba(255,243,220,0.08)"/>
        <circle cx="14" cy="14" r="4" fill="${PALETTE.ember_600}"/>
        <text x="26" y="18" font-size="10.5" fill="${PALETTE.ink_300}" ${FONTS}>${n.site}</text>
        <text x="${spW - 50}" y="18" font-size="10" fill="${PALETTE.ink_400}" ${FONT_MONO} text-anchor="end">${n.time}</text>
        ${n.starred ? `<polygon points="${spW - 36},10 ${spW - 33},16 ${spW - 27},17 ${spW - 31},22 ${spW - 30},28 ${spW - 36},25 ${spW - 42},28 ${spW - 41},22 ${spW - 45},17 ${spW - 39},16" fill="${PALETTE.ember_400}"/>` : ''}
        ${wrapText(n.body, spW - 30, 48, 38, 12.5, PALETTE.ink_50)}
        <g transform="translate(14, 76)">
          ${n.tags.map((tag, i) => {
            const xx = i * 78;
            return `
              <rect x="${xx}" y="0" width="${tag.length * 7 + 16}" height="14" rx="7"
                    fill="rgba(255,155,45,0.14)" stroke="rgba(255,155,45,0.3)"/>
              <text x="${xx + (tag.length * 7 + 16) / 2}" y="10" text-anchor="middle"
                    font-size="9.5" fill="${PALETTE.ember_200}" ${FONTS}>${esc(tag)}</text>`;
          }).join('')}
        </g>
      </g>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  ${defs()}
  ${bgRect(w, h)}

  <!-- Decorative orbits -->
  <g opacity="0.18">
    <circle cx="${w * 0.85}" cy="${h * 0.5}" r="280" fill="none" stroke="${PALETTE.ember_400}" stroke-width="0.5"/>
    <circle cx="${w * 0.85}" cy="${h * 0.5}" r="220" fill="none" stroke="${PALETTE.ember_400}" stroke-width="0.5"/>
    <circle cx="${w * 0.85}" cy="${h * 0.5}" r="160" fill="none" stroke="${PALETTE.ember_400}" stroke-width="0.5"/>
  </g>

  <!-- Sidepanel mock card -->
  <g transform="translate(${spX}, ${spY})">
    <rect width="${spW}" height="${spH}" rx="22"
          fill="url(#card)" stroke="rgba(255,243,220,0.12)" stroke-width="1.5"/>
    <!-- titlebar -->
    <g transform="translate(20, 18)">
      <rect width="26" height="26" rx="8" fill="url(#orb)"/>
      <use href="#brand" x="3" y="3" width="20" height="20" color="rgba(20,18,15,0.85)"/>
      <text x="38" y="19" font-size="15" font-weight="700" fill="${PALETTE.ink_50}" ${FONTS}>Hearth</text>
      <text x="${spW - 40}" y="19" font-size="10.5" fill="${PALETTE.ink_400}" ${FONT_MONO} text-anchor="end">1,243 notes</text>
    </g>
    <!-- search box -->
    <g transform="translate(20, 60)">
      <rect width="${spW - 40}" height="32" rx="16" fill="rgba(38,36,30,0.7)" stroke="rgba(255,243,220,0.08)"/>
      <use href="#search" x="12" y="9" width="14" height="14" color="${PALETTE.ink_400}"/>
      <text x="32" y="20" font-size="12.5" fill="${PALETTE.ink_400}" ${FONTS}>搜索你的知识库……</text>
      <rect x="${spW - 70}" y="8" width="32" height="16" rx="4" fill="rgba(255,243,220,0.06)" stroke="rgba(255,243,220,0.08)"/>
      <text x="${spW - 54}" y="19" text-anchor="middle" font-size="9.5" fill="${PALETTE.ink_400}" ${FONT_MONO}>⌘K</text>
    </g>

    <!-- Recall hero card -->
    <g transform="translate(20, 110)">
      <rect width="${spW - 40}" height="100" rx="14"
            fill="rgba(255,155,45,0.10)" stroke="rgba(255,155,45,0.22)"/>
      <use href="#flame" x="14" y="13" width="14" height="14" color="${PALETTE.ember_400}"/>
      <text x="32" y="24" font-size="10.5" fill="${PALETTE.ember_400}" ${FONT_MONO}
            letter-spacing="0.16em">HEARTH 想起来了</text>
      ${wrapText(
        '你 3 周前读 SQLite WAL 时也碰过这个并发问题，当时你写下「fsync 才是真瓶颈」。',
        spW - 56, 14, 42, 13, PALETTE.ink_50
      )}
    </g>

    <!-- Notes list -->
    <g transform="translate(20, 230)">
      <text x="0" y="0" font-size="10" fill="${PALETTE.ink_400}" ${FONT_MONO}
            letter-spacing="0.12em">今天</text>
      ${renderNote(notes[0], 12)}
      ${renderNote(notes[1], 116)}
    </g>
    <g transform="translate(20, 460)">
      <text x="0" y="0" font-size="10" fill="${PALETTE.ink_400}" ${FONT_MONO}
            letter-spacing="0.12em">昨天</text>
      ${renderNote(notes[2], 12).replace('y="0"', 'y="0"').replace(/<g transform="translate\(0, 12\)">/, '<g transform="translate(0, 12)">')}
    </g>
  </g>

  <!-- Right side: brand + tagline + tags + orb -->
  <g transform="translate(${spX + spW + 90}, 130)">
    <!-- brand mark -->
    <g>
      <rect width="60" height="60" rx="18" fill="url(#orb)"/>
      <use href="#brand" x="11" y="11" width="38" height="38" color="rgba(20,18,15,0.85)"/>
    </g>
    <!-- big title -->
    <text x="0" y="120" font-size="84" font-weight="700" fill="${PALETTE.ink_50}" ${FONTS}
          letter-spacing="-2">Hearth</text>
    <text x="0" y="172" font-size="30" font-weight="500" fill="url(#ember-text)" ${FONTS}
          letter-spacing="-0.5">你读过的，都被静静记着。</text>
    <text x="0" y="218" font-size="18" fill="${PALETTE.ink_300}" ${FONTS}>
      Local-first knowledge companion · BYO LLM · Reverse-recall ☕
    </text>

    <!-- chips -->
    <g transform="translate(0, 260)" font-size="13" ${FONTS}>
      ${chip(0, 0, 'shield', '本地 SQLite + OPFS', PALETTE.moss_400)}
      ${chip(220, 0, 'spark', 'BYO API Key', PALETTE.moss_400)}
      ${chip(380, 0, 'feather', 'MIT Open Source', PALETTE.moss_400)}
    </g>

    <!-- features grid -->
    <g transform="translate(0, 320)">
      ${miniCard(0,   0, 'L0', '寄生候选', '后台默默落 Inbox', PALETTE.ink_400)}
      ${miniCard(170, 0, 'L1', '选中浮 bar', '一秒按一下', PALETTE.ink_400)}
      ${miniCard(340, 0, 'L2', '反向召回 ☕', '旧笔记主动找你', PALETTE.ember_400)}
      ${miniCard(0,   100, 'L3', '周回顾', '5 分钟一次', PALETTE.ink_400)}
      ${miniCard(170, 100, '🔥', 'LSH 144×', '比全扫快', PALETTE.ink_400)}
      ${miniCard(340, 100, '🛡', '出网审计', '每次都登账', PALETTE.ink_400)}
    </g>

    <!-- floating orb tooltip with arrow -->
  </g>

  <!-- Recall orb floating bottom-right (cluster) -->
  <g transform="translate(1380, 540)">
    <circle cx="0" cy="0" r="120" fill="url(#halo)"/>
    <circle cx="0" cy="0" r="56" fill="url(#orb)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>
    <use href="#flame" x="-22" y="-22" width="44" height="44" color="rgba(45,18,0,0.88)"/>
    <!-- pulse ring -->
    <circle cx="0" cy="0" r="78" fill="none" stroke="${PALETTE.ember_400}" stroke-width="1" opacity="0.3"/>
  </g>

  <!-- Bottom-left tagline -->
  <g transform="translate(${spX}, ${h - 40})" ${FONT_MONO} font-size="13">
    <text fill="${PALETTE.ink_400}" letter-spacing="2.5">
      OPEN  ·  PRIVATE  ·  YOURS  ·  github.com/telagod/hearth-ext
    </text>
  </g>
</svg>`;
}

function chip(x, y, iconId, label, iconColor) {
  const w = label.length * 9 + 50;
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="${w}" height="28" rx="14"
            fill="rgba(28,26,22,0.7)" stroke="rgba(255,243,220,0.14)"/>
      <use href="#${iconId}" x="9" y="6" width="14" height="14" color="${iconColor}"/>
      <text x="29" y="19" fill="${PALETTE.ink_200}" ${FONTS} font-size="12.5">${esc(label)}</text>
    </g>`;
}

function miniCard(x, y, badge, title, sub, badgeColor) {
  return `
    <g transform="translate(${x}, ${y})">
      <rect width="155" height="84" rx="12"
            fill="rgba(28,26,22,0.7)" stroke="rgba(255,243,220,0.10)"/>
      <text x="14" y="22" font-size="11" font-weight="600" fill="${badgeColor}" ${FONT_MONO}
            letter-spacing="0.08em">${esc(badge)}</text>
      <text x="14" y="46" font-size="14" font-weight="700" fill="${PALETTE.ink_50}" ${FONTS}>${esc(title)}</text>
      <text x="14" y="66" font-size="11.5" fill="${PALETTE.ink_300}" ${FONTS}>${esc(sub)}</text>
    </g>`;
}

// ────────────────────────────────────────────────────────────────────
// 2. Triptych — feature spotlights (800×500 each)
// ────────────────────────────────────────────────────────────────────

function featRecallSvg() {
  const w = 800, h = 500;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  ${defs()}
  ${bgRect(w, h)}

  <!-- fake browser frame -->
  <g transform="translate(60, 60)">
    <rect width="680" height="60" rx="14" fill="rgba(20,18,15,0.85)" stroke="rgba(255,243,220,0.10)"/>
    <circle cx="20" cy="30" r="6" fill="#e57373"/>
    <circle cx="40" cy="30" r="6" fill="#fbbf24"/>
    <circle cx="60" cy="30" r="6" fill="#6ee7b7"/>
    <rect x="84" y="18" width="540" height="24" rx="12" fill="rgba(38,36,30,0.7)"/>
    <text x="100" y="34" font-size="11.5" fill="${PALETTE.ink_400}" ${FONT_MONO}>developer.mozilla.org/.../File_System_Access_API</text>
    <rect x="640" y="20" width="22" height="22" rx="7" fill="url(#orb)"/>
  </g>

  <!-- article body (faded) -->
  <g transform="translate(80, 150)" font-size="14" fill="${PALETTE.ink_300}" ${FONTS}>
    <text y="0">The Origin Private File System (OPFS) is a storage endpoint</text>
    <text y="22">that is private to the origin and not exposed via the user-visible</text>
    <text y="44">file system. It is optimized for performance and provides synchronous</text>
    <text y="66">file access from within dedicated Web Workers.</text>
  </g>

  <!-- recall orb cluster, bottom right -->
  <g transform="translate(685, 415)">
    <circle cx="0" cy="0" r="60" fill="url(#halo)"/>
    <circle cx="0" cy="0" r="28" fill="url(#orb)" stroke="rgba(255,255,255,0.25)"/>
    <use href="#flame" x="-12" y="-12" width="24" height="24" color="rgba(45,18,0,0.88)"/>
  </g>

  <!-- tooltip -->
  <g transform="translate(380, 280)">
    <rect width="280" height="138" rx="14"
          fill="rgba(20,18,15,0.95)" stroke="rgba(255,243,220,0.12)"/>
    <use href="#flame" x="14" y="14" width="13" height="13" color="${PALETTE.ember_400}"/>
    <text x="32" y="25" font-size="10.5" fill="${PALETTE.ember_400}" ${FONT_MONO}
          letter-spacing="0.14em">HEARTH 想起来了</text>
    ${wrapText(
      '你 3 周前读 SQLite WAL 时也想过这个，当时你写下「OPFS 是新派 SQLite 的家」。',
      256, 14, 50, 13.5, PALETTE.ink_50
    )}
    <g transform="translate(14, 100)">
      <rect width="115" height="26" rx="6" fill="rgba(255,255,255,0.05)" stroke="rgba(255,243,220,0.10)"/>
      <text x="57" y="17" text-anchor="middle" font-size="11.5" fill="${PALETTE.ink_200}" ${FONTS}>稍后</text>
      <rect x="125" y="0" width="125" height="26" rx="6" fill="url(#ember-fill)"/>
      <text x="187" y="17" text-anchor="middle" font-size="11.5" fill="#fff" ${FONTS} font-weight="600">去看那段 →</text>
    </g>
  </g>

  <!-- caption -->
  <text x="60" y="${h - 30}" font-size="13" fill="${PALETTE.ink_400}" ${FONT_MONO}
        letter-spacing="0.2em">L2  ·  REVERSE  RECALL</text>
</svg>`;
}

function featFloatBarSvg() {
  const w = 800, h = 500;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  ${defs()}
  ${bgRect(w, h)}

  <!-- article body with selection highlight -->
  <g transform="translate(80, 100)">
    <text font-size="22" font-weight="700" fill="${PALETTE.ink_50}" ${FONTS}>The File System Access API</text>
    <g transform="translate(0, 50)" font-size="14.5" fill="${PALETTE.ink_300}" ${FONTS}>
      <text y="0">The File System Access API provides web applications a means of</text>
      <text y="24">interacting with files on the user's local device.</text>

      <rect x="0" y="50" width="640" height="58" rx="3" fill="rgba(255,200,140,0.20)"/>
      <text y="74" fill="${PALETTE.ink_50}">The Origin Private File System (OPFS) is a storage endpoint that</text>
      <text y="98" fill="${PALETTE.ink_50}">is private to the origin and not exposed via the user-visible file system.</text>
    </g>
  </g>

  <!-- float bar above selection -->
  <g transform="translate(290, 195)">
    <rect width="184" height="48" rx="14"
          fill="rgba(20,18,15,0.92)" stroke="rgba(255,243,220,0.12)" stroke-width="1"/>
    <!-- save button (primary) -->
    <rect x="6" y="6" width="36" height="36" rx="10" fill="url(#ember-fill)"/>
    <use href="#save" x="14" y="14" width="20" height="20" color="#fff"/>
    <!-- ask -->
    <use href="#spark" x="56" y="14" width="20" height="20" color="${PALETTE.ink_50}"/>
    <!-- thread -->
    <use href="#thread" x="98" y="14" width="20" height="20" color="${PALETTE.ink_50}"/>
    <!-- feather -->
    <use href="#feather" x="140" y="14" width="20" height="20" color="${PALETTE.ink_50}"/>
    <!-- arrow tip down -->
    <path d="M 92 48 L 100 56 L 108 48 Z" fill="rgba(20,18,15,0.92)" stroke="rgba(255,243,220,0.12)" stroke-width="1"/>
  </g>

  <!-- toast bottom right -->
  <g transform="translate(${w - 220}, ${h - 90})">
    <rect width="170" height="40" rx="20"
          fill="rgba(20,18,15,0.92)" stroke="rgba(255,243,220,0.10)"/>
    <use href="#brand" x="14" y="11" width="18" height="18" color="${PALETTE.ember_400}"/>
    <text x="38" y="25" font-size="13" fill="${PALETTE.ink_50}" ${FONTS}>Saved to Hearth</text>
  </g>

  <text x="60" y="${h - 30}" font-size="13" fill="${PALETTE.ink_400}" ${FONT_MONO}
        letter-spacing="0.2em">L1  ·  HIGHLIGHT  ·  ONE  TAP</text>
</svg>`;
}

function featChatSvg() {
  const w = 800, h = 500;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  ${defs()}
  ${bgRect(w, h)}

  <!-- chat window -->
  <g transform="translate(60, 60)">
    <rect width="680" height="380" rx="22"
          fill="url(#card)" stroke="rgba(255,243,220,0.12)"/>
    <!-- chat head -->
    <g transform="translate(20, 16)">
      <text font-size="14" font-weight="700" fill="${PALETTE.ink_50}" ${FONTS}>围炉对话</text>
      <rect x="78" y="-12" width="100" height="20" rx="10"
            fill="rgba(95,138,100,0.14)" stroke="rgba(95,138,100,0.30)"/>
      <text x="128" y="2" text-anchor="middle" font-size="10.5" fill="${PALETTE.moss_400}" ${FONT_MONO}>3 笔记上下文</text>
      <text x="640" y="0" text-anchor="end" font-size="10.5" fill="${PALETTE.ink_400}" ${FONT_MONO}>claude-sonnet-4-6</text>
    </g>
    <line x1="20" y1="44" x2="660" y2="44" stroke="rgba(255,243,220,0.10)"/>

    <!-- user msg -->
    <g transform="translate(20, 70)">
      <rect width="26" height="26" rx="8" fill="rgba(48,46,38,0.8)"/>
      <text x="13" y="18" text-anchor="middle" font-size="11" fill="${PALETTE.ink_200}" ${FONTS}>你</text>
      <g transform="translate(38, 0)">
        <rect width="320" height="40" rx="12" fill="rgba(48,46,38,0.7)" stroke="rgba(255,243,220,0.08)"/>
        <text x="14" y="25" font-size="13.5" fill="${PALETTE.ink_50}" ${FONTS}>把上周关于 RAG 的笔记串一下。</text>
      </g>
    </g>

    <!-- assistant msg -->
    <g transform="translate(20, 130)">
      <rect width="26" height="26" rx="8" fill="url(#orb)"/>
      <use href="#brand" x="3" y="3" width="20" height="20" color="rgba(20,18,15,0.85)"/>
      <g transform="translate(38, 0)">
        <rect width="600" height="160" rx="12"
              fill="rgba(255,155,45,0.06)" stroke="rgba(255,155,45,0.18)"/>
        ${wrapText(
          '三段是同一条主线：你都在追"语义召回不可独立工作"。arxiv 那篇说在专业语料上 hybrid 稳赢 dense；',
          580, 14, 26, 13.5, PALETTE.ink_50
        )}
        ${wrapText(
          '你自己 22 号写的批注「FTS5 是底子，向量是补丁」——三者方向一致。',
          580, 14, 78, 13.5, PALETTE.ink_50
        )}
        <!-- citation block -->
        <rect x="14" y="118" width="572" height="32" rx="6" fill="rgba(0,0,0,0.20)"/>
        <text x="24" y="138" font-size="11" fill="${PALETTE.ink_400}" ${FONTS}>引用 ·
          <tspan fill="${PALETTE.ember_200}">WAL fsync 行为</tspan> ·
          <tspan fill="${PALETTE.ember_200}">Hybrid Retrieval</tspan> ·
          <tspan fill="${PALETTE.ember_200}">FTS5 vs vectors</tspan>
        </text>
      </g>
    </g>

    <!-- input bar -->
    <g transform="translate(20, 320)">
      <rect width="640" height="40" rx="12" fill="rgba(48,46,38,0.6)" stroke="rgba(255,243,220,0.08)"/>
      <text x="14" y="25" font-size="13" fill="${PALETTE.ink_400}" ${FONTS}>那 SimHash 阈值我该设多少？</text>
      <rect x="596" y="4" width="32" height="32" rx="10" fill="url(#ember-fill)"/>
      <path d="M 605 19 L 619 19 M 615 13 L 619 19 L 615 25"
            stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
  </g>

  <text x="60" y="${h - 30}" font-size="13" fill="${PALETTE.ink_400}" ${FONT_MONO}
        letter-spacing="0.2em">CHAT  ·  STREAMING  ·  CITATIONS</text>
</svg>`;
}

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Crude word-wrap into multiple <text> tspans. Returns SVG markup.
 */
function wrapText(text, maxWidth, x, y, fontSize, color) {
  const charW = fontSize * 0.55;     // rough proportional width estimate
  const maxChars = Math.floor(maxWidth / charW);
  const lineHeight = fontSize * 1.5;
  const lines = [];
  let cur = '';
  // Mix of ASCII words and CJK chars; treat CJK as single "words".
  const tokens = text.match(/[A-Za-z0-9'"!?,.\-:;()“”「」]+|[一-鿿]|\s+/g) ?? [];
  for (const tok of tokens) {
    const tentative = cur + tok;
    // accept whitespace freely; for others, check length
    if (tentative.length > maxChars && cur.trim()) {
      lines.push(cur.trimEnd());
      cur = /^\s/.test(tok) ? '' : tok;
    } else {
      cur = tentative;
    }
  }
  if (cur.trim()) lines.push(cur);
  return lines.map((ln, i) =>
    `<text x="${x}" y="${y + i * lineHeight}" font-size="${fontSize}" fill="${color}" ${FONTS}>${esc(ln)}</text>`
  ).join('');
}

// ────────────────────────────────────────────────────────────────────
// Render
// ────────────────────────────────────────────────────────────────────

function render(name, w, h, svgFn) {
  const svg = svgFn();
  writeFileSync(resolve(OUT, `${name}.svg`), svg, 'utf-8');
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: w } });
  const raw = r.render().asPng();
  // resvg outputs uncompressed PNGs; sharp re-encodes with palette + zlib9
  // for ~3-4× smaller files at zero visual loss.
  return sharp(raw)
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer()
    .then((buf) => {
      writeFileSync(resolve(OUT, `${name}.png`), buf);
      const ratio = ((1 - buf.length / raw.length) * 100).toFixed(0);
      console.log(`wrote promo/${name}.png  ${(buf.length / 1024).toFixed(1)} KB  ${w}×${h}  (-${ratio}%)`);
    });
}

await render('readme-hero',  1600, 720, heroSvg);
await render('feat-recall',   800, 500, featRecallSvg);
await render('feat-floatbar', 800, 500, featFloatBarSvg);
await render('feat-chat',     800, 500, featChatSvg);

console.log(`\n✓ assets in ${OUT}`);
