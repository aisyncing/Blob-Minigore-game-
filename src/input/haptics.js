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
  pistol:  [{ at: 0, strong: 0.62, weak: 0.45, ms: 36 }, { at: 36, strong: 0.22, weak: 0.12, ms: 44 }],        // a crisp single crack with a short tail
  smg:     [{ at: 0, strong: 0.26, weak: 0.52, ms: 30 }],                                                          // a tiny tap per round: at 13 a second they run together into a rattle
  kill:    [{ at: 0, strong: 0.20, weak: 0.60, ms: 40 }],
  hurt:    [{ at: 0, strong: 1.0, weak: 1.0, ms: 120 }, { at: 120, strong: 0.5, weak: 0.4, ms: 140 }, { at: 260, strong: 0.2, weak: 0.1, ms: 120 }],   // you got hit: a heavy jolt that fades
  swarm:   [{ at: 0, strong: 0.35, weak: 0.1, ms: 120 }, { at: 220, strong: 0.35, weak: 0.1, ms: 120 }],                                              // a swarm is coming: two low thumps                                                                                                    // a small bump when a dummy pops
};

/** Which setting scales a pattern: the shot, the reload clicks, being hurt, a kill tap, or the world (swarm thumps). */
export const rumbleCategory = (name) => (name === 'barrel1' || name === 'barrel2' || name === 'pistol' || name === 'smg' ? 'shot' : name === 'step' ? 'move' : name === 'kill' ? 'kill' : name === 'hurt' ? 'hurt' : name === 'swarm' ? 'world' : 'reload');

/**
 * One footfall. The pulse grows with the hero's speed (speedF 0..1), and the two feet alternate between the two motors: the left foot lands
 * on the heavy low motor, the right foot on the light buzzing one. Faster running means harder AND more frequent steps, because the walk
 * cycle itself steps once per stride length.
 */
export function stepPattern(side, speedF) {
  const f = Math.min(1, Math.max(0, Number.isFinite(speedF) ? speedF : 0)), heavy = 0.14 + 0.46 * f, light = 0.22 + 0.24 * f, ms = Math.round(26 + 20 * f);
  return side === 0 ? [{ at: 0, strong: heavy, weak: light * 0.3, ms }] : [{ at: 0, strong: heavy * 0.3, weak: light, ms }];
}

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
/** The player's trigger settings (pause menu): resistance of each barrel, where the wall starts, where it breaks (the fire point, 0..1), locked and buzz strength. */
export const DEFAULT_FEEL = { strength: 5, strength2: 8, start: 3, press: 0.5, lock: 8, buzz: 8, pistol: 4, smgBuzz: 5, smgFreq: 26 };
const clampI = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
/** Turn those settings into the four trigger effects. The wall always breaks at the fire point, so the click and the shot are one moment. */
export function buildFeel(o = {}) {
  const f = { ...DEFAULT_FEEL, ...o }, start = clampI(f.start, 2, 7), end = clampI(f.press * 10, start + 1, 8);
  return {
    first:  { effect: 'weapon', start, end, strength: clampI(f.strength, 1, 8) },                                   // first barrel: a firm wall, then the click
    second: { effect: 'weapon', start, end, strength: clampI(f.strength2, 1, 8) },                                  // second barrel: a stiffer wall and a harder snap
    locked: f.lock >= 1 ? { effect: 'feedback', position: 1, strength: clampI(f.lock, 1, 8) } : OFF,               // empty or reloading: the trigger will not pull (0 = free)
    kick:   f.buzz >= 1 ? { effect: 'vibration', position: 0, amplitude: clampI(f.buzz, 1, 8), frequency: 45 } : OFF,   // a short buzz in the trigger right after a shot (0 = none)
    pistol: { effect: 'weapon', start, end, strength: clampI(f.pistol, 1, 8) },                                      // a lighter wall and a clean click: one pull, one shot
    smg:    f.smgBuzz >= 1 ? { effect: 'vibration', position: clampI(f.press * 10, 1, 9), amplitude: clampI(f.smgBuzz, 1, 8), frequency: clampI(f.smgFreq, 1, 255) } : OFF,   // full-auto: the trigger hums from the fire point on, like a machine gun in a shooter
    off: OFF,
  };
}
export const TRIGGER_FEEL = buildFeel();
export const KICK_MS = 90;

