// PS5 DualSense adaptive triggers over WebHID.
//
// The browser's Gamepad API can only rumble. Trigger resistance has to be sent as a raw HID "output report".
// Everything here that builds bytes is pure and unit tested; the WebHID part at the bottom is thin.
//
// Sources for the byte layout (all checked while writing this):
//   - Linux kernel drivers/hid/hid-playstation.c : report ids (USB 0x02, Bluetooth 0x31), sizes (63 / 78), the common 47-byte
//     body, the Bluetooth CRC32 with seed 0xA2, the rumble/valid-flag bits.
//   - pydualsense and dualsense-ts (open-source libraries): where the two 11-byte trigger blocks sit, the trigger-enable flags
//     (0x04 right, 0x08 left), and the effect encodings (Off 0x05, Feedback 0x21, Weapon 0x25, Vibration 0x26).
// NOT verified on real hardware by the author. USB is the best-supported path; Bluetooth has two header layouts in the wild
// (see BT_LAYOUTS), so the game lets you choose.

export const SONY = 0x054c, PRODUCTS = [0x0ce6, 0x0df2];            // DualSense, DualSense Edge

/* ------------------------------ trigger effects ------------------------------ */
// zones: the trigger travel is split into 10 zones, 0 (released) .. 9 (fully pulled). strength: 1 (light) .. 8 (hard).
const clampI = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** @returns Uint8Array(11): the mode byte and its ten parameter bytes */
export function encodeTrigger(e = { effect: 'off' }) {
  const b = new Uint8Array(11);
  switch (e.effect) {
    case 'feedback': case 'vibration': {                               // continuous resistance / buzzing from `position` to the end of the travel
      const pos = clampI(e.position, 0, 9), s = clampI(e.effect === 'feedback' ? e.strength : e.amplitude, 1, 8) - 1;
      let force = 0, active = 0;
      for (let i = pos; i < 10; i++) { force |= s << (3 * i); active |= 1 << i; }
      b[0] = e.effect === 'feedback' ? 0x21 : 0x26;
      b[1] = active & 0xff; b[2] = (active >> 8) & 0xff;
      b[3] = force & 0xff; b[4] = (force >> 8) & 0xff; b[5] = (force >> 16) & 0xff; b[6] = (force >>> 24) & 0xff;
      if (e.effect === 'vibration') b[9] = clampI(e.frequency ?? 40, 1, 255);
      return b;
    }
    case 'weapon': {                                                   // a wall from `start` to `end`, then it gives way: the click of a trigger breaking
      const start = clampI(e.start, 2, 7), end = clampI(e.end, start + 1, 8), s = clampI(e.strength, 1, 8) - 1, zones = (1 << start) | (1 << end);
      b[0] = 0x25; b[1] = zones & 0xff; b[2] = (zones >> 8) & 0xff; b[3] = s; return b;
    }
    default: b[0] = 0x05; return b;                                    // off: the normal soft trigger
  }
}

/* ------------------------------ output reports ------------------------------ */
const FLAG_RIGHT = 0x04, FLAG_LEFT = 0x08;                             // valid-flag bits in byte 0: "apply the right / left trigger block"
export const BT_LAYOUTS = {
  // A: Linux kernel layout: [0x31, seq<<4, 0x10, 47-byte body, ..., crc]
  A: { header: (seq) => [0x31, (seq & 15) << 4, 0x10], bodyAt: 3 },
  // B: layout used by pydualsense / dualsense-ts: [0x31, 0x02, 47-byte body, ..., crc]
  B: { header: () => [0x31, 0x02], bodyAt: 2 },
};

