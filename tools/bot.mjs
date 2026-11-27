// A headless bot that plays the survival run with the REAL game logic (crowd, director, waves, weapons, pellets), no browser.
// It exists so difficulty can be tuned from data: how long does a careless player last, a decent one, a good one?
//   node tools/bot.mjs [seeds=6] [maxSeconds=300]
import { createSession } from '../src/game/run.js';
import { runAim, createLock } from '../src/game/autoaim.js';
import { buildWorld, BOUNDS, SPAWN } from '../src/game/layout.js';
import { createShotgun } from '../src/game/shotgun.js';
import { weaponParams, weaponForWave } from '../src/game/weapons.js';
import { PelletSim, pelletPattern } from '../src/game/pellets.js';
import { launchBlast } from '../src/game/blast.js';
import { stepVelocity } from '../src/game/movement.js';
import { resolveWorld } from '../src/game/collide.js';

const mulberry = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const MOVE = { maxSpeed: 7.5, accel: 110, brake: 100, turnAccel: 160 };

/** skill: 'idle' stands still and shoots; 'careless' walks toward enemies; 'kiter' runs away from the crowd and shoots; 'ace' kites with wall avoidance and focus */
export function play(seed, skill, maxT = 300) {
  const rng = mulberry(seed), world = buildWorld();
  const sess = createSession({ world, bounds: BOUNDS, rng, hearts: 3 });
  let wid = 'pistol', W = weaponParams(wid), bloom = 0;                      // the pistol, then the SMG from the wave-2 countdown
  const gun = createShotgun({ capacity: W.capacity, interval: W.interval, reload: W.reload }), pellets = new PelletSim();
  const pl = { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, r: 0.5, v: { x: 0, y: 0 } };
  const H = 1 / 120; const lock = createLock(); let peak = 0, t = 0; const samples = {};
  const origRandom = Math.random; Math.random = rng;                         // pellet pattern uses Math.random
  try {
    for (let i = 0; i < maxT * 120 && !sess.run.over; i++, t += H) {
      const list = sess.crowd.list;
      { const w = sess.waves.state, next = weaponForWave(w.phase === 'countdown' ? w.next : w.wave); if (next !== wid) { wid = next; W = weaponParams(wid); gun.setParams({ capacity: W.capacity, interval: W.interval, reload: W.reload }); gun.reset(); } }
      bloom = Math.max(0, bloom - W.bloomDecay * H);
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
      const aim = runAim(pl, { x: 0, y: 0 }, { x: mx, y: my, mag: Math.hypot(mx, my) }, true, list, world, { range: Math.min(16, W.range - 0.5), lead: 1, lock, dt: H, pelletSpeed: W.pelletSpeed });
      const fire = aim.aiming && aim.source === 'auto' && Math.hypot(aim.target.x - pl.x, aim.target.y - pl.y) < Math.min(13, W.range - 2);
      for (const e of gun.update(H, { fire })) if (e.type === 'shot') {
        const id = i, muzzle = { x: pl.x + aim.x * 0.9, y: pl.y + aim.y * 0.9 };
        const spec = { range: W.range, damage: W.damage, falloffStart: W.falloffStart, minDamage: W.minDamage };
        launchBlast({ sim: pellets, from: pl, muzzle, dir: aim, angles: pelletPattern(W.pellets, W.spread * Math.PI / 180 * (1 + bloom), W.bias, rng), spec, speed: () => W.pelletSpeed, world, targets: list, shot: id, onHit: onHit });
        bloom = Math.min(W.bloomMax, bloom + W.bloomPerShot);
      }
      pellets.step(H, world, list, onHit);
      for (const ev of sess.step(H, pl)) { /* spawn / hurt / dead handled inside */ }
      peak = Math.max(peak, list.length);
      for (const s of [30, 60, 120, 180, 240]) if (!samples[s] && t >= s) samples[s] = list.length;
    }
  } finally { Math.random = origRandom; }
  function onHit(h) { if (h.kind === 'target') sess.hit(h.ref, h.damage, h.dx, h.dy); }
  return { seed, skill, wave: sess.waves.state.wave, survived: sess.run.time, kills: sess.run.kills, score: sess.run.score, peak, samples, over: sess.run.over };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = +(process.argv[2] || 6), maxT = +(process.argv[3] || 300);
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const skill of ['idle', 'careless', 'kiter', 'ace']) {
    const rs = Array.from({ length: seeds }, (_, i) => play(i + 1, skill, maxT));
    console.log(`${skill.padEnd(9)} survived median ${med(rs.map(r => r.survived)).toFixed(0)}s (min ${Math.min(...rs.map(r => r.survived)).toFixed(0)}, max ${Math.max(...rs.map(r => r.survived)).toFixed(0)}) · wave ${med(rs.map(r => r.wave))} · kills median ${med(rs.map(r => r.kills))} · peak enemies median ${med(rs.map(r => r.peak))} · ${rs.filter(r => !r.over).length}/${seeds} lasted the full ${maxT}s`);
  }
}
