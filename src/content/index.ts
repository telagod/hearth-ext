/**
 * Content script — Float bar (L1) + Recall orb (L2 stub for M1).
 * Lives on every page (with deny-list); injects a Shadow DOM root to avoid CSS bleed.
 */

import './index.css';
import { envelope, type Message } from '../shared/messages';
import { iconSvg } from '../shared/icons';
import { startCandidateProbe } from './probe';
import { onSpaNav } from './spa';

const ROOT_ID = '__hearth_root__';

declare global {
  interface Window {
    __hearth__?: { mounted: boolean };
  }
}

if (window.__hearth__?.mounted) {
  // already injected (e.g. SPA route changes that re-fire) — no-op
} else {
  window.__hearth__ = { mounted: true };
  mount();
}

interface BarState {
  rect: DOMRect | null;
  text: string;
  visible: boolean;
}

interface RecallCard {
  note_id: number;
  title: string;
  excerpt: string;
  site_name?: string | null;
  created_at: number;
  user_annotation?: string;
  score: number;
}

function mount() {
  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;';
  document.documentElement.appendChild(host);

  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SHADOW_CSS;
  root.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'hearth-bar';
  bar.setAttribute('role', 'toolbar');
  bar.innerHTML = `
    <button data-act="save" title="Save (⌘⇧S)" aria-label="Save">${iconSvg('save', 18)}</button>
    <button data-act="ask"  title="Ask"        aria-label="Ask">${iconSvg('spark', 18)}</button>
    <button data-act="link" title="Find related" aria-label="Find related">${iconSvg('thread', 18)}</button>
    <button data-act="note" title="Annotate"   aria-label="Annotate">${iconSvg('feather', 18)}</button>
  `;
  root.appendChild(bar);

  const toast = document.createElement('div');
  toast.className = 'hearth-toast';
  root.appendChild(toast);

  const orbZone = document.createElement('div');
  orbZone.className = 'hearth-orb-zone';
  orbZone.innerHTML = `
    <div class="hearth-orb-tooltip" role="dialog" aria-label="Hearth recall">
      <div class="lt-head">
        <span class="lt-icon">${iconSvg('flame', 14)}</span>
        <span class="lt-title">Hearth 想起来了</span>
        <button class="lt-close" title="Close" aria-label="Close">${iconSvg('cross', 12)}</button>
      </div>
      <div class="lt-narrative"></div>
      <div class="lt-cards"></div>
      <div class="lt-cta">
        <button class="lt-snooze">稍后</button>
        <button class="lt-open primary">${iconSvg('thread', 12)} 去看那段</button>
      </div>
    </div>
    <button class="hearth-orb" title="Hearth recall" aria-label="Hearth recall — click to view related notes">${iconSvg('flame', 26)}</button>
  `;
  root.appendChild(orbZone);

  const state: BarState = { rect: null, text: '', visible: false };
  let hideTimer: number | undefined;
  let lastRecallAt = 0;

  document.addEventListener('selectionchange', () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => updateBar(state, bar), 220);
  });

  document.addEventListener('mousedown', (ev) => {
    if (!state.visible) return;
    const path = ev.composedPath();
    if (path.includes(host)) return; // click inside bar — keep
    hideBar(state, bar);
  }, true);

  bar.addEventListener('click', async (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    await onAct(btn.dataset.act ?? '', state, toast);
  });

  // Listen for SW messages.
  chrome.runtime.onMessage.addListener((env: { payload?: Message } | undefined) => {
    const msg = env?.payload;
    if (!msg) return;
    if (msg.type === 'capture.highlight' && msg.text === '__GET_SELECTION__') {
      const sel = window.getSelection()?.toString().trim();
      if (sel) void doCapture(sel, toast);
    }
  });

  // L2 recall — fire once per page after idle settle.
  const triggerRecall = () => {
    if (Date.now() - lastRecallAt < 8_000) return;
    lastRecallAt = Date.now();
    void runRecall(orbZone);
  };

  // Initial probe after the page calms down.
  window.setTimeout(triggerRecall, 1800);

  // Re-probe on any SPA navigation (covers pushState / replaceState / hashchange / popstate).
  onSpaNav(() => {
    hideOrb(orbZone);
    lastRecallAt = 0;
    window.setTimeout(triggerRecall, 1500);
  });

  // L0 candidate probes — opt-in based on user settings.
  chrome.storage.local.get(['hearth/settings'], (r) => {
    const s = r['hearth/settings'] ?? {};
    if (s.recall_enabled === false) hideOrb(orbZone);
    startCandidateProbe({
      clipboard: !!s.clipboard_listen,
      deepRead: s.deep_read !== false,    // default on
      tabClose: s.tab_close !== false,    // default on
    });
  });
}

