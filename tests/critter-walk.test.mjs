import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS } from '../src/game/critters.js';
import { WALK, TAU, walkPose, phaseAt } from '../src/hero/critterWalk.js';

const TIERS3 = ['small', 'mid', 'big'], N = 720;
const pose = (tier, p, m = 1) => walkPose(tier, p, m, {});

test('standing still is the rest pose: nothing is offset or rotated', () => {
  for (const t of TIERS3) for (let i = 0; i < 20; i++) for (const v of Object.values(pose(t, i * 0.9, 0))) assert.equal(Math.abs(v), 0);
});

test('the pose repeats every full cycle, and the phase follows the distance walked', () => {
  for (const t of TIERS3) for (const p of [0.3, 1.7, 4]) { const a = pose(t, p), b = pose(t, p + TAU); for (const k of Object.keys(a)) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${t}.${k}`); }
  for (const t of TIERS3) assert.ok(Math.abs(phaseAt(t, WALK[t].stride) - TAU) < 1e-9, 'one stride length of ground = one full cycle');
  assert.equal(phaseAt('mid', 0, 1.25), 1.25);
});

test('the feet alternate: one is in the air while the other is planted, never both up', () => {
  for (const t of TIERS3) {
    let lifted = 0;
    for (let i = 0; i < N; i++) { const q = pose(t, i / N * TAU); assert.ok(q.footLy < 1e-9 || q.footRy < 1e-9, `${t}: never both feet up`); assert.ok(q.footLy >= 0 && q.footRy >= 0 && q.footLy <= WALK[t].lift + 1e-12); if (q.footLy > 0) lifted++; }
    assert.ok(Math.abs(lifted / N - 0.5) < 0.01, `${t}: each foot is up half the time`);
    const L = pose(t, 0), R = pose(t, Math.PI);                                     // at p=0 foot L is back and planted, at p=π it is forward and planted
    assert.ok(L.footLz < 0 && R.footLz > 0 && L.footLy < 1e-9 && R.footLy < 1e-9, 'planted at both ends of its swing');
    assert.ok(Math.abs(L.footLz + R.footLz) < 1e-12, 'a foot goes as far back as forward');
  }
});

test('opposite arm and foot swing together, and the body bounces twice per cycle while it rolls once', () => {
  for (const t of TIERS3) {
    const w = WALK[t];
    for (let i = 0; i < 50; i++) { const q = pose(t, i / 50 * TAU); assert.ok(Math.abs(q.armL + q.armR) < 1e-12, 'arms mirror each other'); assert.ok(q.armL * q.footLz >= -1e-12, `${t}: the arm goes forward (negative) when the same-side foot is back (negative z)... same sign`); }
    const hops = []; for (let i = 0; i <= N; i++) hops.push(pose(t, i / N * TAU).hop);
    let peaks = 0; for (let i = 1; i < N; i++) if (hops[i] > hops[i - 1] && hops[i] >= hops[i + 1]) peaks++;
    assert.equal(peaks, 2, `${t}: one bounce per step`); assert.ok(Math.max(...hops) <= w.hop + 1e-9);
    const rolls = []; for (let i = 0; i <= N; i++) rolls.push(pose(t, i / N * TAU).roll);
    let crossings = 0; for (let i = 1; i < N; i++) if (rolls[i - 1] < 0 !== rolls[i] < 0) crossings++;
    assert.equal(crossings, 2, `${t}: sways left then right once per cycle`);
  }
});

test('the feet barely skate: the ground-contact speed matches the critter speed (heavier critters match best)', () => {
  // while a foot is planted it slides back by 2 * reach (critter units, x radius) over half a cycle, during which the body covers stride / 2
  for (const t of TIERS3) { const ratio = 4 * WALK[t].reach * TIERS[t].r / WALK[t].stride; assert.ok(ratio > 0.7 && ratio < 1.06, `${t}: planted foot moves at ${ratio.toFixed(2)} x the ground speed`); }
});

test('every tier walks at a readable cadence at its own speed (no strobing, no crawling)', () => {
  for (const t of TIERS3) { const steps = 2 * TIERS[t].speed / WALK[t].stride; assert.ok(steps > 1.5 && steps < 11, `${t}: ${steps.toFixed(1)} steps/s`); }
  assert.ok(2 * TIERS.small.speed / WALK.small.stride > 2 * TIERS.mid.speed / WALK.mid.stride && 2 * TIERS.mid.speed / WALK.mid.stride > 2 * TIERS.big.speed / WALK.big.stride, 'smaller = quicker feet');
});

test('heavier critters hop less, lean less, and swing their arms later', () => {
  assert.ok(WALK.small.hop > WALK.mid.hop && WALK.mid.hop > WALK.big.hop);
  assert.ok(WALK.small.armK > WALK.mid.armK && WALK.mid.armK > WALK.big.armK);
  assert.ok(WALK.big.thud > WALK.mid.thud && WALK.mid.thud > WALK.small.thud);
});
