// The game: pick a design on the turntable, then survive waves of furry critters in the arena with a double-barrelled shotgun.
// A training range (north-west, still and patrolling dummies and a pattern board) doubles as the practice mode.
//
// This file wires the pieces together and owns the fixed 120 Hz simulation step and the run (waves, hearts, score). The pieces:
//   game/*        pure simulation: movement, collision, pellets, aim help, gun, critters, waves, rules
//   input/*       devices -> one input snapshot; controller menus; rumble and adaptive triggers
//   hero/*        everything you see: the hero rig, enemy and dummy looks, turntable, HUD, aim visuals, camera, tuning panel
import * as THREE from 'three';
import { createStage, R2 } from '../engine/stage.js';
import { clamp } from '../engine/math.js';
import { createFx } from '../engine/fx.js';
import * as audio from '../engine/audio.js';
import { createArena, SPAWN } from '../game/arena.js';
import { LAYOUT, BOUNDS } from '../game/layout.js';
import { resolveWorld, circleVsCircle } from '../game/collide.js';
import { stepVelocity } from '../game/movement.js';
import { PelletSim, pelletPattern } from '../game/pellets.js';
import { createShotgun } from '../game/shotgun.js';
import { chooseAim } from '../game/assist.js';
import { launchBlast } from '../game/blast.js';
import { Target } from '../game/targets.js';
import { Critter } from '../game/critters.js';
import { createDirector } from '../game/waves.js';
import { createHealth, createScore } from '../game/run.js';
import { RULES } from '../game/rules.js';
import { mouseAim } from '../input/process.js';
import { createInput } from '../input/source.js';
import { createMenuNav, menuCommands } from '../input/menu.js';
import { createHaptics } from '../input/haptics.js';
import { createDualSense } from '../input/dualsense.js';
import { tuning } from '../tuning.js';
import { DESIGNS } from './designs.js';
import { Hero } from './hero.js';
import { loadRig } from './rigAsset.js';
import { DummyView } from './dummy.js';
import { CritterView, PALETTE } from './critter.js';
import { PAGE, $ } from './page.js';
import { createTurntable } from './turntable.js';
import { createShotVisuals } from './shotViz.js';
import { createHud } from './hud.js';
import { createCameraRig } from './camera.js';
import { createPanel } from './panel.js';

const STEP = 1 / RULES.sim.hz;
const { hero: HERO, run: RUN, feedback: FEEDBACK } = RULES;

/* ------------------------------ page and engine ------------------------------ */
$('#app').innerHTML = PAGE;
const canvas = $('#c');
const stage = createStage(canvas), fx = createFx(stage.scene);
const view = { left: 0, top: 0, width: 1, height: 1 };                  // the canvas rect in CSS pixels, refreshed on resize (not every frame)
const measure = () => { const r = canvas.getBoundingClientRect(); view.left = r.left; view.top = r.top; view.width = r.width; view.height = r.height; };
addEventListener('resize', measure); measure();
const arena = createArena(stage);
const rig = await loadRig();                                  // arms + shotgun authored in Blender
const heroes = DESIGNS.map(d => new Hero(d, stage, fx, rig));
let selected = 0, mode = 'compare';
const turntable = createTurntable({ scene: stage.scene, camera: stage.camera, heroes, labels: $('#turntableNames') });

/* ------------------------------ the training range ------------------------------ */
const targets = [], views = new Map();
for (const [x, y] of LAYOUT.range.still) targets.push(new Target({ x, y }));
{ const pc = LAYOUT.range.patrol; for (let i = 0; i < pc.count; i++) targets.push(new Target({ x: 0, y: 0, path: pc.path, speed: pc.speed, phase: i / pc.count })); }
const dummies = targets.slice();                          // the training dummies; targets = dummies + every critter that is out of the ground
for (const t of dummies) views.set(t, new DummyView(arena.group, t, stage.camera));
const critters = [];                                       // every critter, including ones still warning, climbing out, or just killed

const shotViz = createShotVisuals(stage.scene);

