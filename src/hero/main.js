// Iteration 2: aiming and the shotgun.
// Compare the three designs, then play in the arena. The training range (north-west) has still and patrolling dummies and a pattern board.
import * as THREE from 'three';
import { createStage, clamp, R2 } from '../engine/stage.js';
import { createFx } from '../engine/fx.js';
import * as audio from '../engine/audio.js';
import { createArena, SPAWN, ARENA_BOUNDS } from '../game/arena.js';
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
import { createHaptics, buildFeel, rumbleCategory, shapeMotor } from '../input/haptics.js';
import { lightColor, createFlash, ledPattern, scaleColor, hexRgb, COLORS } from '../input/lights.js';
import { createCalibration } from '../input/calibrate.js';
import { createDualSense } from '../input/dualsense.js';
import { DEFS, PRESETS, tuning } from '../tuning.js';
import { DESIGNS } from './designs.js';
import { Hero } from './hero.js';
import { loadRig } from './rigAsset.js';
import { DummyView } from './dummy.js';
import { createSession } from '../game/run.js';
import { runAim, createLock, turnToward, aimError } from '../game/autoaim.js';
import { WEAPONS, weaponParams, weaponForWave } from '../game/weapons.js';
import { createFurries } from './furries.js';
import { createHud } from './hud.js';
import { createPanelNav } from './panelNav.js';
import { tierOf } from '../game/crowd.js';

const STEP = 1 / 120;
const SHOW = { x: 0, z: 90 };                       // the compare stage lives far from the arena
const $ = (s, r = document) => r.querySelector(s);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');

/* ------------------------------ page ------------------------------ */
$('#app').innerHTML = `
<canvas id="c" tabindex="0"></canvas><div id="vig"></div>
<div id="top">
  <h1>Blob Minigore<small>V2 · survival run</small></h1>
  <button id="bMode" class="primary">Survival Run</button>
  <button id="bRange">Training</button>
  <span class="pill" id="chipSrc">Keyboard + mouse</span>
</div>
<div id="cards"></div>
<div id="hint"></div>
<div id="ammo"><div id="shells"></div><div id="reloadBar"><i></i></div></div>
<aside id="panel">
  <div id="pauseHead"><h2>Paused</h2>
    <div class="actions"><button id="bResume" class="primary">Resume</button><button id="bQuit">Quit to heroes</button></div>
    <div class="hint pad-hint"><b>D-pad</b> or left stick: move · <b>◀ ▶</b> change · <b>A</b> press · <b>Start</b> or <b>B</b> resume</div></div>
    <details id="feel" open><summary>Controller: vibration, triggers and lights</summary>
    <div class="actions"><button id="bCalib" class="primary">Calibrate this controller</button></div>
    <div id="calibBox" class="hint calib" hidden><b id="calibTitle"></b><span id="calibHint"></span><div class="calib-bar"><i></i></div><button id="bCalibA">That is it (A)</button></div>
    <div class="hint" id="dsInfo"></div>
    <div id="feelSliders"></div>
    <div class="hint" id="dsStatus"></div>
    <div class="hint" id="dsRumble"></div>
    <div class="actions"><button id="bDs">Connect adaptive triggers</button>
      <select id="dsLayout" title="Only matters over Bluetooth"><option value="auto">Layout: automatic</option><option value="usb">Force USB layout</option><option value="bt-a">Bluetooth layout A</option><option value="bt-b">Bluetooth layout B</option></select></div>
    <div class="hint">Rumble tests (browser vibration):</div>
    <div class="actions"><button data-rt="pistol">Pistol</button><button data-rt="smg">SMG burst</button><button data-rt="step">Footsteps</button><button data-rt="reload">Reload clicks</button><button data-rt="barrel1">Shotgun</button><button data-rt="hurt">Getting hit</button></div>
    <div class="hint">Trigger tests (hold RT while you try them, 6 seconds each):</div>
    <div class="actions"><button data-tt="pistol">Pistol</button><button data-tt="smg">SMG</button><button data-tt="first">Shotgun 1st</button><button data-tt="second">Shotgun 2nd</button><button data-tt="locked">Locked</button><button data-tt="kick">Buzz</button><button data-tt="off">Normal</button></div>
  </details>
  <div class="note"><b>Every number here is our own guess.</b> Minigore's real values are not published, so none are copied from it. They get replaced by measured values once we have reference footage.</div>
  <h2>Feel presets (movement)</h2>
  <div class="actions" id="presets"></div>
  <div class="stat" id="stats"></div>
  <div id="sliders"></div>
  <details><summary>Controller deadzones</summary><div id="inputSliders"></div></details>
  <h2>Last shot</h2>
  <div class="stat" id="shotStat">Fire at a dummy.</div>
  <div class="actions"><button id="bRangeReset">Reset range</button><button id="bReset">Reset all</button><button id="bCopy">Copy my settings</button><button id="bHide">Hide panel</button></div>
  <label class="chk"><input type="checkbox" id="dbg"> Show colliders and numbers</label>
  <textarea id="copyBox" readonly hidden></textarea>
  <h2>Diagnostics</h2><div class="diag" id="diag"></div>
</aside>
<button id="panelBtn">Tuning</button>
<div id="hurtflash"></div><div id="pauseCard"><h1>PAUSED</h1></div><div id="over"><div><h1 id="overTitle">Game Over</h1><p id="overSub"></p><p id="overWave"></p><div class="big" id="overScore"></div><p id="overBest"></p><button id="bRetry" class="primary">Play again</button> <button id="bOverBack">Heroes</button></div></div><div id="focus"><div><h1>Blob Minigore</h1><p>Click to start · <b>WASD</b> moves · hold <b>click</b> to fire (it aims itself)</p><p style="opacity:.8;font-size:13px"><b>Controller:</b> press any button, pick a hero, <b>A</b> to play. Left stick moves, <b>R2</b> fires.</p></div></div>`;

const hud = createHud($('#app'));

/* ------------------------------ engine ------------------------------ */
const canvas = $('#c');
const stage = createStage(canvas), fx = createFx(stage.scene);
const arena = createArena(stage);
const rig = await loadRig();                                  // arms + shotgun authored in Blender
const heroes = DESIGNS.map(d => new Hero(d, stage, fx, rig));
let selected = 0, mode = 'compare';
let runWeapon = 'pistol', appliedWeapon = null, bloom = 0;          // the weapon you carry in the run; the weapon last put in the hero's hands; how far the SMG's aim has opened up
const RANGE_WEAPONS = ['pistol', 'smg', 'shotgun'];
const weaponId = () => (mode === 'run' ? runWeapon : RANGE_WEAPONS[tuning.get('gun.weapon') | 0] || 'pistol');

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

