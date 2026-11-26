import sys; sys.path.insert(0,'/home/user/blob-shooter/blender')
from anim import *
rig, parts, B = build_rig(); review_scene(res=(420,330)); em = setup_ik(rig, B)
steps = [('hold','hold',0.0),('open','reload',0.14),('belt','reload',0.28),('carry','reload',0.5),('insert','reload',0.66),('close','reload',0.84)]
for name, clip, p in steps:
    pose_frame(rig, em, clip, p)
    for v in ('closeF','closeS','closeA'): cam_view(v); render(f'/tmp/cl_{name}_{v}.png')
