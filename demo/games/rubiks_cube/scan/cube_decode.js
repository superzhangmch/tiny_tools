// cube_decode.js — 6 张逐面照片 -> 带约束的整体解码(纯 JS, 无依赖, 不碰 DOM)。cube_decode.py 的移植, 结果与 Python 版逐格一致(见 web/test_decode_js.mjs)。
//
//   import { decode6 } from "./cube_decode.js";
//   const res = decode6([{ cells: [[r,g,b] x 9], weights: { 格序号: 0~1 } }, ... x 6]);   // 按拍摄顺序: 起始, 右转 x3, 上, 下
//   res.faces / res.palette / res.corrected / res.ambiguous / res.facelets / res.where / res.hypothesis
//
// 思路: 6 个中心 = 6 种颜色样本(不聚类); 逐"块"(8 角 + 12 棱)做匈牙利匹配, 再用 角块扭转和≡0(mod 3)、棱块翻转和≡0(mod 2)、角/棱置换奇偶相同
// 保证是合法魔方(不合法就在代价最小的方向最优先搜索改最少的块); 用户实际的转法(右转/左转、上下拍反、上/下两张在平面内转 90°*k)共 64 种假设逐个解, 取代价最小的合法解。
import { rgbToLab } from "./cube_reader.js";
import { FRAMES as FR } from "./cube3d.js";

const FACES = "URFDLB", NAMES = "ABCDEF";
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a) => a.map((x) => -x);

// ---------------- 匈牙利算法(行数 <= 列数, 最小化), 返回 ans[row] = col ----------------
export function hungarian(cost) {
  const n = cost.length, m = cost[0].length, INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Float64Array(m + 1).fill(INF), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n);
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

// ---------------- 颜色特征: 色相方向 x 饱和度(色度/亮度) ----------------
export function feat(rgb) {
  const [L, a, b] = rgbToLab(rgb[0], rgb[1], rgb[2]), c = Math.hypot(a, b);
  if (c < 1e-9) return [0, 0];
  const g = (60 * c) / Math.max(L, 10);
  return [(g * a) / c, (g * b) / c];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
  return [h, mx ? d / mx : 0, mx];
}
const CANON = [[0, [230, 57, 70]], [30, [255, 140, 26]], [55, [255, 214, 10]], [130, [46, 204, 113]], [215, [30, 136, 229]], [295, [142, 68, 173]]];   // 红 橙 黄 绿 蓝 紫
const WHITE = [245, 245, 245];
/** 显示用的"净化"颜色: 白 = 饱和度最低且明显低于其它类; 其余各类按色相(匈牙利匹配)分配到 红/橙/黄/绿/蓝/紫 中互不相同的标准纯色。raw: {token: rgb} -> {token: rgb} */
export function displayColors(raw) {
  const keys = Object.keys(raw), hsv = Object.fromEntries(keys.map((k) => [k, rgbToHsv(...raw[k])]));
  const sats = keys.map((k) => [hsv[k][1], k]).sort((a, b) => a[0] - b[0]);
  let white = null;
  if (sats.length >= 2 && (sats[0][0] < 0.14 || (sats[0][0] < 0.3 && (sats[1][0] - sats[0][0]) / Math.max(sats[1][0], 1e-6) > 0.15))) white = sats[0][1];
  const rest = keys.filter((k) => k !== white), dd = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const asg = hungarian(rest.map((k) => CANON.map((c) => dd(hsv[k][0] * 360, c[0]))));
  const out = white ? { [white]: WHITE.slice() } : {};
  rest.forEach((k, i) => { out[k] = CANON[asg[i]][1].slice(); });
  return out;
}

