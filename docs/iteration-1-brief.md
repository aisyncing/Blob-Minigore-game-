# Iteration 1 brief: the hero and movement

## What Minigore did (and where we know it from)
- Two sticks: left moves, right aims and fires. Reviewers: controls "work beautifully";
  "kick-back on the gun". [Review]
- Early tuning problem: the character "completely stops moving when my thumb slips over
  the stick's area" (Kimmo, dev blog May 2009). Lesson: movement must never feel
  interrupted by input quirks. [Dev]
- MG2 complaint: the hero moved at a "frustrating snail pace"; a later update added
  "faster player movement". [Review][Store] We start fast and let you tune down.
- Characters are blocky, storybook, and read from above by their hat/silhouette.
  John Gore loses his hat on the first hit. [Dev][Review] Each design below has a
  head accessory reserved for that "first hit" tell in Iteration 3.
- Animation: walk and attack are hand-made, idle/hit/death are procedural. [Dev]
  We do all of it procedurally: leg swing from distance walked, squash and lean from
  acceleration, secondary motion on the head accessory.
- Camera: three-quarter top-down. [Dev][Review]

## Our version
**Three friendly blob designs with a shotgun** (you choose, or mix parts):
1. *Gumdrop*: pink melty dome, explorer hat, tiny feet under the skirt.
2. *Sprout*: mint bean, boots, a leaf that flutters, neckerchief.
3. *Marshmallow*: cream rounded cube, goggles, bobbing antenna.
They share one rig, so whichever you pick animates identically.

**Twin-stick body.** Legs face where you walk, the upper body and gun face where you
aim. With no aim input the upper body follows the walk direction.

**Movement.** Velocity chases the stick with three separate rates, because they are
three different feels: `accel` (speeding up), `brake` (letting go), `turnAccel`
(reversing). The stick's size sets the target speed, so a gentle push walks slowly.
Walls and props are slid along, never stuck to. The simulation runs at a fixed 120 Hz,
so feel does not change with frame rate.

**Procedural animation.** Feet swing by distance walked (one step per `anim.stepLen`),
body bobs on each step, squash-and-stretch springs react to acceleration, the body
leans into the direction of travel, the head accessory lags and wobbles, blinking and
breathing at idle, dust puffs on footsteps and hard direction changes.

**Camera.** Three-quarter top-down, follows with smoothing and leans toward where you
aim, so you see more of what you are about to shoot.

## Tuning knobs (all live in the panel, saved in your browser)
`move.maxSpeed`, `move.accel`, `move.brake`, `move.turnAccel`, `aim.follow`,
`legs.follow`, `anim.squash`, `anim.lean`, `anim.bob`, `anim.stepLen`, `cam.dist`,
`cam.tilt`, `cam.follow`, `cam.velLead`, `cam.aimLead`, plus the Iteration 0 deadzones.
Starting values: top speed 7.5 u/s, time to top speed about 0.11 s, stop time about
0.13 s (the panel shows these derived numbers live).

## Checks I ran before you see it
Unit tests: acceleration reaches top speed in the predicted time, never exceeds it
(including diagonals), reversal beats plain braking, a gentle push gives a proportional
speed, collisions never leave the hero inside a wall (randomised, 200k steps), sliding
keeps the tangential speed. Headless runs: no console errors, random-walk bot into every
obstacle with no penetration, legs and aim turn independently, design switching works.

## What you check with the keyboard and mouse (or controller)
1. Compare the three designs, pick one (or tell me which parts to mix).
2. Start, stop, reverse. Does it feel crisp, or sluggish/slippery? Tune the three rates.
3. Slalom the posts on the left, run the zig-zag corridor on the right.
4. Strafe: walk one way while aiming another. Do the legs and body read clearly?
5. Brush along walls and corners. It should slide, never stick.
6. Camera: is the lead toward your aim helpful or nauseating?

## Out of scope here
Shooting, recoil, ammo, enemies, health, hat-loss. (Iterations 2 and 3.)
