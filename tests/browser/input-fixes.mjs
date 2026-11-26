// Findings 4, 5, 9, 10 in a real browser: real DOM events, simulated controller (no physical hardware).
import assert from 'node:assert/strict';
import { openGame, freeze, scene } from './harness.mjs';
const NOSTEP = () => {};

// ---------------- finding 4: lost taps (hero)
{
  const g = await openGame(); const { page } = g; await freeze(page);
  const reset = () => scene(page, { hero: 0, px: 0, py: 6, aim: [0, -1] });
  const shots = () => page.evaluate(() => __hero.stats.shots);
  const frame = (nSteps) => page.evaluate(n => { const H = __hero; H.input.sample(performance.now()); for (let i = 0; i < n; i++) H.simStep(1 / 120); }, nSteps);
  const emit = (fn) => page.evaluate(fn);
  const tapSpace = () => emit(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
  const click = () => emit(() => { const c = document.querySelector('#c'); const o = { button: 0, pointerId: 1, bubbles: true, clientX: 600, clientY: 300 }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); });
  for (const [name, tap] of [['Space', tapSpace], ['left click', click]]) for (const steps of [0, 1, 4, 16]) {
    await reset(); await frame(2);                       // settled, nothing pending
    await tap();                                          // complete tap between two rendered frames
    if (steps === 0) { await frame(0); assert.equal(await shots(), 0, 'a frame with no simulation step fires nothing yet'); await frame(0); }
    await frame(steps || 1);
    assert.equal(await shots(), 1, `${name} tap, ${steps} sim steps in the frame: exactly one shot`);
    await frame(20); assert.equal(await shots(), 1, `${name}: no extra shot from the same tap`);
  }
  console.log('ok finding 4: taps (Space + click; frames with 0, 1, 4, 16 steps)');
  // hold: existing cadence (2 shots 0.28s apart, then a 0.95s reload, then 2 more)
  await reset(); await page.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
  const times = await page.evaluate(() => { const H = __hero, out = []; for (let i = 0; i < 240; i++) { if (i % 2 === 0) H.input.sample(performance.now()); const before = H.stats.shots; H.simStep(1 / 120); if (H.stats.shots > before) out.push(+(i / 120).toFixed(2)); } return out; });
  await page.evaluate(() => dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })));
  console.log('   hold-to-fire shot times (s):', times.join(', '));
  assert.equal(times.length, 4); assert.ok(Math.abs(times[1] - times[0] - 0.28) < 0.02, 'repeat interval 0.28s'); assert.ok(Math.abs(times[2] - times[1] - 1.23) < 0.05, 'reload gap preserved (cooldown 0.28 + reload 0.95)');
  console.log('ok finding 4: hold cadence + reload preserved');
  assert.deepEqual(g.errors, []); await g.close();
}

// ---------------- finding 5: stick drift must not block WASD (hero, real frames)
{
  const g = await openGame(); const { page } = g;
  await g.pad({ axes: [0.08, 0.0, 0, 0] });                       // resting drift 0.08 < default inner deadzone 0.12
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => __hero.state().mode), 'play');
  const x0 = await page.evaluate(() => __hero.player.x);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ x: __hero.player.x, src: __hero.snap.source, mx: __hero.snap.move.x }));
  await page.keyboard.up('KeyD');
  assert.equal(r.src, 'keyboard'); assert.ok(r.mx > 0.99 && r.x - x0 > 1.5, `D moves the hero normally (moved ${(r.x - x0).toFixed(2)})`);
  // a deliberate controller push takes over
  await g.pad({ axes: [-0.7, 0, 0, 0] }); await page.keyboard.down('KeyD'); await page.waitForTimeout(300);
  const t = await page.evaluate(() => ({ src: __hero.snap.source, mx: __hero.snap.move.x })); await page.keyboard.up('KeyD');
  assert.equal(t.src, 'controller'); assert.ok(t.mx < -0.3, 'the stick wins while deliberately pushed');
  console.log('ok finding 5: drift 0.08 vs deadzone 0.12; deliberate input still takes over'); assert.deepEqual(g.errors, []); await g.close();
}

