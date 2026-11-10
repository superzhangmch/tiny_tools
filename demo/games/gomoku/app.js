/* Gomoku page: board drawing, touch input, game flow, and a second small board whose background is the CNN's move-probability heat map.
 * The AI (CNN + optional MCTS) runs in worker.js. */
(function () {
  'use strict';
  const S = 15, N = 225;
  const $ = (id) => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d'), mini = $('mini'), mctx = mini.getContext('2d');
  const state = { board: new Int8Array(N), moves: [], human: 1, turn: 1, over: false, winLine: null, thinking: false, pending: -1, ready: false, reqId: 0, forwardMs: 70, heat: null, heatFor: 0, heatSeq: 0, hv: { mine: null, ai: null }, heatView: 'mine', lastReason: 'net' };

  // ---------- settings
  const store = { get: (k, d) => { try { const v = localStorage.getItem('gomoku_' + k); return v === null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem('gomoku_' + k, v); } catch (e) {} } };
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  $('level').value = store.get('level', '16'); $('confirm').checked = store.get('confirm', coarse ? '1' : '0') === '1'; $('showheat').checked = store.get('heat', '1') === '1'; $('basic').checked = store.get('basic', '1') === '1';
  $('level').onchange = () => { store.set('level', $('level').value); updateInfo(); };
  $('confirm').onchange = () => { store.set('confirm', $('confirm').checked ? '1' : '0'); state.pending = -1; draw(); };
  $('basic').onchange = () => { store.set('basic', $('basic').checked ? '1' : '0'); updateInfo(); };
  state.heatView = store.get('heatview', 'mine') === 'ai' ? 'ai' : 'mine';
  function setHeatView(v) { state.heatView = v; store.set('heatview', v); $('hvMine').classList.toggle('on', v === 'mine'); $('hvAi').classList.toggle('on', v === 'ai'); syncHeat(); drawMini(); }
  $('hvMine').classList.toggle('on', state.heatView === 'mine'); $('hvAi').classList.toggle('on', state.heatView === 'ai');
  $('hvMine').onclick = () => setHeatView('mine'); $('hvAi').onclick = () => setHeatView('ai');
  function syncHeat() { const V = state.hv[state.heatView]; state.heat = V ? V.heat : null; state.heatFor = V ? V.player : 0; }       // (kept for the tests / debugging)
  $('showheat').onchange = () => { store.set('heat', $('showheat').checked ? '1' : '0'); resize(); requestHeat(); };

  // ---------- AI worker
  const worker = new Worker('worker.js');
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready' && m.ver !== 3) { $('status').textContent = '页面文件版本不一致（浏览器缓存了旧的 worker.js）：请强制刷新，或清除该网站的缓存后重开'; }
    else if (m.type === 'ready') { state.ready = true; state.forwardMs = m.forwardMs; $('newBlack').disabled = $('newWhite').disabled = false; updateInfo(); newGame(1); if (/demo=1/.test(location.search)) demo(); }
    else if (m.type === 'error') { $('status').textContent = '模型加载失败：' + m.message + '（需要通过 http 打开，不能直接双击 html 文件）'; }
    else if (m.type === 'policy') { const q = heatReq.get(m.id); heatReq.delete(m.id); if (q && m.id === state.heatSeq) { state.hv[q.player === state.human ? 'mine' : 'ai'] = { board: q.board, heat: m.prior, player: q.player, last: q.last, chosen: -1, reason: '' }; syncHeat(); drawMini(); } }
    else if (m.type === 'move' && m.id === state.reqId) { state.thinking = false; { const v = state.hv.ai; if (v && v.player === state.turn) { v.chosen = m.move; v.reason = m.reason; } } place(m.move, state.turn, true); setEval(m.value); lastMs = m.ms; state.lastReason = m.reason; updateInfo(); }
  };
  let lastMs = null; const heatReq = new Map();
  worker.postMessage({ type: 'init' });

  // ---------- helpers
  const winAt = (b, cell, p) => {                                  // returns the 5+ line through `cell` as a list of cells, or null
    const r = (cell / S) | 0, c = cell % S;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const line = [cell];
      for (const sg of [1, -1]) { let rr = r + sg * dr, cc = c + sg * dc; while (rr >= 0 && rr < S && cc >= 0 && cc < S && b[rr * S + cc] === p) { line.push(rr * S + cc); rr += sg * dr; cc += sg * dc; } }
      if (line.length >= 5) return line;
    }
    return null;
  };
  const colorName = (p) => (p === 1 ? '黑' : '白');
  const dot = (p) => `<span class="dot" style="background:${p === 1 ? '#111' : '#f5f5f5'}"></span>`;
  const label = (cell) => String.fromCharCode(65 + (cell % S)) + (S - ((cell / S) | 0));       // same coordinates as on the board edge

  function setStatus() {
    if (!state.ready || state.over) return;
    $('status').innerHTML = state.thinking ? `${dot(state.turn)}AI（${colorName(state.turn)}）思考中…` : `${dot(state.turn)}轮到你（${colorName(state.turn)}）落子`;
  }
  function setEval(v) { const p = Math.max(0, Math.min(1, (v + 1) / 2)); $('evalfill').style.width = (p * 100).toFixed(0) + '%'; $('evaltext').textContent = (p * 100).toFixed(0) + '%'; }
  function updateInfo() {
    const sims = +$('level').value, ms = state.forwardMs, est = (sims > 0 ? (sims + 1) : 1) * ms;
    const fmt = (t) => (t < 950 ? Math.round(t) + ' 毫秒' : (t / 1000).toFixed(1) + ' 秒');
    $('info').innerHTML = `本设备一次网络推理约 <b>${ms.toFixed(0)} 毫秒</b>，当前强度预计每步约 <b>${fmt(est)}</b>` + (lastMs ? `（上一步实际 ${fmt(lastMs)}）` : '') + (state.lastReason === 'win' ? '<br>上一步：AI 用了基础规则——<b>成五</b>。' : state.lastReason === 'block' ? '<br>上一步：AI 用了基础规则——<b>堵五</b>。' : '') +
      `。<br>模型：56 万参数的 CNN，模仿强引擎 Rapfi 训练，纯 CNN 约相当于 Rapfi 每步搜索 40–60 个节点；加上 MCTS 后更强。AI 自评胜率来自网络的价值头，仅供参考。` +
      `<br>小棋盘：棋子与主棋盘相同，背景颜色是 CNN 对"轮到的一方下一步落在哪里"的概率（越红越可能）。`;
  }

  // ---------- game flow
  function refresh() { setStatus(); draw(); requestHeat(); maybeAI(); }                // after any change of the position
  function newGame(human) {
    state.reqId++; state.board.fill(0); state.moves = []; state.human = human; state.turn = 1; state.over = false; state.winLine = null; state.thinking = false; state.pending = -1; state.hv = { mine: null, ai: null };
    setEval(0); $('evaltext').textContent = '—'; resize(); refresh();
  }
  function place(cell, p, byAI) {
    state.board[cell] = p; state.moves.push([cell, p]); state.pending = -1;
    const line = winAt(state.board, cell, p);
    if (line) { state.over = true; state.winLine = line; $('status').innerHTML = `${dot(p)}${p === state.human ? '你赢了！🎉' : 'AI 赢了'}（${colorName(p)}方连成五子）`; }
    else if (state.moves.length === N) { state.over = true; $('status').textContent = '平局'; }
    else { state.turn = -p; }
    refresh();
  }
  function maybeAI() {
    if (state.over || state.turn === state.human || state.thinking || !state.ready) return;
    state.thinking = true; setStatus(); const id = ++state.reqId, last = state.moves.length ? state.moves[state.moves.length - 1][0] : -1;
    setTimeout(() => worker.postMessage({ type: 'move', id, board: Array.from(state.board), player: state.turn, last, sims: +$('level').value, basic: $('basic').checked }), 30);   // let the "thinking" text paint first
  }
  function requestHeat() {
    const stones = state.moves.length;
    if (!state.ready || !$('showheat').checked || stones < 2) state.hv = { mine: null, ai: null };
    else if (state.over) state.hv.mine = null;
    if (!state.ready || state.over || !$('showheat').checked || stones < 2) { state.heatSeq++; syncHeat(); drawMini(); return; }
    const id = ++state.heatSeq, last = state.moves[stones - 1][0], player = state.turn;
    if (player === state.human) state.hv.mine = null; else state.hv.ai = null;                  // the position changed: the old view of this side is stale
    heatReq.set(id, { board: Int8Array.from(state.board), player, last }); syncHeat(); drawMini();
    worker.postMessage({ type: 'policy', id, board: Array.from(state.board), player, last });
  }
  function undo() {
    if (state.thinking || !state.moves.length) return;
    const pop = () => { const [c] = state.moves.pop(); state.board[c] = 0; };
    if (state.moves[state.moves.length - 1][1] !== state.human) pop();                         // the AI moved last: take back its move ...
    if (state.moves.length && state.moves[state.moves.length - 1][1] === state.human) pop();   // ... and your move before it
    state.hv = { mine: null, ai: null }; state.over = false; state.winLine = null; state.pending = -1; state.turn = state.moves.length % 2 === 0 ? 1 : -1;   // black always moves first
    refresh();                                                                                   // (if you are white and nothing is left, the AI opens again)
  }
  $('newBlack').onclick = () => newGame(1); $('newWhite').onclick = () => newGame(-1); $('undo').onclick = undo;
  $('newBlack').disabled = $('newWhite').disabled = true;

  // ---------- drawing (one routine for the main board and the small heat-map board)
  let W = 0, M = 0;
  function resize() {
    const cw = document.documentElement.clientWidth - 20, wide = cw >= 880, heatOn = $('showheat').checked, dpr = window.devicePixelRatio || 1;
    if (wide && heatOn) { W = Math.floor(Math.min(640, window.innerHeight * 0.78, (cw - 14) * 0.64)); M = Math.floor(Math.min(380, cw - W - 14)); }
    else { W = Math.floor(Math.min(cw, 640, Math.max(280, window.innerHeight * 0.66))); M = Math.floor(Math.min(cw, 340)); }
    canvas.style.width = canvas.style.height = W + 'px'; canvas.width = canvas.height = Math.round(W * dpr);
    mini.style.width = mini.style.height = M + 'px'; mini.width = mini.height = Math.round(M * dpr); $('miniwrap').style.display = heatOn ? '' : 'none';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  window.addEventListener('resize', resize);
  function stone(c, x, y, r, p, alpha) {
    c.save(); c.globalAlpha = alpha === undefined ? 1 : alpha;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    if (p === 1) { g.addColorStop(0, '#6b6b6b'); g.addColorStop(1, '#0a0a0a'); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c9c9'); }
    c.shadowColor = '#0006'; c.shadowBlur = r * 0.35; c.shadowOffsetY = r * 0.12; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = g; c.fill(); c.restore();
  }
  function paint(c, size, isMini) {
    const cell = size / (S + 1), px = (i) => (i + 1) * cell;
    c.clearRect(0, 0, size, size); const bg = c.createLinearGradient(0, 0, size, size); bg.addColorStop(0, isMini ? '#ffffff' : '#e9c47e'); bg.addColorStop(1, isMini ? '#ffffff' : '#d9ac5f'); c.fillStyle = bg; c.fillRect(0, 0, size, size);    // the small board is white so the heat colours read clearly
    let top = []; const V = isMini ? state.hv[state.heatView] : null, B = V ? V.board : state.board, H = V ? V.heat : null;
    if (V) {                                                       // heat-map background: one coloured square per empty intersection
      let pmax = 0; for (let i = 0; i < N; i++) if (B[i] === 0 && H[i] > pmax) pmax = H[i];
      for (let i = 0; i < N; i++) {
        if (B[i] !== 0) continue; const t = Math.sqrt(H[i] / (pmax || 1)); if (t < 0.04) continue;      // sqrt scale so mid-sized probabilities stay visible
        c.fillStyle = `hsla(${55 * (1 - t)}, 95%, 48%, ${0.12 + 0.8 * t})`; c.fillRect(px(i % S) - cell / 2, px((i / S) | 0) - cell / 2, cell, cell);
      }
      top = Array.from({ length: N }, (_, i) => i).filter(i => B[i] === 0).sort((a, b) => H[b] - H[a]).slice(0, 10);
    }
    c.strokeStyle = isMini ? 'rgba(60,60,60,0.55)' : '#5a3d12'; c.lineWidth = Math.max(1, cell * 0.04); c.beginPath();
    for (let i = 0; i < S; i++) { c.moveTo(px(0), px(i)); c.lineTo(px(S - 1), px(i)); c.moveTo(px(i), px(0)); c.lineTo(px(i), px(S - 1)); } c.stroke();
    c.fillStyle = isMini ? '#666' : '#5a3d12'; for (const [a, b] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) { c.beginPath(); c.arc(px(a), px(b), cell * 0.1, 0, 2 * Math.PI); c.fill(); }
    if (!isMini) { c.fillStyle = '#7a5a2a'; c.font = `${Math.max(9, cell * 0.3)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < S; i++) { c.fillText(String.fromCharCode(65 + i), px(i), cell * 0.35); c.fillText(String(S - i), cell * 0.35, px(i)); } }
    const rr = cell * (isMini ? 0.42 : 0.45);
    for (let i = 0; i < N; i++) if (B[i] !== 0) stone(c, px(i % S), px((i / S) | 0), rr, B[i]);
    const lm = V ? V.last : (state.moves.length ? state.moves[state.moves.length - 1][0] : -1);
    if (lm >= 0) { const m = lm, p = B[lm]; c.strokeStyle = p === 1 ? '#ff6a4d' : '#e03a1e'; c.lineWidth = cell * 0.07; c.beginPath(); c.arc(px(m % S), px((m / S) | 0), cell * 0.17, 0, 2 * Math.PI); c.stroke(); }
    if (isMini && top.length && cell >= 13) {                                         // the 10 most likely cells: percentage in the cell + a small rank badge (1..10) in its corner
      const pct = (p) => (p < 0.005 ? '<1%' : Math.round(p * 100) + '%');
      top.forEach((i, k) => {
        const x = px(i % S), y = px((i / S) | 0);
        c.font = `bold ${Math.max(8, cell * 0.36)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#000b'; c.strokeText(pct(H[i]), x, y + cell * 0.08); c.fillStyle = '#fff'; c.fillText(pct(H[i]), x, y + cell * 0.08);
        const bw = Math.max(9, cell * (k === 9 ? 0.5 : 0.36)), bh = Math.max(9, cell * 0.34), bx = x - cell / 2 + 1, by = y - cell / 2 + 1;      // badge in the upper-left corner
        c.fillStyle = '#111'; c.beginPath(); c.roundRect ? c.roundRect(bx, by, bw, bh, bh / 2) : c.rect(bx, by, bw, bh); c.fill();
        c.fillStyle = '#ffd24a'; c.font = `bold ${Math.max(7, cell * 0.27)}px sans-serif`; c.fillText(String(k + 1), bx + bw / 2, by + bh / 2 + 0.5);
      });
    }
    if (V && V.chosen >= 0) {                                                         // the move the AI actually played from this position: ghost stone + green ring
      const x = px(V.chosen % S), y = px((V.chosen / S) | 0); stone(c, x, y, rr, V.player, 0.6); c.strokeStyle = '#25d366'; c.lineWidth = Math.max(2, cell * 0.12); c.beginPath(); c.arc(x, y, cell * 0.52, 0, 2 * Math.PI); c.stroke();
    }
    if (!isMini && state.pending >= 0 && !state.over) stone(c, px(state.pending % S), px((state.pending / S) | 0), rr, state.human, 0.55);
    if (state.winLine) { c.strokeStyle = '#25d366'; c.lineWidth = cell * 0.1; for (const m of state.winLine) { c.beginPath(); c.arc(px(m % S), px((m / S) | 0), cell * 0.5, 0, 2 * Math.PI); c.stroke(); } }
    return top;
  }
  function draw() { if (!W) return; paint(ctx, W, false); drawMini(); }
  function drawMini() {
    if (!M) return; const top = paint(mctx, M, true), cap = $('minicap'), stones = state.moves.length;
    const V = state.hv[state.heatView], ai = state.heatView === 'ai';
    if (!state.ready) cap.innerHTML = '';
    else if (stones < 2) cap.innerHTML = '<b>热力图</b>：开局前两步网络没有见过这种局面（训练数据都从随机开局之后开始），所以这里不显示。';
    else if (!V) cap.innerHTML = ai ? (state.thinking ? '<b>AI 为什么这么下</b>：AI 正在思考…' : '<b>AI 为什么这么下</b>：还没有可解释的 AI 落子（AI 还没下过，或刚新局/悔棋）。') : (state.over ? '对局结束' : state.turn !== state.human ? '<b>你面对的局面</b>：AI 正在下，下完后这里显示你面对的局面。' : '<b>热力图</b>计算中…');
    else {
      const rank = (c) => 1 + Array.from({ length: N }, (_, i) => i).filter(i => V.board[i] === 0 && V.heat[i] > V.heat[c]).length, pc = (p) => (p * 100 < 0.5 ? '<1' : (p * 100).toFixed(0)) + '%';
      let head;
      if (!ai) head = `<b>你面对的局面</b> · 轮到 <b>${colorName(V.player)}</b>（你）`;
      else if (V.chosen < 0) head = `<b>AI 为什么这么下</b> · AI（${colorName(V.player)}）正在看这个局面…`;
      else head = `<b>AI 为什么这么下</b>：这是 AI（${colorName(V.player)}）下之前看到的局面，<span style="color:#25d366">绿圈</span> = 它实际下的位置<br>实际落子 <b>${label(V.chosen)}</b>，CNN 排名第 <b>${rank(V.chosen)}</b>（${pc(V.heat[V.chosen])}）` + (V.reason === 'win' ? ' · 基础规则：成五' : V.reason === 'block' ? ' · 基础规则：堵五' : (V.reason === 'net' && +$('level').value === 0 && V.board.reduce((n, v) => n + (v !== 0), 0) < 6) ? ' · 开局前几手故意在前 3 名里按概率抽样（让每局不同），所以不一定是第 1 名' : state.thinking === false && +$('level').value > 0 ? ' · 经 MCTS 搜索后选定' : '');
      cap.innerHTML = head + `<br><span class="legend"></span> 越红 = CNN 认为越可能下这里<br>前 10 名（角标 = 名次）：<br>` + top.map((i, k) => `<b>${k + 1}</b> ${label(i)} ${pc(V.heat[i])}`).join('　');
    }
  }

  // ---------- input (mouse and touch)
  canvas.addEventListener('pointerup', (e) => {
    if (!state.ready || state.over || state.thinking || state.turn !== state.human) return;
    const cellPx = W / (S + 1), rect = canvas.getBoundingClientRect(), x = (e.clientX - rect.left) * (W / rect.width), y = (e.clientY - rect.top) * (W / rect.width);
    const c = Math.round(x / cellPx) - 1, r = Math.round(y / cellPx) - 1; if (c < 0 || c >= S || r < 0 || r >= S) return;
    if (Math.hypot(x - (c + 1) * cellPx, y - (r + 1) * cellPx) > cellPx * 0.62) return;
    const cell = r * S + c; if (state.board[cell] !== 0) return;
    if ($('confirm').checked && state.pending !== cell) { state.pending = cell; draw(); return; }
    place(cell, state.human, false);
  });

  // ---------- test hook: ?demo=1 plays a few scripted human moves (used for automated screenshots / checks)
  function demo() {
    const script = [[7, 7], [7, 8], [6, 7], [8, 7], [5, 7], [9, 7]]; let k = 0;
    const tick = () => { if (state.over || k >= script.length) { document.title = 'DEMO DONE ' + state.moves.map(m => m[0]).join(','); return; }
      if (!state.thinking && state.turn === state.human) { let [x, y] = script[k++]; while (state.board[y * S + x] !== 0) { x = (x + 1) % S; } place(y * S + x, state.human, false); }
      setTimeout(tick, 150); };
    tick();
  }

  window.__gomoku = state; window.__maybeAI = maybeAI;   // handles for automated tests
  window.addEventListener('load', resize); resize();
})();
