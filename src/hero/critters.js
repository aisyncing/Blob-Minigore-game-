// Drawing the enemy crowd: instanced (a few draw calls for 150+ critters), plus spawn warnings and goo splats on the ground.
// Look only; all behaviour is in src/game/crowd.js.
import * as THREE from 'three';
import { toon } from '../engine/stage.js';

const CAP = 360;
const COLORS = { puff: ['#ffd166', '#ff8fc7', '#b48cf0'], zip: ['#4ad6c8'] };
export const critterColor = (e) => (COLORS[e.kind][e.tier] || COLORS.puff[0]);
const easeOutBack = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export function createCritters(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mk = (geo, mat, n = CAP) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.count = 0; group.add(m); return m; };
  const body = mk(new THREE.SphereGeometry(1, 14, 10), toon('#ffffff'));
  const eyeW = mk(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), CAP * 2);
  const eyeP = mk(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ color: '#2a1b3d' }), CAP * 2);
  const shadow = mk(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#050a08', transparent: true, opacity: 0.32, depthWrite: false }));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color(), _w = new THREE.Color('#ffffff'), _r = new THREE.Color('#ff3b3b');

  /** Draw every living enemy. `t` is the game clock in seconds. */
  function update(list, t) {
    let n = 0;
    for (const e of list) {
      if (!e.alive || n >= CAP) continue;
      const pop = easeOutBack(Math.min(1, e.age / 0.3)), bob = Math.abs(Math.sin(e.ph)) * 0.12 * e.r, sq = e.sq;
      const windup = e.kind === 'zip' && e.state === 'windup', big = windup ? 1 + Math.sin(t * 40) * 0.06 : 1;
      const sx = e.r * pop * big * (1 - sq * 0.5 + bob * 0.4), sy = e.r * pop * (1 + sq + bob * 0.6) * (e.kind === 'zip' ? 0.82 : 1.0), yaw = Math.atan2(e.fx, e.fy);
      _e.set(0, yaw, 0); _q.setFromEuler(_e);
      _p.set(e.x, sy * 0.95 + bob, e.y); _s.set(sx, sy, sx); _m.compose(_p, _q, _s); body.setMatrixAt(n, _m);
      _c.set(critterColor(e)); if (e.flash > 0) _c.lerp(_w, Math.min(1, e.flash)); if (windup) _c.lerp(_r, 0.5 + 0.5 * Math.sin(t * 36)); body.setColorAt(n, _c);
      // eyes sit on the front of the body and look where it is heading
      const fwx = Math.sin(yaw), fwz = Math.cos(yaw), sdx = Math.cos(yaw), sdz = -Math.sin(yaw);
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1, ex = e.x + fwx * sx * 0.78 + sdx * sx * 0.36 * side, ez = e.y + fwz * sx * 0.78 + sdz * sx * 0.36 * side, ey = _p.y + sy * 0.28;
        _s.setScalar(sx * 0.27); _p.set(ex, ey, ez); _m.compose(_p, _q, _s); eyeW.setMatrixAt(n * 2 + k, _m);
        _s.setScalar(sx * 0.14); _p.set(ex + fwx * sx * 0.16, ey, ez + fwz * sx * 0.16); _m.compose(_p, _q, _s); eyeP.setMatrixAt(n * 2 + k, _m);
      }
      _p.set(e.x, 0.03, e.y); _s.set(e.r * 1.05 * pop, 1, e.r * 1.05 * pop); _q.identity(); _m.compose(_p, _q, _s); shadow.setMatrixAt(n, _m);
      n++;
    }
    body.count = shadow.count = n; eyeW.count = eyeP.count = n * 2;
    for (const o of [body, eyeW, eyeP, shadow]) o.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }

  /* ---- spawn warnings: a pulsing ring on the ground where something is about to pop in ---- */
  const warnGeo = new THREE.RingGeometry(0.55, 1, 24).rotateX(-Math.PI / 2), warnFill = new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2);
  const warns = Array.from({ length: 40 }, () => {
    const g = new THREE.Group(), ring = new THREE.Mesh(warnGeo, new THREE.MeshBasicMaterial({ color: '#ff6fb1', transparent: true, depthWrite: false, side: THREE.DoubleSide })), fill = new THREE.Mesh(warnFill, new THREE.MeshBasicMaterial({ color: '#ff6fb1', transparent: true, depthWrite: false, opacity: 0.25 }));
    g.add(ring, fill); g.visible = false; g.position.y = 0.05; group.add(g); return { g, ring, fill, left: 0, total: 1, size: 1 };
  });
  function warn(x, y, delay, size = 1) { const w = warns.find(q => q.left <= 0) || warns[0]; w.g.position.set(x, 0.05, y); w.left = w.total = delay; w.size = size; w.g.visible = true; }
  function updateWarns(dt) {
    for (const w of warns) {
      if (w.left <= 0) continue; w.left -= dt; if (w.left <= 0) { w.g.visible = false; continue; }
      const k = 1 - w.left / w.total, pulse = 0.85 + 0.15 * Math.sin(k * 30);
      w.g.scale.setScalar(w.size * (1.7 - 0.9 * k) * pulse); w.ring.material.opacity = 0.35 + 0.6 * k; w.fill.material.opacity = 0.1 + 0.3 * k;
    }
  }

  /* ---- goo splats: friendly pastel puddles that shrink away after a few seconds ---- */
  const SPL = 140, splats = mk(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), SPL);
  const spl = Array.from({ length: SPL }, () => ({ x: 0, y: 0, r: 0, sx: 1, sz: 1, rot: 0, life: 0, col: new THREE.Color() })); let si = 0;
  splats.count = SPL; for (let i = 0; i < SPL; i++) { _m.makeScale(0, 0, 0); splats.setMatrixAt(i, _m); splats.setColorAt(i, _c.set('#ffffff')); }
  function splat(x, y, r, color) { const s = spl[si++ % SPL]; Object.assign(s, { x, y, r: r * (1.1 + Math.random() * 0.7), sx: 0.8 + Math.random() * 0.5, sz: 0.8 + Math.random() * 0.5, rot: Math.random() * 6.28, life: 9 }); s.col.set(color); }
  function updateSplats(dt) {
    for (let i = 0; i < SPL; i++) {
      const s = spl[i]; if (s.life > 0) s.life -= dt; const k = s.life <= 0 ? 0 : Math.min(1, s.life / 1.5);
      _e.set(0, s.rot, 0); _q.setFromEuler(_e); _p.set(s.x, 0.02 + i * 0.00002, s.y); _s.set(s.r * s.sx * k, 1, s.r * s.sz * k); _m.compose(_p, _q, _s); splats.setMatrixAt(i, _m); splats.setColorAt(i, s.col);
    }
    splats.instanceMatrix.needsUpdate = true; if (splats.instanceColor) splats.instanceColor.needsUpdate = true;
  }
  function clear() { for (const w of warns) { w.left = 0; w.g.visible = false; } for (const s of spl) s.life = 0; }
  group.visible = false;
  return { group, update, warn, updateWarns, splat, updateSplats, clear, setVisible: v => { group.visible = v; } };
}
