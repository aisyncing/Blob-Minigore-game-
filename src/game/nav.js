// Coarse navigation round the props, for enemies that cannot see the player. Pure logic, no DOM, unit tested.
//
// Built once per world: a CLEARANCE grid, the distance from each cell centre to the nearest collider or arena edge.
// Built on demand: a FLOW field per body size, the path cost from every cell to the cell the player stands in (Dijkstra, 8-way).
// A gap narrower than the body is closed to it; a snug one costs extra, so paths keep to the middle of a lane and a big one prefers
// the wide way round. A cell with no way to the player reads Infinity (the crowd then digs that enemy out somewhere else). A field is rebuilt only when the player has moved to another cell, and at most a few times a second.
//
// An enemy reads it by walking downhill a few cells from where it stands and heading for the farthest of those it can reach in a
// straight line with room for its body (so it cuts corners smoothly instead of zig-zagging cell to cell).
// fit: how much tighter than the body a gap may read and still count as open (the grid samples clearance at cell centres, so it reads
// a little low); a Giant (3.0 across) cannot take the 2.8-wide S-corridor lanes, and the field must know that, not lead it into a wedge
export const NAV = { cell: 0.5, rebuild: 0.25, ahead: 10, squeeze: 8, pad: 0.15, fit: 0.1 };

const SQ2 = Math.SQRT2, DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
const DX = DIRS.map(d => d[0]), DY = DIRS.map(d => d[1]), LEN = DIRS.map(d => d[2]);   // the first four are straight, the rest diagonal

