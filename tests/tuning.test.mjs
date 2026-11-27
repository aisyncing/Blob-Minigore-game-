// Finding 13: resetting one page's settings must not touch the other page's, even across two tabs sharing one localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { tuning, DEFS } = await import('../src/tuning.js');
const KEY = 'blobshooter.tuning.v1', saved = () => JSON.parse(store.get(KEY) || '{}');
const labScope = d => d.page !== 'hero', heroScope = d => d.page !== 'lab';

test('resetting the lab leaves game settings (shotgun damage) alone, in memory and in storage', () => {
  tuning.set('gun.damage', 20); tuning.set('left.inner', 0.3); tuning.set('pad.speed', 12);
  tuning.reset(labScope);
  assert.equal(tuning.get('gun.damage'), 20); assert.equal(saved()['gun.damage'], 20, 'still stored for the game to reload');
  assert.equal(tuning.get('left.inner'), DEFS.find(d => d.key === 'left.inner').def); assert.equal(tuning.get('pad.speed'), 8);
});
test('every setting the lab shows is reset, and every one it does not show is kept', () => {
  for (const d of DEFS) tuning.set(d.key, Math.min(d.max, d.def === d.max ? d.min : d.max));
  tuning.reset(labScope);
  for (const d of DEFS) { if (d.page === 'hero') assert.notEqual(tuning.get(d.key), d.def, d.key + ' must survive'); else assert.equal(tuning.get(d.key), d.def, d.key + ' must reset'); }
});
test('the game reset does not touch lab-only settings', () => {
  tuning.reset(); tuning.set('pad.speed', 14); tuning.set('gun.damage', 30); tuning.reset(heroScope);
  assert.equal(tuning.get('pad.speed'), 14); assert.equal(tuning.get('gun.damage'), 12);
});
test('a write from one page never wipes another page\'s stored values (stale tab)', () => {
  tuning.reset(); store.set(KEY, JSON.stringify({ 'gun.damage': 25 }));      // the game tab saved this after this tab loaded
  tuning.set('pad.speed', 10);
  assert.equal(saved()['gun.damage'], 25, 'merged into the latest stored object'); assert.equal(saved()['pad.speed'], 10);
  tuning.reset(labScope); assert.equal(saved()['gun.damage'], 25);
});
test('reset with no argument still resets everything', () => { tuning.set('gun.damage', 40); tuning.reset(); assert.equal(tuning.get('gun.damage'), 12); assert.equal(saved()['gun.damage'], undefined); });
