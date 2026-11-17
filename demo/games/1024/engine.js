/* 1024 engine: game rules (same as env.py), the V net (MLP / CNN, 4 input encodings) and expectimax search.
 * Plain script: works in the page, in a Web Worker (importScripts) and in node (module.exports).
 *
 * Board = Int8Array(16), row-major, each cell is the EXPONENT (0 empty, 1 = "2", 10 = "1024").
 * Actions: 0 up, 1 right, 2 down, 3 left.
 *
 * V(afterstate) = expected future (merge score / r_scale) after a move, before the random spawn.
 *   q(s,a) = gain(s,a)/r_scale + gamma * ( d == 1 ? V(afterstate) : E_spawn[ max_a' q(s'',a') at depth d-1 ] )
 */
(function (root) {
  'use strict';
  const N = 4, CELLS = 16, NEXP = 16;
  const ACTION_NAMES = ['up', 'right', 'down', 'left'];

  // ---- rules --------------------------------------------------------------------------------
  const ROW_NEW = new Uint16Array(65536), ROW_GAIN = new Int32Array(65536);
  (function build() {
    for (let idx = 0; idx < 65536; idx++) {
      const c = [idx & 15, (idx >> 4) & 15, (idx >> 8) & 15, (idx >> 12) & 15].filter((v) => v);
      const out = []; let g = 0;
      for (let i = 0; i < c.length;) {
        if (i + 1 < c.length && c[i] === c[i + 1]) { out.push(c[i] + 1); g += 2 ** (c[i] + 1); i += 2; } else { out.push(c[i]); i++; }
      }
      while (out.length < 4) out.push(0);
      ROW_NEW[idx] = out[0] | (out[1] << 4) | (out[2] << 8) | (out[3] << 12); ROW_GAIN[idx] = g;
    }
  })();
  // LINES[a] = 4 lines of 4 cell positions, in the order tiles slide toward the first one
  const LINES = [[], [], [], []];
  for (let k = 0; k < 4; k++) {
    LINES[0].push([k, 4 + k, 8 + k, 12 + k]);                 // up: columns, top -> bottom
    LINES[1].push([4 * k + 3, 4 * k + 2, 4 * k + 1, 4 * k]);  // right: rows, right -> left
    LINES[2].push([12 + k, 8 + k, 4 + k, k]);                 // down: columns, bottom -> top
    LINES[3].push([4 * k, 4 * k + 1, 4 * k + 2, 4 * k + 3]);  // left: rows, left -> right
  }
  /** Slide+merge. Returns {after, gain, changed}. */
  function move(board, a) {
    const after = new Int8Array(CELLS); let gain = 0, changed = false;
    for (const p of LINES[a]) {
      const idx = board[p[0]] | (board[p[1]] << 4) | (board[p[2]] << 8) | (board[p[3]] << 12);
      const nw = ROW_NEW[idx]; gain += ROW_GAIN[idx]; if (nw !== idx) changed = true;
      after[p[0]] = nw & 15; after[p[1]] = (nw >> 4) & 15; after[p[2]] = (nw >> 8) & 15; after[p[3]] = (nw >> 12) & 15;
    }
    return { after, gain, changed };
  }
  function legalMask(board) { return [0, 1, 2, 3].map((a) => move(board, a).changed); }
  /** How every tile travels for action a: [{from, to, v, merge}] (v = exponent before the move; two merging tiles share `to`). */
  function moveTrace(board, a) {
    const out = [];
    for (const p of LINES[a]) {
      const t = []; for (let k = 0; k < 4; k++) if (board[p[k]]) t.push({ pos: p[k], v: board[p[k]] });
      for (let i = 0, d = 0; i < t.length; d++) {
        if (i + 1 < t.length && t[i].v === t[i + 1].v) { out.push({ from: t[i].pos, to: p[d], v: t[i].v, merge: true }, { from: t[i + 1].pos, to: p[d], v: t[i + 1].v, merge: true }); i += 2; }
        else { out.push({ from: t[i].pos, to: p[d], v: t[i].v, merge: false }); i++; }
      }
    }
    return out;
  }

  function mulberry32(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

  class Game {
    constructor(seed) { this.rng = seed == null ? Math.random : mulberry32(seed); this.reset(); }
    reset() { this.board = new Int8Array(CELLS); this.score = 0; this.moves = 0; this.over = false; this.lastSpawn = -1; this.spawn(); this.spawn(); return this; }
    spawn() {
      const empty = []; for (let i = 0; i < CELLS; i++) if (!this.board[i]) empty.push(i);
      if (!empty.length) return -1;
      const pos = empty[Math.floor(this.rng() * empty.length)]; this.board[pos] = this.rng() < 0.9 ? 1 : 2; this.lastSpawn = pos; return pos;
    }
    /** phase 1: slide + merge (score counts now). returns {changed, gain, trace, mergedTo:[cells]} */
    slide(a) {
      const r = move(this.board, a); if (!r.changed) return { changed: false, gain: 0 };
      const trace = moveTrace(this.board, a), mergedTo = [...new Set(trace.filter((x) => x.merge).map((x) => x.to))];
      this.board = r.after; this.score += r.gain; this.moves++; this.lastSpawn = -1;
      return { changed: true, gain: r.gain, trace, mergedTo };
    }
    /** phase 2: the random new tile; then checks whether the game is over. returns its cell */
    spawnTile() { const pos = this.spawn(); this.over = !legalMask(this.board).some(Boolean); return pos; }
    /** both phases at once */
    step(a) { const r = this.slide(a); if (r.changed) this.spawnTile(); return r; }
    maxTile() { let m = 0; for (const v of this.board) if (v > m) m = v; return m ? 2 ** m : 0; }
  }

  // ---- network ------------------------------------------------------------------------------
  const ENC_CHANNELS = { onehot: NEXP, scalar: 1, scalar_empty: 2, thermo: NEXP };
  /** board -> sparse input: {idx:Int32Array, val:Float32Array, C}. Input index = channel * 16 + cell. */
  function encodeSparse(board, enc) {
    const idx = [], val = [];
    for (let p = 0; p < CELLS; p++) {
      const e = Math.min(board[p], NEXP - 1);
      if (enc === 'onehot') { idx.push(e * 16 + p); val.push(1); }
      else if (enc === 'scalar') { if (e) { idx.push(p); val.push(e / 10); } }
      else if (enc === 'scalar_empty') { if (e) { idx.push(p); val.push(e / 10); } else { idx.push(16 + p); val.push(1); } }
      else if (enc === 'thermo') { for (let c = 0; c < e; c++) { idx.push(c * 16 + p); val.push(1); } }
      else throw new Error('unknown enc ' + enc);
    }
    return { idx, val };
  }

  let HALF = null;
  function halfTable() {                       // float16 bit pattern -> float32 (65536-entry table, built once)
    if (HALF) return HALF; HALF = new Float32Array(65536);
    for (let h = 0; h < 65536; h++) { const sg = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023; HALF[h] = e === 0 ? sg * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : sg * Infinity) : sg * Math.pow(2, e - 15) * (1 + m / 1024); }
    return HALF;
  }
  function loadModel(buf, man) {
    let f; if (man.dtype === 'float16') { const u = new Uint16Array(buf), T = halfTable(); f = new Float32Array(u.length); for (let i = 0; i < u.length; i++) f[i] = T[u[i]]; } else f = new Float32Array(buf);
    const t = {};
    for (const e of man.tensors) { const n = e.shape.reduce((x, y) => x * y, 1); t[e.name] = f.subarray(e.offset, e.offset + n); t[e.name].shape = e.shape; }
    return { man, t };
  }

  class Net {
    constructor(model) {
      this.m = model; this.arch = model.man.arch; this.enc = model.man.enc; this.t = model.t;
      if (this.arch === 'cnn') {
        this.convs = [];
        for (let i = 0; ; i++) { const w = this.t[`convs.${i}.weight`]; if (!w) break; const [F, C, kh, kw] = w.shape; this.convs.push({ w, b: this.t[`convs.${i}.bias`], F, C, kh, kw, oh: N - kh + 1, ow: N - kw + 1 }); }
        this.flat = this.convs.reduce((s, c) => s + c.F * c.oh * c.ow, 0);
        this.head0 = { w: this.t['head.0.weight'], b: this.t['head.0.bias'], out: this.t['head.0.weight'].shape[0] };
        this.head2 = { w: this.t['head.2.weight'], b: this.t['head.2.bias'] };
        this.feat = new Float32Array(this.flat);
      } else if (this.arch === 'mlp') {
        this.l1 = { w: this.t['net.1.weight'], b: this.t['net.1.bias'], out: this.t['net.1.weight'].shape[0], inn: this.t['net.1.weight'].shape[1] };
        this.l2 = { w: this.t['net.3.weight'], b: this.t['net.3.bias'], out: this.t['net.3.weight'].shape[0], inn: this.t['net.3.weight'].shape[1] };
        this.l3 = { w: this.t['net.5.weight'], b: this.t['net.5.bias'] };
        this.h1 = new Float32Array(this.l1.out); this.h2 = new Float32Array(this.l2.out);
      } else throw new Error('unknown arch ' + this.arch);
    }
    /** V of a board (an afterstate). */
    value(board) {
      const x = encodeSparse(board, this.enc);
      return this.arch === 'mlp' ? this._mlp(x) : this._cnn(x);
    }
    _mlp(x) {
      const { l1, l2, l3, h1, h2 } = this;
      for (let j = 0; j < l1.out; j++) { let s = l1.b[j]; const row = j * l1.inn; for (let k = 0; k < x.idx.length; k++) s += l1.w[row + x.idx[k]] * x.val[k]; h1[j] = s > 0 ? s : 0; }
      for (let j = 0; j < l2.out; j++) { let s = l2.b[j]; const row = j * l2.inn; for (let i = 0; i < l1.out; i++) { const h = h1[i]; if (h) s += l2.w[row + i] * h; } h2[j] = s > 0 ? s : 0; }
      let s = l3.b[0]; for (let i = 0; i < l2.out; i++) s += l3.w[i] * h2[i];
      return s;
    }
    _cnn(x) {
      const feat = this.feat; let off = 0;
      for (const c of this.convs) {
        const O = c.oh * c.ow, fsz = c.C * c.kh * c.kw;
        for (let f = 0; f < c.F; f++) { const b = c.b[f]; for (let o = 0; o < O; o++) feat[off + f * O + o] = b; }
        for (let k = 0; k < x.idx.length; k++) {            // scatter each non-zero input into the outputs it touches
          const ch = (x.idx[k] / 16) | 0, pos = x.idx[k] % 16, ih = (pos / 4) | 0, iw = pos % 4, v = x.val[k];
          for (let ki = 0; ki < c.kh; ki++) { const oh = ih - ki; if (oh < 0 || oh >= c.oh) continue;
            for (let kj = 0; kj < c.kw; kj++) { const ow = iw - kj; if (ow < 0 || ow >= c.ow) continue;
              const woff = ch * c.kh * c.kw + ki * c.kw + kj, o = oh * c.ow + ow;
              for (let f = 0; f < c.F; f++) feat[off + f * O + o] += c.w[f * fsz + woff] * v; } }
        }
        for (let i = 0; i < c.F * O; i++) if (feat[off + i] < 0) feat[off + i] = 0;
        off += c.F * O;
      }
      const nz = []; for (let i = 0; i < this.flat; i++) if (feat[i]) nz.push(i);
      const { head0, head2 } = this; let out = head2.b[0];
      for (let j = 0; j < head0.out; j++) {
        let s = head0.b[j]; const row = j * this.flat; for (let k = 0; k < nz.length; k++) s += head0.w[row + nz[k]] * feat[nz[k]];
        if (s > 0) out += head2.w[j] * s;
      }
      return out;
    }
  }

  // ---- expectimax -----------------------------------------------------------------------------
  /** q values (4, -Infinity for illegal moves) at search depth d (d=1: plain greedy r + gamma*V). */
  function qValues(net, board, d, gamma, rScale) {
    const q = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (let a = 0; a < 4; a++) {
      const m = move(board, a); if (!m.changed) continue;
      const r = m.gain / rScale; let v;
      if (d <= 1) v = net.value(m.after);
      else {
        const empty = []; for (let i = 0; i < CELLS; i++) if (!m.after[i]) empty.push(i);
        const k = empty.length; v = 0;
        for (const p of empty) for (const [tile, pr] of [[1, 0.9], [2, 0.1]]) {
          m.after[p] = tile; v += (pr / k) * valueOf(net, m.after, d - 1, gamma, rScale); m.after[p] = 0;
        }
      }
      q[a] = r + gamma * v;
    }
    return q;
  }
  function valueOf(net, board, d, gamma, rScale) {
    const q = qValues(net, board, d, gamma, rScale); const m = Math.max(...q);
    return Number.isFinite(m) ? m : 0;   // no legal move -> terminal
  }
  function bestAction(q) { let b = -1; for (let a = 0; a < 4; a++) if (q[a] > -Infinity && (b < 0 || q[a] > q[b])) b = a; return b; }

  const api = { ACTION_NAMES, ENC_CHANNELS, move, moveTrace, legalMask, Game, loadModel, Net, qValues, valueOf, bestAction, encodeSparse, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.G1024 = api;
})(typeof self !== 'undefined' ? self : this);
