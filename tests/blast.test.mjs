import test from 'node:test';
import assert from 'node:assert/strict';
import { launchBlast } from '../src/game/blast.js';
import { PelletSim } from '../src/game/pellets.js';
import { chooseAim } from '../src/game/assist.js';
import { Target } from '../src/game/targets.js';

const spec = { range: 15, damage: 12, falloffStart: 3.5, minDamage: 0.25 };
const noWorld = { boxes: [], circles: [] };
const angles = (n, half) => Array.from({ length: n }, (_, i) => (i / (n - 1) * 2 - 1) * half);
const run = ({ player = { x: 0, y: 0 }, reach = 1.64, side = 0.0624, aim = { x: 0, y: -1 }, targets, world = noWorld, n = 9, half = 8 * Math.PI / 180 }) => {
  const px = -aim.y, py = aim.x, sim = new PelletSim(), hits = [];
  const muzzle = { x: player.x + aim.x * reach + px * side, y: player.y + aim.y * reach + py * side };
  const res = launchBlast({ sim, from: player, muzzle, dir: aim, angles: angles(n, half), spec, speed: () => 55, world, targets, shot: 1, onHit: h => hits.push(h) });
  for (let i = 0; i < 300; i++) sim.step(1 / 120, world, targets, h => hits.push(h));
  return { res, hits, sim };
};

test('Sprout point-blank: dummy 1.111 away, 12 degrees off centre, both barrels, both sides', () => {
  for (const side of [-0.0624, 0.0624]) for (const deg of [12, -12, 0, 25]) {
    const a = deg * Math.PI / 180, d = 0.56 + 0.55 + 0.001, t = new Target({ x: Math.sin(a) * d, y: -Math.cos(a) * d });
    const { hits } = run({ targets: [t], side });
    const onTarget = hits.filter(h => h.kind === 'target');
    assert.equal(onTarget.length, 9, `side ${side} deg ${deg}: every pellet lands`);
    assert.ok(onTarget.every(h => h.damage === 12), 'point-blank is full damage');
  }
});

test('each pellet deals damage at most once, even when the muzzle starts inside the dummy', () => {
  const t = new Target({ x: 0, y: -1.2 });                       // muzzle at 1.64 is inside the dummy's 0.55 radius
  const { hits } = run({ targets: [t] });
  assert.equal(hits.filter(h => h.kind === 'target').length, 9);
});

test('a wall closer than the dummy stops the shot', () => {
  const world = { boxes: [{ x: 0, y: -0.7, hw: 2, hh: 0.1 }], circles: [] };
  const t = new Target({ x: 0, y: -1.4 });
  const { hits } = run({ targets: [t], world });
  assert.equal(hits.filter(h => h.kind === 'target').length, 0, 'no damage through the wall');
  assert.ok(hits.every(h => h.kind === 'wall'));
});

test('a dummy closer than the wall takes the hit and nothing goes through to the wall', () => {
  const world = { boxes: [{ x: 0, y: -1.8, hw: 2, hh: 0.1 }], circles: [] };
  const t = new Target({ x: 0, y: -1.0 });
  const { hits } = run({ targets: [t], world });
  assert.equal(hits.filter(h => h.kind === 'target').length, 9); assert.equal(hits.filter(h => h.kind === 'wall').length, 0);
});

test('a dummy beside or behind the player is not hit by a blast fired away from it', () => {
  const { hits } = run({ targets: [new Target({ x: 1.1, y: 0 }), new Target({ x: 0, y: 1.1 })] });
  assert.equal(hits.length, 0);
});

test('ordinary long shots still work and fall off with distance', () => {
  const near = run({ targets: [new Target({ x: 0, y: -9 })] }).hits.filter(h => h.kind === 'target');
  assert.ok(near.length >= 3); assert.ok(near.every(h => h.damage < 12 && h.damage > 3));
});

// ---- finding 2: who decides the aim direction
const tgt = [new Target({ x: 0, y: -8 })];
const opts = { mode: 'auto', coneDeg: 8, strength: 0.5, range: 18 };
test('auto mode: strafing east with the right stick centred still aims at the visible dummy to the north', () => {
  const a = chooseAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0, mag: 1 }, true, tgt, noWorld, opts);
  assert.ok(a.y < -0.99 && Math.abs(a.x) < 0.01); assert.equal(a.source, 'auto');
});
test('explicit right-stick aim beats the auto-target and the walking direction', () => {
  const a = chooseAim({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1, mag: 1 }, true, tgt, noWorld, opts);
  assert.ok(a.x > 0.9); assert.equal(a.source, 'explicit');
});
test('walking direction is the fallback only with no explicit aim and no valid auto-target', () => {
  const walls = { boxes: [{ x: 0, y: -4, hw: 3, hh: 0.2 }], circles: [] };
  const a = chooseAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0, mag: 1 }, true, tgt, walls, opts);
  assert.ok(a.x > 0.99); assert.equal(a.source, 'walk');
  const b = chooseAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0, mag: 1 }, true, tgt, noWorld, { ...opts, mode: 'assist' });
  assert.equal(b.source, 'walk', 'assist mode never auto-targets, so walking is the fallback');
  const c = chooseAim({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0, mag: 1 }, false, tgt, walls, opts);
  assert.equal(c.aiming, false, 'not firing: no walking-aim');
});
