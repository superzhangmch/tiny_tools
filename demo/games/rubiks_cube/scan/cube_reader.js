// cube_reader.js — 从魔方侧面照片(能看到 U/F/R 三个面)自动读出 27 个色块。纯 JS, 无依赖, 不碰 DOM。
//
//   import { analyze, readFaces } from "./cube_reader.js";
//   const res = await analyze({ data: rgbaUint8, width, height }, { onProgress });
//   res.points  -> 7 个角点 [P0,P1,P2,P3,P4,P5,C]
//   res.faces   -> { U: "YRB YGW GRW", F: "...", R: "..." }   (每面 3 行, 字母 W/R/O/Y/G/B)
//
// 7 个点: P0 上顶  P1 左上  P2 左下  P3 最下  P4 右下  P5 右上  C 中心(最近的顶角)
//   U 面 TL,TR,BR,BL = P0,P5,C,P1    F 面 = P1,C,P3,P2    R 面 = C,P5,P4,P3   (与 cube.py 的展开朝向一致)
//
// 流程(与 Python 版 detect_cube.py / cube_reader.py 对应):
//  1. 图像边缘一圈做 k-means(Lab) 得背景模型 -> 前景 = 黑色缝线 ∪ 高饱和贴纸, 形态学闭/开, 最大连通域
//  2. 凸包 -> 逐个删除"面积损失最小"的顶点 -> 六边形 -> 7 个角点初值 (另备 5 顶点+平行关系补全的初值,
//     用于白色顶面与白背景融合的情况)
//  3. 自动对齐: 以格子内部颜色一致 + 3x3 格线落在黑缝上为目标, 多起点 pattern search 微调 14 个坐标
//  4. 每个面做 homography, 取 9 个格子中心小块的中值颜色, HSV 分类

export const NAMES = ["P0", "P1", "P2", "P3", "P4", "P5", "C"];
export const FACE_CORNERS = { U: [0, 5, 6, 1], F: [1, 6, 3, 2], R: [6, 5, 4, 3] }; // 索引进 7 点数组
export const FACE_ORDER = ["U", "F", "R"];

// ---------- 小工具 ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** RGBA -> { lab: Float32Array(3N) (OpenCV 8bit 尺度: L 0-255, a/b +128), minc: Float32Array(N) (BGR 最小通道), w, h } */
function prepare(img) {
  const { data, width: w, height: h } = img, N = w * h;
  const lab = new Float32Array(3 * N), minc = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const R = data[4 * i], G = data[4 * i + 1], B = data[4 * i + 2];
    const r = LIN[R], g = LIN[G], b = LIN[B];
    const X = (0.412453 * r + 0.35758 * g + 0.180423 * b) / 0.950456;
    const Y = 0.212671 * r + 0.71516 * g + 0.072169 * b;
    const Z = (0.019334 * r + 0.119193 * g + 0.950227 * b) / 1.088754;
    const fy = fLab(Y);
    lab[3 * i] = (Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y) * 2.55;
    lab[3 * i + 1] = 500 * (fLab(X) - fy) + 128;
    lab[3 * i + 2] = 200 * (fy - fLab(Z)) + 128;
    minc[i] = Math.min(R, G, B);
  }
  return { w, h, lab, minc, data };
}

// ---------- 1. 前景分割 ----------
function kmeans(samples, K, rng, iters = 15) {
  const n = samples.length / 3, C = new Float64Array(3 * K);
  const first = Math.floor(rng() * n);
  C.set(samples.subarray(3 * first, 3 * first + 3), 0);
  const d2 = new Float64Array(n).fill(Infinity);
  for (let k = 1; k < K; k++) { // kmeans++
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = samples[3 * i] - C[3 * (k - 1)], dy = samples[3 * i + 1] - C[3 * (k - 1) + 1], dz = samples[3 * i + 2] - C[3 * (k - 1) + 2];
      d2[i] = Math.min(d2[i], dx * dx + dy * dy + dz * dz); sum += d2[i];
    }
    let r = rng() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    C.set(samples.subarray(3 * pick, 3 * pick + 3), 3 * k);
  }
  const asg = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < K; k++) {
        const dx = samples[3 * i] - C[3 * k], dy = samples[3 * i + 1] - C[3 * k + 1], dz = samples[3 * i + 2] - C[3 * k + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = k; }
      }
      asg[i] = best;
    }
    const S = new Float64Array(3 * K), cnt = new Int32Array(K);
    for (let i = 0; i < n; i++) { const k = asg[i]; S[3 * k] += samples[3 * i]; S[3 * k + 1] += samples[3 * i + 1]; S[3 * k + 2] += samples[3 * i + 2]; cnt[k]++; }
    for (let k = 0; k < K; k++) if (cnt[k]) { C[3 * k] = S[3 * k] / cnt[k]; C[3 * k + 1] = S[3 * k + 1] / cnt[k]; C[3 * k + 2] = S[3 * k + 2] / cnt[k]; }
  }
  return C;
}

/** 方形核形态学(可分离): mode "dilate" | "erode", 半径 r */
function morph(m, w, h, r, mode) {
  const dil = mode === "dilate", tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dil ? 0 : 1;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const a = m[y * w + k]; if (dil ? a : !a) { v = dil ? 1 : 0; break; } }
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dil ? 0 : 1;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const a = tmp[k * w + x]; if (dil ? a : !a) { v = dil ? 1 : 0; break; } }
    out[y * w + x] = v;
  }
  return out;
}

