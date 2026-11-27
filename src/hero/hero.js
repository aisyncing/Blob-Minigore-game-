// The shared hero rig. Any design from designs.js plugs into this, so they all move identically.
//
//   legs  : face the way you walk, feet swing from distance travelled
//   torso : faces the way you aim (twin-stick), carries the body and the authored arms/gun rig
//   pivot : inside the torso, leans into motion and squashes/stretches on acceleration
//   rig   : arms, hands, shotgun and shells from Blender; three clips (hold, fire, reload) are scrubbed each frame
import * as THREE from 'three';
import { angDiff, smooth } from '../game/movement.js';
import { buildShell } from './gun.js';
import { cloneRig } from './rigAsset.js';
import { reloadPose, crossed, smooth as ease } from './reload.js';
import { toon, clamp, R2 } from '../engine/stage.js';

const _v = new THREE.Vector3();

export class Hero {
  constructor(design, stage, fx, rig) {
    this.d = design.build(); this.key = design.key; this.fx = fx; this.meta = rig.meta; this.scene = stage.scene; this.damage = 0; this.lostHat = null; this.bandage = null;
    this.root = new THREE.Group(); stage.scene.add(this.root);
    this.legs = new THREE.Group(); this.root.add(this.legs); for (const f of this.d.feet) this.legs.add(f);
    this.torso = new THREE.Group(); this.root.add(this.torso);
    this.pivot = new THREE.Group(); this.torso.add(this.pivot); this.pivot.add(this.d.body);
    // authored arms + shotgun + shells; the three clips are scrubbed by hand so they stay locked to the gun's real state
    this.rig = cloneRig(rig, this.d.armColor); this.torso.add(this.rig);
    this.mixer = new THREE.AnimationMixer(this.rig); this.act = {};
    for (const name of ['hold', 'fire', 'reload']) { const a = this.mixer.clipAction(rig.clips[name]); a.play(); a.paused = true; a.setEffectiveWeight(name === 'hold' ? 1 : 0); this.act[name] = a; }
    this.dur = { hold: rig.clips.hold.duration, fire: rig.clips.fire.duration, reload: rig.clips.reload.duration };
    this.muzzleBone = this.rig.getObjectByName('muzzle'); this.chamberBones = [this.rig.getObjectByName('chamberL'), this.rig.getObjectByName('chamberR')];
    this.muzzleReach = this.meta.muzzle_fwd; this.fireT = 99; this.wReload = 0;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: '#050a08', transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.03; this.root.add(this.shadow);
    // belt of spare shells around the waist; the free hand fetches from the left-front slots during a reload
    this.belt = new THREE.Group(); this.belt.position.y = this.d.belt.y; this.pivot.add(this.belt);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(this.d.belt.r, 0.045, 6, 30), toon('#6b4426')); strap.rotation.x = Math.PI / 2; strap.castShadow = true; this.belt.add(strap);
    this.beltShells = [];
    for (let i = 0; i < 8; i++) { const a = (-105 + i * 30) * Math.PI / 180, sh = buildShell(0.8); sh.position.set(Math.sin(a) * (this.d.belt.r + 0.03), -0.06, Math.cos(a) * (this.d.belt.r + 0.03)); sh.rotation.set(0, 0, 0); this.belt.add(sh); this.beltShells.push({ sh, a }); }
    this.beltGrabAngle = this.meta.belt_grab_angle;                              // left-front: where the authored hand reaches
    this.beltShells.forEach(b => { b.near = Math.abs(b.a - this.beltGrabAngle); });
    this.beltByReach = [...this.beltShells].sort((a, b) => a.near - b.near);        // the free hand takes shells from the front of this list
    // the two carried shells in the rig: A goes to chamber 0 (L), B to chamber 1 (R); only the ones this reload needs are drawn
    this.carried = [null, null]; this.rig.traverse(o => { if (o.isBone) return; const m = /^shell([AB])(_\d+)?$/.exec(o.name); if (m) this.carried[m[1] === 'A' ? 0 : 1] = o; });   // the loader renames the meshes' parent groups (shellA_1)
    if (!this.carried[0] || !this.carried[1]) throw new Error('hero rig: carried shells not found');
    this.reloadPrev = -1; this.onReloadStage = null;
    // animation state
    this.legYaw = Math.PI; this.aimYaw = Math.PI; this.phase = 0; this.stepN = 0; this.t = Math.random() * 10;
    this.s = 0; this.sv = 0; this.prevSpeed = 0; this.accSm = 0; this.lag = { x: 0, z: 0, vx: 0, vz: 0 };
    this.blinkT = 2; this.blinkHold = 0; this.onStep = null;
    this.setVisible(false);
  }
  setVisible(v) { this.root.visible = v; }
  /**
   * How battered the hero looks: 0 healthy, 1 lost the head piece (it flies off and lies on the ground), 2 and up bandaged as well.
   * Going down plays the loss; going back to 0 restores everything (a new run).
   */
  setDamage(level) {
    const prev = this.damage; this.damage = level; const acc = this.d.accessory;
    if (level >= 1 && prev < 1 && acc) this.popHat();
    if (level < 1) { if (acc) acc.visible = true; if (this.lostHat) { this.lostHat.mesh.removeFromParent(); this.lostHat = null; } }
    if (level >= 2 && !this.bandage) this.bandage = this.makeBandage();
    if (this.bandage) this.bandage.visible = level >= 2;
  }
  popHat() {
    const acc = this.d.accessory; acc.updateWorldMatrix(true, false);
    const mesh = acc.clone(true); mesh.matrix.copy(acc.matrixWorld); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); mesh.matrixAutoUpdate = true; this.scene.add(mesh);
    acc.visible = false;
    if (this.lostHat) this.lostHat.mesh.removeFromParent();
    const a = Math.random() * Math.PI * 2;
    this.lostHat = { mesh, vx: Math.cos(a) * 2.4, vy: 5.5, vz: Math.sin(a) * 2.4, spin: (Math.random() < 0.5 ? -1 : 1) * 9, age: 0 };
  }
  /** a plaster across the head, placed relative to the right eye so it sits on whichever body this design has */
  makeBandage() {
    const eye = this.d.look.reduce((a, b) => (b.position.x > a.position.x ? b : a)), g = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.1), toon('#f4ecd8')), pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.115), toon('#d98a8a'));
    for (const m of [cloth, pad]) { m.castShadow = true; g.add(m); }
    g.position.set(eye.position.x * 0.95, eye.position.y + 0.3, eye.position.z - 0.08); g.rotation.set(-0.25, 0.25, 0.55);
    eye.parent.add(g); return g;
  }
  /** the dropped hat: a short arc, a bounce, then it lies there for a while */
  updateFx(dt) {
    const h = this.lostHat; if (!h) return;
    h.age += dt; const m = h.mesh;
    if (m.position.y > 0.06 || h.vy > 0) {
      h.vy -= 16 * dt; m.position.x += h.vx * dt; m.position.y += h.vy * dt; m.position.z += h.vz * dt; m.rotation.y += h.spin * dt; m.rotation.x += h.spin * 0.4 * dt;
      if (m.position.y <= 0.06 && h.vy < 0) { m.position.y = 0.06; if (h.vy < -2) { h.vy *= -0.3; h.vx *= 0.5; h.vz *= 0.5; h.spin *= 0.4; } else { h.vy = 0; h.vx = h.vz = 0; h.spin = 0; m.rotation.x = 0.15; } }
    }
    if (h.age > 12) { m.removeFromParent(); this.lostHat = null; }
  }
  get radius() { return this.d.radius; }

  /**
   * s: { x, y, vx, vy, speed, aimYaw|null }, p: tuning (maxSpeed, aimFollow, legsFollow, squash, lean, bob, stepLen)
   * Positions are world X and world Z (called y in the 2D sim).
   */
  update(dt, s, p) {
    this.t += dt;
    const moving = s.speed > 0.6, moveYaw = Math.atan2(s.vx, s.vy);
    if (moving) this.legYaw += angDiff(this.legYaw, moveYaw) * smooth(p.legsFollow, dt);
    const aimTarget = s.aimYaw ?? (moving ? moveYaw : this.aimYaw);
    this.aimYaw += angDiff(this.aimYaw, aimTarget) * smooth(p.aimFollow, dt);

    // squash and stretch from acceleration, an underdamped spring so it wobbles back like jelly
    const speedF = clamp(s.speed / p.maxSpeed, 0, 1);
    const acc = dt > 0 ? (s.speed - this.prevSpeed) / dt : 0; this.prevSpeed = s.speed;
    this.accSm += (acc - this.accSm) * smooth(14, dt);
    const target = -this.accSm * 0.0022 * p.squash;
    this.sv += (220 * (target - this.s) - 11 * this.sv) * dt; this.s = clamp(this.s + this.sv * dt, -0.3, 0.3);
    // velocity lag: where the body "wants" to lean, with overshoot
    const L = this.lag; L.vx += (170 * (s.vx - L.x) - 8.5 * L.vx) * dt; L.x += L.vx * dt; L.vz += (170 * (s.vy - L.z) - 8.5 * L.vz) * dt; L.z += L.vz * dt;
    const ca = Math.cos(this.aimYaw), sa = Math.sin(this.aimYaw);
    const lx = L.x * ca - L.z * sa, lz = L.x * sa + L.z * ca;       // lag in torso-local axes (+x = character's left)

    // walk cycle: one step every stepLen units, so feet never skate
    this.phase += Math.PI * s.speed * dt / p.stepLen;
    const n = Math.floor(this.phase / Math.PI);
    if (n !== this.stepN) { this.stepN = n; if (speedF > 0.15) this.#footfall(n & 1, speedF); this.sv -= 0.5 * speedF * p.squash; }
    const bob = Math.abs(Math.sin(this.phase)) * 0.07 * speedF * p.bob;
    const breath = Math.sin(this.t * 2.3) * 0.012 * (1 - speedF);

    this.root.position.set(s.x, 0, s.y);
    this.legs.rotation.y = this.legYaw; this.torso.rotation.y = this.aimYaw;
    this.pivot.position.y = bob;
    this.pivot.rotation.x = clamp(lz * 0.026 * p.lean, -0.3, 0.3); this.pivot.rotation.z = clamp(-lx * 0.026 * p.lean, -0.3, 0.3);
    this.pivot.scale.set(1 - this.s * 0.55, (1 + this.s) * (1 + breath), 1 - this.s * 0.55);
    this.d.feet.forEach((f, i) => {
      const side = i === 0 ? -1 : 1, ph = this.phase + (i === 0 ? 0 : Math.PI);
      f.position.x = side * this.d.footX; f.position.z = (f.userData.z0 ??= f.position.z) + Math.sin(ph) * 0.4 * speedF; f.position.y = (f.userData.y0 ??= f.position.y) + Math.max(0, Math.cos(ph)) * 0.17 * speedF;
    });
    // blink and look
    this.blinkT -= dt; if (this.blinkT < 0) { this.blinkHold = 0.13; this.blinkT = R2(2, 4.5); } this.blinkHold = Math.max(0, this.blinkHold - dt);
    for (const m of this.d.blink) { m.userData.sy ??= m.scale.y; m.scale.y = m.userData.sy * (this.blinkHold > 0 ? 0.1 : 1); }
    this.d.secondary(dt, this.t, { lx, lz, speedF });

    // arms + gun: scrub the authored clips. Reload progress comes straight from the gun's state, so animation, sounds and ammo never drift apart.
    const rl = s.reload ?? -1, pose = reloadPose(rl);
    const need = s.spent ?? [true, true], needN = (need[0] ? 1 : 0) + (need[1] ? 1 : 0);     // which chambers are empty: that is all this reload ejects, fetches and loads
    for (const stage of crossed(this.reloadPrev, rl)) this.#reloadStage(stage, need);
    this.reloadPrev = rl;
    this.fireT += dt;
    this.wReload += ((rl >= 0 ? 1 : 0) - this.wReload) * smooth(40, dt);                       // blend in/out over a few frames; the poses match at both ends anyway
    const wFire = this.fireT < this.dur.fire ? 1 : 0, wR = this.wReload, wF = (1 - wR) * wFire, wH = 1 - wR - wF;
    const set = (name, w, t) => { const a = this.act[name]; a.setEffectiveWeight(Math.max(0, w)); a.time = clamp(t, 0, this.dur[name] - 1e-3); };
    set('reload', wR, Math.max(0, rl) * this.dur.reload); set('fire', wF, this.fireT); set('hold', wH, ((this.t % this.dur.hold) + this.dur.hold) % this.dur.hold);
    this.mixer.update(0);
    this.rig.position.y = bob * 0.5;
    this.handShellsHidden = !pose.shellsInHand;
    this.carried.forEach((c, i) => { if (c) c.visible = !!need[i]; });
    const taken = this.beltByReach.slice(0, needN);
    for (const b of this.beltShells) b.sh.visible = !(pose.beltTaken && taken.includes(b));
    this.shadow.scale.setScalar(1 + this.s * 0.2);
  }

  #footfall(side, speedF) {
    const f = this.d.feet[side]; this.legs.updateMatrixWorld(true); this.legs.localToWorld(_v.set(f.position.x, 0, f.userData.z0 ?? 0));
    this.fx?.dust(_v.x, _v.z, Math.sin(this.legYaw), Math.cos(this.legYaw), speedF * 0.7);
    this.onStep?.(side, speedF);
  }

  #reloadStage(stage, need) {
    if (stage === 'eject') {
      this.root.updateMatrixWorld(true); const cos = Math.cos(this.aimYaw), sin = Math.sin(this.aimYaw);
      for (let i = 0; i < 2; i++) {
        if (!need[i]) continue;
        const w = this.chamberBones[i].getWorldPosition(new THREE.Vector3()), side = i === 0 ? -1 : 1;     // chambers pop up and out to either side, then tumble to the ground
        this.fx?.casing(w.x, w.y, w.z, -cos * side * R2(0.8, 1.6) + sin * R2(-1.4, -0.4), R2(4, 5.5), sin * side * R2(0.8, 1.6) + cos * R2(-1.4, -0.4));
      }
    }
    this.onReloadStage?.(stage, this);
  }

  /** Pull the trigger visually: plays the authored fire clip (recoil of gun and arms). */
  fire() { this.fireT = 0; }

  /**
   * Put the visible hero exactly where the simulation says it is, aimed along `yaw`, right now. Called at the instant of firing so the gun,
   * the muzzle flash and the pellet origin all come from the same pose (the torso normally eases toward the aim over a few frames,
   * and the body is only moved once per rendered frame).
   */
  snapAim(x, y, yaw) { this.aimYaw = yaw; this.root.position.set(x, 0, y); this.torso.rotation.y = yaw; this.root.updateMatrixWorld(true); }

  /** World position of the muzzle (where the pellets and the flash start). */
  muzzleWorld(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.muzzleBone.getWorldPosition(out); }
}
