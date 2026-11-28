# Critter rework: plan and phase log

Goals: (1) mids no longer split into smalls (a big still breaks into 2 mids), (2) walking with more detail, (3) a different attack animation per size.
Decisions (owner approved the defaults): 1a mids don't split; 2a attacks get a short readable wind-up; 3a the big slam hits only the player (1 heart, as now).

## Findings
- Rules live in `src/game/critters.js` (`TIERS`, `Critter.step`, `splits`); the look is `src/hero/critter.js` (`buildFurry` merges every body part into ONE vertex-coloured geometry per tier, so limbs cannot move; the only motion is hop / squash / tilt / flash). `main.js` calls `c.splits()` in `critterDied` and `hurtPlayer(c)` when `step()` returns `'attack'` (instant bite on contact, 0.9 s cooldown).
- Draw calls are the bottleneck (render-bound), so the rework must stay one draw call per critter (skinned mesh with bones, not one mesh per limb).

## Phases
1. Split rule (data only). DONE
2. DONE. Skeleton: one SkinnedMesh per tier (bones: root/hips, body, head, arm L/R, foot L/R), rest pose identical to today, hop moved onto the rig. Golden/screenshots identical at rest.
3. Walk cycle per size, driven by distance travelled (no foot slide): mini scurry, mid hunched stomp with opposite arm swing and head bob, big lumber with sway, dragging arms and a step thud.
4. Attack logic: `chase -> windup -> strike -> recover`; damage only on the strike if the player is still in reach; killed or knocked mid wind-up cannot hit. Wind-ups ~0.15 s mini, ~0.3 s mid, ~0.5 s big (RULES-style constants).
5. Attack animations: mini crouch + lunge-bite, mid rear back + claw swipe, big raise fists + ground slam (dust ring, camera thump).
6. Full regression, HANDOFF, send build.

## Phase log
- Phase 1: `TIERS.mid.split = null` (`splitN` 0), comment updated, unit test now asserts mid and small leave nothing and big -> 2 mids; HANDOFF line updated. `npm test` 203/203, `game-run.mjs` passes. Golden differs from the pre-change recording from checkpoint 06 on (first mid kill; later ones shift with the random sequence), identical before it, as expected. New golden baseline for the visual phases: recorded after Phase 1 (`gold-p1` in the scratchpad; re-record from commit `HEAD` of Phase 1 if lost).
  Side effect to note: wave 1 (1 big + 3 mids) is now 6 critters to clear instead of 16, which already eases the "wave 1 too hard" feedback. Wave balance itself is untouched.
- Phase 2: `src/hero/critter.js` now builds each size as ONE `SkinnedMesh` (rigid skinning: each part bound to one bone via `skinIndex`/`skinWeight` baked into the merged geometry) on a 7-bone skeleton `BONE = { root, body, head, armL, armR, footL, footR }` (exported). Hierarchy: root > (body > head, armL, armR), footL, footR. Joint positions come from `buildFurry` (`pivots`), each view makes its own bones (`makeBones`) and `dispose()` frees the skeleton. Rest pose = the old static shape. The hop/squash/tilt still live on the `rig` group, unchanged, so the look is identical; Phase 3 adds bone motion on top (root bone is free for body bob).
  Verified: `tools/critter-lineup.mjs` renders 6 critters (2 per size) deterministically; old vs new build: identical draw calls (225) and triangles (116,972), 1 and 4 differing pixels of 480,000 (max channel diff 1 and 19, silhouette rounding). Posing individual bones in the browser moves exactly the intended parts (eyeballed). New `tests/critter-rig.test.mjs` (5 tests, mutation-checked: swapped arms, face on body, feet on body): bone coverage, left/right sides, rest pose == original shape, one bone moves only its own parts. `npm test` 208/208; game-run, tutorial, e2e-controller, hero-select, aim-and-shot pass. Perf with a 34-critter wave-10 crowd: ~0.28-0.33 ms per frame JS vs 0.27-0.30 before (+0.03 ms); create/render/dispose soak of 300 critters: GPU textures and heap stay flat (no leak).
  Golden: the golden-master's state now drifts from the pre-skeleton recording, but only because three draws 4 `Math.random()` values per object it creates (UUIDs; 7 bones + skeleton + mesh per critter shift the seeded sequence, so spawn positions change). It is NOT a visual change (see the lineup comparison). The golden baseline for Phases 3-6 is the recording taken after this phase.
