/**
 * Service Worker entry — boots offscreen, wires alarms / context menus,
 * forwards content / sidepanel messages to offscreen and LLM gateway.
 */

import { envelope, Message, type MessageEnvelope } from '@shared/messages';
import { ensureOffscreen, sendToOffscreen } from './offscreenBridge';
import { llmComplete } from './llmGateway';
import { narrate } from '@llm/warmth';
import { getSettings, setSettings, toLLMConfig } from '@shared/settings';
import type { RecallCard } from '@shared/types';
import { loadBuiltinSkills, onAlarmFired, onEventFired, runSkillByName } from './scheduler';

const SW_VERSION = '0.0.3';

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[hearth/sw] installed', details.reason, SW_VERSION);
  await ensureOffscreen();
  await registerContextMenus();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // Boot skills after a short delay so offscreen DB is definitely ready.
  setTimeout(() => { void loadBuiltinSkills(); }, 1500);
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreen();
  setTimeout(() => { void loadBuiltinSkills(); }, 1500);
});

async function registerContextMenus(): Promise<void> {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'hearth-capture',
      title: 'Save selection to Hearth',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'hearth-open',
      title: 'Open Hearth panel',
      contexts: ['action'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'hearth-capture' && info.selectionText) {
    await captureFromTab(tab, info.selectionText);
  }
  if (info.menuItemId === 'hearth-open') {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'capture-selection' && tab?.id) {
    // ask content script for current selection
    try {
      const sel = await chrome.tabs.sendMessage(tab.id, envelope('background', {
        type: 'capture.highlight',
        text: '__GET_SELECTION__',
        ctx: { url: tab.url ?? '', title: tab.title ?? '' },
      } satisfies Message));
      console.log('[hearth/sw] cmd capture result', sel);
    } catch (e) {
      console.warn('[hearth/sw] no content listener', e);
    }
  }
});

async function captureFromTab(tab: chrome.tabs.Tab, text: string) {
  await ensureOffscreen();
  return sendToOffscreen({
    type: 'capture.highlight',
    text,
    ctx: {
      url: tab.url ?? '',
      title: tab.title ?? '',
      site_name: tab.url ? new URL(tab.url).hostname : undefined,
      favicon: tab.favIconUrl,
    },
  });
}

async function registerAlarms(): Promise<void> {
  // Keep-alive ping for offscreen-related housekeeping.
  await chrome.alarms.create('hearth/heartbeat', { periodInMinutes: 5 });
}
void registerAlarms;

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'hearth/heartbeat') {
    await ensureOffscreen();
    return;
  }
  if (alarm.name.startsWith('hearth:skill:')) {
    await ensureOffscreen();
    await onAlarmFired(alarm.name);
  }
});

/**
 * Central message router. Validates with zod, fans out to:
 *   - offscreen (db.*, capture.*, recall.probe)
 *   - sidepanel via runtime.sendMessage (ui.notify, recall.result)
 *   - direct local handling (settings.export proxies to offscreen)
 */
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const env = raw as MessageEnvelope | undefined;
  if (!env || typeof env !== 'object' || !('payload' in env)) {
    return false;
  }
  const parsed = Message.safeParse(env.payload);
  if (!parsed.success) {
    console.warn('[hearth/sw] dropped invalid msg', parsed.error.issues);
    sendResponse({ ok: false, error: 'invalid message' });
    return false;
  }
  const msg = parsed.data;
  void route(msg, sender).then(
    (r) => sendResponse({ ok: true, result: r }),
    (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      sendResponse({ ok: false, error: message });
    },
  );
  return true;
});

async function route(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  // Offscreen-bound traffic.
  if (
    msg.type === 'db.query' ||
    msg.type === 'db.audit' ||
    msg.type === 'db.mutate' ||
    msg.type === 'capture.inbox' ||
    msg.type === 'recall.probe' ||
    msg.type === 'settings.export' ||
    msg.type === 'extract.file'
  ) {
    await ensureOffscreen();
    return sendToOffscreen(msg);
  }

  // capture.highlight: route to offscreen, then fire note.create event for skills
  if (msg.type === 'capture.highlight') {
    await ensureOffscreen();
    const result = await sendToOffscreen<{ noteId: number; sourceId: number }>(msg);
    void onEventFired('note.create', { note_id: result.noteId, source_id: result.sourceId });
    return result;
  }

  // Manual skill trigger from sidepanel
  if (msg.type === 'skill.run') {
    await ensureOffscreen();
    void runSkillByName(msg.name, 'manual');
    return { ok: true, started: msg.name };
  }

  // L2 reverse recall — runs the full pipeline (probe → optional LLM narrate).
  if (msg.type === 'recall.narrate') {
    await ensureOffscreen();
    const probe = (await sendToOffscreen({
      type: 'recall.probe',
      title: msg.title,
      snippet: msg.snippet,
      url: msg.url,
    })) as { cards: RecallCard[]; keywords?: string[] };
    if (!probe.cards.length) return { cards: [], narrative: '', keywords: probe.keywords ?? [] };

    const s = await getSettings();
    const cfg = s.warmth_narrate ? toLLMConfig(s) : null;

    let narrative = '';
    if (cfg && cfg.provider !== 'ollama') {
      // Cloud LLM needs consent; if missing, fall back to offline narrative.
      const out = await narrate({
        page_title: msg.title,
        page_site: safeHost(msg.url),
        candidates: probe.cards,
        user_lang: s.user_lang,
      }, cfg);
      narrative = out.narrative;
    } else if (cfg) {
      // Local Ollama — no consent gate
      const out = await narrate({
        page_title: msg.title,
        page_site: safeHost(msg.url),
        candidates: probe.cards,
        user_lang: s.user_lang,
      }, cfg);
      narrative = out.narrative;
    } else {
      // No LLM configured — offline deterministic narrative
      const out = await narrate({
        page_title: msg.title,
        page_site: safeHost(msg.url),
        candidates: probe.cards,
        user_lang: s.user_lang,
      }, null);
      narrative = out.narrative;
    }
    return { cards: probe.cards, narrative, keywords: probe.keywords ?? [] };
  }

  // Generic LLM gateway (chat / summarize / tag-suggest …)
  if (msg.type === 'llm.complete') {
    return llmComplete(
      { purpose: msg.purpose, messages: msg.messages, max_tokens: msg.max_tokens, temperature: msg.temperature, json: msg.json },
      { purpose: msg.purpose },
    );
  }

  if (msg.type === 'consent.grant') {
    const at = msg.at ?? Math.floor(Date.now() / 1000);
    await setSettings({ consent_at: at });
    await sendToOffscreen({ type: 'db.mutate', op: 'consent.grant', payload: { at } });
    return { ok: true, consent_at: at };
  }

  if (msg.type === 'ui.notify') {
    return chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/hearth-128.png'),
      title: msg.title,
      message: msg.body,
    });
  }
  void sender;
  throw new Error(`unhandled msg.type: ${msg.type}`);
}

