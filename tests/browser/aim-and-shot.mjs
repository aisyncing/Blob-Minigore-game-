// Findings 2, 3 and 7, driven through the real simStep with the input snapshot set by hand (render loop frozen for determinism).
import assert from 'node:assert/strict';
import { openGame, freeze, scene } from './harness.mjs';
const g = await openGame(); const { page } = g; await freeze(page);
const RAD = [0.66, 0.56, 0.64], NAMES = ['Gumdrop', 'Sprout', 'Marshmallow'];
const set = (fn, arg) => page.evaluate(fn, arg);

// record every pellet spawn and every muzzle flash
await set(() => { const H = __hero; H.rec = { spawns: [], flashes: [] };
  const sp = H.pellets.spawn.bind(H.pellets); H.pellets.spawn = (x, y, dx, dy, o) => { H.rec.spawns.push({ x, y, dx, dy }); return sp(x, y, dx, dy, o); };
  const fl = H.fx.flash.bind(H.fx); H.fx.flash = (x, y, z, ...r) => { H.rec.flashes.push({ x, z }); return fl(x, y, z, ...r); }; });
const fireStick = (o = {}) => set(o => { const s = __hero.snap; s.fire = true; Object.assign(s.move, o.move || { x: 0, y: 0, mag: 0 }); const a = o.aim || { x: 0, y: 0, mag: 0 }; Object.assign(s.aim, a); }, o);
const runUntilShots = (n) => set(n => { const H = __hero; let i = 0; while (H.stats.shots < n && i++ < 400) H.simStep(1 / 120); H.snap.fire = false; for (let k = 0; k < 200; k++) H.simStep(1 / 120); }, n);

// ---------- finding 2
for (const hero of [0, 1, 2]) {
  await scene(page, { hero, px: 0, py: 6, dummy: { x: 0, y: -2 }, tune: { 'assist.mode': 2 } });   // open lane: nothing between them
  await fireStick({ move: { x: 1, y: 0, mag: 1 } });        // left stick east, right stick centred, RT
  await set(() => { __hero.simStep(1 / 120); __hero.simStep(1 / 120); __hero.simStep(1 / 120); });
  const d = await set(() => { const s = __hero.rec.spawns[0]; return s && [s.dx, s.dy]; });
  assert.ok(d && d[1] < -0.9 && Math.abs(d[0]) < 0.3, `F2 ${NAMES[hero]}: first pellet heads north at the dummy, got ${d}`);
  await runUntilShots(1); assert.ok((await set(() => __hero.stats.hits)) >= 3, 'F2: the first blast really hits the dummy');
}
{ // explicit right stick (east) wins over the north target
  await scene(page, { hero: 0, px: 0, py: 6, dummy: { x: 0, y: -2 }, tune: { 'assist.mode': 2 } });
  await fireStick({ move: { x: 0, y: 1, mag: 1 }, aim: { x: 1, y: 0, mag: 1 } }); await set(() => __hero.simStep(1 / 120));
  const d = await set(() => { const s = __hero.rec.spawns.at(-1); return [s.dx, s.dy]; }); assert.ok(d[0] > 0.9, `F2: explicit aim east wins, got ${d}`);
}
{ // no aim, no valid target (nothing alive): walking direction
  await scene(page, { hero: 0, tune: { 'assist.mode': 2 } });
  await fireStick({ move: { x: 1, y: 0, mag: 1 } }); await set(() => __hero.simStep(1 / 120));
  const d = await set(() => { const s = __hero.rec.spawns.at(-1); return [s.dx, s.dy]; }); assert.ok(d[0] > 0.9, `F2: walking is the fallback, got ${d}`);
}
{ // a wall between the player and the north dummy: no valid auto-target, so walking direction
  await scene(page, { hero: 0, px: 0, py: 6, dummy: { x: 0, y: -2 }, tune: { 'assist.mode': 2 } });
  await set(() => __hero.arena.world.boxes.push({ x: 0, y: 2, hw: 3, hh: 0.2, tmp: 1 }));
  await fireStick({ move: { x: 1, y: 0, mag: 1 } }); await set(() => __hero.simStep(1 / 120));
  const d = await set(() => { const s = __hero.rec.spawns.at(-1); return [s.dx, s.dy]; }); assert.ok(d[0] > 0.9, `F2: blocked target is not valid, got ${d}`);
  await set(() => { const w = __hero.arena.world.boxes; w.splice(w.findIndex(b => b.tmp), 1); });
}
console.log('ok finding 2');

