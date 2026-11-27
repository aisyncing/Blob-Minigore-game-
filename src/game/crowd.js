// The enemy crowd: our own critters (not Minigore's furries). Pure logic, no DOM, unit tested.
//
//   puff  "Puffling": chases you. Three sizes; a big one splits into two mediums, a medium into two smalls (the nesting-doll idea).
//         Each puff carries a personal flank angle, so a pack arrives from different sides instead of in one line, and it
//         wall-follows when a prop blocks it instead of grinding against it.
//   zip   "Zipper": closes in, stops, flashes (a telegraph you can read), locks onto where you are GOING, then dashes. Dodge it
//         and it is left panting for a moment.
//
// Crowd control is the cheap kind (seek + separation through a grid), no per-frame pathfinding, so 100+ enemies stay light.
import { resolveWorld } from './collide.js';
import { hasLineOfSight } from './ballistics.js';

export const KINDS = {
  puff: { tiers: [
    { r: 0.38, hp: 30,  speed: 5.4, cost: 1,   score: 10 },
    { r: 0.58, hp: 72,  speed: 4.4, cost: 2.4, score: 20 },
    { r: 0.92, hp: 170, speed: 3.2, cost: 5.5, score: 40 },
  ] },
  zip: { tiers: [{ r: 0.4, hp: 40, speed: 4.6, cost: 2.5, score: 30, dash: 13.5, windup: 0.6, dashT: 0.5, recover: 0.9, trigger: 8.5 }] },
};
export const tierOf = (kind, tier) => KINDS[kind].tiers[tier];

const SEP_PAD = 0.18, CELL = 2.2, TAU = Math.PI * 2;
const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };

export class Crowd {
  constructor(world, { rng = Math.random } = {}) {
    this.world = world; this.rng = rng; this.list = []; this.nextId = 1; this.time = 0;
    this.grid = new Map();
  }
  clear() { this.list.length = 0; }
  /** Total "danger cost" of what is alive: the wave director spends against this. */
  get cost() { let c = 0; for (const e of this.list) if (e.alive) c += e.cost; return c; }
  get alive() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  spawn(kind, tier, x, y, o = {}) {
    const T = tierOf(kind, tier), rng = this.rng;
    const e = {
      isEnemy: true, id: this.nextId++, kind, tier, x, y, r: T.r, hp: T.hp, maxHp: T.hp, speed: T.speed, cost: T.cost, score: T.score, alive: true,
      vx: 0, vy: 0, kx: 0, ky: 0, fx: 0, fy: 1,                                 // velocity, knockback, facing
      orbit: (rng() * 2 - 1) * 0.55, detour: 0, detourT: 0, wall: 0,           // personal flank angle; wall-follow state
      state: 'chase', st: 0, lockX: 0, lockY: 0,                               // zipper state machine
      cd: o.cd ?? 0, age: 0, flash: 0, sq: 0, sqv: 0, ph: rng() * TAU, sndT: 0, // contact cooldown, visuals
    };
    if (o.kx || o.ky) { e.kx = o.kx || 0; e.ky = o.ky || 0; }
    this.list.push(e); return e;
  }

