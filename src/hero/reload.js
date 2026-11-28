// Reload choreography as pure timing, so every visual and sound hangs off one table and it can be unit tested.
// progress p runs 0..1 across the whole reload (whatever the reload time is), or < 0 when not reloading.
//
//   0.00 - 0.14  barrels break open (hinge down, chambers lift into view)
//   0.14         old shells EJECT from the chambers
//   0.14 - 0.28  free hand goes to the belt
//   0.28         hand GRABS two fresh shells
//   0.28 - 0.66  carries them to the open breech
//   0.66         shells INSERT (vanish into the chambers)
//   0.66 - 0.84  barrels snap shut
//   0.84         CLOSE (click)
//   0.84 - 1.00  hand returns to the forend; belt shells refill at 0.90
export const REL = { open: 0.14, grab: 0.28, insert: 0.66, close: 0.84, back: 1, refill: 0.9 };
export const RELOAD_EVENTS = [
  { at: REL.open, name: 'eject' }, { at: REL.grab, name: 'grab' }, { at: REL.insert, name: 'insert' }, { at: REL.close, name: 'close' },
];

export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const seg = (p, a, b) => (p - a) / (b - a);

/** Where everything is at progress p. hand: which leg of its trip the free hand is on, and how far along (0..1). */
export function reloadPose(p) {
  if (p < 0) return { barrelOpen: 0, hand: 'forend', t: 0, shellsInHand: false, beltTaken: false };
  let barrelOpen, hand, t;
  if (p < REL.open) { barrelOpen = smooth(seg(p, 0, REL.open)); hand = 'forend'; t = 0; }
  else if (p < REL.grab) { barrelOpen = 1; hand = 'toBelt'; t = smooth(seg(p, REL.open, REL.grab)); }
  else if (p < REL.insert) { barrelOpen = 1; hand = 'toBreech'; t = smooth(seg(p, REL.grab, REL.insert)); }
  else if (p < REL.close) { const k = seg(p, REL.insert, REL.close); barrelOpen = 1 - smooth(k); hand = 'liftAway'; t = smooth(k); }
  else { barrelOpen = 0; hand = 'toForend'; t = smooth(seg(p, REL.close, REL.back)); }
  return { barrelOpen, hand, t, shellsInHand: p >= REL.grab && p < REL.insert, beltTaken: p >= REL.grab && p < REL.refill };
}

/** Events whose moment lies in (prev, cur]. prev < 0 means "the reload just started". Each fires once per reload, whatever the frame step. */
export function crossed(prev, cur) {
  if (cur < 0) return [];
  const from = prev < 0 || cur < prev ? -1 : prev;
  return RELOAD_EVENTS.filter(e => e.at > from && e.at <= cur).map(e => e.name);
}
