const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/clt.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, buildSampler, cauchySample, meanOf, makeMoments } =
  new Function(core + '\nreturn {mulberry32, buildSampler, cauchySample, meanOf, makeMoments};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
const quantile = (arr, q) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(q * a.length)]; };

// 1. 均匀密度的精确矩: μ=1/2, σ²=1/12
{
  const s = buildSampler(new Float64Array(256).fill(0.7));
  check('均匀: μ = 0.5 精确', Math.abs(s.mu - 0.5) < 1e-12, s.mu);
  check('均匀: σ² = 1/12 精确(含格内 Δ²/12 项)', Math.abs(s.sigma2 - 1 / 12) < 1e-12, s.sigma2);
}
// 2. 采样器矩 = 解析矩 (双峰形状, 2e5 样本)
{
  const f = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i + 0.5) / 256;
    f[i] = Math.exp(-(((x - 0.25) / 0.06) ** 2)) + 0.5 * Math.exp(-(((x - 0.7) / 0.1) ** 2));
  }
  const s = buildSampler(f), rng = mulberry32(3);
  let m = 0, m2 = 0;
  const M = 2e5;
  for (let i = 0; i < M; i++) { const v = s.sample(rng); m += v; m2 += v * v; }
  m /= M; m2 = m2 / M - m * m;
  check('采样均值 = 解析 μ (±0.002)', Math.abs(m - s.mu) < 0.002, [m, s.mu]);
  check('采样方差 = 解析 σ² (±3%)', Math.abs(m2 / s.sigma2 - 1) < 0.03, [m2, s.sigma2]);
}
// 3. n=2 均匀均值: 方差 = σ²/2 = 1/24 (三角分布)
{
  const s = buildSampler(new Float64Array(256).fill(1)), rng = mulberry32(11);
  const mo = makeMoments();
  for (let i = 0; i < 1e5; i++) mo.add(meanOf(s.sample, 2, rng));
  const st = mo.stats();
  check('n=2 均值方差 = 1/24 (±3%)', Math.abs(st.variance * 24 - 1) < 0.03, st.variance);
  check('n=2 三角分布: 偏度 ≈ 0', Math.abs(st.skew) < 0.02, st.skew);
}
// 4. 偏度按 1/√n 衰减 (指数样母分布)
{
  const f = new Float64Array(256);
  for (let i = 0; i < 256; i++) f[i] = Math.exp(-5 * (i + 0.5) / 256);
  const s = buildSampler(f);
  const skewAt = (n, seed) => {
    const rng = mulberry32(seed), mo = makeMoments();
    for (let i = 0; i < 6e4; i++) mo.add(meanOf(s.sample, n, rng));
    return mo.stats().skew;
  };
  const s1 = skewAt(1, 5), s16 = skewAt(16, 6);
  check('偏度(n=16) ≈ 偏度(1)/4 (±25%)', Math.abs(s16 * 4 / s1 - 1) < 0.25, [s1, s16, s1 / s16]);
}
// 5. 柯西: 均值分布不随 n 收缩 (IQR 不变) —— CLT 失效
{
  const iqrAt = (n, seed) => {
    const rng = mulberry32(seed), arr = [];
    for (let i = 0; i < 3e4; i++) arr.push(meanOf(cauchySample, n, rng));
    return quantile(arr, 0.75) - quantile(arr, 0.25);
  };
  const i1 = iqrAt(1, 21), i40 = iqrAt(40, 22);
  check('柯西 IQR(n=40) = IQR(n=1) (±12%, 理论精确相等 = 2)', Math.abs(i40 / i1 - 1) < 0.12, [i1, i40]);
  check('柯西 IQR ≈ 2 (tan(±π/4))', Math.abs(i1 - 2) < 0.1, i1);
  // 对照: 有限方差母分布 IQR 按 1/√n 收缩
  const s = buildSampler(new Float64Array(256).fill(1));
  const rng = mulberry32(23), a1 = [], a40 = [];
  for (let i = 0; i < 3e4; i++) a1.push(meanOf(s.sample, 1, rng));
  for (let i = 0; i < 3e4; i++) a40.push(meanOf(s.sample, 40, rng));
  const r = (quantile(a40, 0.75) - quantile(a40, 0.25)) / (quantile(a1, 0.75) - quantile(a1, 0.25));
  // IQR/σ: 均匀 = √12/2 ≈ 1.732 → 正态 = 1.349, 故收缩比 = (1.349/1.732)/√40 = 0.779/√40
  check('对照(均匀): IQR·√40/IQR₁ = 1.349/1.732 ≈ 0.779 (±6%)', Math.abs(r * Math.sqrt(40) / 0.779 - 1) < 0.06, r * Math.sqrt(40));
}
// 6. 流式矩公式: 已知数组的偏度/峰度
{
  const mo = makeMoments();
  for (const v of [1, 2, 2, 3, 3, 3, 4, 4, 5, 9]) mo.add(v);
  const st = mo.stats();
  // 与直接计算比对
  const arr = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9];
  const m = arr.reduce((a, b) => a + b) / arr.length;
  const c = k => arr.reduce((a, b) => a + (b - m) ** k, 0) / arr.length;
  check('流式偏度 = 直接计算', Math.abs(st.skew - c(3) / c(2) ** 1.5) < 1e-10, [st.skew, c(3) / c(2) ** 1.5]);
  check('流式超额峰度 = 直接计算', Math.abs(st.exkurt - (c(4) / c(2) ** 2 - 3)) < 1e-10);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
