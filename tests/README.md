# tests

## test_expr_to_readable.js

`expr_to_readable.html`（LaTeX → 可读 Unicode/ASCII 转换工具）的回归测试，67 个用例。

### 怎么跑

```bash
node tests/test_expr_to_readable.js
```

需要 node（无任何依赖）。全过输出 `67 passed, 0 failed`；有失败会打印 expect/got 对照，退出码非 0。

### 原理

转换核心在 `js/latex2readable.js`——纯函数、无 DOM 依赖，可被任意页面外链引用：

```html
<script src="js/latex2readable.js"></script>
<script>
  const r = latex2readable(text, { stripText: true, transMatrix: true,
                                   delims: [['$$','$$'], ['$','$']] });
  // r = { text, mode: 'mixed'|'single', errors: [...] }
</script>
```

`expr_to_readable.html` 只是它的 UI 壳。测试直接 `require` 这个 js 逐用例断言，不需要浏览器。

### 加用例

往 `cases` 数组里加一行 `[输入, 期望输出]`。第三个元素可选：

- `{ stripText: false }` — 关闭 \text{} 剥离开关
- `{ singleDollarOff: true }` — 关闭单 `$` 定界符
- `{ custom: ['开', '闭'] }` — 设置自定义定界符对

### 补充符号表 m_latex2char_bs 的来源

`expr_to_readable.html` 里有两张符号表：

- `m_latex2char` — 手工维护的常用表，裸词（无反斜杠）也转换（`m_bare_exclude` 里的短歧义词除外）；
- `m_latex2char_bs` — 从 unicodeit 的 unicode-math 全表（4257 条）自动生成的补充表（约 1090 条），
  **只在带反斜杠时转换**，因为里面大量生僻命令名，裸词转换会误伤正常文本。

重新生成方法：`npm install unicodeit` 后，取 `unicodeit/ts_dist/js/data.js` 的 `replacements`，
过滤条件：命令名纯字母且长度 ≥2、排除 `mbf/mit/msans/mtt/mfrak/mscr/mbb/mup/Bbb` 前缀（unicode-math
的数学字母命名，已由 \mathbb 等结构处理）、排除已在手工表/变音符表/结构命令里的词、
目标是单码位字符且落在数学区块（Letterlike U+2100、Arrows U+2190、Math Operators U+2200、
Supplemental U+2900-2AFF、Misc Math A/B、primes、⌈⌉⌊⌋）。

### 坑

期望值里如果有组合字符（x̂、ȳ、v⃗ 这类"基字符+组合符"），必须用 `\u0302` 这样的转义写，
不要直接粘贴字符——肉眼相同的字符串可能是预组合码位（如 ẍ U+1E8D vs x+U+0308），会造成假失败。
