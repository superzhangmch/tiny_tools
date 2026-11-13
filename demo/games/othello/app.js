(function () {
  'use strict';
  const $ = (id) => document.getElementById(id), SV = 'http://www.w3.org/2000/svg', C = 44, M = 24, api = window.OTH_API;
  let setup = false, extra = new Set(), board, turn, human = 1, last = null, over = false, thinking = false, hist = [], busy = 0, anaBusy = 0, ana = null, aiAna = null, src = 'me', illegalTries = 0, aiMoveCount = 0;
  const el = (tag, attrs, parent) => { const e = document.createElementNS(SV, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || $('board')).appendChild(e); return e; };
  const xy = (s) => [M + (s & 7) * C + C / 2, M + (s >> 3) * C + C / 2];
  const heat = (t) => `hsl(${Math.round(120 * (1 - Math.max(0, Math.min(1, t))))},72%,38%)`;           // red = high, green = low
  const metric = () => ($('metric').value);
  function view() {                                            // what to show: the position + analysis of the chosen perspective (me: now; ai: where the AI last decided)
    if (src === 'ai' && aiAna) return { b: aiAna.board, p: aiAna.p, a: aiAna.ana, chosen: aiAna.chosen, ai: true };
    return { b: board, p: turn, a: ana && ana.key === OTH.keyOf(board, turn) ? ana : null, chosen: null, ai: false };
  }
  function render() {                                          // main board: always the real position, nothing else (last move + my legal squares)
    const g = $('board'); g.innerHTML = ''; el('rect', { x: 0, y: 0, width: 400, height: 400, rx: 10, fill: '#2e7d32' });
    for (let i = 0; i <= 8; i++) { el('line', { x1: M + i * C, y1: M, x2: M + i * C, y2: M + 8 * C, stroke: '#1b5e20', 'stroke-width': 1.5 }); el('line', { x1: M, y1: M + i * C, x2: M + 8 * C, y2: M + i * C, stroke: '#1b5e20', 'stroke-width': 1.5 }); }
    for (let i = 0; i < 8; i++) { const a = el('text', { x: M + i * C + C / 2, y: 15, 'text-anchor': 'middle', 'font-size': 11, fill: '#c8e6c9' }); a.textContent = 'abcdefgh'[i]; const b = el('text', { x: 10, y: M + i * C + C / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#c8e6c9' }); b.textContent = i + 1; }
    for (let s = 0; s < 64; s++) if (board[s]) { const [x, y] = xy(s); el('circle', { cx: x, cy: y, r: 18, fill: board[s] === 1 ? '#111' : '#fafafa', stroke: board[s] === 1 ? '#000' : '#999', 'stroke-width': 1.5 }); }
    if (last !== null) { const [x, y] = xy(last); el('circle', { cx: x, cy: y, r: 4, fill: '#e53935' }); }
    if (!setup && !over && !thinking && turn === human) for (const s of OTH.legalMoves(board, turn)) { const [x, y] = xy(s); el('circle', { cx: x, cy: y, r: 5, fill: '#a5d6a7', opacity: 0.9 }); }
    for (let s = 0; s < 64; s++) { const [x, y] = xy(s), r = el('rect', { x: x - C / 2, y: y - C / 2, width: C, height: C, fill: 'transparent' }); r.addEventListener('pointerdown', (e) => { e.preventDefault(); click(s); }); }
    const [k, w] = OTH.counts(board); $('score').textContent = `黑 ${k}　白 ${w}`;
    const V = view(); $('vme').classList.toggle('on', !V.ai); $('vai').classList.toggle('on', V.ai); $('vai').disabled = !aiAna; renderMini(V);
  }
  /* small white board: the candidate moves of the chosen perspective, numbered by the chosen metric (1 = best), colour red = high -> green = low; list underneath */
  const MC = 24, MM = 14, mxy = (s) => [MM + (s & 7) * MC + MC / 2, MM + (s >> 3) * MC + MC / 2];
  function renderMini(V) {
    const g = $('mini'); g.innerHTML = ''; const L = $('toplist'); L.innerHTML = ''; $('info').textContent = '';
    for (let i = 0; i <= 8; i++) { el('line', { x1: MM + i * MC, y1: MM, x2: MM + i * MC, y2: MM + 8 * MC, stroke: '#bbb', 'stroke-width': 1 }, g); el('line', { x1: MM, y1: MM + i * MC, x2: MM + 8 * MC, y2: MM + i * MC, stroke: '#bbb', 'stroke-width': 1 }, g); }
    for (let i = 0; i < 8; i++) { const a = el('text', { x: MM + i * MC + MC / 2, y: 10, 'text-anchor': 'middle', 'font-size': 8, fill: '#888' }, g); a.textContent = 'abcdefgh'[i]; const b = el('text', { x: 6, y: MM + i * MC + MC / 2 + 3, 'text-anchor': 'middle', 'font-size': 8, fill: '#888' }, g); b.textContent = i + 1; }
    for (let s = 0; s < 64; s++) if (V.b[s]) { const [x, y] = mxy(s); el('circle', { cx: x, cy: y, r: 8.5, fill: V.b[s] === 1 ? '#222' : '#fff', stroke: '#555', 'stroke-width': 1 }, g); }
    const a = V.a; if (!a) return;
    const legal = OTH.legalMoves(V.b, V.p), m = metric(), usePol = m === 'policy' && a.policy, val = (s) => (usePol ? a.policy[s] : a.after[s]);
    const order = legal.slice().sort((x, y) => val(y) - val(x)), hi = val(order[0]), lo = val(order[order.length - 1]);
    const col = (s) => heat(usePol ? Math.sqrt(Math.max(0, val(s)) / Math.max(hi, 1e-9)) : hi > lo ? (val(s) - lo) / (hi - lo) : 0.5);
    if (usePol) for (let s = 0; s < 64; s++) if (!legal.includes(s) && a.policy[s] >= 0.05) { const [x, y] = mxy(s); el('line', { x1: x - 8, y1: y - 8, x2: x + 8, y2: y + 8, stroke: '#000', 'stroke-width': 3 }, g); el('line', { x1: x - 8, y1: y + 8, x2: x + 8, y2: y - 8, stroke: '#000', 'stroke-width': 3 }, g); }
    $('dbgnote').textContent = '';
    if ($('dbg').checked && a.legalHead) { let ok = 0, fp = 0, fn = 0; for (let s = 0; s < 64; s++) { if (V.b[s]) continue; const p = a.legalHead[s], t = legal.includes(s), [x, y] = mxy(s), box = (c, d) => el('rect', { x: x - 11, y: y - 11, width: 22, height: 22, fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-dasharray': d }, g); if (p > 0.5 && t) { ok++; box('#2e7d32', ''); } else if (p > 0.5) { fp++; box('#d50000', '3 2'); } else if (t) { fn++; box('#1565c0', '3 2'); } }
      $('dbgnote').textContent = fp + fn === 0 ? `合法头和规则完全一致（${ok} 个合法格，绿框）` : `合法头：对 ${ok}，多报 ${fp}（红虚框），漏报 ${fn}（蓝虚框）`; $('info').textContent = '合法头 vs 规则：绿框 = 两边都认为合法；红虚框 = 网络多报；蓝虚框 = 网络漏报。'; }
    order.forEach((s, i) => { const [x, y] = mxy(s), pick = s === V.chosen; el('rect', { x: x - MC / 2 + 1, y: y - MC / 2 + 1, width: MC - 2, height: MC - 2, rx: 2, fill: col(s), stroke: pick ? '#000' : 'none', 'stroke-width': pick ? 2.5 : 0 }, g); const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#fff' }, g); t.textContent = i + 1; });                 // filled cell, number inside: nothing that looks like a disc
    const pct = (s) => (a.policy ? (a.policy[s] * 100).toFixed(1) + '%' : ''), dsc = (s) => (a.after[s] >= 0 ? '+' : '') + a.after[s].toFixed(1);
    L.innerHTML = order.slice(0, 12).map((s, i) => `<div class="it${s === V.chosen ? ' pick' : ''}"><b style="background:${col(s)}">${i + 1}</b><span>${OTH.name(s)}${s === V.chosen ? ' ★' : ''}</span><i>${a.policy ? pct(s) + ' · ' : ''}${dsc(s)}</i></div>`).join('');
    const bad = usePol ? Array.from(a.policy).map((p, s) => [p, s]).filter(([p, s]) => !legal.includes(s)).sort((x, y) => y[0] - x[0])[0] : null, rank = V.chosen !== null && V.chosen !== undefined ? order.indexOf(V.chosen) + 1 : 0;
    if (!$('info').textContent) $('info').textContent = V.ai ? `AI（${V.p === 1 ? '黑' : '白'}）走这步时的局面（小棋盘）：编号 = 按“${usePol ? '网络概率' : '走完后评分'}”排序；黑框 ★ = 它实际选的${rank ? `（排第 ${rank}）` : ''}。列表“概率 · 评分”：评分 = 走完后网络估计的子差（对走子方）。` : `${V.p === 1 ? '黑' : '白'}方的建议（小棋盘）：编号 = 按“${usePol ? '网络概率' : '走完后评分'}”排序，红高绿低；列表“概率 · 评分”。${usePol && bad && bad[0] >= 0.05 ? `纯 CNN 最想下的非法格：${OTH.name(bad[1])}（${(bad[0] * 100).toFixed(0)}%，小棋盘上的 ✕）。` : ''}`;
  }
  const msg = (t) => { $('msg').textContent = t; };
  function snapshot() { hist.push({ board: new Int8Array(board), turn, last, over, illegalTries, aiMoveCount }); }
  function status() {
    if (over) { const [k, w] = OTH.counts(board); msg(k === w ? `平局 ${k}:${w}` : `${k > w ? '黑' : '白'}方胜 ${Math.max(k, w)}:${Math.min(k, w)}`); return; }
    msg(thinking ? 'AI 思考中…' : '');
  }
  function afterMove() {                                       // who plays next: pass / game over
    if (!OTH.legalMoves(board, turn).length) { if (!OTH.legalMoves(board, -turn).length) over = true; else { const who = turn === 1 ? '黑' : '白'; turn = -turn; msg(`${who}方无子可下，跳过`); } }
  }
  async function analyse(b, p, after) {
    const key = OTH.keyOf(b, p); if (over) { ana = null; return null; }
    try { const r = await api('analyze', { model: $('model').value, board: Array.from(b), p, after: true }); return Object.assign(r, { key }); } catch (e) { $('info').textContent = '分析不可用：' + e.message; return null; }
  }
  async function refreshAna() { const my = ++anaBusy, r = await analyse(board, turn); if (my === anaBusy) { ana = r; render(); } }
  async function aiMove() {
    if (over || thinking || turn === human) return; thinking = true; const my = ++busy; status(); render();
    const m = $('mode').value, ai = turn, before = new Int8Array(board), req = { board: Array.from(board), p: turn, ply: hist.length, variety: 4, mode: m[0] === 's' ? 'search' : m, depth: m[0] === 's' ? +m.slice(1) : 0, exact: $('exact').checked };
    try {
      const r = await api('engine', Object.assign({ model: $('model').value }, req)); if (my !== busy) return; thinking = false; aiMoveCount++;
      if (r.pass) { turn = -turn; render(); status(); return; }
      if (r.illegal !== null && r.illegal !== undefined) { illegalTries++; msg(`纯 CNN 想下 ${OTH.name(r.illegal)}，但那是非法的（已改选 ${OTH.name(r.move)}）`); } else msg('');
      snapshot(); board = OTH.play(board, r.move, turn); last = r.move; turn = -turn; afterMove();
      const k = r.value * (ai === 1 ? 1 : -1); $('ev').textContent = (isFinite(k) ? `AI 估计：${k >= 0 ? '黑' : '白'} ${k >= 0 ? '+' : ''}${k.toFixed(1)} 子` : '') + (r.info ? `　${r.info}，${r.seconds.toFixed(1)} 秒${r.exact ? '（残局精确求解）' : ''}` : `　${r.seconds.toFixed(2)} 秒`) + (m === 'raw' ? `　非法尝试 ${illegalTries}/${aiMoveCount}` : '');
      $('evb').style.width = Math.max(0, Math.min(100, 50 + (isFinite(k) ? k : 0) * 50 / 32)) + '%'; if (!$('msg').textContent) status(); render(); btns(); refreshAna(); aiMove();
      analyse(before, ai).then((a) => { if (a) { aiAna = { board: before, p: ai, ana: a, chosen: r.move }; render(); } });          // the position the AI decided in (for the 对方 view)
    } catch (e) { thinking = false; msg('出错：' + e.message); render(); }
  }
  function click(s) {
    if (setup) {                                               // handicap set-up: put extra discs of my colour on empty squares (click again to take one back)
      if (extra.has(s)) { extra.delete(s); board[s] = 0; } else if (!board[s] && extra.size < 12) { extra.add(s); board[s] = human; } else return;
      msg(`让子：已给自己加 ${extra.size} 颗（最多 12），再点可取消；加完点“开始”`); render(); return;
    }
    if (over || thinking || turn !== human || board[s] || !OTH.flipsAt(board, s, turn).length) return;
    snapshot(); board = OTH.play(board, s, turn); last = s; turn = -turn; msg(''); afterMove(); status(); render(); btns(); refreshAna(); aiMove();
  }
  function btns() { $('undo').disabled = thinking || hist.length === 0; }
  function newGame(noAI) { busy++; thinking = false; setup = false; extra.clear(); $('hcap').textContent = '让子'; human = +$('side').value; board = OTH.start(); turn = 1; last = null; over = false; hist = []; ana = null; aiAna = null; src = 'me'; illegalTries = 0; aiMoveCount = 0; $('ev').textContent = ''; $('evb').style.width = '50%'; msg(''); render(); btns(); refreshAna(); if (noAI !== true) aiMove(); }
  function startHandicap() {
    const n = extra.size; setup = false; $('hcap').textContent = '让子'; hist = []; ana = null; aiAna = null; src = 'me'; turn = 1; last = null; over = false; msg(n ? `让子 ${n} 颗，开始` : '没有加子，正常开始'); afterMove(); render(); btns(); refreshAna(); aiMove();
  }
  function undo() {
    if (thinking || !hist.length) return; busy++;
    let h = hist.pop(); while (hist.length && h.turn !== human) h = hist.pop();
    board = h.board; turn = h.turn; last = h.last; over = h.over; illegalTries = h.illegalTries; aiMoveCount = h.aiMoveCount; aiAna = null; src = 'me'; msg(''); render(); btns(); refreshAna(); if (turn !== human) aiMove();
  }
  const MODES = [['raw', '1 纯 CNN（不加规则）'], ['rules', '2 CNN + 走法规则'], ['s2', '3 搜索 2 层'], ['s3', '3 搜索 3 层'], ['s4', '3 搜索 4 层（慢）']], METRICS = [['policy', '排序/着色：网络概率'], ['value', '排序/着色：走完后评分']];
  function fill(sel, items) { const cur = sel.value; sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); sel.value = items.some((i) => i[0] === cur) ? cur : items[0][0]; }
  async function applyModel() {                              // only the options the chosen model supports are shown: the value-only net has no policy head and no legality head
    const r = await api('ping', { model: $('model').value }), multi = r.multi;
    fill($('mode'), multi ? MODES : MODES.filter((m) => m[0] !== 'raw').map((m) => (m[0] === 'rules' ? ['rules', '1 V 网络 + 规则（落子后评分最高）'] : m)));
    fill($('metric'), multi ? METRICS : METRICS.filter((m) => m[0] === 'value')); $('metric').style.display = multi ? '' : 'none';              // a single choice is not a choice
    $('dbglabel').style.display = multi ? '' : 'none'; $('dbgnote').style.display = multi ? '' : 'none'; if (!multi) { $('dbg').checked = false; $('dbgnote').textContent = ''; }
    modeUi(); ana = null; aiAna = null; src = 'me'; render(); refreshAna();
  }
  $('model').onchange = () => { busy++; thinking = false; applyModel().then(() => { if (turn !== human) aiMove(); }); };
  $('new').onclick = () => newGame(); $('hcap').onclick = () => { if (!setup) { newGame(true); setup = true; $('hcap').textContent = '开始'; msg('让子模式：点空格给自己加子（最多 12 颗），再点一下取消；加完点“开始”'); render(); } else startHandicap(); }; $('undo').onclick = undo; $('side').onchange = () => newGame(); $('vme').onclick = () => { src = 'me'; render(); }; $('vai').onclick = () => { if (aiAna) { src = 'ai'; render(); } };
  function modeUi() { const search = $('mode').value[0] === 's'; $('exlabel').style.display = search ? '' : 'none'; $('exnote').style.display = search ? '' : 'none'; $('exnote').textContent = search && $('exact').checked ? '剩 8 个空位时改用规则精确算完' : ''; }
  $('exact').onchange = modeUi; $('metric').onchange = render; $('dbg').onchange = render; $('mode').onchange = () => { $('ev').textContent = ''; modeUi(); };
  window.othDebug = { click, state: () => ({ setup, extra: extra.size, board: Array.from(board), turn, human, over, thinking, hist: hist.length, illegalTries, aiMoveCount, last, ana: !!ana, aiAna: !!aiAna, src, list: $('toplist').children.length }), newGame, undo, setMode: (m) => { $('mode').value = m; }, setSrc: (s) => { src = s; render(); } };
  (async () => { try { await applyModel(); } catch (e) {} modeUi(); newGame(); })();
})();