/** @returns { right, left } trigger effects for the current moment. Only the fire (right) trigger is used. */
export function triggerPlan({ mode, reloading, ammo, capacity, kick = false, feel = TRIGGER_FEEL, weapon = 'shotgun' }) {
  if (mode !== 'play' && mode !== 'run') return { right: OFF, left: OFF };      // menus, pause and game over: the triggers go back to normal
  if (kick && weapon !== 'smg') return { right: feel.kick, left: OFF };         // the SMG already hums; a shot-by-shot buzz would fight it
  if (reloading || ammo <= 0) return { right: feel.locked, left: OFF };
  if (weapon === 'smg') return { right: feel.smg, left: OFF };
  if (weapon === 'pistol') return { right: feel.pistol, left: OFF };
  return { right: ammo >= capacity ? feel.first : feel.second, left: OFF };
}

/* ------------------------------ the conductor ------------------------------ */
/**
 * @param rumble   (strong, weak, ms) => void, or null when no controller can rumble. Called fresh each time, so it always uses the live pad.
 * @param trigger  a createDualSense() object or null
 * @param opts     schedule/clear/now injectable for tests; scale(patternName) = rumble strength 0..1; triggersOn() = player setting; feel() = the trigger effects (buildFeel)
 */
export function createHaptics({ rumble = null, trigger = null, schedule = (f, ms) => setTimeout(f, ms), clear = id => clearTimeout(id), now = () => performance.now(), scale = () => 1, triggersOn = () => true, feel = () => TRIGGER_FEEL } = {}) {
  let timers = [], kickUntil = 0, lastDry = -1e9, holdUntil = 0, lastEvent = -1e9;
  const cancel = () => { for (const t of timers) clear(t); timers = []; };
  function play(name) {                                         // a new pattern replaces whatever was still playing: the latest event is what you should feel
    const fn = typeof rumble === 'function' ? rumble : null; if (!fn) return;
    cancel(); lastEvent = now();
    for (const s of rumblePattern(name, scale(name))) {
      if (s.at === 0) fn(s.strong, s.weak, s.ms); else timers.push(schedule(() => fn(s.strong, s.weak, s.ms), s.at));
    }
  }
  return {
    play,
    shot(ammoLeft, capacity) { play(barrelPattern(ammoLeft, capacity)); kickUntil = now() + KICK_MS; },
    /** a shot from any weapon: the shotgun's barrels, the pistol's crack, the SMG's rattle */
    fire(weapon, ammoLeft, capacity) { if (weapon === 'pistol') { play('pistol'); kickUntil = now() + KICK_MS; } else if (weapon === 'smg') play('smg'); else this.shot(ammoLeft, capacity); },
    /** a footfall; never cuts into a shot, a hit or a reload click that is still playing */
    step(side, speedF) {
      const fn = typeof rumble === 'function' ? rumble : null; if (!fn || now() - lastEvent < 110) return;
      const k = Math.min(1, Math.max(0, scale('step'))), c = v => Math.min(1, Math.max(0, v * k));
      for (const s of stepPattern(side, speedF)) fn(c(s.strong), c(s.weak), s.ms);
    },
    reload(stage) { if (RUMBLE[stage]) play(stage); },
    kill() { play('kill'); },
    hurt() { play('hurt'); },
    swarm() { play('swarm'); },
    dry() { const t = now(); if (t - lastDry < 140) return false; lastDry = t; play('dry'); return true; },     // never a machine-gun of ticks while the trigger is held
    /** Pause the automatic trigger feel (the test buttons use this so a test is not overwritten a frame later). */
    hold(ms) { holdUntil = now() + ms; },
    /** Call every frame with the gun's state. Only talks to the controller when something changed. */
    update(state) {
      if (!trigger || !trigger.connected || now() < holdUntil) return null;
      const plan = triggersOn() ? triggerPlan({ ...state, kick: now() < kickUntil, feel: feel() }) : { right: OFF, left: OFF };
      trigger.set(plan); return plan;
    },
    release() { cancel(); if (trigger && trigger.connected) trigger.release(); },
    stop() { cancel(); },
  };
}
