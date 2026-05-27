/**
 * L0 candidate signal probe — runs inside the content script.
 *
 * Signals (all opt-in or non-invasive):
 *   - copy:        user does `Ctrl+C`, we capture selection (requires settings.clipboard_listen)
 *   - deep-read:   user stays > 60s AND scrolls > 50% AND selects at least once
 *   - tab-close:   beforeunload fires after the tab held > 25min
 *
 * Output: dispatches capture.inbox messages.
 * Privacy: deduped per-URL within session; deny-listed pages skip everything.
 */

import { envelope, type Message } from '@shared/messages';
import { onSpaNav } from './spa';

const DENY_HOSTS = [
  /\.bank\./i,
  /\.alipay\.com$/i,
  /mail\.google\.com$/i,
  /accounts\.google\.com$/i,
  /^(?:.+\.)?notion\.so$/i,   // private notion docs by default; user can disable later
];

export interface ProbeOptions {
  clipboard: boolean;
  deepRead: boolean;
  tabClose: boolean;
}

export function startCandidateProbe(opts: ProbeOptions): () => void {
  if (DENY_HOSTS.some((rx) => rx.test(location.hostname))) {
    return () => {};
  }

  const cleanup: Array<() => void> = [];

  if (opts.clipboard) cleanup.push(installClipboardProbe());
  if (opts.deepRead) cleanup.push(installDeepReadProbe());
  if (opts.tabClose) cleanup.push(installTabCloseProbe());

  return () => cleanup.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

// ────────────────────────────────────────────────────────────────────

function installClipboardProbe(): () => void {
  const seen = new Set<string>();
  const onCopy = () => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel || sel.length < 12 || sel.length > 4000) return;
    const key = `${location.host}::${sel.slice(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);
    void emit('clip', {
      text: sel,
      url: location.href,
      title: document.title,
    });
  };
  document.addEventListener('copy', onCopy, true);
  return () => document.removeEventListener('copy', onCopy, true);
}

// ────────────────────────────────────────────────────────────────────

function installDeepReadProbe(): () => void {
  const state = {
    start: Date.now(),
    maxScroll: 0,
    selections: 0,
    fired: false,
    lastUrl: location.href,
  };
  let timer: number | undefined;

  const onScroll = () => {
    const h = document.documentElement;
    const total = h.scrollHeight - h.clientHeight;
    if (total > 0) {
      const ratio = Math.min(1, (h.scrollTop + h.clientHeight) / h.scrollHeight);
      if (ratio > state.maxScroll) state.maxScroll = ratio;
    }
  };
  const onSel = () => {
    const s = window.getSelection();
    if (s && !s.isCollapsed && s.toString().trim().length > 4) state.selections += 1;
  };
  const check = () => {
    if (state.fired) return;
    const dwell = (Date.now() - state.start) / 1000;
    if (dwell > 60 && state.maxScroll > 0.5 && state.selections >= 1) {
      state.fired = true;
      const snippet = extractSummary().slice(0, 1200);
      void emit('read', {
        url: location.href,
        title: document.title,
        site: location.hostname,
        text: snippet,
        dwell_sec: Math.round(dwell),
        scroll_pct: Math.round(state.maxScroll * 100),
      });
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSel);
  timer = window.setInterval(check, 8000);

  // Reset on SPA navigation: each route is a fresh page from a UX perspective.
  const offSpa = onSpaNav((href) => {
    if (href === state.lastUrl) return;
    state.lastUrl = href;
    state.start = Date.now();
    state.maxScroll = 0;
    state.selections = 0;
    state.fired = false;
  });

  return () => {
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('selectionchange', onSel);
    if (timer) window.clearInterval(timer);
    offSpa();
  };
}

function extractSummary(): string {
  const el = (document.querySelector('article') as HTMLElement | null)
    ?? (document.querySelector('main') as HTMLElement | null)
    ?? document.body;
  if (!el) return '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const buf: string[] = [];
  let n: Node | null;
  let len = 0;
  while ((n = walker.nextNode())) {
    const t = (n.nodeValue ?? '').trim();
    if (!t) continue;
    const p = n.parentElement;
    if (!p || ['SCRIPT','STYLE','NOSCRIPT','SVG'].includes(p.tagName)) continue;
    buf.push(t);
    len += t.length;
    if (len > 2000) break;
  }
  return buf.join(' ');
}

// ────────────────────────────────────────────────────────────────────

function installTabCloseProbe(): () => void {
  // No-op in M4.5+: the SW now owns tab-close via chrome.tabs.onRemoved (more
  // reliable than beforeunload, which is often skipped on fast tab close).
  return () => {};
}

// ────────────────────────────────────────────────────────────────────

async function emit(kind: 'clip' | 'read' | 'image' | 'tab_close', payload: Record<string, unknown>) {
  try {
    await chrome.runtime.sendMessage(envelope('content', {
      type: 'capture.inbox',
      kind,
      payload,
    } satisfies Message));
  } catch (e) {
    console.warn('[hearth/probe] emit failed', kind, e);
  }
}
