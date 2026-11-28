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

/** First entry into an axis-aligned box (centre + half extents), or null. Also reports which face was hit.
 *  Slab test, x then y. Runs for every pellet against every wall on every step, so it allocates nothing unless it hits. */
export function segmentVsBox(ax, ay, bx, by, b) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1, nx = 0, ny = 0;
  if (Math.abs(dx) < 1e-12) { if (ax < b.x - b.hw || ax > b.x + b.hw) return null; }
  else {
    let ta = (b.x - b.hw - ax) / dx, tb = (b.x + b.hw - ax) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) { t0 = ta; nx = -Math.sign(dx); ny = 0; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (Math.abs(dy) < 1e-12) { if (ay < b.y - b.hh || ay > b.y + b.hh) return null; }
  else {
    let ta = (b.y - b.hh - ay) / dy, tb = (b.y + b.hh - ay) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) { t0 = ta; nx = 0; ny = -Math.sign(dy); }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t: t0, nx, ny };
}

/**
 * Nearest thing along a segment. world = {boxes, circles}, targets = [{x,y,r,alive}].
 * Returns { t, kind: 'wall'|'target', ref, x, y, nx, ny } or null. On equal distance the first one checked wins (boxes, circles, targets).
 */
export function raycast(ax, ay, bx, by, world, targets = []) {
  const dx = bx - ax, dy = by - ay;
  let bt = Infinity, kind = null, ref = null, nx = 0, ny = 0;
  for (const b of world.boxes) { const h = segmentVsBox(ax, ay, bx, by, b); if (h && h.t < bt) { bt = h.t; kind = 'wall'; ref = b; nx = h.nx; ny = h.ny; } }
  for (let pass = 0; pass < 2; pass++) {
    const list = pass === 0 ? world.circles : targets;
    for (const c of list) {
      if (pass === 1 && c.alive === false) continue;
      const t = segmentVsCircle(ax, ay, bx, by, c);
      if (t === null || t >= bt) continue;
      const px = ax + dx * t - c.x, py = ay + dy * t - c.y, d = Math.hypot(px, py) || 1;
      bt = t; kind = pass === 0 ? 'wall' : 'target'; ref = c; nx = px / d; ny = py / d;
    }
  }
  return kind ? { t: bt, kind, ref, x: ax + dx * bt, y: ay + dy * bt, nx, ny } : null;
}

/** True when nothing static (walls, props) lies between two points. */
export function hasLineOfSight(ax, ay, bx, by, world) {
  for (const b of world.boxes) if (segmentVsBox(ax, ay, bx, by, b)) return false;
  for (const c of world.circles) if (segmentVsCircle(ax, ay, bx, by, c) !== null) return false;
  return true;
}