function largestComponent(m, w, h) {
  const lbl = new Int32Array(w * h), stack = new Int32Array(w * h);
  let best = 0, bestN = 0, id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lbl[s]) continue;
    id++; let sp = 0, n = 0; stack[sp++] = s; lbl[s] = id;
    while (sp) {
      const p = stack[--sp]; n++;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (m[q] && !lbl[q]) { lbl[q] = id; stack[sp++] = q; }
      }
    }
    if (n > bestN) { bestN = n; best = id; }
  }
  if (!best) throw new Error("没找到前景");
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = lbl[i] === best ? 1 : 0;
  return out;
}

export function foregroundMask(P, rng = mulberry32(1)) {
  const { w, h, lab, data } = P, N = w * h;
  const b = Math.max(3, Math.min(w, h) / 60 | 0), ring = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < b || y >= h - b || x < b || x >= w - b) ring.push(y * w + x);
  const stride = Math.max(1, Math.floor(ring.length / 4000)), smp = [];
  for (let i = 0; i < ring.length; i += stride) { const p = ring[i]; smp.push(lab[3 * p], lab[3 * p + 1], lab[3 * p + 2]); }
  const K = 4, C = kmeans(Float32Array.from(smp), K, rng);
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    let dmin = Infinity;
    for (let k = 0; k < K; k++) {
      const dx = lab[3 * i] - C[3 * k], dy = lab[3 * i + 1] - C[3 * k + 1], dz = lab[3 * i + 2] - C[3 * k + 2];
      dmin = Math.min(dmin, dx * dx + dy * dy + dz * dz);
    }
    const dist = Math.sqrt(dmin);
    const R = data[4 * i], G = data[4 * i + 1], B = data[4 * i + 2];
    const V = Math.max(R, G, B), S = V ? (255 * (V - Math.min(R, G, B))) / V : 0;
    const black = V < 70 && dist > 18, colored = S > 110 && V > 90 && dist > 30;
    m[i] = black || colored ? 1 : 0;
  }
  const r = ((Math.max(5, Math.min(w, h) / 40 | 0) | 1) - 1) / 2;
  let q = morph(morph(m, w, h, r, "dilate"), w, h, r, "erode");   // close
  q = morph(morph(q, w, h, r, "erode"), w, h, r, "dilate");       // open
  return largestComponent(q, w, h);
}

// ---------- 2. 凸包 -> 多边形 -> 角点初值 ----------
function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  const up = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function polygon(hull, n) {
  const tri = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  let P = hull.slice();
  while (P.length > n) {
    let bi = 0, bl = Infinity;
    for (let i = 0; i < P.length; i++) {
      const l = tri(P[(i + P.length - 1) % P.length], P[i], P[(i + 1) % P.length]);
      if (l < bl) { bl = l; bi = i; }
    }
    P.splice(bi, 1);
  }
  return P;
}

/** 让多边形在屏幕上顺时针(y 向下时 shoelace > 0) */
function clockwise(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s > 0 ? P : P.slice().reverse();
}
const rollTo = (P, k) => P.slice(k).concat(P.slice(0, k));
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mean = (...ps) => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];

export function candidates(P, rng) {
  const mask = foregroundMask(P, rng), { w, h } = P, bd = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[y * w + x - 1] || !mask[y * w + x + 1] || !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x]) bd.push([x, y]);
  }
  const hull = convexHull(bd), out = [];
  let hx = clockwise(polygon(hull, 6));
  hx = rollTo(hx, hx.reduce((bi, p, i) => (p[1] < hx[bi][1] ? i : bi), 0));
  { const [P0, P5, P4, P3, P2, P1] = hx;
    const C = mean(sub(add(P1, P5), P0), sub(add(P1, P3), P2), sub(add(P3, P5), P4));
    out.push({ name: "hex6", pts: [P0, P1, P2, P3, P4, P5, C] }); }
  const p5 = clockwise(polygon(hull, 5)), n = p5.length;
  let k = 0, best = Infinity;
  for (let i = 0; i < n; i++) { const s = p5[i][1] + p5[(i + 1) % n][1]; if (s < best) { best = s; k = i; } }
  { const [P1, P5, P4, P3, P2] = rollTo(p5, k);
    const C = mean(sub(add(P1, P3), P2), sub(add(P3, P5), P4)), P0 = sub(add(P1, P5), C);
    out.push({ name: "hex5+inferred", pts: [P0, P1, P2, P3, P4, P5, C] }); }
  return { cands: out, mask };
}