/* ------------------------------ player and gun (the simulation state) ------------------------------ */
const player = { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, aimX: 0, aimY: -1, hasAim: false, speed: 0, impact: 0, skidT: 0, v: { x: 0, y: 0 }, kb: { x: 0, y: 0 }, assistTarget: null };   // kb: recoil shove, decays on its own so braking cannot cancel it instantly
const P = {};                                              // the live tuning values the game reads, refreshed whenever a setting changes
function readTuning() {
  P.maxSpeed = tuning.get('move.maxSpeed'); P.accel = tuning.get('move.accel'); P.brake = tuning.get('move.brake'); P.turnAccel = tuning.get('move.turnAccel');
  P.aimFollow = tuning.get('aim.follow'); P.legsFollow = tuning.get('legs.follow'); P.squash = tuning.get('anim.squash'); P.lean = tuning.get('anim.lean'); P.bob = tuning.get('anim.bob'); P.stepLen = tuning.get('anim.stepLen');
  P.pellets = tuning.get('gun.pellets'); P.spread = tuning.get('gun.spread') * Math.PI / 180; P.bias = tuning.get('gun.bias'); P.damage = tuning.get('gun.damage'); P.range = tuning.get('gun.range');
  P.falloffStart = tuning.get('gun.falloffStart'); P.minDamage = tuning.get('gun.minDamage'); P.pelletSpeed = tuning.get('gun.pelletSpeed'); P.interval = tuning.get('gun.interval'); P.reload = tuning.get('gun.reload');
  P.capacity = tuning.get('gun.capacity'); P.recoil = tuning.get('gun.recoil'); P.assistMode = ['manual', 'assist', 'auto'][tuning.get('assist.mode')]; P.assistCone = tuning.get('assist.cone'); P.assistStrength = tuning.get('assist.strength');
  P.camKick = tuning.get('fx.camKick'); P.hitPause = tuning.get('fx.hitPause'); P.rumble = tuning.get('fx.rumble') > 0.5; P.numbers = tuning.get('fx.numbers') > 0.5;
  P.camDist = tuning.get('cam.dist'); P.camTilt = tuning.get('cam.tilt'); P.camFollow = tuning.get('cam.follow'); P.camVelLead = tuning.get('cam.velLead'); P.camAimLead = tuning.get('cam.aimLead');
}
readTuning(); tuning.onChange(readTuning);
const gun = createShotgun({ capacity: P.capacity, interval: P.interval, reload: P.reload });
const pellets = new PelletSim();
const stats = { shots: 0, pellets: 0, hits: 0, damage: 0, kills: 0, recent: new Map(), last: null };
let shotId = 0, pauseT = 0;
const camera = createCameraRig(stage);

