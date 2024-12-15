function get_result_multi(words, do_prefix_lookup, cases_no_sentive) {
    var set_words =  [...new Set(words)];
    var wd_arr = []; // 扩展词干后待search的
    var m_w = {}; // 和 wd_arr配套的 weight
    var m_w_to_wordstem = {} // 原词 => 扩展出的一众词干
    for (var w of set_words) {
        w = w.trim();
        if (!w) continue;
        var wordsToSearch = getWordForms(w);
        var set_w = wordsToSearch['words'];
        m_w_to_wordstem[w] = set_w 
        for (var w1 of set_w) {
                wd_arr.push(w1);
        }
        var m = wordsToSearch['weights'];
        // console.log(m, 'a')
        for (var k in m) {
                m_w[k] = m[k];
        }
    }
    // console.log(m_w, wd_arr)
    var ret = searchInDict({"weights": m_w, "words":  [...new Set(wd_arr)]}, words.join("|"), do_prefix_lookup, cases_no_sentive);
    var m1 = {}; // 
    var m_used = {}; // 临时变量
    for (var word_ori in m_w_to_wordstem) {
        m1[word_ori] = [];
        for (var w_extend of m_w_to_wordstem[word_ori]) {
            for (var i in ret) {
                var row = ret[i];
                if (row[0].toLowerCase() == w_extend.toLowerCase() && !m_used[row[0]]) {
                        m1[word_ori].push(row);
                        m_used[row[0]] = 1;
                }
            }
        }
    }
    // console.log(ret, m1);
    return [ret, m1]; // ret: 全部查出的. m1: 原词=>扩展出的所有词
}

function get_result(word, do_prefix_lookup, cases_no_sentive) {
    word = word.trim();
    var wordsToSearch = getWordForms(word);
    return searchInDict(wordsToSearch, word, do_prefix_lookup, cases_no_sentive);
}

function getWordForms(word) {
    var forms = [word];
    var weights = [0.1];
    function forms_push(weight, word) {
        // console.log('vvvvv', word, weight)
        forms.push(word)
        weights.push(weight);
    }

    // 处理复数和不规则变化
    if (word.endsWith('s'))   forms_push(1, word.slice(0, -1));
    if (word.endsWith('ies')) forms_push(3, word.slice(0, -3) + 'y');
    if (word.endsWith('ves')) {
        forms_push(3, word.slice(0, -3) + 'f');
        forms_push(3, word.slice(0, -3) + 'fe');
    }
    if (word.endsWith('es'))  forms_push(2, word.slice(0, -2));

    // 形容词变形
    if (word.endsWith('est')) {
        forms_push(2, word.slice(0, -2));  // 去掉st
        forms_push(3, word.slice(0, -3));  // 去掉est
        forms_push(4, word.slice(0, -4));  // 尝试去掉尾4个字母
    }
    if (word.endsWith('iest')) forms_push(4, word.slice(0, -4) + 'y');

    // 所有格
    if (word.endsWith("'s")) forms_push(2, word.slice(0, -2));
    if (word.endsWith("'")) forms_push(2, word.slice(0, -1));

    if (word.endsWith('er')) {
        forms_push(1, word.slice(0, -1));  // 去掉r
        forms_push(3, word.slice(0, -2));  // 去掉er
        forms_push(4, word.slice(0, -3));  // 尝试去掉尾3个字母
    }
    if (word.endsWith('ier')) forms_push(3, word.slice(0, -3) + 'y');

    // 处理过去式和过去分词
    if (word.endsWith('ed')) {
        forms_push(2, word.slice(0, -2));  // 去掉ed
        forms_push(1, word.slice(0, -1));  // 去掉d
        forms_push(3, word.slice(0, -3));  // 尝试去掉尾三个字母
    }
    if (word.endsWith('ied')) forms_push(3, word.slice(0, -3) + 'y');

    // 处理现在分词
    if (word.endsWith('ing')) {
        forms_push(3, word.slice(0, -3));    // 去掉ing
        forms_push(4, word.slice(0, -3) + 'e'); // 替换为e
        forms_push(5, word.slice(0, -4));    // 尝试去掉尾4个字母
    }
    var m = {};
    var new_forms = [];
    for (var i in forms) {
        if (forms[i].length <= 2 && forms[i] != word) {
                continue;
        }
        new_forms.push(forms[i]);
        m[forms[i]] = weights[i];
    }
    //console.log('a', new_forms)
    //console.log('b', m)
    if (typeof m_irregular_to_ori !== 'undefined') {
        var w1 = word.toLowerCase();
        if (m_irregular_to_ori[w1]) {
            new_forms.push(m_irregular_to_ori[w1]);
            m[w1] = Math.abs(w1.length - m_irregular_to_ori[w1].length);
        }
    }
    return {'words': [...new Set(new_forms)], 'weights': m};  // 返回去重后的数组
}

