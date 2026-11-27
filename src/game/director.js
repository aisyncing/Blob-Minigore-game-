// The wave director: continuous pressure instead of rounds. Pure logic, unit tested.
//
// Every enemy has a cost. The director may keep the total cost of what is alive (plus what is about to appear) under a CAP that
// grows with time, and it unlocks bigger or nastier enemy types as time passes. Every ~30 s it also throws a SWARM (a ring or a line of
// small ones) on top of the budget. Nothing appears without warning: each spawn is announced at its spot a moment before it pops in.
import { KINDS } from './crowd.js';

export const DIRECTOR = {
  startCap: 2.5, capPerSec: 0.13, maxCap: 80,              // how much danger may be alive at once, over time
  gapStart: 2.4, gapMin: 0.3, gapDrop: 0.008,           // seconds between spawns, shrinking
  telegraph: 1.1, swarmTelegraph: 1.5,                    // warning time before a spawn pops in
  swarmEvery: 35, swarmJitter: 6, firstSwarm: 50,
  minSpawnDist: 18, margin: 1.4,                          // spawn out of sight (about one screen away), inside the arena
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** What may spawn right now, with weights. */
export function spawnTable(t) {
  const out = [{ kind: 'furry', tier: 0, w: 10 }];
  if (t >= 35) out.push({ kind: 'furry', tier: 1, w: Math.min(6, (t - 35) * 0.12) });
  if (t >= 60) out.push({ kind: 'zip', tier: 0, w: Math.min(4, (t - 60) * 0.1) });
  if (t >= 100) out.push({ kind: 'furry', tier: 2, w: Math.min(2.2, (t - 100) * 0.04) });
  return out;
}

/** A point out of the way: roughly a screen from the player, inside the bounds, not inside a prop. Falls back to the farthest candidate. */
export function pickSpawn(player, bounds, world, rng, minDist = DIRECTOR.minSpawnDist, margin = DIRECTOR.margin) {
  let best = null, bestD = -1;
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, r = minDist + rng() * 6;
    const x = clamp(player.x + Math.cos(a) * r, bounds.minX + margin, bounds.maxX - margin), y = clamp(player.y + Math.sin(a) * r, bounds.minY + margin, bounds.maxY - margin);
    if (blocked(x, y, world, 0.8)) continue;
    const d = Math.hypot(x - player.x, y - player.y);
    if (d >= minDist) return { x, y };
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best || { x: clamp(player.x + 20, bounds.minX + margin, bounds.maxX - margin), y: clamp(player.y, bounds.minY + margin, bounds.maxY - margin) };
}
function blocked(x, y, world, pad) {
  for (const c of world.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + pad) return true;
  for (const b of world.boxes) if (Math.abs(x - b.x) < b.hw + pad && Math.abs(y - b.y) < b.hh + pad) return true;
  return false;
}

export function createDirector({ world, bounds, rng = Math.random, pressure = () => 1, params = {} } = {}) {
  const P = { ...DIRECTOR, ...params };
  const D = { t: 0, cooldown: 1, pending: [], nextSwarm: P.firstSwarm, swarms: 0 };
  const cap = () => Math.min(P.maxCap, (P.startCap + P.capPerSec * D.t) * pressure());
  const pendingCost = () => D.pending.reduce((s, p) => s + KINDS[p.kind].tiers[p.tier].cost, 0);

  function pickKind(room) {
    const table = spawnTable(D.t).filter(e => KINDS[e.kind].tiers[e.tier].cost <= room);
    const total = table.reduce((s, e) => s + e.w, 0); if (!table.length || total <= 0) return null;
    let r = rng() * total; for (const e of table) { r -= e.w; if (r <= 0) return e; } return table[table.length - 1];
  }
  const announce = (ev, kind, tier, x, y, delay) => { D.pending.push({ kind, tier, x, y, left: delay }); ev.push({ type: 'telegraph', kind, tier, x, y, delay }); };

  return {
    state: D, cap,
    /** @returns events: { type: 'telegraph' | 'spawn' | 'swarm', ... } */
    /** `t`: the wave system's difficulty clock (replaces the director's own); `hold`: a wave countdown is running, so schedule nothing new */
    update(dt, { player, cost = 0, t = null, hold = false }) {
      const ev = []; if (t === null) D.t += dt; else D.t = Math.max(D.t, t);
      // pending spawns pop in when their warning runs out
      for (const p of D.pending) p.left -= dt;
      for (let i = D.pending.length - 1; i >= 0; i--) if (D.pending[i].left <= 0) { const p = D.pending.splice(i, 1)[0]; ev.push({ type: 'spawn', kind: p.kind, tier: p.tier, x: p.x, y: p.y }); }
      if (hold) return ev;
      // a swarm: a ring around the player, or a line along one side, on top of the budget
      if (D.t >= D.nextSwarm) {
        D.swarms++; D.nextSwarm = D.t + P.swarmEvery + (rng() * 2 - 1) * P.swarmJitter;
        const n = Math.round(clamp(5 + D.t / 18, 5, 22)), ring = D.swarms % 2 === 1; ev.push({ type: 'swarm', n, shape: ring ? 'ring' : 'line' });
        const side = rng() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          let x, y;
          if (ring) { const a = i / n * Math.PI * 2 + side, r = 19; x = player.x + Math.cos(a) * r; y = player.y + Math.sin(a) * r; }
          else { const dx = Math.cos(side), dy = Math.sin(side); x = player.x + dx * 20 - dy * (i - n / 2) * 1.5; y = player.y + dy * 20 + dx * (i - n / 2) * 1.5; }
          x = clamp(x, bounds.minX + P.margin, bounds.maxX - P.margin); y = clamp(y, bounds.minY + P.margin, bounds.maxY - P.margin);
          if (!blocked(x, y, world, 0.6)) announce(ev, 'furry', 0, x, y, P.swarmTelegraph);
        }
      }
      // steady pressure
      D.cooldown -= dt;
      if (D.cooldown <= 0) {
        const room = cap() - cost - pendingCost();
        const pick = room > 0.9 ? pickKind(room) : null;
        if (pick) { const s = pickSpawn(player, bounds, world, rng, P.minSpawnDist, P.margin); announce(ev, pick.kind, pick.tier, s.x, s.y, P.telegraph); }
        D.cooldown = clamp(P.gapStart - D.t * P.gapDrop, P.gapMin, P.gapStart) / Math.max(0.3, pressure());
      }
      return ev;
    },
    reset() { D.t = 0; D.cooldown = 1; D.pending.length = 0; D.nextSwarm = P.firstSwarm; D.swarms = 0; },
  };
}
