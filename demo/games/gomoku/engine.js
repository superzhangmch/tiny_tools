/* In-browser Gomoku engine: the trained CNN (BatchNorm folded into the convolutions) + plain PUCT MCTS.
 * The only game knowledge used by the search is the rule itself: five (or more) in a row wins, a full board is a draw.
 * Works in a Web Worker (self), in a page (window) and in Node (module.exports).
 * Coordinates: cell = row * 15 + col.  board: Int8Array(225), +1 = black, -1 = white, 0 = empty. */
(function (root) {
  'use strict';
  const S = 15, N = 225, P = 17;                       // board size, cells, padded plane side (15 + 2)

  function loadModel(buf, manifest) {
    const f = new Float32Array(buf), T = {};
    for (const t of manifest.tensors) { const size = t.shape.reduce((a, b) => a * b, 1); T[t.name] = f.subarray(t.offset, t.offset + size); }
    return { T, channels: manifest.channels, blocks: manifest.blocks };
  }

  function Net(model) {
    const T = model.T, C = model.channels, B = model.blocks;
    const pad = new Float32Array(C * P * P), x0 = new Float32Array(C * N), t1 = new Float32Array(C * N), t2 = new Float32Array(C * N);

    function conv3(inp, cin, w, b, cout, out, relu) {  // 3x3 conv, zero padding, bias, optional ReLU
      pad.fill(0, 0, cin * P * P);
      for (let c = 0; c < cin; c++) for (let y = 0; y < S; y++) { const s = c * N + y * S, d = c * P * P + (y + 1) * P + 1; for (let x = 0; x < S; x++) pad[d + x] = inp[s + x]; }
      for (let co = 0; co < cout; co++) {
        const ob = co * N, bv = b[co]; for (let i = 0; i < N; i++) out[ob + i] = bv;
        for (let ci = 0; ci < cin; ci++) {
          const wb = (co * cin + ci) * 9, pb = ci * P * P;
          for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
            const wv = w[wb + ky * 3 + kx]; if (wv === 0) continue;
            for (let y = 0; y < S; y++) { const ib = pb + (y + ky) * P + kx, o = ob + y * S; for (let x = 0; x < S; x++) out[o + x] += wv * pad[ib + x]; }
          }
        }
        if (relu) for (let i = 0; i < N; i++) if (out[ob + i] < 0) out[ob + i] = 0;
      }
    }

    // planes: Float32Array(4*N) -> {logits: Float32Array(N), value}
    this.forward = function (planes) {
      conv3(planes, 4, T['stem.w'], T['stem.b'], C, x0, true);                 // stem (conv+BN+ReLU)
      for (let i = 0; i < B; i++) {                                           // residual blocks: relu(x + convB(relu(convA(x))))
        conv3(x0, C, T[`blk${i}.a.w`], T[`blk${i}.a.b`], C, t1, true);
        conv3(t1, C, T[`blk${i}.b.w`], T[`blk${i}.b.b`], C, t2, false);
        for (let k = 0; k < C * N; k++) { const v = x0[k] + t2[k]; x0[k] = v > 0 ? v : 0; }
      }
      // policy head: 1x1 conv (C->2) + ReLU + FC(450->225)
      const pw = T['p.w'], pb = T['p.b'], pin = new Float32Array(2 * N);
      for (let o = 0; o < 2; o++) for (let i = 0; i < N; i++) { let s = pb[o]; for (let c = 0; c < C; c++) s += pw[o * C + c] * x0[c * N + i]; pin[o * N + i] = s > 0 ? s : 0; }
      const fw = T['pf.w'], fb = T['pf.b'], logits = new Float32Array(N);
      for (let o = 0; o < N; o++) { let s = fb[o]; const wo = o * 2 * N; for (let i = 0; i < 2 * N; i++) s += fw[wo + i] * pin[i]; logits[o] = s; }
      // value head: 1x1 conv (C->1) + ReLU + FC(225->64) + ReLU + FC(64->1) + tanh
      const vw = T['v.w'], vb = T['v.b'], vin = new Float32Array(N);
      for (let i = 0; i < N; i++) { let s = vb[0]; for (let c = 0; c < C; c++) s += vw[c] * x0[c * N + i]; vin[i] = s > 0 ? s : 0; }
      const w1 = T['vf1.w'], b1 = T['vf1.b'], h = new Float32Array(64);
      for (let o = 0; o < 64; o++) { let s = b1[o]; for (let i = 0; i < N; i++) s += w1[o * N + i] * vin[i]; h[o] = s > 0 ? s : 0; }
      const w2 = T['vf2.w'], b2 = T['vf2.b']; let s2 = b2[0]; for (let o = 0; o < 64; o++) s2 += w2[o] * h[o];
      return { logits, value: Math.tanh(s2) };
    };
  }

  // input planes for the side `player` to move: own, opponent, last move, empty  (identical to train_cnn.planes)
  function makePlanes(board, player, last) {
    const x = new Float32Array(4 * N);
    for (let i = 0; i < N; i++) { const v = board[i] * player; if (v === 1) x[i] = 1; else if (v === -1) x[N + i] = 1; else x[3 * N + i] = 1; }
    if (last >= 0) x[2 * N + last] = 1;
    return x;
  }

  // -> {prior: Float32Array(N) softmax over empty cells (0 elsewhere), value: expected result for `player` to move in [-1, 1]}
  function evaluate(net, board, player, last) {
    const out = net.forward(makePlanes(board, player, last)), prior = new Float32Array(N); let mx = -1e30;
    for (let i = 0; i < N; i++) if (board[i] === 0 && out.logits[i] > mx) mx = out.logits[i];
    let sum = 0; for (let i = 0; i < N; i++) if (board[i] === 0) { const e = Math.exp(out.logits[i] - mx); prior[i] = e; sum += e; }
    for (let i = 0; i < N; i++) prior[i] /= sum || 1;
    return { prior, value: out.value };
  }

  function winsAt(b, r, c, p) {                         // did player p just complete >= 5 in a row through (r, c)?
    const D = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of D) {
      let n = 1;
      for (const sg of [1, -1]) { let rr = r + sg * dr, cc = c + sg * dc; while (rr >= 0 && rr < S && cc >= 0 && cc < S && b[rr * S + cc] === p) { n++; rr += sg * dr; cc += sg * dc; } }
      if (n >= 5) return true;
    }
    return false;
  }

  function Node(prior) { this.P = prior; this.N = new Float32Array(N); this.W = new Float32Array(N); this.kids = new Map(); }

  // PUCT MCTS. returns {visits: Float32Array(N), rootValue}
  function mctsSearch(net, board, player, last, sims, cpuct) {
    cpuct = cpuct || 1.5;
    const first = evaluate(net, board, player, last), rootNode = new Node(first.prior);
    for (let s = 0; s < sims; s++) {
      const b = Int8Array.from(board); let p = player, node = rootNode; const path = []; let v = 0, emptyCount = 0;
      for (let i = 0; i < N; i++) if (b[i] === 0) emptyCount++;
      for (;;) {
        let tot = 0; for (let i = 0; i < N; i++) tot += node.N[i];
        const sq = Math.sqrt(tot + 1); let best = -1, bs = -1e30;
        for (let a = 0; a < N; a++) {
          if (b[a] !== 0) continue;
          const n = node.N[a], sc = (n > 0 ? node.W[a] / n : 0) + cpuct * node.P[a] * sq / (1 + n);
          if (sc > bs) { bs = sc; best = a; }
        }
        const a = best; path.push([node, a]); b[a] = p; emptyCount--;
        if (winsAt(b, (a / S) | 0, a % S, p)) { v = 1; break; }
        if (emptyCount === 0) { v = 0; break; }
        let kid = node.kids.get(a);
        if (!kid) { const e = evaluate(net, b, -p, a); node.kids.set(a, new Node(e.prior)); v = -e.value; break; }
        node = kid; p = -p;
      }
      for (let i = path.length - 1; i >= 0; i--) { const nd = path[i][0], act = path[i][1]; nd.N[act] += 1; nd.W[act] += v; v = -v; }
    }
    return { visits: rootNode.N, rootValue: first.value, prior: first.prior };
  }

  root.GomokuEngine = { S, N, loadModel, Net, makePlanes, evaluate, winsAt, mctsSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GomokuEngine;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
