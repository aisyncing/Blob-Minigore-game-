import test from 'node:test';
import assert from 'node:assert/strict';
import { circleVsCircle, circleVsBox, clampToBounds, resolveWorld } from '../src/game/collide.js';
import { stepVelocity } from '../src/game/movement.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('circle vs circle pushes apart and cancels only the inward velocity', () => {
  const p = { x: 0.8, y: 0 }, v = { x: -3, y: 2 };
  const hit = circleVsCircle(p, v, 0.6, { x: 0, y: 0, r: 0.5 });
  assert.ok(hit > 0);
  near(Math.hypot(p.x, p.y), 1.1);
  near(v.x, 0); near(v.y, 2);   // slides: tangential speed untouched
});
test('moving away from a circle is not affected', () => {
  const p = { x: 0.8, y: 0 }, v = { x: 3, y: 0 };
  circleVsCircle(p, v, 0.6, { x: 0, y: 0, r: 0.5 });
  near(v.x, 3);
});
test('box face: walking diagonally into a wall slides along it at full tangential speed', () => {
  const box = { x: 0, y: 0, hw: 2, hh: 2 };
  const p = { x: 2.55, y: 0 }, v = { x: -4, y: 3 };
  circleVsBox(p, v, 0.6, box);
  near(p.x, 2.6); near(v.x, 0); near(v.y, 3);
});
test('box corner: pushes out diagonally and keeps sliding', () => {
  const box = { x: 0, y: 0, hw: 1, hh: 1 };
  const p = { x: 1.3, y: 1.3 }, v = { x: -3, y: -3 };
  const hit = circleVsBox(p, v, 0.6, box);
  assert.ok(hit > 0);
  near(Math.hypot(p.x - 1, p.y - 1), 0.6, 1e-9);
});
test('centre inside a box is ejected through the nearest face', () => {
  const box = { x: 0, y: 0, hw: 2, hh: 1 };
  const p = { x: 0.2, y: 0.8 }, v = { x: 0, y: -1 };
  circleVsBox(p, v, 0.5, box);
  near(p.y, 1.5); near(p.x, 0.2);
});
test('bounds keep the circle inside on every side', () => {
  const b = { minX: -10, maxX: 10, minY: -5, maxY: 5 };
  for (const [x, y] of [[-20, 0], [20, 0], [0, -20], [0, 20], [-20, 20]]) {
    const p = { x, y }, v = { x: 0, y: 0 }; clampToBounds(p, v, 0.6, b);
    assert.ok(p.x >= -9.4 - 1e-9 && p.x <= 9.4 + 1e-9 && p.y >= -4.4 - 1e-9 && p.y <= 4.4 + 1e-9);
  }
});
test('restitution bounces (used later for props and enemies)', () => {
  const p = { x: 0.8, y: 0 }, v = { x: -4, y: 0 };
  circleVsCircle(p, v, 0.6, { x: 0, y: 0, r: 0.5 }, 0.5);
  near(v.x, 2);
});

// A hostile randomised run: a hero steered by wild inputs must never end a step overlapping anything.
test('200k randomised steps: never inside a wall, never outside the arena, never faster than top speed', () => {
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  // Props are placed with at least 1.4 units between any two (and from the walls), the hero's diameter plus
  // a margin, so a legal position always exists. Overlapping props would create pockets no resolver can fix.
  const aabb = s => (s.r !== undefined ? { x: s.x, y: s.y, hw: s.r, hh: s.r } : s);
  const gap = (a, b) => { a = aabb(a); b = aabb(b); const gx = Math.max(0, Math.abs(a.x - b.x) - a.hw - b.hw), gy = Math.max(0, Math.abs(a.y - b.y) - a.hh - b.hh); return Math.hypot(gx, gy); };
  const B = { minX: -22, maxX: 22, minY: -15, maxY: 15 };
  const placed = [], world = { bounds: B, circles: [], boxes: [] };
  for (let tries = 0; tries < 4000 && placed.length < 22; tries++) {
    const s = rnd() < 0.6 ? { x: (rnd() - 0.5) * 40, y: (rnd() - 0.5) * 26, r: 0.4 + rnd() * 1.2 } : { x: (rnd() - 0.5) * 38, y: (rnd() - 0.5) * 24, hw: 0.5 + rnd() * 3, hh: 0.5 + rnd() * 3 };
    const q = aabb(s);
    if (q.x - q.hw < B.minX + 1.4 || q.x + q.hw > B.maxX - 1.4 || q.y - q.hh < B.minY + 1.4 || q.y + q.hh > B.maxY - 1.4) continue;
    if (placed.some(o => gap(o, s) < 1.4)) continue;
    placed.push(s); (s.r !== undefined ? world.circles : world.boxes).push(s);
  }
  assert.ok(placed.length >= 12, 'test world too sparse: ' + placed.length);
  const R = 0.6, p = { x: 0, y: 0 }, v = { x: 0, y: 0 };
  // start somewhere free
  for (let k = 0; k < 50; k++) resolveWorld(p, v, R, world);
  let target = { x: 1, y: 0 }, hold = 0, worst = 0, vmax = 0;
  for (let i = 0; i < 200000; i++) {
    if (--hold <= 0) { const a = rnd() * 6.2832, m = rnd() < 0.3 ? 0 : 0.3 + rnd() * 0.7; target = { x: Math.cos(a) * m, y: Math.sin(a) * m }; hold = 20 + Math.floor(rnd() * 200); }
    stepVelocity(v, target, { maxSpeed: 14 }, 1 / 120);          // twice the normal top speed
    p.x += v.x / 120; p.y += v.y / 120;
    resolveWorld(p, v, R, world);
    vmax = Math.max(vmax, Math.hypot(v.x, v.y));
    for (const c of world.circles) worst = Math.max(worst, R + c.r - Math.hypot(p.x - c.x, p.y - c.y));
    for (const b of world.boxes) { const qx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, p.x)), qy = Math.max(b.y - b.hh, Math.min(b.y + b.hh, p.y)); worst = Math.max(worst, R - Math.hypot(p.x - qx, p.y - qy)); }
    assert.ok(Math.abs(p.x) <= 22 - R + 1e-6 && Math.abs(p.y) <= 15 - R + 1e-6, 'left the arena at step ' + i);
  }
  assert.ok(worst < 0.05, 'deepest overlap left after resolve: ' + worst);
  assert.ok(vmax <= 14 + 1e-6, 'speed ' + vmax);
});
