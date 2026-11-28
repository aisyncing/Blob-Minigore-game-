import test from 'node:test';
import assert from 'node:assert/strict';
import { createTutorial } from '../src/game/tutorial.js';
import { RULES } from '../src/game/rules.js';

const C = RULES.tutorial, DT = 1 / 60;
const run = (t, secs, input) => { for (let i = 0; i < Math.round(secs / DT); i++) t.update(DT, input); };
const atShoot = () => { const t = createTutorial(); t.begin(); run(t, 0.5, { moveMag: 1 }); run(t, C.gap + 0.1, { moveMag: 0 }); return t; };

test('begin starts the lesson at step 1 in slow motion; waves must wait', () => {
  const t = createTutorial(); assert.equal(t.state.stage, 'off'); assert.equal(t.active, false); assert.equal(t.timeScale, 1);
  t.begin(); assert.equal(t.state.stage, 'move'); assert.equal(t.active, true); assert.equal(t.timeScale, C.slow);
});

test('stick drift and short flicks do not complete the movement step', () => {
  const t = createTutorial(); t.begin();
  run(t, 10, { moveMag: 0 }); assert.equal(t.state.stage, 'move');                       // dead stick (drift is below the deadzone, so it reads 0)
  run(t, 10, { moveMag: C.moveMag - 0.01 }); assert.equal(t.state.stage, 'move');        // a light touch below the threshold
  for (let i = 0; i < 20; i++) { run(t, C.moveHold - 0.07, { moveMag: 1 }); run(t, 0.05, { moveMag: 0 }); }   // many taps, each shorter than the hold
  assert.equal(t.state.stage, 'move');
});

test('pushing the stick for the hold time completes step 1, then the breather, then step 2', () => {
  const t = createTutorial(); t.begin();
  run(t, C.moveHold + 0.05, { moveMag: 0.8 }); assert.equal(t.state.stage, 'gap');
  assert.equal(t.active, true, 'waves still wait during the breather');
  run(t, C.gap - 0.2, {}); assert.equal(t.state.stage, 'gap');
  run(t, 0.4, {}); assert.equal(t.state.stage, 'shoot');
});

test('step 2 waits until the gun can fire', () => {
  const t = createTutorial(); t.begin(); run(t, 0.5, { moveMag: 1 });
  run(t, 5, { gunReady: false }); assert.equal(t.state.stage, 'gap');
  run(t, 0.1, { gunReady: true }); assert.equal(t.state.stage, 'shoot');
});

test('shots before step 2 are ignored; the first shot in step 2 finishes the lesson exactly once', () => {
  const t = createTutorial(); t.begin(); t.onShot(); assert.equal(t.state.stage, 'move');
  run(t, 0.5, { moveMag: 1 }); t.onShot(); assert.equal(t.state.stage, 'gap');
  run(t, C.gap + 0.1, {}); assert.equal(t.state.stage, 'shoot');
  t.onShot(); assert.equal(t.state.stage, 'done'); assert.equal(t.active, false);
  t.onShot(); assert.equal(t.state.stage, 'done');
});

test('stage order cannot be skipped: moving during step 2 or a shot during step 1 changes nothing', () => {
  const t = atShoot(); run(t, 2, { moveMag: 1 }); assert.equal(t.state.stage, 'shoot');
  const u = createTutorial(); u.begin(); u.onShot(); run(u, 1, { moveMag: 0 }); assert.equal(u.state.stage, 'move');
});

test('game speed: slow while a step waits, normal in the breather and after, and eased not jumped', () => {
  const t = createTutorial(); t.begin(); run(t, 1, { moveMag: 0 }); assert.equal(t.timeScale, C.slow);
  run(t, C.moveHold + 0.05, { moveMag: 1 }); assert.equal(t.state.stage, 'gap');           // step 1 completes; speed is on its way back to 1
  assert.ok(t.timeScale > C.slow && t.timeScale < 1, 'mid-ease: ' + t.timeScale);
  run(t, C.ease + 0.05, {}); assert.equal(t.timeScale, 1, 'settles on exactly 1');
  run(t, C.gap, {}); assert.equal(t.state.stage, 'shoot'); run(t, C.ease + 0.05, {}); assert.equal(t.timeScale, C.slow);
  t.onShot(); run(t, C.ease + 0.05, {}); assert.equal(t.timeScale, 1);
});

test('cancel restores normal speed at once and the next begin starts over; a finished lesson never restarts', () => {
  const t = createTutorial(); t.begin(); run(t, 0.5, { moveMag: 1 }); run(t, C.gap + 0.1, {});
  t.cancel(); assert.equal(t.timeScale, 1); assert.equal(t.state.stage, 'off'); assert.equal(t.active, false);
  t.begin(); assert.equal(t.state.stage, 'move');
  const d = atShoot(); d.onShot(); d.cancel(); assert.equal(d.state.stage, 'done'); assert.equal(d.timeScale, 1);
  d.begin(); assert.equal(d.state.stage, 'done', 'retry after completion skips the lesson');
});

test('skip finishes the lesson at normal speed', () => {
  const t = createTutorial(); t.begin(); t.skip(); assert.equal(t.state.stage, 'done'); assert.equal(t.timeScale, 1); assert.equal(t.active, false);
});
