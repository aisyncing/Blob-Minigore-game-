# Hero arms, hands and shotgun (Blender)

Authored in Blender (headless, through the `bpy` Python module) and exported as `src/assets/hero_rig.glb`
(+ `hero_rig.json` with the muzzle position and rig dimensions). The game loads it and scrubs its three clips:

| clip   | length | used for                                   |
|--------|--------|--------------------------------------------|
| hold   | 2.0 s  | idle breathing, looped                     |
| fire   | 0.3 s  | recoil of the gun and both arms            |
| reload | 1.0 s  | break open, eject, fetch shells, load, close; the game stretches it to the gun's reload time |

Reload timing is the table in `src/hero/reload.js` (`REL`); `anim_lib.py` repeats it exactly, so sounds, casings and the
animation stay together. If you change one, change both.

## Files
- `rig_model.py`  meshes: arm with elbow, glove with 4 fingers + thumb, shotgun with hinged barrels, shell
- `rig_build.py`  armature (34 bones), distance-weighted skinning, review scene and cameras
- `anim_lib.py`   choreography (where each hand goes at each moment) and finger poses
- `anim.py`       two-bone IK setup and per-frame posing
- `build_and_export.py`  bakes IK to plain bone keyframes and exports the glb

## Rebuild
Run these from anywhere; every path is found relative to this checkout.
```bash
pip install bpy                                 # Blender as a Python module (Python 3.11 or newer)
python3 blender/build_and_export.py             # writes src/assets/hero_rig.glb (+ .json) in this checkout
python3 blender/build_and_export.py out/rig.glb # or export somewhere else
npm run build
```
If `bpy` is installed somewhere Python does not look by default (for example `pip install --target libs bpy`), point `PYTHONPATH` at it: `PYTHONPATH=libs python3 blender/build_and_export.py`.

## Reach check
Both arms are checked at every sampled frame of every clip (hold 0-120, fire 0-18, reload 0-60: the same frames that get baked), using the actual solved wrist
of each arm. The limit is **97% of the arm's full length** (upper arm + forearm = 1.18 units), so a visible bend is always left.
```bash
python3 blender/reach_check.py                          # prints the worst frame per clip and arm; exit code 0 = pass, 1 = fail
python3 blender/reach_check.py --max-extension 0.85     # try a stricter limit to see a failure
```
`build_and_export.py` runs the same check first and exits with a failure, writing no file, if the limit is exceeded
(`--max-extension` also works there). Current worst case: reload frame 8, left arm, 1.088 of 1.180 (92.2%).

Other scripts: `pose_test.py`, `static_test.py`, `close_test.py` render review images into `$BLOB_RENDER_DIR` (default: the system temp folder).
