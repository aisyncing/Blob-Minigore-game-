// Visual for a training target: a friendly stuffed burlap sack with a bullseye on top (so it reads from above),
// button eyes, and a health bar. Reacts to hits procedurally: squash, tilt away from the shot, white flash.
import * as THREE from 'three';
import { toon, paintCanvas, R2 } from '../engine/stage.js';
import { stepSpring } from '../engine/spring.js';

const _s = { x: 0, v: 0 };
/** Advance o[pos] / o[vel] as a damped spring toward 0 (or toward `target`), stable at any frame rate. */
const spring = (o, pos, vel, k, c, dt, target = 0) => { _s.x = o[pos]; _s.v = o[vel]; stepSpring(_s, k, c, target, dt); o[pos] = _s.x; o[vel] = _s.v; };

const burlap = paintCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#c9a66b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.strokeStyle = i % 2 ? 'rgba(120,80,30,.18)' : 'rgba(255,230,170,.2)'; g.lineWidth = R2(1.5, 3); const y = R2(0, h); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + R2(-4, 4)); g.stroke(); }
  for (let i = 0; i < 70; i++) { g.strokeStyle = 'rgba(120,80,30,.12)'; g.lineWidth = 2; const x = R2(0, w); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + R2(-4, 4), h); g.stroke(); }
  g.strokeStyle = '#6b4a22'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h); g.stroke();
});
const bullseye = paintCanvas(128, 128, (g, w) => {
  const rings = ['#e85d5d', '#fff6e8', '#e85d5d', '#fff6e8', '#e85d5d']; rings.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(64, 64, 62 - i * 12, 0, 7); g.fill(); });
  g.fillStyle = '#2a1b3d'; g.beginPath(); g.arc(64, 64, 6, 0, 7); g.fill();
}, { repeat: false });
const barBg = new THREE.MeshBasicMaterial({ color: '#1d1530', transparent: true, opacity: 0.8, depthTest: false }), barGeo = new THREE.PlaneGeometry(1, 0.14);

export class DummyView {
  constructor(scene, target, camera) {
    this.t = target; this.camera = camera;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mat = toon('#ffffff', { map: burlap, emissive: '#ffffff', emissiveIntensity: 0 });
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.28, 12), toon('#8a5a2f')); stump.position.y = 0.14; stump.castShadow = true; this.group.add(stump);
    this.pivot = new THREE.Group(); this.pivot.position.y = 0.28; this.group.add(this.pivot);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14), this.mat); body.scale.set(1, 1.2, 1); body.position.y = 0.72; body.castShadow = true; this.pivot.add(body);
    const eye = () => new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#2a1b3d' }));
    for (const sx of [-1, 1]) { const e = eye(); e.position.set(sx * 0.2, 0.84, 0.5); this.pivot.add(e); }
    const eyeBlush = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), new THREE.MeshBasicMaterial({ color: '#ff9a9a', transparent: true, opacity: 0.55 })); for (const sx of [-1, 1]) { const b = eyeBlush.clone(); b.position.set(sx * 0.34, 0.68, 0.45); b.rotation.y = sx * 0.5; this.pivot.add(b); }
    const rings = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28), new THREE.MeshBasicMaterial({ map: bullseye, transparent: true })); rings.rotation.x = -Math.PI / 2; rings.position.y = 1.47; this.pivot.add(rings);
    for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 4), toon('#e8c85a')); const a = i / 5 * Math.PI * 2; s.position.set(Math.cos(a) * 0.52, 1.28, Math.sin(a) * 0.5); s.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); this.pivot.add(s); }
    // health bar, always facing the camera
    this.bar = new THREE.Group(); this.bar.position.y = 2.15; this.group.add(this.bar);
    const bg = new THREE.Mesh(barGeo, barBg); bg.scale.x = 1.08; bg.renderOrder = 8; this.bar.add(bg);
    this.fill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: '#7be08a', depthTest: false })); this.fill.renderOrder = 9; this.bar.add(this.fill);
    this.tilt = { x: 0, z: 0, vx: 0, vz: 0 }; this.sq = 0; this.sqv = 0; this.flash = 0; this.pop = 1; this.popV = 0; this.facing = 0; this.barT = 0;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: '#050a08', transparent: true, opacity: 0.35, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.03; this.group.add(this.shadow);
  }
  /** dx,dy: direction the pellets were travelling (the sack leans that way). */
  hit(dx, dy, dmg) {
    const k = Math.min(1, dmg / 12) * 0.9 + 0.1;
    this.tilt.vx += dy * 5 * k; this.tilt.vz += -dx * 5 * k;      // tilt about x for motion along +y (z), about z for motion along +x
    this.sqv -= 3.2 * k; this.flash = 1; this.barT = 2.2;
  }
  respawn() { this.pop = 0; this.popV = 0; this.group.visible = true; this.flash = 0; this.barT = 0.8; }
  kill() { this.group.visible = false; }
  update(dt, t) {
    const tg = this.t; this.group.visible = tg.alive || this.group.visible && false; 
    if (!tg.alive) return;
    this.group.position.set(tg.x, 0, tg.y);
    for (const ax of ['x', 'z']) spring(this.tilt, ax, 'v' + ax, 140, 7, dt);
    spring(this, 'sq', 'sqv', 200, 9, dt);
    // spawn pop with a little overshoot; the size is clamped so a respawn can never flash huge or vanish
    spring(this, 'pop', 'popV', 260, 14, dt, 1); this.pop = Math.min(1.35, Math.max(0, this.pop));
    const walk = tg.path ? Math.sin(t * 9 + tg.s) * 0.04 * (tg.speed / 3) : 0;           // patrollers waddle
    this.pivot.rotation.set(this.tilt.x, 0, this.tilt.z + walk * 2); this.pivot.position.y = 0.28 + Math.abs(walk);
    this.pivot.scale.set(1 - this.sq * 0.5, 1 + this.sq, 1 - this.sq * 0.5); this.group.scale.setScalar(Math.max(0.01, this.pop));
    this.flash = Math.max(0, this.flash - dt * 7); this.mat.emissiveIntensity = this.flash * 0.9;
    this.barT = Math.max(0, this.barT - dt); const f = tg.hp / tg.maxHp;
    this.bar.visible = this.barT > 0 || f < 1; this.bar.quaternion.copy(this.camera.quaternion);
    this.fill.scale.x = Math.max(0.001, f); this.fill.position.x = -(1 - f) * 0.5; this.fill.material.color.set(f > 0.5 ? '#7be08a' : f > 0.25 ? '#ffd23f' : '#ff6b6b');
  }
}
