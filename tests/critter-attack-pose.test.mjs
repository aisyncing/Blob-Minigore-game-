import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS } from '../src/game/critters.js';
import { ATTACK, FIELDS, attackPose, attackWeight, lungeWithinReach } from '../src/hero/critterAttack.js';

const T3 = ['small', 'mid', 'big'], near = (a, b) => Math.abs(a - b) < 1e-9;
const same = (p, q, msg) => { for (const f of FIELDS) assert.ok(near(p[f], q[f]), `${msg}: ${f} ${p[f]} vs ${q[f]}`); };

test('the wind-up starts at rest and ends exactly on the wind pose', () => {
  for (const t of T3) { const z = {}; for (const f of FIELDS) z[f] = 0; same(attackPose(t, 'windup', 0), z, t + ' start'); same(attackPose(t, 'windup', 1), ATTACK[t].wind, t + ' end'); }
});

test('the strike follows the wind-up with no jump, reaches the strike pose, and settles back to rest', () => {
  for (const t of T3) {
    same(attackPose(t, 'recover', 0), ATTACK[t].wind, t + ' continues from the wind-up'); same(attackPose(t, 'recover', ATTACK[t].snap), ATTACK[t].strike, t + ' peak');
    const z = {}; for (const f of FIELDS) z[f] = 0; same(attackPose(t, 'recover', 1), z, t + ' back to rest');
  }
});

test('the pose moves smoothly: no frame-to-frame jump anywhere in an attack, and every value is a finite number', () => {
  for (const t of T3) for (const [state, steps] of [['windup', 400], ['recover', 400]]) {
    let prev = attackPose(t, state, 0, {}); const first = { ...prev };
    for (let i = 1; i <= steps; i++) { const p = attackPose(t, state, i / steps, {}); for (const f of FIELDS) { assert.ok(Number.isFinite(p[f])); const range = Math.abs(ATTACK[t].wind[f]) + Math.abs(ATTACK[t].strike[f]) + 0.01; assert.ok(Math.abs(p[f] - prev[f]) < range * 0.04, `${t} ${state} ${f} jumps at ${i}`); } prev = p; }
  }
});

test('each size attacks in its own way', () => {
  const { small: s, mid: m, big: b } = ATTACK;
  assert.ok(b.wind.armL < -2.4 && b.wind.armR < -2.4, 'the giant hoists BOTH fists overhead');
  assert.ok(m.wind.armR < -2.2 && m.wind.armL > -1, 'the furry hoists ONE claw');
  assert.ok(s.wind.armL > 0 && s.wind.armR > 0 && s.wind.lean < 0 && s.wind.squash > 0, 'the mini crouches and draws its arms back');
  assert.ok(s.strike.lean > 0.4 && s.strike.lunge > m.strike.lunge, 'the mini dives furthest');
  assert.ok(Math.abs(m.strike.twist) > 0.3 && Math.abs(b.strike.twist) === 0, 'the furry twists into its swipe; the giant slams straight down');
  assert.ok(b.wind.lift > m.wind.lift && b.strike.squash > s.strike.squash, 'the giant rises highest and lands with the biggest squash');
});

test('the visual lunge never exceeds the reach of the strike', () => { for (const t of T3) assert.ok(lungeWithinReach(t), t); });

test('the attack pose takes over from the walk smoothly and hands back at the end', () => {
  assert.equal(attackWeight('windup', 0, 0), 0);
  assert.ok(near(attackWeight('windup', 0.08, 0.3), 1) && attackWeight('windup', 0.04, 0.2) > 0 && attackWeight('windup', 0.04, 0.2) < 1);
  assert.equal(attackWeight('recover', 0, 0), 1); assert.equal(attackWeight('recover', 0.1, 0.5), 1); assert.equal(attackWeight('recover', 0.3, 1), 0);
  let prev = 1; for (let i = 0; i <= 100; i++) { const w = attackWeight('recover', 0, i / 100); assert.ok(w <= prev + 1e-12, 'only ever fades out'); prev = w; }
});

test('the wind-up lasts long enough to read: at least 0.15 s, and the big one is the clearest', () => {
  for (const t of T3) assert.ok(TIERS[t].atk.windup >= 0.15 - 1e-9);
  assert.ok(TIERS.big.atk.windup >= 0.5 - 1e-9);
});
