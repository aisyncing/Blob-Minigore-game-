import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, createDualSense } from '../src/input/dualsense.js';
import { shapeMotor } from '../src/input/haptics.js';
import { healthColor, lightColor, createFlash, ledMask, ledPattern, scaleColor, hexRgb, COLORS } from '../src/input/lights.js';
import { createCalibration, STEPS } from '../src/input/calibrate.js';

const body = (o) => buildReport({ transport: 'usb', ...o }).full.slice(1);

/* ---------------- the output report: motors, lightbar, LEDs ---------------- */
test('a trigger-only report does not touch the motors, lightbar or LEDs', () => {
  const b = body({ right: { effect: 'off' } }); assert.equal(b[0], 0x04); assert.equal(b[1], 0); assert.equal(b[38], 0); assert.equal(b[2], 0); assert.equal(b[3], 0);
});
test('motors: heavy goes to the left byte, light to the right, with the motor flags on', () => {
  const b = body({ motors: { heavy: 200, light: 90 } });
  assert.equal(b[3], 200); assert.equal(b[2], 90); assert.equal(b[0] & 0x03, 0x03); assert.equal(b[38] & 0x04, 0x04); assert.equal(b[0] & 0x0c, 0, 'triggers untouched');
});
test('lightbar: colour bytes, the enable flags, and brightness', () => {
  const b = body({ light: [10, 200, 255], brightness: 2 });
  assert.deepEqual([b[44], b[45], b[46]], [10, 200, 255]); assert.equal(b[1] & 0x04, 0x04); assert.equal(b[38] & 0x03, 0x03); assert.equal(b[42], 2); assert.equal(b[41], 0);
});
test('player LEDs: the mask and its flag; null leaves them alone', () => {
  const b = body({ players: 0b10101 }); assert.equal(b[43], 21); assert.equal(b[1] & 0x10, 0x10); assert.equal(body({ players: null })[1] & 0x10, 0);
  assert.equal(body({ players: 0 })[1] & 0x10, 0x10, 'zero is a real value: all LEDs off');
});
test('one report can carry everything at once, and all of it is clamped to a byte', () => {
  const r = buildReport({ transport: 'usb', right: { effect: 'weapon', start: 3, end: 5, strength: 5 }, motors: { heavy: 999, light: -5 }, light: [300, -1, 7.6], players: 99, brightness: 9 });
  const b = r.full.slice(1); assert.equal(b[3], 255); assert.equal(b[2], 0); assert.deepEqual([b[44], b[45], b[46]], [255, 0, 8]); assert.equal(b[43], 31); assert.equal(b[42], 2); assert.equal(b[10], 0x25);
  for (const t of ['usb', 'bt-a', 'bt-b']) assert.ok([...buildReport({ transport: t, motors: { heavy: 255, light: 255 }, light: [255, 255, 255], players: 31 }).full].every(v => v >= 0 && v <= 255));
});
test('over Bluetooth the same body is wrapped and checksummed', () => {
  const r = buildReport({ transport: 'bt-a', motors: { heavy: 100, light: 50 }, light: [1, 2, 3] }); assert.equal(r.id, 0x31); assert.equal(r.full.length, 78); assert.equal(r.full[3 + 3], 100);
});

