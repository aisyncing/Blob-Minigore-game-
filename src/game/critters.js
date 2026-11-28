// The enemy: a round furry critter. Logic only (the look is in hero/critter.js).
// Three sizes nest like dolls: shoot a big one and it breaks into two mids, each mid into two smalls.
// A critter implements the same small interface as a training Target (x, y, r, alive, damage()), so pellets and aim help treat it alike.
import { resolveWorld } from './collide.js';
import { wrapAngle as wrap } from '../engine/math.js';

export const TIERS = {
  big:   { r: 1.2,  hp: 64, speed: 2.5, score: 30, split: 'mid',   splitN: 2, mass: 3.0 },
  mid:   { r: 0.7,  hp: 26, speed: 3.5, score: 15, split: 'small', splitN: 2, mass: 1.6 },
  small: { r: 0.38, hp: 11, speed: 4.7, score: 8,  split: null,    splitN: 0, mass: 0.8 },
};
export const ATTACK_COOLDOWN = 0.9, PLAYER_HIT_PAD = 0.15;

export class Critter {
  /** warn: seconds the spawn marker shows; rise: seconds it takes to climb out (harmless and untouchable until then). */
  constructor({ tier = 'mid', x, y, warn = 1.1, rise = 0.45, kbx = 0, kby = 0, rand = Math.random }) {
    const d = TIERS[tier];
    Object.assign(this, { kind: 'critter', tier, def: d, r: d.r, maxHp: d.hp, hp: d.hp, x, y, alive: false, state: warn > 0 ? 'warn' : rise > 0 ? 'rise' : 'chase', t: warn > 0 ? warn : rise, riseT: rise,
      kb: { x: kbx, y: kby }, heading: 0, speed: d.speed * (0.88 + rand() * 0.24), attackCd: 0.4, detour: 0, detourSide: rand() < 0.5 ? -1 : 1, sndT: 0, dmgAcc: 0, dmgT: 0, dmgKill: false, spin: rand() * 10 });
    if (this.state === 'chase') this.alive = true;
  }
  get active() { return this.state !== 'dead'; }
  update() { return null; }                                         // the shared target loop calls this; critters are stepped by step()

  /** Returns { killed, dealt }, same as Target. */
  damage(amount) {
    if (!this.alive || amount <= 0) return { killed: false, dealt: 0 };
    const dealt = Math.min(this.hp, amount); this.hp -= amount;
    if (this.hp <= 1e-6) { this.hp = 0; this.alive = false; this.state = 'dead'; return { killed: true, dealt }; }
    return { killed: false, dealt };
  }
  /** A hit shoves it back along the pellets' direction; lighter critters fly further. */
  knock(dx, dy, dmg) { const k = Math.min(5, dmg * 0.32) / this.def.mass; this.kb.x += dx * k; this.kb.y += dy * k; }

  /**
   * @param ctx { player: {x,y,r}, world, others: [critters], rand }
   * @returns 'attack' on the step it lands a bite, else null
   */
  step(dt, { player, world, others = [] }) {
    if (this.state === 'warn') { this.t -= dt; if (this.t <= 0) { this.state = 'rise'; this.t = this.riseT; } return null; }
    if (this.state === 'rise') { this.t -= dt; if (this.t <= 0) { this.state = 'chase'; this.alive = true; } return null; }
    if (this.state !== 'chase') return null;
    const dx = player.x - this.x, dy = player.y - this.y, dist = Math.hypot(dx, dy) || 1e-6;
    // turn toward the player at a limited rate so a pack swings round instead of snapping
    let want = Math.atan2(dx, dy); if (this.detour > 0) { this.detour -= dt; want += this.detourSide * 1.25; }
    this.heading += wrap(want - this.heading) * Math.min(1, dt * 7);
    let vx = Math.sin(this.heading) * this.speed, vy = Math.cos(this.heading) * this.speed;
    // keep apart from neighbours so a swarm spreads into a crowd, not one stack
    for (const o of others) {
      if (o === this || o.state !== 'chase') continue;
      const ox = this.x - o.x, oy = this.y - o.y, min = this.r + o.r + 0.05, d2 = ox * ox + oy * oy;
      if (d2 < min * min && d2 > 1e-9) { const d = Math.sqrt(d2), push = (min - d) / min * 5; vx += ox / d * push; vy += oy / d * push; }
    }
    const kd = Math.exp(-7 * dt); this.kb.x *= kd; this.kb.y *= kd;
    const v = { x: vx + this.kb.x, y: vy + this.kb.y };
    this.x += v.x * dt; this.y += v.y * dt;
    const impact = resolveWorld(this, v, this.r, world);
    if (impact > 0.01 && this.detour <= 0 && dist > this.r + player.r + 0.6) this.detour = 0.45;       // stuck on a wall: slide round it
    const ax = player.x - this.x, ay = player.y - this.y, ad = Math.hypot(ax, ay) || 1e-6, min = this.r + player.r;
    if (ad < min) { this.x -= ax / ad * (min - ad); this.y -= ay / ad * (min - ad); }          // never inside the hero: crowd round, do not overlap
    this.attackCd -= dt;
    if (ad <= min + PLAYER_HIT_PAD && this.attackCd <= 0) { this.attackCd = ATTACK_COOLDOWN; this.kb.x -= ax / ad * 3.5; this.kb.y -= ay / ad * 3.5; return 'attack'; }
    return null;
  }

  /** The pieces left behind when this one dies (none for the smallest). They burst outward and climb out at once. */
  splits(rand = Math.random) {
    if (!this.def.split) return [];
    const out = [], base = rand() * Math.PI * 2;
    for (let i = 0; i < this.def.splitN; i++) {
      const a = base + i * (Math.PI * 2 / this.def.splitN) + (rand() - 0.5) * 0.5;
      out.push(new Critter({ tier: this.def.split, x: this.x + Math.sin(a) * this.r * 0.4, y: this.y + Math.cos(a) * this.r * 0.4, warn: 0, rise: 0.2, kbx: Math.sin(a) * 5.5, kby: Math.cos(a) * 5.5, rand }));
    }
    return out;
  }
}
