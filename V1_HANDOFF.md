# V1 Handoff: Blob Shooter -> Blob Minigore V2

V1 source: `/home/user/blob-shooter-fixed` (untouched). V2 is a fork on branch `v2`.
Session that built V1: `session_01PeqdLvbWdZ1KyWmCKyhzbp`.

## What the game is
A Minigore-style 3D top-down arena shooter for the web, played mainly with a controller (keyboard/mouse as standby). Friendly blob heroes (Gumdrop, Sprout, Marshmallow) with a double-barrel shotgun. Arms and reload animation are authored in Blender. All tuning values are our own guesses until the user supplies reference footage.

## Architecture
- Stack: three.js r187, esbuild single-file builds, node:test unit tests, Playwright browser tests (at /opt/node-tools/node_modules).
- Builds (`npm run build`): `dist/hero.html` (the game, standalone, double-click), `dist/index.html` (tuning lab), `dist/hero-artifact.html` (fragment for publishing as an Artifact).
- Fixed 120 Hz simulation, separate from rendering.
- `src/hero/` game scene (`main.js` wiring, `hero.js` rig and reload visuals, `dummy.js` target dummy, `hero.css`).
- `src/lab/` tuning lab (stick/trigger calibration, drift session UI, scoped reset).
- `src/game/` rules: `shotgun.js` state machine (reload duration captured at start, spent-chamber mask, capacity 1 uses barrel 0), `blast.js` (`launchBlast`: resolves player-to-muzzle segment against targets/walls before spawning pellets), `assist.js` (`chooseAim`, auto-aim), `arena.js`.
- `src/input/`: `source.js` (one snapshot from pad/keyboard/mouse; tap latch; deadzone-aware pad-idle), `process.js` (stick shaping, trigger hysteresis, drift session), `pad.js` (Gamepad wrapper), `menu.js` (edge-triggered menu navigation), `haptics.js`, `dualsense.js`.
- `src/engine/spring.js` sub-stepped spring (stable dummy respawn). `src/tuning.js` localStorage store with merge writes and scoped reset.
- `blender/`: bpy scripts. Entry `build_and_export.py [out.glb] [--max-extension X]` runs the reach check first and exits 1 (writing nothing) if exceeded. Needs `PYTHONPATH=/home/user/bl-libs`. Worst reach is 92.2% of arm length (limit 97%). Export is not byte-deterministic; the shipped `src/assets/hero_rig.glb` was not replaced.
- Packaging: `npm run package` (tools/package.sh) builds the ZIP. Not refreshed since before the PS5 work.

## Completed
- All 17 code-review findings fixed: controller-only startup, auto-aim while strafing, point-blank misses, lost taps, stick drift blocking keyboard, unstable dummy respawn, muzzle/pellet alignment, reset range, drift calibration, trigger chatter, reload time changing mid-reload, one-shell reload visuals, lab reset scope, portable Blender export, README/launch instructions, Play button hero name, enforced Blender reach check.
- PS5 feel: per-barrel rumble (strong first barrel, lighter second, reload clicks, dry fire, kill) via the Gamepad API; adaptive trigger plans (wall plus click on the second barrel, locked when empty) via WebHID; "Controller feel (PS5)" panel with test buttons.
- Tests: 174 unit tests pass. Browser tests in `tests/browser/` (controller-startup, e2e-controller, aim-and-shot, input-fixes, range, reload, hero-select, settings, haptics-feel) pass individually.

## Known bugs / unverified
- Adaptive triggers are NOT confirmed on hardware. The user's DualSense (Bluetooth, Windows) returned "Failed to write the report". Latest code reads the controller's declared output reports, tries Bluetooth layouts A then B (or USB), and shows diagnostics. Bluetooth header layouts disagree between sources. The USB cable is the most reliable path. Waiting on the user's exact status message.
- WebHID is blocked inside the embedded Artifact (permissions policy), so triggers only work in standalone `dist/hero.html` opened in Chrome/Edge.
- Everything was verified with a simulated controller; no physical-hardware checks.
- The combined browser suite was never run in one go (user stopped it as too slow). The compact 17-row checklist and a refreshed ZIP were never delivered or requested again.
- Headless rendering is slow (about 4 to 10 fps), so browser tests freeze rAF and drive `__hero.simStep`.

## Design decisions
- Controller-first. Menus use edge-triggered pad actions (B returns to the hero screen).
- Keyboard works whenever the pad is idle after deadzones; a drifting stick cannot lock it out.
- Effective trigger thresholds with a 0.02 gap; the release point is press minus 0.02 (fixes chatter).
- Taps (Space/click) are latched until a simulation step consumes them.
- Shots snap the visible aim at fire time and use a muzzle-origin ray check so point-blank targets are hit.
- Reload progress comes from the shotgun state, never from live tuning values.
- Motors are left to the Gamepad API; WebHID reports set triggers only (flags 0x04/0x08), so rumble keeps working.
- The tuning store merge-writes, and each page's reset only touches its own keys.
- Blender scripts use no hard-coded paths and fail loudly if arms over-extend.

## Working preferences (the user's)
- After ANY change to the game, send the playable link (publish `dist/hero-artifact.html` as an Artifact and send standalone `dist/hero.html`).
- Prefer a quick check (build, open once, confirm no errors) over long test runs.
- No ZIP unless asked.