/* ------------------------------ survival run session ------------------------------ */
const sess = createSession({ world: arena.world, bounds: ARENA_BOUNDS, rng: Math.random, hearts: 3, speed: () => tuning.get('run.speed'), pressure: () => tuning.get('run.pressure'), playerRadius: 0.5 });
const furries = createFurries(stage.scene, fx);
let bestScore = parseInt(localStorage.getItem('blob.best') || '0', 10);
let gamePaused = false, fireHold = 0;
const lock = createLock();

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
let W = weaponParams('pistol');                                  // the numbers of the weapon in hand, with the player's tuning laid over them
function readTuning() {
  P.maxSpeed = tuning.get('move.maxSpeed'); P.accel = tuning.get('move.accel'); P.brake = tuning.get('move.brake'); P.turnAccel = tuning.get('move.turnAccel');
  P.aimFollow = tuning.get('aim.follow'); P.legsFollow = tuning.get('legs.follow'); P.squash = tuning.get('anim.squash'); P.lean = tuning.get('anim.lean'); P.bob = tuning.get('anim.bob'); P.stepLen = tuning.get('anim.stepLen');
  W = weaponParams(weaponId(), k => tuning.get(k));
  P.pellets = W.pellets; P.spread = W.spread * Math.PI / 180; P.bias = W.bias; P.damage = W.damage; P.range = W.range;
  P.falloffStart = W.falloffStart; P.minDamage = W.minDamage; P.pelletSpeed = W.pelletSpeed; P.interval = W.interval; P.reload = W.reload;
  P.capacity = W.capacity; P.recoil = W.recoil; P.assistMode = ['manual', 'assist', 'auto'][tuning.get('assist.mode')]; P.assistCone = tuning.get('assist.cone'); P.assistStrength = tuning.get('assist.strength');
  P.camKick = tuning.get('fx.camKick'); P.hitPause = tuning.get('fx.hitPause'); P.rumble = tuning.get('fx.rumble') > 0.5; P.numbers = tuning.get('fx.numbers') > 0.5;
}
readTuning();
let feel = buildFeel();                                                       // the trigger effects, rebuilt whenever a trigger setting moves
function refreshFeel() { feel = buildFeel({ strength: tuning.get('trig.strength'), strength2: tuning.get('trig.strength2'), start: tuning.get('trig.start'), press: tuning.get('trigger.press'), lock: tuning.get('trig.lock'), buzz: tuning.get('trig.buzz') }); }
refreshFeel();
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

/* ------------------------------ controller feel: rumble patterns + PS5 adaptive triggers ------------------------------ */
const dualsense = createDualSense({ onStatus: t => { const el = document.querySelector('#dsStatus'); if (el) el.textContent = t; } });
/** Vibration goes through the controller's own motors (WebHID) when it is connected that way, because browsers often do not rumble a DualSense; otherwise through the browser. */
const rumbleRoute = () => { const v = tuning.get('pad.rumbleVia') | 0; return v === 2 ? 'browser' : v === 1 ? 'hid' : dualsense.usable ? 'hid' : 'browser'; };
function sendRumble(heavy, light, ms) {
  if (rumbleRoute() === 'hid' && dualsense.rumble(heavy, light, ms)) return 'hid';
  snap.pad.rumble?.(heavy, light, ms); return 'browser';
}
const RUMBLE_KEY = { shot: 'fx.rumbleShot', reload: 'fx.rumbleReload', hurt: 'fx.rumbleHurt', kill: 'fx.rumbleKill', world: 'fx.rumbleWorld', move: 'fx.rumbleMove' };
const haptics = createHaptics({
  rumble: (strong, weak, ms) => { if (P.rumble && snap.source === 'controller') sendRumble(shapeMotor(strong, tuning.get('pad.floor'), tuning.get('pad.ceil')), shapeMotor(weak, tuning.get('pad.floor'), tuning.get('pad.ceil')), ms); },
  trigger: dualsense, triggersOn: () => tuning.get('fx.triggers') > 0.5, feel: () => feel,
  scale: name => tuning.get('fx.rumbleScale') * tuning.get(RUMBLE_KEY[rumbleCategory(name)]),         // overall strength x the strength of this kind of event
});
/* ------------------------------ controller lights ------------------------------ */
const flash = createFlash(); let lightT = 0, lastLightKey = '', lastLightAt = -1e9, lastLeds = -1, lightsWereOn = true;
const lightCue = { hit: () => flash.cue(COLORS.white, 0.5), tick: () => flash.cue(COLORS.cyan, 0.35), wave: () => flash.cue(COLORS.gold, 0.8), weapon: () => flash.cue(COLORS.orange, 1.0) };
function updateLights(dt) {
  if (!dualsense.usable || calib.state.active) return;
  lightT += dt;
  const on = tuning.get('pad.light') > 0.5;
  if (!on) { if (lightsWereOn) { dualsense.setLight([0, 0, 0], 0); lightsWereOn = false; lastLightKey = ''; } }
  else {
    lightsWereOn = true;
    const screen = mode === 'run' ? (sess.run.over ? 'over' : gamePaused ? 'paused' : 'play') : 'menu';
    const c = scaleColor(lightColor({ screen, hero: hexRgb(heroes[selected].d.base), hp: sess.run.hp, max: sess.run.maxHp, t: lightT, flash: flash.step(dt) }), tuning.get('pad.lightBright'));
    const key = c.join(','), t = performance.now();
    if (key !== lastLightKey && t - lastLightAt >= 50) { lastLightKey = key; lastLightAt = t; dualsense.setLight(c, 0); }       // at most 20 colour changes a second
  }
  const mask = ledPattern({ mode: ['off', 'ammo', 'health'][tuning.get('pad.leds') | 0] || 'off', ammo: gun.state.ammo, capacity: P.capacity, reloading: gun.reloading, hp: sess.run.hp, max: sess.run.maxHp, t: lightT });
  if (mode !== 'run' && mode !== 'play') { if (lastLeds !== 0) { lastLeds = 0; dualsense.setPlayers(0); } }
  else if (mask !== lastLeds) { lastLeds = mask; dualsense.setPlayers(mask); }
}

