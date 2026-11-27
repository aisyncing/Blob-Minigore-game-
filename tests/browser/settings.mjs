// Finding 13: change shotgun damage in the game, reset the lab on the same origin, reopen the game: the damage must survive.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium, PAD_SHIM } from './harness.mjs';
const server = http.createServer((q, r) => { const f = q.url.includes('lab') ? 'dist/index.html' : 'dist/hero.html'; r.setHeader('content-type', 'text/html'); r.end(readFileSync(f)); }).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(), ctx = await browser.newContext(), errors = [];
const open = async (path, hook) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(String(e))); await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await p.addInitScript(PAD_SHIM); await p.goto(base + path); await p.waitForFunction(h => window[h], hook); return p; };

let game = await open('/game', '__hero');
const base0 = await game.evaluate(() => __hero.tuning.get('gun.damage'));
await game.evaluate(() => { __hero.tuning.set('gun.damage', 33); __hero.tuning.set('left.inner', 0.31); });     // a game setting and a stick setting the lab also shows
await game.close();

const lab = await open('/lab', '__lab');
assert.equal(await lab.evaluate(() => __lab.tuning.get('left.inner')), 0.31, 'the lab sees the stick setting');
await lab.evaluate(() => document.querySelector('#bReset').click());
assert.equal(await lab.evaluate(() => __lab.tuning.get('left.inner')), 0.12, 'the lab reset its own settings');
assert.equal(await lab.evaluate(() => __lab.tuning.get('gun.damage')), 33, 'and left the game setting in memory');
await lab.close();

game = await open('/game', '__hero');
assert.equal(await game.evaluate(() => __hero.tuning.get('gun.damage')), 33, 'reopened game still has the chosen damage');
assert.notEqual(base0, 33);
assert.equal(await game.evaluate(() => __hero.tuning.get('left.inner')), 0.12, 'and the reset stick setting');
// the game's own "Reset all" resets the game
await game.evaluate(() => document.querySelector('#bReset').click());
assert.equal(await game.evaluate(() => __hero.tuning.get('gun.damage')), base0);
assert.deepEqual(errors.filter(e => !/ERR_FAILED/.test(e)), []);
await browser.close(); server.close(); console.log('settings: all passed (damage 33 survived a lab reset; stick setting reset)');
