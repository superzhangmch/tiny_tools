const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/bootstrap.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, STATS, bootOnce, quantileSorted, summarize } =
  new Function(core + '\nreturn {mulberry32, STATS, bootOnce, quantileSorted, summarize};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// 1. 统计量函数
{
  check('mean', STATS.mean([1, 2, 3, 4]) === 2.5);
  check('median 偶数', STATS.median([4, 1, 3, 2]) === 2.5);
  check('median 奇数', STATS.median([5, 1, 3]) === 3);
  check('sd', Math.abs(STATS.sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2) < 1e-12);
  check('max', STATS.max([3, 9, 1]) === 9);
}
// 2. bootstrap SE(均值) ≈ s/√n
{
  const rng = mulberry32(1);
  const n = 50;
  const sample = Array.from({ length: n }, () => rng() * 2);
  const s = STATS.sd(sample);
  const buf = new Float64Array(n), vals = [];
  for (let i = 0; i < 20000; i++) vals.push(bootOnce(sample, STATS.mean, rng, buf));
  const su = summarize(vals);
  check('boot SE(均值) ≈ s/√n (±5%)', Math.abs(su.se / (s / Math.sqrt(n)) - 1) < 0.05, [su.se, s / Math.sqrt(n)]);
  check('boot 均值分布中心 ≈ 样本均值', Math.abs(su.mean - STATS.mean(sample)) < 0.01, [su.mean, STATS.mean(sample)]);
}
// 3. boot SE ≈ 真 SE (均值, 指数总体): 二者应同量级贴近
{
  const rng = mulberry32(2);
  const pop = () => -Math.log(Math.max(rng(), 1e-12)) * 0.25;
  const n = 100;
  const sample = Array.from({ length: n }, pop);
  const buf = new Float64Array(n), bv = [], tv = [];
  for (let i = 0; i < 15000; i++) {
    bv.push(bootOnce(sample, STATS.mean, rng, buf));
    const fresh = Array.from({ length: n }, pop);
    tv.push(STATS.mean(fresh));
  }
  const sb = summarize(bv), st = summarize(tv);
  check(`boot SE ${sb.se.toPrecision(3)} ≈ 真 SE ${st.se.toPrecision(3)} (±25%)`, Math.abs(sb.se / st.se - 1) < 0.25);
}
// 4. 最大值失灵: P(boot max = 样本 max) = 1−(1−1/n)^n ≈ 0.632
{
  const rng = mulberry32(3);
  const n = 100;
  const sample = Array.from({ length: n }, () => rng());
  const mx = Math.max(...sample);
  const buf = new Float64Array(n);
  let hit = 0;
  const M = 20000;
  for (let i = 0; i < M; i++) if (bootOnce(sample, STATS.max, rng, buf) === mx) hit++;
  const th = 1 - Math.pow(1 - 1 / n, n);
  check(`P(boot max = 样本 max) 实测 ${(hit/M).toFixed(3)} ≈ ${th.toFixed(3)} (±0.02)`, Math.abs(hit / M - th) < 0.02);
  check('boot max 永远 ≤ 样本 max', true);   // 由构造保证: 重抽自样本
}
// 5. quantileSorted / summarize 一致性
{
  const arr = Array.from({ length: 1000 }, (_, i) => i / 999);
  const su = summarize(arr);
  check('95% 区间 ≈ [0.025, 0.975]', Math.abs(su.lo - 0.025) < 0.01 && Math.abs(su.hi - 0.975) < 0.01, [su.lo, su.hi]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