/* ------------------------------ controller calibration ------------------------------ */
const calib = createCalibration({ onDone: applyCalibration });
function applyCalibration(r) {
  const out = [];
  if (r.floor !== null) { tuning.set('pad.floor', +r.floor.toFixed(2)); out.push(`weakest rumble ${(r.floor * 100) | 0}%`); }
  if (r.triggerStrength !== null) { const s = r.triggerStrength; tuning.set('trig.strength', s); tuning.set('trig.pistol', Math.max(1, s - 1)); tuning.set('trig.strength2', Math.min(8, s + 2)); out.push(`trigger resistance ${s}`); }
  if (r.humAmplitude !== null) { tuning.set('trig.smgBuzz', r.humAmplitude); out.push(`SMG hum ${r.humAmplitude}`); }
  if (r.lightLevel !== null) { tuning.set('pad.lightBright', +r.lightLevel.toFixed(2)); out.push(`lightbar ${(r.lightLevel * 100) | 0}%`); }
  endCalibration(`Calibrated: ${out.join(', ') || 'nothing felt'}. Saved.`);
}
/** a message in the controller info line that stays for a few seconds, then gives way to the live status */
function infoNote(msg) { const el = $('#dsInfo'); el.dataset.msg = msg || ''; el.dataset.until = performance.now() + 8000; if (msg) el.textContent = msg; }
function infoLine() {
  const via = rumbleRoute() === 'hid' ? 'through the controller' : 'through the browser', b = dualsense.state.battery;
  const conn = dualsense.usable ? `Controller connected over ${dualsense.state.kind === 'bt' ? 'Bluetooth' : 'USB'}` : 'Controller not connected for triggers and lights (press Connect below)';
  return `${conn}. Vibration goes ${via}.${b ? ` Battery ${b.pct}%${b.charging ? ' (charging)' : b.full ? ' (full)' : ''}.` : ''}`;
}
function endCalibration(msg) {
  haptics.hold(0); dualsense.release(); lastLightKey = ''; lastLeds = -1;
  $('#calibBox').hidden = true; $('#bCalib').disabled = false; infoNote(msg);
}
function driveCalibration(c) {
  const d = c.drive; haptics.hold(400);
  if (d.type === 'motor') sendRumble(d.motor === 'heavy' ? d.level : 0, d.motor === 'light' ? d.level : 0, 140);          // raw: the point is to find where it starts
  else if (d.type === 'trigger') { dualsense.set({ right: { effect: 'weapon', start: 3, end: 5, strength: d.strength }, left: { effect: 'off' } }); }
  else if (d.type === 'hum') { dualsense.set({ right: { effect: 'vibration', position: 4, amplitude: d.amplitude, frequency: tuning.get('trig.smgFreq') }, left: { effect: 'off' } }); }
  else if (d.type === 'light' && dualsense.usable) dualsense.setLight(scaleColor([255, 140, 190], d.level), 0);
  $('#calibTitle').textContent = `${c.index + 1}/${c.count}  ${c.title}`; $('#calibHint').textContent = c.hint; $('#calibBox i').style.width = (c.level * 100).toFixed(0) + '%';
}
function startCalibration() {
  if (!dualsense.usable && !snap.pad.rumble) { infoNote('Connect the controller first (the Connect button below): calibration needs to talk to its motors and triggers.'); return; }
  audio.unlock(); calib.start(); $('#calibBox').hidden = false; $('#bCalib').disabled = true;
}

const releaseTriggers = () => { dualsense.setLight([0, 90, 255], 1); dualsense.setPlayers(null); dualsense.release(); };                              // never leave the triggers stiff when the page goes away
addEventListener('pagehide', releaseTriggers); document.addEventListener('visibilitychange', () => { if (document.hidden) releaseTriggers(); });
dualsense.autoConnect();                                                        // a controller allowed before reconnects by itself

/* ------------------------------ shooting ------------------------------ */
const _m = new THREE.Vector3();
function muzzleReach() { return heroes[selected].muzzleReach; }
/** put the right gun in the hero's hands whenever the weapon changes (a new run, the wave-2 SMG, the range's weapon setting) */
function syncWeapon() {
  const id = weaponId(); if (id === appliedWeapon) return; appliedWeapon = id; readTuning();
  for (const hr of heroes) hr.setWeapon(id, W);
  gun.setParams({ capacity: P.capacity, interval: P.interval, reload: P.reload }); gun.reset(); bloom = 0;
}
function unlockWeapon(id) {
  if (runWeapon === id) return; runWeapon = id; syncWeapon();
  hud.note(`NEW WEAPON  \u00b7  ${WEAPONS[id].name.toUpperCase()}`); audio.sfx.unlock?.(); haptics.reload('close'); lightCue.weapon();
}
// every footfall rumbles, harder the faster the hero runs (the walk cycle steps once per stride, so faster running steps more often too)
for (const hr of heroes) hr.onStep = (side, speedF) => { if (hr === heroes[selected] && (mode === 'run' || mode === 'play') && !gamePaused) haptics.step(side, speedF); };

