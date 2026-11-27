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
 * One output report that sets the triggers and nothing else (the motors are left to the Gamepad API, so rumble keeps working).
 * @param transport 'usb' | 'bt-a' | 'bt-b'
 * @returns { id, data (what WebHID sendReport wants: the bytes AFTER the report id), full (the whole report including the id) }
 */
export function buildReport({ transport = 'usb', right = null, left = null, seq = 0 } = {}) {
  const body = new Uint8Array(47);                                     // the common body, offsets as in the Linux driver
  if (right) { body[0] |= FLAG_RIGHT; body.set(encodeTrigger(right), 10); }
  if (left) { body[0] |= FLAG_LEFT; body.set(encodeTrigger(left), 21); }
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
export function createDualSense({ hid = (typeof navigator !== 'undefined' ? navigator.hid : undefined), now = () => performance.now(), onStatus = () => {} } = {}) {
  const st = { device: null, transport: 'usb', forced: 'auto', seq: 0, last: { right: null, left: null }, lastSent: 0, timer: null, pending: null, errors: 0 };
  const supported = !!hid;
  const status = t => onStatus(t, st);

  function detect(dev) {                                               // Bluetooth exposes the 0x31 output report, USB the 0x02 one
    const ids = new Set(); for (const c of dev.collections || []) for (const r of c.outputReports || []) ids.add(r.reportId);
    return ids.has(0x31) && !ids.has(0x02) ? 'bt' : 'usb';
  }
  const transport = () => (st.forced === 'auto' ? (st.kind === 'bt' ? 'bt-a' : 'usb') : st.forced);

  async function attach(dev) {
    if (!dev.opened) await dev.open();
    st.device = dev; st.kind = detect(dev); st.last = { right: null, left: null }; st.errors = 0;
    status(`Connected: ${dev.productName || 'DualSense'} (${st.kind === 'bt' ? 'Bluetooth' : 'USB'}) · layout ${transport()}`);
  }
  async function raw(right, left) {
    if (!st.device) return false;
    const r = buildReport({ transport: transport(), right, left, seq: st.seq++ });
    try { await st.device.sendReport(r.id, r.data); st.lastSent = now(); return true; }
    catch (e) { st.errors++; status('Could not send to the controller: ' + (e?.message || e)); return false; }
  }
  const OFF = { effect: 'off' };

  const api = {
    supported, state: st,
    get connected() { return !!st.device; },
    setTransport(t) { st.forced = t; st.last = { right: null, left: null }; if (st.device) status(`Layout ${transport()}`); },
    async connect() {                                                  // must be called from a click
      if (!supported) { status('This browser has no WebHID. Use Chrome or Edge.'); return false; }
      try {
        const got = await hid.requestDevice({ filters: PRODUCTS.map(productId => ({ vendorId: SONY, productId })) });
        if (!got.length) { status('No controller was chosen.'); return false; }
        await attach(got[0]); return true;
      } catch (e) { status('Could not connect: ' + (e?.message || e)); return false; }
    },
    async autoConnect() {                                              // a controller you allowed before reconnects without a click
      if (!supported) return false;
      try { const d = (await hid.getDevices()).find(x => x.vendorId === SONY && PRODUCTS.includes(x.productId)); if (d) { await attach(d); return true; } } catch { /* ignore */ }
      return false;
    },
    async disconnect() { if (!st.device) return; await raw(OFF, OFF); try { await st.device.close(); } catch { /* ignore */ } st.device = null; status('Disconnected.'); },
    /** Ask for these trigger effects (null = leave that trigger alone). Sends only on change, at most ~60 per second. */
    set({ right = undefined, left = undefined } = {}) {
      if (!st.device) return;
      const want = { right: right === undefined ? st.last.right : right, left: left === undefined ? st.last.left : left };
      if (same(want, st.last) && !st.pending) return;
      st.pending = want;
      const wait = Math.max(0, 16 - (now() - st.lastSent));
      const go = () => { st.timer = null; const w = st.pending; st.pending = null; if (!w) return; st.last = w; st.lastSent = now(); raw(w.right, w.left); };   // stamped at send START, so a burst in one tick is coalesced
      if (wait === 0) go(); else if (!st.timer) st.timer = setTimeout(go, wait);
    },
    /** Put both triggers back to normal (menus, leaving the page). */
    release() { if (!st.device) return; if (st.timer) { clearTimeout(st.timer); st.timer = null; } st.pending = null; st.last = { right: OFF, left: OFF }; return raw(OFF, OFF); },
  };
  if (supported && hid.addEventListener) hid.addEventListener('disconnect', e => { if (st.device && e.device === st.device) { st.device = null; status('The controller disconnected.'); } });
  return api;
}
