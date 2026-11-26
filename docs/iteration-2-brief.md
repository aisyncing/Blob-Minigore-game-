# Iteration 2 brief: aiming and the shotgun

All three heroes stay selectable (your call). Nothing hero-specific here: the gun is shared.

## What Minigore did (and where we know it from)
- Shotgun: double-barrelled, limited ammo, dropped from crates (VideoGamer, PocketGamer). [Review]
- A patch gave the shotgun a "faster firing rate"; another added "weapon recoil effects for all
  characters", "unique muzzle flash per weapon", and ejected "bullet shells". [Dev blog]
- Reviewers: "kick-back on the gun". One said the shotgun *upgrade* "absolutely sucks": a shotgun
  must feel like a real step up in power, not a sidegrade. [Review]
- Auto-aim: an option that "puts John Gore in charge of the guns" (2010); MG2 ships it on by default
  ("swing and take a shot at the closest threat"), turning it off "saves ammo". [Dev][Review]
- Firing is "push the right stick": no separate fire button. [Review]
- MG2 complaint: gory chaos hides the hero. Our muzzle flash and particles must fade fast. [Review]
- No source gives pellet counts, spread or damage. Those are ours to tune.

## Our version
**Double barrel.** Two shells. Each pull fires one barrel (alternating), hold to repeat at an interval.
After the second shell the gun breaks open, ejects two casings and reloads, then you are ready.
`R` / controller X reloads early. A trigger pull in the last 0.12 s of cooldown or reload is
buffered, so you never lose a shot to being a hair early.

**Pellets, not hitscan.** Each blast is N pellets (default 9) that fly at 55 u/s and are swept
against everything every step, so they can't tunnel. Spread is spaced out across the cone with
jitter (even coverage, no empty gaps or clumps), with an optional centre bias. Damage per pellet
is full close up and falls off to a floor at max range, so a point-blank blast is lethal and a
long-range one only chips. Walls and props stop pellets.

**Feel layer.** Recoil pushes the hero back, the gun kicks, the camera kicks, a muzzle flash (cone,
light, sparks, smoke), shells eject on reload and bounce, short hit-pause on kills, controller
rumble, and synthesized sound (blast, reload clicks, hit thud, pop).

**Aim.** Mouse: exact. Controller: Manual, Assist (bends your aim toward a target near your line,
never through a wall) or Auto-aim (aims at the nearest visible target when the stick is idle).
A faint cone shows spread and range, with a brighter inner zone where damage is full.

**Training range** (north-west corner of the arena): a row of still dummies, three dummies patrolling
a loop, and a pattern board that keeps pellet marks. Dummies show health, react (squash, tilt, flash),
pop when killed, and come back. Damage numbers show per-shot totals so tuning is visible.

## Tuning knobs
`gun.pellets`, `gun.spread`, `gun.bias`, `gun.damage`, `gun.range`, `gun.falloffStart`,
`gun.minDamage`, `gun.pelletSpeed`, `gun.interval`, `gun.reload`, `gun.capacity`, `gun.recoil`,
`gun.camKick`, `gun.hitPause`, `assist.mode`, `assist.cone`, `assist.strength`, rumble / numbers /
screen-shake toggles. A Last-shot readout shows pellets hit, damage and distance.

## Checks I ran before you see it
Unit tests for: segment-vs-shape maths, pellets never tunnelling, wall blocking, damage falloff,
pellet pattern coverage and spread bounds, the fire/reload state machine (rhythm, buffering,
auto-reload, early reload), aim assist (bends toward targets, never through walls, never when no
target), target health/respawn/patrol. Headless runs: fire a blast point-blank and at range and
compare damage, confirm walls stop pellets, run the whole fire/reload cycle, no console errors.

## What you check
1. Point blank vs far: does a close blast feel like a shotgun, and a far one weak but not useless?
2. Rhythm: two shots then reload. Is the pause punishing or satisfying? Tune `reload` and `interval`.
3. Spread: is the cone fair? Do the pattern-board marks look like a good shotgun pattern?
4. Moving targets: can you lead the patrolling dummies with the pellet speed?
5. Recoil, camera kick, flash and sound: punchy, or too much? (Each can be turned down.)
6. If you ever use a controller: Manual vs Assist vs Auto.

## Out of scope here
Real enemies, damage to the hero, ammo pickups, other weapons, scoring (Iteration 3 onward).

## Revision after review (reload, shot detail, polish)
- **Reload is now a real sequence** (timing table in `src/hero/reload.js`, unit tested): barrels break open on a hinge and
  the gun is pushed out in front of the body so the breech is never hidden; both spent shells eject from the chambers and
  tumble; the free hand goes to a belt of spare shells at the waist, grabs two, carries them to the breech and loads them;
  the barrels snap shut; the hand returns to the forend. Sounds hang off the same beats. Capacity is limited to 1-2 shells
  so the visuals always match the ammo.
- **Shot detail:** each pellet is a small lead ball with a tapered trail that cools from white-orange as it loses energy; a red
  wad follows the pellets out of the muzzle and drops.
- **Honesty:** every tuning value is labelled "our guess". Minigore's real numbers are not published; matching them needs reference footage.
- **Bugs fixed:** switching design mid-reload replayed the reload's sounds and casings; sliders, dropdowns and section
  headings kept keyboard focus (arrow keys and Space acted on them instead of the game); compare-mode hint text overlapped a
  card; heroes were cut off on narrow screens; the phone title bar collided with the Tuning button.