/* ------------------------------ input ------------------------------ */
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
let lastClient = { x: 0, y: 0 };
function groundPoint(cx, cy) {
  ndc.set((cx - view.left) / view.width * 2 - 1, -((cy - view.top) / view.height) * 2 + 1);
  ray.setFromCamera(ndc, stage.camera); return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.z } : null;
}
canvas.addEventListener('pointermove', e => { lastClient = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerdown', e => { lastClient = { x: e.clientX, y: e.clientY }; });
const input = createInput({ target: canvas, toWorld: e => groundPoint(e.clientX, e.clientY), origin: () => player, lastAim: () => ({ x: player.aimX, y: player.aimY }), tuning });
const snap = input.snap;

/* ------------------------------ controller feel: rumble patterns + PS5 adaptive triggers ------------------------------ */
const dualsense = createDualSense({ onStatus: t => { const el = document.querySelector('#dsStatus'); if (el) el.textContent = t; } });
const rumbleLevel = k => Math.pow(Math.min(10, Math.max(0, tuning.get(k))) / 10, 1.5);       // 0-10 slider; a gentle curve because the motors respond steeply at the low end
const haptics = createHaptics({
  rumble: (strong, weak, ms) => { if (!P.rumble || snap.source !== 'controller') return; if (!dualsense.motors(strong, weak, ms)) snap.pad.rumble?.(strong, weak, ms); },   // over the DualSense link when connected (reliable on Bluetooth), else the browser's rumble; only for a controller player
  trigger: dualsense, scale: () => rumbleLevel('fx.vibAll'), mix: g => rumbleLevel(g === 'reload' ? 'fx.vibReload' : g === 'walk' ? 'fx.vibWalk' : 'fx.vibShoot'), triggersOn: () => tuning.get('fx.triggers') > 0.5,
});
const smart = () => tuning.get('fx.smartRumble') > 0.5;
const releaseTriggers = () => dualsense.release();                              // never leave the triggers stiff when the page goes away
addEventListener('pagehide', releaseTriggers); document.addEventListener('visibilitychange', () => { if (document.hidden) releaseTriggers(); });
dualsense.autoConnect();                                                        // a controller allowed before reconnects by itself

/* ------------------------------ the run: waves of critters, hearts, score ------------------------------ */
const health = createHealth(), score = createScore(), director = createDirector();
const hud = createHud(stage.camera);
const bestKey = 'blobshooter.best';
const loadBest = () => { try { return +localStorage.getItem(bestKey) || 0; } catch { return 0; } };
const run = { mode: /[?&]practice/.test(location.search) ? 'practice' : 'run', state: 'idle', overT: 0, best: loadBest(), time: 0 };   // mode: 'run' (survival) or 'practice' (just the dummies)
const syncTargets = () => { targets.length = dummies.length; for (const c of critters) if (c.alive) targets.push(c); };
function addCritter(c) { critters.push(c); views.set(c, new CritterView(arena.group, c)); return c; }
function clearCritters() { for (const c of critters) { views.get(c)?.dispose(); views.delete(c); } critters.length = 0; syncTargets(); }
function setDummies(on) { for (const t of dummies) { t.alive = on; t.hp = t.maxHp; t.respawnT = on ? 2.5 : 1e9; t.deadFor = 0; views.get(t).group.visible = on; if (on) views.get(t).respawn(); } }
function clearSpot(x, y, r) {
  for (const c of arena.world.circles) if (Math.hypot(x - c.x, y - c.y) < c.r + r) return false;
  for (const b of arena.world.boxes) { const qx = Math.max(b.x - b.hw, Math.min(b.x + b.hw, x)), qy = Math.max(b.y - b.hh, Math.min(b.y + b.hh, y)); if (Math.hypot(x - qx, y - qy) < r) return false; }
  return true;
}
function spawnCritter(tier) {                                  // out of the ground somewhere away from the hero, never inside a wall
  let x = 0, y = 0;
  for (let i = 0; i < RUN.spawnTries; i++) { x = R2(BOUNDS.minX + 2, BOUNDS.maxX - 2); y = R2(BOUNDS.minY + 2, BOUNDS.maxY - 2); if (Math.hypot(x - player.x, y - player.y) >= RUN.spawnMinDistance && clearSpot(x, y, RUN.spawnClearance)) break; }
  addCritter(new Critter({ tier, x, y }));
}
function resetPlayer() { player.x = SPAWN.x; player.y = SPAWN.y; player.v.x = player.v.y = 0; player.kb.x = player.kb.y = 0; player.speed = 0; gun.reset(); pellets.clear(); }
function startRun() {
  clearCritters(); director.reset(); health.reset(); score.reset(); run.state = run.mode === 'run' ? 'playing' : 'idle'; run.overT = 0; run.time = 0; hud.reset();
  resetPlayer(); pauseT = 0;
  setDummies(run.mode === 'practice'); hud.hideOver(); heroes[selected].root.visible = true;
  $('#bPractice').textContent = run.mode === 'run' ? 'Practice range' : 'Back to survival';
  document.body.classList.toggle('practice', run.mode === 'practice');
}
function endRun() {
  run.state = 'over'; run.overT = 0; audio.sfx.over(); haptics.play('hurt');
  const pts = score.state.points, isBest = pts > run.best; if (isBest) { run.best = pts; try { localStorage.setItem(bestKey, String(pts)); } catch { /* ignore */ } }
  hud.showOver(`Wave ${Math.max(1, director.state.wave)} · ${score.state.kills} kills · ${pts.toLocaleString()} points`, isBest ? 'New best score!' : `Best: ${run.best.toLocaleString()}`); heroes[selected].root.visible = true;
}
function hurtPlayer(c) {
  if (!health.hit(1)) return;
  const dx = player.x - c.x, dy = player.y - c.y, d = Math.hypot(dx, dy) || 1; player.kb.x += dx / d * RUN.hurtShove; player.kb.y += dy / d * RUN.hurtShove;
  camera.shake(0.55); pauseT = Math.max(pauseT, 0.05); audio.sfx.hurt(); haptics.play('hurt'); fx.sparks(player.x, player.y, dx / d, dy / d, '#ff6b6b', 8);
  const vg = $('#vig'); vg.classList.add('hurt'); setTimeout(() => vg.classList.remove('hurt'), 260);
  if (health.dead) endRun();
}
function critterDied(c) {
  const pal = PALETTE[c.tier], gained = score.kill(c.def.score); c.goneAt = clock + RUN.corpseLinger;
  for (const k of c.splits()) addCritter(k);
  if (run.mode === 'run') fx.number(c.x, 2.4, c.y, '+' + gained, score.mult > 1 ? '#ffd23f' : '#ffffff');
  const n = c.tier === 'big' ? 26 : c.tier === 'mid' ? 16 : 9;
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = R2(2, 6); fx.emit(c.x, 0.9, c.y, Math.cos(a) * sp, R2(2, 6), Math.sin(a) * sp, R2(0.4, 0.8), R2(0.07, 0.15), i & 1 ? pal.body : pal.tuft, { g: 14, op: 1 }); }
  fx.ring(c.x, c.y, c.r * 2.4, pal.body, 0.4);
  if (c.tier === 'big') pauseT = Math.max(pauseT, P.hitPause);
}
function dummyDied(tg) {
  pauseT = Math.max(pauseT, P.hitPause);
  for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, sp = R2(2, 6); fx.emit(tg.x, 1, tg.y, Math.cos(a) * sp, R2(2, 6), Math.sin(a) * sp, R2(0.5, 0.9), R2(0.08, 0.16), ['#e8c85a', '#c9a66b', '#fff6e8', '#e85d5d'][i & 3], { g: 14, op: 1 }); }
  fx.ring(tg.x, tg.y, 2.6, '#ffd23f', 0.5);
}
/** Events from the wave director, inside a simulation step. */
function onWaveEvent(e) {
  if (e.type === 'wave') { hud.banner('Wave ' + e.n, e.total + ' critters incoming'); audio.sfx.wave(); }
  else if (e.type === 'spawn') spawnCritter(e.tier);
  else if (e.type === 'clear') {
    const bonus = RUN.waveBonus * e.n; score.state.points += bonus; let sub = '+' + bonus + ' bonus';
    if (e.n % RUN.healEvery === 0 && health.state.hp < health.state.max) { health.heal(1); sub += ' · +1 heart'; }
    hud.banner('Wave ' + e.n + ' cleared', sub); audio.sfx.clear();
  }
}

