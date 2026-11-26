// Iteration 2: aiming and the shotgun.
// Compare the three designs, then play in the arena. The training range (north-west) has still and patrolling dummies and a pattern board.
import * as THREE from 'three';
import { createStage, clamp, R2 } from '../engine/stage.js';
import { createFx } from '../engine/fx.js';
import * as audio from '../engine/audio.js';
import { createArena, SPAWN } from '../game/arena.js';
import { LAYOUT } from '../game/layout.js';
import { resolveWorld, circleVsCircle } from '../game/collide.js';
import { stepVelocity, moveStats } from '../game/movement.js';
import { PelletSim, pelletPattern } from '../game/pellets.js';
import { createShotgun } from '../game/shotgun.js';
import { chooseAim } from '../game/assist.js';
import { launchBlast } from '../game/blast.js';
import { Target } from '../game/targets.js';
import { mouseAim } from '../input/process.js';
import { createInput } from '../input/source.js';
import { createMenuNav, menuCommands } from '../input/menu.js';
import { DEFS, PRESETS, tuning } from '../tuning.js';
import { DESIGNS } from './designs.js';
import { Hero } from './hero.js';
import { loadRig } from './rigAsset.js';
import { DummyView } from './dummy.js';

const STEP = 1 / 120;
const SHOW = { x: 0, z: 90 };                       // the compare stage lives far from the arena
const $ = (s, r = document) => r.querySelector(s);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

/* ------------------------------ page ------------------------------ */
$('#app').innerHTML = `
<canvas id="c" tabindex="0"></canvas><div id="vig"></div>
<div id="top">
  <h1>Blob Shooter<small>Iteration 2 · aiming and the shotgun</small></h1>
  <button id="bMode" class="primary">Play</button>
  <span class="pill" id="chipSrc">Keyboard + mouse</span>
</div>
<div id="cards"></div>
<div id="hint"></div>
<div id="ammo"><div id="shells"></div><div id="reloadBar"><i></i></div></div>
<aside id="panel">
  <div class="note"><b>Every number here is our own guess.</b> Minigore's real values are not published, so none are copied from it. They get replaced by measured values once we have reference footage.</div>
  <h2>Feel presets (movement)</h2>
  <div class="actions" id="presets"></div>
  <div class="stat" id="stats"></div>
  <div id="sliders"></div>
  <details><summary>Controller deadzones</summary><div id="inputSliders"></div></details>
  <h2>Last shot</h2>
  <div class="stat" id="shotStat">Fire at a dummy.</div>
  <div class="actions"><button id="bRange">Reset range</button><button id="bReset">Reset all</button><button id="bCopy">Copy my settings</button><button id="bHide">Hide panel</button></div>
  <label class="chk"><input type="checkbox" id="dbg"> Show colliders and numbers</label>
  <textarea id="copyBox" readonly hidden></textarea>
  <h2>Diagnostics</h2><div class="diag" id="diag"></div>
</aside>
<button id="panelBtn">Tuning</button>
<div id="focus"><div><h1>Blob Shooter</h1><p>Click to start. WASD moves, the mouse aims, hold left click to fire, R reloads.</p><p style="opacity:.8;font-size:13px"><b>Controller:</b> press any button to start, then D-pad or LB/RB to pick a hero and <b>A</b> to play.</p></div></div>`;

/* ------------------------------ engine ------------------------------ */
const canvas = $('#c');
const stage = createStage(canvas), fx = createFx(stage.scene);
const arena = createArena(stage);
const rig = await loadRig();                                  // arms + shotgun authored in Blender
const heroes = DESIGNS.map(d => new Hero(d, stage, fx, rig));
let selected = 0, mode = 'compare';

// compare stage: dark floor, three pedestals, a ring marking the current pick
const showGroup = new THREE.Group(); showGroup.position.set(SHOW.x, 0, SHOW.z); stage.scene.add(showGroup);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshToonMaterial({ color: '#1a2a28' })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; showGroup.add(floor);
  heroes.forEach((h, i) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.3, 28), new THREE.MeshToonMaterial({ color: '#5d697b' })); p.position.set((i - 1) * 4.6, 0.15, 0); p.receiveShadow = p.castShadow = true; showGroup.add(p); });
  const L = new THREE.PointLight('#ffb347', 70, 22, 2); L.position.set(0, 5, 4); showGroup.add(L);
}
const pick = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.05, 40), new THREE.MeshBasicMaterial({ color: '#ff6fb1', transparent: true, opacity: 0.9 })); pick.rotation.x = -Math.PI / 2; showGroup.add(pick);

