// End to end through the normal input path, simulated controller only: title screen -> choose a hero -> enter play -> strafe -> fire -> hit the intended dummy.
// Setup (placing the dummies) is the only thing done through hooks; every action the player takes is a pad button or stick value.
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';
const g = await openGame(); const { page } = g;
const q = () => page.evaluate(() => ({ overlayOff: document.querySelector('#focus').classList.contains('off'), ...__hero.state() }));
assert.equal((await q()).overlayOff, false, 'starts at the title screen');
await g.tap('A'); assert.equal((await q()).overlayOff, true, 'a button dismisses the title');
await g.tap('Right'); assert.equal((await q()).selected, 1, 'D-pad chooses Sprout');
await g.tap('A'); assert.equal((await q()).mode, 'play', 'A enters the arena');
// arrange the range: one intended dummy 4 units north of the player; every other dummy is switched off so any damage must be the intended one's
const setup = await page.evaluate(() => { const H = __hero, p = H.player; H.tuning.set('assist.mode', 2);                // Auto aim: the right stick stays centred below
  H.targets.forEach((t, i) => { if (i) { t.alive = false; t.respawnT = 1e9; } });
  const t = H.targets[0]; Object.assign(t, { x: p.x, y: p.y - 4, path: null, alive: true, hp: t.maxHp, respawnT: 1e9 });
  H.gun.reset(); H.stats.shots = H.stats.hits = H.stats.damage = 0; return { px: p.x, py: p.y, max: t.maxHp }; });
await g.pad({ axes: [0.8, 0, 0, 0], buttons: { RT: 1 } });                  // left stick east (strafing), right stick centred, RT held
await page.waitForFunction(() => __hero.stats.shots >= 1, null, { timeout: 5000 });
await page.waitForFunction(() => __hero.stats.hits > 0 || __hero.pellets.pellets.length === 0, null, { timeout: 5000 });
const r = await page.evaluate(() => { const H = __hero; return { strafed: H.player.x, hits: H.stats.hits, first: H.stats.last, hp: H.targets[0].hp, others: H.targets.slice(1).every(t => !t.alive), src: H.snap.source }; });
await g.pad({ buttons: { RT: 0 }, axes: [0, 0, 0, 0] });
assert.equal(r.src, 'controller', 'driven by the controller'); assert.ok(r.strafed - setup.px > 0.2, `the hero strafed east (${(r.strafed - setup.px).toFixed(2)} u)`);
assert.ok(r.hits >= 3, `the blast hit the intended dummy (${r.hits} pellets)`); assert.ok(r.hp < setup.max, `its health dropped (${r.hp}/${setup.max})`); assert.ok(r.others, 'nothing else was involved');
assert.deepEqual(g.errors, []); await g.close(); console.log('e2e-controller: all passed (' + r.hits + ' pellets hit while strafing, dummy health ' + r.hp + '/' + setup.max + ')');
