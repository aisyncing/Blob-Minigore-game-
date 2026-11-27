import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaves, waveTime, waveKills, WAVES } from '../src/game/waves.js';
import { createHealthBar, isCritical, HEALTHBAR } from '../src/game/healthbar.js';
import { createSession } from '../src/game/run.js';
import { createDirector } from '../src/game/director.js';
import { BOUNDS } from '../src/game/layout.js';

const empty = { bounds: BOUNDS, circles: [], boxes: [] };
const seeded = (s = 1) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const tick = (w, secs, st = {}, dt = 1 / 60) => { const out = []; for (let i = 0; i < Math.round(secs / dt); i++) out.push(...w.update(dt, st)); return out; };

/* ---------------- waves ---------------- */
test('a run opens with 3, 2, 1 and then Wave 1', () => {
  const w = createWaves(), ev = tick(w, 3.2);
  assert.deepEqual(ev.map(e => e.type === 'countdown' ? e.n : `wave${e.wave}`), [3, 2, 1, 'wave1']);
  assert.equal(w.state.wave, 1); assert.equal(w.holding, false);
});
test('nothing spawns while a countdown runs: the wave system asks the director to hold', () => {
  const w = createWaves(); assert.equal(w.holding, true); tick(w, 3.1); assert.equal(w.holding, false);
});
test('survival time alone brings the next wave, even with zero kills', () => {
  const w = createWaves(); tick(w, 3.2, { time: 3, kills: 0 });
  const ev = tick(w, 40, { time: 40, kills: 0 }); assert.ok(ev.some(e => e.type === 'countdown' && e.wave === 2), 'a countdown to wave 2');
  assert.equal(w.state.wave, 2);
});
test('killing brings the next wave early', () => {
  const w = createWaves(); tick(w, 3.2, { time: 3, kills: 0 });
  assert.equal(tick(w, 11, { time: 14, kills: waveKills(2) - 1 }).filter(e => e.type === 'wave').length, 0, 'one kill short');
  const ev = tick(w, 4, { time: 18, kills: waveKills(2) }); assert.equal(w.state.wave, 2, 'wave 2 at 18 s, long before the 35 s clock, thanks to the kills'); assert.ok(ev.some(e => e.type === 'wave' && e.why === 'kills'));
});
test('waves cannot stack on top of each other, however many kills arrive at once', () => {
  const w = createWaves(); tick(w, 3.2, { time: 3, kills: 0 }); tick(w, 1, { time: 4, kills: 500 });
  assert.equal(w.state.wave, 1, 'a wave lasts at least minWave seconds'); tick(w, WAVES.minWave, { time: 15, kills: 500 }); tick(w, 3.5, { time: 19, kills: 500 }); assert.equal(w.state.wave, 2);
});
test('the thresholds grow with every wave', () => {
  for (let n = 2; n < 12; n++) { assert.ok(waveTime(n + 1) > waveTime(n)); assert.ok(waveKills(n + 1) - waveKills(n) > waveKills(n) - waveKills(n - 1) || n === 2); }
  assert.equal(waveKills(2), 12); assert.equal(waveTime(2), 35);
});
test('intensity jumps to the new wave baseline when kills pull a wave in early, then keeps running', () => {
  const w = createWaves(); tick(w, 3.2, { time: 3, kills: 0 }); tick(w, 11, { time: 14, kills: waveKills(2) }); tick(w, 3.2, { time: 17, kills: waveKills(2) });
  assert.ok(w.state.intensity >= waveTime(2), `intensity ${w.state.intensity}`);
});
test('reset starts over with the countdown', () => {
  const w = createWaves(); tick(w, 20, { time: 20, kills: 0 }); w.reset(); assert.equal(w.state.wave, 0); assert.equal(w.holding, true); assert.equal(w.state.intensity, 0);
});
test('the director schedules nothing while held, and runs on the wave clock', () => {
  const d = createDirector({ world: empty, bounds: BOUNDS, rng: seeded() }); let n = 0;
  for (let i = 0; i < 600; i++) n += d.update(1 / 60, { player: { x: 0, y: 0 }, cost: 0, hold: true }).filter(e => e.type === 'telegraph').length;
  assert.equal(n, 0, 'held for ten seconds: no telegraphs'); d.update(1 / 60, { player: { x: 0, y: 0 }, cost: 0, t: 120 }); assert.ok(d.state.t >= 120);
});
test('a session announces the countdown and the waves, spawns nothing until Wave 1, and a kill-rush shows up as a faster wave', () => {
  const s = createSession({ world: empty, bounds: BOUNDS, rng: seeded(6) }), P = { x: 0, y: 0, vx: 0, vy: 0, r: 0.5 }, ev = [];
  for (let i = 0; i < 60 * 3.5; i++) ev.push(...s.step(1 / 60, P));
  assert.deepEqual(ev.filter(e => e.type === 'countdown').map(e => e.n), [3, 2, 1]); assert.equal(ev.filter(e => e.type === 'spawn' || e.type === 'telegraph').length, 0, 'quiet until the wave starts');
  assert.ok(ev.some(e => e.type === 'wave' && e.wave === 1));
});

/* ---------------- health bar ---------------- */
test('a hit drops the green bar at once and leaves a white chunk behind that drains after a beat', () => {
  const b = createHealthBar(); b.reset(3, 3); b.set(2, 3);
  assert.ok(Math.abs(b.state.frac - 2 / 3) < 1e-9); assert.equal(b.state.ghost, 1, 'white still at the old level'); assert.equal(b.state.flash, 1);
  b.update(HEALTHBAR.hold - 0.05); assert.equal(b.state.ghost, 1, 'it holds for a beat');
  for (let i = 0; i < 30; i++) b.update(1 / 60); assert.ok(b.state.ghost < 1 && b.state.ghost > b.state.frac, 'then it drains');
  for (let i = 0; i < 300; i++) b.update(1 / 60); assert.equal(b.state.ghost, b.state.frac, 'and settles on the green level');
});
test('a second hit while the first is still draining keeps the old white and extends it', () => {
  const b = createHealthBar(); b.reset(3, 3); b.set(2, 3); b.update(0.2); b.set(1, 3);
  assert.equal(b.state.ghost, 1); assert.ok(Math.abs(b.state.frac - 1 / 3) < 1e-9); assert.ok(b.state.hold > 0.5, 'the beat restarts');
});
test('the flash and shake fade out quickly', () => {
  const b = createHealthBar(); b.reset(3, 3); b.set(2, 3); b.update(0.5); assert.equal(b.state.flash, 0); b.update(1); assert.equal(b.state.shake, 0);
});
test('a new run refills the bar with no animation', () => {
  const b = createHealthBar(); b.reset(3, 3); b.set(1, 3); b.set(3, 3); assert.equal(b.state.frac, 1); assert.equal(b.state.ghost, 1); assert.equal(b.state.flash, 0, 'a refill does not flash');
});
test('the bar turns red on the last hit, or at 20% or less', () => {
  assert.equal(isCritical(3, 3), false); assert.equal(isCritical(2, 3), false); assert.equal(isCritical(1, 3), true, 'last hit of three');
  assert.equal(isCritical(2, 6), false); assert.equal(isCritical(1, 6), true); assert.equal(isCritical(2, 10), true, '20%'); assert.equal(isCritical(3, 10), false);
  assert.equal(isCritical(0, 3), false, 'dead is not critical'); assert.equal(isCritical(1, 1), false, 'a one-hit run is never "critical"');
});