/* ---------------- the connection ---------------- */
const fake = () => {
  const sent = []; const dev = { vendorId: 0x054c, productId: 0x0ce6, productName: 'DualSense', opened: false, collections: [{ outputReports: [{ reportId: 2 }] }], async open() { this.opened = true; }, async close() { this.opened = false; }, async sendReport(id, data) { sent.push(Uint8Array.from(data)); }, addEventListener(t, f) { (this.l ||= {})[t] = f; }, removeEventListener() {} };
  return { dev, sent, hid: { requestDevice: async () => [dev], getDevices: async () => [], addEventListener() {} } };
};
const clock = () => { let t = 0; const q = []; return { now: () => t, schedule: (f, ms) => { const e = { at: t + ms, f, dead: false }; q.push(e); return e; }, clear: e => { if (e) e.dead = true; }, advance(ms) { const end = t + ms; for (;;) { const n = q.filter(e => !e.dead && e.at <= end).sort((a, b) => a.at - b.at)[0]; if (!n) break; t = n.at; n.dead = true; n.f(); } t = end; } }; };
const flushP = () => new Promise(r => setTimeout(r, 0));
test('rumble goes out through the controller, then stops by itself after its duration', async () => {
  const f = fake(), c = clock(), ds = createDualSense({ hid: f.hid, now: c.now, schedule: c.schedule, clear: c.clear }); await ds.connect();
  assert.equal(ds.rumble(0.8, 0.4, 100), true); c.advance(15); await flushP(); assert.equal(f.sent.at(-1)[3], 204); assert.equal(f.sent.at(-1)[2], 102);
  c.advance(120); await flushP(); assert.equal(f.sent.at(-1)[3], 0); assert.equal(f.sent.at(-1)[2], 0);
});
test('rumble reports failure when there is no controller, so the caller can use the browser instead', () => {
  assert.equal(createDualSense({ hid: undefined }).rumble(1, 1, 50), false);
});
test('a lightbar change and a trigger change share the connection without undoing each other', async () => {
  const f = fake(), c = clock(), ds = createDualSense({ hid: f.hid, now: c.now, schedule: c.schedule, clear: c.clear }); await ds.connect();
  ds.set({ right: { effect: 'weapon', start: 3, end: 5, strength: 5 } }); c.advance(20); await flushP(); ds.setLight([0, 255, 0], 0); c.advance(20); await flushP();
  const last = f.sent.at(-1); assert.equal(last[44], 0); assert.equal(last[45], 255); assert.equal(last[10], 0x25, 'the trigger effect is still in the report');
});
test('identical requests are not re-sent', async () => {
  const f = fake(), c = clock(), ds = createDualSense({ hid: f.hid, now: c.now, schedule: c.schedule, clear: c.clear }); await ds.connect();
  ds.setLight([5, 5, 5]); c.advance(20); await flushP(); assert.ok(f.sent.length >= 1); const n = f.sent.length; for (let i = 0; i < 10; i++) { ds.setLight([5, 5, 5]); c.advance(20); } await flushP(); assert.equal(f.sent.length, n);
});
test('the battery is read from the input report, ignoring anything that is not a battery byte', async () => {
  const f = fake(), ds = createDualSense({ hid: f.hid }); await ds.connect(); const rep = (b, id = 0x01) => { const d = new DataView(new ArrayBuffer(63)); d.setUint8(52 + (id === 0x31 ? 1 : 0), b); f.dev.l.inputreport({ reportId: id, data: d }); };
  rep(0x18); assert.deepEqual(ds.state.battery, { pct: Math.round(8.5 / 8 * 100) > 100 ? 100 : Math.round(8.5 / 8 * 100), charging: true, full: false });
  rep(0x04); assert.equal(ds.state.battery.pct, Math.round(4.5 / 8 * 100)); rep(0xf3); assert.equal(ds.state.battery.pct, Math.round(4.5 / 8 * 100), 'garbage ignored'); rep(0x24, 0x31); assert.equal(ds.state.battery.full, true);
});

/* ---------------- motor shaping ---------------- */
test('rumble is lifted above the motor start threshold and capped; zero stays zero', () => {
  assert.equal(shapeMotor(0, 0.2, 1), 0); assert.ok(Math.abs(shapeMotor(0.01, 0.2, 1) - 0.208) < 1e-9, 'a tiny tap still starts the motor'); assert.equal(shapeMotor(1, 0.2, 1), 1);
  assert.equal(shapeMotor(1, 0.2, 0.6), 0.6); assert.equal(shapeMotor(5, 0, 1), 1); assert.equal(shapeMotor(NaN, 0.2, 1), 0);
  let prev = 0; for (let i = 1; i <= 20; i++) { const v = shapeMotor(i / 20, 0.15, 0.9); assert.ok(v >= prev); prev = v; }
});