/* ------------------------------ shooting ------------------------------ */
const _m = new THREE.Vector3();
const muzzleReach = () => heroes[selected].muzzleReach;

function shoot(barrel, ammoLeft = 1) {
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
  const kbm = Math.hypot(player.kb.x, player.kb.y); if (kbm > HERO.maxShove) { player.kb.x *= HERO.maxShove / kbm; player.kb.y *= HERO.maxShove / kbm; }   // rapid fire can't stack a shove without limit
  camera.kick(-ax * P.camKick * 14, -ay * P.camKick * 14);
  // the muzzle flash is drawn where the pellets start
  fx.wad(_m.x, 0.8, _m.z, ax, ay); fx.flash(_m.x, 0.8, _m.z, ax, ay); fx.smoke(_m.x, 0.8, _m.z, ax, ay); fx.sparks(_m.x, _m.z, ax, ay, '#ffd88a', 6);
  audio.sfx.blast(barrel); haptics.shot(ammoLeft, P.capacity);                // first barrel thumps harder than the second; the trigger buzzes briefly
}
function onHit(h) {
  const st = stats.recent.get(h.shot);
  if (h.kind === 'target') {
    const tg = h.ref, v = views.get(tg), r = tg.damage(h.damage);
    haptics.hit(r.killed, smart());
    stats.hits++; stats.damage += r.dealt; if (st) { st.hits++; st.damage += r.dealt; st.nearest = Math.min(st.nearest, h.dist); }
    v.hit(h.dx, h.dy, h.damage); tg.knock?.(h.dx, h.dy, h.damage); fx.sparks(h.x, h.y, h.nx, h.ny, '#fff2c4', 2);
    for (let i = 0; i < 2; i++) fx.emit(h.x, 0.9, h.y, h.nx * R2(1, 3) + R2(-1, 1), R2(0.5, 2), h.ny * R2(1, 3) + R2(-1, 1), R2(0.25, 0.4), R2(0.06, 0.11), '#e8c85a', { g: 9, op: 0.95 });
    tg.dmgAcc = (tg.dmgAcc || 0) + r.dealt; tg.dmgT = FEEDBACK.numberDelay; tg.dmgKill = tg.dmgKill || r.killed;
    if (!(tg.sndT > 0)) { audio.sfx.hit(clamp(h.damage / 12, 0.3, 1)); tg.sndT = FEEDBACK.hitSoundGap; }
    if (r.killed) { stats.kills++; if (st) st.kills++; v.kill(); audio.sfx.pop(); if (tg.kind === 'critter') critterDied(tg); else dummyDied(tg); }
  } else {
    fx.sparks(h.x, h.y, h.nx, h.ny, '#ffe9a8', 4); fx.emit(h.x, 0.5, h.y, h.nx * 0.5, 0.4, h.ny * 0.5, 0.35, 0.1, '#cdbd9a', { grow: 1.6, op: 0.5 });
    if (h.ref.kind === 'board') arena.boardMark(h.x);
  }
}

