# 写诗 · 写词（浏览器本地运行）

两个 7M 参数的字符级 GPT（int8，诗 7.0 MB、词 7.2 MB，用到哪个才下载哪个），推理是手写 JS，全部在浏览器里跑，文字不会上传。生成之后按平水韵（诗）、词林正韵 + 词牌模板（词）逐字校验平仄、押韵、字数，并和统计出来最典型的"标杆词"逐句对照。

- 诗模型：从零训练后再用 GRPO 强化学习调过（奖励：押韵 + 惩罚同一首里韵脚字重复）。
- 词模型：独立从零训练，字数常常不对，校验会标出来。
- 主题：下拉里是现成的组合（语料里常一起出现的词），也可以自己输入，最多 4 个。
- 校验器 `validator.js` 是 Python 校验逻辑的逐行移植，和 Python 版在近 3000 个用例上结果一致（只有繁体转简体按单字而不是按词转换、以及词主韵部票数相同时的取舍两处不同）。

训练、评测、实验记录和全部代码见 [my-tiny-models/poem_generator](https://github.com/superzhangmch/my-tiny-models/tree/main/poem_generator)。

数据来源：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT，全唐诗/宋诗/宋词）；平水韵字表来自 PyPI `pingshui-rhyme`（MIT，见 `LICENSE.pingshui-rhyme`）；词林正韵来自 Wikisource《詞林正韻》（戈载）。
