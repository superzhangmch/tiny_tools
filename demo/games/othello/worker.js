// Runs the Othello engine off the UI thread: loads the int8 model on first use; answers 'engine' (choose a move) and 'analyze' (what the net thinks of a position).
importScripts('oth.js');
const models = {};
async function model(name) {
  name = name || 'multi'; if (models[name]) return models[name];
  const d = 'models/' + name + '/', man = await (await fetch(d + 'manifest.json')).json(), i8 = await (await fetch(d + 'model.int8')).arrayBuffer(), aux = new Float32Array(await (await fetch(d + 'aux.f32')).arrayBuffer());
  return (models[name] = OTH.loadModel(man, i8, aux));
}
const argmax = (a, idx) => idx.reduce((b, s) => (a[s] > a[b] ? s : b), idx[0]);
const softmax = (a) => { const m = Math.max(...a), e = Array.from(a, (v) => Math.exp(v - m)), t = e.reduce((x, y) => x + y, 0); return e.map((v) => v / t); };
function engine(W, req) {
  const b = Int8Array.from(req.board), p = req.p, legal = OTH.legalMoves(b, p), t0 = Date.now();
  if (!legal.length) return { pass: true };
  const all = Array.from({ length: 64 }, (_, i) => i); let move, illegal = null, value, info = '', out_exact = false;
  if (req.mode === 'rules' && !W.multi) { req.mode = 'search'; req.depth = 1; }                  // value-only net: "net + rules" = the rules give the afterstates, take the best by value
  if (req.mode === 'raw' || req.mode === 'rules') {
    if (!W.multi) throw new Error('this model has no policy head');
    const e = OTH.evalAll(W, b, p); value = e.value; let cand = req.mode === 'raw' ? all : legal;
    if (req.variety && req.ply < req.variety) { const mx = Math.max(...legal.map((s) => e.policy[s])); const pool = legal.filter((s) => e.policy[s] >= mx - 1.6); move = pool[Math.floor(Math.random() * pool.length)]; if (req.mode === 'raw') { const raw = argmax(e.policy, all); if (!legal.includes(raw)) illegal = raw; } }
    else { const raw = argmax(e.policy, cand); if (legal.includes(raw)) move = raw; else { illegal = raw; move = argmax(e.policy, legal); } }
  } else {
    const S = OTH.Searcher(W, { exactEmpties: req.exact ? 8 : 0 }), r = S.best(b, p, req.depth); move = r.move; value = r.value; info = r.forced ? '只有一步' : `${r.evals} 次网络评估，${r.nodes} 个节点`; if (req.exact) { let e = 0; for (let i = 0; i < 64; i++) if (b[i] === 0) e++; if (e <= 8) { out_exact = true; info = `精确求解（剩 ${e} 个空位）`; } }
    if (!isFinite(value)) value = OTH.evalValue(W, b, p);
  }
  return { move, illegal, value, info, exact: out_exact, seconds: (Date.now() - t0) / 1000 };
}
function analyze(W, req) {
  const b = Int8Array.from(req.board), p = req.p, legal = OTH.legalMoves(b, p), e = OTH.evalAll(W, b, p), out = { value: e.value, legal };
  if (e.policy) { out.policy = softmax(e.policy); out.legalHead = Array.from(e.legal, (x) => 1 / (1 + Math.exp(-x))); }
  if (req.after) { out.after = {}; for (const s of legal) { const nb = OTH.play(b, s, p); out.after[s] = OTH.legalMoves(nb, -p).length ? -OTH.evalValue(W, nb, -p) : OTH.legalMoves(nb, p).length ? OTH.evalValue(W, nb, p) : OTH.finalScore(nb, p); } }
  return out;
}
onmessage = async (e) => {
  const { id, kind, body } = e.data;
  try { const Wm = await model(body && body.model); postMessage({ id, result: kind === 'engine' ? engine(Wm, body) : kind === 'analyze' ? analyze(Wm, body) : { multi: Wm.multi } }); }
  catch (err) { postMessage({ id, error: String(err.message || err) }); }
};
