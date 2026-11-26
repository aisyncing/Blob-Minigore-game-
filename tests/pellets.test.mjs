import test from 'node:test';
import assert from 'node:assert/strict';
import { pelletPattern, damageAt, PelletSim } from '../src/game/pellets.js';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const G = { damage: 12, range: 15, falloffStart: 3.5, minDamage: 0.25 };

function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

test('pattern: right number of pellets, all inside the cone', () => {
  const half = 8 * Math.PI / 180;
  for (let n = 1; n <= 16; n++) { const p = pelletPattern(n, half, 0, rng(n)); assert.equal(p.length, n); assert.ok(p.every(a => Math.abs(a) <= half + 1e-12)); }
});
test('pattern: covers the cone evenly (every slice gets a pellet), unlike pure random', () => {
  const half = 0.2, n = 9;
  for (let seed = 1; seed <= 200; seed++) {
    const p = pelletPattern(n, half, 0, rng(seed)).map(a => (a / half + 1) / 2);   // 0..1
    for (let i = 0; i < n; i++) assert.ok(p.some(u => u >= i / n - 1e-9 && u <= (i + 1) / n + 1e-9), `empty slice ${i} (seed ${seed})`);
  }
});
test('pattern: centre bias pulls pellets inward but keeps them inside the cone', () => {
  const half = 0.3, mean = b => { let s = 0, c = 0; for (let k = 1; k <= 300; k++) for (const a of pelletPattern(9, half, b, rng(k))) { s += Math.abs(a); c++; } return s / c; };
  assert.ok(mean(0.8) < mean(0) * 0.8);
});
test('pattern is deterministic for a given random source', () => {
  assert.deepEqual(pelletPattern(9, 0.1, 0.3, rng(5)), pelletPattern(9, 0.1, 0.3, rng(5)));
});
test('damage: full inside falloffStart, linear to minDamage at range, zero beyond', () => {
  near(damageAt(0, G), 12); near(damageAt(3.5, G), 12);
  near(damageAt(15, G), 12 * 0.25);
  near(damageAt(9.25, G), 12 * (1 - 0.75 * 0.5));
  assert.equal(damageAt(15.001, G), 0);
});
test('damage never increases with distance', () => {
  let prev = Infinity; for (let d = 0; d <= 16; d += 0.25) { const v = damageAt(d, G); assert.ok(v <= prev + 1e-12); prev = v; }
});

const opts = { speed: 55, range: 15, ...G };
const run = (sim, world, targets, steps = 400, dt = 1 / 120) => { const hits = [], exp = []; for (let i = 0; i < steps; i++) sim.step(dt, world, targets, h => hits.push(h), p => exp.push(p)); return { hits, exp }; };

test('a pellet flies at the stated speed and expires at range', () => {
  const sim = new PelletSim(); sim.spawn(0, 0, 1, 0, opts);
  for (let i = 0; i < 12; i++) sim.step(1 / 120, { boxes: [], circles: [] }, []);      // 0.1 s at 55 u/s
  near(sim.pellets[0].x, 5.5, 1e-9);
  const expired = []; for (let i = 0; i < 60; i++) sim.step(1 / 120, { boxes: [], circles: [] }, [], null, p => expired.push(p));
  assert.equal(sim.pellets.length, 0); assert.equal(expired.length, 1); near(expired[0].traveled, 15, 1e-9);
});
test('a pellet hits a target with distance-based damage', () => {
  for (const [d, expected] of [[2, 12], [9.25, 12 * 0.625], [14, 12 * (1 - 0.75 * (10.5 / 11.5))]]) {
    const sim = new PelletSim(); sim.spawn(0, 0, 1, 0, opts);
    const { hits } = run(sim, { boxes: [], circles: [] }, [{ x: d + 0.5, y: 0, r: 0.5, alive: true }]);
    assert.equal(hits.length, 1); assert.equal(hits[0].kind, 'target'); near(hits[0].dist, d, 1e-6); near(hits[0].damage, expected, 1e-6);
  }
});
test('walls stop pellets and deal no damage; targets behind are shielded', () => {
  const sim = new PelletSim(); sim.spawn(0, 0, 1, 0, opts);
  const { hits } = run(sim, { boxes: [{ x: 5, y: 0, hw: 0.3, hh: 2 }], circles: [] }, [{ x: 8, y: 0, r: 0.5, alive: true }]);
  assert.equal(hits.length, 1); assert.equal(hits[0].kind, 'wall'); assert.equal(hits[0].damage, 0);
});
test('no tunnelling: a thin wall is never skipped at any pellet speed or step size', () => {
  for (const speed of [30, 55, 120, 400]) for (const dt of [1 / 240, 1 / 120, 1 / 60, 1 / 30]) {
    const sim = new PelletSim(); sim.spawn(0, 0, 1, 0, { ...opts, speed, range: 40 });
    const { hits } = run(sim, { boxes: [{ x: 7, y: 0, hw: 0.02, hh: 1 }], circles: [] }, [], 600, dt);
    assert.equal(hits.length, 1, `speed ${speed} dt ${dt}`);
  }
});
test('a pellet that expires reports it once, and one blast of nine hits a close target many times', () => {
  const sim = new PelletSim(); sim.spawn(0, 0, 0, 1, opts);
  const { hits, exp } = run(sim, { boxes: [], circles: [] }, []);
  assert.equal(hits.length, 0); assert.equal(exp.length, 1);
  const s2 = new PelletSim(), half = 6 * Math.PI / 180;
  for (const a of pelletPattern(9, half, 0, rng(3))) s2.spawn(0, 0, Math.cos(a), Math.sin(a), opts);
  const { hits: h2 } = run(s2, { boxes: [], circles: [] }, [{ x: 2.5, y: 0, r: 0.55, alive: true }]);
  assert.ok(h2.length >= 7, 'point blank should land most pellets: ' + h2.length);
  const s3 = new PelletSim();
  for (const a of pelletPattern(9, half, 0, rng(3))) s3.spawn(0, 0, Math.cos(a), Math.sin(a), opts);
  const { hits: h3 } = run(s3, { boxes: [], circles: [] }, [{ x: 14, y: 0, r: 0.55, alive: true }]);
  assert.ok(h3.length < h2.length, 'far blast lands fewer pellets');
});
test('two targets in a line: only the first is hit (pellets stop on contact)', () => {
  const sim = new PelletSim(); sim.spawn(0, 0, 1, 0, opts);
  const a = { x: 4, y: 0, r: 0.5, alive: true }, b = { x: 7, y: 0, r: 0.5, alive: true };
  const { hits } = run(sim, { boxes: [], circles: [] }, [b, a]);
  assert.equal(hits.length, 1); assert.equal(hits[0].ref, a);
});
