import test from 'node:test';
import assert from 'node:assert/strict';
import { createShotgun } from '../src/game/shotgun.js';
const DT = 1 / 120;
// drive the gun for `secs` with a constant input, return events with the time they happened
function drive(g, secs, input, t0 = 0) { const out = []; for (let i = 0; i < Math.round(secs / DT); i++) for (const e of g.update(DT, input)) out.push({ ...e, t: +(t0 + (i + 1) * DT).toFixed(4) }); return out; }
const types = ev => ev.map(e => e.type);

test('holding the trigger fires two barrels at the interval, then reloads, then fires again', () => {
  const g = createShotgun({ interval: 0.28, reload: 0.95 });
  const ev = drive(g, 3, { fire: true });
  const shots = ev.filter(e => e.type === 'shot');
  assert.deepEqual(shots.slice(0, 2).map(s => s.barrel), [0, 1]);
  assert.ok(Math.abs(shots[1].t - shots[0].t - 0.28) < 0.02, 'interval ' + (shots[1].t - shots[0].t));
  const rs = ev.find(e => e.type === 'reloadStart'), rd = ev.find(e => e.type === 'reloadDone');
  assert.ok(rs && rd && Math.abs(rd.t - rs.t - 0.95) < 0.02);
  assert.ok(shots[2].t >= rd.t - 1e-9 && shots[2].t - rd.t < 0.03, 'next shot lands right as the reload ends');
  assert.deepEqual(shots.slice(2, 4).map(s => s.barrel), [0, 1], 'barrels alternate from the start after a reload');
});
test('never fires while reloading, never with an empty gun', () => {
  const g = createShotgun(); const ev = drive(g, 5, { fire: true });
  let reloading = false, ammo = 2;
  for (const e of ev) { if (e.type === 'reloadStart') reloading = true; if (e.type === 'reloadDone') { reloading = false; ammo = 2; } if (e.type === 'shot') { assert.equal(reloading, false); assert.ok(ammo > 0); ammo--; } }
});
test('a single tap fires exactly one shell', () => {
  const g = createShotgun(); const ev = [...drive(g, 0.05, { fire: true }), ...drive(g, 1, { fire: false }, 0.05)];
  assert.equal(ev.filter(e => e.type === 'shot').length, 1); assert.equal(g.state.ammo, 1);
});
test('a press just before the gun is ready is buffered, a press too early is not', () => {
  const mk = () => { const g = createShotgun({ interval: 0.28, buffer: 0.12 }); drive(g, 0.01, { fire: true }); drive(g, 0.02, { fire: false }); return g; };
  const a = mk(); drive(a, 0.14, { fire: false }, 0.03);                     // cooldown has ~0.1 s left
  const early = [...drive(a, 0.005, { fire: true }), ...drive(a, 0.3, { fire: false })];
  assert.equal(early.filter(e => e.type === 'shot').length, 1, 'press within the buffer window fires when ready');
  const b = mk(); drive(b, 0.02, { fire: false });                           // cooldown has ~0.23 s left
  const tooEarly = [...drive(b, 0.005, { fire: true }), ...drive(b, 0.5, { fire: false })];
  assert.equal(tooEarly.filter(e => e.type === 'shot').length, 0, 'a press far too early is ignored');
});
test('a press during the reload is buffered only if it is near the end', () => {
  const g = createShotgun({ reload: 0.95, buffer: 0.12 }); drive(g, 0.6, { fire: true });
  drive(g, 0.2, { fire: false }, 0.6);
  const ev = [...drive(g, 0.01, { fire: true }, 0.8), ...drive(g, 0.5, { fire: false }, 0.81)];
  assert.equal(ev.filter(e => e.type === 'shot').length, 0, 'tap in the middle of a reload does nothing');
});
test('R reloads early when not full, and not when full or mid-cooldown', () => {
  const g = createShotgun(); drive(g, 0.05, { fire: true }); drive(g, 0.5, { fire: false }, 0.05);       // one shell fired, cooldown over
  const ev = drive(g, 0.1, { reload: true }, 0.55);
  assert.deepEqual(types(ev), ['reloadStart']); assert.equal(ev[0].early, true);
  const full = createShotgun(); assert.deepEqual(types(drive(full, 0.1, { reload: true })), []);
  const hot = createShotgun(); drive(hot, 0.01, { fire: true }); assert.deepEqual(types(drive(hot, 0.05, { reload: true }, 0.01)).filter(t => t === 'reloadStart'), [], 'cooldown blocks an early reload');
});
test('capacity and timings are tunable', () => {
  const g = createShotgun({ capacity: 5, interval: 0.1, reload: 0.5 }); const ev = drive(g, 0.7, { fire: true });
  assert.equal(ev.filter(e => e.type === 'shot').length >= 5, true);
  assert.ok(ev.find(e => e.type === 'reloadStart'));
});
test('setParams changing capacity down clamps ammo', () => {
  const g = createShotgun({ capacity: 6 }); g.setParams({ capacity: 2 }); assert.equal(g.state.ammo, 2);
});

