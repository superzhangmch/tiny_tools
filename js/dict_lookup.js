
function get_result_multi(words, do_prefix_lookup, cases_no_sentive) {
    var set_words =  [...new Set(words)];
    var wd_arr = [];
    var m_weight = {};
    var m_w = {};
    var m_w_to_wordstem = {}
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
    var m1 = {}
    var m_used = {}
    for (var word_stem in m_w_to_wordstem) {
	m1[word_stem] = [];
	for (var w of m_w_to_wordstem[word_stem]) {
    	    for (var i in ret) {
	        var row = ret[i];
		if (row[0].toLowerCase() == w.toLowerCase() && !m_used[row[0]]) {
			m1[word_stem].push(row);
			m_used[row[0]] = 1;
		}
            }
	}
    }
    // console.log(ret, m1);
    return [ret, m1];
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
    if (word.endsWith('ves')) forms_push(3, word.slice(0, -3) + 'f');
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
        forms_push(4, word.slice(0, -4));  // 尝试去掉尾4个字母
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

//----
function getTop10SimilarKeys(inputString, dict) {
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
            distance: editDistance(inputString, key),
            headMatchScore: headMatchScore(inputString, key)
        };
    });

    // 按编辑距离升序排序；如果编辑距离相等，则按 head-match score 降序排序
    distances.sort((a, b) => {
        if (a.distance === b.distance) {
            return b.headMatchScore - a.headMatchScore;
        }
        return a.distance - b.distance;
    });

    // 返回前10个最相似的键
    return distances.slice(0, 10).map(item => [item.key, item.distance, item.headMatchScore]);
}
