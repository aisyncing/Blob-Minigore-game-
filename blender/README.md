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
```bash
pip install bpy          # Blender as a Python module (Python 3.11 or newer)
python3 blender/build_and_export.py
npm run build
```
Reach is checked while posing: every hand target must be reachable with a bend (the longest is 1.07 of 1.18 units).
