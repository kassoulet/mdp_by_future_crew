import { VGA } from './vga.js';
import { Menu } from './menu.js';
import { PlayScreen } from './play.js';
import { Player } from './audio.js';
import { parseModule } from './modinfo.js';
import { Tracker } from './tracker.js';

const KEYMAP = { ArrowUp: 0x4800, ArrowDown: 0x5000, PageUp: 0x4900, PageDown: 0x5100, Enter: 0x1c0d, Escape: 0x011b, F10: 0x4400,
  ArrowLeft: 0x4b00, ArrowRight: 0x4d00, F7: 0x4100, '+': 0x4e2b, '=': 0x4e2b, '-': 0x4a2d, s: 0x1f73, S: 0x1f73, ' ': 0x3920 };
const FRAME_MS = 1000 / 59.94;                 // VGA 640x480 vertical rate

export class Screen {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.vga = new VGA(); this.waiters = []; this.keys = [];
    this.img = null; this.acc = 0; this.last = 0;
    addEventListener('keydown', e => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = KEYMAP[e.key]; if (k) { this.keys.push(k); e.preventDefault(); this.onGesture?.(); }
    });
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

const HELP10 = ['ESC for menu', 'F10 for dos', 'F7 for shell', 'Arrows to change pattern'];
const HELP11 = ['ESC for menu', 'F10 for dos', '+/- Volume, F7 for shell', 'Arrows to change pattern'];

export async function runDisc(canvas, disc, ui = {}) {
  const base = `discs/${disc}/`, v11 = disc === 'chmind';
  const [data, mdi] = await Promise.all([
    fetch('assets/menu_data.bin').then(r => r.arrayBuffer()),
    fetch(base + 'MDP.MDI').then(r => r.arrayBuffer())]);
  const scr = new Screen(canvas), player = new Player();
  scr.onGesture = () => player.ensure();
  ui.attach?.(player);
  let loaded = null, cur = 0;
  for (;;) {
    const m = new Menu(new Uint8Array(data), new Uint8Array(mdi), scr);
    m.cur = cur;
    const r = await m.run(); cur = m.cur;
    if (r.kind === 'f10' || (r.kind === 'esc' && !loaded)) break;
    if (r.kind === 'file') {
      const buf = await fetch(base + r.name).then(x => x.arrayBuffer());
      const mod = parseModule(new Uint8Array(buf.slice(0)));
      await player.load(buf);
      loaded = { mod, tracker: new Tracker(mod), name: r.name };
      ui.title?.(mod.title);
    }
    if (await playScreen(scr, player, loaded, data, v11, ui) === 'exit') break;
  }
  player.stop();
  return { kind: 'exit' };
}

async function playScreen(scr, player, L, data, v11, ui) {
  const p = new PlayScreen(new Uint8Array(data), scr.vga), mod = L.mod;
  p.init({ title: mod.title, help: v11 ? HELP11 : HELP10, labels: v11 ? ['Ord', 'Pat', 'Row', 'Vol'] : ['Ord', 'Pat', 'Row'] });
  let last = -1, lastPat = -1, lastRow = -1;
  for (;;) {
    await scr.vsync();
    for (let k; (k = scr.key());) {
      if (k === 0x011b) return 'menu';
      if (k === 0x4400) return 'exit';
      if (k === 0x4b00 || k === 0x4d00) {
        const o = Math.max(0, Math.min(mod.nOrders - 1, player.pos.order + (k === 0x4d00 ? 1 : -1)));
        player.orderRow(o, 0); L.tracker.reset();
      }
      if (k === 0x4e2b) player.setVolume(player.volume + 1);
      if (k === 0x4a2d) player.setVolume(player.volume - 1);
      if (k === 0x1f73 && v11) { L.mono = !L.mono; player.setStereo(!L.mono); }
      if (k === 0x3920) player.pause();
    }
    const q = player.pos, key = q.pattern * 256 + q.row;
    if (key !== last) {
      if (q.pattern === lastPat && q.row > lastRow && q.row - lastRow <= 8) for (let r = lastRow + 1; r <= q.row; r++) L.tracker.row(q.pattern, r);
      else L.tracker.row(q.pattern, q.row);
      last = key; lastPat = q.pattern; lastRow = q.row;
    }
    p.markers(key, L.tracker.ch);
    p.numbers(v11 ? [q.order, q.pattern, q.row, player.volume] : [q.order, q.pattern, q.row], v11);
    p.bar(Math.min(127, Math.trunc((q.order * 64 + q.row) / (Math.max(1, mod.nOrders) * 64) * 128)));
    ui.update?.(q, player);
  }
}