let _tab = null;
export function crc32(bytes, seed = null) {                            // standard CRC-32 (reflected 0xEDB88320); `seed` is an optional first byte
  if (!_tab) { _tab = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _tab[n] = c >>> 0; } }
  let c = 0xffffffff; const feed = v => { c = (c >>> 8) ^ _tab[(c ^ v) & 0xff]; };
  if (seed !== null) feed(seed); for (const v of bytes) feed(v);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * One output report. Every field is optional and only the ones you pass are switched on in the report's valid-flags, so a report that sets the
 * lightbar leaves the triggers alone and the other way round. Layout of the common body (the same one the Linux driver and jsdualsense use):
 *   [0] flags: 0x01 + 0x02 motors, 0x04 right trigger, 0x08 left trigger     [1] flags: 0x04 lightbar, 0x10 player LEDs
 *   [2] right (light) motor, [3] left (heavy) motor, 0-255                    [10..20] right trigger, [21..31] left trigger
 *   [38] flags: 0x01 LED brightness, 0x02 lightbar setup, 0x04 better rumble  [41] lightbar setup, [42] brightness (0 high, 1 mid, 2 low)
 *   [43] player LED mask (5 bits)                                             [44..46] lightbar red, green, blue
 * @param motors { heavy, light } 0..255      @param light [r, g, b] 0..255      @param players 5-bit mask      @param brightness 0 high, 1 medium, 2 low
 * @param transport 'usb' | 'bt-a' | 'bt-b'
 * @returns { id, data (what WebHID sendReport wants: the bytes AFTER the report id), full (the whole report including the id) }
 */
export function buildReport({ transport = 'usb', right = null, left = null, motors = null, light = null, players = null, brightness = 1, seq = 0 } = {}) {
  const body = new Uint8Array(47);                                     // the common body, offsets as in the Linux driver
  if (right) { body[0] |= FLAG_RIGHT; body.set(encodeTrigger(right), 10); }
  if (left) { body[0] |= FLAG_LEFT; body.set(encodeTrigger(left), 21); }
  if (motors) { body[0] |= 0x03; body[38] |= 0x04; body[2] = clampI(motors.light, 0, 255); body[3] = clampI(motors.heavy, 0, 255); }
  if (light) { body[1] |= 0x04; body[38] |= 0x03; body[41] = 0; body[42] = clampI(brightness, 0, 2); body[44] = clampI(light[0], 0, 255); body[45] = clampI(light[1], 0, 255); body[46] = clampI(light[2], 0, 255); }
  if (players !== null && players !== undefined) { body[1] |= 0x10; body[38] |= 0x01; body[43] = clampI(players, 0, 31); }
  if (transport === 'usb') {
    const full = new Uint8Array(63); full[0] = 0x02; full.set(body, 1);
    return { id: 0x02, data: full.slice(1), full };
  }
  const L = BT_LAYOUTS[transport === 'bt-b' ? 'B' : 'A'], full = new Uint8Array(78);
  full.set(L.header(seq), 0); full.set(body, L.bodyAt);
  const crc = crc32(full.subarray(0, 74), 0xa2);
  full[74] = crc & 0xff; full[75] = (crc >>> 8) & 0xff; full[76] = (crc >>> 16) & 0xff; full[77] = (crc >>> 24) & 0xff;
  return { id: 0x31, data: full.slice(1), full };
}

/* ------------------------------ WebHID connection ------------------------------ */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param hid  navigator.hid (injectable for tests)
 * Usage: connect() from a click; then set({ right, left }) any time. set() only sends when something changed.
 */
