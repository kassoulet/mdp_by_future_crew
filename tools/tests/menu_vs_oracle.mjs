// usage: node menu_vs_oracle.mjs oracle.json MDP.MDI "down@80 up@100 ..."
import fs from 'fs'; import crypto from 'crypto';
import { VGA } from '../../site/js/vga.js'; import { Menu } from '../../site/js/menu.js';
const [, , oj, mdiPath, script = ''] = process.argv;
const KEYS = { down: 0x5000, up: 0x4800, pgdn: 0x5100, pgup: 0x4900, enter: 0x1c0d, esc: 0x011b, f10: 0x4400 };
const keys = script.split(/\s+/).filter(s => s && !/^(snap|full)/.test(s)).map(s => s.split('@')).map(([k, f]) => [+f, KEYS[k]]).sort((a, b) => a[0] - b[0]);
const shots = new Map(JSON.parse(fs.readFileSync(oj)).filter(s => s.tag === 'v').map(s => [s.frame, s]));
const OFF = +(process.env.OFF || 0);
const vga = new VGA(); const q = []; let tick = 0, bad = 0, checked = 0;
const md5 = p => crypto.createHash('md5').update(p).digest('hex');
function check() {
  const s = shots.get(tick + OFF); if (!s) return; checked++;
  const mine = vga.planes.map(md5);
  const dac = Array.from(vga.dac);
  const same = s.md5.every((h, i) => h === mine[i]) && s.start === vga.start && s.lc === vga.lc && s.hde === vga.hde && s.offset === vga.offset
    && s.dac.slice(0, 48).every((v, i) => v === dac[i]);
  if (!same && s.planes) for (let p = 0; p < 4; p++) { const o = Buffer.from(s.planes[p], 'hex'); const rows = new Set(); for (let i = 0; i < 65536; i++) if (o[i] !== vga.planes[p][i]) rows.add(i >> 6); if (rows.size) console.log('  plane', p, 'rows differing (64B rows):', [...rows].slice(0, 40).join(',')); }
  if (!same) { bad++; if (bad < 6) console.log('MISMATCH at tick', tick, { start: [s.start, vga.start], lc: [s.lc, vga.lc], off: [s.offset, vga.offset], md5: s.md5.map((h, i) => h === mine[i]), dac: s.dac.slice(0, 48).every((v, i) => v === dac[i]) }); }
}
const env = { vga, vsync: async () => { if (tick > 900) { console.log("runaway"); process.exit(1); } check(); tick++; while (keys.length && keys[0][0] <= tick + OFF) q.push(keys.shift()[1]); await null; }, key: () => q.shift() || 0 };
const m = new Menu(new Uint8Array(fs.readFileSync(new URL('../../site/assets/menu_data.bin', import.meta.url))), new Uint8Array(fs.readFileSync(mdiPath)), env);
const r = await m.run();
console.log('result', r, 'ticks', tick, 'checked', checked, 'mismatches', bad);
