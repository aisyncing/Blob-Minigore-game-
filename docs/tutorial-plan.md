# First-run tutorial: plan and phase log

Two-step lesson before Wave 1: (1) left stick moves, (2) R2 fires. Gameplay runs in slow motion while a step waits for the player.
Wave balance is NOT part of this work (wave 1 being hard is a separate follow-up: edit `waveSpec`/`createDirector` options in `src/game/waves.js`; the tutorial only delays the director and does not depend on its numbers).

## Decisions (defaults, change in `RULES.tutorial` / main.js)
- D1 shows on the first survival run after each page load; retry after game over skips it (`tutorial.begin()` ignores a finished lesson). Persisting across loads = one localStorage flag, later.
- D2 keyboard/mouse players get the same card with key art (WASD, then click); completes the same way.
- D3 slow = 0.4x, 0.15 s ease. D4 practice range has no tutorial. D5 no skip button.

## Design
- `src/game/tutorial.js` (pure): stages `off -> move -> gap -> shoot -> done`. `update(realDt, {moveMag, gunReady})`, `onShot()`, `timeScale`, `active`, `begin/cancel/skip`.
- Slow motion = `dt = realDt * tutorial.timeScale` in `frame()` (main.js). Input, menus, camera, haptics and the HTML prompt run on real time.
- `timeScale` is exactly 1 whenever the lesson is not waiting; `cancel()` (menu, practice, restart) sets it to 1 at once, so speed cannot get stuck.
- Movement counts only when `snap.move.mag >= 0.5` (already past the deadzone) for 0.2 real seconds in a row. The stick is never taken over.
- R2: the tutorial never fires. `simStep` calls `tutorial.onShot()` where the gun's own `shot` event calls `shoot()`. The gap waits for a loaded, non-reloading gun.
- Wave 1 held back: `director.step` only runs when `!tutorial.active`; its normal 1.5 s countdown then plays.
- Test escape hatch: `?tutorial=off` URL flag (golden.mjs and game-run.mjs use it; practice-mode tests are unaffected).

## Phases
1. Logic + unit tests (`tutorial.js`, `RULES.tutorial`, `tests/tutorial.test.mjs`). DONE.
2. DONE. Wire into main.js (frame dt scale, director gate, onShot, begin/cancel, `?tutorial=off`, `__hero.tutorial`), `tests/browser/tutorial.mjs`; golden must still match with the flag off.
3. Prompt view: `src/hero/tutorialView.js` + `#tutorial` markup in page.js + CSS (inline SVG pad, stick circling / R2 press), positioned under the hero (project player position like hud.js arrows), keyboard art variant, phone-width scaling.
4. Full regression (`npm test`, build, browser suite, golden, real-time playtest), HANDOFF.md update, send `dist/hero.html`. Needs the user's real DualSense playtest.

## Phase log
- Phase 1: added `RULES.tutorial`, `src/game/tutorial.js`, `tests/tutorial.test.mjs` (9 tests; mutation-checked). `npm test` 203/203 pass. No game code touched.
- Phase 2: main.js wiring (`tutorial` created next to `run`; `frame()` dt = realDt * timeScale and `tutorial.update` after `input.sample`; `simStep` gates `director.step` on `!tutorial.active` and calls `tutorial.onShot()` beside `shoot()`; `startRun` cancels then begins for survival; `setMode('compare')` cancels; `?tutorial=off`; `__hero.tutorial`). `openGame` takes `query`; `golden.mjs` always passes `?tutorial=off`; `game-run.mjs` uses it; `tests/browser/tutorial.mjs` added to `test:browser`.
  Results: golden identical to the pre-tutorial build (12 checkpoints, state + pixels); `npm test` 203/203; tutorial.mjs, game-run.mjs and the rest of the browser suite pass; haptics-feel reload-beat check is the known flaky one (2/3 on rerun). The test is mutation-checked (removing the wave gate fails it).
  Note: headless frame rate is low, so tests assert on deterministic state (`director.state.t === 1.5`), not on elapsed real time.
