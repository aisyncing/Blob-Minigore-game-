import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTrigger, buildReport, crc32, BT_LAYOUTS } from '../src/input/dualsense.js';
import { RUMBLE, rumblePattern, barrelPattern, triggerPlan, TRIGGER_FEEL, createHaptics, KICK_MS } from '../src/input/haptics.js';

const hex = u => [...u].map(v => v.toString(16).padStart(2, '0')).join(' ');

/* ---- trigger byte encodings. Expected vectors are worked out by hand from the formulas in dualsense-ts / pydualsense (see dualsense.js header). */
test('weapon: wall from zone 3 to zone 5, strength 6 -> 25 28 00 05', () => assert.equal(hex(encodeTrigger({ effect: 'weapon', start: 3, end: 5, strength: 6 })), '25 28 00 05 00 00 00 00 00 00 00'));
test('weapon: start and end are clamped into the legal ranges (start 2-7, end start+1..8)', () => {
  assert.equal(hex(encodeTrigger({ effect: 'weapon', start: 0, end: 0, strength: 99 })).slice(0, 11), '25 0c 00 07');     // start 2, end 3, strength 8 -> 7
  assert.equal(hex(encodeTrigger({ effect: 'weapon', start: 9, end: 20, strength: -4 })).slice(0, 11), '25 80 01 00');    // start 7, end 8 -> zone bits 7 and 8 = 0x180, strength 1 -> 0
});
test('feedback from zone 2 at strength 8: zones 2-9 active, 3 bits of force each', () => assert.equal(hex(encodeTrigger({ effect: 'feedback', position: 2, strength: 8 })), '21 fc 03 c0 ff ff 3f 00 00 00 00'));
test('locked feel = feedback from zone 1 at full strength', () => assert.equal(hex(encodeTrigger(TRIGGER_FEEL.locked)), '21 fe 03 f8 ff ff 3f 00 00 00 00'));
test('vibration from zone 0, amplitude 8, 45 Hz', () => assert.equal(hex(encodeTrigger({ effect: 'vibration', position: 0, amplitude: 8, frequency: 45 })), '26 ff 03 ff ff ff 3f 00 00 2d 00'));
test('off is mode 0x05 with empty parameters; unknown effects are off too', () => { assert.equal(hex(encodeTrigger({ effect: 'off' })), '05 00 00 00 00 00 00 00 00 00 00'); assert.equal(encodeTrigger({ effect: 'nope' })[0], 0x05); assert.equal(encodeTrigger()[0], 0x05); });
test('every encoding is exactly 11 bytes and all numbers are bytes', () => {
  for (const e of [TRIGGER_FEEL.first, TRIGGER_FEEL.second, TRIGGER_FEEL.locked, TRIGGER_FEEL.kick, TRIGGER_FEEL.off, { effect: 'vibration', position: 9, amplitude: 1, frequency: 9999 }]) { const b = encodeTrigger(e); assert.equal(b.length, 11); assert.ok([...b].every(v => v >= 0 && v <= 255)); }
});

