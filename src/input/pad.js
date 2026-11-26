// Thin wrapper over the Gamepad API. `getPads` is injectable so tests can fake it.

const STANDARD = { lx: 0, ly: 1, rx: 2, ry: 3, lt: 6, rt: 7 };
export const BUTTON_NAMES = ['A','B','X','Y','LB','RB','LT','RT','Back','Start','L3','R3','Up','Down','Left','Right','Home'];

export function createPadReader(getPads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [])) {
  let activeIndex = -1;
  let lastStamp = -1, stampCount = 0, stampWindowStart = 0, updateHz = 0;
  let apiError = null, everSeen = false;

  function isActive(p) {
    return p.buttons.some(b => b.pressed) || p.axes.some(a => Math.abs(a) > 0.6);
  }

  function poll(now = performance.now()) {
    let pads = [];
    try { pads = Array.from(getPads() || []).filter(p => p && p.connected); apiError = null; }
    catch (e) { apiError = e?.name || String(e); }
    const out = { connected: false, count: pads.length, apiError, everSeen };
    if (!pads.length) { activeIndex = -1; return out; }
    everSeen = out.everSeen = true;

    let pad = pads.find(p => p.index === activeIndex);
    for (const p of pads) if (isActive(p) && (!pad || p.index !== pad.index)) { pad = p; }
    pad = pad || pads[0];
    activeIndex = pad.index;

    // estimate how often the pad reports new data (timestamp changes)
    if (pad.timestamp !== lastStamp) { lastStamp = pad.timestamp; stampCount++; }
    if (now - stampWindowStart >= 1000) { updateHz = stampCount * 1000 / Math.max(1, now - stampWindowStart); stampCount = 0; stampWindowStart = now; }

    const ax = i => (pad.axes[i] ?? 0);
    const bv = i => pad.buttons[i]?.value ?? 0;
    const standard = pad.mapping === 'standard';
    return Object.assign(out, {
      connected: true, id: pad.id, index: pad.index, mapping: pad.mapping || 'unknown', standard,
      left: { x: ax(STANDARD.lx), y: ax(STANDARD.ly) },
      right: { x: ax(STANDARD.rx), y: ax(STANDARD.ry) },
      lt: bv(STANDARD.lt), rt: bv(STANDARD.rt),
      buttons: pad.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
      axes: Array.from(pad.axes), updateHz,
      rumble(strong = 0.8, weak = 0.4, ms = 250) {
        const act = pad.vibrationActuator || pad.hapticActuators?.[0];
        if (!act) return Promise.resolve('unsupported');
        try {
          if (act.playEffect) return act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong }).then(() => 'ok', () => 'failed');
          if (act.pulse) return act.pulse(strong, ms).then(() => 'ok', () => 'failed');
        } catch { /* fall through */ }
        return Promise.resolve('unsupported');
      },
    });
  }
  return { poll };
}
