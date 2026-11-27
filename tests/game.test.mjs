import test from 'node:test';
import assert from 'node:assert/strict';
import { Critter, TIERS } from '../src/game/critters.js';
import { waveSpec, waveQueue, createDirector } from '../src/game/waves.js';
import { createHealth, createScore } from '../src/game/run.js';
import { buildWorld } from '../src/game/layout.js';

const world = { bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 }, circles: [], boxes: [] };
const player = { x: 0, y: 0, r: 0.6 };

test('a critter warns, climbs out, then chases; it cannot be hurt or hit before then', () => {
  const c = new Critter({ tier: 'mid', x: 10, y: 0, warn: 1, rise: 0.5 });
  assert.equal(c.alive, false); assert.deepEqual(c.damage(50), { killed: false, dealt: 0 });
  for (let i = 0; i < 100; i++) c.step(0.01, { player, world }); assert.equal(c.state, 'rise');
  for (let i = 0; i < 60; i++) c.step(0.01, { player, world }); assert.equal(c.state, 'chase'); assert.equal(c.alive, true);
});
test('a chasing critter closes in on the player and bites at most once per cooldown', () => {
  const c = new Critter({ tier: 'small', x: 6, y: 0, warn: 0, rise: 0 }); let bites = 0, t = 0;
  const d0 = Math.hypot(c.x, c.y); for (let i = 0; i < 100; i++) c.step(0.01, { player, world }); assert.ok(Math.hypot(c.x, c.y) < d0 - 2, 'moved toward the player');
  for (let i = 0; i < 600; i++) { if (c.step(0.01, { player, world }) === 'attack') bites++; t += 0.01; }
  assert.ok(bites >= 1 && bites <= Math.ceil(t / 0.9) + 1, `bites ${bites}`);
});
test('shooting a big critter kills it and leaves two mids, which leave two smalls each; smalls leave nothing', () => {
  const big = new Critter({ tier: 'big', x: 0, y: 0, warn: 0, rise: 0 });
  assert.deepEqual(big.damage(TIERS.big.hp - 1), { killed: false, dealt: TIERS.big.hp - 1 }); assert.equal(big.damage(5).killed, true); assert.equal(big.alive, false);
  const mids = big.splits(); assert.equal(mids.length, 2); assert.ok(mids.every(m => m.tier === 'mid' && m.state === 'rise'), 'they climb out quickly');
  assert.equal(mids[0].splits().length, 2); assert.deepEqual(mids[0].splits()[0].splits(), []);
});
test('knockback pushes along the shot and lighter critters fly further', () => {
  const a = new Critter({ tier: 'big', x: 0, y: 0, warn: 0, rise: 0 }), b = new Critter({ tier: 'small', x: 0, y: 0, warn: 0, rise: 0 });
  a.knock(1, 0, 12); b.knock(1, 0, 12); assert.ok(a.kb.x > 0 && b.kb.x > a.kb.x);
});
test('a pack spreads apart instead of stacking, and walls stop critters', () => {
  const cs = Array.from({ length: 6 }, () => new Critter({ tier: 'mid', x: 8, y: 8, warn: 0, rise: 0 }));
  for (let i = 0; i < 300; i++) for (const c of cs) c.step(0.01, { player: { x: 8, y: 0, r: 0.6 }, world, others: cs });
  const spread = Math.max(...cs.map(c => c.x)) - Math.min(...cs.map(c => c.x)); assert.ok(spread > 0.5, 'spread ' + spread);
  const w = buildWorld(); const e = new Critter({ tier: 'mid', x: 4, y: 3, warn: 0, rise: 0 });
  for (let i = 0; i < 400; i++) e.step(0.01, { player: { x: 4, y: -12, r: 0.6 }, world: w, others: [] }); assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
});
test('waves start quick, grow every wave, and queue exactly what the spec says', () => {
  assert.ok(waveSpec(1).total >= 4 && waveSpec(1).total <= 8);
  for (let n = 1; n < 15; n++) assert.ok(waveSpec(n + 1).total > waveSpec(n).total, 'wave ' + n);
  const q = waveQueue(5); const s = waveSpec(5); assert.equal(q.length, s.total); assert.equal(q.filter(t => t === 'big').length, s.big);
  assert.ok(waveSpec(1).small === 0 && waveSpec(4).small > 0, 'fast runners join from wave 3');
});
test('the director runs rest -> wave -> spawns -> clear -> rest, and waits while the arena is full', () => {
  const d = createDirector({ maxLive: 3, firstDelay: 1, restDelay: 1 }); let live = 0, started = 0, cleared = 0, spawns = 0, maxSeen = 0;
  for (let i = 0; i < 6000; i++) {
    for (const e of d.step(0.01, live)) { if (e.type === 'wave') started++; else if (e.type === 'spawn') { spawns++; live++; } else if (e.type === 'clear') cleared++; }
    maxSeen = Math.max(maxSeen, live); if (i % 70 === 0 && live > 0) live--;                       // the player kills one now and then
    if (started >= 2 && cleared >= 1) break;
  }
  assert.ok(started >= 2 && cleared >= 1, `waves ${started} cleared ${cleared}`); assert.ok(maxSeen <= 3, 'cap respected: ' + maxSeen); assert.ok(spawns >= waveSpec(1).total);
});
test('health: hits are ignored while invulnerable; five hits end the run; reset restores it', () => {
  const h = createHealth({ max: 5, invuln: 1 }); assert.equal(h.hit(), true); assert.equal(h.hit(), false, 'invulnerable'); h.update(1.1); assert.equal(h.hit(), true);
  for (let i = 0; i < 3; i++) { h.update(1.1); h.hit(); } assert.equal(h.dead, true); assert.equal(h.hit(), false); h.reset(); assert.equal(h.state.hp, 5);
});
test('score: a kill chain raises the multiplier to x5 and a pause drops it', () => {
  const s = createScore(); assert.equal(s.kill(10), 10); for (let i = 0; i < 3; i++) s.kill(10); assert.equal(s.mult, 2); for (let i = 0; i < 40; i++) s.kill(10); assert.equal(s.mult, 5);
  s.update(3); assert.equal(s.mult, 1);
});
