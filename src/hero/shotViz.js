// What the player sees of their aim and their shots: the spread cone (outer = range, inner = full-damage zone), the mouse crosshair,
// and every pellet in flight as a lead ball with a hot trail. Reads the simulation, never changes it.
import * as THREE from 'three';
import { clamp } from '../engine/math.js';

const MAXP = 160;                                       // pellets drawn at once

export function createShotVisuals(scene) {
  const aimGroup = new THREE.Group(); scene.add(aimGroup);
  function makeCone(a0, a1, col) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const c = new THREE.Color(col); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([c.r, c.g, c.b, a0, c.r, c.g, c.b, a1, c.r, c.g, c.b, a1]), 4));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 2; m.frustumCulled = false; aimGroup.add(m);
    return { mesh: m, set(half, len) { const p = g.attributes.position, w = Math.tan(half) * len; p.setXYZ(0, 0, 0.05, 0); p.setXYZ(1, -w, 0.05, len); p.setXYZ(2, w, 0.05, len); p.needsUpdate = true; } };
  }
  const coneOuter = makeCone(0.2, 0.0, '#ffd23f'), coneInner = makeCone(0.42, 0.06, '#fff2b0');
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false })); cross.rotation.x = -Math.PI / 2; cross.position.y = 0.06; scene.add(cross);
  // each pellet is a small lead ball with a hot trail behind it; the trail cools from white-orange to dull as the pellet loses energy
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: '#e6e9ef' }), MAXP);
  const trailGeo = new THREE.BoxGeometry(0.06, 0.06, 1);                                       // brightness runs from 1 at the head (+z) to 0 at the tail, so it reads as a streak, not a rod
  { const pos = trailGeo.attributes.position, col = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const k = Math.pow(pos.getZ(i) + 0.5, 1.6); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; } trailGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const trails = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXP);
  for (const o of [balls, trails]) { o.frustumCulled = false; o.count = 0; scene.add(o); }
  trails.setColorAt(0, new THREE.Color(1, 1, 1));

  const _col = new THREE.Color(), _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  function updatePellets(list) {
    // colour cools with distance flown (hot = near the muzzle)
    let n = 0; for (const p of list) { if (n >= MAXP) break;
      const f = clamp(p.traveled / p.opts.range, 0, 1), len = 0.5 + 0.9 * (1 - f * 0.6); _e.set(0, Math.atan2(p.dx, p.dy), 0); _q.setFromEuler(_e);
      _p.set(p.x, 0.8, p.y); _s.set(1, 1, 1); _mat.compose(_p, _q, _s); balls.setMatrixAt(n, _mat);
      _p.set(p.x - p.dx * len / 2, 0.8, p.y - p.dy * len / 2); _s.set(1, 1, len); _mat.compose(_p, _q, _s); trails.setMatrixAt(n, _mat);
      _col.setRGB(1 - f * 0.55, 0.85 - f * 0.55, 0.45 - f * 0.3); trails.setColorAt(n, _col); n++; }
    balls.count = trails.count = n; balls.instanceMatrix.needsUpdate = trails.instanceMatrix.needsUpdate = true; if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
  }

  return {
    setVisible(v) { aimGroup.visible = cross.visible = v; balls.visible = trails.visible = v; },
    /**
     * @param player  sim player (x, y, aimX, aimY, hasAim)   aiming: show the cone   mouseAim/mouse: the crosshair
     * @param P       gun tuning (spread, range, falloffStart)   reach: muzzle distance in front of the body
     */
    update({ player, aiming, mouseAim, mouse, P, reach, pellets }) {
      aimGroup.visible = aiming; aimGroup.position.set(player.x, 0, player.y); aimGroup.rotation.y = Math.atan2(player.aimX, player.aimY);
      coneOuter.mesh.position.z = coneInner.mesh.position.z = reach; coneOuter.set(P.spread, P.range); coneInner.set(P.spread, P.falloffStart);
      cross.visible = mouseAim; cross.position.set(mouse.x, 0.06, mouse.y);
      const cd = Math.hypot(mouse.x - player.x, mouse.y - player.y); cross.scale.setScalar(clamp(Math.tan(P.spread) * Math.max(0, cd - reach), 0.45, 4) / 0.36);
      updatePellets(pellets);
    },
    updatePellets,
  };
}
