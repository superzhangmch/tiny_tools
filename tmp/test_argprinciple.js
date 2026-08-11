const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/complex_analysis/argument_principle.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const pre = html.match(/\/\/ =+ 复数运算[\s\S]*?\/\/ =+ 编译器结束 =+/)[0].replace("'use strict';", '');
const { compileExpr, argAccum, windingRaw, findPolesOf, multAt, recipF } =
  new Function(pre + '\n' + core + '\nreturn {compileExpr, argAccum, windingRaw, findPolesOf, multAt, recipF};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, JSON.stringify(extra)); }
};
const circle = (cx, cy, r, n = 720) => {
  const P = [];
  for (let i = 0; i <= n; i++) { const t = 2*Math.PI*i/n; P.push([cx + r*Math.cos(t), cy + r*Math.sin(t)]); }
  return P;
};
const turns = (f, path) => argAccum(compileExpr(f), path) / (2*Math.PI);

check('f=z, 单位圆: 1.000 圈', Math.abs(turns('z', circle(0,0,1)) - 1) < 1e-3, turns('z', circle(0,0,1)));
check('f=z², 单位圆: 2.000 圈', Math.abs(turns('z^2', circle(0,0,1)) - 2) < 1e-3);
check('f=(z²−1)/z, 大圆: 1 圈 (2零−1极)', Math.abs(turns('(z^2-1)/z', circle(0,0,2)) - 1) < 1e-3);
check('f=(z−1)³/(z+1)², 大圆: 1 圈 (3−2)', Math.abs(turns('(z-1)^3/(z+1)^2', circle(0,0,2)) - 1) < 1e-3);
check('f=eᶻ, 任意圆: 0 圈', Math.abs(turns('exp(z)', circle(0.3,-0.2,1.5))) < 1e-3);
check('开口 60% 弧: 圈数连续非整', (() => {
  const arc = [];
  for (let i = 0; i <= 400; i++) { const t = 2*Math.PI*0.6*i/400; arc.push([Math.cos(t), Math.sin(t)]); }
  const v = turns('z', arc);
  return Math.abs(v - 0.6) < 5e-3;
})());
// 零极点探测 + 实测阶
{
  const F = compileExpr('(z-1)^3/(z+1)^2');
  const poles = findPolesOf(F, 2.5);
  const zeros = findPolesOf(recipF(F), 2.5);
  check('探测: 1 个极点 at -1', poles.length === 1 && Math.hypot(poles[0][0]+1, poles[0][1]) < 1e-3, poles);
  check('探测: 1 个零点 at 1', zeros.length === 1 && Math.hypot(zeros[0][0]-1, zeros[0][1]) < 1e-3, zeros);
  check('实测阶: 零点 +3', Math.abs(multAt(F, zeros[0][0], zeros[0][1]) - 3) < 1e-2, multAt(F, zeros[0][0], zeros[0][1]));
  check('实测阶: 极点 -2', Math.abs(multAt(F, poles[0][0], poles[0][1]) + 2) < 1e-2, multAt(F, poles[0][0], poles[0][1]));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
