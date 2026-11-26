// Iteration 0: Controller lab.
// Goal: prove the controller works and tune stick feel before any game exists.
import { shapeStick, curveAt, analyseRest, createDriftSession, clamp, mouseAim } from '../input/process.js';
import { BUTTON_NAMES } from '../input/pad.js';
import { createInput } from '../input/source.js';
import { DEFS, tuning } from '../tuning.js';

const SIM_STEP = 1 / 120;
const $ = (s, r = document) => r.querySelector(s);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

/* ------------------------------ page ------------------------------ */
const LAB_DEFS = DEFS.filter(d => d.page !== 'hero');
const groups = [...new Set(LAB_DEFS.map(d => d.group))];
$('#app').innerHTML = `
<header>
  <h1>Controller Lab<small>Iteration 0 · input feel</small></h1>
  <span class="chip" id="chipSrc">Looking for a controller</span>
  <span class="chip" id="chipId" hidden></span>
</header>
<div class="grid">
  <div class="col">
    <section class="panel">
      <h2>Sticks</h2>
      <div class="sticks">
        <div class="stick"><canvas id="cvL"></canvas><div class="num" id="nL"></div></div>
        <div class="stick"><canvas id="cvR"></canvas><div class="num" id="nR"></div></div>
      </div>
      <div class="legend">
        <span><i style="background:#8fa5a6"></i>raw</span><span><i style="background:#ff6fb1"></i>after shaping</span>
        <span><i style="background:#ff6b6b55"></i>inner deadzone</span><span><i style="background:#ffd23f"></i>outer</span>
      </div>
      <div class="trig" id="tLT"><span>LT</span><div class="bar"><b></b></div><span class="num"></span></div>
      <div class="trig" id="tRT"><span>RT</span><div class="bar"><b></b><u></u><s></s></div><span class="num"></span></div>
      <div class="hint" id="trigEff"></div>
      <div class="btns" id="btns"></div>
    </section>
    <section class="panel curve">
      <h2>Response curves</h2>
      <canvas id="cvCurve"></canvas>
      <div class="hint">Horizontal: how far you push. Vertical: what the game sees. Dots show where each stick is now.</div>
    </section>
  </div>

  <div class="col">
    <section class="panel arena-wrap">
      <canvas id="arena"></canvas>
      <div class="hint" id="arenaHint"></div>
    </section>
    <section class="panel">
      <h2>Checks for you</h2>
      <div class="hint" style="margin:0">
        1. Leave both sticks alone: the pink dots must sit dead centre and the blob must not drift.<br>
        2. Push a stick very gently: you should get slow, fine movement, not a sudden jump.<br>
        3. Push fully and circle the rim: speed should be the same all the way round.<br>
        4. Flick the stick back to centre: the blob should stop right away.<br>
        5. Squeeze RT slowly: it should fire once at the gold marker and stop at the grey one.<br>
        6. Press <b>Rumble test</b>: you should feel it (Chrome and Edge only).<br><br>
        <b>No controller yet?</b> Use WASD to move, aim with the mouse and hold left click to fire. Checks 1 to 6 and the deadzone and curve sliders only apply to a controller. Keyboard and mouse input is digital (no gentle pushes) by nature, and mouse aim ignores deadzones.
      </div>
    </section>
  </div>

  <div class="col">
    <section class="panel" id="tunePanel">
      <h2>Tuning</h2>
      <div id="sliders"></div>
      <div class="actions">
        <button id="bDrift" class="primary">Measure drift</button>
        <button id="bRumble">Rumble test</button>
        <button id="bReset">Reset</button>
        <button id="bCopy">Copy my settings</button>
      </div>
      <div class="hint" id="driftOut"></div>
      <label class="chk"><input type="checkbox" id="rumbleFire"> Rumble while firing</label>
      <textarea id="copyBox" readonly hidden></textarea>
    </section>
    <section class="panel">
      <h2>Diagnostics</h2>
      <div class="diag" id="diag"></div>
      <canvas id="spark"></canvas>
    </section>
  </div>
</div>`;

