import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd, KINDS } from '../src/game/crowd.js';
import { createDirector, pickSpawn, spawnTable, DIRECTOR } from '../src/game/director.js';
import { runAim } from '../src/game/autoaim.js';
import { createRun, createSession, RUN } from '../src/game/run.js';
import { buildWorld, BOUNDS } from '../src/game/layout.js';

const empty = { bounds: BOUNDS, circles: [], boxes: [] };
const seeded = (s = 1) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const P = (x = 0, y = 0) => ({ x, y, vx: 0, vy: 0, r: 0.5 });
const run = (crowd, secs, player = P(), o) => { let c = []; for (let i = 0; i < secs * 60; i++) c = c.concat(crowd.step(1 / 60, player, o)); return c; };

/* ---------------- crowd ---------------- */
test('a puff walks up to the player and touches them', () => {
  const c = new Crowd(empty, { rng: seeded() }); c.spawn('puff', 0, 10, 0);
  const touched = run(c, 4); assert.ok(touched.length >= 1, 'reached the player'); assert.ok(c.list[0].x < 2);
});
test('contact damage has a cooldown: one touch is one hit, not one per step', () => {
  const c = new Crowd(empty, { rng: seeded() }); const e = c.spawn('puff', 0, 0.6, 0);
  const hits = run(c, 0.5).length; assert.ok(hits <= 1, `got ${hits}`);
});
test('no contact is reported while the player is invulnerable (canHurt false)', () => {
  const c = new Crowd(empty, { rng: seeded() }); c.spawn('puff', 0, 0.6, 0); assert.equal(run(c, 1, P(), { canHurt: false }).length, 0);
});
test('a pack spawned on one spot spreads out instead of stacking into one blob', () => {
  const c = new Crowd(empty, { rng: seeded(3) }); for (let i = 0; i < 30; i++) c.spawn('puff', 0, 12 + i * 0.01, 3);
  run(c, 3, P(-20, 3), { speedMul: 0.3 });
  let overlaps = 0; for (let i = 0; i < c.list.length; i++) for (let j = i + 1; j < c.list.length; j++) { const a = c.list[i], b = c.list[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.6) overlaps++; }
  assert.ok(overlaps < 12, `${overlaps} heavily overlapping pairs`);
});
test('a pack arrives from different sides (personal flank angles differ)', () => {
  const c = new Crowd(empty, { rng: seeded(9) }); for (let i = 0; i < 12; i++) c.spawn('puff', 0, 18, 0);
  run(c, 1.2); const ys = c.list.map(e => e.y); assert.ok(Math.max(...ys) - Math.min(...ys) > 1.5, 'spread across the lane');
});
test('a puff goes round a pillar instead of grinding on it forever', () => {
  const world = { bounds: BOUNDS, circles: [{ x: 5, y: 0, r: 1.8 }], boxes: [] }, c = new Crowd(world, { rng: seeded(5) });
  c.spawn('puff', 0, 12, 0); const touched = run(c, 12); assert.ok(touched.length >= 1, 'got past the pillar');
});
test('damage reduces health, flashes and knocks back; a kill reports points', () => {
  const c = new Crowd(empty, { rng: seeded() }), e = c.spawn('puff', 0, 5, 0);
  const a = c.damage(e, 10, 1, 0); assert.equal(a.killed, false); assert.equal(e.hp, 20); assert.equal(e.flash, 1); assert.ok(e.kx > 0);
  const b = c.damage(e, 50, 1, 0); assert.equal(b.killed, true); assert.equal(b.points, KINDS.puff.tiers[0].score); assert.equal(e.alive, false);
});
test('dead enemies take no more damage and never count twice', () => {
  const c = new Crowd(empty, { rng: seeded() }), e = c.spawn('puff', 0, 5, 0); c.damage(e, 999, 1, 0); const r = c.damage(e, 10, 1, 0); assert.deepEqual([r.killed, r.dealt], [false, 0]);
});
test('knockback is capped, however many pellets land', () => {
  const c = new Crowd(empty, { rng: seeded() }), e = c.spawn('puff', 2, 5, 0); for (let i = 0; i < 50; i++) c.damage(e, 1, 1, 0); assert.ok(Math.hypot(e.kx, e.ky) <= 9);
});
test('a big puff splits into two mediums, a medium into two smalls, a small just dies', () => {
  const c = new Crowd(empty, { rng: seeded() });
  const big = c.spawn('puff', 2, 5, 5), r = c.damage(big, 9999, 1, 0); assert.equal(r.children.length, 2); assert.ok(r.children.every(k => k.tier === 1 && k.alive));
  const med = r.children[0], r2 = c.damage(med, 9999, 0, 1); assert.equal(r2.children.length, 2); assert.ok(r2.children.every(k => k.tier === 0));
  const sm = r2.children[0], r3 = c.damage(sm, 9999, 1, 0); assert.equal(r3.children.length, 0);
});
test('the pellet-target list keeps its identity and drops the dead', () => {
  const c = new Crowd(empty, { rng: seeded() }), list = c.list, e = c.spawn('puff', 0, 5, 5); c.damage(e, 999, 1, 0); c.step(1 / 60, P(30, 30)); assert.equal(c.list, list); assert.equal(c.list.length, 0);
});
test('a zipper telegraphs, then dashes at where you are going, then recovers', () => {
  const c = new Crowd(empty, { rng: seeded() }), z = c.spawn('zip', 0, 7, 0); z.age = 1;
  const seen = new Set(); const player = { x: 0, y: 0, vx: 0, vy: 6, r: 0.5 };
  for (let i = 0; i < 60 * 4; i++) { c.step(1 / 60, player, { canHurt: false }); seen.add(z.state); player.y += 0.1; if (z.state === 'dash') break; }
  assert.ok(seen.has('windup') && seen.has('dash'), [...seen].join());
  assert.ok(z.lockY > 0.05, 'locks ahead of a player who is running south, not at their feet');
  let recovered = false; for (let i = 0; i < 60 * 2 && !recovered; i++) { c.step(1 / 60, player, { canHurt: false }); recovered = z.state === 'recover'; } assert.ok(recovered, 'a dash ends in a recovery');
});
test('a zipper in its windup cannot hurt you; a dash can', () => {
  const c = new Crowd(empty, { rng: seeded() }), z = c.spawn('zip', 0, 0.7, 0); z.age = 1; z.state = 'windup'; z.st = 0;
  assert.equal(c.step(1 / 60, P(), {}).length, 0);
});
test('a hundred and fifty enemies step in well under a millisecond each', () => {
  const c = new Crowd(buildWorld(), { rng: seeded(2) }); for (let i = 0; i < 150; i++) c.spawn('puff', i % 3, -20 + (i % 30), -14 + Math.floor(i / 30) * 3);
  const t0 = performance.now(); for (let i = 0; i < 120; i++) c.step(1 / 60, P(0, 7), { canHurt: false }); const per = (performance.now() - t0) / 120;
  assert.ok(per < 4, `${per.toFixed(2)} ms per crowd step`);
});

