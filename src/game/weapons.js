// The weapons, as data. Pure, unit tested.
//
//   pistol   the opening weapon: one accurate bullet per pull, a quick rhythm, a short reload every 12 shots
//   smg      unlocked when wave 1 ends: about twice the fire rate, 30 rounds, and the aim blooms the longer you hold the trigger
//   shotgun  the old double-barrel, kept for the training range
//
// Fire rate is shots per second = 1 / interval. A weapon's real output is what it does over a whole magazine, reload included.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol', pellets: 1, spread: 1.4, bias: 0, damage: 22, range: 18, falloffStart: 11, minDamage: 0.55, pelletSpeed: 80,
    interval: 0.17, reload: 0.75, capacity: 12, recoil: 1.1, camKick: 0.5, bloomPerShot: 0, bloomMax: 0, bloomDecay: 0, fireSpeed: 1.8, fireWeight: 0.6,
  },
  smg: {
    id: 'smg', name: 'SMG', pellets: 1, spread: 2.2, bias: 0, damage: 12, range: 17, falloffStart: 8, minDamage: 0.4, pelletSpeed: 80,
    interval: 0.075, reload: 1.1, capacity: 30, recoil: 0.45, camKick: 0.22, bloomPerShot: 0.1, bloomMax: 1.4, bloomDecay: 2.2, fireSpeed: 3.4, fireWeight: 0.45,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', pellets: 9, spread: 8, bias: 0.25, damage: 12, range: 15, falloffStart: 3.5, minDamage: 0.25, pelletSpeed: 55,
    interval: 0.28, reload: 0.95, capacity: 2, recoil: 4, camKick: 1, bloomPerShot: 0, bloomMax: 0, bloomDecay: 0, fireSpeed: 1, fireWeight: 1,
  },
};
export const WEAPON_IDS = ['pistol', 'smg', 'shotgun'];

/** The run: the pistol, then the SMG from the wave-2 countdown on (the breather after wave 1). */
export const weaponForWave = (wave) => (wave >= 2 ? 'smg' : 'pistol');

/** Which tuning key edits which property (pause menu). */
export const WEAPON_TUNING = {
  pistol: { damage: 'pistol.damage', interval: 'pistol.interval', reload: 'pistol.reload', capacity: 'pistol.capacity', spread: 'pistol.spread', range: 'pistol.range' },
  smg: { damage: 'smg.damage', interval: 'smg.interval', reload: 'smg.reload', capacity: 'smg.capacity', spread: 'smg.spread', range: 'smg.range' },
  shotgun: { pellets: 'gun.pellets', spread: 'gun.spread', bias: 'gun.bias', damage: 'gun.damage', range: 'gun.range', falloffStart: 'gun.falloffStart', minDamage: 'gun.minDamage', pelletSpeed: 'gun.pelletSpeed', interval: 'gun.interval', reload: 'gun.reload', capacity: 'gun.capacity', recoil: 'gun.recoil' },
};

/** A weapon's numbers with the player's tuning laid over them. `get(key)` reads a tuning value. */
export function weaponParams(id, get = () => undefined) {
  const w = { ...(WEAPONS[id] || WEAPONS.pistol) };
  for (const [prop, key] of Object.entries(WEAPON_TUNING[w.id] || {})) { const v = get(key); if (Number.isFinite(v)) w[prop] = v; }
  return w;
}

/** Bullets per second, and damage per second over a whole magazine including the reload (pellets that all land). */
export const fireRate = (w) => 1 / w.interval;
export const magazineDps = (w) => { const t = (w.capacity - 1) * w.interval + w.reload; return w.capacity * w.damage * w.pellets / t; };
