// Central tuning registry. Every feel value lives here so you can tweak it live,
// copy the numbers, and we lock them into the game when you're happy.

export const DEFS = [
  { key: 'left.inner',  group: 'Left stick (move)', label: 'Inner deadzone', min: 0,   max: 0.4, step: 0.005, def: 0.12 },
  { key: 'left.outer',  group: 'Left stick (move)', label: 'Outer deadzone', min: 0.6, max: 1,   step: 0.005, def: 0.95 },
  { key: 'left.curve',  group: 'Left stick (move)', label: 'Response curve', min: 0.5, max: 3,   step: 0.05,  def: 1.0 },
  { key: 'right.inner', group: 'Right stick (aim)', label: 'Inner deadzone', min: 0,   max: 0.4, step: 0.005, def: 0.10 },
  { key: 'right.outer', group: 'Right stick (aim)', label: 'Outer deadzone', min: 0.6, max: 1,   step: 0.005, def: 0.95 },
  { key: 'right.curve', group: 'Right stick (aim)', label: 'Response curve', min: 0.5, max: 3,   step: 0.05,  def: 1.0 },
  { key: 'trigger.press',   group: 'Fire trigger', label: 'Press at',    min: 0.05, max: 0.95, step: 0.01, def: 0.5 },
  { key: 'trigger.release', group: 'Fire trigger', label: 'Release at',  min: 0.02, max: 0.9,  step: 0.01, def: 0.35 },
  // ---- hero scene (Iteration 1) ----
  { key: 'move.maxSpeed', page: 'hero', group: 'Movement', label: 'Top speed (u/s)',   min: 3,   max: 14,  step: 0.1,  def: 7.5 },
  { key: 'move.accel',    page: 'hero', group: 'Movement', label: 'Acceleration',      min: 10,  max: 220, step: 1,    def: 70 },
  { key: 'move.brake',    page: 'hero', group: 'Movement', label: 'Braking',           min: 10,  max: 220, step: 1,    def: 60 },
  { key: 'move.turnAccel',page: 'hero', group: 'Movement', label: 'Turn / reverse',    min: 10,  max: 260, step: 1,    def: 110 },
  { key: 'aim.follow',    page: 'hero', group: 'Body', label: 'Upper body turn speed', min: 6,   max: 60,  step: 1,    def: 26 },
  { key: 'legs.follow',   page: 'hero', group: 'Body', label: 'Leg turn speed',        min: 4,   max: 40,  step: 1,    def: 16 },
  { key: 'anim.squash',   page: 'hero', group: 'Body', label: 'Squash and stretch',    min: 0,   max: 2,   step: 0.05, def: 1 },
  { key: 'anim.lean',     page: 'hero', group: 'Body', label: 'Lean into motion',      min: 0,   max: 2,   step: 0.05, def: 1 },
  { key: 'anim.bob',      page: 'hero', group: 'Body', label: 'Step bob',              min: 0,   max: 2,   step: 0.05, def: 1 },
  { key: 'anim.stepLen',  page: 'hero', group: 'Body', label: 'Step length (units)',   min: 0.8, max: 2.4, step: 0.05, def: 1.3 },
  { key: 'cam.dist',      page: 'hero', group: 'Camera', label: 'Distance',            min: 12,  max: 38,  step: 0.5,  def: 24 },
  { key: 'cam.tilt',      page: 'hero', group: 'Camera', label: 'Tilt (degrees)',      min: 35,  max: 80,  step: 1,    def: 58 },
  { key: 'cam.follow',    page: 'hero', group: 'Camera', label: 'Follow speed',        min: 2,   max: 14,  step: 0.5,  def: 6 },
  { key: 'cam.velLead',   page: 'hero', group: 'Camera', label: 'Lead with movement',  min: 0,   max: 0.5, step: 0.01, def: 0.16 },
  { key: 'cam.aimLead',   page: 'hero', group: 'Camera', label: 'Lead with aim (units)',min: 0,  max: 6,   step: 0.1,  def: 2.4 },
  // ---- shotgun and aiming (Iteration 2) ----
  { key: 'gun.pellets',    page: 'hero', group: 'Shotgun', label: 'Pellets per blast',    min: 1,   max: 20,  step: 1,    def: 9 },
  { key: 'gun.spread',     page: 'hero', group: 'Shotgun', label: 'Spread (degrees)',     min: 0.5, max: 25,  step: 0.5,  def: 8 },
  { key: 'gun.bias',       page: 'hero', group: 'Shotgun', label: 'Centre bias',          min: 0,   max: 1,   step: 0.05, def: 0.25 },
  { key: 'gun.damage',     page: 'hero', group: 'Shotgun', label: 'Damage per pellet',    min: 2,   max: 40,  step: 1,    def: 12 },
  { key: 'gun.range',      page: 'hero', group: 'Shotgun', label: 'Range (units)',        min: 6,   max: 30,  step: 0.5,  def: 15 },
  { key: 'gun.falloffStart',page: 'hero', group: 'Shotgun', label: 'Full damage until',   min: 1,   max: 12,  step: 0.25, def: 3.5 },
  { key: 'gun.minDamage',  page: 'hero', group: 'Shotgun', label: 'Damage at max range',  min: 0,   max: 1,   step: 0.05, def: 0.25 },
  { key: 'gun.pelletSpeed',page: 'hero', group: 'Shotgun', label: 'Pellet speed (u/s)',   min: 20,  max: 120, step: 1,    def: 55 },
  { key: 'gun.interval',   page: 'hero', group: 'Shotgun', label: 'Time between barrels', min: 0.1, max: 0.8, step: 0.01, def: 0.28 },
  { key: 'gun.reload',     page: 'hero', group: 'Shotgun', label: 'Reload time (s)',      min: 0.3, max: 2.5, step: 0.05, def: 0.95 },
  { key: 'gun.capacity',   page: 'hero', group: 'Shotgun', label: 'Shells (double barrel = 2)', min: 1, max: 2, step: 1, def: 2 },
  { key: 'gun.recoil',     page: 'hero', group: 'Shotgun', label: 'Recoil shove (u/s)',   min: 0,   max: 9,   step: 0.1,  def: 4 },
  { key: 'assist.mode',    page: 'hero', group: 'Aim', label: 'Aim help (stick / arrows)', kind: 'select', options: ['Manual', 'Assist', 'Auto-aim'], min: 0, max: 2, step: 1, def: 1 },
  { key: 'assist.cone',    page: 'hero', group: 'Aim', label: 'Assist cone (degrees)',    min: 0,   max: 20,  step: 0.5,  def: 8 },
  { key: 'assist.strength',page: 'hero', group: 'Aim', label: 'Assist strength',          min: 0,   max: 1,   step: 0.05, def: 0.5 },
  { key: 'fx.camKick',     page: 'hero', group: 'Feedback', label: 'Camera kick',         min: 0,   max: 1.5, step: 0.05, def: 0.35 },
  { key: 'fx.hitPause',    page: 'hero', group: 'Feedback', label: 'Hit pause on kills (s)', min: 0, max: 0.12, step: 0.005, def: 0.03 },
  { key: 'fx.volume',      page: 'hero', group: 'Feedback', label: 'Volume',              min: 0,   max: 1,   step: 0.05, def: 0.6 },
  { key: 'fx.rumble',      page: 'hero', group: 'Feedback', label: 'Controller rumble',   kind: 'toggle', min: 0, max: 1, step: 1, def: 1 },
  { key: 'fx.numbers',     page: 'hero', group: 'Feedback', label: 'Damage numbers',      kind: 'toggle', min: 0, max: 1, step: 1, def: 1 },
  { key: 'pad.speed', page: 'lab', group: 'Feel pad', label: 'Top speed (units/s)', min: 2, max: 16, step: 0.1, def: 8 },
];

