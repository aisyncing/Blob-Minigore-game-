// The critter skeleton: at rest the skinned mesh is exactly the static shape, every part follows the right bone, and moving a bone moves only its own parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Critter } from '../src/game/critters.js';
import { CritterView, BONE } from '../src/hero/critter.js';

const make = tier => new CritterView(new THREE.Group(), new Critter({ tier, x: 0, y: 0, warn: 0, rise: 0 }));
const verts = v => { const g = v.body.geometry, p = g.attributes.position, s = g.attributes.skinIndex; return Array.from({ length: p.count }, (_, i) => ({ i, bone: s.getX(i), x: p.getX(i), y: p.getY(i), z: p.getZ(i) })); };
const skinned = (v, i) => { const t = new THREE.Vector3(); v.body.getVertexPosition(i, new THREE.Vector3()); return v.body.applyBoneTransform(i, t.fromBufferAttribute(v.body.geometry.attributes.position, i)); };

test('each size is one skinned mesh with the full bone set, and every body part is bound to a bone', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const v = make(tier), vs = verts(v), count = b => vs.filter(x => x.bone === b).length;
    assert.ok(v.body.isSkinnedMesh); assert.equal(v.bones.length, Object.keys(BONE).length);
    for (const b of [BONE.head, BONE.armL, BONE.armR, BONE.footL, BONE.footR]) assert.ok(count(b) > 0, `${tier}: bone ${b} has geometry`);
    assert.equal(count(BONE.root), 0, 'nothing is glued to the root; it only carries the others');
    assert.equal(count(BONE.body) > 0, tier !== 'small', 'a mini is all head: it has no separate torso');
    assert.ok(vs.every(x => x.bone >= 0 && x.bone < v.bones.length));
  }
});

test('left and right bones own the left and right side', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const vs = verts(make(tier));
    assert.ok(vs.filter(x => x.bone === BONE.armL || x.bone === BONE.footL).every(x => x.x < 0), `${tier}: left parts are on -x`);
    assert.ok(vs.filter(x => x.bone === BONE.armR || x.bone === BONE.footR).every(x => x.x > 0), `${tier}: right parts are on +x`);
    assert.ok(vs.filter(x => x.bone === BONE.footL || x.bone === BONE.footR).every(x => x.y < 0.9), `${tier}: feet are low`);
  }
});

test('at rest the skinned mesh is exactly the original shape', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const v = make(tier); v.body.updateMatrixWorld(true);
    const p = v.body.geometry.attributes.position; let worst = 0;
    for (let i = 0; i < p.count; i += 7) { const a = skinned(v, i), b = new THREE.Vector3().fromBufferAttribute(p, i); worst = Math.max(worst, a.distanceTo(b)); }
    assert.ok(worst < 1e-5, `${tier}: rest pose off by ${worst}`);
  }
});

test('moving one bone moves exactly the parts bound to it (and its children), nothing else', () => {
  const v = make('big'), vs = verts(v), p = v.body.geometry.attributes.position;
  const moved = () => { v.body.updateMatrixWorld(true); return new Set(vs.filter(x => skinned(v, x.i).distanceTo(new THREE.Vector3(x.x, x.y, x.z)) > 1e-4).map(x => x.bone)); };
  v.bones[BONE.armL].rotation.x = -1; assert.deepEqual([...moved()], [BONE.armL], 'left arm swings alone'); v.bones[BONE.armL].rotation.x = 0;
  v.bones[BONE.footR].position.y += 0.3; assert.deepEqual([...moved()], [BONE.footR], 'right foot lifts alone'); v.bones[BONE.footR].position.y -= 0.3;
  v.bones[BONE.head].rotation.y = 0.8; assert.deepEqual([...moved()], [BONE.head], 'head turns alone'); v.bones[BONE.head].rotation.y = 0;
  v.bones[BONE.body].rotation.z = 0.3; assert.deepEqual([...moved()].sort(), [BONE.body, BONE.head, BONE.armL, BONE.armR].sort(), 'the body carries head and arms but not the feet'); v.bones[BONE.body].rotation.z = 0;
  assert.deepEqual([...moved()], [], 'back at rest nothing is displaced');
});

test('a view can be disposed (frees its skeleton)', () => { assert.doesNotThrow(() => make('mid').dispose()); });

