// The pistol and the SMG, built from rounded boxes. They replace the authored shotgun on the same gun bone, so the arms keep their hold pose and the
// authored fire kick still moves the gun.
//
// Everything is modelled in the hero's torso space (x left, y up, z forward, origin on the ground under the torso), around where the authored hands
// are: the right hand on the grip at about (0, 0.63, 0.25) and the left hand under the front at about (0, 0.47, 0.81).
//
// Motion done here: a slide or bolt that jumps back on every shot, and a reload that tips the gun, drops the magazine, brings a new one up and
// racks the slide, timed to the same 0..1 progress and stage points (eject .14, grab .28, insert .66, close .84) the sounds already use.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon } from '../engine/stage.js';

const GRIP_PIVOT = new THREE.Vector3(0, 0.63, 0.27);            // the gun tips about the right hand
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const seg = (p, a, b) => (p - a) / (b - a);

function shape(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m;
}
const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cyl = (r, len) => new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2);          // axis along z

const PAL = {
  pistol: { slide: '#aab4c0', frame: '#343840', grip: '#8a5a34', accent: '#ffc83d', dark: '#1f2228', mag: '#2a2d34' },
  smg: { body: '#3d434d', guard: '#2e3239', grip: '#23262c', accent: '#ff8a2a', dark: '#17191d', mag: '#252830' },
};

