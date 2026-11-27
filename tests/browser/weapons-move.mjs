// Controls and weapons in the real page with a simulated controller: only the left stick and R2 are used, the first shot goes at the target,
// the run opens with the pistol and the SMG arrives with the wave-2 countdown, and every footfall rumbles in proportion to speed.
import { openGame, freeze } from './harness.mjs';
import assert from 'node:assert/strict';

const { page, errors, pad, tap, close } = await openGame();
const get = (fn, arg) => page.evaluate(fn, arg);
await tap('A'); await tap('A');
assert.equal(await get(() => window.__hero.state().mode), 'run');

// ---- the pistol is the opening weapon
const gear = () => get(() => { const H = window.__hero, h = H.heroes[H.state().selected]; return { weapon: H.weapon(), id: H.W().id, interval: H.W().interval, capacity: H.W().capacity, heroWeapon: h.weapon, shotgunShown: h.shotgunParts.some(m => m.visible), pistolShown: h.models.pistol.group.visible, smgShown: h.models.smg.group.visible }; });
let g = await gear();
assert.deepEqual([g.weapon, g.heroWeapon, g.shotgunShown, g.pistolShown, g.smgShown], ['pistol', 'pistol', false, true, false], 'the hero holds a pistol and no shotgun');
assert.ok(g.interval < 0.2 && g.capacity >= 10, 'quick fire and a real magazine');

// ---- the right stick and the mouse do nothing in the run; R2 aims at the nearest furry
await get(() => { const H = window.__hero; H.__du = H.sess.director.update; H.__wu = H.sess.waves.update; H.sess.director.update = () => []; H.sess.waves.update = () => []; H.sess.crowd.clear(); H.sess.crowd.spawn('furry', 1, H.player.x, H.player.y - 6, { emerge: false }); H.sess.crowd.list[0].speed = 0; });
await pad({ axes: [0, 0, 1, 0], buttons: { RT: 1 } });                      // right stick pushed hard to the east, R2 held
await page.waitForFunction(() => window.__hero.lock.target, null, { timeout: 40000 });
await page.waitForTimeout(600);
const a1 = await get(() => ({ x: window.__hero.player.aimX, y: window.__hero.player.aimY }));
assert.ok(a1.y < -0.9 && Math.abs(a1.x) < 0.3, `aim stays on the furry to the north, not the right stick's east: ${JSON.stringify(a1)}`);
await pad({ axes: [0, 0, 0, 0], buttons: { RT: 0 } });

// ---- the first shot goes at the target, even if the hero was facing another way when R2 went down
await freeze(page);
const first = await get(() => {
  const H = window.__hero, P = H.player; H.sess.crowd.clear(); H.pellets.clear(); H.lock.target = null; H.gun.reset(); H.stats.shots = 0;
  P.x = 2; P.y = 6; P.v.x = P.v.y = P.kb.x = P.kb.y = 0; P.aimX = 1; P.aimY = 0; P.hasAim = true;                                  // facing east
  const e = H.sess.crowd.spawn('furry', 1, 2, 12, { emerge: false }); e.speed = 0;                                                  // the furry is due south, in the open
  Object.assign(H.snap, { fire: true, mouseAim: true }); H.snap.aim.x = 1; H.snap.aim.y = 0; H.snap.aim.mag = 1; H.snap.move.x = H.snap.move.y = H.snap.move.mag = 0; H.input.mouse.x = 9; H.input.mouse.y = 0;
  for (let i = 0; i < 400 && !H.stats.shots; i++) H.simStep(1 / 120);
  const p = H.pellets.pellets[0];
  return { shots: H.stats.shots, dx: p?.dx, dy: p?.dy, aim: { x: P.aimX, y: P.aimY } };
});
assert.equal(first.shots, 1, 'a shot was fired'); assert.ok(first.dy > 0.97 && Math.abs(first.dx) < 0.2, `the first bullet flew south at the furry, not east where the hero was facing: ${JSON.stringify(first)}`);
assert.ok(await get(() => window.__hero.stats.recent.size >= 1));