// ---------- 3. 对齐代价 ----------
/** 单位正方形 -> 四边形(TL,TR,BR,BL)的 homography, 返回 [a,b,c,d,e,f,g,h] */
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0];
  const den = dx1 * dy2 - dy1 * dx2, g = (dx3 * dy2 - dy3 * dx2) / den, hh = (dx1 * dy3 - dy1 * dx3) / den;
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh];
}
const applyH = (H, u, v, out) => {
  const w = H[6] * u + H[7] * v + 1;
  out[0] = (H[0] * u + H[1] * v + H[2]) / w; out[1] = (H[3] * u + H[4] * v + H[5]) / w;
};
function bilin(arr, ch, w, h, x, y, k) {
  x = Math.min(Math.max(x, 0), w - 1.001); y = Math.min(Math.max(y, 0), h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return ((arr[(i) * ch + k] * (1 - fx) + arr[(i + 1) * ch + k] * fx) * (1 - fy) + (arr[(i + w) * ch + k] * (1 - fx) + arr[(i + w + 1) * ch + k] * fx) * fy);
}

const CELL_N = 6, LINE_N = 24, LINE_OFF = [-0.027, -0.0135, 0, 0.0135, 0.027];
const FAST_CELL_N = 3, FAST_LINE_N = 10, FAST_LINE_OFF = [-0.027, 0, 0.027];
const _xy = [0, 0];
/**
 * 格子内部颜色要均匀(Lab 标准差和小) + 格线(1/3, 2/3)处要暗(黑缝)。
 * opt.contrast: 再奖励"格线比格子内部暗"(cost -= 0.35*格子亮度, 即线亮度项变成 线-格 的对比度)，
 *               这样大片黑/白均匀区域(无对比)不会得低分——用于在杂乱背景里找魔方。
 * opt.fast: 少量采样(全局搜索用)。
 */
export function alignCost(P, pts, opt = {}) {
  const { w, h, lab, minc } = P, cn = opt.fast ? FAST_CELL_N : CELL_N, ln_ = opt.fast ? FAST_LINE_N : LINE_N, lo = opt.fast ? FAST_LINE_OFF : LINE_OFF;
  let cost = 0;
  for (const f of FACE_ORDER) {
    const H = squareToQuad(FACE_CORNERS[f].map((i) => pts[i]));
    let cellMin = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let s0 = 0, s1 = 0, s2 = 0, q0 = 0, q1 = 0, q2 = 0;
      for (let a = 0; a < cn; a++) for (let b = 0; b < cn; b++) {
        applyH(H, (c + 0.2 + (0.6 * (b + 0.5)) / cn) / 3, (r + 0.2 + (0.6 * (a + 0.5)) / cn) / 3, _xy);
        const v0 = bilin(lab, 3, w, h, _xy[0], _xy[1], 0), v1 = bilin(lab, 3, w, h, _xy[0], _xy[1], 1), v2 = bilin(lab, 3, w, h, _xy[0], _xy[1], 2);
        s0 += v0; s1 += v1; s2 += v2; q0 += v0 * v0; q1 += v1 * v1; q2 += v2 * v2;
        if (opt.contrast) cellMin += bilin(minc, 1, w, h, _xy[0], _xy[1], 0);
      }
      const n = cn * cn;
      cost += Math.sqrt(Math.max(0, q0 / n - (s0 / n) ** 2)) + Math.sqrt(Math.max(0, q1 / n - (s1 / n) ** 2)) + Math.sqrt(Math.max(0, q2 / n - (s2 / n) ** 2));
    }
    let ls = 0, ln = 0;
    for (const t of [1 / 3, 2 / 3]) for (let k = 0; k < ln_; k++) {
      const s = (k + 0.5) / ln_;
      for (const o of lo) {
        applyH(H, s, t + o, _xy); ls += bilin(minc, 1, w, h, _xy[0], _xy[1], 0);
        applyH(H, t + o, s, _xy); ls += bilin(minc, 1, w, h, _xy[0], _xy[1], 0); ln += 2;
      }
    }
    cost += 0.35 * (ls / ln);
    if (opt.contrast) cost -= 0.35 * (cellMin / (9 * cn * cn));
  }
  return cost;
}

/** 三个面各 4 条内部格线(3x3 的分隔线)，返回 [[x0,y0],[x1,y1]] 线段数组(共 12 条)，用于在画面上画出 27 个格子。 */
export function gridLines(pts) {
  const out = [], q = [0, 0];
  for (const f of FACE_ORDER) {
    const H = squareToQuad(FACE_CORNERS[f].map((i) => pts[i])), at = (u, v) => { applyH(H, u, v, q); return [q[0], q[1]]; };
    for (const t of [1 / 3, 2 / 3]) { out.push([at(0, t), at(1, t)]); out.push([at(t, 0), at(t, 1)]); }
  }
  return out;
}

/**
 * 立方体正交投影模板的 7 个点 [P0..P5,C]: 中心 (cx,cy), 尺度 s(elev=35.26° 时即外接圆半径), 滚转角 thDeg(度, 逆时针为正),
 * 俯仰角 elevDeg(从上往下看的角度: 35.26° = 等轴测正六边形; 越小越"平视"——顶面变扁、六边形变宽变矮; 越大越"俯视")。
 * 魔方绕竖直轴转 45°、俯仰 φ 时: 顶点 (±1,±1,±1) -> x = (X-Z)/√2*√2.. 即
 *   P0 (0, cφ+√2 sφ)  P5 (√2, cφ)  P4 (√2, -cφ)  P3 (0, -cφ-√2 sφ)  P2 (-√2, -cφ)  P1 (-√2, cφ)  C (0, cφ-√2 sφ), 再整体缩放 s/1.633。
 */
export function templatePoints(cx, cy, s, thDeg = 0, elevDeg = 35.264) {
  const rad = (thDeg * Math.PI) / 180, ph = (elevDeg * Math.PI) / 180, c = Math.cos(ph), sn = Math.sin(ph), r2 = Math.SQRT2, k = s / 1.633;
  const raw = [[0, c + r2 * sn], [-r2, c], [-r2, -c], [0, -c - r2 * sn], [r2, -c], [r2, c], [0, c - r2 * sn]];   // P0 P1 P2 P3 P4 P5 C (y 向上)
  return raw.map(([x, y]) => { const X = x * k, Y = y * k; return [cx + X * Math.cos(rad) - Y * Math.sin(rad), cy - (X * Math.sin(rad) + Y * Math.cos(rad))]; });
}