export function buildWeaponModel(kind) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const T = c => toon(c);
  const muzzle = new THREE.Object3D(); body.add(muzzle);
  let slide, mag, muzzleReach, kickDecay, kickBack;

  if (kind === 'pistol') {
    const P = PAL.pistol, steel = T(P.slide), frame = T(P.frame), wood = T(P.grip), gold = T(P.accent), dark = T(P.dark);
    slide = new THREE.Group(); body.add(slide);
    shape(slide, rbox(0.15, 0.17, 0.9, 0.04), steel, 0, 0.78, 0.79);
    shape(slide, rbox(0.045, 0.025, 0.72, 0.01), gold, 0, 0.872, 0.8);                                      // a stripe down the top
    shape(slide, rbox(0.02, 0.04, 0.035, 0.005), dark, 0, 0.9, 1.17); shape(slide, rbox(0.07, 0.04, 0.035, 0.005), dark, 0, 0.9, 0.38);   // sights
    for (const z of [0.42, 0.47, 0.52]) { shape(slide, rbox(0.157, 0.11, 0.012, 0.004), dark, 0, 0.78, z); }   // grooves at the back of the slide
    shape(body, cyl(0.047, 0.15), dark, 0, 0.78, 1.285);                                                     // the barrel poking out
    shape(body, cyl(0.06, 0.035), gold, 0, 0.78, 1.34);                                                     // muzzle ring
    shape(body, rbox(0.13, 0.1, 0.66, 0.03), frame, 0, 0.665, 0.72);                                       // frame
    shape(body, rbox(0.115, 0.1, 0.2, 0.03), frame, 0, 0.6, 0.82);                                           // the block the support hand holds
    shape(body, rbox(0.12, 0.2, 0.15, 0.03), wood, 0, 0.55, 0.258, 0.2);                                    // grip
    mag = shape(body, rbox(0.108, 0.15, 0.13, 0.025), T(P.mag), 0, 0.41, 0.235, 0.2); shape(mag, rbox(0.116, 0.035, 0.14, 0.01), gold, 0, -0.07, 0);
    shape(body, rbox(0.03, 0.1, 0.03, 0.008), frame, 0, 0.6, 0.47);                                         // trigger guard (front)
    shape(body, rbox(0.03, 0.03, 0.17, 0.008), frame, 0, 0.55, 0.385);                                      // trigger guard (bottom)
    shape(body, rbox(0.025, 0.07, 0.025, 0.006), dark, 0, 0.6, 0.35, 0.25);                                 // trigger
    muzzle.position.set(0, 0.78, 1.37); muzzleReach = 1.37; kickDecay = 13; kickBack = 0.075;
  } else {
    const P = PAL.smg, bodyM = T(P.body), guard = T(P.guard), grip = T(P.grip), orange = T(P.accent), dark = T(P.dark);
    shape(body, rbox(0.145, 0.19, 0.58, 0.04), bodyM, 0, 0.745, 0.5);                                         // receiver
    shape(body, rbox(0.05, 0.03, 0.52, 0.01), dark, 0, 0.86, 0.52);                                          // top rail
    shape(body, cyl(0.03, 0.09), orange, 0, 0.895, 0.62); shape(body, rbox(0.04, 0.03, 0.04, 0.008), dark, 0, 0.88, 0.34);                // a little red-dot sight and a rear sight
    shape(body, rbox(0.135, 0.15, 0.52, 0.035), guard, 0, 0.73, 1.01);                                       // handguard
    for (const x of [-0.069, 0.069]) for (const z of [0.88, 1.0, 1.12]) shape(body, rbox(0.012, 0.055, 0.07, 0.004), dark, x, 0.73, z);   // vents
    shape(body, cyl(0.036, 0.2), dark, 0, 0.74, 1.36); shape(body, cyl(0.048, 0.035), orange, 0, 0.74, 1.46);                                // barrel and muzzle ring
    shape(body, rbox(0.12, 0.3, 0.14, 0.035), grip, 0, 0.54, 0.272, 0.22); shape(body, rbox(0.125, 0.035, 0.145, 0.01), orange, 0, 0.41, 0.2, 0.22);   // grip with a stripe
    mag = shape(body, rbox(0.1, 0.34, 0.12, 0.025), T(P.mag), 0, 0.5, 0.58, -0.1); shape(mag, rbox(0.108, 0.035, 0.13, 0.01), orange, 0, -0.17, 0);
    shape(body, rbox(0.09, 0.22, 0.1, 0.03), grip, 0, 0.6, 0.84);                                           // the vertical foregrip the support hand holds
    shape(body, rbox(0.03, 0.03, 0.17, 0.008), dark, 0, 0.63, 0.42); shape(body, rbox(0.025, 0.07, 0.025, 0.006), dark, 0, 0.64, 0.36, 0.25);  // trigger guard and trigger
    slide = new THREE.Group(); body.add(slide); shape(slide, rbox(0.04, 0.05, 0.13, 0.01), orange, -0.09, 0.78, 0.44);                        // the charging handle: it jumps with every shot
    muzzle.position.set(0, 0.74, 1.48); muzzleReach = 1.48; kickDecay = 24; kickBack = 0.045;
  }

  const magRest = mag.position.clone(), magRot = mag.rotation.x;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  let kick = 0, bodyShown = true;

  return {
    group, muzzle, muzzleReach, kind,
    /** one shot: the slide jumps back */
    kick() { kick = 1; },
    setVisible(vis) { group.visible = vis; },
    /** rl: reload progress 0..1 (or < 0 when not reloading); dt: frame seconds */
    update(dt, rl) {
      kick = Math.max(0, kick - dt * kickDecay);
      let tip = 0, roll = 0, magY = 0, magShow = true, rack = 0;
      if (rl >= 0) {
        const into = smooth(seg(rl, 0, 0.14)), out = 1 - smooth(seg(rl, 0.7, 0.86));
        tip = into * out * 0.5; roll = into * out * 0.45;                                          // tip the gun and cant it toward the body
        if (rl < 0.14) magY = 0;
        else if (rl < 0.32) { const k = seg(rl, 0.14, 0.32); magY = -0.45 * k * k; magShow = k < 0.9; }   // the old magazine drops away
        else if (rl < 0.66) { const k = smooth(seg(rl, 0.34, 0.66)); magY = -0.35 * (1 - k); magShow = rl > 0.34; }   // a new one comes up from below
        rack = rl > 0.84 ? Math.sin(Math.min(1, seg(rl, 0.84, 0.97)) * Math.PI) : 0;                  // rack the slide / charging handle
      }
      // tip about the right hand
      e.set(tip, 0, roll, 'XYZ'); q.setFromEuler(e); v.copy(GRIP_PIVOT).applyQuaternion(q); body.quaternion.copy(q); body.position.copy(GRIP_PIVOT).sub(v);
      mag.position.set(magRest.x, magRest.y + magY * 0.6, magRest.z - Math.min(0, magY) * 0.15); mag.visible = magShow;
      slide.position.z = -kickBack * kick - (kind === 'pistol' ? 0.14 : 0.07) * rack;
    },
  };
}

/**
 * The matrix that carries torso-space coordinates into the local space of the authored `gunRoot` bone, whose axes are measured from the rig:
 * local x = -torso x, local y = torso z (forward), local z = torso y (up), origin at the bone's rest position (0, 0.712, 0.62).
 */
export function torsoToGunRoot() {
  const m = new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  return m.multiply(new THREE.Matrix4().makeTranslation(0, -0.712, -0.62));
}
