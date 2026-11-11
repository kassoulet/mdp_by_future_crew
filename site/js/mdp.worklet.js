// AudioWorklet: libopenmpt renderer with two output modes.
//  hifi:      interpolation = windowed sinc, native sample rate, 32-bit float
//  oldschool: nearest-neighbour mixing at 22050 Hz, 8-bit, sample-and-hold output (Sound Blaster Pro feel)
import libopenmptPromise from '../vendor/libopenmpt.worklet.js';

const OLD_RATE = 22050, CHUNK = 128;
let lib; libopenmptPromise().then(l => { lib = l; });
const cstr = s => { const p = lib.stackAlloc(s.length + 1); for (let i = 0; i < s.length; i++) lib.HEAP8[p + i] = s.charCodeAt(i); lib.HEAP8[p + s.length] = 0; return p; };

class MDP extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mod = 0; this.paused = true; this.mode = 'hifi'; this.sep = 100; this.n = 0;
    this.src = new Float32Array(0); this.phase = 0; this.srcLen = 0;
    this.port.onmessage = e => this.cmd(e.data);
  }
  cmd({ cmd, val }) {
    if (!lib) { setTimeout(() => this.cmd({ cmd, val }), 50); return; }
    const m = this.mod;
    switch (cmd) {
      case 'load': this.load(val); break;
      case 'pause': this.paused = true; break;
      case 'play': this.paused = false; break;
      case 'seek': if (m) { lib._openmpt_module_set_position_seconds(m, val); this.resetSrc(); } break;
      case 'orderRow': if (m) { lib._openmpt_module_set_position_order_row(m, val.o, val.r); this.resetSrc(); } break;
      case 'mode': this.mode = val; this.applyParams(); this.resetSrc(); break;
      case 'stereo': this.sep = val; this.applyParams(); break;
      case 'stop': this.stop(); break;
      case 'dump': this.dump(); break;
    }
  }
  resetSrc() { this.srcLen = 0; this.phase = 0; }
  applyParams() {
    const m = this.mod; if (!m) return;
    lib._openmpt_module_set_render_param(m, 3, this.mode === 'hifi' ? 8 : 1);   // interpolation filter: sinc / none
    lib._openmpt_module_set_render_param(m, 2, this.sep);                         // stereo separation
  }
  stop() {
    if (this.mod) { lib._openmpt_module_destroy(this.mod); lib._free(this.lp); lib._free(this.rp); this.mod = 0; }
    this.paused = true;
  }
  load(buf) {
    this.stop();
    const bytes = new Uint8Array(buf), p = lib._malloc(bytes.length); lib.HEAPU8.set(bytes, p);
    this.mod = lib._openmpt_module_create_from_memory(p, bytes.length, 0, 0, 0);
    if (!this.mod) { this.port.postMessage({ cmd: 'error' }); return; }
    this.lp = lib._malloc(4 * 512); this.rp = lib._malloc(4 * 512);
    lib._openmpt_module_set_repeat_count(this.mod, -1);
    this.applyParams(); this.resetSrc();
    this.port.postMessage({ cmd: 'loaded', duration: lib._openmpt_module_get_duration_seconds(this.mod),
      orders: lib._openmpt_module_get_num_orders(this.mod), channels: lib._openmpt_module_get_num_channels(this.mod) });
  }
  // Generic pattern data for formats the JS parser does not read (XM, IT, ...): first 16 channels, 5 bytes per cell
  dump() {
    const m = this.mod, L = lib, nPat = L._openmpt_module_get_num_patterns(m), nOrd = L._openmpt_module_get_num_orders(m);
    const nch = Math.min(16, L._openmpt_module_get_num_channels(m)), orders = [];
    for (let i = 0; i < nOrd; i++) orders.push(L._openmpt_module_get_order_pattern(m, i));
    const pats = [];
    for (let p = 0; p < nPat; p++) {
      const rows = L._openmpt_module_get_pattern_num_rows(m, p), a = new Uint8Array(rows * nch * 5);
      for (let r = 0, k = 0; r < rows; r++) for (let c = 0; c < nch; c++) for (const cmd of [0, 1, 4, 3, 5]) a[k++] = L._openmpt_module_get_pattern_row_channel_command(m, p, r, c, cmd);
      pats.push({ rows, a });
    }
    const t = L._openmpt_module_get_metadata(m, cstr('title')); let title = ''; for (let i = 0; L.HEAPU8[t + i]; i++) title += String.fromCharCode(L.HEAPU8[t + i]);
    this.port.postMessage({ cmd: 'dump', title, orders, nch, pats });
  }
  // fetch up to 512 frames at `rate` into this.src (interleaved L,R)
  fill(rate) {
    const got = lib._openmpt_module_read_float_stereo(this.mod, rate, 256, this.lp, this.rp);
    const L = lib.HEAPF32.subarray(this.lp >> 2, (this.lp >> 2) + got), R = lib.HEAPF32.subarray(this.rp >> 2, (this.rp >> 2) + got);
    if (this.src.length < got * 2) this.src = new Float32Array(512);
    for (let i = 0; i < got; i++) { this.src[2 * i] = L[i]; this.src[2 * i + 1] = R[i]; }
    this.srcLen = got; this.phase -= Math.floor(this.phase);
  }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1], n = L.length;
    if (!this.mod || this.paused) return true;
    if (this.mode === 'hifi') {
      const got = lib._openmpt_module_read_float_stereo(this.mod, sampleRate, n, this.lp, this.rp);
      L.set(lib.HEAPF32.subarray(this.lp >> 2, (this.lp >> 2) + got)); R.set(lib.HEAPF32.subarray(this.rp >> 2, (this.rp >> 2) + got));
    } else {
      const step = OLD_RATE / sampleRate;
      for (let i = 0; i < n; i++) {
        if (this.phase >= this.srcLen) { this.fill(OLD_RATE); if (!this.srcLen) break; }
        const k = Math.floor(this.phase) * 2;
        L[i] = Math.round(this.src[k] * 127) / 128; R[i] = Math.round(this.src[k + 1] * 127) / 128;
        this.phase += step;
      }
    }
    if ((this.n++ & 3) === 0) {
      const m = this.mod;
      this.port.postMessage({ cmd: 'pos', t: currentTime, sec: lib._openmpt_module_get_position_seconds(m),
        order: lib._openmpt_module_get_current_order(m), pattern: lib._openmpt_module_get_current_pattern(m),
        row: lib._openmpt_module_get_current_row(m) });
    }
    return true;
  }
}
registerProcessor('mdp-player', MDP);
