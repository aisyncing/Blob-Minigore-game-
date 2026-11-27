"""Reach check only (no export): poses every sampled frame of hold, fire and reload and measures both arms.
Usage:  python3 blender/reach_check.py [--max-extension 0.97]      exit code 0 = pass, 1 = an arm is stretched beyond the limit."""
import os, sys, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from anim import *
ap = argparse.ArgumentParser(); ap.add_argument('--max-extension', type=float, default=MAX_EXTENSION); ARGS = ap.parse_args()
rig, parts, B = build_rig(); em = setup_ik(rig, B)
report = measure_reach(rig, em, ARGS.max_extension); print_reach(report)
sys.exit(0 if report['ok'] else 1)
