/* Tetris engine in plain JS: a line-by-line port of env_real.py (SRS rotation + wall kicks + reachability search) and of the value net (VNet).
 * Board: Uint8Array(22*10), row-major, rows 0-1 are the hidden spawn rows, 1 = filled.  Piece ids: 0..6 = I O T S Z J L.
 * Works in a Web Worker (self), in a page (window) and in Node (module.exports). */
(function (root) {
  'use strict';
  const H = 22, W = 10, HIDDEN = 2, OFF = 3, XW = W + 6;
  const ORDER = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const M = {  // SRS rotation states 0,R,2,L; 1 = filled (row, col inside the bounding box)
    I: [[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]], [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]], [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]],
    O: [[[1, 1], [1, 1]], [[1, 1], [1, 1]], [[1, 1], [1, 1]], [[1, 1], [1, 1]]],
    T: [[[0, 1, 0], [1, 1, 1], [0, 0, 0]], [[0, 1, 0], [0, 1, 1], [0, 1, 0]], [[0, 0, 0], [1, 1, 1], [0, 1, 0]], [[0, 1, 0], [1, 1, 0], [0, 1, 0]]],
    S: [[[0, 1, 1], [1, 1, 0], [0, 0, 0]], [[0, 1, 0], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 1], [1, 1, 0]], [[1, 0, 0], [1, 1, 0], [0, 1, 0]]],
    Z: [[[1, 1, 0], [0, 1, 1], [0, 0, 0]], [[0, 0, 1], [0, 1, 1], [0, 1, 0]], [[0, 0, 0], [1, 1, 0], [0, 1, 1]], [[0, 1, 0], [1, 1, 0], [1, 0, 0]]],
    J: [[[1, 0, 0], [1, 1, 1], [0, 0, 0]], [[0, 1, 1], [0, 1, 0], [0, 1, 0]], [[0, 0, 0], [1, 1, 1], [0, 0, 1]], [[0, 1, 0], [0, 1, 0], [1, 1, 0]]],
    L: [[[0, 0, 1], [1, 1, 1], [0, 0, 0]], [[0, 1, 0], [0, 1, 0], [0, 1, 1]], [[0, 0, 0], [1, 1, 1], [1, 0, 0]], [[1, 1, 0], [0, 1, 0], [0, 1, 0]]],
  };
  // SRS kick tables, guideline form: (dx right, dy UP).  [cw/ccw][from state][5 kicks]
  const K_JLSTZ = { cw: [[[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]],
    ccw: [[[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]] };
  const K_I = { cw: [[[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]],
    ccw: [[[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]] };

  // CELLS[p][rot] = flat [r0,c0,r1,c1,...] in row-major order of the filled boxes (same as np.argwhere)
  const CELLS = ORDER.map((n) => M[n].map((mat) => { const o = []; for (let r = 0; r < mat.length; r++) for (let c = 0; c < mat[r].length; c++) if (mat[r][c]) o.push(r, c); return o; }));
  const KIND = ORDER.map((n) => (n === 'I' ? 1 : n === 'O' ? 2 : 0));
  const SPAWN_X = ORDER.map((n) => (W - (n === 'I' ? 4 : n === 'O' ? 2 : 3)) >> 1);
  const KICKS = [K_JLSTZ, K_I].map((tab) => ['cw', 'ccw'].map((key) => tab[key].map((row) => row.map(([dx, dyUp]) => [dx, -dyUp]))));   // board rows grow downward

  /* ---- rules.  'srs'  : standard SRS - a rotation only needs the destination to be free and may be "kicked" sideways / up (the piece is teleported by the kick offset).
   *      'phys' : physical - the piece rotates about its pivot (centre of its 3x3 box, of the 4x4 box for I) and EVERY cell swept while it turns must be free (no block, no wall, no floor);
   *               no kicks.  If there is not enough room to turn, the rotation is simply impossible.  (Open air above the board does not block.) */
  let RULES = 'phys';
  const setRules = (r) => { RULES = r === 'srs' ? 'srs' : 'phys'; };
  const getRules = () => RULES;
  const SWEEP_STEPS = 60, SWEEP_MIN_AREA = 0.02;                                   // angle steps over 90 degrees; a grid cell counts as swept when a moving square overlaps it by >= 2% of the cell
  function clipArea(poly, x0, y0, x1, y1) {                                        // area of (convex polygon) ∩ (axis-aligned box): Sutherland-Hodgman
    const clip = (pts, inside, inter) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(inter(a, b)); } return out; };
    let p = poly;
    p = clip(p, (q) => q[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]); if (!p.length) return 0;
    p = clip(p, (q) => q[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]); if (!p.length) return 0;
    p = clip(p, (q) => q[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]); if (!p.length) return 0;
    p = clip(p, (q) => q[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]); if (!p.length) return 0;
    let ar = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; ar += a[0] * b[1] - b[0] * a[1]; } return Math.abs(ar) / 2;
  }
  function buildSweep() {                                                          // SWEEP[piece][rot][0 = cw, 1 = ccw] = [[dr, dc], ...] relative to the 4x4 / 3x3 box origin
    const out = [];
    for (let p = 0; p < 7; p++) {
      out.push([]); const pivot = ORDER[p] === 'I' ? 2 : 1.5;                      // y down, x right: the cell (r, c) is the square [r, r+1] x [c, c+1]
      for (let rot = 0; rot < 4; rot++) {
        out[p].push([]);
        for (const dir of [1, -1]) {
          const set = new Set();
          if (ORDER[p] !== 'O') for (let k = 0; k < 8; k += 2) {
            const cy = CELLS[p][rot][k] + 0.5 - pivot, cx = CELLS[p][rot][k + 1] + 0.5 - pivot;
            for (let st = 0; st <= SWEEP_STEPS; st++) {
              const th = dir * (Math.PI / 2) * st / SWEEP_STEPS, co = Math.cos(th), si = Math.sin(th);
              const poly = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([u, v]) => { const dx = cx + u, dy = cy + v; return [pivot + dx * co - dy * si, pivot + dx * si + dy * co]; });   // [x, y]
              const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
              for (let r = Math.floor(Math.min(...ys)); r <= Math.floor(Math.max(...ys)); r++) for (let c = Math.floor(Math.min(...xs)); c <= Math.floor(Math.max(...xs)); c++)
                if (clipArea(poly, c, r, c + 1, r + 1) >= SWEEP_MIN_AREA) set.add(r + ',' + c);
            }
          }
          out[p][rot].push(Array.from(set).map((q) => q.split(',').map(Number)));
        }
      }
    }
    return out;
  }
  const SWEEP = buildSweep();

  function collide(board, cells, x, y) {
    for (let k = 0; k < 8; k += 2) { const r = y + cells[k], c = x + cells[k + 1]; if (c < 0 || c >= W || r < 0 || r >= H || board[r * W + c]) return true; }
    return false;
  }

  /* Every reachable lock position of `piece` on `board`, in the same order as the Python search (explicit LIFO stack).
   * -> array of {rot, x, y, lines, after: Uint8Array(220)} ; empty array = game over. */
  function enumerate(board, piece) {
    const cellsAll = CELLS[piece], kind = KIND[piece], out = [];
    if (collide(board, cellsAll[0], SPAWN_X[piece], 0)) return out;
    const vis = new Uint8Array(4 * (H + 1) * XW), stack = [], keys = new Set();
    const push = (rot, x, y) => { if (x + OFF < 0 || x + OFF >= XW || y < 0 || y >= H + 1) return; const i = (rot * (H + 1) + y) * XW + x + OFF; if (vis[i]) return; vis[i] = 1; stack.push(rot, x, y); };
    push(0, SPAWN_X[piece], 0);
    while (stack.length) {
      const y = stack.pop(), x = stack.pop(), rot = stack.pop(), cells = cellsAll[rot];
      if (!collide(board, cells, x - 1, y)) push(rot, x - 1, y);
      if (!collide(board, cells, x + 1, y)) push(rot, x + 1, y);
      if (kind !== 2) for (const dir of [1, -1]) { const r = rotate(board, piece, rot, x, y, dir); if (r) push(r.rot, r.x, r.y); }
      if (!collide(board, cells, x, y + 1)) { push(rot, x, y + 1); continue; }
      let lockout = true; const ids = [];
      for (let k = 0; k < 8; k += 2) { const r = y + cells[k]; if (r >= HIDDEN) lockout = false; ids.push(r * W + x + cells[k + 1]); }
      if (lockout) continue;
      ids.sort((a, b) => a - b); const key = ids.join(','); if (keys.has(key)) continue; keys.add(key);
      const r = lockAndClear(board, piece, rot, x, y); out.push({ rot, x, y, lines: r.lines, after: r.board });
    }
    return out;
  }

  function lockAndClear(board, piece, rot, x, y) {                // -> {board: new Uint8Array, lines}
    const tmp = Uint8Array.from(board), cells = CELLS[piece][rot];
    for (let k = 0; k < 8; k += 2) tmp[(y + cells[k]) * W + x + cells[k + 1]] = 1;
    const out = new Uint8Array(H * W); let dst = H - 1, cleared = 0;
    for (let src = H - 1; src >= 0; src--) {
      let full = true; for (let c = 0; c < W; c++) if (!tmp[src * W + c]) { full = false; break; }
      if (full) cleared++; else { for (let c = 0; c < W; c++) out[dst * W + c] = tmp[src * W + c]; dst--; }
    }
    return { board: out, lines: cleared };
  }

  function loadModel(buf, man) {
    const f = new Float32Array(buf), T = {};
    for (const t of man.tensors) { const size = t.shape.reduce((a, b) => a * b, 1); T[t.name] = f.subarray(t.offset, t.offset + size); }
    // f1 is stored (128, 7040); keep a transposed copy (7040, 128) so the sparse (ReLU) activations can be accumulated with contiguous reads
    const f1 = T['f1.weight'], n = 128, m = f1.length / n, f1t = new Float32Array(f1.length);
    for (let o = 0; o < n; o++) for (let i = 0; i < m; i++) f1t[i * n + o] = f1[o * m + i];
    T.f1t = f1t; return { T, game: man };
  }

  function Net(model) {
    const T = model.T, P = 18, C1 = 16, C2 = 32, HW = H * W;
    const pad = new Float32Array((H + 2) * (W + 2)), a1 = new Float32Array(C1 * HW), pad1 = new Float32Array(C1 * (H + 2) * (W + 2)), a2 = new Float32Array(C2 * HW), h = new Float32Array(128);
    this.value = function (board) {                                // V(afterstate) for one board (Uint8Array 220)
      const Wd = W + 2; pad.fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pad[(y + 1) * Wd + x + 1] = board[y * W + x];
      const w1 = T['c1.weight'], b1 = T['c1.bias'];
      for (let co = 0; co < C1; co++) {                            // conv1: 1 -> 16, 3x3, relu (written straight into the padded buffer of conv2)
        const wb = co * 9, ob = co * (H + 2) * Wd; for (let i = 0; i < (H + 2) * Wd; i++) pad1[ob + i] = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let s = b1[co]; for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) s += w1[wb + ky * 3 + kx] * pad[(y + ky) * Wd + x + kx];
          pad1[ob + (y + 1) * Wd + x + 1] = s > 0 ? s : 0;
        }
      }
      const w2 = T['c2.weight'], b2 = T['c2.bias'];
      for (let co = 0; co < C2; co++) {                            // conv2: 16 -> 32, 3x3, relu
        const ob = co * HW; for (let i = 0; i < HW; i++) a2[ob + i] = b2[co];
        for (let ci = 0; ci < C1; ci++) {
          const wb = (co * C1 + ci) * 9, pb = ci * (H + 2) * Wd;
          for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
            const wv = w2[wb + ky * 3 + kx]; if (wv === 0) continue;
            for (let y = 0; y < H; y++) { const ib = pb + (y + ky) * Wd + kx, o = ob + y * W; for (let x = 0; x < W; x++) a2[o + x] += wv * pad1[ib + x]; }
          }
        }
        for (let i = 0; i < HW; i++) if (a2[ob + i] < 0) a2[ob + i] = 0;
      }
      h.set(T['f1.bias']); const f1t = T.f1t;                      // f1: flatten (C,H,W) -> 128, relu ; only non-zero activations contribute
      for (let i = 0; i < C2 * HW; i++) { const a = a2[i]; if (a === 0) continue; const wb = i * 128; for (let o = 0; o < 128; o++) h[o] += a * f1t[wb + o]; }
      const fw = T['f2.weight']; let s = T['f2.bias'][0]; for (let o = 0; o < 128; o++) if (h[o] > 0) s += fw[o] * h[o];
      return s;
    };
  }

  /* the move the trained model plays: argmax over reachable placements of  line_reward[lines] + surv + gamma * V(afterstate) */
  function decide(net, model, board, piece) {
    const g = model.game, cands = enumerate(board, piece);
    if (!cands.length) return null;
    let bi = 0, bs = -1e30;
    cands.forEach((c, i) => { c.v = net.value(c.after); c.score = g.line_reward[c.lines] + g.surv + g.gamma * c.v; if (c.score > bs) { bs = c.score; bi = i; } });
    return { best: bi, cands };
  }

  /* ---- single-step moves for a human player (same rules as the search above) ---- */
  const canPlace = (board, piece, rot, x, y) => !collide(board, CELLS[piece][rot], x, y);
  function rotate(board, piece, rot, x, y, dir) {                                  // dir +1 = clockwise, -1 = counter-clockwise.  -> {rot,x,y} | null   (rules: see RULES above)
    if (KIND[piece] === 2) return null;
    const d = dir > 0 ? 0 : 1, nr = dir > 0 ? (rot + 1) % 4 : (rot + 3) % 4, nc = CELLS[piece][nr];
    if (RULES === 'phys') {                                                        // physical: every cell the turning piece sweeps must be free; no kick
      for (const [dr, dc] of SWEEP[piece][rot][d]) { const r = y + dr, c = x + dc; if (c < 0 || c >= W || r >= H || (r >= 0 && board[r * W + c])) return null; }
      return collide(board, nc, x, y) ? null : { rot: nr, x, y };
    }
    const kk = KIND[piece] === 1 ? 1 : 0;
    for (let k = 0; k < 5; k++) { const kick = KICKS[kk][d][rot][k], nx = x + kick[0], ny = y + kick[1]; if (!collide(board, nc, nx, ny)) return { rot: nr, x: nx, y: ny }; }
    return null;
  }
  function dropY(board, piece, rot, x, y) { while (!collide(board, CELLS[piece][rot], x, y + 1)) y++; return y; }
  /* The real route a piece takes to a lock position: the cheapest legal sequence of left / right / down / rotate moves (every state on it is collision-free and every step is
   * a legal single move).  First choice: rotate / shift where the piece is, then drop straight down.  Only if that is blocked: the cheapest route (sideways moves and rotations cost about 1, slightly more the lower they are; a step down 0.01) that slides into a gap.
   * -> [{rot, x, y, move}] from the start (default: the spawn position) to the target, move in 'L' 'R' 'D' 'CW' 'CCW' ; null if the target cannot be reached. */
  function straightRoute(board, piece, target, s0) {               // rotate / shift where the piece is (same row), then drop straight down; null if that is not possible
    const key = (t) => t.rot * 64 + (t.x + 16), prev = new Map([[key(s0), null]]), q = [s0];
    while (q.length) {
      const t = q.shift();
      if (t.rot === target.rot && t.x === target.x) {
        const out = []; let cur = t; while (cur) { const p = prev.get(key(cur)); out.push({ rot: cur.rot, x: cur.x, y: cur.y, move: p ? p.move : null }); cur = p ? p.state : null; } out.reverse();
        for (let y = t.y + 1; y <= target.y; y++) { if (collide(board, CELLS[piece][t.rot], t.x, y)) return null; out.push({ rot: t.rot, x: t.x, y, move: 'D' }); }
        return out[out.length - 1].y === target.y && collide(board, CELLS[piece][t.rot], t.x, target.y + 1) ? out : null;          // it must really rest at the target
      }
      const cells = CELLS[piece][t.rot], nb = [];
      if (!collide(board, cells, t.x - 1, t.y)) nb.push([{ rot: t.rot, x: t.x - 1, y: t.y }, 'L']);
      if (!collide(board, cells, t.x + 1, t.y)) nb.push([{ rot: t.rot, x: t.x + 1, y: t.y }, 'R']);
      for (const dir of [1, -1]) { const r = rotate(board, piece, t.rot, t.x, t.y, dir); if (r && r.y === t.y) nb.push([r, dir > 0 ? 'CW' : 'CCW']); }
      for (const [u, mv] of nb) { const ku = key(u); if (!prev.has(ku)) { prev.set(ku, { state: t, move: mv }); q.push(u); } }
    }
    return null;
  }
  function pathTo(board, piece, target, start) {
    const s0 = start || { rot: 0, x: SPAWN_X[piece], y: 0 }; if (collide(board, CELLS[piece][s0.rot], s0.x, s0.y)) return null;
    const straight = straightRoute(board, piece, target, s0); if (straight) return straight;                  // 1st choice: a straight drop; otherwise search for a route that slides into a gap
    const key = (t) => (t.rot * 64 + (t.x + 16)) * 64 + t.y, dist = new Map([[key(s0), 0]]), prev = new Map(), done = new Set(), open = [[0, s0]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, t] = open.splice(bi, 1)[0], kt = key(t); if (done.has(kt)) continue; done.add(kt);
      if (t.rot === target.rot && t.x === target.x && t.y === target.y) {
        const out = []; let k = kt, cur = t; while (true) { const p = prev.get(k); out.push({ rot: cur.rot, x: cur.x, y: cur.y, move: p ? p.move : null }); if (!p) break; k = p.from; cur = p.state; } return out.reverse();
      }
      const cells = CELLS[piece][t.rot], nb = [];
      if (!collide(board, cells, t.x - 1, t.y)) nb.push([{ rot: t.rot, x: t.x - 1, y: t.y }, 1 + 0.001 * t.y, 'L']);
      if (!collide(board, cells, t.x + 1, t.y)) nb.push([{ rot: t.rot, x: t.x + 1, y: t.y }, 1 + 0.001 * t.y, 'R']);
      if (!collide(board, cells, t.x, t.y + 1)) nb.push([{ rot: t.rot, x: t.x, y: t.y + 1 }, 0.01, 'D']);
      for (const dir of [1, -1]) { const r = rotate(board, piece, t.rot, t.x, t.y, dir); if (r) nb.push([r, 1 + 0.001 * t.y, dir > 0 ? 'CW' : 'CCW']); }
      for (const [u, w, mv] of nb) { const ku = key(u), nd = d + w; if (!dist.has(ku) || nd < dist.get(ku) - 1e-9) { dist.set(ku, nd); prev.set(ku, { from: kt, state: t, move: mv }); open.push([nd, u]); } }
    }
    return null;
  }
  /* The same placement, played the way a person plays it: the piece comes into the well and keeps falling while it is moved / turned (two cells down, then the first move, then one cell
   * down per move ...), and only then drops the rest of the way - not "arrange everything above the board, then dive".  Every state is checked; if any step would not be legal this way
   * (a tall stack close to the top), the plain route from pathTo() is returned instead.  Routes that already slide into a gap are returned unchanged. */
  function naturalRoute(board, piece, target) {
    const base = pathTo(board, piece, target); if (!base) return null;
    const lat = base.slice(1).filter((s) => s.move !== 'D').map((s) => s.move), firstD = base.findIndex((s, i) => i > 0 && s.move === 'D');
    if (!lat.length || (firstD >= 0 && base.slice(firstD).some((s) => s.move !== 'D' && s.move !== null))) return base;
    let cur = { rot: base[0].rot, x: base[0].x, y: base[0].y, move: null }; const out = [cur]; let ok = true;
    const down = () => { if (cur.y >= target.y || collide(board, CELLS[piece][cur.rot], cur.x, cur.y + 1)) return false; cur = { rot: cur.rot, x: cur.x, y: cur.y + 1, move: 'D' }; out.push(cur); return true; };
    const act = (mv) => {
      const n = mv === 'L' ? { rot: cur.rot, x: cur.x - 1, y: cur.y } : mv === 'R' ? { rot: cur.rot, x: cur.x + 1, y: cur.y } : rotate(board, piece, cur.rot, cur.x, cur.y, mv === 'CW' ? 1 : -1);
      if (!n || collide(board, CELLS[piece][n.rot], n.x, n.y)) return false; cur = { rot: n.rot, x: n.x, y: n.y, move: mv }; out.push(cur); return true;
    };
    lat.forEach((mv, j) => { for (let k = 0; k < (j === 0 ? 2 : 1); k++) down(); if (!act(mv)) ok = false; });
    while (ok && cur.y < target.y) if (!down()) ok = false;
    return ok && cur.rot === target.rot && cur.x === target.x && cur.y === target.y ? out : base;
  }
  // rotations that give the same shape (I, S, Z: 0 = 2, R = L; O: all) share one "shape class", so each distinct orientation gets one curve
  const shapeClass = (piece, rot) => { const n = ORDER[piece]; return n === 'O' ? 0 : (n === 'I' || n === 'S' || n === 'Z') ? rot % 2 : rot; };
  const minCol = (piece, rot) => { const c = CELLS[piece][rot]; return Math.min(c[1], c[3], c[5], c[7]); };

  root.TetrisEngine = { H, W, HIDDEN, ORDER, CELLS, SPAWN_X, SWEEP, setRules, getRules, enumerate, lockAndClear, loadModel, Net, decide, canPlace, rotate, dropY, pathTo, naturalRoute, shapeClass, minCol };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TetrisEngine;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