function hookHistory(_cb: () => void) {
  // Legacy; replaced by onSpaNav from ./spa
  void _cb;
}

function updateBar(state: BarState, bar: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideBar(state, bar);
    return;
  }
  const text = sel.toString().trim();
  if (text.length < 3 || text.length > 4000) {
    hideBar(state, bar);
    return;
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) {
    hideBar(state, bar);
    return;
  }
  state.rect = rect;
  state.text = text;
  showBar(state, bar);
}

function showBar(state: BarState, bar: HTMLElement) {
  if (!state.rect) return;
  const top = state.rect.top - 50;
  const left = state.rect.left + state.rect.width / 2;
  bar.style.top = `${Math.max(8, top)}px`;
  bar.style.left = `${Math.max(8, left)}px`;
  bar.style.transform = 'translate(-50%, 0)';
  bar.classList.add('visible');
  state.visible = true;
}

function hideBar(state: BarState, bar: HTMLElement) {
  bar.classList.remove('visible');
  state.visible = false;
}

async function onAct(act: string, state: BarState, toast: HTMLElement) {
  const text = state.text;
  if (!text) return;
  if (act === 'save') {
    await doCapture(text, toast);
  } else if (act === 'ask') {
    await chrome.runtime.sendMessage(envelope('content', {
      type: 'capture.inbox',
      kind: 'clip',
      payload: { text, url: location.href, title: document.title, intent: 'ask' },
    } satisfies Message));
    flash(toast, 'Sent to chat');
  } else if (act === 'link') {
    flash(toast, 'Recall coming in M2');
  } else if (act === 'note') {
    flash(toast, 'Annotate flow coming next');
  }
}

async function doCapture(text: string, toast: HTMLElement) {
  const ctx = capturePageCtx();
  const reply = await chrome.runtime.sendMessage(envelope('content', {
    type: 'capture.highlight',
    text,
    ctx,
  } satisfies Message));
  if (reply?.ok) {
    flash(toast, 'Saved to Hearth');
  } else {
    flash(toast, `× ${reply?.error ?? 'failed'}`, true);
  }
}

function capturePageCtx() {
  const sel = window.getSelection();
  let before = '';
  let after = '';
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const startEl = range.startContainer.parentElement;
    const endEl = range.endContainer.parentElement;
    const beforeText = startEl?.textContent ?? '';
    const afterText = endEl?.textContent ?? '';
    before = beforeText.slice(Math.max(0, range.startOffset - 200), range.startOffset);
    after = afterText.slice(range.endOffset, range.endOffset + 200);
  }
  return {
    url: location.href,
    title: document.title,
    site_name: location.hostname,
    favicon: pickFavicon(),
    context_before: before || undefined,
    context_after: after || undefined,
  };
}

function pickFavicon(): string | undefined {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"], link[rel~="icon"], link[rel="shortcut icon"]',
  );
  if (link?.href) return link.href;
  return `${location.origin}/favicon.ico`;
}

function flash(el: HTMLElement, text: string, error = false) {
  el.textContent = text;
  el.classList.toggle('error', error);
  el.classList.add('visible');
  window.clearTimeout((el as HTMLElement & { __t?: number }).__t);
  (el as HTMLElement & { __t?: number }).__t = window.setTimeout(() => {
    el.classList.remove('visible');
  }, 1800);
}

// ============================================================
// L2 Recall — orb + tooltip
// ============================================================

async function runRecall(zone: HTMLElement) {
  if (location.protocol === 'about:' || location.hostname === '') return;
  // Don't probe trivial pages.
  const pageText = extractMainText();
  if (pageText.length < 200) return;

  const snippet = pageText.slice(0, 1200);
  try {
    const reply = await chrome.runtime.sendMessage(envelope('content', {
      type: 'recall.narrate',
      title: document.title || location.hostname,
      snippet,
      url: location.href,
    } satisfies Message));
    if (!reply?.ok) return;
    const result = reply.result as { cards: RecallCard[]; narrative: string };
    if (!result?.cards?.length) return;
    renderOrb(zone, result.cards, result.narrative);
  } catch (e) {
    console.warn('[hearth/recall] probe failed', e);
  }
}

