// Browser test harness: loads the built hero page with a *simulated* controller (navigator.getGamepads is replaced
// before any game code runs, so the game reads it through its normal input path). No physical hardware involved.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire('/opt/node-tools/node_modules/');
export const { chromium } = require('playwright');

export const PAD_SHIM = `(() => {
  const mk = () => ({ id: 'Simulated Xbox Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  const pad = mk(); window.__pad = { pad, present: false };
  // like a real browser, the pad stays hidden until the player presses something on it
  pad.vibrationActuator = { playEffect: (type, p) => { (window.__rumble ||= []).push({ type, s: p.strongMagnitude, w: p.weakMagnitude, d: p.duration }); return Promise.resolve('complete'); } };
  navigator.getGamepads = () => (window.__pad.present ? [window.__pad.pad, null, null, null] : [null, null, null, null]);
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
  window.__padSet = (o) => { const p = window.__pad.pad; window.__pad.present = true; p.timestamp++;
    if (o.axes) o.axes.forEach((v, i) => { if (v !== undefined && v !== null) p.axes[i] = v; });
    for (const [k, v] of Object.entries(o.buttons || {})) { const b = p.buttons[B[k]]; b.pressed = v > 0.5; b.touched = v > 0; b.value = v; } };
})();`;

// A fake DualSense on WebHID: records every output report the page sends.
export const HID_SHIM = `(() => { window.__hidLog = [];
  const dev = { vendorId: 0x054c, productId: 0x0ce6, productName: 'Simulated DualSense', opened: false, collections: [{ outputReports: [{ reportId: 2 }] }],
    async open() { this.opened = true; }, async close() { this.opened = false; }, async sendReport(id, data) { window.__hidLog.push({ id, data: Array.from(data) }); } };
  Object.defineProperty(navigator, 'hid', { configurable: true, value: { requestDevice: async () => [dev], getDevices: async () => [], addEventListener() {} } }); })();`;

export async function openGame({ file = 'dist/hero.html', viewport = { width: 1280, height: 720 }, hook = '__hero', hid = false } = {}) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(PAD_SHIM); if (hid) await page.addInitScript(HID_SHIM);
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(h => window[h], hook);
  const pad = (o) => page.evaluate(o => window.__padSet(o), o);
  const tap = async (name, ms = 60) => { await pad({ buttons: { [name]: 1 } }); await page.waitForTimeout(ms); await pad({ buttons: { [name]: 0 } }); await page.waitForTimeout(ms); };
  return { browser, page, errors, pad, tap, close: () => browser.close() };
}

// Deterministic scenes: stop the render loop, then drive the real simStep with the input snapshot set by hand.
export async function freeze(page) { await page.evaluate(() => { window.requestAnimationFrame = () => 0; }); await page.waitForTimeout(100); }
export async function scene(page, { hero = 0, px = 0, py = 0, aim = [0, -1], dummy = null, params = {}, tune = {} } = {}) {
  return page.evaluate(({ hero, px, py, aim, dummy, params, tune }) => {
    const H = window.__hero; H.setMode('play'); H.choose(hero);
    for (const [k, v] of Object.entries(tune)) H.tuning.set(k, v);
    Object.assign(H.P, params);
    for (const t of H.targets) { t.alive = false; t.respawnT = 1e9; t.deadFor = 0; }
    if (dummy) { const t = H.targets[0]; Object.assign(t, { x: dummy.x, y: dummy.y, alive: true, hp: t.maxHp, path: null, respawnT: 1e9 }); }
    const p = H.player; p.x = px; p.y = py; p.v.x = p.v.y = p.kb.x = p.kb.y = 0; p.aimX = aim[0]; p.aimY = aim[1]; p.hasAim = true;
    H.gun.reset(); H.pellets.clear(); H.stats.shots = H.stats.pellets = H.stats.hits = H.stats.damage = H.stats.kills = 0;
    const h = H.heroes[hero]; h.aimYaw = Math.atan2(aim[0], aim[1]); h.legYaw = h.aimYaw;
    Object.assign(H.snap, { mouseAim: false, fire: false }); H.snap.aim.x = H.snap.aim.y = H.snap.aim.mag = 0; H.snap.move.x = H.snap.move.y = H.snap.move.mag = 0;
    h.update(1 / 60, { x: px, y: py, vx: 0, vy: 0, speed: 0, aimYaw: h.aimYaw, reload: -1, spent: 0 }, H.P);
    return true;
  }, { hero, px, py, aim, dummy, params, tune });
}
export const steps = (page, n, setup) => page.evaluate(({ n }) => { for (let i = 0; i < n; i++) window.__hero.simStep(1 / 120); }, { n });
