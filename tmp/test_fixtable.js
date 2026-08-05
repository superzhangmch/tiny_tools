const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../monospace_render.html', 'utf8');
const rangesJs = html.match(/const ZERO_RANGES[\s\S]*?function charCols\(cp, ambWide\) \{[\s\S]*?\n\}/)[0];
const fixJs = html.match(/function displayWidth[\s\S]*?\n(?=document\.getElementById\('fixBtn'\))/)[0];
const stub = 'const ambWideEl = {checked:false};';
const body = rangesJs + '\n' + stub + '\n' + fixJs + '\nreturn {fixTable, displayWidth};';
const { fixTable, displayWidth } = new Function(body)();

function check(name, text) {
  const fixed = fixTable(text);
  console.log('=== ' + name + ' ===');
  console.log(fixed);
  const ws = fixed.split('\n').filter(l => l.trim()).map(displayWidth);
  console.log('line widths:', ws.join(','), ws.every(w => w === ws[0]) ? 'ALIGNED' : 'MISALIGNED');
}

check('LLM 错位表格（无框线）', [
  '│ 名称     │ 类型   │ 备注       │',
  '│ 深度学习模型 │ model    │ transformer 架构 │',
  '│ 数据 │ data │ 共 10k 条样本 │',
].join('\n'));

check('ASCII 风格 + 边框线', [
  '+------+------+',
  '| 名称 | ok |',
  '| 深度学习 | yes |',
  '+------+------+',
].join('\n'));

check('框线字符表格（已对齐，应保持对齐）', [
  '┌────────────┬──────────┐',
  '│ tiny_tools │ active   │',
  '│ 等宽渲染   │ new      │',
  '└────────────┴──────────┘',
].join('\n'));

// 非表格文本应原样保留
const code = 'def hello():\n    print("你好 world")  # 注释';
console.log('=== 非表格不动 ===', fixTable(code) === code ? 'OK' : 'CHANGED!');
