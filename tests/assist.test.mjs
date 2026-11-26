import test from 'node:test';
import assert from 'node:assert/strict';
import { assistAim } from '../src/game/assist.js';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const W = { boxes: [], circles: [] };
const T = (x, y, r = 0.55) => ({ x, y, r, alive: true });
const yawOf = d => Math.atan2(d.x, d.y);

test('manual never changes the aim', () => {
  const r = assistAim({ x: 0, y: 0 }, { x: 0, y: -1 }, [T(0.3, -8)], W, { mode: 'manual' });
  assert.deepEqual([r.x, r.y], [0, -1]);
});
test('assist bends the aim toward a target near the line, and never past it', () => {
  const d0 = { x: Math.sin(0.1), y: -Math.cos(0.1) };                 // aiming slightly off a target straight up
  const r = assistAim({ x: 0, y: 0 }, d0, [T(0, -8)], W, { mode: 'assist', coneDeg: 10, strength: 1 });
  const before = Math.abs(yawOf(d0) - Math.PI), after = Math.abs(yawOf(r) - Math.PI);
  assert.ok(after < before, 'moved toward the target'); assert.ok(after >= 0);
  assert.equal(r.target.y, -8);
});
test('assist does nothing when no target is near the line', () => {
  const r = assistAim({ x: 0, y: 0 }, { x: 1, y: 0 }, [T(0, -8)], W, { mode: 'assist', coneDeg: 8, strength: 1 });
  assert.deepEqual([r.x, r.y], [1, 0]); assert.equal(r.target, null);
});
test('assist strength 0 is the same as manual', () => {
  const d = { x: Math.sin(0.1), y: -Math.cos(0.1) };
  const r = assistAim({ x: 0, y: 0 }, d, [T(0, -8)], W, { mode: 'assist', strength: 0 });
  near(r.x, d.x); near(r.y, d.y);
});
test('assist never aims through a wall', () => {
  const walled = { boxes: [{ x: 0, y: -4, hw: 3, hh: 0.3 }], circles: [] };
  const d = { x: Math.sin(0.05), y: -Math.cos(0.05) };
  const r = assistAim({ x: 0, y: 0 }, d, [T(0, -8)], walled, { mode: 'assist', coneDeg: 12, strength: 1 });
  near(r.x, d.x); assert.equal(r.target, null);
});
test('assist ignores dead targets and targets out of range', () => {
  const d = { x: Math.sin(0.05), y: -Math.cos(0.05) };
  assert.equal(assistAim({ x: 0, y: 0 }, d, [{ ...T(0, -8), alive: false }], W, { coneDeg: 12 }).target, null);
  assert.equal(assistAim({ x: 0, y: 0 }, d, [T(0, -40)], W, { coneDeg: 12, range: 18 }).target, null);
});
test('assist picks the target nearest the line, not just the nearest', () => {
  const d = { x: 0, y: -1 };
  const r = assistAim({ x: 0, y: 0 }, d, [T(2.2, -8), T(0.1, -10)], W, { coneDeg: 20, strength: 1 });
  assert.equal(r.target.x, 0.1);
});
test('auto aims at the nearest visible target only when the stick is idle', () => {
  const targets = [T(5, 0), T(0, -9)];
  const idle = assistAim({ x: 0, y: 0 }, { x: 0, y: 0 }, targets, W, { mode: 'auto' });
  assert.equal(idle.aiming, true); near(idle.x, 1); near(idle.y, 0);
  const held = assistAim({ x: 0, y: 0 }, { x: 0, y: 1 }, targets, W, { mode: 'auto', coneDeg: 4, strength: 0 });
  near(held.y, 1);
});
test('auto with nothing visible reports not aiming', () => {
  const r = assistAim({ x: 0, y: 0 }, { x: 0, y: 0 }, [], W, { mode: 'auto' });
  assert.equal(r.aiming, false);
});