/**
 * 3D 透视投影的立方体 7 个点 [P0..P5,C]。针孔相机看向立方体中心: 方位角 yaw(绕竖直轴, 45°=正对一个角)、俯仰 pitch(从上往下看的角度)、
 * 滚转 roll(绕视线)、距离 dist(以立方体半边长为单位; 越小透视越强, 越大越接近正交投影)。
 * 立方体顶点 (±1,±1,±1), C=(1,1,1) 是离相机最近的顶角; yaw∈(0,90), pitch∈(0,90) 时可见面恰为 U(顶)/F(+z)/R(+x)。
 * 结果平移使外轮廓 6 角的质心落在 (cx,cy); size 与 templatePoints 同义(等轴测时 = 外接圆半径)。每个面都是平面 => 面内 3x3 网格由 homography 精确得到。
 */
export function cubePose(cx, cy, size, { yaw = 45, pitch = 30, roll = 0, dist = 10 } = {}) {
  const d2r = Math.PI / 180, psi = yaw * d2r, ph = pitch * d2r, rho = roll * d2r;
  const cam = [dist * Math.sin(psi) * Math.cos(ph), dist * Math.sin(ph), dist * Math.cos(psi) * Math.cos(ph)];
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const fwd = norm(cam.map((x) => -x)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
  const F = (size / 1.633) * dist;                                   // 焦距(像素): dist→∞ 时每单位长度 = size/1.633 像素
  const V = [[-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]];   // P0 P1 P2 P3 P4 P5 C
  const raw = V.map((p) => {
    const q = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]], z = dot(q, fwd), x = (F * dot(q, right)) / z, y = (F * dot(q, up)) / z;
    return [x * Math.cos(rho) - y * Math.sin(rho), x * Math.sin(rho) + y * Math.cos(rho)];   // y 向上; 绕视线滚转
  });
  const ring = [0, 1, 2, 3, 4, 5], mx = ring.reduce((a, i) => a + raw[i][0], 0) / 6, my = ring.reduce((a, i) => a + raw[i][1], 0) / 6;
  return raw.map(([x, y]) => [cx + x - mx, cy - (y - my)]);
}

/**
 * 全局模板搜索(不依赖前景分割): 等轴测立方体模板(六边形 + 中心点)扫 位置×大小×滚转角，
 * 用 fast+contrast 代价打分，非极大抑制后返回前 nTop 个 7 点假设 [{pts, cost}]。
 */
export function templateSearch(P, { nTop = 6 } = {}) {
  const { w, h } = P, m = Math.min(w, h), hyps = [];
  for (const sr of [0.08, 0.11, 0.15, 0.2, 0.26, 0.34]) {
    const s = sr * m, step = Math.max(6, s * 0.5);
    for (let cy = s; cy <= h - s * 0.7; cy += step) for (let cx = s; cx <= w - s * 0.7; cx += step) {
      for (let th = -60; th < 60; th += 10) {
        const pts = templatePoints(cx, cy, s, th);
        hyps.push({ pts, cost: alignCost(P, pts, { fast: true, contrast: true }), cx, cy, s, th });
      }
    }
  }
  hyps.sort((a, b) => a.cost - b.cost);
  const out = [];
  for (const hyp of hyps) {
    if (out.every((o) => Math.hypot(o.cx - hyp.cx, o.cy - hyp.cy) > 0.4 * Math.max(o.s, hyp.s) || Math.abs(o.th - hyp.th) > 25)) out.push(hyp);
    if (out.length >= nTop) break;
  }
  return out;
}

/**
 * 魔方结构评分: 12 条内部格线(三个面各 2 横 2 竖)每一条都应该比两侧相邻格子"暗"(缝线)。
 * 返回 { good, tot, meanContrast }: good = 对比度 > thr 的线条数(满分 12)。真魔方几乎每条线都满足, 杂乱背景/纹理不会。
 */
export function cubeScore(P, pts, thr = 20) {
  const { w, h, minc } = P, q = [0, 0];
  let good = 0, tot = 0, sum = 0;
  const at = (H, u, v) => { applyH(H, u, v, q); return bilin(minc, 1, w, h, q[0], q[1], 0); };
  for (const f of FACE_ORDER) {
    const H = squareToQuad(FACE_CORNERS[f].map((i) => pts[i]));
    for (const t of [1 / 3, 2 / 3]) for (const dir of [0, 1]) {
      let seam = 0, nb = 0;
      for (let k = 0; k < 12; k++) {
        const s = 0.12 + (0.76 * k) / 11;
        if (dir === 0) { seam += at(H, s, t); nb += (at(H, s, t - 0.085) + at(H, s, t + 0.085)) / 2; }
        else { seam += at(H, t, s); nb += (at(H, t - 0.085, s) + at(H, t + 0.085, s)) / 2; }
      }
      const c = (nb - seam) / 12; tot++; sum += c; if (c > thr) good++;
    }
  }
  return { good, tot, meanContrast: sum / tot };
}

/**
 * 相似变换吸附: 只允许 平移(±shift*大小)、缩放(sMin..sMax)、绕质心小角度旋转(±rotMax°)，保持用户调好的(对称透视)形状。
 * 4 个自由度, 比 14 维自由吸附在杂乱背景下稳得多。返回 {pts, cost, conf}:
 * conf = 周围 8 个偏移位置(±8% 大小)与缩放 ±8% 的平均代价 - 最优代价, 越大说明最优位置越"尖锐"、越可信。
 */
