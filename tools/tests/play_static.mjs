// Renders the playing screen with fixed values and writes raw RGBA (640x480) for comparison with a DOSBox capture.
import fs from 'fs';
import { VGA } from '../../site/js/vga.js'; import { PlayScreen } from '../../site/js/play.js';
const out = process.argv[2];
const vga = new VGA();
const p = new PlayScreen(new Uint8Array(fs.readFileSync(new URL('../../site/assets/menu_data.bin', import.meta.url))), vga);
p.init({ title: 'Aquaphobia  - 1993 / spring', help: ['ESC for menu', 'F10 for dos', 'F7 for shell', 'Arrows to change pattern'], labels: ['Ord', 'Pat', 'Row'] });
p.numbers([0, 4, 24]); p.bar(+process.argv[3] || 0);
const img = new Uint8ClampedArray(640 * 480 * 4); vga.scanout(img); fs.writeFileSync(out, img);
