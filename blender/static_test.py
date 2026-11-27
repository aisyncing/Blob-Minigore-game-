import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)      # everything is found relative to this checkout
sys.path.insert(0, HERE)
import tempfile; OUTDIR = os.environ.get('BLOB_RENDER_DIR', tempfile.gettempdir())
from rig_build import *
rig, parts, B = build_rig(); review_scene()
bpy.context.view_layer.update()
for v in ('front','away','side'):
    cam_view(v); render(os.path.join(OUTDIR, f'static_{v}.png'))
print('bones', len(B), 'meshes', [o.name for o in parts if o.type=='MESH'])
