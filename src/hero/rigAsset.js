// The arms, hands, shotgun and shells, authored in Blender (blender/*.py) and exported as one .glb that is embedded in the page.
import glb from '../assets/hero_rig.glb';
import meta from '../assets/hero_rig.json';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toon } from '../engine/stage.js';

export { meta };

export async function loadRig() {
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return { scene: gltf.scene, clips: Object.fromEntries(gltf.animations.map(a => [a.name, a])), meta };
}

/** One independent copy of the rig for a hero. The sleeve takes the design's colour; everything else keeps the authored colours. */
export function cloneRig(rig, sleeveColor) {
  const root = SkeletonUtils.clone(rig.scene);
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material, m = toon(src.color.clone(), {}); m.name = src.name;
    if (src.name === 'sleeve') m.color.set(sleeveColor);
    o.material = m; o.castShadow = true; o.frustumCulled = false;
  });
  return root;
}
