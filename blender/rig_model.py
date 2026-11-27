"""
Hero arms + shotgun rig for the blob shooter. Built in Blender (bpy), exported to glTF.

Coordinates: Blender is Z-up and the hero is built FACING -Y, so the glTF exporter (+Y up) produces a model facing +Z,
which is how the three.js hero faces. One Blender unit = one game unit. The character's LEFT is +X.
V(x, fwd, up) converts game-style numbers (x left, fwd forward, up) into Blender vectors.
"""
import sys, math
import bpy, bmesh
from mathutils import Vector, Matrix

def V(x, fwd, up): return Vector((x, -fwd, up))

# ------------------------------------------------------------------ dimensions (shared by every hero design)
SHOULDER = dict(x=0.56, fwd=0.0, up=0.90)
UPPER, FORE = 0.60, 0.58                      # long enough to reach the forend with a natural bend, never stretching
GUN_S = 0.8                                   # the gun is drawn 20% smaller than the old procedural one so two hands reach it comfortably
GUN_FWD = 0.62                                # receiver centre sits well in front of the body, so the stock and breech are never hidden behind it
GUN_ROOT = V(0, GUN_FWD, 0.72)
HINGE_FWD = GUN_FWD + 0.36 * GUN_S            # barrel hinge
BARREL_X = 0.078 * GUN_S
OPEN_ANGLE = 0.70
BELT = dict(r=0.66, up=0.5)
BELT_GRAB_ANGLE = math.radians(70)            # left-front belt slot

