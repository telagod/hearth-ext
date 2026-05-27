/**
 * Minimal ZIP writer (store-only, no compression).
 *
 * We keep this dep-free and tiny: we own all file content (markdown, sqlite,
 * settings JSON), and the saving overhead vs. deflate is negligible at our
 * scale. Output is a single Uint8Array suitable for Blob/download.
 *
 * Spec: PKZIP APPNOTE (local file header + central directory + EOCD).
 */

interface Entry {
  name: string;
  data: Uint8Array;
  crc: number;
  size: number;
  modTime: number;  // dos format
  modDate: number;
  offset: number;
}

const TE = new TextEncoder();

export function zipFiles(files: Array<{ name: string; data: Uint8Array | string }>): Uint8Array {
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() / 2) & 0x1f);
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  const entries: Entry[] = [];
  const localChunks: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const data = typeof f.data === 'string' ? TE.encode(f.data) : f.data;
    const nameBytes = TE.encode(f.name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);              // local sig
    dv.setUint16(4, 20, true);                      // version
    dv.setUint16(6, 0, true);                       // flags
    dv.setUint16(8, 0, true);                       // method (0 = store)
    dv.setUint16(10, dosTime, true);
    dv.setUint16(12, dosDate, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);            // csize
    dv.setUint32(22, data.length, true);            // usize
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);                      // extra
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localChunks.push(local);

    entries.push({
      name: f.name,
      data,
      crc,
      size: data.length,
      modTime: dosTime,
      modDate: dosDate,
      offset,
    });
    offset += local.length;
  }

  // Central directory
  const cdChunks: Uint8Array[] = [];
  let cdSize = 0;
  for (const e of entries) {
    const nameBytes = TE.encode(e.name);
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);              // central sig
    dv.setUint16(4, 20, true);                      // version made by
    dv.setUint16(6, 20, true);                      // version needed
    dv.setUint16(8, 0, true);                       // flags
    dv.setUint16(10, 0, true);                      // method
    dv.setUint16(12, e.modTime, true);
    dv.setUint16(14, e.modDate, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.size, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);                      // extra
    dv.setUint16(32, 0, true);                      // comment
    dv.setUint16(34, 0, true);                      // disk start
    dv.setUint16(36, 0, true);                      // internal
    dv.setUint32(38, 0, true);                      // external
    dv.setUint32(42, e.offset, true);
    cd.set(nameBytes, 46);
    cdChunks.push(cd);
    cdSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, entries.length, true);
  dv.setUint16(10, entries.length, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, offset, true);                   // cd offset
  dv.setUint16(20, 0, true);                        // comment

  return concat([...localChunks, ...cdChunks, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Standard CRC-32 (IEEE), table cached on first call.
let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!CRC_TABLE) {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tbl[n] = c;
    }
    CRC_TABLE = tbl;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
