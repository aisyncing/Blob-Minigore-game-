// Damped spring that stays stable at any frame rate. One explicit step per rendered frame diverges on long frames
// (a 100 ms frame with stiffness 260 grew to millions), so a frame is cut into small fixed sub-steps.
const SUB = 1 / 240, MAX_DT = 0.25;
export function stepSpring(s, k, c, target, dt) {
  if (!(dt > 0)) return s;
  dt = Math.min(dt, MAX_DT);
  const n = Math.max(1, Math.ceil(dt / SUB)), h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; }
  return s;
}