function shoot(barrel, ammoLeft = 1) {
  const h = heroes[selected], ax = player.aimX, ay = player.aimY, sg = W.id === 'shotgun';
  // the visible gun takes the exact aim and position of this shot first, so the flash, the gun and the pellet origin are one and the same place
  h.snapAim(player.x, player.y, Math.atan2(ax, ay)); h.muzzleWorld(_m);
  const side = sg ? (barrel ? 0.078 : -0.078) : 0, px = -ay, py = ax;                    // the shotgun's barrels sit left/right of the centre line; a pistol or SMG has one muzzle
  const muzzle = { x: _m.x + px * side, y: _m.z + py * side };
  const id = ++shotId, spec = { range: P.range, damage: P.damage, falloffStart: P.falloffStart, minDamage: P.minDamage };
  const st = { id, fired: P.pellets, hits: 0, damage: 0, nearest: Infinity, kills: 0, t: performance.now() }; stats.recent.set(id, st); stats.last = st; stats.shots++; stats.pellets += P.pellets;
  if (stats.recent.size > 6) stats.recent.delete(stats.recent.keys().next().value);
  // the SMG's aim opens up the longer you hold the trigger and settles when you let go
  const spread = P.spread * (1 + bloom); bloom = Math.min(W.bloomMax, bloom + W.bloomPerShot);
  // anything between the player and the muzzle (a dummy against the gun, a wall) is resolved before the pellets start flying
  const liveTargets = mode === 'run' ? sess.crowd.list : targets;
  launchBlast({ sim: pellets, from: player, muzzle, dir: { x: ax, y: ay }, angles: pelletPattern(P.pellets, spread, P.bias), spec, speed: () => P.pelletSpeed * R2(0.94, 1.06), world: arena.world, targets: liveTargets, shot: id, onHit });
  // recoil on the hero, kick on the gun and camera
  player.kb.x -= ax * P.recoil; player.kb.y -= ay * P.recoil; h.fire();
  const kbm = Math.hypot(player.kb.x, player.kb.y); if (kbm > 12) { player.kb.x *= 12 / kbm; player.kb.y *= 12 / kbm; }   // rapid fire can't stack a shove without limit
  ck.vx += -ax * P.camKick * W.camKick * 14; ck.vz += -ay * P.camKick * W.camKick * 14;
  // the muzzle flash is drawn where the pellets start
  if (sg) { fx.wad(_m.x, 0.8, _m.z, ax, ay); fx.flash(_m.x, 0.8, _m.z, ax, ay); fx.smoke(_m.x, 0.8, _m.z, ax, ay); fx.sparks(_m.x, _m.z, ax, ay, '#ffd88a', 6); audio.sfx.blast(barrel); }
  else {
    fx.flash(_m.x, 0.8, _m.z, ax, ay); fx.sparks(_m.x, _m.z, ax, ay, '#ffd88a', W.id === 'smg' ? 2 : 3); if (W.id === 'pistol' || stats.shots % 3 === 0) fx.smoke(_m.x, 0.8, _m.z, ax, ay);
    fx.casing(_m.x - ax * (h.muzzleReach - 0.55) + px * 0.2, 0.85, _m.z - ay * (h.muzzleReach - 0.55) + py * 0.2, px * R2(1.2, 2.4) - ax * R2(0, 0.6), R2(3, 4.5), py * R2(1.2, 2.4) - ay * R2(0, 0.6), true);   // a small brass casing flips out of the right side
    audio.sfx[W.id]?.();
  }
  haptics.fire(W.id, ammoLeft, P.capacity);                  // the shotgun's first barrel thumps harder than the second; the pistol cracks; the SMG rattles
}
function onHit(h) {
  const st = stats.recent.get(h.shot);
  if (h.ref?.isEnemy) {
    const e = h.ref;
    const res = sess.hit(e, h.damage, h.dx, h.dy);
    stats.hits++; stats.damage += res.dealt; if (st) { st.hits++; st.damage += res.dealt; st.nearest = Math.min(st.nearest, h.dist); }
    furries.hit(e, h.nx, h.ny);
    if (!(e.sndT > 0)) { audio.sfx.hit(0.6); e.sndT = 0.05; }
    if (res.killed) {
      stats.kills++; if (st) st.kills++;
      haptics.kill(); pauseT = Math.max(pauseT, P.hitPause * (e.tier === 2 ? 2 : 1)); audio.sfx.pop();
      furries.die(e, h.dx, h.dy);
      if (e.tier === 2) shake = Math.max(shake, 0.35);
    }
    return;
  }
  if (h.kind === 'target') {
    const tg = h.ref, v = views.get(tg), r = tg.damage(h.damage);
    stats.hits++; stats.damage += r.dealt; if (st) { st.hits++; st.damage += r.dealt; st.nearest = Math.min(st.nearest, h.dist); }
    v.hit(h.dx, h.dy, h.damage); fx.sparks(h.x, h.y, h.nx, h.ny, '#fff2c4', 2);
    for (let i = 0; i < 2; i++) fx.emit(h.x, 0.9, h.y, h.nx * R2(1, 3) + R2(-1, 1), R2(0.5, 2), h.ny * R2(1, 3) + R2(-1, 1), R2(0.25, 0.4), R2(0.06, 0.11), '#e8c85a', { g: 9, op: 0.95 });
    tg.dmgAcc = (tg.dmgAcc || 0) + r.dealt; tg.dmgT = 0.09; tg.dmgKill = tg.dmgKill || r.killed;
    if (!(tg.sndT > 0)) { audio.sfx.hit(clamp(h.damage / 12, 0.3, 1)); tg.sndT = 0.05; }
    if (r.killed) {
      stats.kills++; if (st) st.kills++; v.kill(); audio.sfx.pop(); haptics.kill(); pauseT = Math.max(pauseT, P.hitPause);
      for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, sp = R2(2, 6); fx.emit(tg.x, 1, tg.y, Math.cos(a) * sp, R2(2, 6), Math.sin(a) * sp, R2(0.5, 0.9), R2(0.08, 0.16), ['#e8c85a', '#c9a66b', '#fff6e8', '#e85d5d'][i & 3], { g: 14, op: 1 }); }
      fx.ring(tg.x, tg.y, 2.6, '#ffd23f', 0.5);
    }
  } else {
    fx.sparks(h.x, h.y, h.nx, h.ny, '#ffe9a8', 4); fx.emit(h.x, 0.5, h.y, h.nx * 0.5, 0.4, h.ny * 0.5, 0.35, 0.1, '#cdbd9a', { grow: 1.6, op: 0.5 });
    if (h.ref.kind === 'board') arena.boardMark(h.x);
  }
}

