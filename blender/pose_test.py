import sys; sys.path.insert(0,'/home/user/blob-shooter/blender')
from anim import *
rig, parts, B = build_rig(); review_scene(); em = setup_ik(rig, B)
sc = bpy.context.scene
# reach check: wrist targets must be within the arm's reach with a bend (< 97% of upper+fore)
reach = UPPER + FORE
worst = 0
for clip, frames in (('hold', 8), ('fire', 8), ('reload', 60)):
    for i in range(frames + 1):
        p = i / frames if clip != 'fire' else i / frames * 0.3
        Mg, Mb = gun_mats(Vector((0,0,0.28))*1 if False else Vector((0,0,0)), 0.0, 0.0, 0.0)
print('reach', reach)
for name, p in (('hold', 0.0), ('open', 0.14), ('belt', 0.28), ('carry', 0.5), ('insert', 0.66), ('close', 0.84)):
    pose_frame(rig, em, 'reload' if name != 'hold' else 'hold', p)
    for T in ('L', 'R'):
        sh = Vector(rig.pose.bones['upperArm' + T].head) ; tgt = em['ik_' + T].location
        d = (tgt - sh).length; print(name, T, 'reach distance %.2f of %.2f' % (d, reach), 'OVER' if d > reach * 0.97 else '')
    for v in ('front', 'away', 'side'):
        cam_view(v); render(f'/tmp/pose_{name}_{v}.png')