/* ---------------- lights ---------------- */
test('health colour runs green, amber, red', () => {
  assert.deepEqual(healthColor(1), COLORS.green); assert.deepEqual(healthColor(0.5), COLORS.amber); assert.deepEqual(healthColor(0), COLORS.red);
  const g = healthColor(0.75), r = healthColor(0.25); assert.ok(g[0] > COLORS.green[0] && g[1] > 200); assert.ok(r[0] > 200 && r[1] < COLORS.amber[1]);
});
test('in a run the lightbar follows health, pulses on the last hit, and menus use the hero colour', () => {
  const play = (hp, t = 0) => lightColor({ screen: 'play', hp, max: 3, t });
  assert.deepEqual(play(3), COLORS.green); assert.ok(play(2)[0] > play(3)[0]); const a = play(1, 0), b = play(1, 0.18); assert.notDeepEqual(a, b, 'a heartbeat pulse');
  assert.deepEqual(lightColor({ screen: 'menu', hero: [10, 20, 30] }), [10, 20, 30]); assert.deepEqual(lightColor({ screen: 'over' }), COLORS.dim);
});
test('a flash covers the colour and fades back to it', () => {
  const f = createFlash(); f.cue(COLORS.white, 0.4); const k0 = f.step(0); assert.equal(k0.k, 1);
  assert.deepEqual(lightColor({ screen: 'play', hp: 3, max: 3, flash: k0 }), COLORS.white); let k = f.step(0.1); assert.ok(k.k < 1 && k.k > 0); assert.equal(f.step(1), null);
  assert.deepEqual(lightColor({ screen: 'play', hp: 3, max: 3, flash: null }), COLORS.green);
});
test('the player LEDs fill from the middle out, and show ammo, a reload blink, or health', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(ledMask), [0, 4, 10, 21, 27, 31]);
  assert.equal(ledPattern({ mode: 'ammo', ammo: 30, capacity: 30 }), 31); assert.equal(ledPattern({ mode: 'ammo', ammo: 15, capacity: 30 }), 21); assert.equal(ledPattern({ mode: 'ammo', ammo: 1, capacity: 30 }), 4); assert.equal(ledPattern({ mode: 'ammo', ammo: 0, capacity: 30 }), 0);
  assert.notEqual(ledPattern({ mode: 'ammo', reloading: true, t: 0 }), ledPattern({ mode: 'ammo', reloading: true, t: 0.2 }), 'blinks while reloading');
  assert.equal(ledPattern({ mode: 'health', hp: 3, max: 3 }), 31); assert.equal(ledPattern({ mode: 'health', hp: 1, max: 3 }), 10); assert.equal(ledPattern({ mode: 'off' }), 0);
});
test('brightness scales a colour and hex colours convert', () => { assert.deepEqual(scaleColor([200, 100, 50], 0.5), [100, 50, 25]); assert.deepEqual(hexRgb('#ff7ab8'), [255, 122, 184]); });

/* ---------------- calibration ---------------- */
const press = (cal, at) => { for (let t = 0; t < at; t += 0.05) cal.update(0.05); cal.confirm(); };
test('calibration walks the steps in order, and A at a moment records the value at that moment', () => {
  let out = null; const cal = createCalibration({ onDone: r => { out = r; } }); cal.start();
  const first = cal.update(0.05); assert.equal(first.step, 'heavy'); assert.equal(first.drive.type, 'motor'); assert.equal(first.drive.motor, 'heavy');
  press(cal, 1.4);                                                     // felt the heavy motor 1.4 s into a 7 s ramp
  assert.equal(cal.update(0.05).step, 'light'); press(cal, 2.1);
  assert.equal(cal.update(0.05).step, 'trigger'); press(cal, 4);       // half way up a 1..8 ramp
  assert.equal(cal.update(0.05).step, 'hum'); press(cal, 6);
  assert.equal(cal.update(0.05).step, 'light-level'); press(cal, 3);
  assert.ok(out, 'done'); assert.ok(out.floor > 0.1 && out.floor < 0.3, `floor ${out.floor}`); assert.ok(out.triggerStrength >= 4 && out.triggerStrength <= 6); assert.ok(out.humAmplitude >= 6); assert.ok(out.lightLevel > 0.1);
});
test('a step that is never confirmed records its strongest value instead of hanging', () => {
  let out = null; const cal = createCalibration({ onDone: r => { out = r; } }); cal.start(); for (let t = 0; t < 60 && !out; t += 0.05) cal.update(0.05);
  assert.ok(out, 'it finishes by itself'); assert.equal(out.floor, 0.5); assert.equal(out.triggerStrength, 8);
});
test('the ramps start from nothing and rise, so what you feel first is what you pick', () => {
  const cal = createCalibration(); cal.start(); const a = cal.update(0.1).drive.level, b = cal.update(2).drive.level; assert.ok(a < 0.05 && b > a);
});
test('cancel stops it with no result, and it can be started again', () => {
  let n = 0; const cal = createCalibration({ onDone: () => n++ }); cal.start(); cal.update(1); cal.cancel(); assert.equal(cal.update(1), null); assert.equal(n, 0); cal.start(); assert.equal(cal.update(0.1).step, 'heavy');
});
test('every step has text for the player and a duration', () => { for (const s of STEPS) { assert.ok(s.title && s.hint && s.secs > 0); } });
