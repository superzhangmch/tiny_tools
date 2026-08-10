const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../demo/topology/topology_intro.html', 'utf8');
const core = html.match(/\/\/ =+ 核心算法[\s\S]*?(?=\/\/ =+ 核心结束)/)[0].replace("'use strict';", '');
const { HOLES, windingAround, curveLength, resampleClosed, contractToEnd, betti, loopWord, wordStr } =
  new Function(core + 'return {HOLES, windingAround, curveLength, resampleClosed, contractToEnd, betti, loopWord, wordStr};')();

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('ok  ', name); }
  else { fail++; console.log('FAIL', name, JSON.stringify(extra)); }
};
const circle = (cx, cy, r, turns = 1, steps = 90) => {
  const P = [];
  for (let i = 0; i < steps * turns; i++) {
    const t = 2 * Math.PI * turns * i / (steps * turns);
    P.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return P;
};

// --- 绕数 ---
check('绕数: 圆绕 A 一圈', windingAround(circle(HOLES[0].x, HOLES[0].y, 95), HOLES[0].x, HOLES[0].y) === 1);
check('绕数: 同一圆对 B 为 0', windingAround(circle(HOLES[0].x, HOLES[0].y, 95), HOLES[1].x, HOLES[1].y) === 0);
check('绕数: 两圈', windingAround(circle(HOLES[0].x, HOLES[0].y, 95, 2), HOLES[0].x, HOLES[0].y) === 2);

// --- 收缩 ---
{
  const r = contractToEnd(circle(360, 330, 50), HOLES);
  check('不围洞的环: 缩成点', r.collapsed === true, r);
}
{
  const r = contractToEnd(circle(HOLES[0].x, HOLES[0].y, 95), HOLES);
  check('绕 A 的环: 卡住且 H₁=(1,0)', !r.collapsed && r.winds[0] === 1 && r.winds[1] === 0, r);
}
{
  const r = contractToEnd(circle(360, 200, 175), HOLES);
  check('围两洞: 卡住且 H₁=(1,1)', !r.collapsed && r.winds[0] === 1 && r.winds[1] === 1, r);
}
{
  // 换位子 aba⁻¹b⁻¹: 复刻页面的 makePreset('comm')
  const P = [], push = (x, y) => P.push([x, y]);
  const base = [360, 335];
  const lasso = (h, dir) => {
    push(...base);
    const ang = Math.atan2(base[1] - h.y, base[0] - h.x), r = 70;
    push(h.x + r * Math.cos(ang), h.y + r * Math.sin(ang));
    for (let i = 1; i <= 72; i++) {
      const t = ang + dir * 2 * Math.PI * i / 72;
      push(h.x + r * Math.cos(t), h.y + r * Math.sin(t));
    }
    push(...base);
  };
  lasso(HOLES[0], 1); lasso(HOLES[1], 1); lasso(HOLES[0], -1); lasso(HOLES[1], -1);
  const w0 = [windingAround(P, HOLES[0].x, HOLES[0].y), windingAround(P, HOLES[1].x, HOLES[1].y)];
  check('换位子: 初始绕数 (0,0)', w0[0] === 0 && w0[1] === 0, w0);
  const r = contractToEnd(P, HOLES);
  check('换位子: 绕数(0,0)却缩不掉(同调盲区!)', !r.collapsed && r.len > 100, { collapsed: r.collapsed, len: r.len });
}

// --- 割线读词 ---
{
  const tok = w => w.map(l => 'ab'[l.h] + (l.s > 0 ? '' : "'")).join('');
  const wa = loopWord(circle(HOLES[0].x, HOLES[0].y, 95), HOLES);
  check("读词: 绕A一圈 = a", tok(wa.reduced) === 'a', tok(wa.reduced));
  const wa2 = loopWord(circle(HOLES[0].x, HOLES[0].y, 95, 2), HOLES);
  check("读词: 绕A两圈 = aa", tok(wa2.reduced) === 'aa', tok(wa2.reduced));
  const wt = loopWord(circle(360, 330, 50), HOLES);
  check('读词: 不围洞 = 空词', wt.reduced.length === 0, tok(wt.reduced));
  // 换位子
  const P = [], push = (x, y) => P.push([x, y]);
  const base = [360, 335];
  const lasso = (h, dir) => {
    push(...base);
    const ang = Math.atan2(base[1] - h.y, base[0] - h.x), r = 70;
    push(h.x + r * Math.cos(ang), h.y + r * Math.sin(ang));
    for (let i = 1; i <= 72; i++) {
      const t = ang + dir * 2 * Math.PI * i / 72;
      push(h.x + r * Math.cos(t), h.y + r * Math.sin(t));
    }
    push(...base);
  };
  lasso(HOLES[0], 1); lasso(HOLES[1], 1); lasso(HOLES[0], -1); lasso(HOLES[1], -1);
  const wc = loopWord(P, HOLES);
  check("读词: 换位子 = aba'b' (非空!)", tok(wc.reduced) === "aba'b'", tok(wc.reduced));
  // 指数和 = 绕数(同调 = 同伦的交换化, 逐洞验证)
  for (const [name, pts] of [['a2', circle(HOLES[0].x, HOLES[0].y, 95, 2)], ['comm', P]]) {
    const w = loopWord(pts, HOLES);
    const sums = [0, 0];
    for (const l of w.reduced) sums[l.h] += l.s;
    const winds = HOLES.map(h => windingAround(pts, h.x, h.y));
    check(`读词: ${name} 指数和 = 绕数`, sums[0] === winds[0] && sums[1] === winds[1], { sums, winds });
  }
}

// --- Betti ---
const S = arr => new Set(arr);
check('betti: 空', JSON.stringify(betti(S([])).b0 + ',' + betti(S([])).b1) === JSON.stringify('0,0'));
{
  const b = betti(S(['0,0']));
  check('betti: 单格 (1,0)', b.b0 === 1 && b.b1 === 0, b);
}
{
  const cellsFull = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) cellsFull.push(x + ',' + y);
  const b = betti(S(cellsFull));
  check('betti: 3×3 实心 (1,0)', b.b0 === 1 && b.b1 === 0, b);
  const b2 = betti(S(cellsFull.filter(k => k !== '1,1')));
  check('betti: 3×3 挖心 (1,1)', b2.b0 === 1 && b2.b1 === 1, b2);
}
{
  const b = betti(S(['0,0', '5,5']));
  check('betti: 两个孤立格 (2,0)', b.b0 === 2 && b.b1 === 0, b);
}
{
  // 两个分离的挖心方环 → (2,2)
  const cs = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
    if (x === 1 && y === 1) continue;
    cs.push(x + ',' + y); cs.push((x + 10) + ',' + y);
  }
  const b = betti(S(cs));
  check('betti: 双环 (2,2)', b.b0 === 2 && b.b1 === 2, b);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
