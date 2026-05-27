import { useEffect, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from '../components/Icon';
import { SkillEditor } from '../components/SkillEditor';

interface SkillRow {
  id: number;
  name: string;
  version: string;
  description: string;
  trigger_json: string;
  enabled: number;
  last_run_at: number | null;
  body_md: string;
  source: string;
}

interface RunRow {
  id: number;
  skill_id: number;
  status: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  trigger: string;
  error: string | null;
}

export function Skills() {
  const [rows, setRows] = useState<SkillRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<SkillRow | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load(setRows, setRuns);
    const t = window.setInterval(() => void load(setRows, setRuns), 8000);
    return () => window.clearInterval(t);
  }, []);

  if (creating || editing) {
    return (
      <SkillEditor
        initial={editing ?? undefined}
        onSaved={() => { setEditing(null); setCreating(false); void load(setRows, setRuns); }}
        onClose={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="skills">
      <div className="skills-toolbar">
        <button className="btn btn-ember" onClick={() => setCreating(true)}>
          <Icon name="feather" size={12} /> 新建 skill
        </button>
      </div>
      {rows.length === 0 && (
        <div className="empty">
          <p style={{ fontSize: 14 }}>Skills 还没加载。</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            重启扩展，启动后 5 个内置 skill 会自动入库。
          </p>
        </div>
      )}
      {rows.map((s) => {
        let trig: { type?: string; schedule?: string; event?: string } = {};
        try { trig = JSON.parse(s.trigger_json); } catch { /* */ }
        const skillRuns = runs.filter((r) => r.skill_id === s.id);
        const last = skillRuns[0];
        const isBusy = busy === s.name || last?.status === 'running';
        const isExpanded = expanded === s.id;
        return (
          <div key={s.id} className={`skill-card${isBusy ? ' busy' : ''}`}>
            <div className="skill-head">
              <span className="name">{s.name}</span>
              <span className="ver">v{s.version}</span>
              {s.source !== 'builtin' && <span className="source-tag">{s.source}</span>}
              <button
                className={`toggle ${s.enabled ? '' : 'off'}`}
                title={s.enabled ? '已启用 (点击禁用)' : '已禁用 (点击启用)'}
                onClick={() => void toggle(s, setRows, setRuns)}
              />
              <button className="iconbtn skill-edit-btn"
                title="编辑"
                onClick={() => setEditing(s)}>
                <Icon name="feather" size={12} />
              </button>
              <button className="iconbtn skill-run-btn"
                disabled={isBusy}
                title="手动运行"
                onClick={() => void run(s.name, setBusy, setRows, setRuns)}>
                <Icon name="spark" size={12} />
              </button>
            </div>
            <div className="desc">{s.description}</div>
            <div className="meta">
              <span className="trig">
                {trig.type?.toUpperCase() ?? 'MANUAL'} · {trig.schedule ?? trig.event ?? 'manual'}
              </span>
              <button className="meta-btn"
                onClick={() => setExpanded(isExpanded ? null : s.id)}>
                {last
                  ? `${runStatusGlyph(last.status)} ${runStatusZh(last.status)} · ${relTime(last.started_at)}`
                  : '尚未运行'}
              </button>
            </div>
            {isExpanded && (
              <div className="skill-runs">
                {skillRuns.length === 0
                  ? <div className="empty" style={{ padding: '12px 0' }}>无运行记录</div>
                  : (
                    <table className="ledger">
                      <thead>
                        <tr><th>时间</th><th>触发</th><th>状态</th><th>耗时</th></tr>
                      </thead>
                      <tbody>
                        {skillRuns.slice(0, 10).map((r) => (
                          <tr key={r.id} className={r.status === 'failed' ? 'failed' : ''}>
                            <td>{new Date(r.started_at * 1000).toLocaleString()}</td>
                            <td>{r.trigger}</td>
                            <td>{runStatusGlyph(r.status)} {runStatusZh(r.status)}</td>
                            <td className="ms">{r.duration_ms ?? '—'}{r.duration_ms ? 'ms' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function runStatusZh(s: string): string {
  if (s === 'succeeded') return '成功';
  if (s === 'running') return '运行中';
  if (s === 'failed') return '失败';
  if (s === 'cancelled') return '取消';
  return s;
}

function runStatusGlyph(s: string): string {
  if (s === 'succeeded') return '✓';
  if (s === 'running') return '…';
  if (s === 'failed') return '×';
  if (s === 'cancelled') return '⌀';
  return '·';
}

function relTime(ts: number): string {
  const sec = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (sec < 60) return `${sec}s 前`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m 前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h 前`;
  return `${Math.floor(sec / 86400)}d 前`;
}

async function load(setRows: (r: SkillRow[]) => void, setRuns: (r: RunRow[]) => void) {
  try {
    const [skillRows, runRows] = await Promise.all([
      sendMsg<SkillRow[]>({
        type: 'db.query',
        sql: `SELECT id, name, version, description, trigger_json, enabled, last_run_at, body_md, source
              FROM skills ORDER BY source DESC, name`,
      }),
      sendMsg<RunRow[]>({
        type: 'db.query',
        sql: `SELECT id, skill_id, status, started_at, finished_at, duration_ms, trigger, error
              FROM skill_runs
              ORDER BY started_at DESC LIMIT 100`,
      }),
    ]);
    setRows(skillRows);
    setRuns(runRows);
  } catch {
    setRows([]);
    setRuns([]);
  }
}

async function toggle(
  s: SkillRow,
  setRows: (r: SkillRow[]) => void,
  setRuns: (r: RunRow[]) => void,
) {
  try {
    await sendMsg({ type: 'db.mutate', op: 'skill.toggle', payload: { id: s.id, enabled: !s.enabled } });
    await load(setRows, setRuns);
  } catch (e) {
    alert(`切换失败: ${(e as Error).message}`);
  }
}

async function run(
  name: string,
  setBusy: (n: string | null) => void,
  setRows: (r: SkillRow[]) => void,
  setRuns: (r: RunRow[]) => void,
) {
  setBusy(name);
  try {
    await sendMsg({ type: 'skill.run', name, trigger: 'manual' });
    setTimeout(() => { void load(setRows, setRuns); setBusy(null); }, 2500);
  } catch (e) {
    setBusy(null);
    alert(`运行失败: ${(e as Error).message}`);
  }
}