/* ---- reports */
test('CRC-32 matches the standard check value (the Bluetooth CRC is this with a 0xA2 first byte, as in the Linux driver)', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new TextEncoder().encode('3456789'), 0), crc32(new Uint8Array([0, ...new TextEncoder().encode('3456789')])), 'seed = a leading byte');
});
test('USB report: id 0x02, 63 bytes, trigger-enable flags and blocks at the documented offsets', () => {
  const r = buildReport({ transport: 'usb', right: TRIGGER_FEEL.first, left: TRIGGER_FEEL.locked });
  assert.equal(r.id, 0x02); assert.equal(r.full.length, 63); assert.equal(r.data.length, 62); assert.equal(r.full[0], 0x02);
  assert.equal(r.full[1], 0x0c, 'flags: right (0x04) + left (0x08) trigger, and NOT the motors (0x01/0x02), so Gamepad-API rumble keeps working');
  assert.equal(hex(r.full.subarray(11, 15)), '25 28 00 04', 'right trigger block at report byte 11 (weapon 3-5, strength 5)');
  assert.equal(r.full[22], 0x21, 'left trigger block at report byte 22');
  assert.equal(r.full[2], 0, 'second flag byte untouched');
});
test('only the triggers asked for are flagged', () => {
  assert.equal(buildReport({ transport: 'usb', right: TRIGGER_FEEL.first }).full[1], 0x04);
  assert.equal(buildReport({ transport: 'usb', left: TRIGGER_FEEL.first }).full[1], 0x08);
  assert.equal(buildReport({ transport: 'usb' }).full[1], 0);
});
test('Bluetooth reports: id 0x31, 78 bytes, CRC over the first 74 bytes with the 0xA2 seed, little-endian at 74..77', () => {
  for (const t of ['bt-a', 'bt-b']) {
    const r = buildReport({ transport: t, right: TRIGGER_FEEL.second, seq: 5 }); assert.equal(r.id, 0x31); assert.equal(r.full.length, 78); assert.equal(r.data.length, 77);
    const crc = crc32(r.full.subarray(0, 74), 0xa2), got = (r.full[74] | r.full[75] << 8 | r.full[76] << 16 | r.full[77] << 24) >>> 0; assert.equal(got, crc, t);
  }
  const a = buildReport({ transport: 'bt-a', right: TRIGGER_FEEL.second, seq: 5 }).full, b = buildReport({ transport: 'bt-b', right: TRIGGER_FEEL.second }).full;
  assert.deepEqual([...a.subarray(0, 3)], [0x31, 0x50, 0x10], 'layout A: report id, seq<<4, tag 0x10 (Linux kernel)'); assert.equal(a[3], 0x04); assert.equal(hex(a.subarray(13, 17)), '25 28 00 07');
  assert.deepEqual([...b.subarray(0, 2)], [0x31, 0x02], 'layout B: report id, 0x02 (pydualsense / dualsense-ts)'); assert.equal(b[2], 0x04); assert.equal(hex(b.subarray(12, 16)), '25 28 00 07');
  assert.ok(BT_LAYOUTS.A && BT_LAYOUTS.B);
});
test('the Bluetooth sequence number cycles through 16 values', () => assert.deepEqual([0, 1, 15, 16, 17].map(s => buildReport({ transport: 'bt-a', seq: s }).full[1] >> 4), [0, 1, 15, 0, 1]));

/* ---- feel design */
test('trigger plan: first barrel, second barrel, locked, kick, and off outside play', () => {
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: false, ammo: 2, capacity: 2 }).right, TRIGGER_FEEL.first);
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: false, ammo: 1, capacity: 2 }).right, TRIGGER_FEEL.second);
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: false, ammo: 1, capacity: 1 }).right, TRIGGER_FEEL.first, 'a one-shell gun is always "first barrel"');
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: true, ammo: 0, capacity: 2 }).right, TRIGGER_FEEL.locked);
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: false, ammo: 0, capacity: 2 }).right, TRIGGER_FEEL.locked);
  assert.deepEqual(triggerPlan({ mode: 'play', reloading: false, ammo: 2, capacity: 2, kick: true }).right, TRIGGER_FEEL.kick);
  assert.deepEqual(triggerPlan({ mode: 'compare', reloading: false, ammo: 2, capacity: 2 }), { right: { effect: 'off' }, left: { effect: 'off' } });
  assert.equal(TRIGGER_FEEL.second.strength > TRIGGER_FEEL.first.strength, true);
});
test('the click lands where the game fires: the wall ends at zone 5 = 0.5 of the travel, the trigger counts as pressed at 0.5', () => {
  assert.equal(TRIGGER_FEEL.first.end / 10 <= 0.5 + 1e-9, true); assert.equal(TRIGGER_FEEL.first.end, 5);
});
test('rumble: first barrel is stronger than the second, both decay, all values in range', () => {
  const peak = n => Math.max(...RUMBLE[n].map(s => s.strong)), total = n => RUMBLE[n].reduce((a, s) => a + s.strong * s.ms, 0);
  assert.ok(peak('barrel1') > peak('barrel2')); assert.ok(total('barrel1') > total('barrel2') * 1.5);
  for (const n of Object.keys(RUMBLE)) for (const s of rumblePattern(n)) assert.ok(s.strong >= 0 && s.strong <= 1 && s.weak >= 0 && s.weak <= 1 && s.ms > 0, n);
  assert.deepEqual(rumblePattern('close').map(s => s.strong), [0.6, 0.2], 'close is the clearest reload click');
  assert.ok(RUMBLE.close[0].strong > RUMBLE.insert[0].strong && RUMBLE.insert[0].strong > RUMBLE.grab[0].strong, 'reload clicks build toward the close');
  assert.deepEqual(rumblePattern('barrel1', 0).map(s => s.strong + s.weak), [0, 0, 0], 'strength 0 = silent');
  assert.equal(rumblePattern('barrel1', 5)[0].strong, 1, 'clamped'); assert.deepEqual(rumblePattern('nope'), []);
});
test('which barrel gets which pattern', () => { assert.equal(barrelPattern(1, 2), 'barrel1'); assert.equal(barrelPattern(0, 2), 'barrel2'); assert.equal(barrelPattern(0, 1), 'barrel1'); });

