const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/hypothesis_testing.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, ibeta, tCDF, tQuantile, tTestP, signTestP, buildPop } =
  new Function(core + '\nreturn {mulberry32, ibeta, tCDF, tQuantile, tTestP, signTestP, buildPop};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// 1. ibeta 已知值
{
  check('I_x(1,1) = x', Math.abs(ibeta(1, 1, 0.37) - 0.37) < 1e-12);
  check('对称: I_x(a,b) = 1 − I_{1−x}(b,a)', Math.abs(ibeta(2.5, 4, 0.3) - (1 - ibeta(4, 2.5, 0.7))) < 1e-12);
  check('I_{1/2}(a,a) = 1/2', Math.abs(ibeta(3.7, 3.7, 0.5) - 0.5) < 1e-12);
}
// 2. t CDF: ν=1 是柯西 → 精确 arctan 公式
{
  let worst = 0;
  for (const t of [-5, -1, 0, 0.5, 2, 10])
    worst = Math.max(worst, Math.abs(tCDF(t, 1) - (0.5 + Math.atan(t) / Math.PI)));
  check('tCDF(·,1) = 1/2 + atan/π (柯西)', worst < 1e-10, worst);
}
// 3. t 分位数: 经典表值
{
  check('t(0.975, 4) = 2.776', Math.abs(tQuantile(0.975, 4) - 2.776) < 0.001, tQuantile(0.975, 4));
  check('t(0.975, 30) = 2.042', Math.abs(tQuantile(0.975, 30) - 2.042) < 0.001, tQuantile(0.975, 30));
  check('t(0.975, 5000) ≈ 1.960 (→正态)', Math.abs(tQuantile(0.975, 5000) - 1.960) < 0.002, tQuantile(0.975, 5000));
}
// 4. 符号检验精确值: n=10, k=9 → 2×P(X≥9) = 2×11/1024
{
  check('signTest(9,10) = 22/1024', Math.abs(signTestP(9, 10) - 22 / 1024) < 1e-10, signTestP(9, 10));
  check('signTest(5,10) = 1 (居中)', Math.abs(signTestP(5, 10) - 1) < 1e-9, signTestP(5, 10));
}
// 5. 端到端校准: 均匀总体, H0 为真, n=10 → t 拒绝率 ≈ 0.05, 覆盖率 ≈ 0.95
{
  const pop = buildPop(new Float64Array(256).fill(1));
  check('均匀总体: μ = 中位数 = 0.5', Math.abs(pop.mu - 0.5) < 1e-10 && Math.abs(pop.median - 0.5) < 0.01);
  const rng = mulberry32(7);
  const n = 10, M = 20000, tq = tQuantile(0.975, n - 1);
  let rej = 0, cov = 0;
  for (let m = 0; m < M; m++) {
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const v = pop.sample(rng); s += v; s2 += v * v; }
    const mean = s / n, sd = Math.sqrt(Math.max((s2 - n * mean * mean) / (n - 1), 0));
    if (tTestP(mean, sd, n, 0.5) < 0.05) rej++;
    const half = tq * sd / Math.sqrt(n);
    if (mean - half <= 0.5 && 0.5 <= mean + half) cov++;
  }
  check(`均匀 n=10: t 实付 ${(rej/M).toFixed(4)} ≈ 承诺 0.05 (±0.007)`, Math.abs(rej / M - 0.05) < 0.007);
  check(`均匀 n=10: CI 覆盖 ${(cov/M).toFixed(4)} ≈ 0.95 (±0.007)`, Math.abs(cov / M - 0.95) < 0.007);
}
// 6. 偏态小样本: t 失守(实付偏离 5%), 符号检验守约(≤ 5%)
{
  const f = new Float64Array(256);
  for (let i = 0; i < 256; i++) f[i] = Math.exp(-5.5 * (i + 0.5) / 256);
  const pop = buildPop(f);
  const rng = mulberry32(9);
  const n = 5, M = 30000;
  let rejT = 0, rejS = 0;
  for (let m = 0; m < M; m++) {
    let s = 0, s2 = 0, k = 0, km = 0;
    for (let i = 0; i < n; i++) {
      const v = pop.sample(rng);
      s += v; s2 += v * v;
      if (v > pop.mu) k++;
      if (v > pop.median) km++;
    }
    const mean = s / n, sd = Math.sqrt(Math.max((s2 - n * mean * mean) / (n - 1), 0));
    if (tTestP(mean, sd, n, pop.mu) < 0.05) rejT++;      // t 检验自己的 H0 为真(μ0=真均值)
    if (signTestP(km, n) < 0.05) rejS++;                 // 符号检验自己的 H0 为真(μ0=真中位数)
  }
  check(`偏态 n=5: t 实付 ${(rejT/M).toFixed(4)} > 0.065 (失守)`, rejT / M > 0.065, rejT / M);
  check(`偏态 n=5: 符号实付 ${(rejS/M).toFixed(4)} ≤ 0.05 (守约,离散偏保守)`, rejS / M <= 0.05 + 0.005, rejS / M);
}
// 7. 功效: H0 为假时拒绝率随 n 上升
{
  const pop = buildPop(new Float64Array(256).fill(1));  // μ=0.5
  const power = (n, seed) => {
    const rng = mulberry32(seed);
    let rej = 0;
    const M = 8000;
    for (let m = 0; m < M; m++) {
      let s = 0, s2 = 0;
      for (let i = 0; i < n; i++) { const v = pop.sample(rng); s += v; s2 += v * v; }
      const mean = s / n, sd = Math.sqrt(Math.max((s2 - n * mean * mean) / (n - 1), 0));
      if (tTestP(mean, sd, n, 0.42) < 0.05) rej++;      // 真 0.5, 假设 0.42
    }
    return rej / M;
  };
  const p10 = power(10, 11), p50 = power(50, 12);
  // 效应 0.08 = 0.277σ, n=50 时非中心度 ≈ 1.96 → 理论功效 ≈ 0.50
  check(`功效随 n 升: n=10 → ${p10.toFixed(3)}, n=50 → ${p50.toFixed(3)} (理论≈0.50)`, p50 > p10 + 0.2 && Math.abs(p50 - 0.50) < 0.05, [p10, p50]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
