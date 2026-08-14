const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/probability/bayes_update.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { mulberry32, posterior, gridStats, tvGrid } =
  new Function(core + '\nreturn {mulberry32, posterior, gridStats, tvGrid};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
const K = 256;
const flat = new Float64Array(K).fill(1);

// 1. 均匀先验 + (h,t) → Beta(h+1, t+1): 均值 (h+1)/(h+t+2), 众数 h/(h+t)
{
  const p = posterior(flat, 7, 3);
  const s = gridStats(p);
  check('Beta(8,4) 均值 = 8/12 (±网格)', Math.abs(s.mean - 8 / 12) < 0.003, s.mean);
  check('Beta(8,4) MAP = 0.7 (±网格)', Math.abs(s.map - 0.7) < 0.005, s.map);
  const sdTh = Math.sqrt(8 * 4 / (12 * 12 * 13));
  check('Beta(8,4) 标准差符合', Math.abs(s.sd - sdTh) < 0.003, [s.sd, sdTh]);
}
// 2. 后验收窄 ~ 1/√n
{
  const s1 = gridStats(posterior(flat, 60, 40));
  const s2 = gridStats(posterior(flat, 600, 400));
  check('n×10 → 标准差 ≈ /√10 (±10%)', Math.abs(s1.sd / s2.sd / Math.sqrt(10) - 1) < 0.1, s1.sd / s2.sd);
}
// 3. 大数下溢安全: n = 1e5 不 NaN 且集中在真值
{
  const p = posterior(flat, 62000, 38000);
  const s = gridStats(p);
  check('n=1e5: 无下溢, 均值 ≈ 0.62', isFinite(s.mean) && Math.abs(s.mean - 0.62) < 0.003, s.mean);
}
// 4. 禁区先验: 0 的地方永远是 0; 真值在禁区 → 学不到
{
  const zp = new Float64Array(K);
  for (let i = 0; i < K; i++) { const t = (i + 0.5) / K; zp[i] = t > 0.5 && t < 0.8 ? 0 : 1; }
  const p = posterior(zp, 650, 350);           // 真值 0.65 在禁区
  let massIn = 0;
  for (let i = 0; i < K; i++) { const t = (i + 0.5) / K; if (t > 0.5 && t < 0.8) massIn += p[i]; }
  const s = gridStats(p);
  check('禁区内后验质量 = 0', massIn === 0);
  check('后验被顶在禁区边界 0.5 或 0.8', Math.abs(s.map - 0.5) < 0.02 || Math.abs(s.map - 0.8) < 0.02, s.map);
}
// 5. 殊途同归: 两个不同的正先验, n 大时 TV → 小
{
  const pr2 = new Float64Array(K);
  for (let i = 0; i < K; i++) pr2[i] = 0.05 + Math.exp(-((((i + 0.5) / K - 0.2) / 0.06) ** 2));
  const tvSmall = tvGrid(posterior(flat, 12, 8), posterior(pr2, 12, 8));
  const tvBig = tvGrid(posterior(flat, 1200, 800), posterior(pr2, 1200, 800));
  check(`殊途同归: TV ${tvSmall.toFixed(3)} → ${tvBig.toFixed(4)}`, tvBig < tvSmall / 5 && tvBig < 0.05, [tvSmall, tvBig]);
}
// 6. 先验全 0 → 全 0 输出(不崩)
{
  const p = posterior(new Float64Array(K), 5, 5);
  check('全 0 先验 → 全 0 后验', p.every(v => v === 0));
}
// 7. 端到端: 模拟抛硬币, 后验均值 → 真值
{
  const rng = mulberry32(3);
  let h = 0, t = 0;
  const th = 0.37;
  for (let i = 0; i < 5000; i++) (rng() < th ? h++ : t++);
  const s = gridStats(posterior(flat, h, t));
  check('5000 次后 |均值−θ*| < 0.02', Math.abs(s.mean - th) < 0.02, s.mean);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
