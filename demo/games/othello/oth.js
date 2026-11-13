/* Othello in the browser: rules, the int8 network (BN folded) forward pass, alpha-beta search with the net as leaf evaluator.  Port of oth.py / train_oth.py / eval_oth_search.py.
 * Board = Int8Array(64), index = row*8 + col (row 0 = rank 1, col 0 = file a), 1 = black, -1 = white, 0 = empty.  `p` = the player to move (1 / -1).  Values are in discs from the point of view of the side to move. */
(function (root) {
  'use strict';
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], RAYS = [];
  for (let s = 0; s < 64; s++) { const r = s >> 3, c = s & 7, rays = []; for (const [dr, dc] of DIRS) { const ray = []; let rr = r + dr, cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { ray.push(rr * 8 + cc); rr += dr; cc += dc; } rays.push(ray); } RAYS.push(rays); }
  const name = (s) => 'abcdefgh'[s & 7] + ((s >> 3) + 1), parse = (n) => 'abcdefgh'.indexOf(n[0]) + 8 * (+n[1] - 1);
  function start() { const b = new Int8Array(64); b[27] = -1; b[36] = -1; b[28] = 1; b[35] = 1; return b; }   // d4, e5 white; e4, d5 black (as oth.py); black moves first
  function flipsAt(b, s, p) {                                  // squares flipped by p playing on the empty square s (empty array = illegal)
    const out = []; if (b[s] !== 0) return out;
    for (const ray of RAYS[s]) { let i = 0; while (i < ray.length && b[ray[i]] === -p) i++; if (i > 0 && i < ray.length && b[ray[i]] === p) for (let k = 0; k < i; k++) out.push(ray[k]); }
    return out;
  }
  function legalMoves(b, p) { const m = []; for (let s = 0; s < 64; s++) if (b[s] === 0 && flipsAt(b, s, p).length) m.push(s); return m; }
  function play(b, s, p) { const nb = new Int8Array(b); for (const f of flipsAt(b, s, p)) nb[f] = p; nb[s] = p; return nb; }
  function counts(b) { let k = 0, w = 0; for (let i = 0; i < 64; i++) { if (b[i] === 1) k++; else if (b[i] === -1) w++; } return [k, w]; }
  function finalScore(b, p) { const [k, w] = counts(b), d = (p === 1 ? k - w : w - k), e = 64 - k - w; return d > 0 ? d + e : d < 0 ? d - e : 0; }     // empties go to the winner
  const bit = (x, i) => Number((BigInt(x) >> BigInt(i)) & 1n);
  function fromBits(own, opp, p) { const b = new Int8Array(64); for (let i = 0; i < 64; i++) { if (bit(own, i)) b[i] = p; else if (bit(opp, i)) b[i] = -p; } return b; }

  /* ---------- network ---------- */
  const PW = 10, PL = 100, LO = 11, HI = 88;                  // padded 10x10 planes, interior rows/cols 1..8
  function loadModel(man, i8, aux) {
    const q = new Int8Array(i8), W = {};
    for (const t of man.tensors) {
      const co = t.shape[0], row = t.n / co, w = new Float32Array(t.n);
      for (let o = 0; o < co; o++) { const sc = aux[t.aux_off + o]; for (let j = 0; j < row; j++) w[o * row + j] = q[t.w_off + o * row + j] * sc; }
      W[t.name] = { kind: t.kind, w, b: aux.slice(t.aux_off + co, t.aux_off + 2 * co), co, ci: row / (t.kind === 'conv3' ? 9 : 1) };
    }
    W.scale = man.scale; W.blocks = man.blocks; W.multi = !!W['pol.0']; return W;
  }
  function conv(x, L, relu) {
    const co = L.co, ci = L.ci, out = new Float32Array(co * PL), w = L.w, three = L.kind === 'conv3';
    for (let o = 0; o < co; o++) {
      const ob = o * PL, bias = L.b[o]; for (let p = LO; p <= HI; p++) out[ob + p] = bias;
      for (let c = 0; c < ci; c++) { const xb = c * PL;
        if (three) { const wb = (o * ci + c) * 9, w0 = w[wb], w1 = w[wb + 1], w2 = w[wb + 2], w3 = w[wb + 3], w4 = w[wb + 4], w5 = w[wb + 5], w6 = w[wb + 6], w7 = w[wb + 7], w8 = w[wb + 8];
          for (let p = LO; p <= HI; p++) { const q = xb + p; out[ob + p] += w0 * x[q - 11] + w1 * x[q - 10] + w2 * x[q - 9] + w3 * x[q - 1] + w4 * x[q] + w5 * x[q + 1] + w6 * x[q + 9] + w7 * x[q + 10] + w8 * x[q + 11]; } }
        else { const wv = w[o * ci + c]; if (wv !== 0) for (let p = LO; p <= HI; p++) out[ob + p] += wv * x[xb + p]; } }
      for (let r = 1; r <= 8; r++) { out[ob + r * PW] = 0; out[ob + r * PW + 9] = 0; }
      if (relu) for (let p = LO; p <= HI; p++) if (out[ob + p] < 0) out[ob + p] = 0;
    }
    return out;
  }
  const pos = (s) => ((s >> 3) + 1) * PW + (s & 7) + 1;
  function trunk(W, b, p) {                                    // input planes: own discs, opponent discs
    const x = new Float32Array(2 * PL); for (let s = 0; s < 64; s++) { if (b[s] === p) x[pos(s)] = 1; else if (b[s] === -p) x[PL + pos(s)] = 1; }
    let h = conv(x, W.stem, true);
    for (let i = 0; i < W.blocks; i++) { const y = conv(conv(h, W['blk' + i + '.a'], true), W['blk' + i + '.b'], false), n = new Float32Array(h.length); for (let j = 0; j < n.length; j++) { const v = h[j] + y[j]; n[j] = v > 0 ? v : 0; } h = n; }
    return h;
  }
  function valueHead(W, h) {
    const vv = conv(h, W.v, true), flat = new Float32Array(16 * 64); for (let c = 0; c < 16; c++) for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) flat[c * 64 + r * 8 + k] = vv[c * PL + (r + 1) * PW + k + 1];
    const lin = (L, v, relu) => { const nin = v.length, o = new Float32Array(L.co); for (let j = 0; j < L.co; j++) { let s = L.b[j]; const wb = j * nin; for (let i = 0; i < nin; i++) s += L.w[wb + i] * v[i]; o[j] = relu && s < 0 ? 0 : s; } return o; };
    return lin(W.vf2, lin(W.vf1, flat, true), false)[0] * W.scale;
  }
  function cellHead(W, h, name) { const o = conv(conv(h, W[name + '.0'], true), W[name + '.1'], false), r = new Float32Array(64); for (let s = 0; s < 64; s++) r[s] = o[pos(s)]; return r; }
  function evalValue(W, b, p) { return valueHead(W, trunk(W, b, p)); }                    // discs for p (side to move)
  function evalAll(W, b, p) { const h = trunk(W, b, p); return { value: valueHead(W, h), policy: W.multi ? cellHead(W, h, 'pol') : null, legal: W.multi ? cellHead(W, h, 'leg') : null }; }

  /* ---------- search ---------- */
  const keyOf = (b, p) => String.fromCharCode.apply(null, Array.from(b, (x) => x + 1)) + p;
  function exact(b, p, alpha, beta, ctx) {                     // exact disc difference (empties to the winner) by alpha-beta, rules only
    ctx.nodes++; const moves = legalMoves(b, p);
    if (!moves.length) { if (!legalMoves(b, -p).length) return finalScore(b, p); return -exact(b, -p, -beta, -alpha, ctx); }
    let best = -1e9; for (const m of moves) { const v = -exact(play(b, m, p), -p, -beta, -alpha, ctx); if (v > best) best = v; if (v > alpha) alpha = v; if (alpha >= beta) break; }
    return best;
  }
  function Searcher(W, opts) {
    opts = opts || {}; const S = { W, exactEmpties: opts.exactEmpties === undefined ? 8 : opts.exactEmpties, cache: new Map(), nodes: 0, evals: 0, tt: new Map() };
    S.value = (b, p) => { const k = keyOf(b, p); let v = S.cache.get(k); if (v === undefined) { v = evalValue(W, b, p); S.cache.set(k, v); S.evals++; } return v; };
    S.empties = (b) => { let e = 0; for (let i = 0; i < 64; i++) if (b[i] === 0) e++; return e; };
    S.negamax = (b, p, depth, alpha, beta) => {
      S.nodes++; const moves = legalMoves(b, p);
      if (!moves.length) { if (!legalMoves(b, -p).length) return finalScore(b, p); return -S.negamax(b, -p, depth, -beta, -alpha); }
      if (S.exactEmpties && S.empties(b) <= S.exactEmpties) return exact(b, p, alpha, beta, S);
      if (depth === 0) return S.value(b, p);
      const kids = moves.map((m) => { const c = play(b, m, p), v = S.cache.get(keyOf(c, -p)); return { m, c, o: v === undefined ? -1e6 : -v }; });   // order: children already evaluated by the shallower iteration first
      const hm = S.tt.get(keyOf(b, p)); kids.sort((x, y) => (y.m === hm) - (x.m === hm) || y.o - x.o);
      let best = -1e9, bm = kids[0].m;
      for (const k of kids) { const v = -S.negamax(k.c, -p, depth - 1, -beta, -alpha); if (v > best) { best = v; bm = k.m; } if (v > alpha) alpha = v; if (alpha >= beta) break; }
      S.tt.set(keyOf(b, p), bm); return best;
    };
    S.rootValues = (b, p, depth) => legalMoves(b, p).map((m) => [m, -S.negamax(play(b, m, p), -p, depth - 1, -1e9, 1e9)]);       // exact value of every root move (full window; for tests / hints)
    S.best = (b, p, depth) => {                                // iterative deepening, root moves ordered by the previous iteration
      const moves = legalMoves(b, p); if (!moves.length) return null; if (moves.length === 1) return { move: moves[0], value: NaN, forced: true };
      let order = moves.slice(), bestV = -1e9, bestM = moves[0];
      for (let d = 1; d <= depth; d++) {
        let alpha = -1e9; const vals = [];
        for (const m of order) { const v = -S.negamax(play(b, m, p), -p, d - 1, -1e9, -alpha); vals.push([m, v]); if (v > alpha) { alpha = v; bestM = m; bestV = v; } }
        vals.sort((x, y) => y[1] - x[1]); order = vals.map((x) => x[0]);
      }
      return { move: bestM, value: bestV, nodes: S.nodes, evals: S.evals };
    };
    return S;
  }

  root.OTH = { start, flipsAt, legalMoves, play, counts, finalScore, name, parse, fromBits, loadModel, evalValue, evalAll, Searcher, keyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OTH;
})(typeof self !== 'undefined' ? self : globalThis);
