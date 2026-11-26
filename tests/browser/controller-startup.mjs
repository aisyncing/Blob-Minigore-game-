// Finding 1: from a fresh page, a simulated controller alone must dismiss the title overlay, pick each hero,
// enter the arena and fire. A held confirm button must trigger one menu action per press.
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

const state = (page) => page.evaluate(() => ({ overlayOff: document.querySelector('#focus').classList.contains('off'), ...__hero.state(), shots: __hero.stats.shots }));
const NAMES = ['Gumdrop', 'Sprout', 'Marshmallow'];
// each way of choosing a hero with the pad: [label, presses to reach index 2, presses to reach index 1]
const WAYS = { 'd-pad right': { to: i => Array(i).fill('Right') }, 'bumper RB': { to: i => Array(i).fill('RB') }, 'd-pad left (wraps)': { to: i => Array((3 - i) % 3).fill('Left') }, 'LB (wraps)': { to: i => Array((3 - i) % 3).fill('LB') } };

for (const [way, { to }] of Object.entries(WAYS)) for (const target of [0, 1, 2]) {
  const g = await openGame(); const { page } = g;
  let s = await state(page); assert.equal(s.overlayOff, false); assert.equal(s.mode, 'compare');
  await g.tap('A'); s = await state(page);
  assert.equal(s.overlayOff, true, `${way}→${NAMES[target]}: first press wakes the game`); assert.equal(s.mode, 'compare', 'the waking press must not also start play');
  for (const b of to(target)) await g.tap(b);
  s = await state(page); assert.equal(s.selected, target, `${way}: selected ${NAMES[target]}`);
  await g.tap('A'); s = await state(page); assert.equal(s.mode, 'play', `${way}→${NAMES[target]}: A enters the arena`); assert.equal(s.selected, target);
  await g.pad({ buttons: { RT: 1 } }); await page.waitForFunction(() => __hero.stats.shots >= 1, null, { timeout: 3000 });
  await g.pad({ buttons: { RT: 0 } });
  assert.deepEqual(g.errors, [], 'no page errors'); await g.close();
  console.log('ok', way.padEnd(20), NAMES[target]);
}

{ // left-stick flick also chooses; B leaves the arena
  const g = await openGame(); const { page } = g;
  await g.tap('A'); await g.pad({ axes: [0.9] }); await page.waitForTimeout(80); await g.pad({ axes: [0] }); await page.waitForTimeout(80);
  assert.equal((await state(page)).selected, 1, 'left-stick flick right chooses the next hero');
  await g.tap('A'); assert.equal((await state(page)).mode, 'play'); await g.tap('B'); assert.equal((await state(page)).mode, 'compare', 'B returns to the hero screen');
  await g.close(); console.log('ok stick flick + B');
}

{ // holding confirm for a long time = ONE action per press
  const g = await openGame(); const { page } = g;
  await g.pad({ buttons: { A: 1 } }); await page.waitForTimeout(700);
  let s = await state(page); assert.equal(s.overlayOff, true); assert.equal(s.mode, 'compare', 'held A: only the overlay dismissal happened');
  await g.pad({ buttons: { A: 0 } }); await page.waitForTimeout(80);
  await g.pad({ buttons: { A: 1 } }); await page.waitForTimeout(700);
  s = await state(page); assert.equal(s.mode, 'play', 'second press enters play'); await page.waitForTimeout(300);
  assert.equal((await state(page)).mode, 'play', 'still in play: the held button did not toggle anything else');
  await g.close(); console.log('ok held confirm = one action per press');
}
console.log('controller-startup: all passed');