// ---- the walk, driven through the real view ----
const DT = 1 / 60, walkers = tier => { const c = new Critter({ tier, x: 0, y: 0, warn: 0, rise: 0 }); c.speed = { small: 4.7, mid: 3.5, big: 2.5 }[tier]; const v = new CritterView(new THREE.Group(), c); v.phase = 0; return { c, v }; };
const offsets = v => ({ footL: v.bones[BONE.footL].position.y - v.rest[BONE.footL].y, footR: v.bones[BONE.footR].position.y - v.rest[BONE.footR].y, armL: v.bones[BONE.armL].rotation.x, armR: v.bones[BONE.armR].rotation.x });
const walk = ({ c, v }, frames, speed = c.speed) => { for (let i = 0; i < frames; i++) { c.x += speed * DT; v.update(DT, i * DT); } };

test('a critter standing still keeps its feet and arms at rest', () => {
  for (const tier of ['small', 'mid', 'big']) { const w = walkers(tier); walk(w, 120, 0); const o = offsets(w.v); assert.ok(Math.abs(o.footL) + Math.abs(o.footR) + Math.abs(o.armL) + Math.abs(o.armR) < 1e-6, tier); }
});

test('a walking critter steps with alternating feet and swinging arms, then settles when it stops', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const w = walkers(tier); let upL = 0, upR = 0, both = 0, armMax = 0;
    walk(w, 45);                                                                  // get up to full stride
    for (let i = 0; i < 120; i++) { walk(w, 1); const o = offsets(w.v); if (o.footL > 0.01) upL++; if (o.footR > 0.01) upR++; if (o.footL > 0.01 && o.footR > 0.01) both++; armMax = Math.max(armMax, Math.abs(o.armL)); }
    assert.ok(upL > 20 && upR > 20, `${tier}: both feet step (${upL}/${upR})`); assert.ok(both <= 3, `${tier}: feet alternate (both up ${both} frames)`); assert.ok(armMax > 0.2, `${tier}: arms swing (${armMax.toFixed(2)})`);
    walk(w, 180, 0); const o = offsets(w.v); assert.ok(Math.abs(o.footL) + Math.abs(o.footR) + Math.abs(o.armL) + Math.abs(o.armR) < 0.02, `${tier}: back to rest after stopping`);
  }
});

test('a critter that is blocked does not run on the spot, and a teleport cannot spin its legs', () => {
  const w = walkers('mid'); walk(w, 60); const d0 = w.v.walkD;
  walk(w, 120, 0); assert.ok(Math.abs(w.v.walkD - d0) < 1e-9, 'no distance covered, no stride');
  w.c.x += 500; w.v.update(DT, 0); assert.ok(w.v.walkD - d0 <= (w.c.speed * 1.6 + 0.5) * DT + 1e-9, 'one frame can only advance the stride a little');
});

test('the heavy ones thump when a foot lands; the mini does not', () => {
  for (const [tier, expect] of [['big', true], ['mid', true], ['small', false]]) {
    const w = walkers(tier); walk(w, 60); let kicks = 0, prev = w.v.sqv;
    for (let i = 0; i < 240; i++) { walk(w, 1); if (w.v.sqv < prev - 0.3) kicks++; prev = w.v.sqv; }
    assert.equal(kicks > 0, expect, `${tier}: thump ${kicks}`);
  }
});

test('arms swing visibly at every size', () => {
  const swing = tier => { const w = walkers(tier); walk(w, 60); let max = 0; for (let i = 0; i < 150; i++) { walk(w, 1); max = Math.max(max, Math.abs(w.v.arms.l)); } return max; };
  const s = { small: swing('small'), mid: swing('mid'), big: swing('big') };
  for (const t of Object.keys(s)) assert.ok(s[t] > 0.25, `${t} arms swing ${s[t].toFixed(2)} rad`);
});

test('a critter with no speed (or any odd input) never produces NaN in its transforms', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const w = walkers(tier); w.c.speed = 0; for (let i = 0; i < 30; i++) { w.c.x += 0.05; w.v.update(DT, i * DT); }
    for (const state of ['windup', 'recover']) { w.c.state = state; w.c.actDur = 0.3; w.c.t = 0.15; w.v.update(DT, 1); }
    for (const o of [w.v.rig.position, w.v.rig.scale, w.v.rig.rotation, ...w.v.bones.map(b => b.position), ...w.v.bones.map(b => b.rotation)]) for (const n of o.toArray().slice(0, 3)) assert.ok(Number.isFinite(n), `${tier}: ${n}`);
  }
});

