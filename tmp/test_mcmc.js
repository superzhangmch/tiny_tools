const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/mcmc_metropolis.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, gauss, densityAt, metropolisRun, tvDistance, downsample } =
  new Function(core + '\nreturn {mulberry32, gauss, densityAt, metropolisRun, tvDistance, downsample};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// 1. 双线性插值: 常数网格处处同值; 边界外 0
{
  const N = 8, G = new Float64Array(N * N).fill(3);
  check('densityAt 常数场 = 3', Math.abs(densityAt(G, N, 0.37, 0.61) - 3) < 1e-12, densityAt(G, N, 0.37, 0.61));
  check('边界外 = 0', densityAt(G, N, -0.01, 0.5) === 0 && densityAt(G, N, 0.5, 1.0) === 0);
}
// 2. gauss: 均值/方差
{
  const rng = mulberry32(7);
  let s = 0, s2 = 0;
  const M = 2e5;
  for (let i = 0; i < M; i++) { const v = gauss(rng); s += v; s2 += v * v; }
  check('Box-Muller: 均值≈0 方差≈1', Math.abs(s / M) < 0.01 && Math.abs(s2 / M - 1) < 0.02, [s / M, s2 / M]);
}
// 3. Metropolis 不变分布: 左半密度 1, 右半密度 3 → 占用比 → 3
{
  const N = 16, G = new Float64Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) G[j * N + i] = i < N / 2 ? 1 : 3;
  const rng = mulberry32(42), st = { x: 0.25, y: 0.5 };
  let L = 0, R = 0;
  metropolisRun(G, N, st, 0.12, 400000, rng, (x) => { if (x < 0.5) L++; else R++; });
  // 双线性会在交界处平滑, 理论比略偏离 3; 用粗容差
  check('占用比 右/左 ≈ 3 (±12%)', Math.abs(R / L - 3) < 0.36, R / L);
}
// 4. 上坡必接受: p1 >= p0 时无随机拒绝
{
  const N = 8, G = new Float64Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) G[j * N + i] = (i + 1);
  // 构造 rng 交替 (0.3, 0.0): gauss = √(−2ln0.3)·cos(0) ≈ +1.55, 步子恒向右上(上坡)
  let k = 0;
  const fakeRng = () => (k++ % 2 ? 0.0 : 0.3);
  const st = { x: 0.1, y: 0.5 };
  const acc = metropolisRun(G, N, st, 0.02, 10, fakeRng, null);
  check('上坡 10 步全接受', acc === 10 && st.x > 0.1, [acc, st.x]);
}
// 5. 零密度区自救: 起点在空白处, 应能找到支撑
{
  const N = 16, G = new Float64Array(N * N);
  G[8 * N + 8] = 1; G[8 * N + 9] = 1; G[9 * N + 8] = 1; G[9 * N + 9] = 1;
  const rng = mulberry32(9), st = { x: 0.05, y: 0.05 };
  metropolisRun(G, N, st, 0.05, 5000, rng, null);
  check('空白起点自救后落在支撑附近', densityAt(G, N, st.x, st.y) > 0, [st.x, st.y]);
}
// 6. TV 距离: 自身为 0, 不交为 1, 收敛递减
{
  const A = Float64Array.from([1, 2, 3, 4]);
  check('TV(A,A) = 0', tvDistance(A, A) === 0);
  check('TV(不相交) = 1', tvDistance(Float64Array.from([1, 0]), Float64Array.from([0, 1])) === 1);
  // 单峰目标: 5e3 步 vs 2e5 步的堆积热图, TV 应显著下降
  const N = 32, G = new Float64Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++)
      G[j * N + i] = Math.exp(-(((i / N - 0.5) ** 2 + (j / N - 0.5) ** 2)) / 0.02);
  const run = steps => {
    const rng = mulberry32(1), st = { x: 0.5, y: 0.5 };
    const H = new Float64Array(N * N);
    metropolisRun(G, N, st, 0.1, steps, rng, (x, y) => {
      H[Math.min(N - 1, Math.floor(y * N)) * N + Math.min(N - 1, Math.floor(x * N))]++;
    });
    return tvDistance(downsample(G, N, 16), downsample(H, N, 16));
  };
  const t1 = run(5000), t2 = run(200000);
  check('TV 随步数下降 (5e3 → 2e5)', t2 < t1 * 0.6 && t2 < 0.1, [t1.toFixed(3), t2.toFixed(3)]);
}
// 7. downsample 保总量
{
  const N = 8, G = Float64Array.from({ length: 64 }, (_, i) => i);
  const H = downsample(G, N, 4);
  check('downsample 保总量', Math.abs(H.reduce((a, b) => a + b) - G.reduce((a, b) => a + b)) < 1e-9);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
