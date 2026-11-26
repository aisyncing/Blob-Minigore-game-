import test from 'node:test';
import assert from 'node:assert/strict';
import { Target, pathLength, pointAlong } from '../src/game/targets.js';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('damage reduces health, killing reports it once, overkill is clamped in dealt', () => {
  const t = new Target({ x: 0, y: 0, hp: 100 });
  assert.deepEqual(t.damage(30), { killed: false, dealt: 30 });
  const r = t.damage(500); assert.equal(r.killed, true); near(r.dealt, 70);
  assert.equal(t.alive, false); assert.deepEqual(t.damage(10), { killed: false, dealt: 0 });
});
test('a dead target respawns after its timer with full health', () => {
  const t = new Target({ x: 0, y: 0, hp: 50, respawn: 1 }); t.damage(50);
  let ev = null; for (let i = 0; i < 130 && !ev; i++) ev = t.update(1 / 120);
  assert.equal(ev, 'respawned'); assert.equal(t.alive, true); assert.equal(t.hp, 50);
});
test('negative or zero damage does nothing', () => {
  const t = new Target({ x: 0, y: 0 }); t.damage(-5); t.damage(0); assert.equal(t.hp, 100);
});
test('path length and position along a closed loop', () => {
  const sq = [[0, 0], [4, 0], [4, 3], [0, 3]];
  near(pathLength(sq), 14);
  let p = pointAlong(sq, 2); near(p.x, 2); near(p.y, 0); assert.deepEqual([p.dx, p.dy], [1, 0]);
  p = pointAlong(sq, 5); near(p.x, 4); near(p.y, 1); assert.deepEqual([p.dx, p.dy], [0, 1]);
  p = pointAlong(sq, 14 + 2); near(p.x, 2); near(p.y, 0);        // wraps
});
test('a patrolling target moves at its speed and loops forever', () => {
  const t = new Target({ x: 0, y: 0, path: [[0, 0], [10, 0], [10, 10], [0, 10]], speed: 4 });
  let dist = 0, px = t.x, py = t.y;
  for (let i = 0; i < 120 * 30; i++) { t.update(1 / 120); dist += Math.hypot(t.x - px, t.y - py); px = t.x; py = t.y; }
  near(dist, 4 * 30, 0.2);
});
test('phase offsets spread patrollers around the loop', () => {
  const path = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const a = new Target({ x: 0, y: 0, path, phase: 0 }), b = new Target({ x: 0, y: 0, path, phase: 0.5 });
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 5);
});
