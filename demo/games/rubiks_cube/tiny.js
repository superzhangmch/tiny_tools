// 浏览器本地推理：小块表示的策略网络（BatchNorm 已折叠，fp16 权重）+ beam search。
// 用法：const m = await loadTinyModel("/models/tiny_M"); const sol = beamSearch(m, META, state, 16);

function f16ToF32(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

export async function loadTinyModel(base) {
  const [meta, buf] = await Promise.all([
    fetch(base + ".json").then((r) => r.json()),
    fetch(base + ".bin").then((r) => r.arrayBuffer()),
  ]);
  const all = f16ToF32(new Uint16Array(buf));
  const layers = meta.layers.map((L) => ({
    out: L.out, in: L.in,
    W: all.subarray(L.w_off, L.w_off + L.out * L.in),
    b: all.subarray(L.b_off, L.b_off + L.out),
  }));
  // 第一层输入是 one-hot（480 维里只有 20 个 1）：转置存，前向时直接把 20 列加起来
  const L0 = layers[0], W0T = new Float32Array(L0.in * L0.out);
  for (let o = 0; o < L0.out; o++) for (let i = 0; i < L0.in; i++) W0T[i * L0.out + o] = L0.W[o * L0.in + i];
  return { meta, layers, W0T, bytes: buf.byteLength };
}

// 小块编码：返回 20 个激活的输入下标（角块 8 个位置 × 24 + 棱块 12 个位置 × 24）
function activeInputs(m, s) {
  const { corner_idx, corner_table, edge_idx, edge_table } = m.meta, idx = [];
  corner_idx.forEach((g, p) => idx.push(p * 24 + corner_table[p][(s[g[0]] * 6 + s[g[1]]) * 6 + s[g[2]]]));
  const off = corner_idx.length * 24;
  edge_idx.forEach((g, p) => idx.push(off + p * 24 + edge_table[p][s[g[0]] * 6 + s[g[1]]]));
  return idx;
}

function dense(L, x, relu) {
  const y = new Float32Array(L.out);
  for (let o = 0; o < L.out; o++) {
    let acc = L.b[o];
    const row = o * L.in;
    for (let i = 0; i < L.in; i++) acc += L.W[row + i] * x[i];
    y[o] = relu && acc < 0 ? 0 : acc;
  }
  return y;
}

// 单个状态 → 12 个动作的 log-softmax
export function policy(m, s) {
  const L0 = m.layers[0];
  let h = Float32Array.from(L0.b);
  for (const i of activeInputs(m, s)) {
    const col = i * L0.out;
    for (let o = 0; o < L0.out; o++) h[o] += m.W0T[col + o];
  }
  for (let o = 0; o < h.length; o++) if (h[o] < 0) h[o] = 0;
  h = dense(m.layers[1], h, true);
  for (let r = 0; r < m.meta.n_res; r++) {
    const t = dense(m.layers[3 + 2 * r], dense(m.layers[2 + 2 * r], h, true), false);
    for (let o = 0; o < h.length; o++) { const v = h[o] + t[o]; h[o] = v < 0 ? 0 : v; }
  }
  const z = dense(m.layers[m.layers.length - 1], h, false);
  const mx = Math.max(...z);
  const lse = mx + Math.log(z.reduce((a, v) => a + Math.exp(v - mx), 0));
  return z.map((v) => v - lse);
}

// 规范化（模型导出时带 sym_canon）：48 个对称局面取字典序最小的作代表，网络只算这一个，
// 再把动作换回原视角；代表不唯一时对并列视角取平均。与 PyTorch 的 _canon_forward 一致。
function policyCanon(m, s) {
  const { sym_gather: G, sym_cmap: C, sym_mmap: MM } = m.meta;
  let best = null, ties = [];
  for (let g = 0; g < G.length; g++) {
    const gi = G[g], ci = C[g], t = new Array(gi.length);
    for (let k = 0; k < gi.length; k++) t[k] = ci[s[gi[k]]];
    const key = t.join("");
    if (best === null || key < best.key) { best = { key, t }; ties = [g]; }
    else if (key === best.key) ties.push(g);
  }
  const lp = policy(m, best.t), p = lp.map(Math.exp), out = new Array(lp.length).fill(0);
  for (const g of ties) for (let a = 0; a < out.length; a++) out[a] += p[MM[g][a]];
  return out.map((v) => Math.log(Math.max(v / ties.length, 1e-12)));
}

// beam search：每层保留累计 log-prob 最高的 beam 条路径；同一状态只留分最高的；不立即撤销上一步
export function beamSearch(m, META, state, beam, maxDepth = 60) {
  const perms = META.moves.map((mv) => mv.perm), solvedKey = META.solved.join("");
  const isSolved = (s) => s.join("") === solvedKey;
  if (isSolved(state)) return [];
  let cur = [{ s: state, lp: 0, path: [] }];
  for (let d = 0; d < maxDepth; d++) {
    const cands = [];
    cur.forEach((node, i) => {
      const lp = m.meta.sym_canon ? policyCanon(m, node.s) : policy(m, node.s);
      const last = node.path.length ? node.path[node.path.length - 1] : -1;
      for (let a = 0; a < lp.length; a++) if (last < 0 || a !== (last ^ 1)) cands.push({ i, a, lp: node.lp + lp[a] });
    });
    cands.sort((x, y) => y.lp - x.lp);
    const next = [], seen = new Set();
    for (const c of cands) {
      const ps = cur[c.i].s, p = perms[c.a], s = new Array(ps.length);
      for (let k = 0; k < ps.length; k++) s[k] = ps[p[k]];
      const key = s.join("");
      if (seen.has(key)) continue;
      seen.add(key);
      const path = [...cur[c.i].path, c.a];
      if (key === solvedKey) return path;
      next.push({ s, lp: c.lp, path });
      if (next.length >= beam) break;
    }
    cur = next;
  }
  return null;
}

// 失败重试。mode="scramble"：把原局面随机拧 k 步（相邻不互逆）再搜，解 = 拧的 k 步 + 搜出的路径。
// mode="view"：把原局面换一种对称视角再搜（需要 META.sym），解翻译回原视角，不会变长；47 个视角用完后改为 scramble。
// 对规范化模型换视角无效（所有视角都会转到同一个标准姿势）。总共最多尝试 maxAttempts 次。
// 返回 {moves, attempts, nPre, how}：how = "first" | "view" | "scramble"。
export function solveWithRestart(m, META, state, beam, { retry = true, k = 4, maxAttempts = 50, onAttempt = null, mode = "scramble" } = {}) {
  if (onAttempt) onAttempt(1);
  let moves = beamSearch(m, META, state, beam), attempts = 1, how = moves ? "first" : "";
  const views = mode === "view" && META.sym ? META.sym.order : [];
  let vi = 0;
  while (!moves && retry && attempts < maxAttempts) {
    if (onAttempt) onAttempt(attempts + 1);
    attempts++;
    if (vi < views.length) {                              // 换视角：t[k] = cmap[g][state[gather[g][k]]]
      const g = views[vi++], gi = META.sym.gather[g], ci = META.sym.cmap[g], inv = META.sym.inv_mmap[g];
      const t = gi.map((src) => ci[state[src]]);
      const sol = beamSearch(m, META, t, beam);
      if (sol) { moves = sol.map((a) => inv[a]); how = "view"; }
    } else {                                              // 随机拧 k 步
      const pre = [];
      for (let t = 0; t < k; t++) {
        let a;
        do { a = Math.floor(Math.random() * META.moves.length); } while (t > 0 && a === (pre[t - 1] ^ 1));
        pre.push(a);
      }
      let s = state.slice();
      for (const a of pre) { const p = META.moves[a].perm; s = p.map((i) => s[i]); }
      const sol = beamSearch(m, META, s, beam);
      if (sol) { moves = [...pre, ...sol]; how = "scramble"; }
    }
  }
  return { moves, attempts, nPre: how === "scramble" ? k : 0, how };
}
