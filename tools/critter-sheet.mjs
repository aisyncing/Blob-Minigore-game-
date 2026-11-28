// Dev tool. Films each critter size walking from a low side-on camera and saves 8 frames spaced evenly over one stride cycle,
// so the walk can be judged by eye (compose them into a grid with PIL).
//   node tools/critter-sheet.mjs <dist/hero.html> <outPrefix> [walk|attack]      writes <outPrefix>-<tier>-<0..N>.png  (walk: 8 frames over one stride; attack: 12 frames from the start of a wind-up to the end of the recovery)
import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
import { chromium, PAD_SHIM } from '../tests/browser/harness.mjs';
const [file, out, mode = 'walk'] = process.argv.slice(2);
const DET = `(() => { let s = 12345; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let clock = 1000; performance.now = () => clock; let queue = []; window.requestAnimationFrame = f => { queue.push(f); return queue.length; };
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) { clock += 1000 / 60; const q = queue; queue = []; for (const f of q) f(clock); } }; })();`;
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.addInitScript(DET); await page.addInitScript(PAD_SHIM);
await page.goto(pathToFileURL(resolve(file)).href + '?tutorial=off'); await page.waitForFunction(() => window.__hero && window.__step);
const step = n => page.evaluate(n => window.__step(n), n);
await page.evaluate(() => document.querySelector('#bStart').click()); await step(3); await page.evaluate(() => document.querySelector('#bPlayNow').click()); await step(5);
await page.evaluate(() => { const H = __hero; for (let i = 0; i < 120 * 8; i++) H.simStep(1 / 120); });
await page.evaluate(() => { const H = __hero; window.__C = H.critters[0].constructor; window.__VC = H.views.get(H.critters[0]).constructor;
  for (const c of H.critters) { H.views.get(c)?.dispose(); H.views.delete(c); } H.critters.length = 0; H.director.state.t = 1e9; H.director.state.queue = []; H.health.state.invulnT = 1e9; H.player.x = 40; H.player.y = 40;
  for (const id of ['#hud', '#top', '#hint', '#ammo', '#banner', '#vig']) { const e = document.querySelector(id); if (e) e.style.display = 'none'; } H.heroes.forEach(h => { h.root.visible = false; }); H.arena.group.children.forEach(o => { o.visible = false; }); });    // hide the maze and props so nothing blocks the side view
const SPEED = { small: 4.7, mid: 3.5, big: 2.5 }, STRIDE = { small: 1.0, mid: 1.5, big: 2.4 }, DIST = { small: 5, mid: 7, big: 15 };
if (mode === 'walk') for (const tier of ['small', 'mid', 'big']) {
  await page.evaluate(([tier, speed]) => { const H = __hero; for (const c of H.critters) { H.views.get(c)?.dispose(); H.views.delete(c); } H.critters.length = 0;
    const c = new __C({ tier, x: -2, y: 0, warn: 0, rise: 0 }); c.speed = speed; c.step = () => null; c.heading = Math.PI / 2; H.critters.push(c); const v = new __VC(H.arena.group, c); v.phase = 0; H.views.set(c, v); window.__walker = c; }, [tier, SPEED[tier]]);
  const frames = Math.round(STRIDE[tier] / SPEED[tier] * 60);                       // frames in one cycle
  const advance = async n => { for (let i = 0; i < n; i++) { await page.evaluate(s => { __walker.x += s / 60; }, SPEED[tier]); await step(1); } };
  await advance(45);                                                                 // reach full walking speed
  let done = 0;
  for (let i = 0; i < 8; i++) {
    const want = Math.round(i * frames / 8); await advance(want - done); done = want;
    await page.evaluate(([d, r]) => { const H = __hero, c = __walker, cam = H.stage.camera; cam.position.set(c.x + d * 0.12, r * 1.8, c.y - d); cam.lookAt(c.x, r * 1.2, c.y); cam.updateMatrixWorld(true); H.stage.render(); }, [DIST[tier], tier === 'big' ? 1.2 : tier === 'mid' ? 0.7 : 0.38]);
    await page.screenshot({ path: `${out}-${tier}-${i}.png`, clip: { x: 340, y: 120, width: 600, height: 480 } });
  }
}
if (mode === 'attack') for (const tier of ['small', 'mid', 'big']) {
  // a real critter next to a real (invulnerable, hidden) player: it winds up, strikes and recovers by itself; we film that
  const total = await page.evaluate(([tier]) => { const H = __hero; for (const c of H.critters) { H.views.get(c)?.dispose(); H.views.delete(c); } H.critters.length = 0;
    const r = { small: 0.38, mid: 0.7, big: 1.2 }[tier]; H.player.x = 0; H.player.y = 0; H.player.v.x = H.player.v.y = 0; H.player.kb.x = H.player.kb.y = 0; H.health.state.invulnT = 1e9;
    const c = new __C({ tier, x: -(r + 0.6 + 0.15), y: 0, warn: 0, rise: 0 }); c.speed = 0; c.attackCd = 0; c.heading = Math.PI / 2; H.critters.push(c); const v = new __VC(H.arena.group, c); v.phase = 0; H.views.set(c, v); window.__walker = c;
    const a = c.def.atk; return Math.round((a.windup + a.recover) * 60); }, [tier]);
  await step(1);                                                                      // the critter notices the player and starts its wind-up this frame
  for (let i = 0; i < 12; i++) {
    const want = Math.round(i * total / 11) - (i ? Math.round((i - 1) * total / 11) : 0); await step(Math.max(0, want));
    await page.evaluate(([d, r]) => { const H = __hero, c = __walker, cam = H.stage.camera; cam.position.set(c.x + d * 0.12 + 0.6, r * 1.8, c.y - d); cam.lookAt(c.x + 0.5, r * 1.2, c.y); cam.updateMatrixWorld(true); H.stage.render(); }, [DIST[tier], tier === 'big' ? 1.2 : tier === 'mid' ? 0.7 : 0.38]);
    await page.screenshot({ path: `${out}-${tier}-${i}.png`, clip: { x: 340, y: 120, width: 600, height: 480 } });
  }
}
console.log('sheet frames saved; page errors:', errors.length ? errors : 'none'); await b.close();