// ---- the attack, through the real view ----
import { TIERS } from '../src/game/critters.js';
const attackFrames = (w, state, dur, from, to) => { w.c.state = state; w.c.actDur = dur; const peak = {}; for (let i = from; i <= to; i++) { w.c.t = dur * (1 - i / 100); w.v.update(0.005, i); if (i === to) Object.assign(peak, { armL: w.v.bones[BONE.armL].rotation.x, armR: w.v.bones[BONE.armR].rotation.x, lean: (w.c.tier === 'small' ? w.v.bones[BONE.head] : w.v.bones[BONE.body]).rotation.x, lunge: Math.hypot(w.v.rig.position.x, w.v.rig.position.z) }); } return peak; };

test('the wind-up and strike reach the bones: giant hoists both fists then slams, furry hoists one claw, mini crouches then dives', () => {
  const big = walkers('big'); big.c.heading = 0.7;
  let p = attackFrames(big, 'windup', 0.5, 0, 100); assert.ok(p.armL < -2.4 && p.armR < -2.4, `giant fists overhead (${p.armL.toFixed(2)}, ${p.armR.toFixed(2)})`); assert.ok(p.lean < -0.25, 'leaning back');
  p = attackFrames(big, 'recover', 0.45, 0, 20); assert.ok(p.armL > -0.8 && p.lean > 0.3, `slammed down (${p.armL.toFixed(2)})`);
  assert.ok(p.lunge > 0.1 && p.lunge <= TIERS.big.atk.reach + 1e-6, 'the lunge goes along its heading and stays inside its reach');
  const mid = walkers('mid'); p = attackFrames(mid, 'windup', 0.3, 0, 100); assert.ok(p.armR < -2.2 && p.armL > -1, 'furry: one claw up');
  const mini = walkers('small'); p = attackFrames(mini, 'windup', 0.15, 0, 100); assert.ok(p.lean < -0.3 && p.armL > 0.5, 'mini crouches and draws back');
  p = attackFrames(mini, 'recover', 0.25, 0, 30); assert.ok(p.lean > 0.4 && p.lunge > 0.25 && p.lunge <= TIERS.small.atk.reach + 1e-6, 'mini dives forward');
});

test('after the attack the critter goes back to a clean rest pose (no arm splay or lunge left over)', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const w = walkers(tier); attackFrames(w, 'windup', 0.4, 0, 100); attackFrames(w, 'recover', 0.4, 0, 100); w.c.state = 'chase'; w.c.t = 0;
    for (let i = 0; i < 120; i++) w.v.update(DT, i);                              // standing still again
    const o = offsets(w.v); assert.ok(Math.abs(o.armL) + Math.abs(o.armR) < 0.02, `${tier}: arms at rest`);
    for (const b of [BONE.armL, BONE.armR]) assert.ok(Math.abs(w.v.bones[b].rotation.z) < 1e-6, `${tier}: no leftover splay`);
    assert.ok(Math.hypot(w.v.rig.position.x, w.v.rig.position.z) < 1e-6, `${tier}: no leftover lunge`);
  }
});

test('an attack cut short mid-pose (state changes abruptly) leaves no arm splay behind', () => {
  for (const tier of ['small', 'mid', 'big']) {
    const w = walkers(tier); attackFrames(w, 'windup', 0.4, 0, 100);                  // fully wound up: arms splayed
    assert.ok(Math.abs(w.v.bones[BONE.armL].rotation.z) + Math.abs(w.v.bones[BONE.armR].rotation.z) > 0.05, `${tier}: splayed at the peak`);
    w.c.state = 'chase'; w.v.update(DT, 0);
    for (const b of [BONE.armL, BONE.armR]) assert.equal(w.v.bones[b].rotation.z, 0, `${tier}: splay cleared`);
  }
});

test('the strike gives the body a jolt, the giant the biggest', () => {
  const jolt = tier => { const w = walkers(tier); w.c.state = 'windup'; w.c.actDur = 0.3; w.c.t = 0.01; w.v.update(DT, 0); w.v.sqv = 0; w.c.state = 'recover'; w.c.actDur = 0.3; w.c.t = 0.3; w.v.update(DT, 1); return w.v.sqv; };
  assert.ok(jolt('big') < jolt('mid') && jolt('mid') < jolt('small') && jolt('small') < 0, 'negative impulses, bigger for bigger critters');
});
