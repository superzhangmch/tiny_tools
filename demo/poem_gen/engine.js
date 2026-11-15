/* Tiny GPT inference engine (int8 weights, KV cache, no dependencies). Works in browsers (global PoemEngine) and node (module.exports).
   Architecture = the training model: token+learned position embeddings, N x [LN -> fused QKV -> causal attention -> proj, LN -> GELU MLP], final LN, tied output embedding. */
(function (root) {
  const erf = x => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
  const gelu = x => 0.5 * x * (1 + erf(x * 0.7071067811865476));
  class Engine {
    constructor(man, buf) {
      const A = man.arch; this.d = A.d; this.L = A.layers; this.H = A.heads; this.hd = A.d / A.heads; this.block = A.block; this.V = A.vocab; this.eps = man.eps; this.itos = man.itos;
      this.stoi = new Map(man.itos.map((c, i) => [c, i])); this.bos = this.stoi.get('<bos>'); this.eos = this.stoi.get('<eos>'); this.unk = this.stoi.get('<unk>');
      const T = {}; for (const t of man.tensors) { const n = t.shape.reduce((a, b) => a * b, 1);
        T[t.name] = t.dtype === 'i8' ? { q: new Int8Array(buf, t.offset, n), s: new Float32Array(buf, t.scale_offset, t.shape[0]), shape: t.shape } : { f: new Float32Array(buf, t.offset, n), shape: t.shape }; }
      this.T = T; const d = this.d;
      this.K = Array.from({ length: this.L }, () => new Float32Array(this.block * d)); this.Vc = Array.from({ length: this.L }, () => new Float32Array(this.block * d));
      this.x = new Float32Array(d); this.h = new Float32Array(d); this.qkv = new Float32Array(3 * d); this.att = new Float32Array(d); this.o = new Float32Array(d);
      this.m = new Float32Array(4 * d); this.sc = new Float32Array(this.block); this.logits = new Float32Array(this.V); this.pos = 0;
    }
    reset() { this.pos = 0; }
    _ln(x, g, b, out) { const d = this.d; let mu = 0; for (let i = 0; i < d; i++) mu += x[i]; mu /= d; let v = 0; for (let i = 0; i < d; i++) { const z = x[i] - mu; v += z * z; } const inv = 1 / Math.sqrt(v / d + this.eps);
      for (let i = 0; i < d; i++) out[i] = (x[i] - mu) * inv * g[i] + b[i]; }
    _lin(x, W, bias, out) { const n = W.shape[0], k = W.shape[1], q = W.q, s = W.s;
      for (let j = 0; j < n; j++) { let acc = 0; const base = j * k; for (let i = 0; i < k; i++) acc += x[i] * q[base + i]; out[j] = acc * s[j] + (bias ? bias[j] : 0); } }
    /* feed one token at the next position; returns hidden (after final LN) */
    step(tok) {
      const T = this.T, d = this.d, H = this.H, hd = this.hd, p = this.pos; if (p >= this.block) throw new Error('context full');
      const te = T['tok.weight'], pe = T['pos.weight'].f, x = this.x, ts = te.s[tok], tb = tok * d;
      for (let i = 0; i < d; i++) x[i] = te.q[tb + i] * ts + pe[p * d + i];
      for (let l = 0; l < this.L; l++) { const P = `blocks.${l}.`;
        this._ln(x, T[P + 'ln1.weight'].f, T[P + 'ln1.bias'].f, this.h); this._lin(this.h, T[P + 'qkv.weight'], T[P + 'qkv.bias'].f, this.qkv);
        this.K[l].set(this.qkv.subarray(d, 2 * d), p * d); this.Vc[l].set(this.qkv.subarray(2 * d, 3 * d), p * d); const K = this.K[l], Vc = this.Vc[l], sc = this.sc, att = this.att, qkv = this.qkv, scale = 1 / Math.sqrt(hd);
        for (let h = 0; h < H; h++) { const ho = h * hd; let mx = -1e30;
          for (let t = 0; t <= p; t++) { let a = 0; const ko = t * d + ho; for (let i = 0; i < hd; i++) a += qkv[ho + i] * K[ko + i]; a *= scale; sc[t] = a; if (a > mx) mx = a; }
          let sum = 0; for (let t = 0; t <= p; t++) { const e = Math.exp(sc[t] - mx); sc[t] = e; sum += e; } const inv = 1 / sum;
          for (let i = 0; i < hd; i++) att[ho + i] = 0;
          for (let t = 0; t <= p; t++) { const w = sc[t] * inv, vo = t * d + ho; for (let i = 0; i < hd; i++) att[ho + i] += w * Vc[vo + i]; } }
        this._lin(att, T[P + 'proj.weight'], T[P + 'proj.bias'].f, this.o); for (let i = 0; i < d; i++) x[i] += this.o[i];
        this._ln(x, T[P + 'ln2.weight'].f, T[P + 'ln2.bias'].f, this.h); this._lin(this.h, T[P + 'mlp.0.weight'], T[P + 'mlp.0.bias'].f, this.m);
        for (let i = 0; i < 4 * d; i++) this.m[i] = gelu(this.m[i]); this._lin(this.m, T[P + 'mlp.2.weight'], T[P + 'mlp.2.bias'].f, this.o); for (let i = 0; i < d; i++) x[i] += this.o[i]; }
      this._ln(x, T['ln.weight'].f, T['ln.bias'].f, this.h); this.pos++; return this.h;
    }
    computeLogits() { const te = this.T['tok.weight'], d = this.d, h = this.h, lg = this.logits;
      for (let j = 0; j < this.V; j++) { let a = 0; const b = j * d; for (let i = 0; i < d; i++) a += h[i] * te.q[b + i]; lg[j] = a * te.s[j]; } return lg; }
    encode(s) { return Array.from(s).map(c => this.stoi.has(c) ? this.stoi.get(c) : this.unk); }
    decode(ids) { return ids.filter(i => i > 3).map(i => this.itos[i]).join(''); }
    /* opts: prefix ('<七绝:月 云>' + optional head text), kind ('七绝'|...|词牌), temp, topk, seed, maxNew, onToken(text) */
    generate(o) {
      const rng = (a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(o.seed == null ? (Math.random() * 2 ** 31) : o.seed);
      const temp = o.temp || 0.8, topk = o.topk || 40, maxNew = o.maxNew || 260, nStop = { 五绝: 2, 七绝: 2, 五律: 4, 七律: 4 }[o.kind];
      this.reset(); const ids = [this.bos, ...this.encode(o.prefix)]; for (let i = 0; i < ids.length - 1; i++) this.step(ids[i]); let last = ids[ids.length - 1], out = [];
      for (let n = 0; n < maxNew && this.pos < this.block; n++) {
        this.step(last); const lg = this.computeLogits(); const idx = Array.from({ length: this.V }, (_, i) => i).sort((a, b) => lg[b] - lg[a]).slice(0, topk);
        let mx = lg[idx[0]], ps = idx.map(i => Math.exp((lg[i] - mx) / temp)), z = ps.reduce((a, b) => a + b, 0), r = rng() * z, k = 0; while (k < ps.length - 1 && (r -= ps[k]) > 0) k++;
        const nxt = idx[k]; if (nxt === this.eos) break; out.push(nxt); last = nxt; if (o.onToken) o.onToken(this.decode(out));
        if (nStop && (this.decode(out).split('。').length - 1) >= nStop) break; }
      return this.decode(out);
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.PoemEngine = Engine;
})(typeof self !== 'undefined' ? self : this);