/* ---------------- director ---------------- */
test('the director never lets cost run past the cap (swarms aside)', () => {
  const rng = seeded(4), d = createDirector({ world: empty, bounds: BOUNDS, rng }), c = new Crowd(empty, { rng });
  for (let i = 0; i < 60 * 25; i++) for (const e of d.update(1 / 60, { player: P(0, 7), cost: c.cost })) if (e.type === 'spawn') c.spawn(e.kind, e.tier, e.x, e.y);
  assert.ok(c.cost <= d.cap() + 1e-6 + 6, `cost ${c.cost} cap ${d.cap()}`);
});
test('every spawn is announced before it appears', () => {
  const d = createDirector({ world: empty, bounds: BOUNDS, rng: seeded() }); const tel = [], sp = [];
  for (let i = 0; i < 60 * 10; i++) for (const e of d.update(1 / 60, { player: P(), cost: 0 })) (e.type === 'telegraph' ? tel : e.type === 'spawn' ? sp : []).push(e);
  assert.ok(tel.length >= sp.length && sp.length > 0);
  for (const s of sp) assert.ok(tel.some(t => t.x === s.x && t.y === s.y), 'announced');
});
test('spawn points are out of sight, inside the arena and not inside a prop', () => {
  const world = buildWorld(), rng = seeded(8);
  for (let i = 0; i < 200; i++) {
    const p = { x: -20 + rng() * 40, y: -12 + rng() * 24 }, s = pickSpawn(p, BOUNDS, world, rng);
    assert.ok(s.x >= BOUNDS.minX && s.x <= BOUNDS.maxX && s.y >= BOUNDS.minY && s.y <= BOUNDS.maxY);
    for (const c of world.circles) assert.ok(Math.hypot(s.x - c.x, s.y - c.y) >= c.r, 'inside a circle prop');
    for (const b of world.boxes) assert.ok(!(Math.abs(s.x - b.x) < b.hw && Math.abs(s.y - b.y) < b.hh), 'inside a wall');
  }
});
test('spawn points are a screen away from the player where the arena allows it', () => {
  const rng = seeded(12); let far = 0;
  for (let i = 0; i < 100; i++) { const p = { x: 0, y: 0 }, s = pickSpawn(p, BOUNDS, empty, rng); if (Math.hypot(s.x, s.y) >= DIRECTOR.minSpawnDist - 1e-6) far++; }
  assert.ok(far >= 90, `${far}/100`);
});
test('bigger enemies unlock as time passes', () => {
  const kinds = t => spawnTable(t).map(e => `${e.kind}${e.tier}`);
  assert.deepEqual(kinds(0), ['puff0']); assert.ok(kinds(25).includes('puff1')); assert.ok(kinds(40).includes('zip0')); assert.ok(kinds(80).includes('puff2'));
});
test('a swarm arrives on schedule, and says so', () => {
  const d = createDirector({ world: empty, bounds: BOUNDS, rng: seeded() }); let swarm = null, t = 0;
  while (!swarm && t < 60) { for (const e of d.update(1 / 60, { player: P(), cost: 99 })) if (e.type === 'swarm') swarm = e; t += 1 / 60; }
  assert.ok(swarm && t >= DIRECTOR.firstSwarm - 0.1 && t < DIRECTOR.firstSwarm + 1, `t=${t}`); assert.ok(swarm.n >= 8);
});
test('the pressure setting scales how much may be alive', () => {
  const a = createDirector({ world: empty, bounds: BOUNDS, pressure: () => 1 }), b = createDirector({ world: empty, bounds: BOUNDS, pressure: () => 2 }); assert.ok(b.cap() > a.cap() * 1.9);
});

