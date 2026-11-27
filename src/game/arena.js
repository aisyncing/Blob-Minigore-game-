// The movement test arena: visuals plus the collision world they came from.
// Layout is deliberate, each zone isolates one feel:
//   west  : slalom of posts          (weaving, gentle stick control)
//   centre: big pillar and rocks     (circling, wall sliding on curves)
//   east  : zig-zag stone corridor   (tight turns, reversing, sliding along flat walls)
//   south : open playground          (start/stop/reverse in the clear)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, paintCanvas, facet, R2 } from '../engine/stage.js';
import { BOUNDS, SPAWN, LAYOUT, buildWorld } from './layout.js';

export { SPAWN };
export const ARENA_BOUNDS = BOUNDS;

export function createArena(stage) {
  const { scene } = stage;
  const group = new THREE.Group(); scene.add(group);
  const world = buildWorld();
  const B = ARENA_BOUNDS, W = B.maxX - B.minX, H = B.maxY - B.minY;

  /* ---------- textures ---------- */
  const grass = paintCanvas(512, 512, (g, w, h) => {
    g.fillStyle = '#4b7d37'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 110; i++) { g.fillStyle = ['#43733a', '#548a3d', '#4a7c38', '#5a9442', '#3c6934'][i % 5]; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(R2(0, w), R2(0, h), R2(18, 60), R2(14, 40), R2(0, 3), 0, 7); g.fill(); }
    g.globalAlpha = 0.55; g.lineCap = 'round'; g.lineWidth = 2.5;
    for (let i = 0; i < 420; i++) { g.strokeStyle = '#33622b'; const x = R2(0, w), y = R2(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R2(-3, 3), y - R2(5, 11)); g.stroke(); }
    for (let i = 0; i < 240; i++) { g.strokeStyle = '#7db44d'; const x = R2(0, w), y = R2(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R2(-3, 3), y - R2(4, 9)); g.stroke(); }
  });
  grass.repeat.set(W / 7, H / 7);
  const stone = paintCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6c7f98'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(150,175,205,.25)' : 'rgba(40,55,80,.25)'; g.beginPath(); g.ellipse(R2(0, w), R2(0, h), R2(10, 40), R2(8, 26), R2(0, 3), 0, 7); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 140; i++) { g.strokeStyle = Math.random() < 0.5 ? 'rgba(205,225,250,.2)' : 'rgba(25,35,60,.22)'; g.lineWidth = R2(3, 8); const x = R2(0, w), y = R2(0, h); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + R2(-14, 14), y - 12, x + R2(-10, 10), y - R2(16, 30)); g.stroke(); }
    g.fillStyle = 'rgba(88,140,80,.35)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(R2(0, w), R2(0, h), R2(6, 18), R2(4, 10), 0, 0, 7); g.fill(); }
  });
  const wood = paintCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9a6a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? 'rgba(60,32,12,.22)' : 'rgba(230,180,120,.16)'; g.fillRect(0, i * 10 + R2(-2, 2), w, R2(3, 7)); }
    g.strokeStyle = '#5b3a1e'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.beginPath(); g.moveTo(6, 6); g.lineTo(w - 6, h - 6); g.moveTo(w - 6, 6); g.lineTo(6, h - 6); g.stroke();
  });

  /* ---------- ground ---------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, H + 2), toon('#ffffff', { map: grass }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), toon('#27472a')); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; outer.receiveShadow = true; group.add(outer);
  // painted start circle so you can always see where "home" is
  const start = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 40), new THREE.MeshBasicMaterial({ color: '#c9bc98', transparent: true, opacity: 0.7 }));
  start.rotation.x = -Math.PI / 2; start.position.set(SPAWN.x, 0.02, SPAWN.y); group.add(start);

  /* ---------- props (each adds both a mesh and a collider) ---------- */
  const stoneMat = toon('#ffffff', { map: stone }), woodMat = toon('#ffffff', { map: wood });
  function addWall(x, y, hw, hh, height = 1.5) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(hw * 2, height, hh * 2, 3, Math.min(0.25, hh * 0.8)), stoneMat);
    mesh.position.set(x, height / 2, y); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  function addCrate(x, y, s = 1.2) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 3, 0.1), woodMat); mesh.position.set(x, s / 2, y); mesh.rotation.y = R2(-0.05, 0.05); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  function addPost(x, y) {
    const g = new THREE.Group(); g.position.set(x, 0, y);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.6, 9), woodMat); log.position.y = 0.8; log.castShadow = true; g.add(log);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.22, 9), toon('#d9463e')); cap.position.y = 1.55; cap.castShadow = true; g.add(cap);
    group.add(g);
  }
  function addRock(x, y, s) {
    const geo = facet(new THREE.DodecahedronGeometry(s, 0));
    const m = new THREE.Mesh(geo, toon(['#6c7787', '#5d697b', '#7b8697'][(Math.random() * 3) | 0])); m.scale.y = R2(0.7, 0.95); m.position.set(x, s * 0.55, y); m.rotation.set(R2(0, 3), R2(0, 3), R2(0, 3)); m.castShadow = m.receiveShadow = true; group.add(m);
  }
  function addPillar(x, y, r) {
    const g = new THREE.Group(); g.position.set(x, 0, y);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.5, 20), stoneMat); base.position.y = 0.25; base.castShadow = base.receiveShadow = true; g.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.88, 2.4, 20), stoneMat); col.position.y = 1.7; col.castShadow = col.receiveShadow = true; g.add(col);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 0.88, 0.4, 20), stoneMat); top.position.y = 3.1; top.castShadow = true; g.add(top);
    group.add(g);
  }
  const leaf = ['#2f7d4a', '#3b8c40', '#276b45', '#4a9638'];
  function addTree(x, y) {
    const g = new THREE.Group(); g.position.set(x, 0, y); g.scale.setScalar(R2(0.9, 1.15)); g.rotation.y = R2(0, 6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 1.6, 7), toon('#a8693a')); trunk.position.y = 0.8; trunk.castShadow = true; g.add(trunk);
    const col = leaf[(Math.random() * 4) | 0];
    [[2.1, 1.7, 2.2], [3.2, 1.35, 2.0], [4.2, 1.0, 1.8]].forEach(([yy, r, h]) => {
      const geo = facet(new THREE.ConeGeometry(r, h, 7));
      const m = new THREE.Mesh(geo, toon(col)); m.position.y = yy; m.castShadow = true; g.add(m);
    });
    group.add(g);
  }
  function addBush(x, y, s) {
    const geo = facet(new THREE.IcosahedronGeometry(s, 1));
    const m = new THREE.Mesh(geo, toon(leaf[(Math.random() * 4) | 0])); m.position.set(x, s * 0.7, y); m.scale.y = 0.85; m.castShadow = true; group.add(m);
  }

  LAYOUT.posts.forEach(([x, y]) => addPost(x, y));
  LAYOUT.pillars.forEach(p => addPillar(p.x, p.y, p.r));
  LAYOUT.rocks.forEach(r => addRock(r.x, r.y, r.s));
  LAYOUT.walls.forEach(w => addWall(w.x, w.y, w.hw, w.hh));
  LAYOUT.crates.forEach(c => addCrate(c.x, c.y, c.s));
  // trees and bushes frame the arena (a few collide, the rest are scenery)
  LAYOUT.trees.forEach(([x, y]) => addTree(x, y));
  for (let t = B.minX; t <= B.maxX; t += 2.2) { addBush(t + R2(-0.3, 0.3), B.minY - 0.6, R2(1, 1.5)); addBush(t + R2(-0.3, 0.3), B.maxY + 0.6, R2(1, 1.5)); }
  for (let t = B.minY; t <= B.maxY; t += 2.2) { addBush(B.minX - 0.6, t + R2(-0.3, 0.3), R2(1, 1.5)); addBush(B.maxX + 0.6, t + R2(-0.3, 0.3), R2(1, 1.5)); }
  // grass tufts and flowers
  { const tu = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.5, 4), toon('#ffffff'), 700), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const cols = ['#3b7a2a', '#468a30', '#2f6a24', '#58a038'];
    for (let i = 0; i < 700; i++) { e.set(R2(-0.35, 0.35), R2(0, 6), R2(-0.35, 0.35)); q.setFromEuler(e); p.set(R2(B.minX, B.maxX), 0.22, R2(B.minY, B.maxY)); sc.setScalar(R2(0.7, 1.5)); m4.compose(p, q, sc); tu.setMatrixAt(i, m4); tu.setColorAt(i, c.set(cols[i & 3])); }
    group.add(tu); }

  /* ---------- training range: a board that keeps pellet marks ---------- */
  const rb = LAYOUT.range.board, boardMesh = new THREE.Mesh(new RoundedBoxGeometry(rb.hw * 2, rb.height, rb.hh * 2, 3, 0.08), woodMat);
  boardMesh.position.set(rb.x, rb.height / 2, rb.y); boardMesh.castShadow = boardMesh.receiveShadow = true; group.add(boardMesh);
  { const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112; const g = cv.getContext('2d'); g.fillStyle = '#e8d6b0'; g.fillRect(0, 0, 512, 112);
    g.strokeStyle = '#6b4a22'; g.lineWidth = 3; for (let x = 0; x <= 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 112); g.stroke(); } g.beginPath(); g.moveTo(0, 56); g.lineTo(512, 56); g.stroke();
    g.fillStyle = '#e85d5d'; g.font = '700 30px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PATTERN BOARD', 256, 22);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(rb.hw * 2 - 0.2, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true }));
    face.position.set(rb.x, rb.height - 0.4, rb.y + rb.hh + 0.012); group.add(face); }
  const marks = Array.from({ length: 140 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.055, 8), new THREE.MeshBasicMaterial({ color: '#2a1b0e' })); m.visible = false; m.userData.mark = true; group.add(m); return m; });
  let markI = 0;
  /** Stamp a pellet hole where a pellet hit the board (x along the board; height is random since the sim is 2D). */
  function boardMark(x) { const m = marks[markI++ % marks.length]; m.position.set(x, 0.25 + Math.random() * (rb.height - 0.95), rb.y + rb.hh + 0.015); m.visible = true; }
  function clearMarks() { for (const m of marks) m.visible = false; }

  /* ---------- warm lights against the cool ambient ---------- */
  const lamps = [];
  for (const [x, y] of LAYOUT.lamps) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 2.6, 6), toon('#3a2c22')); pole.position.set(x, 1.3, y); pole.castShadow = true; group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4), new THREE.MeshBasicMaterial({ color: '#ffd27a' })); lamp.position.set(x, 2.75, y); group.add(lamp);
    const L = new THREE.PointLight('#ffb347', 55, 17, 2); L.position.set(x, 2.8, y); group.add(L); lamps.push(L);
  }

  /* ---------- debug: collider outlines ---------- */
  const debug = new THREE.Group(); debug.visible = false; group.add(debug);
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffd23f' });
  for (const c of world.circles) { const pts = []; for (let i = 0; i <= 32; i++) pts.push(new THREE.Vector3(c.x + Math.cos(i / 32 * 6.2832) * c.r, 0.08, c.y + Math.sin(i / 32 * 6.2832) * c.r)); debug.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat)); }
  for (const b of world.boxes) { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([sx, sy]) => new THREE.Vector3(b.x + sx * b.hw, 0.08, b.y + sy * b.hh)); debug.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat)); }
  { const pts = [[B.minX, B.minY], [B.maxX, B.minY], [B.maxX, B.maxY], [B.minX, B.maxY], [B.minX, B.minY]].map(([x, y]) => new THREE.Vector3(x, 0.08, y)); debug.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat)); }

  return { group, world, debug, boardMark, clearMarks, startPad: start, setVisible: v => { group.visible = v; } };
}
