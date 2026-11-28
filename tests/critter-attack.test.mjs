// Critter attacks: wind-up (telegraph) -> strike -> recover. The player can dodge during the wind-up; a dead critter never lands a strike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Critter, TIERS, ATTACK_COOLDOWN } from '../src/game/critters.js';

const world = { bounds: { minX: -50, maxX: 50, minY: -50, maxY: 50 }, circles: [], boxes: [] };
const DT = 0.01, ALL = ['small', 'mid', 'big'];
const mk = (tier, gap = 0.3) => { const player = { x: 0, y: 0, r: 0.6 }, c = new Critter({ tier, x: 0, y: -(TIERS[tier].r + player.r + gap), warn: 0, rise: 0 }); c.attackCd = 0; return { c, player }; };
/** Steps until `stop(result)` or `max` seconds; returns { t, results } where results lists every non-null step result with its time. */
const run = (c, player, max, onStep) => { const out = []; let t = 0; for (let i = 0; i < max / DT; i++) { onStep?.(t, c); const r = c.step(DT, { player, world }); t += DT; if (r) out.push({ r, t }); } return out; };

test('a critter next to the player winds up first: no damage until the wind-up has run its course', () => {
  for (const tier of ALL) {
    const { c, player } = mk(tier); const a = TIERS[tier].atk;
    assert.equal(c.step(DT, { player, world }), null); assert.equal(c.state, 'windup', `${tier} starts winding up`); assert.ok(Math.abs(c.actDur - a.windup) < 1e-9);
    const res = run(c, player, a.windup + 0.2);
    assert.equal(res.length, 1, `${tier}: exactly one strike`); assert.equal(res[0].r, 'attack');
    assert.ok(res[0].t >= a.windup - 2 * DT && res[0].t <= a.windup + 2 * DT, `${tier}: lands at the end of the wind-up (${res[0].t.toFixed(2)} s vs ${a.windup})`);
  }
});

test('the telegraph gets longer with size: mini quick, mid medium, big slow', () => {
  assert.ok(TIERS.small.atk.windup < TIERS.mid.atk.windup && TIERS.mid.atk.windup < TIERS.big.atk.windup);
  assert.ok(TIERS.small.atk.recover < TIERS.mid.atk.recover && TIERS.mid.atk.recover <= TIERS.big.atk.recover);
});

test('stepping out of reach during the wind-up dodges it: the strike whiffs and no damage is dealt', () => {
  for (const tier of ALL) {
    const { c, player } = mk(tier); const a = TIERS[tier].atk; c.step(DT, { player, world }); assert.equal(c.state, 'windup');
    c.kb.x = c.kb.y = 0; player.y = 6;                                                  // the player is gone (a dash of a few units)
    const res = run(c, player, a.windup + 0.1);
    assert.deepEqual(res.map(x => x.r), ['whiff'], `${tier}: the strike misses`);
  }
});

test('a critter that dies during its wind-up never strikes', () => {
  for (const tier of ALL) {
    const { c, player } = mk(tier); c.step(DT, { player, world }); assert.equal(c.state, 'windup');
    assert.equal(c.damage(1e9).killed, true); assert.equal(c.state, 'dead');
    assert.deepEqual(run(c, player, 2), [], `${tier}: nothing lands from a dead critter`);
  }
});

test('while winding up it plants its feet (no walking), and it eases back into the chase after recovering', () => {
  const { c, player } = mk('mid'); c.step(DT, { player, world }); const x0 = c.x, y0 = c.y; c.kb.x = c.kb.y = 0;
  const far = { x: 0, y: 30, r: 0.6 };                                                  // a distant player would make it walk if it could
  for (let i = 0; i < 20; i++) c.step(DT, { player: far, world });
  assert.ok(Math.hypot(c.x - x0, c.y - y0) < 1e-6, 'planted during the wind-up');
  const res = run(c, far, TIERS.mid.atk.windup + TIERS.mid.atk.recover + 0.2); assert.equal(res[0].r, 'whiff');
  assert.equal(c.state, 'chase', 'back to chasing'); assert.ok(c.y > y0 + 0.05, 'and walking again');
});