const STORE = 'blobshooter.tuning.v1';
const listeners = new Set();
const values = {};
for (const d of DEFS) values[d.key] = d.def;

try {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  for (const d of DEFS) if (typeof saved[d.key] === 'number') values[d.key] = Math.min(d.max, Math.max(d.min, saved[d.key]));
} catch { /* storage unavailable: defaults are fine */ }

function persist() { try { localStorage.setItem(STORE, JSON.stringify(values)); } catch { /* ignore */ } }

/** Feel presets for the movement trio, so you can compare in one click. */
export const PRESETS = {
  Snappy:   { 'move.maxSpeed': 8.5, 'move.accel': 130, 'move.brake': 120, 'move.turnAccel': 190 },
  Balanced: { 'move.maxSpeed': 7.5, 'move.accel': 70,  'move.brake': 60,  'move.turnAccel': 110 },
  Floaty:   { 'move.maxSpeed': 7,   'move.accel': 38,  'move.brake': 22,  'move.turnAccel': 55 },
};

export const tuning = {
  get: k => values[k],
  set(k, v) { values[k] = v; persist(); listeners.forEach(f => f(k, v)); },
  reset() { for (const d of DEFS) values[d.key] = d.def; persist(); listeners.forEach(f => f(null)); },
  onChange: f => { listeners.add(f); return () => listeners.delete(f); },
  snapshot: () => ({ ...values }),
  apply(obj) { for (const [k, v] of Object.entries(obj)) if (k in values) values[k] = v; persist(); listeners.forEach(f => f(null)); },
  stick: side => ({ inner: values[side + '.inner'], outer: values[side + '.outer'], curve: values[side + '.curve'] }),
  trigger: () => ({ press: values['trigger.press'], release: values['trigger.release'] }),
};
