# Blob shooter: iteration plan

A Minigore-style arena shooter, played mainly with a controller, starring a
friendlier blob armed with a shotgun. Built one mechanic at a time. Each
iteration ends with a build you play and sign off before the next one starts.

Research behind every decision: `docs/minigore-research.md`.

## How each iteration runs

1. **Mechanic brief.** Half a page: what Minigore did (with its source), what
   we keep, what we change, the feel we're aiming for, the tuning knobs, and
   the checks you'll run with the controller.
2. **Build only that mechanic.** In a plain test arena when the art would get
   in the way of judging feel.
3. **My checks before you see it.** Automated tests for the maths (deadzones,
   spread, damage), a headless run for errors and frame time, screenshots,
   and bot runs where behaviour matters.
4. **You playtest.** I publish the build with a short checklist. An in-game
   tuning panel lets you change values live with the controller in hand, so
   you can tell me "speed 7.2 felt right" instead of "a bit faster".
5. **Tune, then lock.** I apply your feedback, commit the locked values with
   a note on why, and only then move on.

Nothing from a later iteration gets built early, even if it's tempting.

## Iterations

### 0. Controller lab  (built, signed off pending real controller)
Goal: the controller works and the sticks feel right before anything else
exists.
- Read any standard controller in the browser (Xbox, PlayStation, Switch Pro)
  and show which one is connected.
- Radial deadzone, outer deadzone and response curve for each stick, with a
  live visualizer of raw and processed input.
- Fixed 120 Hz simulation, frame-time readout, tuning panel framework,
  keyboard and mouse fallback.
- **Risk checked here first:** a published page runs inside a frame, and
  browsers can block controllers in frames. If it's blocked, you'll run
  builds locally with one command instead.
- You check: the controller is detected, sticks have no drift, small
  movements register, full push reads as full.

### 1. The hero and movement  (signed off: all three designs kept)
Goal: moving around feels crisp before there's anything to shoot.
- Character design first: three friendly blob concepts with a shotgun,
  rendered in-engine as turntables. You pick one or mix them.
- Twin-stick body logic: legs follow the left stick, upper body and gun
  follow the right stick, smooth hand-off when only one stick is used.
- Acceleration, braking, turn response, and wall sliding against simple
  blocks.
- Procedural squash-and-stretch, idle and footstep motion, following
  Minigore's rule that idle, hit and death motion are procedural.
- Camera: three-quarter top-down, with a small lead toward where you aim.
- Avoid the MG2 "snail pace" complaint: start fast and tune down.
- You check: weaving between blocks, stop-and-go, quick reversals.

### 2. Aiming and the shotgun  (built, awaiting your feel numbers)
Goal: one shotgun blast feels great against static targets.
- Aim line or reticle, and aim assist for controller with an on/off option
  (MG2 had auto-aim on by default).
- Firing control decided by your answer below. Pellet spread and range
  falloff, pump or double-barrel rhythm, reload.
- Feel layer: recoil push on the player, camera kick, muzzle flash, shell
  ejection, rumble on supported controllers, sound.
- Target dummies with procedural hit reactions so you can judge spread.
- You check: hitting moving and still targets, close vs far blasts, rhythm.

### 3. First enemy, hit feedback, health
Goal: one enemy type that's fun to shoot, in a friendly tone.
- Our own critter, not a copy of Minigore's furries. It uses the same tuning
  parameters Mountain Sheep used: speed, turning radius, attack radius, size,
  damage, health.
- Size tiers that split when shot, our take on the nesting-doll furries.
- Knockback, brief hit-pause, flash, procedural hit and death reactions, and
  a splat that matches the tone you pick below.
- Player health: hearts, a lose-your-hat warning on the first hit,
  invulnerability flicker, death and respawn.
- You check: shotgun vs swarm feel, knockback strength, reading damage.

### 4. Horde and spawning
Goal: dangerous crowds without cheap deaths.
- Spawn patterns (circle, line, box) and entrances (pop out of the ground,
  drop from above), modelled on MG2's wave system.
- A difficulty ramp that starts quicker than Minigore's slow Normal.
- Off-screen threat indicators and clear spawn warnings, fixing Minigore's
  "hidden enemies" complaint.
- Crowd steering so packs don't stack, and performance with 100+ enemies.
- You check: a 3-minute run, whether deaths ever feel unfair.

### 5. The world
Goal: the storybook look, without hurting readability.
- One painted arena: ground, props, cover, lighting mood.
- Crates that burst and drop ammo or pickups.
- Readability rules: splats and particles fade before they hide the hero,
  and the hero always has a contrast outline or highlight (MG2's "poor
  visibility" complaint).
- If a model needs real modelling (the hero most likely), I give you
  step-by-step Blender instructions and you build it locally, as you asked.

### 6. Power-ups, beast mode, scoring
Goal: the high moments.
- Our version of clovers: collectibles that fill toward a transformation,
  timed, invincible, with a warning before it ends (Minigore's "reverting
  while surrounded" death was a known pain point).
- Limited-ammo weapon pickups, possibly dual-wield.
- Score with kill multipliers and combos.

### 7. Roster and the full run
Goal: a complete loop from start to game over.
- 3-4 more enemy types inspired by Minigore's roles: a fast runner, a
  chain-reacting bomb, a lurker, and one boss.
- Lives, game over, instant retry, best score.

### 8. Long-term loop and polish
Goal: decide what keeps you coming back.
- Choose between Minigore 1 style (one arena, survive, high score, unlock
  characters with kills) and Minigore 2 style (levels, coins, shop,
  challenges). We decide this with the game in hand, not now.
- Controller-navigable menus, audio and music pass, settings.

## Input policy (applies to every iteration)

- Controller is the primary target. Keyboard and mouse stay supported as a
  standby so any build can be played without one: WASD moves, the mouse aims at
  the cursor, left click fires, a controller takes over when it is used.
- Every mechanic reads input through one shared snapshot (move, aim, fire), so
  nothing in the game knows which device is in use.
- Mouse aim is an exact direction and ignores deadzones. Keyboard movement is
  digital by nature, so stick-feel tuning only judges the controller.

## Technical setup

- Web game, three.js, plain ES modules split into files (input, player,
  weapons, enemies, world, effects). No build step.
- A git repo with one commit per locked iteration.
- Builds published as private pages, with a local fallback if the browser
  blocks the controller in a frame.
- Sound is synthesised to start. If we want recorded sounds or music later,
  I'll check what I can download and tell you if I can't.

## Decisions needed before Iteration 0

1. **Firing:** Minigore fires whenever the right stick is pushed. On a
   controller, a trigger is the usual choice. Recommendation: right stick
   aims, right trigger fires, with Minigore-style "push to fire" as an
   option.
2. **Tone of hits:** "friendlier" probably means no blood. Recommendation:
   paint-like goo splats and puffs, which keep the punch without gore.
3. **Controller and browser:** which controller you'll use, and on which
   browser.
