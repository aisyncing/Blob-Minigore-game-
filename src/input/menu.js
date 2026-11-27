// Controller menu navigation: turns pad button presses into one-shot menu actions.
// Everything here is edge-triggered, so a held button gives exactly ONE action however long it is held.
// Standard-mapping button indices: A 0, B 1, LB 4, RB 5, d-pad left 14, d-pad right 15.
const BTN = { confirm: [0], back: [1], alt: [3], pause: [9], prev: [4, 14], next: [5, 15] };
const FLICK_ON = 0.6, FLICK_OFF = 0.35;                 // the stick must come back inside 0.35 before another flick counts

export function createMenuNav() {
  let held = new Set(), stick = 0;                        // stick: -1 / 0 / +1 = which flick is currently "spent"
  function update(pad) {
    if (!pad || !pad.connected) { held = new Set(); stick = 0; return []; }
    const now = new Set(); (pad.buttons || []).forEach((b, i) => { if (b && b.pressed) now.add(i); });
    const fresh = [...now].filter(i => !held.has(i)); held = now;
    const out = [];
    if (fresh.length) out.push('any');
    for (const [action, idx] of Object.entries(BTN)) if (idx.some(i => fresh.includes(i))) out.push(action);
    const x = pad.left?.x ?? 0, dir = x > FLICK_ON ? 1 : x < -FLICK_ON ? -1 : 0;
    if (dir && dir !== stick) { out.push(dir > 0 ? 'next' : 'prev'); stick = dir; }
    else if (Math.abs(x) < FLICK_OFF) stick = 0;
    return out;
  }
  return { update };
}

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
    else if (paused) { if (actions.includes('pause') || actions.includes('confirm')) cmds.push({ type: 'resume' }); else if (actions.includes('back')) cmds.push({ type: 'compare' }); }
    else if (actions.includes('pause')) cmds.push({ type: 'pause' });
  } else if (actions.includes('back')) cmds.push({ type: 'compare' });
  return cmds;
}
