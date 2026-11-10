/* Tetris page: a trained value net can play, or you can; the AI can step in at any moment.
 * Above the board, a chart lists - for the piece in play - one curve per rotation: the AI's score of the position left behind when the piece is locked
 * at each horizontal shift (x axis = the board column of the piece's leftmost cell, aligned with the board below).
 * score = line reward + 0.05 + 0.99 * V(board after the piece is placed and full rows are removed). */
(function () {
  'use strict';
  const E = window.TetrisEngine, H = E.H, W = E.W, HID = E.HIDDEN, $ = (id) => document.getElementById(id);
  const COL = ['#00b8d4', '#f2c200', '#9c27b0', '#2eb82e', '#e53935', '#2f5bea', '#f57c00'];            // I O T S Z J L
  const CLS_COL = ['#0b7285', '#e08e00', '#2b8a3e', '#d6336c'];                                         // one colour per rotation curve
  const state = { board: new Uint8Array(H * W), piece: 0, next: 0, queue: [], rng: null, seed: 0, game: 1, pieces: 0, lines: 0, tetris: 0, clears: [0, 0, 0, 0, 0],
    ready: false, paused: false, speed: 1, mode: 'ai', loopId: 0, over: false, busy: false, cur: null, falling: null, flash: null, showOverlay: false,
    analysis: null, lastMs: 0, lastCands: 0 };
  window.__tetris = state;
  const store = { get: (k, d) => { try { const v = localStorage.getItem('tetris_' + k); return v === null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('tetris_' + k, v); } catch (e) {} } };
  const bindSel = (id, key, def, after) => { $(id).value = store.get(key, def); $(id).onchange = () => { store.set(key, $(id).value); $(id).blur(); if (after) after(); }; };
  const bindChk = (id, key, def, after) => { $(id).checked = store.get(key, def) === '1'; $(id).onchange = () => { store.set(key, $(id).checked ? '1' : '0'); $(id).blur(); if (after) after(); }; };
  bindSel('speed', 'speed', '1', () => { state.speed = +$('speed').value; }); state.speed = +$('speed').value;
  bindSel('gravity', 'gravity', '0');
  bindChk('showchart', 'chart', '1', () => resize()); bindChk('showcand', 'cand', '0', () => draw()); bindChk('hint', 'hint', '0', () => draw());

  // ---------- random 7-bag (seeded)
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function draw7() {
    if (!state.queue.length) { const q = [0, 1, 2, 3, 4, 5, 6]; for (let i = 6; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } state.queue = q; }
    return state.queue.pop();
  }

  // ---------- worker
  const worker = new Worker('worker.js'); let reqId = 0; const waiting = new Map();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready' && m.ver !== 1) { $('status').textContent = '页面文件版本不一致（浏览器缓存了旧的 worker.js）：请强制刷新，或清除该网站的缓存后重开'; }
    else if (m.type === 'ready') { state.ready = true; $('status').textContent = ''; updateInfo(m); newGame(+(new URLSearchParams(location.search).get('seed')) || ((Math.random() * 2 ** 31) | 0)); }
    else if (m.type === 'error') { $('status').textContent = '模型加载失败：' + m.message + '（需要通过 http 打开，不能直接双击 html 文件）'; }
    else if (m.type === 'decision') { const r = waiting.get(m.id); if (r) { waiting.delete(m.id); r(m); } }
  };
  worker.postMessage({ type: 'init' });
  const decide = (board, piece) => new Promise((res) => { const id = ++reqId; waiting.set(id, res); worker.postMessage({ type: 'decide', id, board: Array.from(board), piece }); });

  // ---------- analysis of the piece in play: score of every reachable placement, grouped by rotation (shape class) and shift
  function makeAnalysis(piece, res) {
    const pts = new Map(), classes = new Set(); let lo = 1e9, hi = -1e9;
    res.cands.forEach((c) => {
      const cls = E.shapeClass(piece, c.rot), xl = c.x + E.minCol(piece, c.rot), key = cls * 16 + xl, p = pts.get(key);
      if (!p || c.score > p.score) pts.set(key, { cls, xl, score: c.score, rot: c.rot }); classes.add(cls); lo = Math.min(lo, c.score); hi = Math.max(hi, c.score);
    });
    return { piece, cands: res.cands, best: res.best, ms: res.ms, pts, lo, hi, classes: Array.from(classes).sort() };
  }
  function setAnalysis(a) { state.analysis = a; state.lastCands = a.cands.length; state.lastMs = a.ms; updateLegend(); stats(); }
  let analysisId = 0;
  function analyze(piece) {                                                          // human mode: ask the AI about the piece that just appeared
    const id = ++analysisId, lid = state.loopId; state.analysis = null; updateLegend(); draw();
    decide(state.board, piece).then((res) => { if (id !== analysisId || lid !== state.loopId || res.over) return; setAnalysis(makeAnalysis(piece, res)); draw(); });
  }
  const cursorPoint = () => {                                                        // where the piece on the board is, as a point of its curve
    const f = state.falling || state.cur, a = state.analysis; if (!f || !a || a.piece !== f.piece) return null;
    const cls = E.shapeClass(f.piece, f.rot), xl = f.x + E.minCol(f.piece, f.rot); return { cls, xl, pt: a.pts.get(cls * 16 + xl) || null };
  };

  // ---------- drawing
  const cv = $('board'), ctx = cv.getContext('2d'), chv = $('chart'), cctx = chv.getContext('2d'), ncv = $('next'), nctx = ncv.getContext('2d'); let cs = 24, CH = 120;
  function resize() {
    const cw = document.documentElement.clientWidth - 20, wide = cw >= 640, dpr = window.devicePixelRatio || 1, chartOn = $('showchart').checked;
    CH = Math.max(90, Math.min(150, Math.round(cs * 5))); const avail = window.innerHeight - (chartOn ? CH + 34 : 0) - (wide ? 100 : 40);        // leave room for the title / status line above
    cs = Math.max(13, Math.floor(Math.min((cw - (wide ? 320 : 0)) / W, avail / H, 34)));
    $('left').style.width = W * cs + 'px'; cv.style.width = W * cs + 'px'; cv.style.height = H * cs + 'px'; cv.width = Math.round(W * cs * dpr); cv.height = Math.round(H * cs * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    chv.style.width = W * cs + 'px'; chv.style.height = CH + 'px'; chv.width = Math.round(W * cs * dpr); chv.height = Math.round(CH * dpr); cctx.setTransform(dpr, 0, 0, dpr, 0, 0); $('chartbox').style.display = chartOn ? '' : 'none';
    ncv.style.width = '88px'; ncv.style.height = '56px'; ncv.width = Math.round(88 * dpr); ncv.height = Math.round(56 * dpr); nctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  window.addEventListener('resize', resize);
  function cell(c, x, y, size, color, alpha) { c.globalAlpha = alpha === undefined ? 1 : alpha; c.fillStyle = color; c.fillRect(x + 1, y + 1, size - 2, size - 2); c.globalAlpha = 1; }
  function footprint(piece, rot, x, y) { const c = E.CELLS[piece][rot], out = []; for (let k = 0; k < 8; k += 2) out.push([y + c[k], x + c[k + 1]]); return out; }
  function draw() { drawBoard(); drawChart(); drawNext(); }
  function drawBoard() {
    const c = ctx, b = state.flash ? state.flash.board : state.board; c.clearRect(0, 0, W * cs, H * cs); c.fillStyle = '#ffffff'; c.fillRect(0, 0, W * cs, H * cs);
    c.fillStyle = '#fdecea'; c.fillRect(0, 0, W * cs, HID * cs);                                        // the two hidden spawn rows
    c.strokeStyle = '#e3e6ec'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < W; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, H * cs); } for (let i = 1; i < H; i++) { c.moveTo(0, i * cs); c.lineTo(W * cs, i * cs); } c.stroke();
    c.strokeStyle = '#d9534f'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(0, HID * cs); c.lineTo(W * cs, HID * cs); c.stroke(); c.setLineDash([]);
    for (let r = 0; r < H; r++) for (let x = 0; x < W; x++) if (b[r * W + x]) cell(c, x * cs, r * cs, cs, state.flash && state.flash.rows.has(r) ? '#ffd54a' : '#6f7d99');
    const a = state.analysis, f = state.falling || state.cur;
    if (a && f && a.piece === f.piece && $('showcand').checked && (state.showOverlay || state.mode === 'human')) {   // every candidate lock position, brighter = higher score
      a.cands.forEach((q, i) => { const t = a.hi > a.lo ? (q.score - a.lo) / (a.hi - a.lo) : 1; footprint(a.piece, q.rot, q.x, q.y).forEach(([r, x]) => cell(c, x * cs, r * cs, cs, COL[a.piece], 0.05 + 0.3 * t * t)); });
    }
    if (a && f && a.piece === f.piece && (state.mode === 'ai' ? state.showOverlay : $('hint').checked)) {            // the AI's favourite placement
      const q = a.cands[a.best]; c.strokeStyle = '#111'; c.lineWidth = 2; footprint(a.piece, q.rot, q.x, q.y).forEach(([r, x]) => { cell(c, x * cs, r * cs, cs, COL[a.piece], 0.35); c.strokeRect(x * cs + 1.5, r * cs + 1.5, cs - 3, cs - 3); });
    }
    if (state.cur && state.mode === 'human') {                                                                   // landing shadow of the piece you are moving
      const g = state.cur, gy = E.dropY(state.board, g.piece, g.rot, g.x, g.y); c.strokeStyle = COL[g.piece]; c.lineWidth = 1.5; footprint(g.piece, g.rot, g.x, gy).forEach(([r, x]) => c.strokeRect(x * cs + 2, r * cs + 2, cs - 4, cs - 4));
    }
    if (f) footprint(f.piece, f.rot, f.x, f.y).forEach(([r, x]) => cell(c, x * cs, r * cs, cs, COL[f.piece]));
    if (state.over) { c.fillStyle = '#000b'; c.fillRect(0, H * cs * 0.4, W * cs, cs * 3); c.fillStyle = '#fff'; c.font = `bold ${cs * 1.1}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('GAME OVER', W * cs / 2, H * cs * 0.4 + cs * 1.5); }
  }
  function drawChart() {
    if (!$('showchart').checked) return;
    const c = cctx, w = W * cs, h = CH, a = state.analysis; c.clearRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e3e6ec'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < W; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, h); } c.stroke();          // same column grid as the board
    c.fillStyle = '#6b7280'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!a) { c.fillText(state.over ? '' : 'AI 正在评估这一块的所有落点…', w / 2, h / 2); $('sScore').textContent = '—'; return; }
    const pad = (a.hi - a.lo) * 0.16 + 0.12, top = a.hi + pad, bot = a.lo - pad, Y = (s) => 10 + (top - s) / (top - bot) * (h - 20), X = (xl) => (xl + 0.5) * cs;
    const best = a.cands[a.best], bcls = E.shapeClass(a.piece, best.rot), bxl = best.x + E.minCol(a.piece, best.rot);
    c.setLineDash([3, 4]); c.strokeStyle = '#c3c9d6'; c.beginPath(); c.moveTo(0, Y(a.hi)); c.lineTo(w, Y(a.hi)); c.moveTo(0, Y(a.lo)); c.lineTo(w, Y(a.lo)); c.stroke(); c.setLineDash([]);
    const axLeft = bxl >= 3; c.textAlign = axLeft ? 'left' : 'right'; c.fillStyle = '#7b8496'; c.font = '10px sans-serif'; c.fillText(a.hi.toFixed(2), axLeft ? 3 : w - 3, Y(a.hi) - 6); c.fillText(a.lo.toFixed(2), axLeft ? 3 : w - 3, Y(a.lo) + 7);   // axis labels go to the side the best point is not on
    a.classes.forEach((cls) => {
      const col = CLS_COL[cls % 4]; c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2; c.beginPath(); let pen = false;
      for (let xl = 0; xl < W; xl++) { const p = a.pts.get(cls * 16 + xl); if (!p) { pen = false; continue; } if (pen) c.lineTo(X(xl), Y(p.score)); else c.moveTo(X(xl), Y(p.score)); pen = true; }
      c.stroke(); for (let xl = 0; xl < W; xl++) { const p = a.pts.get(cls * 16 + xl); if (p) { c.beginPath(); c.arc(X(xl), Y(p.score), 3, 0, 6.3); c.fill(); } }
    });
    const cur = cursorPoint();
    if (cur) { c.setLineDash([2, 3]); c.strokeStyle = '#11111166'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(cur.xl), 0); c.lineTo(X(cur.xl), h); c.stroke(); c.setLineDash([]);
      if (cur.pt) { c.fillStyle = '#2d3748'; c.beginPath(); c.arc(X(cur.xl), Y(cur.pt.score), 5, 0, 6.3); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); } }
    c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.arc(X(bxl), Y(best.score), 7, 0, 6.3); c.stroke();                                   // the best point
    c.fillStyle = '#111'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillText(best.score.toFixed(2), Math.min(w - 16, Math.max(16, X(bxl))), Math.max(8, Y(best.score) - 14));
    const el = $('sScore'), pt = cur && cur.pt; el.textContent = (pt ? pt.score.toFixed(2) : '—') + ' / ' + best.score.toFixed(2);
  }
  function drawNext() {
    nctx.clearRect(0, 0, 88, 56); const p = state.next, cells = E.CELLS[p][0], s = 14; let minC = 9, maxC = 0, minR = 9, maxR = 0;
    for (let k = 0; k < 8; k += 2) { minR = Math.min(minR, cells[k]); maxR = Math.max(maxR, cells[k]); minC = Math.min(minC, cells[k + 1]); maxC = Math.max(maxC, cells[k + 1]); }
    const ox = (88 - (maxC - minC + 1) * s) / 2, oy = (56 - (maxR - minR + 1) * s) / 2;
    for (let k = 0; k < 8; k += 2) cell(nctx, ox + (cells[k + 1] - minC) * s, oy + (cells[k] - minR) * s, s, COL[p]);
  }
  function shapeSvg(piece, rot, color) {                                              // the piece as it looks in this rotation, in the colour of its curve
    const cells = E.CELLS[piece][rot], s = 9; let minR = 9, maxR = 0, minC = 9, maxC = 0;
    for (let k = 0; k < 8; k += 2) { minR = Math.min(minR, cells[k]); maxR = Math.max(maxR, cells[k]); minC = Math.min(minC, cells[k + 1]); maxC = Math.max(maxC, cells[k + 1]); }
    let r = ''; for (let k = 0; k < 8; k += 2) r += `<rect x="${(cells[k + 1] - minC) * s}" y="${(cells[k] - minR) * s}" width="${s - 1}" height="${s - 1}" rx="1.5" fill="${color}"/>`;
    return `<svg width="${(maxC - minC + 1) * s}" height="${(maxR - minR + 1) * s}" style="margin:0 5px 0 2px">${r}</svg>`;
  }
  function updateLegend() {
    const a = state.analysis, el = $('legend'); if (!a) { el.innerHTML = '<span>评分曲线：每个旋转角度一条</span>'; return; }
    const two = a.piece === 0 || a.piece === 3 || a.piece === 4, name = (cls) => (a.piece === 1 ? '不用转' : two ? (cls === 0 ? '0° / 180°' : '90° / 270°') : cls * 90 + '°');
    el.innerHTML = a.classes.map((cls) => `<span class="lg"><i style="background:${CLS_COL[cls % 4]}"></i>${shapeSvg(a.piece, cls, CLS_COL[cls % 4])}${name(cls)}</span>`).join('') + '<span>◯ AI 选择　● 当前位置</span>';
  }
  function stats() {
    $('sGame').textContent = state.game; $('sPieces').textContent = state.pieces; $('sLines').textContent = state.lines; $('sTet').textContent = state.tetris;
    $('sEff').textContent = state.pieces ? Math.round(state.lines / (state.pieces * 0.4) * 1000) / 10 + '%' : '—';
    let top = H; for (let i = 0; i < H * W; i++) if (state.board[i]) { top = (i / W) | 0; break; } $('sH').textContent = H - top;
    $('sCand').textContent = state.lastCands ? `${state.lastCands} / ${state.lastMs.toFixed(0)} ms` : '—';
  }
  function updateInfo(m) {
    $('info').innerHTML = `<b>AI 怎么下棋：</b>每来一块，先列出它能真正到达的所有落点（含旋转、踢墙、塞到悬挑下面），再用一个小 CNN（${(m.params / 1e6).toFixed(2)}M 参数，只看<b>落下后的盘面</b>）给每个落点打分，选「消行奖励 + 0.99 × 盘面价值」最高的。<b>它看不到下一块</b>，也没有任何手写的"别留洞"之类规则。<br>`
      + `<b>盘面上方的曲线：</b>这一块的每个旋转角度一条曲线；横轴是方块<b>最左一格</b>所在的列（和下面的盘面对齐），纵轴是 AI 给"落在这里"的评分，断开的地方是到不了。白点是方块此刻所在的位置，所以你左右移动时能看到评分怎么变。<br>`
      + `<b>操作：</b>「我来玩」时用 ← → 移动，↑ 或 X 顺时针转，Z 逆时针转，↓ 下落一格，空格直接落到底，P 暂停（手机用盘面下面的按钮）。任何时候都可以点「AI 玩」让它接着下，或者点「让 AI 走这一步」。<br>`
      + `<b>效率</b> = 每块平均消的行数 ÷ 0.4（10 列宽、每块 4 格，0.4 行/块是上限）。`;
  }

  // ---------- shared game steps
  const tween = (ms, f) => new Promise((res) => { const t0 = performance.now(); (function step(t) { const p = ms <= 0 ? 1 : Math.min(1, (t - t0) / ms); f(p); if (p < 1) requestAnimationFrame(step); else res(); })(t0); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let resumeWaiters = [];
  const whilePaused = () => (state.paused ? new Promise((r) => resumeWaiters.push(r)) : null);
  const releasePause = () => { state.paused = false; $('pause').textContent = '暂停'; const w = resumeWaiters; resumeWaiters = []; w.forEach((f) => f()); };
  function fullRows(b) { const rows = new Set(); for (let r = 0; r < H; r++) { let full = true; for (let x = 0; x < W; x++) if (!b[r * W + x]) { full = false; break; } if (full) rows.add(r); } return rows; }
  function commit(rr, lines) {
    state.board = rr.board; state.pieces++; state.lines += lines; state.clears[lines]++; if (lines === 4) state.tetris++;
    state.piece = state.next; state.next = draw7(); stats();
  }
  function gameOver() { state.over = true; state.falling = null; state.cur = null; state.showOverlay = false; draw(); stats(); }

  function newGame(seed) {
    state.seed = seed; state.rng = mulberry32(seed); state.queue = []; state.board = new Uint8Array(H * W); state.pieces = 0; state.lines = 0; state.tetris = 0; state.clears = [0, 0, 0, 0, 0];
    state.over = false; state.analysis = null; state.lastCands = 0; state.piece = draw7(); state.next = draw7(); analysisId++; stats(); startLoop();
  }
  function startLoop() {                                                         // (re)start whoever is playing, continuing from the current board / piece
    const lid = ++state.loopId; analysisId++; state.busy = false; state.falling = null; state.cur = null; state.flash = null; state.showOverlay = false; state.analysis = null; updateLegend(); draw();
    if (state.over) return;
    if (state.mode === 'ai') playAI(lid); else { humanSpawn(lid); humanLoop(lid); }
  }

  // ---------- machine plays
  async function playAI(lid) {
    let pending = decide(state.board, state.piece);
    while (lid === state.loopId) {
      const res = await pending; if (lid !== state.loopId) return;
      if (res.over) { gameOver(); await sleep(3000); if (lid === state.loopId) { state.game++; newGame((Math.random() * 2 ** 31) | 0); } return; }       // died: another game after a pause
      const mv = res.cands[res.best], piece = state.piece, cur = state.board, r = E.lockAndClear(cur, piece, mv.rot, mv.x, mv.y), nextPiece = state.next;
      pending = decide(r.board, nextPiece);                                   // start thinking about the next piece right away
      const pw = whilePaused(); if (pw) { await pw; if (lid !== state.loopId) return; }
      setAnalysis(makeAnalysis(piece, res));
      if (state.speed > 0) {                                                  // cosmetic animation: appear, rotate, slide along the curve, fall, land, flash
        const s = state.speed; state.showOverlay = true; let f = { piece, rot: 0, x: E.SPAWN_X[piece], y: 0 };
        state.falling = f; draw(); await sleep(260 / s); if (lid !== state.loopId) return;
        f = { ...f, rot: mv.rot }; state.falling = f; draw(); await sleep(130 / s); if (lid !== state.loopId) return;
        const dir = Math.sign(mv.x - f.x); while (f.x !== mv.x) { f = { ...f, x: f.x + dir }; state.falling = f; draw(); await sleep(70 / s); if (lid !== state.loopId) return; }
        await sleep(120 / s); if (lid !== state.loopId) return;
        await tween((60 + 14 * mv.y) / s, (p) => { state.falling = { piece, rot: mv.rot, x: mv.x, y: mv.y * p }; draw(); }); if (lid !== state.loopId) return;
        if (mv.lines) { const tmp = Uint8Array.from(cur); footprint(piece, mv.rot, mv.x, mv.y).forEach(([rr, x]) => { tmp[rr * W + x] = 1; }); state.falling = null; state.flash = { board: tmp, rows: fullRows(tmp) }; draw(); await sleep(170 / s); state.flash = null; if (lid !== state.loopId) return; }
      }
      state.falling = null; state.showOverlay = false; commit(r, mv.lines);
      if (state.speed > 0) { draw(); await sleep(30 / state.speed); } else if (state.pieces % 4 === 0) { draw(); await sleep(0); }       // fastest: draw every few pieces, stay responsive
    }
  }

  // ---------- human plays
  let gravAcc = 0, lockStart = 0, resets = 0;
  const grounded = () => !E.canPlace(state.board, state.cur.piece, state.cur.rot, state.cur.x, state.cur.y + 1);
  function humanSpawn(lid) {
    const p = state.piece, cur = { piece: p, rot: 0, x: E.SPAWN_X[p], y: 0 };
    if (!E.canPlace(state.board, p, 0, cur.x, 0)) { gameOver(); return; }
    state.cur = cur; gravAcc = 0; lockStart = 0; resets = 0; analyze(p); draw();
  }
  function touched() { if (grounded()) { if (resets < 15) { resets++; lockStart = 0; } } else lockStart = 0; }
  function hMove(dx) { const f = state.cur; if (!f || state.busy || state.paused) return; if (E.canPlace(state.board, f.piece, f.rot, f.x + dx, f.y)) { state.cur = { ...f, x: f.x + dx }; touched(); draw(); } }
  function hRot(dir) { const f = state.cur; if (!f || state.busy || state.paused) return; const r = E.rotate(state.board, f.piece, f.rot, f.x, f.y, dir); if (r) { state.cur = { ...f, ...r }; touched(); draw(); } }
  function hDown() { const f = state.cur; if (!f || state.busy || state.paused) return; if (E.canPlace(state.board, f.piece, f.rot, f.x, f.y + 1)) { state.cur = { ...f, y: f.y + 1 }; gravAcc = 0; draw(); } else lockCur(); }
  function hDrop() { const f = state.cur; if (!f || state.busy || state.paused) return; state.cur = { ...f, y: E.dropY(state.board, f.piece, f.rot, f.x, f.y) }; lockCur(); }
  async function lockCur() {
    const f = state.cur, lid = state.loopId; if (!f || state.busy) return; state.busy = true; state.cur = null;
    const cells = E.CELLS[f.piece][f.rot]; let out = true; for (let k = 0; k < 8; k += 2) if (f.y + cells[k] >= HID) out = false;
    if (out) { state.busy = false; gameOver(); return; }                       // the whole piece locked inside the hidden rows: top-out
    const r = E.lockAndClear(state.board, f.piece, f.rot, f.x, f.y);
    if (r.lines) { const tmp = Uint8Array.from(state.board); footprint(f.piece, f.rot, f.x, f.y).forEach(([rr, x]) => { tmp[rr * W + x] = 1; }); state.flash = { board: tmp, rows: fullRows(tmp) }; draw(); await sleep(150); if (lid !== state.loopId) return; state.flash = null; }
    commit(r, r.lines); state.busy = false; humanSpawn(lid); if (lid !== state.loopId) return;
  }
  function humanLoop(lid) {
    let last = performance.now();
    (function step(t) {
      if (lid !== state.loopId) return; const dt = t - last, g = +$('gravity').value; last = t;
      if (!state.paused && state.cur && !state.busy && !state.over && g > 0) {
        gravAcc += dt; let moved = false; while (gravAcc >= g) { gravAcc -= g; const f = state.cur; if (E.canPlace(state.board, f.piece, f.rot, f.x, f.y + 1)) { state.cur = { ...f, y: f.y + 1 }; moved = true; } else { gravAcc = 0; break; } }
        if (moved) draw();
        if (grounded()) { if (!lockStart) lockStart = t; else if (t - lockStart >= 500) lockCur(); } else lockStart = 0;
      }
      requestAnimationFrame(step);
    })(last);
  }
  async function aiStep() {                                                      // "let the AI play this one piece for me"
    const f = state.cur, a = state.analysis, lid = state.loopId; if (state.mode !== 'human' || !f || state.busy || state.paused || !a || a.piece !== f.piece) return;
    const mv = a.cands[a.best]; state.busy = true; state.cur = { ...f, rot: mv.rot, x: mv.x, y: Math.min(f.y, mv.y) }; draw();
    await tween(160, (p) => { state.cur = { ...state.cur, y: Math.round(Math.min(f.y, mv.y) + (mv.y - Math.min(f.y, mv.y)) * p) }; draw(); }); if (lid !== state.loopId) return;
    state.busy = false; state.cur = { ...state.cur, y: mv.y }; lockCur();
  }

  // ---------- controls
  function setMode(m) {
    if (m === state.mode) return; state.mode = m; document.body.classList.toggle('human', m === 'human'); $('modeAI').classList.toggle('on', m === 'ai'); $('modeHuman').classList.toggle('on', m === 'human');
    releasePause(); if (state.ready) { startLoop(); resize(); }
  }
  $('modeAI').onclick = () => setMode('ai'); $('modeHuman').onclick = () => setMode('human'); $('aiStep').onclick = aiStep; state.setMode = setMode;
  $('pause').onclick = () => { if (state.paused) releasePause(); else { state.paused = true; $('pause').textContent = '继续'; } };
  $('restart').onclick = () => { if (!state.ready) return; state.game++; releasePause(); newGame((Math.random() * 2 ** 31) | 0); };
  const KEYS = { ArrowLeft: () => hMove(-1), ArrowRight: () => hMove(1), ArrowDown: hDown, ArrowUp: () => hRot(1), x: () => hRot(1), X: () => hRot(1), z: () => hRot(-1), Z: () => hRot(-1), ' ': hDrop };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') { $('pause').click(); return; }
    if (state.mode !== 'human' || !KEYS[e.key] || (e.target && e.target.tagName === 'SELECT')) return; e.preventDefault(); KEYS[e.key]();
  });
  const TOUCH = { left: () => hMove(-1), right: () => hMove(1), ccw: () => hRot(-1), cw: () => hRot(1), down: hDown, drop: hDrop };
  document.querySelectorAll('#touch button').forEach((b) => {
    let timer = null, rep = null; const k = b.dataset.k, stop = () => { clearTimeout(timer); clearInterval(rep); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); TOUCH[k](); if (k === 'left' || k === 'right' || k === 'down') timer = setTimeout(() => { rep = setInterval(TOUCH[k], 70); }, 260); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
  });
  state.keys = { left: () => hMove(-1), right: () => hMove(1), cw: () => hRot(1), ccw: () => hRot(-1), down: hDown, drop: hDrop, aiStep };   // (for the tests)
  resize(); updateLegend();
})();
