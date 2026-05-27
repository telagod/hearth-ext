/**
 * Hearth shared types.
 * Single source of truth for cross-context data shapes.
 */

export type NoteKind =
  | 'highlight'
  | 'note'
  | 'annotation'
  | 'chat'
  | 'clip'
  | 'image_ocr';

export type SourceKind =
  | 'web'
  | 'docx'
  | 'pdf'
  | 'image'
  | 'md'
  | 'xlsx'
  | 'manual';

export type HighlightColor =
  | 'amber'
  | 'rose'
  | 'sky'
  | 'sage'
  | 'violet'
  | 'slate';

export interface PageCtx {
  url: string;
  title: string;
  site_name?: string;
  favicon?: string;
  author?: string;
  lang?: string;
  selection_xpath?: string;
  context_before?: string;
  context_after?: string;
}

export interface Note {
  id: number;
  source_id: number | null;
  kind: NoteKind;
  body: string;
  body_plain?: string;
  context_before?: string;
  context_after?: string;
  position_json?: string;
  color: HighlightColor;
  starred: 0 | 1;
  archived: 0 | 1;
  simhash?: number;
  keywords_json?: string;
  created_at: number;
  updated_at: number;
  accessed_at?: number;
}

export interface Source {
  id: number;
  uri: string;
  kind: SourceKind;
  title?: string;
  author?: string;
  site_name?: string;
  favicon?: string;
  lang?: string;
  published_at?: number;
  fetched_at: number;
  meta_json?: string;
}

export interface RecallCard {
  note_id: number;
  title: string;
  excerpt: string;
  site_name?: string;
  created_at: number;
  score: number;
  user_annotation?: string;
}

export interface RecallResult {
  cards: RecallCard[];
  narrative?: string;
  page_title: string;
}

export interface ChatMessage {
  id?: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  model?: string;
}

export interface InboxItem {
  id: number;
  kind: 'clip' | 'read' | 'image' | 'tab_close' | 'reading_list';
  payload_json: string;
  source_id?: number;
  score: number;
  status: 'pending' | 'accepted' | 'discarded' | 'expired';
  created_at: number;
  ttl_at: number;
}

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  trigger: SkillTrigger;
  tools: string[];
  permissions: {
    llm: 'required' | 'optional' | 'none';
    network: 'optional' | 'none';
    storage: 'required';
    clipboard?: 'optional' | 'none';
  };
  inputs?: Array<{ name: string; type: string; required?: boolean }>;
  outputs?: Array<{ name: string; type: string }>;
  timeout?: number;
  schedule_jitter?: number;
}

export type SkillTrigger =
  | { type: 'cron'; schedule: string }
  | { type: 'event'; event: string }
  | { type: 'manual' };

export interface SkillRun {
  id: number;
  skill_id: number;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  started_at: number;
  finished_at?: number;
  duration_ms?: number;
  trigger: 'cron' | 'manual' | 'event';
  log?: string;
  error?: string;
  result_json?: string;
}