// ---------- finding 3
for (const hero of [0, 1, 2]) for (const deg of [12, -12]) for (const barrel of [0, 1]) {
  const a = deg * Math.PI / 180, d = RAD[hero] + 0.55 + 0.001;
  await scene(page, { hero, aim: [0, -1], dummy: { x: Math.sin(a) * d, y: -Math.cos(a) * d } });
  await set(() => { __hero.gun.state.nextBarrel = 0; });
  const barrelUsed = await set(b => { const H = __hero; if (b) { /* burn the first barrel into the air */ } return 0; }, barrel);
  if (barrel) { // fire barrel 0 at nothing first by moving the dummy away, then bring it back for barrel 1
    await set(() => { const t = __hero.targets[0]; t.__x = t.x; t.__y = t.y; t.x = 50; t.y = 50; });
    await fireStick({ aim: { x: 0, y: -1, mag: 1 } }); await runUntilShots(1);
    await set(() => { const t = __hero.targets[0]; t.x = t.__x; t.y = t.__y; const s = __hero.stats; s.hits = 0; s.damage = 0; __hero.pellets.clear(); __hero.gun.state.interval ??= 0; });
    await set(() => { for (let i = 0; i < 60; i++) __hero.simStep(1 / 120); });
  }
  const before = await set(() => __hero.stats.shots);
  await fireStick({ aim: { x: 0, y: -1, mag: 1 } }); await runUntilShots(before + 1);
  const r = await set(() => ({ hits: __hero.stats.hits, dmg: Math.round(__hero.stats.damage), hp: __hero.targets[0].hp, last: __hero.stats.last }));
  assert.equal(r.hits, 9, `F3 ${NAMES[hero]} ${deg}° barrel ${barrel}: all 9 pellets hit (each exactly once), got ${r.hits}`);
  assert.equal(r.last.hits, 9);
}
console.log('ok finding 3 (3 heroes x +-12 degrees x both barrels)');
{ // wall closer than the dummy
  await scene(page, { hero: 1, aim: [0, -1], dummy: { x: 0.2, y: -1.2 } });
  await set(() => __hero.arena.world.boxes.push({ x: 0, y: -0.75, hw: 2, hh: 0.08, tmp: 1 }));
  await fireStick({ aim: { x: 0, y: -1, mag: 1 } }); await runUntilShots(1);
  const r = await set(() => ({ hits: __hero.stats.hits, hp: __hero.targets[0].hp, max: __hero.targets[0].maxHp }));
  assert.equal(r.hits, 0, 'wall in front: no pellet reaches the dummy'); assert.equal(r.hp, r.max);
  await set(() => { const w = __hero.arena.world.boxes; w.splice(w.findIndex(b => b.tmp), 1); });
}
console.log('ok finding 3 (wall stops the shot)');

// ---------- finding 7
async function reverseAndFire(hero, moving) {
  await scene(page, { hero, px: 3, py: 3, aim: [0, -1] });
  await set(m => { const H = __hero; H.rec.spawns.length = H.rec.flashes.length = 0; if (m) { H.player.v.x = 6; H.player.v.y = 2; H.snap.move.x = 1; H.snap.move.y = 0.3; H.snap.move.mag = 1; }
    const s = H.snap; s.aim.x = 0; s.aim.y = 1; s.aim.mag = 1; s.fire = true; H.simStep(1 / 120); }, moving);   // aim reversed 180 degrees, fired in the same step
  return set(() => { const H = __hero, h = H.heroes[H.state().selected], p = H.player, sp = H.rec.spawns, fl = H.rec.flashes[0], m = h.muzzleWorld(new h.root.position.constructor());
    // sp[i] was recorded before the pellet moved this step: it is the true spawn point
    return { origin: sp[0], n: sp.length, flash: fl, muzzle: { x: m.x, z: m.z }, player: { x: p.x, y: p.y }, aim: { x: p.aimX, y: p.aimY }, yaw: h.torso.rotation.y }; });
}
for (const hero of [0, 1, 2]) for (const moving of [false, true]) {
  const r = await reverseAndFire(hero, moving), tag = `F7 ${NAMES[hero]} ${moving ? 'moving' : 'still'}`;
  assert.equal(r.n, 9, tag + ': 9 pellets'); assert.ok(r.aim.y > 0.99, tag + ': aim reversed instantly (responsive)');
  assert.ok(Math.hypot(r.origin.x - r.flash.x, r.origin.y - r.flash.z) < 0.1, `${tag}: pellet origin matches flash (${JSON.stringify(r.origin)} vs ${JSON.stringify(r.flash)})`);
  assert.ok(Math.hypot(r.muzzle.x - r.flash.x, r.muzzle.z - r.flash.z) < 1e-6, tag + ': flash is at the visible muzzle');
  const fwd = (r.muzzle.x - r.player.x) * r.aim.x + (r.muzzle.z - r.player.y) * r.aim.y, side = (r.muzzle.x - r.player.x) * -r.aim.y + (r.muzzle.z - r.player.y) * r.aim.x;
  assert.ok(Math.abs(fwd - 1.64) < 0.08 && Math.abs(side) < 0.08, `${tag}: visible gun is out in front of the body, aimed along the shot (fwd ${fwd.toFixed(2)}, side ${side.toFixed(2)})`);
  assert.ok(Math.abs(Math.sin(r.yaw) - r.aim.x) < 1e-3 && Math.abs(Math.cos(r.yaw) - r.aim.y) < 1e-3, tag + ': torso (gun) faces the aim');
}
console.log('ok finding 7 (3 heroes x still/moving)');
{ // obstruction still handled: wall right in front of the muzzle, aim reversed and fired
  await scene(page, { hero: 1, px: 0, py: 0, aim: [0, -1], dummy: { x: 0, y: 3 } });
  await set(() => __hero.arena.world.boxes.push({ x: 0, y: 0.9, hw: 2, hh: 0.1, tmp: 1 }));
  await set(() => { const H = __hero; H.rec.spawns.length = 0; const s = H.snap; s.aim.x = 0; s.aim.y = 1; s.aim.mag = 1; s.fire = true; H.simStep(1 / 120); });
  const o = await set(() => __hero.rec.spawns[0]); assert.ok(o.y < 1.0 + 1e-6 && o.y > 0.7, `pellets start at the wall face, not beyond it (y=${o.y})`);
  await runUntilShots(1); assert.equal(await set(() => __hero.stats.hits), 0, 'nothing gets through the wall');
  await set(() => { const w = __hero.arena.world.boxes; w.splice(w.findIndex(b => b.tmp), 1); });
}
console.log('ok finding 7 (obstruction kept)');
assert.deepEqual(g.errors, []); await g.close(); console.log('aim-and-shot: all passed');
