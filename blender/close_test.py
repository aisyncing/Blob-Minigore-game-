import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)      # everything is found relative to this checkout
sys.path.insert(0, HERE)
import tempfile; OUTDIR = os.environ.get('BLOB_RENDER_DIR', tempfile.gettempdir())
from anim import *
rig, parts, B = build_rig(); review_scene(res=(420,330)); em = setup_ik(rig, B)
steps = [('hold','hold',0.0),('open','reload',0.14),('belt','reload',0.28),('carry','reload',0.5),('insert','reload',0.66),('close','reload',0.84)]
for name, clip, p in steps:
    pose_frame(rig, em, clip, p)
    for v in ('closeF','closeS','closeA'): cam_view(v); render(os.path.join(OUTDIR, f'cl_{name}_{v}.png'))
