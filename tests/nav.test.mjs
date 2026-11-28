import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd, KINDS, STUCK } from '../src/game/crowd.js';
import { createNav, clearanceAt } from '../src/game/nav.js';
import { hasLineOfSight } from '../src/game/ballistics.js';
import { buildWorld, BOUNDS } from '../src/game/layout.js';

const world = buildWorld(), empty = { bounds: BOUNDS, circles: [], boxes: [] };
const seeded = (s = 1) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const P = (x, y) => ({ x, y, vx: 0, vy: 0, r: 0.5 });
const KIND_LIST = [['furry', 0], ['furry', 1], ['furry', 2], ['zip', 0]];

/** Step one lone enemy until it is next to the player. @returns seconds taken (Infinity if it never got there) and the enemy */
function chase(kind, tier, x, y, player, { secs = 45, seed = 5, w = world, each } = {}) {
  const c = new Crowd(w, { rng: seeded(seed) }), e = c.spawn(kind, tier, x, y, { emerge: false });
  for (let i = 0; i < secs * 60; i++) {
    c.step(1 / 60, player, { canHurt: false }); if (each) each(e, c);
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r + 1) return { t: i / 60, e };
  }
  return { t: Infinity, e };
}

/* ---------------- the reported soft-lock ---------------- */
test('the S-corridor trap: from (5.8, -7.4) behind the spine, every kind reaches a player at (-1.9, 0.9)', () => {
  const player = P(-1.9, 0.9);
  assert.equal(hasLineOfSight(5.8, -7.4, player.x, player.y, world), false, 'the case is the one with no line of sight');
  for (const [kind, tier] of KIND_LIST) {
    const { t, e } = chase(kind, tier, 5.8, -7.4, player);
    assert.ok(t < 30, `${KINDS[kind].tiers[tier].name} still stuck at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
    // the lanes are 2.8 wide: everything but the Giant (3.0 across) walks out through them; the Giant has to dig out
    if (!(kind === 'furry' && tier === 2)) assert.equal(e.reburrows, 0, `${KINDS[kind].tiers[tier].name} found its way without digging out`);
  }
});

test('nobody gets trapped anywhere: lone enemies dropped all over the arena all reach a player standing in the open', () => {
  const rng = seeded(11), players = [P(-1.9, 0.9), P(0, 7), P(-20, -14), P(20, 12)];
  let worst = 0;
  for (let k = 0; k < 64; k++) {
    const [kind, tier] = KIND_LIST[k % 4], r = KINDS[kind].tiers[tier].r, player = players[(k >> 2) % players.length];
    let x, y; do { x = BOUNDS.minX + 1 + rng() * 46; y = BOUNDS.minY + 1 + rng() * 30; } while (clearanceAt(x, y, world) < r + 0.2);
    const { t, e } = chase(kind, tier, x, y, player, { secs: 50, seed: k + 1 });
    assert.ok(t < 50, `${kind} ${tier} from (${x.toFixed(1)}, ${y.toFixed(1)}) to (${player.x}, ${player.y}) stuck at (${e.x.toFixed(1)}, ${e.y.toFixed(1)})`);
    worst = Math.max(worst, t);
  }
  assert.ok(worst < 45, `slowest arrival ${worst.toFixed(1)} s`);
});

/* ---------------- open ground is unchanged ---------------- */
test('in sight and in the open, the chase never touches the flow field', () => {
  const { t, e } = chase('furry', 0, 10, 0, P(0, 0), { w: empty, each: e => assert.equal(e.lost, false) });
  assert.ok(t < 5); assert.equal(e.reburrows, 0);
  // the real arena, open ground in the south-east: a clear look the whole way, so the same plain seek
  assert.ok(hasLineOfSight(19, 8, 11, 5, world));
  for (const [kind, tier] of KIND_LIST) chase(kind, tier, 19, 8, P(11, 5), { each: e => assert.equal(e.lost, false, `${kind} ${tier} switched to the field in the open`) });
});

test('round a single pillar the old sidestep still does the job: a lost enemy only follows the field while out of sight', () => {
  const w = { bounds: BOUNDS, circles: [{ x: 5, y: 0, r: 1.8 }], boxes: [] };
  const { t } = chase('furry', 1, 10, 0, P(0, 0), { w, each: e => { if (e.lost) assert.ok(!e.los || e.navHold > 0); } });
  assert.ok(t < 8);
});

/* ---------------- the field itself ---------------- */
test('the field knows the lanes are too narrow for a Giant, but open to a Furry', () => {
  const nav = createNav(world);
  const furry = nav.field(KINDS.furry.tiers[1].r, -1.9, 0.9), giant = nav.field(KINDS.furry.tiers[2].r, -1.9, 0.9);
  assert.ok(isFinite(nav.costAt(furry, 12, -7.2)), 'a Furry can leave lane 1');
  assert.ok(isFinite(nav.costAt(furry, 5.8, -7.4)), 'and the pocket behind the spine');
  assert.equal(nav.costAt(giant, 5.8, -7.4), Infinity, 'a Giant in that pocket has no way out');
  assert.ok(isFinite(nav.costAt(giant, 10, 8)), 'but has one from open ground');
  // the route out of the pocket goes east of the spine (through the gap and along the lanes), never west into it
  const [ux] = nav.steer(furry, 5.8, -7.4, KINDS.furry.tiers[1].r);
  assert.ok(ux > -0.3, `heading ${ux.toFixed(2)} into the spine`);
  // path cost is never shorter than the straight line, and round the maze it is a lot longer
  assert.ok(nav.costAt(furry, 5.8, -7.4) > Math.hypot(5.8 + 1.9, -7.4 - 0.9) * 2);
});

test('the field is only rebuilt when the player has moved to another cell, and not more often than NAV.rebuild', () => {
  const nav = createNav(world), f = nav.field(0.5, 0, 7, 0), v = f.version;
  nav.field(0.5, 0.1, 7.1, 1); assert.equal(f.version, v, 'same cell: kept');
  nav.field(0.5, 3, 7, 1.1); assert.equal(f.version, v + 1, 'new cell: rebuilt');
  nav.field(0.5, 6, 7, 1.2); assert.equal(f.version, v + 1, 'too soon: kept for now');
  nav.field(0.5, 6, 7, 1.4); assert.equal(f.version, v + 2);
});

/* ---------------- the safety net ---------------- */
test('a Giant with no way out digs back in, out of sight, and climbs out somewhere with a clear way to the player', () => {
  const player = P(-1.9, 0.9), c = new Crowd(world, { rng: seeded(3) }), e = c.spawn('furry', 2, 5.8, -7.4, { emerge: false });
  let at = null;
  for (let i = 0; i < 60 * (STUCK.burrow + 2) && !at; i++) { c.step(1 / 60, player, { canHurt: false }); if (e.reburrows) at = { x: e.x, y: e.y, state: e.state, t: i / 60 }; }
  assert.ok(at, 'it dug out'); assert.equal(at.state, 'emerge', 'climbing out, harmless, like a fresh spawn');
  assert.ok(at.t < STUCK.nav + 3, `no way at all: it does not wait the full ${STUCK.burrow} s (${at.t.toFixed(1)} s)`);
  const d = Math.hypot(at.x - player.x, at.y - player.y); assert.ok(d >= 12.9 && d <= 19.1, `re-emerged ${d.toFixed(1)} away`);
  assert.ok(isFinite(c.nav.costAt(c.nav.field(e.r, player.x, player.y, c.time), at.x, at.y)), 'with a way to the player');
});

test('an enemy in sight of the player never digs out, however long it is held up', () => {
  const c = new Crowd(world, { rng: seeded(4) }), e = c.spawn('furry', 0, 11, 5, { emerge: false }), player = P(14, 5);
  for (let i = 0; i < 60 * 15; i++) { c.step(1 / 60, player, { canHurt: false }); e.x = 11; e.y = 5; }   // pinned in place (as if boxed in by a crowd)
  assert.equal(e.reburrows, 0);
});
