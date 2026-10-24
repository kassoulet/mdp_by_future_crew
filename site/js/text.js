// Glyph engine shared by the menu and the playing screen (unit seg 0x314, routines 4414..4543, 466d).
// Fonts live in assets/menu_data.bin, addressed with their original cs offsets.
export const FONT_A = 0x28ac, FONT_B = 0x369c, BASE = 0x28ac;
export const u8 = (d, o) => d[o - BASE], u16 = (d, o) => d[o - BASE] | d[o - BASE + 1] << 8;

export class TextEngine {
  constructor(data, vga) {
    this.d = data; this.vga = vga;
    this.x = 0; this.y = 0; this.font = 0; this.col = 0; this.shadow = 0; this.stride = 0x40;
    this.rowTab = new Uint16Array(0x400);
  }
  setStride(s) { this.stride = s; for (let i = 0; i < 0x400; i++) this.rowTab[i] = (i * s) & 0xffff; }  // 4364 / 47c5
  setFont(f) { this.font = f; }                                   // 4414
  setColor(c) { this.col = c; }                                   // 4418 (plane mask = 1<<c)
  adv(ch) {                                                       // 4425
    if (ch === 0x40) return 0;
    const si = this.font, d = this.d; if (!si) return 0;
    const b = ch - u16(d, si + 2);
    if (b < 0 || ch > u16(d, si + 4)) return u16(d, si + 6);
    return u16(d, si + b * 4 + 0xa) || u16(d, si + 6);
  }
  drawChar(ch, erase = false) {                                                  // 445b
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
    this.blit(this.vga.planes[this.col], g, h, di, cl, erase);
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
}
