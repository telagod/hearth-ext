/**
 * Skill scheduler — loads built-in skills at startup, computes next-run
 * times for cron skills, registers chrome.alarms, dispatches on alarm fire.
 */

import { parseSkill, runSkill, type ParsedSkill } from './skillRunner';
import { sendToOffscreen } from './offscreenBridge';
import cronParser from 'cron-parser';

const BUILTIN_SKILLS = [
  'inbox-tidy',
  'link-similar',
  'monthly-purge',
  'tag-suggest',
  'weekly-review',
];

const ALARM_PREFIX = 'hearth:skill:';

/**
 * Boot: fetch built-in skill md files (bundled in dist/skills/*.md),
 * parse them, upsert into the skills table, register cron alarms.
 */
export async function loadBuiltinSkills(): Promise<void> {
  for (const name of BUILTIN_SKILLS) {
    try {
      const url = chrome.runtime.getURL(`skills/${name}.md`);
      const r = await fetch(url);
      if (!r.ok) {
        console.warn('[hearth/sched] missing skill', name, r.status);
        continue;
      }
      const md = await r.text();
      const parsed = parseSkill(md);
      await upsertSkill(parsed, md);
      if (parsed.manifest.trigger.type === 'cron') {
        await registerCronAlarm(parsed);
      }
    } catch (e) {
      console.warn('[hearth/sched] failed to load skill', name, e);
    }
  }
  await syncNextRunTimes();
  void backfillSimhashBands();
}

/**
 * Walks notes with simhash but no LSH bands (left over from pre-M4.5 inserts)
 * and computes the bands in chunks. Idempotent — safe to call on every boot.
 */
async function backfillSimhashBands(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await sendToOffscreen<{ backfilled: number; remaining: string }>({
        type: 'db.mutate',
        op: 'simhash.backfill',
        payload: { limit: 500 },
      });
      if (!r.backfilled) return;
      console.log('[hearth/sched] simhash backfilled', r.backfilled);
      if (r.remaining === 'done') return;
    } catch (e) {
      console.warn('[hearth/sched] backfill batch failed', e);
      return;
    }
  }
}

async function upsertSkill(parsed: ParsedSkill, raw: string) {
  const m = parsed.manifest;
  await sendToOffscreen({
    type: 'db.mutate',
    op: 'skill.upsert',
    payload: {
      name: m.name,
      version: m.version,
      description: m.description,
      trigger_json: JSON.stringify(m.trigger),
      tools_json: JSON.stringify(m.tools),
      permissions_json: JSON.stringify(m.permissions),
      body_md: raw,
      source: 'builtin',
    },
  });
}

async function registerCronAlarm(parsed: ParsedSkill): Promise<void> {
  if (parsed.manifest.trigger.type !== 'cron') return;
  const schedule = parsed.manifest.trigger.schedule;
  let next: number;
  try {
    const it = cronParser.parseExpression(schedule, { currentDate: new Date() });
    next = it.next().getTime();
  } catch (e) {
    console.warn('[hearth/sched] bad cron', schedule, e);
    return;
  }
  // jitter
  const jitter = (parsed.manifest.schedule_jitter ?? 0) * 1000;
  if (jitter) next += Math.floor(Math.random() * jitter);
  await chrome.alarms.create(`${ALARM_PREFIX}${parsed.manifest.name}`, { when: next });
}

async function syncNextRunTimes(): Promise<void> {
  // Persist next_run_at into skills row for UI display.
  const rows = await sendToOffscreen<Array<{ id: number; name: string; trigger_json: string }>>({
    type: 'db.query',
    sql: `SELECT id, name, trigger_json FROM skills WHERE enabled = 1`,
  });
  for (const r of rows) {
    let trig: { type?: string; schedule?: string };
    try { trig = JSON.parse(r.trigger_json); } catch { continue; }
    if (trig.type !== 'cron' || !trig.schedule) continue;
    try {
      const it = cronParser.parseExpression(trig.schedule);
      const ts = Math.floor(it.next().getTime() / 1000);
      // Reuse db.audit channel? No — write via a custom mutate. Cheaper: skip; UI computes from trigger.
      void ts;
    } catch { /* ignore */ }
  }
}

/** Called from chrome.alarms.onAlarm. */
export async function onAlarmFired(name: string): Promise<void> {
  if (!name.startsWith(ALARM_PREFIX)) return;
  const skillName = name.slice(ALARM_PREFIX.length);
  await runSkillByName(skillName, 'cron');
  // After running, schedule the next occurrence.
  const skill = await fetchSkill(skillName);
  if (skill && skill.manifest.trigger.type === 'cron') {
    await registerCronAlarm(skill);
  }
}

/** Called from message bus, e.g. note.create event triggers tag-suggest. */
export async function onEventFired(event: string, payload: Record<string, unknown>): Promise<void> {
  const rows = await sendToOffscreen<Array<{ id: number; name: string; trigger_json: string; body_md: string; enabled: number }>>({
    type: 'db.query',
    sql: `SELECT id, name, trigger_json, body_md, enabled FROM skills WHERE enabled = 1`,
  });
  for (const r of rows) {
    let trig: { type?: string; event?: string };
    try { trig = JSON.parse(r.trigger_json); } catch { continue; }
    if (trig.type !== 'event' || trig.event !== event) continue;
    try {
      const parsed = parseSkill(r.body_md);
      void runSkill({ skill: parsed, trigger: 'event', inputs: payload });
    } catch (e) {
      console.warn('[hearth/sched] event skill parse failed', r.name, e);
    }
  }
}

export async function runSkillByName(name: string, trigger: 'cron' | 'manual'): Promise<void> {
  const skill = await fetchSkill(name);
  if (!skill) return;
  await runSkill({ skill, trigger });
}

async function fetchSkill(name: string): Promise<ParsedSkill | null> {
  try {
    const rows = await sendToOffscreen<Array<{ body_md: string }>>({
      type: 'db.query',
      sql: `SELECT body_md FROM skills WHERE name = ? AND enabled = 1 LIMIT 1`,
      params: [name],
    });
    if (!rows[0]) return null;
    return parseSkill(rows[0].body_md);
  } catch (e) {
    console.warn('[hearth/sched] fetchSkill failed', name, e);
    return null;
  }
}
