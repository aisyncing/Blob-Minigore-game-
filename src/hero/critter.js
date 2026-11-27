// Visual for a critter: a round furry ball with ear tufts and big cross-looking eyes that always face the hero.
// Three sizes share the shape. Procedural reactions only: hop while chasing, squash and tilt when hit, white flash, climb-out from the ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../engine/stage.js';
import { stepSpring } from '../engine/spring.js';

export const PALETTE = {
  big:   { body: '#ff9a4d', tuft: '#d9622b' },
  mid:   { body: '#b58cff', tuft: '#8157d6' },
  small: { body: '#ffd84d', tuft: '#e0a81f' },
};

const _s = { x: 0, v: 0 };
const spring = (o, pos, vel, k, c, dt, target = 0) => { _s.x = o[pos]; _s.v = o[vel]; stepSpring(_s, k, c, target, dt); o[pos] = _s.x; o[vel] = _s.v; };

const shared = {};
function parts() {
  if (shared.ready) return shared;
  const paint = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  shared.bodyGeo = {};
  for (const [tier, p] of Object.entries(PALETTE)) {
    const list = [paint(new THREE.SphereGeometry(1, 18, 12).scale(1, 0.92, 1).translate(0, 0.95, 0).toNonIndexed(), p.body)];
    for (let i = 0; i < 9; i++) {                                                       // fur tufts over the top half
      const a = i / 9 * Math.PI * 2, e = 0.5 + (i % 3) * 0.3, d = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
      const g = new THREE.ConeGeometry(0.17, 0.46, 5); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.translate(d.x * 0.93, 0.95 + d.y * 0.88, d.z * 0.93);
      list.push(paint(g.toNonIndexed(), p.tuft));
    }
    for (const sx of [-1, 1]) { const g = new THREE.ConeGeometry(0.28, 0.6, 6); g.rotateZ(-sx * 0.35); g.translate(sx * 0.58, 1.85, -0.1); list.push(paint(g.toNonIndexed(), p.tuft)); }   // ears
    shared.bodyGeo[tier] = mergeGeometries(list);
  }
  const eyes = [], pupils = [];
  for (const sx of [-1, 1]) {
    eyes.push(new THREE.SphereGeometry(0.27, 12, 10).translate(sx * 0.36, 1.12, 0.78).toNonIndexed());
    pupils.push(new THREE.SphereGeometry(0.13, 10, 8).translate(sx * 0.3, 1.1, 1.0).toNonIndexed());   // pupils sit slightly inward: a cheeky look
  }
  shared.eyeGeo = mergeGeometries(eyes); shared.pupilGeo = mergeGeometries(pupils);
  shared.eyeMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); shared.pupilMat = new THREE.MeshBasicMaterial({ color: '#2a1b3d' });
  shared.markGeo = new THREE.RingGeometry(0.72, 1, 32).rotateX(-Math.PI / 2); shared.discGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  shared.shadowMat = new THREE.MeshBasicMaterial({ color: '#050a08', transparent: true, opacity: 0.35, depthWrite: false });
  shared.ready = true; return shared;
}

export class CritterView {
  constructor(scene, critter) {
    const S = parts(); this.c = critter; this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.mat = toon('#ffffff', { vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0 });
    this.rig = new THREE.Group(); this.group.add(this.rig);                           // everything that squashes, tilts and faces the hero
    this.body = new THREE.Mesh(S.bodyGeo[critter.tier], this.mat); this.body.castShadow = true; this.rig.add(this.body);
    this.rig.add(new THREE.Mesh(S.eyeGeo, S.eyeMat), new THREE.Mesh(S.pupilGeo, S.pupilMat));
    this.shadow = new THREE.Mesh(S.discGeo, S.shadowMat); this.shadow.position.y = 0.03; this.group.add(this.shadow);
    this.markMat = new THREE.MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.8, depthWrite: false });
    this.mark = new THREE.Mesh(S.markGeo, this.markMat); this.mark.position.y = 0.05; this.group.add(this.mark);
    this.tilt = { x: 0, z: 0, vx: 0, vz: 0 }; this.sq = 0; this.sqv = 0; this.flash = 0; this.phase = Math.random() * 6; this.age = 0;
    this.rig.visible = false; this.shadow.visible = false;
  }
  /** dx,dy: the direction the pellets were travelling. */
  hit(dx, dy, dmg) { const k = Math.min(1, dmg / 12) * 0.9 + 0.1; this.tilt.vx += dy * 6 * k; this.tilt.vz += -dx * 6 * k; this.sqv -= 3 * k; this.flash = 1; }
  respawn() {}
  kill() { this.group.visible = false; }
  dispose() { this.scene.remove(this.group); this.mat.dispose(); this.markMat.dispose(); }
  update(dt, t) {
    const c = this.c, r = c.r; this.age += dt;
    this.group.position.set(c.x, 0, c.y);
    if (c.state === 'warn') {                                                                // a pulsing marker on the ground where it will climb out
      const pulse = 1 + 0.1 * Math.sin(this.age * 14);
      this.mark.visible = true; this.mark.scale.setScalar(r * 1.5 * pulse); this.markMat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.age * 10)); this.rig.visible = false; this.shadow.visible = false; return;
    }
    this.mark.visible = c.state === 'rise'; this.rig.visible = this.shadow.visible = c.state !== 'dead';
    if (c.state === 'rise') { const k = Math.min(1, 1 - c.t / Math.max(0.01, c.riseT)); this.mark.scale.setScalar(r * (1.5 + k * 0.8)); this.markMat.opacity = 0.8 * (1 - k); this.rig.scale.setScalar(r * Math.max(0.05, k)); this.rig.position.y = -(1 - k) * r * 1.2; this.shadow.scale.setScalar(r * k); return; }
    for (const ax of ['x', 'z']) spring(this.tilt, ax, 'v' + ax, 150, 8, dt);
    spring(this, 'sq', 'sqv', 210, 9, dt);
    this.phase += dt * (6 + c.speed * 1.6); const hop = Math.abs(Math.sin(this.phase)), land = 1 - hop;
    this.rig.position.y = hop * r * 0.28;
    const sq = this.sq + land * 0.07;
    this.rig.rotation.set(this.tilt.x, c.heading, this.tilt.z + Math.sin(this.phase) * 0.07);
    this.rig.scale.set(r * (1 - sq * 0.5), r * (1 + sq), r * (1 - sq * 0.5));
    this.shadow.scale.setScalar(r * (1 - hop * 0.15));
    this.flash = Math.max(0, this.flash - dt * 8); this.mat.emissiveIntensity = this.flash * 0.85;
  }
}
