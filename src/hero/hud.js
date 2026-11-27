// The on-screen HUD during a survival run: the health bar (top left) and the wave banner (top centre). Drawing only;
// the numbers behind the bar come from src/game/healthbar.js and the waves from src/game/waves.js.
import { createHealthBar } from '../game/healthbar.js';

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2s-7.9-4.8-10-9.6C.8 8.5 2.6 4.4 6.5 4.4c2.1 0 3.7 1.1 5.5 3.1 1.8-2 3.4-3.1 5.5-3.1 3.9 0 5.7 4.1 4.5 7.2-2.1 4.8-10 9.6-10 9.6z"/></svg>';

export function createHud(host) {
  const root = document.createElement('div'); root.id = 'hud';
  root.innerHTML = `
    <div id="hp" role="img" aria-label="Health">
      <div class="hp-badge">${HEART}</div>
      <div class="hp-track">
        <div class="hp-ghost"></div>
        <div class="hp-fill"><i class="hp-shine"></i></div>
        <div class="hp-ticks"></div>
        <div class="hp-flash"></div>
      </div>
    </div>
    <div id="banner"><div class="b-small"></div><div class="b-big"></div></div>
    <div id="note"></div>`;
  host.appendChild(root);
  const q = s => root.querySelector(s), hp = q('#hp'), fill = q('.hp-fill'), ghost = q('.hp-ghost'), flash = q('.hp-flash'), ticks = q('.hp-ticks'), badge = q('.hp-badge');
  const banner = q('#banner'), small = q('.b-small'), big = q('.b-big'), note = q('#note');
  badge.addEventListener('animationend', e => { if (e.animationName === 'hppop') badge.classList.remove('pop'); });
  const bar = createHealthBar(); let drawnMax = 0, hideIn = 0, noteIn = 0, t = 0, lastCrit = null;

  function buildTicks(max) {
    if (max === drawnMax) return; drawnMax = max; ticks.innerHTML = '';
    for (let k = 1; k < max; k++) { const i = document.createElement('i'); i.style.left = (k / max * 100) + '%'; ticks.appendChild(i); }   // one notch per hit you can take
  }
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }   // replay a CSS animation

  return {
    bar,
    /** a fresh run: full bar, nothing animating */
    reset(hp, max) { bar.reset(hp, max); buildTicks(max); banner.classList.remove('show'); note.classList.remove('show'); hideIn = noteIn = 0; draw(); },
    /** health changed (a hit) */
    setHealth(hp, max) { buildTicks(max); bar.set(hp, max); if (bar.state.flash === 1) restart(badge, 'pop'); },
    countdown(n, wave) { small.textContent = `WAVE ${wave} STARTING IN`; big.textContent = n; big.className = 'b-big count'; restart(big, 'tick'); banner.classList.add('show'); hideIn = 0; },
    wave(n) { small.textContent = 'SURVIVE'; big.textContent = `WAVE ${n}`; big.className = 'b-big title'; restart(big, 'slam'); banner.classList.add('show'); hideIn = 2.4; },
    hideBanner() { banner.classList.remove('show'); hideIn = 0; },
    /** a short line near the bottom of the screen (a new weapon) */
    note(text, secs = 3.6) { note.textContent = text; restart(note, 'in'); note.classList.add('show'); noteIn = secs; },
    update(dt) { t += dt; const s = bar.update(dt); if (hideIn > 0 && (hideIn -= dt) <= 0) banner.classList.remove('show'); if (noteIn > 0 && (noteIn -= dt) <= 0) note.classList.remove('show'); draw(s); },
    get critical() { return bar.state.critical; },
  };

  function draw(s = bar.state) {
    fill.style.setProperty('--f', s.frac.toFixed(4)); ghost.style.setProperty('--f', s.ghost.toFixed(4));
    flash.style.opacity = s.flash.toFixed(3);
    const jolt = s.shake > 0.001 ? Math.sin(t * 70) * s.shake * 8 : 0; hp.style.transform = jolt ? `translateX(${jolt.toFixed(2)}px)` : '';
    if (s.critical !== lastCrit) { lastCrit = s.critical; hp.classList.toggle('critical', s.critical); }
  }
}
