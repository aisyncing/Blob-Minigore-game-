// JavaScript cost of one game frame in the real page (simulation + animation + HUD + effects), with the WebGL draw stubbed out so the
// number is not dominated by the headless software renderer. Survival mode, a wave-10 crowd, trigger held.
//   node tools/perf-browser.mjs
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, PAD_SHIM } from '../tests/browser/harness.mjs';

const STEPPER = `(() => { const realNow = performance.now.bind(performance); window.__realNow = realNow;
  let s = 99; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let clock = 1000, queue = []; performance.now = () => clock;
  window.requestAnimationFrame = f => { queue.push(f); return 1; };
  window.__frames = n => { const out = []; for (let i = 0; i < n; i++) { clock += 1000 / 60; const q = queue; queue = []; const t0 = realNow(); for (const f of q) f(clock); out.push(realNow() - t0); } return out; };
})();`;

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await page.addInitScript(STEPPER); await page.addInitScript(PAD_SHIM);
await page.goto(pathToFileURL(resolve('dist/hero.html')).href);
await page.waitForFunction(() => window.__hero && window.__frames);
const result = await page.evaluate(() => {
  const H = window.__hero; H.stage.render = () => {};
  document.querySelector('#bStart').click(); H.setMode('play'); window.__frames(30);
  H.director.state.wave = 9; H.director.state.phase = 'rest'; H.director.state.t = 0;     // next wave is 10: a big crowd
  window.__padSet({ axes: [0.6, 0, 0, 0], buttons: { RT: 1 } });
  H.health.hit = () => false;                                                              // keep the run alive for the measurement
  window.__frames(900);                                                                    // let the wave arrive
  window.gc?.(); const heap0 = performance.memory.usedJSHeapSize;
  const t0 = window.__realNow(), t = window.__frames(1200), total = window.__realNow() - t0;
  return { critters: H.critters.length, usPerFrameMean: Math.round(total / 1200 * 1000), heapDeltaKB: Math.round((performance.memory.usedJSHeapSize - heap0) / 1024) };
});
console.log(JSON.stringify(result));
await browser.close();
