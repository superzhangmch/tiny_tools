// expr_to_readable 的回归测试
// 用法: node tests/test_expr_to_readable.js
// 核心逻辑在 js/latex2readable.js（纯函数，无 DOM 依赖），直接 require 调用。

const latex2readable = require('../js/latex2readable.js');
const DELIMS = [['$$', '$$'], ['$', '$'], ['\\(', '\\)'], ['\\[', '\\]']];

// ---- 用例 ----
// opts: stripText=false 关闭 \text 剥离; singleDollarOff 关闭单$定界符; custom:[开,闭] 自定义定界符; matrixOff 关闭矩阵/分段函数转换
const R = String.raw;
const cases = [
    // 上下标
    [R`\alpha_1^2`, R`α₁²`],
    [R`x^{n+1}`, R`xⁿ⁺¹`],
    [R`a_{ij}`, R`aᵢⱼ`],
    [R`x_i^j`, R`xᵢʲ`],
    [R`C^d_i`, R`Cᵈᵢ`],                          // 上标在前
    [R`C_i^d`, R`Cᵢᵈ`],
    [R`x^q`, R`x^q`],                             // q 无上标形式
    [R`e^{i\pi}`, R`e^(iπ)`],                     // 裸模式退化为线性
    [R`\|x\|_{L^2}`, R`‖x‖_(L²)`],
    // frac / sqrt
    [R`\frac{a}{b}`, R`a/b`],
    [R`\frac{x^2+1}{3}`, R`(x²+1)/3`],
    [R`\frac{a+b}{c+d}`, R`(a+b)/(c+d)`],
    [R`\sqrt{x+1}`, R`√(x+1)`],
    [R`\sqrt[3]{x}`, R`∛x`],
    [R`\sqrt[5]{x+1}`, R`(x+1)^(1/5)`],
    [R`√{x+1}`, R`√(x+1)`],                       // 半转换残留输入
    [R`\frac{a}{b}c`, R`(a/b)c`],                 // 后贴字母: 必须留括号
    [R`\frac{a}{b}(x)`, R`(a/b)(x)`],
    [R`2^\frac{1}{2}`, R`2^(1/2)`],              // 前贴 ^: 必须留括号
    [R`x = \frac{a+b}{2}, y`, R`x = (a+b)/2, y`],
    [R`\frac{1}{2} + \frac{1}{3}`, R`1/2 + 1/3`],
    [R`\frac{x^2+1}{(x+1)^2}`, R`(x²+1)/(x+1)²`],   // (x+1)² 原子，不再包一层
    [R`\frac{1}{(x+1)^2}`, R`1/(x+1)²`],
    // 大算符界限
    [R`\sum_{i=1}^n i^2`, R`∑ᵢ₌₁ⁿ i²`],
    [R`\prod_{j=1}^m`, R`∏ⱼ₌₁ᵐ`],
    [R`\int_0^\infty e^{-x} dx`, R`∫₀^∞ e⁻ˣ dx`],
    [R`\lim_n a_n`, R`limₙ aₙ`],
    [R`\lim_{n \to \infty} a_n`, R`lim_(n → ∞) aₙ`],
    // 变音符
    [R`\vec{v} \cdot \hat{n}`, R`v⃗ ⋅ n̂`],
    [R`\hat{x}^2`, R`x̂²`],
    [R`\dot{x} \ddot{x}`, 'x\u0307 x\u0308'],
    [R`\overline{AB}`, R`A̅B̅`],
    [R`\hat{abc}`, R`\hat{abc}`],                 // 多字符不转
    // 数学字母
    [R`\mathbb{R}^n`, R`ℝⁿ`],
    [R`\mathbb Z`, R`ℤ`],                         // 省略花括号
    [R`\mathbb{N} \mathbb{Q} \mathbb{Z} \mathbb{C}`, R`ℕ ℚ ℤ ℂ`],
    [R`\mathcal{L} \mathcal{H} \mathfrak{g} \mathbf{v} \mathtt{x1}`, R`ℒ ℋ 𝔤 𝐯 𝚡𝟷`],
    [R`\mathbbm{Z}`, R`\mathbbm{Z}`],             // 别的宏包命令不误伤
    // 范数/定界符号
    [R`\|f\|`, R`‖f‖`],
    [R`\|x\|_2`, R`‖x‖₂`],
    [R`\|x\|_p^p`, R`‖x‖ₚᵖ`],
    [R`\lVert v \rVert \le \lvert c \rvert`, R`‖ v ‖ ≤ | c |`],
    // mod / 整除
    [R`a \equiv b \pmod{2^n}`, R`a ≡ b (mod 2ⁿ)`],
    [R`x \bmod y`, R`x mod y`],
    [R`a \mid b, p \nmid n`, R`a | b, p ∤ n`],
    // 尺寸命令
    [R`\bigl( x \bigr)`, R`( x )`],
    [R`\bigcup_i A_i, \bigoplus V`, R`⋃ᵢ Aᵢ, ⨁ V`],
    // 关系符 / 函数名
    [R`a \ne b, x \ge 0`, R`a ≠ b, x ≥ 0`],
    [R`\sin x + \cos y`, R`sin x + cos y`],
    // 间距命令
    [R`\int f(x)\,dx`, R`∫ f(x) dx`],
    [R`a\;b\quad c\!d`, R`a b cd`],
    // 省略号
    [R`\ldots \cdots \dots`, R`… ⋯ …`],
    // 前缀算符紧贴操作数
    [R`\partial f / \partial x`, R`∂f / ∂x`],
    [R`\frac{\partial f}{\partial x}`, R`∂f/∂x`],
    [R`\Delta x = x_2 - x_1`, R`Δx = x₂ - x₁`],
    [R`\nabla f \cdot \delta x`, R`∇f ⋅ δx`],
    [R`\delta > 0`, R`δ > 0`],                    // 后跟关系符不紧贴
    [R`\Delta \le 0`, R`Δ ≤ 0`],
    // \text 剥离
    [R`\text{s.t. } x > 0`, R`s.t. x > 0`],
    [R`\text{s.t. } x > 0`, R`\text{s.t. } x > 0`, { stripText: false }],
    // 裸词排除: in/xi/Re 等短词无反斜杠不转，带反斜杠照转
    [R`x in R`, R`x in R`],
    [R`x \in R`, R`x ∈ R`],
    [R`a_{in}`, R`aᵢₙ`],
    [R`x_in`, R`xᵢₙ`],
    [R`Re(z) + Im(z)`, R`Re(z) + Im(z)`],
    [R`\Re(z)`, R`ℜ(z)`],
    [R`x xi y`, R`x xi y`],
    [R`\xi_1`, R`ξ₁`],
    [R`2 pi r`, R`2 π r`],                        // 习惯写法仍然裸转
    [R`sum_1^n`, R`∑₁ⁿ`],

    // ---- 混合文本: 全转干净 → 去定界符 ----
    ['设 $\\alpha_1^2 + \\beta$ 为系数, 且 $x \\in \\mathbb{R}^n$ 成立。', '设 α₁² + β 为系数, 且 x ∈ ℝⁿ 成立。'],
    [R`$\|f\|_2 = √{a₀²+a₁²+⋯+ a_n^2 }$`, R`‖f‖₂ = √(a₀²+a₁²+⋯+ aₙ²)`],
    [R`$C^d_i =d!/(i!(d-i)!)$`, R`Cᵈᵢ =d!/(i!(d-i)!)`],
    ['$$\nf_1(x) \\Big| h(x) \\pmod{p^N}\n$$', R`f₁(x) | h(x) (mod pᴺ)`],
    [R`$g(x) \in \mathbb{Z}[x] : \deg(g) \le d,\ f_1 \mid g \pmod{p^N}$`, R`g(x) ∈ ℤ[x] : deg(g) ≤ d, f₁ | g (mod pᴺ)`],
    [R`$$f(x) ≡ \tilde{g}₁(x) ⋅ \tilde{g}₂(x) ⋯ \tilde{g}ₖ₍ₓ₎ \pmod{p}$$`, R`f(x) ≡ g̃₁(x) ⋅ g̃₂(x) ⋯ g̃ₖ₍ₓ₎ (mod p)`],
    [R`$a \otimes b$ 张量积`, R`a ⊗ b 张量积`],
    [R`$\ker \phi = 0$ 核`, R`ker φ = 0 核`],
    [R`$a_1, a_2, \dots, a_n$`, R`a₁, a₂, …, aₙ`],
    [R`$n₅ ≡ 1 \pmod 5$`, R`n₅ ≡ 1 (mod 5)`],       // \pmod 无花括号
    [R`$n₅ ∈ {1,6}$`, R`n₅ ∈ {1,6}`],               // 集合字面量的 {} 不阻止去 $
    [R`$x \in \{1,6\}$`, R`x ∈ {1,6}`],
    ['|G|=15=3× 5，证明 $G \\cong ℤ₁₅$。', '|G|=15=3× 5，证明 G ≅ ℤ₁₅。'],
    [R`$H \trianglelefteq G$, $N \lhd G$`, R`H ⊴ G, N ⊲ G`],
    [R`$$H = \langle Pᵢ, Pⱼ \rangle$$`, R`H = ⟨ Pᵢ, Pⱼ ⟩`],
    [R`\left\langle u, v \right\rangle = 0`, R`⟨ u, v ⟩ = 0`],
    // 补充表(unicode-math 全量, 仅带反斜杠转换)
    [R`$a \perp b$, $u \parallel v$`, R`a ⊥ b, u ∥ v`],
    [R`$\lceil x \rceil \le \lfloor y \rfloor$`, R`⌈ x ⌉ ≤ ⌊ y ⌋`],
    [R`$A \subsetneq B, \therefore x \in A$`, R`A ⊊ B, ∴ x ∈ A`],
    [R`perp parallel lceil`, R`perp parallel lceil`],   // 补充表词裸写不转
    ['也支持 \\(\\hat{x} + \\bar{y}\\) 定界符。', '也支持 x\u0302 + y\u0304 定界符。'],
    ['多行内容:\n$$\nx_1 + x_2\n+ x_3\n$$ 换行在中间', '多行内容:\nx₁ + x₂\n+ x₃ 换行在中间'],

    // ---- 混合文本: 有残留 → 部分转换 + 保留定界符 ----
    [R`$p\mathcal{O}_K = \prod \mathfrak{p}_i^{e_i}$ 分解`, R`$p𝒪_K = ∏ 𝔭ᵢ^{eᵢ}$ 分解`],
    [R`$x^q$ 上标转不了`, R`$x^q$ 上标转不了`],
    [R`$\|f\|_\infty \le C$ 有界`, R`$‖f‖_∞ ≤ C$ 有界`],
    [R`$\operatorname{Gal}(L/K)$ 伽罗瓦群`, R`Gal(L/K) 伽罗瓦群`],
    ['矩阵 $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ 变字符画', '矩阵 ⎛ a  b ⎞\n     ⎝ c  d ⎠ 变字符画'],
    ['矩阵 $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ 关闭时保留', '矩阵 $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ 关闭时保留', { matrixOff: true }],
    ['$$\n\\vec{v} = \\lambda \\begin{bmatrix} 1 \\\\ 0 \\end{bmatrix}\n$$', 'v⃗ = λ ⎡ 1 ⎤\n      ⎣ 0 ⎦'],
    // 矩阵/分段函数/对齐 → 多行文本
    [R`\begin{cases} x^2 & x > 0 \\ 0 & x \le 0 \end{cases}`, '⎧ x²,  x > 0\n⎩ 0,  x ≤ 0'],
    [R`\begin{cases} 1 & a \\ 2 & b \\ 3 & c \end{cases}`, '⎧ 1,  a\n⎨ 2,  b\n⎩ 3,  c'],
    [R`$\det = \begin{vmatrix} a & b \\ c & d \end{vmatrix}$`, 'det = │ a  b │\n      │ c  d │'],
    [R`\begin{align} x &= y + 1 \\ y &= 2 \end{align}`, 'x = y + 1\ny = 2'],
    [R`\begin{pmatrix} a & b \end{pmatrix}`, '( a  b )'],
    [R`\begin{pmatrix} \hat{ab} & c \\ d & e \end{pmatrix}`, R`\begin{pmatrix} \hat{ab} & c \\ d & e \end{pmatrix}`],  // 格子有残留: 放弃
    // underbrace → 三行(内容/╰─╯/标注)
    ['$$\n\\underbrace{𝔽ₚ[x] \\text{ 上分解}}_{\\text{局部、易}} ⟶ \\underbrace{ℤ[x] \\text{ 上分解}}_{\\text{全局、难}}\n$$',
     '𝔽ₚ[x] 上分解 ⟶ ℤ[x] 上分解\n╰──────────╯   ╰─────────╯\n  局部、易      全局、难'],
    [R`\underbrace{a + \hat{bc}}_{n}`, R`\underbrace{a + \hat{bc}}_n`],   // 内容有残留: 放弃(裸模式 _{n} 退化为 _n)
    [R`\underbrace{a+b}_{n}`, 'a+b\n╰─╯\n n'],
    // 六项扩展: frac 变体/正体外壳/binom/not/xarrow/更多环境
    [R`\dfrac{a+b}{2} + \tfrac{1}{2}`, R`(a+b)/2 + 1/2`],
    [R`\mathrm{sgn}(x) \cdot \mathrm{d}x`, R`sgn(x) ⋅ dx`],
    [R`$\binom{n}{k} = \binom{n-1}{k-1} + \binom{n-1}{k}$`, R`C(n,k) = C(n-1,k-1) + C(n-1,k)`],
    [R`x \not\in A, a \not\equiv b, u \not\parallel v`, R`x ∉ A, a ≢ b, u ∦ v`],
    [R`\left. F \right|_a^b = F(b) - F(a)`, R`F |ₐᵇ = F(b) - F(a)`],
    [R`A \xrightarrow{f} B \xleftarrow[g]{} C`, R`A —f→ B ←g— C`],
    [R`\begin{gather} a = b \\ c = d \end{gather}`, 'a = b\nc = d'],
    // \bar{\mathfrak{q}}: 数学字母先转、变音符后转才能吃到单字符参数; √(-5) 负数加括号
    ['$$\\begin{aligned}\n(2) &= \\mathfrak{p}^2 \\\\\n(3) &= \\mathfrak{q}\\bar{\\mathfrak{q}} \\\\\n(1+\\sqrt{-5}) &= \\mathfrak{p}\\mathfrak{q}\n\\end{aligned}$$',
     '(2) = 𝔭²\n(3) = 𝔮𝔮̄\n(1+√(-5)) = 𝔭𝔮'],
    [R`\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}`, '1  2\n3  4'],

    // ---- 定界符配置 ----
    ['价格是 $100 and $200, 不是公式。', '价格是 $100 and $200, 不是公式。'],
    ['$\\alpha$ 不该转, $$\\beta$$ 该转', '$\\alpha$ 不该转, β 该转', { singleDollarOff: true }],
    ['推导:\n\\begin{equation}\n\\alpha_1^2 + \\frac{a}{b}\n\\end{equation}\n完毕',
     '推导:\nα₁² + a/b\n完毕', { custom: ['\\begin{equation}', '\\end{equation}'] }],
];

// ---- 跑 ----
let pass = 0, fail = 0;
for (let i = 0; i < cases.length; i++) {
    const [input, expect, opts = {}] = cases[i];
    let delims = DELIMS.filter(([o]) => !(opts.singleDollarOff && o === '$'));
    if (opts.custom) delims = delims.concat([opts.custom]);
    let got;
    try {
        got = latex2readable(input, {
            stripText: opts.stripText !== false,
            transMatrix: !opts.matrixOff,
            delims,
        }).text;
    } catch (e) {
        got = 'ERROR: ' + e.message;
    }
    if (got === expect) {
        pass++;
        console.log(`ok   ${String(i + 1).padStart(2)}/${cases.length}  ${JSON.stringify(input.slice(0, 50))}`);
    } else {
        fail++;
        console.log(`FAIL ${String(i + 1).padStart(2)}/${cases.length}  ${JSON.stringify(input)}`);
        console.log(`     expect ${JSON.stringify(expect)}`);
        console.log(`     got    ${JSON.stringify(got)}`);
    }
}
console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
process.exit(fail ? 1 : 0);
