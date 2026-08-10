const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/complex_analysis/fundamental_theorem_of_algebra.html', 'utf8');
const core = html.match(/\/\/ -+ 复数与多项式 -+[\s\S]*?(?=\/\/ -+ 全局状态)/)[0];
const api = new Function(core + 'return {evalPoly, parseCoefs, cauchyR, durandKerner};')();
const { evalPoly, parseCoefs, durandKerner } = api;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra ?? ''); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// 1. 求值
{
  const [a, b] = evalPoly([1, 0, 0, 0, 0, -1], 1, 0);      // z^5-1 at 1
  check('evalPoly z=1', near(a, 0) && near(b, 0));
  const [c, d] = evalPoly([1, 0, 0, 0, 0, -1], 0, 1);      // at i: i-1
  check('evalPoly z=i', near(c, -1) && near(d, 1));
}
// 2. DK: z^5-1
{
  const rs = durandKerner([1, 0, 0, 0, 0, -1]);
  check('DK z^5-1: 5 根都在单位圆上', rs.length === 5 && rs.every(z => near(Math.hypot(...z), 1, 1e-8)));
  const resid = rs.map(z => Math.hypot(...evalPoly([1, 0, 0, 0, 0, -1], z[0], z[1])));
  check('DK z^5-1: 残差', resid.every(r => r < 1e-8), resid);
  check('DK z^5-1: 含实根 1', rs.some(z => near(z[0], 1, 1e-8) && near(z[1], 0, 1e-8)));
}
// 3. DK: (z^2-2)(z^3-3)
{
  const rs = durandKerner([1, 0, -2, -3, 0, 6]);
  const mods = rs.map(z => Math.hypot(...z)).sort((a, b) => a - b);
  check('DK 乘积多项式模: √2,√2,cbrt3×3',
    near(mods[0], Math.SQRT2, 1e-7) && near(mods[1], Math.SQRT2, 1e-7) &&
    mods.slice(2).every(m => near(m, Math.cbrt(3), 1e-7)), mods);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