function extractMainText(): string {
  // Heuristic: prefer <article>, fall back to <main>, then body.
  const el = (document.querySelector('article') as HTMLElement | null)
    ?? (document.querySelector('main') as HTMLElement | null)
    ?? document.body;
  if (!el) return '';
  // Walk visible text nodes; strip script/style.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT','STYLE','NOSCRIPT','SVG'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      const t = (node.nodeValue ?? '').trim();
      if (!t) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out: string[] = [];
  let n: Node | null;
  let len = 0;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue ?? '').trim();
    if (!t) continue;
    out.push(t);
    len += t.length;
    if (len > 4000) break;
  }
  return out.join(' ');
}

function renderOrb(zone: HTMLElement, cards: RecallCard[], narrative: string) {
  zone.classList.add('visible');

  const tooltip = zone.querySelector('.hearth-orb-tooltip') as HTMLElement | null;
  const orb = zone.querySelector('.hearth-orb') as HTMLElement | null;
  if (!tooltip || !orb) return;

  const narrEl = tooltip.querySelector('.lt-narrative') as HTMLElement;
  narrEl.textContent = narrative || `你库内有 ${cards.length} 段相关旧笔记。`;

  const cardsEl = tooltip.querySelector('.lt-cards') as HTMLElement;
  cardsEl.innerHTML = cards.slice(0, 3).map((c) => `
    <button class="lt-card" data-id="${c.note_id}">
      ${iconSvg('thread', 12)}
      <span class="lt-card-title">${escapeHtml(c.title)}</span>
      <span class="lt-card-meta">${relTime(c.created_at)}</span>
    </button>
  `).join('');

  // Wire interactions
  orb.onclick = () => tooltip.classList.toggle('open');
  orb.onmouseenter = () => tooltip.classList.add('open');
  tooltip.querySelectorAll<HTMLButtonElement>('.lt-card').forEach((btn) => {
    btn.onclick = () => {
      const noteId = btn.dataset.id;
      if (noteId) chrome.runtime.sendMessage(envelope('content', {
        type: 'ui.notify',
        title: 'Note opened',
        body: `note #${noteId}`,
      } satisfies Message));
      // M3: open sidepanel deep link
    };
  });
  (tooltip.querySelector('.lt-close') as HTMLButtonElement | null)?.addEventListener('click', () => {
    tooltip.classList.remove('open');
  });
  (tooltip.querySelector('.lt-snooze') as HTMLButtonElement | null)?.addEventListener('click', () => {
    tooltip.classList.remove('open');
  });
  (tooltip.querySelector('.lt-open') as HTMLButtonElement | null)?.addEventListener('click', () => {
    // Open sidepanel — content cannot open sidePanel directly; ask SW.
    chrome.runtime.sendMessage(envelope('content', {
      type: 'ui.notify',
      title: 'Open Hearth',
      body: 'Click toolbar icon to open the side panel.',
    } satisfies Message));
    tooltip.classList.remove('open');
  });
}

function hideOrb(zone: HTMLElement) {
  zone.classList.remove('visible');
  (zone.querySelector('.hearth-orb-tooltip') as HTMLElement | null)?.classList.remove('open');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;');
}

