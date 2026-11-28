// The first-run lesson's prompt: a card under the hero showing the control to use (controller art, or keys and mouse for keyboard players).
// The animations are CSS, so they run at full speed while the game itself is slowed. Writes the DOM only when something changed.
import * as THREE from 'three';
import { $ } from './page.js';

const CAP = { move: 'Move', shoot: 'Shoot' };
const FEET_GAP = 46;                                   // px between the hero's feet and the card
const BOTTOM_KEEP = 130;                               // px kept clear at the bottom for the ammo display

export function createTutorialView(camera) {
  const el = $('#tutorial'), cap = el.querySelector('.cap'), card = el.querySelector('.card');
  const last = {}, put = (k, v, write) => { if (last[k] !== v) { last[k] = v; write(v); } };
  const _v = new THREE.Vector3();
  let device = null;                                   // the device the player last used: 'pad' | 'kb'
  return {
    /** stage: the tutorial's stage; snap: the input snapshot; player: {x, y} on the ground */
    update(stage, player, snap) {
      const show = stage === 'move' || stage === 'shoot';
      put('show', show, v => el.classList.toggle('show', v));
      if (!show) return;                               // during the pause between the two steps the card fades out on its last picture
      if (snap.source === 'keyboard') device = 'kb'; else if (snap.source === 'controller') device = 'pad';
      put('dev', device || (snap.pad?.connected ? 'pad' : 'kb'), v => { el.dataset.dev = v; });
      put('step', stage, v => { el.dataset.step = v; cap.textContent = CAP[v]; });
      _v.set(player.x, 0, player.y).project(camera);
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const h = card.offsetHeight, half = card.offsetWidth / 2;
      const x = Math.round(Math.min(innerWidth - half - 8, Math.max(half + 8, sx))), y = Math.round(Math.min(innerHeight - h - BOTTOM_KEEP, Math.max(72, sy + FEET_GAP)));
      put('pos', x + ',' + y, () => { el.style.transform = `translate(${x}px,${y}px)`; });
    },
  };
}
