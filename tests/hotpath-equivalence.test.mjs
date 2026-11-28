// The ray, wall and aim-assist functions were rewritten for speed (no allocation per call, cheap checks before line of sight).
// These tests keep the original implementations as a reference and require EXACTLY the same answers on many random cases,
// so the rewrite cannot change how pellets hit or where aim assist points.
import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentVsBox, segmentVsCircle, raycast, hasLineOfSight } from '../src/game/ballistics.js';
import { assistAim, chooseAim } from '../src/game/assist.js';
import { buildWorld } from '../src/game/layout.js';

/* ---------------- reference implementations (as they were before the rewrite) ---------------- */
function refSegmentVsBox(ax, ay, bx, by, b) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1, nx = 0, ny = 0;
  for (const [o, d, lo, hi, axis] of [[ax, dx, b.x - b.hw, b.x + b.hw, 0], [ay, dy, b.y - b.hh, b.y + b.hh, 1]]) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let ta = (lo - o) / d, tb = (hi - o) / d, sign = -Math.sign(d);
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; nx = axis === 0 ? sign : 0; ny = axis === 1 ? sign : 0; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t: t0, nx, ny };
}
function refRaycast(ax, ay, bx, by, world, targets = []) {
  let best = null;
  const take = (t, kind, ref, nx, ny) => { if (!best || t < best.t) best = { t, kind, ref, x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx, ny }; };
  for (const b of world.boxes) { const h = refSegmentVsBox(ax, ay, bx, by, b); if (h) take(h.t, 'wall', b, h.nx, h.ny); }
  for (const c of world.circles) { const t = segmentVsCircle(ax, ay, bx, by, c); if (t !== null) { const px = ax + (bx - ax) * t - c.x, py = ay + (by - ay) * t - c.y, d = Math.hypot(px, py) || 1; take(t, 'wall', c, px / d, py / d); } }
  for (const c of targets) { if (c.alive === false) continue; const t = segmentVsCircle(ax, ay, bx, by, c); if (t !== null) { const px = ax + (bx - ax) * t - c.x, py = ay + (by - ay) * t - c.y, d = Math.hypot(px, py) || 1; take(t, 'target', c, px / d, py / d); } }
  return best;
}
const refLOS = (ax, ay, bx, by, world) => { for (const b of world.boxes) if (refSegmentVsBox(ax, ay, bx, by, b)) return false; for (const c of world.circles) if (segmentVsCircle(ax, ay, bx, by, c) !== null) return false; return true; };
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp01 = v => Math.max(0, Math.min(1, v));
function refAssistAim(origin, dir, targets, world, { mode = 'assist', coneDeg = 8, strength = 0.5, range = 18 } = {}) {
  const has = Math.hypot(dir.x, dir.y) > 1e-6;
  if (mode === 'manual') return { x: dir.x, y: dir.y, aiming: has, target: null };
  const visible = [];
  for (const t of targets) {
    if (t.alive === false) continue;
    const dx = t.x - origin.x, dy = t.y - origin.y, d = Math.hypot(dx, dy);
    if (d < 0.01 || d > range) continue;
    if (!refLOS(origin.x, origin.y, t.x, t.y, world)) continue;
    visible.push({ t, d, bearing: Math.atan2(dx, dy) });
  }
  if (mode === 'auto' && !has) {
    if (!visible.length) return { x: dir.x, y: dir.y, aiming: false, target: null };
    visible.sort((a, b) => a.d - b.d); const n = visible[0];
    return { x: Math.sin(n.bearing), y: Math.cos(n.bearing), aiming: true, target: n.t };
  }
  if (!has || !visible.length) return { x: dir.x, y: dir.y, aiming: has, target: null };
  const yaw = Math.atan2(dir.x, dir.y), cone = coneDeg * Math.PI / 180;
  let best = null, bestScore = Infinity;
  for (const v of visible) {
    const diff = Math.abs(wrap(v.bearing - yaw)), allowed = cone + Math.atan2(v.t.r, v.d);
    if (diff > allowed) continue;
    const score = diff / allowed + v.d / range * 0.25;
    if (score < bestScore) { bestScore = score; best = { v, diff, allowed }; }
  }
  if (!best) return { x: dir.x, y: dir.y, aiming: true, target: null };
  const pull = clamp01(strength) * Math.sqrt(1 - clamp01(best.diff / best.allowed));
  const out = yaw + wrap(best.v.bearing - yaw) * pull;
  return { x: Math.sin(out), y: Math.cos(out), aiming: true, target: best.v.t };
}

