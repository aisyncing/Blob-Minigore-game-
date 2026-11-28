// The in-game HTML overlay: shells and reload bar, hearts, score and combo, wave counter, the wave banner, the game-over panel and the
// arrows at the screen edge that point to critters you cannot see. Reads game state; writes the DOM only when something changed.
import * as THREE from 'three';
import { $ } from './page.js';
import { PALETTE } from './critter.js';

const HEART = '<svg viewBox="0 0 24 22" width="26" height="24"><path d="M12 21C5 15 1 11.5 1 7a5.5 5.5 0 0 1 11-1.2A5.5 5.5 0 0 1 23 7c0 4.500-4 8-11 14z"/></svg>';
const ARROWS = 14;

export function createHud(camera) {
  const el = { ammo: $('#ammo'), shells: $('#shells'), reload: $('#reloadBar i'), hud: $('#hud'), arrows: $('#arrows'), hearts: $('#hearts'), score: $('#scoreV'), combo: $('#comboV'), wave: $('#waveV'),
    banner: $('#banner'), over: $('#over'), overStats: $('#overStats'), overBest: $('#overBest') };
  const arrowEls = Array.from({ length: ARROWS }, () => { const a = document.createElement('i'); el.arrows.appendChild(a); return { a, shown: false, color: '' }; });
  const last = {};                                        // what is on screen now, so unchanged values are not written again
  const put = (k, v, write) => { if (last[k] !== v) { last[k] = v; write(v); } };
  const _pv = new THREE.Vector3();

  function arrows(critters, player) {
    // arrows at the screen edge point to critters you cannot see yet, nearest first
    const W = innerWidth, H = innerHeight, off = [];
    for (const c of critters) { if (c.state === 'dead') continue; _pv.set(c.x, 0.6, c.y).project(camera); const sx = (_pv.x * 0.5 + 0.5) * W, sy = (-_pv.y * 0.5 + 0.5) * H; if (_pv.z > 1 || sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) off.push({ c, d: Math.hypot(c.x - player.x, c.y - player.y), sx: _pv.z > 1 ? W - sx : sx, sy: _pv.z > 1 ? H - sy : sy }); }
    off.sort((a, b) => a.d - b.d);
    arrowEls.forEach((s, i) => {
      const o = off[i]; if (!o) { if (s.shown) { s.shown = false; s.a.style.display = 'none'; } return; }
      const cx = W / 2, cy = H / 2, dx = o.sx - cx, dy = o.sy - cy, k = Math.min((W / 2 - 26) / Math.abs(dx || 1e-6), (H / 2 - 26) / Math.abs(dy || 1e-6));
      if (!s.shown) { s.shown = true; s.a.style.display = 'block'; }
      s.a.style.transform = `translate(${cx + dx * k}px,${cy + dy * k}px) rotate(${Math.atan2(dy, dx)}rad)`; s.a.style.opacity = o.c.state === 'chase' ? String(Math.max(0.35, 1 - o.d / 40)) : '0.35';
      const col = PALETTE[o.c.tier].body; if (s.color !== col) { s.color = col; s.a.style.background = col; }
    });
  }

  return {
    setVisible(v) { el.ammo.style.display = v ? 'flex' : 'none'; },
    /** Forget what is on screen (a new run): every value is written again on the next update. */
    reset() { for (const k of Object.keys(last)) if (k !== 'shellCap') delete last[k]; },
    ammo(gun, capacity) {
      put('shellCap', capacity, cap => { el.shells.innerHTML = '<i></i>'.repeat(cap); delete last.ammoN; });
      put('ammoN', gun.state.ammo, n => { [...el.shells.children].forEach((s, i) => s.classList.toggle('on', i < n)); });
      put('reloadW', gun.reloading ? gun.progress * 100 + '%' : '0%', w => { el.reload.style.width = w; });
      put('reloading', gun.reloading, r => { el.ammo.classList.toggle('reloading', r); });
    },
    /** inRun: survival (the practice range has no hearts or score). playing: not on the game-over screen. */
    update({ inRun, playing, health, score, director, critters, player }) {
      put('hudShown', inRun, v => { el.hud.style.display = v ? 'flex' : 'none'; });
      put('arrowsShown', inRun && playing, v => { el.arrows.style.display = v ? 'block' : 'none'; });
      if (!inRun) return;
      const hp = health.state.hp; put('hp', hp, () => { el.hearts.innerHTML = Array.from({ length: health.state.max }, (_, i) => `<span class="heart${i < hp ? '' : ' off'}">${HEART}</span>`).join(''); });
      put('points', score.state.points, p => { el.score.textContent = p.toLocaleString(); });
      put('combo', score.state.chain >= 2 ? `x${score.mult} · ${score.state.chain} chain` : '', c => { el.combo.textContent = c; });
      const left = critters.reduce((n, c) => n + (c.state === 'dead' ? 0 : 1), 0) + director.state.queue.length, w = director.state.wave;
      put('wave', w ? `Wave ${w} · ${left} left` : 'Get ready', t => { el.wave.textContent = t; });
      arrows(critters, player);
    },
    banner(title, sub = '') { const b = el.banner; b.querySelector('b').textContent = title; b.querySelector('small').textContent = sub; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); },
    showOver(stats, best) { el.overStats.textContent = stats; el.overBest.textContent = best; el.over.classList.add('show'); },
    hideOver() { el.over.classList.remove('show'); },
  };
}
