// Training targets: health, respawn, and patrol loops. Logic only (visuals are in hero/dummy.js).
export function pathLength(pts) { let L = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }
export function pointAlong(pts, s) {
  const L = pathLength(pts); s = ((s % L) + L) % L;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= seg) { const k = seg ? s / seg : 0; return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: seg ? (b[0] - a[0]) / seg : 0, dy: seg ? (b[1] - a[1]) / seg : 0 }; }
    s -= seg;
  }
  return { x: pts[0][0], y: pts[0][1], dx: 0, dy: 0 };
}

export class Target {
  constructor({ x, y, r = 0.55, hp = 100, path = null, speed = 3, phase = 0, respawn = 2.5, kind = 'dummy' }) {
    Object.assign(this, { x, y, r, maxHp: hp, hp, path, speed, s: phase * (path ? pathLength(path) : 0), respawnT: respawn, kind, alive: true, deadFor: 0, vx: 0, vy: 0, home: { x, y } });
    if (path) this.#place(0);
  }
  #place() { const p = pointAlong(this.path, this.s); this.x = p.x; this.y = p.y; this.vx = p.dx * this.speed; this.vy = p.dy * this.speed; }
  /** Returns 'respawned' on the step it comes back. */
  update(dt) {
    if (!this.alive) { this.deadFor += dt; if (this.deadFor >= this.respawnT) { this.alive = true; this.hp = this.maxHp; this.deadFor = 0; return 'respawned'; } return null; }
    if (this.path) { this.s += this.speed * dt; this.#place(); } else { this.vx = this.vy = 0; }
    return null;
  }
  /** Returns { killed, dealt } */
  damage(amount) {
    if (!this.alive || amount <= 0) return { killed: false, dealt: 0 };
    const dealt = Math.min(this.hp, amount); this.hp -= amount;
    if (this.hp <= 1e-6) { this.hp = 0; this.alive = false; this.deadFor = 0; return { killed: true, dealt }; }
    return { killed: false, dealt };
  }
}
