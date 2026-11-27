// The enemy crowd: Furries in three sizes plus the Charger. Pure logic, no DOM, unit tested.
//
//   furry  Mini (hops, swarms), Furry (waddles, the standard chaser), Giant (stomps, slow, very tough). A Giant splits into two
//          Furries, a Furry into two Minis. Each one carries a personal flank angle so a pack arrives from different sides, and it
//          wall-follows round props. In reach it winds up (arms up, mouth open), lunges and swipes: only the swipe hurts.
//   zip    "Charger": closes in, stops, shakes (a telegraph you can read), locks onto where you are GOING, then dashes.
//
// Crowd control is the cheap kind (seek + separation through a grid), no per-frame pathfinding, so 100+ enemies stay light.
import { resolveWorld } from './collide.js';
import { hasLineOfSight } from './ballistics.js';

export const KINDS = {
  furry: { tiers: [
    { name: 'Mini Furry',  r: 0.32, h: 0.62, hp: 26,  speed: 5.6, cost: 1,   score: 10, gait: 'hop',    stride: 0.85, reach: 0.35, windup: 0.18, strike: 0.10, recover: 0.30, lunge: 7 },
    { name: 'Furry',       r: 0.62, h: 1.5,  hp: 80,  speed: 4.2, cost: 2.4, score: 20, gait: 'waddle', stride: 1.15, reach: 0.55, windup: 0.32, strike: 0.12, recover: 0.42, lunge: 7.5 },
    { name: 'Giant Furry', r: 1.18, h: 3.0,  hp: 260, speed: 2.7, cost: 6,   score: 50, gait: 'stomp',  stride: 1.9,  reach: 0.9,  windup: 0.55, strike: 0.16, recover: 0.70, lunge: 6 },
  ] },
  zip: { tiers: [{ name: 'Charger', r: 0.4, h: 0.95, hp: 40, speed: 4.6, cost: 2.5, score: 30, gait: 'scurry', stride: 0.9, dash: 13.5, windup: 0.6, dashT: 0.5, recover: 0.9, trigger: 8.5 }] },
};
export const tierOf = (kind, tier) => KINDS[kind].tiers[tier];
export const EMERGE = 0.5;                                                     // seconds a new enemy spends digging out of the ground

const SEP_PAD = 0.18, CELL = 2.2, TAU = Math.PI * 2;
const rot = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };

/** Speed multiplier over one gait cycle g: a hop lurches, a waddle pulses on each step, a stomp surges on each step. Averages about 1. */
export function gaitPulse(gait, g) {
  const f = g - Math.floor(g), s = Math.sin(TAU * f);
  if (gait === 'hop') return f < 0.65 ? 1.45 : 0.25;
  if (gait === 'waddle') return 0.82 + 0.36 * s * s;
  if (gait === 'stomp') return 0.55 + 0.9 * s * s;
  return 1;
}

export class Crowd {
  constructor(world, { rng = Math.random } = {}) {
    this.world = world; this.rng = rng; this.list = []; this.nextId = 1; this.time = 0;
    this.grid = new Map();
  }
  clear() { this.list.length = 0; }
  /** Total "danger cost" of what is alive: the wave director spends against this. */
  get cost() { let c = 0; for (const e of this.list) if (e.alive) c += e.cost; return c; }
  get alive() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  /** o: { kx, ky (initial shove), cd (attack cooldown), emerge (false: burst out ready to chase, e.g. a split child) } */
  spawn(kind, tier, x, y, o = {}) {
    const T = tierOf(kind, tier), rng = this.rng, emerge = o.emerge !== false;
    const e = {
      isEnemy: true, id: this.nextId++, kind, tier, x, y, r: T.r, h: T.h, hp: T.hp, maxHp: T.hp, speed: T.speed, cost: T.cost, score: T.score, alive: true,
      vx: 0, vy: 0, kx: 0, ky: 0, fx: 0, fy: 1,                                 // velocity, knockback, facing
      orbit: (rng() * 2 - 1) * 0.55, detour: 0, detourT: 0, wall: 0,           // personal flank angle; wall-follow state
      state: emerge ? 'emerge' : 'chase', st: 0, lockX: 0, lockY: 0, struck: false,
      cd: o.cd ?? 0, age: 0, flash: 0, sq: 0, sqv: 0, ph: rng() * TAU, sndT: 0, // attack cooldown, visuals
      gait: rng(), hurtT: 9, hitX: 0, hitY: 0, seed: rng(),                    // gait cycle, time since last hit and its direction, look variation
    };
    if (o.kx || o.ky) { e.kx = o.kx || 0; e.ky = o.ky || 0; }
    this.list.push(e); return e;
  }

