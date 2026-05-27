/**
 * Tiny bridge from SW to the offscreen document.
 *
 * SW <-> offscreen talk via chrome.runtime.sendMessage; the offscreen doc
 * listens on onMessage. Both sides use the standard `MessageEnvelope` shape.
 */

import { envelope, type Message } from '@shared/messages';

const OFFSCREEN_URL = 'offscreen.html';

let creating: Promise<void> | null = null;

export async function ensureOffscreen(): Promise<void> {
  // hasDocument is gated on Chrome 116+. We require 116 in manifest.
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  if (creating) return creating;
  creating = chrome.offscreen
    .createDocument({
      url: chrome.runtime.getURL(OFFSCREEN_URL),
      reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.DOM_PARSER],
      justification:
        'Host SQLite WASM and OPFS-backed local knowledge base. No off-device transfer.',
    })
    .finally(() => {
      creating = null;
    });
  return creating;
}

export async function sendToOffscreen<T = unknown>(msg: Message): Promise<T> {
  const env = envelope('background', msg);
  const reply = (await chrome.runtime.sendMessage(env)) as
    | { ok: true; result: T }
    | { ok: false; error: string }
    | undefined;
  if (!reply) throw new Error('offscreen: no reply');
  if (!reply.ok) throw new Error(`offscreen: ${reply.error}`);
  return reply.result;
}
