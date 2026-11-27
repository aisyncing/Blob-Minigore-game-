// A guided calibration for this controller, as a small state machine (pure, unit tested). Each step slowly ramps one thing up from nothing and the
// player presses A the moment it feels right; the value at that moment becomes the setting. Nobody has to know what "motor floor" or "trigger zone" means.
//
//   1  heavy motor      the lowest strength you can feel   -> the start threshold of all rumble (small taps would otherwise vanish)
//   2  light motor      the same for the buzzing motor     -> averaged in
//   3  trigger wall     the first resistance you find firm -> shotgun/pistol resistance
//   4  trigger hum      the first buzz you find strong     -> the SMG's hum
//   5  lightbar         the brightest level that is comfortable
//
// Not feeling anything before the ramp ends is a result too: the step records its strongest value, so the game errs on the side of more.
export const STEPS = [
  { id: 'heavy', title: 'Low rumble', hint: 'Press A the moment you first feel the controller rumble.', secs: 7 },
  { id: 'light', title: 'Light buzz', hint: 'Press A the moment you first feel the light buzz.', secs: 7 },
  { id: 'trigger', title: 'Trigger resistance', hint: 'Slowly pull the right trigger. Press A when the resistance feels firm but comfortable.', secs: 8 },
  { id: 'hum', title: 'Trigger hum', hint: 'Hold the right trigger half way down. Press A when the hum feels strong but comfortable.', secs: 8 },
  { id: 'light-level', title: 'Lightbar', hint: 'Press A on the brightness you like.', secs: 6 },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * @returns {
 *   start(), cancel(), confirm(),            confirm = the A button
 *   update(dt) -> null when idle, else { step, index, count, hint, title, level (0..1 along this step), drive }
 *   state
 * }
 * drive says what the controller should be doing right now: { type: 'motor', motor: 'heavy'|'light', level } | { type: 'trigger', strength } |
 * { type: 'hum', amplitude } | { type: 'light', level }. When the last step is confirmed, `result` is set and onDone(result) is called.
 */
export function createCalibration({ onDone = () => {}, steps = STEPS } = {}) {
  const S = { active: false, index: 0, t: 0, values: {}, result: null };
  const finish = () => {
    const v = S.values, floors = [v.heavy, v.light].filter(x => Number.isFinite(x));
    S.result = {
      floor: floors.length ? clamp(floors.reduce((a, b) => a + b, 0) / floors.length, 0.03, 0.5) : null,
      triggerStrength: Number.isFinite(v.trigger) ? clamp(Math.round(v.trigger), 1, 8) : null,
      humAmplitude: Number.isFinite(v.hum) ? clamp(Math.round(v.hum), 1, 8) : null,
      lightLevel: Number.isFinite(v['light-level']) ? clamp(v['light-level'], 0.1, 1) : null,
    };
    S.active = false; onDone(S.result);
  };
  const levelOf = (step, t) => clamp(t / step.secs, 0, 1);
  /** the real value of a step at a ramp position */
  const valueOf = (step, k) => (step.id === 'trigger' || step.id === 'hum' ? 1 + Math.floor(k * 7.999) : step.id === 'light-level' ? 0.1 + 0.9 * (Math.floor(k * 2.999) / 2) : k);
  const advance = () => { S.index++; S.t = 0; if (S.index >= steps.length) finish(); };
  return {
    state: S,
    start() { S.active = true; S.index = 0; S.t = 0; S.values = {}; S.result = null; },
    cancel() { S.active = false; S.result = null; },
    confirm() {
      if (!S.active) return false; const step = steps[S.index];
      S.values[step.id] = valueOf(step, levelOf(step, S.t)); advance(); return true;
    },
    update(dt) {
      if (!S.active) return null;
      let step = steps[S.index]; S.t += dt;
      if (S.t >= step.secs) { S.values[step.id] = valueOf(step, 1); advance(); if (!S.active) return null; step = steps[S.index]; }
      const k = levelOf(step, S.t), v = valueOf(step, k);
      const drive = step.id === 'heavy' || step.id === 'light' ? { type: 'motor', motor: step.id, level: k }
        : step.id === 'trigger' ? { type: 'trigger', strength: v } : step.id === 'hum' ? { type: 'hum', amplitude: v } : { type: 'light', level: v };
      return { step: step.id, index: S.index, count: steps.length, title: step.title, hint: step.hint, level: k, value: v, drive };
    },
  };
}
