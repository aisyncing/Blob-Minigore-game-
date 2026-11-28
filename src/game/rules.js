// Fixed gameplay rules for the survival run and the hero's body. These are design decisions, not player settings: the live sliders
// live in src/tuning.js, the enemy stats in src/game/critters.js (TIERS) and the wave sizes in src/game/waves.js.
export const RULES = {
  sim: { hz: 120 },
  hero: {
    shoveDecay: 9,          // recoil / bite shove fades at exp(-9 t)
    maxShove: 12,           // rapid fire cannot stack a shove beyond this (u/s)
    bumpImpact: 2.5,        // hitting a wall faster than this (u/s) kicks dust and shakes the camera
    skid: { minSpeed: 3, minStick: 0.4, against: -0.3, every: 0.05 },   // pulling against your own momentum kicks up dust
  },
  run: {
    hurtShove: 6,           // a bite shoves the hero this hard (u/s)
    waveBonus: 50,          // clearing wave n is worth waveBonus * n points
    healEvery: 3,           // every 3rd wave cleared gives a heart back
    spawnMinDistance: 11,   // critters never climb out closer than this to the hero
    spawnClearance: 1.2,    // ... nor this close to a wall
    spawnTries: 24,
    retryAfter: 0.8,        // seconds the game-over screen ignores A / Enter, so a held fire button cannot skip it
    retryClickAfter: 0.4,
    corpseLinger: 0.25,     // a killed critter's body stays this long before it is removed
  },
  aim: { rangePad: 3 },     // aim help looks this much further than the gun reaches
  tutorial: {               // the two-step first-run lesson (src/game/tutorial.js)
    slow: 0.4,              // game speed while a lesson waits for the player (1 = normal)
    ease: 0.15,             // seconds to go between slow and normal speed
    moveMag: 0.5,           // the left stick must read at least this (after the deadzone) ...
    moveHold: 0.2,          // ... for this many real seconds in a row to count as "moved"
    gap: 1.0,               // real seconds of normal play between the two lessons
  },
  feedback: { numberDelay: 0.09, bigNumber: 60, hitSoundGap: 0.05 },
};
