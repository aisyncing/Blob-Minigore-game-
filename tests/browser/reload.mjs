// Findings 11 and 12 in the real game loop: real key events, per-frame sampling of the rendered hero, belt, casings and HUD.
import assert from 'node:assert/strict';
import { openGame, scene } from './harness.mjs';
const g = await openGame(); const { page } = g;
const NAMES = ['Gumdrop', 'Sprout', 'Marshmallow'];
const key = (code, ms = 60) => page.evaluate(async ([c, ms]) => { dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })); await new Promise(r => setTimeout(r, ms)); dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true })); }, [code, ms]);

async function run({ hero, capacity, shots, early, change = null }) {
  await scene(page, { hero, px: 0, py: 6, aim: [0, -1], tune: { 'gun.capacity': capacity, 'gun.reload': 0.95 } });
  await page.evaluate(() => { const H = __hero, h = H.heroes[H.state().selected];
    window.__rec = { stages: [], casings: 0, frames: [], starts: 0, dones: 0 };
    for (const x of H.heroes) x.onReloadStage = (st) => { window.__rec.stages.push(st); };
    if (!window.__installed) { window.__installed = true; const c = H.fx.casing.bind(H.fx); H.fx.casing = (...a) => { window.__rec.casings++; return c(...a); };
    const tick = () => { const H = __hero, h = H.heroes[H.state().selected], p = H.gun.progress;
      if (p >= 0) window.__rec.frames.push({ p, hud: parseFloat(document.querySelector('#reloadBar i').style.width) / 100, carried: h.carried.map(c => !!c && c.visible), beltHidden: h.beltShells.filter(b => !b.sh.visible).length, total: H.gun.state.reloadTotal, dur: H.gun.state.t * 1000 });
      requestAnimationFrame(tick); }; requestAnimationFrame(tick); } });
  for (let i = 0; i < shots; i++) { await key('Space', 40); await page.waitForTimeout(340); }
  if (early) await key('KeyR', 80);
  if (change) { await page.waitForFunction(() => __hero.gun.progress > 0.4, null, { timeout: 4000 }); await page.evaluate(v => __hero.tuning.set('gun.reload', v), change); }
  await page.waitForFunction(() => !__hero.gun.reloading && __rec.frames.length > 5, null, { timeout: 8000 }); await page.waitForTimeout(100);
  return page.evaluate(() => ({ ...window.__rec, ammo: __hero.gun.state.ammo, cap: __hero.P.capacity }));
}
const check = (r, need, tag) => {
  assert.equal(r.casings, need, `${tag}: ejects ${need} casing(s), got ${r.casings}`);
  assert.deepEqual(r.stages, ['eject', 'grab', 'insert', 'close'], `${tag}: each reload beat exactly once`);
  const mid = r.frames.filter(f => f.p > 0.3 && f.p < 0.64);   // after the grab, before the insert
  assert.ok(mid.length >= 2, tag + ': sampled mid-reload ' + JSON.stringify({ n: r.frames.length, ps: r.frames.map(f => +f.p.toFixed(2)), stages: r.stages }));
  assert.ok(mid.every(f => f.carried.filter(Boolean).length === need), `${tag}: ${need} shell(s) visible in the hand`);
  assert.ok(mid.every(f => f.beltHidden === need), `${tag}: ${need} shell(s) taken from the belt (hidden: ${[...new Set(mid.map(f => f.beltHidden))]})`);
  assert.equal(r.ammo, r.cap, tag + ': full again');
};
for (const hero of [0, 1, 2]) {
  check(await run({ hero, capacity: 1, shots: 1, early: false }), 1, `${NAMES[hero]} capacity 1`);
  check(await run({ hero, capacity: 2, shots: 1, early: true }), 1, `${NAMES[hero]} 2-shell gun, 1 fired, early reload`);
  check(await run({ hero, capacity: 2, shots: 2, early: false }), 2, `${NAMES[hero]} empty 2-shell gun`);
}
console.log('ok finding 12: one casing / one belt shell / one shell in hand for 1-shell and partial; full sequence when empty (3 heroes)');

// finding 11: slider moved mid-reload in both directions
for (const change of [2.5, 0.2]) {
  const r = await run({ hero: 1, capacity: 2, shots: 2, early: false, change });
  const ps = r.frames.map(f => f.p), hud = r.frames.map(f => f.hud);
  for (let i = 1; i < ps.length; i++) { assert.ok(ps[i] >= ps[i - 1] - 1e-9, `progress goes forward (${ps[i - 1]} -> ${ps[i]})`); assert.ok(Math.abs(hud[i] - ps[i]) < 0.02, 'HUD bar matches progress'); }
  assert.ok(ps.at(-1) <= 1); assert.deepEqual(r.stages, ['eject', 'grab', 'insert', 'close'], `slider -> ${change}: each reload event once`); assert.equal(r.casings, 2);
  const secs = (r.frames.at(-1).dur - r.frames[0].dur) / 1000; assert.ok(secs < 1.3 && secs > 0.6, JSON.stringify(r.frames.map(f => [+f.p.toFixed(2), Math.round(f.dur - r.frames[0].dur), f.total])) + ` the running reload keeps its original ~0.95 s (${secs.toFixed(2)} game-seconds) when the slider goes to ${change}`);
  assert.ok(r.frames.every(f => f.total === 0.95), 'the captured duration does not change mid-reload');
  // the next reload uses the new value
  await page.evaluate(() => { __rec.frames.length = 0; }); await key('Space', 40); await page.waitForTimeout(340); await key('Space', 40);
  await page.waitForFunction(() => __hero.gun.reloading, null, { timeout: 3000 }); assert.equal(await page.evaluate(() => __hero.gun.state.reloadTotal), change, 'next reload uses the edited time');
  await page.waitForFunction(() => !__hero.gun.reloading, null, { timeout: 8000 });
}
console.log('ok finding 11: slider up and down mid-reload');
assert.deepEqual(g.errors, []); await g.close(); console.log('reload: all passed');
