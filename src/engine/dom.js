// Tiny DOM helpers shared by both pages.
export const $ = (s, r = document) => r.querySelector(s);
export const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
