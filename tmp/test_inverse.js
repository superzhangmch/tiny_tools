const fs = require('fs');
const inv = fs.readFileSync(__dirname + '/../demo/complex_analysis/boundary_inverse.html', 'utf8');
const core = inv.match(/\/\/ =+ 核心数学[\s\S]*?(?=\/\/ =+ 核心结束)/)[0].replace("'use strict';", '');
const { M, K, coeffsFromCurve, makeF, landscapeExpr, cexp } =
  new Function(core + 'return {M, K, coeffsFromCurve, makeF, landscapeExpr, cexp};')();

const land = fs.readFileSync(__dirname + '/../demo/complex_analysis/complex_landscape.html', 'utf8');
const lcore = land.match(/\/\/ =+ 复数运算[\s\S]*?(?=\/\/ =+ 编译器结束)/)[0].replace("'use strict';", '');
const { compileExpr } = new Function(lcore + 'return {compileExpr};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra ?? ''); }
};

// 1. e^{cosθ} 应反推出 e^z
{
  const m = Array.from({ length: M }, (_, j) => Math.exp(Math.cos(2 * Math.PI * j / M)));
  const c = coeffsFromCurve(m);
  check('e^cosθ: c0≈0, c1≈0.5', Math.abs(c[0][0]) < 1e-10 && Math.abs(c[1][0] - 0.5) < 1e-10,
        [c[0][0], c[1][0]]);
  const F = makeF(c, []);
  const v = F(0.3, 0.4), e = cexp([0.3, 0.4]);
  check('e^cosθ: F ≈ e^z 内点', Math.hypot(v[0] - e[0], v[1] - e[1]) < 1e-9, v);
}
// 2. 常数
{
  const c = coeffsFromCurve(new Array(M).fill(2));
  const F = makeF(c, []);
  const v = F(0.5, -0.3);
  check('常数2: F ≡ 2', Math.abs(v[0] - 2) < 1e-9 && Math.abs(v[1]) < 1e-9, v);
}
// 3. 双峰曲线: 边界重构精度
{
  const m = Array.from({ length: M }, (_, j) =>
    1 + 0.7 * Math.exp(-30 * (j / M - 0.28) ** 2) + 0.5 * Math.exp(-40 * (j / M - 0.7) ** 2));
  const F = makeF(coeffsFromCurve(m), []);
  let err = 0;
  for (let j = 0; j < M; j++) {
    const th = 2 * Math.PI * j / M;
    err = Math.max(err, Math.abs(Math.hypot(...F(Math.cos(th), Math.sin(th))) - m[j]));
  }
  check('双峰: 边界重构最大偏差 < 0.02', err < 0.02, err);
}
// 4. Blaschke: 边界模不变 + 零点归零
{
  const m = Array.from({ length: M }, (_, j) => 1 + 0.4 * Math.sin(2 * Math.PI * j / M + 1));
  const c = coeffsFromCurve(m);
  const F0 = makeF(c, []), FB = makeF(c, [[0.4, 0.2]]);
  let d = 0;
  for (let j = 0; j < M; j++) {
    const th = 2 * Math.PI * j / M;
    d = Math.max(d, Math.abs(Math.hypot(...F0(Math.cos(th), Math.sin(th))) -
                             Math.hypot(...FB(Math.cos(th), Math.sin(th)))));
  }
  check('Blaschke: 边界 |F| 不变', d < 1e-9, d);
  check('Blaschke: F(a) = 0', Math.hypot(...FB(0.4, 0.2)) < 1e-12);
}
// 5. 集成: landscapeExpr 粘回 landscape 编译器, 数值一致
{
  const m = Array.from({ length: M }, (_, j) => {
    const t = 2 * Math.PI * j / M;
    return 1 + 0.45 * Math.sin(t + 1) + 0.3 * Math.sin(3 * t + 2);
  });
  const c = coeffsFromCurve(m);
  const zeros = [[0.3, -0.25]];
  const F = makeF(c, zeros);
  const src = landscapeExpr(c, zeros);
  const G = compileExpr(src);
  let worst = 0;
  for (const [zr, zi] of [[0.3, -0.2], [0.7, 0.1], [-0.5, 0.5], [0.9, 0]]) {
    const a = F(zr, zi), b = G(zr, zi);
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  check('集成: 表达式粘回 landscape 数值一致 (<1e-3)', worst < 1e-3, worst);
  console.log('    表达式片段:', src.slice(0, 110) + '…');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
