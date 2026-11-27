import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)      # everything is found relative to this checkout
sys.path.insert(0, HERE)
import tempfile; OUTDIR = os.environ.get('BLOB_RENDER_DIR', tempfile.gettempdir())
from anim import *
rig, parts, B = build_rig(); review_scene(); em = setup_ik(rig, B)
sc = bpy.context.scene
# reach: the real check (every sampled frame of every clip, both arms, actual solved wrists). See blender/reach_check.py for the pass/fail command.
report = measure_reach(rig, em); print_reach(report)
for name, p in (('hold', 0.0), ('open', 0.14), ('belt', 0.28), ('carry', 0.5), ('insert', 0.66), ('close', 0.84)):
    pose_frame(rig, em, 'reload' if name != 'hold' else 'hold', p)
    for T in ('L', 'R'):
        sh = rig.pose.bones['upperArm' + T].head; wr = rig.pose.bones['hand' + T].head
        d = (wr - sh).length; print(name, T, 'reach distance %.2f of %.2f' % (d, UPPER + FORE), 'OVER' if d > (UPPER + FORE) * MAX_EXTENSION else '')
    for v in ('front', 'away', 'side'):
        cam_view(v); render(os.path.join(OUTDIR, f'pose_{name}_{v}.png'))
