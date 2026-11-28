// The tuning panel and the controller setup screen's controls: sliders, presets, the vibration / adaptive-trigger test buttons,
// "copy my settings", the collider debug toggle and the diagnostics readout. UI only: it changes tuning values and calls back into the game.
import { $, fmt } from './page.js';
import { DEFS, PRESETS, HIDDEN_IN_GAME, tuning } from '../tuning.js';
import { moveStats } from '../game/movement.js';
import { TRIGGER_FEEL } from '../input/haptics.js';
import * as audio from '../engine/audio.js';

const VIBES = ['fx.rumble', 'fx.vibAll', 'fx.vibShoot', 'fx.vibReload', 'fx.vibWalk', 'fx.smartRumble', 'fx.triggers'];

/**
 * @param ctx { snap, haptics, dualsense, arena, stats, pellets, player, hero(): Hero, mode(): string, setupUp(): bool, frameTimes: number[], steps(): number, onResetRange() }
 */
export function createPanel(ctx) {
  const { snap, haptics, dualsense } = ctx;
  // tuning sliders, selects and toggles, grouped in collapsible sections
  const sync = [];
  function addControls(host, defs, openGroups = []) {
    for (const g of [...new Set(defs.map(d => d.group))]) {
      let det = host;                                                         // a group with no name is just a plain list of rows
      if (g) { det = document.createElement('details'); det.open = openGroups.includes(g) || !openGroups.length; det.innerHTML = `<summary>${g}</summary>`; host.appendChild(det); }
      for (const d of defs.filter(x => x.group === g)) {
        const row = document.createElement('div'); row.className = 'row'; det.appendChild(row);
        if (d.kind === 'select') {
          row.innerHTML = `<span>${d.label}</span><select>${d.options.map((o, i) => `<option value="${i}">${o}</option>`).join('')}</select><span></span>`;
          const sel = $('select', row); sel.onchange = () => tuning.set(d.key, +sel.value); sync.push(() => { sel.value = tuning.get(d.key); });
        } else if (d.kind === 'toggle') {
          row.innerHTML = `<span>${d.label}</span><input type="checkbox"><span></span>`; const cb = $('input', row); cb.onchange = () => tuning.set(d.key, cb.checked ? 1 : 0); sync.push(() => { cb.checked = tuning.get(d.key) > 0.5; });
        } else {
          row.innerHTML = `<span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}"><span class="v"></span>`;
          const inp = $('input', row), val = $('.v', row);
          const s = () => { inp.value = tuning.get(d.key); val.textContent = fmt(tuning.get(d.key), d.step < 0.01 ? 3 : d.step < 1 ? 2 : 0); };
          inp.addEventListener('input', () => { tuning.set(d.key, parseFloat(inp.value)); }); sync.push(s);
        }
      }
    }
    sync.forEach(f => f());
  }
  const gameDefs = DEFS.filter(d => d.page === 'hero' && !HIDDEN_IN_GAME.has(d.key) && !VIBES.includes(d.key));
  addControls($('#sliders'), gameDefs, ['Movement', 'Shotgun']);
  addControls($('#vibSliders'), VIBES.map(k => ({ ...DEFS.find(d => d.key === k), group: '' })).map(d => ({ ...d, label: d.label.replace(/^Vibration: /, '').replace(' (0-10)', '').replace(/^./, c => c.toUpperCase()) })));
  addControls($('#inputSliders'), DEFS.filter(d => d.page === undefined && d.group !== 'Feel pad' && !HIDDEN_IN_GAME.has(d.key)));
  function updateStats() {
    const m = { maxSpeed: tuning.get('move.maxSpeed'), accel: tuning.get('move.accel'), brake: tuning.get('move.brake'), turnAccel: tuning.get('move.turnAccel') }, s = moveStats(m);
    $('#stats').innerHTML = `to top speed <b>${fmt(s.timeToTop, 2)} s</b> · stop <b>${fmt(s.stopTime, 2)} s</b> (<b>${fmt(s.stopDistance, 2)}</b> u)<br>reverse <b>${fmt(s.reverseTime, 2)} s</b> · arena crossing <b>${fmt(48 / m.maxSpeed, 1)} s</b>`;
  }
  tuning.onChange(() => { sync.forEach(f => f()); updateStats(); audio.setVolume(tuning.get('fx.volume')); });
  audio.setVolume(tuning.get('fx.volume'));
  { const host = $('#presets'); for (const [name, vals] of Object.entries(PRESETS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => tuning.apply(vals); host.appendChild(b); } }
  updateStats();
  $('#bReset').onclick = () => tuning.reset(d => d.page !== 'lab');       // only what this page shows; the lab's pad settings are kept
  $('#bRange').onclick = () => ctx.onResetRange();

  /* controller feel panel */
  {
    const status = t => { $('#dsStatus').textContent = t; };
    status(dualsense.supported
      ? 'Adaptive triggers: not connected. Best with a USB cable: plug the controller in, press Connect, and pick the DualSense in the list. Bluetooth may work too: try the layouts and the tests below.'
      : 'Adaptive triggers need WebHID, which this browser does not have (use Chrome or Edge). Rumble still works.');
    $('#bDs').onclick = async () => { audio.unlock(); await dualsense.connect(); };
    $('#dsLayout').onchange = e => dualsense.setTransport(e.target.value);
    $('#feel').addEventListener('toggle', () => { $('#dsRumble').textContent = snap.pad.connected ? (snap.pad.rumble ? 'Browser rumble: available for this controller.' : 'Browser rumble: not available.') : 'Press a button on the controller so the browser can see it.'; });
    $('#bRamp').onclick = () => {                      // raw strength steps, ignoring every slider: shows how the motors really respond
      const steps = [0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1]; let i = 0; haptics.hold(0);
      const next = () => { if (i >= steps.length) { $('#dsRumble').textContent = 'Ramp done. Which step did you first feel, and when did it stop getting stronger?'; return; }
        const v = steps[i++]; $('#dsRumble').textContent = `Step ${i} of ${steps.length}: ${Math.round(v * 100)}%`; if (!dualsense.motors(v, v, 600)) snap.pad.rumble?.(v, v, 600); setTimeout(next, 1100); };
      next();
    };
    for (const b of document.querySelectorAll('[data-rt]')) b.onclick = () => {
      const k = b.dataset.rt; if (k === 'reload') { [['eject', 0], ['grab', 220], ['insert', 520], ['close', 820]].forEach(([n, t]) => setTimeout(() => haptics.reload(n), t)); } else haptics.play(k);
      $('#dsRumble').textContent = snap.pad.connected && snap.pad.rumble ? 'Sent to the controller.' : 'No controller rumble available: press a button on the controller first.';
    };
    for (const b of document.querySelectorAll('[data-tt]')) b.onclick = () => {
      if (!dualsense.connected) { status('Connect adaptive triggers first (button above).'); return; }
      haptics.hold(6000); dualsense.retry(); dualsense.set({ right: TRIGGER_FEEL[b.dataset.tt], left: { effect: 'off' } });
    };
  }
  $('#bCopy').onclick = async () => {
    const text = JSON.stringify({ design: ctx.hero().d.name, tuning: tuning.snapshot() }, null, 1); const box = $('#copyBox'); box.hidden = false; box.value = text; box.select();
    try { await navigator.clipboard.writeText(text); $('#bCopy').textContent = 'Copied!'; } catch { $('#bCopy').textContent = 'Select and copy below'; } setTimeout(() => ($('#bCopy').textContent = 'Copy my settings'), 2000);
  };
  $('#bHide').onclick = () => $('#panel').classList.add('collapsed'); $('#panelBtn').onclick = () => $('#panel').classList.remove('collapsed');
  $('#dbg').onchange = e => { ctx.arena.debug.visible = e.target.checked; };
  $('#panel').classList.add('collapsed');

  /** The readouts: connection state on the setup screen, input source, frame timing and the last shot. A few times a second is plenty. */
  function diag() {
    const ft = ctx.frameTimes, { stats, player, pellets } = ctx;
    const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), sorted = ft.slice().sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const src = snap.source === 'controller' ? 'controller' : snap.mouseAim ? 'keyboard + mouse' : snap.source === 'keyboard' ? 'keyboard' : 'waiting';
    if (ctx.setupUp()) {
      const c = snap.pad.connected, name = c ? String(snap.pad.id || 'Controller').replace(/\s*\(.*$/, '').slice(0, 48) : 'No controller found';
      $('#connName').textContent = name; $('#conn').classList.toggle('ok', c);
      $('#connSub').textContent = c ? (dualsense.connected ? 'Connected. Adaptive triggers and vibration are on.' : 'Connected. Use "Connect adaptive triggers" for the PS5 trigger feel.') : 'Press any button on your controller so the browser can see it.';
    }
    $('#chipSrc').textContent = src === 'controller' ? 'Controller' : 'Keyboard + mouse'; $('#chipSrc').classList.toggle('ok', src === 'controller');
    const h = ctx.hero(); let extra = '';
    if ($('#dbg').checked && ctx.mode() === 'play') { const dAng = Math.abs(((h.aimYaw - h.legYaw) * 180 / Math.PI + 540) % 360 - 180); extra = `<br>speed <b>${fmt(player.speed, 2)}</b> u/s · legs vs gun <b>${fmt(dAng, 0)}°</b> · pos <b>${fmt(player.x, 1)}, ${fmt(player.y, 1)}</b><br>pellets in flight <b>${pellets.pellets.length}</b>`; }
    $('#diag').innerHTML = `frame <b>${fmt(avg, 1)}</b> ms · p95 <b>${fmt(p95, 1)}</b> · fps <b>${fmt(1000 / Math.max(0.1, avg), 0)}</b><br>sim <b>120 Hz</b> fixed · steps/frame <b>${ctx.steps()}</b> · input <b>${src}</b>${extra}`;
    const l = stats.last;
    $('#shotStat').innerHTML = l
      ? `pellets hit <b>${l.hits}/${l.fired}</b> · damage <b>${fmt(l.damage, 0)}</b>${l.kills ? ' · <b>kill</b>' : ''}<br>closest hit <b>${Number.isFinite(l.nearest) ? fmt(l.nearest, 1) + ' u' : '-'}</b> · counted as pellets land<br>session: <b>${stats.shots}</b> shots · accuracy <b>${fmt(stats.hits / Math.max(1, stats.pellets) * 100, 0)}%</b> · damage <b>${fmt(stats.damage, 0)}</b> · kills <b>${stats.kills}</b>`
      : 'Fire at a dummy. Close blasts hit hard, far ones chip.';
  }
  return { diag };
}
