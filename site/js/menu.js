// Port of the MDP menu routine (unit seg 0x314, entry 4e1c). Variable names follow the asm
// variables at cs:28xx; comments give the original addresses.
const FONT_A = 0x28ac, FONT_B = 0x369c, PAL = 0x4334, BASE = 0x28ac;
const u8 = (d, o) => d[o - BASE], u16 = (d, o) => d[o - BASE] | d[o - BASE + 1] << 8;
const s16 = v => (v << 16) >> 16;

export class Menu {
  // data: Uint8Array of assets/menu_data.bin, mdi: Uint8Array of MDP.MDI,
  // env: { vsync(): Promise, key(): scancode|0 (non-blocking, int16 style), vga }
  constructor(data, mdi, env) {
    this.d = data; this.mdi = mdi; this.env = env; this.vga = env.vga;
    this.buf = new Uint8Array(0x2800 + 4);
    this.ent = new Array(50).fill(0);
    this.cur = 0; this.count = 0;
    this.x = 0; this.y = 0; this.font = 0; this.col = 0; this.shadow = 1; this.stride = 0x40;
    this.rowTab = new Uint16Array(0x400);
    this.rect0 = 0; this.rect1 = 0;
    this.scroll = 0; this.clipLo = 0; this.clipHi = 0; this.clipLo2 = 0; this.clipHi2 = 0;
    this.pgUp = 0; this.pgDn = 0; this.lastWords = 0; this.tgt = 0; this.mid = 0; this.just = 0; this.spaces = 0;
  }
  setFont(f) { this.font = f; }                                   // 4414
  setColor(c) { this.col = c; }                                   // 4418 (plane mask = 1<<c)
  adv(ch) {                                                       // 4425
    if (ch === 0x40) return 0;
    const si = this.font, d = this.d; if (!si) return 0;
    const b = ch - u16(d, si + 2);
    if (b < 0 || ch > u16(d, si + 4)) return u16(d, si + 6);
    return u16(d, si + b * 4 + 0xa) || u16(d, si + 6);
  }
  drawChar(ch) {                                                  // 445b
    if (ch === 0x40) { this.setColor(this.col ^ 1); return; }
    const si = this.font, d = this.d; if (!si) return;
    const b = ch - u16(d, si + 2);
    if (b < 0 || ch > u16(d, si + 4)) { this.x += u16(d, si + 6); return; }
    const h = u8(d, si), adv = u16(d, si + b * 4 + 0xa);
    if (!adv) { this.x += u16(d, si + 6); return; }
    const g = (si + u16(d, si + b * 4 + 8)) & 0xffff;
    let di = this.rowTab[this.y & 0x3ff];
    const x = this.x & 0xffff; this.x = (x + adv) & 0xffff;
    di = (di + (x >> 3)) & 0xffff; const cl = x & 7;
    this.blit(this.vga.planes[this.col], g, h, di, cl, false);
    if (this.shadow) {
      let c2 = cl + 2, d2 = di; if (c2 & 8) d2++;
      this.blit(this.vga.planes[3], g, h, (d2 + 2 * this.stride) & 0xffff, c2 & 7, false);
    }
  }
  blit(pl, g, h, di, cl, erase) {
    const d = this.d, st = this.stride;
    for (let r = 0; r < h; r++, di = (di + st) & 0xffff) {
      const v = (u16(d, g + 2 * r) << 8) >> cl;
      const b0 = v >> 16 & 255, b1 = v >> 8 & 255, b2 = v & 255;
      const i1 = (di + 1) & 0xffff, i2 = (di + 2) & 0xffff;
      if (erase) { pl[di] &= ~b0; pl[i1] &= ~b1; pl[i2] &= ~b2; }
      else { pl[di] |= b0; pl[i1] |= b1; pl[i2] |= b2; }
    }
  }
  // 4557: width of the run of chars >= 0x20 at bx, and number of spaces
  measure(bx) {
    let dx = 0, cx = 0; const b = this.buf;
    for (;; bx++) { const al = b[bx]; if (al === 0x20) cx++; if (al < 0x20) break; dx += this.adv(al); }
    return [dx, cx];
  }
  line(bx) {                                                      // 463c: draw plain line, return bx at terminator
    const b = this.buf, y = s16(this.y);
    if (y < s16(this.clipLo) || y > s16(this.clipHi)) { while (b[bx] >= 0x20) bx++; return bx; }
    while (b[bx] >= 0x20) this.drawChar(b[bx++]);
    return bx;
  }
  centered(bx) { const [w] = this.measure(bx); this.x += (0x200 - w) >> 1; return this.line(bx); } // 45a0
  right(bx) { const [w] = this.measure(bx); this.x = 0x1fc - w; return this.line(bx); }          // 45b3
  justified(bx) {                                                 // 45c3
    const b = this.buf;
    if (b[bx] !== 0x24) return this.line(bx);
    bx++;
    const [w, cx] = this.measure(bx);
    const ax = 0x1f8 - w;
    if (!cx || ax <= 0) return this.line(bx);
    this.just = ax; this.spaces = cx;
    const y = s16(this.y);
    if (y < s16(this.clipLo) || y > s16(this.clipHi)) { while (b[bx] >= 0x20) bx++; return bx; }
    for (;; bx++) {
      const al = b[bx]; if (al < 0x20) return bx;
      if (al === 0x20) {
        const q = Math.floor(this.just / this.spaces); this.spaces--; this.just -= q; this.x += q;
      }
      this.drawChar(al);
    }
  }
  nextLine() { if (this.font) { this.y += u8(this.d, this.font) + 2; this.x = 0; } }               // 478a
  quarterLine() { if (this.font) { this.y += (u8(this.d, this.font) + 2) >> 2; this.x = 0; } }     // 47a6
  skipCtl(bx) { const b = this.buf; while (b[bx] && b[bx] < 0x20) bx++; return bx; }                  // 490b
  skipText(bx) { const b = this.buf; while (b[bx] && b[bx] >= 0x20) bx++; return bx; }                // 491d

