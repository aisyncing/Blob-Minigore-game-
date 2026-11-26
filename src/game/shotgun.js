// The double-barrel's fire / reload state machine. Pure: feed it the trigger each step, read events back.
//
//   - each pull fires one barrel (alternating); holding repeats every `interval` seconds
//   - after the last shell the gun reloads automatically (`reload` seconds); R reloads early
//   - a trigger press shortly before the gun is ready is remembered (`buffer`), so you never lose a shot to being early
export const GUN_DEFAULTS = { capacity: 2, interval: 0.28, reload: 0.95, buffer: 0.12 };

export function createShotgun(params = {}) {
  let p = { ...GUN_DEFAULTS, ...params };
  const s = { ammo: p.capacity, cooldown: 0, reloadLeft: 0, barrel: 0, shots: 0, pressedAt: -1, prevFire: false, prevReload: false, t: 0 };
  return {
    state: s,
    setParams(next) { p = { ...GUN_DEFAULTS, ...next }; if (s.ammo > p.capacity) s.ammo = p.capacity; },
    reset() { s.ammo = p.capacity; s.cooldown = 0; s.reloadLeft = 0; s.barrel = 0; s.pressedAt = -1; s.prevFire = false; },
    get reloading() { return s.reloadLeft > 0; },
    /** @returns events: { type: 'shot', barrel, ammoLeft } | { type: 'reloadStart' } | { type: 'reloadDone' } */
    update(dt, { fire = false, reload = false } = {}) {
      const ev = []; s.t += dt;
      if (fire && !s.prevFire) s.pressedAt = s.t;             // remember the press for the buffer window
      s.prevFire = fire;
      const reloadPressed = reload && !s.prevReload; s.prevReload = reload;
      s.cooldown = Math.max(0, s.cooldown - dt);

      if (s.reloadLeft > 0) {
        s.reloadLeft -= dt;
        if (s.reloadLeft <= 0) { s.reloadLeft = 0; s.ammo = p.capacity; ev.push({ type: 'reloadDone' }); }
      } else if (reloadPressed && s.ammo < p.capacity && s.cooldown <= 0) {
        s.reloadLeft = p.reload; ev.push({ type: 'reloadStart', early: s.ammo > 0 });
      }

      const buffered = s.pressedAt >= 0 && s.t - s.pressedAt <= p.buffer;
      if (s.reloadLeft <= 0 && s.cooldown <= 0 && s.ammo > 0 && (fire || buffered)) {
        s.pressedAt = -1; s.ammo--; s.shots++; s.cooldown = p.interval;
        ev.push({ type: 'shot', barrel: s.barrel, ammoLeft: s.ammo }); s.barrel ^= 1;
      }
      if (s.reloadLeft <= 0 && s.ammo === 0 && s.cooldown <= 0) { s.reloadLeft = p.reload; ev.push({ type: 'reloadStart', early: false }); }
      return ev;
    },
  };
}
