// Visual for a critter: a round furry ball with ear tufts and big cross-looking eyes that always face the hero.
// Three sizes share the shape. Procedural reactions only: hop while chasing, squash and tilt when hit, white flash, climb-out from the ground.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../engine/stage.js';
import { springProp as spring } from '../engine/spring.js';
import { WALK, walkPose, phaseAt } from './critterWalk.js';
import { attackPose, attackWeight } from './critterAttack.js';

// The brown Furry from the Minigore 2 character sheet: shaggy layered fur, pointed ears, a cream muzzle, black glossy eyes, angry brows and a
// wide mouth full of jagged teeth. Three sizes share the design: Mini (round, low), Furry (upright, hunched), Giant (massive, long arms).
// Each size is ONE skinned mesh (one draw call) on a small skeleton: every part is rigidly bound to one bone, so the limbs, head and body can move
// on their own. Bone order is fixed (see BONE); at rest the skinned mesh is exactly the old static shape.
const FUR = { dark: '#6e3519', mid: '#8a4524', tip: '#c0703a', muzzle: '#c99872', nose: '#2c211e', mouth: '#6b1f1f', tooth: '#f1dfc0', eye: '#120e0e' };
export const PALETTE = {
  big:   { body: FUR.mid, tuft: FUR.tip },
  mid:   { body: FUR.mid, tuft: FUR.tip },
  small: { body: FUR.mid, tuft: FUR.tip },
};

