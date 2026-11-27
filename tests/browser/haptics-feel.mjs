// Rumble patterns + adaptive trigger feel, in the real game, with a simulated DualSense (fake WebHID device + fake rumble motors).
// Proves what the game TELLS the controller. Whether a real controller feels it is not provable here.
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';
const g = await openGame({ hid: true }); const { page } = g;
const hex = a => a.map(v => v.toString(16).padStart(2, '0')).join(' ');
const rBlock = r => hex(r.data.slice(10, 14));                                   // right trigger block (bytes after the report id)
const reports = () => page.evaluate(() => window.__hidLog);
const lastR = async () => (await reports()).at(-1);
const rumbles = () => page.evaluate(() => window.__rumble || []);
const waitReport = (pred, ms = 10000) => page.waitForFunction(p => { const f = new Function('r', 'return ' + p); return window.__hidLog.some(r => f(r)); }, pred, { timeout: ms });   // any report in the log
const clearLog = () => page.evaluate(() => { window.__hidLog.length = 0; });
// pull the trigger and let go in the very next frame after the shot, so one pull is exactly one shot even at this slow headless frame rate
const pullOnce = () => page.evaluate(() => new Promise(res => { const n = __hero.stats.shots; window.__padSet({ buttons: { RT: 1 } }); const w = () => { if (__hero.stats.shots > n) { window.__padSet({ buttons: { RT: 0 } }); res(); } else requestAnimationFrame(w); }; requestAnimationFrame(w); }));
const find = async pred => (await reports()).find(pred);

await g.tap('A'); await g.tap('A');                                              // wake the title, enter play with Gumdrop
assert.equal(await page.evaluate(() => __hero.state().mode), 'play');
// connect (the page's button; the fake picker returns the simulated DualSense)
await page.evaluate(() => { document.querySelector('#feel').open = true; document.querySelector('#bDs').click(); });
await waitReport("r.id === 2 && r.data[0] === 0x0c");
assert.match(await page.evaluate(() => document.querySelector('#dsStatus').textContent), /accepted \(layout usb\)/);
assert.equal(rBlock(await lastR()), '25 28 00 04', 'ready, first barrel: weapon wall zones 3-5, strength 5');
const rep0 = await lastR(); assert.equal(rep0.data.length, 62, 'USB report: 62 bytes after the id'); assert.equal(rep0.data[0] & 0x03, 0, 'motors are not touched by the trigger report');

// aim the player at nothing in particular; fire the FIRST barrel with the trigger
await page.evaluate(() => { const H = __hero; H.targets.forEach(t => { t.alive = false; t.respawnT = 1e9; }); H.gun.reset(); window.__rumble = []; window.__hidLog.length = 0; });
await g.pad({ axes: [0, 0, 0, -1] }); await pullOnce();
await page.waitForFunction(() => window.__rumble.length >= 1);
const first = (await rumbles())[0]; assert.ok(first.s >= 0.99 && first.w >= 0.69, 'first barrel: hard thump ' + JSON.stringify(first));
await waitReport("r.data[10] === 0x26");                                             // the trigger buzz right after the shot
assert.equal((await find(r => r.data[10] === 0x26)).data[19], 45, 'kick buzzes at 45 Hz');
await waitReport("r.data[10] === 0x25 && r.data[13] === 7");                         // then the second barrel is stiffer
assert.equal(rBlock(await find(r => r.data[10] === 0x25 && r.data[13] === 7)), '25 28 00 07', 'second barrel: same wall, strength 8');
await clearLog();
// SECOND barrel
await page.evaluate(() => { window.__rumble = []; }); await page.waitForTimeout(400);
await pullOnce();
await page.waitForFunction(() => window.__rumble.length >= 1); const second = (await rumbles())[0]; assert.ok(second.s <= 0.61 && second.s > 0.55, 'second barrel is lighter: ' + JSON.stringify(second)); assert.ok(second.s < first.s);
await waitReport("r.data[10] === 0x21");                                             // empty: the trigger locks
assert.equal(hex((await find(r => r.data[10] === 0x21)).data.slice(10, 14)), '21 fe 03 f8', 'empty gun: trigger locked (feedback from zone 1, strength 8)');
await clearLog();

// reload clicks arrive in order while the trigger stays locked, then it frees up for the first barrel again
await page.waitForFunction(() => __hero.gun.state.ammo === 2, null, { timeout: 15000 });
const strongs = (await rumbles()).map(r => r.s); const at = (v, from = 0) => strongs.findIndex((x, i) => i >= from && Math.abs(x - v) < 0.011);
const iE = at(0.15), iI = at(0.35, iE + 1), iC = at(0.6, iI + 1);
assert.ok(iE >= 0 && iI > iE && iC > iI, 'reload beats (eject .15, insert .35, close .6) in order: ' + JSON.stringify(strongs));
await waitReport("r.data[10] === 0x25 && r.data[13] === 4"); assert.equal(rBlock(await find(r => r.data[10] === 0x25 && r.data[13] === 4)), '25 28 00 04', 'reloaded: first barrel feel again');

// dry pull: hold the trigger while the gun cannot fire
await page.evaluate(() => { const H = __hero; H.gun.state.ammo = 0; H.gun.state.reloadLeft = 5; H.gun.state.reloadTotal = 5; window.__rumble = []; });
await g.pad({ buttons: { RT: 1 } }); await page.waitForTimeout(1200); await g.pad({ buttons: { RT: 0 } });
const dry = (await rumbles()).filter(r => r.s === 0 && Math.abs(r.w - 0.35) < 0.01); assert.ok(dry.length >= 1 && dry.length <= 8, 'dry ticks are rate limited: ' + dry.length);
await page.evaluate(() => { const H = __hero; H.gun.reset(); });

// rumble strength setting and the off switches
await page.evaluate(() => { __hero.tuning.set('fx.vibAll', 5); window.__rumble = []; __hero.haptics?.shot; });
await pullOnce();
await page.waitForFunction(() => window.__rumble.length >= 1); assert.ok((await rumbles())[0].s <= 0.51, 'rumble strength 50% halves the thump'); await page.evaluate(() => __hero.tuning.set('fx.vibAll', 10));
await page.evaluate(() => { __hero.gun.reset(); }); await page.waitForTimeout(500); await clearLog(); await page.evaluate(() => __hero.tuning.set('fx.triggers', 0));
await waitReport("r.data[10] === 0x05"); await clearLog(); await page.evaluate(() => __hero.tuning.set('fx.triggers', 1)); await waitReport("r.data[10] === 0x25");

// the test buttons hold their effect for a few seconds
await clearLog(); await page.evaluate(() => document.querySelector('[data-tt="locked"]').click()); await waitReport("r.data[10] === 0x21"); await page.waitForTimeout(1500);
assert.equal((await lastR()).data[10], 0x21, 'a test is not overwritten by the automatic feel (the last report is still the locked test)');
await clearLog(); await page.evaluate(() => document.querySelector('[data-tt="off"]').click()); await waitReport("r.data[10] === 0x05");

// leaving play and closing the page put the triggers back to normal
await page.waitForTimeout(7000); await clearLog(); await page.evaluate(() => __hero.setMode('compare')); await waitReport("r.data[10] === 0x05"); await clearLog(); await page.evaluate(() => { __hero.setMode('play'); }); await waitReport("r.data[10] === 0x25");
await clearLog(); await page.evaluate(() => dispatchEvent(new Event('pagehide'))); await waitReport("r.data[10] === 0x05 && r.data[21] === 0x05");
assert.deepEqual(g.errors, []); await g.close(); console.log('haptics-feel: all passed');
