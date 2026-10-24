// Port of the MDP playing screen: header/progress bar (main program 0:2246, 0:20ba) and the
// channel marker display (unit seg 0xf4e: init 0x78, per-frame update 0xa6a).
import { TextEngine, FONT_A, FONT_B } from './text.js';

// 16 DAC entries (6 bit), f4e:0048
const PAL = [0,0,0, 63,0,0, 63,20,0, 63,31,0, 63,41,0, 63,52,0, 63,59,18, 63,63,37,
  13,13,13, 5,7,10, 8,11,15, 15,23,30, 25,36,47, 11,16,49, 56,56,63, 11,16,21];
const COLS = [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2];            // f4e:09be, plane mask per column
const NCOL = 38;
// thresholds of the note quantiser (f4e:0c24..0c7e); the 0x3d60 entry is in the original code
const THR = [0x3a58, 0x3dc0, 0x4160, 0x4540, 0x4960, 0x4dc0, 0x5260, 0x5760, 0x3d60, 0x6220, 0x6800];
const s16 = v => (v << 16) >> 16;

export class PlayScreen extends TextEngine {
  constructor(data, vga) {
    super(data, vga);
    this.mPrev = new Int16Array(NCOL); this.mY = new Int16Array(NCOL);
    this.mSize = new Int16Array(NCOL).fill(-999); this.mHold = new Int16Array(NCOL);
    this.lastRow = 0xffff; this.tmpY = 0; this.tmpSize = 0;
  }
  // --- VRAM helpers: write to the planes selected by the sequencer map mask
  w16(mask, a, v) { for (let p = 0; p < 4; p++) if (mask >> p & 1) { const pl = this.vga.planes[p]; pl[a & 0xffff] = v & 255; pl[(a + 1) & 0xffff] = v >> 8 & 255; } }
  w8(mask, a, v) { for (let p = 0; p < 4; p++) if (mask >> p & 1) this.vga.planes[p][a & 0xffff] = v; }
  row(r) { return r * 80; }

  // Screen set-up: f4e:0008 (clear, palette, grid) then 0:2246 (header, static text).
  // info: { title, help: [4 strings], labels, vol (true on v1.1) }
  init(info) {
    const v = this.vga;
    v.setMode12(); v.dac.set(PAL.map(c => c));
    this.grid();
    this.setStride(0x50); this.shadow = 0;
    this.w16s(0xc, 0, 40); this.w16s(0xb, 80, 40); this.w16s(0xf, 160, 70 * 40);
    this.w16s(0xa, 160 + 70 * 80, 40); this.w16s(0x9, 160 + 71 * 80, 40);
    this.setFont(FONT_A); this.setColor(0); this.pos(8, 10); this.str(info.title);
    this.setFont(FONT_B); this.setColor(2);
    info.help.forEach((h, i) => { if (h) { this.pos(500, 6 + 16 * i); this.str(h, true); } });
    info.labels.forEach((l, i) => { this.pos(540, 6 + 16 * i); this.str(l); });
    this.info = info;
  }
  w16s(mask, a, words) { for (let i = 0; i < words; i++) this.w16(mask, a + 2 * i, 0xffff); }
  grid() {
    // f4e:00bb..0850: one vertical dotted line per column, 3px ticks (plane 3 only)
    for (let k = 0; k < 39; k++)
      for (let r = 86; r <= 471; r++) {
        const rel = r - 470;                       // stores at di+0x50*rel for rel in -384..1
        this.w16(8, r * 80 + 2 * k, GRID_TICK.has(rel) ? 0x700 : 0x200);
      }
  }
  pos(x, y) { this.x = x; this.y = y; }
  str(s, right = false) {                          // 43d6 / 43ee, erase variant (466d)
    if (right) { let w = 0; for (const c of s) w += this.adv(c.charCodeAt(0)); this.x -= w; }
    for (const c of s) this.drawChar(c.charCodeAt(0), true);
  }

