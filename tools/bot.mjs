// A headless bot that plays the survival run with the REAL game logic (crowd, director, shotgun, pellets), no browser.
// It exists so difficulty can be tuned from data: how long does a careless player last, a decent one, a good one?
//   node tools/bot.mjs [seeds=6] [maxSeconds=300]
import { createSession } from '../src/game/run.js';
import { runAim } from '../src/game/autoaim.js';
import { buildWorld, BOUNDS, SPAWN } from '../src/game/layout.js';
import { createShotgun } from '../src/game/shotgun.js';
import { PelletSim, pelletPattern } from '../src/game/pellets.js';
import { launchBlast } from '../src/game/blast.js';
import { stepVelocity } from '../src/game/movement.js';
import { resolveWorld } from '../src/game/collide.js';

const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const GUN = { pellets: 9, spread: 8 * Math.PI / 180, bias: 0.25, damage: 12, range: 15, falloffStart: 3.5, minDamage: 0.25, speed: 55 };
const MOVE = { maxSpeed: 7.5, accel: 70, brake: 60, turnAccel: 110 };

/** skill: 'idle' stands still and shoots; 'careless' walks toward enemies; 'kiter' runs away from the crowd and shoots; 'ace' kites with wall avoidance and focus */
export function play(seed, skill, maxT = 300) {
  const rng = mulberry(seed), world = buildWorld();
  const sess = createSession({ world, bounds: BOUNDS, rng, hearts: 3 });
  const gun = createShotgun({ capacity: 2, interval: 0.28, reload: 0.95 }), pellets = new PelletSim();
  const pl = { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, r: 0.5, v: { x: 0, y: 0 } };
  const H = 1 / 120; let prev = null, peak = 0, t = 0; const samples = {};
  const origRandom = Math.random; Math.random = rng;                         // pellet pattern uses Math.random
  try {
    for (let i = 0; i < maxT * 120 && !sess.run.over; i++, t += H) {
      const list = sess.crowd.list;
      // movement policy
      let mx = 0, my = 0;
      if (skill !== 'idle') {
        let rx = 0, ry = 0, near = 0;
        for (const e of list) { const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy); const reach = skill === 'ace' ? 9 : 6; if (d < reach && d > 0.01) { const w = (1 / (d * d)) * (e.kind === 'zip' ? 2.2 : 1); rx += dx / d * w; ry += dy / d * w; near++; } }
        if (skill === 'careless') { const e = list[0]; if (e) { const dx = e.x - pl.x, dy = e.y - pl.y, d = Math.hypot(dx, dy) || 1; mx = dx / d; my = dy / d; } }
        else {
          // run from the crowd, stay off the walls, and drift toward the middle of the arena
          const wall = 6; if (pl.x < BOUNDS.minX + wall) rx += 0.12 * (BOUNDS.minX + wall - pl.x); if (pl.x > BOUNDS.maxX - wall) rx -= 0.12 * (pl.x - (BOUNDS.maxX - wall));
          if (pl.y < BOUNDS.minY + wall) ry += 0.12 * (BOUNDS.minY + wall - pl.y); if (pl.y > BOUNDS.maxY - wall) ry -= 0.12 * (pl.y - (BOUNDS.maxY - wall));
          for (const c of world.circles) { const dx = pl.x - c.x, dy = pl.y - c.y, d = Math.hypot(dx, dy); if (d < c.r + 1.6 && d > 0.01) { rx += dx / d * 0.9; ry += dy / d * 0.9; } }
          const m = Math.hypot(rx, ry); if (m > 0.02) { mx = rx / m; my = ry / m; }
          if (near && skill === 'ace') { const s = Math.min(1, m * 3); mx *= s; my *= s; }
        }
      }
      stepVelocity(pl.v, { x: mx, y: my, mag: Math.min(1, Math.hypot(mx, my)) }, MOVE, H);
      pl.x += pl.v.x * H; pl.y += pl.v.y * H; resolveWorld(pl, pl.v, 0.5, world); pl.vx = pl.v.x; pl.vy = pl.v.y;
      // aim + fire (R2 held whenever anything is in range)
      const aim = runAim(pl, { x: 0, y: 0 }, { x: mx, y: my, mag: Math.hypot(mx, my) }, true, list, world, { range: 16, lead: 1, prev });
      prev = aim.target;
      const fire = aim.aiming && aim.source === 'auto' && Math.hypot(aim.target.x - pl.x, aim.target.y - pl.y) < 13;
      for (const e of gun.update(H, { fire })) if (e.type === 'shot') {
        const id = i, muzzle = { x: pl.x + aim.x * 0.9, y: pl.y + aim.y * 0.9 };
        launchBlast({ sim: pellets, from: pl, muzzle, dir: aim, angles: pelletPattern(GUN.pellets, GUN.spread, GUN.bias, rng), spec: GUN, speed: () => GUN.speed, world, targets: list, shot: id, onHit: onHit });
      }
      pellets.step(H, world, list, onHit);
      for (const ev of sess.step(H, pl)) { /* spawn / hurt / dead handled inside */ }
      peak = Math.max(peak, list.length);
      for (const s of [30, 60, 120, 180, 240]) if (!samples[s] && t >= s) samples[s] = list.length;
    }
  } finally { Math.random = origRandom; }
  function onHit(h) { if (h.kind === 'target') sess.hit(h.ref, h.damage, h.dx, h.dy); }
  return { seed, skill, survived: sess.run.time, kills: sess.run.kills, score: sess.run.score, peak, samples, over: sess.run.over };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = +(process.argv[2] || 6), maxT = +(process.argv[3] || 300);
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const skill of ['idle', 'careless', 'kiter', 'ace']) {
    const rs = Array.from({ length: seeds }, (_, i) => play(i + 1, skill, maxT));
    console.log(`${skill.padEnd(9)} survived median ${med(rs.map(r => r.survived)).toFixed(0)}s (min ${Math.min(...rs.map(r => r.survived)).toFixed(0)}, max ${Math.max(...rs.map(r => r.survived)).toFixed(0)}) · kills median ${med(rs.map(r => r.kills))} · peak enemies median ${med(rs.map(r => r.peak))} · ${rs.filter(r => !r.over).length}/${seeds} lasted the full ${maxT}s`);
  }
}
