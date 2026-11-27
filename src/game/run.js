// One survival run: hearts, invulnerability, score with a kill-combo multiplier, and a session that ties the crowd and director together.
// Pure logic, unit tested; the headless bot (tools/bot.mjs) plays it without a browser.
import { Crowd } from './crowd.js';
import { createDirector } from './director.js';

// Three hits: 3/3, 2/3, 1/3, then the third damaging hit ends the run. Each hit gives a window of invulnerability and a burst of
// speed to get out of the crowd. Nothing heals.
export const RUN = { invuln: 2.0, boost: 2.6, boostMul: 1.3, comboWindow: 2.5, killsPerStep: 4, maxMult: 8, rampStart: 0.7, rampSecs: 150 };
/** how fast furries move at a given run time, as a share of their full speed: gentle first wave, full speed after rampSecs */
export const speedRamp = (t) => RUN.rampStart + (1 - RUN.rampStart) * Math.min(1, t / RUN.rampSecs);

export function createRun({ hearts = 3 } = {}) {
  const r = {
    hp: hearts, maxHp: hearts, invuln: 0, boost: 0, score: 0, combo: 0, comboT: 0, kills: 0, time: 0, over: false,
    /** the player's top-speed multiplier: the getaway boost after a hit, easing out over its last 0.6 s */
    get speedMul() { return 1 + (RUN.boostMul - 1) * Math.min(1, this.boost / 0.6); },
    get mult() { return Math.min(RUN.maxMult, 1 + Math.floor(this.combo / RUN.killsPerStep)); },
    tick(dt) { if (this.over) return; this.time += dt; this.invuln = Math.max(0, this.invuln - dt); this.boost = Math.max(0, this.boost - dt); if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0; },
    /** @returns true if the hit landed */
    hurt() { if (this.over || this.invuln > 0) return false; this.hp--; this.invuln = RUN.invuln; this.boost = RUN.boost; this.combo = 0; this.comboT = 0; if (this.hp <= 0) { this.hp = 0; this.over = true; } return true; },
    kill(points) { const gain = points * this.mult; this.combo++; this.comboT = RUN.comboWindow; this.kills++; this.score += gain; return gain; },
  };
  return r;
}

/**
 * @param opts { world, bounds, rng, hearts, speed () => multiplier, pressure () => multiplier, playerRadius }
 * step(dt, player) → events: telegraph | spawn | swarm | hurt {enemy} | dead
 */
export function createSession({ world, bounds, rng = Math.random, hearts = 3, speed = () => 1, pressure = () => 1, playerRadius = 0.5 } = {}) {
  const crowd = new Crowd(world, { rng });
  const director = createDirector({ world, bounds, rng, pressure });
  let run = createRun({ hearts }), acc = 0;
  const FIXED = 1 / 60;
  const S = {
    crowd, director, get run() { return run; },
    reset(h = hearts) { crowd.clear(); director.reset(); run = createRun({ hearts: h }); acc = 0; },
    step(dt, player) {
      const ev = [];
      if (run.over) return ev;
      run.tick(dt);
      acc += dt;
      while (acc >= FIXED && !run.over) {                                       // the crowd runs at a steady 60 Hz whatever the simulation rate
        acc -= FIXED;
        for (const d of director.update(FIXED, { player, cost: crowd.cost })) {
          if (d.type === 'spawn') { const e = crowd.spawn(d.kind, d.tier, d.x, d.y); ev.push({ type: 'spawn', enemy: e }); } else ev.push(d);
        }
        const contacts = crowd.step(FIXED, { x: player.x, y: player.y, vx: player.vx || 0, vy: player.vy || 0, r: player.r ?? playerRadius }, { speedMul: speed() * speedRamp(run.time), canHurt: run.invuln <= 0 });
        for (const e of contacts) { if (run.hurt()) { ev.push({ type: 'hurt', enemy: e }); if (run.over) ev.push({ type: 'dead' }); break; } }
      }
      return ev;
    },
    /** A pellet landed. @returns { killed, dealt, children, points, gain } */
    hit(e, damage, dx, dy) { const r = crowd.damage(e, damage, dx, dy); r.gain = r.killed ? run.kill(r.points) : 0; return r; },
  };
  return S;
}
