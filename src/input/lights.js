// What the controller's lightbar and player LEDs should show. Pure and unit tested; main.js only feeds it the game state and sends the result.
//
//   lightbar   in a run it is your health: green with all your hits, amber with two of three, red on the last hit and pulsing like a heartbeat.
//              Events flash over it (a hit flashes white, a countdown tick cyan, a new wave gold, a new weapon orange) and fade back.
//              In menus it takes the colour of the hero you are choosing.
//   LEDs       the five white lights under the touchpad: your ammo (they drain as you fire and all blink while you reload), or your health, or off.

const clamp01 = v => Math.min(1, Math.max(0, v));
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export const COLORS = { green: [40, 255, 90], amber: [255, 180, 20], red: [255, 25, 25], white: [255, 255, 255], cyan: [60, 220, 255], gold: [255, 205, 40], orange: [255, 110, 20], dim: [60, 8, 8] };

/** Health as a colour: full = green, around half = amber, low = red. */
export function healthColor(frac) {
  const f = clamp01(frac);
  return f >= 0.5 ? mix(COLORS.amber, COLORS.green, (f - 0.5) / 0.5) : mix(COLORS.red, COLORS.amber, f / 0.5);
}

/** A hex colour '#rrggbb' as [r, g, b]. */
export function hexRgb(hex) { const n = parseInt(String(hex).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/**
 * @param s { screen: 'menu' | 'play' | 'paused' | 'over', hero: [r,g,b], hp, max, t (seconds), flash: { color, k } (k 0..1 = how much of the flash is left) }
 * @returns [r, g, b] 0..255, before the player's brightness setting
 */
export function lightColor({ screen = 'menu', hero = [255, 110, 177], hp = 1, max = 1, t = 0, flash = null }) {
  let c;
  if (screen === 'menu' || screen === 'paused') c = mix(hero, [0, 0, 0], screen === 'paused' ? 0.45 : 0);
  else if (screen === 'over') c = COLORS.dim;
  else {
    const frac = max > 0 ? hp / max : 0, critical = hp <= 1 && max > 1 || frac <= 0.2;
    c = healthColor(frac);
    if (critical) c = mix(COLORS.dim, c, 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4)));         // a heartbeat
  }
  if (flash && flash.k > 0) c = mix(c, flash.color, clamp01(flash.k));
  return c.map(v => Math.round(Math.min(255, Math.max(0, v))));
}

/** A flash that fades: start it with cue(color, seconds), read it with state(dt). */
export function createFlash() {
  let color = COLORS.white, left = 0, total = 1;
  return { cue(c, secs = 0.4) { color = c; left = total = secs; }, step(dt) { left = Math.max(0, left - dt); return left > 0 ? { color, k: (left / total) ** 1.5 } : null; }, clear() { left = 0; } };
}

/** The five LEDs as a bit mask, filling from the middle outward, as the console's own player-number lights do. */
const FILL = [0b00000, 0b00100, 0b01010, 0b10101, 0b11011, 0b11111];
export const ledMask = n => FILL[Math.min(5, Math.max(0, Math.round(n)))];

/**
 * @param mode 'off' | 'ammo' | 'health'
 * @returns the 5-bit mask, or null when the LEDs should be left alone
 */
export function ledPattern({ mode = 'ammo', ammo = 1, capacity = 1, reloading = false, hp = 1, max = 1, t = 0 }) {
  if (mode === 'off') return 0;
  if (mode === 'ammo') {
    if (reloading) return Math.floor(t * 6) % 2 ? 0b11111 : 0b00000;                                   // blink while the magazine is out
    return ledMask(capacity > 0 ? Math.ceil(clamp01(ammo / capacity) * 5 - 1e-9) : 0);
  }
  return ledMask(max > 0 ? Math.ceil(clamp01(hp / max) * 5 - 1e-9) : 0);
}

/** The player's lightbar brightness (0..1) applied to a colour. */
export const scaleColor = (c, k) => c.map(v => Math.round(v * clamp01(k)));
