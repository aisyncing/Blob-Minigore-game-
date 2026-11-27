// Auto-aim for the survival run: R2 fires at the closest enemy and the hero turns to face it. Pure, unit tested.
//   - an explicit aim (right stick past its deadzone, mouse, arrows) overrides the auto-aim while it is held
//   - the nearest enemy you can actually see (no wall in between) is chosen, with a little stickiness so the aim does not flicker
//     between two enemies at almost the same distance
//   - the aim leads a moving target by the pellets' travel time, so shots land where it is going
//   - nothing to shoot: while firing, the gun points where you are walking
import { hasLineOfSight } from './ballistics.js';

/**
 * @param origin {x,y}  explicit {x,y} unit or 0,0  walk {x,y,mag}  fire bool  enemies [{x,y,vx,vy,r,alive}]  world {boxes,circles}
 * @param opts { range, lead (0..1 how much to lead), pelletSpeed, prev (the previous target, for stickiness), sticky (0..1) }
 * @returns { x, y, aiming, target, source: 'explicit'|'auto'|'walk'|'none' }
 */
export function runAim(origin, explicit, walk, fire, enemies, world, { range = 16, lead = 1, pelletSpeed = 55, prev = null, sticky = 0.2 } = {}) {
  if (Math.hypot(explicit.x, explicit.y) > 1e-6) return { x: explicit.x, y: explicit.y, aiming: true, target: null, source: 'explicit' };
  const near = [];
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - origin.x, dy = e.y - origin.y, d = Math.hypot(dx, dy);
    if (d <= range && d > 0.01) near.push({ e, d });
  }
  near.sort((a, b) => a.d - b.d);
  let pick = null;
  for (const n of near) { if (hasLineOfSight(origin.x, origin.y, n.e.x, n.e.y, world)) { pick = n; break; } }
  if (pick && prev && prev.alive && prev !== pick.e) {                    // keep the old target unless the new one is clearly closer
    const dp = Math.hypot(prev.x - origin.x, prev.y - origin.y);
    if (dp <= range && dp < pick.d / (1 - sticky) && hasLineOfSight(origin.x, origin.y, prev.x, prev.y, world)) pick = { e: prev, d: dp };
  }
  if (pick) {
    const t = Math.min(0.35, pick.d / pelletSpeed) * lead;
    const ax = pick.e.x + (pick.e.vx || 0) * t - origin.x, ay = pick.e.y + (pick.e.vy || 0) * t - origin.y, m = Math.hypot(ax, ay) || 1;
    return { x: ax / m, y: ay / m, aiming: true, target: pick.e, source: 'auto' };
  }
  if (fire && walk.mag > 0.2) return { x: walk.x / walk.mag, y: walk.y / walk.mag, aiming: true, target: null, source: 'walk' };
  return { x: 0, y: 0, aiming: false, target: null, source: 'none' };
}
