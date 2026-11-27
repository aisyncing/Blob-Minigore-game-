// The whole controller package against a simulated DualSense (WebHID shim that logs every output report): vibration goes out through the controller's
// motors, the lightbar follows health and flashes on a hit, the player LEDs show ammo, and the calibration wizard runs from the pad.
import { openGame } from './harness.mjs';
import assert from 'node:assert/strict';

const { page, errors, pad, tap, close } = await openGame({ hid: true });
const get = (fn, arg) => page.evaluate(fn, arg);
// every report the page has sent, as { motors:[heavy,light], rgb:[r,g,b], leds, trig, flags }
const reports = () => get(() => (window.__hidLog || []).map(r => { const d = r.data; return { id: r.id, flag0: d[0], flag1: d[1], light: d[2], heavy: d[3], trig: d[10], leds: d[43], rgb: [d[44], d[45], d[46]], bright: d[42] }; }));
const since = async (n) => (await reports()).slice(n);

await tap('A');
await get(() => document.querySelector('#bDs').click());
await page.waitForFunction(() => window.__hero.dualsense.usable, null, { timeout: 20000 });
await tap('A');
assert.equal(await get(() => window.__hero.state().mode), 'run');
await get(() => { const H = window.__hero; H.sess.director.update = () => []; H.sess.waves.update = () => []; H.sess.crowd.clear(); window.__rumble = []; });

// ---- lightbar: green with full health; LEDs: a full magazine
await page.waitForFunction(() => (window.__hidLog || []).some(r => r.data[1] & 0x04 && r.data[45] > 100), null, { timeout: 30000 });
let rs = await reports(); let lastLight = rs.filter(r => r.flag1 & 0x04).at(-1);
assert.ok(lastLight.rgb[1] > 100 && lastLight.rgb[0] < 100, `green at full health: ${lastLight.rgb}`);
assert.equal(rs.filter(r => r.flag1 & 0x10).at(-1).leds, 31, 'five LEDs for a full pistol magazine');

// ---- a hit flashes the lightbar white and the bar goes amber
let n = (await reports()).length;
await get(() => { const H = window.__hero, r = H.sess.run; r.invuln = 0; H.sess.crowd.spawn('furry', 1, H.player.x + 1.4, H.player.y, { emerge: false }); for (let i = 0; i < 400 && r.hp === 3; i++) H.simStep(1 / 120); });
await page.waitForTimeout(600);
const after = await since(n); assert.ok(after.some(r => (r.flag1 & 0x04) && r.rgb[0] > 110 && r.rgb[2] > 110), 'a white flash on the lightbar');
await page.waitForFunction(() => { const l = (window.__hidLog || []).filter(r => r.data[1] & 0x04).at(-1); return l && l.data[44] > 100 && l.data[46] < 80; }, null, { timeout: 30000 });   // settles to amber: red high, blue low

// ---- vibration goes through the controller, not the browser
n = (await reports()).length;
await get(() => { window.__rumble = []; window.__hero.haptics.play('pistol'); });
await page.waitForFunction(() => { const m = (window.__hidLog || []).filter(r => r.data[0] & 0x03); const l = m.at(-1); return m.some(r => r.data[3] > 60) && l.data[3] === 0 && l.data[2] === 0; }, null, { timeout: 20000 });   // it rumbled, then went quiet
const motor = (await since(n)).filter(r => r.flag0 & 0x03);
assert.ok(motor.some(r => r.heavy > 60), 'the heavy motor was driven over HID'); assert.ok(motor.at(-1).heavy === 0 && motor.at(-1).light === 0, 'and stopped again: ' + JSON.stringify(motor.slice(-4)));
assert.equal(await get(() => window.__rumble.length), 0, 'the browser did not rumble too');
await get(() => window.__hero.tuning.set('pad.rumbleVia', 2)); await get(() => window.__hero.haptics.play('pistol')); await page.waitForTimeout(200);
assert.ok(await get(() => window.__rumble.length) > 0, 'with the setting on "browser", it uses the browser'); await get(() => window.__hero.tuning.set('pad.rumbleVia', 0));

// ---- the smallest tap still starts the motor (start threshold)
await page.waitForTimeout(400); n = (await reports()).length; await get(() => { window.__hero.tuning.set('pad.floor', 0.3); window.__hero.haptics.step(0, 0.2); }); await page.waitForTimeout(200);
const small = (await since(n)).filter(r => r.flag0 & 0x03 && (r.heavy || r.light)); assert.ok(small.length && Math.max(...small.map(r => Math.max(r.heavy, r.light))) >= 0.3 * 255 - 2, 'lifted to the start threshold');
await get(() => window.__hero.tuning.set('pad.floor', 0.12));

// ---- the LEDs follow the setting
await get(() => window.__hero.tuning.set('pad.leds', 0)); await page.waitForFunction(() => (window.__hidLog || []).filter(r => r.data[1] & 0x10).at(-1).data[43] === 0, null, { timeout: 20000 });
await get(() => window.__hero.tuning.set('pad.leds', 1));

// ---- pause, calibrate from the pad
await tap('Start');
await get(() => document.querySelector('#bCalib').click());
assert.equal(await get(() => !document.querySelector('#calibBox').hidden), true, 'the calibration card shows');
n = (await reports()).length;
await page.waitForFunction(() => window.__hero.calib.state.active && window.__hero.calib.update(0)?.step === 'heavy', null, { timeout: 20000 });
await page.waitForTimeout(1500); const ramp = (await since(n)).filter(r => r.flag0 & 0x03).map(r => r.heavy); assert.ok(Math.max(...ramp) > 0, 'the heavy motor ramps up during step 1');
const steps = []; for (let i = 0; i < 5; i++) { steps.push(await get(() => window.__hero.calib.state.index)); await page.waitForTimeout(900); await tap('A'); }
assert.deepEqual(steps, [0, 1, 2, 3, 4], 'A advances one step at a time');
await page.waitForFunction(() => !window.__hero.calib.state.active, null, { timeout: 20000 });
assert.match(await get(() => document.querySelector('#dsInfo').textContent), /Calibrated/, 'the result is reported');
assert.equal(await get(() => document.querySelector('#calibBox').hidden), true);
const floor = await get(() => window.__hero.tuning.get('pad.floor')); assert.ok(floor >= 0.03 && floor <= 0.5);
// B cancels a calibration
await get(() => document.querySelector('#bCalib').click()); await page.waitForTimeout(300); await tap('B');
assert.equal(await get(() => window.__hero.calib.state.active), false, 'B cancels');

assert.equal(errors.length, 0, errors.join('\n'));
console.log('controller-full: ok');
await close();