export function similarityFit(P, pts, { shift = 0.2, sMin = 0.75, sMax = 1.35, rotMax = 12 } = {}) {
  const ring = [0, 1, 2, 3, 4, 5], cx = ring.reduce((a, i) => a + pts[i][0], 0) / 6, cy = ring.reduce((a, i) => a + pts[i][1], 0) / 6;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cp = ([tx, ty, ls, th]) => [clamp(tx, -shift * size, shift * size), clamp(ty, -shift * size, shift * size), clamp(ls, Math.log(sMin), Math.log(sMax)), clamp(th, -rotMax, rotMax)];
  const tf = (p) => { const [tx, ty, ls, th] = cp(p), sc = Math.exp(ls), c = Math.cos((th * Math.PI) / 180), sn = Math.sin((th * Math.PI) / 180);
    return pts.map(([x, y]) => { const dx = (x - cx) * sc, dy = (y - cy) * sc; return [cx + tx + dx * c - dy * sn, cy + ty + dx * sn + dy * c]; }); };
  const f = (p) => alignCost(P, tf(p));
  // 密集粗搜索(fast 代价): 平移 5x5 × 缩放 5 档 × 旋转 3 档
  const ff = (p) => alignCost(P, tf(p), { fast: true });
  const seeds = [];
  for (const tx of [-0.15, -0.075, 0, 0.075, 0.15]) for (const ty of [-0.15, -0.075, 0, 0.075, 0.15])
    for (const sc of [0.8, 0.9, 1, 1.1, 1.2]) for (const th of [-6, 0, 6]) { const p = [tx * size, ty * size, Math.log(sc), th]; seeds.push([ff(p), p]); }
  seeds.sort((u, v) => u[0] - v[0]);
  let best = [0, 0, 0, 0], bc = Infinity;
  // 快速代价只用来初筛(排序会有偏差): 取前 12, 用完整代价重排, 再取前 4 做 pattern search —— 避免真正的最优没进前几名而落入局部最优
  const top = seeds.slice(0, 12).map(([, p]) => [f(p), p]).sort((u, v) => u[0] - v[0]).slice(0, 4);
  for (const [, p0] of top) {
    let p = p0.slice(), c = f(p), step = [size * 0.04, size * 0.04, 0.05, 3];
    const minStep = [0.4, 0.4, 0.004, 0.25];
    while (step.some((v, i) => v > minStep[i])) {
      let improved = false;
      for (let i = 0; i < 4; i++) for (const sg of [1, -1]) for (;;) {
        const q = p.slice(); q[i] += sg * step[i]; const cq = f(q);
        if (cq < c - 1e-9) { c = cq; p = q; improved = true; } else break;
      }
      if (!improved) step = step.map((v) => v / 2);
    }
    if (c < bc) { bc = c; best = p; }
  }
  let sum = 0, n = 0;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) { if (!a && !b) continue; sum += f([best[0] + a * 0.08 * size, best[1] + b * 0.08 * size, best[2], best[3]]); n++; }
  for (const l of [-0.08, 0.08]) { sum += f([best[0], best[1], best[2] + l, best[3]]); n++; }
  const eps = 1e-6, [tx, ty, ls] = cp(best);
  const atLimit = Math.abs(ls - Math.log(sMin)) < 0.02 || Math.abs(ls - Math.log(sMax)) < 0.02 || Math.abs(Math.abs(tx) - shift * size) < eps + 1 || Math.abs(Math.abs(ty) - shift * size) < eps + 1;
  return { pts: tf(best), cost: bc, conf: sum / n - bc, atLimit };
}

/** 坐标轮换的 pattern search, 步长逐次减半 */
function patternSearch(f, x, step0, minStep = 0.4) {
  x = x.slice(); let fx = f(x), step = step0;
  while (step > minStep) {
    let improved = false;
    for (let i = 0; i < x.length; i++) for (const sg of [1, -1]) {
      for (;;) {
        const old = x[i]; x[i] = old + sg * step;
        const fn = f(x);
        if (fn < fx - 1e-9) { fx = fn; improved = true; } else { x[i] = old; break; }
      }
    }
    if (!improved) step /= 2;
  }
  return { x, fx };
}

export async function refinePoints(P, pts, { starts = 6, seed = 0, onProgress, contrast = false, maxMove = Infinity } = {}) {
  const x0 = pts.flat(), rng = mulberry32(seed + 7);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // maxMove: 每个坐标最多偏离初值多少像素(引导模式: 只在用户对准的位置附近贴合, 防止缩进均匀区域/跑到别处)
  const clamp = (x) => x.map((v, i) => Math.min(x0[i] + maxMove, Math.max(x0[i] - maxMove, v)));
  const f = (x) => { const c = maxMove < Infinity ? clamp(x) : x; return alignCost(P, [0, 1, 2, 3, 4, 5, 6].map((i) => [c[2 * i], c[2 * i + 1]]), { contrast }); };
  const c0 = f(x0);
  let best = { x: x0, fx: c0 };
  for (let s = 0; s < starts; s++) {
    const start = s === 0 ? x0 : x0.map((v) => v + (rng() + rng() + rng() - 1.5) * 2 * size * 0.015);
    const r = patternSearch(f, start, size * 0.05);
    if (r.fx < best.fx) best = r;
    if (onProgress) onProgress(s + 1, starts);
    await tick();
  }
  const bx = maxMove < Infinity ? clamp(best.x) : best.x;
  return { pts: [0, 1, 2, 3, 4, 5, 6].map((i) => [bx[2 * i], bx[2 * i + 1]]), cost0: c0, cost: best.fx };
}

