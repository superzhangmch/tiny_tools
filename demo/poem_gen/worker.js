importScripts('engine.js');
let E = null;
onmessage = ev => { const m = ev.data;
  try {
    if (m.cmd === 'load') { E = new PoemEngine(m.manifest, m.buffer); postMessage({ type: 'ready' }); }
    else if (m.cmd === 'gen') { const t0 = performance.now(); const text = E.generate(Object.assign({}, m.opts, { onToken: s => postMessage({ type: 'partial', text: s }) })); postMessage({ type: 'done', text, ms: performance.now() - t0 }); }
  } catch (e) { postMessage({ type: 'error', msg: String(e && e.message || e) }); } };
