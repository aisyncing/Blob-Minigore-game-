// Controller aim assist. Pure, unit tested.
//   assist: bend the player's aim toward a target close to their line of fire (never through a wall)
//   auto:   with no aim input, point at the nearest visible target
import { hasLineOfSight } from './ballistics.js';
import { wrapAngle as wrap } from '../engine/math.js';

const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * @param origin {x,y}   dir unit {x,y} (may be 0,0 if the player is not aiming)
 * @param targets [{x,y,r,alive}]   world {boxes,circles}
 * @param opts { mode: 'manual'|'assist'|'auto', coneDeg, strength 0..1, range }
 * @returns { x, y, aiming: boolean, target }  aiming=false means no direction at all (idle, nothing to auto-aim at)
 */
export function assistAim(origin, dir, targets, world, { mode = 'assist', coneDeg = 8, strength = 0.5, range = 18 } = {}) {
  const has = Math.hypot(dir.x, dir.y) > 1e-6;
  // nothing to pick: manual aim, or assist with no aim of the player's own to bend
  if (mode === 'manual' || (!has && mode !== 'auto')) return { x: dir.x, y: dir.y, aiming: has, target: null };
  // Runs every simulation step against every target. Line of sight (a ray through every wall) is the costly part, so it is only
  // checked for a target that could actually win; the result is the same as filtering by sight first.
  if (!has) {                                                       // auto: the nearest target in sight
    const near = [];
    for (const t of targets) {
      if (t.alive === false) continue;
      const dx = t.x - origin.x, dy = t.y - origin.y, d = Math.hypot(dx, dy);
      if (d >= 0.01 && d <= range) near.push({ t, d, dx, dy });
    }
    near.sort((a, b) => a.d - b.d);
    for (const n of near) {
      if (!hasLineOfSight(origin.x, origin.y, n.t.x, n.t.y, world)) continue;
      const bearing = Math.atan2(n.dx, n.dy);                       // same yaw convention as the hero: atan2(x, y)
      return { x: Math.sin(bearing), y: Math.cos(bearing), aiming: true, target: n.t };
    }
    return { x: dir.x, y: dir.y, aiming: false, target: null };
  }
  const yaw = Math.atan2(dir.x, dir.y), cone = coneDeg * Math.PI / 180;
  let best = null, bestScore = Infinity;
  for (const t of targets) {
    if (t.alive === false) continue;
    const dx = t.x - origin.x, dy = t.y - origin.y, d = Math.hypot(dx, dy);
    if (d < 0.01 || d > range) continue;
    const bearing = Math.atan2(dx, dy), diff = Math.abs(wrap(bearing - yaw)), allowed = cone + Math.atan2(t.r, d);   // bigger / closer targets are easier to catch
    if (diff > allowed) continue;
    const score = diff / allowed + d / range * 0.25;
    if (score >= bestScore || !hasLineOfSight(origin.x, origin.y, t.x, t.y, world)) continue;
    bestScore = score; best = { t, bearing, diff, allowed };
  }
  if (!best) return { x: dir.x, y: dir.y, aiming: true, target: null };
  const pull = clamp01(strength) * Math.sqrt(1 - clamp01(best.diff / best.allowed)); // strongest when already nearly on target
  const out = yaw + wrap(best.bearing - yaw) * pull;
  return { x: Math.sin(out), y: Math.cos(out), aiming: true, target: best.t };
}

/**
 * Who decides where the gun points. Priority: explicit aim (stick / mouse / arrows, optionally helped) >
 * an auto-target (auto mode only) > the walking direction while firing > nothing.
 * @param explicit {x,y} unit vector or (0,0) when the player is not aiming themselves; walk {x,y,mag}
 * @returns { x, y, aiming, target, source: 'explicit'|'auto'|'walk'|'none' }
 */
export function chooseAim(origin, explicit, walk, fire, targets, world, opts) {
  const has = Math.hypot(explicit.x, explicit.y) > 1e-6;
  const helped = assistAim(origin, explicit, targets, world, opts);
  if (helped.aiming) return { ...helped, source: has ? 'explicit' : 'auto' };
  if (fire && walk.mag > 0.2) return { x: walk.x / walk.mag, y: walk.y / walk.mag, aiming: true, target: null, source: 'walk' };
  return { ...helped, source: 'none' };
}
