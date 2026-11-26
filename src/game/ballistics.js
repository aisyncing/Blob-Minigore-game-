// Segment-vs-shape maths for pellets and line-of-sight. Pure, unit tested.
// A segment runs from (ax,ay) to (bx,by); t is the fraction along it (0..1) of the first contact.

/** First entry into a circle, or null. A segment that starts inside returns t=0. */
export function segmentVsCircle(ax, ay, bx, by, c) {
  const dx = bx - ax, dy = by - ay, fx = ax - c.x, fy = ay - c.y;
  const a = dx * dx + dy * dy, c0 = fx * fx + fy * fy - c.r * c.r;
  if (c0 <= 0) return 0;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c0;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** First entry into an axis-aligned box (centre + half extents), or null. Also reports which face was hit. */
export function segmentVsBox(ax, ay, bx, by, b) {
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

/**
 * Nearest thing along a segment. world = {boxes, circles}, targets = [{x,y,r,alive}].
 * Returns { t, kind: 'wall'|'target', ref, x, y, nx, ny } or null.
 */
export function raycast(ax, ay, bx, by, world, targets = []) {
  let best = null;
  const take = (t, kind, ref, nx, ny) => { if (!best || t < best.t) best = { t, kind, ref, x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx, ny }; };
  for (const b of world.boxes) { const h = segmentVsBox(ax, ay, bx, by, b); if (h) take(h.t, 'wall', b, h.nx, h.ny); }
  for (const c of world.circles) { const t = segmentVsCircle(ax, ay, bx, by, c); if (t !== null) { const px = ax + (bx - ax) * t - c.x, py = ay + (by - ay) * t - c.y, d = Math.hypot(px, py) || 1; take(t, 'wall', c, px / d, py / d); } }
  for (const c of targets) { if (c.alive === false) continue; const t = segmentVsCircle(ax, ay, bx, by, c); if (t !== null) { const px = ax + (bx - ax) * t - c.x, py = ay + (by - ay) * t - c.y, d = Math.hypot(px, py) || 1; take(t, 'target', c, px / d, py / d); } }
  return best;
}

/** True when nothing static (walls, props) lies between two points. */
export function hasLineOfSight(ax, ay, bx, by, world) {
  for (const b of world.boxes) if (segmentVsBox(ax, ay, bx, by, b)) return false;
  for (const c of world.circles) if (segmentVsCircle(ax, ay, bx, by, c) !== null) return false;
  return true;
}