// ---------------- 魔方几何(与 cube.py / cube3d.js / cube_merge.py 一致) ----------------
const stickerPos = (face, idx) => { const [n, r, d] = FR[face], row = (idx / 3) | 0, col = idx % 3; return [0, 1, 2].map((k) => 3 * n[k] + (2 * col - 2) * r[k] + (2 * row - 2) * d[k]); };
const cubieOf = (face, idx) => { const p = stickerPos(face, idx), n = FR[face][0]; return p.map((v, k) => v - n[k]); };

/** 角块(3 格)按"U/D 格在前、再按 (na x nb)·nc>0 的循环次序", 棱块(2 格)按"U/D 格(无则 F/B 格)在前"; 顺序与 Python 版一致 */
const { CORNERS, EDGES } = (() => {
  const by = new Map();
  for (const f of FACES) for (let i = 0; i < 9; i++) { const key = cubieOf(f, i).join(","); if (!by.has(key)) by.set(key, []); by.get(key).push([f, i]); }
  const corners = [], edges = [];
  for (const [key, sts0] of by) {
    const c = key.split(",").map(Number), nz = c.filter((v) => v).length;
    if (nz === 3) {
      const sts = sts0.slice().sort((a, b) => ("UD".includes(a[0]) ? 0 : 1) - ("UD".includes(b[0]) ? 0 : 1)), rest = sts.slice(1);
      const na = FR[sts[0][0]][0], nb = FR[rest[0][0]][0], nd = FR[rest[1][0]][0], cr = dot(cross(na, nb), nd);
      corners.push(cr > 0 ? [sts[0], ...rest] : [sts[0], ...rest.slice().reverse()]);
    } else if (nz === 2) {
      edges.push(sts0.slice().sort((a, b) => (("UD".includes(a[0]) ? 0 : 1) - ("UD".includes(b[0]) ? 0 : 1)) || (("FB".includes(a[0]) ? 0 : 1) - ("FB".includes(b[0]) ? 0 : 1))));
    }
  }
  return { CORNERS: corners, EDGES: edges };
})();

const parity = (perm) => { const seen = new Set(); let p = 0; for (let i = 0; i < perm.length; i++) { if (seen.has(i)) continue; let j = i, n = 0; while (!seen.has(j)) { seen.add(j); j = perm[j]; n++; } p += n - 1; } return p % 2; };
const stKey = (st) => st[0].join("") + "|" + st[1].join("") + "|" + st[2].join(",") + "|" + st[3].join("");

class MinHeap {   // 最小堆, 按 c 比较, c 相同按 mods
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.c < y.c || (x.c === y.c && x.mods < y.mods); }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && this.less(l, m)) m = l; if (r < a.length && this.less(r, m)) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; }
}

