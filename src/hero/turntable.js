// The character select: the three designs stand on a turntable that spins so the chosen one settles at a fixed front slot, each with
// its name floating above its head. While waiting there they walk, strafe, idle and reload in place so they can be judged in motion.
import * as THREE from 'three';
import { wrapAngle } from '../engine/math.js';

export const SHOW = { x: 0, z: 90 };                  // the stage lives far from the arena
export const R_TABLE = 4.3;                           // radius of the circle the designs stand on
const SLOT = n => Math.PI * 2 / n;
const LABEL_Y = 1.95;                                 // label height above the ground, clear of the tallest head piece

/** Idle demo motion for design i at time t: stand and look around, walk, then walk while aiming and reloading. */
export function demoState(i, t) {
  const c = (t + i * 1.3) % 9, heading = t * 0.5 + i * 2.1;
  if (c < 3) return { vx: 0, vy: 0, speed: 0, aimYaw: Math.sin(t * 0.9 + i) * 0.55, reload: -1 };
  const sp = 5.5, rl = c > 7.4 ? (c - 7.4) / 1.2 : -1;
  if (c < 6) return { vx: Math.sin(heading) * sp, vy: Math.cos(heading) * sp, speed: sp, aimYaw: null, reload: -1 };
  return { vx: Math.sin(heading) * sp, vy: Math.cos(heading) * sp, speed: sp, aimYaw: Math.sin(t * 1.6) * 1.3, reload: rl };
}

/**
 * @param heroes   Hero instances, one per design (positioned by this module while the turntable is shown)
 * @param labels   element the floating name labels are added to
 */
export function createTurntable({ scene, camera, heroes, labels }) {
  const slot = SLOT(heroes.length);
  let angle = 0;
  // the whole disc (floor + pedestals) spins with the designs
  const group = new THREE.Group(); group.position.set(SHOW.x, 0, SHOW.z); scene.add(group);
  {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshToonMaterial({ color: '#1a2a28' })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
    heroes.forEach((h, i) => { const a = i * slot, p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 28), new THREE.MeshToonMaterial({ color: '#5d697b' })); p.position.set(Math.sin(a) * R_TABLE, 0.15, Math.cos(a) * R_TABLE); p.receiveShadow = p.castShadow = true; group.add(p); });
  }
  const light = new THREE.PointLight('#ffb347', 70, 22, 2); light.position.set(SHOW.x, 5, SHOW.z + 4); scene.add(light);           // fixed over the front slot, so it doesn't swing with the table
  // a ring fixed at the front slot: whichever design the table has turned to is the one you'll play
  const pick = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.05, 40), new THREE.MeshBasicMaterial({ color: '#ff6fb1', transparent: true, opacity: 0.9 })); pick.rotation.x = -Math.PI / 2; pick.position.set(SHOW.x, 0.01, SHOW.z + R_TABLE); scene.add(pick);
  const nameEls = heroes.map(h => { const el = document.createElement('div'); el.className = 'tname'; el.textContent = h.d.name; labels.appendChild(el); return el; });
  const _p = new THREE.Vector3();

  return {
    setVisible(v) { group.visible = pick.visible = v; labels.style.display = v ? 'block' : 'none'; },
    /** The designs were spun to face round the table; give them back a plain heading for play. */
    release() { for (const h of heroes) h.root.rotation.y = 0; },
    /**
     * Turn toward the selected design and animate all of them. `view` is the canvas rect in CSS pixels.
     * P is the hero animation tuning, clock the scene time.
     */
    update(dt, clock, selected, P, view) {
      angle += wrapAngle(-selected * slot - angle) * (1 - Math.exp(-7 * dt)); group.rotation.y = angle;
      heroes.forEach((h, i) => {
        const a = i * slot + angle, wx = SHOW.x + Math.sin(a) * R_TABLE, wz = SHOW.z + Math.cos(a) * R_TABLE;
        h.update(dt, { x: wx, y: wz, ...demoState(i, clock) }, P); h.root.rotation.y = a;
        const front = (Math.cos(a) + 1) / 2;                                 // 1 facing the camera, 0 at the back of the table
        _p.set(wx, LABEL_Y, wz).project(camera);
        const el = nameEls[i];
        if (_p.z > 1 || _p.z < -1) { el.style.display = 'none'; return; }
        el.style.display = 'block'; el.style.left = (view.left + (_p.x * 0.5 + 0.5) * view.width) + 'px'; el.style.top = (view.top + (-_p.y * 0.5 + 0.5) * view.height) + 'px';
        el.style.opacity = (0.3 + 0.7 * front).toFixed(2); el.style.transform = `translate(-50%,-100%) scale(${(0.7 + 0.4 * front).toFixed(2)})`;
      });
    },
  };
}
