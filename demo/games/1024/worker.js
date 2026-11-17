/* Web Worker: holds the net and answers {type:'decide'} with the 4 q-values (expectimax at the requested depth),
 * so the page never freezes while searching. {type:'load'} brings in a model (man = json, buf = float32 weights). */
importScripts('engine.js');
const E = self.G1024; let net = null, man = null;
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      const t0 = performance.now(); man = m.man; net = new E.Net(E.loadModel(m.buf, m.man));
      net.value(new Int8Array(16));                                        // warm-up
      postMessage({ type: 'loaded', ms: performance.now() - t0, name: m.man.name });
    } else if (m.type === 'decide' && net) {
      const t0 = performance.now(), q = E.qValues(net, m.board, m.depth, man.gamma, man.r_scale);
      postMessage({ type: 'decision', id: m.id, q: q.map((x) => (Number.isFinite(x) ? x : null)), ms: performance.now() - t0 });
    }
  } catch (err) { postMessage({ type: 'error', message: String(err && err.message || err) }); }
};
