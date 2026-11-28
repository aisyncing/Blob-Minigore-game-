# Blob Minigore V2: handoff for the next AI

Everything needed to take over this project. Read this first, then `docs/iteration-plan.md` (the roadmap) and `docs/minigore-research.md` (research behind the design).

- **Repo:** https://github.com/aisyncing/Blob-Minigore-game-  (work is on branch `claude/bold-rubin-qa5cd9`; `main` is the older V1 state until that branch is merged)
- **Owner's email for attribution only:** keep personal details out of any external service calls.
- **What it is:** a Minigore-style 3D top-down arena shooter for the web. Controller-first (PS5 DualSense especially), keyboard and mouse as standby. Friendly blob heroes (Gumdrop, Sprout, Marshmallow) with a double-barrel shotgun fight waves of brown Furry enemies.

## Run it
```bash
npm install
npm run build          # dist/hero.html (the game), dist/index.html (controller lab), dist/hero-artifact.html (fragment for embedding)
npm run serve          # http://localhost:8080/hero.html
npm test               # 190 unit tests (node:test), about 1 s
npm run test:browser   # Playwright tests with a simulated controller (slow; headless runs at only 4-10 fps)
```
Players just double-click `dist/hero.html` in Chrome or Edge. It is one self-contained file. WebHID (PS5 adaptive triggers and motor rumble over HID) only works in that standalone file, NOT inside the published embedded Artifact (browsers block WebHID and the Gamepad API in frames).

Playwright is not in package.json; it lives at `/opt/node-tools/node_modules` in the original sandbox. Browser tests accept `?practice` in the URL to start in the training range (the test harness adds it automatically).

## The game as it stands
Flow: **Controller setup screen** (first thing on load) -> **Start** (A or click) -> **hero select** (D-pad/LB/RB or 1/2/3, A or Enter or Play) -> **survival run**.

- **Survival run:** waves of Furries climb out of the ground at pulsing red markers (1.1 s warning, 0.45 s rise, untouchable until out). 5 hearts, about 1.1 s invulnerability after a bite, a heart back every 3 cleared waves. Score with a kill chain multiplier (x1 to x5, +1 per 4 kills, drops after 2.5 s) and a 50 x wave bonus. Best score in localStorage `blobshooter.best`. Game over panel: A/Enter/click to retry (after 0.8 s).
- **Enemies (from `docs/reference/Minigore_2_Brown_Furry_Character_Sheets.pdf`):** tiers `big` (Giant Furry), `mid` (Furry), `small` (Mini Furry) in `src/game/critters.js`. They nest: big -> 2 mid -> 2 small each. Stats: big r1.2 hp64 speed2.5, mid r0.7 hp26 speed3.5, small r0.38 hp11 speed4.7. Chase with limited turn rate, separate from neighbours, slide round walls with a short detour, bite on contact (0.9 s cooldown), knockback from pellets (lighter = further).
- **Waves (`src/game/waves.js`):** wave n = big floor(0.6+0.55n), mid 2+n, small (n-2)*2 from wave 3. Spawn interval shrinks with n; concurrent cap 40. Rest 3.2 s between waves.
- **Edge arrows** point to off-screen critters (nearest 14). **Practice range** button toggles the old training dummies (north-west corner) and turns waves off.
- **Shotgun:** double barrel, 9 pellets, 8 degree spread, 12 damage/pellet with range falloff, 0.28 s between barrels, **0.7 s reload** (was 0.95), recoil shove, camera kick. Auto-aim assist on by default.
- Balance is a first guess: an idle hero dies in about 8 s. Not tuned against real play yet.

## Controller and vibration
- Gamepad API for input (standard mapping). `src/input/menu.js`: edge-triggered; on the setup screen ONLY A starts the game, any other press just wakes the pad.
- **DualSense over WebHID (`src/input/dualsense.js`):** adaptive triggers (weapon wall + click, locked when empty/reloading, kick buzz) AND the two rumble motors are sent in the same output report (flags 0x03 for motors, 0x04/0x08 triggers, body[2]=light motor, body[3]=heavy, body[38]|=0x04). One send path (`queue/flush`) so triggers and motors cannot overwrite each other. Falls back to Gamepad API rumble when WebHID is not connected. **The owner confirmed adaptive triggers and body rumble work over Bluetooth in Chrome.** Bluetooth layouts A/B and USB are selectable.
- **Smart vibration (`src/input/haptics.js`, pure + unit tested):** per-barrel patterns, hit thud scaled by pellets landed, pop on kills, wall bumps, one light patter per footfall of the walk animation (hero.js `onStep`), reload clicks, a `hurt` pattern when bitten. Groups: shoot / reload / walk.
- **Settings (0-10 sliders on the setup screen):** Overall 10, Shooting 6.5, Reloading 3, Walking 5, plus switches for rumble, smart vibration, adaptive triggers. Effective strength = (slider/10)^1.5. The owner reported the motors feel nearly on/off across the slider range. A **Strength ramp** test button (setup screen, "Try the feel") plays 5%..100% so the real response curve can be calibrated; the owner has NOT yet reported its result. If it is flat, calibrate a curve or duty-cycle low values.
- Astro Bot-style walking haptics are voice-coil haptics and cannot be driven from a browser; the footstep patter is the closest approximation.