/* ------------------------------ tuning panel ------------------------------ */
const sliderEls = {};
{
  const host = $('#sliders');
  for (const g of groups) {
    const h = document.createElement('div'); h.className = 'hint'; h.style.cssText = 'margin:10px 0 2px;color:var(--ink);font-weight:600'; h.textContent = g; host.appendChild(h);
    for (const d of LAB_DEFS.filter(x => x.group === g)) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<span>${d.label}</span><input type="range" id="s_${d.key}" min="${d.min}" max="${d.max}" step="${d.step}"><span class="v"></span>`;
      host.appendChild(row);
      const input = $('input', row), val = $('.v', row);
      const sync = () => { input.value = tuning.get(d.key); val.textContent = fmt(tuning.get(d.key), d.step < 0.01 ? 3 : 2); };
      input.addEventListener('input', () => { tuning.set(d.key, parseFloat(input.value)); sync(); });
      sliderEls[d.key] = sync; sync();
    }
  }
  tuning.onChange(k => { if (k === null) Object.values(sliderEls).forEach(f => f()); else sliderEls[k]?.(); });
}
$('#bReset').onclick = () => tuning.reset();
$('#bCopy').onclick = async () => {
  const text = JSON.stringify({ controller: lastPad?.id || 'keyboard', tuning: tuning.snapshot() }, null, 1);
  const box = $('#copyBox'); box.hidden = false; box.value = text; box.select();
  try { await navigator.clipboard.writeText(text); $('#bCopy').textContent = 'Copied!'; } catch { $('#bCopy').textContent = 'Select and copy below'; }
  setTimeout(() => ($('#bCopy').textContent = 'Copy my settings'), 2000);
};

/* ------------------------------ input ------------------------------ */
let lastPad = null;
const input = createInput({
  target: $('#arena'),
  toWorld: e => arenaWorld(e),
  origin: () => pad,
  lastAim: () => ({ x: pad.aimX, y: pad.aimY }),
  tuning,
});
const keys = input.keys, mouse = input.mouse;
// the lab keeps its original field names; they map onto the shared snapshot
const I = {
  get source() { return input.snap.source; }, get mouseAim() { return input.snap.mouseAim; },
  get leftRaw() { return input.snap.leftRaw; }, get rightRaw() { return input.snap.rightRaw; },
  get left() { return input.snap.move; }, get right() { return input.snap.aim; },
  get lt() { return input.snap.lt; }, get rt() { return input.snap.rt; }, get fire() { return input.snap.fire; }, get buttons() { return input.snap.buttons; },
};
function sampleInput(now) { const snap = input.sample(now); const p = snap.pad; lastPad = p.connected ? p : null; return p; }

/* ------------------------------ drift measurement ------------------------------ */
let drift = null;   // a createDriftSession: reads ONE identified pad's raw axes, never the keyboard or mouse
$('#bDrift').onclick = () => {
  drift = createDriftSession(lastPad || { connected: false }, performance.now(), 1500);
  $('#driftOut').textContent = drift.state === 'cancelled' ? drift.reason : 'Sampling this controller for 1.5 s. Do not touch its sticks.';
  if (drift.state === 'cancelled') drift = null;
};
function stepDrift(now, pad) {
  if (!drift) return;
  const st = drift.push(now, pad), out = $('#driftOut');
  if (st === 'cancelled') { out.textContent = drift.reason; drift = null; return; }
  if (st !== 'done') return;
  const session = drift, { left: l, right: r } = session.result; drift = null;
  out.innerHTML = `Rest drift: left <b>${fmt(l.max, 3)}</b>, right <b>${fmt(r.max, 3)}</b>. Suggested inner deadzone: left <b>${fmt(l.suggested)}</b>, right <b>${fmt(r.suggested)}</b>. `;
  const apply = document.createElement('button'); apply.textContent = 'Apply'; apply.className = 'primary';
  apply.onclick = () => {
    if (!session.canApply(lastPad || { connected: false })) { out.textContent = 'That controller is no longer connected, so nothing was applied. Measure again.'; return; }
    tuning.set('left.inner', l.suggested); tuning.set('right.inner', r.suggested); apply.remove();
  };
  out.appendChild(apply);
}

/* ------------------------------ rumble ------------------------------ */
let rumbleBusy = 0;
$('#bRumble').onclick = async () => {
  if (!lastPad || !lastPad.rumble) { $('#driftOut').textContent = 'No controller connected. Press a button on it first.'; return; }
  const r = await lastPad.rumble(0.9, 0.5, 400);
  $('#driftOut').textContent = r === 'ok' ? 'Rumble sent. Did you feel it?' : r === 'unsupported' ? 'This browser or controller does not report rumble support. Try Chrome or Edge.' : 'The controller refused the rumble request.';
};

/* ------------------------------ canvases ------------------------------ */
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext('2d'); g.setTransform(canvas.width / r.width, 0, 0, canvas.height / r.height, 0, 0);
  return { g, w: r.width, h: r.height };
}
function drawStick(canvas, raw, shaped, cfg) {
  const { g, w, h } = fit(canvas), c = w / 2, R = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#101b1b'; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,107,107,.30)'; g.beginPath(); g.arc(c, c, R * cfg.inner, 0, 7); g.fill();
  g.strokeStyle = '#2c3d42'; g.lineWidth = 1; g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
  g.strokeStyle = '#2c3d42'; g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke();
  g.strokeStyle = '#ffd23f'; g.setLineDash([4, 4]); g.beginPath(); g.arc(c, c, R * cfg.outer, 0, 7); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#8fa5a6'; g.lineWidth = 2; g.beginPath(); g.arc(c + raw.x * R, c + raw.y * R, 6, 0, 7); g.stroke();
  g.fillStyle = '#ff6fb1'; g.beginPath(); g.arc(c + shaped.x * R, c + shaped.y * R, 5, 0, 7); g.fill();
}
function drawCurves() {
  const { g, w, h } = fit($('#cvCurve')), pad = 22, pw = w - pad - 8, ph = h - pad - 8;
  g.clearRect(0, 0, w, h);
  const X = v => pad + v * pw, Y = v => 8 + (1 - v) * ph;
  g.strokeStyle = '#2c3d42'; g.lineWidth = 1; g.strokeRect(X(0), Y(1), pw, ph);
  g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
  for (const [side, col, raw] of [['left', '#6cc4ff', I.left.raw], ['right', '#ff6fb1', I.right.raw]]) {
    const cfg = tuning.stick(side); g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 80; i++) { const x = i / 80, y = curveAt(x, cfg); i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); }
    g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(X(clamp(raw, 0, 1)), Y(curveAt(clamp(raw, 0, 1), cfg)), 4, 0, 7); g.fill();
  }
  g.fillStyle = '#8fa5a6'; g.font = '10px ui-monospace,monospace'; g.fillText('push', X(0.46), h - 6); g.save(); g.translate(10, Y(0.35)); g.rotate(-Math.PI / 2); g.fillText('output', 0, 0); g.restore();
  g.fillStyle = '#6cc4ff'; g.fillText('left', X(0.78), Y(0.2)); g.fillStyle = '#ff6fb1'; g.fillText('right', X(0.78), Y(0.1));
}

/* ------------------------------ feel pad (direct stick-to-motion arena) ------------------------------ */
const ARENA = { w: 40, h: 24 };
const pad = { x: 0, y: 0, aimX: 1, aimY: 0, shots: [], trail: [], fireT: 0, speed: 0 };
const arenaEl = $('#arena');
function arenaWorld(e) { // pointer position -> arena units (matches drawArena's transform)
  const r = arenaEl.getBoundingClientRect(), sc = Math.min(r.width / ARENA.w, r.height / ARENA.h);
  return { x: (e.clientX - r.left - r.width / 2) / sc, y: (e.clientY - r.top - r.height / 2) / sc };
}
function simStep(dt) {
  const sp = tuning.get('pad.speed');
  pad.x = clamp(pad.x + I.left.x * sp * dt, -ARENA.w / 2 + 1, ARENA.w / 2 - 1);
  pad.y = clamp(pad.y + I.left.y * sp * dt, -ARENA.h / 2 + 1, ARENA.h / 2 - 1);
  pad.speed = I.left.mag * sp;
  if (I.mouseAim) { const a = mouseAim({ x: pad.x, y: pad.y }, mouse, { x: pad.aimX, y: pad.aimY }); pad.aimX = a.x; pad.aimY = a.y; }
  else if (I.right.mag > 0.02) { pad.aimX = I.right.x / I.right.mag; pad.aimY = I.right.y / I.right.mag; }
  else if (I.left.mag > 0.2) { pad.aimX = I.left.x / I.left.mag; pad.aimY = I.left.y / I.left.mag; }
  pad.fireT -= dt;
  if (I.fire && pad.fireT <= 0) {
    pad.fireT = 0.14; pad.shots.push({ x: pad.x, y: pad.y, ax: pad.aimX, ay: pad.aimY, age: 0 });
    if ($('#rumbleFire').checked && lastPad?.rumble && performance.now() - rumbleBusy > 120) { rumbleBusy = performance.now(); lastPad.rumble(0.35, 0.6, 60); }
  }
  for (const s of pad.shots) s.age += dt;
  pad.shots = pad.shots.filter(s => s.age < 0.18);
  if (frameCount % 3 === 0) { pad.trail.push({ x: pad.x, y: pad.y }); if (pad.trail.length > 36) pad.trail.shift(); }
}
function drawArena() {
  const { g, w, h } = fit($('#arena'));
  const s = Math.min(w / ARENA.w, h / ARENA.h), ox = w / 2, oy = h / 2;
  const X = v => ox + v * s, Y = v => oy + v * s;
  const grad = g.createRadialGradient(ox, oy, 10, ox, oy, w * 0.6); grad.addColorStop(0, '#1b2b2a'); grad.addColorStop(1, '#0e1717');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(180,210,200,.07)'; g.lineWidth = 1; g.beginPath();
  for (let x = -ARENA.w / 2; x <= ARENA.w / 2; x += 2) { g.moveTo(X(x), Y(-ARENA.h / 2)); g.lineTo(X(x), Y(ARENA.h / 2)); }
  for (let y = -ARENA.h / 2; y <= ARENA.h / 2; y += 2) { g.moveTo(X(-ARENA.w / 2), Y(y)); g.lineTo(X(ARENA.w / 2), Y(y)); }
  g.stroke();
  g.strokeStyle = '#3b5a52'; g.lineWidth = 3; g.strokeRect(X(-ARENA.w / 2), Y(-ARENA.h / 2), ARENA.w * s, ARENA.h * s);
  g.fillStyle = 'rgba(255,111,177,.35)';
  pad.trail.forEach((t, i) => { g.globalAlpha = i / pad.trail.length * 0.5; g.beginPath(); g.arc(X(t.x), Y(t.y), s * 0.5 * (i / pad.trail.length), 0, 7); g.fill(); });
  g.globalAlpha = 1;
  // aim line
  g.strokeStyle = 'rgba(255,210,63,.55)'; g.lineWidth = 2; g.setLineDash([6, 6]);
  g.beginPath(); g.moveTo(X(pad.x), Y(pad.y)); g.lineTo(X(pad.x + pad.aimX * 9), Y(pad.y + pad.aimY * 9)); g.stroke(); g.setLineDash([]);
  // shots
  for (const sh of pad.shots) {
    const k = 1 - sh.age / 0.18; g.strokeStyle = `rgba(255,236,160,${k})`; g.lineWidth = 6 * k + 1;
    g.beginPath(); g.moveTo(X(sh.x + sh.ax * 0.9), Y(sh.y + sh.ay * 0.9)); g.lineTo(X(sh.x + sh.ax * (3 + 6 * (1 - k))), Y(sh.y + sh.ay * (3 + 6 * (1 - k)))); g.stroke();
  }
  // crosshair at the mouse
  if (I.mouseAim) { const cx = X(mouse.x), cy = Y(mouse.y); g.strokeStyle = I.fire ? '#ff6fb1' : '#ffd23f'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.moveTo(cx - 15, cy); g.lineTo(cx - 5, cy); g.moveTo(cx + 5, cy); g.lineTo(cx + 15, cy); g.moveTo(cx, cy - 15); g.lineTo(cx, cy - 5); g.moveTo(cx, cy + 5); g.lineTo(cx, cy + 15); g.stroke(); }
  // blob
  const r = s * 0.7; g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(X(pad.x), Y(pad.y) + r * 0.7, r * 0.95, r * 0.4, 0, 0, 7); g.fill();
  g.fillStyle = '#ff6fb1'; g.beginPath(); g.arc(X(pad.x), Y(pad.y), r, 0, 7); g.fill();
  g.strokeStyle = '#2a1a24'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(pad.x) + pad.aimX * r * 0.6, Y(pad.y) + pad.aimY * r * 0.6); g.lineTo(X(pad.x) + pad.aimX * r * 1.5, Y(pad.y) + pad.aimY * r * 1.5); g.stroke();
  for (const sx of [-1, 1]) { const ex = X(pad.x) + pad.aimX * r * 0.35 - pad.aimY * sx * r * 0.3, ey = Y(pad.y) + pad.aimY * r * 0.35 + pad.aimX * sx * r * 0.3;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, r * 0.2, 0, 7); g.fill(); g.fillStyle = '#241838'; g.beginPath(); g.arc(ex + pad.aimX * r * 0.07, ey + pad.aimY * r * 0.07, r * 0.1, 0, 7); g.fill(); }
  g.fillStyle = '#8fa5a6'; g.font = '11px ui-monospace,monospace'; g.fillText(`speed ${fmt(pad.speed)} u/s`, 10, h - 10);
}

/* ------------------------------ frame stats + diagnostics ------------------------------ */
const ft = []; let frameCount = 0, stepsLast = 0, longFrames = 0, framedBy = false;
try { framedBy = window.self !== window.top; } catch { framedBy = true; }
function drawSpark() {
  const { g, w, h } = fit($('#spark')); g.clearRect(0, 0, w, h);
  const y = ms => h - Math.min(1, ms / 40) * h;
  g.strokeStyle = '#2c3d42'; g.beginPath(); g.moveTo(0, y(16.7)); g.lineTo(w, y(16.7)); g.stroke();
  g.strokeStyle = '#6cc4ff'; g.lineWidth = 1.5; g.beginPath();
  ft.forEach((v, i) => { const x = i / Math.max(1, 239) * w; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); }); g.stroke();
}
function updateDiag(p) {
  const sorted = ft.slice().sort((a, b) => a - b), avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0, max = sorted[sorted.length - 1] || 0;
  const api = p.apiError ? `<span class="badv">blocked (${p.apiError})</span>` : '<span class="good">ok</span>';
  const mapLine = !p.connected ? '-' : p.standard ? '<span class="good">standard</span>' : `<span class="warnv">${p.mapping} (non-standard, buttons may differ)</span>`;
  $('#diag').innerHTML =
    `frame <b>${fmt(avg, 1)}</b> ms avg · p95 <b>${fmt(p95, 1)}</b> · max <b>${fmt(max, 1)}</b><br>` +
    `fps <b>${fmt(1000 / Math.max(0.1, avg), 0)}</b> · long frames (&gt;25 ms) <b>${longFrames}</b><br>` +
    `sim <b>${Math.round(1 / SIM_STEP)} Hz</b> fixed · steps this frame <b>${stepsLast}</b><br>` +
    `gamepad api ${api} · pads <b>${p.count || 0}</b> · mapping ${mapLine}<br>` +
    `pad updates <b>${p.connected ? fmt(p.updateHz, 0) : '-'}</b> Hz · input source <b>${I.source === 'keyboard' ? (I.mouseAim ? 'keyboard + mouse' : 'keyboard') : I.source}</b><br>` +
    `in a frame <b>${framedBy ? 'yes' : 'no'}</b>` + (framedBy && !p.connected && p.everSeen === false ? ' <span class="warnv">(if your controller never shows, the frame may block it; see README)</span>' : '');
}
function updateChips(p) {
  const c = $('#chipSrc'), id = $('#chipId');
  if (p.connected) { c.className = 'chip ok'; c.textContent = 'Controller connected'; id.hidden = false; id.className = 'chip'; id.textContent = p.id.replace(/\s*\(.*\)\s*$/, '').slice(0, 44); }
  else if (I.source === 'keyboard' && input.kbMouseIdleMs(performance.now()) < 4000) { c.className = 'chip warn'; c.textContent = 'Keyboard + mouse'; id.hidden = true; }
  else if (p.apiError) { c.className = 'chip bad'; c.textContent = 'Controller access blocked'; id.hidden = true; }
  else { c.className = 'chip warn'; c.textContent = 'Press any button on your controller'; id.hidden = true; }
}
function updateHud(p) {
  const L = I.left, R = I.right;
  $('#nL').innerHTML = `L raw <b>${fmt(I.leftRaw.x)}, ${fmt(I.leftRaw.y)}</b><br>mag <b>${fmt(L.raw)}</b> → <b>${fmt(L.mag)}</b>`;
  $('#nR').innerHTML = `R raw <b>${fmt(I.rightRaw.x)}, ${fmt(I.rightRaw.y)}</b><br>mag <b>${fmt(R.raw)}</b> → <b>${fmt(R.mag)}</b>`;
  const t = tuning.trigger();
  const lt = $('#tLT'), rt = $('#tRT');
  $('.bar>b', lt).style.width = I.lt * 100 + '%'; $('.num', lt).textContent = fmt(I.lt);
  $('.bar>b', rt).style.width = I.rt * 100 + '%'; $('.num', rt).textContent = fmt(I.rt);
  $('.bar>u', rt).style.left = t.press * 100 + '%'; $('.bar>s', rt).style.left = t.release * 100 + '%';
  rt.querySelector('.bar').classList.toggle('down', I.fire);
  { const cfg = { press: tuning.get('trigger.press'), release: tuning.get('trigger.release') }, same = Math.abs(cfg.release - t.release) < 1e-9 && Math.abs(cfg.press - t.press) < 1e-9;
    $('#trigEff').innerHTML = `In use: presses at <b>${fmt(t.press)}</b>, releases at <b>${fmt(t.release)}</b>` + (same ? '' : ` <em>(your sliders say ${fmt(cfg.press)} / ${fmt(cfg.release)}; release is always kept just below press)</em>`); }
  const host = $('#btns');
  if (!host.children.length) BUTTON_NAMES.forEach(n => { const d = document.createElement('div'); d.className = 'btn'; d.textContent = n; host.appendChild(d); });
  [...host.children].forEach((el, i) => el.classList.toggle('on', !!I.buttons[i]?.pressed));
  $('#arenaHint').innerHTML = p.connected
    ? 'Left stick moves the blob directly (no acceleration yet, so you are judging the stick alone). Right stick aims. RT fires.'
    : 'No controller needed yet: WASD moves, the mouse aims, hold left click (or Space) to fire. Arrow keys aim when the mouse is outside this box. Press a controller button any time to switch.';
}

/* ------------------------------ main loop ------------------------------ */
let last = performance.now(), acc = 0;
function frame(now) {
  const dtMs = Math.max(0, now - last); last = now; // rAF's timestamp can precede performance.now() on the first frame
  if (dtMs > 0) { ft.push(dtMs); if (ft.length > 240) ft.shift(); }
  if (dtMs > 25) longFrames++;
  acc += Math.min(0.1, dtMs / 1000);
  const p = sampleInput(now);
  stepDrift(now, p);
  stepsLast = 0;
  while (acc >= SIM_STEP) { simStep(SIM_STEP); acc -= SIM_STEP; stepsLast++; frameCount++; }
  if (stepsLast > 0) input.consumeTap();                 // a click or Space tap stays pending until a simulation step has seen it
  drawStick($('#cvL'), I.leftRaw, I.left, tuning.stick('left'));
  drawStick($('#cvR'), I.rightRaw, I.right, tuning.stick('right'));
  drawCurves(); drawArena(); drawSpark();
  updateHud(p); updateChips(p);
  if (frameCount % 6 === 0 || stepsLast === 0) updateDiag(p);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small hook for automated tests (harmless in play)
window.__lab = { I, pad, tuning, simStep, state: () => ({ source: I.source, fire: I.fire }) };
