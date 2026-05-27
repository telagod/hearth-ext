/**
 * Cross-context message bus types.
 * All messages between content / sidepanel / background / offscreen go through here.
 * Validated with zod at the Router boundary.
 */

import { z } from 'zod';
import type {
  ChatMessage,
  HighlightColor,
  PageCtx,
  RecallCard,
} from './types.js';

export const MsgCaptureHighlight = z.object({
  type: z.literal('capture.highlight'),
  text: z.string().min(1).max(20000),
  ctx: z.object({
    url: z.string().url(),
    title: z.string(),
    site_name: z.string().optional(),
    favicon: z.string().optional(),
    selection_xpath: z.string().optional(),
    context_before: z.string().max(800).optional(),
    context_after: z.string().max(800).optional(),
  }),
  color: z.enum(['amber', 'rose', 'sky', 'sage', 'violet', 'slate']).optional(),
  tags: z.array(z.string()).max(8).optional(),
  annotation: z.string().max(2000).optional(),
});

export const MsgCaptureInbox = z.object({
  type: z.literal('capture.inbox'),
  kind: z.enum(['clip', 'read', 'image', 'tab_close', 'reading_list']),
  payload: z.record(z.unknown()),
});

export const MsgRecallProbe = z.object({
  type: z.literal('recall.probe'),
  title: z.string(),
  snippet: z.string().max(2000),
  url: z.string().url(),
});

export const MsgRecallNarrate = z.object({
  type: z.literal('recall.narrate'),
  title: z.string(),
  snippet: z.string().max(2000),
  url: z.string().url(),
});

export const MsgRecallResult = z.object({
  type: z.literal('recall.result'),
  cards: z.array(z.unknown()),
  narrative: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

export const MsgLLMComplete = z.object({
  type: z.literal('llm.complete'),
  purpose: z.enum(['chat','warmth','tag-suggest','summarize','skill']),
  messages: z.array(z.object({ role: z.enum(['system','user','assistant']), content: z.string() })).min(1).max(50),
  max_tokens: z.number().int().min(8).max(8000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  json: z.boolean().optional(),
});

export const MsgConsent = z.object({
  type: z.literal('consent.grant'),
  at: z.number().int().optional(),  // epoch sec; default = now
});

export const MsgChatAsk = z.object({
  type: z.literal('chat.ask'),
  conversation_id: z.number().optional(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  context_note_ids: z.array(z.number()).optional(),
});

export const MsgChatStream = z.object({
  type: z.literal('chat.stream'),
  conversation_id: z.number(),
  delta: z.string(),
  done: z.boolean().optional(),
});

export const MsgDbQuery = z.object({
  type: z.literal('db.query'),
  sql: z.string().regex(/^\s*SELECT\b/i, 'only SELECT allowed'),
  params: z.array(z.unknown()).optional(),
});

export const MsgDbAudit = z.object({
  type: z.literal('db.audit'),
  channel: z.enum(['llm_calls', 'usage_events', 'errors', 'skill_runs']),
  payload: z.record(z.unknown()),
});

export const MsgDbMutate = z.object({
  type: z.literal('db.mutate'),
  op: z.enum([
    'note.update',
    'note.delete',
    'note.star',
    'note.archive',
    'inbox.promote',
    'inbox.discard',
    'consent.grant',
    'skill.upsert',
    'skill.toggle',
    'skill_run.update',
    'simhash.backfill',
  ]),
  payload: z.record(z.unknown()).optional(),
});

export const MsgSkillRun = z.object({
  type: z.literal('skill.run'),
  name: z.string(),
  args: z.record(z.unknown()).optional(),
  trigger: z.enum(['cron', 'manual', 'event']).default('manual'),
});

export const MsgUiNotify = z.object({
  type: z.literal('ui.notify'),
  title: z.string(),
  body: z.string(),
  cardId: z.string().optional(),
  level: z.enum(['info', 'success', 'warn', 'error']).default('info').optional(),
});

export const MsgSettingsExport = z.object({
  type: z.literal('settings.export'),
  format: z.enum(['zip', 'obsidian', 'json']),
});

export const MsgExtractFile = z.object({
  type: z.literal('extract.file'),
  filename: z.string().min(1).max(260),
  bytes_b64: z.string(),
  job_id: z.string().optional(),
  promote: z.boolean().optional(),
});

export const MsgExtractProgress = z.object({
  type: z.literal('extract.progress'),
  job_id: z.string(),
  frac: z.number().min(0).max(1),
  stage: z.string(),
});

export const Message = z.discriminatedUnion('type', [
  MsgCaptureHighlight,
  MsgCaptureInbox,
  MsgRecallProbe,
  MsgRecallNarrate,
  MsgRecallResult,
  MsgChatAsk,
  MsgChatStream,
  MsgDbQuery,
  MsgDbAudit,
  MsgDbMutate,
  MsgSkillRun,
  MsgUiNotify,
  MsgSettingsExport,
  MsgExtractFile,
  MsgExtractProgress,
  MsgLLMComplete,
  MsgConsent,
]);

export type Message = z.infer<typeof Message>;

export interface MessageEnvelope<T extends Message = Message> {
  id: string;
  ts: number;
  origin: 'content' | 'sidepanel' | 'background' | 'offscreen' | 'newtab';
  payload: T;
}

export function envelope<T extends Message>(
  origin: MessageEnvelope['origin'],
  payload: T,
): MessageEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    origin,
    payload,
  };
}
