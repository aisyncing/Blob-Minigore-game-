// The health bar's animation, as plain numbers (the DOM just draws them). Pure, unit tested.
//
//   frac     the green bar: where health is now. It drops the instant you are hit.
//   ghost    the white bar behind it: it stays at the old level for a beat so you can see exactly how much you just lost,
//            then drains down to the green one.
//   flash    1 on a hit, fading fast: the bar blinks white
//   shake    1 on a hit, fading: the bar jolts
//   critical the bar turns from green to red: on your last hit, or at or below 20% (whichever comes first)
export const HEALTHBAR = { hold: 0.6, drainMin: 0.25, drainRate: 1.2, flashFade: 5, shakeFade: 2.4, critical: 0.2 };

export const isCritical = (hp, max) => max > 0 && hp > 0 && (hp / max <= HEALTHBAR.critical || (hp <= 1 && max > 1));

export function createHealthBar(params = {}) {
  const P = { ...HEALTHBAR, ...params };
  const S = { frac: 1, ghost: 1, hp: 1, max: 1, hold: 0, flash: 0, shake: 0, critical: false, pulse: 0 };
  return {
    state: S,
    /** health is now hp of max (call whenever it changes; a refill, like a new run, snaps with no animation) */
    set(hp, max) {
      const f = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
      if (f < S.frac - 1e-9) { S.hold = P.hold; S.flash = 1; S.shake = 1; S.ghost = Math.max(S.ghost, S.frac); }
      else if (f > S.frac + 1e-9) { S.ghost = f; S.hold = 0; S.flash = 0; S.shake = 0; }
      S.frac = f; S.hp = hp; S.max = max; S.critical = isCritical(hp, max);
    },
    update(dt) {
      S.flash = Math.max(0, S.flash - dt * P.flashFade); S.shake = Math.max(0, S.shake - dt * P.shakeFade); S.pulse += dt;
      if (S.hold > 0) { S.hold -= dt; return S; }
      if (S.ghost > S.frac) S.ghost = Math.max(S.frac, S.ghost - (P.drainMin + (S.ghost - S.frac) * P.drainRate) * dt);
      else S.ghost = S.frac;
      return S;
    },
    reset(hp, max) { Object.assign(S, { frac: max > 0 ? hp / max : 0, ghost: max > 0 ? hp / max : 0, hp, max, hold: 0, flash: 0, shake: 0, critical: isCritical(hp, max) }); },
  };
}
