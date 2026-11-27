// What the controller should feel, as plain data. Pure and unit tested; main.js only calls it.
//
// Rumble goes through the browser's Gamepad API (two motors: `strong` = heavy low rumble, `weak` = light buzz), shaped as a few
// short segments so one shot feels like a thump with a tail instead of one flat buzz.
// Adaptive triggers go through src/input/dualsense.js (WebHID) and only exist when a DualSense is connected that way.

/** Rumble patterns: segments of { at (ms from start), strong 0..1, weak 0..1, ms }. */
export const RUMBLE = {
  barrel1: [{ at: 0, strong: 1.0, weak: 0.70, ms: 70 }, { at: 70, strong: 0.60, weak: 0.35, ms: 70 }, { at: 140, strong: 0.25, weak: 0.10, ms: 90 }],   // the first barrel: the hard one
  barrel2: [{ at: 0, strong: 0.60, weak: 0.55, ms: 55 }, { at: 55, strong: 0.30, weak: 0.25, ms: 60 }, { at: 115, strong: 0.12, weak: 0.05, ms: 70 }],   // the second barrel: lighter and snappier
  dry:     [{ at: 0, strong: 0, weak: 0.35, ms: 25 }],                                                                                                      // pulling an empty / reloading gun: a tiny tick
  eject:   [{ at: 0, strong: 0.15, weak: 0.50, ms: 30 }],                                                                                                    // reload beats, matching src/hero/reload.js
  grab:    [{ at: 0, strong: 0, weak: 0.25, ms: 20 }],
  insert:  [{ at: 0, strong: 0.35, weak: 0.30, ms: 35 }],
  close:   [{ at: 0, strong: 0.60, weak: 0.50, ms: 45 }, { at: 45, strong: 0.20, weak: 0.20, ms: 40 }],                                                      // the barrels snapping shut: the clearest click
  kill:    [{ at: 0, strong: 0.20, weak: 0.60, ms: 40 }],                                                                                                    // a small bump when a dummy pops
  // "smart" patterns: chosen by what actually happened, not just by which button was pressed
  thud:    [{ at: 0, strong: 0.45, weak: 0.20, ms: 40 }, { at: 40, strong: 0.15, weak: 0.05, ms: 40 }],                                                              // pellets landed: a dull impact you feel in the palms
  pop:     [{ at: 0, strong: 0.55, weak: 0.85, ms: 45 }, { at: 45, strong: 0.35, weak: 0.30, ms: 55 }, { at: 100, strong: 0.12, weak: 0.05, ms: 60 }],             // a dummy bursts: sharper and bigger than a plain hit
  bump:    [{ at: 0, strong: 0.50, weak: 0.15, ms: 50 }, { at: 50, strong: 0.15, weak: 0.05, ms: 40 }],                                                              // running into a wall
};

/** Which of the player's volume sliders a pattern belongs to. */
export const GROUP = { barrel1: 'shoot', barrel2: 'shoot', thud: 'shoot', pop: 'shoot', kill: 'shoot', eject: 'reload', grab: 'reload', insert: 'reload', close: 'reload', dry: 'reload', bump: 'walk' };

/** Scaled, clamped copy of a pattern (scale 0..1 is the player's rumble strength). */
export function rumblePattern(name, scale = 1) {
  const p = RUMBLE[name]; if (!p) return [];
  const k = Math.min(1, Math.max(0, Number.isFinite(scale) ? scale : 1)), c = v => Math.min(1, Math.max(0, v * k));
  return p.map(s => ({ at: s.at, strong: c(s.strong), weak: c(s.weak), ms: s.ms }));
}

/** Which blast pattern for a shot: the first barrel (or a one-shell gun) hits hardest, the second is lighter. */
export const barrelPattern = (ammoLeft, capacity) => (capacity > 1 && ammoLeft === 0 ? 'barrel2' : 'barrel1');

/* ------------------------------ adaptive trigger feel ------------------------------ */
const OFF = { effect: 'off' };
// The fire trigger is read as "pressed" at 0.5 of its travel, which is the start of zone 5 (zones are tenths of the travel), so the wall
// runs zones 3-5 and gives way exactly where the shot fires: you feel the click and the gun goes off together.
export const TRIGGER_FEEL = {
  first:  { effect: 'weapon', start: 3, end: 5, strength: 5 },     // first barrel: a firm wall, then the click
  second: { effect: 'weapon', start: 3, end: 5, strength: 8 },     // second barrel: a stiffer wall and a harder snap
  locked: { effect: 'feedback', position: 1, strength: 8 },         // empty or reloading: the trigger will not pull
  kick:   { effect: 'vibration', position: 0, amplitude: 8, frequency: 45 },   // a short buzz in the trigger right after a shot
  off: OFF,
};
export const KICK_MS = 90;

