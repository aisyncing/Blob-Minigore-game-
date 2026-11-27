// Live survival run with a simulated controller: A starts, R2 held, left stick circling.
// Checks: no page errors, no HUD/text on screen while playing, the aim lock never jumps to another enemy while its target lives,
// furries spawn, attack and die, and the pause and game-over cards appear when they should.
import { openGame } from './harness.mjs';
import assert from 'node:assert/strict';

const shot = process.argv[2];
const { page, errors, pad, tap, close } = await openGame();
await tap('A'); await tap('A');
assert.equal(await page.evaluate(() => window.__hero.state().mode), 'run', 'A from the hero select starts the survival run');

// nothing on screen while playing
const visible = () => page.evaluate(() => [...document.querySelectorAll('#top,#hint,#ammo,#panelBtn,#panel,#pauseCard,#over,#cards')].filter(el => el.checkVisibility() && el.getBoundingClientRect().width > 0).map(el => el.id));
assert.deepEqual(await visible(), [], 'no UI while playing');

await pad({ buttons: { RT: 1 } });
await page.evaluate(() => {
  const H = window.__hero; window.__log = { switches: 0, locks: 0, kills: 0, states: new Set(), maxAlive: 0 };
  H.__hurt = H.sess.run.hurt; H.sess.run.hurt = () => false;                                   // immortal for the test, so it keeps playing
  let prev = null;
  const tick = () => {
    const t = H.lock.target, L = window.__log;
    if (t && prev && t !== prev && prev.alive && !['range', 'hidden'].includes(H.lock.dropped)) L.switches++;
    if (t && t !== prev) L.locks++;
    prev = t; for (const e of H.sess.crowd.list) L.states.add(e.state); L.maxAlive = Math.max(L.maxAlive, H.sess.crowd.alive);
    requestAnimationFrame(tick);
  };
  tick();
});
const t0 = Date.now();
while (Date.now() - t0 < 22000) {
  const a = (Date.now() - t0) / 1400;
  await pad({ axes: [Math.cos(a) * 0.8, Math.sin(a) * 0.8] });
  await page.waitForTimeout(120);
}
const log = await page.evaluate(() => ({ ...window.__log, states: [...window.__log.states], kills: window.__hero.stats.kills, time: window.__hero.sess.run.time, fps: 0 }));
console.log('live run:', JSON.stringify(log));
if (shot) await page.screenshot({ path: shot });
assert.deepEqual(await visible(), [], 'still no UI after 20 s of play');
assert.equal(log.switches, 0, 'the lock never jumped to another enemy while its target was alive');
assert.ok(log.kills > 0, 'something died');
assert.ok(log.states.includes('emerge') && log.states.includes('chase'), 'furries dug out and chased');

await pad({ buttons: { RT: 0 }, axes: [0, 0] });
await tap('Start');
assert.ok((await visible()).includes('pauseCard'), 'Start shows the pause card');
await tap('Start');
assert.deepEqual(await visible(), [], 'Start again hides it');

// the reported bug: furries pressed up against the hero made the aim flick between them. Freeze the loop and drive the real
// simStep with R2 held while eight of them crowd in; the aim must stay on one target and turn smoothly.
const press = await page.evaluate(() => {
  const H = window.__hero, raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
  H.sess.crowd.clear(); H.lock.target = null; H.player.x = 0; H.player.y = 3; H.player.v.x = H.player.v.y = 0;
  H.sess.director.update = () => [];                                 // no new spawns during the check
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; H.sess.crowd.spawn('furry', i % 2, Math.cos(a) * 1.6, 3 + Math.sin(a) * 1.6, { emerge: false }); }
  let switches = 0, prev = null, maxTurn = 0, lastYaw = null, inside = 0;
  for (let k = 0; k < 240; k++) {
    Object.assign(H.snap, { fire: true, mouseAim: false }); H.snap.aim.x = H.snap.aim.y = H.snap.aim.mag = 0; H.snap.move.x = H.snap.move.y = H.snap.move.mag = 0;
    H.simStep(1 / 120);
    const t = H.lock.target; if (t && prev && t !== prev && prev.alive && !['range', 'hidden'].includes(H.lock.dropped)) switches++; prev = t;
    const yaw = Math.atan2(H.player.aimX, H.player.aimY);
    if (lastYaw !== null && k > 30) { let d = Math.abs(yaw - lastYaw); d = Math.min(d, 6.283 - d); maxTurn = Math.max(maxTurn, d); }
    lastYaw = yaw;
    for (const e of H.sess.crowd.list) inside = Math.max(inside, e.r + H.heroes[0].radius - Math.hypot(e.x - H.player.x, e.y - H.player.y));
  }
  window.requestAnimationFrame = raf; raf(() => 0);
  return { switches, maxTurnDeg: maxTurn * 180 / Math.PI, inside, alive: H.sess.crowd.alive };
});
console.log('pressed in:', JSON.stringify(press));
assert.equal(press.switches, 0, 'no lock switching while the target lives');
assert.ok(press.inside < 0.06, `no furry sinks into the hero (deepest ${press.inside.toFixed(3)})`);
assert.ok(press.maxTurnDeg < 30 * 180 / Math.PI / 120 + 0.5, `aim turns at most at the capped rate (${press.maxTurnDeg.toFixed(2)}° per step)`);
await page.evaluate(() => { const H = window.__hero, r = H.sess.run; r.hurt = H.__hurt; r.hp = 1; r.invuln = 0; for (let i = 0; i < 40 && !r.over; i++) { const e = H.sess.crowd.spawn('furry', 1, H.player.x + 1.2, H.player.y, { emerge: false }); for (let k = 0; k < 120 && !r.over; k++) H.simStep(1 / 120); } });
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => window.__hero.sess.run.over), true, 'a Furry swipe on the last heart ends the run');
assert.ok((await visible()).includes('over'), 'the game-over card shows');
await tap('A');
assert.equal(await page.evaluate(() => window.__hero.sess.run.over), false, 'A starts a fresh run');
assert.deepEqual(await visible(), [], 'and the screen is clear again');
assert.equal(errors.length, 0, errors.join('\n'));
console.log('run-live: ok');
await close();
