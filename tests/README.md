# tests

## test_expr_to_readable.js

`expr_to_readable.html`（LaTeX → 可读 Unicode/ASCII 转换工具）的回归测试，67 个用例。

### 怎么跑

```bash
node tests/test_expr_to_readable.js
```

需要 node（无任何依赖）。全过输出 `67 passed, 0 failed`；有失败会打印 expect/got 对照，退出码非 0。

### 原理

脚本从 `expr_to_readable.html` 里抽出主 `<script>`，在一组 DOM 桩（stub）上 eval 执行，
然后逐用例调 `convertExpressionToLatex()`、断言结果块内容。
**测的永远是当前的 HTML 文件**，改完 HTML 直接重跑即可，不需要浏览器。

### 加用例

往 `cases` 数组里加一行 `[输入, 期望输出]`。第三个元素可选：

- `{ stripText: false }` — 关闭 \text{} 剥离开关
- `{ singleDollarOff: true }` — 关闭单 `$` 定界符
- `{ custom: ['开', '闭'] }` — 设置自定义定界符对

### 坑

期望值里如果有组合字符（x̂、ȳ、v⃗ 这类"基字符+组合符"），必须用 `\u0302` 这样的转义写，
不要直接粘贴字符——肉眼相同的字符串可能是预组合码位（如 ẍ U+1E8D vs x+U+0308），会造成假失败。
