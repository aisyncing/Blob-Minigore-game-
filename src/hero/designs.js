// Three friendly blob designs. Each returns the same parts so the shared rig (hero.js) can animate any of them.
//   body        Object3D placed inside the leaning/squashing pivot (origin = ground, faces +Z)
//   blink       meshes squashed flat to blink
//   look        pupils nudged to look around
//   feet        two meshes that the rig swings while walking (positions are rest positions)
//   shoulder    {x, y}: where the arms attach, mirrored left and right
//   gunMount    where the gun sits, relative to the torso
//   secondary   per-frame follow-through (hat wobble, antenna bounce, leaf flutter)
//   accessory   the head piece that comes off on the first hit in a later iteration
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, paintCanvas, shade, R2 } from '../engine/stage.js';

function paintBlob(base) {
  return paintCanvas(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0);
    gr.addColorStop(0, shade(base, -0.2)); gr.addColorStop(0.14, shade(base, -0.08)); gr.addColorStop(0.5, base); gr.addColorStop(0.85, shade(base, 0.07)); gr.addColorStop(1, shade(base, 0.16));
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.lineCap = 'round';
    for (let i = 0; i < 360; i++) { const x = R2(0, w), y = R2(0, h), len = R2(8, 20); g.lineWidth = R2(2.5, 5); g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(20,0,40,.07)'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + R2(-8, 8), y - len / 2, x + R2(-6, 6), y - len); g.stroke(); }
  });
}
// self-lit painted material: the texture carries the shading (Minigore paints lighting into the diffuse)
const painted = base => { const map = paintBlob(base); return toon('#ffffff', { map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.5 }); };

function eyes(parent, { x, y, z, size, whites = true, tilt = 0 }) {
  const blink = [], look = [];
  for (const sx of [-1, 1]) {
    if (whites) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), toon('#ffffff')); w.scale.set(1, 1.22, 0.55); w.position.set(sx * x, y, z); parent.add(w); blink.push(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 12, 10), new THREE.MeshBasicMaterial({ color: '#241838' })); p.position.set(sx * x, y - size * 0.03, z + size * 0.42); parent.add(p); look.push(p);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(size * 0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(sx * x + size * 0.12, y + size * 0.18, z + size * 0.62); parent.add(hl);
    } else {
      const p = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), new THREE.MeshBasicMaterial({ color: '#241838' })); p.scale.set(0.8, 1.2, 0.5); p.position.set(sx * x, y, z); p.rotation.z = sx * tilt; parent.add(p); blink.push(p); look.push(p);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(sx * x + size * 0.18, y + size * 0.4, z + size * 0.22); parent.add(hl);
    }
  }
  return { blink, look };
}
function cheeks(parent, { x, y, z, size = 0.13, color = '#ff8aa8' }) {
  for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })); c.scale.set(1.2, 0.7, 0.35); c.position.set(sx * x, y, z); parent.add(c); }
}
/** Tiny spring used for follow-through. */
class Spring { constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; } step(target, dt) { this.v += (this.k * (target - this.x) - this.c * this.v) * dt; this.x += this.v * dt; return this.x; } }
const cast = (m, on = true) => { m.castShadow = on; return m; };

/* ------------------------------------------------------------------ 1. Gumdrop */
function gumdrop() {
  const base = '#ff7ab8', body = new THREE.Group();
  const prof = [[0, 0.22], [0.35, 0.2], [0.64, 0.0], [0.66, 0.1], [0.67, 0.24], [0.67, 0.4], [0.67, 0.58], [0.67, 0.74], [0.66, 0.88]];
  for (let i = 1; i <= 10; i++) { const a = i / 10 * Math.PI / 2; prof.push([0.66 * Math.cos(a), 0.88 + 0.64 * Math.sin(a)]); }
  const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 44);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), hw = Math.max(0, 1 - y / 0.42), r = Math.hypot(x, z); // scalloped hem
    pos.setY(i, y + (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 5)) * 0.17 * hw * Math.min(1, r / 0.5)); }
  geo.computeVertexNormals();
  body.add(cast(new THREE.Mesh(geo, painted(base))));
  const e = eyes(body, { x: 0.24, y: 1.02, z: 0.56, size: 0.2 });
  cheeks(body, { x: 0.42, y: 0.8, z: 0.46 });
  // explorer hat
  const hat = new THREE.Group(); hat.position.set(0, 1.5, -0.02); body.add(hat);
  const brown = toon('#9a6a3a'), band = toon('#d9463e');
  hat.add(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.07, 22), brown)));
  const crown = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.3, 18), brown)); crown.position.y = 0.17; hat.add(crown);
  const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.415, 0.08, 18), band); rib.position.y = 0.09; hat.add(rib);
  hat.rotation.x = 0.1;
  const feet = [-1, 1].map(s => { const f = cast(new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), toon(shade(base, -0.12)))); f.scale.set(1, 0.7, 1.3); f.position.set(s * 0.3, 0.12, 0.1); return f; });
  const sx = new Spring(120, 7), sz = new Spring(120, 7);
  return { name: 'Gumdrop', base, armColor: shade(base, -0.1), trim: '#d9a441',
    body, blink: e.blink, look: e.look, feet, footX: 0.3, shoulder: { x: 0.6, y: 0.8 }, gunMount: { x: 0, y: 0.72, z: 0.34 }, radius: 0.66, belt: { r: 0.7, y: 0.5 }, accessory: hat,
    secondary(dt, t, c) { hat.rotation.z = sx.step(-c.lx * 0.03, dt); hat.rotation.x = 0.1 + sz.step(c.lz * 0.03, dt); } };
}

