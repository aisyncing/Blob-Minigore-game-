import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeStick, curveAt, makeTrigger, analyseRest, digitalAxes, mouseAim } from '../src/input/process.js';
import { createPadReader } from '../src/input/pad.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('inside the inner deadzone reads exactly zero', () => {
  const r = shapeStick(0.1, -0.05, { inner: 0.15 });
  assert.deepEqual([r.x, r.y, r.mag], [0, 0, 0]);
});
test('rest drift at the inner edge is still zero (<=)', () => {
  assert.equal(shapeStick(0.15, 0, { inner: 0.15 }).mag, 0);
});
test('output rises from 0 at the inner edge to 1 at the outer edge', () => {
  const cfg = { inner: 0.2, outer: 0.9, curve: 1 };
  near(shapeStick(0.2 + 1e-9, 0, cfg).mag, 0, 1e-6);
  near(shapeStick(0.55, 0, cfg).mag, 0.5);
  near(shapeStick(0.9, 0, cfg).mag, 1);
  near(shapeStick(1.0, 0, cfg).mag, 1);
});
test('direction is preserved and diagonal magnitude is not inflated', () => {
  const r = shapeStick(-0.6, 0.6, { inner: 0.1, outer: 1, curve: 1 });
  assert.ok(r.x < 0 && r.y > 0);
  near(Math.abs(r.x), Math.abs(r.y));
  near(Math.hypot(r.x, r.y), r.mag);
  assert.ok(r.mag <= 1);
});
test('curve > 1 softens, curve < 1 sharpens, 1 is linear', () => {
  const base = { inner: 0, outer: 1 };
  near(curveAt(0.5, { ...base, curve: 1 }), 0.5);
  near(curveAt(0.5, { ...base, curve: 2 }), 0.25);
  assert.ok(curveAt(0.5, { ...base, curve: 0.5 }) > 0.5);
});
test('NaN or undefined axes do not poison the result', () => {
  const r = shapeStick(NaN, undefined, {});
  assert.deepEqual([r.x, r.y, r.mag], [0, 0, 0]);
});
test('degenerate outer <= inner does not divide by zero', () => {
  const r = shapeStick(0.5, 0, { inner: 0.5, outer: 0.4 });
  assert.ok(Number.isFinite(r.mag));
});
test('trigger has hysteresis', () => {
  const t = makeTrigger({ press: 0.5, release: 0.3 });
  assert.equal(t.update(0.4), false);
  assert.equal(t.update(0.5), true);
  assert.equal(t.update(0.4), true);   // stays down between thresholds
  assert.equal(t.update(0.3), false);
  assert.equal(t.update(0.4), false);  // stays up between thresholds
});
test('trigger release above press is clamped so it can never stick down', () => {
  const t = makeTrigger();
  t.update(1, { press: 0.4, release: 0.9 });
  assert.equal(t.update(0.39, { press: 0.4, release: 0.9 }), false);
});
test('drift analysis suggests a deadzone above the worst rest sample', () => {
  const r = analyseRest([{ x: 0.02, y: 0.01 }, { x: -0.03, y: 0.04 }, { x: 0.01, y: -0.02 }]);
  near(r.max, 0.05);
  assert.ok(r.suggested > r.max && r.suggested <= 0.4);
});
test('a clean stick still gets a sensible minimum deadzone', () => {
  assert.equal(analyseRest([{ x: 0, y: 0 }]).suggested, 0.05);
});

// --- pad reader with a fake Gamepad API ---
const fakePad = (o = {}) => ({ connected: true, index: 0, id: 'Fake (STANDARD GAMEPAD)', mapping: 'standard', timestamp: 1,
  axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), ...o });

test('pad reader maps a standard pad', () => {
  const pad = fakePad({ axes: [0.5, -0.25, 0.1, 0.9] });
  pad.buttons[7] = { pressed: true, value: 0.8 };
  const p = createPadReader(() => [pad]).poll(0);
  assert.equal(p.connected, true);
  assert.deepEqual(p.left, { x: 0.5, y: -0.25 });
  assert.deepEqual(p.right, { x: 0.1, y: 0.9 });
  near(p.rt, 0.8);
  assert.equal(p.standard, true);
});
test('pad reader reports no controller cleanly', () => {
  const p = createPadReader(() => [null, null]).poll(0);
  assert.equal(p.connected, false);
});
test('pad reader survives the API throwing (blocked in a frame)', () => {
  const p = createPadReader(() => { const e = new Error('blocked'); e.name = 'SecurityError'; throw e; }).poll(0);
  assert.equal(p.connected, false);
  assert.equal(p.apiError, 'SecurityError');
});
test('pad reader follows whichever pad is being used', () => {
  const a = fakePad({ index: 0 }), b = fakePad({ index: 1 });
  const r = createPadReader(() => [a, b]);
  assert.equal(r.poll(0).index, 0);
  b.buttons[0] = { pressed: true, value: 1 };
  assert.equal(r.poll(16).index, 1);
});
test('pad reader estimates update rate from timestamps', () => {
  const pad = fakePad();
  const r = createPadReader(() => [pad]);
  let last;
  for (let i = 0; i < 300; i++) { pad.timestamp = i; last = r.poll(i * 10); }   // 100 Hz for 3 s
  assert.ok(last.updateHz > 80 && last.updateHz < 120, 'got ' + last.updateHz);
});

// --- keyboard and mouse standby ---
test('keyboard diagonal is normalised, not faster', () => {
  const d = digitalAxes({ up: true, right: true });
  near(Math.hypot(d.x, d.y), 1);
  assert.ok(d.x > 0 && d.y < 0);
});
test('opposite keys cancel', () => {
  assert.deepEqual(digitalAxes({ left: true, right: true }), { x: 0, y: 0, mag: 0 });
  assert.equal(digitalAxes({}).mag, 0);
});
test('mouse aim points from the player at the cursor', () => {
  const a = mouseAim({ x: 2, y: 2 }, { x: 2, y: -6 });
  near(a.x, 0); near(a.y, -1); near(a.dist, 8);
  const b = mouseAim({ x: 0, y: 0 }, { x: 3, y: 4 });
  near(b.x, 0.6); near(b.y, 0.8);
});
test('mouse aim keeps the last direction when the cursor sits on the player', () => {
  const a = mouseAim({ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 2 });
  near(a.x, 0); near(a.y, 1);
});
test('mouse aim survives bad numbers', () => {
  const a = mouseAim({ x: NaN, y: 0 }, { x: 5, y: undefined });
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
});
