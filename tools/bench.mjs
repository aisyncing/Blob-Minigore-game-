// Micro-benchmark of the fixed-step hot path (pure modules only, no rendering): a full 40-critter crowd chasing the hero,
// two blasts of pellets in flight, aim assist scanning every target, every step at 120 Hz.
//   node --expose-gc tools/bench.mjs
import { buildWorld } from '../src/game/layout.js';
import { Critter } from '../src/game/critters.js';
import { PelletSim, pelletPattern } from '../src/game/pellets.js';
import { chooseAim } from '../src/game/assist.js';
import { launchBlast } from '../src/game/blast.js';

let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const world = buildWorld();
const STEP = 1 / 120, SECONDS = 20;

function scenario() {
  seed = 7;
  const player = { x: 0, y: 7, r: 0.66 };
  const critters = Array.from({ length: 40 }, (_, i) => new Critter({ tier: ['big', 'mid', 'small'][i % 3], x: -20 + (i % 10) * 4.4, y: -12 + Math.floor(i / 10) * 6, warn: 0, rise: 0, rand }));
  const sim = new PelletSim(), spec = { range: 15, damage: 12, falloffStart: 3.5, minDamage: 0.25 };
  let hits = 0, t = 0;
  const onHit = h => { if (h.kind === 'target') { hits++; h.ref.hp += h.damage; } };     // keep everyone alive so the load stays constant
  return {
    step() {
      t += STEP;
      const ctx = { player, world, others: critters };
      for (const c of critters) c.step(STEP, ctx);
      const aim = chooseAim(player, { x: Math.sin(t), y: -Math.cos(t) }, { x: 0, y: 0, mag: 0 }, true, critters, world, { mode: 'assist', coneDeg: 8, strength: 0.5, range: 18 });
      if (sim.pellets.length < 18) launchBlast({ sim, from: player, muzzle: { x: player.x + aim.x * 1.6, y: player.y + aim.y * 1.6 }, dir: { x: aim.x, y: aim.y }, angles: pelletPattern(9, 8 * Math.PI / 180, 0.25, rand), spec, speed: () => 55, world, targets: critters, shot: 1, onHit });
      sim.step(STEP, world, critters, onHit);
    },
    get hits() { return hits; },
  };
}

function run() {
  const s = scenario(), n = SECONDS / STEP;
  for (let i = 0; i < 240; i++) s.step();                 // warm up the JIT
  globalThis.gc?.(); const heap0 = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  let allocPeak = 0;
  for (let i = 0; i < n; i++) { s.step(); if ((i & 255) === 0) allocPeak = Math.max(allocPeak, process.memoryUsage().heapUsed - heap0); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { usPerStep: ms * 1000 / n, allocPeakKB: allocPeak / 1024, hits: s.hits };
}

const runs = Array.from({ length: 5 }, run), med = k => runs.map(r => r[k]).sort((a, b) => a - b)[2];
console.log(JSON.stringify({ steps: SECONDS / STEP, usPerStep: +med('usPerStep').toFixed(1), heapGrowthKB: Math.round(med('allocPeakKB')), hits: runs[0].hits }));
