// Pure input maths. No DOM, no Gamepad API, so it can be unit tested in Node.
import { clamp } from '../engine/math.js';

export { clamp };
const num = v => (Number.isFinite(v) ? v : 0);

/**
 * Radial scaled deadzone + response curve for one stick.
 *  inner: raw magnitude below this reads as zero (kills drift)
 *  outer: raw magnitude at/above this reads as full push (pads often max out below 1.0)
 *  curve: 1 = linear, >1 = softer near centre (finer aim), <1 = snappier
 * Direction is preserved exactly; only the magnitude is reshaped.
 */
export function shapeStick(x, y, { inner = 0.15, outer = 0.95, curve = 1 } = {}) {
  x = num(x); y = num(y);
  const raw = Math.hypot(x, y);
  if (raw <= inner || raw === 0) return { x: 0, y: 0, mag: 0, raw };
  const hi = Math.max(outer, inner + 1e-3);
  const t = clamp((raw - inner) / (hi - inner), 0, 1);
  const mag = Math.pow(t, Math.max(0.05, curve));
  return { x: (x / raw) * mag, y: (y / raw) * mag, mag, raw };
}

/** Output magnitude for a given raw magnitude (used to draw the response curve). */
export function curveAt(rawMag, cfg) {
  return shapeStick(rawMag, 0, cfg).mag;
}

/**
 * The thresholds the game actually uses. Release is always kept strictly below press (by at least MIN_GAP), because with
 * equal thresholds a trigger held exactly there would flip every frame. The lab shows these, not the raw slider values.
 */
export const TRIGGER_GAP = 0.02;
export function effectiveTrigger({ press = 0.5, release = 0.35 } = {}) {
  const p = clamp(num(press), 0.05, 1);
  return { press: p, release: clamp(num(release), 0, p - TRIGGER_GAP) };
}

/**
 * Trigger with hysteresis: goes down at >= press, comes up at <= release (after effectiveTrigger).
 * Two thresholds stop a trigger hovering near one value from flickering.
 */
export function makeTrigger(defaults = {}) {
  let down = false;
  return {
    update(v, cfg) {
      const { press: p, release: r } = effectiveTrigger({ ...defaults, ...(cfg || {}) });
      v = num(v);
      if (!down && v >= p) down = true;
      else if (down && v <= r) down = false;
      return down;
    },
    get down() { return down; },
    reset() { down = false; },
  };
}

/**
 * Given raw stick samples taken while the stick is untouched, report the worst
 * drift and a suggested inner deadzone (a margin above it, rounded up to 0.01).
 */
export function analyseRest(samples) {
  let max = 0, sx = 0, sy = 0;
  for (const s of samples) { max = Math.max(max, Math.hypot(num(s.x), num(s.y))); sx += num(s.x); sy += num(s.y); }
  const n = Math.max(1, samples.length);
  const suggested = clamp(Math.ceil((max * 1.3 + 0.01) * 100) / 100, 0.05, 0.4);
  return { max, meanX: sx / n, meanY: sy / n, suggested, count: samples.length };
}

/**
 * Keyboard as a stick: opposite keys cancel, diagonals are normalised so moving
 * diagonally is not faster than moving straight.
 */
export function digitalAxes({ left = false, right = false, up = false, down = false } = {}) {
  const x = (right ? 1 : 0) - (left ? 1 : 0), y = (down ? 1 : 0) - (up ? 1 : 0);
  const m = Math.hypot(x, y);
  return m ? { x: x / m, y: y / m, mag: 1 } : { x: 0, y: 0, mag: 0 };
}

/**
 * Mouse aim: unit direction from the player to the cursor. If the cursor is on top of
 * the player (closer than minDist) the previous aim is kept so the gun does not spin.
 */
export function mouseAim(player, cursor, lastAim = { x: 1, y: 0 }, minDist = 0.6) {
  const dx = num(cursor.x) - num(player.x), dy = num(cursor.y) - num(player.y), d = Math.hypot(dx, dy);
  if (d < minDist) { const m = Math.hypot(lastAim.x, lastAim.y) || 1; return { x: lastAim.x / m, y: lastAim.y / m, mag: 1, dist: d }; }
  return { x: dx / d, y: dy / d, mag: 1, dist: d };
}

/**
 * One drift measurement, tied to ONE identified controller (id + index). It reads that pad's raw axes only, never the
 * merged keyboard/mouse input, and cancels if the pad disconnects or a different pad shows up.
 * push(now, pad) -> 'sampling' | 'done' | 'cancelled';   result = { left, right } (analyseRest) when done.
 */
export function createDriftSession(pad, now, ms = 1500) {
  const s = { state: 'sampling', reason: null, result: null, id: pad?.id, index: pad?.index, until: now + ms, left: [], right: [] };
  const same = p => !!p && p.connected === true && p.id === s.id && p.index === s.index;
  const cancel = r => { s.state = 'cancelled'; s.reason = r; return s.state; };
  if (!pad || !pad.connected) cancel('No controller connected. Press a button on it first.');
  return Object.assign(s, {
    push(t, p) {
      if (s.state !== 'sampling') return s.state;
      if (!p || !p.connected) return cancel('The controller disconnected, so the measurement was cancelled.');
      if (!same(p)) return cancel('A different controller appeared, so the measurement was cancelled.');
      s.left.push({ x: p.left.x, y: p.left.y }); s.right.push({ x: p.right.x, y: p.right.y });
      if (t >= s.until) { s.result = { left: analyseRest(s.left), right: analyseRest(s.right) }; s.state = 'done'; }
      return s.state;
    },
    canApply(p) { return s.state === 'done' && same(p); },
  });
}
