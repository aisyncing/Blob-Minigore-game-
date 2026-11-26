import sys; sys.path.insert(0,'/home/user/blob-shooter/blender')
from rig_build import *
rig, parts, B = build_rig(); review_scene()
bpy.context.view_layer.update()
for v in ('front','away','side'):
    cam_view(v); render(f'/tmp/static_{v}.png')
print('bones', len(B), 'meshes', [o.name for o in parts if o.type=='MESH'])
