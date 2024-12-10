import os
import json
import re

m_word_freq = {}
i = 0
for line in open("/home/zhangmiaochang/dict/en_full.txt.1"):
    i += 1
    LL = line.strip().split(" ")
    w = LL[0]
    m_word_freq[w] = i
fp = open("word_freq.js", "w")
fp.write("// data from https://raw.githubusercontent.com/hermitdave/FrequencyWords/refs/heads/master/content/2018/en/en_full.txt\n")
fp.write("var word_freq = %s; \n" % (json.dumps(m_word_freq).replace(" ", "")))
    
m = {}
m_ori = {}
m_simple = {}

m_dy_us = {}
m_dy_uk = {}
fs = os.listdir()

source = {}
source_ori = {}
source_simple = {}

for f in fs:
    if 'IELTS_disorder' in f: continue
    ff = f.split(".")[0].lower()
    ff_ori = ff
    f1 = ff
    if 'cet4' in f1: ff_simple = 'cet4'
    elif 'cet6' in f1: ff_simple = 'cet6'
    elif 'kaoyan' in f1: ff_simple = 'kaoyan'
    elif 'xiaoxue' in f1: ff_simple = 'xiaoxue'
    elif 'chuzhong' in f1 or 'zhongkao' in f1: ff_simple = 'chuzhong'
    elif 'gaozhong' in f1 or 'gaokao' in f1: ff_simple = 'gaozhong'
    elif 'ielts' in f1: ff_simple = 'ielts'
    elif 'toefl' in f1: ff_simple = 'toefl'
    elif 'gre' in f1: ff_simple = 'gre'
    elif 'sat' in f1: ff_simple = 'sat'
    elif 'gmat' in f1: ff_simple = 'gmat'
    elif f1[:3] == 'ef_': ff_simple = 'ef'
    elif f1[:3] == 'ef_': ff_simple = 'pt'
    elif f1[:4] == 'pte_': ff_simple = 'pte'
    else: ff_simple = ""

    if 'CET4' in f or 'CET6' in f:
        pass
    else:
        ff = re.sub(r'([^0-9])[0-9]([^0-9])', r'\1_n_\2', ff, flags=re.IGNORECASE)
        ff = re.sub(r'([^0-9])[0-9]$', r'\1_n', ff, flags=re.IGNORECASE)
        ff = ff.replace("__", "_").replace("_-", "-").replace("-_", "-")
    if f[-4:] != 'json':
        continue
    d = json.loads(open(f).read())
    for d1 in d:
        w = d1['name']
        if not w: continue
        if ' ' in w: continue
        if '(' in w: continue
        if '…' in w: continue
        if '...' in w: continue

        if 'ukphone' in d1 and d1['ukphone']: m_dy_uk[w] = d1['ukphone']
        if 'usphone' in d1 and d1['usphone']: m_dy_us[w] = d1['usphone']

        if w not in m: m[w] = []
        m[w].append(ff) 

        if ff not in source: source[ff] = 0
        source[ff] += 1

        if w not in m_ori: m_ori[w] = []
        m_ori[w].append(ff_ori) 

        if ff_ori not in source_ori: source_ori[ff_ori] = 0
        source_ori[ff_ori] += 1

        if ff_simple:
            if w not in m_simple: m_simple[w] = []
            m_simple[w].append(ff_simple) 

            if ff_simple not in source_simple: source_simple[ff_simple] = 0
            source_simple[ff_simple] += 1
        #else: print (f)

source_all = {}
for f in source: source_all[f] = source[f]
for f in source_ori: source_all[f] = source_ori[f]
for f in source_simple: source_all[f] = source_simple[f]

arr = [(f, source_all[f]) for f in source_all]
arr = sorted(arr, key =lambda x: x[1], reverse=True)
#for s, c in arr: print (s, c)

m_s = {arr[i][0]: i for i in range(len(arr))}
m_s_rev = {i: arr[i][0] for i in range(len(arr))}
assert 'gre_n_t' in source
assert 'gre_n_t' in source_all
assert 'gre_n_t' in m_s

word_all = set(m.keys()) | set(m_ori.keys()) | set(m_simple.keys())
m_out = {}

fp = open("word_source.js", "w")
fp.write("// data from https://github.com/zyronon/typing-word/tree/master/public/dicts/en/word/common\n");
for w in word_all:
    a = m[w] if w in m else []
    a_ori = m_ori[w] if w in m_ori else []
    a_simple = m_simple[w] if w in m_simple else []

    all_from = list(set([m_s[x] for x in a + a_ori + a_simple]))
    m_out[w] = [len(a), len(a_ori), len(a_simple)] + all_from
    #print (w, m_out[w])
fp.write("var word_source = %s;\n" % json.dumps(m_out).replace(" ", ""))
fp.write("var id2source = %s;\n" % json.dumps(m_s_rev).replace(" ", ""))

info = list(set([m_s[x] for x in source]))
info_ori = list(set([m_s[x] for x in source_ori]))
info_simple = list(set([m_s[x] for x in source_simple]))
fp.write("var source_info = %s;\n" % json.dumps({"normal": info, "ori": info_ori, "simple": info_simple}).replace(" ", ""))

if 0:
    m = m_simple
    arr = [(w, list(set(m[w])), len(set(m[w]))) for w in m]
    arr =sorted(arr, key=lambda x: x[2], reverse=True)
    #print (len(m_dy_us))
    #print (len(m_dy_uk))
    for w, a, b in arr: print (w, b, "|".join(a))
