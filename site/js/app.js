import { VGA } from './vga.js';
import { Menu } from './menu.js';

const KEYMAP = { ArrowUp: 0x4800, ArrowDown: 0x5000, PageUp: 0x4900, PageDown: 0x5100, Enter: 0x1c0d, Escape: 0x011b, F10: 0x4400 };
const FRAME_MS = 1000 / 59.94;                 // VGA 640x480 vertical rate

export class Screen {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.vga = new VGA(); this.waiters = []; this.keys = [];
    this.img = null; this.acc = 0; this.last = 0;
    addEventListener('keydown', e => {
      const k = KEYMAP[e.key]; if (k) { this.keys.push(k); e.preventDefault(); }
    });
    const fit = () => {
      const s = Math.max(1, Math.floor(Math.min(innerWidth / 640, innerHeight / 480)));
      canvas.style.width = 640 * s + 'px'; canvas.style.height = 480 * s + 'px';
    };
    addEventListener('resize', fit); fit();
    requestAnimationFrame(t => this.tick(t));
  }
  tick(t) {
    this.acc += Math.min(t - (this.last || t), 250); this.last = t;
    while (this.acc >= FRAME_MS) {
      this.acc -= FRAME_MS;
      this.draw();
      const w = this.waiters; this.waiters = []; for (const r of w) r();
    }
    requestAnimationFrame(t => this.tick(t));
  }
  draw() {
    const v = this.vga, W = v.width;
    if (!this.img || this.img.width !== W) this.img = new ImageData(W, 480);
    v.scanout(this.img.data);
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, 640, 480);
    this.ctx.putImageData(this.img, (640 - W) >> 1, 0);
  }
  vsync() { return new Promise(r => this.waiters.push(r)); }
  key() { return this.keys.shift() || 0; }
}

export async function runDisc(canvas, disc) {
  const base = `discs/${disc}/`;
  const [data, mdi] = await Promise.all([
    fetch('assets/menu_data.bin').then(r => r.arrayBuffer()),
    fetch(base + 'MDP.MDI').then(r => r.arrayBuffer())]);
  const scr = new Screen(canvas);
  for (;;) {
    const m = new Menu(new Uint8Array(data), new Uint8Array(mdi), scr);
    const r = await m.run();
    if (r.kind !== 'file') return r;
    // TODO: playing screen
  }
}
