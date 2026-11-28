// Small pure maths shared by the simulation, input and rendering code.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** An angle folded into -PI..PI. */
export const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
