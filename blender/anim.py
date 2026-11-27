"""Sets up IK, poses the rig from the choreography, and (optionally) bakes clips and exports glTF."""
from anim_lib import *

TWIST = dict(L_fore=math.radians(180), R_stock=math.radians(-90))     # hand roll about its own axis: palm up under the forend / palm inward around the stock
FLEX = dict(L_fore=math.radians(-12), R_stock=math.radians(12))

def setup_ik(rig, B):
    """Empties the IK solver chases, and the IK + pole constraints on the forearms. Returns dict of empties."""
    em = {}
    for T, sx in SIDES:
        for kind in ('ik', 'pole'):
            e = bpy.data.objects.new(f'{kind}_{T}', None); bpy.context.collection.objects.link(e); e.empty_display_size = 0.05; em[f'{kind}_{T}'] = e
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    for T, sx in SIDES:
        pb = rig.pose.bones['foreArm' + T]; c = pb.constraints.new('IK')
        c.target = em['ik_' + T]; c.pole_target = em['pole_' + T]; c.chain_count = 2; c.pole_angle = math.radians(-90 if T == 'L' else 90)
    for pb in rig.pose.bones: pb.rotation_mode = 'XYZ'
    bpy.ops.object.mode_set(mode='OBJECT'); return em

def set_bone_world(rig, name, M):
    """Put a pose bone at armature-space matrix M * rest (M is a rest-relative transform, like gun_mats gives)."""
    pb = rig.pose.bones[name]; pb.matrix = M @ pb.bone.matrix_local
    bpy.context.view_layer.update()

def pose_frame(rig, em, clip, p, key=None):
    """Pose everything for clip ('hold' / 'fire' / 'reload') at normalised time p. key = frame number to insert keyframes at (or None to just pose)."""
    if clip == 'reload':
        ps = reload_pose(p); lift = ps['open'] if ps['open'] < 1 else 1.0
        lift = max(ps['open'], 1.0 if REL['open'] <= p < REL['insert'] else 0.0) if p >= 0 else 0.0
        if p >= REL['insert']: lift = 1 - smooth(seg(p, REL['insert'], REL['close']))
        if p < REL['open']: lift = smooth(seg(p, 0, REL['open']))
        off = Vector((0, 0, 0.28)) * lift + V(0, 0.22, 0) * lift; pitch = 0.30 * lift; kick = 0.0; opened = ps['open']
        lp = left_pose(p)
    elif clip == 'fire':
        k = math.exp(-p * 7.0) * math.sin(min(1.0, p * 9) * math.pi / 2); off = Vector((0, 0, 0)); pitch = 0.16 * k; kick = 0.16 * k; opened = 0.0; lp = POSES['gripFore']
    else:                                           # hold: a slow breath
        s = math.sin(p * 2 * math.pi); off = Vector((0, 0, 0.012 * s)); pitch = 0.01 * s; kick = 0.0; opened = 0.0; lp = POSES['gripFore']
    Mg, Mb = gun_mats(off, pitch, kick, opened)
    set_bone_world(rig, 'gunRoot', Mg); set_bone_world(rig, 'barrels', Mb)
    # hands
    rw = right_wrist(Mg); lw = left_wrist(p if clip == 'reload' else -1, Mg, Mb)
    for T, sx in SIDES:
        sh = V(sx * SHOULDER['x'], SHOULDER['fwd'], SHOULDER['up'])
        em['pole_' + T].location = sh + V(sx * 0.45, -0.55, -0.45)        # elbows point back and down, never out to the side
        em['ik_' + T].location = lw if T == 'L' else rw
    # finger curls: joint 1 / joint 2 about local X (negative = curl toward the palm side), thumb separately
    for T, sx in SIDES:
        pose = lp if T == 'L' else POSES['gripStock']
        for f in ('index', 'middle', 'ring', 'pinky'):
            rig.pose.bones[f'{f}1{T}'].rotation_euler = (-pose['f1'], 0, 0); rig.pose.bones[f'{f}2{T}'].rotation_euler = (-pose['f2'], 0, 0)
        rig.pose.bones[f'thumb1{T}'].rotation_euler = (-pose['t1'], 0, 0); rig.pose.bones[f'thumb2{T}'].rotation_euler = (-pose['t2'], 0, 0)
        hb = rig.pose.bones['hand' + T]; tw, fl = (TWIST['L_fore'], FLEX['L_fore']) if T == 'L' else (TWIST['R_stock'], FLEX['R_stock'])
        hb.rotation_euler = (fl, tw, 0)
    # shells: carried between grab and insert, then they drop into the chambers
    for k in ('A', 'B'):
        carry = clip == 'reload' and REL['grab'] <= p < REL['insert']
        sb = rig.pose.bones['shell' + k]
        if carry:
            sxo = -0.04 if k == 'A' else 0.04
            pos = lw + V(sxo, 0.13, -0.03); drop = smooth(seg(p, REL['insert'] - 0.06, REL['insert'])); pos = pos.lerp((Mg @ (GUN_ROOT + V(( -1 if k == 'A' else 1) * BARREL_X, 0.12 * GUN_S + 0.05, 0.04))), drop)
            q = Vector((0, 0, 1)).rotation_difference(V(0, 1, 0.25).normalized() if drop < 0.5 else Vector((0, 0, 1)))
            M = Matrix.Translation(pos) @ q.to_matrix().to_4x4()
        else:
            M = Matrix.Translation(BELT_POINT) @ Matrix.Diagonal((0.001, 0.001, 0.001, 1))
        sb.matrix = M @ Matrix.Identity(4) if False else M
        bpy.context.view_layer.update()
    if key is not None:
        for e in em.values(): e.keyframe_insert('location', frame=key)
        for pb in rig.pose.bones:
            if pb.name.startswith(('gunRoot', 'barrels', 'shell', 'index', 'middle', 'ring', 'pinky', 'thumb', 'hand')):
                pb.keyframe_insert('location', frame=key); pb.keyframe_insert('rotation_quaternion', frame=key); pb.keyframe_insert('rotation_euler', frame=key); pb.keyframe_insert('scale', frame=key)
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ reach check (the arms must never be stretched straight)
CLIPS = [('hold', 120, lambda f, n: f / n), ('fire', 18, lambda f, n: f / FPS), ('reload', 60, lambda f, n: f / n)]     # name, frames, progress at frame f
MAX_EXTENSION = 0.97          # documented limit: shoulder-to-wrist distance may be at most 97% of upper arm + forearm (a visible bend is always left)

