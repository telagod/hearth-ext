/**
 * File extractors — turn binary blobs into structured note(s).
 *
 * Outputs a uniform ExtractedDoc that the offscreen handler can fan out into
 * notes table rows. Heavy deps (mammoth / pdfjs / tesseract) are lazy-loaded
 * so an idle Hearth never pays their cost.
 */

export type ExtractKind = 'docx' | 'pdf' | 'image' | 'md' | 'text';

export interface ExtractedPart {
  /** 1-based page number (PDF) or section index. */
  index?: number;
  heading?: string;
  text: string;
}

export interface ExtractedDoc {
  kind: ExtractKind;
  title: string;
  parts: ExtractedPart[];
  meta: Record<string, unknown>;
}

export type ProgressFn = (frac: number, stage: string) => void;

const NOOP = () => {};

export async function extract(
  filename: string,
  bytes: Uint8Array,
  onProgress: ProgressFn = NOOP,
): Promise<ExtractedDoc> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.docx')) return extractDocx(filename, bytes, onProgress);
  if (lower.endsWith('.pdf'))  return extractPdf(filename, bytes, onProgress);
  if (/\.(png|jpe?g|webp|bmp)$/i.test(lower)) return extractImage(filename, bytes, onProgress);
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return { kind: 'md', title: stripExt(filename), parts: [{ text }], meta: {} };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(bytes);
    return { kind: 'text', title: stripExt(filename), parts: [{ text }], meta: {} };
  }
  throw new Error(`Unsupported file type: ${filename}`);
}

// ────────────────────────────────────────────────────────────────────
// docx (mammoth)
// ────────────────────────────────────────────────────────────────────

async function extractDocx(name: string, bytes: Uint8Array, p: ProgressFn): Promise<ExtractedDoc> {
  p(0.1, 'loading mammoth');
  const mammoth = await import('mammoth/mammoth.browser');
  p(0.3, 'parsing docx');
  // mammoth needs a plain ArrayBuffer (not Uint8Array view).
  const ab = bytes.slice().buffer as ArrayBuffer;
  const result = await mammoth.default.extractRawText({ arrayBuffer: ab });
  p(0.9, 'organizing');
  const raw = result.value ?? '';
  const parts = splitByHeadings(raw);
  return {
    kind: 'docx',
    title: stripExt(name),
    parts,
    meta: { paragraphs: parts.length, warnings: result.messages?.length ?? 0 },
  };
}

/** Heuristic: empty-line blocks; treat short ALL-CAPS-or-headline-like as headings. */
function splitByHeadings(text: string): ExtractedPart[] {
  const blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const parts: ExtractedPart[] = [];
  let heading: string | undefined;
  let idx = 0;
  for (const b of blocks) {
    if (b.length < 80 && b.split('\n').length === 1 && /^[A-Z一-鿿0-9].{1,80}$/.test(b)) {
      heading = b;
      continue;
    }
    idx += 1;
    parts.push({ index: idx, heading, text: b });
    heading = undefined;
  }
  if (parts.length === 0 && blocks.length > 0) {
    parts.push({ index: 1, text: blocks.join('\n\n') });
  }
  return parts;
}

// ────────────────────────────────────────────────────────────────────
// pdf (pdf.js)
// ────────────────────────────────────────────────────────────────────

async function extractPdf(name: string, bytes: Uint8Array, p: ProgressFn): Promise<ExtractedDoc> {
  p(0.05, 'loading pdf.js');
  // pdfjs-dist 4.x has a legacy/build folder for non-worker usage.
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  // Disable worker by pointing to fake worker module (avoids extra fetch in offscreen).
  // Using `disableWorker: true` is honored by pdf.js when GlobalWorkerOptions.workerSrc is unset.
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('assets/pdf.worker.mjs');
  } catch { /* worker unavailable; sync fallback acceptable for small docs */ }

  p(0.15, 'opening pdf');
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const numPages = doc.numPages;
  const parts: ExtractedPart[] = [];
  for (let i = 1; i <= numPages; i++) {
    p(0.15 + (0.8 * i) / numPages, `page ${i}/${numPages}`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((it: { str?: string }) => it.str ?? '').join(' ').trim();
    if (text.length < 20) continue;
    parts.push({ index: i, text });
  }
  await doc.cleanup();
  await doc.destroy();
  return {
    kind: 'pdf',
    title: stripExt(name),
    parts,
    meta: { pages: numPages, kept: parts.length },
  };
}

// ────────────────────────────────────────────────────────────────────
// image OCR (tesseract.js)
// ────────────────────────────────────────────────────────────────────

async function extractImage(name: string, bytes: Uint8Array, p: ProgressFn): Promise<ExtractedDoc> {
  p(0.05, 'loading tesseract');
  // Tesseract v5: ~3MB core (wasm) + 124KB worker, served locally to satisfy
  // MV3 CSP. Language data (~10MB per lang) downloads on first use and is
  // cached in IndexedDB by tesseract.js itself, so subsequent runs are offline.
  const Tesseract = await import('tesseract.js');
  const corePath = chrome.runtime.getURL('tesseract');     // dir; tesseract picks simd if supported
  const workerPath = chrome.runtime.getURL('tesseract/worker.min.js');
  const worker = await Tesseract.createWorker(['eng', 'chi_sim'], 1, {
    corePath,
    workerPath,
    // langPath defaults to https://tessdata.projectnaptha.com/4.0.0 — used only
    // once per language; tesseract.js caches to IndexedDB after. If user is
    // offline first time, OCR fails with a friendly error.
    cacheMethod: 'write',
    logger: (m: { progress?: number; status?: string }) => {
      if (typeof m.progress === 'number') p(0.05 + 0.9 * m.progress, m.status ?? 'ocr');
    },
  });
  try {
    p(0.95, 'running ocr');
    const buf = bytes.slice().buffer as ArrayBuffer;
    const blob = new Blob([buf]);
    const url = URL.createObjectURL(blob);
    const res = await worker.recognize(url);
    URL.revokeObjectURL(url);
    const text = (res.data.text ?? '').trim();
    return {
      kind: 'image',
      title: stripExt(name),
      parts: text ? [{ text }] : [],
      meta: { confidence: res.data.confidence ?? 0 },
    };
  } finally {
    await worker.terminate();
  }
}

// ────────────────────────────────────────────────────────────────────

function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '');
}