  // Progress bar, 0:20ba. v = pixels 0..127
  bar(v) {
    if (v < 0) v = 0;
    this.w8s(6, 58 * 80, 0xfe); this.w16r(6, 57 * 80 + 1, 0);
    this.w16r(9, 57 * 80 + 1, 0xffff);
    for (let k = 0; k < 8; k++) this.w8(3, (64 - k) * 80 + 17, 0x7f);
    this.w16r(3, 65 * 80 + 1, 0); this.w16r(0xc, 65 * 80 + 1, 0xffff);
    for (let i = 0; i < 8; i++) for (let k = 0; k < 8; k++) this.w16(2, (58 + k) * 80 + 1 + 2 * i, 0xffff);
    const n = (v >> 3) + 1;
    for (let i = 0; i < n; i++) for (let k = 0; k < 8; k++) this.w8(2, (58 + k) * 80 + 1 + i, 0);
    for (let k = 0; k < 8; k++) this.w8(2, (58 + k) * 80 + 1 + (v >> 3), 0);
  }
  w8s(mask, a, val) { for (let k = 0; k < 8; k++) this.w8(mask, a + k * 80, val); }   // rows 58..65, byte 0
  w16r(mask, a, val) { for (let i = 0; i < 8; i++) this.w16(mask, a + 2 * i, val); }

  // Row change: channel scan (f4e:0bc8..0cd5). chans: up to 16 of {vol, loop, inst, period, on}
  scan(chans) {
    for (const c of chans.slice(0, 16)) {
      if (!c || !c.vol) continue;
      let col = c.inst & 0xff; if (!col) continue;
      col--; while (col >= NCOL) col -= NCOL;
      let ax = c.period & 0xffff, cl = 0, ch = 0;
      if (ax) {
        while (ax < 0x38a0) { ax = (ax * 2) & 0xffff; cl++; }
        ch = 11; for (const t of THR) if (ax >= t) ch--;
      }
      const y = 0x186 - ((12 * cl + ch) << 2);
      const size = (c.vol >> 3) + 3;
      if (this.mSize[col] > size) continue;
      this.mY[col] = y; this.mSize[col] = size;
      this.mHold[col] = c.loop ? 10 : 0;
    }
  }
  // Per frame: f4e:0a6a without the vsync wait. rowNow = current row (scan when it changed)
  markers(rowNow, chans) {
    const p = this.vga.planes;
    for (let i = 0; i < NCOL; i++) {
      const x = 2 + 2 * i;
      this.tmpY = this.mY[i];
      let sz = Math.min(this.mSize[i], 8);
      let py = Math.max(6, Math.min(0x186, this.mPrev[i]));
      let a = (py + 0x46) * 80 + x;
      for (let r = 0; r < 20; r++) this.w16(7, a + r * 80, 0);
      let bx = Math.max(sz, 0);
      let ny = Math.max(6, Math.min(0x186, this.tmpY));
      a = (ny + 0x50 - bx) * 80 + x;
      const mask = COLS[(37 - i) % 12];
      let cx = sz;
      if (cx > -0x80) {
        if (cx <= 0) cx = 1;
        for (let k = 0; k < cx; k++) { this.w16(mask, a, 0xf8ff); this.w16(mask, a + 80, 0xf8ff); a += 160; }
      }
      this.mPrev[i] = this.tmpY;
    }
    if (rowNow !== this.lastRow) { this.lastRow = rowNow; this.scan(chans); }
    for (let i = 0; i < NCOL; i++) {
      let h = this.mHold[i] - 1;
      if (h < 0) { h = 0; this.mSize[i]--; }
      this.mHold[i] = h;
    }
  }
  // Numbers, 0:2545..2690: clear 32x49 px at (592,6) then draw ": n" at x=580
  numbers(vals, v11 = false) {
    for (let r = 0; r < (v11 ? 65 : 49); r++) for (let b = 0; b < 4; b += 2) this.w16(0xf, (6 + r) * 80 + 74 + b, 0xffff);
    this.setFont(FONT_B); this.setColor(2);
    vals.forEach((n, i) => { this.pos(580, 6 + 16 * i); this.str(': ' + n); });
  }
}
// rows (relative to 470) carrying a 3px tick: f4e:00ca.. 'dx' stores
const GRID_TICK = new Set([1, 0, -24, -47, -48, -72, -95, -96, -120, -143, -144, -168, -191, -192, -216, -239, -240, -264, -287, -288, -312, -335, -336, -360, -383, -384]);