function searchInDict(words_to_search, ori_word, do_prefix_lookup, cases_no_sentive) {
    var words = words_to_search['words'];
    var weights = words_to_search['weights'];
    var pattern = `@((${words.join('|')})`+ "`[^@]+)@";
    // console.log(pattern);
    var regex = new RegExp(pattern, 'g'+(cases_no_sentive ? "i" : ""));
    var matches = dict_str.match(regex) || [];
    if (matches.length > 0) {
        // console.log(matches)
    }

    // 如果没有匹配到，尝试头部匹配
    if (matches.length === 0 && do_prefix_lookup) {
        pattern = `@((${ori_word}`+"[^`]+)`[^@]+)@"; // 使用模板字符串以避免混淆
        // console.log(pattern);
        regex = new RegExp(pattern, 'g');
        matches = dict_str.match(regex) || [];
        matches = matches.slice(0, 5)
    }
    var out_arr = [];
    for (var row of matches) {
        //console.log(row)
        row = row.slice(1, -1);
        var arr = row.split("`");
        var w = 0.1;
        if (arr[0] != ori_word) {
                w = weights[arr[0]];
        }
        if (!w) {
                w = 10000. + arr[0].length;
        }
        out_arr.push([arr[0], arr[1], w]);
    }
    out_arr.sort(function(a, b) {return a[2] - b[2];});

    //console.log(out_arr)

    return out_arr;
}

function editDistance_yb(s1, s2) {
        var vowel = "ɔɪiɛɝʊoæaɑəeuʌɐɒ"; 

        const dp = Array.from({ length: s1.length + 1 }, () => Array(s2.length + 1).fill(0));

        for (let i = 0; i <= s1.length; i++) {
            dp[i][0] = i;
        }
        for (let j = 0; j <= s2.length; j++) {
            dp[0][j] = j;
        }

        function hit_v(c1, c2, str, w, sc, len) {
                // if (s2 == 'spəɡɛti') console.log(c1, c2, str, w, sc, w<sc)
                if (!len) len = 1
                if (c1.length == len && c1.length == c2.length && str.includes(c1) && str.includes(c2) && w < sc) {
                        return w;
                }
                return sc;
        }
        function h(c1, c2, str) {
                if (str.includes(c1) && str.includes(c2)) return true;
                return false;
        }
        for (let i = 1; i <= s1.length; i++) {
            for (let j = 1; j <= s2.length; j++) {
                var c1 = s1[i-1];
                var c2 = s2[j-1];
                if (s1[i - 1] === s2[j - 1] || h(c1, c2, vowel) || h(c1, c2, "ɡg") || h(c1, c2, "ðŋ")) {
                    dp[i][j] = dp[i - 1][j - 1];
                    if (c1 == c2 || h(c1, c2, "ɡg")) {
                            if (!vowel.includes(c1)) {
                                    dp[i][j] -= .2;
                            }
                    } else if (h(c1, c2, "ðŋ")) {
                        dp[i][j] += .5;
                    } else if (h(c1, c2, vowel)) {
                            var c11 = s1.slice(i-1, i+1)
                            var c22 = s2.slice(j-1, j+1)
                            var c111 = s1.slice(i-2, i)
                            var c222 = s2.slice(j-2, j)
                            var w = 0.3;
                            w = hit_v(c1, c2, "ʊu", 0.1, w);
                            w = hit_v(c1, c2, "ɪi", 0.1, w);
                            w = hit_v(c1, c2, "əɝɐ", 0.1, w);
                            w = hit_v(c1, c2, "ɪə", 0.2, w);
                            w = hit_v(c1, c2, "ɐəʌ", 0.2, w);
                            w = hit_v(c1, c2, "eɛ", 0.25, w);
                            w = hit_v(c1, c2, "ɔɛæɑɒ", 0.25, w)

                            w = hit_v(c11, c22, "ou|əʊ|əu|oʊ|aʊ|au", 0.15, w, 2);
                            w = hit_v(c11, c22, "ai|aɪ|ei|eɪ", 0.15, w, 2);

                            w = hit_v(c11, c22, "ou|əʊ|əu|oʊ|", 0.02, w, 2);
                            w = hit_v(c11, c22, "aʊ|au", 0.02, w, 2);
                            w = hit_v(c11, c22, "jʊ|ju", 0.02, w, 2);
                            w = hit_v(c11, c22, "ai|aɪ", 0.02, w, 2);
                            w = hit_v(c11, c22, "ei|eɪ", 0.02, w, 2);


                            w = hit_v(c111, c222, "ou|əʊ|əu|oʊ|aʊ|au", 0.15, w, 2);
                            w = hit_v(c111, c222, "ou|əʊ|əu|oʊ|", 0.02, w, 2);
                            w = hit_v(c111, c222, "aʊ|au", 0.02, w, 2);
                            w = hit_v(c111, c222, "jʊ|ju", 0.02, w, 2);
                            w = hit_v(c111, c222, "ai|aɪ|ei|eɪ", 0.15, w, 2);
                            w = hit_v(c111, c222, "ai|aɪ", 0.02, w, 2);
                            w = hit_v(c111, c222, "ei|eɪ", 0.02, w, 2);
                            // console.log(c1, c2, w)
                            // if (s2 == 'spəɡɛti') console.log(c1, c2, w)
                            dp[i][j] += w;
                    }

                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1] + 1,
                                        dp[i - 1][j] + 1, 
                                        dp[i][j - 1] + 1
                                        );
                }
            }
        }

        return dp[s1.length][s2.length];
}

