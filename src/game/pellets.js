// Shotgun pellets: pattern, damage falloff and a swept simulation. Pure, unit tested.
import { raycast } from './ballistics.js';

/**
 * Angular offsets (radians) for one blast. Evenly stratified across the cone with jitter, so a blast
 * covers the cone without gaps or clumps. bias > 0 pulls pellets toward the centre line.
 */
export function pelletPattern(n, halfAngle, bias = 0, rand = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i + rand()) / n * 2 - 1;                          // -1..1, one pellet per slice
    out.push(Math.sign(u) * Math.pow(Math.abs(u), 1 + bias * 1.5) * halfAngle);
  }
  return out;
}

/** Damage of one pellet that has flown `dist` units: full up close, linear fall to minDamage at range, nothing beyond. */
export function damageAt(dist, { damage, range, falloffStart, minDamage }) {
  if (dist > range) return 0;
  if (dist <= falloffStart) return damage;
  const k = (dist - falloffStart) / Math.max(1e-6, range - falloffStart);
  return damage * (1 - (1 - minDamage) * k);
}

export class PelletSim {
  constructor() { this.pellets = []; this.spare = []; }
  /** Fire one pellet. dir must be a unit vector. */
  spawn(x, y, dx, dy, opts) { this.pellets.push({ x, y, dx, dy, speed: opts.speed, traveled: 0, opts, shot: opts.shot ?? 0 }); }
  clear() { this.pellets.length = 0; }
  /**
   * Advance every pellet. onHit({ kind, ref, x, y, nx, ny, damage, dist, dx, dy, shot }) fires for walls and targets;
   * onExpire(p) when a pellet runs out of range. Pellets are swept along their whole step, so they cannot tunnel.
   */
  step(dt, world, targets, onHit, onExpire) {
    const live = this.spare; live.length = 0;                  // two arrays take turns, so a step allocates no list
    for (const p of this.pellets) {
      const remaining = p.opts.range - p.traveled, len = Math.min(p.speed * dt, remaining);
      const bx = p.x + p.dx * len, by = p.y + p.dy * len;
      const h = raycast(p.x, p.y, bx, by, world, targets);
      if (h) {
        const dist = p.traveled + len * h.t;
        onHit?.({ kind: h.kind, ref: h.ref, x: h.x, y: h.y, nx: h.nx, ny: h.ny, damage: h.kind === 'target' ? damageAt(dist, p.opts) : 0, dist, dx: p.dx, dy: p.dy, shot: p.shot });
        continue;
      }
      p.x = bx; p.y = by; p.traveled += len;
      if (p.traveled >= p.opts.range - 1e-9) { onExpire?.(p); continue; }
      live.push(p);
    }
    this.spare = this.pellets; this.pellets = live;
  }
}