/** Signed distance from a point to an axis-aligned box (negative inside). */
function sdBox(px, py, b) {
  const dx = Math.abs(px - b.x) - b.hw, dy = Math.abs(py - b.y) - b.hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

/** Distance from (x, y) to the nearest thing in the world (props and the arena edge). Negative inside a prop. */
export function clearanceAt(x, y, world) {
  const B = world.bounds;
  let c = Math.min(x - B.minX, B.maxX - x, y - B.minY, B.maxY - y);
  for (const o of world.circles) c = Math.min(c, Math.hypot(x - o.x, y - o.y) - o.r);
  for (const b of world.boxes) c = Math.min(c, sdBox(x, y, b));
  return c;
}

// a binary min-heap of cell indices in a preallocated Int32Array, keyed by a cost array; h.n is its size. Lazy deletion: a cell can be
// pushed more than once, and the build skips it when it comes up again after it was settled.
function heapPush(h, k, i) { const a = h.a; let n = h.n++; while (n > 0) { const p = (n - 1) >> 1; if (k[a[p]] <= k[i]) break; a[n] = a[p]; n = p; } a[n] = i; }
function heapPop(h, k) {
  const a = h.a, top = a[0], len = --h.n; if (!len) return top;
  const last = a[len], lk = k[last]; let n = 0;
  for (;;) { const l = n * 2 + 1, r = l + 1; let m = n, mk = lk; if (l < len && k[a[l]] < mk) { m = l; mk = k[a[l]]; } if (r < len && k[a[r]] < mk) m = r; if (m === n) break; a[n] = a[m]; n = m; }
  a[n] = last; return top;
}

export function createNav(world, params = {}) {
  const P = { ...NAV, ...params }, B = world.bounds, cs = P.cell;
  const W = Math.max(1, Math.ceil((B.maxX - B.minX) / cs)), H = Math.max(1, Math.ceil((B.maxY - B.minY) / cs)), N = W * H;
  const clear = new Float32Array(N);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) clear[gy * W + gx] = clearanceAt(B.minX + (gx + 0.5) * cs, B.minY + (gy + 0.5) * cs, world);
  const fields = new Map(), heap = { a: new Int32Array(N * 8 + 1), n: 0 }, done = new Uint8Array(N);
  let lastBuild = NaN;

  const gxOf = x => Math.max(0, Math.min(W - 1, Math.floor((x - B.minX) / cs))), gyOf = y => Math.max(0, Math.min(H - 1, Math.floor((y - B.minY) / cs)));
  const cellOf = (x, y) => gyOf(y) * W + gxOf(x);
  const cx = i => B.minX + (i % W + 0.5) * cs, cy = i => B.minY + (Math.floor(i / W) + 0.5) * cs;

  /** clearance between cell centres, bilinear */
  function clearAt(x, y) {
    const fx = Math.max(0, Math.min(W - 1.001, (x - B.minX) / cs - 0.5)), fy = Math.max(0, Math.min(H - 1.001, (y - B.minY) / cs - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const a = clear[y0 * W + x0], b = clear[y0 * W + x1], c = clear[y1 * W + x0], d = clear[y1 * W + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /** A field for bodies of radius r. Each step costs its length times a squeeze penalty that grows as the gap gets tighter than the
   *  body (plus a little pad); worked out per cell once, here, so a rebuild is only the search. */
  function makeField(r) {
    const open = new Uint8Array(N), mult = new Float32Array(N), min = Math.max(0.02, r - P.fit), need = r + P.pad;
    for (let i = 0; i < N; i++) { open[i] = clear[i] >= min ? 1 : 0; mult[i] = cs * (1 + P.squeeze * Math.max(0, need - clear[i]) / need); }
    return { r, open, mult, cost: new Float32Array(N), goal: -1, at: -Infinity, version: 0 };
  }
  function build(f, goal) {
    const cost = f.cost, open = f.open, mult = f.mult, h = heap;
    cost.fill(Infinity); done.fill(0); h.n = 0; cost[goal] = 0; heapPush(h, cost, goal);
    while (h.n) {
      const i = heapPop(h, cost); if (done[i]) continue; done[i] = 1;
      const x = i % W, y = (i - x) / W, ci = cost[i];
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (!open[j] || done[j]) continue;
        if (k >= 4 && (!open[y * W + nx] || !open[ny * W + x])) continue;            // no cutting a corner through a prop
        const c = ci + LEN[k] * mult[j];
        if (c < cost[j]) { cost[j] = c; heapPush(h, cost, j); }
      }
    }
    f.goal = goal; f.version++;
  }

  const N8 = (i, fn) => { const x = i % W, y = (i - x) / W; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) fn(ny * W + nx, dx, dy, x, y); } };

  /** The best cell to start from: its own, or (when that one reads as inside a prop) the cheapest one round it. */
  function startCell(f, x, y) {
    let i = cellOf(x, y); if (isFinite(f.cost[i])) return i;
    const gx = gxOf(x), gy = gyOf(y); let best = -1;
    for (let r = 1; r <= 3 && best < 0; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const nx = gx + ox, ny = gy + oy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (isFinite(f.cost[j]) && (best < 0 || f.cost[j] < f.cost[best])) best = j;
    }
    return best;
  }

  /** True when a body of radius `need` fits all along the straight line from (ax, ay) to (bx, by). */
  function roomy(ax, ay, bx, by, need) {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(len / (cs * 0.5)));
    for (let k = 1; k <= n; k++) { const t = k / n; if (clearAt(ax + (bx - ax) * t, ay + (by - ay) * t) < need) return false; }
    return true;
  }

  return {
    W, H, cell: cs, clear, clearAt, cellOf,
    /**
     * The flow field toward (gx, gy) for bodies of radius r. Cached per size; rebuilt when the goal changed cell, at most once per
     * NAV.rebuild seconds of `time` (a slightly stale goal only matters until the enemy can see the player again). Only one field is
     * rebuilt per `time` (one crowd step), so two sizes never both rebuild in the same frame; a brand-new field is always built.
     */
    field(r, gx, gy, time = 0) {
      const key = Math.round(r * 20);
      let f = fields.get(key); if (!f) fields.set(key, f = makeField(key / 20));
      const goal = cellOf(gx, gy);
      if (f.goal < 0 || (goal !== f.goal && time - f.at >= P.rebuild && time !== lastBuild)) { build(f, goal); f.at = lastBuild = time; }
      return f;
    },
    /** Path cost from (x, y) to the field's goal (Infinity when there is no way). */
    costAt(f, x, y) { const i = startCell(f, x, y); return i < 0 ? Infinity : f.cost[i]; },
    /** Unit direction to head in, or null when already in the goal cell or there is no way. */
    steer(f, x, y, r) {
      const cost = f.cost, open = f.open; let cur = startCell(f, x, y); if (cur < 0 || cur === f.goal) return null;
      const path = [];
      for (let k = 0; k < P.ahead && cur !== f.goal; k++) {                         // walk downhill
        let next = -1, nc = cost[cur];
        N8(cur, (j, dx, dy, ox, oy) => { if (cost[j] < nc && !(dx && dy && (!open[oy * W + ox + dx] || !open[(oy + dy) * W + ox]))) { nc = cost[j]; next = j; } });
        if (next < 0) break; path.push(next); cur = next;
      }
      if (!path.length) return null;
      const need = Math.min(r, clearAt(x, y)) * 0.95;
      let pick = path[0];
      for (let k = path.length - 1; k > 0; k--) { const j = path[k]; if (roomy(x, y, cx(j), cy(j), Math.min(need, clear[j]))) { pick = j; break; } }
      const dx = cx(pick) - x, dy = cy(pick) - y, d = Math.hypot(dx, dy);
      return d > 1e-6 ? [dx / d, dy / d] : null;
    },
    /**
     * Somewhere a body of radius r can dig out again: minD..maxD from the goal, with room to stand, and a fairly direct route to it
     * (so it does not pop up in the same dead end). Falls back to the most direct candidate found.
     */
    spot(f, px, py, r, rng, minD = 13, maxD = 19) {
      let best = null, bestQ = Infinity;
      for (let k = 0; k < 40; k++) {
        const a = rng() * Math.PI * 2, d = minD + rng() * (maxD - minD), x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
        if (x < B.minX + r || x > B.maxX - r || y < B.minY + r || y > B.maxY - r || clearAt(x, y) < r + 0.3) continue;
        const c = this.costAt(f, x, y); if (!isFinite(c)) continue;
        const q = c / Math.hypot(x - px, y - py);
        if (q < 1.35) return { x, y };
        if (q < bestQ) { bestQ = q; best = { x, y }; }
      }
      return best;
    },
  };
}
