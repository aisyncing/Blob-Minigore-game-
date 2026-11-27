// Controller menu navigation: turns pad button presses into one-shot menu actions.
// Everything here is edge-triggered, so a held button gives exactly ONE action however long it is held.
// Standard-mapping button indices: A 0, B 1, LB 4, RB 5, d-pad left 14, d-pad right 15.
const BTN = { confirm: [0], back: [1], alt: [3], pause: [9], prev: [4, 14], next: [5, 15] };
const FLICK_ON = 0.6, FLICK_OFF = 0.35;
const DIRS = { up: { btn: 12, axis: 'y', sign: -1 }, down: { btn: 13, axis: 'y', sign: 1 }, left: { btn: 14, axis: 'x', sign: -1 }, right: { btn: 15, axis: 'x', sign: 1 } };
const REPEAT_AFTER = 380, REPEAT_EVERY = 80, REPEAT_FASTEST = 40;   // ms: how long a held direction waits, then how often it repeats (it speeds up the longer it is held)                 // the stick must come back inside 0.35 before another flick counts

/**
 * @param opts { directions } when true, also reports 'up' 'down' 'left' 'right' from the d-pad and the left stick, repeating while held (the pause menu needs
 *             to scroll through settings); off by default so the hero screen keeps its one-action-per-flick behaviour
 */
export function createMenuNav({ directions = false, clock = () => performance.now() } = {}) {
  let held = new Set(), stick = 0; const rep = {};                        // stick: -1 / 0 / +1 = which flick is currently "spent"
  function update(pad) {
    if (!pad || !pad.connected) { held = new Set(); stick = 0; for (const k in rep) delete rep[k]; return []; }
    const now = new Set(); (pad.buttons || []).forEach((b, i) => { if (b && b.pressed) now.add(i); });
    const fresh = [...now].filter(i => !held.has(i)); held = now;
    const out = [];
    if (fresh.length) out.push('any');
    for (const [action, idx] of Object.entries(BTN)) if (idx.some(i => fresh.includes(i))) out.push(action);
    const x = pad.left?.x ?? 0, dir = x > FLICK_ON ? 1 : x < -FLICK_ON ? -1 : 0;
    if (dir && dir !== stick) { out.push(dir > 0 ? 'next' : 'prev'); stick = dir; }
    else if (Math.abs(x) < FLICK_OFF) stick = 0;
    if (directions) {
      const t = clock(), y = pad.left?.y ?? 0;
      for (const [name, d] of Object.entries(DIRS)) {
        const v = d.axis === 'x' ? x : y, on = now_(pad, d.btn) || v * d.sign > FLICK_ON, r = rep[name];
        if (!on) { delete rep[name]; continue; }
        if (!r) { rep[name] = { since: t, last: t, n: 0 }; out.push(name); continue; }
        if (t - r.since >= REPEAT_AFTER && t - r.last >= Math.max(REPEAT_FASTEST, REPEAT_EVERY - r.n * 4)) { r.last = t; r.n++; out.push(name); }
      }
    }
    return out;
  }
  return { update };
}

const now_ = (pad, i) => !!pad.buttons?.[i]?.pressed;

// Decide what the game does with the actions this frame. The press that wakes the title overlay does nothing else.
export function menuCommands(actions, { overlayUp, mode, selected = 0, count = 3, over = false, paused = false }) {
  if (!actions.length) return [];
  if (overlayUp) return actions.includes('any') ? [{ type: 'start' }] : [];
  const cmds = [];
  if (mode === 'compare') {
    if (actions.includes('prev')) cmds.push({ type: 'choose', index: (selected + count - 1) % count });
    if (actions.includes('next')) cmds.push({ type: 'choose', index: (selected + 1) % count });
    if (actions.includes('confirm')) cmds.push({ type: 'play' });
    else if (actions.includes('alt')) cmds.push({ type: 'range' });
  } else if (mode === 'run') {
    if (over) { if (actions.includes('confirm')) cmds.push({ type: 'retry' }); else if (actions.includes('back')) cmds.push({ type: 'compare' }); }
    else if (paused) {                                                       // the pause menu: move through the settings, adjust, press, or leave
      for (const dir of ['up', 'down', 'left', 'right']) if (actions.includes(dir)) cmds.push({ type: 'nav', dir });
      if (actions.includes('confirm')) cmds.push({ type: 'activate' });
      if (actions.includes('pause') || actions.includes('back')) cmds.push({ type: 'resume' });
    }
    else if (actions.includes('pause')) cmds.push({ type: 'pause' });
  } else if (actions.includes('back')) cmds.push({ type: 'compare' });
  return cmds;
}
