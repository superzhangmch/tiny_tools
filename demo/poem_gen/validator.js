/* In-browser 平仄 / 押韵 validator: a line-by-line port of scripts/pingzhe.py (explain) and scripts/cipz.py (check_ci / compare).
   Data (char tables already resolved by the Python code) comes from validator_data.json: {c: [pl, pt, pr, ds, cg, ct]}, see scripts/export_validator.py.
   Works in the browser (global PZ) and in node (module.exports) so it can be tested against the Python output (test_validator.js). */
(function (root) {
  'use strict';
  let D = null, TPL = null, BM = null, S2 = {};
  const PUN = '，。？！；：、', SENT = '。？！';
  const BASE = { A: '平平仄仄平平仄', B: '仄仄平平仄仄平', C: '仄仄平平平仄仄', D: '平平仄仄仄平平' };
  const FORMS = [['仄起·首句不入韵', 'CDAB', 'CDAB', false], ['仄起·首句入韵', 'BDAB', 'CDAB', true], ['平起·首句不入韵', 'ABCD', 'ABCD', false], ['平起·首句入韵', 'DBCD', 'ABCD', true]];
  const pattern = (L, t) => L === 5 ? BASE[t].slice(2) : BASE[t];
  const mustOf = L => L === 5 ? [false, true, false, true, true] : [false, true, false, true, false, true, true];
  const isCJK = ch => /[㐀-鿿]/.test(ch);
  const sortedStr = a => a.slice().sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const E = c => (D && D[c]) || null;

  function init(data, tpl, bm, t2s) { D = data; TPL = tpl || TPL; BM = bm || BM; S2 = t2s || S2; }
  const t2s = s => Array.from(s).map(c => S2[c] || c).join('');      // per-char 繁→简 (opencc's phrase-level rules are not reproduced)
  function setCi(tpl, bm) { TPL = tpl; BM = bm; }

  // ---------------------------------------------------------------- 诗 (pingzhe.py)
  const lookupFmt = c => { const e = E(c); return e && e[0] ? sortedStr(e[0].map(([n, t]) => `${n}(${t})`)) : []; };
  const pingYun = c => { const e = E(c); return new Set(e && e[0] ? e[0].filter(x => x[1] === '平').map(x => x[0]) : []); };
  const inter = sets => sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))));

  function explain(lines, strict) {
    const tone_ = c => { const e = E(c); return e ? (strict ? e[2] : e[1]) : null; };
    const L = Array.from(lines[0]).length, n = lines.length, must = mustOf(L), T = lines.map(l => Array.from(l).map(tone_)), results = [];
    for (const [name, a, b, ru] of FORMS) {
      const types = (a + b).slice(0, n), exp = Array.from(types).map(t => Array.from(pattern(L, t))), viol = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < L; j++) { const t = T[i][j]; if (must[j] && (t === '平' || t === '仄') && t !== exp[i][j]) viol.push([i, j]); }
      results.push({ name, types, expected: exp, viol, rhyme_first: ru });
    }
    let best = results[0];
    for (const r of results) if (r.viol.length < best.viol.length || (r.viol.length === best.viol.length && (!r.rhyme_first) < (!best.rhyme_first))) best = r;
    const rhymeLines = []; for (let i = 1; i < n; i += 2) rhymeLines.push(i); if (best.rhyme_first) rhymeLines.push(0);
    const groups = new Map(rhymeLines.map(i => [i, pingYun(Array.from(lines[i]).pop())]));
    const known = [...groups.values()].filter(g => g.size), common = known.length ? sortedStr([...inter(known)]) : [];
    const outLines = [], issues = [];
    for (let i = 0; i < n; i++) {
      const chars = [];
      Array.from(lines[i]).forEach((c, j) => {
        const t = T[i][j], e = best.expected[i][j], en = E(c), yun = lookupFmt(c), raw = en ? en[2] : null, via = raw === '?' && (t === '平' || t === '仄');
        const dst = via ? { 平: (en[3] || [0, 0])[0], 仄: (en[3] || [0, 0])[1], manual: !!(en[3] && en[3][2]) } : null;
        let status; if (!must[j]) status = 'free'; else if (t === '平' || t === '仄') status = t === e ? 'ok' : 'bad'; else status = 'unsure';
        if (status === 'bad') issues.push({ line: i + 1, pos: j + 1, char: c, expected: e, actual: t, yun, kind: '平仄' });
        chars.push({ c, tone: t, expected: e, must: must[j], status, yun, rhyme: j === L - 1 && rhymeLines.includes(i), via_default: via, dstat: dst ? (dst.manual ? '手工指定' : `统计 平${dst['平']}:仄${dst['仄']}`) : '' });
      });
      outLines.push({ type: best.types[i], chars, pattern: best.expected[i].join('') });
    }
    for (const i of rhymeLines) {
      const c = Array.from(lines[i]).pop(), t = tone_(c), g = groups.get(i);
      if (t === '仄') issues.push({ line: i + 1, pos: L, char: c, expected: '平(韵)', actual: '仄', yun: lookupFmt(c), kind: '押韵:韵脚应为平声' });
      else if (g.size && common.length && ![...g].some(x => common.includes(x))) issues.push({ line: i + 1, pos: L, char: c, expected: '同韵部 ' + common.join('/'), actual: sortedStr([...g]).join('/'), yun: [], kind: '押韵:不同韵部' });
    }
    if (known.length && !common.length) issues.push({ line: 0, pos: 0, char: '', expected: '韵脚同一韵部', actual: '各韵脚没有共同韵部: ' + [...groups.entries()].map(([i, g]) => `${Array.from(lines[i]).pop()}:${sortedStr([...g]).join('/') || '?'}`).join(' | '), yun: [], kind: '押韵:整体不同韵' });
    for (let i = 0; i < n; i++) {
      const t3 = []; for (let j = L - 3; j < L; j++) t3.push(T[i][j]); const tail = Array.from(lines[i]).slice(-3).join('');
      if (t3.every(x => x === '仄')) issues.push({ line: i + 1, pos: L, char: tail, expected: '避免三仄尾', actual: '仄仄仄', yun: [], kind: '提示:三仄尾' });
      if (t3.every(x => x === '平')) issues.push({ line: i + 1, pos: L, char: tail, expected: '避免三平尾', actual: '平平平', yun: [], kind: '提示:三平尾' });
    }
    const pairs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = T[i][1], b = T[i + 1][1], kind = i % 2 === 0 ? '对' : '粘', det = (a === '平' || a === '仄') && (b === '平' || b === '仄');
      pairs.push({ kind, lines: [i + 1, i + 2], a, b, chars: [Array.from(lines[i])[1], Array.from(lines[i + 1])[1]], ok: det ? (kind === '对' ? a !== b : a === b) : null });
    }
    const disp = L === 5 ? nm => nm.replace('平起', '@').replace('仄起', '平起').replace('@', '仄起') : nm => nm;
    const rl = rhymeLines.slice().sort((x, y) => x - y), yunMap = {};
    for (const i of rl) yunMap[Array.from(lines[i]).pop()] = sortedStr([...groups.get(i)]);
    return { kind: (L === 5 ? '五' : '七') + (n === 4 ? '绝' : '律'), best: disp(best.name), rhyme_first: best.rhyme_first, lines: outLines, issues, pairs,
      forms: results.slice().sort((x, y) => x.viol.length - y.viol.length).map(r => ({ name: disp(r.name), violations: r.viol.length, patterns: r.expected.map(e => e.join('')) })),
      rhyme: { lines: rl.map(i => i + 1), common, chars: rl.map(i => Array.from(lines[i]).pop()), yun: yunMap },
      n_violations: issues.filter(x => !x.kind.startsWith('提示')).length };
  }
  function splitLines(text) { return text.split(/[，。？！；：、,.?!;:\s\n]+/).filter(Boolean); }
  function checkPoem(text, strict) {
    const lines = splitLines(t2s(text || ''));
    if (!lines.length) return { error: '请输入诗句' };
    const L = Array.from(lines[0]).length, ls = lines.map(x => Array.from(x).length);
    if (![5, 7].includes(L) || ![4, 8].includes(lines.length) || ls.some(x => x !== L)) return { error: `只支持近体诗: 4 句或 8 句, 每句 5 或 7 字. 现在是 ${lines.length} 句, 每句字数 [${ls.join(', ')}]`, lines };
    const e = explain(lines, !!strict); e.lines_text = lines; return e;
  }

  // ---------------------------------------------------------------- 词 (cipz.py)
  const cgroups = c => { const e = E(c); return e && e[4] ? e[4].map(x => `${x[0]}|${x[1]}`) : []; };      // "部|类" keys
  const gKey = k => { const [b, cl] = k.split('|'); return [Number(b), cl]; };
  const ctone = c => { const e = E(c); return e ? e[5] : null; };
  function splitCi(text) {
    const body = [], ends = [];
    for (const ch of text) { if (PUN.includes(ch)) { if (body.length) ends.push([body.length - 1, ch]); } else if (isCJK(ch)) body.push(ch); }
    return [body.join(''), ends];
  }
  function alignCore(a, b) {                      // returns [pairs of indexes (i|null, j|null) , D[n][m]]
    const n = a.length, m = b.length, Dm = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)), bt = {};
    for (let i = 1; i <= n; i++) { Dm[i][0] = Dm[i - 1][0] + a[i - 1]; bt[i + ',0'] = 'u'; }
    for (let j = 1; j <= m; j++) { Dm[0][j] = Dm[0][j - 1] + b[j - 1]; bt['0,' + j] = 'l'; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const c = [[Dm[i - 1][j - 1] + Math.abs(a[i - 1] - b[j - 1]), 'd'], [Dm[i - 1][j] + a[i - 1], 'u'], [Dm[i][j - 1] + b[j - 1], 'l']];
      let best = c[0]; for (const x of c) if (x[0] < best[0] || (x[0] === best[0] && x[1] < best[1])) best = x;
      Dm[i][j] = best[0]; bt[i + ',' + j] = best[1];
    }
    let i = n, j = m; const out = [];
    while (i || j) { const mv = bt[i + ',' + j]; if (mv === 'd') { out.push([i - 1, j - 1]); i--; j--; } else if (mv === 'u') { out.push([i - 1, null]); i--; } else { out.push([null, j - 1]); j--; } }
    return [out.reverse(), Dm[n][m]];
  }
  const alignIdx = (a, b) => alignCore(a, b)[0];
  function seqAlign(a, b) {
    const [idx, d] = alignCore(a, b), sum = x => x.reduce((s, v) => s + v, 0);
    return [idx.map(([i, j]) => [i === null ? null : a[i], j === null ? null : b[j]]), 1 - d / Math.max(sum(a), sum(b), 1)];
  }
  const lensFromEnds = (ends, total) => { const out = []; let prev = -1; for (const i of ends) { out.push(i - prev); prev = i; } if (prev < total - 1) out.push(total - 1 - prev); return out; };
  const pyRound3 = x => { const s = x * 1000, f = Math.floor(s), d = s - f; let r = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(s); return r / 1000; };      // python round(): half to even

  function checkCi(tune, text, simplified) {
    tune = t2s(tune || ''); const [body, ends] = splitCi(simplified ? (text || '') : t2s(text || '')), total = Array.from(body).length, B = Array.from(body);
    if (!total) return { error: '没有汉字' };
    const tp = TPL[tune];
    if (!tp) return { error: `词牌「${tune}」没有模板 (语料里该词牌少于 30 首). 只能检查字数`, total };
    const vmap = {}; for (const v of tp.variants) vmap[v.total] = v;
    let main = tp.variants[0]; for (const v of tp.variants) if (v.n > main.n) main = v;
    const v = vmap[total] || null; let cand = v;
    if (!cand) { cand = tp.variants[0]; for (const x of tp.variants) if (Math.abs(x.total - total) < Math.abs(cand.total - total)) cand = x; }
    const sents = []; let prev = -1;
    for (const [i, ch] of ends) if (SENT.includes(ch)) { sents.push(i - prev); prev = i; }
    if (prev < total - 1) sents.push(total - 1 - prev);
    const std = lensFromEnds(cand.sent_ends, cand.total), [pairs, sim] = seqAlign(sents, std);
    const res = { tune, total, standard: tp.variants.map(x => ({ total: x.total, n: x.n })), match_total: v !== null, sentence_alignment: pairs.map(([a, b]) => ({ got: a, std: b })), sentence_match: pyRound3(sim), main_total: main.total };
    const issues = [], clauseEnd = new Map(ends.map(([i, ch]) => [i, ch])); let tpos, tm;
    if (v === null) {
      issues.push({ kind: '字数', msg: `共 ${total} 字, 「${tune}」的常见字数为 ${tp.variants.map(x => x.total + '字(' + x.n + '首)').join('/')}` });
      const gc = lensFromEnds(ends.map(e => e[0]), total), sc = lensFromEnds(cand.clause_ends, cand.total), go = [0], so = [0];
      for (const x of gc) go.push(go[go.length - 1] + x); for (const x of sc) so.push(so[so.length - 1] + x);
      tpos = new Array(total).fill(null);
      for (const [i, j] of alignIdx(gc, sc)) if (i !== null && j !== null && gc[i] === sc[j]) for (let k = 0; k < gc[i]; k++) tpos[go[i] + k] = so[j] + k;
      tm = cand;
    } else { tpos = Array.from({ length: total }, (_, i) => i); tm = v; }
    const tmpl = tm.tmpl, rh = new Set(tm.rhyme), rpos = []; for (let i = 0; i < total; i++) if (tpos[i] !== null && rh.has(tpos[i])) rpos.push(i);
    const gs = new Map(); for (const i of rpos) for (const g of cgroups(B[i])) gs.set(g, (gs.get(g) || 0) + 1);
    let mainG = null, bestN = 0; for (const [g, c] of gs) if (c > bestN) { bestN = c; mainG = g; }
    const chars = []; let checked = 0;
    B.forEach((c, i) => {
      const t = ctone(c), e = tpos[i] !== null ? tmpl[tpos[i]] : null; let st = 'free';
      if (e === '平' || e === '仄') st = t === e ? 'ok' : ((t === '?' || t === null) ? 'unsure' : 'bad');
      const r = rpos.includes(i), cg = cgroups(c);
      if (st === 'bad') issues.push({ kind: '平仄', pos: i + 1, char: c, expected: e, actual: t, yun: sortedStr(cg.map(k => { const [b, cl] = gKey(k); return `第${b}部${cl}`; })) });
      let rst = null;
      if (r && mainG) {
        rst = cg.includes(mainG) ? 'ok' : (!cg.length ? 'unsure' : 'bad');
        if (rst === 'bad') { const [mb, mc] = gKey(mainG); issues.push({ kind: '押韵', pos: i + 1, char: c, expected: `第${mb}部${mc}`, actual: sortedStr(cg.map(k => { const [b, cl] = gKey(k); return `第${b}部${cl}`; })).join('/') || '?', yun: [] }); }
      }
      if (tpos[i] !== null) checked++;
      chars.push({ c, tone: t, expected: e, status: st, rhyme: r, rhyme_status: rst, punct: clauseEnd.get(i) || '', checked: tpos[i] !== null });
    });
    Object.assign(res, { variant: { total: tm.total, n: tm.n, fixed: tm.fixed }, rhyme_positions: rpos.map(i => i + 1), rhyme_class: mainG ? `第${gKey(mainG)[0]}部(${gKey(mainG)[1]})` : null, partial: v === null, checked_chars: checked });
    Object.assign(res, { chars, issues, n_violations: issues.filter(x => x.kind !== '字数').length + (v ? 0 : 1) });
    return res;
  }
  function splitSentences(chars) { const out = []; let cur = []; for (const c of chars) { cur.push(c); if (c.punct && SENT.includes(c.punct)) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; }
  function compareCi(tune, text) {
    tune = t2s(tune || ''); const res = checkCi(tune, text), b = BM && BM[tune];
    if (res.error || !b) return res;
    const bres = checkCi(tune, b.text, true), g = splitSentences(res.chars), s = splitSentences(bres.chars), rows = [];
    for (const [gi, bi] of alignIdx(g.map(x => x.length), s.map(x => x.length))) {
      const gs = gi !== null ? g[gi] : null, bs = bi !== null ? s[bi] : null;
      rows.push({ gen: gs, bm: bs, gen_len: gs ? gs.length : 0, bm_len: bs ? bs.length : 0, same: !!(gs && bs && gs.length === bs.length) });
    }
    res.benchmark = { author: b.author, total: b.total, n_candidates: b.n_candidates, violations: b.violations }; res.rows = rows;
    res.rows_same = rows.filter(r => r.same).length; res.rows_total = rows.length; return res;
  }
  function tunes() { return Object.entries(TPL).map(([name, v]) => ({ name, n: v.n, total: v.variants.reduce((a, x) => (x.n > a.n ? x : a), v.variants[0]).total })).sort((a, b) => b.n - a.n); }
  function realCi(tune) { const b = BM && BM[tune]; return b ? { text: b.text, author: b.author, tune, benchmark: true } : { error: `词牌 ${tune} 没有标杆词 (语料少于 30 首)` }; }

  const API = { init, setCi, explain, checkPoem, checkCi, compareCi, tunes, realCi, splitLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.PZ = API;
})(typeof self !== 'undefined' ? self : this);
