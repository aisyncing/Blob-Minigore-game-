// Findings 6 and 8: dummy respawn at any frame rate; Reset range really resets everything.
import assert from 'node:assert/strict';
import { openGame, freeze, scene } from './harness.mjs';
const g = await openGame(); const { page } = g; await freeze(page);

// ---------- finding 6
await scene(page, { hero: 0, dummy: { x: 5, y: 5 } });
const respawnRun = (dts) => page.evaluate(dts => { const H = __hero, v = H.views.get(H.targets[0]); v.respawn(); let t = 0, max = 0, min = 9, vis = true; const seq = [];
  for (const dt of dts) { v.update(dt, t += dt); const s = v.group.scale.x; max = Math.max(max, s); min = Math.min(min, s); vis = vis && v.group.visible; seq.push(s); }
  return { max, min, vis, end: v.group.scale.x, pivot: v.pivot.scale.x, all: seq.every(Number.isFinite) }; }, dts);
const rep = (dt, secs) => Array(Math.round(secs / dt)).fill(dt);
for (const [name, dts] of [['60 fps', rep(1 / 60, 3)], ['30 fps', rep(1 / 30, 3)], ['10 fps', rep(0.1, 3)], ['repeated 100 ms', rep(0.1, 5)], ['mixed 8/16/100 ms', Array(60).fill(0).flatMap(() => [0.008, 0.016, 0.1])]]) {
  const r = await respawnRun(dts);
  assert.ok(r.all && r.vis, name + ': visible and finite'); assert.ok(r.max <= 1.35 && r.min > 0, `${name}: sensible size (min ${r.min.toFixed(2)} max ${r.max.toFixed(2)})`);
  assert.ok(Math.abs(r.end - 1) < 1e-2 && Math.abs(r.pivot - 1) < 1e-2, `${name}: settles at scale 1 (${r.end})`);
}
console.log('ok finding 6: respawn stable at 60/30/10 fps, 100 ms frames and mixed frames');

// ---------- finding 8
const snapshot = () => page.evaluate(() => { const H = __hero; return { shots: H.stats.shots, pellets: H.stats.pellets, hits: H.stats.hits, damage: H.stats.damage, kills: H.stats.kills, inflight: H.pellets.pellets.length, last: H.stats.last, recent: H.stats.recent.size,
  hp: H.targets.map(t => t.alive ? t.hp : -1), maxhp: H.targets.map(t => t.maxHp), pend: H.targets.map(t => (t.dmgAcc || 0)), marks: H.arena.group.children.filter(o => o.userData && o.userData.mark && o.visible).length, numbers: window.__numbers.length, stat: document.querySelector('#shotStat').textContent }; });
for (const mode of ['pellets in flight', 'pending damage numbers']) {
  await scene(page, { hero: 0, px: 0, py: 6, aim: [0, -1], dummy: mode === 'pellets in flight' ? { x: 0, y: -2 } : { x: 0, y: 3.6 } });
  await page.evaluate(() => { const H = __hero; window.__numbers = []; const n = H.fx.number.bind(H.fx); H.fx.number = (...a) => { window.__numbers.push(a); return n(...a); }; });
  await page.evaluate(() => { __hero.snap.aim.x = 0; __hero.snap.aim.y = -1; __hero.snap.aim.mag = 1; __hero.snap.fire = true; let i = 0; while (__hero.stats.shots < 1 && i++ < 50) __hero.simStep(1 / 120); __hero.snap.fire = false; });
  // pellets in flight: reset 3 steps after the shot (dummy 8 units away: they need ~0.15 s). pending numbers: reset right after the first hit lands
  await page.evaluate(m => { const H = __hero; if (m === 'pellets in flight') { for (let i = 0; i < 3; i++) H.simStep(1 / 120); } else { let i = 0; while (H.stats.hits === 0 && i++ < 60) H.simStep(1 / 120); } }, mode);
  const pre = await snapshot(); if (mode === 'pellets in flight') assert.ok(pre.inflight > 0, 'pellets are in flight when reset is pressed'); else assert.ok(pre.pend[0] > 0 || pre.hits > 0, 'damage feedback is pending');
  await page.evaluate(() => document.querySelector('#bRange').click());
  await page.evaluate(() => { for (let i = 0; i < 360; i++) __hero.simStep(1 / 120); });             // well past the maximum pellet flight time (15 u at 55 u/s)
  const r = await snapshot();
  assert.equal(r.inflight, 0, mode + ': no pellets'); assert.deepEqual([r.shots, r.pellets, r.hits, r.damage, r.kills], [0, 0, 0, 0, 0], mode + ': session counters are zero');
  assert.deepEqual(r.hp, r.maxhp, mode + ': every dummy at full health'); assert.equal(r.recent, 0, 'shot records cleared'); assert.equal(r.last, null);
  assert.ok(r.pend.every(v => v === 0), 'no pending damage'); assert.equal(r.numbers, pre.numbers, mode + ': no damage number appears after the reset');
  assert.match(r.stat, /Fire at a dummy/, 'the Last shot panel is reset'); assert.equal(r.marks, 0, 'board marks cleared');
  console.log('ok finding 8:', mode);
}
{ // board marks
  await scene(page, { hero: 0, px: -2, py: -6, aim: [0, -1] });
  const vis = () => page.evaluate(() => __hero.arena.group.children.filter(o => o.userData && o.userData.mark && o.visible).length);
  await page.evaluate(() => { __hero.arena.boardMark(-4); __hero.arena.boardMark(-3); }); assert.equal(await vis(), 2, 'marks exist before the reset');
  await page.evaluate(() => document.querySelector('#bRange').click()); assert.equal(await vis(), 0, 'reset clears the board marks'); console.log('ok finding 8: board marks');
}
assert.deepEqual(g.errors, []); await g.close(); console.log('range: all passed');