// ---------- 4. 读色 ----------
export function classify(r, g, b, redOrange = 18, whiteS = 70) {
  const V = Math.max(r, g, b), mn = Math.min(r, g, b), d = V - mn, S = V ? (255 * d) / V : 0;
  let deg = 0;
  if (d) { deg = V === r ? (60 * (g - b)) / d : V === g ? 120 + (60 * (b - r)) / d : 240 + (60 * (r - g)) / d; if (deg < 0) deg += 360; }
  let c;
  if (S < whiteS && V > 140) c = "W";
  else if (deg < redOrange || deg >= 335) c = "R";
  else if (deg < 40) c = "O";
  else if (deg < 80) c = "Y";
  else if (deg < 175) c = "G";
  else if (deg < 280) c = "B";
  else c = "R";
  return { c, hue: deg, s: S, v: V };
}
const median = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };

/** 一维 2-means: 返回 [低簇均值, 高簇均值] */
function twoMeans(v) {
  let lo = Math.min(...v), hi = Math.max(...v);
  for (let it = 0; it < 20; it++) {
    const m = (lo + hi) / 2, A = v.filter((x) => x <= m), B = v.filter((x) => x > m);
    if (!A.length || !B.length) break;
    lo = A.reduce((s, x) => s + x, 0) / A.length; hi = B.reduce((s, x) => s + x, 0) / B.length;
  }
  return [lo, hi];
}
/** 白色饱和度阈值: 27 格里有明显的"几乎无色"簇时取两簇中点(夹在 35~70)，否则 70。粉彩魔方的彩色饱和度也很低，固定 70 会把它们全判成白。 */
function adaptiveWhiteS(sat) {
  const [lo, hi] = twoMeans(sat);
  return lo < 40 && hi - lo > 30 ? Math.min(70, Math.max(35, (lo + hi) / 2)) : 70;
}

/** 标准 Lab(用于判断同一格内多个采样点是否一致) */
export function rgbToLab(r, g, b) {
  const lr = LIN[Math.round(r)], lg = LIN[Math.round(g)], lb = LIN[Math.round(b)];
  const X = (0.412453 * lr + 0.35758 * lg + 0.180423 * lb) / 0.950456, Y = 0.212671 * lr + 0.71516 * lg + 0.072169 * lb, Z = (0.019334 * lr + 0.119193 * lg + 0.950227 * lb) / 1.088754;
  return [116 * fLab(Y) - 16, 500 * (fLab(X) - fLab(Y)), 200 * (fLab(Y) - fLab(Z))];
}
const AGREE_DE = 12;   // 同一格内两个子块 Lab 距离 <= 12 视为同色

/**
 * 每格取多个点: 在格子中央 ~63% 宽度内取 3x3 个子块(每块 5x5 采样, 取中值), 找"medoid"(与其它子块总距离最小的那个),
 * 与它同色(ΔE<=12)的子块平均得到该格 RGB, agree = 同色子块比例(0~1)。
 * 采到缝线/手/反光/邻格时子块互相不一致 => agree 低 => 该格不可靠(不拿去聚类, UI 标记)。
 */
function sampleCell(P, H, r, c) {
  const { w, h, data } = P, sub = [], off = [-0.07, 0, 0.07], SM = 5, hw = 0.035;
  for (const dy of off) for (const dx of off) {
    const R = [], G = [], B = [];
    for (let a = 0; a < SM; a++) for (let b = 0; b < SM; b++) {
      applyH(H, (c + 0.5) / 3 + dx + (((b + 0.5) / SM) * 2 - 1) * hw, (r + 0.5) / 3 + dy + (((a + 0.5) / SM) * 2 - 1) * hw, _xy);
      const x = Math.min(w - 1, Math.max(0, Math.round(_xy[0]))), y = Math.min(h - 1, Math.max(0, Math.round(_xy[1]))), i = 4 * (y * w + x);
      R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]);
    }
    sub.push([median(R), median(G), median(B)]);
  }
  const labs = sub.map(([R, G, B]) => rgbToLab(R, G, B));
  let mi = 0, ms = Infinity;
  labs.forEach((l, i) => { const t = labs.reduce((s, m) => s + Math.hypot(l[0] - m[0], l[1] - m[1], l[2] - m[2]), 0); if (t < ms) { ms = t; mi = i; } });
  const ok = sub.filter((_, i) => Math.hypot(labs[i][0] - labs[mi][0], labs[i][1] - labs[mi][1], labs[i][2] - labs[mi][2]) <= AGREE_DE);
  return { rgb: [median(ok.map((p) => p[0])), median(ok.map((p) => p[1])), median(ok.map((p) => p[2]))], agree: ok.length / sub.length };
}

/** 返回 { faces: { U: [9 个 {c,hue,s,v,rgb,agree}], F, R }, centers, whiteS } (centers: 每格中心的图像坐标) */
export function readFaces(P, pts, { redOrange = 18 } = {}) {
  const raw = {}, centers = {};
  for (const f of FACE_ORDER) {
    const H = squareToQuad(FACE_CORNERS[f].map((i) => pts[i])), cells = [], ctr = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      cells.push(sampleCell(P, H, r, c));
      applyH(H, (c + 0.5) / 3, (r + 0.5) / 3, _xy); ctr.push([_xy[0], _xy[1]]);
    }
    raw[f] = cells; centers[f] = ctr;
  }
  const sat = FACE_ORDER.flatMap((f) => raw[f].map(({ rgb: [r, g, b] }) => classify(r, g, b, redOrange).s));
  const whiteS = adaptiveWhiteS(sat), faces = {};
  for (const f of FACE_ORDER) faces[f] = raw[f].map(({ rgb: [r, g, b], agree }) => ({ ...classify(r, g, b, redOrange, whiteS), rgb: [r, g, b], agree }));
  return { faces, centers, whiteS };
}
/**
 * 把每个格子透视拉正成 size x size 的小图(取格子中央 inner 比例, 去掉缝线), 返回 { U: [9 个 Uint8ClampedArray(RGBA)], F: [...], R: [...] }。
 * 用于在 3D 魔方上贴"照片里的原始贴纸"。
 */