# ------------------------------------------------------------------ materials
def hexrgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = lambda v: ((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92
    return tuple(lin(v) for v in c)

PALETTE = dict(sleeve='#4fcf86', glove='#fff6e8', steel='#4b5360', dark='#2d323b', wood='#8a5a2f', brass='#d9a441',
               shellRed='#d9463e', shellBrass='#d9a441', black='#15171c')
_MATS = {}
def mat(name):
    if name not in _MATS:
        m = bpy.data.materials.new(name); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*hexrgb(PALETTE[name]), 1); b.inputs['Roughness'].default_value = 0.65
        _MATS[name] = m
    return _MATS[name]

# ------------------------------------------------------------------ mesh helpers
def _basis(axis):
    axis = axis.normalized(); t = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = axis.cross(t).normalized(); return u, axis.cross(u).normalized()

def add_tube(bm, p0, p1, r0, r1, seg=12, rings=1, mi=0, caps=(True, True)):
    u, v = _basis(p1 - p0); loops = []
    for i in range(rings + 1):
        t = i / rings; c = p0.lerp(p1, t); r = r0 + (r1 - r0) * t
        loops.append([bm.verts.new(c + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(rings):
        for k in range(seg): bm.faces.new((loops[i][k], loops[i][(k + 1) % seg], loops[i + 1][(k + 1) % seg], loops[i + 1][k])).material_index = mi
    for on, loop, p in ((caps[0], loops[0], p0), (caps[1], loops[-1], p1)):
        if on:
            c = bm.verts.new(p)
            for k in range(seg): bm.faces.new((c, loop[(k + 1) % seg], loop[k])).material_index = mi

def add_sphere(bm, c, r, mi=0, seg=12, rings=8, scale=(1, 1, 1)):
    verts = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)['verts']
    for v in verts: v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) + c
    for f in {f for v in verts for f in v.link_faces}: f.material_index = mi

def add_box(bm, c, size, mi=0, bevel=0.0, rot=None):
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    for v in verts:
        p = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        v.co = (rot @ p if rot else p) + c
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces: f.material_index = mi
    if bevel > 0: bmesh.ops.bevel(bm, geom=list({e for f in faces for e in f.edges}), offset=bevel, segments=2, affect='EDGES')

def finish(name, bm, mat_names):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mn in mat_names: me.materials.append(mat(mn))
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob

# ------------------------------------------------------------------ arm + hand
def arm_points(sx):
    """Rest-pose joints for one arm (sx=+1 left, -1 right): a relaxed, bent 'ready' arm."""
    sh = V(sx * SHOULDER['x'], SHOULDER['fwd'], SHOULDER['up'])
    elbow = sh + V(sx * 0.10, 0.20, -0.45).normalized() * UPPER
    wrist = elbow + V(-sx * 0.20, 0.45, 0.10).normalized() * FORE
    return sh, elbow, wrist

def hand_frame(sx):
    sh, elbow, wrist = arm_points(sx); fwd = (wrist - elbow).normalized()
    side = (Vector((1, 0, 0)) - fwd * fwd.x).normalized()           # world X made perpendicular to the forearm
    up = side.cross(fwd).normalized()
    if up.z < 0: up = -up
    return wrist, fwd, side, up

FINGERS = [('index', 0.045, 0.062, 0.050), ('middle', 0.015, 0.070, 0.054), ('ring', -0.015, 0.064, 0.050), ('pinky', -0.045, 0.050, 0.040)]
PALM = 0.115

def hand_chains(sx):
    """name -> [(head, tail), (head, tail)] for the open rest hand (palm down, fingers forward, thumb on the inner side)."""
    wrist, fwd, side, up = hand_frame(sx); inner = side * (-sx); knuckle = wrist + fwd * PALM; out = {}
    for name, off, l1, l2 in FINGERS:
        a = knuckle + inner * off; b = a + fwd * l1; c = b + fwd * l2; out[name] = [(a, b), (b, c)]
    t0 = wrist + fwd * 0.045 + inner * 0.06 - up * 0.01; d = (fwd * 0.7 + inner * 0.55 - up * 0.15).normalized()
    out['thumb'] = [(t0, t0 + d * 0.055), (t0 + d * 0.055, t0 + d * 0.108)]
    return out

def build_arm(sx, tag):
    bm = bmesh.new(); sh, elbow, wrist = arm_points(sx); wr, fwd, side, up = hand_frame(sx)
    add_tube(bm, sh, elbow, 0.105, 0.088, seg=14, rings=8, mi=0, caps=(False, False))
    add_tube(bm, elbow, wrist, 0.088, 0.080, seg=14, rings=8, mi=0, caps=(False, False))
    add_sphere(bm, sh, 0.105, 0, 14, 8); add_sphere(bm, elbow, 0.090, 0, 14, 8)
    add_tube(bm, wrist - fwd * 0.035, wrist + fwd * 0.045, 0.094, 0.094, seg=14, rings=1, mi=1, caps=(False, False))       # glove cuff
    add_sphere(bm, wrist + fwd * 0.07, 0.078, 1, 14, 8, scale=(1, 1, 1))                                                    # palm
    for name, chain in hand_chains(sx).items():
        for i, (a, b) in enumerate(chain):
            r = (0.031 if name != 'thumb' else 0.036) * (1 - 0.1 * i)
            add_tube(bm, a, b, r, r * 0.92, seg=8, rings=2, mi=1, caps=(False, i == 1)); add_sphere(bm, a, r, 1, 8, 6)
    return finish('arm' + tag, bm, ['sleeve', 'glove'])

# ------------------------------------------------------------------ gun + shell
def build_gun():
    """Receiver centre is GUN_ROOT. Barrels hinge at HINGE_FWD ahead of the origin. Returns (stock, barrels, shell) objects."""
    c = GUN_ROOT
    bm = bmesh.new()                                                              # stock assembly
    add_box(bm, c, (0.30, 0.42, 0.25), 0, 0.03)                                    # receiver
    add_box(bm, c + V(0, 0.02, 0.14), (0.26, 0.30, 0.05), 1, 0.01)                 # brass top plate
    add_box(bm, c + V(0, -0.5, -0.05), (0.20, 0.60, 0.30), 2, 0.04, Matrix.Rotation(-0.12, 3, 'X'))   # wooden stock
    add_tube(bm, c + V(0, 0.2, 0.02), c + V(0, 0.23, 0.02), 0.175, 0.175, seg=18, mi=0)             # standing breech face
    for sx in (-1, 1): add_tube(bm, c + V(sx * 0.078, 0.23, 0.0), c + V(sx * 0.078, 0.234, 0.0), 0.068, 0.068, seg=14, mi=3)   # chamber holes
    stock = finish('gunStock', bm, ['dark', 'brass', 'wood', 'black'])

    bm = bmesh.new()                                                              # barrel assembly (hinged)
    for sx in (-1, 1):
        add_tube(bm, c + V(sx * 0.078, 0.245, 0), c + V(sx * 0.078, 1.195, 0), 0.078, 0.078, seg=14, rings=6, mi=0)             # barrel
        add_tube(bm, c + V(sx * 0.078, 1.15, 0), c + V(sx * 0.078, 1.20, 0), 0.092, 0.092, seg=14, mi=1)                        # muzzle ring
        add_tube(bm, c + V(sx * 0.078, 0.245, 0), c + V(sx * 0.078, 0.29, 0), 0.090, 0.090, seg=14, mi=2)                       # brass breech ring
    add_box(bm, c + V(0, 0.46, -0.10), (0.27, 0.44, 0.15), 3, 0.03)               # forend
    add_box(bm, c + V(0, 0.30, 0.10), (0.20, 0.30, 0.05), 2, 0.01)                # rib plate
    barrels = finish('gunBarrels', bm, ['steel', 'dark', 'brass', 'wood'])

    bm = bmesh.new()                                                              # a shell: origin at its base, pointing up
    add_tube(bm, Vector((0, 0, 0)), Vector((0, 0, 0.05)), 0.058, 0.058, seg=12, mi=1)
    add_tube(bm, Vector((0, 0, 0.05)), Vector((0, 0, 0.21)), 0.052, 0.052, seg=12, rings=2, mi=0)
    add_tube(bm, Vector((0, 0, 0.21)), Vector((0, 0, 0.222)), 0.044, 0.044, seg=12, mi=0)
    shell = finish('shell', bm, ['shellRed', 'shellBrass'])
    for ob in (stock, barrels):
        for v in ob.data.vertices: v.co = c + (v.co - c) * GUN_S
    return stock, barrels, shell
