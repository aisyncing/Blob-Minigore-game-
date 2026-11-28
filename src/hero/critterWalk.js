// Walk cycle for the critters. Pure maths: a stride phase in, a pose out (no three.js), so it can be tested in Node.
//
// The phase advances with the DISTANCE the critter really travels (phase = 2π · distance / stride), so the feet keep step with the ground
// and a critter that is blocked or shoved does not run on the spot. One cycle = two steps: foot L swings forward while R is planted, then the reverse.
// Lengths are in the critter's own units (its mesh is about 1 unit across); angles in radians; the view multiplies by the critter's radius.
export const TAU = Math.PI * 2;

export const WALK = {
  // stride: world units per full cycle   reach: how far a foot goes forward/back   lift: how high it rises   arm: arm swing   roll/twist/lean: body sway, shoulder twist, lean into the run
  // nod: head dip per step   hop: body bounce per step (x radius)   thud: squash kick when a foot lands (heavy ones)   armK/armD: arm spring (lower K = heavier, floppier arms)
  small: { stride: 1.0, reach: 0.5, lift: 0.2,  arm: 0.55, roll: 0.12, twist: 0,    lean: 0.14, nod: 0.05, hop: 0.26, thud: 0,   armK: 700, armD: 30 },   // mini: fast scurry, bouncy
  mid:   { stride: 1.5, reach: 0.5, lift: 0.3,  arm: 0.8,  roll: 0.07, twist: 0.1,  lean: 0.2,  nod: 0.08, hop: 0.14, thud: 0.6, armK: 160, armD: 10 },    // furry: hunched stomp, arms pump
  big:   { stride: 2.4, reach: 0.5, lift: 0.34, arm: 0.5,  roll: 0.1,  twist: 0.08, lean: 0.1,  nod: 0.05, hop: 0.07, thud: 1.4, armK: 70,  armD: 7 },     // giant: slow heavy lumber, long arms swing late
};

/** The phase for a critter that has walked `distance`, starting from `offset`. */
export const phaseAt = (tier, distance, offset = 0) => offset + TAU * distance / WALK[tier].stride;

/**
 * Fills `out` with the target pose at stride phase `p`; `m` (0..1) is how much the critter is really walking (0 = stand still, everything at rest).
 *   footLy/footRy lift   footLz/footRz forward (+) or back (-) from the rest position   armL/armR swing target (rotation.x, negative = forward)
 *   roll (rotation.z)  twist (rotation.y)  lean (rotation.x, forward)  nod (head rotation.x)   hop (body bounce, in critter units)
 */
export function walkPose(tier, p, m, out = {}) {
  const w = WALK[tier], s = Math.sin(p), c = Math.cos(p);
  out.footLy = Math.max(0, s) * w.lift * m;  out.footLz = -c * w.reach * m;      // foot L is back at p=0, in the air at p=π/2, forward at p=π, then slides back on the ground
  out.footRy = Math.max(0, -s) * w.lift * m; out.footRz = c * w.reach * m;       // foot R half a cycle later
  out.armL = -c * w.arm * m; out.armR = c * w.arm * m;                           // each arm swings forward as the foot on its own side goes back
  out.roll = -s * w.roll * m; out.twist = c * w.twist * m; out.lean = w.lean * m; out.nod = Math.cos(2 * p) * w.nod * m;
  out.hop = Math.abs(s) * w.hop * m;                                             // highest mid-step, lowest as a foot lands
  return out;
}
