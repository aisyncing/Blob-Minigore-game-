// Circle-vs-world collision in the 2D ground plane. Pure functions, no DOM, unit tested.
// Positions and velocities are plain {x, y} objects (y is world Z).
//
// World:  { bounds: {minX,maxX,minY,maxY}, circles: [{x,y,r}], boxes: [{x,y,hw,hh}] }  (boxes are axis-aligned, centre + half extents)
// Every resolve pushes the circle out along the contact normal and removes only the velocity
// going INTO the surface, so the hero slides along walls instead of sticking to them.

function pushOut(p, v, nx, ny, depth, restitution = 0) {
  p.x += nx * depth; p.y += ny * depth;
  const vn = v.x * nx + v.y * ny;
  if (vn < 0) { v.x -= (1 + restitution) * vn * nx; v.y -= (1 + restitution) * vn * ny; return -vn; }
  return 0;
}

export function circleVsCircle(p, v, r, c, restitution = 0) {
  const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), min = r + c.r;
  if (d >= min) return 0;
  if (d < 1e-9) return pushOut(p, v, 1, 0, min, restitution) || 0.0001; // exactly on top: pick a direction
  return pushOut(p, v, dx / d, dy / d, min - d, restitution) || 0.0001;
}

export function circleVsBox(p, v, r, b, restitution = 0) {
  const qx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, p.x)), qy = Math.max(b.y - b.hh, Math.min(b.y + b.hh, p.y));
  let dx = p.x - qx, dy = p.y - qy, d = Math.hypot(dx, dy);
  if (d >= r) return 0;
  if (d > 1e-9) return pushOut(p, v, dx / d, dy / d, r - d, restitution) || 0.0001;
  // centre is inside the box: leave through the nearest face
  const ox = b.hw - Math.abs(p.x - b.x), oy = b.hh - Math.abs(p.y - b.y);
  if (ox < oy) return pushOut(p, v, Math.sign(p.x - b.x) || 1, 0, ox + r, restitution) || 0.0001;
  return pushOut(p, v, 0, Math.sign(p.y - b.y) || 1, oy + r, restitution) || 0.0001;
}

export function clampToBounds(p, v, r, b, restitution = 0) {
  let hit = 0;
  if (p.x < b.minX + r) hit = Math.max(hit, pushOut(p, v, 1, 0, b.minX + r - p.x, restitution) || 0.0001);
  if (p.x > b.maxX - r) hit = Math.max(hit, pushOut(p, v, -1, 0, p.x - (b.maxX - r), restitution) || 0.0001);
  if (p.y < b.minY + r) hit = Math.max(hit, pushOut(p, v, 0, 1, b.minY + r - p.y, restitution) || 0.0001);
  if (p.y > b.maxY - r) hit = Math.max(hit, pushOut(p, v, 0, -1, p.y - (b.maxY - r), restitution) || 0.0001);
  return hit;
}

/** Resolve against everything. Two passes so squeezing into a corner between two shapes settles. Returns the strongest impact speed. */
export function resolveWorld(p, v, r, world, restitution = 0) {
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of world.circles) impact = Math.max(impact, circleVsCircle(p, v, r, c, restitution));
    for (const b of world.boxes) impact = Math.max(impact, circleVsBox(p, v, r, b, restitution));
    impact = Math.max(impact, clampToBounds(p, v, r, world.bounds, restitution));
  }
  return impact;
}
