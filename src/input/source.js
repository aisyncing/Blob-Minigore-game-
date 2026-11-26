// One place that turns "whatever the player is holding" into a single input snapshot.
// Every scene reads this snapshot; nothing downstream knows which device is in use.
//
// snapshot fields (mutated in place each sample):
//   source      'controller' | 'keyboard' | 'none'
//   move        shaped left stick / WASD            {x, y, mag}   (y is screen-down, i.e. +y = towards the camera)
//   aim         shaped right stick / mouse / arrows {x, y, mag}   mag 0 means "not aiming"
//   mouseAim    true when aim comes from the cursor
//   fire        trigger (with hysteresis) / left click / Space
//   leftRaw, rightRaw, lt, rt, buttons, pad (the Gamepad poll result)
import { shapeStick, makeTrigger, digitalAxes, mouseAim, effectiveTrigger } from './process.js';
import { createPadReader } from './pad.js';

const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

export function createInput({ target, toWorld, origin, lastAim = () => ({ x: 1, y: 0 }), tuning, getPads }) {
  const pads = createPadReader(getPads);
  const keys = new Set();
  const mouse = { x: 0, y: 0, inside: false, down: false, moved: -1e9 };
  let keyAt = -1e9;
  let tapLatch = false;                    // a Space press or left click that has not yet been seen by a simulation step
  const trig = makeTrigger();
  let heldFire = false;
  const snap = {
    source: 'none', mouseAim: false, leftRaw: { x: 0, y: 0 }, rightRaw: { x: 0, y: 0 },
    move: { x: 0, y: 0, mag: 0 }, aim: { x: 0, y: 0, mag: 0 }, lt: 0, rt: 0, fire: false, buttons: [], pad: { connected: false },
  };

  addEventListener('keydown', e => {
    // Keys always count. We only stop the browser's own reaction (page scroll, slider nudge,
    // Space-clicks-the-focused-button) when no form control has focus.
    const typing = document.activeElement && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(document.activeElement.tagName);
    if (GAME_KEYS.includes(e.code) && !typing) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) tapLatch = true;
    keys.add(e.code); keyAt = performance.now();
  });
  // a clicked button keeps focus, which would let Space re-click it mid-game
  addEventListener('click', e => { if (['BUTTON', 'SUMMARY'].includes(e.target?.tagName)) e.target.blur(); });
  // same for sliders, dropdowns and checkboxes: once you have changed one, the keyboard goes back to the game
  addEventListener('change', e => { if (e.target?.matches?.('input[type=range],input[type=checkbox],select')) e.target.blur(); });
  addEventListener('pointerup', e => { const t = document.activeElement; if (t && t.matches?.('input[type=range]')) t.blur(); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; tapLatch = false; });

  if (target) {
    const at = e => { const w = toWorld(e); if (w) { mouse.x = w.x; mouse.y = w.y; } mouse.moved = performance.now(); };
    target.addEventListener('pointermove', e => { at(e); mouse.inside = true; });
    target.addEventListener('pointerenter', () => { mouse.inside = true; });
    target.addEventListener('pointerleave', () => { if (!mouse.down) mouse.inside = false; });
    target.addEventListener('pointerdown', e => { if (e.button !== 0) return; at(e); mouse.down = true; tapLatch = true; target.setPointerCapture?.(e.pointerId); keyAt = performance.now(); });
    const up = () => { mouse.down = false; };
    target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up);
    target.addEventListener('contextmenu', e => e.preventDefault());
  }

  function sample(now = performance.now()) {
    const p = pads.poll(now);
    const mv = digitalAxes({ left: keys.has('KeyA'), right: keys.has('KeyD'), up: keys.has('KeyW'), down: keys.has('KeyS') });
    const arrows = digitalAxes({ left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), up: keys.has('ArrowUp'), down: keys.has('ArrowDown') });
    const mouseOn = mouse.inside || mouse.down;
    const tap = tapLatch;
    const kbActive = mv.mag || arrows.mag || keys.has('Space') || mouse.down || tap || (mouseOn && now - mouse.moved < 4000);
    let L = { x: 0, y: 0 }, R = { x: 0, y: 0 }, rt = 0, lt = 0;
    snap.buttons = []; snap.mouseAim = false; snap.pad = p;
    snap.source = p.connected ? 'controller' : 'none';
    if (p.connected) { L = p.left; R = p.right; rt = p.rt; lt = p.lt; snap.buttons = p.buttons; }
    // the pad counts as idle when nothing it reports gets past the SAME deadzones and trigger threshold the game uses,
    // so a drifting stick (resting at 0.08 with a 0.12 deadzone) cannot lock the keyboard out
    const trigCfg = tuning.trigger(), eff = effectiveTrigger(trigCfg);
    const padIdle = !p.connected || (shapeStick(L.x, L.y, tuning.stick('left')).mag === 0 && shapeStick(R.x, R.y, tuning.stick('right')).mag === 0 && rt < eff.release);
    if (kbActive && (!p.connected || padIdle)) {
      L = mv; snap.source = 'keyboard';
      if (mouseOn && origin) { R = mouseAim(origin(), mouse, lastAim()); snap.mouseAim = true; } else R = arrows;
      rt = (keys.has('Space') || mouse.down) ? 1 : rt;
    }
    snap.leftRaw = L; snap.rightRaw = R; snap.lt = lt; snap.rt = rt;
    const m = shapeStick(L.x, L.y, tuning.stick('left'));
    snap.move.x = m.x; snap.move.y = m.y; snap.move.mag = m.mag; snap.move.raw = m.raw;
    const a = snap.mouseAim ? { x: R.x, y: R.y, mag: 1, raw: 1 } : shapeStick(R.x, R.y, tuning.stick('right'));
    snap.aim.x = a.x; snap.aim.y = a.y; snap.aim.mag = a.mag; snap.aim.raw = a.raw;
    heldFire = trig.update(rt, trigCfg);
    snap.fire = heldFire || (tap && snap.source === 'keyboard');
    return snap;
  }
  // The simulation calls this after each fixed step. A tap lives until one step has seen it, then fire falls back to the real held state.
  function consumeTap() { if (!tapLatch) return false; tapLatch = false; snap.fire = heldFire; return true; }
  return { sample, snap, keys, mouse, consumeTap, kbMouseIdleMs: now => now - Math.max(keyAt, mouse.moved) };
}