/* ------------------------------ simulation (fixed 120 Hz) ------------------------------ */
let prevFire = false;
function simStep(h) {
  if (mode !== 'play') { input.consumeTap(); return; }      // taps made on menus must not fire a shot when play starts
  if (run.state === 'over') { input.consumeTap(); run.overT += h; return; }
  run.time += h;
  const v = player.v; stepVelocity(v, snap.move, P, h);
  const sp = Math.hypot(v.x, v.y), skid = HERO.skid;
  if (snap.move.mag > skid.minStick && sp > skid.minSpeed && (v.x * snap.move.x + v.y * snap.move.y) / (sp * snap.move.mag) < skid.against) { player.skidT -= h; if (player.skidT <= 0) { player.skidT = skid.every; fx.dust(player.x, player.y, v.x / sp, v.y / sp, 0.9); } }
  player.x += (v.x + player.kb.x) * h; player.y += (v.y + player.kb.y) * h;
  const kd = Math.exp(-HERO.shoveDecay * h); player.kb.x *= kd; player.kb.y *= kd;
  const rad = heroes[selected].radius;
  const impact = resolveWorld(player, v, rad, arena.world);
  for (const t of targets) if (t.alive && t.kind !== 'critter') circleVsCircle(player, v, rad, t);               // dummies are solid; critters crowd round instead (they keep out of the hero themselves)
  if (smart()) haptics.bump(impact);
  if (impact > HERO.bumpImpact && player.impact <= 0) { player.impact = 0.15; fx.dust(player.x, player.y, -v.x, -v.y, Math.min(1, impact / 7)); camera.shake(Math.min(0.25, impact * 0.025)); }
  player.impact -= h; player.vx = v.x + player.kb.x; player.vy = v.y + player.kb.y; player.speed = Math.hypot(player.vx, player.vy);

  // aim: explicit input (cursor, right stick, arrows) wins; otherwise auto mode picks a visible target; otherwise, while firing, the walking direction
  let explicit = { x: 0, y: 0 };
  if (snap.mouseAim) { const a = mouseAim(player, input.mouse, { x: player.aimX, y: player.aimY }); explicit = { x: a.x, y: a.y }; }
  else if (snap.aim.mag > 0.02) explicit = { x: snap.aim.x / snap.aim.mag, y: snap.aim.y / snap.aim.mag };
  const helped = chooseAim(player, explicit, snap.move, snap.fire, targets, arena.world, { mode: snap.mouseAim ? 'manual' : P.assistMode, coneDeg: P.assistCone, strength: P.assistStrength, range: P.range + RULES.aim.rangePad });
  if (helped.aiming) { player.aimX = helped.x; player.aimY = helped.y; player.hasAim = true; } else player.hasAim = snap.fire;   // firing without any aim keeps the last direction
  player.assistTarget = helped.target;

  // the gun
  gun.setParams({ capacity: P.capacity, interval: P.interval, reload: P.reload });      // a changed reload time only applies to the NEXT reload
  if (snap.fire && !prevFire && (gun.reloading || gun.state.ammo <= 0)) haptics.dry();       // pulling a trigger that cannot fire: a small dry tick
  prevFire = snap.fire;
  const reloadKey = input.keys.has('KeyR') || !!snap.buttons[2]?.pressed;
  for (const e of gun.update(h, { fire: snap.fire, reload: reloadKey })) {
    if (e.type === 'shot') shoot(e.barrel, e.ammoLeft);
    else if (e.type === 'reloadStart') audio.sfx.open();
    else if (e.type === 'reloadDone') haptics.reload('grab');                     // a tiny tick: the gun is ready
  }
  input.consumeTap();                                        // this step has now seen any tap; fire falls back to the real held state
  pellets.step(h, arena.world, targets, onHit);
  if (run.mode === 'run') {                                  // waves, critters, hearts
    health.update(h); score.update(h);
    const ctx = { player: { x: player.x, y: player.y, r: rad }, world: arena.world, others: critters };
    for (const c of critters) if (c.step(h, ctx) === 'attack' && run.state === 'playing') hurtPlayer(c);
    if (run.state === 'playing') {
      const live = critters.reduce((n, c) => n + (c.state === 'dead' ? 0 : 1), 0);
      for (const e of director.step(h, live)) onWaveEvent(e);
    }
    for (let i = critters.length - 1; i >= 0; i--) { const c = critters[i]; if (c.state === 'dead' && clock >= (c.goneAt ?? 0)) { views.get(c)?.dispose(); views.delete(c); critters.splice(i, 1); } }
    syncTargets();
  }
  for (const t of targets) {
    if (t.update(h) === 'respawned') { views.get(t).respawn(); fx.ring(t.x, t.y, 1.8, '#fff6e8', 0.4); }
    if (t.sndT > 0) t.sndT -= h;
    if (t.dmgAcc > 0 && (t.dmgT -= h) <= 0) { if (P.numbers) fx.number(t.x, 2.6, t.y, String(Math.round(t.dmgAcc)), t.dmgKill || t.dmgAcc >= FEEDBACK.bigNumber ? '#ffd23f' : '#ffffff'); t.dmgAcc = 0; t.dmgKill = false; }
  }
}
// every footfall of the walk animation is one rumble beat, so what you feel is what you see
for (const h of heroes) h.onStep = (side, speedF) => { if (mode === 'play' && h === heroes[selected] && snap.source === 'controller') haptics.footstep(side, speedF, smart()); };
// the hero reports each beat of the reload animation; sounds only play for the hero you are actually controlling
for (const h of heroes) h.onReloadStage = (stage, who) => {
  if (mode !== 'play' || who !== heroes[selected]) return;
  if (stage === 'eject') audio.sfx.eject(); else if (stage === 'grab') audio.sfx.grab(); else if (stage === 'insert') audio.sfx.insert(); else if (stage === 'close') audio.sfx.close();
  haptics.reload(stage);                                                       // each beat of the reload has its own click, building toward the close
};