function safeHost(url: string): string | undefined {
  try { return new URL(url).hostname; }
  catch { return undefined; }
}

// ────────────────────────────────────────────────────────────────────
// Tab dwell tracker — reliably emits tab_close candidates from the SW
// side (more reliable than content's beforeunload, which is often skipped).
// ────────────────────────────────────────────────────────────────────
interface TabDwell { url: string; title: string; openedAt: number }
const TAB_DWELL = new Map<number, TabDwell>();
const TAB_CLOSE_MIN_SEC = 25 * 60;

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url) return;
  if (!/^https?:/.test(tab.url)) return;
  TAB_DWELL.set(tabId, { url: tab.url, title: tab.title ?? '', openedAt: Date.now() });
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rec = TAB_DWELL.get(tabId);
  if (!rec) return;
  TAB_DWELL.delete(tabId);
  const held = (Date.now() - rec.openedAt) / 1000;
  if (held < TAB_CLOSE_MIN_SEC) return;
  try {
    await ensureOffscreen();
    await sendToOffscreen({
      type: 'capture.inbox',
      kind: 'tab_close',
      payload: { url: rec.url, title: rec.title, held_sec: Math.round(held) },
    });
  } catch (e) {
    console.warn('[hearth/sw] tab-close emit failed', e);
  }
});
// ────────────────────────────────────────────────────────────────────
// Streaming LLM port — sidepanel opens a Port for token-by-token reply.
// ────────────────────────────────────────────────────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'hearth/llm-stream') return;
  let abort: AbortController | null = null;
  port.onMessage.addListener(async (raw) => {
    const env = raw as MessageEnvelope | undefined;
    const msg = env?.payload;
    if (!msg) return;
    if (msg.type === 'llm.complete' && (raw as { stream?: boolean }).stream !== false) {
      abort?.abort();
      abort = new AbortController();
      void streamReply(port, msg, abort.signal);
    }
  });
  port.onDisconnect.addListener(() => { abort?.abort(); });
});

async function streamReply(
  port: chrome.runtime.Port,
  msg: Extract<Message, { type: 'llm.complete' }>,
  signal: AbortSignal,
) {
  const { getSettings: getS, hasFreshConsent, toLLMConfig: toCfg } = await import('@shared/settings');
  const { createAdapter } = await import('@llm/adapter');
  const { sendToOffscreen: send } = await import('./offscreenBridge');
  const s = await getS();
  const cfg = toCfg(s);
  if (!cfg) {
    port.postMessage({ type: 'stream.error', error: 'No LLM provider', reason: 'no-config' });
    return;
  }
  if (cfg.provider !== 'ollama' && !hasFreshConsent(s)) {
    port.postMessage({ type: 'stream.error', error: 'Consent expired', reason: 'no-consent' });
    return;
  }
  const t0 = Date.now();
  let bytesIn = 0;
  try {
    const adapter = await createAdapter(cfg);
    if (!adapter.stream) {
      port.postMessage({ type: 'stream.error', error: 'adapter has no stream' });
      return;
    }
    for await (const delta of adapter.stream({
      purpose: msg.purpose,
      messages: msg.messages,
      max_tokens: msg.max_tokens,
      temperature: msg.temperature,
      json: msg.json,
      signal,
    })) {
      bytesIn += new TextEncoder().encode(delta).length;
      port.postMessage({ type: 'stream.delta', delta });
    }
    port.postMessage({ type: 'stream.done', ms: Date.now() - t0 });
    // Audit a synthetic success record (bytes_out unknown without serializing prompt — approximate from messages).
    const bytesOut = msg.messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 0);
    void send({
      type: 'db.audit', channel: 'llm_calls',
      payload: {
        provider: cfg.provider, model: cfg.model, endpoint: cfg.endpoint ?? null,
        bytes_out: bytesOut, bytes_in: bytesIn,
        purpose: msg.purpose, consent: 1, ok: 1, ms: Date.now() - t0,
      },
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    port.postMessage({ type: 'stream.error', error: err });
  }
}
