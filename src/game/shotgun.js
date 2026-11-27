// The double-barrel's fire / reload state machine. Pure: feed it the trigger each step, read events back.
//
//   - each pull fires one barrel (alternating); holding repeats every `interval` seconds
//   - after the last shell the gun reloads automatically (`reload` seconds); R reloads early
//   - a trigger press shortly before the gun is ready is remembered (`buffer`), so you never lose a shot to being early
export const GUN_DEFAULTS = { capacity: 2, interval: 0.28, reload: 0.7, buffer: 0.12 };

export function createShotgun(params = {}) {
  let p = { ...GUN_DEFAULTS, ...params };
  const s = { ammo: p.capacity, cooldown: 0, reloadLeft: 0, reloadTotal: p.reload, spent: [false, false], barrel: 0, shots: 0, pressedAt: -1, prevFire: false, prevReload: false, t: 0 };
  return {
    state: s,
    setParams(next) { p = { ...GUN_DEFAULTS, ...next }; if (s.ammo > p.capacity) s.ammo = p.capacity; },
    reset() { s.ammo = p.capacity; s.cooldown = 0; s.reloadLeft = 0; s.spent[0] = s.spent[1] = false; s.barrel = 0; s.pressedAt = -1; s.prevFire = false; },
    get reloading() { return s.reloadLeft > 0; },
    /** 0..1 across the reload that is running, measured against the duration captured when it STARTED; -1 when not reloading.
     *  Slider edits only apply to the next reload, so the HUD, the animation, the sounds and the casings all stay in step. */
    get progress() { return s.reloadLeft > 0 ? Math.min(1, Math.max(0, 1 - s.reloadLeft / s.reloadTotal)) : -1; },
    /** @returns events: { type: 'shot', barrel, ammoLeft } | { type: 'reloadStart' } | { type: 'reloadDone' } */
    update(dt, { fire = false, reload = false } = {}) {
      const ev = []; s.t += dt;
      if (fire && !s.prevFire) s.pressedAt = s.t;             // remember the press for the buffer window
      s.prevFire = fire;
      const reloadPressed = reload && !s.prevReload; s.prevReload = reload;
      s.cooldown = Math.max(0, s.cooldown - dt);

      if (s.reloadLeft > 0) {
        s.reloadLeft -= dt;
        if (s.reloadLeft <= 0) { s.reloadLeft = 0; s.ammo = p.capacity; s.spent[0] = s.spent[1] = false; ev.push({ type: 'reloadDone' }); }
      } else if (reloadPressed && s.ammo < p.capacity && s.cooldown <= 0) {
        s.reloadLeft = s.reloadTotal = p.reload; ev.push({ type: 'reloadStart', early: s.ammo > 0 });
      }

      const buffered = s.pressedAt >= 0 && s.t - s.pressedAt <= p.buffer;
      if (s.reloadLeft <= 0 && s.cooldown <= 0 && s.ammo > 0 && (fire || buffered)) {
        s.pressedAt = -1; s.ammo--; s.shots++; s.cooldown = p.interval;
        ev.push({ type: 'shot', barrel: s.barrel, ammoLeft: s.ammo }); s.spent[s.barrel] = true; s.barrel = p.capacity > 1 ? s.barrel ^ 1 : 0;   // a one-shell gun always uses the same chamber
      }
      if (s.reloadLeft <= 0 && s.ammo === 0 && s.cooldown <= 0) { s.reloadLeft = s.reloadTotal = p.reload; ev.push({ type: 'reloadStart', early: false }); }
      return ev;
    },
  };
}
