# 多个小工具
- 《说文解字》检索: shuowenjiezi_search.html
- 查异体字：回字的多种写法 fanyiti.htm
- 汉字笔画检索 bihua.html
- 找字：根据拼音与笔顺找字 py_bh_find.html
- 成语检索、成语接龙 chengyu_search.html
- 物理模拟（只给最底层定律，让公式自己涌现）: windtunnel.html / idealgas.html / blackbody.html / catenary.html
  

### 物理模拟：从最基本的物理定律出发，让宏观公式自己涌现
思路都一样——代码里只写最底层的微观规则，宏观定律（气体状态方程、麦克斯韦分布、普朗克谱、悬链线 cosh 等）不是硬编码的，而是模拟跑出来后**测量/涌现**出来的。均为单文件、浏览器直接打开。

- **手绘风洞 windtunnel.html** [online](https://superzhangmch.github.io/tiny_tools/windtunnel.html)
  - 格子玻尔兹曼（LBM, D2Q9）流体求解器。鼠标拖动画出任意障碍，绕流、卡门涡街、翼型升力都从"障碍边界反弹"这一条规则里涌现。
- **理想气体 idealgas.html** [online](https://superzhangmch.github.io/tiny_tools/idealgas.html)
  - 分子动力学：只有弹性碰撞。温度、压强、`PV=NkT`、麦克斯韦速率分布全是测出来的；含 P–V 图（绝热 vs 等温）与冷热壁热传导。
- **黑体辐射 blackbody.html** [online](https://superzhangmch.github.io/tiny_tools/blackbody.html)
  - 空腔驻波模式 + 热库，Metropolis 蒙特卡洛。切"经典"看**紫外灾难**，切"量子（能量成块 hν）"看**普朗克谱**涌现；含维恩位移、斯特藩-玻尔兹曼。物理自检见 bb_check.js。
- **悬链线 catenary.html** [online](https://superzhangmch.github.io/tiny_tools/catenary.html)
  - 纯牛顿绳子（Verlet + 张力约束）。绳子晃动静止后自动落在解析 cosh 曲线（ground truth）上，误差 <1px。可拖端点、扰动。

### 《说文解字》检索: shuowenjiezi_search.html
- [online](https://superzhangmch.github.io/tiny_tools/shuowenjiezi_search.html)
- 或下载后浏览器直接使用。不过需要把北师大篆体字体弄好。
![image](https://github.com/user-attachments/assets/92c5f195-e6a1-4e7a-bab1-ae5abce5af14)

### 查异体、繁体：回字的多种写法 fanyiti.htm
- [online](https://superzhangmch.github.io/tiny_tools/fanyiti.htm) 或下载后浏览器直接打开使用。
![image](https://github.com/user-attachments/assets/933fcf78-fe07-4fda-a43f-729fb142845a)

### 汉字笔画检索 bihua.html
- [online](https://superzhangmch.github.io/tiny_tools/bihua.html) 或下载后浏览器直接打开使用。
- 笔画"横竖撇捺折"对应 12345
- 支持通配符：`?`代表任意一个笔画，`*`代表0到任意多个笔画。把一部分括号括起来后，其后的 `\1` 可以表示匹配括号内的。
  - 举例：品字形：`(*)\1\1\1`。叕字形：`(*)\1\1\1`。左边是“亻”，右边是品字形：`32(*)\1\1`
  ![image](https://github.com/user-attachments/assets/eacff951-f20f-4ac5-9e7e-2f4f8b51ebaf)

### 成语检索、成语接龙 chengyu_search.html
- [online](https://superzhangmch.github.io/tiny_tools/chengyu_search.html) 或下载后浏览器直接打开使用。

### 找字：知道大概发音与大概字形找字 py_bh_find.html
- 一个字，想不起来怎么写了，读音拿不准，字形拿不准。那么就用拼音的一部分与字形笔顺的一部分，来找字。 [online](https://superzhangmch.github.io/tiny_tools/py_bh_find.html)
- 比如图中找一个字：字形里有个者字，读音拼音以o或e结尾
  
  ![image](https://github.com/user-attachments/assets/2a77a3bb-86eb-4078-801f-b1a54dcd1485)

