// Launching one shotgun blast. Pure, unit tested.
// Pellets are spawned at the muzzle, which sits well in front of the body. Anything between the player and the muzzle
// (a dummy standing against the gun, a wall the barrel pokes into) has to be resolved first, or the pellets would
// be created on the far side of it and fly away.
import { raycast } from './ballistics.js';
import { damageAt } from './pellets.js';

/**
 * @param sim     PelletSim to add pellets to
 * @param from    {x,y} where the shot starts inside the player (the body centre)
 * @param muzzle  {x,y} where the pellets would be spawned
 * @param dir     unit {x,y} aim direction
 * @param angles  per-pellet angular offsets (radians)
 * @param spec    { range, damage, falloffStart, minDamage }   speed: () => units/second for one pellet
 * @returns { origin, blocked: null | 'wall' | 'target' }
 *   wall:   the pellets start at the wall and stop there
 *   target: the muzzle is against (or inside) a target, so every pellet lands on it straight away (full damage, nothing is spawned,
 *           which also guarantees a pellet can only damage once)
 */
export function launchBlast({ sim, from, muzzle, dir, angles, spec, speed, world, targets, shot, onHit }) {
  const hit = raycast(from.x, from.y, muzzle.x, muzzle.y, world, targets);
  if (hit && hit.kind === 'target') {
    for (const a of angles) {
      const c = Math.cos(a), s = Math.sin(a), dx = dir.x * c - dir.y * s, dy = dir.x * s + dir.y * c;
      onHit?.({ kind: 'target', ref: hit.ref, x: hit.x, y: hit.y, nx: hit.nx, ny: hit.ny, damage: damageAt(0, spec), dist: 0, dx, dy, shot });
    }
    return { origin: { x: hit.x, y: hit.y }, blocked: 'target' };
  }
  const origin = hit ? { x: hit.x, y: hit.y } : { x: muzzle.x, y: muzzle.y };
  for (const a of angles) {
    const c = Math.cos(a), s = Math.sin(a);
    sim.spawn(origin.x, origin.y, dir.x * c - dir.y * s, dir.x * s + dir.y * c, { ...spec, speed: speed(), shot });
  }
  return { origin, blocked: hit ? 'wall' : null };
}
