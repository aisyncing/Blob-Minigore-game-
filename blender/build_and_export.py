"""Builds the rig, animates the three clips with IK, bakes them to plain bone keyframes and exports hero_rig.glb."""
import sys, json; sys.path.insert(0, '/home/user/blob-shooter/blender')
from anim import *

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/blob-shooter/src/assets/hero_rig.glb'
rig, parts, B = build_rig(); em = setup_ik(rig, B)
sc = bpy.context.scene; sc.render.fps = FPS
CLIPS = [('hold', 120, lambda f, n: f / n), ('fire', 18, lambda f, n: f / FPS), ('reload', 60, lambda f, n: f / n)]
rig.animation_data_create()
for name, n, pfun in CLIPS:
    rig.animation_data.action = None
    for e in em.values(): e.animation_data_clear()
    for f in range(0, n + 1): pose_frame(rig, em, name, pfun(f, n), key=f)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.nla.bake(frame_start=0, frame_end=n, only_selected=False, visual_keying=True, clear_constraints=False, use_current_action=True, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = rig.animation_data.action; act.name = name
    tr = rig.animation_data.nla_tracks.new(); tr.name = name; tr.strips.new(name, 0, act)
    print('baked', name, n, 'frames')
rig.animation_data.action = None
# remove the solver scaffolding so only plain bones + meshes remain
bpy.ops.object.mode_set(mode='POSE')
for pb in rig.pose.bones:
    for c in list(pb.constraints): pb.constraints.remove(c)
bpy.ops.object.mode_set(mode='OBJECT')
for e in em.values(): bpy.data.objects.remove(e)
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = rig
import os; os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_yup=True, export_apply=False, export_force_sampling=True, export_optimize_animation_size=False)
meta = dict(muzzle_fwd=MUZZLE_FWD, gun_fwd=GUN_FWD, gun_scale=GUN_S, gun_up=GUN_ROOT.z, hinge_fwd=HINGE_FWD, open_angle=OPEN_ANGLE, shoulder=SHOULDER,
            belt=BELT, belt_grab_angle=BELT_GRAB_ANGLE, upper=UPPER, fore=FORE, fps=FPS, clips={n: k for n, k, _ in CLIPS}, bones=list(B.keys()))
json.dump(meta, open(OUT.replace('.glb', '.json'), 'w'), indent=1)
print('exported', OUT, os.path.getsize(OUT), 'bytes')
