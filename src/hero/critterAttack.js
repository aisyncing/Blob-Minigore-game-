// Attack animation for the critters. Pure maths (no three.js): the attack state from the game logic in, a pose out.
//
// The logic (src/game/critters.js) gives each attack two phases: WINDUP (the telegraph, `k` runs 0 -> 1) and, after the strike lands, RECOVER
// (`k` runs 0 -> 1). Each size has one WIND pose (the peak of the telegraph) and one STRIKE pose (the peak of the hit):
//   windup   : rest -> WIND, eased                      (rear back / crouch / hoist the fists: readable and dodgeable)
//   recover  : WIND -> STRIKE fast (SNAP of the time), then STRIKE -> rest, eased
// Angles in radians; `lift` and `squash` in critter units; `lunge` in WORLD units forward (kept within the critter's strike reach).
import { TIERS } from '../game/critters.js';

export const FIELDS = ['lean', 'twist', 'roll', 'head', 'armL', 'armR', 'armLZ', 'armRZ', 'lift', 'lunge', 'squash'];
//   lean: body pitch (+ forward)   twist: body yaw   roll: body roll   head: head pitch (+ nod forward)   armL/armR: arm swing (- is forward/up)
//   armLZ/armRZ: arm splay (left: - is outward, right: + is outward)   lift: body up   lunge: whole critter forward   squash: + flattens, - stretches
export const ATTACK = {
  // mini: crouches and draws back, then dives forward jaws first with its arms grabbing
  small: { snap: 0.3,
    wind:   { lean: -0.45, twist: 0, roll: 0, head: 0, armL: 0.7, armR: 0.7, armLZ: -0.2, armRZ: 0.2, lift: -0.14, lunge: -0.1, squash: 0.14 },
    strike: { lean: 0.6,   twist: 0, roll: 0, head: 0, armL: -0.9, armR: -0.9, armLZ: 0.1, armRZ: -0.1, lift: 0.06, lunge: 0.38, squash: -0.12 } },
  // mid: rears back and hoists one claw overhead, then rakes it down across its body with a twist and a step in
  mid: { snap: 0.25,
    wind:   { lean: -0.4, twist: 0.5, roll: 0.05, head: -0.2, armL: -0.45, armR: -2.5, armLZ: -0.1, armRZ: 0.4, lift: 0.1, lunge: -0.08, squash: 0 },
    strike: { lean: 0.45, twist: -0.55, roll: -0.05, head: 0.25, armL: 0.2, armR: -0.35, armLZ: 0, armRZ: -0.35, lift: -0.04, lunge: 0.3, squash: -0.05 } },
  // big: rises up and raises both fists high, then slams them down so the whole body drops with it
  big: { snap: 0.2,
    wind:   { lean: -0.35, twist: 0, roll: 0, head: -0.35, armL: -2.8, armR: -2.8, armLZ: -0.3, armRZ: 0.3, lift: 0.3, lunge: 0, squash: -0.08 },
    strike: { lean: 0.5, twist: 0, roll: 0, head: 0.3, armL: -0.5, armR: -0.5, armLZ: 0, armRZ: 0, lift: -0.1, lunge: 0.2, squash: 0.18 } },
};

const clamp01 = x => Math.min(1, Math.max(0, x));
export const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };

/** Fills `out` with the attack pose. state: 'windup' | 'recover'; k: 0..1 progress through that state. */
export function attackPose(tier, state, k, out = {}) {
  const A = ATTACK[tier]; k = clamp01(k);
  for (const f of FIELDS) {
    if (state === 'windup') out[f] = A.wind[f] * smooth(k);
    else out[f] = k < A.snap ? A.wind[f] + (A.strike[f] - A.wind[f]) * smooth(k / A.snap) : A.strike[f] * (1 - smooth((k - A.snap) / (1 - A.snap)));
  }
  return out;
}

/** How much of the attack pose replaces the walk pose: eases in as the wind-up starts (`elapsed` seconds in), eases out at the end of the recovery. */
export function attackWeight(state, elapsed, k) {
  if (state === 'windup') return smooth(elapsed / 0.08);
  return k < 0.6 ? 1 : 1 - smooth((k - 0.6) / 0.4);
}

/** The visual lunge must stay inside the distance the strike can actually hit from. */
export const lungeWithinReach = tier => ATTACK[tier].strike.lunge <= TIERS[tier].atk.reach + 1e-9;