export function cellCrops(P, pts, size = 48, inner = 0.8) {
  const { w, h, data } = P, out = {};
  for (const f of FACE_ORDER) {
    const H = squareToQuad(FACE_CORNERS[f].map((i) => pts[i])), cells = [], q = [0, 0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const buf = new Uint8ClampedArray(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        applyH(H, (c + 0.5 + ((x + 0.5) / size - 0.5) * inner) / 3, (r + 0.5 + ((y + 0.5) / size - 0.5) * inner) / 3, q);
        const X = Math.min(Math.max(q[0], 0), w - 1.001), Y = Math.min(Math.max(q[1], 0), h - 1.001), x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0, i = 4 * (y0 * w + x0), o = 4 * (y * size + x);
        for (let k = 0; k < 3; k++) buf[o + k] = (data[i + k] * (1 - fx) + data[i + 4 + k] * fx) * (1 - fy) + (data[i + 4 * w + k] * (1 - fx) + data[i + 4 * w + 4 + k] * fx) * fy;
        buf[o + 3] = 255;
      }
      cells.push(buf);
    }
    out[f] = cells;
  }
  return out;
}

// ---------------- 单个面(正对相机的方块) ----------------
/** 以 (cx,cy) 为中心、半边长 s、顺时针转 rotDeg 的正方形, 顶点顺序 TL,TR,BR,BL */
export function squareGuide(cx, cy, s, rotDeg = 0) {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  return [[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c]);
}

/** 单个面的对齐代价: 格子内部颜色均匀 + 3x3 的 2 横 2 竖分隔线处要暗(缝线); opt.fast: 少量采样 */
export function faceCost(P, quad, opt = {}) {
  const { w, h, lab, minc } = P, cn = opt.fast ? FAST_CELL_N : CELL_N, ln_ = opt.fast ? FAST_LINE_N : LINE_N, lo = opt.fast ? FAST_LINE_OFF : LINE_OFF, H = squareToQuad(quad);
  let cost = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    let s0 = 0, s1 = 0, s2 = 0, q0 = 0, q1 = 0, q2 = 0;
    for (let a = 0; a < cn; a++) for (let b = 0; b < cn; b++) {
      applyH(H, (c + 0.2 + (0.6 * (b + 0.5)) / cn) / 3, (r + 0.2 + (0.6 * (a + 0.5)) / cn) / 3, _xy);
      const v0 = bilin(lab, 3, w, h, _xy[0], _xy[1], 0), v1 = bilin(lab, 3, w, h, _xy[0], _xy[1], 1), v2 = bilin(lab, 3, w, h, _xy[0], _xy[1], 2);
      s0 += v0; s1 += v1; s2 += v2; q0 += v0 * v0; q1 += v1 * v1; q2 += v2 * v2;
    }
    const n = cn * cn;
    cost += Math.sqrt(Math.max(0, q0 / n - (s0 / n) ** 2)) + Math.sqrt(Math.max(0, q1 / n - (s1 / n) ** 2)) + Math.sqrt(Math.max(0, q2 / n - (s2 / n) ** 2));
  }
  let ls = 0, ln = 0;
  for (const t of [1 / 3, 2 / 3]) for (let k = 0; k < ln_; k++) {
    const s = (k + 0.5) / ln_;
    for (const o of lo) {
      applyH(H, s, t + o, _xy); ls += bilin(minc, 1, w, h, _xy[0], _xy[1], 0);
      applyH(H, t + o, s, _xy); ls += bilin(minc, 1, w, h, _xy[0], _xy[1], 0); ln += 2;
    }
  }
  return cost + 0.35 * (ls / ln);
}

/**
 * 把"大致对准"的方块贴合到魔方的面上: 先相似变换(平移±20%/缩放0.75~1.35/旋转±15°, 密集粗搜索 -> 完整代价重排 -> 前 4 个精细搜索),
 * 再在每个角 ±8% 范围内自由贴合(正对时只有轻微透视)。返回 { quad, cost, conf, atLimit }, conf = 周围偏移位置平均代价 - 最优代价。
 */
