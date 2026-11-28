// The first-run lesson in the real page, real time: slow motion + wave 1 held back, drift ignored, a real stick push moves the hero AND ends
// step 1, R2 fires one real shot AND ends step 2, wave 1 follows. Also: leaving mid-lesson restores normal speed; a finished lesson never repeats.
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';

const S = page => page.evaluate(() => { const H = __hero; return { stage: H.tutorial.state.stage, scale: H.tutorial.timeScale, wave: H.director.state.wave, dirT: H.director.state.t, shots: H.stats.shots, px: H.player.x, py: H.player.y, mode: H.state().mode, run: H.run.state }; });
const stage = (page, st, ms = 6000) => page.waitForFunction(s => __hero.tutorial.state.stage === s, st, { timeout: ms });
async function start(opts) {
  const g = await openGame({ practice: false, ...opts }); const { page } = g;
  await page.click('#bStart'); await page.waitForTimeout(50);                    // leave the controller setup screen
  await page.click('#bPlayNow'); await page.waitForTimeout(300);
  return g;
}

{ // controller
  const g = await start(); const { page, pad } = g;
  let s = await S(page);
  assert.equal(s.mode, 'play'); assert.equal(s.stage, 'move', 'the lesson starts with the stick'); assert.ok(s.scale < 0.5, 'slow motion: ' + s.scale);
  await page.waitForTimeout(3000); s = await S(page);
  assert.equal(s.wave, 0); assert.equal(s.dirT, 1.5, 'the wave director has not ticked at all while the lesson waits'); assert.equal(s.stage, 'move');
  const x0 = s.px, y0 = s.py;
  await pad({ axes: [0.1, 0.06, 0, 0] }); await page.waitForTimeout(700); s = await S(page);   // stick drift: under the deadzone
  assert.equal(s.stage, 'move', 'drift does not complete the lesson'); assert.equal(s.px, x0); assert.equal(s.py, y0);
  await pad({ buttons: { RT: 1 } }); await page.waitForTimeout(200); await pad({ buttons: { RT: 0 } }); await page.waitForTimeout(200);   // R2 in step 1 is a normal shot
  s = await S(page); assert.equal(s.stage, 'move', 'a shot during step 1 does not skip ahead'); assert.ok(s.shots >= 1);
  const shots0 = s.shots;
  await pad({ axes: [0.9, 0, 0, 0] }); await stage(page, 'gap'); await page.waitForTimeout(250); s = await S(page);
  assert.ok(s.px > x0 + 0.05, `the hero moves while the lesson ends (${x0.toFixed(2)} -> ${s.px.toFixed(2)})`); assert.ok(s.scale > 0.9, 'speed is coming back: ' + s.scale);
  await stage(page, 'shoot'); assert.equal((await S(page)).dirT, 1.5, 'wave 1 still waits for step 2');
  await page.waitForTimeout(400); s = await S(page); assert.ok(s.scale < 0.5, 'slow again for step 2: ' + s.scale);
  await pad({ axes: [0, 0, 0, 0] }); await page.waitForTimeout(100);
  await pad({ buttons: { RT: 1 } }); await page.waitForTimeout(60); await pad({ buttons: { RT: 0 } });     // a quick tap
  await stage(page, 'done'); await page.waitForTimeout(300); s = await S(page);
  assert.equal(s.shots, shots0 + 1, 'one tap fired exactly one real shot'); assert.equal(s.scale, 1, 'back to normal speed');
  await page.waitForFunction(() => __hero.director.state.wave === 1, null, { timeout: 6000 });
  await page.evaluate(() => __hero.startRun()); s = await S(page); assert.equal(s.stage, 'done', 'a retry does not repeat the lesson'); assert.equal(s.scale, 1);
  assert.deepEqual(g.errors, []); await g.close();
}

{ // leaving mid-lesson, then coming back
  const g = await start(); const { page, pad } = g;
  assert.equal((await S(page)).stage, 'move');
  await pad({ buttons: { B: 1 } }); await page.waitForTimeout(100); await pad({ buttons: { B: 0 } }); await page.waitForTimeout(200);
  let s = await S(page); assert.equal(s.mode, 'compare', 'B goes back to the designs'); assert.equal(s.scale, 1, 'normal speed again'); assert.equal(s.stage, 'off');
  await page.click('#bPlayNow'); await page.waitForTimeout(300); s = await S(page); assert.equal(s.mode, 'play'); assert.equal(s.stage, 'move', 'the lesson starts over'); assert.ok(s.scale < 0.5);
  await page.evaluate(() => { __hero.run.mode = 'practice'; __hero.startRun(); }); s = await S(page); assert.equal(s.stage, 'off', 'no lesson on the practice range'); assert.equal(s.scale, 1);
  assert.deepEqual(g.errors, []); await g.close();
}

{ // keyboard and mouse: WASD, then a click
  const g = await start(); const { page } = g;
  assert.equal((await S(page)).stage, 'move');
  await page.keyboard.down('KeyD'); await stage(page, 'gap'); await page.keyboard.up('KeyD');
  await stage(page, 'shoot'); const shots0 = (await S(page)).shots;
  await page.mouse.move(700, 300); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await stage(page, 'done'); const s = await S(page); assert.equal(s.shots, shots0 + 1, 'one click, one shot');
  assert.deepEqual(g.errors, []); await g.close();
}
console.log('tutorial: all passed (controller flow, leave and return, keyboard flow)');