/* ---- the conductor, with a fake clock */
function rig(extra = {}) {
  let t = 0; const q = [], calls = [], sets = [];
  const trig = { connected: true, set: p => sets.push(p), release: () => sets.push('released') };
  const h = createHaptics({ rumble: (s, w, ms) => calls.push([+s.toFixed(2), +w.toFixed(2), ms, t]), trigger: trig, now: () => t, schedule: (f, ms) => { const e = { at: t + ms, f, dead: false }; q.push(e); return e; }, clear: e => { e.dead = true; }, ...extra });
  const advance = ms => { const end = t + ms; for (;;) { const nxt = q.filter(e => !e.dead && e.at <= end).sort((a, b) => a.at - b.at)[0]; if (!nxt) break; t = nxt.at; nxt.dead = true; nxt.f(); } t = end; };
  return { h, calls, sets, advance, now: () => t };
}
test('a shot plays its whole pattern on time', () => { const r = rig(); r.h.shot(1, 2); r.advance(300); assert.deepEqual(r.calls.map(c => [c[0], c[3]]), [[1, 0], [0.6, 70], [0.25, 140]]); });
test('a new event replaces a pattern that is still playing', () => { const r = rig(); r.h.shot(1, 2); r.advance(50); r.h.reload('close'); r.advance(400); assert.deepEqual(r.calls.map(c => c[3]), [0, 50, 95], 'the shot tail is cancelled, close plays'); });
test('dry-fire ticks are rate limited while the trigger is held', () => { const r = rig(); let n = 0; for (let i = 0; i < 20; i++) { if (r.h.dry()) n++; r.advance(16); } assert.ok(n >= 2 && n <= 3, 'ticks: ' + n); });
test('no rumble function = no crash', () => { const h = createHaptics({ rumble: null }); h.shot(1, 2); h.reload('close'); h.kill(); h.dry(); h.stop(); });
test('hold() pauses the automatic trigger feel so a manual test is not overwritten', () => {
  const r = rig(); const st = { mode: 'play', reloading: false, ammo: 2, capacity: 2 }; r.h.hold(1000); const n = r.sets.length; assert.equal(r.h.update(st), null); assert.equal(r.sets.length, n);
  r.advance(1001); assert.ok(r.h.update(st)); assert.equal(r.sets.length, n + 1);
});
test('player rumble strength scales every segment; zero is silent', () => { const r = rig({ scale: () => 0.5 }); r.h.shot(1, 2); r.advance(300); assert.equal(r.calls[0][0], 0.5); });
test('update only talks to a connected DualSense, follows the gun, and kicks briefly after a shot', () => {
  const r = rig(); const st = { mode: 'play', reloading: false, ammo: 2, capacity: 2 };
  r.h.update(st); assert.deepEqual(r.sets.at(-1).right, TRIGGER_FEEL.first);
  r.h.shot(1, 2); r.h.update({ ...st, ammo: 1 }); assert.deepEqual(r.sets.at(-1).right, TRIGGER_FEEL.kick);
  r.advance(KICK_MS + 5); r.h.update({ ...st, ammo: 1 }); assert.deepEqual(r.sets.at(-1).right, TRIGGER_FEEL.second);
  r.h.update({ ...st, ammo: 0, reloading: true }); assert.deepEqual(r.sets.at(-1).right, TRIGGER_FEEL.locked);
  r.h.update({ ...st, mode: 'compare' }); assert.deepEqual(r.sets.at(-1).right, { effect: 'off' });
  const none = createHaptics({ trigger: { connected: false, set() { throw new Error('should not be called'); } } }); assert.equal(none.update(st), null);
  const off = rig({ triggersOn: () => false }); off.h.update(st); assert.deepEqual(off.sets.at(-1).right, { effect: 'off' }, 'player switched adaptive triggers off');
});

