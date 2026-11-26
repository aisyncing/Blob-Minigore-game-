// createInput with a fake DOM: finding 4 (lost taps) and finding 5 (stick drift blocking the keyboard)
import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {}; const targetH = {};
globalThis.addEventListener = (t, f) => (handlers[t] ||= []).push(f);
globalThis.document = { activeElement: null };
const fire = (t, e = {}) => (handlers[t] || []).forEach(f => f({ code: '', preventDefault() {}, target: {}, ...e }));
const target = { addEventListener: (t, f) => (targetH[t] ||= []).push(f), setPointerCapture() {} };
const tfire = (t, e = {}) => (targetH[t] || []).forEach(f => f({ button: 0, pointerId: 1, clientX: 0, clientY: 0, ...e }));
const { createInput } = await import('../src/input/source.js');
let pads = [];
const tuning = { stick: () => ({ inner: 0.12, outer: 0.95, curve: 1 }), trigger: () => ({ press: 0.5, release: 0.35 }) };
const input = createInput({ target, toWorld: () => ({ x: 0, y: -5 }), origin: () => ({ x: 0, y: 0 }), tuning, getPads: () => pads });
const mkpad = (axes = [0, 0, 0, 0], rt = 0) => ({ id: 'p', index: 0, connected: true, mapping: 'standard', timestamp: 1, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 7 && rt > 0.5, value: i === 7 ? rt : 0 })) });

test('a complete Space tap between rendered frames is delivered to the simulation exactly once', () => {
  input.sample(0);
  fire('keydown', { code: 'Space' }); fire('keyup', { code: 'Space' });         // press and release between two frames
  const s = input.sample(16);
  assert.equal(s.fire, true, 'the tap is visible to the next sample');
  input.sample(32);                                                              // a render frame with no simulation step in between
  assert.equal(input.snap.fire, true, 'and it survives frames that run no simulation step');
  assert.equal(input.consumeTap(), true); assert.equal(input.snap.fire, false, 'consumed by one step: no repeat');
  assert.equal(input.consumeTap(), false);
  assert.equal(input.sample(48).fire, false);
});
test('a left click between frames is delivered once', () => {
  tfire('pointerdown'); tfire('pointerup');
  assert.equal(input.sample(100).fire, true); assert.equal(input.consumeTap(), true); assert.equal(input.sample(116).fire, false);
});
test('holding fire keeps firing across steps (the tap latch does not interfere)', () => {
  fire('keydown', { code: 'Space' }); input.sample(200);
  assert.equal(input.consumeTap(), true); assert.equal(input.snap.fire, true, 'still held');
  input.sample(216); assert.equal(input.snap.fire, true); assert.equal(input.consumeTap(), false);
  fire('keyup', { code: 'Space' }); assert.equal(input.sample(232).fire, false);
});
test('window blur drops a pending tap', () => { fire('keydown', { code: 'Space' }); fire('keyup', { code: 'Space' }); fire('blur'); assert.equal(input.sample(300).fire, false); });

test('a pad resting at 0.08 with a 0.12 inner deadzone does not block the keyboard', () => {
  pads = [mkpad([0.08, 0, 0, 0])];
  fire('keydown', { code: 'KeyD' }); const s = input.sample(400);
  assert.equal(s.source, 'keyboard'); assert.ok(s.move.x > 0.99, 'D moves the hero normally');
  fire('keyup', { code: 'KeyD' });
});
test('a deliberate controller input still takes over from the keyboard', () => {
  pads = [mkpad([-0.6, 0, 0, 0])]; fire('keydown', { code: 'KeyD' }); const s = input.sample(500);
  assert.equal(s.source, 'controller'); assert.ok(s.move.x < -0.3, 'the stick wins');
  fire('keyup', { code: 'KeyD' });
});
test('a held trigger on the pad also counts as deliberate', () => {
  pads = [mkpad([0, 0, 0, 0], 1)]; fire('keydown', { code: 'KeyD' }); assert.equal(input.sample(600).source, 'controller'); fire('keyup', { code: 'KeyD' }); pads = [];
});
