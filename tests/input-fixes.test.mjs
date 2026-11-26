import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTrigger, effectiveTrigger, createDriftSession } from '../src/input/process.js';

// ---- finding 10: trigger chatter
test('trigger held at 0.50 with both thresholds 0.50 does not alternate', () => {
  const t = makeTrigger(), cfg = { press: 0.5, release: 0.5 }, out = [];
  for (let i = 0; i < 20; i++) out.push(t.update(0.5, cfg));
  assert.deepEqual([...new Set(out)], [true], 'pressed at 0.50 and stays pressed while held there');
  assert.equal(t.update(0.2, cfg), false, 'releases once clearly below');
  assert.equal(t.update(0.5, cfg), true);
});
test('a release threshold above the press threshold is clamped below it', () => {
  const e = effectiveTrigger({ press: 0.4, release: 0.8 });
  assert.equal(e.press, 0.4); assert.ok(e.release < e.press);
  const t = makeTrigger(); const states = []; for (const v of [0.45, 0.45, 0.45, 0.45]) states.push(t.update(v, { press: 0.4, release: 0.8 }));
  assert.deepEqual([...new Set(states)], [true]);
});
test('effective thresholds are always release < press and within range', () => {
  for (const press of [0.05, 0.3, 0.5, 0.95]) for (const release of [0.0, 0.02, 0.35, 0.5, 0.9]) {
    const e = effectiveTrigger({ press, release }); assert.ok(e.release < e.press && e.release >= 0 && e.press <= 1, JSON.stringify({ press, release, e }));
  }
  assert.deepEqual(effectiveTrigger({ press: 0.5, release: 0.35 }), { press: 0.5, release: 0.35 }, 'sensible settings are unchanged');
});

// ---- finding 9: drift calibration sessions
const pad = (id = 'padA', index = 0, l = { x: 0.05, y: 0 }, r = { x: 0, y: 0.02 }) => ({ connected: true, id, index, left: l, right: r });
test('a drift session measures only the identified pad, over the whole window', () => {
  const s = createDriftSession(pad(), 0, 1000);
  for (let t = 0; t < 1000; t += 100) s.push(t, pad());
  assert.equal(s.push(1000, pad()), 'done'); assert.ok(Math.abs(s.result.left.max - 0.05) < 1e-9); assert.ok(s.result.left.count >= 10);
});
test('the session cancels when the pad disconnects or a different pad appears', () => {
  let s = createDriftSession(pad(), 0, 1000); s.push(100, pad());
  assert.equal(s.push(200, { connected: false }), 'cancelled'); assert.match(s.reason, /disconnect/i);
  s = createDriftSession(pad(), 0, 1000); assert.equal(s.push(100, pad('padB', 1)), 'cancelled'); assert.match(s.reason, /different|changed/i);
  s = createDriftSession(pad(), 0, 1000); assert.equal(s.push(100, pad('padA', 2)), 'cancelled');
});
test('a session cannot start without a connected pad, and results apply only to the same pad', () => {
  assert.equal(createDriftSession({ connected: false }, 0, 1000).state, 'cancelled');
  const s = createDriftSession(pad(), 0, 100); s.push(100, pad());
  assert.equal(s.canApply(pad()), true); assert.equal(s.canApply(pad('padB', 1)), false); assert.equal(s.canApply({ connected: false }), false);
});
