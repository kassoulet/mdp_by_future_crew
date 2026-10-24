// Shadow channel tracker: derives the per-channel (instrument, volume, period) state that STMIK exposed,
// from the pattern data, one row at a time. Effects other than note cut and volume set are not followed.
const T = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];

export class Tracker {
  constructor(mod) { this.mod = mod; this.reset(); }
  reset() { this.ch = Array.from({ length: 16 }, () => ({ vol: 0, loop: false, inst: 0, period: 0, fresh: false })); }
  // Apply the cells of (pattern,row); returns the 16 channel records.
  row(pattern, row) {
    const m = this.mod, cells = m.patterns[pattern] && m.patterns[pattern][row];
    if (!cells) return this.ch;
    for (let c = 0; c < 16; c++) {
      const cell = cells[c], ch = this.ch[c]; if (!cell) continue;
      const smp = cell.inst ? m.samples[cell.inst - 1] : null;
      if (m.kind === 's3m') {
        const porta = cell.cmd === 7 || cell.cmd === 12;                       // G, L
        if (cell.note === 254) ch.vol = 0;
        else if (cell.note < 254 && !porta) {
          if (cell.inst) { ch.inst = cell.inst; ch.vol = smp ? smp.vol : 0; ch.loop = !!(smp && smp.loop); }
          const s = m.samples[ch.inst - 1];
          if (s) { const oct = cell.note >> 4, semi = cell.note & 15; ch.period = Math.min(0xffff, Math.floor(16 * 8363 * 16 * T[semi % 12] / (s.c2spd * 2 ** oct))); }
        }
        if (cell.vol !== 255) ch.vol = cell.vol;
      } else {
        if (cell.period && cell.cmd !== 3 && cell.cmd !== 5) {
          if (cell.inst) { ch.inst = cell.inst; ch.vol = smp ? smp.vol : 0; ch.loop = !!(smp && smp.loop); }
          ch.period = Math.min(0xffff, cell.period * 64);
        } else if (cell.inst) { ch.inst = cell.inst; if (smp) ch.vol = smp.vol; }
        if (cell.cmd === 12) ch.vol = Math.min(64, cell.info);
      }
    }
    return this.ch;
  }
}
