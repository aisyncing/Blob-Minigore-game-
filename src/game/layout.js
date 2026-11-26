// The test arena as plain data, so collision and rendering come from one source and the layout can be unit tested.
// Coordinates: x east, y south (world Z). Boxes use centre + half extents.
export const BOUNDS = { minX: -24, maxX: 24, minY: -16, maxY: 16 };
export const SPAWN = { x: 0, y: 7 };

export const LAYOUT = {
  posts:   [[-20, 6.0], [-17, 8.4], [-14, 6.0], [-11, 8.4], [-8, 6.0]],            // west: slalom
  pillars: [{ x: -1, y: -4.5, r: 1.8 }],                                           // centre
  rocks:   [{ x: -6, y: -8, s: 1.0 }, { x: 3.2, y: -9.2, s: 1.1 }, { x: -4.4, y: -1.6, s: 0.7 }],
  walls: [                                                                         // east: S corridor, lanes 2.8 wide
    { x: 4, y: -5.3, hw: 0.6, hh: 4.7, group: 'maze' },                            // spine
    { x: 11.75, y: -9.2, hw: 7.75, hh: 0.6, group: 'maze' },                       // top wall, open to the east
    { x: 16.25, y: -5.2, hw: 7.75, hh: 0.6, group: 'maze' },                       // middle wall, open to the west
    { x: 11.75, y: -1.2, hw: 7.75, hh: 0.6, group: 'maze' },                       // bottom wall, open to the east
  ],
  crates: [                                                                        // south: a cluster to bump off
    { x: -8, y: 12.5, s: 1.2, group: 'cluster' }, { x: -6.7, y: 12.5, s: 1.2, group: 'cluster' }, { x: -7.35, y: 11.3, s: 1.2, group: 'cluster' },
    { x: 9, y: 11.6, s: 1.5 },
  ],
  trees: [[21.4, 13.4], [-21.8, 12.6], [21.2, -13.4], [13, 13.8]],
  lamps: [[-12, 1], [16, 2], [0, 14]],
  // training range, north-west corner
  range: {
    still: [[-20.5, -13], [-16.5, -13], [-12.5, -13], [-8.5, -13]],                       // a row of still dummies
    patrol: { path: [[-20.5, -2], [-9.5, -2], [-9.5, -6], [-20.5, -6]], count: 3, speed: 3 }, // three dummies looping round a rectangle
    board: { x: -4, y: -12.5, hw: 2.2, hh: 0.25, height: 2.2 },                    // keeps pellet marks so you can read your pattern
  },
};
export const TARGET_R = 0.55;

export const POST_R = 0.42, TREE_R = 0.6, LAMP_R = 0.3, ROCK_K = 0.92;

/** Collision world derived from the layout. Every collider remembers its group so tests can tell a deliberate cluster from a pocket. */
export function buildWorld(L = LAYOUT, bounds = BOUNDS) {
  const circles = [], boxes = [];
  for (const [x, y] of L.posts) circles.push({ x, y, r: POST_R });
  for (const p of L.pillars) circles.push({ x: p.x, y: p.y, r: p.r });
  for (const r of L.rocks) circles.push({ x: r.x, y: r.y, r: r.s * ROCK_K });
  for (const [x, y] of L.trees) circles.push({ x, y, r: TREE_R });
  for (const [x, y] of L.lamps) circles.push({ x, y, r: LAMP_R });
  for (const w of L.walls) boxes.push({ x: w.x, y: w.y, hw: w.hw, hh: w.hh, group: w.group });
  for (const c of L.crates) boxes.push({ x: c.x, y: c.y, hw: c.s / 2, hh: c.s / 2, group: c.group });
  boxes.push({ x: L.range.board.x, y: L.range.board.y, hw: L.range.board.hw, hh: L.range.board.hh, kind: 'board' });
  return { bounds, circles, boxes };
}

/** Everything the range adds that is NOT a static collider: still dummies and the patrol zone, for clearance tests. */
export function rangeFootprint(L = LAYOUT) {
  const xs = L.range.patrol.path.map(p => p[0]), ys = L.range.patrol.path.map(p => p[1]);
  const x0 = Math.min(...xs) - TARGET_R, x1 = Math.max(...xs) + TARGET_R, y0 = Math.min(...ys) - TARGET_R, y1 = Math.max(...ys) + TARGET_R;
  return {
    still: L.range.still.map(([x, y]) => ({ x, y, r: TARGET_R, group: 'range-still' })),
    patrolZone: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, hw: (x1 - x0) / 2, hh: (y1 - y0) / 2, group: 'patrol' },
  };
}