/* ---- the WebHID connection, against a fake device */
import { createDualSense } from '../src/input/dualsense.js';
const fakeHid = (reportIds = [0x02], opts = {}) => {
  const sent = []; const dev = { vendorId: 0x054c, productId: 0x0ce6, productName: 'DualSense Wireless Controller', opened: false, collections: [{ outputReports: reportIds.map(reportId => ({ reportId })) }],
    async open() { this.opened = true; }, async close() { this.opened = false; }, async sendReport(id, data) { if (opts.fail) throw new Error('boom'); sent.push({ id, data: Uint8Array.from(data) }); } };
  const listeners = {}; const hid = { requestDevice: async f => { hid.filters = f.filters; return opts.none ? [] : [dev]; }, getDevices: async () => opts.granted ? [dev] : [], addEventListener: (t, f) => (listeners[t] ||= []).push(f) };
  return { hid, dev, sent, fire: (t, e) => (listeners[t] || []).forEach(f => f(e)) };
};
const tick = ms => new Promise(r => setTimeout(r, ms));
test('connect asks for DualSense / DualSense Edge only, detects USB, and reports it', async () => {
  const f = fakeHid([0x02]), msgs = []; const ds = createDualSense({ hid: f.hid, onStatus: m => msgs.push(m) });
  assert.equal(await ds.connect(), true); assert.deepEqual(f.hid.filters.map(x => [x.vendorId, x.productId]), [[0x054c, 0x0ce6], [0x054c, 0x0df2]]);
  assert.ok(ds.connected); assert.match(msgs.at(-1), /USB/);
});
test('Bluetooth is detected from the 0x31 output report and uses layout A by default; it can be switched', async () => {
  const f = fakeHid([0x31]); const ds = createDualSense({ hid: f.hid }); await ds.connect();
  ds.set({ right: TRIGGER_FEEL.first }); await tick(30); assert.equal(f.sent.at(-1).id, 0x31); assert.equal(f.sent.at(-1).data.length, 77); assert.equal(f.sent.at(-1).data[1], 0x10, 'layout A tag byte');
  ds.setTransport('bt-b'); ds.set({ right: TRIGGER_FEEL.second }); await tick(30); assert.equal(f.sent.at(-1).data[0], 0x02, 'layout B: byte after the id is 0x02');
});
test('set() sends only when the effect changes, and coalesces a burst into the latest', async () => {
  const f = fakeHid(); const ds = createDualSense({ hid: f.hid }); await ds.connect();
  ds.set({ right: TRIGGER_FEEL.first }); await tick(5); const n = f.sent.length; assert.equal(n, 1);
  ds.set({ right: TRIGGER_FEEL.first }); ds.set({ right: { ...TRIGGER_FEEL.first } }); await tick(30); assert.equal(f.sent.length, n, 'unchanged: nothing sent');
  for (const s of [3, 4, 5, 6, 7]) ds.set({ right: { effect: 'weapon', start: 3, end: 5, strength: s } }); await tick(60);
  assert.ok(f.sent.length <= n + 2, 'a burst of 5 changes made ' + (f.sent.length - n) + ' reports'); assert.equal(f.sent.at(-1).data[10], 0x25); assert.equal(f.sent.at(-1).data[13], 6, 'the last value (strength 7) won');
});
test('release puts both triggers back to normal; disconnect releases and closes', async () => {
  const f = fakeHid(); const ds = createDualSense({ hid: f.hid }); await ds.connect(); ds.set({ right: TRIGGER_FEEL.locked }); await tick(30);
  await ds.release(); const r = f.sent.at(-1); assert.equal(r.data[0], 0x0c); assert.equal(r.data[10], 0x05); assert.equal(r.data[21], 0x05);
  await ds.disconnect(); assert.equal(f.dev.opened, false); assert.equal(ds.connected, false);
});
test('a controller allowed earlier reconnects without a click; none allowed = quietly false', async () => {
  const a = fakeHid([0x02], { granted: true }); assert.equal(await createDualSense({ hid: a.hid }).autoConnect(), true);
  const b = fakeHid([0x02]); assert.equal(await createDualSense({ hid: b.hid }).autoConnect(), false);
});
test('failures never throw: cancelled picker, send error, unplugged, and no WebHID at all', async () => {
  const none = fakeHid([0x02], { none: true }), m1 = []; assert.equal(await createDualSense({ hid: none.hid, onStatus: m => m1.push(m) }).connect(), false); assert.match(m1.at(-1), /No controller/);
  const bad = fakeHid([0x02], { fail: true }), m2 = []; const ds = createDualSense({ hid: bad.hid, onStatus: m => m2.push(m) }); await ds.connect(); ds.set({ right: TRIGGER_FEEL.first }); await tick(30); assert.match(m2.at(-1), /rejected every trigger message.*boom/);
  const gone = fakeHid(); const g = createDualSense({ hid: gone.hid }); await g.connect(); gone.fire('disconnect', { device: gone.dev }); assert.equal(g.connected, false); g.set({ right: TRIGGER_FEEL.first });   // no throw
  const m3 = []; const nohid = createDualSense({ hid: undefined, onStatus: m => m3.push(m) }); assert.equal(nohid.supported, false); assert.equal(await nohid.connect(), false); assert.match(m3.at(-1), /WebHID/); nohid.set({}); await nohid.release();
});

