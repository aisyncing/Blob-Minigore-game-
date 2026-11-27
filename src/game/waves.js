// Wave design and the director that runs it. Pure: it only says what should spawn and when; the game decides where.

/** What wave n (1, 2, 3 ...) is made of. It starts quick and keeps growing. */
export function waveSpec(n) {
  const big = Math.floor(0.6 + n * 0.55), mid = 2 + n, small = n >= 3 ? (n - 2) * 2 : 0;
  return { big, mid, small, total: big + mid + small, interval: Math.max(0.35, 1.2 - 0.07 * n) };
}

/** Turns a wave spec into a shuffled list of tiers to spawn. */
export function waveQueue(n, rand = Math.random) {
  const s = waveSpec(n), q = [];
  for (let i = 0; i < s.big; i++) q.push('big');
  for (let i = 0; i < s.mid; i++) q.push('mid');
  for (let i = 0; i < s.small; i++) q.push('small');
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  return q;
}

/**
 * step(dt, live) -> events: { type: 'wave', n } | { type: 'spawn', tier } | { type: 'clear', n }
 * `live` is how many critters exist right now (including ones still climbing out). New ones wait while the arena is full.
 */
export function createDirector({ rand = Math.random, maxLive = 40, firstDelay = 1.5, restDelay = 3.2 } = {}) {
  const st = { wave: 0, phase: 'rest', t: firstDelay, queue: [], spawnT: 0 };
  return {
    state: st,
    reset() { st.wave = 0; st.phase = 'rest'; st.t = firstDelay; st.queue = []; st.spawnT = 0; },
    step(dt, live) {
      const ev = [];
      if (st.phase === 'rest') {
        st.t -= dt;
        if (st.t <= 0) { st.wave++; st.queue = waveQueue(st.wave, rand); st.spawnT = 0.6; st.phase = 'fight'; ev.push({ type: 'wave', n: st.wave, total: st.queue.length }); }
      } else {
        st.spawnT -= dt;
        while (st.queue.length && st.spawnT <= 0 && live + ev.filter(e => e.type === 'spawn').length < maxLive) {
          ev.push({ type: 'spawn', tier: st.queue.shift() }); st.spawnT += waveSpec(st.wave).interval * (0.6 + rand() * 0.8);
        }
        if (st.spawnT < 0) st.spawnT = 0;
        if (!st.queue.length && live === 0) { st.phase = 'rest'; st.t = restDelay; ev.push({ type: 'clear', n: st.wave }); }
      }
      return ev;
    },
  };
}
