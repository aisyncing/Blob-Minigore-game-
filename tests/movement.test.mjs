import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVelocity, moveStats, MOVE_DEFAULTS, angDiff } from '../src/game/movement.js';

const DT = 1 / 120;
const run = (v, input, params, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) stepVelocity(v, input, params, DT); return v; };
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b} (±${eps})`);
const speed = v => Math.hypot(v.x, v.y);

test('full push reaches top speed in maxSpeed/accel seconds and never overshoots', () => {
  const v = { x: 0, y: 0 }; let t = null, peak = 0;
  for (let i = 0; i < 240; i++) { stepVelocity(v, { x: 1, y: 0 }, {}, DT); peak = Math.max(peak, speed(v)); if (t === null && speed(v) >= MOVE_DEFAULTS.maxSpeed - 1e-9) t = (i + 1) * DT; }
  near(t, MOVE_DEFAULTS.maxSpeed / MOVE_DEFAULTS.accel, DT * 1.5);
  assert.ok(peak <= MOVE_DEFAULTS.maxSpeed + 1e-9);
});
test('diagonals are not faster than straight lines', () => {
  const v = run({ x: 0, y: 0 }, { x: 1, y: 1 }, {}, 1);
  near(speed(v), MOVE_DEFAULTS.maxSpeed, 1e-6);
});
test('stick size sets speed: a gentle push walks slowly', () => {
  const v = run({ x: 0, y: 0 }, { x: 0.3, y: 0 }, {}, 1);
  near(v.x, 0.3 * MOVE_DEFAULTS.maxSpeed, 1e-6);
});
test('input above 1 is clamped (e.g. a bad stick reading)', () => {
  const v = run({ x: 0, y: 0 }, { x: 5, y: 0 }, {}, 1);
  near(speed(v), MOVE_DEFAULTS.maxSpeed, 1e-6);
});
test('letting go stops in maxSpeed/brake seconds', () => {
  const v = { x: MOVE_DEFAULTS.maxSpeed, y: 0 }; let t = null;
  for (let i = 0; i < 240; i++) { stepVelocity(v, { x: 0, y: 0 }, {}, DT); if (t === null && speed(v) < 1e-9) t = (i + 1) * DT; }
  near(t, MOVE_DEFAULTS.maxSpeed / MOVE_DEFAULTS.brake, DT * 1.5);
});
test('easing off the stick uses brake, not accel', () => {
  const v = { x: MOVE_DEFAULTS.maxSpeed, y: 0 };
  stepVelocity(v, { x: 0.5, y: 0 }, { accel: 10, brake: 100 }, DT);
  near(v.x, MOVE_DEFAULTS.maxSpeed - 100 * DT, 1e-9);
});
test('reversing is snappier than braking and then accelerating', () => {
  const rev = { x: MOVE_DEFAULTS.maxSpeed, y: 0 }; let t = null;
  for (let i = 0; i < 480; i++) { stepVelocity(rev, { x: -1, y: 0 }, {}, DT); if (t === null && rev.x <= -MOVE_DEFAULTS.maxSpeed + 1e-9) t = (i + 1) * DT; }
  const sloppy = MOVE_DEFAULTS.maxSpeed / MOVE_DEFAULTS.brake + MOVE_DEFAULTS.maxSpeed / MOVE_DEFAULTS.accel;
  assert.ok(t < sloppy, `${t} should beat ${sloppy}`);
  near(t, moveStats({}).reverseTime, DT * 2);
});
test('higher turnAccel shortens the reversal', () => {
  const t = tA => { const v = { x: 7.5, y: 0 }; for (let i = 0; i < 480; i++) { stepVelocity(v, { x: -1, y: 0 }, { turnAccel: tA }, DT); if (v.x <= -7.5 + 1e-9) return i; } return Infinity; };
  assert.ok(t(200) < t(110) && t(110) < t(60));
});
test('a sideways turn at speed keeps the total speed from collapsing', () => {
  const v = { x: 7.5, y: 0 };
  let minSpeed = 99;
  for (let i = 0; i < 120; i++) { stepVelocity(v, { x: 0, y: 1 }, {}, DT); minSpeed = Math.min(minSpeed, speed(v)); }
  assert.ok(minSpeed > 7.5 * 0.7, 'turn dipped to ' + minSpeed);
});
test('frame-rate independent: 60 Hz and 120 Hz agree after 0.2 s', () => {
  const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  for (let i = 0; i < 24; i++) stepVelocity(a, { x: 1, y: 0.5 }, {}, 1 / 120);
  for (let i = 0; i < 12; i++) stepVelocity(b, { x: 1, y: 0.5 }, {}, 1 / 60);
  near(speed(a), speed(b), 0.05);
});
test('deterministic', () => {
  const go = () => { const v = { x: 0, y: 0 }; for (let i = 0; i < 500; i++) stepVelocity(v, { x: Math.sin(i / 17), y: Math.cos(i / 29) }, {}, DT); return [v.x, v.y]; };
  assert.deepEqual(go(), go());
});
test('zero input at rest does nothing and does not produce NaN', () => {
  const v = { x: 0, y: 0 }; stepVelocity(v, { x: 0, y: 0 }, {}, DT);
  assert.deepEqual(v, { x: 0, y: 0 });
});
test('derived stats match the maths', () => {
  const s = moveStats({ maxSpeed: 8, accel: 80, brake: 40, turnAccel: 160 });
  near(s.timeToTop, 0.1, 1e-9); near(s.stopTime, 0.2, 1e-9); near(s.stopDistance, 0.8, 1e-9); near(s.reverseTime, 8 / 160 + 8 / 80, 1e-9);
});
test('angDiff takes the short way round', () => {
  near(angDiff(0.1, -0.1), -0.2, 1e-9);
  near(angDiff(Math.PI - 0.1, -Math.PI + 0.1), 0.2, 1e-9);
});
