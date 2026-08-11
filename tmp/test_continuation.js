const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/complex_analysis/analytic_continuation.html', 'utf8');
const core = html.match(/\/\/ =+ 复数运算[\s\S]*?\/\/ =+ 核心结束 =+/)[0].replace("'use strict';", '');
const { compileExpr, taylorFromCircle, evalSeries, radiusEst, buildPade, padeEval, SEED_R } =
  new Function(core + '\nreturn {compileExpr, taylorFromCircle, evalSeries, radiusEst, buildPade, padeEval, SEED_R};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, JSON.stringify(extra)); }
};
function contAt(expr, z) {
  const F = compileExpr(expr);
  const pade = buildPade(taylorFromCircle(F, [0, 0], SEED_R));
  const v = padeEval(pade, z);
  const t = F(z[0], z[1]);
  return { v, t, rel: Math.hypot(v[0] - t[0], v[1] - t[1]) / Math.max(Math.hypot(...t), 1e-9), m: pade.m };
}

{
  const c = taylorFromCircle(compileExpr('exp(z)'), [0, 0], SEED_R);
  let fact = 1, worst = 0;
  for (let n = 0; n <= 9; n++) {
    if (n) fact *= n;
    worst = Math.max(worst, Math.abs(c[n][0] - 1 / fact) + Math.abs(c[n][1]));
  }
  check('种子系数: exp 的 1/n! (可恢复的前10项)', worst < 1e-8, worst);
}
{
  const R = radiusEst(taylorFromCircle(compileExpr('1/(1-z)'), [0, 0], SEED_R));
  check('半径估计 ≈ 1', Math.abs(R - 1) < 0.2, R);
}
{
  const a = contAt('1/(1-z)', [2, 0]);
  check('1/(1-z) 延拓到 2 ≈ -1 (越过发散墙!)', a.rel < 1e-8, a);
  const b = contAt('1/(1-z)', [5, 0]);
  check('1/(1-z) 延拓到 5 ≈ -0.25', b.rel < 1e-8, b);
}
{
  const a = contAt('exp(z)', [2, 0]);
  check('exp 延拓到 2 ≈ e²', a.rel < 1e-2, a);
}
{
  const a = contAt('log(1+z)', [2, 0]);
  check('log(1+z) 延拓到 2 ≈ log3', a.rel < 1e-3, a);
  const b = contAt('log(1+z)', [0, 2]);
  check('log(1+z) 延拓到 2i', b.rel < 1e-3, b);
}
{
  const a = contAt('sqrt(1+z)', [3, 0]);
  check('√(1+z) 延拓到 3 ≈ 2', a.rel < 1e-2, a);
}
{
  const a = contAt('1/(1+z^2)', [3, 0]);
  check('1/(1+z²) 延拓到 3 ≈ 0.1', a.rel < 1e-8, a);
}
{
  const a = contAt('log(1+z)', [-3, 0.02]);
  check('log(1+z) 紧贴枝切: 失准是必然(rel > 1e-3)', a.rel > 1e-3, a);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