/* ------------------------------ modes: the turntable and play ------------------------------ */
function choose(i) {
  if (mode === 'compare' && i !== selected) haptics.menuSwitch();
  selected = i;
  heroes.forEach((h, k) => h.setVisible(mode === 'compare' || k === i));
  updateModeButton();
  if (mode === 'play') {
    heroes[i].legYaw = heroes[i].aimYaw = Math.atan2(player.aimX, player.aimY);
    heroes[i].reloadPrev = gun.progress;     // pick the reload up where it is, don't replay its earlier beats
  }
}
// the button always names the hero that is selected right now, however it was selected (turntable, 1/2/3, controller)
function updateModeButton() { $('#bMode').textContent = mode === 'compare' ? `Play as ${heroes[selected].d.name}` : 'Compare designs'; }
function setMode(m) {
  const was = mode; mode = m; updateModeButton();
  if (was === 'compare' && m === 'play') haptics.menuConfirm();   // confirms the pick: a buzz that fades out over ~2s
  arena.setVisible(m === 'play'); turntable.setVisible(m === 'compare'); shotViz.setVisible(m === 'play');
  heroes.forEach((h, k) => { h.setVisible(m === 'compare' || k === selected); h.reloadPrev = -1; });
  if (m === 'play') { resetPlayer(); turntable.release(); startRun(); }
  if (m === 'compare') { clearCritters(); run.state = 'idle'; hud.hideOver(); setDummies(true); }
  document.body.classList.toggle('in-run', m === 'play');
  if (m === 'compare') $('#panel').classList.add('collapsed');            // the tuning panel only opens when asked for
  $('#bPlayNow').style.display = m === 'compare' ? 'block' : 'none'; hud.setVisible(m === 'play');
  document.body.classList.toggle('mode-compare', m === 'compare');
  $('#hint').innerHTML = m === 'compare' ? ''
    : '<b>WASD</b> move, mouse aims, <b>click</b> fires, <b>R</b> reloads, <b>C</b> compare, <b>1</b><b>2</b><b>3</b> switch design. The training range is in the north-west corner.<br>Controller: sticks move and aim, <b>RT</b> fires, <b>X</b> reloads, <b>B</b> back to the designs.';
}
$('#bPractice').onclick = () => { run.mode = run.mode === 'run' ? 'practice' : 'run'; if (mode === 'play') startRun(); else { $('#bPractice').textContent = run.mode === 'run' ? 'Practice range' : 'Back to survival'; } };
$('#bRetry').onclick = () => { if (run.overT > RUN.retryClickAfter) startRun(); };
$('#bMode').onclick = () => setMode(mode === 'compare' ? 'play' : 'compare');
$('#bPlayNow').onclick = () => setMode('play');
const setupUp = () => !$('#focus').classList.contains('off');
addEventListener('keydown', e => {
  if (e.repeat) return; audio.unlock();
  if (setupUp()) { if (e.code === 'Enter' && !e.target.closest?.('button,input,select,summary')) startFocus(); return; }    // the setup screen is left on purpose: Start, A, or Enter
  if (mode === 'play' && run.state === 'over' && e.code === 'Enter' && run.overT > RUN.retryAfter) { startRun(); return; }
  if (e.code === 'Digit1') choose(0); else if (e.code === 'Digit2') choose(1); else if (e.code === 'Digit3') choose(2);
  else if (e.code === 'KeyC') setMode(mode === 'compare' ? 'play' : 'compare');
  else if (e.code === 'Enter' && mode === 'compare') setMode('play');
});
const startFocus = () => { audio.unlock(); $('#focus').classList.add('off'); haptics.release(); canvas.focus(); };
$('#bStart').onclick = startFocus; canvas.addEventListener('pointerdown', () => { if (!setupUp()) { audio.unlock(); canvas.focus(); } });
$('#bPad').onclick = () => { $('#focus').classList.remove('off'); };           // reopen the controller setup any time