/* ------------------------------ simulation (fixed 120 Hz) ------------------------------ */
let shake = 0, prevFire = false;
function simStep(h) {
  if (mode !== 'play' && mode !== 'run') { input.consumeTap(); return; }
  if (gamePaused || sess.run.over) { input.consumeTap(); return; }      // taps made on menus must not fire a shot when play starts
  const pm = mode === 'run' ? sess.run.speedMul : 1;                                 // the getaway burst after a hit
  const v = player.v; stepVelocity(v, snap.move, pm === 1 ? P : { ...P, maxSpeed: P.maxSpeed * pm, accel: P.accel * pm }, h);
  const sp = Math.hypot(v.x, v.y);
  if (snap.move.mag > 0.4 && sp > 3 && (v.x * snap.move.x + v.y * snap.move.y) / (sp * snap.move.mag) < -0.3) { player.skidT -= h; if (player.skidT <= 0) { player.skidT = 0.05; fx.dust(player.x, player.y, v.x / sp, v.y / sp, 0.9); } }
  player.x += (v.x + player.kb.x) * h; player.y += (v.y + player.kb.y) * h;
  const kd = Math.exp(-9 * h); player.kb.x *= kd; player.kb.y *= kd;
  const rad = heroes[selected].radius;
  const impact = resolveWorld(player, v, rad, arena.world);
  for (const t of targets) if (t.alive) circleVsCircle(player, v, rad, t);               // dummies are solid
  if (mode === 'run') { for (const e of sess.crowd.list) if (e.alive && e.state !== 'emerge') circleVsCircle(player, v, rad, e); resolveWorld(player, v, rad, arena.world); }   // furries are solid too: a crowd can box you in
  if (impact > 2.5 && player.impact <= 0) { player.impact = 0.15; fx.dust(player.x, player.y, -v.x, -v.y, Math.min(1, impact / 7)); shake = Math.max(shake, Math.min(0.25, impact * 0.025)); }
  player.impact -= h; player.vx = v.x + player.kb.x; player.vy = v.y + player.kb.y; player.speed = Math.hypot(player.vx, player.vy);

  // aim. In the run it is the left stick and R2 only: the right stick and the mouse are ignored. Holding R2 locks the nearest furry and the
  // hero turns to it; the gun only fires once it points at it, so the first shot never goes the way you were walking.
  let helped, fireOk = true;
  if (mode === 'run') {
    fireHold = snap.fire ? 0.35 : Math.max(0, fireHold - h);                 // keep facing the target briefly between trigger pulls
    const goal = runAim(player, { x: 0, y: 0 }, snap.move, snap.fire || fireHold > 0, sess.crowd.list, arena.world, { range: Math.min(tuning.get('run.range'), P.range - 0.5), lead: tuning.get('run.lead'), pelletSpeed: P.pelletSpeed, lock, dt: h });
    helped = goal;
    if (goal.aiming) {
      const from = player.hasAim ? { x: player.aimX, y: player.aimY } : (player.speed > 0.5 ? { x: player.vx / player.speed, y: player.vy / player.speed } : { x: player.aimX, y: player.aimY });
      const r = turnToward(from, goal, 30, h); helped = { ...goal, x: r.x, y: r.y };
      fireOk = aimError(helped, goal) < 0.12;
    }
  } else {
    let explicit = { x: 0, y: 0 };
    if (snap.mouseAim) { const a = mouseAim(player, input.mouse, { x: player.aimX, y: player.aimY }); explicit = { x: a.x, y: a.y }; }
    else if (snap.aim.mag > 0.02) explicit = { x: snap.aim.x / snap.aim.mag, y: snap.aim.y / snap.aim.mag };
    helped = chooseAim(player, explicit, snap.move, snap.fire, targets, arena.world, { mode: snap.mouseAim ? 'manual' : P.assistMode, coneDeg: P.assistCone, strength: P.assistStrength, range: P.range + 3 });
  }
  if (helped.aiming) { player.aimX = helped.x; player.aimY = helped.y; player.hasAim = true; } else player.hasAim = snap.fire;
  player.assistTarget = helped.target;

  // the gun
  gun.setParams({ capacity: P.capacity, interval: P.interval, reload: P.reload });      // a changed reload time only applies to the NEXT reload
  if (snap.fire && !prevFire && (gun.reloading || gun.state.ammo <= 0)) haptics.dry();       // pulling a trigger that cannot fire: a small dry tick
  prevFire = snap.fire;
  const reloadKey = input.keys.has('KeyR') || !!snap.buttons[2]?.pressed;
  bloom = Math.max(0, bloom - W.bloomDecay * h);
  for (const e of gun.update(h, { fire: snap.fire && fireOk, reload: reloadKey })) {
    if (e.type === 'shot') shoot(e.barrel, e.ammoLeft);
    else if (e.type === 'reloadStart') audio.sfx.open();
    else if (e.type === 'reloadDone') haptics.reload('grab');                     // a tiny tick: the gun is ready
  }
  input.consumeTap();                                        // this step has now seen any tap; fire falls back to the real held state
  const stepTargets = mode === 'run' ? sess.crowd.list : targets;
  pellets.step(h, arena.world, stepTargets, onHit);
  if (mode === 'run') {
    const events = sess.step(h, { x: player.x, y: player.y, vx: player.v.x, vy: player.v.y, r: heroes[selected].radius });
    for (const ev of events) {
      if (ev.type === 'countdown') { hud.countdown(ev.n, ev.wave); audio.sfx.tick?.(ev.n); lightCue.tick(); if (ev.n === 3) unlockWeapon(weaponForWave(ev.wave)); }   // the SMG arrives with the breather after wave 1
      else if (ev.type === 'wave') { hud.wave(ev.wave); audio.sfx.wave?.(); haptics.swarm?.(); lightCue.wave(); unlockWeapon(weaponForWave(ev.wave)); }
      else if (ev.type === 'telegraph') { furries.warn(ev.x, ev.y, ev.delay, tierOf(ev.kind, ev.tier).h); }
      else if (ev.type === 'spawn') { audio.sfx.spawn?.(); }
      else if (ev.type === 'swarm') { audio.sfx.swarm?.(); haptics.swarm?.(); }
      else if (ev.type === 'hurt') {
        { const dx = player.x - ev.enemy.x, dy = player.y - ev.enemy.y, d = Math.hypot(dx, dy) || 1, f = 4 + ev.enemy.r * 4; player.kb.x += dx / d * f; player.kb.y += dy / d * f; }
        shake = Math.max(shake, 0.3); haptics.hurt?.(); audio.sfx.hurt?.();
        const hf = $('#hurtflash'); hf.classList.add('on'); setTimeout(() => hf.classList.remove('on'), 60);
        document.body.classList.toggle('low-hp', sess.run.hp === 1); lightCue.hit();
        hud.setHealth(sess.run.hp, sess.run.maxHp);
        heroes[selected].setDamage(sess.run.maxHp - sess.run.hp);                      // hat flies off on the first hit, a plaster on the second
      }
      else if (ev.type === 'dead') { hud.setHealth(0, sess.run.maxHp); hud.hideBanner(); onGameOver(); }
    }
  }
  for (const t of targets) {
    if (t.update(h) === 'respawned') { views.get(t).respawn(); fx.ring(t.x, t.y, 1.8, '#fff6e8', 0.4); }
    if (t.sndT > 0) t.sndT -= h;
    if (t.dmgAcc > 0 && (t.dmgT -= h) <= 0) { if (P.numbers) fx.number(t.x, 2.6, t.y, String(Math.round(t.dmgAcc)), t.dmgKill || t.dmgAcc >= 60 ? '#ffd23f' : '#ffffff'); t.dmgAcc = 0; t.dmgKill = false; }
  }
}
// the hero reports each beat of the reload animation; sounds only play for the hero you are actually controlling
for (const h of heroes) h.onReloadStage = (stage, who) => {
  if ((mode !== 'play' && mode !== 'run') || who !== heroes[selected]) return;
  if (stage === 'eject') audio.sfx.eject(); else if (stage === 'grab') audio.sfx.grab(); else if (stage === 'insert') audio.sfx.insert(); else if (stage === 'close') audio.sfx.close();
  haptics.reload(stage);                                                       // each beat of the reload has its own click, building toward the close
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
  updateModeButton();
  if (mode === 'play') {
    heroes[i].legYaw = heroes[i].aimYaw = Math.atan2(player.aimX, player.aimY);
    heroes[i].reloadPrev = gun.progress;     // pick the reload up where it is, don't replay its earlier beats
  }
}
// the button always names the hero that is selected right now, however it was selected (card, 1/2/3, controller)
function updateModeButton() { $('#bMode').textContent = mode === 'compare' ? `Play as ${heroes[selected].d.name}` : mode === 'run' ? 'Compare designs' : 'Compare designs'; }
function setMode(m) {
  mode = m; gamePaused = false; updateModeButton();
  const inArena = m === 'play' || m === 'run';
  arena.setVisible(inArena); arena.startPad.visible = m === 'play'; showGroup.visible = m === 'compare'; aimGroup.visible = cross.visible = m === 'play'; tracer.visible = inArena;
  heroes.forEach((h, k) => { h.setVisible(m === 'compare' || k === selected); h.reloadPrev = -1; });
  if (inArena) { player.x = SPAWN.x; player.y = SPAWN.y; player.v.x = player.v.y = 0; player.kb.x = player.kb.y = 0; player.speed = 0; gun.reset(); pellets.clear(); }
  if (m === 'run') startRun();
  else { furries.setVisible(false); furries.clear(); sess.crowd.clear(); lock.target = null; for (const hr of heroes) hr.setDamage(0); }
  syncWeapon();
  heroes.forEach((h, k) => { if (m === 'compare') h.root.position.set(SHOW.x + (k - 1) * 4.6, 0, SHOW.z); });
  $('#panel').classList.toggle('collapsed', m === 'compare' || innerWidth < 900);
  $('#cards').style.display = m === 'compare' ? 'flex' : 'none'; $('#ammo').style.display = inArena ? 'flex' : 'none';
  document.body.classList.toggle('mode-compare', m === 'compare');
  document.body.classList.toggle('mode-run', m === 'run'); if (m !== 'run') document.body.classList.remove('paused', 'low-hp');
  updateHint();
}
/** a fresh survival run: full hearts, empty arena, hero back on the spawn */
function startRun() {
  sess.reset(tuning.get('run.hearts') | 0 || 3); lock.target = null; fireHold = 0; gamePaused = false; runWeapon = 'pistol'; syncWeapon();
  furries.clear(); furries.setVisible(true); gun.reset(); pellets.clear();
  player.x = SPAWN.x; player.y = SPAWN.y; player.v.x = player.v.y = 0; player.kb.x = player.kb.y = 0; player.speed = 0; player.hasAim = false;
  $('#over').classList.remove('on'); document.body.classList.remove('paused', 'low-hp');
  for (const hr of heroes) hr.setDamage(0);
  hud.reset(sess.run.hp, sess.run.maxHp); panelNav.clear();
}
function setPaused(p) {
  if (!p && calib.state.active) { calib.cancel(); endCalibration('Calibration cancelled.'); }
  gamePaused = p; document.body.classList.toggle('paused', p && mode === 'run');
  if (p && mode === 'run') panelNav.reset(); else panelNav.clear();
}
function updateHint() {
  $('#hint').innerHTML = mode === 'compare'
    ? '<b>1</b><b>2</b><b>3</b> choose · <b>Enter</b> or Play button to run. <b>Training</b> for the range.<br>Controller: <b>D-pad</b>/<b>LB</b><b>RB</b> choose · <b>A</b> play · <b>Y</b> training range.'
    : mode === 'run'
    ? '<b>WASD</b> move · hold <b>click</b> to fire (it aims itself) · <b>Esc</b> pause<br>Controller: left stick moves · <b>R2</b> fires at the nearest furry · <b>Start</b> pause.'
    : '<b>WASD</b> move · mouse aims · <b>click</b> fires · <b>R</b> reloads · <b>C</b> back to hero select<br>Controller: sticks move and aim · <b>RT</b> fires · <b>B</b> back.';
}
$('#bMode').onclick = () => setMode(mode === 'compare' ? 'run' : 'compare');
addEventListener('keydown', e => {
  if (e.repeat) return; audio.unlock();
  if (e.code === 'Digit1') choose(0); else if (e.code === 'Digit2') choose(1); else if (e.code === 'Digit3') choose(2);
  else if (e.code === 'KeyC') setMode(mode === 'compare' ? 'play' : 'compare');
  else if (e.code === 'Enter' && mode === 'compare') setMode('run');
  else if (e.code === 'Enter' && mode === 'play') setMode('run');
  else if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'run' && !sess.run.over) setPaused(!gamePaused);
  else if (e.code === 'Enter' && mode === 'run' && sess.run.over) startRun();
  $('#focus').classList.add('off');
});
const startFocus = () => { audio.unlock(); $('#focus').classList.add('off'); canvas.focus(); };
$('#focus').addEventListener('pointerdown', startFocus); canvas.addEventListener('pointerdown', startFocus);

