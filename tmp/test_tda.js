const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/topology/tda_rips.html', 'utf8');
const core = html.match(/\/\/ =+ 核心算法[\s\S]*?(?=\/\/ =+ 核心结束)/)[0].replace("'use strict';", '');
const { buildRips, persistence, aliveCount } =
  new Function(core + 'return {buildRips, persistence, aliveCount};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, JSON.stringify(extra)); }
};

// 1. 正六边形(R=60): 六边形边长 = 60, 环生于 ε=60, 死于 √3·60 ≈ 103.9(跨一点的弦出现, 三角形填洞)
{
  const pts = Array.from({ length: 6 }, (_, i) => {
    const t = 2 * Math.PI * i / 6;
    return [200 + 60 * Math.cos(t), 200 + 60 * Math.sin(t)];
  });
  const bars = persistence(pts);
  const h1 = bars.filter(b => b.dim === 1);
  check('六边形: 恰一根 H₁ 条', h1.length === 1, h1);
  check('六边形: H₁ 生于 ≈60', Math.abs(h1[0].birth - 60) < 1, h1[0]);
  check('六边形: H₁ 死于 ≈103.9', Math.abs(h1[0].death - 60 * Math.sqrt(3)) < 1, h1[0]);
  const h0inf = bars.filter(b => b.dim === 0 && b.death === Infinity);
  check('六边形: 恰一根 H₀ 无穷条', h0inf.length === 1, h0inf.length);
  check('六边形: ε=80 时 b₀=1, b₁=1',
    aliveCount(bars, 0, 80) === 1 && aliveCount(bars, 1, 80) === 1);
  check('六边形: ε=120 时 b₁=0', aliveCount(bars, 1, 120) === 0);
}
// 2. 两簇(相距 300 > maxEps): 两根无穷 H₀ 条
{
  const pts = [];
  for (const cx of [100, 400]) for (let i = 0; i < 8; i++)
    pts.push([cx + (i % 3) * 12, 200 + Math.floor(i / 3) * 12]);
  const bars = persistence(pts);
  check('两簇: 大 ε 时 b₀=2', aliveCount(bars, 0, 150) === 2);
  // 网格点阵会有短命 H₁(方格 12→对角 17), 这正是"短条=噪声"; 只断言没有长条
  const longH1 = bars.filter(b => b.dim === 1 && b.death - b.birth > 10);
  check('两簇: 无长命 H₁ 条(短条=噪声可以有)', longH1.length === 0, longH1);
}
// 3. buildRips 基础
{
  const pts = [[0, 0], [30, 0], [15, 25]];
  const r1 = buildRips(pts, 20);
  check('Rips: ε=20 无边', r1.edges.length === 0);
  const r2 = buildRips(pts, 31);
  check('Rips: ε=31 三边一三角', r2.edges.length === 3 && r2.tris.length === 1, r2);
}
// 4. 一致性: 六边形在多个 ε 上, aliveCount(H₀/H₁) 与直接从复形计算一致
{
  const pts = Array.from({ length: 6 }, (_, i) => {
    const t = 2 * Math.PI * i / 6;
    return [200 + 60 * Math.cos(t), 200 + 60 * Math.sin(t)];
  });
  const bars = persistence(pts);
  for (const eps of [30, 61, 104, 130]) {
    const { edges } = buildRips(pts, eps);
    // b0 via 并查集
    const par = pts.map((_, i) => i);
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (const [i, j] of edges) { const ra = find(i), rb = find(j); if (ra !== rb) par[ra] = rb; }
    const b0 = new Set(pts.map((_, i) => find(i))).size;
    check(`一致性 ε=${eps}: b₀`, aliveCount(bars, 0, eps) === b0,
      { fromBars: aliveCount(bars, 0, eps), direct: b0 });
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
