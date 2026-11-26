import test from 'node:test';
import assert from 'node:assert/strict';
import { stepSpring } from '../src/engine/spring.js';

const settle = (dts, k = 260, c = 14, x0 = 0, target = 1) => { const s = { x: x0, v: 0 }; let max = -Infinity, min = Infinity;
  for (const dt of dts) { stepSpring(s, k, c, target, dt); max = Math.max(max, s.x); min = Math.min(min, s.x); } return { s, max, min }; };
const rep = (dt, secs) => Array(Math.round(secs / dt)).fill(dt);

test('the pop spring settles at 1 for 10, 30 and 60 fps and for repeated 100 ms frames', () => {
  for (const dt of [1 / 60, 1 / 30, 1 / 10, 0.1]) {
    const { s, max } = settle(rep(dt, 3));
    assert.ok(Math.abs(s.x - 1) < 1e-3, `dt ${dt}: settles at 1 (got ${s.x})`); assert.ok(max < 1.35, `dt ${dt}: overshoot stays sensible (max ${max})`);
  }
});
test('results barely depend on frame rate', () => {
  const a = settle(rep(1 / 60, 0.3)).s.x, b = settle(rep(1 / 10, 0.3)).s.x; assert.ok(Math.abs(a - b) < 0.1, `${a} vs ${b}`);
});
test('stiffer springs used for tilt and squash are stable at 100 ms too', () => {
  for (const [k, c] of [[140, 7], [200, 9]]) { const { s, max, min } = settle(rep(0.1, 3), k, c, 0.5, 0); assert.ok(Math.abs(s.x) < 1e-3 && max < 1 && min > -1, `k ${k}`); }
});
test('a huge or invalid dt cannot blow up', () => {
  const s = { x: 0, v: 0 }; stepSpring(s, 260, 14, 1, 5); stepSpring(s, 260, 14, 1, NaN); stepSpring(s, 260, 14, 1, -1);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x) < 5);
});