## UI
- `#focus` is the controller setup screen (connection light, vibration sliders, adaptive-trigger connect, "Try the feel", stick deadzones, Start). The **Controller** top-bar button reopens it.
- Game tuning panel (the **Tuning** button, hidden by default) shows only impactful settings; everything else is in `HIDDEN_IN_GAME` in `src/tuning.js` and keeps its default. An "Advanced" fold holds copy settings, presets, last shot, diagnostics.
- Owner preference: simple UI, no clutter, sliders must visibly change something.

## Code map
- `src/hero/main.js` wiring: page template, loop (fixed 120 Hz sim in `simStep`, separate render), run logic (`startRun/endRun/hurtPlayer/critterDied/spawnCritter`), HUD, arrows, setup screen, tuning panels. `window.__hero` exposes internals for tests.
- `src/hero/hero.js` player rig (Blender-authored arms/shotgun in `src/assets/hero_rig.glb`); `designs.js` the three blobs; `critter.js` procedural Furry geometry (merged, vertex-coloured, one mesh per critter) and `CritterView`; `dummy.js` training dummy; `reload.js`, `gun.js`, `rigAsset.js`.
- `src/game/`: `critters.js`, `waves.js`, `run.js` (health, score), `shotgun.js` (state machine), `blast.js`, `pellets.js`, `ballistics.js`, `assist.js`, `collide.js`, `movement.js`, `arena.js`, `layout.js`, `targets.js`.
- `src/input/`: `source.js`, `process.js`, `pad.js`, `menu.js`, `haptics.js`, `dualsense.js`. `src/engine/`: `stage.js`, `fx.js`, `audio.js` (synthesised sounds), `spring.js`. `src/tuning.js` registry (localStorage `blobshooter.tuning.v1`, merge writes).
- `src/lab/` the separate controller lab page (`dist/index.html`). `blender/` bpy scripts (`build_and_export.py`, reach check; needs `PYTHONPATH=/home/user/bl-libs` in the original sandbox). `tools/build.mjs` esbuild single-file builds. `tests/*.test.mjs` unit, `tests/browser/*.mjs` browser (includes `game-run.mjs` for the survival loop).

## Owner's working preferences
- After ANY change, send the playable link: publish `dist/hero-artifact.html` as an Artifact (https://claude.ai/artifact/M8wSucndZUgpH9AwEN9UBz) and send standalone `dist/hero.html`.
- Prefer quick checks (build, load once, no errors) over long test runs. No ZIP unless asked.
- Wants the real game (waves, furries, health), not a training round. Wants minimal UI and a controller-tuning screen first on load.
- Short, honest status. Do not claim hardware behaviour you could not test.

## Known gaps / next steps
1. Playtest and tune wave balance, enemy stats, hearts; get the owner's feel numbers.
2. Calibrate vibration with the Strength ramp result.
3. Unresolved from the owner: "bring back the shotgun and remove the pistol". No pistol exists in code; the hero already has a double-barrel shotgun. Ask what they see.
4. Roadmap (`docs/iteration-plan.md`): 4 horde polish (spawn patterns, crowd steering at 100+ critters, performance), 5 the world (painted arena, crates dropping pickups, readability), 6 power-ups/beast mode/dual wield, 7 more enemy types (runner, chain-reacting bomb, lurker, boss) and a full run, 8 long-term loop and polish. Furry expressions from the sheet (neutral/attack/hurt) and softer fur are not done.
5. Never verified on hardware beyond the owner's DualSense; the combined browser suite is slow.
6. The shipped `hero_rig.glb` was not regenerated; Blender export is not byte-deterministic.

## Git
Branch `claude/bold-rubin-qa5cd9` holds all work (commits end with a Claude co-author trailer). Do not force-push; merge `main` into it if it diverges. Do not open a pull request unless the owner asks.
