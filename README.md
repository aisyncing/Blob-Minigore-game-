# Blob Minigore V2

> Taking this project over? Read **HANDOFF.md** first.

Survive waves of furry critters with a double-barrel shotgun. Controller first, keyboard and mouse as backup. Open `dist/hero.html` in Chrome or Edge.

A Minigore-inspired arena shooter for controller (keyboard and mouse work too), starring a friendly blob with a shotgun.
Built one mechanic at a time. See `docs/iteration-plan.md` and `docs/minigore-research.md`.

## Play it (no install)

Double-click **`dist/hero.html`**. It is one self-contained file, so it opens straight into the game in Chrome or Edge.
Pick a hero, press Play, shoot the dummies in the north-west corner.

- **Keyboard and mouse:** click to start, `1` `2` `3` choose a hero, `Enter` plays, `WASD` moves, the mouse aims, hold left click or `Space` to fire, `R` reloads.
- **Controller:** press any button to start, D-pad or `LB`/`RB` choose a hero, `A` plays, left stick moves, right stick aims, `RT` fires, `X` reloads, `B` goes back to the hero screen.
- Browsers hide a controller until you press a button on it, and they only report it to the page you are looking at.
  If a controller is not seen, click the page once and press a button. Pages shown inside another page (an embed) can be blocked from reading controllers; open the file directly instead.
- The page asks for one web font; without internet it falls back to a system font and everything else works.

## Controller feel (PS5 DualSense)

**Rumble** works with any controller the browser can vibrate. The first barrel thumps hard, the second is lighter, each reload beat has its own click (the barrels snapping shut is the clearest), pulling an empty gun gives a small dry tick, and a dummy popping gives a small bump. "Rumble strength" in the Tuning panel scales all of it.

**Adaptive triggers** (a resistance wall that breaks with a click where the shot fires, a stiffer wall for the second barrel, a locked trigger when empty or reloading, a short buzz after each shot) need a DualSense and a Chromium browser (Chrome or Edge):
1. Open the Tuning panel, then **Controller feel (PS5)**.
2. Plug the controller in with a USB cable (best), press **Connect adaptive triggers**, and pick the DualSense in the list. A controller you allowed once reconnects by itself next time.
3. Use the **Trigger tests** to feel each effect while holding RT. Over Bluetooth, if nothing happens, try *Bluetooth layout A*, then *B*.
4. "PS5 adaptive triggers" in the Tuning panel switches the feature off. The triggers return to normal in menus and when you close the page.

The trigger commands are checked by unit tests and a simulated controller, not on real hardware. The deeper "voice-coil" haptics cannot be driven from a browser.

## The controller lab (separate page)

Open **`dist/index.html`** for the Iteration 0 test bench: live stick and trigger readouts, deadzone and curve sliders, drift measurement, rumble test.
It is a different page from the game; it does not start the game.

## Build it yourself

```bash
npm install
npm run build       # writes dist/hero.html (the game) and dist/index.html (the lab)
npm run serve       # then open http://localhost:8080/hero.html (game) or http://localhost:8080/index.html (lab)
```

`http://localhost:8080/` on its own shows the lab, not the game.

## Tests

```bash
npm test                # unit tests (node)
npm run test:browser    # browser tests with a simulated controller (needs Playwright with Chromium)
```

## Packaging

`npm run package` builds, then writes `blob-minigore-v2.zip` containing the source plus the built pages in `dist/`.

## Blender (arms, hands and shotgun)

The rig in `src/assets/hero_rig.glb` is authored by the scripts in `blender/`. You only need this to change the animation; the game does not need Blender.
See `blender/README.md`.

## Iteration 2: Aiming and the shotgun (current)
In the arena the mouse aims (or the right stick, with optional aim help), hold left click / right trigger to fire,
`R` reloads. Training range in the north-west corner: still dummies, patrolling dummies, a pattern board.
The Tuning panel has a Shotgun, Aim and Feedback section; **Last shot** shows pellets hit and damage.
See `docs/iteration-2-brief.md`.

## Iteration 1: Hero and movement
Compare the three designs, pick one, then play in the movement arena. The Tuning panel has live sliders and Snappy / Balanced /
Floaty presets; **Copy my settings** gives numbers to paste back so they can be locked in.
See `docs/iteration-1-brief.md`.

## Iteration 0: Controller lab
Plug in or pair a controller and press any button. No controller? Keyboard and mouse work as a standby.
Tune the sliders, then press **Copy my settings** and paste the numbers back so they can be locked into the game.
