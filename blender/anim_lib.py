"""Choreography + IK helpers shared by the animation script. Timing matches src/hero/reload.js exactly."""
import sys, math
from rig_build import *
from mathutils import Quaternion, Euler

FPS = 60
# --- keep identical to src/hero/reload.js
REL = dict(open=0.14, grab=0.28, insert=0.66, close=0.84, back=1.0, refill=0.9)
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def seg(p, a, b): return (p - a) / (b - a)

def reload_pose(p):
    if p < 0: return dict(open=0.0, hand='forend', t=0.0, inhand=False)
    if p < REL['open']: return dict(open=smooth(seg(p, 0, REL['open'])), hand='forend', t=0.0, inhand=False)
    if p < REL['grab']: return dict(open=1.0, hand='toBelt', t=smooth(seg(p, REL['open'], REL['grab'])), inhand=False)
    if p < REL['insert']: return dict(open=1.0, hand='toBreech', t=smooth(seg(p, REL['grab'], REL['insert'])), inhand=True)
    if p < REL['close']: k = seg(p, REL['insert'], REL['close']); return dict(open=1 - smooth(k), hand='liftAway', t=smooth(k), inhand=False)
    return dict(open=0.0, hand='toForend', t=smooth(seg(p, REL['close'], REL['back'])), inhand=False)

# --- gun frame -------------------------------------------------------------------------------------------------
HINGE = V(0, HINGE_FWD, GUN_ROOT.z)
def rot_about(point, axis, angle):
    return Matrix.Translation(point) @ Matrix.Rotation(angle, 4, axis) @ Matrix.Translation(-point)

def gun_mats(off=Vector((0, 0, 0)), pitch=0.0, kick=0.0, opened=0.0):
    """Armature-space transform of the stock assembly and of the barrel assembly, relative to the rest pose.
    pitch > 0 raises the muzzle; kick slides the whole gun back along its axis; opened swings the barrels nose-down about the hinge."""
    X = Vector((1, 0, 0))
    Mg = Matrix.Translation(off + V(0, -kick, 0)) @ rot_about(GUN_ROOT, X, -pitch)      # +X rotation lowers a -Y-facing muzzle, so raise = negative
    Mb = Mg @ rot_about(HINGE, X, opened * OPEN_ANGLE)
    return Mg, Mb

# --- hand targets, in gun-rest coordinates (transformed by the gun matrices each frame) --------------------------
def gr(x, fwd, up): return GUN_ROOT + V(x * GUN_S, fwd * GUN_S, up * GUN_S)
WRIST_R = gr(0, -0.46, -0.10)          # back hand: wrist behind the grip so the palm wraps the stock's narrow part
WRIST_L = gr(0, 0.24, -0.30)           # front hand: under the forend, palm up
BELT_POINT = V(math.sin(BELT_GRAB_ANGLE) * BELT['r'], math.cos(BELT_GRAB_ANGLE) * BELT['r'], BELT['up'])
BELT_WRIST = BELT_POINT + V(0.07, -0.13, 0.02)          # wrist sits outside and behind the shells so the fingers reach them
BREECH_RELS = gr(0, 0.05, 0.38)                          # wrist hovers above and behind the open chambers

def lerp3(a, b, t): return a.lerp(b, t)
def arc(t, h): return Vector((0, 0, math.sin(t * math.pi) * h))

def left_wrist(p, Mg, Mb):
    """World position of the free (left) hand's wrist during the reload."""
    ps = reload_pose(p); forend = Mb @ WRIST_L; breech = Mg @ BREECH_RELS
    lift = breech + Vector((0, 0, 0.16))
    h, t = ps['hand'], ps['t']
    if h == 'forend': return forend
    if h == 'toBelt': return lerp3(forend, BELT_WRIST, t) + arc(t, 0.12)
    if h == 'toBreech': return lerp3(BELT_WRIST, breech, t) + arc(t, 0.16)
    if h == 'liftAway': return lerp3(breech, lift, t)
    return lerp3(lift, WRIST_L, t) + arc(t, 0.10)

def right_wrist(Mg): return Mg @ WRIST_R

# --- finger poses: curl angles (radians) for joint 1 and 2 of each finger and the thumb ---------------------------
POSES = {
    'open':     dict(f1=0.10, f2=0.10, t1=0.05, t2=0.05),
    'gripStock':dict(f1=0.95, f2=1.15, t1=0.55, t2=0.55),
    'gripFore': dict(f1=0.85, f2=1.05, t1=0.50, t2=0.50),
    'reach':    dict(f1=0.25, f2=0.30, t1=0.15, t2=0.15),
    'pinch':    dict(f1=0.55, f2=0.65, t1=0.60, t2=0.55),
}
def left_pose(p):
    ps = reload_pose(p)
    seq = [(0, 'gripFore'), (REL['open'], 'gripFore'), (REL['open'] + 0.06, 'reach'), (REL['grab'] - 0.02, 'reach'), (REL['grab'] + 0.03, 'pinch'),
           (REL['insert'] - 0.01, 'pinch'), (REL['insert'] + 0.05, 'reach'), (REL['close'], 'reach'), (REL['back'] - 0.04, 'gripFore'), (1.0, 'gripFore')]
    for (a, na), (b, nb) in zip(seq, seq[1:]):
        if a <= p <= b:
            k = smooth(seg(p, a, b)) if b > a else 1; A, B = POSES[na], POSES[nb]
            return {key: A[key] + (B[key] - A[key]) * k for key in A}
    return POSES['gripFore']
