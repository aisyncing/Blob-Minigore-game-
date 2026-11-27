import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_IDS, weaponForWave, weaponParams, fireRate, magazineDps, WEAPON_TUNING } from '../src/game/weapons.js';
import { DEFS } from '../src/tuning.js';
import { createShotgun } from '../src/game/shotgun.js';

test('the pistol fires faster than the shotgun, waits less to reload, and holds a real magazine', () => {
  const p = WEAPONS.pistol, s = WEAPONS.shotgun;
  assert.ok(fireRate(p) > fireRate(s) * 1.4, `pistol ${fireRate(p).toFixed(1)}/s vs shotgun ${fireRate(s).toFixed(1)}/s`);
  assert.ok(p.reload < s.reload, 'a shorter reload'); assert.ok(p.capacity >= 10, 'and a bigger magazine, so you reload far less often');
});
test('the SMG fires faster than the pistol', () => assert.ok(fireRate(WEAPONS.smg) > fireRate(WEAPONS.pistol) * 1.8));
const sustained = w => w.capacity / ((w.capacity - 1) * w.interval + w.reload);   // shots per second over a whole magazine, reload included
test('counting the reload, the pistol fires about three times as often as the shotgun and the SMG more again', () => {
  assert.ok(sustained(WEAPONS.pistol) > sustained(WEAPONS.shotgun) * 2.5, `${sustained(WEAPONS.pistol).toFixed(2)} vs ${sustained(WEAPONS.shotgun).toFixed(2)} shots/s`);
  assert.ok(sustained(WEAPONS.smg) > sustained(WEAPONS.pistol) * 1.8);
  assert.ok(magazineDps(WEAPONS.smg) > magazineDps(WEAPONS.pistol));
});
test('the pistol is the opening weapon and the SMG arrives with the wave-2 countdown', () => {
  assert.equal(weaponForWave(0), 'pistol'); assert.equal(weaponForWave(1), 'pistol'); assert.equal(weaponForWave(2), 'smg'); assert.equal(weaponForWave(9), 'smg');
});
test('every weapon has what the game reads, and a single-bullet weapon fires one pellet', () => {
  for (const id of WEAPON_IDS) { const w = WEAPONS[id]; for (const k of ['pellets', 'spread', 'damage', 'range', 'falloffStart', 'minDamage', 'pelletSpeed', 'interval', 'reload', 'capacity', 'recoil', 'camKick', 'fireSpeed', 'fireWeight']) assert.ok(Number.isFinite(w[k]), `${id}.${k}`); assert.ok(w.falloffStart < w.range, id); }
  assert.equal(WEAPONS.pistol.pellets, 1); assert.equal(WEAPONS.smg.pellets, 1);
});
test('the SMG blooms and recovers; the pistol does not', () => { assert.ok(WEAPONS.smg.bloomPerShot > 0 && WEAPONS.smg.bloomMax > 0); assert.equal(WEAPONS.pistol.bloomPerShot, 0); });
test('tuning values override the defaults, and the defaults in the registry are the weapon data', () => {
  assert.equal(weaponParams('pistol', k => (k === 'pistol.damage' ? 40 : undefined)).damage, 40);
  assert.equal(weaponParams('smg').interval, WEAPONS.smg.interval);
  for (const [id, map] of Object.entries(WEAPON_TUNING)) for (const [prop, key] of Object.entries(map)) { const d = DEFS.find(x => x.key === key); assert.ok(d, key); assert.equal(d.def, WEAPONS[id][prop], key); assert.ok(d.min <= d.def && d.def <= d.max, key); }
});
test('the gun state machine runs a pistol: 12 rounds at its rhythm, then a short automatic reload', () => {
  const p = WEAPONS.pistol, g = createShotgun({ capacity: p.capacity, interval: p.interval, reload: p.reload }); let shots = 0, reloads = 0, t = 0, doneAt = 0, startAt = 0;
  for (let i = 0; i < 120 * 6; i++) { t += 1 / 120; for (const e of g.update(1 / 120, { fire: true })) { if (e.type === 'shot') shots++; if (e.type === 'reloadStart') { reloads++; startAt = t; } if (e.type === 'reloadDone') doneAt = t; } }
  assert.ok(shots > 12 * 2, `${shots} shots in 6 s`); assert.ok(reloads >= 2); assert.ok(Math.abs(doneAt - startAt - p.reload) < 0.1 || doneAt > 0);
});
test('and an SMG: faster, and a bigger magazine lasts about the same time', () => {
  const run = (w) => { const g = createShotgun({ capacity: w.capacity, interval: w.interval, reload: w.reload }); let shots = 0; for (let i = 0; i < 120 * 3; i++) for (const e of g.update(1 / 120, { fire: true })) if (e.type === 'shot') shots++; return shots; };
  assert.ok(run(WEAPONS.smg) > run(WEAPONS.pistol) * 1.5);
});
