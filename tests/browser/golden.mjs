// Golden master for refactors: plays a scripted session in a fully deterministic page (seeded Math.random, fake clock,
// hand-stepped animation frames, simulated controller) and records the gameplay state and the rendered WebGL pixels.
// Two builds that behave and look the same produce identical output.
//
//   node tests/browser/golden.mjs <outDir>            record
//   node tests/browser/golden.mjs <outDir> <refDir>   record, then compare against an earlier recording (exit 1 on any difference)
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, PAD_SHIM } from './harness.mjs';

const [outDir, refDir] = process.argv.slice(2);
if (!outDir) { console.error('usage: golden.mjs <outDir> [refDir]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const DETERMINISM = `(() => {
  let s = 12345; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let clock = 1000; performance.now = () => clock;
  let queue = [];
  window.requestAnimationFrame = f => { queue.push(f); return queue.length; };
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) { clock += 1000 / 60; const q = queue; queue = []; for (const f of q) f(clock); } };
})();`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.addInitScript(DETERMINISM); await page.addInitScript(PAD_SHIM);
await page.goto(pathToFileURL(resolve('dist/hero.html')).href + '?tutorial=off');
await page.waitForFunction(() => window.__hero && window.__step);
// Drawing every one of ~2000 frames on a software GPU takes minutes and never feeds back into the game, so between checkpoints a frame
// only does what render() does besides drawing (refresh world matrices). Each checkpoint below draws for real.
await page.evaluate(() => { const st = window.__hero.stage; st.__draw = st.render; st.render = () => { st.scene.updateMatrixWorld(); st.camera.updateMatrixWorld(); }; });
// The wave banner (a CSS animation) and the hurt flash (a timeout) run on the real clock, not the fake one; everything else in the HTML
// overlay (HUD, hearts, ammo, name labels, buttons) is deterministic and is compared too.
await page.addStyleTag({ content: '#banner,#vig{visibility:hidden!important} *{animation:none!important;transition:none!important}' });

const step = n => page.evaluate(n => window.__step(n), n);
const pad = o => page.evaluate(o => window.__padSet(o), o);
const r = v => Math.round(v * 1e4) / 1e4;
const state = () => page.evaluate(() => {
  const H = window.__hero, p = H.player, q = v => Math.round(v * 1e4) / 1e4;
  return {
    ...H.state(), runMode: H.run.mode, runState: H.run.state,
    player: [p.x, p.y, p.vx, p.vy, p.aimX, p.aimY, p.hasAim].map(v => typeof v === 'number' ? q(v) : v),
    gun: { ...H.gun.state, spent: [...H.gun.state.spent] },
    hp: H.health.state.hp, score: { ...H.score.state }, wave: H.director.state.wave, queue: H.director.state.queue.length,
    critters: H.critters.map(c => [c.tier, c.state, q(c.x), q(c.y), q(c.hp)]),
    targets: H.targets.map(t => [t.kind, t.alive, q(t.x), q(t.y), q(t.hp)]),
    pellets: H.pellets.pellets.map(e => [q(e.x), q(e.y), q(e.traveled)]),
    stats: { shots: H.stats.shots, pellets: H.stats.pellets, hits: H.stats.hits, damage: q(H.stats.damage), kills: H.stats.kills },
    hero: H.heroes.map(h => [q(h.root.position.x), q(h.root.position.z), q(h.root.rotation.y), q(h.aimYaw), q(h.legYaw), h.root.visible]),
  };
});
// read the WebGL image in the same task as the render, so the drawing buffer has not been cleared yet
const pixels = () => page.evaluate(() => { const st = window.__hero.stage; st.__draw(); return st.renderer.domElement.toDataURL('image/png'); });
const log = [];
async function checkpoint(name) {
  log.push({ name, state: await state() });
  writeFileSync(join(outDir, name + '.png'), Buffer.from((await pixels()).split(',')[1], 'base64'));
  await page.screenshot({ path: join(outDir, name + '.page.png') });       // the whole page: canvas plus the HTML overlay
}

// ---- the session ----
await step(5);
await page.evaluate(() => document.querySelector('#bStart').click()); await step(60);
await checkpoint('01-menu');
await page.evaluate(() => window.__hero.choose(1)); await step(20); await checkpoint('02-menu-turning');
await step(60); await checkpoint('03-menu-sprout');
await page.evaluate(() => window.__hero.choose(0)); await step(60);
await page.evaluate(() => document.querySelector('#bPlayNow').click()); await step(30);
await checkpoint('04-play-start');
await pad({ axes: [1, 0, 0, 0] }); await step(50);                       // strafe east
await pad({ axes: [0, -1, 0, 0] }); await step(40);                      // north
await pad({ axes: [0, 0, 0, 0] }); await step(80);                       // wave 1 climbs out
await checkpoint('05-wave1');
for (let i = 0; i < 14; i++) {                                           // fight: strafe in a square while firing at whatever auto aim picks
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]][i % 4];
  await pad({ axes: [dir[0] * 0.8, dir[1] * 0.8, 0, 0], buttons: { RT: 1 } }); await step(18);
  await pad({ buttons: { RT: 0 } }); await step(12);
}
await checkpoint('06-fight');
await pad({ axes: [0.8, 0, 0.7, -0.7], buttons: { RT: 1 } }); await step(40);  // strafing east while aiming north-east with the right stick, firing
await pad({ axes: [0, 0, 0, 0], buttons: { RT: 0, X: 1 } }); await step(4); await pad({ buttons: { X: 0 } }); await step(60);   // manual reload
await checkpoint('07-after-reload');
await pad({ axes: [0, 0, 0, 0] }); await step(900);                       // stand still: critters bite until game over
await checkpoint('08-later');
// practice range
await page.evaluate(() => document.querySelector('#bPractice').click()); await step(30);
await pad({ axes: [-0.9, -0.5, 0, 0] }); await step(120);
await pad({ axes: [-0.3, 0, -0.6, -0.8], buttons: { RT: 1 } }); await step(150);        // rapid fire held at the dummies while drifting west
await pad({ axes: [0, 0, 0, 0], buttons: { RT: 0 } }); await step(60);
await checkpoint('09-practice');
// keyboard + mouse: the pad goes idle, WASD moves, the cursor aims, clicks fire
await page.mouse.move(400, 200); await step(5);
await page.keyboard.down('KeyD'); await step(40); await page.keyboard.up('KeyD');
await page.keyboard.down('KeyW'); await page.mouse.move(300, 150); await step(10);
for (let i = 0; i < 4; i++) { await page.mouse.down(); await step(3); await page.mouse.up(); await step(20); }
await page.keyboard.up('KeyW'); await page.keyboard.press('KeyR'); await step(90);
await checkpoint('10-keyboard-mouse');
await page.evaluate(() => window.__hero.resetRange()); await step(10); await checkpoint('10b-range-reset');
await page.evaluate(() => window.__hero.setMode('compare')); await step(40); await checkpoint('11-back-to-menu');

writeFileSync(join(outDir, 'state.json'), JSON.stringify(log, null, 1));
writeFileSync(join(outDir, 'errors.json'), JSON.stringify(errors));
await browser.close();
console.log(`golden: recorded ${log.length} checkpoints to ${outDir}${errors.length ? ` (${errors.length} page errors!)` : ''}`);

if (refDir) {
  let bad = 0;
  const a = JSON.parse(readFileSync(join(refDir, 'state.json'), 'utf8')), b = log;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const sa = JSON.stringify(a[i]), sb = JSON.stringify(JSON.parse(JSON.stringify(b[i])));
    if (sa !== sb) { bad++; console.log(`STATE DIFFERS at ${a[i]?.name ?? b[i]?.name}`); for (const k of Object.keys(a[i]?.state || {})) if (JSON.stringify(a[i].state[k]) !== JSON.stringify(b[i]?.state?.[k])) console.log('   ', k, '\n      ref', JSON.stringify(a[i].state[k]).slice(0, 300), '\n      new', JSON.stringify(b[i]?.state?.[k]).slice(0, 300)); }
  }
  for (const f of readdirSync(refDir).filter(f => /^\d\d.*\.png$/.test(f))) {
    const p = join(outDir, f); if (!existsSync(p) || !readFileSync(p).equals(readFileSync(join(refDir, f)))) { bad++; console.log('PIXELS DIFFER', f); }
  }
  if (errors.length) { bad++; console.log('page errors:', errors); }
  console.log(bad ? `golden: ${bad} difference(s) against ${refDir}` : `golden: identical to ${refDir} (state + pixels, ${b.length} checkpoints)`);
  process.exit(bad ? 1 : 0);
}
