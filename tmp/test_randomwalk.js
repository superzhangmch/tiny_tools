const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/random_walk_paradoxes.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, leadFraction, arcsineCDF, arcsineDen, ruinTheory, ruinSim, stepDim, atOrigin } =
  new Function(core + '\nreturn {mulberry32, leadFraction, arcsineCDF, arcsineDen, ruinTheory, ruinSim, stepDim, atOrigin};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// 1. 反正弦: P(占比>0.9) 实测 vs 理论 0.205; U 形: 两端格 > 中间格
{
  const rng = mulberry32(5);
  let hi = 0, mid = 0, lo = 0.0, cLow = 0, cMid2 = 0;
  const M = 30000, T = 500;
  for (let i = 0; i < M; i++) {
    const f = leadFraction(T, rng);
    if (f > 0.9) hi++;
    if (f >= 0.45 && f <= 0.55) mid++;
    if (f < 0.1) cLow++;
  }
  const p9 = 1 - arcsineCDF(0.9);
  check(`P(>0.9) 实测 ${(hi/M).toFixed(3)} ≈ 理论 ${p9.toFixed(3)} (±0.02)`, Math.abs(hi / M - p9) < 0.02);
  check('U 形: P(>0.9) > 2×P(0.45~0.55)', hi > 2 * mid, [hi, mid]);
  check('对称: P(<0.1) ≈ P(>0.9) (±15%)', Math.abs(cLow / hi - 1) < 0.15, cLow / hi);
}
// 2. 反正弦 CDF 数值: F(1/2)=1/2, 密度积分=1
{
  check('F(1/2) = 1/2', Math.abs(arcsineCDF(0.5) - 0.5) < 1e-12);
  let s = 0;
  for (let i = 0; i < 20000; i++) s += arcsineDen((i + 0.5) / 20000) / 20000;
  check('∫密度 = 1 (±0.01)', Math.abs(s - 1) < 0.01, s);
}
// 3. 赌徒破产: 公平 a=5,b=10 → 0.5; 有偏公式对照
{
  check('公平: P(破产) = 1 − a/b', Math.abs(ruinTheory(5, 10, 0.5) - 0.5) < 1e-12);
  const rng = mulberry32(17);
  const a = 5, b = 20, p = 0.45;
  let ruin = 0, n = 0;
  for (let i = 0; i < 20000; i++) {
    const r = ruinSim(a, b, p, rng, 1e6);
    if (r >= 0) { n++; ruin += r; }
  }
  const th = ruinTheory(a, b, p);
  check(`有偏 p=0.45: 实测 ${(ruin/n).toFixed(3)} ≈ 理论 ${th.toFixed(3)} (±0.02)`, Math.abs(ruin / n - th) < 0.02);
  check('劣势放大: b=100 时破产率 > 0.99', ruinTheory(5, 100, 0.45) > 0.99, ruinTheory(5, 100, 0.45));
}
// 4. Pólya: 1D 回归 ~1, 3D ≈ 0.34
{
  const rng = mulberry32(23);
  const frac = (d, N, W) => {
    let c = 0;
    for (let w = 0; w < W; w++) {
      const pos = new Array(d).fill(0);
      for (let k = 0; k < N; k++) {
        stepDim(pos, d, rng);
        if (atOrigin(pos)) { c++; break; }
      }
    }
    return c / W;
  };
  const f1 = frac(1, 10000, 2000);
  check(`1D 到 1e4 步已回比例 ${f1.toFixed(3)} > 0.97`, f1 > 0.97, f1);
  const f3 = frac(3, 10000, 3000);
  check(`3D 到 1e4 步已回比例 ${f3.toFixed(3)} ∈ [0.28, 0.37] (理论极限 0.3405)`, f3 > 0.28 && f3 < 0.37, f3);
  const f2 = frac(2, 10000, 2000);
  check(`2D 介于两者之间 (${f2.toFixed(3)})`, f2 > f3 + 0.1 && f2 < f1, f2);
}
// 5. leadFraction 极端: 全正路径占比 1 可达; 值域 [0,1]
{
  const rng = mulberry32(31);
  let ok = true, sawHi = false, sawLo = false;
  for (let i = 0; i < 3000; i++) {
    const f = leadFraction(100, rng);
    if (!(f >= 0 && f <= 1)) ok = false;
    if (f > 0.99) sawHi = true;
    if (f < 0.01) sawLo = true;
  }
  check('占比 ∈ [0,1] 且两个极端都出现过', ok && sawHi && sawLo);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
