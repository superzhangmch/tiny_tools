/* UI: board with sliding animation, controls, model loading (bundled models or your own .json+.bin), auto-play loop,
 * human play (keys / swipe / tap on the pad) with an optional AI hint. The net runs in worker.js.
 *
 * A move has two phases: SLIDE (tiles move and merge, score counts) and SPAWN (the random new tile, red border).
 * play / human moves do both back to back; the Step button does one phase per click.
 */
(function () {
  'use strict';
  const E = self.G1024, $ = (id) => document.getElementById(id);
  const COLORS = ['#cdc1b4', '#eee4da', '#ede0c8', '#f2b179', '#f59563', '#f67c5f', '#f65e3b', '#edcf72', '#edcc61', '#edc850', '#edc53f', '#edc22e', '#3c3a32', '#3c3a32', '#3c3a32', '#3c3a32'];
  const ARROWS = ['↑', '→', '↓', '←'];
  const boardEl = $('board'), cells = [];
  for (let i = 0; i < 16; i++) { const d = document.createElement('div'); d.className = 'cell'; boardEl.appendChild(d); cells.push(d); }
  const over = document.createElement('div'); over.id = 'over'; boardEl.appendChild(over);
  const ROT = [-90, 0, 90, 180];

  let game = new E.Game(), playing = false, busy = false, anim = false, phase = 'ready' /* 'ready' | 'slid' (moved, new tile not yet spawned) */;
  let epoch = 0, reqId = 0, man = null, ready = false, timer = null, holdTimer = null, holding = false, humanMode = false, hintBest = null, pending = null, lastDir = -1, floats = [], lastMerged = [];
  const stats = { n: 0, sum: 0, best: 0, win: 0 };
  const worker = new Worker('worker.js');

  // ---- drawing ---------------------------------------------------------------------------------
  function paint(el, e) {
    const txt = e ? String(2 ** e) : '';
    el.textContent = txt; el.style.background = COLORS[Math.min(e, 15)]; el.style.color = e <= 2 ? '#776e65' : '#f9f6f2';
    return txt.length === 4 ? ' small' : txt.length > 4 ? ' xs' : '';
  }
  function render(spawnPos, merged) {
    for (let i = 0; i < 16; i++) {
      const el = cells[i], size = paint(el, game.board[i]); el.className = 'cell' + size;
      if (i === spawnPos) { el.classList.add('new', 'pop'); } else if (merged && merged.includes(i)) el.classList.add('merge');
    }
    $('score').textContent = game.score; $('moves').textContent = game.moves; $('maxtile').textContent = game.maxTile();
    over.style.display = game.over ? 'flex' : 'none'; over.textContent = game.over ? `Game over · ${game.maxTile()}` : '';
    $('phase').textContent = phase === 'slid' ? 'Step：已滑动合并，下一次点击出新方块' : 'Step：下一次点击滑动并合并';
  }
  function clearFloats() { floats.forEach((f) => f.remove()); floats = []; }
  /** tiles glide from where they were to where they end up; merging pairs slide onto each other. */
  function animateSlide(trace, ms, done) {
    if (ms <= 0) { done(); return; }
    for (const c of cells) { c.textContent = ''; c.style.background = COLORS[0]; c.className = 'cell'; }
    for (const t of trace) {
      const f = document.createElement('div'), a = cells[t.from], b = cells[t.to];
      f.className = 'cell float' + paint(f, t.v);
      f.style.cssText += `;left:${a.offsetLeft}px;top:${a.offsetTop}px;width:${a.offsetWidth}px;height:${a.offsetHeight}px;transition:transform ${ms}ms ease-out`;
      boardEl.appendChild(f); floats.push(f); f._to = [b.offsetLeft - a.offsetLeft, b.offsetTop - a.offsetTop];
    }
    void boardEl.offsetWidth;
    floats.forEach((f) => { f.style.transform = `translate(${f._to[0]}px,${f._to[1]}px)`; });
    setTimeout(() => { clearFloats(); done(); }, ms + 10);
  }
  const animMs = () => { const sp = +$('speed').value; return sp <= 0 ? 0 : Math.min(220, Math.max(70, sp * 0.8)); };

  function showQ(q, chosen) {
    const rs = man ? man.r_scale : 100, legal = q.filter((x) => x !== null), lo = Math.min(...legal), hi = Math.max(...legal);
    $('qs').innerHTML = q.map((x, a) => {
      if (x === null) return `<div class="q illegal"><span>${ARROWS[a]} ${E.ACTION_NAMES[a]}</span><div class="bar"><i style="width:0"></i></div><span>illegal</span></div>`;
      const w = hi > lo ? 8 + 92 * (x - lo) / (hi - lo) : 100;
      return `<div class="q${a === chosen ? ' best' : ''}"><span>${ARROWS[a]} ${E.ACTION_NAMES[a]}</span><div class="bar"><i style="width:${w}%"></i></div><span>${(x * rs).toFixed(0)}</span></div>`;
    }).join('');
  }
  /** AUTO-PLAY ONLY: the AI has decided; before it slides, a red arrow on the newest tile shows the direction it is about to move. */
  function dirArrow(a) {
    const d = document.createElement('span'); d.className = 'dir'; d.dataset.a = a;
    d.innerHTML = `<svg viewBox="0 0 100 100" style="transform:rotate(${ROT[a]}deg)"><polygon points="6,36 54,36 54,16 94,50 54,84 54,64 6,64"/></svg>`; return d;
  }
  function clearIntent() { document.querySelectorAll('.cell .dir').forEach((d) => d.remove()); }
  const boardKey = () => Array.from(game.board).join(',');
  function cancelHold() { clearTimeout(holdTimer); holding = false; clearIntent(); }     // the pause between 'arrow shown' and 'slide'
  function showIntent(a) { clearIntent(); const t = game.lastSpawn >= 0 ? game.lastSpawn : 0; if (a >= 0) cells[t].appendChild(dirArrow(a)); }
  function showDir(a) { lastDir = a; }
  function showHint() { /* the AI hint lives in the Q panel (best row highlighted) and the text under it */ }
  function finishGameIfOver() {
    if (!game.over) return;
    stats.n++; stats.sum += game.score; stats.best = Math.max(stats.best, game.maxTile()); if (game.maxTile() >= 1024) stats.win++;
    $('g_n').textContent = stats.n; $('g_avg').textContent = Math.round(stats.sum / stats.n); $('g_best').textContent = stats.best; $('g_win').textContent = `${stats.win} / ${stats.n}`;
  }

  // ---- one move = slide, then spawn --------------------------------------------------------------
  function finishSpawn(done) {
    const pos = game.spawnTile(); phase = 'ready'; render(pos, lastMerged); lastMerged = []; finishGameIfOver();
    if (done) done();
  }
  /** a legal move `a`: slide now; then (unless phased) the new tile. returns false if the move is illegal / busy animating. */
  function apply(a, { phased = false, done = null } = {}) {
    if (anim || phase === 'slid') return false;
    const r = game.slide(a); if (!r.changed) return false;
    clearIntent(); showDir(a); showHint(-1); lastMerged = r.mergedTo; anim = true;
    const g = game; $('score').textContent = game.score; $('moves').textContent = game.moves; $('maxtile').textContent = game.maxTile();
    animateSlide(r.trace, animMs(), () => {
      if (g !== game) return; anim = false;                         // a new game started meanwhile: newGame() already reset everything
      if (phased) { phase = 'slid'; render(-1, lastMerged); lastMerged = []; if (done) done(); } else { phase = 'slid'; finishSpawn(done); }
    });
    return true;
  }
  const settle = () => { if (phase === 'slid') finishSpawn(null); };    // finish a half-done step before doing anything else

  // ---- asking the net -------------------------------------------------------------------------------
  function requestMove(mode) {    // 'play' (apply, then keep going) | 'step' (slide only) | 'hint' (just show the suggestion)
    settle(); if (!ready || busy || anim || game.over) return;
    busy = true; const my = epoch, id = ++reqId; pending = { id, my, mode };
    $('think').textContent = 'thinking…';
    worker.postMessage({ type: 'decide', id, board: game.board.slice(), depth: +$('depth').value });
  }
  function schedule() {
    clearTimeout(timer); if (!playing) return;
    if (game.over) { if ($('auto').checked) timer = setTimeout(() => { newGame(); schedule(); }, 1200); else setPlaying(false); return; }
    timer = setTimeout(() => { if (busy || anim) { schedule(); return; } requestMove('play'); }, 20);   // decide right away; the pause (speed slider) comes AFTER the arrow is shown
  }
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'loaded') {
      ready = true; $('modelinfo').textContent = `${man.label || man.name} · ${man.arch.toUpperCase()} · input ${man.enc} · ${man.params.toLocaleString()} params · loaded in ${m.ms.toFixed(0)} ms`; $('err').textContent = '';
      if (playing) schedule(); else maybeHint();
    } else if (m.type === 'decision') {
      busy = false; if (!pending || m.id !== pending.id || pending.my !== epoch) return;
      const q = m.q, best = E.bestAction(q.map((x) => (x === null ? -Infinity : x))), mode = pending.mode;
      showQ(q, best); $('think').textContent = `search took ${m.ms.toFixed(0)} ms (depth ${$('depth').value})`;
      if (mode === 'hint') { showHint(best); hintBest = best >= 0 ? { best, key: boardKey(), depth: +$('depth').value } : null; if (best >= 0 && !humanMode) showIntent(best); $('think').textContent = best >= 0 ? `AI suggests ${ARROWS[best]} ${E.ACTION_NAMES[best]}  (depth ${$('depth').value}, ${m.ms.toFixed(0)} ms)` : ''; return; }
      if (best < 0) return;
      showIntent(best); holding = true; const my = epoch, g = game;       // AI move (auto-play or Step): arrow first, then the slide
      holdTimer = setTimeout(() => {
        holding = false; if (my !== epoch || g !== game) return;
        if (mode === 'play') { if (playing) apply(best, { done: schedule }); } else apply(best, { phased: true });
      }, +$('speed').value);
    } else if (m.type === 'error') { busy = false; $('err').innerHTML = `<span class="err">${m.message}</span>`; }
  };

  // ---- controls ---------------------------------------------------------------------------------------
  function maybeHint() { if (!playing && ready && !game.over && phase === 'ready' && $('hint').checked) requestMove('hint'); else if (!$('hint').checked) showHint(-1); }
  function setPlaying(p, hint = true) {
    playing = p; $('play').textContent = p ? '⏸ Pause' : '▶ Play';
    epoch++; busy = false; cancelHold();                             // drops a search still in flight (also a stale hint) and a pending slide
    if (p) { settle(); showHint(-1); schedule(); } else { clearTimeout(timer); if (hint) maybeHint(); }
  }
  function newGame() { epoch++; busy = false; cancelHold(); anim = false; phase = 'ready'; clearFloats(); lastMerged = []; game = new E.Game(); clearIntent(); showDir(-1); showHint(-1); render(-1); showQ([null, null, null, null], -1); $('think').textContent = ''; if (!playing) maybeHint(); }
  /** a move by the human (keys, swipe, tap on the pad): pauses the AI, moves, refreshes the hint */
  function humanMove(a) {
    if (anim) return; settle(); if (game.over) return;
    humanMode = true; hintBest = null; setPlaying(false, false); showHint(-1);
    apply(a, { done: maybeHint });
  }
  async function loadBundled(entry) {
    ready = false; epoch++; busy = false; $('modelinfo').textContent = 'loading…';
    const [m, buf] = await Promise.all([fetch(entry.json).then((r) => r.json()), fetch(entry.bin).then((r) => r.arrayBuffer())]);
    man = m; worker.postMessage({ type: 'load', man: m, buf }, [buf]);
  }
  async function loadFiles(files) {
    const j = [...files].find((f) => f.name.endsWith('.json')), b = [...files].find((f) => f.name.endsWith('.bin'));
    if (!j || !b) { $('err').innerHTML = '<span class="err">select both the .json and the .bin file of a model</span>'; return; }
    const m = JSON.parse(await j.text()), buf = await b.arrayBuffer(); m.label = m.label || m.name;
    const bpe = m.dtype === 'float16' ? 2 : 4; if (buf.byteLength !== m.params * bpe) { $('err').innerHTML = `<span class="err">size mismatch: .bin has ${buf.byteLength} bytes, expected ${m.params * bpe}</span>`; return; }
    ready = false; epoch++; busy = false; man = m; worker.postMessage({ type: 'load', man: m, buf }, [buf]);
    $('model').add(new Option(`custom: ${m.label}`, 'custom')); $('model').value = 'custom';
  }

  $('play').onclick = () => { humanMode = false; setPlaying(!playing); };
  $('step').onclick = () => {
    if (anim || holding) return;                                      // wait for the arrow/slide in progress
    if (phase === 'slid') { finishSpawn(maybeHint); return; }       // 2nd click: the new tile
    humanMode = false; setPlaying(false, false); showHint(-1);       // 1st click: slide + merge
    const h = hintBest; hintBest = null;
    if (h && !game.over && h.key === boardKey() && h.depth === +$('depth').value) { apply(h.best, { phased: true }); return; }   // exactly the direction the arrow showed
    requestMove('step');
  };
  $('new').onclick = () => { humanMode = false; newGame(); if (playing) schedule(); };
  $('speed').oninput = () => { $('speedv').textContent = $('speed').value + ' ms'; };
  $('depth').onchange = () => { epoch++; busy = false; cancelHold(); if (playing) schedule(); else maybeHint(); };
  $('hint').onchange = () => { if ($('hint').checked) maybeHint(); else { hintBest = null; if (!holding) clearIntent(); $('think').textContent = ''; showQ([null, null, null, null], -1); } };
  $('loadbtn').onclick = () => $('files').click();
  $('files').onchange = (e) => loadFiles(e.target.files);
  let index = [];
  $('model').onchange = () => { const m = index.find((x) => x.name === $('model').value); if (m) loadBundled(m); };

  const KEYMAP = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
  addEventListener('keydown', (e) => { if (!(e.key in KEYMAP) || e.metaKey || e.ctrlKey || e.altKey) return; e.preventDefault(); humanMove(KEYMAP[e.key]); });
  let sx = 0, sy = 0;
  $('stage').addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  $('stage').addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    humanMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  });

  $('speedv').textContent = $('speed').value + ' ms'; render(-1); showQ([null, null, null, null], -1);
  fetch('models/index.json').then((r) => r.json()).then((idx) => {
    index = idx; $('model').innerHTML = ''; idx.forEach((m) => $('model').add(new Option(m.label, m.name)));
    return loadBundled(idx[0]);
  }).catch((err) => { $('err').innerHTML = `<span class="err">cannot load models/index.json (${err.message}) — serve this folder with ./serve.sh instead of opening the file directly</span>`; });
  window.__1024 = { get game() { return game; }, get lastDir() { return lastDir; }, get phase() { return phase; }, get animating() { return anim; }, setPlaying, render, humanMove, get state() { return { playing, busy, holding, anim, ready, phase, epoch, over: game.over, moves: game.moves }; } };   // for tests
})();
