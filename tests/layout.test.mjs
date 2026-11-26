import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, BOUNDS, SPAWN, buildWorld, rangeFootprint } from '../src/game/layout.js';

// widest hero (Gumdrop) is 0.66 radius = 1.32 across. Every gap a hero can enter must be wider than that, with margin.
const MIN_GAP = 1.32 + 0.2;
const isCircle = s => s.r !== undefined;
const box = s => (isCircle(s) ? { x: s.x, y: s.y, hw: s.r, hh: s.r } : s);
/** Exact free distance between two shapes (0 if touching or overlapping). */
function gap(a, b) {
  if (isCircle(a) && isCircle(b)) return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
  if (isCircle(a) || isCircle(b)) {
    const [c, r] = isCircle(a) ? [a, b] : [b, a];
    const qx = Math.max(r.x - r.hw, Math.min(r.x + r.hw, c.x)), qy = Math.max(r.y - r.hh, Math.min(r.y + r.hh, c.y));
    return Math.max(0, Math.hypot(c.x - qx, c.y - qy) - c.r);
  }
  return Math.hypot(Math.max(0, Math.abs(a.x - b.x) - a.hw - b.hw), Math.max(0, Math.abs(a.y - b.y) - a.hh - b.hh));
}
const world = buildWorld(LAYOUT, BOUNDS);
const fp = rangeFootprint();
const all = [...world.circles, ...world.boxes, ...fp.still, fp.patrolZone];
const sameGroup = (a, b) => a.group && a.group === b.group && a.group !== 'range-still';   // still dummies must clear each other too

test('no two props leave a pocket the hero could wedge into (deliberate groups excepted)', () => {
  const bad = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    if (sameGroup(all[i], all[j])) continue;
    const g = gap(all[i], all[j]); if (g > 0 && g < MIN_GAP) bad.push([all[i], all[j], +g.toFixed(2)]);
    // overlapping bounding boxes of non-group props would also be a pocket
  }
  assert.deepEqual(bad, [], 'tight gaps: ' + JSON.stringify(bad));
});
test('props keep clear of the arena edge', () => {
  const bad = all.filter(s => s.group !== 'maze' && s.group !== 'patrol').map(s => { const q = box(s); return Math.min(q.x - q.hw - BOUNDS.minX, BOUNDS.maxX - q.x - q.hw, q.y - q.hh - BOUNDS.minY, BOUNDS.maxY - q.y - q.hh); }).filter(g => g < MIN_GAP);
  assert.equal(bad.length, 0, 'closest to edge: ' + Math.min(...bad));
});
test('the maze lanes are wide enough for the widest hero', () => {
  const walls = LAYOUT.walls.filter(w => w.hh < 1); // the three horizontal walls
  const ys = walls.map(w => w.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] - 1.2 >= MIN_GAP, 'lane ' + i + ' is ' + (ys[i] - ys[i - 1] - 1.2));
});
test('the spawn point is free and inside the arena', () => {
  for (const c of world.circles) assert.ok(Math.hypot(SPAWN.x - c.x, SPAWN.y - c.y) > c.r + 1.5);
  for (const b of world.boxes) assert.ok(gap({ x: SPAWN.x, y: SPAWN.y, r: 0.66 }, b) > 1);
  assert.ok(gap({ x: SPAWN.x, y: SPAWN.y, r: 0.66 }, fp.patrolZone) > 1);
  assert.ok(SPAWN.x > BOUNDS.minX && SPAWN.x < BOUNDS.maxX && SPAWN.y > BOUNDS.minY && SPAWN.y < BOUNDS.maxY);
});

test('the patrol loop stays clear of every other prop so a dummy never walks into one', () => {
  for (const s of [...world.circles, ...world.boxes, ...fp.still]) assert.ok(gap(fp.patrolZone, s) >= 1.0, 'patrol zone too close to ' + JSON.stringify(s));
});