// controller menus: one action per button press (see src/input/menu.js)
const nav = createMenuNav();
function menuStep() {
  const acts = nav.update(snap.pad);
  if (mode === 'play' && run.state === 'over' && run.overT > RUN.retryAfter && acts.includes('confirm')) startRun();
  const cmds = menuCommands(acts, { overlayUp: setupUp(), mode, selected, count: heroes.length });
  for (const c of cmds) {
    if (c.type === 'start') startFocus();
    else if (c.type === 'choose') choose(c.index);
    else if (c.type === 'play') setMode('play');
    else if (c.type === 'compare') setMode('compare');
  }
}

/* ------------------------------ the range and the panel ------------------------------ */
// Reset range: everything that belongs to the range session goes together. In-flight pellets must go too, or they would land after the
// reset and put hits, damage and kills back into a session that just said zero.
function resetRange() {
  pellets.clear(); pauseT = 0;
  arena.clearMarks();
  for (const t of dummies) { t.hp = t.maxHp; t.alive = run.mode === 'practice' || mode === 'compare'; t.deadFor = 0; t.dmgAcc = 0; t.dmgT = 0; t.dmgKill = false; t.sndT = 0; views.get(t).respawn(); }
  stats.shots = stats.pellets = stats.hits = stats.damage = stats.kills = 0; stats.recent.clear(); stats.last = null;
  panel.diag();
}
const ft = []; let steps = 0;
const panel = createPanel({ snap, haptics, dualsense, arena, stats, pellets, player, hero: () => heroes[selected], mode: () => mode, setupUp, frameTimes: ft, steps: () => steps, onResetRange: resetRange });
choose(0); setMode('compare');

