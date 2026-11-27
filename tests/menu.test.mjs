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

/* ---------------- the pause menu ---------------- */
const dpadPad = (down = [], ly = 0, lx = 0) => ({ connected: true, left: { x: lx, y: ly }, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.includes(i), value: down.includes(i) ? 1 : 0 })) });
const timed = () => { let t = 0; return { clock: () => t, advance: ms => { t += ms; } }; };

test('directions are off by default, so the hero screen is unchanged', () => {
  assert.deepEqual(createMenuNav().update(dpadPad([13])), ['any']);
});
test('the d-pad reports up, down, left and right, once per press', () => {
  const T = timed(), nav = createMenuNav({ directions: true, clock: T.clock });
  assert.deepEqual(nav.update(dpadPad([13])), ['any', 'down']); T.advance(16); assert.deepEqual(nav.update(dpadPad([13])), [], 'still held: no new action yet');
  nav.update(dpadPad()); assert.deepEqual(nav.update(dpadPad([12])), ['any', 'up']);
  nav.update(dpadPad()); assert.deepEqual(nav.update(dpadPad([14])), ['any', 'prev', 'left']);
  nav.update(dpadPad()); assert.deepEqual(nav.update(dpadPad([15])), ['any', 'next', 'right']);
});
test('a held direction waits, then repeats, and speeds up', () => {
  const T = timed(), nav = createMenuNav({ directions: true, clock: T.clock }); nav.update(dpadPad([15])); const at = [];
  for (let i = 0; i < 100; i++) { T.advance(16); if (nav.update(dpadPad([15])).includes('right')) at.push(T.clock()); }
  assert.ok(at[0] >= 380, `first repeat after the wait (${at[0]})`); assert.ok(at.length > 5, 'then it keeps repeating'); assert.ok(at.at(-1) - at.at(-2) < at[1] - at[0] + 1, 'and speeds up');
});
test('the left stick scrolls the menu too', () => {
  const T = timed(), nav = createMenuNav({ directions: true, clock: T.clock });
  assert.ok(nav.update(dpadPad([], 0.9)).includes('down')); nav.update(dpadPad([], 0)); assert.ok(nav.update(dpadPad([], -0.9)).includes('up'));
});
test('paused: directions move, A presses, Start or B resumes; nothing else leaves the menu', () => {
  const cmd = (...a) => menuCommands(['any', ...a], { overlayUp: false, mode: 'run', paused: true });
  assert.deepEqual(cmd('down'), [{ type: 'nav', dir: 'down' }]); assert.deepEqual(cmd('left'), [{ type: 'nav', dir: 'left' }]);
  assert.deepEqual(cmd('confirm'), [{ type: 'activate' }]); assert.deepEqual(cmd('pause'), [{ type: 'resume' }]); assert.deepEqual(cmd('back'), [{ type: 'resume' }]);
  assert.deepEqual(cmd('next'), [], 'bumpers do nothing while paused');
});
test('playing: Start pauses; game over: A retries and B goes back to the heroes', () => {
  assert.deepEqual(menuCommands(['any', 'pause'], { overlayUp: false, mode: 'run' }), [{ type: 'pause' }]);
  assert.deepEqual(menuCommands(['any', 'confirm'], { overlayUp: false, mode: 'run', over: true }), [{ type: 'retry' }]);
  assert.deepEqual(menuCommands(['any', 'back'], { overlayUp: false, mode: 'run', over: true }), [{ type: 'compare' }]);
  assert.deepEqual(menuCommands(['any', 'confirm'], { overlayUp: false, mode: 'run' }), [], 'A does nothing mid-run');
});