/** 给定 54 格特征与 6 个颜色样本, 解出合法魔方的最小代价着色 */
class Solver {
  constructor(featByPos, protos, cof, weight = {}) {
    this.cof = cof;
    this.d = {};   // d["F4|k"] -> 到样本 k 的距离(乘权重)
    for (const key of Object.keys(featByPos)) for (let k = 0; k < 6; k++) this.d[key + "|" + k] = (weight[key] ?? 1) * dist(featByPos[key], protos[k]);
    this.pcC = CORNERS.map((c) => c.map((s) => cof[s[0]])); this.pcE = EDGES.map((c) => c.map((s) => cof[s[0]]));
    const D = (s, k) => this.d[s[0] + s[1] + "|" + k];
    this.CC = CORNERS.map((cq) => this.pcC.map((pc) => [0, 1, 2].map((o) => [0, 1, 2].reduce((a, j) => a + D(cq[j], pc[(j + o) % 3]), 0))));
    this.EC = EDGES.map((eq) => this.pcE.map((pc) => [0, 1].map((o) => [0, 1].reduce((a, j) => a + D(eq[j], pc[(j + o) % 2]), 0))));
  }
  initial() {
    const pc = hungarian(this.CC.map((row) => row.map((o) => Math.min(...o)))), pe = hungarian(this.EC.map((row) => row.map((o) => Math.min(...o))));
    const argmin = (a) => a.indexOf(Math.min(...a));
    return [pc, pc.map((p, q) => argmin(this.CC[q][p])), pe, pe.map((p, q) => argmin(this.EC[q][p]))];
  }
  cost(st) { const [pc, oc, pe, oe] = st; let s = 0; for (let q = 0; q < 8; q++) s += this.CC[q][pc[q]][oc[q]]; for (let q = 0; q < 12; q++) s += this.EC[q][pe[q]][oe[q]]; return s; }
  static valid(st) { const [pc, oc, pe, oe] = st; return oc.reduce((a, b) => a + b, 0) % 3 === 0 && oe.reduce((a, b) => a + b, 0) % 2 === 0 && parity(pc) === parity(pe); }
  *neighbors(st) {
    const [pc, oc, pe, oe] = st, argmin = (a) => a.indexOf(Math.min(...a));
    for (let q = 0; q < 8; q++) for (let o = 0; o < 3; o++) if (o !== oc[q]) { const n = oc.slice(); n[q] = o; yield [pc, n, pe, oe]; }                       // 改一个角块朝向
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { const n = pc.slice(); [n[a], n[b]] = [n[b], n[a]]; const o2 = oc.slice(); o2[a] = argmin(this.CC[a][n[a]]); o2[b] = argmin(this.CC[b][n[b]]); yield [n, o2, pe, oe]; }   // 交换两个角块
    for (let q = 0; q < 12; q++) { const n = oe.slice(); n[q] ^= 1; yield [pc, oc, pe, n]; }                                                                          // 翻转一个棱块
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) { const n = pe.slice(); [n[a], n[b]] = [n[b], n[a]]; const o2 = oe.slice(); o2[a] = argmin(this.EC[a][n[a]]); o2[b] = argmin(this.EC[b][n[b]]); yield [pc, oc, n, o2]; }   // 交换两个棱块
  }
  /** 最优先搜索: 从无约束最优解出发, 找代价最小的合法状态。返回 {st, cost, mods} 或 null */
  solve(maxExpand = 4000) {
    const st0 = this.initial(), heap = new MinHeap(), seen = new Set([stKey(st0)]); heap.push({ c: this.cost(st0), mods: 0, st: st0 });
    for (let n = 0; heap.size && n < maxExpand; n++) {
      const { c, mods, st } = heap.pop();
      if (Solver.valid(st)) return { st, cost: c, mods };
      for (const nb of this.neighbors(st)) { const k = stKey(nb); if (!seen.has(k)) { seen.add(k); heap.push({ c: this.cost(nb), mods: mods + 1, st: nb }); } }
    }
    return null;
  }
  colors(st) {
    const [pc, oc, pe, oe] = st, out = {};
    for (const f of FACES) out[f + 4] = this.cof[f];
    for (let q = 0; q < 8; q++) CORNERS[q].forEach((s, j) => { out[s[0] + s[1]] = this.pcC[pc[q]][(j + oc[q]) % 3]; });
    for (let q = 0; q < 12; q++) EDGES[q].forEach((s, j) => { out[s[0] + s[1]] = this.pcE[pe[q]][(j + oe[q]) % 2]; });
    return out;
  }
}

// ---------------- 6 张逐面的拍摄几何 ----------------
/** 6 张照片各自的 [法向 n, 图像右 right, 图像下 down]。direction=+1: "右转"把右侧面转到正对; -1: 左侧面。swap: 上/下拍反。rot5/rot6: 上/下两张在平面内转 90°*k */
export function frames6(direction, swap, rot5 = 0, rot6 = 0) {
  let n = [0, 0, 1]; const up = [0, 1, 0]; let right = cross(up, n); const out = [[n, right, neg(up)]];
  for (let i = 0; i < 3; i++) { n = right.map((r) => direction * r); right = cross(up, n); out.push([n, right, neg(up)]); }
  const n4 = out[3][0], r4 = out[3][1];
  const toward = [up, r4, n4], away = [neg(up), r4, neg(n4)], [s5, s6] = swap ? [away, toward] : [toward, away];
  const spin = (fr, k) => { let [nn, rr, dd] = fr; for (let i = 0; i < ((k % 4) + 4) % 4; i++) { [rr, dd] = [cross(nn, rr), cross(nn, dd)]; } return [nn, rr, dd]; };
  return [...out, spin(s5, rot5), spin(s6, rot6)];
}
function locate(p) {
  for (const f of FACES) { const [an, ar, ad] = FR[f]; if (dot(p, an) === 3) return [f, ((dot(p, ad) + 2) / 2) * 3 + (dot(p, ar) + 2) / 2]; }
  throw new Error("bad position");
}

