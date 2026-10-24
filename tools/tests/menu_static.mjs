// usage: node menu_static.mjs MDP.MDI out.rgba [ticks] [keys]  -> raw RGBA of the 512x480 menu after N ticks
import fs from 'fs';
import { VGA } from '../../site/js/vga.js'; import { Menu } from '../../site/js/menu.js';
const [, , mdi, out, ticks = '80', ...keys] = process.argv;
const KEYS = { down: 0x5000, up: 0x4800, pgdn: 0x5100, pgup: 0x4900 };
const vga = new VGA(); let t = 0; const q = keys.map(k => { const [n, f] = k.split('@'); return [+f, KEYS[n]]; });
const env = { vga, vsync: async () => { if (++t >= +ticks) { const img = new Uint8ClampedArray(512 * 480 * 4); vga.scanout(img, 512); fs.writeFileSync(out, img); process.exit(0); } await null; },
  key: () => (q.length && q[0][0] <= t ? q.shift()[1] : 0) };
await new Menu(new Uint8Array(fs.readFileSync(new URL('../../site/assets/menu_data.bin', import.meta.url))), new Uint8Array(fs.readFileSync(mdi)), env).run();