// controller menus: one action per button press (see src/input/menu.js)
const nav = createMenuNav({ directions: true }), panelNav = createPanelNav($('#panel'));
function menuStep() {
  const cmds = menuCommands(nav.update(snap.pad), { overlayUp: !$('#focus').classList.contains('off'), mode, selected, count: heroes.length, over: sess.run.over, paused: gamePaused });
  for (const c of cmds) {
    if (calib.state.active) { if (c.type === 'activate') calib.confirm(); else if (c.type === 'resume') { calib.cancel(); endCalibration('Calibration cancelled.'); } continue; }
    if (c.type === 'start') startFocus();
    else if (c.type === 'choose') choose(c.index);
    else if (c.type === 'play') setMode('run');
    else if (c.type === 'range') setMode('play');
    else if (c.type === 'compare') setMode('compare');
    else if (c.type === 'retry') startRun();
    else if (c.type === 'pause') setPaused(true);
    else if (c.type === 'resume') setPaused(false);
    else if (c.type === 'nav') { if (c.dir === 'up') panelNav.move(-1); else if (c.dir === 'down') panelNav.move(1); else panelNav.adjust(c.dir === 'left' ? -1 : 1); }
    else if (c.type === 'activate') panelNav.press();
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
const FEEL_GROUPS = ['Vibration', 'Adaptive triggers', 'Controller output', 'Controller lights'];
addControls($('#sliders'), DEFS.filter(d => d.page === 'hero' && !FEEL_GROUPS.includes(d.group)), ['Survival run', 'Feedback']);
addControls($('#feelSliders'), [...DEFS.filter(d => FEEL_GROUPS.includes(d.group)), { ...DEFS.find(d => d.key === 'trigger.press'), group: 'Adaptive triggers', label: 'Click point (fires here)' }]);
addControls($('#inputSliders'), DEFS.filter(d => d.page === undefined && d.group !== 'Feel pad'));
let previewT = 0;
const RUMBLE_PREVIEW = { 'fx.rumbleShot': 'pistol', 'fx.rumbleReload': 'close', 'fx.rumbleHurt': 'hurt', 'fx.rumbleKill': 'kill', 'fx.rumbleWorld': 'swarm' };
/** in the pause menu, moving a vibration or trigger setting plays that feel right away, so you tune it by feeling it */
function previewFeel(k) {
  if (!k || !gamePaused) return; clearTimeout(previewT);
  previewT = setTimeout(() => {
    if (k.startsWith('trig.') || k === 'trigger.press') {
      if (!dualsense.connected) return;
      const which = k === 'trig.strength2' ? 'second' : k === 'trig.lock' ? 'locked' : k === 'trig.buzz' ? 'kick' : k === 'trig.pistol' ? 'pistol' : k.startsWith('trig.smg') ? 'smg' : 'first';
      haptics.hold(4000); dualsense.retry(); dualsense.set({ right: feel[which], left: { effect: 'off' } });
    } else if (k === 'fx.rumbleMove') { haptics.step(0, 1); setTimeout(() => haptics.step(1, 1), 180); }
    else if (k.startsWith('fx.rumble')) haptics.play(RUMBLE_PREVIEW[k] || 'pistol');
  }, 160);
}
tuning.onChange(k => { sync.forEach(f => f()); readTuning(); refreshFeel(); updateStats(); audio.setVolume(tuning.get('fx.volume')); previewFeel(k); });
audio.setVolume(tuning.get('fx.volume'));
{ const host = $('#presets'); for (const [name, vals] of Object.entries(PRESETS)) { const b = document.createElement('button'); b.textContent = name; b.onclick = () => tuning.apply(vals); host.appendChild(b); } }
function updateStats() {
  const s = moveStats({ maxSpeed: P.maxSpeed, accel: P.accel, brake: P.brake, turnAccel: P.turnAccel });
  $('#stats').innerHTML = `to top speed <b>${fmt(s.timeToTop, 2)} s</b> · stop <b>${fmt(s.stopTime, 2)} s</b> (<b>${fmt(s.stopDistance, 2)}</b> u)<br>reverse <b>${fmt(s.reverseTime, 2)} s</b> · arena crossing <b>${fmt(48 / P.maxSpeed, 1)} s</b>`;
}
updateStats();
$('#bReset').onclick = () => tuning.reset(d => d.page !== 'lab');       // only what this page shows; the lab's pad settings are kept
// Reset range: everything that belongs to the range session goes together. In-flight pellets must go too, or they would land after the
// reset and put hits, damage and kills back into a session that just said zero.
function resetRange() {
  pellets.clear(); pauseT = 0;
  arena.clearMarks();
  for (const t of targets) { t.hp = t.maxHp; t.alive = true; t.deadFor = 0; t.dmgAcc = 0; t.dmgT = 0; t.dmgKill = false; t.sndT = 0; views.get(t).respawn(); }
  stats.shots = stats.pellets = stats.hits = stats.damage = stats.kills = 0; stats.recent.clear(); stats.last = null;
  updateDiag();
}
$('#bRangeReset').onclick = resetRange;
$('#bRange').onclick = () => setMode('play');

/* controller feel panel */
{
  const status = t => { $('#dsStatus').textContent = t; };
  status(dualsense.supported
    ? 'Adaptive triggers: not connected. Best with a USB cable: plug the controller in, press Connect, and pick the DualSense in the list. Bluetooth may work too: try the layouts and the tests below.'
    : 'Adaptive triggers need WebHID, which this browser does not have (use Chrome or Edge). Rumble still works.');
  $('#bDs').onclick = async () => { audio.unlock(); await dualsense.connect(); };
  $('#dsLayout').onchange = e => dualsense.setTransport(e.target.value);
  $('#feel').addEventListener('toggle', () => { $('#dsRumble').textContent = snap.pad.connected ? (snap.pad.rumble ? 'Browser rumble: available for this controller.' : 'Browser rumble: not available.') : 'Press a button on the controller so the browser can see it.'; });
  for (const b of document.querySelectorAll('[data-rt]')) b.onclick = () => {
    audio.unlock(); const k = b.dataset.rt; if (k === 'reload') { [['eject', 0], ['grab', 220], ['insert', 520], ['close', 820]].forEach(([n, t]) => setTimeout(() => haptics.reload(n), t)); } else if (k === 'dry') haptics.play('dry');
    else if (k === 'smg') { for (let i = 0; i < 14; i++) setTimeout(() => haptics.fire('smg', 30, 30), i * 75); }                                 // a burst at the real rate
    else if (k === 'step') { for (let i = 0; i < 8; i++) setTimeout(() => haptics.step(i & 1, i < 4 ? 0.35 : 1), 40 + i * (i < 4 ? 320 : 190)); }   // walking, then running
    else haptics.play(k);
    $('#dsRumble').textContent = snap.pad.connected && snap.pad.rumble ? 'Sent to the controller.' : 'No controller rumble available: press a button on the controller first.';
  };
  for (const b of document.querySelectorAll('[data-tt]')) b.onclick = () => {
    if (!dualsense.connected) { status('Connect adaptive triggers first (button above).'); return; }
    haptics.hold(6000); dualsense.retry(); dualsense.set({ right: feel[b.dataset.tt], left: { effect: 'off' } });
  };
}
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
  if (cap > 6) { host.textContent = `${gun.state.ammo} / ${cap}`; shellCount = -1; }                          // a magazine is a number, not a row of shells
  else {
    if (shellCount !== cap) { shellCount = cap; host.innerHTML = '<i></i>'.repeat(cap); }
    [...host.children].forEach((el, i) => el.classList.toggle('on', i < gun.state.ammo));
  }
  $('#reloadBar i').style.width = gun.reloading ? gun.progress * 100 + '%' : '0%';
  $('#ammo').classList.toggle('reloading', gun.reloading);
}

function onGameOver() {
  const best = bestScore; if (sess.run.score > bestScore) { bestScore = sess.run.score; localStorage.setItem('blob.best', bestScore); }
  const ov = document.getElementById('over'); if (!ov) return; ov.classList.add('on');
  const t = document.getElementById('overTitle'); if (t) t.textContent = 'Game Over';
  const sub = document.getElementById('overSub'); if (sub) sub.textContent = `Survived ${(sess.run.time / 60 | 0)}:${String(sess.run.time % 60 | 0).padStart(2,'0')} · ${sess.run.kills} kills`;
  const sc = document.getElementById('overScore'); if (sc) sc.textContent = sess.run.score;
  let career = 0; try { career = (+localStorage.getItem('blob.points') || 0) + sess.run.score; localStorage.setItem('blob.points', career); } catch { /* storage unavailable */ }
  const ow = $('#overWave'); if (ow) ow.textContent = `Reached wave ${sess.waves.state.wave}${career ? ' · ' + career + ' career points' : ''}`;
  const bs = document.getElementById('overBest'); if (bs) bs.textContent = sess.run.score > best ? 'New Best!' : `Best: ${bestScore}`;
  audio.sfx.over?.(); haptics.hurt?.(); document.body.classList.remove('low-hp');
}
$('#bCalib').onclick = startCalibration; $('#bCalibA').onclick = () => calib.confirm();
$('#bRetry').onclick = startRun; $('#bResume').onclick = () => setPaused(false); $('#bQuit').onclick = () => setMode('compare'); $('#bOverBack').onclick = () => setMode('compare');
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
  const reach = mode === 'run' ? (player.hasAim && player.assistTarget ? 0.6 : 0) : player.hasAim ? (snap.mouseAim ? clamp(Math.hypot(input.mouse.x - player.x, input.mouse.y - player.y) / 9, 0, 1) : snap.aim.mag || (player.assistTarget ? 0.6 : 0)) : 0;
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
  { const c = calib.update(realDt); if (c) driveCalibration(c); updateLights(realDt); }
  haptics.update({ weapon: weaponId(), mode: mode === 'run' && (gamePaused || sess.run.over) ? 'menu' : mode, reloading: gun.reloading, ammo: gun.state.ammo, capacity: P.capacity });      // adaptive trigger feel follows the gun
  shake = Math.max(0, shake - realDt * 3);
  const dtv = Math.max(dt, 1e-4);

  if (mode === 'compare') {
    heroes.forEach((h, i) => { const d = demoState(i, clock); h.update(dtv, { x: SHOW.x + (i - 1) * 4.6, y: SHOW.z, ...d }, P); });
  } else {
    const h = heroes[selected];
    const still = gamePaused;   // paused: no walking in place
    h.update(dtv, { x: player.x, y: player.y, vx: still ? 0 : player.vx, vy: still ? 0 : player.vy, speed: still ? 0 : player.speed, aimYaw: player.hasAim ? Math.atan2(player.aimX, player.aimY) : null, reload: gun.progress, spent: [gun.state.spent[1], gun.state.spent[0]] }, P);
    // aim cone shows spread, range, and the full-damage zone
    aimGroup.visible = mode === 'play' && (player.hasAim || snap.fire); aimGroup.position.set(player.x, 0, player.y); aimGroup.rotation.y = Math.atan2(player.aimX, player.aimY);
    coneOuter.mesh.position.z = coneInner.mesh.position.z = muzzleReach(); coneOuter.set(P.spread, P.range); coneInner.set(P.spread, P.falloffStart);
    cross.visible = mode === 'play' && snap.mouseAim; cross.position.set(input.mouse.x, 0.06, input.mouse.y);
    const cd = Math.hypot(input.mouse.x - player.x, input.mouse.y - player.y); cross.scale.setScalar(clamp(Math.tan(P.spread) * Math.max(0, cd - muzzleReach()), 0.45, 4) / 0.36);
    updatePelletVisuals();
    updateAmmoHud();
    h.root.visible = !(mode === 'run' && sess.run.invuln > 0 && !sess.run.over && (clock * 14 | 0) % 2);   // blink while you cannot be hurt
  }
  for (const t of targets) views.get(t).update(dtv, clock);
  if (mode === 'run') { const r = furries.update(sess.crowd.list, clock, dt, player); shake = Math.max(shake, r.shake); furries.updateWarns(dt, clock); furries.updateSplats(dt); hud.update(realDt); }
  for (const hr of heroes) hr.updateFx(realDt);
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
  { const el = $('#dsInfo'); if (!calib.state.active) { const msg = performance.now() < +(el.dataset.until || 0) ? el.dataset.msg : ''; el.textContent = msg || infoLine(); } }
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
window.__hero = { resetRange, menuStep, player, heroes, input, snap, arena, stage, tuning, P, setMode, choose, simStep, gun, pellets, targets, views, stats, shoot, fx, audio, updatePelletVisuals, state: () => ({ mode, selected }), steps: () => steps, sess, furries, lock, startRun, syncWeapon, unlockWeapon, dualsense, haptics, calib, weapon: () => weaponId(), W: () => W, bloom: () => bloom, bestScore: () => bestScore };