test('a landed bite still throws the critter back, a whiff does not', () => {
  const a = mk('mid'); a.c.step(DT, { player: a.player, world }); run(a.c, a.player, 0.31); assert.ok(Math.hypot(a.c.kb.x, a.c.kb.y) > 1, 'thrown back after biting');
  const b = mk('mid'); b.c.step(DT, { player: b.player, world }); b.player.y = 8; b.c.kb.x = b.c.kb.y = 0; run(b.c, b.player, 0.31); assert.ok(Math.hypot(b.c.kb.x, b.c.kb.y) < 0.5, 'no recoil on a whiff');
});

test('the attack rate is unchanged: at most one wind-up per cooldown, whatever the size', () => {
  for (const tier of ALL) {
    const { c, player } = mk(tier); let winds = 0, was = c.state;
    for (let i = 0; i < 1000; i++) { c.step(DT, { player, world }); if (c.state === 'windup' && was !== 'windup') winds++; was = c.state; }
    assert.ok(winds >= 9 && winds <= Math.ceil(10 / ATTACK_COOLDOWN) + 1, `${tier}: ${winds} attacks in 10 s`);
  }
});

test('too far to reach: no wind-up starts, and the critter keeps chasing', () => {
  const player = { x: 0, y: 0, r: 0.6 }, c = new Critter({ tier: 'mid', x: 0, y: -4, warn: 0, rise: 0 }); c.attackCd = 0;
  for (let i = 0; i < 20; i++) c.step(DT, { player, world }); assert.equal(c.state, 'chase');
});

test('critters in any attack state still keep apart from their neighbours and still count as alive targets', () => {
  const { c, player } = mk('big'); c.step(DT, { player, world }); assert.equal(c.state, 'windup'); assert.equal(c.alive, true); assert.equal(c.active, true);
  const o = new Critter({ tier: 'mid', x: c.x + 0.1, y: c.y, warn: 0, rise: 0 }); o.speed = 0; o.attackCd = 1e9; const gap0 = Math.hypot(o.x - c.x, o.y - c.y);   // o cannot walk: only crowd separation can move it
  for (let i = 0; i < 30; i++) o.step(DT, { player, world, others: [c] }); assert.ok(Math.hypot(o.x - c.x, o.y - c.y) > gap0 + 0.05, 'the neighbour is pushed off a winding-up critter');
});

test('after the strike it recovers for its full recovery time, then chases again; a new wind-up waits for the cooldown', () => {
  for (const tier of ALL) {
    const { c, player } = mk(tier); const a = TIERS[tier].atk; c.step(DT, { player, world });
    let n = 0; while (c.state === 'windup' && n++ < 1000) c.step(DT, { player, world });
    assert.equal(c.state, 'recover', `${tier}: recovering right after the strike`); assert.ok(Math.abs(c.actDur - a.recover) < 1e-9);
    const t0 = c.t; for (let i = 0; i < Math.floor((a.recover - 0.03) / DT); i++) c.step(DT, { player, world }); assert.equal(c.state, 'recover', `${tier}: still recovering`); assert.ok(c.t < t0 && c.t > 0);
    for (let i = 0; i < 10; i++) c.step(DT, { player, world }); assert.notEqual(c.state, 'recover', `${tier}: done recovering`);
  }
  const { c, player } = mk('small'); c.step(DT, { player, world }); let winds = 0, was = c.state;                // the cooldown, not the recovery, paces the next attack
  for (let i = 0; i < 80; i++) { c.step(DT, { player, world }); if (c.state === 'windup' && was !== 'windup') winds++; was = c.state; }
  assert.equal(winds, 0, 'no second wind-up inside the cooldown');
});
