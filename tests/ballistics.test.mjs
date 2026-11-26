import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentVsCircle, segmentVsBox, raycast, hasLineOfSight } from '../src/game/ballistics.js';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('segment hits a circle at the right fraction', () => {
  near(segmentVsCircle(0, 0, 10, 0, { x: 5, y: 0, r: 1 }), 0.4);
});
test('segment that misses, stops short, or points away returns null', () => {
  assert.equal(segmentVsCircle(0, 0, 10, 0, { x: 5, y: 3, r: 1 }), null);
  assert.equal(segmentVsCircle(0, 0, 3, 0, { x: 5, y: 0, r: 1 }), null);
  assert.equal(segmentVsCircle(0, 0, -10, 0, { x: 5, y: 0, r: 1 }), null);
});
test('segment starting inside a circle hits at t=0', () => {
  assert.equal(segmentVsCircle(5, 0, 10, 0, { x: 5, y: 0, r: 1 }), 0);
});
test('a grazing segment at exactly the radius still counts, just past it does not', () => {
  assert.notEqual(segmentVsCircle(0, 1, 10, 1, { x: 5, y: 0, r: 1 }), null);
  assert.equal(segmentVsCircle(0, 1.001, 10, 1.001, { x: 5, y: 0, r: 1 }), null);
});
test('box: hits the near face with the right normal', () => {
  const h = segmentVsBox(0, 0, 10, 0, { x: 5, y: 0, hw: 1, hh: 1 });
  near(h.t, 0.4); assert.deepEqual([h.nx, h.ny], [-1, 0]);
  const v = segmentVsBox(0, -10, 0, 0, { x: 0, y: -5, hw: 1, hh: 1 });
  assert.deepEqual([v.nx, v.ny], [0, -1]);
});
test('box: misses, parallel miss, and starting inside', () => {
  assert.equal(segmentVsBox(0, 3, 10, 3, { x: 5, y: 0, hw: 1, hh: 1 }), null);
  assert.equal(segmentVsBox(0, 0, 3, 0, { x: 5, y: 0, hw: 1, hh: 1 }), null);
  near(segmentVsBox(5, 0, 9, 0, { x: 5, y: 0, hw: 1, hh: 1 }).t, 0);
});
test('raycast returns the nearest of several things, and ignores dead targets', () => {
  const world = { boxes: [{ x: 8, y: 0, hw: 0.5, hh: 5 }], circles: [] };
  const targets = [{ x: 4, y: 0, r: 0.5, alive: true }, { x: 2, y: 0, r: 0.5, alive: false }];
  const h = raycast(0, 0, 20, 0, world, targets);
  assert.equal(h.kind, 'target'); near(h.x, 3.5);
  const w = raycast(0, 0, 20, 0, world, [{ x: 12, y: 0, r: 0.5, alive: true }]);
  assert.equal(w.kind, 'wall'); near(w.x, 7.5);
});
test('line of sight is blocked by props and walls only', () => {
  const world = { boxes: [{ x: 5, y: 0, hw: 0.5, hh: 0.5 }], circles: [{ x: 0, y: 5, r: 1 }] };
  assert.equal(hasLineOfSight(0, 0, 10, 0, world), false);
  assert.equal(hasLineOfSight(0, 0, 0, 10, world), false);
  assert.equal(hasLineOfSight(0, 0, 10, 10, world), true);
});