/* ------------------------------ the training range ------------------------------ */
const targets = [], views = new Map();
for (const [x, y] of LAYOUT.range.still) targets.push(new Target({ x, y }));
{ const pc = LAYOUT.range.patrol; for (let i = 0; i < pc.count; i++) targets.push(new Target({ x: 0, y: 0, path: pc.path, speed: pc.speed, phase: i / pc.count })); }
for (const t of targets) views.set(t, new DummyView(arena.group, t, stage.camera));

/* ------------------------------ aiming visuals ------------------------------ */
const aimGroup = new THREE.Group(); stage.scene.add(aimGroup);
function makeCone(a0, a1, col) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const c = new THREE.Color(col); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([c.r, c.g, c.b, a0, c.r, c.g, c.b, a1, c.r, c.g, c.b, a1]), 4));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 2; m.frustumCulled = false; aimGroup.add(m);
  return { mesh: m, set(half, len) { const p = g.attributes.position, w = Math.tan(half) * len; p.setXYZ(0, 0, 0.05, 0); p.setXYZ(1, -w, 0.05, len); p.setXYZ(2, w, 0.05, len); p.needsUpdate = true; } };
}
const coneOuter = makeCone(0.2, 0.0, '#ffd23f'), coneInner = makeCone(0.42, 0.06, '#fff2b0');
const cross = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false })); cross.rotation.x = -Math.PI / 2; cross.position.y = 0.06; stage.scene.add(cross);
// pellet tracers: one instanced streak per pellet in flight
const MAXP = 160;
// each pellet is a small lead ball with a hot trail behind it; the trail cools from white-orange to dull as the pellet loses energy
const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: '#e6e9ef' }), MAXP);
const trailGeo = new THREE.BoxGeometry(0.06, 0.06, 1);                                       // brightness runs from 1 at the head (+z) to 0 at the tail, so it reads as a streak, not a rod
{ const pos = trailGeo.attributes.position, col = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const k = Math.pow(pos.getZ(i) + 0.5, 1.6); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; } trailGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
const trails = new THREE.InstancedMesh(trailGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXP);
for (const o of [balls, trails]) { o.frustumCulled = false; o.count = 0; stage.scene.add(o); }
trails.setColorAt(0, new THREE.Color(1, 1, 1));
const tracer = { set visible(v) { balls.visible = trails.visible = v; } };

/* ------------------------------ player and gun (the simulation state) ------------------------------ */
const player = { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, aimX: 0, aimY: -1, hasAim: false, speed: 0, impact: 0, skidT: 0, v: { x: 0, y: 0 }, kb: { x: 0, y: 0 }, assistTarget: null };   // kb: recoil shove, decays on its own so braking cannot cancel it instantly
const P = {};
function readTuning() {
  P.maxSpeed = tuning.get('move.maxSpeed'); P.accel = tuning.get('move.accel'); P.brake = tuning.get('move.brake'); P.turnAccel = tuning.get('move.turnAccel');
  P.aimFollow = tuning.get('aim.follow'); P.legsFollow = tuning.get('legs.follow'); P.squash = tuning.get('anim.squash'); P.lean = tuning.get('anim.lean'); P.bob = tuning.get('anim.bob'); P.stepLen = tuning.get('anim.stepLen');
  P.pellets = tuning.get('gun.pellets'); P.spread = tuning.get('gun.spread') * Math.PI / 180; P.bias = tuning.get('gun.bias'); P.damage = tuning.get('gun.damage'); P.range = tuning.get('gun.range');
  P.falloffStart = tuning.get('gun.falloffStart'); P.minDamage = tuning.get('gun.minDamage'); P.pelletSpeed = tuning.get('gun.pelletSpeed'); P.interval = tuning.get('gun.interval'); P.reload = tuning.get('gun.reload');
  P.capacity = tuning.get('gun.capacity'); P.recoil = tuning.get('gun.recoil'); P.assistMode = ['manual', 'assist', 'auto'][tuning.get('assist.mode')]; P.assistCone = tuning.get('assist.cone'); P.assistStrength = tuning.get('assist.strength');
  P.camKick = tuning.get('fx.camKick'); P.hitPause = tuning.get('fx.hitPause'); P.rumble = tuning.get('fx.rumble') > 0.5; P.numbers = tuning.get('fx.numbers') > 0.5;
}
readTuning();
const gun = createShotgun({ capacity: P.capacity, interval: P.interval, reload: P.reload });
const pellets = new PelletSim();
const stats = { shots: 0, pellets: 0, hits: 0, damage: 0, kills: 0, recent: new Map(), last: null };
let shotId = 0, pauseT = 0;
const ck = { x: 0, z: 0, vx: 0, vz: 0 };            // camera kick spring

