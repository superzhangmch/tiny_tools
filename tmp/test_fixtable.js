const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../monospace_render.html', 'utf8');
const rangesJs = html.match(/const ZERO_RANGES[\s\S]*?function charCols\(cp, ambWide\) \{[\s\S]*?\n\}/)[0];
const fixJs = html.match(/function displayWidth[\s\S]*?\n(?=document\.getElementById\('fixBtn'\))/)[0];
const stub = 'const ambWideEl = {checked:false};';
const body = rangesJs + '\n' + stub + '\n' + fixJs + '\nreturn {fixTable, displayWidth, tableToMarkdown};';
const { fixTable, displayWidth, tableToMarkdown } = new Function(body)();

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

// ============ tableToMarkdown ============

function checkMd(name, text) {
  console.log('=== md: ' + name + ' ===');
  console.log(tableToMarkdown(text));
}

checkMd('每行带框线的终端表格', [
  '┌────────────────────┬────────────────────────────────────────────────────────────────────┐',
  '│         线         │                                状态                                │',
  '├────────────────────┼────────────────────────────────────────────────────────────────────┤',
  '│ 三日六臂           │ 636/900(clean 575),剩 264——08-01/02 全齐,08-03 开跑了(gpt54 38/50) │',
  '├────────────────────┼────────────────────────────────────────────────────────────────────┤',
  '│ dsv4f@Baseten      │ 13/31,追回 11(85%);判官在跑,余 18 案随后                           │',
  '├────────────────────┼────────────────────────────────────────────────────────────────────┤',
  '│ PR #49025          │ Bugbot PASS + CI 全绿(rebase 后),可以 merge                        │',
  '├────────────────────┼────────────────────────────────────────────────────────────────────┤',
  '│ PR #47633(peer 的) │ 他负责                                                             │',
  '└────────────────────┴────────────────────────────────────────────────────────────────────┘',
].join('\n'));

checkMd('只有表头框线（内容行不分隔）', [
  '┌────────────┬──────────┐',
  '│ 名称       │ 状态     │',
  '├────────────┼──────────┤',
  '│ tiny_tools │ active   │',
  '│ 等宽渲染   │ new      │',
  '└────────────┴──────────┘',
].join('\n'));

checkMd('框线间折行的单元格应合并', [
  '┌──────┬──────────────┐',
  '│ 名称 │ 说明         │',
  '├──────┼──────────────┤',
  '│ 折行 │ 这是很长的一 │',
  '│      │ 段被折行的话 │',
  '└──────┴──────────────┘',
].join('\n'));

checkMd('无框线纯 │ 表格', [
  '│ 名称 │ 类型 │',
  '│ 数据 │ data │',
  '│ 模型 │ model │',
].join('\n'));

console.log('=== md: 非表格不动 ===', tableToMarkdown(code) === code ? 'OK' : 'CHANGED!');