  entry(bx) {                                                     // 492f -> [y0-4, y+1]
    this.setFont(FONT_A); this.nextLine();
    const y0 = this.y;
    this.setColor(0); this.x = 4;
    bx = this.skipText(bx); bx = this.skipCtl(bx);
    const out = () => [y0 - 4, this.y + 1];
    if (!this.buf[bx]) return out();
    bx = this.line(bx); bx = this.skipCtl(bx);
    if (!this.buf[bx]) return out();
    this.setFont(FONT_B); this.x = 0x118; this.y += 2;
    bx = this.right(bx); this.nextLine(); this.quarterLine();
    this.x = 4; bx = this.skipCtl(bx);
    if (!this.buf[bx]) return out();
    this.setColor(1);
    for (;;) {
      bx = this.justified(bx); this.nextLine(); this.x = 4;
      bx = this.skipCtl(bx);
      if (!this.buf[bx]) return out();
    }
  }
  fillRows(y1, y2, val) {                                         // 49b0 / 4aae: plane 2, whole 64-byte rows
    let cx = y2 - y1 + 1; if (cx < 0) return;
    const p = this.vga.planes[2];
    for (let y = y1; cx > 0; cx--, y++) {
      const a = this.rowTab[y & 0x3ff]; for (let i = 0; i < 64; i++) p[(a + i) & 0xffff] = val;
    }
  }
  drawPage() {                                                    // 4832
    this.x = 0; this.y = 0x20;
    this.setFont(FONT_A); this.nextLine(); this.setColor(1);
    let bx = 0x800;
    do { bx = this.centered(bx); this.nextLine(); bx = this.skipCtl(bx); } while (this.buf[bx]);
    this.nextLine();
    this.pgDn = this.pgUp = -1;
    for (let i = 0; i < this.count; i++) {
      if (this.pgUp === -1 && this.y > s16(this.clipLo2)) this.pgUp = i - 1;
      if (this.pgDn === -1 && this.y > s16(this.clipHi2)) this.pgDn = i - 1;
      const [a, b] = this.entry(this.ent[i]);
      if (i === this.cur) this.fillRows(this.rect0 = a, this.rect1 = b, 0xff);
    }
    if (this.pgUp === -1) this.pgUp = 0;
    if (this.pgDn === -1) this.pgDn = this.count - 1;
    this.setFont(FONT_B); this.nextLine(); this.nextLine(); this.setColor(1);
    let bx2 = this.skipCtl(this.lastWords);
    do { bx2 = this.centered(bx2); this.nextLine(); bx2 = this.skipCtl(bx2); } while (this.buf[bx2]);
  }
  async setScroll(ax) {                                           // 4d95
    this.scroll = ax; const dx = ax - 0x20;
    this.clipLo = this.clipLo2 = dx; this.clipHi = this.clipHi2 = dx + 0x200;
    this.vga.start = ((ax & 0x3ff) * 0x40) & 0xffff;
    await this.env.vsync();
    let cx = 0x3ff - (ax & 0x3ff); if (cx >= 0x1e0) cx = 0x1e0;
    this.vga.lc = cx;
  }
  clearOutside() {                                                // 4ce1
    const hi = this.clipHi & 0x3ff, lo = this.clipLo & 0x3ff;
    let cx = lo - hi; if (cx === 0) return; if (cx < 0) cx += 0x400;
    for (let y = hi; cx > 0; cx--, y++) {
      const a = this.rowTab[y & 0x3ff];
      for (const p of this.vga.planes) for (let i = 0; i < 64; i++) p[(a + i) & 0xffff] = 0;
    }
  }
  async scrollBy(ax) {                                            // 4c16
    this.fillRows(this.rect0, this.rect1, 0);
    await this.setScroll(this.scroll);
    this.clearOutside();
    this.cur += ax;
    if (this.cur < 0) { this.cur = 0; if (this.cur > this.count - 2) this.cur = this.count - 2; }
    if (ax < 0) this.clipLo -= 0x200; else this.clipHi += 0x200;
    this.drawPage();
    this.tgt = this.rect0 - 0xc8;
    this.mid = (this.tgt + this.scroll) >> 1;
    let bp = 2;
    for (;;) {
      let cx = bp; if (cx >= 0x10 || cx < 0) cx = 0x10; if (!cx) cx = 1; // jb is unsigned
      let done = false;
      for (; cx > 0; cx--) {
        if (this.scroll === this.tgt) { done = true; break; }
        if (this.scroll < this.tgt) this.scroll++; else this.scroll--;
      }
      if (done) break;
      const dx = this.scroll;
      if (dx > this.tgt) bp += dx > this.mid ? 1 : -1; else bp += dx < this.mid ? 1 : -1;
      await this.setScroll(dx);
    }
    await this.setScroll(this.scroll);
    this.drawPage();
  }
  loadMdi() {                                                     // 4bab
    const b = this.buf; const n = Math.min(this.mdi.length, 0x2000);
    b.set(this.mdi.subarray(0, n), 0x800);
    let di = 0x800 + n; b[di++] = 0;
    let count = 0;
    for (let bx = 0x800; bx < di; bx++) {
      if (b[bx] !== 0x23) continue;
      b[bx] = 0;
      if (count >= 50 || (b[++bx] === 0x23)) { this.lastWords = bx + 1; bx++; continue; }
      this.ent[count++] = bx;
    }
    this.count = count - 1;
  }
  async fade(al, ah) {                                            // 47f6 / 480c
    for (;;) {
      await this.env.vsync();
      for (let i = 0; i < 48; i++) this.vga.dac[i] = (u8(this.d, PAL + i) * al) >> 6;
      al += ah; if (al < 0 || al > 0x40) return;
    }
  }
  // Returns {kind:'esc'|'f10'|'file', name}
  async run() {
    this.loadMdi();
    for (let i = 0; i < 0x400; i++) this.rowTab[i] = (i * this.stride) & 0xffff;
    this.vga.setMode12();
    await this.env.vsync();
    this.vga.offset = 0x20; this.vga.hde = 0x4f - 0x10;
    await this.env.vsync();                                       // 480c with fade 0
    this.vga.dac.fill(0);
    this.drawPage();
    await this.setScroll(this.rect0 - 0xc8);
    await this.scrollBy(0);
    await this.fade(0, 4);
    for (;;) {
      await this.env.vsync();
      const k = this.env.key(); if (!k) continue;
      const al = k & 255, ah = k >> 8; if (globalThis.DBG) console.log("key", k.toString(16), "cur", this.cur, "count", this.count);
      let res = null;
      if (al === 0x1b) res = { kind: 'esc' };
      else if (al === 0x0d) res = { kind: 'file', name: this.fileName() };
      else if (k === 0x4400) res = { kind: 'f10' };
      else if (al === 0) {
        if (ah === 0x48 && this.cur > 0) await this.scrollBy(-1);
        else if (ah === 0x50 && this.cur + 1 < this.count) await this.scrollBy(1);
        else if (ah === 0x51 && this.cur + 1 < this.count) await this.scrollBy(this.pgDn - this.cur);
        else if (ah === 0x49 && this.cur > 0) await this.scrollBy(this.pgUp - this.cur);
      }
      if (res) { await this.fade(0x3f, -4); return res; }
    }
  }
  fileName() {
    let bx = this.ent[this.cur], s = '';
    while (this.buf[bx] >= 0x20) s += String.fromCharCode(this.buf[bx++]);
    return s;
  }
}
