// Shell prop for the belt. The shotgun itself, the arms and the carried shells are authored in Blender (see blender/README.md).
import * as THREE from 'three';

/** A shotgun shell: red plastic body, brass base. Origin at the base, pointing up (+Y). */
export function buildShell(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.17, 10), new THREE.MeshBasicMaterial({ color: '#d9463e' })); body.position.y = 0.105;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 10), new THREE.MeshBasicMaterial({ color: '#d9a441' })); base.position.y = 0.025;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, 10), new THREE.MeshBasicMaterial({ color: '#b8352f' })); cap.position.y = 0.196;
  g.add(body, base, cap); g.scale.setScalar(scale); return g;
}
