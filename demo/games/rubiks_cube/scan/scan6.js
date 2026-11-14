// scan6.js — 6 张逐面模式(手机优先: 整屏相机, 提示和示意图浮在画面上, 按钮固定在底部, 不滚动)。
// 每个面单独正对相机拍一张(同一张里光照一致), 只需识别一个方块 + 9 格。
// 顺序: 起始面 -> 右转 -> 右转 -> 右转(前 4 张围一圈) -> 上 -> 下。
// 连拍: 每步两个按钮 "<序号 方向> shot" 与 "reshot"; 点 shot 就拍、读、自动进入下一步(上传在后台), 6 张拍完自动合成并显示 3D; reshot = 重拍刚才那一张。
import { prepare, squareGuide, fitFace, readFace, faceCrops } from "./cube_reader.js";
import { createCube3D } from "./cube3d.js";
import { decode6 } from "./cube_decode.js";
import { rgbToLab } from "./cube_reader.js";

const DIRS = ["Start", "Right", "Right", "Right", "Up", "Down&Down"];
const STEPS = [
  { title: "① 起始面", text: "顶面朝上，把任意一个面正对相机" },
  { title: "② 向右转", text: "把魔方向右转，让右侧那一面转到正对你（顶面始终朝上）" },
  { title: "③ 再向右转", text: "再向右转一次，让右侧那一面转到正对你" },
  { title: "④ 再向右转", text: "最后一次向右转（一圈 4 个侧面拍完）" },
  { title: "⑤ 底面（向外翻一次）", text: "保持第 4 张的姿势，把魔方向外翻一次（顶面转到远离你的一侧），让底面正对相机" },
  { title: "⑥ 顶面（向自己翻两次）", text: "从第 5 张（底面朝你）的姿势：向自己翻一次回到第 4 张的姿势，再向自己翻一次，让顶面正对相机。这个面之后就是还原时的“上”" },
];
const CONF_WARN = 220;   // 贴合置信度低于它: 提示"网格没贴合到魔方"(静态标定: 真魔方 p10≈423, 背景 ≤ 190)

