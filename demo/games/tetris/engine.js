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
      if (kind !== 2) {
        for (let d = 0; d < 2; d++) {
          const nr = d === 0 ? (rot + 1) % 4 : (rot + 3) % 4, kk = kind === 1 ? 1 : 0, nc = cellsAll[nr];
          for (let k = 0; k < 5; k++) { const kick = KICKS[kk][d][rot][k], nx = x + kick[0], ny = y + kick[1]; if (!collide(board, nc, nx, ny)) { push(nr, nx, ny); break; } }
        }
      }
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
  function rotate(board, piece, rot, x, y, dir) {                // dir +1 = clockwise, -1 = counter-clockwise; first SRS kick that fits is used. -> {rot,x,y} | null
    if (KIND[piece] === 2) return null;
    const d = dir > 0 ? 0 : 1, nr = dir > 0 ? (rot + 1) % 4 : (rot + 3) % 4, kk = KIND[piece] === 1 ? 1 : 0, nc = CELLS[piece][nr];
    for (let k = 0; k < 5; k++) { const kick = KICKS[kk][d][rot][k], nx = x + kick[0], ny = y + kick[1]; if (!collide(board, nc, nx, ny)) return { rot: nr, x: nx, y: ny }; }
    return null;
  }
  function dropY(board, piece, rot, x, y) { while (!collide(board, CELLS[piece][rot], x, y + 1)) y++; return y; }
  // rotations that give the same shape (I, S, Z: 0 = 2, R = L; O: all) share one "shape class", so each distinct orientation gets one curve
  const shapeClass = (piece, rot) => { const n = ORDER[piece]; return n === 'O' ? 0 : (n === 'I' || n === 'S' || n === 'Z') ? rot % 2 : rot; };
  const minCol = (piece, rot) => { const c = CELLS[piece][rot]; return Math.min(c[1], c[3], c[5], c[7]); };

  root.TetrisEngine = { H, W, HIDDEN, ORDER, CELLS, SPAWN_X, enumerate, lockAndClear, loadModel, Net, decide, canPlace, rotate, dropY, shapeClass, minCol };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TetrisEngine;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
