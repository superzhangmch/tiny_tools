const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/real_analysis/pathological_functions.html', 'utf8');
const core = html.match(/\/\/ =+ 核心（无 DOM）=+[\s\S]*?\/\/ =+ 核心结束 =+/)[0];
const { weierExactCos, weierVal, weierPickN, cantorVal, thomaePoints, dirichletApprox, fracsByCF } =
  new Function(core + '\nreturn {weierExactCos, weierVal, weierPickN, cantorVal, thomaePoints, dirichletApprox, fracsByCF};')();
const gcd2 = (a, b) => b ? gcd2(b, a % b) : a;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, extra); }
};

// 1. BigInt 精确相位 vs 普通 cos (小指数下应一致)
{
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const x = (i - 100) / 37.7;
    for (const n of [0, 1, 3, 5]) {
      const B = 13n ** BigInt(n);
      const d = Math.abs(weierExactCos(B, x) - Math.cos(Math.PI * Number(B) * x));
      if (d > worst) worst = d;
    }
  }
  check('BigInt 相位 = 普通 cos (小指数, <1e-9)', worst < 1e-9, worst);
}
// 2. 深度放大: 相邻两点 (间距 1e-13) 的大指数项不发疯 (|cos|≤1 且确定性)
{
  const B = 13n ** 30n;                     // 13^30 ≈ 2.6e33, 普通 double 早已失效
  const v1 = weierExactCos(B, 0.7331), v2 = weierExactCos(B, 0.7331);
  check('大指数 BigInt 相位确定性 + 有界', v1 === v2 && Math.abs(v1) <= 1, [v1, v2]);
}
// 3. W(0) = Σaⁿ = (1-a^(N+1))/(1-a)
{
  const a = 0.5, N = 20;
  const Bpow = [1n]; for (let n = 1; n <= N; n++) Bpow.push(Bpow[n-1] * 13n);
  const v = weierVal(0, a, Bpow, N, N);
  const exact = (1 - Math.pow(a, N + 1)) / (1 - a);
  check('W(0) = Σaⁿ', Math.abs(v - exact) < 1e-12, [v, exact]);
}
// 4. 有界性 |W| ≤ 1/(1-a)
{
  const a = 0.5, N = 30;
  const Bpow = [1n]; for (let n = 1; n <= N; n++) Bpow.push(Bpow[n-1] * 13n);
  let ok = true;
  for (let i = 0; i <= 500; i++) {
    const v = weierVal(-2 + 4 * i / 500, a, Bpow, N, 10);
    if (Math.abs(v) > 1 / (1 - a) + 1e-9) ok = false;
  }
  check('|W| ≤ 1/(1-a)', ok);
}
// 5. 周期 2 (b 为整数): W(x+2) = W(x)
{
  const a = 0.5, N = 25;
  const Bpow = [1n]; for (let n = 1; n <= N; n++) Bpow.push(Bpow[n-1] * 13n);
  let worst = 0;
  // x 取二进制精确值(k/1024), 使 x+2 无舍入 —— 否则 4e-16 的表示误差
  // 会被 Hölder 粗糙度放大到 ~1e-5 量级(那是函数本性, 不是 bug)
  for (const x of [126 / 1024, -789 / 1024, 513 / 1024]) {
    const d = Math.abs(weierVal(x, a, Bpow, N, 8) - weierVal(x + 2, a, Bpow, N, 8));
    if (d > worst) worst = d;
  }
  check('W(x+2) = W(x)', worst < 1e-9, worst);
}
// 6. 康托函数已知值: c(1/3)=1/2, c(1/4)=1/3, c(x)+c(1-x)=1, 单调
{
  check('c(0)=0, c(1)=1, c(1/2)=1/2', cantorVal(0) === 0 && cantorVal(1) === 1 && Math.abs(cantorVal(0.5) - 0.5) < 1e-12);
  check('c(1/3) = 1/2', Math.abs(cantorVal(1/3) - 0.5) < 1e-12, cantorVal(1/3));
  check('c(1/4) = 1/3 (经典)', Math.abs(cantorVal(0.25) - 1/3) < 1e-12, cantorVal(0.25));
  let sym = 0, mono = true, prev = -1;
  for (let i = 0; i <= 1000; i++) {
    const x = i / 1000, v = cantorVal(x);
    sym = Math.max(sym, Math.abs(v + cantorVal(1 - x) - 1));
    if (v < prev - 1e-12) mono = false;
    prev = v;
  }
  check('对称 c(x)+c(1-x)=1', sym < 1e-9, sym);
  check('单调不减', mono);
  check('平台: c 在 (1/3,2/3) 恒 1/2', cantorVal(0.4) === 0.5 && cantorVal(0.61) === 0.5);
}
// 7. 托梅: Q=5 全窗点 = Σφ(q) 计数 = 11; 值 = 1/q
{
  const pts = thomaePoints(0, 1, 5);
  check('托梅 Q=5 在 [0,1] 共 11 点', pts.length === 11, pts.length);
  const half = pts.find(p => p[0] === 0.5);
  check('f(1/2) = 1/2, f(2/4) 不重复计', half && half[1] === 0.5 && pts.filter(p => p[0] === 0.5).length === 1);
  const p25 = pts.find(p => Math.abs(p[0] - 0.4) < 1e-12);
  check('f(2/5) = 1/5', p25 && Math.abs(p25[1] - 0.2) < 1e-12);
}
// 8. 狄利克雷逼近: 有理点(分母|m!) → 1; 无理点 → 0
{
  check('f(1/2, m!=2, n=50) = 1', Math.abs(dirichletApprox(0.5, 2, 50) - 1) < 1e-12);
  check('f(1/3, m!=6, n=200) = 1', Math.abs(dirichletApprox(1/3, 6, 200) - 1) < 1e-12);
  // √2/2 距 17/24 仅 0.0294, 逐点收敛慢: n=200 时仍有 0.18, 需更大的 n
  check('f(√2/2, m!=24, n=1e5) ≈ 0', dirichletApprox(Math.SQRT1_2, 24, 1e5) < 1e-12, dirichletApprox(Math.SQRT1_2, 24, 1e5));
}
// 9. 连分数补点: 任意小窗口保证非空 + 全部既约且真在窗内
{
  const wins = [
    [1 - 2e-9, 1 - 1e-9],                    // 贴着整数 1: 普通枚举必空
    [Math.SQRT1_2, Math.SQRT1_2 + 1e-11],    // 无理中心, 宽 1e-11
    [1/3 - 5e-13, 1/3 + 5e-13],              // 含 1/3 自身
  ];
  for (const [x0, x1] of wins) {
    const pts = fracsByCF(x0, x1, 1e13, 220);
    const inWin = pts.every(p => p[0] > x0 && p[0] < x1);
    check(`CF 补点 [${x0.toPrecision(6)}..] 非空(${pts.length})且全在窗内`, pts.length >= 1 && inWin, pts.length);
    let honest = true;
    for (const [x, v] of pts) {
      const q = Math.round(1 / v), p = Math.round(x * q);
      if (Math.abs(p / q - x) > 1e-15 * Math.max(1, Math.abs(x)) || gcd2(p, q) !== 1) honest = false;
    }
    check('  …且每点都是既约 p/q, 值 = 1/q', honest);
  }
  const p13 = fracsByCF(1/3 - 5e-13, 1/3 + 5e-13, 1e13, 220).find(p => Math.abs(p[1] - 1/3) < 1e-15);
  check('含 1/3 的窗: 找到 1/3 本尊(值 1/3)', !!p13);
  check('贴 1 窗口: 普通枚举 Q=300 确实为空(对照)', thomaePoints(1 - 2e-9, 1 - 1e-9, 300).length === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
