// The survival game in the real page: waves of critters, splitting, hearts, game over, retry. Driven by hand through simStep (headless frame rate is too low to play in real time).
import assert from 'node:assert/strict';
import { openGame, freeze } from './harness.mjs';
const g = await openGame({ practice: false }); const { page } = g;
await g.tap('A'); await g.tap('A');                                                        // leave the setup screen, then play
await freeze(page);
const state = () => page.evaluate(() => { const H = __hero; return { mode: H.state().mode, run: H.run.state, wave: H.director.state.wave, critters: H.critters.length, alive: H.critters.filter(c => c.alive).length, hp: H.health.state.hp, kills: H.score.state.kills, pts: H.score.state.points, over: document.querySelector('#over').classList.contains('show'), dummiesAlive: H.targets.filter(t => t.kind !== 'critter' && t.alive).length }; });
const sim = n => page.evaluate(n => { for (let i = 0; i < n; i++) __hero.simStep(1 / 120); }, n);

let s = await state(); assert.equal(s.mode, 'play'); assert.equal(s.run, 'playing'); assert.equal(s.hp, 5, 'five hearts'); assert.equal(s.dummiesAlive, 0, 'the training dummies are not part of a run');
await page.evaluate(() => { __hero.snap.move.x = 1; });                                      // a little movement so the hero is not a sitting duck
await page.evaluate(() => { __hero.snap.move.x = 0; });
await page.evaluate(() => { __hero.health.state.invulnT = 99; });
await sim(120 * 8); s = await state(); assert.equal(s.wave, 1, 'wave 1 has started'); assert.ok(s.critters >= 3, 'critters are coming: ' + s.critters);
assert.equal(await page.evaluate(() => { __hero.updateHud(); return document.querySelector('#waveV').textContent.startsWith('Wave 1'); }), true, 'HUD shows the wave');
ok('wave 1 spawns critters out of the ground');

// kill a big one: it splits into two mids
const split = await page.evaluate(() => { const H = __hero, P = H.player; P.x = 0; P.y = 0; H.health.state.invulnT = 99;
  const C = H.critters[0].constructor, big = new C({ tier: 'big', x: 0, y: -3, warn: 0, rise: 0 }); H.critters.push(big); H.views.set(big, new (H.views.get(H.critters[0]).constructor)(H.arena.group, big));
  const before = H.critters.filter(c => c.tier === 'mid').length; P.aimX = 0; P.aimY = -1; P.hasAim = true;
  for (let k = 0; k < 2 && big.alive; k++) { H.shoot(0, 2); for (let i = 0; i < 60; i++) H.simStep(1 / 120); H.gun.reset(); }
  return { dead: big.state === 'dead', mids: H.critters.filter(c => c.tier === 'mid').length - before, pts: H.score.state.points }; });
assert.equal(split.dead, true, 'the big critter dies to a point-blank blast'); assert.ok(split.mids >= 2, 'and leaves two mids: ' + split.mids); assert.ok(split.pts >= 30, 'score for the kill');
ok('shooting a big critter splits it and scores');

// bites cost hearts, one at a time, then the run ends
await page.evaluate(() => { __hero.health.state.invulnT = 0; });
await sim(120 * 40); s = await state(); assert.equal(s.run, 'over', 'five hearts gone: game over'); assert.equal(s.hp, 0); assert.equal(s.over, true, 'game-over panel is up');
ok('critters bite, hearts run out, game over');

// retry from the controller: A starts a fresh run, only after the short delay
await sim(120 * 1); await g.pad({ buttons: { A: 1 } }); await page.evaluate(() => { __hero.input.sample(performance.now()); __hero.menuStep(); }); await g.pad({ buttons: { A: 0 } });
s = await state(); assert.equal(s.run, 'playing', 'A restarts'); assert.equal(s.hp, 5); assert.equal(s.wave, 0); assert.equal(s.critters, 0); assert.equal(s.over, false);
ok('A starts a new run');

// practice mode brings the dummies back and turns waves off
await page.click('#bPractice'); s = await state(); assert.ok(s.dummiesAlive > 0, 'dummies are back'); await sim(120 * 5); s = await state(); assert.equal(s.critters, 0, 'no critters in practice');
ok('practice range is still there');
assert.deepEqual(g.errors, [], 'no page errors'); await g.close(); console.log('game-run: all passed');
function ok(m) { console.log('ok', m); }