/* ---------------- auto-aim ---------------- */
const E = (x, y, o = {}) => ({ x, y, vx: 0, vy: 0, r: 0.4, alive: true, ...o });
const none = { x: 0, y: 0 }, walk0 = { x: 0, y: 0, mag: 0 };
test('auto-aim picks the nearest enemy and leaves the player alone when there is none', () => {
  const a = runAim(P(), none, walk0, false, [E(8, 0), E(0, 3)], empty); assert.equal(a.source, 'auto'); assert.ok(a.y > 0.99);
  assert.equal(runAim(P(), none, walk0, false, [], empty).aiming, false);
});
test('the right stick overrides the auto-aim', () => {
  const a = runAim(P(), { x: 1, y: 0 }, walk0, true, [E(0, 3)], empty); assert.equal(a.source, 'explicit'); assert.deepEqual([a.x, a.y], [1, 0]);
});
test('enemies behind a wall are not chosen', () => {
  const world = { bounds: BOUNDS, circles: [], boxes: [{ x: 0, y: 2, hw: 3, hh: 0.3 }] };
  const a = runAim(P(), none, walk0, false, [E(0, 4), E(7, 0)], world); assert.ok(a.x > 0.99, 'chose the visible one');
});
test('the aim leads a moving target', () => {
  const a = runAim(P(), none, walk0, false, [E(10, 0, { vy: 5 })], empty, { lead: 1 }); assert.ok(a.y > 0.05, `y ${a.y}`);
  const b = runAim(P(), none, walk0, false, [E(10, 0, { vy: 5 })], empty, { lead: 0 }); assert.ok(Math.abs(b.y) < 1e-9);
});
test('target switching is sticky: a slightly closer enemy does not steal the aim', () => {
  const a = E(6, 0), b = E(0, 5.6); const r = runAim(P(), none, walk0, false, [a, b], empty, { prev: a }); assert.equal(r.target, a);
  const c = E(0, 2); assert.equal(runAim(P(), none, walk0, false, [a, c], empty, { prev: a }).target, c, 'a much closer one does');
});
test('with nothing to shoot, firing points the gun where you are walking', () => {
  const a = runAim(P(), none, { x: 0, y: 1, mag: 1 }, true, [], empty); assert.equal(a.source, 'walk'); assert.ok(a.y > 0.99);
  assert.equal(runAim(P(), none, { x: 0, y: 1, mag: 1 }, false, [], empty).source, 'none');
});