  /**
   * One crowd step. player = { x, y, vx, vy, r }. opts = { speedMul, canHurt }.
   * @returns contacts: enemies whose attack landed on the player this step (only when canHurt)
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
      e.age += dt; e.sndT -= dt; e.cd -= dt; e.hurtT += dt; e.st += dt;
      const dx = player.x - e.x, dy = player.y - e.y, d = Math.hypot(dx, dy) || 1e-6;
      let ux = dx / d, uy = dy / d, speed = e.speed * speedMul, steer = 9, faceP = false;
      const T = tierOf(e.kind, e.tier), gap = d - e.r - player.r;          // distance between the two bodies' edges

      if (e.state === 'emerge') { speed = 0; faceP = true; if (e.st >= EMERGE) { e.state = 'chase'; e.st = 0; } }
      else if (e.kind === 'zip') {
        if (e.state === 'chase') { if (d < T.trigger && hasLineOfSight(e.x, e.y, player.x, player.y, this.world) && e.age > 0.6 + EMERGE) { e.state = 'windup'; e.st = 0; } }
        else if (e.state === 'windup') {
          speed = 0; steer = 6; faceP = true;
          if (e.st >= T.windup) {                                                  // lock onto where the player is heading, not where they are
            const lead = 0.38, px = player.x + player.vx * lead, py = player.y + player.vy * lead, ld = Math.hypot(px - e.x, py - e.y) || 1;
            e.lockX = (px - e.x) / ld; e.lockY = (py - e.y) / ld; e.state = 'dash'; e.st = 0;
          }
        } else if (e.state === 'dash') { ux = e.lockX; uy = e.lockY; speed = T.dash * speedMul; steer = 40; if (e.st >= T.dashT || e.wall > 0.05) { e.state = 'recover'; e.st = 0; } }
        else if (e.state === 'recover') { speed = 0.8 * speedMul; steer = 5; if (e.st >= T.recover) { e.state = 'chase'; e.st = 0; } }
      } else {
        // furry: chase, then in reach wind up, lunge and swipe, then recover
        if (e.state === 'chase') { if (gap < T.reach + 0.25 && e.cd <= 0) { e.state = 'swipe'; e.st = 0; } }
        else if (e.state === 'swipe') {
          speed *= 0.22; faceP = true; steer = 12;
          if (e.st >= T.windup) { e.state = 'strike'; e.st = 0; e.lockX = ux; e.lockY = uy; e.struck = false; }
        } else if (e.state === 'strike') {
          ux = e.lockX; uy = e.lockY; speed = gap > 0.05 ? T.lunge * speedMul : 0; steer = 30;
          if (!e.struck && gap < T.reach) {
            e.struck = true;
            if (canHurt) { contacts.push(e); e.kx -= ux * 3; e.ky -= uy * 3; }
          }
          if (e.st >= T.strike) { e.state = 'recover'; e.st = 0; e.cd = T.recover + 0.25; }
        } else if (e.state === 'recover') { speed *= 0.3; steer = 6; if (e.st >= T.recover) { e.state = 'chase'; e.st = 0; } }
      }
      if (e.state === 'chase') {
        // flank: far away, swing the approach round by this enemy's own angle; close in, come straight
        const f = Math.max(0, Math.min(1, (d - 4) / 10)) * e.orbit; if (f) [ux, uy] = rot(ux, uy, f);
        // wall-follow: pinned against a prop for a moment, sidestep along it, then try again
        if (e.wall > 0.25 && e.detourT <= 0) { e.detour = this.rng() < 0.5 ? -1 : 1; e.detourT = 0.9; e.wall = 0; }
        if (e.detourT > 0) { e.detourT -= dt; [ux, uy] = rot(ux, uy, e.detour * 1.25); }
        speed *= gaitPulse(T.gait, e.gait);                                     // the gait sets the rhythm of the approach
        if (gap < 0.05) speed = 0;                                              // already touching: hold the spot instead of pushing in
      }
      // separation from neighbours; the small give way to the big
      let ex = 0, ey = 0;
      const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
        const a = grid.get((cx + ix) * 4096 + (cy + iy)); if (!a) continue;
        for (const o of a) {
          if (o === e) continue;
          const ox = e.x - o.x, oy = e.y - o.y, min = e.r + o.r + SEP_PAD, d2 = ox * ox + oy * oy;
          if (d2 >= min * min) continue;
          const od = Math.sqrt(d2) || 1e-4, push = (min - od) / min, wgt = o.r / (e.r + o.r) * 2;
          ex += ox / od * push * 1.9 * wgt; ey += oy / od * push * 1.9 * wgt;
        }
      }
      // the velocity chases the wanted velocity; separation is added on top so packs spread without losing their heading
      const tvx = ux * speed + ex * e.speed * speedMul, tvy = uy * speed + ey * e.speed * speedMul, k = Math.min(1, steer * dt);
      e.vx += (tvx - e.vx) * k; e.vy += (tvy - e.vy) * k;
      // facing eases toward the way it is going (or toward the player while winding up / attacking); big ones turn slower
      const vm = Math.hypot(e.vx, e.vy), look = faceP || e.state === 'strike' || vm < 0.3;
      const fxT = look ? ux : e.vx / vm, fyT = look ? uy : e.vy / vm, turn = Math.min(1, (e.kind === 'furry' ? 11 - e.tier * 3.5 : 12) * dt);
      e.fx += (fxT - e.fx) * turn; e.fy += (fyT - e.fy) * turn; const fm = Math.hypot(e.fx, e.fy) || 1; e.fx /= fm; e.fy /= fm;
      // knockback decays on its own; position integrates both
      const kd = Math.exp(-8 * dt); e.kx *= kd; e.ky *= kd;
      e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
      // never inside the player: an enemy that would overlap is put back on the edge (it cannot shove the hero around)
      { const px = e.x - player.x, py = e.y - player.y, pd = Math.hypot(px, py) || 1e-4, min = e.r + player.r;
        if (pd < min) { e.x = player.x + px / pd * min; e.y = player.y + py / pd * min; const vn = (e.vx * px + e.vy * py) / pd; if (vn < 0) { e.vx -= vn * px / pd; e.vy -= vn * py / pd; } } }
      const v = { x: e.vx, y: e.vy }, imp = resolveWorld(e, v, e.r, this.world); e.vx = v.x; e.vy = v.y;
      e.wall = imp > 0 ? e.wall + dt : Math.max(0, e.wall - dt * 2);
      // little visual springs: squash and flash; the gait cycle follows the ground actually covered, so feet do not slide
      e.sqv += (-180 * e.sq - 11 * e.sqv) * dt; e.sq += e.sqv * dt; e.flash = Math.max(0, e.flash - dt * 6);
      e.gait += Math.hypot(e.vx, e.vy) * dt / T.stride; e.ph += dt;
      // the Charger's dash still hurts on touch
      if (e.kind === 'zip' && e.state === 'dash' && canHurt && e.cd <= 0 && gap < 0.04) { contacts.push(e); e.cd = 1.1; e.kx -= ux * 5; e.ky -= uy * 5; e.state = 'recover'; e.st = 0; }
    }
    return contacts;
  }

  /**
   * Hit an enemy. (dx,dy) is the direction the pellet was travelling.
   * @returns { killed, dealt, children, points }
   */
  damage(e, amount, dx = 0, dy = 0, impulse = 0.55) {
    if (!e.alive || amount <= 0) return { killed: false, dealt: 0, children: [], points: 0 };
    const dealt = Math.min(e.hp, amount); e.hp -= amount; e.flash = 1; e.sqv -= 2.4 * Math.min(1, amount / 24); e.hurtT = 0; e.hitX = dx; e.hitY = dy;
    const mass = 1 + e.r * 1.6 + (e.tier === 2 ? 2 : 0); e.kx += dx * amount * impulse / mass; e.ky += dy * amount * impulse / mass;
    const km = Math.hypot(e.kx, e.ky), cap = 9 / mass; if (km > cap) { e.kx *= cap / km; e.ky *= cap / km; }
    if (e.state === 'swipe' && e.kind === 'furry' && e.tier < 2 && amount >= 12) { e.state = 'recover'; e.st = 0; }   // a solid hit interrupts a small one's windup
    if (e.hp > 1e-6) return { killed: false, dealt, children: [], points: 0 };
    e.hp = 0; e.alive = false;
    const children = [];
    if (e.kind === 'furry' && e.tier > 0) {                                     // nesting dolls: two of the next size down burst out sideways
      const px = -dy, py = dx, n = Math.hypot(px, py) || 1, side = (e.r * 0.8);
      for (const s of [-1, 1]) children.push(this.spawn('furry', e.tier - 1, e.x + px / n * side * s, e.y + py / n * side * s, { kx: px / n * s * 5 + dx * 2.5, ky: py / n * s * 5 + dy * 2.5, cd: 0.6, emerge: false }));
    }
    return { killed: true, dealt, children, points: e.score };
  }
}
