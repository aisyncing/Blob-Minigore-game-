// The camera: a steady shot of the turntable on the character select; in play a tilted chase camera that leads where you move and aim,
// kicks back along each shot and shakes on heavy impacts.
import * as THREE from 'three';
import { clamp } from '../engine/math.js';
import { SHOW, R_TABLE } from './turntable.js';

export function createCameraRig(stage) {
  const focus = new THREE.Vector3(SHOW.x, 0, SHOW.z), _t = new THREE.Vector3();
  const ck = { x: 0, z: 0, vx: 0, vz: 0 };            // shot kick: a spring that settles back
  let shake = 0;
  return {
    /** Kick the view against a shot (velocity, units/s). */
    kick(vx, vz) { ck.vx += vx; ck.vz += vz; },
    /** Shake at least this hard (it decays by itself). */
    shake(amount) { shake = Math.max(shake, amount); },
    decay(dt) { shake = Math.max(0, shake - dt * 3); },
    /**
     * mode 'compare': hold on the turntable's front slot. mode 'play': follow the player.
     * play: { player, reach (0..1 how far the aim is pushed), mouseAim, mouse, P (cam.* tuning) }
     */
    update(dt, mode, play) {
      const cam = stage.camera;
      if (mode === 'compare') {
        // the table turns the chosen design to a fixed front slot, so the camera just holds steady on it; narrow screens zoom in a touch
        const asp = cam.aspect, dist = clamp(11.5 / Math.min(asp, 1), 11.5, 17);
        focus.lerp(_t.set(SHOW.x, 1.25, SHOW.z + R_TABLE * 0.35), 1 - Math.exp(-8 * dt));
        cam.position.set(focus.x, 4.0 + (dist - 15.5) * 0.15, focus.z + dist); cam.lookAt(focus.x, 1.15, focus.z); stage.lightFollow(SHOW.x, SHOW.z); return;
      }
      const { player, P } = play;
      const reach = player.hasAim ? (play.mouseAim ? clamp(Math.hypot(play.mouse.x - player.x, play.mouse.y - player.y) / 9, 0, 1) : play.aimMag || (player.assistTarget ? 0.6 : 0)) : 0;
      const tx = player.x + player.vx * P.camVelLead + player.aimX * P.camAimLead * reach;
      const tz = player.y + player.vy * P.camVelLead + player.aimY * P.camAimLead * reach;
      focus.lerp(_t.set(tx, 0, tz), 1 - Math.exp(-P.camFollow * dt));
      ck.vx += (-130 * ck.x - 13 * ck.vx) * dt; ck.vz += (-130 * ck.z - 13 * ck.vz) * dt; ck.x += ck.vx * dt; ck.z += ck.vz * dt;   // camera kick settles back
      const tilt = P.camTilt * Math.PI / 180, dist = P.camDist, k = cam.aspect < 1.25 ? 1.25 / cam.aspect : 1;
      const sx = (Math.random() - 0.5) * shake * 0.4 + ck.x, sz = (Math.random() - 0.5) * shake * 0.4 + ck.z;
      cam.position.set(focus.x + sx, Math.sin(tilt) * dist * k, focus.z + Math.cos(tilt) * dist * k + sz); cam.lookAt(focus.x, 0, focus.z);
      stage.lightFollow(focus.x, focus.z);
    },
  };
}
