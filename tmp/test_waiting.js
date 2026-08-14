const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/waiting_time_paradox.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, makeInterval, intervalMoments, simulate } =
  new Function(core + '\nreturn {mulberry32, makeInterval, intervalMoments, simulate};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
function run(mode, alpha, seed) {
  const rng = mulberry32(seed);
  const sampler = makeInterval(mode, 10, alpha);
  let sw = 0, ss = 0, n = 0;
  for (let rep = 0; rep < 40; rep++)
    simulate(sampler, 500, 1000, rng, { wait(w, L) { sw += w; ss += L; n++; } });
  return { wait: sw / n, seen: ss / n };
}
// 1. 准点: 等待 = 5, 撞上的间隔 = 10
{
  const r = run('fixed', 0, 1);
  check('准点: 平均等待 ≈ 5', Math.abs(r.wait - 5) < 0.1, r.wait);
  check('准点: 撞上间隔 ≈ 10 (无偏置)', Math.abs(r.seen - 10) < 0.1, r.seen);
}
// 2. 泊松: 等待 = 10 (无记忆), 撞上间隔 = 20 (两倍!)
{
  const r = run('exp', 0, 2);
  check('泊松: 平均等待 ≈ 10 (±3%)', Math.abs(r.wait / 10 - 1) < 0.03, r.wait);
  check('泊松: 撞上间隔 ≈ 20 = 2×E[L] (±3%)', Math.abs(r.seen / 20 - 1) < 0.03, r.seen);
}
// 3. 均匀(0,20): E[L²]/E[L] = (400/3)/10 = 13.33, 等待 6.67
{
  const r = run('uniform', 0, 3);
  const mo = intervalMoments('uniform', 10, 0);
  check('均匀: 撞上间隔 ≈ 13.33 (±3%)', Math.abs(r.seen / (mo.EL2 / mo.EL) - 1) < 0.03, r.seen);
  check('均匀: 等待 ≈ 6.67 (±3%)', Math.abs(r.wait / (mo.EL2 / 20) - 1) < 0.03, r.wait);
}
// 4. 帕累托 α=3: E[L]=10 校准; E[L²] = α·xm²/(α−2) 有限, 公式对照
{
  const rng = mulberry32(4);
  const sampler = makeInterval('pareto', 10, 3);
  let s = 0, n = 3e5;
  for (let i = 0; i < n; i++) s += sampler(rng);
  check('帕累托 α=3: E[L] 校准为 10 (±2%)', Math.abs(s / n / 10 - 1) < 0.02, s / n);
  const mo = intervalMoments('pareto', 10, 3);
  const r = run('pareto', 3, 5);
  check('帕累托 α=3: 撞上间隔 ≈ E[L²]/E[L] (±8%)', Math.abs(r.seen / (mo.EL2 / mo.EL) - 1) < 0.08, [r.seen, mo.EL2 / mo.EL]);
}
// 5. 帕累托 α=1.8: E[L²]=∞ → 实测等待随样本规模上涨(不收敛)
{
  const mo = intervalMoments('pareto', 10, 1.8);
  check('α=1.8: 理论 E[L²] = ∞', mo.EL2 === Infinity);
  const w1 = run('pareto', 1.8, 6).wait;
  // 更大规模: 均值应显著更大(重尾无收敛; 用两个独立种子的规模差)
  const rng = mulberry32(7);
  const sampler = makeInterval('pareto', 10, 1.8);
  let sw = 0, n = 0;
  for (let rep = 0; rep < 400; rep++)
    simulate(sampler, 500, 1000, rng, { wait(w) { sw += w; n++; } });
  const w2 = sw / n;
  check(`α=1.8: 等待估计不稳定/持续增大 (小规模 ${w1.toFixed(1)} → 大规模 ${w2.toFixed(1)})`, w2 > w1 * 1.15, [w1, w2]);
}
// 6. simulate 的乘客落点按长度加权: 固定间隔下等待 ~ U(0,10) → 方差 ≈ 100/12
{
  const rng = mulberry32(8);
  const sampler = makeInterval('fixed', 10, 0);
  let s = 0, s2 = 0, n = 0;
  simulate(sampler, 200, 20000, rng, { wait(w) { s += w; s2 += w * w; n++; } });
  const m = s / n, v = s2 / n - m * m;
  check('固定间隔: 等待方差 ≈ 100/12 (±5%)', Math.abs(v / (100 / 12) - 1) < 0.05, v);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
