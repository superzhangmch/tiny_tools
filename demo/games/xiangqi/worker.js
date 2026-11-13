// Runs the engine off the UI thread: loads the int8 model(s) on first use (one model per policy structure, downloaded only when selected) and answers the same calls as server.py (/api/state, /api/policy, /api/legalmap, /api/engine, /api/models).
importScripts('xq.js');
const MODELS = ['new', 'old', 'split_indep', 'split_cond'], cache = {}; let common = null;
function model(id) {
  id = id || 'new'; if (!MODELS.includes(id)) throw new Error('unknown model ' + id);
  return cache[id] || (cache[id] = (async () => {
    if (!common) common = await (await fetch('models/common.json')).json();
    const d = 'models/' + id + '/', man = await (await fetch(d + 'manifest.json')).json(), i8 = await (await fetch(d + 'model.int8')).arrayBuffer(), aux = new Float32Array(await (await fetch(d + 'aux.f32')).arrayBuffer());
    return XQ.loadModel(man, i8, aux, common);
  })());
}
onmessage = async (e) => {
  const { id, path, body } = e.data;
  try {
    let result;
    if (path === '/api/state') result = XQ.state(XQ.replay(body.moves));
    else if (path === '/api/models') result = { models: MODELS, default: 'new' };
    else if (path === '/api/policy') result = XQ.policyApi(await model(body.model), body);
    else if (path === '/api/legalmap') result = XQ.legalMapApi(await model(body.model), body);
    else if (path === '/api/engine') result = XQ.engineApi(await model(body.model), body);
    else throw new Error('unknown endpoint ' + path);
    postMessage({ id, result });
  } catch (err) { postMessage({ id, error: String(err.message || err) }); }
};
