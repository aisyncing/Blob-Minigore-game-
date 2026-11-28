// Dev tool. Renders one critter of each size in a fixed, deterministic scene and saves canvas screenshots, for comparing two builds.
//   node tools/critter-lineup.mjs <dist/hero.html> <outPrefix> [poseFn]   poseFn: source of a function run in the page once the critters exist; window.__test = [{c, v}] (2 big, 2 mid, 2 small; v.bones = skeleton bones)
//   Compare two builds with PIL's ImageChops.difference on the saved PNGs; the seed is reset before the critters are made so both builds see the same scene.
import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium, PAD_SHIM } from '../tests/browser/harness.mjs';
const [file, out, pose = ''] = process.argv.slice(2);
const DET = `(() => { let s = 12345; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; Math.random = rnd; window.__seed = v => { s = v; };
  let clock = 1000; performance.now = () => clock; let queue = []; window.requestAnimationFrame = f => { queue.push(f); return queue.length; };
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) { clock += 1000 / 60; const q = queue; queue = []; for (const f of q) f(clock); } }; })();`;
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.addInitScript(DET); await page.addInitScript(PAD_SHIM);
await page.goto(pathToFileURL(resolve(file)).href + '?tutorial=off'); await page.waitForFunction(() => window.__hero && window.__step);
const step = n => page.evaluate(n => window.__step(n), n);
await page.evaluate(() => document.querySelector('#bStart').click()); await step(3); await page.evaluate(() => document.querySelector('#bPlayNow').click()); await step(5);
await page.evaluate(() => { const H = __hero; for (let i = 0; i < 120 * 8; i++) H.simStep(1 / 120); });                       // let wave 1 put a critter in the world, to borrow its classes
const info = await page.evaluate(async (pose) => {
  const H = __hero, C = H.critters[0].constructor, VC = H.views.get(H.critters[0]).constructor;
  for (const c of H.critters) { H.views.get(c)?.dispose(); H.views.delete(c); } H.critters.length = 0; H.director.state.t = 1e9; H.director.state.queue = []; H.player.x = 0; H.player.y = 0; H.player.v.x = H.player.v.y = 0; H.health.state.invulnT = 1e9; H.pellets.clear?.();
  window.__seed(777);
  const spots = [['big', 0, -4.2, 0.4], ['mid', -4, -2.2, -0.5], ['small', 3.6, -2.4, 1.3], ['mid', 3.2, 3.4, 2.6], ['big', -4.4, 3.2, -2.2], ['small', 0.2, 3.8, 3.1]];
  window.__test = spots.map(([tier, x, y, heading]) => { const c = new C({ tier, x, y, warn: 0, rise: 0 }); c.speed = 0; c.attackCd = 1e9; c.heading = heading; c.state = 'chase'; H.critters.push(c); const v = new VC(H.arena.group, c); v.phase = 0.7; H.views.set(c, v); return { c, v }; });
  return H.critters.length;
}, pose);
await step(30); await page.evaluate(() => { document.querySelector('#hud').style.display = 'none'; document.querySelector('#top').style.display = 'none'; document.querySelector('#hint').style.display = 'none'; document.querySelector('#ammo').style.display = 'none'; });
const shot = async name => { await step(1); await page.screenshot({ path: `${out}-${name}.png`, clip: { x: 240, y: 60, width: 800, height: 600 } }); };
await shot('a'); await step(17); await shot('b');
if (pose) { await page.evaluate(p => (0, eval)('(' + p + ')')(), pose); await step(2); await shot('pose'); }
const calls = await page.evaluate(() => { const i = __hero.stage.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
console.log(out, JSON.stringify({ critters: info, ...calls, errors })); await b.close();
