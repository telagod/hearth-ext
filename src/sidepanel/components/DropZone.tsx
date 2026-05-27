import { useEffect, useRef, useState } from 'react';
import { sendMsg } from '../api';
import { Icon } from './Icon';
import { useT } from '../useT';

interface IngestResult {
  source_id: number;
  note_ids: number[];
  kind: string;
  parts: number;
}

interface JobState {
  id: string;
  filename: string;
  size: number;
  frac: number;
  stage: string;
  done: boolean;
  error?: string;
  result?: IngestResult;
}

const ACCEPT = '.docx,.pdf,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

export function DropZone({ onIngested }: { onIngested?: (r: IngestResult) => void }) {
  const { t } = useT();
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onProgress = (env: { payload?: { type?: string; job_id?: string; frac?: number; stage?: string } } | undefined) => {
      const m = env?.payload;
      if (!m || m.type !== 'extract.progress' || !m.job_id) return;
      setJobs((arr) => arr.map((j) => j.id === m.job_id
        ? { ...j, frac: m.frac ?? j.frac, stage: m.stage ?? j.stage }
        : j));
    };
    chrome.runtime.onMessage.addListener(onProgress);
    return () => chrome.runtime.onMessage.removeListener(onProgress);
  }, []);

  const onFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) {
      if (f.size > MAX_BYTES) {
        setJobs((arr) => [{
          id: crypto.randomUUID(), filename: f.name, size: f.size,
          frac: 1, stage: t('drop_too_large', { limit: MAX_BYTES / 1024 / 1024 }),
          done: true, error: `> ${MAX_BYTES / 1024 / 1024} MB`,
        }, ...arr]);
        continue;
      }
      void ingestOne(f, setJobs, onIngested);
    }
  };

  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files?.length) void onFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => e.target.files && void onFiles(e.target.files)}
      />
      <button className="dropzone-trigger" onClick={() => inputRef.current?.click()}>
        <Icon name="archive" size={14} />
        <span>{t('drop_trigger')}</span>
        <span className="dropzone-hint">{t('drop_hint')}</span>
      </button>

      {jobs.length > 0 && (
        <div className="dropzone-jobs">
          {jobs.slice(0, 5).map((j) => (
            <div key={j.id} className={`job${j.done ? ' done' : ''}${j.error ? ' err' : ''}`}>
              <div className="job-head">
                <Icon name={j.error ? 'cross' : j.done ? 'check' : 'spark'} size={11} />
                <span className="job-name">{j.filename}</span>
                <span className="job-size">{fmtSize(j.size)}</span>
              </div>
              <div className="job-bar">
                <div className="job-fill" style={{ width: `${Math.round(j.frac * 100)}%` }} />
              </div>
              <div className="job-stage">
                {j.error ? `× ${j.error}`
                  : j.done && j.result
                    ? `✓ ${j.result.kind} · ${j.result.parts} 段 · note#${j.result.note_ids[0] ?? '-'}`
                    : `${j.stage} · ${Math.round(j.frac * 100)}%`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function ingestOne(
  file: File,
  setJobs: (fn: (a: JobState[]) => JobState[]) => void,
  onIngested?: (r: IngestResult) => void,
) {
  const id = crypto.randomUUID();
  setJobs((arr) => [{
    id, filename: file.name, size: file.size,
    frac: 0, stage: 'reading…', done: false,
  }, ...arr]);
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const b64 = bytesToBase64(bytes);
    setJobs((arr) => arr.map((j) => j.id === id ? { ...j, frac: 0.04, stage: 'sending…' } : j));
    const r = await sendMsg<IngestResult>({
      type: 'extract.file',
      filename: file.name,
      bytes_b64: b64,
      job_id: id,
      promote: true,
    } as never);
    setJobs((arr) => arr.map((j) => j.id === id ? { ...j, frac: 1, stage: 'done', done: true, result: r } : j));
    onIngested?.(r);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    setJobs((arr) => arr.map((j) => j.id === id ? { ...j, frac: 1, stage: 'error', done: true, error: err } : j));
  }
}

function bytesToBase64(buf: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, Math.min(i + CHUNK, buf.length)));
  }
  return btoa(s);
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
