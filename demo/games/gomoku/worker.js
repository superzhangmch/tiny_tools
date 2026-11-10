/* Web Worker: loads the CNN once and answers {type:'move'} requests, so the page never freezes while the AI thinks. */
importScripts('engine.js');
const E = self.GomokuEngine;
let net = null;

// the 572 five-cell windows of a 15x15 board
const WINW = (function () { const S = 15, w = [];
  for (let r = 0; r < S; r++) for (let c = 0; c <= S - 5; c++) w.push([0, 1, 2, 3, 4].map(k => r * S + c + k));
  for (let r = 0; r <= S - 5; r++) for (let c = 0; c < S; c++) w.push([0, 1, 2, 3, 4].map(k => (r + k) * S + c));
  for (let r = 0; r <= S - 5; r++) for (let c = 0; c <= S - 5; c++) { w.push([0, 1, 2, 3, 4].map(k => (r + k) * S + c + k)); w.push([0, 1, 2, 3, 4].map(k => (r + k) * S + c + 4 - k)); }
  return w; })();
function fiveCells(b, who) {                                    // cells where `who` completes five (or more) right now
  const out = new Set();
  for (const win of WINW) { let own = 0, empty = 0, e = -1; for (let k = 0; k < 5; k++) { const v = b[win[k]]; if (v === who) own++; else if (v === 0) { empty++; e = win[k]; } } if (own === 4 && empty === 1) out.add(e); }
  return Array.from(out);
}

async function init() {
  const [man, buf] = await Promise.all([fetch('model.json').then(r => r.json()), fetch('model.bin').then(r => r.arrayBuffer())]);
  net = new E.Net(E.loadModel(buf, man));
  const b = new Int8Array(225); b[112] = 1;
  net.forward(E.makePlanes(b, -1, 112));                                   // warm-up
  const t0 = performance.now(), R = 3; for (let i = 0; i < R; i++) net.forward(E.makePlanes(b, -1, 112));
  postMessage({ type: 'ready', ver: 3, forwardMs: (performance.now() - t0) / R, hash: man.sha256 });
}

// choose from a distribution: argmax, except in the opening where we sample among the top 3 so that games differ
function pick(dist, board, opening) {
  const idx = []; for (let i = 0; i < 225; i++) if (board[i] === 0) idx.push(i);
  idx.sort((a, b) => dist[b] - dist[a]);
  if (!opening) return idx[0];
  const top = idx.slice(0, 3), w = top.map(i => dist[i] + 1e-9), s = w.reduce((a, b) => a + b, 0); let r = Math.random() * s;
  for (let k = 0; k < top.length; k++) { r -= w[k]; if (r <= 0) return top[k]; }
  return top[0];
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { init().catch(err => postMessage({ type: 'error', message: String(err) })); return; }
  if (m.type === 'policy' && net) {                                          // just the network's move distribution (for the heat-map board)
    const b = Int8Array.from(m.board), ev = E.evaluate(net, b, m.player, m.last);
    postMessage({ type: 'policy', id: m.id, player: m.player, prior: ev.prior, value: ev.value }); return;
  }
  if (m.type !== 'move' || !net) return;
  const t0 = performance.now(), board = Int8Array.from(m.board); let stones = 0; for (let i = 0; i < 225; i++) if (board[i] !== 0) stones++;
  let move, value, reason = 'net';
  if (m.basic && stones >= 4) {                                              // basic rule: complete five if you can, otherwise block the opponent's five
    let cells = fiveCells(board, m.player);
    if (cells.length) reason = 'win'; else { cells = fiveCells(board, -m.player); if (cells.length) reason = 'block'; }
    if (reason !== 'net') {
      const ev = E.evaluate(net, board, m.player, m.last); move = cells.reduce((a, b) => (ev.prior[b] > ev.prior[a] ? b : a)); value = reason === 'win' ? 1 : ev.value;
    }
  }
  if (move !== undefined) { /* decided by the basic rule */ }
  else if (stones === 0) { move = 112; value = 0; }                              // empty board: centre
  else if (stones === 1) {                                                   // the network never saw a 1-stone position (training positions start after a random opening):
    const c = board.findIndex(v => v !== 0), r = (c / 15) | 0, k = c % 15, nb = [];   // reply next to the single stone (standard opening convention)
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = k + dc; if ((dr || dc) && rr >= 0 && rr < 15 && cc >= 0 && cc < 15) nb.push(rr * 15 + cc); }
    move = nb[(Math.random() * nb.length) | 0]; value = 0;
  }
  else if (m.sims <= 0) { const ev = E.evaluate(net, board, m.player, m.last); move = pick(ev.prior, board, stones < 6); value = ev.value; }
  else {
    const r = E.mctsSearch(net, board, m.player, m.last, m.sims); move = pick(r.visits, board, stones < 6); value = r.rootValue;
  }
  postMessage({ type: 'move', id: m.id, move, value, reason, ms: performance.now() - t0 });
};