// ---- finding 11: the reload duration is captured when a reload starts
test('changing the reload time mid-reload never makes progress jump or go backwards; edits apply to the next reload', () => {
  for (const change of [2.0, 0.3]) {
    const g = createShotgun({ capacity: 2, interval: 0.28, reload: 0.95 }); const dt = 1 / 120;
    for (let i = 0; i < 400 && !g.reloading; i++) g.update(dt, { fire: true });                                                  // both shells gone, reload starts
    assert.ok(g.reloading); let prev = g.progress, steps = 0, started = 0;
    while (g.reloading && steps++ < 5000) {
      if (steps === 40) g.setParams({ capacity: 2, interval: 0.28, reload: change });                                                  // slider moved mid-reload
      else g.setParams({ capacity: 2, interval: 0.28, reload: steps > 40 ? change : 0.95 });
      const ev = g.update(dt, {}); const pr = g.progress;
      if (!ev.some(e => e.type === 'reloadDone')) { assert.ok(pr >= prev - 1e-9 && pr <= 1, `progress ${prev} -> ${pr}`); prev = pr; }
    }
    assert.ok(Math.abs(steps * dt - 0.95) < 0.2, `still takes about the original 0.95 s (took ${steps * dt}) when the slider moved to ${change}`);
    for (let i = 0; i < 400 && !g.reloading; i++) g.update(dt, { fire: true });                                                  // next reload
    const t0 = g.state.reloadTotal; assert.equal(t0, change, 'the next reload uses the new duration');
  }
});
test('each reload event fires once however the duration is edited', () => {
  const g = createShotgun({ capacity: 2, reload: 0.95 }); const ev = [];
  g.update(0.01, { fire: true }); g.update(0.3, { fire: true }); g.update(0.3, {});
  for (let i = 0; i < 400; i++) { g.setParams({ capacity: 2, reload: i % 2 ? 0.2 : 3 }); ev.push(...g.update(1 / 120, {}).map(e => e.type)); }
  assert.equal(ev.filter(e => e === 'reloadStart').length <= 1, true); assert.equal(ev.filter(e => e === 'reloadDone').length, 1);
});

// ---- finding 12: which chambers need shells
test('the gun remembers which barrels were fired, and clears that when the reload finishes', () => {
  const g = createShotgun({ capacity: 2, interval: 0.28, reload: 0.5 });
  g.update(0.01, { fire: true }); g.update(0.01, {});
  assert.deepEqual([...g.state.spent], [true, false], 'one shell fired: one empty chamber');
  g.update(0.4, { reload: true }); g.update(0.01, { reload: false });
  assert.deepEqual([...g.state.spent], [true, false], 'the mask holds for the whole reload');
  for (let i = 0; i < 200; i++) g.update(1 / 120, {});
  assert.deepEqual([...g.state.spent], [false, false]); assert.equal(g.state.ammo, 2);
});
test('an empty two-shell gun has both chambers empty; capacity 1 always uses one chamber', () => {
  const g = createShotgun({ capacity: 2, interval: 0.1, reload: 5 }); g.update(0.01, { fire: true }); g.update(0.2, { fire: true }); g.update(0.01, {});
  assert.deepEqual([...g.state.spent], [true, true]);
  const h = createShotgun({ capacity: 1, interval: 0.1, reload: 0.2 }); const barrels = [];
  for (let i = 0; i < 6; i++) { for (let k = 0; k < 120; k++) barrels.push(...h.update(1 / 60, { fire: k < 2 }).filter(e => e.type === 'shot').map(e => e.barrel)); }
  assert.ok(barrels.length >= 3 && barrels.every(b => b === 0), `capacity 1 fires barrel 0 only: ${barrels}`);
});
