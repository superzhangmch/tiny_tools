// latex2readable.js — LaTeX → 可读 Unicode/ASCII 文本（expr_to_readable.html 的核心，可独立引用）
// 用法:
//   latex2readable(text, opts?) → { text, mode: 'mixed'|'single', errors: [html...] }
//   opts: {
//     stripText:  true,   // 剥掉 \text{…} 留内容
//     transMatrix: true,  // matrix/cases/align/underbrace → 多行字符画
//     delims: [['$$','$$'], ['$','$'], ['\\(','\\)'], ['\\[','\\]']],  // 数学段定界符对
//   }
// 含 $/$$ 等定界符的输入按混合文本逐段转换(mode:'mixed')，否则整体当一个公式(mode:'single')。
// 回归测试: node tests/test_expr_to_readable.js
(function (root) {

var _err_out = { innerHTML: '' };   // 错误收集(沿用页面时代的 html 格式)

 	// <<
	var m_latex2char = {'infty': '∞', 'vartheta': 'ϑ', 'varkappa': 'ϰ', 'varpi': 'ϖ', 'varrho': 'ϱ', 'varsigma': 'ς', 'varepsilon': 'ε', 'varphi': 'φ', 'alpha': 'α', 'beta': 'β',
'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε', 'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ', 'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ',
'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω', 'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ',
'Lambda': 'Λ', 'Xi': 'Ξ', 'Pi': 'Π', 'Sigma': 'Σ', 'Upsilon': 'Υ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω', 'pm': '±', 'times': '×', 'div': '÷', 'cdot': '⋅',
'leq': '≤', 'geq': '≥', 'neq': '≠', 'approx': '≈', 'equiv': '≡', 'sum': '∑', 'prod': '∏', 'int': '∫', 'partial': '∂', 'nabla': '∇', 'forall': '∀',
'exists': '∃', 'not=': '≠', 'in': '∈', 'notin': '∉', 'subset': '⊂', 'supset': '⊃', 'subseteq': '⊆', 'supseteq': '⊇', 'cap': '∩', 'cup': '∪', 'emptyset': '∅',
'to': '→', 'gets': '←', 'leftrightarrow': '↔', 'implies': '⇒', 'iff': '⇔', 'aleph': 'ℵ', 'hbar': 'ħ', 'degree': '°', 'prime': '′', 'land': '∧', 'lor': '∨',
'neg': '¬', 'top': '⊤', 'bot': '⊥', 'vdash': '⊢', 'dashv': '⊣', 'leftarrow': '←', 'Leftarrow': '⇐', 'rightarrow': '→', 'Rightarrow': '⇒', 'Leftrightarrow': '⇔',
'mapsto': '↦', 'hookleftarrow': '↩', 'hookrightarrow': '↪', 'leftharpoonup': '↼', 'rightharpoonup': '⇀', 'leftharpoondown': '↽', 'rightharpoondown': '⇁',
'rightleftharpoons': '⇌', 'leadsto': '⇝', 'uparrow': '↑', 'Uparrow': '⇑', 'downarrow': '↓', 'Downarrow': '⇓', 'updownarrow': '↕', 'Updownarrow': '⇕', 'nearrow': '↗',
'searrow': '↘', 'swarrow': '↙', 'nwarrow': '↖', 'longleftarrow': '⟵', 'Longleftarrow': '⟸', 'longrightarrow': '⟶', 'Longrightarrow': '⟹', 'longleftrightarrow': '⟷',
'Longleftrightarrow': '⟺', 'longmapsto': '⟼', 'bigcap': '⋂', 'bigcup': '⋃', 'bigvee': '⋁', 'bigwedge': '⋀', 'bigodot': '⨀', 'bigoplus': '⨁', 'bigotimes': '⨂',
'biguplus': '⨄', 'bigsqcup': '⨆', 'oint': '∮', 'coprod': '∐', 'smallint': '∬', 'ldots': '…', 'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱', 'imath': 'ı', 'jmath': 'ȷ',
'ell': 'ℓ', 'wp': '℘', 'Re': 'ℜ', 'Im': 'ℑ', 'mho': '℧', 'Box': '□', 'Diamond': '◇', 'triangle': '△', 'angle': '∠', 'surd': '√', 'propto': '∝', 'flat': '♭',
'natural': '♮', 'sharp': '♯', 'circ': '∘', 'bullet': '•', 'square': '□', 'blacksquare': '■', 'blacktriangle': '▲', 'triangledown': '▽', 'blacktriangledown': '▼',
'lozenge': '◊', 'blacklozenge': '⬧', 'star': '⋆', 'ast': '∗', 'oplus': '⊕', 'ominus': '⊖', 'otimes': '⊗', 'oslash': '⊘', 'odot': '⊙', 'dagger': '†', 'ddagger': '‡',
	   'amalg': '⨿', 'uplus': '⊎', 'vee': '∨', 'wedge': '∧', 'setminus': '\\', 'wr': '≀', 'diamond': '⋄', 'iint': '∬', 'iiint': '∭',
	   'Vert': '‖', 'lVert': '‖', 'rVert': '‖', 'vert': '|', 'lvert': '|', 'rvert': '|',
	   'le': '≤', 'ge': '≥', 'ne': '≠', 'mid': '|', 'nmid': '∤',
	   'dots': '…', 'dotsc': '…', 'dotso': '…', 'dotsb': '⋯', 'dotsm': '⋯', 'dotsi': '⋯',
	   'cong': '≅', 'ncong': '≇', 'sim': '∼', 'simeq': '≃', 'll': '≪', 'gg': '≫',
	   'langle': '⟨', 'rangle': '⟩',   // unicodeit 映到 U+3008〈 是错的，正确是 U+27E8
	   'triangleleft': '⊲', 'triangleright': '⊳', 'trianglelefteq': '⊴', 'trianglerighteq': '⊵',
	   'vartriangleleft': '⊲', 'vartriangleright': '⊳', 'lhd': '⊲', 'rhd': '⊳', 'unlhd': '⊴', 'unrhd': '⊵',
	   'ntriangleleft': '⋪', 'ntriangleright': '⋫', 'ntrianglelefteq': '⋬', 'ntrianglerighteq': '⋭',
		    }

	// 补充符号表：从 unicode-math 全表自动生成(见 tests/README.md)。
	// 只在带反斜杠时转换——大量生僻命令名，裸词转换会误伤正常文本
	var m_latex2char_bs = {
	   'mp': '∓', 'ni': '∋', 'DD': 'ⅅ', 'dd': 'ⅆ', 'ee': 'ⅇ', 'ii': 'ⅈ', 'jj': 'ⅉ', 'AC': '∿',
	   'Lt': '⪡', 'Gt': '⪢', 'Cup': '⋓', 'lll': '⋘', 'Cap': '⋒', 'Rsh': '↱', 'Lsh': '↰', 'ggg': '⋙',
	   'cat': '⁀', 'Mho': '℧', 'Yup': '⅄', 'fun': '→', 'rel': '↔', 'inj': '↣', 'exi': '∃', 'nin': '∉',
	   'nni': '∌', 'QED': '∎', 'nis': '⋼', 'RHD': '▶', 'bij': '⤖', 'Vee': '⩔', 'lgE': '⪑', 'glE': '⪒',
	   'glj': '⪤', 'gla': '⪥', 'smt': '⪪', 'lat': '⪫', 'Top': '⫪', 'Bot': '⫫', 'Not': '⫬', 'perp': '⊥',
	   'prec': '≺', 'geqq': '≧', 'leqq': '≦', 'beth': 'ℶ', 'gneq': '≩', 'succ': '≻', 'lneq': '≨', 'Finv': 'Ⅎ',
	   'Game': '⅁', 'tfun': '→', 'tsur': '↠', 'surj': '↠', 'tinj': '↣', 'dlsh': '↲', 'Ldsh': '↲', 'drsh': '↳',
	   'Rdsh': '↳', 'pfun': '⇸', 'ffun': '⇻', 'nexi': '∄', 'owns': '∋', 'nsim': '≁', 'sdef': '≙', 'ngtr': '≯',
	   'nleq': '≰', 'ngeq': '≱', 'buni': '⊎', 'dint': '⋂', 'duni': '⋃', 'hash': '⋕', 'nisd': '⋺', 'rres': '▷',
	   'Lbag': '⟅', 'lbag': '⟅', 'Rbag': '⟆', 'rbag': '⟆', 'upin': '⟒', 'lang': '⟪', 'rang': '⟫', 'psur': '⤀',
	   'pinj': '⤔', 'finj': '⤕', 'tona': '⤧', 'toea': '⤨', 'tosa': '⤩', 'towa': '⤪', 'VERT': '⦀', 'spot': '⦁',
	   'limg': '⦇', 'rimg': '⦈', 'obot': '⦺', 'cirE': '⧃', 'dsol': '⧶', 'xsol': '⧸', 'hide': '⧹', 'fint': '⨏',
	   'intx': '⨘', 'Join': '⨝', 'zcmp': '⨟', 'semi': '⨟', 'odiv': '⨸', 'fcmp': '⨾', 'comp': '⨾', 'dsub': '⩤',
	   'rsub': '⩥', 'eqeq': '⩵', 'Same': '⩶', 'ltcc': '⪦', 'gtcc': '⪧', 'smte': '⪬', 'late': '⪭', 'Prec': '⪻',
	   'Succ': '⪼', 'csub': '⫏', 'csup': '⫐', 'mlcp': '⫛', 'Barv': '⫧', 'vBar': '⫨', 'barV': '⫪', 'Vbar': '⫫',
	   'Perp': '⫫', 'bNot': '⫭', 'gnsim': '⋧', 'lneqq': '≨', 'Vdash': '⊩', 'sqcap': '⊓', 'vDash': '⊨', 'doteq': '≐',
	   'gimel': 'ℷ', 'lnsim': '⋦', 'sqcup': '⊔', 'asymp': '≍', 'rceil': '⌉', 'lceil': '⌈', 'gneqq': '≩', 'third': '‴',
	   'Euler': 'ℇ', 'tcohm': 'Ω', 'agemO': '℧', 'upand': '⅋', 'notni': '∌', 'minus': '−', 'oiint': '∯', 'Colon': '∷',
	   'eqsim': '≂', 'nsime': '≄', 'Doteq': '≑', 'arceq': '≘', 'veeeq': '≚', 'eqdef': '≝', 'Equiv': '≣', 'nless': '≮',
	   'nprec': '⊀', 'nsucc': '⊁', 'eqgtr': '⋝', 'adots': '⋰', 'disin': '⋲', 'isins': '⋴', 'barin': '⋶', 'isinE': '⋹',
	   'psurj': '⤀', 'Vvert': '⦀', 'lblot': '⦉', 'rblot': '⦊', 'operp': '⦹', 'zhide': '⧹', 'xbsol': '⧹', 'tplus': '⧾',
	   'awint': '⨑', 'sqint': '⨖', 'upint': '⨛', 'zpipe': '⨠', 'Sqcap': '⩎', 'Sqcup': '⩏', 'Wedge': '⩓', 'ndres': '⩤',
	   'nrres': '⩥', 'eqdot': '⩦', 'asteq': '⩮', 'Equal': '⩵', 'ltcir': '⩹', 'gtcir': '⩺', 'lsime': '⪍', 'gsime': '⪎',
	   'lsimg': '⪏', 'gsiml': '⪐', 'simlE': '⪟', 'simgE': '⪠', 'lescc': '⪨', 'gescc': '⪩', 'csube': '⫑', 'csupe': '⫒',
	   'forkv': '⫙', 'forks': '⫝̸', 'perps': '⫡', 'dashV': '⫣', 'Dashv': '⫤', 'DashV': '⫥', 'vBarv': '⫩', 'nhpar': '⫲',
	   'models': '⊧', 'gtrdot': '⋗', 'preceq': '≼', 'Bumpeq': '≎', 'hybull': '⁃', 'nvdash': '⊬', 'bumpeq': '≏', 'rtimes': '⋊',
	   'gtrsim': '≳', 'daleth': 'ℸ', 'nVDash': '⊯', 'ltimes': '⋉', 'lfloor': '⌊', 'Subset': '⋐', 'Vvdash': '⊪', 'nVdash': '⊮',
	   'Supset': '⋑', 'rfloor': '⌋', 'circeq': '≗', 'eqcirc': '≖', 'veebar': '⊻', 'nvDash': '⊭', 'boxdot': '⊡', 'succeq': '≽',
	   'bowtie': '⋈', 'second': '″', 'dprime': '″', 'Exclam': '‼', 'fourth': '⁗', 'qprime': '⁗', 'hslash': 'ℏ', 'invamp': '⅋',
	   'MapsUp': '↥', 'mapsup': '↥', 'oiiint': '∰', 'nsimeq': '≄', 'wedgeq': '≙', 'stareq': '≛', 'measeq': '≞', 'nequiv': '≢',
	   'nasymp': '≭', 'apprle': '≲', 'apprge': '≳', 'cupdot': '⊍', 'assert': '⊦', 'prurel': '⊰', 'scurel': '⊱', 'origof': '⊶',
	   'barvee': '⊽', 'dinter': '⋂', 'dunion': '⋃', 'eqless': '⋜', 'nunlhd': '⋬', 'nunrhd': '⋭', 'iddots': '⋰', 'isinvb': '⋸',
	   'varnis': '⋻', 'niobar': '⋾', 'veedot': '⟇', 'bigbot': '⟘', 'bigtop': '⟙', 'cirbot': '⟟', 'lBrack': '⟦', 'Lbrack': '⟦',
	   'rBrack': '⟧', 'Rbrack': '⟧', 'lAngle': '⟪', 'rAngle': '⟫', 'lgroup': '⟮', 'rgroup': '⟯', 'Mapsto': '⤇', 'ltlarr': '⥶',
	   'gtrarr': '⥸', 'lBrace': '⦃', 'rBrace': '⦄', 'Lparen': '⦅', 'lParen': '⦅', 'Rparen': '⦆', 'rParen': '⦆', 'angles': '⦞',
	   'angdnr': '⦟', 'gtlpar': '⦠', 'boxast': '⧆', 'boxbox': '⧈', 'ltrivb': '⧏', 'vbrtri': '⧐', 'iinfin': '⧜', 'laplac': '⧠',
	   'eparsl': '⧣', 'tminus': '⧿', 'sumint': '⨋', 'iiiint': '⨌', 'intbar': '⨍', 'intBar': '⨎', 'sqrint': '⨖', 'intcap': '⨙',
	   'intcup': '⨚', 'lowint': '⨜', 'btimes': '⨲', 'Otimes': '⨷', 'capdot': '⩀', 'uminus': '⩁', 'barcup': '⩂', 'barcap': '⩃',
	   'cupvee': '⩅', 'dotsim': '⩪', 'eqqsim': '⩳', 'eqeqeq': '⩶', 'lesdot': '⩿', 'gesdot': '⪀', 'lesges': '⪓', 'gesles': '⪔',
	   'elsdot': '⪗', 'egsdot': '⪘', 'eqqgtr': '⪚', 'simgtr': '⪞', 'subsim': '⫇', 'supsim': '⫈', 'subsup': '⫓', 'supsub': '⫔',
	   'subsub': '⫕', 'supsup': '⫖', 'vDdash': '⫢', 'cirmid': '⫯', 'midcir': '⫰', 'topcir': '⫱', 'parsim': '⫳', 'sslash': '⫽',
	   'succsim': '≿', 'dotplus': '∔', 'lessgtr': '≶', 'gtrless': '≷', 'backsim': '∽', 'nexists': '∄', 'lessdot': '⋖', 'boxplus': '⊞',
	   'between': '≬', 'sqangle': '∟', 'precsim': '≾', 'because': '∵', 'lesssim': '≲', 'trprime': '‴', 'closure': '⁐', 'Nwarrow': '⇖',
	   'Nearrow': '⇗', 'Searrow': '⇘', 'Swarrow': '⇙', 'smallin': '∊', 'notowns': '∌', 'smallni': '∍', 'dbloint': '∯', 'eqcolon': '∹',
	   'simneqq': '≆', 'napprox': '≉', 'coloneq': '≔', 'varsdef': '≜', 'questeq': '≟', 'ngtrsim': '≵', 'nsubset': '⊄', 'nsupset': '⊅',
	   'imageof': '⊷', 'lrtimes': '⋈', 'npreceq': '⋠', 'nsucceq': '⋡', 'isindot': '⋵', 'suphsol': '⟉', 'pushout': '⟔', 'Lbrbrak': '⟬',
	   'Rbrbrak': '⟭', 'dbkarow': '⤏', 'subrarr': '⥹', 'suplarr': '⥻', 'llangle': '⦉', 'rrangle': '⦊', 'vzigzag': '⦚', 'obslash': '⦸',
	   'olcross': '⦻', 'cirscir': '⧂', 'boxdiag': '⧄', 'fbowtie': '⧓', 'lftimes': '⧔', 'rftimes': '⧕', 'nvinfty': '⧞', 'dualmap': '⧟',
	   'shuffle': '⧢', 'thermod': '⧧', 'rsolbar': '⧷', 'varprod': '⨉', 'npolint': '⨔', 'fatsemi': '⨟', 'project': '⨡', 'plushat': '⨣',
	   'simplus': '⨤', 'plusdot': '⨥', 'plussim': '⨦', 'intprod': '⨼', 'twocups': '⩊', 'twocaps': '⩋', 'veeodot': '⩒', 'congdot': '⩭',
	   'eqqplus': '⩱', 'pluseqq': '⩲', 'Coloneq': '⩴', 'ddotseq': '⩷', 'equivDD': '⩸', 'ltquest': '⩻', 'gtquest': '⩼', 'lesdoto': '⪁',
	   'gesdoto': '⪂', 'eqqless': '⪙', 'simless': '⪝', 'bumpeqq': '⪮', 'precneq': '⪱', 'succneq': '⪲', 'preceqq': '⪳', 'succeqq': '⪴',
	   'llcurly': '⪻', 'ggcurly': '⪼', 'submult': '⫁', 'supmult': '⫂', 'subedot': '⫃', 'supedot': '⫄', 'lsqhook': '⫍', 'rsqhook': '⫎',
	   'suphsub': '⫗', 'supdsub': '⫘', 'topfork': '⫚', 'revnmid': '⫮', 'nhVvert': '⫵', 'lllnest': '⫷', 'gggnest': '⫸', 'trslash': '⫻',
	   'succnsim': '⋩', 'doteqdot': '≑', 'sqsupset': '⊐', 'curlyvee': '⋎', 'approxeq': '≊', 'backcong': '≌', 'boxminus': '⊟', 'barwedge': '⊼',
	   'sqsubset': '⊏', 'intercal': '⊺', 'precnsim': '⋨', 'parallel': '∥', 'boxtimes': '⊠', 'multimap': '⊸', 'Question': '⁇', 'Angstrom': 'Å',
	   'DoublePi': 'ℼ', 'ComplexI': 'ⅈ', 'ComplexJ': 'ⅉ', 'mapsfrom': '↤', 'MapsDown': '↧', 'mapsdown': '↧', 'linefeed': '↴', 'leftturn': '↺',
	   'notowner': '∌', 'divslash': '∕', 'cuberoot': '∛', 'dotminus': '∸', 'invlazys': '∾', 'sinewave': '∿', 'dotequal': '≐', 'coloneqq': '≔',
	   'eqqcolon': '≕', 'notasymp': '≭', 'nlesssim': '≴', 'nlessgtr': '≸', 'ngtrless': '≹', 'varisins': '⋳', 'isinobar': '⋷', 'bsolhsub': '⟈',
	   'wedgedot': '⟑', 'pullback': '⟓', 'UUparrow': '⟰', 'Mapsfrom': '⤆', 'Uuparrow': '⤊', 'drbkarow': '⤐', 'lefttail': '⤙', 'hksearow': '⤥',
	   'hkswarow': '⤦', 'strictfi': '⥼', 'strictif': '⥽', 'revangle': '⦣', 'boxslash': '⧄', 'boxonbox': '⧉', 'rtriltri': '⧎', 'lfbowtie': '⧑',
	   'rfbowtie': '⧒', 'lvzigzag': '⧘', 'rvzigzag': '⧙', 'Lvzigzag': '⧚', 'Rvzigzag': '⧛', 'tieinfty': '⧝', 'smeparsl': '⧤', 'eqvparsl': '⧥',
	   'bigsqcap': '⨅', 'bigtimes': '⨉', 'cirfnint': '⨐', 'rppolint': '⨒', 'scpolint': '⨓', 'pointint': '⨕', 'intlarhk': '⨗', 'zproject': '⨡',
	   'ringplus': '⨢', 'plustrif': '⨨', 'minusdot': '⨪', 'vectimes': '⨯', 'dottimes': '⨰', 'timesbar': '⨱', 'intprodr': '⨽', 'capwedge': '⩄',
	   'veeonvee': '⩖', 'wedgebar': '⩟', 'dotequiv': '⩧', 'simrdots': '⩫', 'Coloneqq': '⩴', 'leqslant': '⩽', 'geqslant': '⩾', 'lesdotor': '⪃',
	   'gesdotol': '⪄', 'lnapprox': '⪉', 'gnapprox': '⪊', 'precneqq': '⪵', 'succneqq': '⪶', 'forksnot': '⫝', 'varVdash': '⫦', 'gvertneqq': '≩',
	   'supsetneq': '⊋', 'nleqslant': '≰', 'supseteqq': '⊇', 'gtreqless': '⋛', 'pitchfork': '⋔', 'estimated': '℮', 'ngeqslant': '≱', 'therefore': '∴',
	   'triangleq': '≜', 'varpropto': '∝', 'subsetneq': '⊊', 'lvertneqq': '≨', 'nparallel': '∦', 'lesseqgtr': '⋚', 'backsimeq': '⋍', 'subseteqq': '⊆',
	   'backprime': '‵', 'tieconcat': '⁀', 'fracslash': '⁄', 'Angstroem': 'Å', 'lightning': '↯', 'Lightning': '↯', 'rightturn': '↻', 'nHuparrow': '⇞',
	   'dasharrow': '⇢', 'partialup': '∂', 'increment': '∆', 'clockoint': '∲', 'mathratio': '∶', 'dashcolon': '∹', 'LessTilde': '≲', 'nsubseteq': '⊈',
	   'nsupseteq': '⊉', 'varniobar': '⋽', 'bagmember': '⋿', 'DashVDash': '⟚', 'dashVdash': '⟛', 'vlongdash': '⟝', 'longdashv': '⟞', 'impliedby': '⟸',
	   'righttail': '⤚', 'nwsearrow': '⤡', 'neswarrow': '⤢', 'hknwarrow': '⤣', 'hknearrow': '⤤', 'typecolon': '⦂', 'langledot': '⦑', 'rangledot': '⦒',
	   'rparengtr': '⦔', 'Lparengtr': '⦕', 'fourvdots': '⦙', 'turnangle': '⦢', 'angleubar': '⦤', 'olessthan': '⧀', 'boxbslash': '⧅', 'boxcircle': '⧇',
	   'triangles': '⧌', 'hourglass': '⧖', 'bigcupdot': '⨃', 'conjquant': '⨇', 'disjquant': '⨈', 'modtwosum': '⨊', 'otimeshat': '⨶', 'cupbarcap': '⩈',
	   'capbarcup': '⩉', 'wedgeodot': '⩑', 'midbarvee': '⩝', 'varveebar': '⩡', 'equivVert': '⩨', 'hatapprox': '⩯', 'approxeqq': '⩰', 'gtrapprox': '⪆',
	   'leftslice': '⪦', 'subsetdot': '⪽', 'supsetdot': '⪾', 'leqqslant': '⫹', 'geqqslant': '⫺', 'nsupseteqq': '⊉', 'textrecipe': '℞', 'nsubseteqq': '⊈',
	   'subsetneqq': '⊊', 'upuparrows': '⇈', 'nleftarrow': '↚', 'eqslantgtr': '⋝', 'curlywedge': '⋏', 'supsetneqq': '⊋', 'sqsubseteq': '⊑', 'sqsupseteq': '⊒',
	   'complement': '∁', 'gtreqqless': '⋛', 'lesseqqgtr': '⋚', 'circledast': '⊛', 'nLeftarrow': '⇍', 'Lleftarrow': '⇚', 'varnothing': '∅', 'backdprime': '‶',
	   'Eulerconst': 'ℇ', 'turnediota': '℩', 'EulerGamma': 'ℽ', 'mappedfrom': '↤', 'fourthroot': '∜', 'rightangle': '∟', 'Proportion': '∷', 'SetDelayed': '≔',
	   'subsetcirc': '⟃', 'supsetcirc': '⟄', 'Diamonddot': '⟐', 'DDownarrow': '⟱', 'Longmapsto': '⟾', 'Mappedfrom': '⤆', 'Ddownarrow': '⤋', 'UpArrowBar': '⤒',
	   'baruparrow': '⤒', 'rightimply': '⥰', 'upfishtail': '⥾', 'lbrackubar': '⦋', 'rbrackubar': '⦌', 'lparenless': '⦓', 'Rparenless': '⦖', 'lblkbrbrak': '⦗',
	   'rblkbrbrak': '⦘', 'circlehbar': '⦵', 'circledgtr': '⧁', 'doubleplus': '⧺', 'tripleplus': '⧻', 'plussubtwo': '⨧', 'commaminus': '⨩', 'minusfdots': '⨫',
	   'minusrdots': '⨬', 'opluslhrim': '⨭', 'oplusrhrim': '⨮', 'smashtimes': '⨳', 'cupovercap': '⩆', 'capovercup': '⩇', 'veeonwedge': '⩙', 'veemidvert': '⩛',
	   'equivVvert': '⩩', 'lessapprox': '⪅', 'rightslice': '⪧', 'precapprox': '⪷', 'succapprox': '⪸', 'subsetplus': '⪿', 'supsetplus': '⫀', 'interleave': '⫴',
	   'talloblong': '⫾', 'preccurlyeq': '≼', 'Rrightarrow': '⇛', 'circledcirc': '⊚', 'nRightarrow': '⇏', 'vartriangle': '▵', 'nrightarrow': '↛', 'succcurlyeq': '≽',
	   'curlyeqsucc': '⋟', 'curlyeqprec': '⋞', 'backepsilon': '∍', 'circleddash': '⊝', 'eqslantless': '⋜', 'backtrprime': '‷', 'caretinsert': '‸', 'Planckconst': 'ℎ',
	   'sansLturned': '⅂', 'ExponetialE': 'ⅇ', 'restriction': '↾', 'equilibrium': '⇌', 'nHdownarrow': '⇟', 'updasharrow': '⇡', 'nvleftarrow': '⇷', 'nVleftarrow': '⇺',
	   'approxident': '≋', 'corresponds': '≙', 'Corresponds': '≙', 'GreaterLess': '≷', 'nsqsubseteq': '⋢', 'nsqsupseteq': '⋣', 'sqsubsetneq': '⋤', 'sqsupsetneq': '⋥',
	   'varisinobar': '⋶', 'threedangle': '⟀', 'diamondcdot': '⟐', 'multimapinv': '⟜', 'nvLeftarrow': '⤂', 'leftbkarrow': '⤌', 'leftdbltail': '⤛', 'seovnearrow': '⤭',
	   'neovsearrow': '⤮', 'neovnwarrow': '⤱', 'nwovnearrow': '⤲', 'rightarrowx': '⥇', 'wideangleup': '⦧', 'revemptyset': '⦰', 'circledvert': '⦶', 'circledless': '⧀',
	   'gleichstark': '⧦', 'ruledelayed': '⧴', 'lcurvyangle': '⧼', 'rcurvyangle': '⧽', 'otimeslhrim': '⨴', 'otimesrhrim': '⨵', 'midbarwedge': '⩜', 'simminussim': '⩬',
	   'eqqslantgtr': '⪜', 'precnapprox': '⪹', 'succnapprox': '⪺', 'shortuptack': '⫠', 'varparallel': '⫽', 'textcircledP': '℗', 'risingdotseq': '≓', 'hyphenbullet': '⁃',
	   'PropertyLine': '⅊', 'bindnasrepma': '⅋', 'updownarrows': '⇅', 'LeftArrowBar': '⇤', 'barleftarrow': '⇤', 'upwhitearrow': '⇧', 'downuparrows': '⇵', 'nvrightarrow': '⇸',
	   'nVrightarrow': '⇻', 'intclockwise': '∱', 'cntclockoint': '∳', 'GreaterTilde': '≳', 'NotLessTilde': '≴', 'varsubsetneq': '⊊', 'cupleftarrow': '⊌', 'circledequal': '⊜',
	   'hermitmatrix': '⊹', 'smwhtdiamond': '⋄', 'npreccurlyeq': '⋠', 'nsucccurlyeq': '⋡', 'unicodecdots': '⋯', 'longdivision': '⟌', 'lozengeminus': '⟠', 'longmapsfrom': '⟻',
	   'Longmapsfrom': '⟽', 'nvRightarrow': '⤃', 'rightbkarrow': '⤍', 'leftdbkarrow': '⤎', 'DownArrowBar': '⤓', 'downarrowbar': '⤓', 'rightdbltail': '⤜', 'rdiagovfdiag': '⤫',
	   'fdiagovrdiag': '⤬', 'upupharpoons': '⥣', 'leftfishtail': '⥼', 'downfishtail': '⥿', 'lbrackultick': '⦍', 'rbracklrtick': '⦎', 'lbracklltick': '⦏', 'rbrackurtick': '⦐',
	   'revangleubar': '⦥', 'emptysetobar': '⦱', 'emptysetoarr': '⦳', 'odotslashdot': '⦼', 'ogreaterthan': '⧁', 'triangleodot': '⧊', 'triangleubar': '⧋', 'multimapboth': '⧟',
	   'lrtriangleeq': '⧡', 'errbarsquare': '⧮', 'errbarcircle': '⧲', 'triangleplus': '⨹', 'closedvarcup': '⩌', 'closedvarcap': '⩍', 'wedgeonwedge': '⩕', 'bigslopedvee': '⩗',
	   'wedgemidvert': '⩚', 'doublebarvee': '⩢', 'veedoublebar': '⩣', 'eqqslantless': '⪛', 'subsetapprox': '⫉', 'supsetapprox': '⫊', 'divideontimes': '⋇', 'measuredangle': '∡',
	   'texttrademark': '™', 'leftarrowtail': '↢', 'guilsinglleft': '‹', 'upharpoonleft': '↿', 'fallingdotseq': '≒', 'looparrowleft': '↫', 'dashleftarrow': '⇠', 'bigtriangleup': '△',
	   'sansLmirrored': '⅃', 'DifferentialD': 'ⅆ', 'leftwavearrow': '↜', 'leftdasharrow': '⇠', 'downdasharrow': '⇣', 'RightArrowBar': '⇥', 'rightarrowbar': '⇥', 'vysmwhtcircle': '∘',
	   'vysmblkcircle': '∙', 'wasytherefore': '∴', 'dotsminusdots': '∺', 'PrecedesTilde': '≾', 'SucceedsTilde': '≿', 'varlrtriangle': '⊿', 'equalparallel': '⋕', 'RightTriangle': '▷',
	   'leftouterjoin': '⟕', 'fullouterjoin': '⟗', 'twoheadmapsto': '⤅', 'uparrowbarred': '⤉', 'rightdotarrow': '⤑', 'cwcirclearrow': '⥁', 'leftarrowplus': '⥆', 'LeftVectorBar': '⥒',
	   'LeftTeeVector': '⥚', 'upequilibrium': '⥮', 'leftarrowless': '⥷', 'rightfishtail': '⥽', 'mdsmblkcircle': '⦁', 'llparenthesis': '⦇', 'rrparenthesis': '⦈', 'rightanglesqr': '⦜',
	   'wideangledown': '⦦', 'emptysetocirc': '⦲', 'emptysetoarrl': '⦴', 'circledbslash': '⦸', 'circledbullet': '⦿', 'errbardiamond': '⧰', 'triangleminus': '⨺', 'triangletimes': '⨻',
	   'shortlefttack': '⫞', 'shortdowntack': '⫟', 'threedotcolon': '⫶', 'biginterleave': '⫼', 'bigtalloblong': '⫿', 'curvearrowleft': '↶', 'guilsinglright': '›', 'leftthreetimes': '⋋',
	   'downdownarrows': '⇊', 'dashrightarrow': '⇢', 'leftleftarrows': '⇇', 'upharpoonright': '↾', 'rightarrowtail': '↣', 'looparrowright': '↬', 'sphericalangle': '∢', 'rightwavearrow': '↝',
	   'twoheaduparrow': '↟', 'updownarrowbar': '↨', 'carriagereturn': '↵', 'rightleftarrow': '⇄', 'revequilibrium': '⇋', 'leftsquigarrow': '⇜', 'rightdasharrow': '⇢', 'leftwhitearrow': '⇦',
	   'downwhitearrow': '⇩', 'NotGreaterLess': '≹', 'rightouterjoin': '⟖', 'concavediamond': '⟡', 'longmappedfrom': '⟻', 'Longmappedfrom': '⟽', 'fdiagovnearrow': '⤯', 'rdiagovsearrow': '⤰',
	   'acwcirclearrow': '⥀', 'rightarrowplus': '⥅', 'RightVectorBar': '⥓', 'RightTeeVector': '⥛', 'leftbarharpoon': '⥪', 'barleftharpoon': '⥫', 'updownharpoons': '⥮', 'downupharpoons': '⥯',
	   'rightanglemdot': '⦝', 'triangleserifs': '⧍', 'blackhourglass': '⧗', 'mdlgblklozenge': '⧫', 'bigslopedwedge': '⩘', 'wedgedoublebar': '⩠', 'NestedLessLess': '⪡', 'leftrightarrows': '⇆',
	   'nleftrightarrow': '↮', 'rightleftarrows': '⇄', 'bigtriangledown': '▽', 'rightthreetimes': '⋌', 'rightsquigarrow': '⇝', 'downharpoonleft': '⇃', 'curvearrowright': '↷', 'circlearrowleft': '↺',
	   'nLeftrightarrow': '⇎', 'downzigzagarrow': '↯', 'upharpoonleftup': '↿', 'rightwhitearrow': '⇨', 'NotGreaterTilde': '≵', 'NotLeftTriangle': '⋪', 'blacktriangleup': '▴', 'smalltriangleup': '▵',
	   'downarrowbarred': '⤈', 'cwrightarcarrow': '⤸', 'acwleftarcarrow': '⤹', 'acwoverarcarrow': '⤺', 'LeftUpVectorBar': '⥘', 'LeftUpTeeVector': '⥠', 'rightbarharpoon': '⥬', 'barrightharpoon': '⥭',
	   'equalrightarrow': '⥱', 'leftarrowsubset': '⥺', 'measanglerutone': '⦨', 'measanglelutonw': '⦩', 'measanglerdtose': '⦪', 'measangleldtosw': '⦫', 'measangleurtone': '⦬', 'measangleultonw': '⦭',
	   'measangledrtose': '⦮', 'measangledltosw': '⦯', 'circledparallel': '⦷', 'uparrowoncircle': '⦽', 'LeftTriangleBar': '⧏', 'circledownarrow': '⧬', 'bigtriangleleft': '⨞', 'circlearrowright': '↻',
	   'rightrightarrows': '⇉', 'twoheadleftarrow': '↞', 'downharpoonright': '⇂', 'twoheaddownarrow': '↡', 'upharpoonrightup': '↾', 'uparrowdownarrow': '⇅', 'downarrowuparrow': '⇵', 'rightthreearrows': '⇶',
	   'nvleftrightarrow': '⇹', 'nVleftrightarrow': '⇼', 'varointclockwise': '∲', 'ointctrclockwise': '∳', 'multimapdotbothA': '⊶', 'multimapdotbothB': '⊷', 'NotRightTriangle': '⋫', 'cwgapcirclearrow': '⟳',
	   'nvLeftrightarrow': '⤄', 'nvrightarrowtail': '⤔', 'nVrightarrowtail': '⤕', 'diamondleftarrow': '⤝', 'rightcurvedarrow': '⤳', 'acwunderarcarrow': '⤻', 'leftrightharpoon': '⥊', 'rightleftharpoon': '⥋',
	   'barleftharpoonup': '⥒', 'RightUpVectorBar': '⥔', 'barupharpoonleft': '⥘', 'leftharpoonupbar': '⥚', 'RightUpTeeVector': '⥜', 'upharpoonleftbar': '⥠', 'leftleftharpoons': '⥢', 'downdownharpoons': '⥥',
	   'uprevequilibrium': '⥯', 'leftarrowsimilar': '⥳', 'rightarrowapprox': '⥵', 'sphericalangleup': '⦡', 'RightTriangleBar': '⧐', 'twoheadrightarrow': '↠', 'leftrightharpoons': '⇋', 'textreferencemark': '※',
	   'cwopencirclearrow': '↻', 'upharpoonleftdown': '⇃', 'leftarrowtriangle': '⇽', 'kernelcontraction': '∻', 'blackpointerright': '►', 'whitepointerright': '▻', 'acwgapcirclearrow': '⟲', 'rightarrowonoplus': '⟴',
	   'rightarrowdiamond': '⤞', 'uprightcurvearrow': '⤴', 'cwundercurvearrow': '⤾', 'leftupdownharpoon': '⥑', 'rightharpoonupbar': '⥓', 'barupharpoonright': '⥔', 'DownLeftVectorBar': '⥖', 'LeftDownVectorBar': '⥙',
	   'barrightharpoonup': '⥛', 'upharpoonrightbar': '⥜', 'DownLeftTeeVector': '⥞', 'LeftDownTeeVector': '⥡', 'leftharpoonupdash': '⥪', 'similarrightarrow': '⥲', 'rightarrowsimilar': '⥴', 'measuredangleleft': '⦛',
	   'errbarblacksquare': '⧯', 'errbarblackcircle': '⧳', 'blacktriangleright': '▸', 'acwopencirclearrow': '↺', 'upharpoonrightdown': '⇂', 'circleonrightarrow': '⇴', 'rightarrowtriangle': '⇾', 'PrecedesSlantEqual': '≼',
	   'SucceedsSlantEqual': '≽', 'measuredrightangle': '⊾', 'smalltriangleright': '▹', 'curvearrowleftplus': '⤽', 'ccwundercurvearrow': '⤿', 'leftrightharpoonup': '⥎', 'rightupdownharpoon': '⥏', 'RightDownVectorBar': '⥕',
	   'barleftharpoondown': '⥖', 'DownRightVectorBar': '⥗', 'downharpoonleftbar': '⥙', 'RightDownTeeVector': '⥝', 'leftharpoondownbar': '⥞', 'DownRightTeeVector': '⥟', 'bardownharpoonleft': '⥡', 'leftharpoonsupdown': '⥢',
	   'rightrightharpoons': '⥤', 'rightharpoonupdash': '⥬', 'circledwhitebullet': '⦾', 'errbarblackdiamond': '⧱', 'textfractionsolidus': '⁄', 'leftrightsquigarrow': '↭', 'whitearrowupfrombar': '⇪', 'whitesquaretickleft': '⟤',
	   'longrightsquigarrow': '⟿', 'nvtwoheadrightarrow': '⤀', 'nVtwoheadrightarrow': '⤁', 'diamondleftarrowbar': '⤟', 'leftdowncurvedarrow': '⤶', 'downharpoonrightbar': '⥕', 'rightharpoondownbar': '⥗', 'bardownharpoonright': '⥝',
	   'barrightharpoondown': '⥟', 'upharpoonsleftright': '⥣', 'rightharpoonsupdown': '⥤', 'leftrightharpoonsup': '⥦', 'rightleftharpoonsup': '⥨', 'dashleftharpoondown': '⥫', 'CapitalDifferentialD': 'ⅅ', 'bigblacktriangledown': '▼',
	   'whiteinwhitetriangle': '⟁', 'whitesquaretickright': '⟥', 'barrightarrowdiamond': '⤠', 'downrightcurvedarrow': '⤵', 'rightdowncurvedarrow': '⤷', 'curvearrowrightminus': '⤼', 'leftrightarrowcircle': '⥈', 'twoheaduparrowcircle': '⥉',
	   'leftrightharpoonupup': '⥎', 'leftrightharpoondown': '⥐', 'dashrightharpoondown': '⥭', 'blackcircledownarrow': '⧭', 'NestedGreaterGreater': '⪢', 'barovernorthwestarrow': '↸', 'twoheadrightarrowtail': '⤖', 'updownharpoonleftleft': '⥑',
	   'downharpoonsleftright': '⥥', 'leftrightharpoonsdown': '⥧', 'rightleftharpoonsdown': '⥩', 'downtriangleleftblack': '⧨', 'blackdiamonddownarrow': '⧪', 'closedvarcupsmashprod': '⩐', 'leftrightarrowtriangle': '⇿', 'concavediamondtickleft': '⟢',
	   'leftrightharpoonupdown': '⥊', 'leftrightharpoondownup': '⥋', 'updownharpoonrightleft': '⥌', 'updownharpoonleftright': '⥍', 'downtrianglerightblack': '⧩', 'partialmeetcontraction': '⪣', 'smallblacktriangleright': '▸', 'concavediamondtickright': '⟣',
	   'nvtwoheadrightarrowtail': '⤗', 'nVtwoheadrightarrowtail': '⤘', 'updownharpoonrightright': '⥏', 'updownharpoonsleftright': '⥮', 'downupharpoonsleftright': '⥯', 'barleftarrowrightarrowba': '↹', 'rightarrowshortleftarrow': '⥂', 'leftarrowshortrightarrow': '⥃',
	   'shortrightarrowleftarrow': '⥄', 'leftrightharpoondowndown': '⥐',
	    }


	    var m_sqrt = {2: '√', 3: '∛', 4: '∜'}
	    var sup1 = '0123456789abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUW+-=()βγδεθιφχ';
	    var sup2 = '⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁᵂ⁺⁻⁼⁽⁾ᵝᵞᵟᵋᶿᶥᵠᵡ';
	    var m_sup = {}; for (var i = 0; i < sup1.length; i++) { m_sup[sup1[i]] = sup2[i]; }

	    var sub1 = '0123456789aehijklmnoprstuvx+-=()βγρφχ';
	    var sub2 = '₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ₊₋₌₍₎ᵦᵧᵨᵩᵪ';
	    var m_sub = {}; for (var i = 0; i < sub1.length; i++) { m_sub[sub1[i]] = sub2[i]; }

	    // "(...)²" 这种括号组带上下标的整体是原子的，不需要再包括号
	    var re_paren_pow = new RegExp('^\\([^()]*\\)[' + sup2 + sub2 + ']*$');

	    // 组合变音符（跟在基字符后面）
	    var m_accent = {hat:'̂', widehat:'̂', check:'̌', tilde:'̃', widetilde:'̃',
		acute:'́', grave:'̀', ddot:'̈', dot:'̇', breve:'̆', bar:'̄',
		mathring:'̊', vec:'⃗', overrightarrow:'⃗', overleftarrow:'⃖',
		overline:'̅', underline:'̲'};

	    // 数学字母区 U+1D400-1D7FF。ex: 更早收进 Letterlike Symbols 的例外码位，主区对应位置是空洞
	    var m_math_alphabet = {
		mathbb:  {A:0x1D538, a:0x1D552, d:0x1D7D8, ex:{C:'ℂ',H:'ℍ',N:'ℕ',P:'ℙ',Q:'ℚ',R:'ℝ',Z:'ℤ'}},
		mathcal: {A:0x1D49C, a:0x1D4B6, ex:{B:'ℬ',E:'ℰ',F:'ℱ',H:'ℋ',I:'ℐ',L:'ℒ',M:'ℳ',R:'ℛ',e:'ℯ',g:'ℊ',o:'ℴ'}},
		mathfrak:{A:0x1D504, a:0x1D51E, ex:{C:'ℭ',H:'ℌ',I:'ℑ',R:'ℜ',Z:'ℨ'}},
		mathbf:  {A:0x1D400, a:0x1D41A, d:0x1D7CE, ex:{}},
		mathit:  {A:0x1D434, a:0x1D44E, ex:{h:'ℎ'}},
		mathsf:  {A:0x1D5A0, a:0x1D5BA, d:0x1D7E2, ex:{}},
		mathtt:  {A:0x1D670, a:0x1D68A, d:0x1D7F6, ex:{}},
	    };
	    m_math_alphabet.mathscr = m_math_alphabet.mathcal;
	    m_math_alphabet.boldsymbol = m_math_alphabet.mathbf;

	    function math_alphabet(cmd, s) {
		var b = m_math_alphabet[cmd];
		var r = '';
		for (var c of s) {
			if (b.ex[c]) { r += b.ex[c]; continue; }
			var code = c.codePointAt(0);
			if (c >= 'A' && c <= 'Z') r += String.fromCodePoint(b.A + code - 65);
			else if (c >= 'a' && c <= 'z') r += String.fromCodePoint(b.a + code - 97);
			else if (c >= '0' && c <= '9' && b.d) r += String.fromCodePoint(b.d + code - 48);
			else if (c == ' ') r += c;
			else return null;  // 有转不了的字符，整体放弃
		}
		return r;
	    }

	// ---- 矩阵/分段函数/多行对齐 → 多行文本 ----
	// 只在环境不嵌套、且每个格子已转成干净单行(无 \ {} ^ _ 残留)时才转，否则原样保留
	function disp_width(s) {
		var w = 0;
		for (var c of s) {
			if (/[\u0300-\u036F\u20D0-\u20FF]/.test(c)) continue;      // combining marks 零宽
			w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60]/.test(c) ? 2 : 1;  // CJK 按 2
		}
		return w;
	}
	function pad_to(s, w) { return s + ' '.repeat(Math.max(0, w - disp_width(s))); }

	// [单行], [首行], [中间行], [末行] 的左右括号
	var m_env_delims = {
		pmatrix: [['(', ')'], ['⎛', '⎞'], ['⎜', '⎟'], ['⎝', '⎠']],
		bmatrix: [['[', ']'], ['⎡', '⎤'], ['⎢', '⎥'], ['⎣', '⎦']],
		Bmatrix: [['{', '}'], ['⎧', '⎫'], ['⎪', '⎪'], ['⎩', '⎭']],
		vmatrix: [['│', '│'], ['│', '│'], ['│', '│'], ['│', '│']],
		Vmatrix: [['‖', '‖'], ['‖', '‖'], ['‖', '‖'], ['‖', '‖']],
		matrix:  [['', ''], ['', ''], ['', ''], ['', '']],
		smallmatrix: [['', ''], ['', ''], ['', ''], ['', '']],
		array:   [['', ''], ['', ''], ['', ''], ['', '']],
	};

	function trans_env_to_text(latex) {
		return latex.replace(/\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|matrix|array|cases|aligned|align\*?|gathered|gather\*?|split|eqnarray\*?)\}(\{[^{}]*\})?([\s\S]*?)\\end\{\1\}/g,
			function (match, env, spec, body, offset, whole) {
				// array 的 {ccc} 列格式说明丢弃；其他环境紧跟的 {…} 是内容，还回去
				if (spec && env != 'array') body = spec + body;
				if (/\\begin/.test(body)) return match;   // 嵌套不碰
				var rows = body.split(/\\\\/).map(r => r.trim()).filter(r => r !== '');
				if (!rows.length) return match;
				var cellrows = rows.map(r => r.split('&').map(c => c.trim().replace(/[ \t]+/g, ' ')));
				for (var row of cellrows)
					for (var c of row)
						if (/[\\{}^_\n]/.test(c)) return match;   // 格子没转干净不碰
				var n = cellrows.length;
				var lines;
				if (env == 'cases') {
					lines = cellrows.map((r, k) => {
						var b = n == 1 ? '{' : k == 0 ? '⎧' : k == n - 1 ? '⎩' : (k == (n - 1 >> 1) ? '⎨' : '⎪');
						return b + ' ' + r.join(',  ');
					});
				} else if (/^(aligned|align\*?|gathered|gather\*?|split|eqnarray\*?)$/.test(env)) {
					lines = cellrows.map(r => r.join(' ').replace(/[ \t]+/g, ' '));
				} else {
					var ncol = Math.max(...cellrows.map(r => r.length));
					var widths = [];
					for (var j = 0; j < ncol; j++)
						widths[j] = Math.max(...cellrows.map(r => disp_width(r[j] || '')));
					var d = m_env_delims[env];
					lines = cellrows.map((r, k) => {
						var cells = [];
						for (var j = 0; j < ncol; j++) cells.push(pad_to(r[j] || '', widths[j]));
						var lr = n == 1 ? d[0] : k == 0 ? d[1] : k == n - 1 ? d[3] : d[2];
						return ((lr[0] ? lr[0] + ' ' : '') + cells.join('  ') + (lr[1] ? ' ' + lr[1] : '')).replace(/[ \t]+$/, '');
					});
				}
				// 续行按环境起点所在行已有前缀的宽度缩进
				var ls = whole.lastIndexOf('\n', offset - 1);
				var indent = ' '.repeat(disp_width(whole.slice(ls + 1, offset)));
				return lines.join('\n' + indent);
			});
	}

	// \underbrace{X}_{Y} → 三行: 内容 / ╰──╯ / 标注居中。整段须是单行、X/Y 干净，否则放弃
	function trans_underbrace_to_text(s) {
		if (s.includes('\n')) return s;
		var pat = /\\underbrace\{([^{}]*)\}(?:_(?:\{([^{}]*)\}|([^\s\\{}^_]))|)/g;
		if (!pat.test(s)) return s;
		pat.lastIndex = 0;
		function center(t, w) {
			var pad = w - disp_width(t);
			if (pad <= 0) return t;
			var l = pad >> 1;
			return ' '.repeat(l) + t + ' '.repeat(pad - l);
		}
		var l1 = '', l2 = '', l3 = '';
		var last = 0, ok = true, m;
		while ((m = pat.exec(s)) !== null) {
			var X = m[1].trim().replace(/[ \t]+/g, ' ');
			var Y = (m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : '').trim().replace(/[ \t]+/g, ' ');
			if (/[\\{}^_]/.test(X) || /[\\{}^_]/.test(Y)) { ok = false; break; }
			var plain = s.slice(last, m.index);
			l1 += plain; l2 += ' '.repeat(disp_width(plain)); l3 += ' '.repeat(disp_width(plain));
			var wX = disp_width(X);
			var block = Math.max(wX, disp_width(Y), 2);
			var brace = '╰' + '─'.repeat(Math.max(0, wX - 2)) + '╯';
			l1 += center(X, block);
			l2 += center(brace, block);
			l3 += center(Y, block);
			last = pat.lastIndex;
		}
		if (!ok) return s;
		l1 += s.slice(last);
		var r = [l1, l2, l3].map(x => x.replace(/[ \t]+$/, '')).filter(x => x !== '').join('\n');
		if (/[\\^_]/.test(r)) return s;   // 段里还有别的残留会被保留定界符，字符画会毁掉合法 latex，放弃
		return r;
	}

	function trans(m, s) {
		var cc = 0;
		var r = '';
		for (var c of s) {
			if (m[c]) {
				r += m[c];
			} else {
				r += c;
				if (c != ' ' && c != '\t') {
					cc += 1;
				}
			}
		}
		if (cc == 0) return r;
		return "";
	}
	// >> 

	var basic_math_func = "sin|cos|log|ln|exp|sqrt|tan|asin|acos|atan|arctan|arcsin|arccos|frac|abs";
	function p(...x) {console.log(x)}
	function pp(arr) {
		for (var a of arr) {
			console.log('##', a)
		}
	}
	function _convert(input, opts) {
	    function do_replace(latex) {
	      latex = latex.replace(/(?<!\\)[ \t]+/g, " ")
		.replace(/<->/g, '\\leftrightarrow ')
		.replace(/<=>/g, '\\Leftrightarrow ')
		.replace(/->/g, '\\rightarrow ')
		.replace(/=>/g, '\\Rightarrow ')
		.replace(/<=/g, '≤')
		.replace(/>=/g, '≥')
		.replace(/!=/g, '≠')
		.replace(/==/g, '\\equiv ')
		.replace(/"mathbb\s*{\s*([^}]+)\s*}/g, '$1')
		.replace(/\\(left|right|big)\\\|/g, '‖')   // 要在裸 \| 之前，否则残留 \left 配不上对
		.replace(/\\\|/g, '‖')
		// \Big| \bigl( 等尺寸命令是纯排版，剥掉留定界符。[lrm]? 别吞掉 \bigcup \bigoplus（\b 挡住）
		.replace(/\\[Bb]igg?[lrm]?\b\s*/g, '')
		// frac 排版变体; \left. \right. 求值定界符剥掉; \left| \right| → 裸 |;
		// \left\langle \right\rceil 等命令型定界符前的 \left \right 剥掉（\{ 不受影响）
		.replace(/\\[dtc]frac\b/g, '\\frac')
		.replace(/\\(left|right)\s*\.\s*/g, '')
		.replace(/\\(left|right)\s*\|/g, '|')
		.replace(/\\(left|right)\s*(?=\\[a-zA-Z])/g, '')
		// 间距命令 → 普通空格；\! 负间距 → 空串。lookbehind 防止咬掉 \\（换行/矩阵行分隔）的后半
		.replace(/\\(quad|qquad|enspace|thinspace|medspace|thickspace)\b/g, ' ')
		.replace(/(?<!\\)\\[,;: ]/g, ' ')
		.replace(/(?<!\\)\\!/g, '')
		.replace(/[ \t]{2,}/g, ' ');
		if (opts.stripText !== false) {
			latex = latex.replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/[ \t]{2,}/g, ' ');
		}
		// \mathrm{X} \operatorname{X} 等正体外壳：剥掉留内容
		latex = latex.replace(/\\(?:mathrm|mathop|operatorname\*?|textrm|textup|textbf|textit|textsf|texttt)\s*\{([^{}]*)\}/g, '$1');
		// \binom{n}{k} → C(n,k)
		latex = latex.replace(/\\[dt]?binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, 'C($1,$2)');
		// \xrightarrow[g]{f} → —f/g→
		latex = latex.replace(/\\x(right|left)arrow\s*(?:\[([^\]]*)\]\s*)?\{([^{}]*)\}/g, function (m, dir, under, over) {
			var lab = [over, under].filter(x => x && x.trim()).map(x => x.trim()).join('/');
			if (!lab) return dir == 'right' ? '⟶' : '⟵';
			return dir == 'right' ? '—' + lab + '→' : '←' + lab + '—';
		});
	
		//var pat = "(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Pi|Rho|Sigma|Tau|Upsilon|Phi|Chi|Psi|Omega|varepsilon|varphi|text|hat|cap|cup|uplus|sqcap|sqcup|vee|wedge|oplus|ominus|otimes|oslash|odot|bigcirc|triangleleft|triangleright|bigtriangledown|bullet|setminus|wr|diamond|bigstar|leq|geq|neq|approx|sim|simeq|equiv|subset|supset|subseteq|supseteq|nsubseteq|nsupseteq|ni|notin|forall|nexists|lor|neg|top|bot|vdash|vDash|models|perp|parallel|nparallel|angle|measuredangle|sphericalangle|triangle|bigtriangleup|infty|partial|square|blacksquare|circ|cdots|ldots|vdots|ddots|aleph|beth|gimel|daleth|hbar|ell|Re|Im|wp|complement|emptyset|varnothing|nabla|surd|triangle|backslash|land|lor|lnot|neg|flat|sharp|natural|clubsuit|diamondsuit|heartsuit|spadesuit|int|sum|prod|sin|cos|log|exp|tan|sqrt|frac|in|exists|times|div|cdot|stackrel)";
		var pat = "([a-zA-Z]+[ \t]?)";
		var arr_pat = [ "({\\s*" + pat + "\\s*})", 
				"(\\\\" + pat + ")\\b", 
				"(\\\\" + pat + ")_", 
				"\\\\" + pat + "\\b", 
				"\\\\" + pat + "_", 
				"_" + pat + "\\b", 
				"\\b" + pat + "_",
				"\\b" + pat + "\\b", 
				"_" + pat + "\\b", 
				"\\b" + pat + "_",
				];

		// 这些短词是常见变量字母的拼接（in=i·n, xi=x·i, Re(z) 本来就可读…），
		// 裸写（无反斜杠）时不转换，必须写 \in \xi 才转
		var m_bare_exclude = {};
		for (var w of ['in','to','le','ge','ne','xi','Re','Im','mid','top','bot','ast','vee','wp','wr','ll','gg','sim'])
			m_bare_exclude[w] = 1;
		for (var reg_pat of arr_pat) {
			//console.log('vv', reg_pat);
			var reg = new RegExp(reg_pat, "g");
			latex = latex.replace(reg, (match, group1) => {
					var word = group1.replace(/[\{\}\\ ]/g, "");
					var has_bs = match.includes('\\');
					if (!has_bs && m_bare_exclude[word]) return match;
					var ch = m_latex2char[word] || (has_bs ? m_latex2char_bs[word] : undefined);
					if (!ch) return match;
					return match.replace(group1, ch + (/[ \t]$/.test(group1) ? ' ' : ''));
					});
		}
		// \not X → 否定形式：优先预组合码位，没有就叠加 U+0338。后跟未转换命令(\not\foo)不碰
		var m_negate = {'=':'≠','≡':'≢','∈':'∉','∋':'∌','⊂':'⊄','⊃':'⊅','⊆':'⊈','⊇':'⊉','≅':'≇','∼':'≁','≃':'≄',
				'<':'≮','>':'≯','≤':'≰','≥':'≱','∥':'∦','|':'∤','⊲':'⋪','⊳':'⋫','⊴':'⋬','⊵':'⋭'};
		latex = latex.replace(/\\not\s*([^\s\\])/g, function (m, c) { return m_negate[c] || (c + '̸'); });
		// ∂ ∇ Δ δ ¬ √ 是前缀算符，紧跟操作数，中间不该有空格——latex 源里 \partial x 的
		// 空格只是命令名结束符不是真空格。关系符(≡ ≤ ∈)不在此列，两边空格是对的
		latex = latex.replace(/([∂∇Δδ¬√∛∜])[ \t]+(?=[A-Za-z0-9Α-ω(])/g, '$1');
		// \mathbb{R} → ℝ 等；\mathbb Z 省略花括号的单字符也认；有转不了的字符则整体保留
		latex = latex.replace(/\\?\b(mathbb|mathcal|mathscr|mathfrak|mathbf|mathit|mathsf|mathtt|boldsymbol)\b\s*(?:\{([^{}]*)\}|([A-Za-z0-9])\b)/g,
			function (match, cmd, braced, single) {
				var r = math_alphabet(cmd, (braced !== undefined ? braced : single).trim());
				return r === null ? match : r;
			});
		// \hat{x} → x̂ 等；组合符只能盖单字符，参数更长时保留原样（over/underline 例外，逐字符加线可连成串）
		latex = latex.replace(/\\(widehat|widetilde|overrightarrow|overleftarrow|overline|underline|mathring|hat|check|tilde|acute|grave|ddot|dot|breve|bar|vec)\b\s*(?:\{([^{}]*)\}|([A-Za-z0-9Ͱ-Ͽ]))/g,
			function (match, cmd, braced, single) {
				var arg = (braced !== undefined ? braced : single).trim();
				var chars = [...arg];
				if (chars.length == 1) return chars[0] + m_accent[cmd];
				if ((cmd == 'overline' || cmd == 'underline') && chars.every(c => /[A-Za-z0-9Ͱ-Ͽ]/.test(c))) {
					return chars.map(c => c + m_accent[cmd]).join('');
				}
				return match;
			});
		// \pmod{p} / \pmod p → (mod p), \bmod → mod
		latex = latex.replace(/\\pmod\s*(?:\{([^{}]*)\}|([A-Za-z0-9]+))/g,
			function (m, braced, bare) { return '(mod ' + (braced !== undefined ? braced : bare) + ')'; })
			.replace(/\\bmod\b/g, 'mod');
		// 输入里已是 Unicode 根号但还跟着 {} 分组的（多半是上次转换的残留）
		latex = latex.replace(/([√∛∜])\s*\{([^{}]*)\}/g, function (m, r, arg) {
			arg = arg.trim();
			return r + (/^[^\s+\-*/^=<>±×÷⋅∘,|]+$/.test(arg) ? arg : '(' + arg + ')');
		});
		// 只剥常见函数名前的反斜杠，不能误伤 \vec \begin 等其他命令。
		// 用 (?![a-zA-Z]) 而不是 \b：后面紧跟 _ 时（\lim_n）\b 匹配不上
		latex = latex.replace(/\\(arcsin|arccos|arctan|sinh|cosh|tanh|coth|limsup|liminf|sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|sup|inf|det|gcd|deg|arg|dim|ker|hom|Pr)(?![a-zA-Z])/g, "$1").replace(/\*\*/g, "^");
		return latex;
	      }
	    function convert_one(expr, degrade) {
		expr = do_replace(expr.trim());
		const tokens = tokenize(expr, false);
		const syntaxTree = buildSyntaxTree(tokens, expr, false);
		var latex = buildLatex(syntaxTree, expr);

		// a_i^j => aᵢ^j；∑∏∫lim 等大算符的界限也转，花括号剥掉再试，转不全整组保留
		function strip_braces(s) { return s.trim().replace(/^\{([^{}]*)\}$/, '$1').trim(); }
		latex = latex.replace(/\s*_(\s*[^\^ \t]+\s*)\^(\s*[^\^_ \t\+\-\(\)]+)(\(| |\b|$)/g, function (match, p2, p3, p4) {
		    var p2_1 = strip_braces(p2);
		    var p3_1 = strip_braces(p3);
		    if (p4 == '(') p3_1 = "";
		    var s = trans(m_sub, p2_1);
		    var s1 = trans(m_sup, p3_1);
		    if (s && s1) {
			return s + s1 + p4;
		    } else if (s) {
			return s+"^"+p3 + p4;
		    } else {
			return match;
		    } });
		latex = latex.replace(/\s*_(\s*[^\^ \t]+\s*)\^/g, function (match, p2) {
		    var s = trans(m_sub, strip_braces(p2));
		    if (s) { return s+"^"; } else { return match; } });
		// 镜像：C^d_i 上标在前下标在后
		latex = latex.replace(/\s*\^(\s*[^\^_ \t]+\s*)_(\s*[^\^_ \t\+\-\(\)]+)(\(| |\b|$)/g, function (match, p3, p2, p4) {
		    if (p4 == '(') return match;
		    var s1 = trans(m_sup, strip_braces(p3));
		    var s = trans(m_sub, strip_braces(p2));
		    if (s && s1) {
			return s1 + s + p4;
		    } else if (s1) {
			return s1+"_"+p2 + p4;
		    } else {
			return match;
		    } });
		latex = latex.replace(/\s*\^(\s*[^\^_ \t]+\s*)_/g, function (match, p3) {
		    var s1 = trans(m_sup, strip_braces(p3));
		    if (s1) { return s1+"_"; } else { return match; } });
		// 兜底（仅裸表达式模式）：没能转成 Unicode 的 ^{...} _{...} 退化为线性形式，消掉花括号。
		// 先试转里面的简单上下标（^{e_i} → ^(eᵢ)）；单字符/纯数字不加圆括号。
		// 混合文本模式不退化：这类段落会保留 $ 交给 latex 渲染器，得留着合法 latex
		if (degrade) latex = latex.replace(/([_^])\{([^{}]*)\}/g, function (m, op, arg) {
		    arg = arg.trim()
			.replace(/_([A-Za-z0-9])(?![A-Za-z0-9])/g, function (m2, c) { var s = trans(m_sub, c); return s ? s : m2; })
			.replace(/\^([A-Za-z0-9])(?![A-Za-z0-9])/g, function (m2, c) { var s = trans(m_sup, c); return s ? s : m2; });
		    return op + (/^([A-Za-z]|-?[0-9.]+|[^\x00-\x7F])$/.test(arg) ? arg : '(' + arg + ')');
		});
		if (opts.transMatrix !== false) {
		    latex = trans_underbrace_to_text(latex);
		    latex = trans_env_to_text(latex);
		}
		return latex;
	    }

	    var input = input.trim();
	    // 混合文本：只转启用的定界符对里的片段。
	    // 行内 $ 按 pandoc 规则识别（紧贴非空白、闭合 $ 后面不是数字），避免把 "$100 and $200" 当公式。
	    // 片段全转干净（无 \命令 {} ^ _ 残留）才去掉定界符，否则部分转换的结果带定界符保留，交给 latex 渲染。
	    function re_esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
	    function build_seg_pat() {
		var pairs = (opts.delims || [['$$','$$'], ['$','$'], ['\\(','\\)'], ['\\[','\\]']]).map(p => p.slice());
		pairs.sort((a, b) => b[0].length - a[0].length);   // $$ 必须先于 $ 尝试
		var parts = pairs.map(([o, c]) =>
		    o == '$' && c == '$'
			? '(?<!\\\\)\\$(?=\\S)([^$\\n]+?)(?<=\\S)\\$(?!\\d)'
			: re_esc(o) + '([\\s\\S]+?)' + re_esc(c));
		return pairs.length ? { re: new RegExp(parts.join('|'), 'g'), pairs } : null;
	    }
	    var sp = build_seg_pat();
	    if (sp && sp.re.test(input)) {
		sp.re.lastIndex = 0;
		var out = input.replace(sp.re, function () {
		    var match = arguments[0];
		    var groups = Array.prototype.slice.call(arguments, 1, 1 + sp.pairs.length);
		    var idx = groups.findIndex(g => g !== undefined);
		    var r;
		    try { r = convert_one(groups[idx]); } catch (e) { return match; }
		    r = r.trim();
		    // 残留 \ ^ _ 算没转干净：部分转换的结果保留定界符交给 latex 渲染。
		    // 单独的花括号不算——真残留必伴随 \ ^ _，孤立 {} 是集合字面量({1,6})
		    if (/[\\^_]/.test(r)) {
			return sp.pairs[idx][0] + r + sp.pairs[idx][1];
		    }
		    // 多行结果(矩阵/分段函数)的续行，按段落在原句中的起始列缩进
		    if (r.includes('\n')) {
			var offset = arguments[sp.pairs.length + 1];
			var whole = arguments[sp.pairs.length + 2];
			var ls = whole.lastIndexOf('\n', offset - 1);
			r = r.split('\n').join('\n' + ' '.repeat(disp_width(whole.slice(ls + 1, offset))));
		    }
		    return r;
		});
		return { text: out, mode: 'mixed' };
	    }
	    return { text: convert_one(input, true), mode: 'single' };
	}

	function show_err1(input, pos, pos_len, msg, left_pos, left_len) {
	    const output = _err_out;
	    output.innerHTML = "错误：" + msg + "<br>"
	    if (pos === 0 || pos) {
		function t(s) {return s.replace("<", "&lt;").replace(">", "&gt;");}
		if (left_pos === 0 || left_pos) {
			var p1 = t(input.slice(0, left_pos));
			var p2 = t(input.slice(left_pos, left_pos + left_len));
			var p3 = t(input.slice(left_pos + left_len, pos));
			var p4 = t(input.slice(pos, pos+pos_len));
			var p5 = t(input.slice(pos+pos_len));

			output.innerHTML += `<pre>${p1}<font color=red><b>${p2}</b></font>${p3}<font color=red><b>${p4}</b></font>${p5}</pre>`
		} else {
			var p1 = t(input.slice(0, pos));
			var p2 = t(input.slice(pos, pos+pos_len));
			var p3 = t(input.slice(pos+pos_len));
			output.innerHTML += `<pre>${p1}<font color=red><b>${p2}</b></font>${p3}</pre>`
		}
	    }
	}
	function show_err(input, pos, msg, left_pos) {
	    const output = _err_out;
	    output.innerHTML = "错误：" + msg + "<br>"
	    if (pos === 0 || pos) {
	    	function t(s) {return s.replace("<", "&lt;").replace(">", "&gt;");}
	    	if (left_pos === 0 || left_pos) {
	    		output.innerHTML += "<pre>"
					+t(input.slice(0, left_pos)) + "<font color=red><b>[左]</b></font>"
					+t(input.slice(left_pos, pos)) + "<font color=red><b>[和左不匹配]</b></font>"
					+t(input.slice(pos))+"</pre>"
		} else {
			output.innerHTML += "<pre>"+t(input.slice(0, pos)) + "<font color=red><b>[may here]</b></font>" + t(input.slice(pos))+"</pre>"
		}
	    }
	}

	function tokenize(input, do_throw) {
	    _err_out.innerHTML = '';
	    const tokenPatterns = [
		{ type: 'TEXT', regex: /"[^"]*"/ },    // "xxx"
		{ type: 'BRACKET', regex: /[(){}\[\]]/ },      // () [] {}
		{ type: 'ESCAPED_BRACE', regex: /\\[{}]/ },    // \{ \}
		{ type: 'STRING1', regex: /\\[_]/ },	   // "\_"
		{ type: 'STRING2', regex: /\\[\^]|\\\\/ },    // "\^", "\\"
		{ type: 'SPACE', regex: /(\\[ ]|\\,|[ \t\n])+/ },    //  space: "\ ", "\,"
		{ type: 'SPECIAL_LEFT',  regex:  /(\\|\b)(left|big)(\\{|\(|\[)|(\\|\b)left\|/ },    // left(
		{ type: 'SPECIAL_RIGHT', regex: /(\\|\b)(right|big)(\\}|\)|\])|(\\|\b)right\|/ },   // right)
		{ type: 'AFTER_HAS_BRACE', regex: /(\b|\\)(frac|sqrt|stackrel|vec|overrightarrow|overline|underline|widetilde|widehat)\b|[\^_]/ }, // 后面紧跟{}block
		{ type: 'ESCAPE', regex: /[\\]/ },	  // \
		{ type: 'NUMBER', regex: /-\d+(\.\d+)?\b|\b\d+(\.\d+)?\b/ },  // -2.5
		{ type: 'STRING', regex: /[a-zA-Z0-9]+/ },    // abc123
		{ type: 'OTHER', regex: /[^"{}\[\]()\\\^_ \t\n]+/ }
	    ];
	    var m_pat = {}
	    for (var i in tokenPatterns) {
		m_pat[tokenPatterns[i].type] = tokenPatterns[i].regex;
	    }
	    const result = [];
	    let currentInput = input;
	
	    var pos = 0;
	    var cc = 0;
	    var last_len = null;
	    while (currentInput.length > 0) {
		//console.log('xxx', currentInput.length, currentInput, result.length)
		cc += 1
		if ( cc > 1000 || last_len !== null && last_len == currentInput.length) {
		    if (do_throw) throw new Error('dead?');
		}
		let matched = false;
	
		for (const { type, regex } of tokenPatterns) {
		    const match = regex.exec(currentInput);
	
		    if (match && match.index === 0) {
			let value = match[0];
	
			if (type === 'OTHER') {
			    for (var key of ['SPECIAL_LEFT', 'SPECIAL_RIGHT', 'AFTER_HAS_BRACE', 'NUMBER', 'STRING']) {
				const match1 = m_pat[key].exec(currentInput);
				if (match1 && match1.index < value.length) {
				    value = value.slice(0, match1.index);
				}
			    }
			}
			if (type === 'STRING') {
			    for (var key of ['SPECIAL_LEFT', 'SPECIAL_RIGHT', 'AFTER_HAS_BRACE']) {
				const match1 = m_pat[key].exec(currentInput);
				if (match1 && match1.index < value.length) {
				    value = value.slice(0, match1.index);
				}
			    }
			}
			var type1 = type;
       			if (type == 'STRING1') {type1 = 'STRING';}
			// console.log('vv', cc, regex, '|', value, value.length, '|')
			result.push({ type: type1, value, pos });
			pos += value.length;
			currentInput = currentInput.slice(value.length);
			matched = true;
			break;
		    }
		}
		last_len == currentInput.length;
	
		if (!matched) {
		    // This should not happen if all cases are handled
		    var msg = `No matching token found at position ${input.length - currentInput.length}`
		    show_err(input, pos, msg);
		    throw new Error(msg);
		}
	    }
	
	    return result;
	}
	
	function buildLatex(node, input) {
		//p('bbb', node)

		var arr_ret = [];
		for (var i in node.children) {
			var child = node.children[i];
			var s = child.value;
			if (child.type == 'ESCAPED_BRACE' || child.type == 'BRACKET' || child.type == 'SPECIAL_LEFT') {
				s = buildLatex(child, input);
			}
			//p('push', i, s, '>');
			arr_ret.push(s)
		}
		//console.log(arr_ret)

		var m_add_braces = {};
		function add_bracket(n, s, j) {
			if (m_add_braces[j]) return s;
			if (n.type == 'BRACKET' || n.type == 'SPECIAL_LEFT' || n.type == 'ESCAPED_BRACE') {
				m_add_braces[j] = 1;
				if (n.value.includes("(")) return "(" + s + ")";
				if (n.value.includes("[")) return "[" + s + "]";
				if (n.value.includes("{")) return "{" + s + "}";
				if (n.value.includes("|")) return "|" + s + "|";
			}
			return s;
		}
		function is_func_call(n_arr, j, direction) {
			if (direction > 0) {
				if (j+1 <= n_arr.length - 1) {
					if (n_arr[j].type == 'STRING' && /^(\\)?[a-zA-Z]([a-zA-Z0-9]|\\_)*$/.test(n_arr[j].value) 
						&& n_arr[j+1].type == 'BRACKET' && n_arr[j+1].value == '(') {
						return true;
					}
				}
			}
			if (direction < 0) {
				if (j-1 >= 0) {
					if (n_arr[j-1].type == 'STRING' && /^(\\)?[a-zA-Z]([a-zA-Z0-9]|\\_)*$/.test(n_arr[j-1].value) 
						&& n_arr[j].type == 'BRACKET' && n_arr[j].value == '(') {
						return true;
					}
				}
			}
		}
		for (var j in node.children) {
			j = parseInt(j);
			var n = node.children[j]
			if (n.type == 'STRING') {
				if (is_func_call(node.children, j, 1)) {
					arr_ret[j] = arr_ret[j] + "(" + arr_ret[j+1] + ")";
					arr_ret[j+1] = "";
					m_add_braces[j] = 1;
					m_add_braces[j+1] = 1;
					node.children[j+1].type = 'SPACE';
				}
			}
		}

		// AFTER_HAS_BRACE: 后面的加 {}
		// console.log(node)
		// for (var i in node.children) { arr_ret[i] = add_bracket(node.children[i], arr_ret[i], i); }
		for (var i in node.children) {
			var child = node.children[i]
			if (child.type != 'AFTER_HAS_BRACE') continue;
			var cur_n = child.value.replace("\\", "");
			if (cur_n != 'frac' && cur_n != 'sqrt' && cur_n != '_' && cur_n != '^') continue;

			var c1 = 2;
			if (cur_n == '_' || cur_n == '^') {
				c1 = 1;
			}
			function set_null(i1, i2) {
				for (var k = i1+1; k < i2; ++k) {
					arr_ret[k] = "";
				}
			}
			function is_last_next_ok(j) {
				var c = 0;
				for (var k = j-1; k >= 0; --k) {
					// last last now:_or^
					var n = node.children[k];
					if (n.type == 'SPACE') continue;
					if (c == 0 && /^([\^_]|\*\*)$/.test(n.value)) {
						//console.log('aa1', j, k, c, n.value);
						return false;
					}
					if (c == 1 && (/^([\^_]|\*\*)$/.test(n.value))) {
						//console.log('aa2', k, c, n.value);
						return false;
					}
					// \underbrace{X}_{Y} 的 Y 是标注不是下标，留给 trans_underbrace_to_text
					if (c == 1 && /\\(under|over)brace$/.test(n.value)) {
						return false;
					}
					c += 1;
					if (c >= 2) break;
				}
				var c = 0;
				for (var k = j+1; k < node.children.length; ++k) {
					// now:_or^ next next
					var n = node.children[k];
					if (n.type == 'SPACE') continue;
					if (/^([\^_]|\*\*)$/.test(n.value)) {
						//console.log('aa3', k, c, n.value);
						return false;
					}
					c += 1;
					if (c >= 2) break;
				}
				return true;
			}
			var ii = parseInt(i);
			if ((cur_n == '_' || cur_n == '^') && !is_last_next_ok(ii)) {
				continue;
			}

			var c = 0;
			var arr_idx = [];
			for (var j = ii+1; j < node.children.length; ++j) {
				var n = node.children[j];
				if (n.type == 'SPACE') continue;
				if (cur_n == '_') {
					var s = trans(m_sub, arr_ret[j]);
					if (s) {
						arr_ret[j] = s;
						arr_ret[i] = '';
						m_add_braces[j] = 1;
					} else {
						arr_ret[j] = add_bracket(n, arr_ret[j], j);
					}
					m_add_braces[j] = 1;
					set_null(ii, j);
				}
				if (cur_n == '^') {
					var s = trans(m_sup, arr_ret[j]);
					if (s) {
						arr_ret[j] = s;
						arr_ret[i] = '';
						m_add_braces[j] = 1;
					} else {
						arr_ret[j] = add_bracket(n, arr_ret[j], j);
					}
					m_add_braces[j] = 1;
					set_null(ii, j);
				}
				arr_idx.push(j);
				if (cur_n == 'sqrt' && c == 0 && n.type == 'BRACKET' && n.value == '[') {
				} else {
					arr_ret[j] = add_bracket(n, arr_ret[j], j);
				}
				c += 1;
				if (c >= c1) break;
			}
			if (cur_n == '_' || cur_n == '^') continue;
			function trim_bracket(s) {
				// {} 是 latex 分组、输出中无意义：内容原子的直接剥掉，否则换成 ()
				s = s.trim();
				var m = s.match(/^\{([\s\S]*)\}$/);
				if (m && !/[{}]/.test(m[1])) s = m[1].trim();
				var s1 = s.replace(/[ \t]/g, "");
				if (/^-?[^\s+\-*/^=<>±×÷⋅∘,(){}\[\]|]+$/.test(s1) ||
				    /^[a-zA-Z0-9]+\([^()]*\)$/.test(s1) ||
				    re_paren_pow.test(s1) || /^\|[^|]*\|$/.test(s1)) {
					return s;
				}
				return "(" + s + ")";
			}
			var i1 = arr_idx[0];
			var i2 = arr_idx[1];
			if (cur_n == 'sqrt') {
				var n1 = node.children[i1];
				var n2 = node.children[i2];
				if (n1 && n1.type== 'BRACKET' && n1.value == '[') {
					if (n2) {
						var sqrt_idx = m_sqrt[arr_ret[i1]];
						if (sqrt_idx) {
							var rad2 = trim_bracket(arr_ret[i2]);
							if (/^-/.test(rad2)) rad2 = '(' + rad2 + ')';
							[arr_ret[i], arr_ret[i1], arr_ret[i2]] = ["", sqrt_idx, rad2]
						} else {
							[arr_ret[i], arr_ret[i1], arr_ret[i2]] = [trim_bracket(arr_ret[i2]), "^", "(1/"+trim_bracket(arr_ret[i1])+")"]
						}
						m_add_braces[i] = 1; m_add_braces[i1] = 1; m_add_braces[i2] = 1;
						set_null(ii, i1);
						set_null(i1, i2);
					} else {
					}
				} else {
					var rad = trim_bracket(arr_ret[i1]);
					if (/^-/.test(rad)) rad = '(' + rad + ')';   // √(-5) 不写 √-5
					[arr_ret[i], arr_ret[i1]] = [m_sqrt[2], rad]
					m_add_braces[i] = 1; m_add_braces[i1] = 1;
					set_null(ii, i1);
				}
			}
			if (arr_idx.length == 2 && cur_n == 'frac') {
				// 外层括号只在相邻有歧义时才加：前贴 ^ _ / 或字母数字(2^frac、frac 连写)，
				// 后贴字母/数字/括号/命令(a/bc、a/b(x)、a/b^2 都会误读)。有空格或贴着运算符则不加
				function frac_prev_safe() {
					for (var k = ii - 1; k >= 0; --k) {
						if (node.children[k].type == 'SPACE') return true;
						if (arr_ret[k] === "") continue;
						return /[=+\-±×÷⋅*,;:(<\[{|∧∨→↔⇒⇔≤≥≠≈≡∈ \t]$/.test(arr_ret[k]);
					}
					return true;
				}
				function frac_next_safe() {
					for (var k = i2 + 1; k < node.children.length; ++k) {
						if (node.children[k].type == 'SPACE') return true;
						return /^[=+\-±×÷⋅*,;:)\]}>|∧∨→↔⇒⇔≤≥≠≈≡ \t]/.test(node.children[k].value);
					}
					return true;
				}
				var frac_s = trim_bracket(arr_ret[i1]) + "/" + trim_bracket(arr_ret[i2]);
				if (!frac_prev_safe() || !frac_next_safe()) frac_s = "(" + frac_s + ")";
				[arr_ret[i], arr_ret[i1], arr_ret[i2]] = [frac_s, "", ""]
				m_add_braces[i] = 1; m_add_braces[i1] = 1; m_add_braces[i2] = 1;
				set_null(ii, i1);
				set_null(i1, i2);
			}
		}
		//p('vvv', arr_ret)
		for (var i in node.children) {
			arr_ret[i] = add_bracket(node.children[i], arr_ret[i], i);
		}
		//console.log(node, arr_ret)
		return arr_ret.join("");
	}

	function bracket_match(left_b_n, right_b_n) {
		var left_b = left_b_n.value;
		var right_b = right_b_n.value;
		if (left_b_n.type == right_b_n.type || left_b_n.type.includes("SPECIAL") && right_b_n.type.includes("SPECIAL")) {
			if (left_b.includes("(") && right_b.includes(")")) return true;
			if (left_b.includes("[") && right_b.includes("]")) return true;
			if (left_b.includes("{") && right_b.includes("}")) return true;
			if (left_b.includes("|") && right_b.includes("|")) return true;
		}
		return false;
	}

	function buildSyntaxTree(tokens, input, do_throw) {
	    // console.log('bbttt')
	    const root = { type: 'ROOT', children: [] };
	    const stack = [root];
	
	    var left_bracket = ['(', '[', '{'];
	    var right_bracket = [')', ']', '}'];

	    tokens.forEach(token => {
		const currentNode = stack[stack.length - 1];
	
		if (left_bracket.indexOf(token.value) >=0 || token.value === '\\{' || token.type === 'SPECIAL_LEFT') {
		    // If it's an opening brace or special left, push a new node onto the stack
		    const newNode = { type: token.type, value: token.value, pos: token.pos, children: [] };
		    currentNode.children.push(newNode);
		    stack.push(newNode);
		} else if (right_bracket.indexOf(token.value) >=0 || token.value == '\\}' || token.type === 'SPECIAL_RIGHT') {
		    // For closing braces, check if it matches the top of the stack
		    if (stack.length == 0) { // no left found
			var msg = `没发现左括号和  ${token.value} 匹配`
			show_err1(input, token.pos, token.value.length, msg)
			if (do_throw) throw new Error(msg);
		    }
		    var left_b = stack[stack.length - 1]
		    if (bracket_match(left_b, token)) {
			stack.pop();
		    } else { // not match
			var msg = `左括号 ${left_b.value} 和右括号 ${token.value} 不匹配`
			//console.log('aaa', token, left_b, '|', token.pos, msg, left_b.pos)
			show_err1(input, token.pos, token.value.length, msg, left_b.pos, left_b.value.length)
			if (do_throw) throw new Error(msg);
		    }
		} else {
		    // For other types, just add them to the current node's children
		    // merge
		    if (currentNode.children.length > 0) {
			var last = currentNode.children[currentNode.children.length-1];
			// console.log('aaa', last.type, token.type, last)
			if ((last.type == 'STRING' || last.type == 'ESCAPE') && token.type == 'STRING') {
				last.value += token.value;
				last.type = 'STRING';
				if (currentNode.children.length > 1) {
					var last_1 = currentNode.children[currentNode.children.length-2];
					if (last_1.type == 'STRING') {
						last_1.value += last.value;
						currentNode.children.pop()
					}
				}
				return;
			}
		    }
		    currentNode.children.push(token);
		}
	    });
	
	    if (stack.length > 1) { // no right found
		var left_b = stack[stack.length - 1]
		var msg = `没发现右括号和  ${left_b.value} 匹配`
		//console.log(stack)
		show_err1(input, left_b.pos, left_b.value.length, msg)
		if (do_throw) throw new Error(msg);
	    }
	
	    return root;
	}


	function latex2readable(input, opts) {
	    opts = opts || {};
	    _err_out.innerHTML = '';
	    var r = _convert(String(input == null ? '' : input), opts);
	    return { text: r.text, mode: r.mode, errors: _err_out.innerHTML ? [_err_out.innerHTML] : [] };
	}

	if (typeof module !== 'undefined' && module.exports) module.exports = latex2readable;
	root.latex2readable = latex2readable;
})(typeof globalThis !== 'undefined' ? globalThis : this);