/** @returns { right, left } trigger effects for the current moment. Only the fire (right) trigger is used. */
export function triggerPlan({ mode, reloading, ammo, capacity, kick = false }) {
  if (mode !== 'play') return { right: OFF, left: OFF };
  if (kick) return { right: TRIGGER_FEEL.kick, left: OFF };
  if (reloading || ammo <= 0) return { right: TRIGGER_FEEL.locked, left: OFF };
  return { right: ammo >= capacity ? TRIGGER_FEEL.first : TRIGGER_FEEL.second, left: OFF };
}

/* ------------------------------ the conductor ------------------------------ */
/**
 * @param rumble   (strong, weak, ms) => void, or null when no controller can rumble. Called fresh each time, so it always uses the live pad.
 * @param trigger  a createDualSense() object or null
 * @param opts     schedule/clear/now injectable for tests; scale() = rumble strength 0..1; triggersOn() = player setting
 */
export function createHaptics({ rumble = null, trigger = null, schedule = (f, ms) => setTimeout(f, ms), clear = id => clearTimeout(id), now = () => performance.now(), scale = () => 1, mix = () => 1, triggersOn = () => true } = {}) {
  let timers = [], kickUntil = 0, lastDry = -1e9, holdUntil = 0, busyUntil = 0, hitN = 0, killN = 0, hitTimer = null, lastBump = -1e9;
  const cancel = () => { for (const t of timers) clear(t); timers = []; };
  function play(name, gain = 1) {                                         // a new pattern replaces whatever was still playing: the latest event is what you should feel
    const fn = typeof rumble === 'function' ? rumble : null; if (!fn) return;
    cancel(); busyUntil = now() + Math.max(0, ...rumblePattern(name, 1).map(s => s.at + s.ms));
    for (const s of rumblePattern(name, scale() * gain * mix(GROUP[name] || 'shoot'))) {
      if (s.at === 0) fn(s.strong, s.weak, s.ms); else timers.push(schedule(() => fn(s.strong, s.weak, s.ms), s.at));
    }
  }
  return {
    play,
    shot(ammoLeft, capacity) { play(barrelPattern(ammoLeft, capacity)); kickUntil = now() + KICK_MS; },
    reload(stage) { if (RUMBLE[stage]) play(stage); },
    kill() { play('kill'); },
    /** A pellet landed (or killed). Hits from one blast arrive over a few frames, so they are collected and felt once:
     *  a dull thud that grows with how many pellets hit, or a pop that grows with how many dummies burst. */
    hit(killed = false, smart = true) {
      if (!smart) { if (killed) play('kill'); return; }
      hitN++; if (killed) killN++;
      if (hitTimer !== null) return;
      hitTimer = schedule(() => {
        hitTimer = null; const n = hitN, k = killN; hitN = 0; killN = 0;
        if (k > 0) play('pop', Math.min(1.3, 0.8 + 0.25 * k)); else play('thud', Math.min(1.3, 0.55 + n / 8));
      }, 45);
    },
    /** Running into something. Only felt when it is a real hit, and never as a flurry while grinding along a wall. */
    bump(impact) {
      const t = now(); if (impact < 2.5 || t - lastBump < 250) return false; lastBump = t;
      play('bump', Math.min(1.2, 0.4 + impact / 10)); return true;
    },
    /** One footfall, called by the walk animation at the moment a foot lands, so the rumble beats exactly with the steps you see.
     *  Stronger with speed, alternating sides, and never talks over a shot, a hit or a reload click. */
    footstep(side, speed01, on = true) {
      const fn = typeof rumble === 'function' ? rumble : null;
      if (!fn || !on || speed01 < 0.15 || now() < busyUntil) return false;
      const k = Math.min(1, speed01), g = scale() * mix('walk');
      fn(Math.min(1, (0.02 + 0.06 * k) * g * (side ? 1 : 0.7)), Math.min(1, (0.14 + 0.20 * k) * g * (side ? 1 : 0.8)), 22); return true;   // mostly the small motor: a light patter, not a thump
    },
    dry() { const t = now(); if (t - lastDry < 140) return false; lastDry = t; play('dry'); return true; },     // never a machine-gun of ticks while the trigger is held
    /** Pause the automatic trigger feel (the test buttons use this so a test is not overwritten a frame later). */
    hold(ms) { holdUntil = now() + ms; },
    /** Call every frame with the gun's state. Only talks to the controller when something changed. */
    update(state) {
      if (!trigger || !trigger.connected || now() < holdUntil) return null;
      const plan = triggersOn() ? triggerPlan({ ...state, kick: now() < kickUntil }) : { right: OFF, left: OFF };
      trigger.set(plan); return plan;
    },
    release() { cancel(); if (hitTimer !== null) { clear(hitTimer); hitTimer = null; } if (trigger && trigger.connected) trigger.release(); },
    stop() { cancel(); },
  };
}
