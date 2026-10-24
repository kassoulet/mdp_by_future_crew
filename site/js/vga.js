// Minimal planar VGA (mode 12h family): 4 bit planes of 64 KB, CRTC start/line-compare, 6-bit DAC.
export class VGA {
  constructor() {
    this.planes = [0, 1, 2, 3].map(() => new Uint8Array(0x10000));
    this.setMode12();
  }
  setMode12() {
    for (const p of this.planes) p.fill(0);
    this.start = 0; this.lc = 0x3ff; this.offset = 0x28; this.hde = 0x4f;
    this.dac = new Uint8Array(48); // 16 colours, 6 bit each; attribute palette is the identity
  }
  get width() { return (this.hde + 1) * 8; }
  get stride() { return this.offset * 2; }
  state() {
    return { start: this.start, lc: this.lc, hde: this.hde, offset: this.offset,
      dac: Array.from(this.dac), planes: this.planes.map(p => Uint8Array.from(p)) };
  }
  // Render 480 scanlines into RGBA ImageData-like buffer (Uint8ClampedArray, width*480*4)
  scanout(rgba, W = this.width) {
    const stride = this.stride, pl = this.planes, bytes = W >> 3;
    const pal = new Uint8Array(16 * 3);
    for (let i = 0; i < 48; i++) pal[i] = (this.dac[i] * 255 / 63) | 0;
    for (let L = 0; L < 480; L++) {
      let a = L <= this.lc ? this.start + L * stride : (L - this.lc - 1) * stride;
      let o = L * W * 4;
      for (let b = 0; b < bytes; b++, a++) {
        const i = a & 0xffff, p0 = pl[0][i], p1 = pl[1][i], p2 = pl[2][i], p3 = pl[3][i];
        for (let k = 7; k >= 0; k--) {
          const c = ((p0 >> k & 1) | (p1 >> k & 1) << 1 | (p2 >> k & 1) << 2 | (p3 >> k & 1) << 3) * 3;
          rgba[o++] = pal[c]; rgba[o++] = pal[c + 1]; rgba[o++] = pal[c + 2]; rgba[o++] = 255;
        }
      }
    }
  }
}