export function fitFace(P, quad, { shift = 0.2, sMin = 0.75, sMax = 1.35, rotMax = 15, free = true } = {}) {
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4, cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]), size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cp = ([tx, ty, ls, th]) => [clamp(tx, -shift * size, shift * size), clamp(ty, -shift * size, shift * size), clamp(ls, Math.log(sMin), Math.log(sMax)), clamp(th, -rotMax, rotMax)];
  const tf = (p) => { const [tx, ty, ls, th] = cp(p), sc = Math.exp(ls), c = Math.cos((th * Math.PI) / 180), sn = Math.sin((th * Math.PI) / 180);
    return quad.map(([x, y]) => { const dx = (x - cx) * sc, dy = (y - cy) * sc; return [cx + tx + dx * c - dy * sn, cy + ty + dx * sn + dy * c]; }); };
  const f = (p) => faceCost(P, tf(p)), ff = (p) => faceCost(P, tf(p), { fast: true });
  const seeds = [];
  for (const tx of [-0.15, -0.075, 0, 0.075, 0.15]) for (const ty of [-0.15, -0.075, 0, 0.075, 0.15]) for (const sc of [0.8, 0.9, 1, 1.1, 1.2]) for (const th of [-8, 0, 8]) { const p = [tx * size, ty * size, Math.log(sc), th]; seeds.push([ff(p), p]); }
  seeds.sort((u, v) => u[0] - v[0]);
  const top = seeds.slice(0, 12).map(([, p]) => [f(p), p]).sort((u, v) => u[0] - v[0]).slice(0, 4);
  let best = [0, 0, 0, 0], bc = Infinity;
  for (const [, p0] of top) {
    let p = p0.slice(), c = f(p), step = [size * 0.04, size * 0.04, 0.05, 3]; const minStep = [0.4, 0.4, 0.004, 0.25];
    while (step.some((v, i) => v > minStep[i])) {
      let improved = false;
      for (let i = 0; i < 4; i++) for (const sg of [1, -1]) for (;;) { const q = p.slice(); q[i] += sg * step[i]; const cq = f(q); if (cq < c - 1e-9) { c = cq; p = q; improved = true; } else break; }
      if (!improved) step = step.map((v) => v / 2);
    }
    if (c < bc) { bc = c; best = p; }
  }
  let sum = 0, n = 0;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) { if (!a && !b) continue; sum += f([best[0] + a * 0.08 * size, best[1] + b * 0.08 * size, best[2], best[3]]); n++; }
  for (const l of [-0.08, 0.08]) { sum += f([best[0], best[1], best[2] + l, best[3]]); n++; }
  const [tx, ty, ls] = cp(best), eps = 1;
  const atLimit = Math.abs(ls - Math.log(sMin)) < 0.02 || Math.abs(ls - Math.log(sMax)) < 0.02 || Math.abs(Math.abs(tx) - shift * size) < eps || Math.abs(Math.abs(ty) - shift * size) < eps;
  let q = tf(best), cost = bc;
  if (free) {   // 每个角 +-8% 内的自由贴合(坐标轮换 pattern search)
    const x0 = q.flat(), mm = 0.08 * size, cl = (x) => x.map((v, i) => Math.min(x0[i] + mm, Math.max(x0[i] - mm, v)));
    const g = (x) => { const c = cl(x); return faceCost(P, [[c[0], c[1]], [c[2], c[3]], [c[4], c[5]], [c[6], c[7]]]); };
    const r = patternSearch(g, x0, size * 0.03);
    if (r.fx < cost) { const c = cl(r.x); q = [[c[0], c[1]], [c[2], c[3]], [c[4], c[5]], [c[6], c[7]]]; cost = r.fx; }
  }
  return { quad: q, cost, conf: sum / n - bc, atLimit };
}

/** 读一个面的 9 格: [{rgb, agree}] (多点采样, 与三面模式同一套) */
export function readFace(P, quad) {
  const H = squareToQuad(quad), out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(sampleCell(P, H, r, c));
  return out;
}

/** 一个面每格的原始贴纸小图(透视拉正, size x size RGBA) */
export function faceCrops(P, quad, size = 48, inner = 0.8) {
  const { w, h, data } = P, H = squareToQuad(quad), out = [], q = [0, 0];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const buf = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      applyH(H, (c + 0.5 + ((x + 0.5) / size - 0.5) * inner) / 3, (r + 0.5 + ((y + 0.5) / size - 0.5) * inner) / 3, q);
      const X = Math.min(Math.max(q[0], 0), w - 1.001), Y = Math.min(Math.max(q[1], 0), h - 1.001), x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0, i = 4 * (y0 * w + x0), o = 4 * (y * size + x);
      for (let k = 0; k < 3; k++) buf[o + k] = (data[i + k] * (1 - fx) + data[i + 4 + k] * fx) * (1 - fy) + (data[i + 4 * w + k] * (1 - fx) + data[i + 4 * w + 4 + k] * fx) * fy;
      buf[o + 3] = 255;
    }
    out.push(buf);
  }
  return out;
}

export const facesToStrings = (faces) => Object.fromEntries(FACE_ORDER.map((f) => [f, [0, 3, 6].map((r) => faces[f].slice(r, r + 3).map((x) => x.c).join("")).join(" ")]));

// ---------- 总入口 ----------
/**
 * img: { data: Uint8ClampedArray|Uint8Array (RGBA), width, height }
 * opts: { starts, seed, onProgress(msg), redOrange }
 */
export async function analyze(img, opts = {}) {
  const say = opts.onProgress || (() => {});
  const P = prepare(img);
  say("分割魔方…"); await tick();
  const { cands } = candidates(P, mulberry32(1));
  let best = null;
  for (let i = 0; i < cands.length; i++) {
    const r = await refinePoints(P, cands[i].pts, { starts: opts.starts ?? 6, seed: opts.seed ?? 0, onProgress: (s, n) => say(`对齐 ${cands[i].name}: ${s}/${n}`) });
    if (!best || r.cost < best.cost) best = { ...r, init: cands[i].name };
  }
  // 可选: 全局模板搜索(opts.search)。注意: 目前在杂乱背景上不可靠, 默认关闭; 推荐用引导六边形(用户对准)代替。
  if (opts.search) {
    say("全局搜索魔方位置…"); await tick();
    for (const [i, h] of templateSearch(P).entries()) {
      const r = await refinePoints(P, h.pts, { starts: 2, seed: opts.seed ?? 0, contrast: true });
      const c = alignCost(P, r.pts);
      if (c < best.cost) best = { pts: r.pts, cost: c, init: `template#${i + 1}` };
    }
  }
  const { faces, centers } = readFaces(P, best.pts, { redOrange: opts.redOrange });
  return { points: best.pts, cost: best.cost, init: best.init, faces: facesToStrings(faces), cells: faces, centers, prepared: P };
}
export { prepare };
