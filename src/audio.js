import { CONFIG } from './config.js';

// Every sound is synthesized with Web Audio, there are no audio files.
export class Sound {
  constructor() {
    this.ctx = null;
    try {
      this.muted = localStorage.getItem(CONFIG.storage.muted) === '1';
    } catch {
      this.muted = false;
    }
  }

  // Must be called from a user gesture (browsers block audio before that).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  build() {
    const ac = this.ctx;
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ac.createDynamicsCompressor();
    this.master.connect(comp).connect(ac.destination);

    const len = ac.sampleRate * 2;
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const data = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: deep rumble instead of hiss
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      data[i] = last * 3.5;
    }
    this.white = ac.createBuffer(1, len, ac.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;

    const loop = (buffer, filterType, freq, q) => {
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g };
    };
    this.rumble = loop(this.noise, 'lowpass', 160, 0.7);
    this.roar = loop(this.white, 'bandpass', 600, 0.5);
  }

  setEngine(level, air) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rumble.g.gain.setTargetAtTime(level * (0.35 + 0.5 * air), t, 0.15);
    this.rumble.f.frequency.setTargetAtTime(90 + 200 * level * (0.3 + 0.7 * air), t, 0.2);
    this.roar.g.gain.setTargetAtTime(level * 0.16 * air, t, 0.15);
  }

  tone(freq, dur, { type = 'sine', vol = 0.15, delay = 0, to = null } = {}) {
    if (!this.ctx) return;
    const ac = this.ctx;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burst(dur, from, to, vol) {
    if (!this.ctx) return;
    const ac = this.ctx;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this.white;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  beep(freq = 880, dur = 0.1) {
    this.tone(freq, dur, { vol: 0.08 });
  }

  explosion() {
    this.burst(1.6, 2400, 80, 0.9);
    this.tone(70, 1.2, { vol: 0.6, to: 30 });
  }

  asteroidHit() {
    this.burst(0.5, 3000, 200, 0.35);
    this.tone(900, 0.25, { type: 'triangle', vol: 0.08, to: 300 });
  }

  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.07 }));
  }

  warn() {
    this.tone(660, 0.08, { type: 'square', vol: 0.04 });
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(CONFIG.storage.muted, this.muted ? '1' : '0');
    } catch { /* storage unavailable */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
