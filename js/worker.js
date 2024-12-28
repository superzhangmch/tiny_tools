// from https://gugray.github.io/hanzi_lookup/worker.js
onmessage = (e) => {
  if ("wasm_uri" in e.data) {
    importScripts("https://gugray.github.io/hanzi_lookup/hanzi_lookup.js");
    wasm_bindgen(e.data.wasm_uri).then(() => {
      postMessage({ what: "loaded" });
    });
  }
  else if ("strokes" in e.data) {
    const json = wasm_bindgen.lookup(e.data.strokes, e.data.limit);
    const matches = JSON.parse(json);
    postMessage({ what: "lookup", matches: matches });
  }
};
