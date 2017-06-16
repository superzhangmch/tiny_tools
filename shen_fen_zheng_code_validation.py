#encoding: utf8
"""
身份证号码验证，以及抹掉生日的月日后，反查月日
"""
import numpy as np

def check(sfz):
    w = np.array([int(i) for i in "7 9 10 5 8 4 2 1 6 3 7 9 10 5 8 4 2".split(" ")])
    v = np.array([int(i) for i in sfz[:-1]])
    idx = sum(w * v) % 11
    m = [i for i in "1 0 X 9 8 7 6 5 4 3 2".split(" ")]
    last = m[idx]
    #print sfz[-1], "vs", last
    if sfz[-1] == last:
        return True
    else:
        return False


prefix = "1456781999"
sufix = "2121"

for i in xrange(12):
    mm = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    max_d = mm[i]
    for j in xrange(max_d):
        m = "0" + str(i + 1)
        m = m[-2:]
        d = "0" + str(j + 1)
        d = d[-2:]
        sfz = prefix + m + d + sufix
        if check(sfz):
            print prefix + "[" + m + d + "]" + sufix
