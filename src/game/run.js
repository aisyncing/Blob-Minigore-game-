// Player health and score for one run. Pure.

/** Hearts with a short invulnerable window after each hit, so a crowd cannot chew through them in one touch. */
export function createHealth({ max = 5, invuln = 1.1 } = {}) {
  const h = { max, hp: max, invulnT: 0 };
  return {
    state: h,
    get dead() { return h.hp <= 0; },
    get invulnerable() { return h.invulnT > 0; },
    /** @returns true when the hit landed (false while invulnerable or already dead) */
    hit(n = 1) { if (h.hp <= 0 || h.invulnT > 0) return false; h.hp = Math.max(0, h.hp - n); h.invulnT = invuln; return true; },
    heal(n = 1) { h.hp = Math.min(h.max, h.hp + n); },
    update(dt) { if (h.invulnT > 0) h.invulnT = Math.max(0, h.invulnT - dt); },
    reset() { h.hp = h.max; h.invulnT = 0; },
  };
}

/** Score with a kill combo: quick kills in a row raise the multiplier (x1 up to x5); it drops after a pause. */
export function createScore({ window = 2.5, perStep = 4, maxMult = 5 } = {}) {
  const s = { points: 0, kills: 0, chain: 0, t: 0 };
  const mult = () => Math.min(maxMult, 1 + Math.floor(s.chain / perStep));
  return {
    state: s,
    get mult() { return mult(); },
    kill(base) { s.chain++; s.t = window; s.kills++; const gained = base * mult(); s.points += gained; return gained; },
    update(dt) { if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.chain = 0; } },
    reset() { s.points = s.kills = s.chain = 0; s.t = 0; },
  };
}
