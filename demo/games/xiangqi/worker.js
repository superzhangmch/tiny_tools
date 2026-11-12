// Runs the engine off the UI thread: loads the int8 model on first use and answers the same three calls as server.py (/api/state, /api/policy, /api/engine).
importScripts('xq.js');
let W = null;
async function model() {
  if (W) return W;
  const man = await (await fetch('models/manifest.json')).json(), i8 = await (await fetch('models/model.int8')).arrayBuffer(), aux = new Float32Array(await (await fetch('models/aux.f32')).arrayBuffer());
  return (W = XQ.loadModel(man, i8, aux));
}
onmessage = async (e) => {
  const { id, path, body } = e.data;
  try {
    let result;
    if (path === '/api/state') result = XQ.state(XQ.replay(body.moves));
    else if (path === '/api/policy') result = XQ.policyApi(await model(), body);
    else if (path === '/api/legalmap') result = XQ.legalMapApi(await model(), body);
    else if (path === '/api/engine') result = XQ.engineApi(await model(), body);
    else throw new Error('unknown endpoint ' + path);
    postMessage({ id, result });
  } catch (err) { postMessage({ id, error: String(err.message || err) }); }
};