test('an embedded page (WebHID blocked by permissions policy) gets a clear explanation, not a raw error', async () => {
  const f = fakeHid(); f.hid.requestDevice = async () => { throw new Error("Failed to execute 'requestDevice' on 'HID': Access to the feature \"hid\" is disallowed by permissions policy."); };
  const m = []; assert.equal(await createDualSense({ hid: f.hid, onStatus: t => m.push(t) }).connect(), false); assert.match(m.at(-1), /embedded.*dist\/hero\.html/);
});

/* ---- reading the controller's own descriptor and falling back between layouts */
const descDev = (reports, accept) => { const sent = [], tried = []; const dev = { vendorId: 0x054c, productId: 0x0ce6, productName: 'DualSense', opened: false,
  collections: [{ outputReports: Object.entries(reports).map(([id, n]) => ({ reportId: +id, items: n ? [{ reportSize: 8, reportCount: n }] : [] })) }],
  async open() { this.opened = true; }, async close() {}, async sendReport(id, data) { tried.push({ id, len: data.length, b0: data[0], b1: data[1] }); if (!accept(id, Uint8Array.from(data))) throw new Error('Failed to write the report.'); sent.push({ id, data: Uint8Array.from(data) }); } };
  return { hid: { requestDevice: async () => [dev], getDevices: async () => [], addEventListener() {} }, sent, tried }; };
test('the status shows which output reports the controller declares', async () => {
  const f = descDev({ 0x31: 77 }, () => true), m = []; const ds = createDualSense({ hid: f.hid, onStatus: t => m.push(t) }); await ds.connect(); assert.match(m.at(-1), /Bluetooth.*0x31 \(77 bytes\)/);
});
test('automatic mode tries Bluetooth layout A, then B, and remembers the one the controller accepts', async () => {
  const f = descDev({ 0x31: 77 }, (id, d) => d[0] === 0x02), m = []; const ds = createDualSense({ hid: f.hid, onStatus: t => m.push(t) }); await ds.connect();
  ds.set({ right: TRIGGER_FEEL.first }); await tick(40);
  assert.equal(f.tried[0].b1, 0x10, 'layout A (tag byte 0x10) was tried first'); assert.equal(f.tried[1].b0, 0x02, 'then layout B')
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].data[0], 0x02, 'layout B accepted'); assert.match(m.at(-1), /accepted \(layout bt-b\)/);
  const before = f.tried.length; ds.set({ right: TRIGGER_FEEL.second }); await tick(40); assert.equal(f.tried.length, before + 1, 'afterwards only the working layout is used');
});
test('the data length follows the size the descriptor declares', async () => {
  const f = descDev({ 0x02: 62 }, () => true); const ds = createDualSense({ hid: f.hid }); await ds.connect(); ds.set({ right: TRIGGER_FEEL.first }); await tick(30); assert.equal(f.sent[0].data.length, 62);
  const g = descDev({ 0x02: 47 }, () => true); const d2 = createDualSense({ hid: g.hid }); await d2.connect(); d2.set({ right: TRIGGER_FEEL.first }); await tick(30); assert.equal(g.sent[0].data.length, 47); assert.equal(g.sent[0].data[0], 0x04, 'the flags and trigger block survive the resize');
});
test('when nothing is accepted: one clear message listing what was tried, no spamming, and retry() tries again', async () => {
  const f = descDev({ 0x31: 77 }, () => false), m = []; const ds = createDualSense({ hid: f.hid, onStatus: t => m.push(t) }); await ds.connect(); ds.set({ right: TRIGGER_FEEL.first }); await tick(40);
  assert.match(m.at(-1), /rejected every trigger message \(bt-a: .*; bt-b: .*\).*0x31 \(77 bytes\)/); const n = f.tried.length;
  for (let i = 0; i < 5; i++) ds.set({ right: { effect: 'weapon', start: 3, end: 5, strength: i + 1 } }); await tick(60); assert.equal(f.tried.length, n, 'no repeated attempts after failing');
  ds.retry(); ds.set({ right: TRIGGER_FEEL.second }); await tick(40); assert.ok(f.tried.length > n, 'retry sends again');
  ds.setTransport('usb'); ds.set({ right: TRIGGER_FEEL.first }); await tick(40); assert.equal(f.tried.at(-1).id, 0x02, 'a forced layout is used as chosen');
});

