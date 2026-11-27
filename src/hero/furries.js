// The Furries: shaggy brown monsters in three sizes (Mini ~0.6 m, Furry ~1.5 m, Giant ~3 m) plus the darker Charger.
// Look and animation only; behaviour lives in src/game/crowd.js.
//
// Every furry is one rig drawn from instanced parts (body with face, jaw, eyes, brows, ears, arms, legs), so a crowd of 100+ costs
// a dozen draw calls. Each part is posed per enemy per frame from the crowd state:
//   gaits    Mini hops (stretch in the air, squash on landing, arms flail), Furry waddles (body rolls onto the planted foot, arms
//            swing against the legs), Giant stomps (heavy roll, dip and squash on each footfall, dust and a little camera shake),
//            Charger scurries low with its arms swept back
//   attacks  windup (rears back, arms overhead, mouth wide, brows down), strike (lunges, arms slam, jaw snaps shut), recover (panting)
//   life     breathing, blinking, ear twitches, chomping that gets faster as it nears you, banking into turns, fur that trails
//            behind the motion and jiggles (a vertex shader bends each tuft by its tip weight)
//   hits     white flash, squint, recoil away from the shot, a puff of fur; death inflates, then bursts into tufts and a splat
//   spawn    a dirt mound swells and shakes at the spot, then the furry digs its way out
import * as THREE from 'three';
import { toon, R2 } from '../engine/stage.js';
import { tierOf, EMERGE } from '../game/crowd.js';

const CAP = 280, TAU = Math.PI * 2;
const C = (h) => new THREE.Color(h);
const PAL = {
  furDark: C('#3f1c0c'), fur: C('#7a3a1a'), furMid: C('#94491f'), furTip: C('#c8783c'), face: C('#6e3418'),
  muzzle: C('#c28a5e'), nose: C('#170f0c'), claw: C('#221611'), mouth: C('#5a1216'), mouthDeep: C('#2a0608'),
  tongue: C('#b0404a'), tooth: C('#f3e8cb'), eye: C('#080606'), shine: C('#ffffff'), earIn: C('#4e2210'),
};
export const FUR_SPLAT = '#5c1414';

/* ------------------------------------------------------------------ geometry builder ------------------------------------------------------------------ */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function mulberry(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.tip = []; this.fur = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(p, n, col, tip = 0, fur = 0) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(col.r, col.g, col.b); this.tip.push(tip); this.fur.push(fur); return this.count - 1; }
  /** ellipsoid at c with radii r; col is a Color or (normal) => Color; shade darkens the underside */
  ellipsoid(c, r, col, { ws = 16, hs = 12, fur = 0, shade = 0.25, tip = 0 } = {}) {
    const base = this.count;
    for (let j = 0; j <= hs; j++) {
      const v = j / hs, th = v * Math.PI, sy = Math.cos(th), sr = Math.sin(th);
      for (let i = 0; i <= ws; i++) {
        const u = i / ws, ph = u * TAU, d = V(Math.sin(ph) * sr, sy, Math.cos(ph) * sr);
        const p = V(c.x + d.x * r.x, c.y + d.y * r.y, c.z + d.z * r.z), n = V(d.x / r.x, d.y / r.y, d.z / r.z).normalize();
        const k = 1 - shade + shade * (n.y * 0.5 + 0.5), cc = (typeof col === 'function' ? col(d) : col).clone().multiplyScalar(k);
        this.vert(p, n, cc, tip, fur);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = base + j * (ws + 1) + i, b = a + ws + 1; this.i.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  /** a tuft of fur: a bent cone from the skin out to a point; vertex tip weight 0 → 1 drives the sway shader */
  tuft(base, dir, len, rad, nrm, c0, c1, droop = 0.05, sides = 5) {
    const d = dir.clone().normalize(), a = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0), u = a.clone().cross(d).normalize(), w = d.clone().cross(u);
    const mid = base.clone().addScaledVector(d, len * 0.5).add(V(0, -droop * 0.35, 0)), tipP = base.clone().addScaledVector(d, len).add(V(0, -droop, 0));
    const cm = c0.clone().lerp(c1, 0.55), b0 = this.count;
    for (const [ctr, rr, col, tw] of [[base, rad, c0, 0], [mid, rad * 0.55, cm, 0.5]]) {
      for (let s = 0; s < sides; s++) {
        const an = s / sides * TAU, rd = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(w, Math.sin(an));
        this.vert(ctr.clone().addScaledVector(rd, rr), nrm.clone().multiplyScalar(0.75).addScaledVector(rd, 0.25).normalize(), col, tw, 1);
      }
    }
    const t = this.vert(tipP, nrm, c1, 1, 1);
    for (let s = 0; s < sides; s++) { const s1 = (s + 1) % sides, a0 = b0 + s, a1 = b0 + s1, m0 = b0 + sides + s, m1 = b0 + sides + s1; this.i.push(a0, m0, a1, a1, m0, m1, m0, t, m1); }
  }
  /** a sharp cone (tooth, claw, ear): width along wAxis, thinner across it */
  spike(base, dir, len, rad, col, { sides = 4, thin = 0.5, wAxis = V(1, 0, 0), tip = 0, fur = 0, colTip = col } = {}) {
    const d = dir.clone().normalize(), u = wAxis.clone().addScaledVector(d, -wAxis.dot(d)).normalize(), w = d.clone().cross(u), b0 = this.count;
    for (let s = 0; s < sides; s++) {
      const an = s / sides * TAU + Math.PI / sides, rd = u.clone().multiplyScalar(Math.cos(an) * rad).addScaledVector(w, Math.sin(an) * rad * thin);
      this.vert(base.clone().add(rd), rd.clone().normalize().addScaledVector(d, 0.3).normalize(), col, 0, fur);
    }
    const t = this.vert(base.clone().addScaledVector(d, len), d, colTip, tip, fur);
    for (let s = 0; s < sides; s++) this.i.push(b0 + s, b0 + (s + 1) % sides, t);
    const cb = this.vert(base, d.clone().negate(), col, 0, fur);                      // cap the base so it reads from any angle
    for (let s = 0; s < sides; s++) this.i.push(b0 + (s + 1) % sides, b0 + s, cb);
  }
  build(offset = V(0, 0, 0)) {
    const g = new THREE.BufferGeometry(), p = new Float32Array(this.p);
    for (let k = 0; k < p.length; k += 3) { p[k] -= offset.x; p[k + 1] -= offset.y; p[k + 2] -= offset.z; }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aTip', new THREE.Float32BufferAttribute(this.tip, 1)); g.setAttribute('aFur', new THREE.Float32BufferAttribute(this.fur, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); return g;
  }
}
const jitter = (col, rnd, amt = 0.12) => col.clone().multiplyScalar(1 - amt + rnd() * amt * 2);

/* The canonical furry is about 1.1 units tall, facing +z, feet on y = 0. Parts are built where they sit, then moved to their pivot. */
const BODY_C = V(0, 0.52, 0), BODY_R = V(0.40, 0.42, 0.37);
const FACE_DIR = V(0, 0.1, 1).normalize();
const RIG = {
  hip: { x: 0.16, y: 0.2, z: 0 }, shoulder: { x: 0.43, y: 0.6, z: 0.02 }, eye: { x: 0.13, y: 0.635, z: 0.3 }, brow: { x: 0.13, y: 0.712, z: 0.29 },
  ear: { x: 0.25, y: 0.86, z: -0.02 }, jaw: { x: 0, y: 0.47, z: 0.2 },
};
const mouthZ = (x, cz, rz, rx) => cz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));

