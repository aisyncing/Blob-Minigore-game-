# Blob shooter

A Minigore-inspired arena shooter for controller, starring a friendly blob with a shotgun.
Built one mechanic at a time. See `docs/iteration-plan.md` and `docs/minigore-research.md`.

## Run it
- Easiest: open one of these in Chrome or Edge (each is a single self-contained file):
  - `dist/hero.html`  the game (Iterations 1 and 2: pick a hero, play the arena, shoot the training range)
  - `dist/index.html` the controller lab (Iteration 0)
- Or: `npm install && npm run build && npm run serve`, then open http://localhost:8080
- Tests: `npm test`

## Iteration 2: Aiming and the shotgun (current)
In the arena the mouse aims (or the right stick, with optional aim help), hold left click / right trigger to fire,
`R` reloads. Training range in the north-west corner: still dummies, patrolling dummies, a pattern board.
The Tuning panel has a Shotgun, Aim and Feedback section; **Last shot** shows pellets hit and damage.
See `docs/iteration-2-brief.md`.

## Iteration 1: Hero and movement
Compare the three designs, pick one, then play in the movement arena. WASD moves, the mouse aims,
`C` toggles compare/play, `1 2 3` switch design. The Tuning panel has live sliders and Snappy / Balanced /
Floaty presets; **Copy my settings** gives numbers to paste back so they can be locked in.
See `docs/iteration-1-brief.md`.

## Iteration 0: Controller lab
Plug in or pair a controller and press any button (browsers hide a controller until then).
No controller? Keyboard and mouse work as a standby: WASD moves, the mouse aims at the cursor, hold left click (or Space) to fire, arrow keys aim when the mouse is outside the arena. A controller takes over the moment you press a button on it. Tune the sliders, then press **Copy my settings**
and paste the numbers back so they can be locked into the game.

Browsers can block controllers inside embedded pages (iframes). If the status chip says
"Controller access blocked", open the standalone file instead.