  /**
   * One crowd step. player = { x, y, vx, vy, r }. opts = { speedMul, canHurt }.
   * @returns contacts: enemies that touched the player this step (only when canHurt)
   */
  step(dt, player, { speedMul = 1, canHurt = true } = {}) {
    this.time += dt;
    const L = this.list, contacts = [];
    // compact the dead out in place (the array identity is shared with the pellet simulation)
    let w = 0; for (let i = 0; i < L.length; i++) if (L[i].alive) L[w++] = L[i]; L.length = w;
    // spatial hash for separation
    const grid = this.grid; grid.clear();
    for (const e of L) { const k = Math.floor(e.x / CELL) * 4096 + Math.floor(e.y / CELL); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e); }
    for (const e of L) {
      e.age += dt; e.sndT -= dt; e.cd -= dt;
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1e-6;
      let ux = dx / d, uy = dy / d, speed = e.speed * speedMul, steer = 1, ex = 0, ey = 0;
      const T = tierOf(e.kind, e.tier);

      if (e.kind === 'zip') {
        e.st += dt;
        if (e.state === 'chase') { if (d < T.trigger && hasLineOfSight(e.x, e.y, player.x, player.y, this.world) && e.age > 0.6) { e.state = 'windup'; e.st = 0; } }
        else if (e.state === 'windup') {
          speed = 0; steer = 6;
          if (e.st >= T.windup) {                                                  // lock onto where the player is heading, not where they are
            const lead = 0.38, px = player.x + player.vx * lead, py = player.y + player.vy * lead, ld = Math.hypot(px - e.x, py - e.y) || 1;
            e.lockX = (px - e.x) / ld; e.lockY = (py - e.y) / ld; e.state = 'dash'; e.st = 0;
          }
        } else if (e.state === 'dash') { ux = e.lockX; uy = e.lockY; speed = T.dash * speedMul; steer = 40; if (e.st >= T.dashT || e.wall > 0.05) { e.state = 'recover'; e.st = 0; } }
        else if (e.state === 'recover') { speed = 0.8 * speedMul; steer = 5; if (e.st >= T.recover) { e.state = 'chase'; e.st = 0; } }
      }
      if (e.kind === 'puff' || (e.kind === 'zip' && e.state === 'chase')) {
        // flank: far away, swing the approach round by this enemy's own angle; close in, come straight
        const f = Math.max(0, Math.min(1, (d - 4) / 10)) * e.orbit; if (f) [ux, uy] = rot(ux, uy, f);
        // wall-follow: pinned against a prop for a moment, sidestep along it, then try again
        if (e.wall > 0.25 && e.detourT <= 0) { e.detour = this.rng() < 0.5 ? -1 : 1; e.detourT = 0.9; e.wall = 0; }
        if (e.detourT > 0) { e.detourT -= dt; [ux, uy] = rot(ux, uy, e.detour * 1.25); }
      }
      // separation from neighbours
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
        const a = grid.get((cx + ix) * 4096 + (cy + iy)); if (!a) continue;
        for (const o of a) {
          if (o === e) continue;
          const ox = e.x - o.x, oy = e.y - o.y, min = e.r + o.r + SEP_PAD, d2 = ox * ox + oy * oy;
          if (d2 >= min * min) continue;
          const od = Math.sqrt(d2) || 1e-4, push = (min - od) / min;
          ex += ox / od * push * 1.9; ey += oy / od * push * 1.9;
        }
      }
      // the velocity chases the wanted velocity; separation is added on top so packs spread without losing their heading
      const tvx = ux * speed + ex * e.speed * speedMul, tvy = uy * speed + ey * e.speed * speedMul, k = Math.min(1, (e.kind === 'zip' ? steer : 9) * dt);
      e.vx += (tvx - e.vx) * k; e.vy += (tvy - e.vy) * k;
      // facing eases toward the way it is going (or toward the player while winding up)
      const fxT = e.state === 'windup' ? dx / d : (Math.hypot(e.vx, e.vy) > 0.3 ? e.vx / Math.hypot(e.vx, e.vy) : dx / d), fyT = e.state === 'windup' ? dy / d : (Math.hypot(e.vx, e.vy) > 0.3 ? e.vy / Math.hypot(e.vx, e.vy) : dy / d);
      e.fx += (fxT - e.fx) * Math.min(1, 12 * dt); e.fy += (fyT - e.fy) * Math.min(1, 12 * dt);
      // knockback decays on its own; position integrates both
      const kd = Math.exp(-8 * dt); e.kx *= kd; e.ky *= kd;
      e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
      const v = { x: e.vx, y: e.vy }, imp = resolveWorld(e, v, e.r, this.world); e.vx = v.x; e.vy = v.y;
      e.wall = imp > 0 ? e.wall + dt : Math.max(0, e.wall - dt * 2);
      // little visual springs: squash and flash
      e.sqv += (-180 * e.sq - 11 * e.sqv) * dt; e.sq += e.sqv * dt; e.flash = Math.max(0, e.flash - dt * 6);
      e.ph += Math.hypot(e.vx, e.vy) * dt * 1.7;
      // touching the player
      if (canHurt && e.cd <= 0 && !(e.kind === 'zip' && e.state === 'windup')) {
        const dd = Math.hypot(player.x - e.x, player.y - e.y);
        if (dd < e.r + player.r + 0.04) { contacts.push(e); e.cd = 1.1; e.kx -= ux * 5; e.ky -= uy * 5; if (e.kind === 'zip' && e.state === 'dash') { e.state = 'recover'; e.st = 0; } }
      }
    }
    return contacts;
  }

  /**
   * Hit an enemy. (dx,dy) is the direction the pellet was travelling.
   * @returns { killed, dealt, children, points }
   */
  damage(e, amount, dx = 0, dy = 0, impulse = 0.55) {
    if (!e.alive || amount <= 0) return { killed: false, dealt: 0, children: [], points: 0 };
    const dealt = Math.min(e.hp, amount); e.hp -= amount; e.flash = 1; e.sqv -= 2.4 * Math.min(1, amount / 24);
    const mass = 1 + e.r * 1.6; e.kx += dx * amount * impulse / mass; e.ky += dy * amount * impulse / mass;
    const km = Math.hypot(e.kx, e.ky), cap = 9 / mass; if (km > cap) { e.kx *= cap / km; e.ky *= cap / km; }
    if (e.hp > 1e-6) return { killed: false, dealt, children: [], points: 0 };
    e.hp = 0; e.alive = false;
    const children = [];
    if (e.kind === 'puff' && e.tier > 0) {                                      // nesting dolls: two of the next size down burst out sideways
      const px = -dy, py = dx, n = Math.hypot(px, py) || 1, side = (e.r * 0.8);
      for (const s of [-1, 1]) children.push(this.spawn('puff', e.tier - 1, e.x + px / n * side * s, e.y + py / n * side * s, { kx: px / n * s * 5 + dx * 2.5, ky: py / n * s * 5 + dy * 2.5, cd: 0.6 }));
    }
    return { killed: true, dealt, children, points: e.score };
  }
}