export function createDualSense({ hid = (typeof navigator !== 'undefined' ? navigator.hid : undefined), now = () => performance.now(), onStatus = () => {}, schedule = (f, ms) => setTimeout(f, ms), clear = id => clearTimeout(id) } = {}) {
  const st = { device: null, ids: {}, working: null, dead: false, forced: 'auto', seq: 0, lastSent: 0, timer: null, errors: 0, kind: 'usb', battery: null, reports: 0 };
  const OFF = { effect: 'off' };
  // What we want the controller to be doing, and what it was last told. A report is sent only when something in `want` differs from `sent`.
  const want = { right: null, left: null, motors: null, light: null, players: null, brightness: 1 };
  let sent = JSON.stringify(want), motorTimer = null;
  const supported = !!hid;
  const status = t => onStatus(t, st);
  const clampB = v => Math.min(255, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));

  // What does this controller say it accepts? Output report ids and their sizes (in bytes, without the id), read from its HID descriptor.
  function describe(dev) {
    const ids = {};
    for (const c of dev.collections || []) for (const r of c.outputReports || []) {
      const bits = (r.items || []).reduce((n, it) => n + (it.reportSize || 0) * (it.reportCount || 0), 0);
      ids[r.reportId] = bits ? Math.ceil(bits / 8) : null;               // null = size unknown
    }
    return ids;
  }
  const hexId = n => '0x' + Number(n).toString(16).padStart(2, '0');
  const listIds = ids => Object.entries(ids).map(([i, n]) => `${hexId(i)}${n ? ` (${n} bytes)` : ''}`).join(', ') || 'none';
  const candidates = () => {                                           // layouts to try, most likely first
    if (st.forced !== 'auto') return [st.forced];
    const has = i => Object.prototype.hasOwnProperty.call(st.ids, i), out = [];
    if (has(0x31)) out.push('bt-a', 'bt-b'); if (has(0x02)) out.push('usb');
    return out.length ? out : ['usb', 'bt-a', 'bt-b'];
  };

  // The controller's own input reports carry the battery. Offsets are the ones jsdualsense documents for the full report (USB report 0x01,
  // Bluetooth report 0x31 has one extra header byte). Anything that does not look like a battery reading is ignored.
  function onInput(e) {
    const d = e.data; if (!d) return; const o = e.reportId === 0x31 ? 1 : 0, i = 52 + o;
    if ((e.reportId !== 0x01 && e.reportId !== 0x31) || d.byteLength <= i) return;
    const b = d.getUint8(i), level = Math.min(8, b & 0x0f), code = (b & 0xf0) >> 4;
    if (code > 2) return;                                              // 0 discharging, 1 charging, 2 full; anything else is not a battery byte
    st.battery = { pct: Math.round(Math.min(1, (level + (code === 2 ? 8 : 0.5)) / 8) * 100), charging: code === 1, full: code === 2 };
  }
  async function attach(dev) {
    if (st.device && st.device !== dev) st.device.removeEventListener?.('inputreport', onInput);
    if (!dev.opened) await dev.open();
    st.device = dev; st.ids = describe(dev); st.working = null; st.dead = false; sent = ''; st.errors = 0; st.battery = null;
    st.kind = Object.prototype.hasOwnProperty.call(st.ids, 0x31) && !Object.prototype.hasOwnProperty.call(st.ids, 0x02) ? 'bt' : 'usb';
    dev.addEventListener?.('inputreport', onInput);
    status(`Connected: ${dev.productName || 'DualSense'} (${st.kind === 'bt' ? 'Bluetooth' : 'USB'}). It accepts output reports: ${listIds(st.ids)}. Press a test to check.`);
  }
  // Send one report from `want`. In automatic mode, layouts are tried in turn until the controller accepts one, and that one is remembered.
  async function raw(w) {
    if (!st.device) return false;
    const tryList = st.working ? [st.working] : candidates(), errs = [];
    for (const t of tryList) {
      const r = buildReport({ transport: t, right: w.right, left: w.left, motors: w.motors, light: w.light, players: w.players, brightness: w.brightness, seq: st.seq++ }), size = st.ids[r.id];
      let data = r.data; if (size && size !== data.length) { const d = new Uint8Array(size); d.set(data.subarray(0, Math.min(size, data.length))); data = d; }   // match the size the descriptor declares
      try { await st.device.sendReport(r.id, data); st.lastSent = now(); st.reports++; if (st.working !== t) { st.working = t; status(`Controller commands accepted (layout ${t}). If you feel nothing, press a test.`); } return true; }
      catch (e) { errs.push(`${t}: ${e?.message || e}`); }
    }
    st.errors++; st.dead = true;                                         // stop re-sending until the player picks a layout or presses a test
    status(`The controller rejected every message (${errs.join('; ')}). It reports output reports: ${listIds(st.ids)}. Try the layout menu, or a USB cable.`);
    return false;
  }
  // Coalesce: at most one report every 12 ms, and none if nothing changed.
  function flush() {
    if (!st.device || st.dead) return;
    const now_ = JSON.stringify(want); if (now_ === sent) return;
    const wait = Math.max(0, 12 - (now() - st.lastSent));
    const go = () => { st.timer = null; const snapshot = JSON.stringify(want); if (snapshot === sent) return; sent = snapshot; st.lastSent = now(); raw(JSON.parse(snapshot)); };
    if (wait === 0) go(); else if (!st.timer) st.timer = schedule(go, wait);
  }

  const api = {
    supported, state: st, want,
    get connected() { return !!st.device; },
    get usable() { return !!st.device && !st.dead; },
    setTransport(t) { st.forced = t; st.working = null; st.dead = false; sent = ''; if (st.device) status(`Layout: ${t === 'auto' ? 'automatic' : t}`); },
    /** Forget a failure so the next send tries again (the test buttons call this). */
    retry() { st.dead = false; sent = ''; },
    async connect() {                                                  // must be called from a click
      if (!supported) { status('This browser has no WebHID. Use Chrome or Edge.'); return false; }
      try {
        const got = await hid.requestDevice({ filters: PRODUCTS.map(productId => ({ vendorId: SONY, productId })) });
        if (!got.length) { status('No controller was chosen.'); return false; }
        await attach(got[0]); return true;
      } catch (e) {
        const m = String(e?.message || e);
        status(/permissions policy|not allowed|disallowed/i.test(m)
          ? 'This page is embedded, and browsers block controller access (WebHID) inside embedded pages. Open the game as its own file (dist/hero.html, double-click) and press Connect there. Rumble still works here.'
          : 'Could not connect: ' + m);
        return false;
      }
    },
    async autoConnect() {                                              // a controller you allowed before reconnects without a click
      if (!supported) return false;
      try { const d = (await hid.getDevices()).find(x => x.vendorId === SONY && PRODUCTS.includes(x.productId)); if (d) { await attach(d); return true; } } catch { /* ignore */ }
      return false;
    },
    async disconnect() { if (!st.device) return; want.motors = { heavy: 0, light: 0 }; want.right = OFF; want.left = OFF; await raw(want); st.device.removeEventListener?.('inputreport', onInput); try { await st.device.close(); } catch { /* ignore */ } st.device = null; status('Disconnected.'); },

    /** Ask for these trigger effects (undefined = leave that trigger as it is). */
    set({ right = undefined, left = undefined } = {}) {
      if (!st.device || st.dead) return;
      if (right !== undefined) want.right = right; if (left !== undefined) want.left = left; flush();
    },
    /**
     * Rumble through the controller itself: heavy (left) and light (right) motor, 0..1, for `ms`. Returns false when it cannot, so the caller can fall back
     * to the browser's own rumble. Each call replaces the one before it, like the browser's does.
     */
    rumble(heavy, light, ms) {
      if (!st.device || st.dead) return false;
      want.motors = { heavy: clampB(heavy * 255), light: clampB(light * 255) };
      if (motorTimer) clear(motorTimer);
      motorTimer = schedule(() => { motorTimer = null; want.motors = { heavy: 0, light: 0 }; flush(); }, Math.max(10, ms));
      flush(); return true;
    },
    /** Lightbar colour [r, g, b] 0..255 (null = leave it to the controller), brightness 0 high / 1 medium / 2 low. */
    setLight(rgb, brightness = 1) { if (!st.device || st.dead) return; want.light = rgb ? [clampB(rgb[0]), clampB(rgb[1]), clampB(rgb[2])] : null; want.brightness = brightness; flush(); },
    /** The five white player LEDs under the touchpad as a 5-bit mask (null = leave them). */
    setPlayers(mask) { if (!st.device || st.dead) return; want.players = mask === null ? null : mask & 31; flush(); },
    /** Everything off: triggers normal, motors still. Lights are kept (menus keep their colour). */
    release() {
      if (!st.device) return; if (st.timer) { clear(st.timer); st.timer = null; } if (motorTimer) { clear(motorTimer); motorTimer = null; }
      want.right = OFF; want.left = OFF; if (want.motors) want.motors = { heavy: 0, light: 0 }; sent = ''; return raw(want).then(ok => { if (ok) sent = JSON.stringify(want); return ok; });
    },
  };
  if (supported && hid.addEventListener) hid.addEventListener('disconnect', e => { if (st.device && e.device === st.device) { st.device = null; status('The controller disconnected.'); } });
  return api;
}