/* ------------------------------ input ------------------------------ */
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
let lastClient = { x: 0, y: 0 };
function groundPoint(cx, cy) {
  const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
}
canvas.addEventListener('pointermove', e => { lastClient = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', e => { lastClient = { x: e.clientX, y: e.clientY }; });
const input = createInput({ target: canvas, toWorld: e => groundPoint(e.clientX, e.clientY), origin: () => player, lastAim: () => ({ x: player.aimX, y: player.aimY }), tuning });
const snap = input.snap;

/* ------------------------------ shooting ------------------------------ */
const _m = new THREE.Vector3();
function muzzleReach() { return heroes[selected].muzzleReach; }

function shoot(barrel) {
  const h = heroes[selected], ax = player.aimX, ay = player.aimY;
  // the visible gun takes the exact aim and position of this shot first, so the flash, the gun and the pellet origin are one and the same place
  h.snapAim(player.x, player.y, Math.atan2(ax, ay)); h.muzzleWorld(_m);
  const side = barrel ? 0.078 : -0.078, px = -ay, py = ax;                              // barrels sit left/right of the centre line
  const muzzle = { x: _m.x + px * side, y: _m.z + py * side };
  const id = ++shotId, spec = { range: P.range, damage: P.damage, falloffStart: P.falloffStart, minDamage: P.minDamage };
  const st = { id, fired: P.pellets, hits: 0, damage: 0, nearest: Infinity, kills: 0, t: performance.now() }; stats.recent.set(id, st); stats.last = st; stats.shots++; stats.pellets += P.pellets;
  if (stats.recent.size > 6) stats.recent.delete(stats.recent.keys().next().value);
  // anything between the player and the muzzle (a dummy against the gun, a wall) is resolved before the pellets start flying
  launchBlast({ sim: pellets, from: player, muzzle, dir: { x: ax, y: ay }, angles: pelletPattern(P.pellets, P.spread, P.bias), spec, speed: () => P.pelletSpeed * R2(0.94, 1.06), world: arena.world, targets, shot: id, onHit });
  // recoil on the hero, kick on the gun and camera
  player.kb.x -= ax * P.recoil; player.kb.y -= ay * P.recoil; h.fire();
  const kbm = Math.hypot(player.kb.x, player.kb.y); if (kbm > 12) { player.kb.x *= 12 / kbm; player.kb.y *= 12 / kbm; }   // rapid fire can't stack a shove without limit
  ck.vx += -ax * P.camKick * 14; ck.vz += -ay * P.camKick * 14;
  // the muzzle flash is drawn where the pellets start
  fx.wad(_m.x, 0.8, _m.z, ax, ay); fx.flash(_m.x, 0.8, _m.z, ax, ay); fx.smoke(_m.x, 0.8, _m.z, ax, ay); fx.sparks(_m.x, _m.z, ax, ay, '#ffd88a', 6);
  audio.sfx.blast(barrel); if (P.rumble && snap.source === 'controller') snap.pad.rumble?.(0.9, 0.55, 70);
}
function onHit(h) {
  const st = stats.recent.get(h.shot);
  if (h.kind === 'target') {
    const tg = h.ref, v = views.get(tg), r = tg.damage(h.damage);
    stats.hits++; stats.damage += r.dealt; if (st) { st.hits++; st.damage += r.dealt; st.nearest = Math.min(st.nearest, h.dist); }
    v.hit(h.dx, h.dy, h.damage); fx.sparks(h.x, h.y, h.nx, h.ny, '#fff2c4', 2);
    for (let i = 0; i < 2; i++) fx.emit(h.x, 0.9, h.y, h.nx * R2(1, 3) + R2(-1, 1), R2(0.5, 2), h.ny * R2(1, 3) + R2(-1, 1), R2(0.25, 0.4), R2(0.06, 0.11), '#e8c85a', { g: 9, op: 0.95 });
    tg.dmgAcc = (tg.dmgAcc || 0) + r.dealt; tg.dmgT = 0.09; tg.dmgKill = tg.dmgKill || r.killed;
    if (!(tg.sndT > 0)) { audio.sfx.hit(clamp(h.damage / 12, 0.3, 1)); tg.sndT = 0.05; }
    if (r.killed) {
      stats.kills++; if (st) st.kills++; v.kill(); audio.sfx.pop(); pauseT = Math.max(pauseT, P.hitPause);
      for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, sp = R2(2, 6); fx.emit(tg.x, 1, tg.y, Math.cos(a) * sp, R2(2, 6), Math.sin(a) * sp, R2(0.5, 0.9), R2(0.08, 0.16), ['#e8c85a', '#c9a66b', '#fff6e8', '#e85d5d'][i & 3], { g: 14, op: 1 }); }
      fx.ring(tg.x, tg.y, 2.6, '#ffd23f', 0.5);
    }
  } else {
    fx.sparks(h.x, h.y, h.nx, h.ny, '#ffe9a8', 4); fx.emit(h.x, 0.5, h.y, h.nx * 0.5, 0.4, h.ny * 0.5, 0.35, 0.1, '#cdbd9a', { grow: 1.6, op: 0.5 });
    if (h.ref.kind === 'board') arena.boardMark(h.x);
  }
}

/* ------------------------------ simulation (fixed 120 Hz) ------------------------------ */
let shake = 0;
function simStep(h) {
  if (mode !== 'play') { input.consumeTap(); return; }      // taps made on menus must not fire a shot when play starts
  const v = player.v; stepVelocity(v, snap.move, P, h);
  const sp = Math.hypot(v.x, v.y);
  if (snap.move.mag > 0.4 && sp > 3 && (v.x * snap.move.x + v.y * snap.move.y) / (sp * snap.move.mag) < -0.3) { player.skidT -= h; if (player.skidT <= 0) { player.skidT = 0.05; fx.dust(player.x, player.y, v.x / sp, v.y / sp, 0.9); } }
  player.x += (v.x + player.kb.x) * h; player.y += (v.y + player.kb.y) * h;
  const kd = Math.exp(-9 * h); player.kb.x *= kd; player.kb.y *= kd;
  const rad = heroes[selected].radius;
  const impact = resolveWorld(player, v, rad, arena.world);
  for (const t of targets) if (t.alive) circleVsCircle(player, v, rad, t);               // dummies are solid
  if (impact > 2.5 && player.impact <= 0) { player.impact = 0.15; fx.dust(player.x, player.y, -v.x, -v.y, Math.min(1, impact / 7)); shake = Math.max(shake, Math.min(0.25, impact * 0.025)); }
  player.impact -= h; player.vx = v.x + player.kb.x; player.vy = v.y + player.kb.y; player.speed = Math.hypot(player.vx, player.vy);

  // aim: explicit input (cursor, right stick, arrows) wins; otherwise auto mode picks a visible target; otherwise, while firing, the walking direction
  let explicit = { x: 0, y: 0 };
  if (snap.mouseAim) { const a = mouseAim(player, input.mouse, { x: player.aimX, y: player.aimY }); explicit = { x: a.x, y: a.y }; }
  else if (snap.aim.mag > 0.02) explicit = { x: snap.aim.x / snap.aim.mag, y: snap.aim.y / snap.aim.mag };
  const helped = chooseAim(player, explicit, snap.move, snap.fire, targets, arena.world, { mode: snap.mouseAim ? 'manual' : P.assistMode, coneDeg: P.assistCone, strength: P.assistStrength, range: P.range + 3 });
  if (helped.aiming) { player.aimX = helped.x; player.aimY = helped.y; player.hasAim = true; } else player.hasAim = snap.fire;   // firing without any aim keeps the last direction
  player.assistTarget = helped.target;

  // the gun
  gun.setParams({ capacity: P.capacity, interval: P.interval, reload: P.reload });
  const reloadKey = input.keys.has('KeyR') || !!snap.buttons[2]?.pressed;
  for (const e of gun.update(h, { fire: snap.fire, reload: reloadKey })) {
    if (e.type === 'shot') shoot(e.barrel);
    else if (e.type === 'reloadStart') audio.sfx.open();
    else if (e.type === 'reloadDone') { if (P.rumble && snap.source === 'controller') snap.pad.rumble?.(0.2, 0.3, 30); }
  }
  input.consumeTap();                                        // this step has now seen any tap; fire falls back to the real held state
  pellets.step(h, arena.world, targets, onHit);
  for (const t of targets) {
    if (t.update(h) === 'respawned') { views.get(t).respawn(); fx.ring(t.x, t.y, 1.8, '#fff6e8', 0.4); }
    if (t.sndT > 0) t.sndT -= h;
    if (t.dmgAcc > 0 && (t.dmgT -= h) <= 0) { if (P.numbers) fx.number(t.x, 2.6, t.y, String(Math.round(t.dmgAcc)), t.dmgKill || t.dmgAcc >= 60 ? '#ffd23f' : '#ffffff'); t.dmgAcc = 0; t.dmgKill = false; }
  }
}
// the hero reports each beat of the reload animation; sounds only play for the hero you are actually controlling
for (const h of heroes) h.onReloadStage = (stage, who) => {
  if (mode !== 'play' || who !== heroes[selected]) return;
  if (stage === 'eject') audio.sfx.eject(); else if (stage === 'grab') audio.sfx.grab(); else if (stage === 'insert') audio.sfx.insert(); else if (stage === 'close') { audio.sfx.close(); if (P.rumble && snap.source === 'controller') snap.pad.rumble?.(0.2, 0.3, 30); }
};

/* ------------------------------ compare-stage demo motion ------------------------------ */
function demoState(i, t) {
  const c = (t + i * 1.3) % 9, heading = t * 0.5 + i * 2.1;
  if (c < 3) return { vx: 0, vy: 0, speed: 0, aimYaw: Math.sin(t * 0.9 + i) * 0.55, reload: -1 };
  const sp = 5.5, rl = c > 7.4 ? (c - 7.4) / 1.2 : -1;
  if (c < 6) return { vx: Math.sin(heading) * sp, vy: Math.cos(heading) * sp, speed: sp, aimYaw: null, reload: -1 };
  return { vx: Math.sin(heading) * sp, vy: Math.cos(heading) * sp, speed: sp, aimYaw: Math.sin(t * 1.6) * 1.3, reload: rl };
}

/* ------------------------------ ui ------------------------------ */
function buildCards() {
  const host = $('#cards'); host.innerHTML = '';
  heroes.forEach((h, i) => { const b = document.createElement('button'); b.className = 'card'; b.innerHTML = `<b><i>${i + 1}</i>${h.d.name}</b><small>${h.d.blurb}</small>`; b.onclick = () => choose(i); host.appendChild(b); });
}
function choose(i) {
  selected = i; [...$('#cards').children].forEach((c, k) => c.classList.toggle('sel', k === i));
  heroes.forEach((h, k) => h.setVisible(mode === 'compare' || k === i)); pick.position.x = (i - 1) * 4.6;
  if (mode === 'play') {
    heroes[i].legYaw = heroes[i].aimYaw = Math.atan2(player.aimX, player.aimY);
    heroes[i].reloadPrev = gun.reloading ? 1 - gun.state.reloadLeft / P.reload : -1;     // pick the reload up where it is, don't replay its earlier beats
  }
}
function setMode(m) {
  mode = m; $('#bMode').textContent = m === 'compare' ? `Play as ${heroes[selected].d.name}` : 'Compare designs';
  arena.setVisible(m === 'play'); showGroup.visible = m === 'compare'; aimGroup.visible = cross.visible = m === 'play'; tracer.visible = m === 'play';
  heroes.forEach((h, k) => { h.setVisible(m === 'compare' || k === selected); h.reloadPrev = -1; });
  if (m === 'play') { player.x = SPAWN.x; player.y = SPAWN.y; player.v.x = player.v.y = 0; player.kb.x = player.kb.y = 0; player.speed = 0; gun.reset(); pellets.clear(); }
  heroes.forEach((h, k) => { if (m === 'compare') h.root.position.set(SHOW.x + (k - 1) * 4.6, 0, SHOW.z); });
  $('#panel').classList.toggle('collapsed', m === 'compare' || innerWidth < 900);
  $('#cards').style.display = m === 'compare' ? 'flex' : 'none'; $('#ammo').style.display = m === 'play' ? 'flex' : 'none';
  document.body.classList.toggle('mode-compare', m === 'compare');
  updateHint();
}
function updateHint() {
  $('#hint').innerHTML = mode === 'compare'
    ? '<b>1</b><b>2</b><b>3</b> choose a design, <b>Enter</b> or the Play button to try it. Each one walks, strafes, idles and reloads so you can judge it.<br>Controller: <b>D-pad</b> / <b>LB</b><b>RB</b> choose, <b>A</b> plays.'
    : '<b>WASD</b> move, mouse aims, <b>click</b> fires, <b>R</b> reloads, <b>C</b> compare, <b>1</b><b>2</b><b>3</b> switch design. The training range is in the north-west corner.<br>Controller: sticks move and aim, <b>RT</b> fires, <b>X</b> reloads, <b>B</b> back to the designs.';
}
$('#bMode').onclick = () => setMode(mode === 'compare' ? 'play' : 'compare');
addEventListener('keydown', e => {
  if (e.repeat) return; audio.unlock();
  if (e.code === 'Digit1') choose(0); else if (e.code === 'Digit2') choose(1); else if (e.code === 'Digit3') choose(2);
  else if (e.code === 'KeyC') setMode(mode === 'compare' ? 'play' : 'compare');
  else if (e.code === 'Enter' && mode === 'compare') setMode('play');
  $('#focus').classList.add('off');
});
const startFocus = () => { audio.unlock(); $('#focus').classList.add('off'); canvas.focus(); };
$('#focus').addEventListener('pointerdown', startFocus); canvas.addEventListener('pointerdown', startFocus);

// controller menus: one action per button press (see src/input/menu.js)
const nav = createMenuNav();
function menuStep() {
  const cmds = menuCommands(nav.update(snap.pad), { overlayUp: !$('#focus').classList.contains('off'), mode, selected, count: heroes.length });
  for (const c of cmds) {
    if (c.type === 'start') startFocus();
    else if (c.type === 'choose') choose(c.index);
    else if (c.type === 'play') setMode('play');
    else if (c.type === 'compare') setMode('compare');
  }
}

// tuning sliders, selects and toggles, grouped in collapsible sections
const sync = [];
function addControls(host, defs, openGroups = []) {
  for (const g of [...new Set(defs.map(d => d.group))]) {
    const det = document.createElement('details'); det.open = openGroups.includes(g) || !openGroups.length; det.innerHTML = `<summary>${g}<em> · our guess</em></summary>`; host.appendChild(det);
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
addControls($('#sliders'), DEFS.filter(d => d.page === 'hero'), ['Shotgun', 'Aim', 'Feedback']);
addControls($('#inputSliders'), DEFS.filter(d => d.page === undefined && d.group !== 'Feel pad'));
tuning.onChange(() => { sync.forEach(f => f()); readTuning(); updateStats(); audio.setVolume(tuning.get('fx.volume')); });
audio.setVolume(tuning.get('fx.volume'));
{ const host = $('#presets'); for (const [name, vals] of Object.entries(PRESETS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => tuning.apply(vals); host.appendChild(b); } }
function updateStats() {
  const s = moveStats({ maxSpeed: P.maxSpeed, accel: P.accel, brake: P.brake, turnAccel: P.turnAccel });
  $('#stats').innerHTML = `to top speed <b>${fmt(s.timeToTop, 2)} s</b> · stop <b>${fmt(s.stopTime, 2)} s</b> (<b>${fmt(s.stopDistance, 2)}</b> u)<br>reverse <b>${fmt(s.reverseTime, 2)} s</b> · arena crossing <b>${fmt(48 / P.maxSpeed, 1)} s</b>`;
}
updateStats();
$('#bReset').onclick = () => tuning.reset();
$('#bRange').onclick = () => { arena.clearMarks(); for (const t of targets) { t.hp = t.maxHp; t.alive = true; t.deadFor = 0; views.get(t).respawn(); } stats.shots = stats.pellets = stats.hits = stats.damage = stats.kills = 0; stats.last = null; };
$('#bCopy').onclick = async () => {
  const text = JSON.stringify({ design: heroes[selected].d.name, tuning: tuning.snapshot() }, null, 1); const box = $('#copyBox'); box.hidden = false; box.value = text; box.select();
  try { await navigator.clipboard.writeText(text); $('#bCopy').textContent = 'Copied!'; } catch { $('#bCopy').textContent = 'Select and copy below'; } setTimeout(() => ($('#bCopy').textContent = 'Copy my settings'), 2000);
};
$('#bHide').onclick = () => $('#panel').classList.add('collapsed'); $('#panelBtn').onclick = () => $('#panel').classList.remove('collapsed');
$('#dbg').onchange = e => { arena.debug.visible = e.target.checked; };
if (innerWidth < 900) $('#panel').classList.add('collapsed');
buildCards(); choose(0); setMode('compare');

// ammo HUD
let shellCount = 0;
function updateAmmoHud() {
  const cap = P.capacity, host = $('#shells');
  if (shellCount !== cap) { shellCount = cap; host.innerHTML = '<i></i>'.repeat(cap); }
  [...host.children].forEach((el, i) => el.classList.toggle('on', i < gun.state.ammo));
  $('#reloadBar i').style.width = gun.reloading ? (100 - gun.state.reloadLeft / P.reload * 100) + '%' : '0%';
  $('#ammo').classList.toggle('reloading', gun.reloading);
}

/* ------------------------------ camera ------------------------------ */
const focus = new THREE.Vector3(SHOW.x, 0, SHOW.z), _t = new THREE.Vector3();
function updateCamera(dt) {
  const cam = stage.camera;
  if (mode === 'compare') {
    // wide screens frame all three; narrow ones (tablet portrait, phone) back off, and on very narrow ones follow the chosen design
    const asp = cam.aspect, narrow = asp < 1.0, back = clamp(1.75 / asp, 1, 1.9);
    focus.lerp(_t.set(SHOW.x + (narrow ? (selected - 1) * 4.6 : 0), 1.2, SHOW.z), 1 - Math.exp(-8 * dt));
    const dist = narrow ? clamp(11 / asp * 0.62, 11, 24) : 15.5 * back;
    cam.position.set(focus.x, 4.4 + (dist - 15.5) * 0.15, focus.z + dist); cam.lookAt(focus.x, 1.15, focus.z); stage.lightFollow(SHOW.x, SHOW.z); return;
  }
  const reach = player.hasAim ? (snap.mouseAim ? clamp(Math.hypot(input.mouse.x - player.x, input.mouse.y - player.y) / 9, 0, 1) : snap.aim.mag || (player.assistTarget ? 0.6 : 0)) : 0;
  const tx = player.x + player.vx * tuning.get('cam.velLead') + player.aimX * tuning.get('cam.aimLead') * reach;
  const tz = player.y + player.vy * tuning.get('cam.velLead') + player.aimY * tuning.get('cam.aimLead') * reach;
  focus.lerp(_t.set(tx, 0, tz), 1 - Math.exp(-tuning.get('cam.follow') * dt));
  ck.vx += (-130 * ck.x - 13 * ck.vx) * dt; ck.vz += (-130 * ck.z - 13 * ck.vz) * dt; ck.x += ck.vx * dt; ck.z += ck.vz * dt;   // camera kick settles back
  const tilt = tuning.get('cam.tilt') * Math.PI / 180, dist = tuning.get('cam.dist'), k = cam.aspect < 1.25 ? 1.25 / cam.aspect : 1;
  const sx = (Math.random() - 0.5) * shake * 0.4 + ck.x, sz = (Math.random() - 0.5) * shake * 0.4 + ck.z;
  cam.position.set(focus.x + sx, Math.sin(tilt) * dist * k, focus.z + Math.cos(tilt) * dist * k + sz); cam.lookAt(focus.x, 0, focus.z);
  stage.lightFollow(focus.x, focus.z);
}

/* ------------------------------ loop ------------------------------ */
const ft = []; let last = performance.now(), acc = 0, steps = 0, clock = 0;
const _col = new THREE.Color(), _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function frame(now) {
  const raw = Math.max(0, now - last); last = now; if (raw > 0) { ft.push(raw); if (ft.length > 120) ft.shift(); }
  const realDt = Math.min(0.1, raw / 1000);
  let dt = realDt;
  if (pauseT > 0) { pauseT -= realDt; dt = 0; }                                    // hit pause: freeze the world for a few frames
  clock += dt; acc += dt;
  if (input.mouse.inside) { const w = groundPoint(lastClient.x, lastClient.y); if (w) { input.mouse.x = w.x; input.mouse.y = w.y; } }
  input.sample(now); menuStep(); readTuning();
  steps = 0; while (acc >= STEP) { simStep(STEP); acc -= STEP; steps++; }
  shake = Math.max(0, shake - realDt * 3);
  const dtv = Math.max(dt, 1e-4);

  if (mode === 'compare') {
    heroes.forEach((h, i) => { const d = demoState(i, clock); h.update(dtv, { x: SHOW.x + (i - 1) * 4.6, y: SHOW.z, ...d }, P); });
  } else {
    const h = heroes[selected];
    h.update(dtv, { x: player.x, y: player.y, vx: player.vx, vy: player.vy, speed: player.speed, aimYaw: player.hasAim ? Math.atan2(player.aimX, player.aimY) : null, reload: gun.reloading ? 1 - gun.state.reloadLeft / P.reload : -1, spent: Math.min(2, P.capacity - gun.state.ammo) }, P);
    // aim cone shows spread, range, and the full-damage zone
    aimGroup.visible = player.hasAim || snap.fire; aimGroup.position.set(player.x, 0, player.y); aimGroup.rotation.y = Math.atan2(player.aimX, player.aimY);
    coneOuter.mesh.position.z = coneInner.mesh.position.z = muzzleReach(); coneOuter.set(P.spread, P.range); coneInner.set(P.spread, P.falloffStart);
    cross.visible = snap.mouseAim; cross.position.set(input.mouse.x, 0.06, input.mouse.y);
    const cd = Math.hypot(input.mouse.x - player.x, input.mouse.y - player.y); cross.scale.setScalar(clamp(Math.tan(P.spread) * Math.max(0, cd - muzzleReach()), 0.45, 4) / 0.36);
    updatePelletVisuals();
    updateAmmoHud();
  }
  for (const t of targets) views.get(t).update(dtv, clock);
  fx.update(dt); updateCamera(Math.max(realDt, 1e-4)); stage.render();
  if ((now / 100 | 0) !== ((now - raw) / 100 | 0)) updateDiag();
  requestAnimationFrame(frame);
}
function updatePelletVisuals() {
  // pellets: ball + trail. Colour cools with distance flown (hot = near the muzzle).
    let n = 0; for (const p of pellets.pellets) { if (n >= MAXP) break;
      const f = clamp(p.traveled / p.opts.range, 0, 1), len = 0.5 + 0.9 * (1 - f * 0.6); _e.set(0, Math.atan2(p.dx, p.dy), 0); _q.setFromEuler(_e);
      _p.set(p.x, 0.8, p.y); _s.set(1, 1, 1); _mat.compose(_p, _q, _s); balls.setMatrixAt(n, _mat);
      _p.set(p.x - p.dx * len / 2, 0.8, p.y - p.dy * len / 2); _s.set(1, 1, len); _mat.compose(_p, _q, _s); trails.setMatrixAt(n, _mat);
      _col.setRGB(1 - f * 0.55, 0.85 - f * 0.55, 0.45 - f * 0.3); trails.setColorAt(n, _col); n++; }
    balls.count = trails.count = n; balls.instanceMatrix.needsUpdate = trails.instanceMatrix.needsUpdate = true; if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
}
function updateDiag() {
  const avg = ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), sorted = ft.slice().sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const src = snap.source === 'controller' ? 'controller' : snap.mouseAim ? 'keyboard + mouse' : snap.source === 'keyboard' ? 'keyboard' : 'waiting';
  $('#chipSrc').textContent = src === 'controller' ? 'Controller' : 'Keyboard + mouse'; $('#chipSrc').classList.toggle('ok', src === 'controller');
  const h = heroes[selected]; let extra = '';
  if ($('#dbg').checked && mode === 'play') { const dAng = Math.abs(((h.aimYaw - h.legYaw) * 180 / Math.PI + 540) % 360 - 180); extra = `<br>speed <b>${fmt(player.speed, 2)}</b> u/s · legs vs gun <b>${fmt(dAng, 0)}°</b> · pos <b>${fmt(player.x, 1)}, ${fmt(player.y, 1)}</b><br>pellets in flight <b>${pellets.pellets.length}</b>`; }
  $('#diag').innerHTML = `frame <b>${fmt(avg, 1)}</b> ms · p95 <b>${fmt(p95, 1)}</b> · fps <b>${fmt(1000 / Math.max(0.1, avg), 0)}</b><br>sim <b>120 Hz</b> fixed · steps/frame <b>${steps}</b> · input <b>${src}</b>${extra}`;
  const l = stats.last;
  $('#shotStat').innerHTML = l
    ? `pellets hit <b>${l.hits}/${l.fired}</b> · damage <b>${fmt(l.damage, 0)}</b>${l.kills ? ' · <b>kill</b>' : ''}<br>closest hit <b>${Number.isFinite(l.nearest) ? fmt(l.nearest, 1) + ' u' : '-'}</b> · counted as pellets land<br>session: <b>${stats.shots}</b> shots · accuracy <b>${fmt(stats.hits / Math.max(1, stats.pellets) * 100, 0)}%</b> · damage <b>${fmt(stats.damage, 0)}</b> · kills <b>${stats.kills}</b>`
    : 'Fire at a dummy. Close blasts hit hard, far ones chip.';
}
requestAnimationFrame(frame);

// hooks for automated tests (harmless in play)
window.__hero = { menuStep, player, heroes, input, snap, arena, stage, tuning, P, setMode, choose, simStep, gun, pellets, targets, views, stats, shoot, fx, audio, updatePelletVisuals, state: () => ({ mode, selected }), steps: () => steps };