test('smart rumble: pellets from one blast are felt once; more pellets hit harder; a kill pops harder than a hit', () => {
  const a = rig(); for (let i = 0; i < 2; i++) a.h.hit(false); a.advance(300); const few = a.calls[0][0];
  const b = rig(); for (let i = 0; i < 8; i++) b.h.hit(false); b.advance(300);
  assert.equal(a.calls.filter(c => c[3] === 45).length, 1, 'one flush, not one per pellet'); assert.ok(b.calls[0][0] > few);
  const c = rig(); c.h.hit(false); c.h.hit(true); c.advance(300); assert.ok(c.calls[0][1] > b.calls[0][1], 'pop has a sharper buzz than a thud');
  const d = rig(); d.h.hit(true, false); assert.deepEqual(d.calls.map(x => x[0]), [0.2], 'smart off: the old small kill bump');
});
test('smart rumble: footsteps speed up with speed, stay quiet when standing, and never talk over a shot', () => {
  const r = rig(); let slow = 0, fast = 0;
  for (let i = 0; i < 100; i++) { if (r.h.walk(0.3)) slow++; r.advance(16); }
  const f = rig(); for (let i = 0; i < 100; i++) { if (f.h.walk(1)) fast++; f.advance(16); }
  assert.ok(fast > slow && slow >= 2, `slow ${slow} fast ${fast}`);
  const q = rig(); assert.equal(q.h.walk(0), false); assert.equal(q.calls.length, 0);
  const s = rig(); s.h.shot(1, 2); assert.equal(s.h.walk(1), false, 'busy with the shot'); s.advance(400); assert.equal(s.h.walk(1), true);
  assert.equal(rig().h.walk(1, false), false, 'off = silent');
});
test('smart rumble: wall bumps need a real impact and are rate limited', () => {
  const r = rig(); assert.equal(r.h.bump(1), false); assert.equal(r.h.bump(6), true); assert.equal(r.h.bump(6), false); r.advance(300); assert.equal(r.h.bump(6), true);
});

test('motors over the DualSense link: flags, byte positions, and the BT CRC still valid', () => {
  const r = buildReport({ transport: 'usb', motor: { strong: 1, weak: 0.5 } });
  assert.equal(r.full[1] & 0x03, 0x03); assert.equal(r.full[3], 128, 'weak = right motor byte'); assert.equal(r.full[4], 255, 'strong = left motor byte'); assert.equal(r.full[39] & 0x04, 0x04);
  assert.equal(buildReport({ transport: 'usb', right: TRIGGER_FEEL.first }).full[1] & 0x03, 0, 'no motor given = motors untouched');
  const b = buildReport({ transport: 'bt-a', motor: { strong: 0.2, weak: 0.2 } }).full; assert.equal(b.length, 78);
});
test('motors() sends, stops by itself, and refuses when there is no link', async () => {
  const sent = [], dev = { opened: true, collections: [], sendReport: async (id, d) => { sent.push([id, d[2], d[3]]); }, vendorId: 0x054c, productId: 0x0ce6 };
  let t = 0; const timers = []; const realST = globalThis.setTimeout; globalThis.setTimeout = (f, ms) => { timers.push({ f, ms }); return timers.length; }; globalThis.clearTimeout = () => {};
  try {
    const ds = createDualSense({ hid: { getDevices: async () => [dev], addEventListener() {} }, now: () => (t += 20) });
    assert.equal(ds.motors(1, 1, 50), false, 'not connected: caller falls back to browser rumble');
    await ds.autoConnect(); assert.equal(ds.motors(0.8, 0.4, 50), true); await Promise.resolve();
    assert.ok(sent.some(s => s[2] === 204 && s[1] === 102), 'motors reach the controller');
    timers.filter(x => x.ms === 50).forEach(x => x.f()); await Promise.resolve(); await new Promise(r => realST(r, 0));
    assert.deepEqual(sent.at(-1).slice(1), [0, 0], 'stopped after ms');
  } finally { globalThis.setTimeout = realST; }
});