// ---------------- findings 9 and 10 (controller lab)
{
  const g = await openGame({ file: 'dist/index.html', hook: '__lab' }); const { page } = g;
  const out = () => page.evaluate(() => document.querySelector('#driftOut').textContent);
  // 10: trigger chatter and effective thresholds shown
  await g.pad({ buttons: { A: 1 } }); await page.waitForTimeout(100); await g.pad({ buttons: { A: 0 } });
  await page.evaluate(() => { __lab.tuning.set('trigger.press', 0.5); __lab.tuning.set('trigger.release', 0.5); });
  await g.pad({ buttons: { RT: 0.5 } }); await page.waitForTimeout(100);
  const seen = await page.evaluate(async () => { const out = []; for (let i = 0; i < 40; i++) { out.push(__lab.state().fire); await new Promise(r => requestAnimationFrame(r)); } return out; });
  assert.equal(new Set(seen).size, 1, 'RT held at 0.50 does not alternate'); assert.equal(seen[0], true);
  const eff = await page.evaluate(() => document.querySelector('#trigEff').textContent);
  assert.match(eff, /releases at 0\.48/); assert.match(eff, /sliders say 0\.50 \/ 0\.50/);
  await page.evaluate(() => { __lab.tuning.set('trigger.press', 0.4); __lab.tuning.set('trigger.release', 0.8); }); await g.pad({ buttons: { RT: 0.45 } }); await page.waitForTimeout(100);
  const seen2 = await page.evaluate(async () => { const out = []; for (let i = 0; i < 30; i++) { out.push(__lab.state().fire); await new Promise(r => requestAnimationFrame(r)); } return out; });
  assert.equal(new Set(seen2).size, 1, 'release above press: no chatter'); console.log('ok finding 10: no chatter; lab shows effective thresholds:', eff.trim());
  await g.pad({ buttons: { RT: 0 } });
  // 9: calibration ignores WASD and the mouse
  await g.pad({ axes: [0.05, -0.03, 0.02, 0.0] });
  await page.click('#bDrift'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW'); await page.mouse.move(300, 300); await page.mouse.move(700, 400);
  await page.waitForTimeout(1900); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
  let txt = await out(); const m = txt.match(/left (\d+\.\d+), right (\d+\.\d+)/); assert.ok(m, txt);
  assert.ok(Math.abs(+m[1] - Math.hypot(0.05, 0.03)) < 0.002 && +m[2] < 0.05, `drift reflects the pad (${m[1]}, ${m[2]}), not WASD/mouse`);
  // apply works with the same pad; fails after disconnect
  await page.click('#driftOut button'); assert.ok(await page.evaluate(() => __lab.tuning.get('left.inner')) < 0.12 + 0.2);
  await page.click('#bDrift'); await page.waitForTimeout(400); await page.evaluate(() => { window.__pad.present = false; }); await page.waitForTimeout(300);
  txt = await out(); assert.match(txt, /disconnected/i, 'measurement cancelled when the pad vanishes'); 
  await page.evaluate(() => { window.__pad.present = true; });
  await page.click('#bDrift'); await page.waitForTimeout(300); await page.evaluate(() => { window.__pad.pad.id = 'Another Controller'; }); await page.waitForTimeout(300);
  assert.match(await out(), /different controller/i, 'cancelled when a different pad appears');
  await page.evaluate(() => { window.__pad.pad.id = 'Simulated Xbox Controller (STANDARD GAMEPAD)'; });
  // finish a measurement, then disconnect, then Apply must refuse
  await page.click('#bDrift'); await page.waitForTimeout(1900); await page.evaluate(() => { window.__pad.present = false; }); await page.waitForTimeout(200);
  const before = await page.evaluate(() => __lab.tuning.get('left.inner')); await page.click('#driftOut button'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => __lab.tuning.get('left.inner')), before); assert.match(await out(), /no longer connected/i);
  // starting with no pad connected is refused
  await page.click('#bDrift'); assert.match(await out(), /No controller connected/i);
  console.log('ok finding 9: pad-only measurement, cancel on disconnect/change, apply needs the pad');
  assert.deepEqual(g.errors, []); await g.close();
}
console.log('input-fixes: all passed');
