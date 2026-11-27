// Synthesised sound, so there are no files to download. Starts after the first click (browsers require it).
let ctx = null, master = null, noise = null, volume = 0.6;

export function unlock() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}
export const setVolume = v => { volume = v; if (master) master.gain.value = v; };

function tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
  if (!ctx) return; const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function burst(dur, vol, f0, f1, q = 0.8, delay = 0, type = 'lowpass') {
  if (!ctx) return; const t = ctx.currentTime + delay, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.playbackRate.value = 0.8 + Math.random() * 0.4; flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt).connect(g).connect(master); src.start(t, Math.random() * 0.3); src.stop(t + dur + 0.05);
}

export const sfx = {
  blast(barrel = 0) { const p = barrel ? 0.92 : 1; burst(0.32, 0.9, 5200 * p, 260, 0.7); burst(0.05, 0.6, 9000, 3000, 0.5, 0, 'highpass'); tone(150 * p, 38, 0.24, 0.85); tone(300, 90, 0.08, 0.3, 'square'); },
  open() { tone(900, 420, 0.04, 0.12, 'square'); burst(0.05, 0.12, 3000, 1200, 1, 0.01); },
  grab() { tone(1400, 900, 0.03, 0.07, 'triangle'); },
  insert() { tone(700, 380, 0.05, 0.14, 'square'); burst(0.04, 0.1, 2600, 1000, 1); },
  eject() { tone(2600, 1900, 0.05, 0.06, 'triangle', 0.05); tone(2400, 1700, 0.05, 0.05, 'triangle', 0.13); },
  close() { tone(520, 260, 0.07, 0.2, 'square', 0.05); burst(0.05, 0.16, 2200, 800, 1, 0.05); },
  hit(k = 1) { tone(220 * (0.8 + Math.random() * 0.3), 90, 0.07, 0.18 * k, 'sine'); burst(0.05, 0.1 * k, 2400, 700, 1.2); },
  pop() { tone(420, 1000, 0.14, 0.22, 'triangle'); burst(0.12, 0.25, 4000, 500); tone(800, 1500, 0.08, 0.12, 'triangle', 0.06); },
  thunk() { tone(90, 50, 0.06, 0.2); },
  hurt() { tone(180, 60, 0.28, 0.5, 'sawtooth'); burst(0.2, 0.35, 1800, 200, 0.8); tone(90, 40, 0.3, 0.4); },
  warn() { tone(520, 700, 0.05, 0.05, 'triangle'); },
  spawn() { tone(300, 620, 0.07, 0.06, 'sine'); },
  swarm() { tone(140, 110, 0.5, 0.35, 'sawtooth'); tone(147, 118, 0.5, 0.3, 'sawtooth', 0.2); },
  over() { tone(330, 110, 0.9, 0.4, 'triangle'); tone(220, 70, 1.1, 0.35, 'sine', 0.15); burst(0.4, 0.25, 900, 100); },
  combo(n = 1) { tone(500 + n * 60, 900 + n * 80, 0.09, 0.14, 'triangle'); },
};
