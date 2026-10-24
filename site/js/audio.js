// Main-thread side of the player: Web Audio graph, load / pause / seek, position feed.
export class Player {
  constructor() { this.ctx = null; this.pos = { sec: 0, order: 0, pattern: 0, row: 0 }; this.duration = 0; this.paused = false; this.volume = 64; this.gain = null; }
  async ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ready = this.ctx.audioWorklet.addModule(new URL('./mdp.worklet.js', import.meta.url)).then(() => {
        this.node = new AudioWorkletNode(this.ctx, 'mdp-player', { numberOfInputs: 0, outputChannelCount: [2] });
        this.gain = this.ctx.createGain(); this.node.connect(this.gain).connect(this.ctx.destination);
        this.node.port.onmessage = e => this.onMsg(e.data);
        this.setVolume(this.volume);
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    await this.ready;
  }
  onMsg(m) {
    if (m.cmd === 'pos') { this.pos = m; this.posAt = performance.now(); }
    else if (m.cmd === 'loaded') { this.duration = m.duration; this.orders = m.orders; this.loadedRes?.(m); }
  }
  async load(buf) {
    await this.ensure();
    const p = new Promise(r => { this.loadedRes = r; });
    this.node.port.postMessage({ cmd: 'load', val: buf }, [buf]);
    await p; this.pos = { sec: 0, order: 0, pattern: 0, row: 0 };
    this.paused = false; this.node.port.postMessage({ cmd: 'play' });
  }
  pause(on = !this.paused) { this.paused = on; this.node?.port.postMessage({ cmd: on ? 'pause' : 'play' }); }
  seek(sec) { this.node?.port.postMessage({ cmd: 'seek', val: sec }); }
  orderRow(o, r = 0) { this.node?.port.postMessage({ cmd: 'orderRow', val: { o, r } }); }
  setMode(m) { this.mode = m; this.node?.port.postMessage({ cmd: 'mode', val: m }); }
  setStereo(on) { this.node?.port.postMessage({ cmd: 'stereo', val: on ? 100 : 0 }); }
  setVolume(v) { this.volume = Math.max(0, Math.min(64, v)); if (this.gain) this.gain.gain.value = this.volume / 64; }
  stop() { this.node?.port.postMessage({ cmd: 'stop' }); }
}
