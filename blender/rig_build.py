"""Builds the armature, skins the meshes, sets up a review scene. Import from the animation script."""
import sys, math
sys.path.insert(0, '/home/user/blob-shooter/blender'); sys.path.insert(0, '/home/user/bl-libs')
import bpy
from mathutils import Vector, Matrix
from rig_model import *

SIDES = (('L', 1), ('R', -1))
MUZZLE_FWD = GUN_FWD + 1.27 * GUN_S

def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12))); return (p - (a + ab * t)).length

def build_bones():
    """name -> (head, tail, parent). Everything in world rest coordinates."""
    B = {}
    B['root'] = (V(0, 0, 0.4), V(0, 0, 0.5), None)
    for T, sx in SIDES:
        sh, el, wr = arm_points(sx); wrist, fwd, side, up = hand_frame(sx)
        B['upperArm' + T] = (sh, el, 'root'); B['foreArm' + T] = (el, wr, 'upperArm' + T)
        B['hand' + T] = (wr, wr + fwd * PALM, 'foreArm' + T)
        for name, chain in hand_chains(sx).items():
            for i, (a, b) in enumerate(chain): B[f'{name}{i + 1}{T}'] = (a, b, ('hand' + T) if i == 0 else f'{name}{i}{T}')
    B['gunRoot'] = (GUN_ROOT, GUN_ROOT + V(0, 0.3, 0), 'root')
    hinge = V(0, HINGE_FWD, GUN_ROOT.z)
    B['barrels'] = (hinge, hinge + V(0, 0.4, 0), 'gunRoot')
    B['muzzle'] = (V(0, MUZZLE_FWD, GUN_ROOT.z), V(0, MUZZLE_FWD + 0.05, GUN_ROOT.z), 'barrels')
    for T, sx in (('L', -1), ('R', 1)):
        B['chamber' + T] = (GUN_ROOT + V(sx * BARREL_X, 0.27 * GUN_S, 0.02), GUN_ROOT + V(sx * BARREL_X, 0.33 * GUN_S, 0.02), 'barrels')
    g = V(math.sin(BELT_GRAB_ANGLE) * BELT['r'], math.cos(BELT_GRAB_ANGLE) * BELT['r'], BELT['up'])
    for k, dx in (('A', -0.05), ('B', 0.05)):
        B['shell' + k] = (g + V(dx, 0, 0), g + V(dx, 0, 0) + Vector((0, 0, 0.22)), 'root')
    return B

def name_vertical(eb):
    d = (eb.tail - eb.head).normalized(); return abs(d.z) > 0.95

def make_armature(B):
    arm = bpy.data.armatures.new('heroRig'); ob = bpy.data.objects.new('heroRig', arm); bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode='EDIT')
    for name, (h, t, parent) in B.items():
        eb = arm.edit_bones.new(name); eb.head = h; eb.tail = t
        if parent: eb.parent = arm.edit_bones[parent]
    for eb in arm.edit_bones:
        if not name_vertical(eb): eb.align_roll(Vector((0, 0, 1)))        # local X = a sideways horizontal axis: elbow hinge / finger curl axis
    bpy.ops.object.mode_set(mode='OBJECT'); return ob

def skin(mesh, rig, names, B, power=3.0, blend=1.9):
    """Distance-weighted skinning: each vertex follows the nearest bone(s) of the chain, blending near joints."""
    mw = mesh.matrix_world; groups = {n: mesh.vertex_groups.new(name=n) for n in names}
    for v in mesh.data.vertices:
        p = mw @ v.co; d = {n: seg_dist(p, B[n][0], B[n][1]) for n in names}; dm = min(d.values())
        w = {n: 1.0 / max(dd, 1e-3) ** power for n, dd in d.items() if dd <= dm * blend + 0.012}
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; tot = sum(x for _, x in top)
        for n, x in top: groups[n].add([v.index], x / tot, 'REPLACE')
    mesh.parent = rig; mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

def rigid(mesh, rig, bone):
    mesh.vertex_groups.new(name=bone).add([v.index for v in mesh.data.vertices], 1.0, 'REPLACE')
    mesh.parent = rig; mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig

def build_rig():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    B = build_bones(); rig = make_armature(B); parts = [rig]
    for T, sx in SIDES:
        arm = build_arm(sx, T); names = [n for n in B if n.endswith(T) and n != 'root']
        skin(arm, rig, names, B); parts.append(arm)
    stock, barrels, shell = build_gun(); rigid(stock, rig, 'gunRoot'); rigid(barrels, rig, 'barrels'); parts += [stock, barrels]
    shellB = shell.copy(); shellB.data = shell.data; bpy.context.collection.objects.link(shellB)
    for ob, k in ((shell, 'A'), (shellB, 'B')):
        ob.name = 'shell' + k; g = B['shell' + k][0]; ob.location = g; bpy.context.view_layer.update(); rigid(ob, rig, 'shell' + k); parts.append(ob)
    return rig, parts, B

def review_scene(res=(420, 340)):
    """Reference body + belt (not exported), light, camera settings for review renders."""
    col = bpy.data.collections.new('ref'); bpy.context.scene.collection.children.link(col)
    def ref(ob): [c.objects.unlink(ob) for c in ob.users_collection]; col.objects.link(ob); return ob
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6, location=(0, 0, 0.95)); body = ref(bpy.context.object); body.scale = (1, 1, 1.25)
    bpy.ops.mesh.primitive_torus_add(major_radius=BELT['r'], minor_radius=0.045, location=(0, 0, BELT['up'])); ref(bpy.context.object)
    m = bpy.data.materials.new('refbody'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*hexrgb('#ff7ab8'), 1); body.data.materials.append(m)
    bpy.ops.object.light_add(type='SUN', rotation=(0.9, 0.2, 0.6)); bpy.context.object.data.energy = 4.0
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = False; sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.12, 0.2, 0.17, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.2
    bpy.ops.object.camera_add(); sc.camera = bpy.context.object

def cam_view(name):
    """Camera placements: 'front' = hero aims toward the game camera, 'away' = aims away from it (worst case for hidden hands), 'side'."""
    t = math.radians(58); d = 5.0
    spots = {'front': (Vector((0, -math.cos(t) * d, math.sin(t) * d)) + Vector((0, 0, 0.3))),
             'away': (Vector((0, math.cos(t) * d, math.sin(t) * d)) + Vector((0, 0, 0.3))),
             'side': Vector((-d * 0.95, -0.4, 1.3))}
    spots['closeF'] = Vector((0.0, -1.4 - math.cos(t) * 2.2, 0.75 + math.sin(t) * 2.2)); spots['closeS'] = Vector((-2.6, -0.6, 1.3)); spots['closeA'] = Vector((0.0, 1.3 + math.cos(t) * 2.2, 0.75 + math.sin(t) * 2.2 + 0.4))
    cam = bpy.context.scene.camera; cam.location = spots[name]
    look = {'closeF': Vector((0, -0.75, 0.78)), 'closeS': Vector((0, -0.7, 0.8)), 'closeA': Vector((0, -0.7, 0.8))}.get(name, Vector((0, -0.4 if name != 'away' else 0.2, 0.8))); direction = look - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50

def render(path):
    bpy.context.scene.render.filepath = path; bpy.ops.render.render(write_still=True)
