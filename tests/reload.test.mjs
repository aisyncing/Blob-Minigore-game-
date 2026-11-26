import test from 'node:test';
import assert from 'node:assert/strict';
import { reloadPose, crossed, REL, RELOAD_EVENTS } from '../src/hero/reload.js';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('idle pose is a closed gun with the hand on the forend', () => {
  assert.deepEqual(reloadPose(-1), { barrelOpen: 0, hand: 'forend', t: 0, shellsInHand: false, beltTaken: false });
});
test('the barrels start closed, are fully open while the hand works, and end closed', () => {
  near(reloadPose(0).barrelOpen, 0); near(reloadPose(REL.open).barrelOpen, 1);
  for (let p = REL.open; p < REL.insert; p += 0.01) near(reloadPose(p).barrelOpen, 1);
  near(reloadPose(REL.close - 1e-9).barrelOpen, 0, 1e-6); near(reloadPose(1).barrelOpen, 0);
});
test('barrel opening is continuous (no jumps) across the whole reload', () => {
  let prev = reloadPose(0).barrelOpen;
  for (let p = 0.001; p <= 1; p += 0.001) { const o = reloadPose(p).barrelOpen; assert.ok(Math.abs(o - prev) < 0.05, `jump at ${p}`); prev = o; }
});
test('the hand visits belt then breech then forend, in that order, with trip fraction 0..1', () => {
  const order = []; for (let p = 0; p <= 1; p += 0.005) { const h = reloadPose(p).hand; if (order[order.length - 1] !== h) order.push(h); }
  assert.deepEqual(order, ['forend', 'toBelt', 'toBreech', 'liftAway', 'toForend']);
  near(reloadPose(REL.open).t, 0); near(reloadPose(REL.grab - 1e-9).t, 1, 1e-6); near(reloadPose(REL.insert - 1e-9).t, 1, 1e-6);
});
test('shells are in the hand only between grab and insert; belt is short two shells until the refill', () => {
  assert.equal(reloadPose(REL.grab - 0.01).shellsInHand, false); assert.equal(reloadPose(REL.grab + 0.01).shellsInHand, true);
  assert.equal(reloadPose(REL.insert - 0.01).shellsInHand, true); assert.equal(reloadPose(REL.insert + 0.01).shellsInHand, false);
  assert.equal(reloadPose(0.5).beltTaken, true); assert.equal(reloadPose(0.95).beltTaken, false); assert.equal(reloadPose(0.1).beltTaken, false);
});
test('events fire exactly once and in order, for any frame step', () => {
  for (const step of [0.001, 0.007, 0.05, 0.13, 0.3, 0.9, 1]) {
    const seen = []; let prev = -1;
    for (let p = 0; p <= 1 + 1e-9; p = Math.min(1, p + step)) { seen.push(...crossed(prev, p)); prev = p; if (p >= 1) break; }
    assert.deepEqual(seen, RELOAD_EVENTS.map(e => e.name), `step ${step}`);
  }
});
test('a new reload starting again re-arms the events (progress goes back down)', () => {
  assert.deepEqual(crossed(0.95, 0.05), []);
  assert.deepEqual(crossed(-1, 0.2), ['eject']);
  assert.deepEqual(crossed(0.95, -1), []);
  assert.deepEqual(crossed(0.9, 0.1), []);
  assert.deepEqual(crossed(0.9, 0.3), ['eject', 'grab']);
});
