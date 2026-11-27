// Waves: the run is cut into numbered waves, announced with a 3-2-1 countdown. Pure logic, unit tested.
//
// A new wave begins when EITHER clock runs out:
//   survival time  every 35 s, whatever you are doing. Running away without firing still escalates the run.
//   kill count     12 kills for wave 2, then 30, 54, 84 ... (3 x (n-1) x (n+2)). Killing fast brings the next wave sooner.
// Each wave starts with a countdown, during which nothing new spawns (a short breather; what is already alive keeps coming).
//
// `intensity` is the clock the director and the enemy speed ramp read, in seconds of "difficulty time". It runs with real time and jumps
// forward to the new wave's baseline whenever kills pull a wave in early, so a good shooter meets tougher furries sooner.
export const WAVES = { countdown: 3, timeEvery: 35, minWave: 10, killsBase: 3 };

export const waveTime = (n, W = WAVES) => W.timeEvery * (n - 1);
export const waveKills = (n, W = WAVES) => W.killsBase * (n - 1) * (n + 2);

/**
 * update(dt, { time, kills }) -> events:
 *   { type: 'countdown', wave, n }   once for each of 3, 2, 1 (wave = the one that is about to start)
 *   { type: 'wave', wave }           the countdown reached zero: this wave is on
 */
export function createWaves(params = {}) {
  const W = { ...WAVES, ...params };
  const S = { wave: 0, next: 1, phase: 'countdown', count: W.countdown, shown: 0, since: 0, intensity: 0, why: 'start' };
  function begin(next, why) { S.phase = 'countdown'; S.next = next; S.count = W.countdown; S.shown = 0; S.why = why; }
  return {
    state: S,
    get holding() { return S.phase === 'countdown'; },
    update(dt, { time = 0, kills = 0 } = {}) {
      const ev = []; S.intensity += dt;
      if (S.phase === 'countdown') {
        S.count -= dt;
        const n = Math.max(1, Math.ceil(S.count)); if (S.count > 0 && n !== S.shown) { S.shown = n; ev.push({ type: 'countdown', wave: S.next, n }); }
        if (S.count <= 0) { S.wave = S.next; S.phase = 'active'; S.since = 0; S.intensity = Math.max(S.intensity, waveTime(S.wave, W)); ev.push({ type: 'wave', wave: S.wave, why: S.why }); }
      } else {
        S.since += dt;
        const n = S.wave + 1;
        if (S.since >= W.minWave) {
          if (time >= waveTime(n, W)) { begin(n, 'time'); }
          else if (kills >= waveKills(n, W)) { begin(n, 'kills'); }
          if (S.phase === 'countdown') { S.shown = 3; ev.push({ type: 'countdown', wave: S.next, n: 3 }); }
        }
      }
      return ev;
    },
    reset() { Object.assign(S, { wave: 0, next: 1, phase: 'countdown', count: W.countdown, shown: 0, since: 0, intensity: 0, why: 'start' }); },
  };
}