function buildBody() {
  const g = new Geo(), rnd = mulberry(7);
  g.ellipsoid(BODY_C, BODY_R.clone().multiplyScalar(0.97), d => (d.dot(FACE_DIR) > 0.72 ? PAL.face : PAL.furDark), { fur: 1, shade: 0.35 });
  const N = 360;
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + 0.5) / N, rr = Math.sqrt(1 - y * y), ph = i * 2.399963;
    const d = V(Math.cos(ph) * rr, y, Math.sin(ph) * rr), face = d.dot(FACE_DIR);
    if (face > 0.76 || y < -0.8) continue;
    const p = V(BODY_C.x + d.x * BODY_R.x * 0.95, BODY_C.y + d.y * BODY_R.y * 0.95, BODY_C.z + d.z * BODY_R.z * 0.95), n = V(d.x / BODY_R.x, d.y / BODY_R.y, d.z / BODY_R.z).normalize();
    let len = R2v(rnd, 0.15, 0.24), rad = R2v(rnd, 0.05, 0.068), droop = R2v(rnd, 0.06, 0.11), dir = n.clone().add(V(0, y < 0.2 ? -0.9 : -0.55, 0));
    if (y > 0.68) { dir = n.clone().add(V(R2v(rnd, -0.5, 0.5), 0.35, R2v(rnd, -0.5, 0.3))); len = R2v(rnd, 0.2, 0.3); droop = 0.02; }   // a messy crown
    if (face > 0.58) { len *= 0.55; rad *= 0.8; dir = n.clone().add(V(0, -0.3, 0)); }                                                   // short cheek fur ringing the face
    const shade = 0.7 + 0.3 * (y * 0.5 + 0.5);
    g.tuft(p, dir, len, rad, n, jitter(PAL.fur.clone().lerp(PAL.furDark, 0.35), rnd).multiplyScalar(shade), jitter(rnd() < 0.3 ? PAL.furMid : PAL.furTip, rnd, 0.14).multiplyScalar(0.85 + 0.15 * shade), droop);
  }
  // face: snout over a wide open mouth, a black nose, a row of upper fangs
  g.ellipsoid(V(0, 0.405, 0.305), V(0.205, 0.105, 0.085), d => PAL.mouth.clone().lerp(PAL.mouthDeep, Math.max(0, 1 - Math.hypot(d.x, d.y) * 1.3)), { shade: 0 });
  g.ellipsoid(V(0, 0.535, 0.302), V(0.205, 0.08, 0.095), PAL.muzzle, { fur: 0.6, shade: 0.3 });
  g.ellipsoid(V(0, 0.578, 0.388), V(0.062, 0.04, 0.042), PAL.nose, { shade: 0.1 });
  g.ellipsoid(V(0.02, 0.592, 0.418), V(0.016, 0.009, 0.01), PAL.shine, { ws: 6, hs: 4, shade: 0 });
  const up = [[-0.165, 0.045], [-0.12, 0.085], [-0.062, 0.055], [0, 0.062], [0.062, 0.055], [0.12, 0.085], [0.165, 0.045]];
  for (const [x, len] of up) g.spike(V(x, 0.492, mouthZ(x, 0.305, 0.085, 0.205) - 0.006), V(0, -1, -0.08), len, len > 0.07 ? 0.03 : 0.025, PAL.tooth, { thin: 0.45, wAxis: V(1, 0, -x * 1.6) });
  return g.build();
}
function buildJaw() {
  const g = new Geo(), rnd = mulberry(11), P = V(RIG.jaw.x, RIG.jaw.y, RIG.jaw.z);
  g.ellipsoid(V(0, 0.315, 0.29), V(0.19, 0.065, 0.095), PAL.muzzle, { fur: 0.6, shade: 0.3 });
  g.ellipsoid(V(0, 0.352, 0.338), V(0.11, 0.028, 0.06), PAL.tongue, { shade: 0.2, ws: 10, hs: 6 });
  const lo = [[-0.15, 0.04], [-0.1, 0.07], [-0.04, 0.05], [0.04, 0.05], [0.1, 0.07], [0.15, 0.04]];
  for (const [x, len] of lo) g.spike(V(x, 0.335, mouthZ(x, 0.29, 0.095, 0.19) - 0.012), V(0, 1, -0.06), len, len > 0.06 ? 0.027 : 0.022, PAL.tooth, { thin: 0.45, wAxis: V(1, 0, -x * 1.6) });
  for (let i = 0; i < 9; i++) { const x = -0.16 + i * 0.04, z = mouthZ(x, 0.27, 0.09, 0.2); g.tuft(V(x, 0.28, z), V(0, -1, 0.35), R2v(rnd, 0.07, 0.11), 0.04, V(0, -0.3, 1).normalize(), jitter(PAL.fur, rnd), jitter(PAL.furTip, rnd), 0.02); }
  return g.build(P);
}
function buildEye() {
  const g = new Geo();
  g.ellipsoid(V(0, 0, 0), V(0.068, 0.074, 0.05), PAL.eye, { shade: 0.15 });
  g.ellipsoid(V(0.022, 0.028, 0.044), V(0.018, 0.018, 0.01), PAL.shine, { ws: 8, hs: 6, shade: 0 });
  g.ellipsoid(V(-0.02, -0.022, 0.046), V(0.008, 0.008, 0.006), PAL.shine, { ws: 6, hs: 4, shade: 0 });
  return g.build();
}
function buildBrow() {
  const g = new Geo(), rnd = mulberry(5);
  g.ellipsoid(V(0, 0, 0), V(0.095, 0.034, 0.045), PAL.furDark, { fur: 1, ws: 10, hs: 6 });
  for (let i = 0; i < 6; i++) { const x = -0.08 + i * 0.032; g.tuft(V(x, 0.01, 0.02), V(x * 1.5, -0.32, 1), R2v(rnd, 0.08, 0.12), 0.034, V(0, 0.4, 1).normalize(), PAL.furDark.clone(), jitter(PAL.fur, rnd), 0.02, 4); }
  return g.build();
}
function buildEar() {
  const g = new Geo(), rnd = mulberry(3);
  g.spike(V(0, 0, 0), V(0, 1, -0.1), 0.17, 0.085, PAL.fur, { sides: 6, thin: 0.55, fur: 1, tip: 0.8, colTip: PAL.furTip });
  g.spike(V(0, 0.01, 0.03), V(0, 1, -0.05), 0.12, 0.05, PAL.earIn, { sides: 5, thin: 0.35, fur: 1, tip: 0.6 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.tuft(V(Math.cos(a) * 0.06, 0, Math.sin(a) * 0.04), V(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.3), 0.1, 0.035, V(Math.cos(a), 0.5, Math.sin(a)).normalize(), PAL.fur.clone(), jitter(PAL.furTip, rnd), 0.01, 4); }
  return g.build();
}
function buildArm() {
  const g = new Geo(), rnd = mulberry(13);
  g.ellipsoid(V(0, -0.22, 0), V(0.085, 0.26, 0.085), PAL.furDark, { fur: 1 });
  for (let i = 0; i < 48; i++) {
    const t = i / 48, y = -0.02 - 0.42 * t, a = rnd() * TAU, rd = V(Math.cos(a), 0, Math.sin(a));
    g.tuft(V(rd.x * 0.08, y, rd.z * 0.08), rd.clone().multiplyScalar(0.8).add(V(0, -0.9, 0)), R2v(rnd, 0.11, 0.17) * (1.15 - t * 0.3), R2v(rnd, 0.05, 0.06), rd, jitter(PAL.fur, rnd), jitter(rnd() < 0.3 ? PAL.furMid : PAL.furTip, rnd), 0.03);
  }
  g.ellipsoid(V(0, -0.47, 0.02), V(0.09, 0.07, 0.09), PAL.fur, { fur: 1 });
  for (const x of [-0.045, 0, 0.045]) g.spike(V(x, -0.5, 0.07), V(x * 2, -0.65, 1), 0.08, 0.019, PAL.claw, { sides: 4, thin: 0.8 });
  return g.build();
}
function buildLeg() {
  const g = new Geo(), rnd = mulberry(17);
  g.ellipsoid(V(0, -0.08, 0), V(0.095, 0.11, 0.095), PAL.furDark, { fur: 1 });
  for (let i = 0; i < 16; i++) { const a = rnd() * TAU, rd = V(Math.cos(a), 0, Math.sin(a)); g.tuft(V(rd.x * 0.08, -0.02 - rnd() * 0.08, rd.z * 0.08), rd.clone().multiplyScalar(0.6).add(V(0, -1, 0)), R2v(rnd, 0.08, 0.12), 0.05, rd, jitter(PAL.fur, rnd), jitter(PAL.furTip, rnd), 0.02, 4); }
  g.ellipsoid(V(0, -0.175, 0.045), V(0.1, 0.045, 0.125), PAL.furDark, { fur: 1 });
  for (const x of [-0.045, 0, 0.045]) g.spike(V(x, -0.185, 0.155), V(0, -0.35, 1), 0.045, 0.016, PAL.claw, { sides: 4, thin: 0.8 });
  return g.build();
}
function buildMound() {
  const g = new Geo(), rnd = mulberry(23), dirt = C('#5e4029'), dirt2 = C('#7a5638');
  g.ellipsoid(V(0, 0, 0), V(1, 0.34, 1), d => (rnd() < 0.5 ? dirt : dirt2).clone().multiplyScalar(0.8 + rnd() * 0.3), { ws: 14, hs: 8, shade: 0.4 });
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU, r = 0.75 + rnd() * 0.5; g.ellipsoid(V(Math.cos(a) * r, 0.05, Math.sin(a) * r), V(0.14, 0.09, 0.12).multiplyScalar(0.7 + rnd() * 0.8), jitter(dirt, rnd, 0.2), { ws: 6, hs: 4 }); }
  return g.build();
}
function R2v(rnd, a, b) { return a + rnd() * (b - a); }

