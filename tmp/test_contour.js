const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/complex_analysis/contour_integral.html', 'utf8');
const core = html.match(/\/\/ =+ 复数运算[\s\S]*?\/\/ =+ 核心结束 =+/)[0].replace("'use strict';", '');
const { compileExpr, contourIntegral, circlePts, residueAt, findPoles, windingOf } =
  new Function(core + '\nreturn {compileExpr, contourIntegral, circlePts, residueAt, findPoles, windingOf};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, JSON.stringify(extra)); }
};
const near = (v, er, ei, eps = 1e-3) => Math.abs(v[0] - er) < eps && Math.abs(v[1] - ei) < eps;
const PI2 = 2 * Math.PI;

// 1. 母积分 ∮dz/z = 2πi
{
  const f = compileExpr('1/z');
  check('∮dz/z 单位圆 = 2πi', near(contourIntegral(f, circlePts(0, 0, 1)), 0, PI2), contourIntegral(f, circlePts(0, 0, 1)));
  // 绕两圈 = 4πi
  const two = [];
  for (let i = 0; i < 1024; i++) {
    const t = 4 * Math.PI * i / 1024;
    two.push([1.3 * Math.cos(t), 1.3 * Math.sin(t)]);
  }
  two.push(two[0].slice());          // 路径原样语义: 显式闭合
  check('绕两圈 = 4πi', near(contourIntegral(f, two), 0, 2 * PI2, 5e-3), contourIntegral(f, two));
}
// 2. 1/z^2: 有奇点但留数为 0 → 回路积分 0
{
  const f = compileExpr('1/z^2');
  check('∮dz/z² = 0', near(contourIntegral(f, circlePts(0, 0, 1)), 0, 0), contourIntegral(f, circlePts(0, 0, 1)));
  const r = residueAt(f, 0, 0);
  check('Res(1/z², 0) = 0', near(r, 0, 0, 1e-4), r);
}
// 3. 1/(z²+1): 极点 ±i, Res(i) = 1/(2i) = -i/2
{
  const f = compileExpr('1/(z^2+1)');
  const r = residueAt(f, 0, 1);
  check('Res(1/(z²+1), i) = -0.5i', near(r, 0, -0.5, 1e-3), r);
  // 只圈 i: ∮ = 2πi·(-i/2) = π
  const I = contourIntegral(f, circlePts(0, 1, 0.5));
  check('只圈 i: ∮ = π', near(I, Math.PI, 0), I);
  // 极点探测应找到 ±i
  const ps = findPoles(f, 0, 0, 2.5);
  const hasI = ps.some(p => Math.hypot(p[0], p[1] - 1) < 1e-4);
  const hasMI = ps.some(p => Math.hypot(p[0], p[1] + 1) < 1e-4);
  check('findPoles 找到 ±i 且无冗余', hasI && hasMI && ps.length === 2, ps);
}
// 4. e^z/z: Res = 1 → 2πi
{
  const f = compileExpr('exp(z)/z');
  check('∮eᶻ/z = 2πi', near(contourIntegral(f, circlePts(0, 0, 1)), 0, PI2), contourIntegral(f, circlePts(0, 0, 1)));
}
// 5. 无奇点(z²): 任意疯狂闭合曲线 = 0 (Cauchy 定理)
{
  const f = compileExpr('z^2');
  const wild = [];
  for (let i = 0; i < 600; i++) {
    const t = 2 * Math.PI * i / 600;
    const r = 1 + 0.5 * Math.sin(5 * t) + 0.25 * Math.sin(11 * t + 1);
    wild.push([r * Math.cos(t) + 0.3, r * Math.sin(t) - 0.2]);
  }
  wild.push(wild[0].slice());        // 显式闭合
  const I = contourIntegral(f, wild);
  check('z² 沿疯狂曲线 = 0 (Cauchy)', Math.hypot(...I) < 1e-3, I);
}
// 6. 二阶极点带留数: 1/(z(z-1)²), Res(0)=1, Res(1)=-1
{
  const f = compileExpr('1/(z*(z-1)^2)');
  const r0 = residueAt(f, 0, 0), r1 = residueAt(f, 1, 0);
  check('Res(0) = 1', near(r0, 1, 0, 1e-3), r0);
  check('Res(1) = -1 (二阶极点)', near(r1, -1, 0, 1e-3), r1);
  // 大圆包两个: 2πi(1-1) = 0
  const I = contourIntegral(f, circlePts(0.5, 0, 1.8, 1024));
  check('包两极点: ∮ = 0', Math.hypot(...I) < 5e-3, I);
}
// 7. 绕数计算
{
  check('windingOf 圆 = 1', windingOf(circlePts(0, 0, 1), 0, 0) === 1);
  check('windingOf 圆对外部点 = 0', windingOf(circlePts(0, 0, 1), 2, 0) === 0);
}
// 8. 开口路径: 绕数连续(画 95% 圈 → 实测 ≈ 0.95, 不跳变)
{
  const core2 = fs.readFileSync(__dirname + '/../demo/complex_analysis/contour_integral.html', 'utf8')
    .match(/\/\/ =+ 复数运算[\s\S]*?\/\/ =+ 核心结束 =+/)[0].replace("'use strict';", '');
  const { windingRaw } = new Function(core2 + '\nreturn {windingRaw};')();
  const arc = [];
  for (let i = 0; i <= 500; i++) {
    const t = 2 * Math.PI * 0.95 * i / 500;
    arc.push([Math.cos(t), Math.sin(t)]);
  }
  const w = windingRaw(arc, 0, 0);
  check('开口 95% 圈: 实测绕数 ≈ 0.95', Math.abs(w - 0.95) < 0.005, w);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
