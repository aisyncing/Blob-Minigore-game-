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
  navigator.getGamepads = () => (window.__pad.present ? [window.__pad.pad, null, null, null] : [null, null, null, null]);
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Back: 8, Start: 9, L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
  window.__padSet = (o) => { const p = window.__pad.pad; window.__pad.present = true; p.timestamp++;
    if (o.axes) o.axes.forEach((v, i) => { if (v !== undefined && v !== null) p.axes[i] = v; });
    for (const [k, v] of Object.entries(o.buttons || {})) { const b = p.buttons[B[k]]; b.pressed = v > 0.5; b.touched = v > 0; b.value = v; } };
})();`;

export async function openGame({ file = 'dist/hero.html', viewport = { width: 1280, height: 720 } } = {}) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(PAD_SHIM);
  await page.goto(pathToFileURL(resolve(file)).href);
  await page.waitForFunction(() => window.__hero);
  const pad = (o) => page.evaluate(o => window.__padSet(o), o);
  const tap = async (name, ms = 60) => { await pad({ buttons: { [name]: 1 } }); await page.waitForTimeout(ms); await pad({ buttons: { [name]: 0 } }); await page.waitForTimeout(ms); };
  return { browser, page, errors, pad, tap, close: () => browser.close() };
}