/** faces: 按拍摄顺序的 6 个 {cells:[9 个 rgb], weights:{格序号:权重}}; 返回与 Python decode6 同结构的结果(无 solution: 求解交给 AI 模型; valid=约束保证的合法) */
export function decode6(faces, hypotheses = null, reorient = true) {
  const feats = {}, rgbs = {};
  faces.forEach((ph, s) => { for (let i = 0; i < 9; i++) { feats[s + "_" + i] = feat(ph.cells[i]); rgbs[s + "_" + i] = ph.cells[i]; } });
  const protos = faces.map((_, s) => feats[s + "_4"]);
  let close = [Infinity, 0, 0];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const d = dist(protos[i], protos[j]); if (d < close[0]) close = [d, i, j]; }
  if (close[0] < 6) return { ok: false, error: `第 ${close[1] + 1} 张和第 ${close[2] + 1} 张的中心块颜色太接近(距离 ${close[0].toFixed(1)})，请检查是否拍对了面/对准了方块` };
  const hyps = hypotheses || [1, -1].flatMap((d) => [false, true].flatMap((sw) => [0, 1, 2, 3].flatMap((r5) => [0, 1, 2, 3].map((r6) => [d, sw, r5, r6]))));
  const cands = [];
  for (const [d, sw, r5, r6] of hyps) {
    const fr = frames6(d, sw, r5, r6);
    if (new Set(fr.map((f) => f[0].join(","))).size < 6) continue;
    const pos2st = {}, featByPos = {}, wts = {};
    fr.forEach(([n, right, down], s) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const p = [0, 1, 2].map((k) => 3 * n[k] + (2 * c - 2) * right[k] + (2 * r - 2) * down[k]), [f, idx] = locate(p), key = f + idx, i = r * 3 + c;
      pos2st[key] = [s, i]; featByPos[key] = feats[s + "_" + i]; wts[key] = faces[s].weights?.[i] ?? 1;
    } });
    const foc = fr.map(([n]) => locate(n.map((x) => 3 * x))[0]), cof = {}; foc.forEach((f, k) => { cof[f] = k; });
    const solver = new Solver(featByPos, protos, cof, wts);
    cands.push({ lb: solver.cost(solver.initial()), hyp: [d, sw, r5, r6], solver, pos2st, foc });
  }
  if (!cands.length) return { ok: false, error: "没有可用的拍摄假设" };
  cands.sort((a, b) => a.lb - b.lb);
  let best = null;
  for (const c of cands.slice(0, 4)) {   // 无约束代价排名前 4 的再做带合法性约束的完整求解
    const sol = c.solver.solve(); if (!sol) continue;
    if (!best || sol.cost < best.cost) best = { cost: sol.cost, mods: sol.mods, hyp: c.hyp, solver: c.solver, st: sol.st, pos2st: c.pos2st, foc: c.foc };
  }
  if (!best) return { ok: false, error: "没有找到合法的魔方解，可能有格子读色错得太多，或有一张拍错了面" };
  const second = cands.find((c) => c.hyp.join() !== best.hyp.join()), { solver } = best, col = solver.colors(best.st);
  const near = {}; for (const key of Object.keys(col)) near[key] = [0, 1, 2, 3, 4, 5].reduce((b, k) => (solver.d[key + "|" + k] < solver.d[key + "|" + b] ? k : b), 0);
  const corrected = [], ambiguous = [];
  for (const f of FACES) for (let i = 0; i < 9; i++) {
    if (i === 4) continue; const key = f + i;
    if (col[key] !== near[key]) corrected.push(key);
    const ds = [0, 1, 2, 3, 4, 5].map((k) => solver.d[key + "|" + k]).sort((a, b) => a - b);
    if (col[key] !== near[key] || ds[1] - solver.d[key + "|" + col[key]] < 4) ambiguous.push(key);
  }
  const members = [[], [], [], [], [], []];
  for (const f of FACES) for (let i = 0; i < 9; i++) { const [s, ii] = best.pos2st[f + i]; members[col[f + i]].push(rgbs[s + "_" + ii]); }
  const bright = (rs) => { const half = rs.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2])).slice(rs.length >> 1); return [0, 1, 2].map((j) => Math.round(half.reduce((a, c) => a + c[j], 0) / half.length)); };
  const rawPal = Object.fromEntries(NAMES.split("").map((nm, k) => [nm, bright(members[k])])), clean = displayColors(rawPal);
  const palette = Object.fromEntries(NAMES.split("").map((nm, k) => [nm, { rgb: rawPal[nm], center_rgb: rgbs[k + "_4"].map(Math.round), clean_rgb: clean[nm] }]));
  // 重定向: 让"最后一张拍的那个面"成为 U(把它翻到上面, 之前朝下的那条边转向自己 = F), 这样用户不用再自己找上面.
  // 新坐标 x/y/z -> 旧坐标 right/n/down (都是第 6 张照片的 图像右/法向/图像下), 是一个正常旋转.
  const [n6, r6v, d6v] = frames6(...best.hyp)[5], toOld = (v) => [0, 1, 2].map((k) => v[0] * r6v[k] + v[1] * n6[k] + v[2] * d6v[k]);
  const oldKey = {}, newLetter = {};
  for (const f of FACES) {
    if (!reorient) { for (let i = 0; i < 9; i++) oldKey[f + i] = f + i; newLetter[f] = f; continue; }
    for (let i = 0; i < 9; i++) { const [o, oi] = locate(toOld(stickerPos(f, i))); oldKey[f + i] = o + oi; }
    const nv = toOld(FR[f][0]); newLetter[locate(nv.map((x) => 3 * x))[0]] = f;   // 旧面字母 -> 新面字母
  }
  const faceStr = Object.fromEntries(FACES.split("").map((f) => [f, [...Array(9).keys()].map((i) => NAMES[col[oldKey[f + i]]]).join("")]));
  const facelets = FACES.split("").flatMap((f) => [...Array(9).keys()].map((i) => newLetter[best.foc[col[oldKey[f + i]]]])).join("");
  const where = {}; for (const key of Object.keys(oldKey)) where[key] = best.pos2st[oldKey[key]];
  const o2n = Object.fromEntries(Object.entries(oldKey).map(([nk, ok]) => [ok, nk]));
  const mapKeys = (a) => a.map((k) => o2n[k]);
  const centers = Object.fromEntries(FACES.split("").map((f) => [f, NAMES[col[oldKey[f + 4]]]]));
  const [d, sw, r5, r6] = best.hyp;
  return { ok: true, error: null, faces: faceStr, centers, palette, corrected: mapKeys(corrected), ambiguous: mapKeys(ambiguous),
    cost: best.cost, mods: best.mods, facelets, valid: true, solution: null, where,
    hypothesis: { rotate: d === 1 ? "右转" : "左转", up_down_swapped: sw, rot_up: r5 * 90, rot_down: r6 * 90, runner_up_gap: second ? Math.round((second.lb - cands[0].lb) * 10) / 10 : null } };
}
