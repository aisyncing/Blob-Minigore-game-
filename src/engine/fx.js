// Small pooled effects: dust puffs and expanding ground rings. No allocation per effect.
import * as THREE from 'three';
import { R2 } from './stage.js';

export function createFx(scene) {
  const geo = new THREE.SphereGeometry(1, 7, 5);
  const parts = Array.from({ length: 160 }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })); m.visible = false; scene.add(m);
    return { m, life: 0, max: 1, v: new THREE.Vector3(), size: 1, grow: 0, g: 0, op: 1 };
  });
  const rings = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 28), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, life: 0, max: 0.4, size: 1 };
  });
  function emit(x, y, z, vx, vy, vz, life, size, color, { grow = 0, g = 0, op = 0.85 } = {}) {
    const p = parts.find(q => q.life <= 0); if (!p) return;
    p.m.position.set(x, y, z); p.v.set(vx, vy, vz); p.life = p.max = life; p.size = size; p.grow = grow; p.g = g; p.op = op;
    p.m.material.color.set(color); p.m.visible = true;
  }
  function ring(x, z, size, color, life = 0.4) {
    const r = rings.find(q => q.life <= 0); if (!r) return;
    r.m.position.set(x, 0.06, z); r.life = r.max = life; r.size = size; r.m.material.color.set(color); r.m.visible = true;
  }
  /** Footstep / skid dust. `strength` 0..1. */
  function dust(x, z, dirx, dirz, strength = 0.5, color = '#cdbd9a') {
    const n = 1 + Math.round(strength * 2);
    for (let i = 0; i < n; i++) emit(x, 0.1, z, -dirx * 0.4 + R2(-0.5, 0.5), R2(0.3, 0.9) * (0.5 + strength), -dirz * 0.4 + R2(-0.5, 0.5), R2(0.3, 0.5), R2(0.08, 0.16) * (0.6 + strength), color, { grow: 1.4, op: 0.45 + 0.25 * strength });
  }

  /* ---- muzzle flash: a pointed star lying on the ground plane, plus one short-lived light ---- */
  const flashTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 100, 4, 64, 60, 70); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(64, 0); g.lineTo(84, 58); g.lineTo(124, 70); g.lineTo(84, 84); g.lineTo(64, 128); g.lineTo(44, 84); g.lineTo(4, 70); g.lineTo(44, 58); g.closePath(); g.fill(); return new THREE.CanvasTexture(c); })();
  const flashes = Array.from({ length: 4 }, () => {
    const grp = new THREE.Group(), m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; grp.add(m); grp.visible = false; scene.add(grp); return { grp, m, life: 0, max: 0.09, len: 2 };
  });
  const flashLight = new THREE.PointLight('#ffb050', 0, 12, 2); scene.add(flashLight); let flashLightT = 0;
  function flash(x, y, z, dx, dz, len = 2.4) {
    const f = flashes.find(q => q.life <= 0) || flashes[0]; f.grp.position.set(x, y, z); f.grp.rotation.y = Math.atan2(dx, dz); f.life = f.max = 0.09; f.len = len * (0.85 + Math.random() * 0.3); f.grp.visible = true;
    flashLight.position.set(x + dx * 0.8, y + 0.6, z + dz * 0.8); flashLight.intensity = 90; flashLightT = 0.07;
  }
  function smoke(x, y, z, dx, dz) { for (let i = 0; i < 5; i++) emit(x + dx * i * 0.25, y, z + dz * i * 0.25, dx * R2(1, 3) + R2(-0.5, 0.5), R2(0.3, 0.9), dz * R2(1, 3) + R2(-0.5, 0.5), R2(0.5, 0.9), R2(0.12, 0.2), '#b8b4aa', { grow: 3.2, op: 0.4 }); }
  function sparks(x, z, nx, nz, color = '#ffe08a', n = 5) { for (let i = 0; i < n; i++) emit(x, 0.7, z, nx * R2(1, 4) + R2(-2, 2), R2(0.5, 2.5), nz * R2(1, 4) + R2(-2, 2), R2(0.15, 0.3), R2(0.03, 0.06), color, { g: 12, op: 1 }); }

  /* ---- ejected shell casings: tumble, bounce, settle, fade ---- */
  const casingGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.2, 8), casings = Array.from({ length: 28 }, () => {
    const g = new THREE.Group(), body = new THREE.Mesh(casingGeo, new THREE.MeshBasicMaterial({ color: '#d9463e' })), base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), new THREE.MeshBasicMaterial({ color: '#d9a441' })); base.position.y = -0.1; g.add(body, base); g.visible = false; scene.add(g);
    return { g, body, base, size: 1, life: 0, v: new THREE.Vector3(), spin: new THREE.Vector3() };
  });
  /** brass = a small brass casing (pistol, SMG) instead of a red shotgun shell */
  function casing(x, y, z, vx, vy, vz, brass = false) { const c = casings.find(q => q.life <= 0) || casings[0]; c.size = brass ? 0.38 : 1; c.body.material.color.set(brass ? '#e3b441' : '#d9463e'); c.base.material.color.set(brass ? '#c9952a' : '#d9a441'); c.g.position.set(x, y, z); c.v.set(vx, vy, vz); c.spin.set(R2(-12, 12), R2(-12, 12), R2(-12, 12)); c.life = brass ? 3 : 5; c.g.visible = true; c.g.scale.setScalar(c.size); }

  /* ---- floating damage numbers ---- */
  const numbers = Array.from({ length: 24 }, () => {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.6, 0.8, 1); sp.visible = false; sp.renderOrder = 10; scene.add(sp);
    return { sp, cv, tex, life: 0, max: 0.8 };
  });
  function number(x, y, z, text, color = '#ffffff') {
    const n = numbers.find(q => q.life <= 0) || numbers[0], g = n.cv.getContext('2d'); g.clearRect(0, 0, 128, 64); g.font = '700 40px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = '#1d1530'; g.strokeText(text, 64, 34); g.fillStyle = color; g.fillText(text, 64, 34); n.tex.needsUpdate = true;
    n.sp.position.set(x + R2(-0.2, 0.2), y, z); n.life = n.max = 0.8; n.sp.visible = true;
  }

  /* ---- the wad: the little cardboard/plastic disc that follows the pellets out of the barrel, then drops ---- */
  const wads = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 10), new THREE.MeshBasicMaterial({ color: '#d9463e', transparent: true })); m.visible = false; scene.add(m); return { m, life: 0, v: new THREE.Vector3(), spin: 0 }; });
  function wad(x, y, z, dx, dz) { const w = wads.find(q => q.life <= 0) || wads[0]; w.m.position.set(x, y, z); w.v.set(dx * 16 + R2(-0.6, 0.6), R2(1.2, 2.2), dz * 16 + R2(-0.6, 0.6)); w.spin = R2(-14, 14); w.life = 1.4; w.m.visible = true; w.m.material.opacity = 1; w.m.rotation.set(R2(0, 1), 0, R2(0, 1)); }
  function update(dt) {
    for (const p of parts) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.m.visible = false; continue; }
      const t = 1 - p.life / p.max; p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.y = 0; }
      p.m.scale.setScalar(p.size * (1 + p.grow * t)); p.m.material.opacity = p.op * (1 - t) * (1 - t * 0.3);
    }
    for (const w of wads) { if (w.life <= 0) continue; w.life -= dt; if (w.life <= 0) { w.m.visible = false; continue; }
      w.v.x *= Math.exp(-3.2 * dt); w.v.z *= Math.exp(-3.2 * dt); w.v.y -= 16 * dt; w.m.position.addScaledVector(w.v, dt); w.m.rotation.x += w.spin * dt; w.m.rotation.z += w.spin * 0.7 * dt;
      if (w.m.position.y < 0.05) { w.m.position.y = 0.05; w.v.set(0, 0, 0); w.spin = 0; w.m.rotation.x = 0; w.m.rotation.z = 0; } w.m.material.opacity = Math.min(1, w.life / 0.5); }
    for (const f of flashes) { if (f.life <= 0) continue; f.life -= dt; if (f.life <= 0) { f.grp.visible = false; continue; } const k = f.life / f.max; f.grp.scale.set(0.9 + (1 - k) * 0.5, 1, f.len * (0.6 + (1 - k) * 0.7)); f.m.material.opacity = k; }
    if (flashLightT > 0) { flashLightT -= dt; flashLight.intensity = Math.max(0, flashLightT / 0.07) * 90; }
    for (const c of casings) { if (c.life <= 0) continue; c.life -= dt; if (c.life <= 0) { c.g.visible = false; continue; }
      c.v.y -= 22 * dt; c.g.position.addScaledVector(c.v, dt); c.g.rotation.x += c.spin.x * dt; c.g.rotation.z += c.spin.z * dt;
      if (c.g.position.y < 0.06) { c.g.position.y = 0.06; if (Math.abs(c.v.y) > 1) { c.v.y *= -0.4; c.v.x *= 0.6; c.v.z *= 0.6; c.spin.multiplyScalar(0.5); } else { c.v.set(0, 0, 0); c.spin.set(0, 0, 0); } }
      if (c.life < 0.6) c.g.scale.setScalar(c.size * c.life / 0.6); }
    for (const n of numbers) { if (n.life <= 0) continue; n.life -= dt; if (n.life <= 0) { n.sp.visible = false; continue; } const t = 1 - n.life / n.max; n.sp.position.y += dt * (2.4 - t * 1.6); n.sp.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3; const sc = t < 0.15 ? 0.6 + t / 0.15 * 0.5 : 1.1; n.sp.scale.set(1.6 * sc, 0.8 * sc, 1); }
    for (const r of rings) {
      if (r.life <= 0) continue; r.life -= dt; if (r.life <= 0) { r.m.visible = false; continue; }
      const t = 1 - r.life / r.max; r.m.scale.setScalar(r.size * (0.35 + t * 1.2)); r.m.material.opacity = 0.9 * (1 - t) * (1 - t);
    }
  }
  return { emit, ring, dust, flash, smoke, sparks, casing, wad, number, update };
}
