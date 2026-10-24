// Minimal S3M / MOD reader: only what the playing screen needs (patterns, sample volume/c2spd/loop, orders).
const u16 = (b, o) => b[o] | b[o + 1] << 8;
const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
const str = (b, o, n) => { let s = ''; for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; };

export function parseModule(b) {
  if (b.length > 0x30 && str(b, 0x2c, 4) === 'SCRM') return parseS3M(b);
  return parseMOD(b);
}

function parseS3M(b) {
  const ordNum = u16(b, 0x20), insNum = u16(b, 0x22), patNum = u16(b, 0x24);
  const orders = Array.from(b.subarray(0x60, 0x60 + ordNum));
  let nOrders = orders.indexOf(255); if (nOrders < 0) nOrders = ordNum;
  const chan = []; for (let i = 0; i < 32; i++) if (b[0x40 + i] < 16) chan.push(i);   // STMIK keeps enabled PCM channels
  const map = new Map(chan.map((c, i) => [c, i]));
  const insPtr = [], patPtr = []; let o = 0x60 + ordNum;
  for (let i = 0; i < insNum; i++, o += 2) insPtr.push(u16(b, o) * 16);
  for (let i = 0; i < patNum; i++, o += 2) patPtr.push(u16(b, o) * 16);
  const samples = insPtr.map(p => ({ vol: b[p + 0x1c], loop: !!(b[p + 0x1f] & 1) && b[p] === 1, c2spd: u32(b, p + 0x20) || 8363 }));
  const patterns = patPtr.map(p => {
    const rows = Array.from({ length: 64 }, () => []);
    if (!p) return rows;
    let q = p + 2;
    for (let r = 0; r < 64 && q < b.length;) {
      const w = b[q++];
      if (!w) { r++; continue; }
      const c = map.get(w & 31), cell = { note: 255, inst: 0, vol: 255, cmd: 0, info: 0 };
      if (w & 32) { cell.note = b[q++]; cell.inst = b[q++]; }
      if (w & 64) cell.vol = b[q++];
      if (w & 128) { cell.cmd = b[q++]; cell.info = b[q++]; }
      if (c !== undefined) rows[r][c] = cell;
    }
    return rows;
  });
  return { kind: 's3m', title: str(b, 0, 28), orders, nOrders, samples, patterns, nChannels: chan.length };
}

function parseMOD(b) {
  const sig = str(b, 1080, 4); let nch = 4;
  if (/^\dCHN$/.test(sig)) nch = +sig[0]; else if (/^\d\dCH$/.test(sig)) nch = +sig.slice(0, 2); else if (/^FLT\d$/.test(sig)) nch = +sig[3];
  const samples = [];
  for (let i = 0; i < 31; i++) { const o = 20 + i * 30; samples.push({ vol: b[o + 25], loop: (b[o + 28] << 8 | b[o + 29]) > 1, c2spd: 8363 }); }
  const len = b[950], orders = Array.from(b.subarray(952, 952 + 128)), nPat = Math.max(...orders) + 1;
  const patterns = [];
  for (let p = 0; p < nPat; p++) {
    const rows = [];
    for (let r = 0; r < 64; r++) {
      const row = [];
      for (let c = 0; c < nch; c++) {
        const o = 1084 + ((p * 64 + r) * nch + c) * 4;
        row[c] = { period: (b[o] & 15) << 8 | b[o + 1], inst: (b[o] & 0xf0) | b[o + 2] >> 4, cmd: b[o + 2] & 15, info: b[o + 3] };
      }
      rows.push(row);
    }
    patterns.push(rows);
  }
  return { kind: 'mod', title: str(b, 0, 20), orders, nOrders: len, samples, patterns, nChannels: nch };
}
