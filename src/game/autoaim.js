// Auto-aim for the survival run: R2 fires at the closest enemy and the hero turns to face it. Pure, unit tested.
//   - a HARD LOCK: once an enemy is picked, the aim stays on it until it dies, runs well out of range, or stays hidden behind a
//     wall for a moment. A closer enemy never steals it, so a crowd pressing in cannot make the aim flick between bodies.
//   - an explicit aim (right stick past its deadzone, mouse, arrows) overrides while it is held; the lock is kept for when you let go
//   - the aim leads a moving target by the pellets' travel time, except up close, where leading would only make it twitch
//   - nothing to shoot: while firing, the gun points where you are walking
import { hasLineOfSight } from './ballistics.js';

export const createLock = () => ({ target: null, hidden: 0, dropped: null });   // dropped: why the last lock ended ('dead' | 'range' | 'hidden')

/**
 * @param origin {x,y}  explicit {x,y} unit or 0,0  walk {x,y,mag}  fire bool (aim only while true)  enemies [{x,y,vx,vy,r,alive}]
 * @param opts { range, lead (0..1), pelletSpeed, lock (from createLock, kept between calls), dt, keep (range multiple a lock survives to),
 *               grace (seconds a locked target may hide behind a wall), close (no lead inside this distance) }
 * @returns { x, y, aiming, target, source: 'explicit'|'auto'|'walk'|'none' }
 */
export function runAim(origin, explicit, walk, fire, enemies, world, { range = 16, lead = 1, pelletSpeed = 55, lock = createLock(), dt = 0, keep = 1.3, grace = 0.6, close = 3 } = {}) {
  // keep or drop the current lock
  const t = lock.target;
  if (t) {
    const d = Math.hypot(t.x - origin.x, t.y - origin.y);
    if (!t.alive || d > range * keep) { lock.dropped = t.alive ? 'range' : 'dead'; lock.target = null; lock.hidden = 0; }
    else if (hasLineOfSight(origin.x, origin.y, t.x, t.y, world)) lock.hidden = 0;
    else if ((lock.hidden += dt) > grace) { lock.dropped = 'hidden'; lock.target = null; lock.hidden = 0; }
  }
  if (Math.hypot(explicit.x, explicit.y) > 1e-6) return { x: explicit.x, y: explicit.y, aiming: true, target: lock.target, source: 'explicit' };
  // acquire only when the trigger is held: the nearest enemy that can be seen
  if (!lock.target && fire) {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - origin.x, e.y - origin.y);
      if (d <= range && d > 0.01 && d < bd && hasLineOfSight(origin.x, origin.y, e.x, e.y, world)) { best = e; bd = d; }
    }
    if (best) { lock.target = best; lock.hidden = 0; lock.dropped = null; }
  }
  if (lock.target && fire) {
    const e = lock.target, d = Math.hypot(e.x - origin.x, e.y - origin.y), lt = d > close ? Math.min(0.35, d / pelletSpeed) * lead : 0;
    const ax = e.x + (e.vx || 0) * lt - origin.x, ay = e.y + (e.vy || 0) * lt - origin.y, m = Math.hypot(ax, ay) || 1;
    return { x: ax / m, y: ay / m, aiming: true, target: e, source: 'auto' };
  }
  if (fire && walk.mag > 0.2) return { x: walk.x / walk.mag, y: walk.y / walk.mag, aiming: true, target: lock.target, source: 'walk' };
  return { x: 0, y: 0, aiming: false, target: lock.target, source: 'none' };
}

/** The angle in radians between two aim directions. */
export const aimError = (a, b) => Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y));

/** Turn an aim direction toward a goal at a capped rate (rad/s), ignoring sub-degree wobble so the hero never shivers. */
export function turnToward(cur, goal, maxRate, dt) {
  const a = Math.atan2(cur.x, cur.y), b = Math.atan2(goal.x, goal.y);
  let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) < 0.012) return cur;
  const step = Math.sign(d) * Math.min(Math.abs(d), maxRate * dt), n = a + step;
  return { x: Math.sin(n), y: Math.cos(n) };
}