// ---- the SMG arrives with the wave-2 countdown, with a notice
const before = (await gear()).weapon;
await get(() => { const H = window.__hero; H.sess.waves.update = H.__wu; H.sess.director.update = H.__du; H.sess.crowd.clear(); H.sess.waves.state.phase = 'active'; H.sess.waves.state.wave = 1; H.sess.waves.state.since = 99; H.sess.run.kills = 99; for (let i = 0; i < 80; i++) H.simStep(1 / 120); });
g = await gear();
assert.equal(before, 'pistol'); assert.deepEqual([g.weapon, g.heroWeapon, g.pistolShown, g.smgShown], ['smg', 'smg', false, true], 'the SMG is in hand');
assert.ok(g.interval < 0.1 && g.capacity >= 25, `an SMG rate and magazine (${g.interval}s, ${g.capacity})`);
assert.match(await get(() => document.querySelector('#note').textContent), /SMG/, 'the notice says so');
assert.equal(await get(() => window.__hero.sess.waves.state.next), 2);

// ---- the SMG empties its magazine at its rate and the pistol's trigger feel differs
const burst = await get(() => {
  const H = window.__hero; H.gun.reset(); H.stats.shots = 0; Object.assign(H.snap, { fire: true }); let t = 0; const at = [];
  for (let i = 0; i < 120 && at.length < 10; i++) { const n = H.stats.shots; H.simStep(1 / 120); t += 1 / 120; if (H.stats.shots > n) at.push(t); }
  return at.slice(1).map((v, i) => v - at[i]);
});
assert.ok(burst.length >= 5 && burst.every(d => Math.abs(d - 0.075) < 0.012), `the SMG fires every 75 ms: ${burst.map(d => d.toFixed(3))}`);
await get(() => { window.__hero.snap.fire = false; });

// ---- footsteps: no movement, no rumble; moving, a pulse per step that grows with speed and alternates motors
await page.reload(); await page.waitForFunction(h => window[h], '__hero');
await tap('A'); await tap('A');
await get(() => { const H = window.__hero; H.sess.director.update = () => []; H.sess.waves.update = () => []; H.sess.crowd.clear(); window.__rumble = []; });
await page.waitForTimeout(800);
const still = await get(() => window.__rumble.length);
assert.equal(still, 0, 'standing still: no vibration');
const run = async (stick, dist) => {
  await get(() => { window.__rumble = []; window.__d0 = { x: window.__hero.player.x, y: window.__hero.player.y }; });
  await pad({ axes: [stick, 0, 0, 0] });
  await page.waitForFunction(d => Math.abs(window.__hero.player.x - window.__d0.x) > d, dist, { timeout: 60000 });
  await pad({ axes: [0, 0, 0, 0] });
  return get(() => ({ r: window.__rumble.slice(), moved: Math.abs(window.__hero.player.x - window.__d0.x) }));
};
const slow = await run(0.45, 4), fast = await run(1, 8);
assert.ok(slow.r.length >= 2 && fast.r.length >= 4, `steps rumble: ${slow.r.length} slow, ${fast.r.length} fast`);
const avg = (rs, k) => rs.reduce((a, x) => a + Math.max(x.s, x.w), 0) / rs.length;
assert.ok(avg(fast.r) > avg(slow.r) * 1.2, `running steps harder than walking steps (${avg(fast.r).toFixed(2)} vs ${avg(slow.r).toFixed(2)})`);
const heavyFirst = fast.r.map(x => x.s > x.w); let alternates = 0; for (let i = 1; i < heavyFirst.length; i++) if (heavyFirst[i] !== heavyFirst[i - 1]) alternates++;
assert.ok(alternates >= fast.r.length - 3, `the feet alternate between the heavy and light motor (${alternates} of ${fast.r.length - 1} changes)`);
const perUnit = fast.r.length / fast.moved; assert.ok(perUnit > 0.35 && perUnit < 1.4, `about one pulse per stride (${perUnit.toFixed(2)} per unit)`);

// ---- paused: the vibration stops
await tap('Start'); await get(() => { window.__rumble = []; }); await pad({ axes: [1, 0, 0, 0] }); await page.waitForTimeout(700); await pad({ axes: [0, 0, 0, 0] });
assert.equal(await get(() => window.__rumble.length), 0, 'no footsteps while paused');
assert.equal(errors.length, 0, errors.join('\n'));
console.log('weapons-move: ok');
await close();
