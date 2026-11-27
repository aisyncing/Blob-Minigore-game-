import test from 'node:test';
import assert from 'node:assert/strict';
import { createMenuNav, menuCommands } from '../src/input/menu.js';

const pad = (down = [], lx = 0) => ({ connected: true, left: { x: lx, y: 0 }, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });
const run = (nav, frames) => frames.map(f => nav.update(f));

test('a held confirm button produces exactly one action, not one per frame', () => {
  const nav = createMenuNav();
  const out = run(nav, [pad(), pad([0]), pad([0]), pad([0]), pad([0]), pad()]);
  assert.deepEqual(out.flat(), ['any', 'confirm']);
  assert.deepEqual(run(nav, [pad([0])]).flat(), ['any', 'confirm'], 'a second press after release is a second action');
});

test('the first poll that already shows a pressed button still counts as a press', () => {
  const nav = createMenuNav();                       // browsers reveal a pad only once something is pressed
  assert.deepEqual(nav.update(pad([0])), ['any', 'confirm']);
});

test('d-pad, bumpers, back button map to menu actions', () => {
  const nav = createMenuNav();
  assert.deepEqual(nav.update(pad([15])), ['any', 'next']); nav.update(pad());
  assert.deepEqual(nav.update(pad([14])), ['any', 'prev']); nav.update(pad());
  assert.deepEqual(nav.update(pad([5])), ['any', 'next']); nav.update(pad());
  assert.deepEqual(nav.update(pad([4])), ['any', 'prev']); nav.update(pad());
  assert.deepEqual(nav.update(pad([1])), ['any', 'back']);
});

test('left stick flick chooses once per flick and re-arms only after it returns near centre', () => {
  const nav = createMenuNav();
  const out = run(nav, [pad([], 0), pad([], 0.9), pad([], 0.95), pad([], 0.5), pad([], 0.9), pad([], 0.1), pad([], 0.9), pad([], -0.9)]).flat();
  assert.deepEqual(out, ['next', 'next', 'prev']);   // flick; holding and 0.5 do not repeat; after the centre a second flick counts; then the opposite flick
});

test('a disconnected pad clears held state so a reconnect does not fire phantom actions', () => {
  const nav = createMenuNav();
  nav.update(pad([0]));
  assert.deepEqual(nav.update({ connected: false }), []);
  assert.deepEqual(nav.update(pad([0])), ['any', 'confirm']);
});

test('the title overlay swallows the press that dismisses it', () => {
  assert.deepEqual(menuCommands(['any', 'confirm'], { overlayUp: true, mode: 'compare' }), [{ type: 'start' }]);
  assert.deepEqual(menuCommands(['any', 'confirm'], { overlayUp: false, mode: 'compare' }), [{ type: 'play' }]);
});

test('hero selection wraps and only happens on the hero screen; back leaves play', () => {
  const cmd = (a, mode, sel = 0) => menuCommands(['any', a], { overlayUp: false, mode, selected: sel, count: 3 });
  assert.deepEqual(cmd('next', 'compare', 2), [{ type: 'choose', index: 0 }]);
  assert.deepEqual(cmd('prev', 'compare', 0), [{ type: 'choose', index: 2 }]);
  assert.deepEqual(cmd('next', 'play'), []);
  assert.deepEqual(cmd('confirm', 'play'), []);
  assert.deepEqual(cmd('back', 'play'), [{ type: 'compare' }]);
  assert.deepEqual(cmd('back', 'compare'), []);
});

test('on the setup screen only A starts the game; any other press just wakes the pad', () => {
  assert.deepEqual(menuCommands(['any'], { overlayUp: true, mode: 'compare' }), []);
  assert.deepEqual(menuCommands(['any', 'next'], { overlayUp: true, mode: 'compare' }), []);
  assert.deepEqual(menuCommands(['any', 'confirm'], { overlayUp: true, mode: 'compare' }), [{ type: 'start' }]);
});
