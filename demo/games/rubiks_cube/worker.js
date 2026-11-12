// 在 Web Worker 里跑浏览器本地模型的求解：页面不卡顿，主线程可以随时 terminate() 来停止。
import { loadTinyModel, solveWithRestart } from "./tiny.js";

const cache = {};
self.onmessage = async (e) => {
  const { model, META, state, beam, retry, maxAttempts, mode } = e.data;
  try {
    const t0 = performance.now();
    cache[model] = cache[model] || await loadTinyModel(model);
    const r = solveWithRestart(cache[model], META, state, beam,
      { retry, maxAttempts, mode, onAttempt: (k) => self.postMessage({ progress: k }) });
    self.postMessage({ ok: true, ...r, sec: (performance.now() - t0) / 1000 });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
