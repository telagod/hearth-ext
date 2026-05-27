/**
 * Sidepanel ↔ SW message helper.
 * Wraps chrome.runtime.sendMessage with the standard envelope and unwraps {ok,result}.
 */

import { envelope, type Message } from '@shared/messages';

export async function sendMsg<T = unknown>(msg: Message): Promise<T> {
  const env = envelope('sidepanel', msg);
  const reply = (await chrome.runtime.sendMessage(env)) as
    | { ok: true; result: T }
    | { ok: false; error: string }
    | undefined;
  if (!reply) throw new Error('no reply from background');
  if (!reply.ok) throw new Error(reply.error);
  return reply.result;
}