/* ------------------------------------------------------------------ 2. Sprout */
function sprout() {
  const base = '#4fcf86', body = new THREE.Group();
  const bean = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.72, 8, 22), painted(base))); bean.position.y = 1.16; bean.scale.set(1.05, 1, 1); body.add(bean);
  const e = eyes(body, { x: 0.2, y: 1.28, z: 0.46, size: 0.17 });
  cheeks(body, { x: 0.36, y: 1.04, z: 0.4, size: 0.12, color: '#ff9a9a' });
  const scarf = cast(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.085, 8, 26), toon('#e85d5d'))); scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.8; body.add(scarf);
  const knot = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), toon('#e85d5d'))); knot.position.set(0.1, 0.74, 0.5); body.add(knot);
  const tail = cast(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 7), toon('#e85d5d'))); tail.position.set(0.14, 0.52, 0.52); tail.rotation.x = Math.PI; body.add(tail);
  // leaf sprout
  const sprig = new THREE.Group(); sprig.position.set(0, 1.9, 0); body.add(sprig);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.3, 6), toon('#3f9a52')); stem.position.y = 0.12; sprig.add(stem);
  const leaves = [-1, 1].map(s => { const l = cast(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), toon('#4fc46a'))); l.scale.set(1, 0.14, 0.5); l.position.set(s * 0.26, 0.34, 0); l.rotation.z = s * 0.45; sprig.add(l); return l; });
  const boot = toon('#7a4a26');
  const feet = [-1, 1].map(s => { const f = cast(new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.3, 0.46, 3, 0.1), boot)); f.position.set(s * 0.24, 0.15, 0.04); return f; });
  const sa = new Spring(90, 3.2), sb = new Spring(90, 3.2);
  return { name: 'Sprout', base, armColor: shade(base, -0.12), trim: '#e0c36a',
    body, blink: e.blink, look: e.look, feet, footX: 0.24, shoulder: { x: 0.5, y: 0.98 }, gunMount: { x: 0, y: 0.78, z: 0.3 }, radius: 0.56, belt: { r: 0.6, y: 0.55 }, accessory: sprig,
    secondary(dt, t, c) { sprig.rotation.z = sa.step(-c.lx * 0.045 + Math.sin(t * 3) * 0.05, dt); sprig.rotation.x = sb.step(c.lz * 0.045, dt); leaves[0].rotation.z = -0.45 + Math.sin(t * 4.2) * 0.08; leaves[1].rotation.z = 0.45 - Math.sin(t * 4.2 + 1) * 0.08; } };
}

/* ------------------------------------------------------------------ 3. Marshmallow */
function marshmallow() {
  const base = '#fff0d6', body = new THREE.Group();
  const cube = cast(new THREE.Mesh(new RoundedBoxGeometry(1.16, 1.14, 1.16, 5, 0.34), painted(base))); cube.position.y = 0.92; body.add(cube);
  const e = eyes(body, { x: 0.27, y: 0.98, z: 0.58, size: 0.1, whites: false });
  cheeks(body, { x: 0.43, y: 0.74, z: 0.55, size: 0.12, color: '#ff9a9a' });
  // goggles pushed up on the forehead
  const gog = new THREE.Group(); gog.position.set(0, 1.5, 0.28); gog.rotation.x = -1.4; body.add(gog);   // lying on the top face so they read from above
  for (const s of [-1, 1]) {
    const ring = cast(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 8, 20), toon('#d9463e'))); ring.position.x = s * 0.25; gog.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.19, 18), new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.75 })); glass.position.set(s * 0.25, 0, 0.01); gog.add(glass);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.07), toon('#d9463e')); gog.add(bridge);
  // antenna with a glowing bulb
  const ant = new THREE.Group(); ant.position.set(-0.28, 1.46, -0.15); body.add(ant);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6), toon('#5b6573')); wire.position.y = 0.25; ant.add(wire);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffcf5a' })); bulb.position.y = 0.55; ant.add(bulb);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.3, depthWrite: false })); halo.position.y = 0.55; ant.add(halo);
  const feet = [-1, 1].map(s => { const g = new THREE.Group(); const leg = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.2, 8), toon('#5f7a9a'))); leg.position.y = 0.06; g.add(leg);
    const sole = cast(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.14, 0.4, 3, 0.05), toon('#5f7a9a'))); sole.position.set(0, -0.02, 0.05); g.add(sole); g.position.set(s * 0.27, 0.14, 0.05); return g; });
  const sa = new Spring(70, 2.2), sb = new Spring(70, 2.2);
  return { name: 'Marshmallow', base, armColor: '#e8cfa6', trim: '#d9463e',
    body, blink: e.blink, look: e.look, feet, footX: 0.27, shoulder: { x: 0.62, y: 0.92 }, gunMount: { x: 0, y: 0.7, z: 0.4 }, radius: 0.64, belt: { r: 0.7, y: 0.5 }, accessory: ant,
    secondary(dt, t, c) { ant.rotation.z = sa.step(-c.lx * 0.07, dt); ant.rotation.x = sb.step(c.lz * 0.07, dt); halo.scale.setScalar(1 + Math.sin(t * 5) * 0.12); } };
}

export const DESIGNS = [
  { key: 'gumdrop', build: gumdrop },
  { key: 'sprout', build: sprout },
  { key: 'marshmallow', build: marshmallow },
];
