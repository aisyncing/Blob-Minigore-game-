// The hero's locomotion. Pure: state in, state out, fixed timestep. Unit tested.
//
// Velocity chases a target velocity (stick direction * stick magnitude * maxSpeed) at three
// different rates, because they are three different feels:
//   accel     speeding up from rest / along the current direction
//   brake     letting go of the stick
//   turnAccel changing direction, especially reversing (higher = snappier turns, less slide)
// The turn rate is blended by how opposed the new target is to the current velocity, so a
// 90 degree turn feels between a plain acceleration and a full reversal. In a full reversal
// turnAccel only governs the first half (killing the old speed); after the velocity crosses
// zero it is aligned with the target again, so accel takes over.

export const MOVE_DEFAULTS = { maxSpeed: 7.5, accel: 70, brake: 60, turnAccel: 110 };

export function stepVelocity(v, input, params, dt) {
  const p = { ...MOVE_DEFAULTS, ...params };
  const mag = Math.min(1, Math.hypot(input.x, input.y));
  const tx = mag > 0 ? (input.x / Math.hypot(input.x, input.y)) * mag * p.maxSpeed : 0;
  const ty = mag > 0 ? (input.y / Math.hypot(input.x, input.y)) * mag * p.maxSpeed : 0;
  const dx = tx - v.x, dy = ty - v.y, dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return;

  let rate;
  if (mag === 0) rate = p.brake;
  else {
    const speed = Math.hypot(v.x, v.y);
    // opposition: 0 when moving the way we want to go (or from rest), 1 when fully reversing
    const opp = speed > 1e-3 ? Math.max(0, -(v.x * tx + v.y * ty) / (speed * Math.hypot(tx, ty))) : 0;
    // also treat slowing down within the same direction as braking, so easing off the stick feels like letting go
    const slowing = speed > Math.hypot(tx, ty) && opp === 0;
    rate = slowing ? p.brake : p.accel + (p.turnAccel - p.accel) * opp;
  }
  const step = rate * dt;
  if (dist <= step) { v.x = tx; v.y = ty; } else { v.x += (dx / dist) * step; v.y += (dy / dist) * step; }
}

/** Derived numbers shown in the tuning panel. */
export function moveStats(params) {
  const p = { ...MOVE_DEFAULTS, ...params };
  return { timeToTop: p.maxSpeed / p.accel, stopTime: p.maxSpeed / p.brake, stopDistance: (p.maxSpeed * p.maxSpeed) / (2 * p.brake), reverseTime: p.maxSpeed / p.turnAccel + p.maxSpeed / p.accel };  // turnAccel undoes the old direction; once velocity crosses zero, accel builds the new one
}

export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
/** Frame-rate independent exponential smoothing factor. */
export const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
