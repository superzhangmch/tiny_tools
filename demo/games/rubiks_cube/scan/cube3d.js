// cube3d.js — 纯 CSS 3D 魔方(54 个贴纸槽位, 无依赖)。
//   import { createCube3D, applyMoves, parseMoves } from "./cube3d.js";
//   const c = createCube3D(el, { size: 200 });
//   c.set({ faces, palette, crops, fixed })   // faces: {U:"ABCDEF...9 个 token", ...}; palette: {token:{rgb}}; crops: {"U0": dataURL, ...}; fixed: ["U3",...]
//   c.setMode("img" | "color")                 // 贴照片里的原始贴纸 / 贴解码颜色
//   await c.play("R U R' ...", 350)            // 逐步动画执行(kociemba 解法记号)
//   c.applyInstant("R U ...")                  // 直接得到执行后的状态(不动画)
//   c.reset()                                  // 回到 set() 时的状态
// 坐标: R=+x, U=+y, F=+z (与 cube.py/Kociemata 一致); 贴纸序号 = 面(URFDLB)*9 + 行*3+列, 展开朝向见 FRAMES。

export const FACES = "URFDLB";
export const FRAMES = {   // [法向, 展开图的"右", "下"]
  U: [[0, 1, 0], [1, 0, 0], [0, 0, 1]], R: [[1, 0, 0], [0, 0, -1], [0, -1, 0]], F: [[0, 0, 1], [1, 0, 0], [0, -1, 0]],
  D: [[0, -1, 0], [1, 0, 0], [0, 0, -1]], L: [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], B: [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
};

/** 54 个贴纸槽位的几何: 序号 i = 面*9+idx -> { face, idx, p(位置, 面坐标±3 其余 -2/0/2), n, r, d } */
export function stickerGeometry() {
  const out = [];
  for (const f of FACES) {
    const [n, r, d] = FRAMES[f];
    for (let i = 0; i < 9; i++) {
      const row = (i / 3) | 0, col = i % 3;
      out.push({ face: f, idx: i, n, r, d, p: [0, 1, 2].map((k) => 3 * n[k] + (2 * col - 2) * r[k] + (2 * row - 2) * d[k]) });
    }
  }
  return out;
}
const GEO = stickerGeometry();
const KEY = (p) => p.join(",");
const INDEX = new Map(GEO.map((g, i) => [KEY(g.p), i]));

/** 解法记号 "R U' F2" -> [{face, turns}], turns: 1=顺时针 90°(从该面外侧看), 2, 3(= 逆时针) */
export function parseMoves(str) {
  return str.trim().split(/\s+/).filter(Boolean).map((t) => {
    const face = t[0]; if (!FACES.includes(face)) throw new Error("bad move " + t);
    return { face, turns: t.endsWith("2") ? 2 : t.endsWith("'") ? 3 : 1 };
  });
}

/** 某个面转 turns 次顺时针 90°: 返回 src 数组, new[j] = old[src[j]] */
export function movePerm(face, turns) {
  const [n] = FRAMES[face], src = Array.from({ length: 54 }, (_, i) => i);
  const rot = (p) => {   // 绕 n 顺时针 90°(从 +n 看) = 右手系 -90°: p' = -(n x p) + n (n.p)
    const cx = [n[1] * p[2] - n[2] * p[1], n[2] * p[0] - n[0] * p[2], n[0] * p[1] - n[1] * p[0]], dp = n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
    return [0, 1, 2].map((k) => -cx[k] + n[k] * dp);
  };
  GEO.forEach((g, i) => {
    if (g.p[0] * n[0] + g.p[1] * n[1] + g.p[2] * n[2] < 2) return;      // 只转该层(含面本身及侧面贴纸)
    let q = g.p; for (let t = 0; t < turns; t++) q = rot(q);
    src[INDEX.get(KEY(q))] = i;
  });
  return src;
}

/** 对 54 个元素的状态数组依次执行 moves, 返回新数组 */
export function applyMoves(state, moves) {
  let s = state.slice();
  for (const { face, turns } of (typeof moves === "string" ? parseMoves(moves) : moves)) { const src = movePerm(face, turns); s = s.map((_, j) => s[src[j]]); }
  return s;
}

/**
 * 固定视角(vis = "UFR"(前右上)或 "DLB"(后左下) 三个面可见)下, 一次转动(面 face, k: 1=顺时针 3=逆时针 2=半圈)的箭头提示(纯计算, 不碰 DOM):
 *  - face 是可见面(U/F/R): 返回 { kind:"arc", face, dir: 1|-1, times: 1|2 } (画在该面上的弧形箭头);
 *  - face 在背面(D/L/B): 返回 { kind:"strips", strips:[{ vf, center, dir }] } —— 在每个"可见且与该层相邻"的面上, 那一列(3 个贴纸)沿 dir(单位向量, 面内)滑动,
 *    箭头沿 dir 画在这一列上。dir = 该列中心贴纸在这次转动中的位移方向(顺时针 -(n x p), 逆时针取反), 投影到所在面的平面内。
 */
export function moveHint(face, k = 1, vis = "UFR") {
  const n = FRAMES[face][0], sign = k === 3 ? -1 : 1;
  if (vis.includes(face)) return { kind: "arc", face, dir: k === 3 ? -1 : 1, times: k === 2 ? 2 : 1 };
  const strips = [];
  for (const vf of vis) {
    const nv = FRAMES[vf][0]; if (dot3(nv, n) !== 0) continue;                                // 只要与该层相邻(法向垂直)的可见面
    const st = GEO.filter((g) => g.face === vf && dot3(g.p, n) >= 2); if (st.length !== 3) continue;
    const center = [0, 1, 2].map((a) => st.reduce((s, g) => s + g.p[a], 0) / 3), x = cross3(n, center), vel = x.map((t) => -sign * t);   // 顺时针: v = -(n x p)
    const vt = vel.map((t, a) => t - dot3(vel, nv) * nv[a]), len = Math.hypot(...vt);
    strips.push({ vf, center, dir: vt.map((t) => t / len) });
  }
  return { kind: "strips", strips };
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------------- DOM(浏览器) ----------------
const SIGN = 1;   // 动画旋转方向(CSS 坐标 y 向下, 手性相反), 由 headless 测试校准

export function createCube3D(container, { size = 200 } = {}) {
  const u = size / 6;                                   // 每个小块边长 2u, 整个魔方宽 6u
  container.classList.add("c3-scene");
  container.style.width = container.style.height = size + "px";
  const cube = document.createElement("div"); cube.className = "c3-cube"; container.appendChild(cube);
  let rx = -28, ry = -38, mode = "img", base = null, content = null, busy = false;
  const apply = () => { cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; };
  apply();
  const api = {};

  // 每个槽位固定在空间里的位置; 变的只是槽位里显示的内容(颜色+原图)
  const mat = (g) => {   // 局部 x->右, y->下, z->外法向 (世界 y 向上 -> CSS y 向下: y 取反)
    const f = ([a, b, c]) => [a, -b, c], r = f(g.r), d = f(g.d), n = f(g.n), t = f(g.p).map((v) => v * u);
    return `matrix3d(${r[0]},${r[1]},${r[2]},0,${d[0]},${d[1]},${d[2]},0,${n[0]},${n[1]},${n[2]},0,${t[0]},${t[1]},${t[2]},1)`;
  };
  const slots = GEO.map((g) => {
    const el = document.createElement("div"); el.className = "c3-slot";
    el.style.cssText = `width:${2 * u}px;height:${2 * u}px;margin:${-u}px 0 0 ${-u}px;transform:${mat(g)}`;
    el.innerHTML = '<div class="c3-st"><img alt=""></div>'; cube.appendChild(el);
    return { el, st: el.firstChild, img: el.querySelector("img"), g, mat: mat(g) };
  });

  function paint() {
    content.forEach((c, i) => {
      const s = slots[i]; s.st.style.background = c.rgb ? `rgb(${c.rgb})` : "#555"; s.img.src = c.img || ""; s.img.style.display = c.img && mode === "img" ? "block" : "none";
      s.st.classList.toggle("fixed", !!c.fixed); s.st.classList.toggle("amb", !!c.amb && !c.fixed);
    });
    cube.classList.toggle("c3-colors", mode === "color");
  }

  function set({ faces, palette, crops = {}, fixed = [], amb = [] }) {
    const fx = new Set(fixed), am = new Set(amb);
    base = GEO.map((g) => { const t = faces[g.face][g.idx], k = g.face + g.idx; return { token: t, rgb: palette[t] ? palette[t].rgb : null, img: crops[k] || null, fixed: fx.has(k), amb: am.has(k) }; });
    content = base.map((c) => ({ ...c })); paint();
  }

  const permute = (src) => { content = content.map((_, j) => content[src[j]]); paint(); };
  function applyInstant(moves) { for (const { face, turns } of (typeof moves === "string" ? parseMoves(moves) : moves)) permute(movePerm(face, turns)); }

  async function play(moves, ms = 350) {
    if (busy) return; busy = true;
    for (const { face, turns } of (typeof moves === "string" ? parseMoves(moves) : moves)) {
      const [n] = FRAMES[face], axis = `${n[0]},${-n[1]},${n[2]}`, layer = GEO.map((g, i) => (g.p[0] * n[0] + g.p[1] * n[1] + g.p[2] * n[2] >= 2 ? i : -1)).filter((i) => i >= 0);
      const target = 90 * turns * SIGN, t0 = performance.now();
      await new Promise((done) => {
        const step = (now) => {
          const k = Math.min(1, (now - t0) / (ms * (turns === 2 ? 1.5 : 1))), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, a = target * e;
          for (const i of layer) slots[i].el.style.transform = `rotate3d(${axis},${a}deg) ${slots[i].mat}`;
          if (k < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
      for (const i of layer) slots[i].el.style.transform = slots[i].mat;     // 复位; 内容按置换换位
      permute(movePerm(face, turns));
    }
    busy = false;
  }

  function reset() { if (base) { content = base.map((c) => ({ ...c })); paint(); } }
  function setMode(m) { mode = m; if (content) paint(); }

  // 拖动旋转整个魔方
  let drag = null;
  container.addEventListener("pointerdown", (e) => { if (locked) return; drag = { x: e.clientX, y: e.clientY }; container.setPointerCapture(e.pointerId); });
  container.addEventListener("pointermove", (e) => { if (!drag) return; ry += (e.clientX - drag.x) * 0.6; rx = Math.max(-89, Math.min(89, rx - (e.clientY - drag.y) * 0.6)); drag = { x: e.clientX, y: e.clientY }; apply(); if (api.onRotate) api.onRotate(rx, ry); });
  const end = () => { drag = null; };
  container.addEventListener("pointerup", end); container.addEventListener("pointercancel", end);

  function setAngles(x, y) { rx = x; ry = y; apply(); }   // 供另一个魔方同步视角

  // ---- 还原指导: 在要转的面上画一个带方向的弧形箭头, 并高亮那一面 ----
  let arrowEl = null, hlFace = null;
  /** dir: 1=顺时针(面朝向你时看), -1=逆时针; turns=2 表示半圈(显示 ×2, 箭头顺时针) */
  function showArrow(face, dir = 1, turns = 1) {
    hideArrow();
    const [n, r, d] = FRAMES[face], L = 5.8 * u;
    const el = document.createElement("div"); el.className = "c3-arrow";
    el.style.cssText = `width:${L}px;height:${L}px;margin:${-L / 2}px 0 0 ${-L / 2}px;transform:${mat({ r, d, n, p: n.map((v) => v * 3.1) })}`;
    // 圆弧: 从 -70° 到 190° (260°), 局部坐标 x 右 y 下, 角度增大 = 从面外看顺时针; 逆时针则水平镜像
    const R = 34, a0 = (-70 * Math.PI) / 180, a1 = (190 * Math.PI) / 180, p = (a) => `${(R * Math.cos(a)).toFixed(2)} ${(R * Math.sin(a)).toFixed(2)}`;
    el.innerHTML = `<svg viewBox="-50 -50 100 100" width="100%" height="100%"><g transform="${dir < 0 ? "scale(-1,1)" : ""}">
      <defs><marker id="c3ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ff2d55"/></marker></defs>
      <path d="M ${p(a0)} A ${R} ${R} 0 1 1 ${p(a1)}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".85"/>
      <path d="M ${p(a0)} A ${R} ${R} 0 1 1 ${p(a1)}" fill="none" stroke="#ff2d55" stroke-width="7" stroke-linecap="round" marker-end="url(#c3ah)"/></g>
      ${turns === 2 ? '<text x="0" y="9" text-anchor="middle" font-size="26" font-weight="800" fill="#ff2d55" stroke="#fff" stroke-width="3" paint-order="stroke">×2</text>' : ""}</svg>`;
    cube.appendChild(el); arrowEl = el;
    hlFace = face; slots.forEach((s) => s.st.classList.toggle("hl", s.g.face === face));
  }
  let stripEls = [];
  function hideArrow() { arrowEl?.remove(); arrowEl = null; hlFace = null; stripEls.forEach((e) => e.remove()); stripEls = []; slots.forEach((s) => s.st.classList.remove("hl")); }
  /** 固定视角下提示一步转动: 可见面画弧形箭头; 背面(D/L/B)则在可见的那几列上画沿滑动方向的直箭头, 并高亮这一层上看得到的贴纸 */
  function showMove(face, k = 1) {
    hideArrow(); const h = moveHint(face, k, viewVis);
    if (h.kind === "arc") { showArrow(face, h.dir, h.times); return h; }
    const n = FRAMES[face][0], L = 6.6 * u, W = 2.4 * u;
    // 只画一个箭头: 同一层在两个可见面上都有条带时, 画两个会被误读成"转两次" -> 优先选侧面(前/右/左/后), 再按 F,R,L,B 次序
    const rank = (st) => (/[FRLB]/.test(st.vf) ? 0 : 10) + "FRLB".indexOf(st.vf), one = h.strips.length > 1 ? [h.strips.slice().sort((a, b) => rank(a) - rank(b))[0]] : h.strips;
    for (const s of one) {
      const nv = FRAMES[s.vf][0], r = s.dir, d = cross3(r, nv), p = s.center.map((v, a) => v + 0.1 * nv[a]);       // d = r x n: 与面的 (右,下,外法向) 约定同手性
      const el = document.createElement("div"); el.className = "c3-arrow c3-strip";
      el.style.cssText = `width:${L}px;height:${W}px;margin:${-W / 2}px 0 0 ${-L / 2}px;transform:${mat({ r, d, n: nv, p })}`;
      el.innerHTML = `<svg viewBox="-50 -12 100 24" width="100%" height="100%" preserveAspectRatio="none"><defs><marker id="c3sh" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ff2d55"/></marker></defs>
        <line x1="-40" y1="0" x2="34" y2="0" stroke="#fff" stroke-width="11" stroke-linecap="round" opacity=".85"/>
        <line x1="-40" y1="0" x2="34" y2="0" stroke="#ff2d55" stroke-width="6" stroke-linecap="round" marker-end="url(#c3sh)"/>
        ${k === 2 ? '<text x="0" y="-2.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" stroke="#ff2d55" stroke-width="2" paint-order="stroke">×2</text>' : ""}</svg>`;
      cube.appendChild(el); stripEls.push(el);
    }
    slots.forEach((sl) => sl.st.classList.toggle("hl", viewVis.includes(sl.g.face) && dot3(sl.g.p, n) >= 2));
    return h;
  }
  let viewVis = "UFR";   // 当前视角下可见的三个面: "UFR"(前右上) 或 "DLB"(后左下); 由使用者手动切换
  const LAB = { U: "上", D: "下", F: "前", B: "后", L: "左", R: "右" };
  let labelsOn = false;
  function refreshLabels() {   // 只在当前看得见的三个面的中心块上写面名(中心块槽位固定在空间里, 不随转动移动)
    slots.forEach((s) => { const center = s.g.p.filter((v) => v !== 0).length === 1; let t = s.st.querySelector(".c3-lab"); const on = labelsOn && center && viewVis.includes(s.g.face);
      if (on && !t) { t = document.createElement("span"); t.className = "c3-lab"; s.st.appendChild(t); } if (t) { t.textContent = on ? LAB[s.g.face] : ""; t.style.display = on ? "flex" : "none"; } });
  }
  function setLabels(v) { labelsOn = !!v; refreshLabels(); }
  function setVisible(v) { viewVis = v; refreshLabels(); }
  let locked = false;
  function setLocked(v) { locked = !!v; container.style.cursor = locked ? "default" : "grab"; }
  /** 动画转到某个视角 (rx, ry), 取最短路径的 ry */
  function setView(tx, ty, ms = 450) {
    return new Promise((done) => {
      const x0 = rx, y0 = ry; let dy = ((ty - y0) % 360 + 540) % 360 - 180, t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; rx = x0 + (tx - x0) * e; ry = y0 + dy * e; apply(); if (api.onRotate) api.onRotate(rx, ry); if (k < 1) requestAnimationFrame(step); else done(); };
      requestAnimationFrame(step);
    });
  }
  Object.assign(api, { set, setMode, play, applyInstant, reset, setAngles, showArrow, showMove, hideArrow, setView, setLocked, setVisible, setLabels, slots, GEO });
  Object.defineProperties(api, { view: { get: () => [rx, ry] }, busy: { get: () => busy }, state: { get: () => content.map((c) => c.token) } });   // getter 必须用 defineProperties(Object.assign 会立即求值)
  return api;
}
