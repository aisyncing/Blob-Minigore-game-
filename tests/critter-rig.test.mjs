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
