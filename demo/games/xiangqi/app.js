(function () {
  'use strict';
  const $ = (id) => document.getElementById(id), SV = 'http://www.w3.org/2000/svg', C = 56, M = 40;
  const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';
  const CH = { R: '車', N: '馬', B: '相', A: '仕', K: '帥', C: '炮', P: '兵', r: '車', n: '馬', b: '象', a: '士', k: '將', c: '砲', p: '卒' };
  const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  let board, moves = [], legal = [], turn = 'red', status = [null, ''], check = false, sel = null, thinking = false, human = 'red', last = null, cand = [], busy = 0, pol = null, polAI = null, polBusy = 0, dbgMap = null, dbgSel = null, dbgBusy = 0;
  const sq = (s) => ({ f: s.charCodeAt(0) - 97, r: +s[1] }), name = (f, r) => String.fromCharCode(97 + f) + r;
  function setup() { board = {}; START.split('/').forEach((row, i) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { board[name(f, 9 - i)] = ch; f++; } } }); }
  const xy = (f, r) => human === 'red' ? [M + f * C, M + (9 - r) * C] : [M + (8 - f) * C, M + r * C];
  async function api(path, body) { if ($('model')) body = Object.assign({ model: $('model').value }, body); if (window.XQ_API) return window.XQ_API(path, body); const r = await fetch(path, { method: 'POST', body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; }      // window.XQ_API: the in-browser engine (web_browser/)
  function el(tag, attrs, parent) { const e = document.createElementNS(SV, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || $('board')).appendChild(e); return e; }

  /* 中文记谱（炮二平五）：bd = 走子前的棋盘 */
  function notate(m, bd) {
    const from = m.slice(0, 2), to = m.slice(2, 4), ch = bd[from]; if (!ch) return m;
    const red = ch === ch.toUpperCase(), T = ch.toUpperCase(), f0 = from.charCodeAt(0) - 97, r0 = +from[1], f1 = to.charCodeAt(0) - 97, r1 = +to[1];
    const col = (f) => (red ? 9 - f : f + 1), ns = (n) => (red ? NUM[n] : String(n)), nm = CH[ch];
    let head = nm + ns(col(f0));
    const same = Object.keys(bd).filter((s) => bd[s] === ch && s !== from && s.charCodeAt(0) - 97 === f0);
    if (same.length === 1) { const ro = +same[0][1], front = red ? r0 > ro : r0 < ro; head = (front ? '前' : '后') + nm; }
    if (r1 === r0) return head + '平' + ns(col(f1));
    const fwd = red ? r1 > r0 : r1 < r0;
    return head + (fwd ? '进' : '退') + ns('NBA'.includes(T) ? col(f1) : Math.abs(r1 - r0));
  }

  function render() {
    const b = $('board'); b.innerHTML = '';
    const L = (x1, y1, x2, y2, w) => el('line', { x1, y1, x2, y2, stroke: '#5b3a12', 'stroke-width': w || 1.4 });
    for (let r = 0; r < 10; r++) L(M, M + r * C, M + 8 * C, M + r * C);
    for (let f = 0; f < 9; f++) { if (f === 0 || f === 8) L(M + f * C, M, M + f * C, M + 9 * C); else { L(M + f * C, M, M + f * C, M + 4 * C); L(M + f * C, M + 5 * C, M + f * C, M + 9 * C); } }
    for (const y of [0, 7]) { L(M + 3 * C, M + y * C, M + 5 * C, M + (y + 2) * C); L(M + 5 * C, M + y * C, M + 3 * C, M + (y + 2) * C); }
    L(M - 5, M - 5, M + 8 * C + 5, M - 5, 3); L(M - 5, M + 9 * C + 5, M + 8 * C + 5, M + 9 * C + 5, 3); L(M - 5, M - 5, M - 5, M + 9 * C + 5, 3); L(M + 8 * C + 5, M - 5, M + 8 * C + 5, M + 9 * C + 5, 3);
    const t1 = el('text', { x: M + 1.8 * C, y: M + 4.65 * C, 'font-size': 26, fill: '#7a5a2a', 'text-anchor': 'middle', 'font-family': 'serif' }); t1.textContent = '楚　河';
    const t2 = el('text', { x: M + 6.2 * C, y: M + 4.65 * C, 'font-size': 26, fill: '#7a5a2a', 'text-anchor': 'middle', 'font-family': 'serif' }); t2.textContent = '漢　界';
    if (last) for (const s of last) { const p = sq(s), [x, y] = xy(p.f, p.r); el('rect', { x: x - 27, y: y - 27, width: 54, height: 54, fill: 'none', stroke: '#2a8a3a', 'stroke-width': 3, rx: 6 }); }
    if (cand.length && $('arrows').checked) { const mx = Math.max(...cand.map((c) => c.visits || c.prior)); el('defs', {}).innerHTML = '<marker id="ah" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#1565c0"/></marker>';
      cand.slice(0, 3).forEach((c) => { const v = c.visits || c.prior, a = sq(c.move.slice(0, 2)), t = sq(c.move.slice(2, 4)), [x1, y1] = xy(a.f, a.r), [x2, y2] = xy(t.f, t.r); el('line', { x1, y1, x2, y2, stroke: '#1565c0', 'stroke-width': 1 + 6 * v / mx, opacity: 0.25 + 0.5 * v / mx, 'marker-end': 'url(#ah)' }); }); }
    for (const s in board) {
      const p = sq(s), [x, y] = xy(p.f, p.r), ch = board[s], red = ch === ch.toUpperCase();
      el('circle', { cx: x, cy: y, r: 24, fill: '#fbeccb', stroke: red ? '#c62828' : '#111', 'stroke-width': s === sel ? 5 : 2.5 });
      el('circle', { cx: x, cy: y, r: 20, fill: 'none', stroke: red ? '#c62828' : '#111', 'stroke-width': 1 });
      const t = el('text', { x, y: y + 9, 'font-size': 26, 'text-anchor': 'middle', fill: red ? '#c62828' : '#111', 'font-weight': 700, 'font-family': 'serif' }); t.textContent = CH[ch];
      if (check && ((turn === 'red' && ch === 'K') || (turn === 'black' && ch === 'k'))) el('circle', { cx: x, cy: y, r: 29, fill: 'none', stroke: '#e65100', 'stroke-width': 3, 'stroke-dasharray': '5 4' });
    }
    if (dbgOn() && dbgSel && dbgMap) {                                 // debug view: what the legality head thinks the selected piece can do vs what the rules say
      const sp = sq(dbgSel), list = dbgMap.map[sp.r * 9 + sp.f] || [], truth = new Set(dbgMap.legal.filter((m) => m.startsWith(dbgSel)).map((m) => m.slice(2, 4))), pm = {};
      list.forEach(([t, p]) => { pm[name(t % 9, Math.floor(t / 9))] = p; }); let fp = 0, fn = 0, pos = 0;
      const cells = new Set(Object.keys(pm).filter((k) => pm[k] >= 0.02).concat([...truth]));
      { const [x, y] = xy(sp.f, sp.r); el('circle', { cx: x, cy: y, r: 30, fill: 'none', stroke: '#f9a825', 'stroke-width': 4 }); }
      const isLeg = dbgMap.kind === 'legality', isMasked = dbgMap.kind === 'policy', hi = isLeg ? 0.5 : 0.1; let legalMass = 0, illegalMass = 0;
      Object.keys(pm).forEach((k) => { if (truth.has(k)) legalMass += pm[k]; else illegalMass += pm[k]; });
      const rankOf = new Map([...cells].sort((a, b) => (pm[b] || 0) - (pm[a] || 0)).map((k, i) => [k, i + 1]));          // 1 = the target the model likes most
      cells.forEach((k) => { const p = pm[k] || 0, c = sq(k), [x, y] = xy(c.f, c.r), isT = truth.has(k); if (p > hi) pos++; if (p > hi && !isT) fp++; if (p <= hi && isT) fn++;
        el('circle', { cx: x, cy: y, r: 21, fill: probColor(isLeg || isMasked ? p : Math.min(1, p * 1.5), 1), opacity: 0.8 }); const t = el('text', { x, y: y - 3, 'font-size': 15, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, stroke: '#000', 'stroke-width': 0.7 }); t.textContent = rankOf.get(k); el('rect', { x: x - 16, y: y + 2, width: 32, height: 14, rx: 7, fill: '#fff3e0', stroke: '#e65100', 'stroke-width': 1.2 }); const t2 = el('text', { x, y: y + 12.5, 'font-size': 11, 'text-anchor': 'middle', fill: '#bf360c', 'font-weight': 700 }); t2.textContent = p.toFixed(2);
        if (isT && !isMasked) el('circle', { cx: x, cy: y, r: 25, fill: 'none', stroke: p > hi ? '#000' : '#1565c0', 'stroke-width': 3, 'stroke-dasharray': p > hi ? '' : '5 3' });
        if (p > hi && !isT) { el('line', { x1: x - 14, y1: y - 14, x2: x + 14, y2: y + 14, stroke: '#000', 'stroke-width': 3.5 }); el('line', { x1: x - 14, y1: y + 14, x2: x + 14, y2: y - 14, stroke: '#000', 'stroke-width': 3.5 }); } });
      $('dbginfo').textContent = isLeg
        ? `${CH[board[dbgSel]]}：合法头认为 ${pos} 个落点可走（p>0.5），规则判定 ${truth.size} 个；多报 ${fp}、漏报 ${fn}。圆里：上面的白色数字 = 名次（模型认为越可能越靠前，1 最高），下面橙色框里 = 合法头给的概率（两位小数），越红越高；黑圈 = 规则判定合法；✕ = 模型以为能走但违规；蓝虚线圈 = 合法但模型漏掉。`
        : isMasked
        ? `${CH[board[dbgSel]]}：在规则合法的 ${truth.size} 个落点里，模型觉得哪个更好（只在合法落点里做 softmax、加起来 100%，和训练时的做法一致）。圆里：上面的白色数字 = 名次（1 = 最好），下面橙色框里 = 概率（两位小数），越红越高。这个视图只比较合法落点，看不出模型懂不懂规则。`
        : `${CH[board[dbgSel]]}：不屏蔽非法着的原始输出（所有落点加起来 100%）：落在规则合法的落点上共 ${Math.round(legalMass * 100)}%，落在非法落点上共 ${Math.round(illegalMass * 100)}%；规则判定合法的有 ${truth.size} 个。圆里：上面的白色数字 = 名次（1 = 概率最高），下面橙色框里 = 概率（两位小数）；黑圈 = 规则合法；✕ = 概率 >10% 却不合法；蓝虚线圈 = 合法但概率 ≤10%。注意：方式 1、3、4 训练时只在合法着里算，非法着没被教过，所以这里分布不准是预期的，只有方式 2 的合法头学了规则。`;
    } else if (dbgOn() && $('dbginfo').textContent.startsWith('调试不可用') && !dbgMap) { /* keep the message */ } else if (dbgOn()) $('dbginfo').textContent = dbgMap ? '调试模式：点一颗轮到走的一方的棋子，看模型认为它能走到哪里。' : (window.XQ_API ? '调试模式：模型计算中…（第一次选这个方式要先下载模型，请稍等）' : '调试模式：模型计算中…'); else $('dbginfo').textContent = '';
    if (sel) for (const m of legal) if (m.startsWith(sel)) { const p = sq(m.slice(2)), [x, y] = xy(p.f, p.r); el('circle', { cx: x, cy: y, r: board[m.slice(2)] ? 27 : 8, fill: board[m.slice(2)] ? 'none' : '#2a8a3a', stroke: '#2a8a3a', 'stroke-width': 3, opacity: 0.8 }); }
    for (let f = 0; f < 9; f++) for (let r = 0; r < 10; r++) { const [x, y] = xy(f, r), s = name(f, r); const h = el('rect', { x: x - 27, y: y - 27, width: 54, height: 54, fill: 'transparent' }); h.addEventListener('pointerdown', (e) => { e.preventDefault(); click(s); }); }
    renderMini();
  }

  /* 小棋盘：网络（不搜索）最推荐的前 10 个着法，编号 1..10 标在落点上（颜色绿→红 = 概率低→高），列表在下面。来源可选：给我的建议（当前局面）/ AI 的选择（它走上一步时的局面） */
  const probColor = (p, pmax) => `hsl(${Math.round(120 * (1 - Math.sqrt(p / pmax)))},72%,40%)`;
  function miniBoard(g, bd) {                                       // small board (lines + piece glyphs) into the svg g; returns the coordinate functions
    const cs = 30, ox = 20, oy = 20, X = (f) => ox + (human === 'red' ? f : 8 - f) * cs, Y = (r) => oy + (human === 'red' ? 9 - r : r) * cs;
    const L = (x1, y1, x2, y2) => el('line', { x1, y1, x2, y2, stroke: '#9a9a9a', 'stroke-width': 0.8 }, g);
    for (let r = 0; r < 10; r++) L(X(0), Y(r), X(8), Y(r));
    for (let f = 0; f < 9; f++) { if (f === 0 || f === 8) L(X(f), Y(0), X(f), Y(9)); else { L(X(f), Y(0), X(f), Y(4)); L(X(f), Y(5), X(f), Y(9)); } }
    for (const s in bd) { const p = sq(s), ch = bd[s], red = ch === ch.toUpperCase(), t = el('text', { x: X(p.f), y: Y(p.r) + 4.5, 'font-size': 13, 'text-anchor': 'middle', fill: red ? '#b71c1c' : '#111', 'font-family': 'serif', 'font-weight': 700, opacity: 0.8 }, g); t.textContent = CH[ch]; }
    return { X, Y };
  }
  const twoStep = () => !!($('model') && ['split_indep', 'split_cond'].includes($('model').value));       // 方式 3 / 4: first choose the piece, then its target
  const pct = (p) => (p >= 0.095 ? Math.round(p * 100) : (p * 100).toFixed(1)) + '%';
  function renderMini() {
    const g = $('mini'); g.innerHTML = ''; const ai = $('heatsrc').value === 'ai' && polAI; $('vguide').classList.toggle('on', !ai); $('vai').classList.toggle('on', !!ai); $('vai').disabled = !polAI;
    const P = ai ? polAI.pol : pol, bd = ai ? polAI.before : board, chosen = ai ? polAI.chosen : null, two = twoStep(), { X, Y } = miniBoard(g, bd);
    $('mini2wrap').style.display = two ? '' : 'none';
    if (!P) { $('toplist').innerHTML = ''; $('polwho').textContent = ''; renderTop1(null, bd, chosen); return; }
    if (!two) {                                                   // 方式 1 / 2: one choice of a whole move -> the top-10 moves as curved arrows (start -> target), labelled "rank: probability"
      const top = P.all.slice(0, 10), pmax = top[0][1], arcs = [];
      top.forEach(([m, p], i) => { const a = sq(m.slice(0, 2)), t = sq(m.slice(2, 4)), x1 = X(a.f), y1 = Y(a.r), x2 = X(t.f), y2 = Y(t.r), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        const bend = (i % 2 ? -1 : 1) * (Math.max(12, len * 0.28) + Math.floor(i / 2) * 4), cx = (x1 + x2) / 2 + nx * bend, cy = (y1 + y2) / 2 + ny * bend; arcs.push({ m, p, i, x1, y1, x2, y2, cx, cy, col: probColor(p, pmax), pick: m === chosen }); });
      for (const o of arcs.slice().reverse()) {                    // less likely first, so the top ones stay on top
        el('path', { d: `M${o.x1},${o.y1} Q${o.cx},${o.cy} ${o.x2},${o.y2}`, fill: 'none', stroke: o.pick ? '#000' : o.col, 'stroke-width': o.pick ? 3.4 : (o.i < 3 ? 2.6 : 1.7), opacity: o.pick ? 0.95 : 0.85 }, g);
        const tx = o.x2 - o.cx, ty = o.y2 - o.cy, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, bx = o.x2 - ux * 9, by = o.y2 - uy * 9;       // arrow head along the tangent at the end
        el('polygon', { points: `${o.x2},${o.y2} ${bx - uy * 4.5},${by + ux * 4.5} ${bx + uy * 4.5},${by - ux * 4.5}`, fill: o.pick ? '#000' : o.col }, g); }
      for (const o of arcs.slice().reverse()) { const mx = 0.25 * o.x1 + 0.5 * o.cx + 0.25 * o.x2, my = 0.25 * o.y1 + 0.5 * o.cy + 0.25 * o.y2, label = `${o.i + 1}: ${pct(o.p)}`, w = 7 * label.length + 6;
        el('rect', { x: mx - w / 2, y: my - 7, width: w, height: 14, rx: 7, fill: '#fff', stroke: o.pick ? '#000' : o.col, 'stroke-width': o.pick ? 2 : 1.3, opacity: 0.96 }, g);
        const t = el('text', { x: mx, y: my + 3.5, 'font-size': 10, 'text-anchor': 'middle', fill: '#222', 'font-weight': 700 }, g); t.textContent = label; }
      const rank = chosen ? P.all.findIndex(([m]) => m === chosen) + 1 : 0;
      $('toplist').innerHTML = top.map(([m, p], i) => `<div class="it${m === chosen ? ' pick' : ''}"><b style="background:${probColor(p, pmax)}">${i + 1}</b><span>${notate(m, bd)}${m === chosen ? ' ★' : ''}</span><i>${(p * 100).toFixed(1)}%</i></div>`).join('') + (chosen && rank > 10 ? `<div class="it pick" style="grid-column:1/3"><b style="background:#000">★</b><span>AI 选了 ${notate(chosen, bd)}（网络排第 ${rank}）</span><i>${(P.all[rank - 1][1] * 100).toFixed(1)}%</i></div>` : '');
      $('polwho').textContent = ai ? `AI（${polAI.mover === 'red' ? '红' : '黑'}）走这步时的局面：弧线 = 网络推荐的前 10 个着法（箭头指向终点，弧线上：名次: 概率）；黑色粗线 ★ = AI 实际选的。` : `${P.turn === 'red' ? '红' : '黑'}方的建议：弧线 = 网络推荐的前 10 个着法（箭头指向终点，弧线上：名次: 概率），越红越推荐。网络对局面的评分 ${P.value >= 0 ? '+' : ''}${P.value.toFixed(2)}（对走子方）。`;
      renderTop1(null, bd, chosen); return;
    }
    const by = {}; P.all.forEach(([m, p]) => { const s = m.slice(0, 2); by[s] = (by[s] || 0) + p; }); const arr = Object.entries(by).sort((a, b) => b[1] - a[1]), pmax = arr[0][1], chosenSrc = chosen ? chosen.slice(0, 2) : null;      // 方式 3 / 4, first board: which piece to move
    arr.map((x, i) => [x, i]).reverse().forEach(([[s, p], i]) => { const c = sq(s), x = X(c.f), y = Y(c.r), pick = s === chosenSrc; el('circle', { cx: x, cy: y, r: 13, fill: probColor(p, pmax), stroke: pick ? '#000' : '#fff', 'stroke-width': pick ? 3 : 1.4, opacity: 0.95 }, g);
      const gl = el('text', { x, y: y + 5, 'font-size': 14, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'serif', 'font-weight': 700, stroke: '#000', 'stroke-width': 0.4 }, g); gl.textContent = CH[bd[s]];       // the piece stays readable, the rank is a small badge at the corner
      el('circle', { cx: x + 10, cy: y - 10, r: 7, fill: '#fff', stroke: '#455a64', 'stroke-width': 1 }, g); const t = el('text', { x: x + 10, y: y - 6.8, 'font-size': i >= 9 ? 8 : 9.5, 'text-anchor': 'middle', fill: '#222', 'font-weight': 700 }, g); t.textContent = i + 1; });
    $('toplist').innerHTML = arr.slice(0, 10).map(([s, p], i) => `<div class="it${s === chosenSrc ? ' pick' : ''}"><b style="background:${probColor(p, pmax)}">${i + 1}</b><span>${CH[bd[s]]} ${s}${s === chosenSrc ? ' ★' : ''}</span><i>${(p * 100).toFixed(1)}%</i></div>`).join('');
    $('polwho').textContent = ai ? `AI（${polAI.mover === 'red' ? '红' : '黑'}）走这步时的局面：第一个小棋盘 = 该动哪颗子（右上角小圆里 = 名次，越红概率越高；黑圈 ★ = AI 实际动的子）；第二个 = 选了 top-1 起点之后，终点怎么选。` : `${P.turn === 'red' ? '红' : '黑'}方的建议：第一个小棋盘 = 该动哪颗子（右上角小圆里 = 名次，越红概率越高）；第二个 = 选了 top-1 起点之后，在它的合法落点里终点怎么选。网络对局面的评分 ${P.value >= 0 ? '+' : ''}${P.value.toFixed(2)}（对走子方）。`;
    renderTop1(P, bd, chosen);
  }
  /* 方式 3 / 4, second small board: IF the top-1 start piece is chosen, how does the network pick the target?  P(target | start) = joint(start, target) / P(start) over the legal targets */
  function renderTop1(P, bd, chosen) {
    const g = $('mini2'), list = $('top1list'), note = $('top1note'); g.innerHTML = ''; list.innerHTML = ''; note.textContent = '';
    if (!P || !P.all.length) return;
    const src = P.all[0][0].slice(0, 2), same = P.all.filter(([m]) => m.startsWith(src)), tot = same.reduce((s, [, p]) => s + p, 0), cond = same.map(([m, p]) => [m, p / tot]).sort((a, b) => b[1] - a[1]);
    const { X, Y } = miniBoard(g, bd), sp = sq(src); el('circle', { cx: X(sp.f), cy: Y(sp.r), r: 13, fill: 'none', stroke: '#f9a825', 'stroke-width': 3 }, g);
    cond.slice().reverse().forEach(([m, p]) => { const i = cond.findIndex((c) => c[0] === m), t = sq(m.slice(2, 4)); el('circle', { cx: X(t.f), cy: Y(t.r), r: 9.5, fill: probColor(p, 1), stroke: m === chosen ? '#000' : '#fff', 'stroke-width': m === chosen ? 2.6 : 1.2, opacity: 0.95 }, g);
      const tx = el('text', { x: X(t.f), y: Y(t.r) + 3.5, 'font-size': i >= 9 ? 8 : 10, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700 }, g); tx.textContent = i + 1; });
    note.textContent = `选了 top-1 的起点（${CH[bd[src]]} ${src}，它占 ${(tot * 100).toFixed(0)}%）之后：在它的 ${same.length} 个合法落点里，终点怎么选（黄圈 = 起点，编号 = 名次，只在合法落点里比、加起来 100%）。`;
    list.innerHTML = cond.slice(0, 8).map(([m, p], i) => `<div class="it${m === chosen ? ' pick' : ''}"><b style="background:${probColor(p, 1)}">${i + 1}</b><span>${notate(m, bd)}${m === chosen ? ' ★' : ''}</span><i>${(p * 100).toFixed(1)}%</i></div>`).join('');
  }
  async function refreshPolicy() {
    refreshDbg(); const my = ++polBusy; if (status[0]) { pol = null; renderMini(); return; }
    try { const r = await api('/api/policy', { moves }); if (my === polBusy) { pol = r; renderMini(); } } catch (e) {}
  }

  const dbgOn = () => !!(window.XQ_DEBUG_OK && $('dbg') && $('dbg').checked);
  const dbgKind = () => { const v = $('dbgkind') ? $('dbgkind').value : 'policy'; return v === 'legality' && !($('model') && $('model').value === 'new') ? 'policy' : v; };
  async function refreshDbg() {
    if (!dbgOn()) { dbgMap = null; dbgSel = null; return; } const my = ++dbgBusy; dbgMap = null; render(); if (status[0]) return;
    try { const r = await api('/api/legalmap', { moves, kind: dbgKind() }); if (my === dbgBusy) { dbgMap = r; if (dbgSel && !(r.map[sq(dbgSel).r * 9 + sq(dbgSel).f])) dbgSel = null; render(); } } catch (e) { dbgSel = null; $('dbginfo').textContent = '调试不可用：' + e.message; }
  }
  function msg(t) { $('msg').textContent = t; }
  function setStatus(st) {
    legal = st.legal || legal; turn = st.turn || turn; check = st.check; status = st.status || [null, '']; const zh = { red: '红方', black: '黑方' };
    if (status[0]) { const why = { checkmate: '将死', 'stalemate (no legal move)': '困毙（无子可动）' }[status[1]] || status[1]; msg(status[0] === 'draw' ? `和棋：${status[1]}` : `${zh[status[0]]}获胜（${why}）`); return; }
    msg(thinking ? 'AI 思考中…' : (turn === human && check ? '你被将军了！' : ''));          // nothing to say on a normal turn
  }
  function apply(m) { const f = m.slice(0, 2), t = m.slice(2, 4); board[t] = board[f]; delete board[f]; moves.push(m); last = [f, t]; sel = null; }
  async function engineMove() {
    if (status[0] || turn === human) return; thinking = true; const my = ++busy; setStatus({ status, turn, check }); render(); btns();
    const lv = $('lvl').value, req = lv.startsWith('m:') ? { mode: 'mcts', sims: +lv.slice(2) } : { mode: lv };
    try {
      const r = await api('/api/engine', Object.assign({ moves, variety: 4 }, req)); if (my !== busy) return;
      const before = Object.assign({}, board), nt = (m) => notate(m, before), movesBefore = moves.slice(), mover = turn; apply(r.move); cand = r.stats || []; thinking = false;
      const ev = r.eval, p = (ev + 1) / 2 * 100;
      $('ev').textContent = `${ev >= 0 ? '+' : ''}${ev.toFixed(2)}（AI 胜算约 ${p.toFixed(0)}%）` + (r.sims ? `，${r.sims} 次模拟，` : '，不搜索，') + `${r.seconds.toFixed(1)} 秒` + (r.skipped && r.skipped.length ? `；规则规避跳过了 ${r.skipped.map((s) => nt(s.move) + '（' + (s.why === 'allows mate in one' ? '送一步杀' : s.why) + '）').join('、')}` : '');
      $('evb').style.width = p + '%';
      setStatus(r);
      api('/api/policy', { moves: movesBefore }).then((p) => { polAI = { pol: p, chosen: r.move, before, mover, sims: r.sims, stats: r.stats }; renderMini(); }).catch(() => {});       // the position the AI decided in (for the 'AI's choice' heat map)
    } catch (e) { thinking = false; msg('出错：' + e.message); }
    render(); btns(); refreshPolicy();
  }
  async function click(s) {
    if (dbgOn()) { if (status[0] || !dbgMap) return; const ch = board[s], side = turn === 'red'; dbgSel = ch && ((ch === ch.toUpperCase()) === side) ? s : null; render(); return; }
    if (thinking || status[0] || turn !== human) return; const ch = board[s], mine = ch && ((ch === ch.toUpperCase()) === (human === 'red'));
    if (sel && legal.includes(sel + s)) { apply(sel + s); cand = []; render(); const st = await api('/api/state', { moves }); setStatus(st); render(); refreshPolicy(); engineMove(); return; }
    if (mine && legal.some((m) => m.startsWith(s))) sel = s; else sel = null; render();
  }
  function btns() { $('undo').disabled = thinking || moves.length === 0; }
  async function newGame() {
    busy++; thinking = false; human = $('side').value; setup(); moves = []; last = null; sel = null; cand = []; pol = null; polAI = null; $('ev').textContent = '—'; $('evb').style.width = '50%';
    const st = await api('/api/state', { moves }); setStatus(st); render(); btns(); refreshPolicy(); engineMove();
  }
  async function undo() {
    if (thinking || !moves.length) return; const keep = moves.slice(0, moves.length - (turn === human && moves.length >= 2 ? 2 : 1)); busy++;
    setup(); moves = []; last = null; for (const m of keep) apply(m); if (!keep.length) last = null; cand = []; polAI = null; const st = await api('/api/state', { moves }); setStatus(st); render(); btns(); refreshPolicy(); if (turn !== human) engineMove();
  }
  $('new').onclick = newGame; $('undo').onclick = undo; $('side').onchange = newGame; $('arrows').onchange = render; const syncKind = (reset) => { const has = $('model').value === 'new'; $('dbgbox').style.display = has ? '' : 'none'; if (!has && $('dbg').checked) { $('dbg').checked = false; dbgMap = null; dbgSel = null; render(); } if (has && reset) $('dbgkind').value = 'legality'; }; if ($('model')) $('model').onchange = () => { polAI = null; pol = null; syncKind(true); renderMini(); refreshPolicy(); refreshDbg(); }; if ($('dbgkind')) $('dbgkind').onchange = () => { refreshDbg(); }; if ($('dbg')) $('dbg').onchange = () => { dbgSel = null; refreshDbg(); render(); }; $('heatsrc').onchange = renderMini; $('vguide').onclick = () => { $('heatsrc').value = 'guide'; renderMini(); }; $('vai').onclick = () => { $('heatsrc').value = 'ai'; renderMini(); };
  window.xqDebug = { click, state: () => ({ moves: moves.slice(), turn, status, thinking, human, sel, nlegal: legal.length, pol: pol && pol.all.length, ai: polAI && polAI.chosen, dbgSel, dbgN: dbgMap && dbgSel ? (dbgMap.map[sq(dbgSel).r * 9 + sq(dbgSel).f] || []).length : -1, notes: pol ? pol.all.slice(0, 3).map((x) => notate(x[0], board)) : [] }), newGame, undo, notate: (m) => notate(m, board) };
  (async () => { if ($('model')) { try { const r = await api('/api/models', {}); const names = { old: '方式 1（2102 项着法表）', new: '方式 2（52×90 格子级，有合法头）', split_indep: '方式 3（起点、终点独立）', split_cond: '方式 4（终点依赖起点，指针式打分）' }; const ORDER = ['old', 'new', 'split_indep', 'split_cond']; r.models.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)); $('model').innerHTML = r.models.map((m) => `<option value="${m}">${names[m] || m}</option>`).join(''); $('model').value = r.default; syncKind(); } catch (e) {} } newGame(); })();
})();