/* ------------------------------------------------------------------ material: toon + fur sway + tint + hit flash ------------------------------------------------------------------ */
function furMaterial(time) {
  const m = toon('#ffffff', { vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTip; attribute float aFur; attribute float aFlash; attribute vec3 aTint; attribute vec3 aDrag;\nuniform float uTime; varying float vFlash;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n vColor.rgb *= mix(vec3(1.0), aTint, aFur);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = sin(uTime * 5.3 + position.x * 23.0 + position.y * 17.0 + position.z * 11.0);
        transformed += (aDrag + vec3(sw * 0.012, sw * 0.004, sw * 0.008)) * aTip * aTip;
        vFlash = aFlash;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.97, 0.93), vFlash);');
  };
  m.customProgramCacheKey = () => 'furry-v1';
  return m;
}

/* ------------------------------------------------------------------ per-size proportions ------------------------------------------------------------------ */
// 0 Mini, 1 Furry, 2 Giant, 3 Charger.  arm/leg: scale of the limb; eye: eye size; brow: resting anger; lean: resting hunch; tint: coat
const LOOK = [
  { body: [1.07, 0.96], arm: [0.95, 0.82, 0.95], shoulderY: 0.55, leg: [0.85, 0.8, 0.85], eye: 1.5, brow: 0.12, lean: 0.0, ear: 1.1, tint: [1, 1, 1] },
  { body: [1.0, 1.0], arm: [1.05, 1.12, 1.05], shoulderY: 0.6, leg: [1, 1, 1], eye: 1.0, brow: 0.35, lean: 0.05, ear: 1, tint: [1, 1, 1] },
  { body: [1.05, 1.0], arm: [1.35, 1.22, 1.35], shoulderY: 0.63, leg: [1.25, 1.0, 1.25], eye: 0.82, brow: 0.5, lean: 0.14, ear: 0.85, tint: [0.92, 0.9, 0.88] },
  { body: [0.95, 0.92], arm: [0.9, 0.95, 0.9], shoulderY: 0.58, leg: [0.9, 0.95, 0.9], eye: 1.1, brow: 0.55, lean: 0.25, ear: 1.35, tint: [0.62, 0.42, 0.38] },
];
const lookOf = (e) => LOOK[e.kind === 'zip' ? 3 : e.tier];
const ease = { outBack: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; }, outCubic: t => 1 - (1 - t) ** 3, inQuad: t => t * t };
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const frac = v => v - Math.floor(v);

