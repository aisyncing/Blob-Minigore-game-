// Shared three.js setup: renderer, lights, toon material, painted-texture helper.
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const R2 = (a, b) => a + Math.random() * (b - a);

const ramp = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
/** 3-band toon material with a high floor: soft, candy-like shading that still reads as hand painted. */
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...o });

export function paintCanvas(w, h, fn, { repeat = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Flat-shaded (faceted) copy of a geometry: the low-poly storybook look. */
export const facet = g => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };

export function shade(hex, dl) {
  const c = new THREE.Color(hex), hs = {}; c.getHSL(hs, THREE.SRGBColorSpace);
  c.setHSL(hs.h, hs.s, clamp(hs.l + dl, 0, 1), THREE.SRGBColorSpace); return '#' + c.getHexString(THREE.SRGBColorSpace);
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c1512'); scene.fog = new THREE.Fog('#0e1a17', 38, 90);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 220);
  scene.add(new THREE.HemisphereLight('#8aa4e0', '#27403a', 1.25));          // cool ambient
  const sun = new THREE.DirectionalLight('#a9bcff', 1.7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 24, bottom: -24, near: 1, far: 90 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();

  /** Keep the shadow-casting sun centred on whatever the camera is looking at. */
  function lightFollow(x, z) { sun.position.set(x - 16, 34, z + 14); sun.target.position.set(x, 0, z); sun.target.updateMatrixWorld(); }
  return { renderer, scene, camera, sun, resize, lightFollow, render: () => renderer.render(scene, camera) };
}