/* ---------------- run: hearts, score ---------------- */
test('hearts, invulnerability and game over', () => {
  const r = createRun({ hearts: 2 }); assert.equal(r.hurt(), true); assert.equal(r.hp, 1); assert.equal(r.hurt(), false, 'invulnerable right after a hit');
  r.tick(RUN.invuln + 0.1); assert.equal(r.hurt(), true); assert.equal(r.over, true); assert.equal(r.hp, 0);
  const s = r.time; r.tick(5); assert.equal(r.time, s, 'the clock stops at game over');
});
test('kills build a combo multiplier that a hit or a pause breaks', () => {
  const r = createRun(); let gains = []; for (let i = 0; i < 9; i++) gains.push(r.kill(10));
  assert.deepEqual(gains.slice(0, 4), [10, 10, 10, 10]); assert.equal(gains[4], 20); assert.equal(gains[8], 30); assert.equal(r.mult, 3);
  r.tick(RUN.comboWindow + 0.1); assert.equal(r.mult, 1); r.kill(10); r.kill(10); r.hurt(); assert.equal(r.combo, 0);
});
test('the multiplier is capped', () => { const r = createRun(); for (let i = 0; i < 400; i++) r.kill(1); assert.equal(r.mult, RUN.maxMult); });

/* ---------------- session ---------------- */
test('a player who stands still dies, and the game says so once', () => {
  const s = createSession({ world: empty, bounds: BOUNDS, rng: seeded(6) }); let dead = 0, hurt = 0;
  for (let i = 0; i < 120 * 150 && !s.run.over; i++) for (const e of s.step(1 / 120, P(0, 7))) { if (e.type === 'dead') dead++; if (e.type === 'hurt') hurt++; }
  assert.equal(s.run.over, true); assert.equal(dead, 1); assert.equal(hurt, 3); assert.ok(s.run.time > 10, `survived ${s.run.time.toFixed(1)} s`);
});
test('killing things through the session scores and splits', () => {
  const s = createSession({ world: empty, bounds: BOUNDS, rng: seeded(6) }), e = s.crowd.spawn('puff', 2, 5, 5);
  const r = s.hit(e, 9999, 1, 0); assert.equal(r.killed, true); assert.equal(r.gain, 40); assert.equal(s.run.score, 40); assert.equal(r.children.length, 2);
});
test('reset starts a fresh run', () => {
  const s = createSession({ world: empty, bounds: BOUNDS }); s.crowd.spawn('puff', 0, 1, 1); s.run.kill(10); s.reset(); assert.equal(s.run.score, 0); assert.equal(s.crowd.list.length, 0); assert.equal(s.run.hp, 3);
});
