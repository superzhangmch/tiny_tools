/* Xiangqi in the browser: rules (move generation, check, repetition), the int8 network (BN folded) forward pass, PUCT MCTS.  Port of xqgen.py / xqgame.py / mcts.py / xqnet.CellNet.
 * Board = Uint8Array(90), index = rank*9 + file (rank 0 = red's back rank); red pieces 1..7 (R N B A K C P), black = +8.  A move is the integer from*90 + to. */
(function (root) {
  'use strict';
  const R = 1, N = 2, B = 3, A = 4, K = 5, C = 6, P = 7, CODE = { R: 1, N: 2, B: 3, A: 4, K: 5, C: 6, P: 7 };
  const FILES = 'abcdefghi', START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
  const sqName = (s) => FILES[s % 9] + Math.floor(s / 9), sqOf = (n) => +n[1] * 9 + FILES.indexOf(n[0]);
  const mStr = (m) => sqName(Math.floor(m / 90)) + sqName(m % 90), mParse = (s) => sqOf(s.slice(0, 2)) * 90 + sqOf(s.slice(2, 4));

  /* ---------- tables ---------- */
  const RAYS = [], HORSE = [], HATT = Array.from({ length: 90 }, () => []), ELEPH = [], ADV = [], KING = [], RED_ATT = [], BLK_ATT = [];
  (function () {
    const sq = (r, f) => r * 9 + f;
    for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) {
      const up = [], dn = [], lf = [], rt = []; for (let x = r + 1; x < 10; x++) up.push(sq(x, f)); for (let x = r - 1; x >= 0; x--) dn.push(sq(x, f)); for (let x = f - 1; x >= 0; x--) lf.push(sq(r, x)); for (let x = f + 1; x < 9; x++) rt.push(sq(r, x)); RAYS.push([up, dn, lf, rt]);
      const h = []; for (const [dr, df] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const r2 = r + dr, f2 = f + df; if (r2 >= 0 && r2 < 10 && f2 >= 0 && f2 < 9) { const leg = sq(r + (Math.abs(dr) === 2 ? dr / 2 : 0), f + (Math.abs(df) === 2 ? df / 2 : 0)); h.push([leg, sq(r2, f2)]); HATT[sq(r2, f2)].push([sq(r, f), leg]); } } HORSE.push(h);
      ELEPH.push([[2, 2], [2, -2], [-2, 2], [-2, -2]].filter(([dr, df]) => r + dr >= 0 && r + dr < 10 && f + df >= 0 && f + df < 9).map(([dr, df]) => [sq(r + dr / 2, f + df / 2), sq(r + dr, f + df), r + dr <= 4]));
      const pal = (r2, f2) => r2 >= 0 && r2 < 10 && f2 >= 3 && f2 <= 5 && (r2 <= 2 || r2 >= 7);
      ADV.push([[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dr, df]) => pal(r + dr, f + df)).map(([dr, df]) => sq(r + dr, f + df))); KING.push([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, df]) => pal(r + dr, f + df)).map(([dr, df]) => sq(r + dr, f + df)));
    }
    for (let s = 0; s < 90; s++) {
      const ra = [], ba = []; if (s >= 9) ra.push(s - 9); if (s % 9 > 0 && Math.floor(s / 9) >= 5) ra.push(s - 1); if (s % 9 < 8 && Math.floor(s / 9) >= 5) ra.push(s + 1); RED_ATT.push(ra);
      if (s < 81) ba.push(s + 9); if (s % 9 > 0 && Math.floor(s / 9) <= 4) ba.push(s - 1); if (s % 9 < 8 && Math.floor(s / 9) <= 4) ba.push(s + 1); BLK_ATT.push(ba);
    }
  })();

  function attacked(b, s, byRed) {
    const o = byRed ? 0 : 8, r_ = R + o, n_ = N + o, k_ = K + o, c_ = C + o, p_ = P + o;
    for (let d = 0; d < 4; d++) { let seen = false; const ray = RAYS[s][d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (!p) continue; if (!seen) { if (p === r_ || (p === k_ && d < 2)) return true; seen = true; } else { if (p === c_) return true; break; } } }
    const ha = HATT[s]; for (let i = 0; i < ha.length; i++) if (b[ha[i][0]] === n_ && !b[ha[i][1]]) return true;
    const pa = byRed ? RED_ATT[s] : BLK_ATT[s]; for (let i = 0; i < pa.length; i++) if (b[pa[i]] === p_) return true;
    return false;
  }
  function pseudo(b, red) {
    const out = [], lo = red ? 1 : 9, hi = red ? 7 : 15, o = red ? 0 : 8, own = (x) => x >= lo && x <= hi;
    for (let s = 0; s < 90; s++) {
      const p = b[s]; if (p < lo || p > hi) continue; const t = p - o;
      if (t === R || t === C) {
        for (let d = 0; d < 4; d++) { let screen = false; const ray = RAYS[s][d]; for (let i = 0; i < ray.length; i++) { const q = ray[i], x = b[q];
          if (!screen) { if (!x) out.push(s * 90 + q); else if (own(x)) { if (t === C) { screen = true; continue; } break; } else { if (t === R) { out.push(s * 90 + q); break; } screen = true; } }
          else if (x) { if (!own(x)) out.push(s * 90 + q); break; } } }
      } else if (t === N) { for (const [leg, q] of HORSE[s]) if (!b[leg] && !own(b[q])) out.push(s * 90 + q); }
      else if (t === B) { for (const [eye, q, low] of ELEPH[s]) if (low === red && !b[eye] && !own(b[q])) out.push(s * 90 + q); }
      else if (t === A) { for (const q of ADV[s]) if ((q < 27) === red && !own(b[q])) out.push(s * 90 + q); }
      else if (t === K) { for (const q of KING[s]) if ((q < 27) === red && !own(b[q])) out.push(s * 90 + q); }
      else { const q = s + (red ? 9 : -9); if (q >= 0 && q < 90 && !own(b[q])) out.push(s * 90 + q);
        if ((s >= 45) === red) { if (s % 9 > 0 && !own(b[s - 1])) out.push(s * 90 + s - 1); if (s % 9 < 8 && !own(b[s + 1])) out.push(s * 90 + s + 1); } }
    }
    return out;
  }
  function legal(b, red) {
    const ownK = red ? K : K + 8; let ks = -1; for (let i = 0; i < 90; i++) if (b[i] === ownK) { ks = i; break; }
    const res = [], ps = pseudo(b, red);
    for (let i = 0; i < ps.length; i++) { const f = Math.floor(ps[i] / 90), t = ps[i] % 90, cap = b[t], mv = b[f]; b[t] = mv; b[f] = 0; const k2 = f === ks ? t : ks; if (!attacked(b, k2, !red)) res.push(ps[i]); b[f] = mv; b[t] = cap; }
    return res;
  }
  function inCheck(b, red) { const k = red ? K : K + 8; for (let i = 0; i < 90; i++) if (b[i] === k) return attacked(b, i, !red); return false; }
  function push(b, m) { const nb = new Uint8Array(b); nb[m % 90] = nb[Math.floor(m / 90)]; nb[Math.floor(m / 90)] = 0; return nb; }
  function fromFen(fen) { const b = new Uint8Array(90); fen.split(' ')[0].split('/').forEach((row, i) => { const rank = 9 - i; let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { b[rank * 9 + f] = CODE[ch.toUpperCase()] + (ch === ch.toUpperCase() ? 0 : 8); f++; } } }); return [b, fen.split(' ')[1] === 'w']; }
  function perft(b, red, d) { const mv = legal(b, red); if (d === 1) return mv.length; let n = 0; for (const m of mv) n += perft(push(b, m), !red, d - 1); return n; }

  /* ---------- game with the repetition rules ---------- */
  const keyOf = (b, red) => String.fromCharCode.apply(null, b) + (red ? 'R' : 'B');
  function cycleResult(checks, j) {            // +1: the side to move wins (the mover into the repeated position gave perpetual check), -1: it loses, 0: draw
    const m = checks.length - 1; let mover = true, other = m - 1 > j;
    for (let i = m; i > j; i -= 2) if (!checks[i]) { mover = false; break; }
    if (m - 1 > j) for (let i = m - 1; i > j; i -= 2) if (!checks[i]) { other = false; break; }
    return mover && !other ? 1 : other && !mover ? -1 : 0;
  }
  class Game {
    constructor(fen) { const [b, r] = fromFen(fen || START_FEN); this.board = b; this.red = r; this.moves = []; this.keys = [keyOf(b, r)]; this.checks = [false]; this.last = null; this.sinceCap = 0; }
    copy() { const g = Object.create(Game.prototype); g.board = new Uint8Array(this.board); g.red = this.red; g.moves = this.moves.slice(); g.keys = this.keys.slice(); g.checks = this.checks.slice(); g.last = this.last; g.sinceCap = this.sinceCap; return g; }
    legal() { return legal(this.board, this.red); }
    play(m) {
      if (!this.legal().includes(m)) throw new Error('illegal move ' + mStr(m));
      const cap = this.board[m % 90] !== 0; this.last = { f: Math.floor(m / 90), t: m % 90, red: this.red }; this.board = push(this.board, m); this.red = !this.red; this.moves.push(m); this.sinceCap = cap ? 0 : this.sinceCap + 1;
      this.keys.push(keyOf(this.board, this.red)); this.checks.push(inCheck(this.board, this.red));
    }
    status() {
      if (!this.legal().length) return [this.red ? 'black' : 'red', inCheck(this.board, this.red) ? 'checkmate' : 'stalemate (no legal move)'];
      const k = this.keys[this.keys.length - 1], idx = []; this.keys.forEach((x, i) => { if (x === k) idx.push(i); });
      if (idx.length >= 3) { const r = cycleResult(this.checks, idx[idx.length - 3]); if (r === 1) return [this.red ? 'red' : 'black', 'perpetual check by the side that just moved (not allowed)']; if (r === -1) return [this.red ? 'black' : 'red', 'perpetual check by the side to move (not allowed)']; return ['draw', 'threefold repetition']; }
      if (this.sinceCap >= 100) return ['draw', '100 plies without a capture'];
      return [null, ''];
    }
  }
  function unsafe(game, m) {                    // basic rule avoidance for the plain-CNN player
    const g2 = game.copy(); g2.play(m); const [w, why] = g2.status(), me = game.red ? 'red' : 'black'; if (w !== null && w !== 'draw' && w !== me) return why || 'loses by rule';
    const opp = g2.red; for (const om of legal(g2.board, opp)) if (!legal(push(g2.board, om), !opp).length) return 'allows mate in one'; return null;
  }

  /* ---------- network ---------- */
  const SLIDE_H = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]], ELE = [[2, 2], [2, -2], [-2, 2], [-2, -2]], ADVD = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  function typeOf(dr, df) {
    if (df === 0) return (dr > 0 ? 0 : 1) * 9 + Math.abs(dr) - 1; if (dr === 0) return (df > 0 ? 2 : 3) * 9 + Math.abs(df) - 1;
    let i = SLIDE_H.findIndex((x) => x[0] === dr && x[1] === df); if (i >= 0) return 36 + i; i = ELE.findIndex((x) => x[0] === dr && x[1] === df); if (i >= 0) return 44 + i; i = ADVD.findIndex((x) => x[0] === dr && x[1] === df); if (i >= 0) return 48 + i; throw new Error('bad move geometry');
  }
  const PW = 11, PL = 132, LO = 12, HI = 119;                      // padded plane: 12 rows x 11 cols, interior rows 1..10, cols 1..9
  function loadModel(man, i8, aux) {
    const q = new Int8Array(i8), W = {}; for (const t of man.tensors) {
      const co = t.shape[0], row = t.n / co, w = new Float32Array(t.n); for (let o = 0; o < co; o++) { const sc = aux[t.aux_off + o]; for (let j = 0; j < row; j++) w[o * row + j] = q[t.w_off + o * row + j] * sc; }
      W[t.name] = { kind: t.kind, w, b: aux.slice(t.aux_off + co, t.aux_off + 2 * co), co, ci: row / (t.kind === 'conv3' ? 9 : 1) };
    }
    return W;
  }
  function conv(x, L, relu) {                                       // x: ci planes of PL; 3x3 (pad 1) or 1x1
    const co = L.co, ci = L.ci, out = new Float32Array(co * PL), w = L.w, three = L.kind === 'conv3';
    for (let o = 0; o < co; o++) {
      const ob = o * PL, bias = L.b[o]; for (let p = LO; p <= HI; p++) out[ob + p] = bias;
      for (let c = 0; c < ci; c++) { const xb = c * PL;
        if (three) { const wb = (o * ci + c) * 9, w0 = w[wb], w1 = w[wb + 1], w2 = w[wb + 2], w3 = w[wb + 3], w4 = w[wb + 4], w5 = w[wb + 5], w6 = w[wb + 6], w7 = w[wb + 7], w8 = w[wb + 8];
          if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0 && w6 === 0 && w7 === 0 && w8 === 0) continue;
          for (let p = LO; p <= HI; p++) { const q = xb + p; out[ob + p] += w0 * x[q - 12] + w1 * x[q - 11] + w2 * x[q - 10] + w3 * x[q - 1] + w4 * x[q] + w5 * x[q + 1] + w6 * x[q + 10] + w7 * x[q + 11] + w8 * x[q + 12]; } }
        else { const wv = w[o * ci + c]; if (wv !== 0) for (let p = LO; p <= HI; p++) out[ob + p] += wv * x[xb + p]; } }
      for (let y = 1; y <= 10; y++) { out[ob + y * PW] = 0; out[ob + y * PW + 10] = 0; }
      if (relu) for (let p = LO; p <= HI; p++) if (out[ob + p] < 0) out[ob + p] = 0;
    }
    return out;
  }
  function planes(b, red, last) {                                  // side-to-move view, 16 planes (own 7, opponent 7, previous move from / to) in padded layout
    const x = new Float32Array(16 * PL), pos = (s) => (Math.floor(s / 9) + 1) * PW + (s % 9) + 1;
    for (let s = 0; s < 90; s++) { const p = red ? b[s] : b[89 - s]; if (!p) continue; const isRed = p < 8, type = isRed ? p : p - 8, own = isRed === red; x[(own ? type - 1 : 6 + type) * PL + pos(s)] = 1; }
    if (last) { const fm = last.red ? last.f : 89 - last.f, tm = last.red ? last.t : 89 - last.t; x[14 * PL + pos(fm)] = 1; x[15 * PL + pos(tm)] = 1; }       // the previous move is given in the MOVER's frame (as in training)
    return x;
  }
  function trunk(W, b, red, last) {
    let h = conv(planes(b, red, last), W.stem, true);
    for (let i = 0; i < 10; i++) { const y = conv(conv(h, W['blk' + i + '.a'], true), W['blk' + i + '.b'], false), n = new Float32Array(h.length); for (let j = 0; j < n.length; j++) { const v = h[j] + y[j]; n[j] = v > 0 ? v : 0; } h = n; }
    return h;
  }
  function forward(W, b, red, last, legalMoves) {                  // -> {logits: array aligned with legalMoves, value}
    const h = trunk(W, b, red, last);
    const pol = conv(conv(conv(h, W['pol.0'], true), W['pol.1'], true), W['pol.2'], false), logits = legalMoves.map((m) => {
      let f = Math.floor(m / 90), t = m % 90; if (!red) { f = 89 - f; t = 89 - t; } const ty = typeOf(Math.floor(t / 9) - Math.floor(f / 9), t % 9 - f % 9); return pol[ty * PL + (Math.floor(f / 9) + 1) * PW + (f % 9) + 1]; });
    const vv = conv(h, W.v, true), flat = new Float32Array(32 * 90); for (let c = 0; c < 32; c++) for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) flat[c * 90 + r * 9 + f] = vv[c * PL + (r + 1) * PW + f + 1];
    const lin = (L, x, relu) => { const nin = x.length, o = new Float32Array(L.co); for (let j = 0; j < L.co; j++) { let s = L.b[j]; const wb = j * nin; for (let i = 0; i < nin; i++) s += L.w[wb + i] * x[i]; o[j] = relu && s < 0 ? 0 : s; } return o; };
    return { logits, value: Math.tanh(lin(W.vf2, lin(W.vf1, flat, true), false)[0]) };
  }
  /* legality head: for every (move type, from-cell) a logit "this move is legal here".  legalLogits(...) returns, for the given legal moves, the logits (parity test);
     legalMap(...) returns for every own piece the probabilities of all geometrically possible targets (debug view). */
  const TYPES = (() => { const t = []; for (const [dr, df] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 1; d <= 9; d++) t.push([dr * d, df * d]); return t.concat(SLIDE_H, ELE, ADVD); })();
  function legalHead(W, b, red, last) { const h = trunk(W, b, red, last); return conv(conv(conv(h, W['leg.0'], true), W['leg.1'], true), W['leg.2'], false); }
  function legalLogits(W, b, red, last, moves) {
    const lg = legalHead(W, b, red, last); return moves.map((m) => { let f = Math.floor(m / 90), t = m % 90; if (!red) { f = 89 - f; t = 89 - t; } const ty = typeOf(Math.floor(t / 9) - Math.floor(f / 9), t % 9 - f % 9); return lg[ty * PL + (Math.floor(f / 9) + 1) * PW + (f % 9) + 1]; });
  }
  function legalMap(W, b, red, last) {                              // -> { fromAbs: [[toAbs, p], ...] } for the side to move's pieces
    const lg = legalHead(W, b, red, last), out = {}, lo = red ? 1 : 9, hi = red ? 7 : 15;
    for (let s = 0; s < 90; s++) { if (b[s] < lo || b[s] > hi) continue; const f = red ? s : 89 - s, r = Math.floor(f / 9), c = f % 9, list = [];
      TYPES.forEach(([dr, df], ty) => { const r2 = r + dr, c2 = c + df; if (r2 < 0 || r2 > 9 || c2 < 0 || c2 > 8) return; const p = 1 / (1 + Math.exp(-lg[ty * PL + (r + 1) * PW + c + 1])); if (p >= 0.01) { const t = r2 * 9 + c2; list.push([red ? t : 89 - t, p]); } });
      out[s] = list; }
    return out;
  }
  function priorsOf(logits) { const mx = Math.max(...logits), e = logits.map((v) => Math.exp(v - mx)), s = e.reduce((a, c) => a + c, 0); return e.map((v) => v / s); }

  /* ---------- MCTS (PUCT), batch size 1 ---------- */
  class Node { constructor(parent, move, prior) { this.parent = parent; this.move = move; this.prior = prior; this.N = 0; this.W = 0; this.kids = null; this.board = null; this.term = null; this.moves = null; } }
  function search(W, game, sims, opts) {
    opts = opts || {}; const c = opts.c || 1.6, fpu = 0.15, t0 = Date.now(), histKeys = game.keys, histChecks = game.checks;
    const root = new Node(null, null, 1); root.board = new Uint8Array(game.board); root.red = game.red; root.last = game.last; root.key = game.keys[game.keys.length - 1]; root.check = game.checks[game.checks.length - 1]; root.moves = legal(root.board, root.red);
    if (!root.moves.length) return null;
    const evalNode = (n) => { const r = forward(W, n.board, n.red, n.last, n.moves); n.kids = priorsOf(r.logits).map((p, i) => new Node(n, n.moves[i], p)); return r.value; };
    root.W = evalNode(root); root.N = 1;
    const prepare = (n) => {
      const p = n.parent; if (n.board) return;
      n.board = push(p.board, n.move); n.red = !p.red; n.key = keyOf(n.board, n.red); n.check = inCheck(n.board, n.red); n.last = { f: Math.floor(n.move / 90), t: n.move % 90, red: p.red };
      const ks = [], cs = []; for (let q = n; q.parent; q = q.parent) { ks.push(q.key); cs.push(q.check); } const seqK = histKeys.concat(ks.reverse()), seqC = histChecks.concat(cs.reverse()), m = seqK.length - 1;
      let j = -1; for (let i = m - 1; i >= 0; i--) if (seqK[i] === seqK[m]) { j = i; break; }
      if (j >= 0) { n.term = cycleResult(seqC, j); return; }
      n.moves = legal(n.board, n.red); if (!n.moves.length) n.term = -1;
    };
    const select = (n) => { const sq = Math.sqrt(Math.max(1, n.N)), pq = n.N ? n.W / n.N : 0, unv = pq - fpu; let best = null, bs = -1e9; for (const k of n.kids) { const q = k.N ? -k.W / k.N : unv, s = q + c * k.prior * sq / (1 + k.N); if (s > bs) { bs = s; best = k; } } return best; };
    for (let i = 0; i < sims; i++) {
      let node = root; const path = [root];
      while (node.kids && node.term === null) { node = select(node); path.push(node); }
      if (node.term === null) prepare(node);
      let v; if (node.term !== null) v = node.term; else v = evalNode(node);
      for (let j = path.length - 1; j >= 0; j--) { path[j].N += 1; path[j].W += v; v = -v; }
    }
    const kids = root.kids.slice().sort((a, b) => b.N - a.N), stats = kids.slice(0, 10).map((k) => ({ move: mStr(k.move), visits: k.N, q: k.N ? -k.W / k.N : null, prior: k.prior }));
    const pv = []; let n = root; while (n.kids && pv.length < 8) { n = n.kids.slice().sort((a, b) => b.N - a.N)[0]; if (!n.N) break; pv.push(mStr(n.move)); }
    return { move: kids[0].move, value: root.W / root.N, sims, stats, pv, seconds: (Date.now() - t0) / 1000, root };
  }

  /* ---------- the same API as server.py ---------- */
  function replay(moves) { const g = new Game(); for (const m of moves) g.play(mParse(m)); return g; }
  function state(g) { const st = g.status(); return { legal: st[0] === null ? g.legal().map(mStr) : [], turn: g.red ? 'red' : 'black', check: inCheck(g.board, g.red), status: st, ply: g.moves.length }; }
  function policyApi(W, req) {
    const g = replay(req.moves), st = state(g); if (st.status[0] !== null) return { all: [], value: 0, turn: st.turn, ply: st.ply };
    const mv = g.legal(), r = forward(W, g.board, g.red, g.last, mv), pr = priorsOf(r.logits), order = pr.map((p, i) => i).sort((a, b) => pr[b] - pr[a]);
    return { all: order.map((i) => [mStr(mv[i]), pr[i]]), value: r.value, turn: st.turn, ply: st.ply };
  }
  function legalMapApi(W, req) {
    const g = replay(req.moves), st = state(g); if (st.status[0] !== null) return { map: {}, legal: [], turn: st.turn };
    return { map: legalMap(W, g.board, g.red, g.last), legal: st.legal, turn: st.turn };
  }
  function engineApi(W, req) {
    const g = replay(req.moves), st = state(g); if (st.status[0] !== null) return Object.assign({ error: 'game is over' }, st);
    const t0 = Date.now(); let move, ev, stats, pv, skipped = [], sims = 0, mode = req.mode || 'mcts';
    if (mode === 'cnn' || mode === 'cnn_rules') {
      const mv = g.legal(), r = forward(W, g.board, g.red, g.last, mv), pr = priorsOf(r.logits); let order = pr.map((p, i) => i).sort((a, b) => pr[b] - pr[a]);
      if (req.variety && g.moves.length < req.variety) { const ok = order.filter((i) => pr[i] >= 0.1 * pr[order[0]]), tot = ok.reduce((s, i) => s + pr[i], 0); let u = Math.random() * tot, first = ok[0]; for (const i of ok) { u -= pr[i]; if (u <= 0) { first = i; break; } } order = [first].concat(order.filter((i) => i !== first)); }
      let pick = order[0]; if (mode === 'cnn_rules') for (const i of order) { const why = unsafe(g, mv[i]); if (!why) { pick = i; break; } skipped.push({ move: mStr(mv[i]), why }); }
      move = mv[pick]; ev = r.value; stats = order.slice(0, 10).map((i) => ({ move: mStr(mv[i]), visits: 0, q: null, prior: pr[i] })); pv = [mStr(move)];
    } else {
      const r = search(W, g, Math.max(1, Math.min(req.sims || 20, 400))); move = r.move; ev = r.value; stats = r.stats; pv = r.pv; sims = r.sims;
      if (req.variety && g.moves.length < req.variety) { const kids = r.root.kids.filter((k) => k.N > 0), mx = Math.max(...kids.map((k) => k.N)), ok = kids.filter((k) => k.N >= 0.1 * mx), tot = ok.reduce((s, k) => s + k.N, 0); let u = Math.random() * tot; for (const k of ok) { u -= k.N; if (u <= 0) { move = k.move; break; } } }
    }
    g.play(move); return Object.assign({ move: mStr(move), eval: ev, stats, pv, seconds: (Date.now() - t0) / 1000, sims, skipped, mode }, state(g));
  }

  root.XQ = { legal, pseudo, attacked, inCheck, push, fromFen, perft, Game, unsafe, mStr, mParse, loadModel, forward, planes, search, state, replay, policyApi, engineApi, legalLogits, legalMap, legalMapApi, START_FEN, cycleResult };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.XQ;
})(typeof self !== 'undefined' ? self : globalThis);