/** 示意图: 纯 CSS 小魔方(6 个面: 正/右/后/左/上/下 = 第 1..6 张), 目标面蓝色、已拍面绿色、其余灰色, 循环播放这一步的动作 */
function createMiniCube(container) {
  const h = 38, faces = [`translateZ(${h}px)`, `rotateY(90deg) translateZ(${h}px)`, `rotateY(180deg) translateZ(${h}px)`, `rotateY(-90deg) translateZ(${h}px)`, `rotateX(-90deg) translateZ(${h}px)`, `rotateX(90deg) translateZ(${h}px)`];
  container.innerHTML = '<div class="s6-mini"></div>';
  const cube = container.firstChild, els = faces.map((t) => { const e = document.createElement("div"); e.className = "s6-mf"; e.style.transform = t; cube.appendChild(e); return e; });
  let raf = 0, token = 0;
  function play(step) {
    cancelAnimationFrame(raf); const my = ++token;
    els.forEach((e, k) => { e.className = "s6-mf " + (k === step ? "tgt" : k < step ? "done" : ""); e.textContent = k === step ? "拍这面" : ""; });
    const VIEW = -18, YAW = -25; let keys;                                                             // 关键姿态 [rx, ry] 序列, 依次转过去
    if (step === 0) keys = [[VIEW, YAW]];
    else if (step <= 3) { const y = YAW - 90 * (step - 1); keys = [[VIEW, y], [VIEW, y - 90]]; }                      // 右转: 绕竖直轴 -90°, 右侧面转到正面
    else if (step === 4) keys = [[VIEW, -270], [VIEW + 90, -270]];                                                      // 下: 向外翻 90°, 底面正对
    else keys = [[VIEW + 90, -270], [VIEW, -270], [VIEW - 90, -270]];                                                   // 上&上: 从"底面朝你"向自己翻两次(先回到第 4 张姿势, 再让顶面正对)
    const T = 1100, H0 = 700, HM = 350, HE = 1100, segs = keys.length - 1, total = H0 + segs * T + (segs - 1) * HM + HE, t0 = performance.now();
    const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const loop = (now) => {
      if (my !== token) return;
      const t = (now - t0) % total; let pose = keys[0];
      if (segs > 0 && t >= H0) {
        let u = t - H0, i = 0;
        for (; i < segs; i++) { if (u < T) { const k = ease(u / T); pose = [keys[i][0] + (keys[i + 1][0] - keys[i][0]) * k, keys[i][1] + (keys[i + 1][1] - keys[i][1]) * k]; break; } u -= T; if (i < segs - 1) { if (u < HM) { pose = keys[i + 1]; break; } u -= HM; } }
        if (i === segs) pose = keys[segs];
      }
      cube.style.transform = `rotateX(${pose[0]}deg) rotateY(${pose[1]}deg)`; raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  return { play };
}

export function mountScan6(root) {
  root.classList.add("cr-root", "cr-simple", "s6-app");
  root.innerHTML = `
    <div class="s6-top">
      <div class="s6-row1"><div class="s6-title"></div>
        <div class="s6-menu"><button class="s6-mbtn" data-act="menu">⋯</button>
          <div class="s6-mpop" hidden><label class="s6-mitem">从相册选这一步<input type="file" accept="image/*" hidden></label><a href="cube_reader.html" class="s6-mitem">2 张模式</a><button class="s6-mitem" data-act="restart">重新开始</button></div></div></div>
      <div class="s6-dots"></div>
    </div>
    <div class="s6-cam">
      <video playsinline muted autoplay></video><canvas class="s6-guide"></canvas><canvas class="s6-cap" hidden></canvas><div class="s6-flash"></div>
      <div class="s6-hint"></div><div class="s6-ill"></div><div class="s6-nocam" hidden></div><div class="s6-busy" hidden>合成中…</div>
    </div>
    <div class="s6-result" hidden>
      <div class="s6-cube"></div>
      <div class="s6-g-info"><div class="s6-g-top"><div class="s6-g-step"></div><button class="s6-gear" data-act="gear">⚙ 求解设置</button></div><div class="s6-g-text"></div><div class="s6-g-src"></div></div>
      <div class="s6-g-btns"><button class="cr-btn s6-gb" data-act="gprev">◀ 上一步</button><button class="cr-btn primary s6-gb" data-act="gnext">下一步 ▶</button></div>
      <div class="s6-chips"></div>
      <div class="s6-g-pose">姿势：按上面“手持”提示拿着魔方。箭头 = 现在要做的动作，做完点“下一步”。</div>
      <div class="cr-seg"><button data-act="c3img" class="on">原图贴纸</button><button data-act="c3color">识别后的颜色</button></div>
      <div class="cr-seg"><button data-act="viewA" class="on">前·右·上</button><button data-act="viewB">后·左·下</button></div>
      <div class="cr-3dsum"></div>
    </div>
    <div class="s6-sheet" hidden><div class="s6-sheet-card">
      <div class="s6-sheet-h"><b>求解设置</b><button class="s6-x" data-act="sheetclose">✕</button></div>
      <label class="s6-f">模型<select id="s6m"><option value="tiny_Scanon_15w">小模型 Scanon 15万参数（快，约 40 步）</option><option value="tiny_L_157w">大模型 L 157万参数（慢，约 36 步，首次用要下载 3MB）</option></select></label>
      <label class="s6-f">beam 宽度<select id="s6b"><option>16</option><option>32</option><option>64</option><option>128</option><option>256</option><option>512</option></select></label>
      <label class="s6-f">没解出时<select id="s6r"><option value="scramble">随机拧几步再搜（通用）</option><option value="view">换视角重试（仅大模型）</option><option value="none">不重试</option></select></label>
      <label class="s6-f">最多尝试次数<input id="s6x" type="number" min="1" max="100"></label>
      <div class="s6-sheet-btns"><button class="cr-btn primary" data-act="resolve">按这些参数重新求解</button><button class="cr-btn" data-act="explore">试多组参数找最短</button></div>
      <div class="s6-explore"></div>
      <div class="s6-sheet-note">beam 越大越慢，但通常步数更少；大模型步数更少，但要下载 3MB 权重。“试多组参数找最短”会依次跑几组（小模型 beam 16~256、大模型 beam 32~128），列出每组的步数和耗时，自动选用最短的，也可以点“用这个”换别的。</div>
    </div></div>
    <div class="s6-bottom">
      <div class="s6-live">
        <label class="s6-size-l">方框大小<input type="range" class="s6-size" min="35" max="95" value="68"></label>
        <button class="cr-btn primary s6-shot" data-act="shoot"></button>
        <button class="cr-btn s6-reshot" data-act="reshot">reshot<small>重拍上一张</small></button>
      </div>
      <div class="s6-msg"></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const video = $("video"), guide = $(".s6-guide"), gctx = guide.getContext("2d"), cap = $(".s6-cap"), cctx = cap.getContext("2d", { willReadFrequently: true }), camEl = $(".s6-cam");
  const dotsEl = $(".s6-dots"), msg = $(".s6-msg"), sizeEl = $(".s6-size"), hintEl = $(".s6-hint"), shotBtn = $("[data-act=shoot]"), reshotBtn = $("[data-act=reshot]"), flash = $(".s6-flash");
  const ill = createMiniCube($(".s6-ill"));

  let step = 0, stream = null, cube3 = null, solution = "", deciding = false;
  const shots = Array(6).fill(null);      // 每一步已拍的: { cells, low }
  const order = [];                       // 已拍的步骤序号(按拍摄先后), reshot 重拍最后一个

  // ---------- 进度圆点(完成的显示读到的 3x3 颜色, ⚠=网格可能没贴合; 点已完成的可回去重拍) ----------
  const dots = DIRS.map((_, i) => { const d = document.createElement("button"); d.className = "s6-dot"; d.innerHTML = `<span class="s6-dn">${i + 1}</span><span class="s6-mini3"></span>`; d.onclick = () => { if (!deciding && (shots[i] || i === step)) goStep(i); }; dotsEl.appendChild(d); return d; });
  function renderDots() {
    dots.forEach((d, i) => {
      d.className = "s6-dot" + (shots[i] ? " done" : "") + (shots[i]?.low ? " low" : "") + (i === step && !deciding ? " active" : "");
      const m = d.querySelector(".s6-mini3"); m.innerHTML = "";
      if (shots[i]) shots[i].cells.forEach((c) => { const e = document.createElement("i"); e.style.background = `rgb(${c.rgb})`; m.appendChild(e); });
    });
  }

  // ---------- 相机(整屏 cover)与方框引导 ----------
  async function startCamera() {
    const noCam = $(".s6-nocam");
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { noCam.hidden = false; noCam.textContent = "相机需要 HTTPS 地址才能打开。请用 https:// 打开本页，或在右上角 ⋯ 里“从相册选这一步”。"; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      video.srcObject = stream; await video.play().catch(() => {}); noCam.hidden = true;
    } catch (e) { noCam.hidden = false; noCam.textContent = "无法打开相机：" + e.message + "。可在右上角 ⋯ 里“从相册选这一步”。"; }
  }
  function stopCamera() { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; }
  const guideGeom = (w, h) => ({ cx: w / 2, cy: h / 2, s: (sizeEl.value / 100) * Math.min(w, h) / 2 });
  function drawGuide() {
    const w = camEl.clientWidth, h = camEl.clientHeight;
    if (w && (guide.width !== w || guide.height !== h)) { guide.width = w; guide.height = h; }
    gctx.clearRect(0, 0, guide.width, guide.height);
    if (w && !camEl.hidden) {
      const { cx, cy, s } = guideGeom(w, h), q = squareGuide(cx, cy, s);
      gctx.fillStyle = "rgba(0,0,0,.45)"; gctx.beginPath(); gctx.rect(0, 0, w, h); q.forEach((p, i) => (i ? gctx.lineTo(p[0], p[1]) : gctx.moveTo(p[0], p[1]))); gctx.closePath(); gctx.fill("evenodd");
      gctx.strokeStyle = "#ffe14d"; gctx.lineWidth = 3; gctx.beginPath(); q.forEach((p, i) => (i ? gctx.lineTo(p[0], p[1]) : gctx.moveTo(p[0], p[1]))); gctx.closePath(); gctx.stroke();
      gctx.lineWidth = 1.5; gctx.strokeStyle = "rgba(255,225,77,.9)"; gctx.beginPath();
      for (const t of [1 / 3, 2 / 3]) { gctx.moveTo(cx - s + 2 * s * t, cy - s); gctx.lineTo(cx - s + 2 * s * t, cy + s); gctx.moveTo(cx - s, cy - s + 2 * s * t); gctx.lineTo(cx + s, cy - s + 2 * s * t); }
      gctx.stroke();
      if (step < 4) { gctx.fillStyle = "#ffe14d"; gctx.font = "bold 13px sans-serif"; gctx.textAlign = "center"; gctx.fillText("↑ 顶面朝上", cx, cy - s - 8); }
    }
    requestAnimationFrame(drawGuide);
  }
  drawGuide();

  // ---------- 拍一张: 把可见区域(cover 之后用户看到的那块)拍下来, 方块贴合 + 读 9 格 ----------
  function visibleCrop() {   // video 在 cover 下被裁掉的部分: 返回可见区域在视频原始分辨率里的矩形
    const W = camEl.clientWidth, H = camEl.clientHeight, vw = video.videoWidth, vh = video.videoHeight, k = Math.max(W / vw, H / vh), cw = W / k, ch = H / k;
    return { x: (vw - cw) / 2, y: (vh - ch) / 2, w: cw, h: ch };
  }
  function capture(source, sx, sy, sw, sh) {   // 把 source 的 (sx,sy,sw,sh) 画到 cap(最长边 <= 700), 贴合方块并读 9 格; 返回记录(含叠加图, 供调试保存)
    const sc = Math.min(1, 700 / Math.max(sw, sh)); cap.width = Math.round(sw * sc); cap.height = Math.round(sh * sc);
    cctx.drawImage(source, sx, sy, sw, sh, 0, 0, cap.width, cap.height);
    const base = cctx.getImageData(0, 0, cap.width, cap.height), P = prepare(base), full = cap.toDataURL("image/jpeg", 0.88);
    const { cx, cy, s } = guideGeom(cap.width, cap.height), fit = fitFace(P, squareGuide(cx, cy, s)), cells = readFace(P, fit.quad), crops = faceCrops(P, fit.quad, 48);
    const cv = document.createElement("canvas"); cv.width = cv.height = 48; const cg = cv.getContext("2d");
    const cropUrls = crops.map((buf) => { cg.putImageData(new ImageData(buf, 48, 48), 0, 0); return cv.toDataURL("image/jpeg", 0.85); });
    cctx.strokeStyle = "#3dff6b"; cctx.lineWidth = 3; cctx.beginPath(); fit.quad.forEach((p, i) => (i ? cctx.lineTo(p[0], p[1]) : cctx.moveTo(p[0], p[1]))); cctx.closePath(); cctx.stroke();   // 叠加图: 绿色=贴合结果
    cells.forEach((c, i) => { const f = (u, v) => { const [a, b, cc, d] = fit.quad, t = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], bt = [d[0] + (cc[0] - d[0]) * u, d[1] + (cc[1] - d[1]) * u]; return [t[0] + (bt[0] - t[0]) * v, t[1] + (bt[1] - t[1]) * v]; };
      const [x, y] = f(((i % 3) + 0.5) / 3, (((i / 3) | 0) + 0.5) / 3); cctx.fillStyle = "#000"; cctx.beginPath(); cctx.arc(x, y, 8, 0, 7); cctx.fill(); cctx.fillStyle = `rgb(${c.rgb})`; cctx.beginPath(); cctx.arc(x, y, 6, 0, 7); cctx.fill(); });
    return { fit, cells, cropUrls, full, overlay: cap.toDataURL("image/jpeg", 0.8), low: fit.conf < CONF_WARN || fit.atLimit };
  }
  const nextMissing = () => shots.findIndex((s) => !s);

  // 连拍: 拍 -> 读 -> 立刻进入下一步, 6 张齐了自动合成
  function commit(rec) {
    const i = step;
    shots[i] = { cells: rec.cells, low: rec.low, cropUrls: rec.cropUrls }; const k = order.indexOf(i); if (k >= 0) order.splice(k, 1); order.push(i);
    flash.classList.add("on"); setTimeout(() => flash.classList.remove("on"), 90); navigator.vibrate?.(15);
    const nm = nextMissing();
    if (nm === -1) finalize(); else goStep(nm);
    if (rec.low) msg.textContent = `⚠ 第 ${i + 1} 张绿色网格可能没贴合魔方（置信度低）。点上面圆点 ${i + 1} 或 reshot 重拍`;
    renderDots();
  }
  function shoot() {
    if (deciding) return;
    if (!video.videoWidth) { msg.textContent = "相机还没准备好"; return; }
    const r = visibleCrop(); commit(capture(video, r.x, r.y, r.w, r.h));
  }
  $(".s6-mitem input").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; $(".s6-mpop").hidden = true; if (!f || deciding) return; const bmp = await createImageBitmap(f); commit(capture(bmp, 0, 0, bmp.width, bmp.height)); };

  // ---------- 流程 ----------
  function goStep(i) {
    step = i; msg.textContent = "";
    camEl.hidden = false; $(".s6-result").hidden = true; $(".s6-bottom").hidden = false; $(".s6-busy").hidden = true; if (!stream) startCamera();
    $(".s6-title").textContent = STEPS[i].title; hintEl.textContent = STEPS[i].text; hintEl.className = "s6-hint"; ill.play(i);
    shotBtn.innerHTML = `<b>${i + 1} ${DIRS[i]}</b><small>shot</small>`;
    reshotBtn.disabled = order.length === 0 || (order.length === 1 && order[0] === i);
    renderDots();
  }
  function reshot() {   // 重拍刚才拍的那一张(若当前步骤本身已有照片, 就是重拍当前这张)
    if (deciding || !order.length) return;
    goStep(order[order.length - 1]);
  }
  /** 6 张齐了: 在浏览器里本地解码(cube_decode.js, 与 Python 版逐格一致); 不确定的格子(一致性低或过暗)权重 0.35, 更多由整体约束决定 */
  function localDecode() {
    const faces = shots.map((sh) => ({ cells: sh.cells.map((c) => c.rgb), weights: Object.fromEntries(sh.cells.map((c, i) => [i, c.agree < 0.6 || rgbToLab(...c.rgb)[0] < 35 ? 0.35 : 1]).filter(([i, w]) => w < 1 && i !== 4)) }));
    const d = decode6(faces);
    if (d.ok) d.crops = Object.fromEntries(Object.entries(d.where).map(([pos, [sIdx, i]]) => [pos, shots[sIdx].cropUrls?.[i]]).filter(([, u]) => u));
    return d;
  }
  async function finalize() {
    deciding = true; $(".s6-busy").hidden = false; renderDots();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));   // 让"合成中…"先画出来
    let d; try { d = localDecode(); } catch (e) { d = { ok: false, error: "解码出错：" + e.message }; }
    deciding = false; renderResult(d);
  }

  // ---------- 结果: 3D (占满相机区域, 不滚动) ----------
  function renderResult(d) {
    $(".s6-busy").hidden = true;
    if (!d || !d.ok) {   // 失败: 回到相机, 提示去重拍
      goStep(order.length ? order[order.length - 1] : 0); hintEl.textContent = "✗ 合成失败：" + ((d && d.error) || "未知错误") + "。点上面对应序号的圆点，重拍那一张"; hintEl.className = "s6-hint bad"; return;
    }
    lastDecode = d; camEl.hidden = true; $(".s6-bottom").hidden = true; $(".s6-result").hidden = false; stopCamera(); step = -1; renderDots();
    $(".s6-title").textContent = "识别完成";
    const box = $(".s6-result"), size = Math.max(120, Math.min(190, Math.floor(Math.min((box.clientWidth || 360) * 0.44, (innerHeight - 360) * 0.75))));
    if (!cube3) { cube3 = createCube3D($(".s6-cube"), { size }); cube3.setLocked(true); cube3.setLabels(true); $("[data-act=viewA]").onclick = () => setVisible("UFR"); $("[data-act=viewB]").onclick = () => setVisible("DLB"); }
    viewGroup = "UFR"; cube3.setVisible("UFR"); cube3.setAngles(...VIEWS.UFR); seg("[data-act=viewA],[data-act=viewB]", $("[data-act=viewA]"));
    const clean = Object.fromEntries(Object.entries(d.palette).map(([k, v]) => [k, { rgb: v.clean_rgb || v.rgb }]));
    cube3.set({ faces: d.faces, palette: clean, crops: d.crops || {}, fixed: d.corrected, amb: d.ambiguous }); solution = d.solution || "";
    const hasCrops = !!d.crops && Object.keys(d.crops).length > 0;
    $("[data-act=c3img]").disabled = !hasCrops; setTexture(hasCrops ? "img" : "color"); startSolve(d);
    const hy = d.hypothesis || {}, odd = hy.rotate === "左转" || hy.up_down_swapped === false || hy.rot_up || hy.rot_down, many = d.ambiguous.length > 14 || d.corrected.length > 6;
    $(".cr-3dsum").textContent = (many ? `⚠ ${d.ambiguous.length} 格存疑（虚线框），可能有一张没对准，点上面的圆点重拍。` : `48 格里 ${48 - d.ambiguous.length} 格颜色明确${d.ambiguous.length ? `，${d.ambiguous.length} 格存疑（虚线框）` : ""}。用下面的“后·左·下”可以看背面，对照手里的魔方。`)
      + (odd ? `\n按你实际的转法识别：${hy.rotate}${hy.up_down_swapped === false ? "，底/顶拍反" : ""}${hy.rot_up ? `，顶面照转 ${hy.rot_up}°` : ""}${hy.rot_down ? `，底面照转 ${hy.rot_down}°` : ""}` : "");
  }
  // ================= 还原指导: 用我们的小模型(浏览器里的 Web Worker + beam search)求解, 逐步 上一步/下一步(不自动播放), 3D 上画箭头 =================
  const FACE_ZH = { U: "上面", D: "下面", F: "前面", B: "后面", L: "左面", R: "右面" };
  const MODELS = { tiny_Scanon_15w: { label: "小模型（快）", canon: true }, tiny_L_157w: { label: "大模型（步数少）", canon: false } };
  const DEFAULTS = { model: "tiny_Scanon_15w", beam: 256, retry: "scramble", max: 30 };
  const loadSet = () => { try { const o = { ...DEFAULTS, ...JSON.parse(localStorage.getItem("s6solver") || "{}") }; if (!MODELS[o.model]) o.model = DEFAULTS.model; return o; } catch { return { ...DEFAULTS }; } };
  const saveSet = (o) => localStorage.setItem("s6solver", JSON.stringify(o));
  const MODEL_BASE = new URL("../models/", import.meta.url).pathname;   // 两个模型都随页面静态发布(小 0.3MB, 大 3MB, 用到才下载)
  const resolveModelBase = async () => MODEL_BASE;
  let META = null, gs = null, solveWorker = null, solveToken = 0, viewGroup = "UFR";
  const gInfo = $(".s6-g-step"), gText = $(".s6-g-text"), chipsEl = $(".s6-chips"), gPrev = $("[data-act=gprev]"), gNext = $("[data-act=gnext]");
  const stepName = (st) => st.face + (st.k === 3 ? "'" : st.k === 2 ? "2" : "");
  const stepMoves = (st, inv) => (st.k === 2 ? [st.face, st.face] : [st.face + ((st.k === 3) !== !!inv ? "'" : "")]);   // 动画用的基本转动(半圈 = 两个同向 90°); inv: 逆操作
  function compress(names) {   // 同一面连续的转动合并成净转数(R R -> R2; R R' 消掉), 便于阅读
    const out = [];
    for (const nm of names) {
      const f = nm[0], t = nm.endsWith("'") ? 3 : nm.endsWith("2") ? 2 : 1;
      if (out.length && out[out.length - 1].face === f) { out[out.length - 1].k = (out[out.length - 1].k + t) % 4; if (!out[out.length - 1].k) out.pop(); }
      else out.push({ face: f, k: t });
    }
    return out;
  }
  // 视角固定(不再自动转): 默认从"前·右·上"看; 要核对/操作背面(后·左·下)由使用者手动切换
  const VIEWS = { UFR: [-25, -35], DLB: [25, 145] };
  async function setVisible(v) { cube3.setVisible(v); viewGroup = v; seg("[data-act=viewA],[data-act=viewB]", $(v === "UFR" ? "[data-act=viewA]" : "[data-act=viewB]")); await cube3.setView(...VIEWS[v], 450); if (gs) await showStep(); }
  function renderChips() {
    chipsEl.innerHTML = "";
    gs.steps.forEach((st, i) => { const c = document.createElement("button"); c.className = "s6-chip" + (i < gs.idx ? " done" : ""); c.textContent = stepName(st); c.onclick = () => jumpTo(i); chipsEl.appendChild(c); });
  }
  async function showStep() {
    const g = gs, N = g.steps.length, c = chipsEl.children;
    for (let i = 0; i < c.length; i++) { c[i].classList.toggle("cur", i === g.idx); c[i].classList.toggle("done", i < g.idx); }
    c[g.idx]?.scrollIntoView({ block: "nearest", inline: "center" });
    gPrev.disabled = g.idx === 0 || cube3.busy; gNext.disabled = g.idx >= N || cube3.busy;
    if (g.idx >= N) { cube3.hideArrow(); gInfo.textContent = `完成 ${N} / ${N}`; gText.textContent = "🎉 已还原！如果和你手里的魔方不一致，点“上一步”回头检查。"; return; }
    const st = g.steps[g.idx];
    gInfo.innerHTML = `步骤 ${g.idx + 1} / ${N}　<b class="s6-mv">${stepName(st)}</b>`;
    const hidden = !viewGroup.includes(st.face);
    gText.textContent = `把【${FACE_ZH[st.face]}】${st.k === 2 ? "转 180°" : st.k === 1 ? "顺时针转 90°" : "逆时针转 90°"}（正对着它看）` + (hidden ? "。这一面在背面，箭头画在你能看到的那几列上：沿箭头方向推" : "");
    if (gs === g) cube3.showMove(st.face, st.k);   // 可见面: 弧形箭头; 背面: 箭头画在能看到的那几列上
  }
  async function goto(delta) {   // delta=+1: 做这一步(动画), -1: 撤销上一步(动画逆操作)
    const g = gs; if (!g || cube3.busy) return;
    const i = delta > 0 ? g.idx : g.idx - 1; if (i < 0 || i >= g.steps.length) return;
    cube3.hideArrow(); gPrev.disabled = gNext.disabled = true;
    await cube3.play((delta > 0 ? stepMoves(g.steps[i], false) : stepMoves(g.steps[i], true)).join(" "), 380);
    g.idx += delta; await showStep();
  }
  async function jumpTo(i) {   // 点步骤条: 直接跳到第 i 步之前的状态(不动画)
    const g = gs; if (!g || cube3.busy) return;
    cube3.hideArrow(); cube3.reset(); for (let k = 0; k < i; k++) cube3.applyInstant(stepMoves(g.steps[k], false).join(" "));
    g.idx = i; await showStep();
  }
  gPrev.onclick = () => goto(-1); gNext.onclick = () => goto(+1);

  async function loadMeta() { return (META ||= await (await fetch(new URL("../meta.json", import.meta.url))).json()); }
  const srcEl = $(".s6-g-src");
  /** 用一组参数求一次解(Web Worker 里 beam search); 返回 { names, raw(转动数), steps(合并同面后的步数), attempts, sec, model, beam, fellBack } */
  async function runSolve(cfg, state) {
    const meta = await loadMeta(); let model = cfg.model, base = await resolveModelBase(model);
    if (!base && model !== "tiny_Scanon_15w") { model = "tiny_Scanon_15w"; base = await resolveModelBase(model); }   // 静态部署没有大模型: 退回小模型
    if (!base) throw new Error("找不到模型文件");
    const mode = cfg.retry === "view" && !MODELS[model].canon ? "view" : "scramble", t0 = performance.now();
    const r = await new Promise((ok, bad) => {
      const w = (solveWorker = new Worker(new URL("../worker.js", import.meta.url), { type: "module" }));
      w.onmessage = (e) => { if (e.data.progress) { gText.textContent = `AI 求解中…第 ${e.data.progress} 次尝试`; } else { w.terminate(); e.data.ok ? ok(e.data) : bad(new Error(e.data.error)); } };
      w.onerror = (e) => { w.terminate(); bad(new Error(e.message || "worker 出错")); };
      w.postMessage({ model: base + model, META: { moves: meta.moves, solved: meta.solved, sym: meta.sym }, state, beam: cfg.beam, retry: cfg.retry !== "none", maxAttempts: cfg.max, mode });
    });
    if (!r.moves) throw new Error("尝试次数用完仍没解出");
    const names = r.moves.map((a) => meta.moves[a].name);
    return { names, raw: names.length, steps: compress(names).length, attempts: r.attempts, sec: (performance.now() - t0) / 1000, model, beam: cfg.beam, fellBack: model !== cfg.model };
  }
  const describe = (r) => `${MODELS[r.model].label} · beam ${r.beam} · ${r.steps} 步（转动 ${r.raw} 个）· 试了 ${r.attempts} 次 · ${r.sec.toFixed(1)}s`;
  const stateOf = (d) => [...d.facelets].map((c) => "URFDLB".indexOf(c));
  async function applySolution(r) {
    gs = { steps: compress(r.names), idx: 0, source: describe(r) }; renderChips(); cube3.hideArrow(); cube3.reset(); 
    const dot = (L) => { const c = lastDecode?.palette?.[lastDecode.centers?.[L]]?.clean_rgb; return c ? `<i class="s6-dot-c" style="background:rgb(${c.map(Math.round)})"></i>` : ""; };
    srcEl.innerHTML = (lastDecode?.centers ? `手持：中心${dot("U")}的面朝上，中心${dot("F")}的面朝向你（最后一张拍的面在上面）<br>` : "") + "解法：" + gs.source; await showStep();
  }
  async function startSolve(d) {
    const my = ++solveToken; solveWorker?.terminate(); gs = null; cube3.hideArrow(); cube3.reset(); chipsEl.innerHTML = ""; srcEl.textContent = "";
    const set = loadSet(); gPrev.disabled = gNext.disabled = true; gInfo.textContent = "AI 求解中…"; gText.textContent = `${MODELS[set.model].label} · beam ${set.beam} · 在你的浏览器里搜解法`;
    try { const r = await runSolve(set, stateOf(d)); if (my !== solveToken) return; await applySolution(r); }
    catch (e) { if (my !== solveToken) return; gInfo.textContent = "AI 没有解出"; gText.textContent = `${e.message}。可点右上角“⚙ 求解设置”调大 beam / 换大模型再试；也可能是有格子识别错了，点上面的圆点重拍。`; }
  }
  // ---- 求解设置面板: 模型 / beam / 重试方式 / 最多尝试次数 + "试多组参数找最短" ----
  const sheet = $(".s6-sheet"), readSet = () => ({ model: $("#s6m").value, beam: +$("#s6b").value, retry: $("#s6r").value, max: Math.max(1, Math.min(100, +$("#s6x").value || 30)) });
  $("[data-act=gear]").onclick = () => { const o = loadSet(); $("#s6m").value = o.model; $("#s6b").value = o.beam; $("#s6r").value = o.retry; $("#s6x").value = o.max; sheet.hidden = false; };
  $("[data-act=sheetclose]").onclick = () => { exploring = false; sheet.hidden = true; };
  $("[data-act=resolve]").onclick = () => { saveSet(readSet()); sheet.hidden = true; if (lastDecode) startSolve(lastDecode); };
  let exploring = false;
  $("[data-act=explore]").onclick = async () => {
    if (!lastDecode || exploring) return; const set = readSet(); saveSet(set); exploring = true; const my = ++solveToken; solveWorker?.terminate();
    const box = $(".s6-explore"), btn = $("[data-act=explore]"), rows = []; box.innerHTML = ""; btn.textContent = "运行中…（点 ✕ 可停止）"; btn.disabled = true;
    const state = stateOf(lastDecode), cfgs = [["tiny_Scanon_15w", 16], ["tiny_Scanon_15w", 32], ["tiny_Scanon_15w", 64], ["tiny_Scanon_15w", 128], ["tiny_Scanon_15w", 256], ["tiny_L_157w", 32], ["tiny_L_157w", 64], ["tiny_L_157w", 128]];
    for (const [model, beam] of cfgs) {
      if (!exploring || my !== solveToken) break;
      const row = document.createElement("div"); row.className = "s6-xrow"; row.textContent = `${MODELS[model].label} · beam ${beam} … 运行中`; box.appendChild(row);
      try {
        const r = await runSolve({ model, beam, retry: set.retry, max: Math.min(set.max, 15) }, state);
        if (r.fellBack) { row.textContent = `${MODELS[model].label} · beam ${beam}：没有这个模型文件，跳过`; continue; }
        rows.push({ r, row }); row.innerHTML = `<span>${MODELS[model].label.slice(0, 3)} · beam ${beam}</span><span><b>${r.steps} 步</b> · ${r.sec.toFixed(1)}s · 试 ${r.attempts} 次</span>`;
        const use = document.createElement("button"); use.textContent = "用这个"; use.onclick = () => { applySolution(r); sheet.hidden = true; }; row.appendChild(use);
      } catch (e) { row.textContent = `${MODELS[model].label} · beam ${beam}：没解出（${e.message}）`; }
    }
    btn.textContent = "试多组参数找最短"; btn.disabled = false;
    if (my === solveToken && exploring && rows.length) {
      const best = rows.slice().sort((x, y) => x.r.steps - y.r.steps || x.r.sec - y.r.sec)[0]; best.row.classList.add("best");
      const note = document.createElement("div"); note.className = "s6-xnote"; note.textContent = `已选用最短的：${best.r.steps} 步（${MODELS[best.r.model].label} · beam ${best.r.beam}）。其余可点“用这个”切换。`; box.appendChild(note); applySolution(best.r);
    }
    exploring = false;
  };
  let lastDecode = null;

  const seg = (sel, on) => root.querySelectorAll(sel).forEach((b) => b.classList.toggle("on", b === on));
  const setTexture = (m) => { cube3?.setMode(m); seg("[data-act=c3img],[data-act=c3color]", $(m === "img" ? "[data-act=c3img]" : "[data-act=c3color]")); };
  $("[data-act=c3img]").onclick = () => setTexture("img"); $("[data-act=c3color]").onclick = () => setTexture("color");

  shotBtn.onclick = shoot; reshotBtn.onclick = reshot;
  $("[data-act=menu]").onclick = () => { const p = $(".s6-mpop"); p.hidden = !p.hidden; };
  $("[data-act=restart]").onclick = async () => {
    $(".s6-mpop").hidden = true; if (!confirm("清掉已拍的，重新开始？")) return;
    shots.fill(null); order.length = 0; goStep(0);
  };

  goStep(0); startCamera();   // 打开页面 = 全新开始; 一切都在浏览器本地完成(拍照/读色/解码/求解), 不需要任何服务端
  function inject(list) {   // 测试用: list = [{cells:[rgb x9], cropUrls:[...]}] x 6, 不经过相机直接解码
    list.forEach((p, i) => { shots[i] = { cells: p.cells.map((rgb) => ({ rgb, agree: 1 })), cropUrls: p.cropUrls || [], low: false }; order.push(i); });
    return finalize();
  }
  return { goStep, shoot, reshot, inject, cube: () => cube3, guide: () => gs };   // 供调试/测试脚本使用
}