export function createFurries(scene, fx) {
  const group = new THREE.Group(); scene.add(group);
  const time = { value: 0 }, mat = furMaterial(time);
  const part = (geo, per) => {
    const n = CAP * per, m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0;
    const flash = new THREE.InstancedBufferAttribute(new Float32Array(n), 1), tint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3), drag = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [flash, tint, drag]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlash', flash); geo.setAttribute('aTint', tint); geo.setAttribute('aDrag', drag);
    group.add(m); return { m, flash, tint, drag, per };
  };
  const P = { body: part(buildBody(), 1), jaw: part(buildJaw(), 1), eye: part(buildEye(), 2), brow: part(buildBrow(), 2), ear: part(buildEar(), 2), arm: part(buildArm(), 2), leg: part(buildLeg(), 2) };
  const shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#050a08', transparent: true, opacity: 0.34, depthWrite: false }), CAP);
  shadow.frustumCulled = false; shadow.count = 0; group.add(shadow);

  const _root = new THREE.Matrix4(), _body = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _out = new THREE.Matrix4(), _off = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'ZYX'), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const local = (px, py, pz, rx, ry, rz, sx, sy, sz, order = 'ZYX') => { _e.set(rx, ry, rz, order); _q.setFromEuler(_e); return _loc.compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz)); };
  function put(pt, i, parent, m, flash, tint, drag) {
    _out.multiplyMatrices(parent, m); pt.m.setMatrixAt(i, _out);
    pt.flash.array[i] = flash; pt.tint.array[i * 3] = tint[0]; pt.tint.array[i * 3 + 1] = tint[1]; pt.tint.array[i * 3 + 2] = tint[2];
    pt.drag.array[i * 3] = drag ? drag.x : 0; pt.drag.array[i * 3 + 1] = drag ? drag.y : 0; pt.drag.array[i * 3 + 2] = drag ? drag.z : 0;
  }

  function newAnim(e) {
    return { blinkT: 0.5 + Math.random() * 3, blink: 0, earT: Math.random() * 3, ear: 0, earSide: 1, yaw: Math.atan2(e.fx, e.fy), bank: 0, lean: 0, roll: 0,
      mouth: 0.3, step: Math.floor(e.gait * 2), dx: 0, dy: 0, dz: 0, vx: 0, vy: 0, vz: 0, born: false, lastHurt: 9, tint: null };
  }

  /* ---- one furry, posed ---- */
  let shakeOut = 0;
  function draw(e, i, t, dt, player, dying) {
    const T = tierOf(e.kind, e.tier), L = lookOf(e), a = e.anim || (e.anim = newAnim(e)), big = e.tier === 2 && e.kind === 'furry';
    if (!a.tint) { const v = 0.9 + e.seed * 0.2; a.tint = [L.tint[0] * v, L.tint[1] * v, L.tint[2] * (0.94 + e.seed * 0.12)]; }
    if (!a.born) { a.born = true; if (e.state === 'emerge') dirtBurst(e.x, e.y, T.h); }
    const sp = Math.hypot(e.vx, e.vy), mov = clamp01((sp - 0.15) / 1.4), g = e.gait, f = frac(g), s2 = Math.sin(TAU * g), c2 = Math.cos(TAU * g);
    const dP = player ? Math.hypot(player.x - e.x, player.y - e.y) : 99, angry = clamp01((7 - dP) / 4);
    let bob = 0, roll = 0, lean = L.lean + 0.08 * mov, sx = 1, sy = 1, armL = -0.05, armR = -0.05, splay = 0.2, legL = 0, legR = 0, liftL = 0, liftR = 0;
    let brow = L.brow + angry * 0.2, earBack = 0, rise = 0, shakeX = 0, eyeY = 1;
    let mouth = 0.12 + 0.08 * Math.sin(t * 2.5 + e.seed * 9) + angry * (0.32 + 0.32 * Math.sin(t * (9 + e.tier * -2) + e.seed * 9));

    // locomotion
    if (T.gait === 'hop') {
      const air = f < 0.65 ? Math.sin(Math.PI * f / 0.65) : 0, land = f >= 0.65 ? Math.sin(Math.PI * (f - 0.65) / 0.35) : 0;
      bob = 0.26 * air * mov; sy = 1 + (0.09 * air - 0.17 * land) * mov; sx = 1 + (-0.04 * air + 0.12 * land) * mov;
      armL = armR = (-1.0 * air + 0.25 * land) * mov - 0.05; splay += 0.4 * air * mov; legL = legR = 0.55 * air * mov; lean += 0.1 * mov;
      const st = Math.floor(g + 0.35); if (st !== a.step) { a.step = st; if (mov > 0.4) { fx.dust(e.x, e.y, -e.fx, -e.fy, 0.25); a.vy -= 0.5; } }
    } else if (T.gait === 'waddle') {
      roll = 0.14 * s2 * mov; bob = 0.04 * Math.abs(s2) * mov; legL = 0.55 * s2 * mov; legR = -legL; liftL = Math.max(0, c2) * 0.07 * mov; liftR = Math.max(0, -c2) * 0.07 * mov;
      armL = -0.5 * s2 * mov - 0.08 * mov; armR = 0.5 * s2 * mov - 0.08 * mov; lean += 0.06 * mov;
      const st = Math.floor(g * 2); if (st !== a.step) { a.step = st; if (mov > 0.4) { fx.dust(e.x, e.y, -e.fx, -e.fy, 0.3); a.vy -= 0.25; } }
    } else if (T.gait === 'stomp') {
      const contact = (1 - Math.abs(s2)) ** 6;
      roll = 0.17 * s2 * mov; bob = (0.05 * Math.abs(s2) - 0.035 * contact) * mov; sy = 1 - 0.07 * contact * mov; sx = 1 + 0.05 * contact * mov;
      legL = 0.45 * s2 * mov; legR = -legL; liftL = Math.max(0, c2) * 0.1 * mov; liftR = Math.max(0, -c2) * 0.1 * mov;
      const sw = Math.sin(TAU * g - 0.7); armL = -0.32 * sw * mov - 0.18; armR = 0.32 * sw * mov - 0.18; splay = 0.24; lean += 0.06 * mov;
      const st = Math.floor(g * 2); if (st !== a.step) { a.step = st; if (mov > 0.3) { const side = st % 2 ? 1 : -1; fx.dust(e.x + e.fy * side * 0.5, e.y - e.fx * side * 0.5, -e.fx, -e.fy, 1); a.vy -= 0.8; shakeOut = Math.max(shakeOut, 0.16 * clamp01(1 - dP / 14)); } }
    } else {                                                                                   // scurry
      roll = 0.08 * s2 * mov; bob = 0.03 * Math.abs(s2) * mov; legL = 0.85 * s2 * mov; legR = -legL; liftL = Math.max(0, c2) * 0.06 * mov; liftR = Math.max(0, -c2) * 0.06 * mov;
      armL = armR = 0.75 * mov; lean += 0.28 * mov; earBack = 0.6 * mov;
    }
    if (mov < 0.5) { const br = Math.sin(t * 2.4 + e.seed * 20); sy *= 1 + 0.025 * br * (1 - mov); armL += 0.04 * br; armR += 0.04 * br; }

    // what it is doing
    const k = (dur) => clamp01(e.st / dur);
    if (e.state === 'emerge') {
      const q = k(EMERGE), up = ease.outBack(q); rise = -(1 - up) * 1.05; roll += Math.sin(t * 34) * 0.22 * (1 - q); armL = armR = lerp(-2.4, -0.05, ease.outCubic(q)); splay = lerp(0.6, 0.2, q); mouth = lerp(1.1, mouth, q); brow = lerp(0.7, brow, q);
      if (Math.random() < dt * 30 * (1 - q)) fx.emit(e.x + R2(-0.4, 0.4) * T.h, 0.1, e.y + R2(-0.4, 0.4) * T.h, R2(-1.5, 1.5), R2(2, 4.5), R2(-1.5, 1.5), R2(0.4, 0.7), R2(0.06, 0.12) * (0.6 + T.h * 0.4), '#5e4029', { g: 14, op: 1 });
    } else if (e.kind === 'furry' && e.state === 'swipe') {
      const q = ease.outCubic(k(T.windup)); lean = lerp(lean, -0.34, q); armL = lerp(armL, -2.65, q); armR = lerp(armR, -2.65, q); splay = lerp(splay, 0.55, q); mouth = lerp(mouth, 1.2, q);
      brow = 0.75; sy *= 1 + 0.09 * q; sx *= 1 - 0.03 * q; shakeX = Math.sin(t * 64) * 0.016 * q; bob *= 1 - q; roll *= 1 - q;
    } else if (e.kind === 'furry' && e.state === 'strike') {
      const q = k(T.strike); lean = lerp(-0.34, 0.52, ease.outCubic(q)); armL = armR = lerp(-2.65, -0.15, ease.inQuad(q)); splay = lerp(0.55, 0.05, q); mouth = lerp(1.2, -0.45, q);
      brow = 0.8; sy = 1 - 0.1 * q; sx = 1 + 0.06 * q; bob = 0; roll = 0;
    } else if (e.kind === 'furry' && e.state === 'recover') {
      const q = k(T.recover); lean = lerp(0.52, lean, ease.outCubic(q)); armL = armR = lerp(-0.15, armL, q); mouth = 0.5 + 0.22 * Math.sin(t * 15); brow = lerp(0.5, brow, q);
    } else if (e.kind === 'zip' && e.state === 'windup') {
      const q = ease.outCubic(k(T.windup)); sy = 1 - 0.18 * q; sx = 1 + 0.1 * q; shakeX = Math.sin(t * 72) * 0.03 * q; earBack = 1.1 * q; mouth = lerp(mouth, 1.15, q); armL = armR = lerp(armL, 1.0, q); lean = lerp(lean, 0.35, q); brow = 0.9;
    } else if (e.kind === 'zip' && e.state === 'dash') {
      lean = 0.62; armL = armR = 1.45; earBack = 1.3; mouth = 0.95; sy = 0.92; sx = 1.05; brow = 0.9; roll *= 0.5;
    } else if (e.kind === 'zip' && e.state === 'recover') {
      const br = Math.sin(t * 13); lean = -0.05; sy = 1 + 0.06 * br; armL = armR = -0.12; mouth = 0.7 + 0.2 * br; brow = -0.25; earBack = 0.3;
    }

    // getting shot: squint, worried brows, a yelp, recoil away from the shot
    if (e.hurtT < a.lastHurt) { a.vx += e.hitX * 0.6; a.vz += 0; a.vy -= 0.4; }
    a.lastHurt = e.hurtT;
    const hk = Math.exp(-e.hurtT * 7);
    if (hk > 0.02) {
      const lz = e.hitX * e.fx + e.hitY * e.fy, lx = e.hitX * e.fy - e.hitY * e.fx;
      lean += lz * 0.55 * hk; roll += -lx * 0.45 * hk; mouth = Math.max(mouth, 0.85 * hk); brow = lerp(brow, -0.45, hk); if (e.hurtT < 0.22) eyeY = 0.28;
    }
    sy *= 1 + e.sq; sx *= 1 - e.sq * 0.5;

    // dying: swell up white, scream, arms out
    let flash = e.flash;
    if (dying) {
      const q = clamp01(dying.t / dying.dur); sx *= 1 + 0.32 * q; sy *= 1 + 0.26 * q; flash = 0.35 + 0.65 * q; mouth = 1.3; eyeY = 0.2; brow = -0.6; armL = armR = -1.7; splay = 0.9; lean = -0.2 * q;
      shakeX = Math.sin(t * 80) * 0.025;
    }

    // blink, ear flicks, banking into turns, smoothing
    if ((a.blinkT -= dt) < 0) { a.blink = 0.12; a.blinkT = 1.5 + Math.random() * 3.5; }
    if (a.blink > 0) { a.blink -= dt; eyeY = Math.min(eyeY, 0.12); }
    if ((a.earT -= dt) < 0) { a.ear = 1; a.earSide = Math.random() < 0.5 ? -1 : 1; a.earT = 1.2 + Math.random() * 3; }
    a.ear *= Math.exp(-14 * dt);
    const yaw = Math.atan2(e.fx, e.fy); let dyaw = yaw - a.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); a.yaw = yaw;
    a.bank += ((dt > 0 ? Math.max(-0.28, Math.min(0.28, -dyaw / dt * 0.05 * mov)) : 0) - a.bank) * Math.min(1, 8 * dt);
    const sm = Math.min(1, (e.state === 'strike' || e.state === 'swipe' ? 30 : 16) * dt);
    a.lean += (lean - a.lean) * sm; a.roll += (roll + a.bank - a.roll) * sm; a.mouth += (mouth - a.mouth) * Math.min(1, 22 * dt);

    // fur drag: tips trail behind the motion and jiggle on a spring
    const lzv = e.vx * e.fx + e.vy * e.fy, lxv = e.vx * e.fy - e.vy * e.fx;
    const tx = -lxv * 0.012, tz = -lzv * 0.014, ty = -0.01 * mov;
    a.vx += ((tx - a.dx) * 140 - a.vx * 9) * dt; a.vy += ((ty - a.dy) * 140 - a.vy * 9) * dt; a.vz += ((tz - a.dz) * 140 - a.vz * 9) * dt;
    a.dx += a.vx * dt; a.dy += a.vy * dt; a.dz += a.vz * dt;
    const drag = { x: Math.max(-0.08, Math.min(0.08, a.dx)), y: Math.max(-0.08, Math.min(0.08, a.dy)), z: Math.max(-0.08, Math.min(0.08, a.dz)) };

    /* ---- matrices ---- */
    const S = T.h / 1.1 * (0.97 + e.seed * 0.06), hipY = RIG.hip.y;
    _e.set(0, yaw, 0, 'ZYX'); _q.setFromEuler(_e); _root.compose(_p.set(e.x, rise * S, e.y), _q, _s.set(S, S, S));
    const tint = a.tint;
    // legs hang from the root so the feet stay planted while the body rolls above them
    for (let j = 0; j < 2; j++) {
      const s = j ? 1 : -1, sw = j ? legR : legL, lift = j ? liftR : liftL;
      put(P.leg, i * 2 + j, _root, local(s * RIG.hip.x, hipY + lift, 0, sw, 0, 0, L.leg[0], L.leg[1], L.leg[2]), flash, tint, null);
    }
    // the body pivots at the hips: roll and lean, squash about the hip line
    const bw = L.body[0] * (0.97 + e.seed * 0.05), bh = L.body[1];
    _body.multiplyMatrices(_root, local(shakeX, hipY + bob, 0, a.lean, 0, a.roll, sx * bw, sy * bh, sx * bw)); _off.makeTranslation(0, -hipY, 0); _body.multiply(_off);
    put(P.body, i, _body, _off.identity(), flash, tint, drag);
    put(P.jaw, i, _body, local(RIG.jaw.x, RIG.jaw.y, RIG.jaw.z, (a.mouth - 0.25) * 0.5, 0, 0, 1, 1, 1), flash, tint, drag);
    for (let j = 0; j < 2; j++) {
      const s = j ? 1 : -1;
      put(P.arm, i * 2 + j, _body, local(s * RIG.shoulder.x, L.shoulderY, RIG.shoulder.z, j ? armR : armL, 0, s * splay, L.arm[0], L.arm[1], L.arm[2], 'XYZ'), flash, tint, null);   // splay first, so a raised arm stays out wide
      put(P.eye, i * 2 + j, _body, local(s * RIG.eye.x, RIG.eye.y, RIG.eye.z, 0, 0, 0, L.eye, L.eye * eyeY, L.eye), flash * 0.4, tint, null);
      put(P.brow, i * 2 + j, _body, local(s * RIG.brow.x, RIG.brow.y + (brow < 0 ? -brow * 0.03 : 0) + (L.eye - 1) * 0.05, RIG.brow.z, 0, 0, s * brow * 0.55, L.eye * 0.95, 1, 1), flash, tint, drag);
      const tw = a.earSide === s ? a.ear * 0.5 : 0;
      put(P.ear, i * 2 + j, _body, local(s * RIG.ear.x, RIG.ear.y, RIG.ear.z, -earBack - tw * 0.4, 0, -s * (0.42 + tw), L.ear, L.ear, L.ear), flash, tint, drag);
    }
    const sr = e.r * 1.25 * (1 + Math.min(0, rise) * 0.6) * (1 - bob * 0.8);
    _e.set(0, 0, 0); _q.identity(); _out.compose(_p.set(e.x, 0.03, e.y), _q, _s.set(sr, 1, sr * 0.9)); shadow.setMatrixAt(i, _out);
  }

  /* ---- deaths: a short swell, then a burst of fur ---- */
  const dying = [];
  function die(e, dx = 0, dy = 0) {
    const d = { ...e, alive: false, dying: { t: 0, dur: 0.1 + 0.06 * e.tier + (e.kind === 'zip' ? 0.04 : 0) }, dx, dy };
    d.anim = e.anim ? { ...e.anim } : null; dying.push(d); if (dying.length > 40) dying.shift();
  }
  function burst(d) {
    const T = tierOf(d.kind, d.tier), n = Math.round(14 + T.h * 16), cols = ['#7a3a1a', '#c8783c', '#3f1c0c', '#94491f', '#6e1717'];
    for (let i = 0; i < n; i++) {
      const an = Math.random() * TAU, spd = R2(1.5, 5.5) * (0.7 + T.h * 0.25);
      fx.emit(d.x, T.h * R2(0.3, 0.8), d.y, Math.cos(an) * spd + d.dx * 2.5, R2(2, 6.5), Math.sin(an) * spd + d.dy * 2.5, R2(0.45, 0.95), R2(0.07, 0.16) * (0.6 + T.h * 0.35), cols[i % cols.length], { g: 13, op: 1 });
    }
    splat(d.x + d.dx * 0.3, d.y + d.dy * 0.3, d.r * 1.05, FUR_SPLAT); splat(d.x, d.y, d.r * 0.6, '#5a2a12');
    fx.ring?.(d.x, d.y, T.h * 1.1, '#c8783c', 0.35);
  }
  /** a pellet landed: a small puff of fur off the side that was hit */
  function hit(e, nx, ny) {
    for (let i = 0; i < 3; i++) fx.emit(e.x - nx * e.r * 0.6, e.h * R2(0.3, 0.75), e.y - ny * e.r * 0.6, -nx * R2(0.5, 2.5) + R2(-1, 1), R2(0.8, 2.2), -ny * R2(0.5, 2.5) + R2(-1, 1), R2(0.35, 0.6), R2(0.05, 0.09), Math.random() < 0.5 ? '#7a3a1a' : '#c8783c', { g: 7, op: 1 });
  }

  /* ---- spawn mounds: the ground swells and shakes where something is about to dig out ---- */
  const MCAP = 48, mound = new THREE.InstancedMesh(buildMound(), toon('#ffffff', { vertexColors: true }), MCAP); mound.frustumCulled = false; mound.count = 0; group.add(mound);
  const mounds = Array.from({ length: MCAP }, () => ({ x: 0, y: 0, left: 0, total: 1, size: 1, life: 0 }));
  function warn(x, y, delay, size = 1) { const w = mounds.find(q => q.life <= 0) || mounds[0]; Object.assign(w, { x, y, left: delay, total: delay, size, life: delay + EMERGE + 0.9 }); }
  function dirtBurst(x, y, h) { for (let i = 0; i < 6 + h * 8; i++) { const an = Math.random() * TAU, s = R2(1, 3.5); fx.emit(x, 0.15, y, Math.cos(an) * s, R2(2.5, 5.5), Math.sin(an) * s, R2(0.4, 0.8), R2(0.07, 0.15) * (0.6 + h * 0.4), i % 3 ? '#5e4029' : '#7a5638', { g: 15, op: 1 }); } }
  function updateWarns(dt, t) {
    let n = 0;
    for (const w of mounds) {
      if (w.life <= 0) continue; w.life -= dt; w.left -= dt; if (w.life <= 0) continue;
      const grow = w.left > 0 ? ease.outCubic(1 - w.left / w.total) : 1, sink = w.life < 0.9 ? w.life / 0.9 : 1, shake = w.left > 0 ? Math.sin(t * 50 + w.x) * 0.06 * grow : 0;
      const sc = w.size * 0.55 * grow * sink;
      if (w.left > 0 && Math.random() < dt * 12 * grow) fx.emit(w.x + R2(-0.4, 0.4) * w.size, 0.1, w.y + R2(-0.4, 0.4) * w.size, R2(-0.6, 0.6), R2(1, 2.4), R2(-0.6, 0.6), R2(0.3, 0.5), R2(0.04, 0.08), '#6a4a30', { g: 12, op: 1 });
      _e.set(0, w.x * 3, 0); _q.setFromEuler(_e); _out.compose(_p.set(w.x + shake * w.size, 0, w.y), _q, _s.set(sc, sc * (1 + shake), sc)); mound.setMatrixAt(n++, _out);
      if (n >= MCAP) break;
    }
    mound.count = n; mound.instanceMatrix.needsUpdate = true;
  }

  /* ---- goo splats ---- */
  const SPL = 140, splats = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), SPL);
  splats.frustumCulled = false; group.add(splats);
  const spl = Array.from({ length: SPL }, () => ({ x: 0, y: 0, r: 0, sx: 1, sz: 1, rot: 0, life: 0, col: new THREE.Color() })); let si = 0;
  const _c = new THREE.Color();
  for (let i = 0; i < SPL; i++) { _out.makeScale(0, 0, 0); splats.setMatrixAt(i, _out); splats.setColorAt(i, _c.set('#ffffff')); }
  function splat(x, y, r, color) { const s = spl[si++ % SPL]; Object.assign(s, { x, y, r: r * (1.1 + Math.random() * 0.7), sx: 0.8 + Math.random() * 0.5, sz: 0.8 + Math.random() * 0.5, rot: Math.random() * 6.28, life: 12 }); s.col.set(color); }
  function updateSplats(dt) {
    for (let i = 0; i < SPL; i++) {
      const s = spl[i]; if (s.life > 0) s.life -= dt; const k = s.life <= 0 ? 0 : Math.min(1, s.life / 2);
      _e.set(0, s.rot, 0); _q.setFromEuler(_e); _out.compose(_p.set(s.x, 0.02 + i * 0.00002, s.y), _q, _s.set(s.r * s.sx * k, 1, s.r * s.sz * k)); splats.setMatrixAt(i, _out); splats.setColorAt(i, s.col);
    }
    splats.instanceMatrix.needsUpdate = true; if (splats.instanceColor) splats.instanceColor.needsUpdate = true;
  }

  /**
   * Draw every living enemy plus the ones mid-death. `t` game clock (s), `dt` frame step, `player` {x,y} for chomping distance.
   * @returns { shake } camera shake asked for by Giant footfalls near the player
   */
  function update(list, t, dt, player) {
    time.value = t; shakeOut = 0; let n = 0;
    for (const e of list) { if (!e.alive || n >= CAP) continue; draw(e, n++, t, dt, player, null); }
    for (let k = dying.length - 1; k >= 0; k--) {
      const d = dying[k]; d.dying.t += dt;
      if (d.dying.t >= d.dying.dur) { burst(d); dying.splice(k, 1); continue; }
      if (n < CAP) draw(d, n++, t, dt, player, d.dying);
    }
    for (const pt of Object.values(P)) {
      pt.m.count = n * pt.per; pt.m.instanceMatrix.needsUpdate = true;
      for (const at of [pt.flash, pt.tint, pt.drag]) { at.needsUpdate = true; at.clearUpdateRanges?.(); }
    }
    shadow.count = n; shadow.instanceMatrix.needsUpdate = true;
    return { shake: shakeOut };
  }
  function clear() { for (const w of mounds) w.life = 0; for (const s of spl) s.life = 0; dying.length = 0; mound.count = 0; }
  group.visible = false;
  return { group, update, warn, updateWarns, splat, updateSplats, die, hit, clear, setVisible: v => { group.visible = v; } };
}