function relTime(ts: number): string {
  const days = Math.max(1, Math.round(Date.now() / 1000 / 86400 - ts / 86400));
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

const SHADOW_CSS = `
:host { all: initial; }
.hearth-bar {
  position: fixed;
  display: flex; gap: 4px;
  padding: 6px;
  border-radius: 14px;
  background: rgba(20, 18, 15, 0.86);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 10px 38px rgba(0,0,0,0.55);
  opacity: 0; transform-origin: bottom center;
  transform: translate(-50%, 0) scale(0.9);
  pointer-events: none;
  transition: opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
  font-family: -apple-system, system-ui, sans-serif;
}
.hearth-bar.visible {
  opacity: 1; pointer-events: auto;
  transform: translate(-50%, 0) scale(1);
}
.hearth-bar button {
  appearance: none; border: 0;
  width: 36px; height: 36px;
  border-radius: 10px;
  background: transparent; color: #f7f7f5;
  cursor: pointer;
  display: grid; place-items: center;
  transition: background 120ms, transform 120ms;
}
.hearth-bar button svg { width: 18px; height: 18px; }
.hearth-bar button:hover { background: rgba(255,255,255,0.12); }
.hearth-bar button:active { transform: scale(0.94); }
.hearth-bar button[data-act="save"] {
  background: linear-gradient(180deg, #ff9b2d, #e85d0a);
  color: #ffffff;
  box-shadow: 0 0 14px rgba(248,123,21,0.45);
}
.hearth-bar button[data-act="save"]:hover { filter: brightness(1.06); }

.hearth-toast {
  position: fixed;
  bottom: 24px; right: 96px;
  padding: 9px 16px;
  border-radius: 999px;
  background: rgba(20,18,15,0.92);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  color: #faf8f3;
  font-size: 13px;
  font-family: -apple-system, system-ui, sans-serif;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  opacity: 0; transform: translateY(8px);
  pointer-events: none;
  transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.hearth-toast.visible { opacity: 1; transform: translateY(0); }
.hearth-toast.error { background: rgba(140,40,40,0.92); }

/* ----- Orb ----- */
.hearth-orb-zone {
  position: fixed;
  right: 18px; bottom: 18px;
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 8px;
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 280ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  font-family: -apple-system, system-ui, sans-serif;
}
.hearth-orb-zone.visible {
  opacity: 1; transform: translateY(0); pointer-events: auto;
}
.hearth-orb {
  appearance: none; border: 1px solid rgba(255,255,255,0.22);
  width: 52px; height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%,
    rgba(255,220,170,0.98), rgba(248,123,21,0.92) 55%, rgba(192,66,12,0.95));
  box-shadow: 0 0 28px rgba(248,123,21,0.55),
              inset 0 0 18px rgba(255,255,255,0.20);
  cursor: pointer;
  color: rgba(45,18,0,0.85);
  display: grid; place-items: center;
  animation: hearth-orb-breath 3.5s ease-in-out infinite;
  transition: transform 200ms;
}
.hearth-orb svg { width: 26px; height: 26px; }
.hearth-orb:hover { transform: scale(1.06); }
@keyframes hearth-orb-breath {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.045); }
}

.hearth-orb-tooltip {
  position: absolute;
  bottom: 64px; right: 0;
  width: 320px;
  padding: 14px 16px 12px;
  border-radius: 14px;
  background: rgba(20,18,15,0.94);
  backdrop-filter: blur(22px) saturate(1.6);
  -webkit-backdrop-filter: blur(22px) saturate(1.6);
  border: 1px solid rgba(255,243,220,0.10);
  box-shadow: 0 14px 44px rgba(0,0,0,0.6);
  color: #ebe9e0;
  opacity: 0; transform: translateY(6px) scale(0.96);
  pointer-events: none;
  transition: opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.hearth-orb-tooltip.open {
  opacity: 1; transform: translateY(0) scale(1); pointer-events: auto;
}
.lt-head {
  display: flex; align-items: center; gap: 6px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #ff9b2d;
  margin-bottom: 8px;
}
.lt-icon { display: inline-grid; place-items: center; }
.lt-title { flex: 1; }
.lt-close {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  color: rgba(184,180,164,0.7);
  width: 20px; height: 20px; border-radius: 6px;
  display: grid; place-items: center;
}
.lt-close:hover { background: rgba(255,255,255,0.08); color: #fff; }

.lt-narrative {
  font-size: 13.5px; line-height: 1.6;
  color: #ebe9e0;
  margin-bottom: 10px;
}
.lt-narrative em { color: #ffd89a; font-style: normal; }

.lt-cards { display: grid; gap: 4px; margin-bottom: 10px; }
.lt-card {
  appearance: none; border: 1px solid transparent;
  background: rgba(0,0,0,0.22);
  color: #ebe9e0;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 9px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: background 140ms, border-color 140ms;
}
.lt-card:hover { background: rgba(0,0,0,0.32); border-color: rgba(255,255,255,0.08); }
.lt-card svg { color: #ff9b2d; flex-shrink: 0; }
.lt-card-title {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #ebe9e0; font-weight: 500;
}
.lt-card-meta {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  color: rgba(184,180,164,0.7);
  flex-shrink: 0;
}

.lt-cta { display: flex; gap: 6px; }
.lt-cta button {
  appearance: none; border: 1px solid rgba(255,243,220,0.10);
  background: rgba(255,255,255,0.05);
  color: #ebe9e0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  transition: background 120ms;
}
.lt-cta button:hover { background: rgba(255,255,255,0.10); }
.lt-cta button.primary {
  background: linear-gradient(180deg, #ff9b2d, #e85d0a);
  border-color: transparent; color: #fff;
}
.lt-cta button.primary:hover { filter: brightness(1.06); }

@media (prefers-reduced-motion: reduce) {
  .hearth-bar, .hearth-toast, .hearth-orb-zone, .hearth-orb-tooltip { transition: none; }
  .hearth-orb { animation: none; }
}
`;