/* ------------------------------ loop ------------------------------ */
let last = performance.now(), acc = 0, clock = 0;
function frame(now) {
  const raw = Math.max(0, now - last); last = now; if (raw > 0) { ft.push(raw); if (ft.length > 120) ft.shift(); }
  const realDt = Math.min(0.1, raw / 1000);
  let dt = realDt;
  if (pauseT > 0) { pauseT -= realDt; dt = 0; }                                    // hit pause: freeze the world for a few frames
  clock += dt; acc += dt;
  if (input.mouse.inside) { const w = groundPoint(lastClient.x, lastClient.y); if (w) { input.mouse.x = w.x; input.mouse.y = w.y; } }
  input.sample(now); menuStep();
  steps = 0; while (acc >= STEP) { simStep(STEP); acc -= STEP; steps++; }
  haptics.update({ mode, reloading: gun.reloading, ammo: gun.state.ammo, capacity: P.capacity });      // adaptive trigger feel follows the gun
  camera.decay(realDt);
  const dtv = Math.max(dt, 1e-4);

  if (mode === 'compare') turntable.update(dtv, clock, selected, P, view);
  else {
    heroes[selected].update(dtv, { x: player.x, y: player.y, vx: player.vx, vy: player.vy, speed: player.speed, aimYaw: player.hasAim ? Math.atan2(player.aimX, player.aimY) : null, reload: gun.progress, spent: [gun.state.spent[1], gun.state.spent[0]] }, P);
    shotViz.update({ player, aiming: player.hasAim || snap.fire, mouseAim: snap.mouseAim, mouse: input.mouse, P, reach: muzzleReach(), pellets: pellets.pellets });   // aim cone shows spread, range, and the full-damage zone
    hud.ammo(gun, P.capacity);
  }
  for (const t of dummies) views.get(t).update(dtv, clock);
  for (const c of critters) views.get(c).update(dtv, clock);
  if (mode === 'play') {
    const inRun = run.mode === 'run';
    hud.update({ inRun, playing: run.state === 'playing', health, score, director, critters, player });
    heroes[selected].root.visible = !inRun || !(health.invulnerable && run.state === 'playing' && Math.floor(clock * 14) % 2 === 0);      // the hero flickers while it cannot be hurt
  }
  fx.update(dt); camera.update(Math.max(realDt, 1e-4), mode, { player, P, mouseAim: snap.mouseAim, mouse: input.mouse, aimMag: snap.aim.mag }); stage.render();
  if ((now / 100 | 0) !== ((now - raw) / 100 | 0)) panel.diag();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// hooks for automated tests (harmless in play)
window.__hero = { updateHud: () => hud.update({ inRun: run.mode === 'run', playing: run.state === 'playing', health, score, director, critters, player }), run, health, score, director, critters, startRun, resetRange, menuStep, player, heroes, input, snap, arena, stage, tuning, P, setMode, choose, simStep, gun, pellets, targets, views, stats, shoot, fx, audio, haptics, updatePelletVisuals: () => shotViz.updatePellets(pellets.pellets), state: () => ({ mode, selected }), steps: () => steps };