//----
function getTop10SimilarKeys(inputString, dict, for_yb) {
    // 计算编辑距离的函数
    function editDistance(s1, s2) {
        const dp = Array.from({ length: s1.length + 1 }, () => Array(s2.length + 1).fill(0));

        for (let i = 0; i <= s1.length; i++) {
            dp[i][0] = i;
        }
        for (let j = 0; j <= s2.length; j++) {
            dp[0][j] = j;
        }

        for (let i = 1; i <= s1.length; i++) {
            for (let j = 1; j <= s2.length; j++) {
                if (s1[i - 1] === s2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
                }
            }
        }

        return dp[s1.length][s2.length];
    }

    // 计算 head-match score 的函数
    function headMatchScore(s1, s2) {
        let matchCount = 0;
        const minLength = Math.min(s1.length, s2.length);

        for (let i = 0; i < minLength; i++) {
            if (s1[i] === s2[i]) {
                matchCount++;
            } else {
                break;
            }
        }

        return matchCount / Math.max(s1.length, s2.length);
    }

    // 将字典的键转化为数组，并计算每个键的编辑距离和 head-match score
    const keys = Object.keys(dict);
    const distances = keys.map(key => {
        return {
            key,
            distance: (for_yb) ? (editDistance_yb(inputString, key)) :editDistance(inputString, key),
            headMatchScore: headMatchScore(inputString, key)
        };
    });

    // 按编辑距离升序排序；如果编辑距离相等，则按 head-match score 降序排序
    distances.sort((a, b) => {
        if (for_yb) return a.distance - b.distance;
        if (a.distance === b.distance) {
            return b.headMatchScore - a.headMatchScore;
        }
        return a.distance - b.distance;
    });
    // console.log(distances.slice(0, 10))

    // 返回前10个最相似的键
    return distances.slice(0, 10).map(item => [item.key, item.distance, item.headMatchScore]);
}

function build_yb_to_word(m_w2yb)
{
        var m = {}
        for (var w in m_w2yb) {
                var yb_all = m_w2yb[w];
                var arr_yb = yb_all.split(",")
                for (var yb of arr_yb) {
                        yb = yb.trim().slice(1, -1).replace(/[ˌˈ]/g, "").replace(/ɹ/g, "r").replace(/ɫ/g, "l");
                        if (!m[yb]) m[yb] = [];
                        m[yb].push(w);
                }
        }
        return m;
}

function word_speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // 'zh-CN'; 
    window.speechSynthesis.speak(utterance);
}

function get_word_freq_rank_and_from_cnt(w, word_source, word_freq)
{
    var w1 = w.toLowerCase();

    var freq = 1000000000;
    var from_cnt = 0;

    if (word_source[w]) from_cnt = word_source[w][0];
    else if (word_source[w1]) from_cnt = word_source[w1][0];

    if (word_freq[w]) freq = word_freq[w];
    else if (word_freq[w1]) freq = word_freq[w1];

    if (from_cnt == 0) from_cnt = ""; else from_cnt = from_cnt + "*";
    if (freq == 1000000000) freq = "";
    else if (freq > 1000) freq = (freq / 1000).toFixed(1) + "k";

    return [freq, from_cnt];
}
