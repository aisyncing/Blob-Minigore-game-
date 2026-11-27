// Finding 16: the Play button names the selected hero immediately and launches that hero, for every selection method.
import assert from 'node:assert/strict';
import { openGame } from './harness.mjs';
const NAMES = ['Gumdrop', 'Sprout', 'Marshmallow'];
const label = p => p.evaluate(() => document.querySelector('#bMode').textContent);
const METHODS = {
  'card click': async (g, i) => g.page.click(`#cards .card:nth-child(${i + 1})`),
  'keyboard 1/2/3': async (g, i) => g.page.keyboard.press(`Digit${i + 1}`),
  'controller d-pad / bumpers': async (g, i) => { const cur = await g.page.evaluate(() => __hero.state().selected); for (let n = 0; n < (i - cur + 3) % 3; n++) await g.tap('Right'); },
};
const LAUNCH = { 'Play button': g => g.page.click('#bMode'), 'Enter key': g => g.page.keyboard.press('Enter'), 'controller A': g => g.tap('A') };
for (const [method, select] of Object.entries(METHODS)) for (const [launchName, launch] of Object.entries(LAUNCH)) for (const target of [0, 1, 2]) {
  const g = await openGame(); const { page } = g;
  await page.keyboard.press('KeyZ'); await page.waitForTimeout(50);              // dismiss the title overlay
  // go to a different hero first so the target is a real change, then select the target
  await select(g, (target + 1) % 3); await select(g, target); await page.waitForTimeout(80);
  assert.equal(await label(page), `Play as ${NAMES[target]}`, `${method} -> ${NAMES[target]}: label updates immediately`);
  await launch(g); await page.waitForTimeout(150);
  const s = await page.evaluate(() => ({ ...__hero.state(), vis: __hero.heroes.map(h => h.root.visible), btn: document.querySelector('#bMode').textContent }));
  assert.equal(s.mode, 'play', `${method} + ${launchName}: play started`); assert.equal(s.selected, target); assert.deepEqual(s.vis, [0, 1, 2].map(k => k === target), `${NAMES[target]} is the visible hero`);
  assert.equal(s.btn, 'Compare designs'); assert.deepEqual(g.errors, []); await g.close();
}
console.log('hero-select: all passed (3 selection methods x 3 launch methods x 3 heroes)');