/** Bone indices, and the order the skeleton is built in. */
export const BONE = { root: 0, body: 1, head: 2, armL: 3, armR: 4, footL: 5, footR: 6 };
const STRIKE_KICK = { small: 0.6, mid: 1.4, big: 5 };      // squash jolt (spring impulse) when a strike lands: the giant's slam is felt through its whole body
const shared = {};
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** One furry as a single merged, vertex-coloured, skinned geometry, facing +z, standing on y = 0, about 1 unit of radius. Also returns the joint positions. */
function buildFurry(kind) {
  const rand = rng(kind === 'big' ? 7 : kind === 'mid' ? 21 : 33), list = [];
  let bone = BONE.body;                                                       // the bone the next part is bound to
  const add = (g, hex, grad = null) => {                                      // grad: colour of the vertices at the top of the part (fur tips)
    g = g.index ? g.toNonIndexed() : g; const base = new THREE.Color(hex), tip = new THREE.Color(grad || hex), pos = g.attributes.position, n = pos.count, a = new Float32Array(n * 3);
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
    for (let i = 0; i < n; i++) { const k = grad ? (pos.getY(i) - lo) / Math.max(1e-6, hi - lo) : 0, c = base.clone().lerp(tip, k * k); a.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }                  // rigid skinning: every vertex follows exactly one bone
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); list.push(g);
  };
  const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1, hex = FUR.mid) => add(new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz).translate(x, y, z), hex);
  const cone = (r, h, dir, at, hex, grad, seg = 5) => { const g = new THREE.ConeGeometry(r, h, seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize())); g.translate(at.x, at.y, at.z); add(g, hex, grad); };
  // body plan per size
  const P = kind === 'small'
    ? { torso: null, head: { r: 0.92, y: 0.98, z: 0 }, arm: { r: 0.2, len: 0.0 }, foot: 0.3, tufts: 80, tuftLen: 0.42 }
    : kind === 'mid'
      ? { torso: { r: 0.86, y: 0.92, sy: 1.1, sx: 1.0 }, head: { r: 0.64, y: 1.9, z: 0.22 }, arm: { r: 0.27, len: 0.9 }, foot: 0.33, tufts: 120, tuftLen: 0.44 }
      : { torso: { r: 1.0, y: 1.05, sy: 1.08, sx: 1.18 }, head: { r: 0.66, y: 2.1, z: 0.3 }, arm: { r: 0.4, len: 1.15 }, foot: 0.4, tufts: 170, tuftLen: 0.5 };
  const H = P.head, hy = H.y, hz = H.z, hr = H.r;
  if (P.torso) ball(P.torso.r, 0, P.torso.y, 0, P.torso.sx, P.torso.sy, 0.92, FUR.dark);
  bone = BONE.head; ball(hr, 0, hy, hz, 1.05, 0.98, 1, FUR.mid); bone = BONE.body;
  // chest patch, cream
  if (P.torso) ball(P.torso.r * 0.55, 0, P.torso.y - 0.05, P.torso.r * 0.62, 0.9, 1.0, 0.45, FUR.muzzle);
  // arms hanging at the sides, with claws
  if (P.torso) for (const sx of [-1, 1]) {
    bone = sx < 0 ? BONE.armL : BONE.armR;
    const ax = sx * (P.torso.r * P.torso.sx + P.arm.r * 0.4), ay = P.torso.y + 0.35;
    add(new THREE.SphereGeometry(P.arm.r, 12, 10).scale(1, P.arm.len / P.arm.r * 0.55, 1).translate(ax, ay - P.arm.len * 0.3, 0.12), FUR.mid);
    ball(P.arm.r * 0.95, ax, ay - P.arm.len * 0.75, 0.22, 1, 0.9, 1.05, FUR.mid);
    for (let c = -1; c <= 1; c++) cone(P.arm.r * 0.16, P.arm.r * 0.8, V(c * 0.18, -0.55, 1), V(ax + c * P.arm.r * 0.4, ay - P.arm.len * 0.75 - P.arm.r * 0.25, 0.22 + P.arm.r * 0.9), FUR.nose);
  } else for (const sx of [-1, 1]) { bone = sx < 0 ? BONE.armL : BONE.armR; ball(0.2, sx * 0.88, 0.7, 0.35, 1, 1, 1, FUR.mid); }        // mini: tiny stubby arms
  // feet
  for (const sx of [-1, 1]) { bone = sx < 0 ? BONE.footL : BONE.footR; ball(P.foot, sx * (P.torso ? 0.46 : 0.42), P.foot * 0.8, 0.28, 1.05, 0.8, 1.35, FUR.dark); }
  bone = BONE.body;
  // shaggy fur: many tufts over the torso and head, darker at the root, light at the tips; left clear on the face
  const body = [{ c: V(0, hy, hz), r: hr * 1.02, w: 0.55 }]; if (P.torso) body.push({ c: V(0, P.torso.y, 0), r: P.torso.r * 0.98, w: 1, sx: P.torso.sx });
  for (let i = 0; i < P.tufts; i++) {
    const part = body[rand() < (P.torso ? 0.4 : 1) ? 0 : (body.length - 1)]; bone = part === body[0] ? BONE.head : BONE.body; const u = rand() * 2 - 1, a = rand() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const d = V(Math.cos(a) * rr, u * 0.95, Math.sin(a) * rr);
    if (part === body[0] && d.z > 0.35 && d.y < 0.55) d.z = -d.z;                        // keep the face free
    if (part !== body[0] && d.z > 0.7 && d.y > -0.2) d.z *= -0.4;                        // keep the cream chest free
    const len = P.tuftLen * (0.8 + rand() * 0.6), at = V(part.c.x + d.x * part.r * (part.sx || 1) * 0.92, part.c.y + d.y * part.r * 0.92, part.c.z + d.z * part.r * 0.9);
    cone(0.19 + rand() * 0.1, len, d.clone().add(V(0, 0.45, 0)), at, FUR.mid, FUR.tip, 5);
  }
  bone = BONE.head;                                                                    // ears and the whole face follow the head
  // pointed ears
  for (const sx of [-1, 1]) { cone(0.27, 0.62, V(sx * 0.45, 1, -0.1), V(sx * hr * 0.62, hy + hr * 0.85, hz - 0.05), FUR.mid, FUR.tip, 6); cone(0.14, 0.38, V(sx * 0.45, 1, 0.1), V(sx * hr * 0.6, hy + hr * 0.82, hz + 0.02), FUR.muzzle, FUR.muzzle, 5); }
  // face: muzzle, nose, brows, eyes, mouth and teeth
  const fz = hz + hr * 0.86;
  ball(hr * 0.42, 0, hy - hr * 0.1, fz - 0.04, 1.15, 0.7, 0.7, FUR.muzzle);
  ball(hr * 0.15, 0, hy + hr * 0.02, fz + hr * 0.2, 1.3, 0.9, 1, FUR.nose);
  ball(hr * 0.5, 0, hy - hr * 0.52, fz + 0.02, 1.25, 0.7, 0.6, FUR.mouth);                                      // mouth, open in a snarl
  for (const sx of [-1, 1]) {
    ball(hr * 0.21, sx * hr * 0.37, hy + hr * 0.2, fz - 0.02, 1, 1.1, 0.9, FUR.eye);                          // glossy black eyes
    ball(hr * 0.06, sx * hr * 0.32, hy + hr * 0.29, fz + hr * 0.14, 1, 1, 1, '#ffffff');                       // catchlight
    const brow = new THREE.BoxGeometry(hr * 0.5, hr * 0.14, hr * 0.14); brow.rotateZ(-sx * 0.62); brow.translate(sx * hr * 0.33, hy + hr * 0.44, fz - 0.02); add(brow, FUR.dark);   // angry brows slope down to the middle
  }
  for (let t = -3; t <= 3; t++) cone(hr * 0.075, hr * 0.36, V(0, -1, 0.2), V(t * hr * 0.14, hy - hr * 0.36, fz + hr * 0.22 - Math.abs(t) * 0.025), FUR.tooth, null, 4);   // upper teeth
  for (const t of [-2, -1, 0, 1, 2]) cone(hr * 0.06, hr * 0.26, V(0, 1, 0.2), V(t * hr * 0.17, hy - hr * 0.7, fz + hr * 0.16), FUR.tooth, null, 4);                          // lower teeth
  const sh = P.torso ? V(P.torso.r * P.torso.sx + P.arm.r * 0.4, P.torso.y + 0.35, 0.12) : V(0.88, 0.7, 0.35), fx = P.torso ? 0.46 : 0.42;
  const pivots = {                                                                    // where each bone's joint sits, in the same space as the geometry
    root: V(0, 0, 0), body: V(0, P.torso ? P.torso.y * 0.55 : 0.55, 0), head: V(0, P.torso ? hy - hr * 0.8 : 0.5, P.torso ? hz - 0.1 : 0),
    armL: V(-sh.x, sh.y, sh.z), armR: V(sh.x, sh.y, sh.z), footL: V(-fx, P.foot * 1.1, 0.28), footR: V(fx, P.foot * 1.1, 0.28),
  };
  return { geo: mergeGeometries(list), pivots };
}
/** A fresh bone hierarchy for one critter: root > (body > head, arms), (feet). Returns the bones in BONE order. */
function makeBones(pv) {
  const b = Object.keys(BONE).map(() => new THREE.Bone()), at = (bone, pos, parentPos) => bone.position.copy(pos).sub(parentPos);
  b[BONE.root].position.copy(pv.root);
  at(b[BONE.body], pv.body, pv.root); at(b[BONE.head], pv.head, pv.body); at(b[BONE.armL], pv.armL, pv.body); at(b[BONE.armR], pv.armR, pv.body);
  at(b[BONE.footL], pv.footL, pv.root); at(b[BONE.footR], pv.footR, pv.root);
  b[BONE.root].add(b[BONE.body], b[BONE.footL], b[BONE.footR]); b[BONE.body].add(b[BONE.head], b[BONE.armL], b[BONE.armR]);
  return b;
}
function parts() {
  if (shared.ready) return shared;
  shared.bodies = { small: buildFurry('small'), mid: buildFurry('mid'), big: buildFurry('big') };
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
    const B = S.bodies[critter.tier]; this.bones = makeBones(B.pivots); this.bones[BONE.root].updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);                                   // bind pose = the pose the geometry was built in
    this.body = new THREE.SkinnedMesh(B.geo, this.mat); this.body.castShadow = true; this.body.add(this.bones[BONE.root]); this.body.bind(this.skeleton, new THREE.Matrix4()); this.rig.add(this.body);
    this.shadow = new THREE.Mesh(S.discGeo, S.shadowMat); this.shadow.position.y = 0.03; this.group.add(this.shadow);
    this.markMat = new THREE.MeshBasicMaterial({ color: '#ff6b6b', transparent: true, opacity: 0.8, depthWrite: false });
    this.mark = new THREE.Mesh(S.markGeo, this.markMat); this.mark.position.y = 0.05; this.group.add(this.mark);
    this.tilt = { x: 0, z: 0, vx: 0, vz: 0 }; this.sq = 0; this.sqv = 0; this.flash = 0; this.phase = Math.random() * 6; this.age = 0;      // phase: where in its stride it starts
    this.rest = this.bones.map(b => b.position.clone());                              // the bones' rest positions; the walk offsets from these
    this.walkD = 0; this.speedSm = 0; this.pose = {}; this.arms = { l: 0, lv: 0, r: 0, rv: 0 }; this.stepN = undefined; this.lx = undefined; this.ly = 0; this.apose = {}; this.prevState = undefined;
    this.rig.visible = false; this.shadow.visible = false;
  }
  /** dx,dy: the direction the pellets were travelling. */
  hit(dx, dy, dmg) { const k = Math.min(1, dmg / 12) * 0.9 + 0.1; this.tilt.vx += dy * 6 * k; this.tilt.vz += -dx * 6 * k; this.sqv -= 3 * k; this.flash = 1; }
  respawn() {}
  kill() { this.group.visible = false; }
  dispose() { this.scene.remove(this.group); this.mat.dispose(); this.markMat.dispose(); this.skeleton.dispose(); }
  update(dt, t) {
    const c = this.c, r = c.r; this.age += dt;
    this.group.position.set(c.x, 0, c.y);
    if (c.state === 'warn') {                                                                // a pulsing marker on the ground where it will climb out
      const pulse = 1 + 0.1 * Math.sin(this.age * 14);
      this.mark.visible = true; this.mark.scale.setScalar(r * 1.5 * pulse); this.markMat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.age * 10)); this.rig.visible = false; this.shadow.visible = false; return;
    }
    this.mark.visible = c.state === 'rise'; this.rig.visible = this.shadow.visible = c.state !== 'dead';
    if (c.state === 'rise') { const k = Math.min(1, 1 - c.t / Math.max(0.01, c.riseT)); this.mark.scale.setScalar(r * (1.5 + k * 0.8)); this.markMat.opacity = 0.8 * (1 - k); this.rig.scale.setScalar(r * Math.max(0.05, k)); this.rig.position.y = -(1 - k) * r * 1.2; this.shadow.scale.setScalar(r * 1.15 * k); return; }
    spring(this.tilt, 'x', 'vx', 150, 8, dt); spring(this.tilt, 'z', 'vz', 150, 8, dt);
    spring(this, 'sq', 'sqv', 210, 9, dt);
    // Walking. The stride follows the ground the critter really covers (a blocked or shoved critter does not run on the spot).
    const W = WALK[c.tier], B = this.bones, R = this.rest, mini = c.tier === 'small';
    let dist = 0; if (this.lx !== undefined && dt > 0) dist = Math.min(Math.hypot(c.x - this.lx, c.y - this.ly), (c.speed * 1.6 + 0.5) * dt); this.lx = c.x; this.ly = c.y;
    this.walkD += dist; this.speedSm += (Math.min(1, dt > 0 ? dist / dt / Math.max(c.speed, 0.01) : 0) - this.speedSm) * Math.min(1, dt * 10);
    const x = Math.min(1, Math.max(0, (this.speedSm - 0.15) / 0.5)), m = x * x * (3 - 2 * x);   // 0 standing, 1 walking, eased
    const p = phaseAt(c.tier, this.walkD, this.phase), w = walkPose(c.tier, p, m, this.pose);
    const stepN = Math.floor(p / Math.PI); if (this.stepN !== undefined && stepN !== this.stepN && m > 0.6) this.sqv -= W.thud; this.stepN = stepN;   // a heavy foot landing
    const torso = mini ? B[BONE.head] : B[BONE.body], breath = Math.sin(this.age * 2.3 + this.phase) * 0.012 * (1 - m);
    torso.position.y = R[mini ? BONE.head : BONE.body].y + breath; torso.rotation.set(w.lean + (mini ? w.nod : 0), w.twist, w.roll);
    if (!mini) B[BONE.head].rotation.set(w.nod, -w.twist * 0.6, -w.roll * 0.5);                      // the head sways less than the body and nods each step
    B[BONE.footL].position.set(R[BONE.footL].x, R[BONE.footL].y + w.footLy, R[BONE.footL].z + w.footLz);
    B[BONE.footR].position.set(R[BONE.footR].x, R[BONE.footR].y + w.footRy, R[BONE.footR].z + w.footRz);
    spring(this.arms, 'l', 'lv', W.armK, W.armD, dt, w.armL); spring(this.arms, 'r', 'rv', W.armK, W.armD, dt, w.armR);   // arms follow with weight (the spring is stiff enough to keep up with each size's cadence, softer for the heavy ones)
    B[BONE.armL].rotation.x = this.arms.l; B[BONE.armR].rotation.x = this.arms.r;
    const bounce = Math.abs(Math.sin(p)) * m;
    // Attacking: the attack pose (src/hero/critterAttack.js) takes over from the walk, blended in and out, driven by the logic's wind-up / recover timers.
    let a = 0, lunge = 0, poseSq = 0;
    if (c.state === 'windup' || c.state === 'recover') {
      const k = 1 - c.t / Math.max(1e-6, c.actDur), q = attackPose(c.tier, c.state, k, this.apose); a = attackWeight(c.state, c.actDur - c.t, k);
      const mix = (cur, target) => cur + (target - cur) * a, tremble = c.tier === 'big' && c.state === 'windup' ? Math.sin(this.age * 55) * 0.05 * k : 0;   // the giant's raised fists shake
      torso.rotation.set(mix(torso.rotation.x, q.lean), mix(torso.rotation.y, q.twist), mix(torso.rotation.z, q.roll)); torso.position.y = mix(torso.position.y, R[mini ? BONE.head : BONE.body].y + q.lift);
      if (!mini) B[BONE.head].rotation.set(mix(B[BONE.head].rotation.x, q.head), mix(B[BONE.head].rotation.y, -q.twist * 0.5), mix(B[BONE.head].rotation.z, 0));
      B[BONE.armL].rotation.set(mix(B[BONE.armL].rotation.x, q.armL + tremble), 0, q.armLZ * a); B[BONE.armR].rotation.set(mix(B[BONE.armR].rotation.x, q.armR - tremble), 0, q.armRZ * a);
      for (const f of [BONE.footL, BONE.footR]) B[f].position.set(R[f].x, mix(B[f].position.y, R[f].y + Math.max(0, q.lift) * 0.5), mix(B[f].position.z, R[f].z));   // planted; up on its toes as it rises
      lunge = q.lunge * a; poseSq = q.squash * a;
    } else B[BONE.armL].rotation.z = B[BONE.armR].rotation.z = 0;
    if (this.prevState === 'windup' && c.state === 'recover') this.sqv -= STRIKE_KICK[c.tier];
    this.prevState = c.state;
    this.rig.position.set(Math.sin(c.heading) * lunge, w.hop * r * (1 - a), Math.cos(c.heading) * lunge);
    const sq = this.sq + (1 - bounce) * m * 0.07 * (1 - a) + poseSq;
    this.rig.rotation.set(this.tilt.x, c.heading, this.tilt.z);
    this.rig.scale.set(r * (1 - sq * 0.5), r * (1 + sq), r * (1 - sq * 0.5));
    this.shadow.scale.setScalar(r * 1.15 * (1 - bounce * 0.12));
    this.flash = Math.max(0, this.flash - dt * 8); this.mat.emissiveIntensity = this.flash * 0.85;
  }
}
