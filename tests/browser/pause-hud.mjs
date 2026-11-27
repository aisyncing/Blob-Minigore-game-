// HUD and pause menu, driven by a simulated controller: the 3-2-1 countdown and Wave 1 banner, the health bar and its trailing white chunk,
// the red state on the last hit, and the pause menu (settings navigated and changed with the d-pad, B to resume).
import { openGame } from './harness.mjs';
import assert from 'node:assert/strict';

const shots = process.argv[2];
const { page, errors, pad, tap, close } = await openGame();
const get = (fn, arg) => page.evaluate(fn, arg);
const frac = (sel) => get(s => parseFloat(document.querySelector(s).style.getPropertyValue('--f')), sel);
const banner = () => get(() => ({ small: document.querySelector('.b-small').textContent, big: document.querySelector('.b-big').textContent, shown: document.querySelector('#banner').classList.contains('show') }));

await tap('A'); await tap('A');
assert.equal(await get(() => window.__hero.state().mode), 'run');

// ---- countdown, then Wave 1
let b = await banner(); assert.ok(b.shown && /WAVE 1 STARTING IN/.test(b.small) && /^[321]$/.test(b.big), `countdown shows: ${JSON.stringify(b)}`);
assert.equal(await get(() => window.__hero.sess.crowd.alive), 0, 'nothing spawns during the countdown');
await page.waitForFunction(() => window.__hero.sess.waves.state.wave === 1, null, { timeout: 40000 });
b = await banner(); assert.equal(b.big, 'WAVE 1'); assert.ok(b.shown);
if (shots) await page.screenshot({ path: shots + '-wave1.png' });

// ---- health bar: starts full; a hit drops the green at once and leaves white behind that then drains
assert.equal(await frac('.hp-fill'), 1);
await get(() => { const H = window.__hero; H.sess.director.update = () => []; H.sess.crowd.clear(); H.sess.crowd.spawn('furry', 1, H.player.x + 1.5, H.player.y, { emerge: false }); for (let i = 0; i < 400 && H.sess.run.hp === 3; i++) H.simStep(1 / 120); });
await page.waitForTimeout(120);
assert.equal(await get(() => window.__hero.sess.run.hp), 2, 'one hit taken');
assert.ok(Math.abs(await frac('.hp-fill') - 2 / 3) < 0.01, 'green dropped to two thirds at once');
assert.ok(await frac('.hp-ghost') > 0.9, 'the white chunk is still at the old level');
if (shots) await page.screenshot({ path: shots + '-hit.png' });
await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('.hp-ghost').style.getPropertyValue('--f')) - 2 / 3) < 0.02, null, { timeout: 40000 });   // the white drains down to the green level
assert.equal(await get(() => document.querySelector('#hp').classList.contains('critical')), false, '2 of 3 is not critical');
assert.equal(await get(() => window.__hero.heroes[window.__hero.state().selected].damage), 1, 'the hat is off after the first hit');

// ---- last hit: the bar turns red
await get(() => { const H = window.__hero, r = H.sess.run; r.invuln = 0; r.hp = 2; H.sess.crowd.clear(); H.sess.crowd.spawn('furry', 1, H.player.x + 1.5, H.player.y, { emerge: false }); for (let i = 0; i < 400 && r.hp === 2; i++) H.simStep(1 / 120); });
await page.waitForTimeout(150);
assert.equal(await get(() => document.querySelector('#hp').classList.contains('critical')), true, 'one hit left: red');
if (shots) await page.screenshot({ path: shots + '-critical.png' });

// ---- pause menu
await get(() => { window.__hero.sess.run.invuln = 3; window.__hero.sess.crowd.clear(); });
await tap('Start');
const vis = () => get(() => ['panel', 'pauseCard', 'pauseHead', 'feel'].filter(id => document.getElementById(id).checkVisibility()));
assert.deepEqual(await vis(), ['panel', 'pauseCard', 'pauseHead', 'feel'], 'pausing shows the settings with the controller section open');
const text = await get(() => document.querySelector('#feelSliders').innerText);
for (const t of ['Controller vibration', 'Gun shots', 'Getting hit', 'Reload clicks', 'Shotgun 1st barrel', 'Shotgun 2nd barrel', 'Footsteps', 'Pistol resistance', 'SMG trigger buzz', 'Wall starts at', 'Click point', 'Fire buzz']) assert.ok(text.includes(t), `the pause menu has "${t}"`);
const sel = () => get(() => document.querySelector('.nav-sel')?.innerText.trim().split('\n')[0] ?? null);
assert.match(await sel(), /Resume/);
for (let i = 0; i < 8; i++) { if ((await sel() || '').includes('Overall strength')) break; await tap('Down'); }
assert.match(await sel(), /Overall strength/, 'D-pad down reaches a setting');
const before = await get(() => window.__hero.tuning.get('fx.rumbleScale'));
await tap('Left'); const after = await get(() => window.__hero.tuning.get('fx.rumbleScale'));
assert.ok(after < before, `D-pad left lowers the strength (${before} -> ${after})`);
await tap('Right'); await tap('Right'); assert.ok(await get(() => window.__hero.tuning.get('fx.rumbleScale')) > after, 'D-pad right raises it');
await get(() => window.__hero.tuning.set('fx.rumbleScale', 1));
// a toggle flips with A; a trigger setting reaches the effect
for (let i = 0; i < 20; i++) { if ((await sel() || '').includes('Shotgun 1st barrel')) break; await tap('Down'); }
const s0 = await get(() => window.__hero.tuning.get('trig.strength')); await tap('Right');
assert.equal(await get(() => window.__hero.tuning.get('trig.strength')), s0 + 1);
// the paused game does not move
const pos = await get(() => ({ ...window.__hero.player }));
await pad({ axes: [0.9, 0] }); await page.waitForTimeout(300); await pad({ axes: [0, 0] });
assert.equal(await get(() => window.__hero.player.x), pos.x, 'the hero stays put while paused');
if (shots) await page.screenshot({ path: shots + '-pause.png' });
await tap('B');
assert.deepEqual(await vis(), [], 'B resumes and clears the menu');
assert.equal(await get(() => document.body.classList.contains('paused')), false);

assert.equal(errors.length, 0, errors.join('\n'));
console.log('pause-hud: ok');
await close();