def measure_reach(rig, em, max_extension=MAX_EXTENSION):
    """Pose every sampled frame of every clip (the same frames that get baked), read the ACTUAL solved wrist of both arms and compare it with the arm's full length.
    Returns {ok, limit, reach, worst: {...}, rows: [...]} where each row is one clip/arm: its worst frame, distance, extension and how far the wrist is from where the hand was asked to be."""
    reach = UPPER + FORE; rows = []; worst = None
    for name, n, pfun in CLIPS:
        per_arm = {T: None for T, _ in SIDES}
        for f in range(n + 1):
            pose_frame(rig, em, name, pfun(f, n)); bpy.context.view_layer.update()
            for T, _ in SIDES:
                sh = rig.matrix_world @ rig.pose.bones['upperArm' + T].head; wr = rig.matrix_world @ rig.pose.bones['hand' + T].head
                d = (wr - sh).length; rec = dict(clip=name, frame=f, arm=T, distance=d, extension=d / reach, miss=(wr - em['ik_' + T].location).length)
                if per_arm[T] is None or d > per_arm[T]['distance']: per_arm[T] = rec
                if worst is None or d > worst['distance']: worst = rec
        rows += [per_arm[T] for T, _ in SIDES]
    return dict(ok=worst['extension'] <= max_extension, limit=max_extension, reach=reach, worst=worst, rows=rows)

def print_reach(r):
    print('reach check: arm length %.3f, limit %.0f%% (%.3f)' % (r['reach'], r['limit'] * 100, r['limit'] * r['reach']))
    for x in r['rows']: print('  %-6s %s arm: worst frame %3d  distance %.3f  (%.1f%%)  wrist %.3f from its target' % (x['clip'], x['arm'], x['frame'], x['distance'], x['extension'] * 100, x['miss']))
    w = r['worst']; print('worst: %s frame %d, %s arm, %.3f = %.1f%% of full length -> %s' % (w['clip'], w['frame'], w['arm'], w['distance'], w['extension'] * 100, 'PASS' if r['ok'] else 'FAIL (over the %.0f%% limit)' % (r['limit'] * 100)))
