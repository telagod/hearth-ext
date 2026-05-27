/**
 * Export — produces three formats from the live SQLite db:
 *
 *   - zip:      sqlite raw + per-note .md + skills/*.md + settings.json
 *   - obsidian: a folder layout that Obsidian opens as a Vault (md only)
 *   - json:     one-file portable JSON snapshot (small libs)
 *
 * Output is a base64-encoded blob string + suggested filename + mime.
 * sidepanel decodes and feeds chrome.downloads.download().
 */

import { zipFiles } from './zip';
import { query, type DbHandle } from './db';

export interface ExportResult {
  filename: string;
  mime: string;
  b64: string;
  bytes: number;
}

interface NoteRow {
  id: number;
  source_id: number | null;
  kind: string;
  body: string;
  color: string;
  starred: number;
  created_at: number;
  source_uri: string | null;
  source_title: string | null;
  source_kind: string | null;
}

interface SkillRow { name: string; body_md: string }
interface SettingsBlob { exported_at: number; version: string }

export async function exportAll(
  db: DbHandle,
  format: 'zip' | 'obsidian' | 'json',
): Promise<ExportResult> {
  const notes = query<NoteRow & Record<string, unknown>>(
    db,
    `SELECT n.id, n.source_id, n.kind, n.body, n.color, n.starred, n.created_at,
            s.uri AS source_uri, s.title AS source_title, s.kind AS source_kind
       FROM notes n LEFT JOIN sources s ON s.id = n.source_id
      WHERE n.archived = 0
      ORDER BY n.created_at`,
  );
  const skills = query<SkillRow & Record<string, unknown>>(db, `SELECT name, body_md FROM skills ORDER BY name`);
  const settings: SettingsBlob = { exported_at: Math.floor(Date.now() / 1000), version: '0.0.3' };

  if (format === 'json') {
    const blob = JSON.stringify({ notes, skills, meta: settings }, null, 2);
    const b64 = base64Encode(new TextEncoder().encode(blob));
    return {
      filename: `hearth-${stamp()}.json`,
      mime: 'application/json',
      b64,
      bytes: blob.length,
    };
  }

  // Build markdown notes (shared between zip & obsidian)
  const mdFiles = notes.map((n) => ({
    name: noteFilename(n),
    data: formatNoteMd(n),
  }));

  if (format === 'obsidian') {
    // Plain folder zipped: notes/*.md + skills/*.md + README.md
    const files: Array<{ name: string; data: string }> = [
      { name: 'README.md', data: obsidianReadme(notes.length, skills.length) },
      ...mdFiles.map((f) => ({ name: `notes/${f.name}`, data: f.data })),
      ...skills.map((s) => ({ name: `skills/${s.name}.md`, data: s.body_md })),
    ];
    const data = zipFiles(files);
    return {
      filename: `hearth-obsidian-${stamp()}.zip`,
      mime: 'application/zip',
      b64: base64Encode(data),
      bytes: data.length,
    };
  }

  // zip: full bundle (md + skills + settings + db dump as JSON sidecar)
  const files: Array<{ name: string; data: string }> = [
    { name: 'README.md', data: zipReadme(notes.length, skills.length) },
    { name: 'manifest.json', data: JSON.stringify(settings, null, 2) },
    ...mdFiles.map((f) => ({ name: `notes/${f.name}`, data: f.data })),
    ...skills.map((s) => ({ name: `skills/${s.name}.md`, data: s.body_md })),
    { name: 'data/notes.json', data: JSON.stringify(notes, null, 2) },
    { name: 'data/skills.json', data: JSON.stringify(skills, null, 2) },
  ];
  const data = zipFiles(files);
  return {
    filename: `hearth-${stamp()}.zip`,
    mime: 'application/zip',
    b64: base64Encode(data),
    bytes: data.length,
  };
}

function noteFilename(n: NoteRow): string {
  const date = new Date(n.created_at * 1000).toISOString().slice(0, 10);
  const title = (n.source_title ?? n.body)
    .replace(/[^\p{L}\p{N}\- _]/gu, '')
    .trim()
    .slice(0, 48)
    .replace(/\s+/g, '-') || `note-${n.id}`;
  return `${date}-${n.id}-${title}.md`;
}

function formatNoteMd(n: NoteRow): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`id: ${n.id}`);
  lines.push(`kind: ${n.kind}`);
  lines.push(`color: ${n.color}`);
  lines.push(`starred: ${n.starred ? 'true' : 'false'}`);
  lines.push(`created_at: ${new Date(n.created_at * 1000).toISOString()}`);
  if (n.source_uri) lines.push(`source_url: ${n.source_uri}`);
  if (n.source_title) lines.push(`source_title: ${JSON.stringify(n.source_title)}`);
  lines.push('---');
  lines.push('');
  lines.push(n.body);
  return lines.join('\n');
}

function zipReadme(notes: number, skills: number): string {
  return `# Hearth Export\n\nThis archive contains ${notes} notes and ${skills} skills, exported on ${new Date().toISOString()}.\n\n- \`notes/\` — one markdown file per note, with frontmatter\n- \`skills/\` — your skill.md files\n- \`data/\` — raw JSON dumps for round-trip\n- \`manifest.json\` — export metadata\n`;
}

function obsidianReadme(notes: number, skills: number): string {
  return `# Hearth Vault\n\nOpen this folder as an Obsidian vault.\n\n${notes} notes, ${skills} skills.\n\nNotes live under \`notes/\` with YAML frontmatter (id, source_url, created_at).\n`;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function base64Encode(buf: Uint8Array): string {
  // chunked to avoid the 'too many arguments' on large buffers.
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, Math.min(i + CHUNK, buf.length)));
  }
  return btoa(s);
}
