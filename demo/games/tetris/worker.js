/* Web Worker: loads the value net once and answers {type:'decide'} (which reachable placement is best for this piece on this board). */
importScripts('engine.js');
const E = self.TetrisEngine; let net = null, model = null;
const VER = 1;

async function init() {
  const [man, buf] = await Promise.all([fetch('model.json').then((r) => r.json()), fetch('model.bin').then((r) => r.arrayBuffer())]);
  model = E.loadModel(buf, man); net = new E.Net(model);
  const t0 = performance.now(); E.decide(net, model, new Uint8Array(E.H * E.W), 2);
  postMessage({ type: 'ready', ver: VER, ms: performance.now() - t0, params: man.params });
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { init().catch((err) => postMessage({ type: 'error', message: String(err) })); return; }
  if (m.type !== 'decide' || !net) return;
  if (m.rules) E.setRules(m.rules);                                          // the page tells the worker which rotation rules are on
  const t0 = performance.now(), r = E.decide(net, model, Uint8Array.from(m.board), m.piece);
  if (!r) { postMessage({ type: 'decision', id: m.id, over: true }); return; }
  postMessage({ type: 'decision', id: m.id, best: r.best, ms: performance.now() - t0, cands: r.cands.map((c) => ({ rot: c.rot, x: c.x, y: c.y, lines: c.lines, v: c.v, score: c.score })) });
};