/* ---------------- random cases ---------------- */
let seed = 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const R = (a, b) => a + rnd() * (b - a);
const world = buildWorld();
const pt = () => (rnd() < 0.15 ? Math.round(R(-24, 24)) : R(-26, 26));          // some points on whole numbers, so rays run exactly along box edges
function segment() {
  const ax = pt(), ay = pt(), k = rnd();
  if (k < 0.1) return [ax, ay, ax, R(-26, 26)];                                   // vertical
  if (k < 0.2) return [ax, ay, R(-26, 26), ay];                                   // horizontal
  if (k < 0.25) return [ax, ay, ax, ay];                                          // zero length
  return [ax, ay, ax + R(-3, 3) * (rnd() < 0.5 ? 1 : 12), ay + R(-3, 3) * (rnd() < 0.5 ? 1 : 12)];
}
const crowd = () => Array.from({ length: Math.floor(R(0, 30)) }, () => ({ x: R(-24, 24), y: R(-16, 16), r: R(0.3, 1.3), alive: rnd() > 0.15 }));

test('segmentVsBox: identical to the reference on 40,000 random segments', () => {
  for (let i = 0; i < 40000; i++) {
    const s = segment(), b = rnd() < 0.5 ? world.boxes[i % world.boxes.length] : { x: R(-5, 5), y: R(-5, 5), hw: R(0.1, 4), hh: R(0.1, 4) };
    assert.deepEqual(segmentVsBox(...s, b), refSegmentVsBox(...s, b), `case ${i}: ${s} vs ${JSON.stringify(b)}`);
  }
});

test('raycast and line of sight: identical to the reference (same hit, same object, same normal)', () => {
  for (let i = 0; i < 20000; i++) {
    const s = segment(), targets = crowd(), a = raycast(...s, world, targets), b = refRaycast(...s, world, targets);
    assert.equal(a === null, b === null, `case ${i}: hit or miss`);
    if (a) { assert.equal(a.ref, b.ref, `case ${i}: same thing hit`); assert.deepEqual(a, b, `case ${i}`); }
    assert.equal(hasLineOfSight(...s, world), refLOS(...s, world), `case ${i}: line of sight`);
  }
});

test('exact ties (two targets on the same spot) go to the first one in the list, as before', () => {
  const twins = [{ x: 0, y: -2, r: 0.7, alive: true }, { x: 0, y: -2, r: 0.7, alive: true }];   // 12 units away, inside the range
  for (const mode of ['assist', 'auto']) for (const dir of [{ x: 0, y: -1 }, { x: 0.05, y: -0.999 }, { x: 0, y: 0 }]) {
    const o = { mode, coneDeg: 8, strength: 0.5, range: 18 }, origin = { x: 0, y: 10 }, open = { boxes: [], circles: [] };
    const want = refAssistAim(origin, dir, twins, open, o).target, got = assistAim(origin, dir, twins, open, o).target;
    assert.equal(got, want, `${mode} ${JSON.stringify(dir)}`); if (want) assert.equal(got, twins[0]);
  }
  assert.equal(raycast(0, 10, 0, -20, { boxes: [], circles: [] }, twins).ref, twins[0]);
});

test('assistAim and chooseAim: identical to the reference for manual, assist and auto, with and without aim input', () => {
  for (let i = 0; i < 20000; i++) {
    const targets = crowd(), origin = { x: R(-23, 23), y: R(-15, 15) }, a = rnd() * 6.3;
    const dir = rnd() < 0.35 ? { x: 0, y: 0 } : { x: Math.sin(a), y: Math.cos(a) };
    const opts = { mode: ['manual', 'assist', 'auto'][i % 3], coneDeg: R(0, 20), strength: R(0, 1), range: R(6, 33) };
    const got = assistAim(origin, dir, targets, world, opts), want = refAssistAim(origin, dir, targets, world, opts);
    assert.equal(got.target, want.target, `case ${i}: same target`); assert.deepEqual(got, want, `case ${i}`);
    const walk = rnd() < 0.5 ? { x: 0, y: 0, mag: 0 } : { x: 0.6, y: -0.6, mag: 0.85 }, fire = rnd() < 0.5;
    assert.equal(chooseAim(origin, dir, walk, fire, targets, world, opts).source, ((g) => g.aiming ? (Math.hypot(dir.x, dir.y) > 1e-6 ? 'explicit' : 'auto') : fire && walk.mag > 0.2 ? 'walk' : 'none')(want));
  }
});
