---
name: haoxue-ppt
description: 教学设计驱动的讲课课件生成器。七层架构：教学意图 → 叙事 → 认知 → 内容 → 设计 → PPTX → 质检。输入教材/大纲/参考 PPT，输出原生可编辑的 16:9 PPT。内置九种认知动作校验（每页标注"学生此刻该做什么"）、Ghost Deck 标题测试、参考 PPT 的 Design DNA 提取、七维教学评分（<8 分重做）、Color Engine 色彩层级引擎（10 套 Color Families：少色相、多色阶；少纯色、多表面）、页角弧线装饰、18 种版式、右上角章节导航、16 项技术质检 + Color QA 用色纪律检查。当用户要"做一份课件/教学 PPT/讲课 PPT"、"把这章内容做成课件"、"学这个 PPT 的风格重做一份"、"改一下第 8 页"时使用。不服务汇报型 PPT。
compatibility: 需要 Node.js ≥18 与 pptxgenjs（构建）、JSZip（后处理）。可选：sharp（局部放大裁切）、Python + python-pptx/Spire.Presentation（渲染校对、质检、DNA 提取与教学评分）。
---

# 耗学 PPT · 讲课课件生成器

**先决定学生的大脑要发生什么，再决定这一页怎么排。**

大多数 PPT 工具问的是"第 7 页放什么"；这里先问"第 7 页学生该发生什么认知动作"——
放案例、放图、放问题还是放流程，是那个答案的结果，不是起点。

---

## 一、七层结构

| 层 | 管什么 | 一句话判据 | 细节 |
|---|---|---|---|
| 1 教学意图 | 为什么教、学完能做什么 | 目标句里有动词，能被检验 | `references/pedagogy.md` |
| 2 叙事引擎 | 反差→问题→思考→知识→案例→迁移 | 只读标题就能讲完整堂课 | `references/narrative.md` |
| 3 认知引擎 | 每页学生的大脑在做什么 | 每页有且只有一个认知动作 | `references/cognitive.md` |
| 4 内容引擎 | 教材、案例、数据、图片从哪来 | 每个案例有具体的人和数，且声明为模拟 | `references/sources.md` |
| 5 设计引擎 | 学参考 PPT 的什么、怎么不照抄；色彩层级 | 只迁结构与节奏；色相 ≤3、底色带温度 | `references/design-dna.md`、`references/color-engine.md` |
| 6 PPTX 引擎 | 生成、修改、读取原生文件 | 打开能改字改色拖动，不是截图 | `references/pptx-engine.md` |
| 7 教学质检 | 这堂课立不立得住 | 七维 ≥8 分，否则重做 | `references/teaching-qa.md` |

版式怎么选（19 种版式的字段与配图）见 `references/layouts.md`；
色彩层级（10 套 Color Families、11 档色阶、三层表面、配比卡）见 `references/color-engine.md`——
**新课件选色一律走 Color Engine（`--theme c01…c10`），不是"再配一套色"。**
13 类教学页面的配方（案例开场/冲突/概念揭示/学生任务…）见 `references/layout-library.md`。

---

## 二、两种模式，先分清

### A｜课程开发模式（从教材开始）

```
教材/大纲 → 提知识树 → 定 intent（6 字段）→ 排 9 种认知动作 → 写标题
  → Ghost Deck 测试 → 选 Color Family（palette.js card 给用户挑）→ 出逐页大纲（等用户确认）
  → 写 deck spec → 构建 → 七维评分 + Color QA → 修 → 再评分
```

### B｜旧 PPT 改造模式（用户已有成品）

```
旧 PPT → dna.py 抽 DNA（要沿用配色就 palette.js from 提取成 C10）
  → 找教学问题（缺预测？缺冲突？全是目录页？）
  → 重建叙事（保留好素材与结构）→ 重新写 spec → 构建 → 评分
```

改造模式**不接管原文件的排版**，只接管它的结构判断。原 PPT 里的图、数据、案例要保留，
但要重新回答"这一页学生该做什么"。旧文件本身用 `pptx-engine.md` 里的读取路径分析。

---

## 三、不可协商的硬约束

违反任何一条，不要交付。

1. **每页必须有一个认知动作**（`page.cognitive`，九选一）。没有动作的页 = 没有教学功能。
2. **必须包含**：`prediction`（先判断）、`conflict`（推翻误解）、`application`（会用）；
   ≥12 页还要 `transfer`（知道边界）。缺一个就报错。
3. **不许连续三页同一动作**，也不许连续三页同一版式。
4. **整册最小字号 ≥16pt**（含页码、图注、导航）。不够就删字、拆页，绝不缩字号。
5. **Ghost Deck 必须通过**（≥75 分）：只读标题能讲完整堂课。目录式标题（"管理概述"）直接判不通过。
6. **Teaching QA ≥8.0**（七维加权）。低于 8 分是"重做"，不是"先交付再改"。
7. **一页一件事**。塞不下不是排版问题，是该拆页。
8. **案例必须声明**"教学模拟/虚构"，且写明适用边界。
9. **内容源是 spec JSON**，不是 PPTX。改内容改 JSON 再构建，不手改成品页。
10. **原生可编辑**：文字是真文本、图表是原生图表、形状是原生形状。
11. **有图页与无图页都要跑过**（`--image none`）：没有素材也要排得住。
12. **必须看图**。质检脚本只报可计算的问题，版面难不难看只能用眼睛判断。
13. **色彩有纪律**：底色带色温（禁 #FFFFFF 底 / #000000 正文）、饱和色相 ≤3 族、强调色面积 ≤10%、
    一切颜色来自 theme token 与 `tone` 档位（禁手写 HEX 造色阶）。成品跑 `colorqa.py` 验收。

---

## 四、命令

```bash
# 构建整套
node scripts/build.js examples/x.deck.json -o out/x.pptx
node scripts/build.js <spec> -o out/p8.pptx --only 8                  # 只重建第 8 页
python scripts/splice.py out/x.pptx out/p8.pptx 8 -o out/fixed.pptx   # 单页换回整套
node scripts/build.js <spec> --theme all -o out/themes                 # 主题批量
node scripts/palette.js list                        # 10 套 Color Families + 11 档色阶
node scripts/palette.js show c05                    # 展开一套：色阶/表面/配比/对比度
node scripts/palette.js card                        # 选色卡 out/palette.html（发给用户挑）
node scripts/palette.js from 纸白 主色 强调 墨色      # C10：从参考 PPT 提取
node scripts/build.js <spec> -o out/noimg.pptx --image none            # 无图版
node scripts/build.js <spec> -o out/tabs.pptx --nav tabs               # 章节胶囊导航

# 三层质检（顺序不要颠倒：先叙事，再教学，最后技术）
python scripts/ghostdeck.py <spec|pptx>            # ① 只读标题，检验叙事（<75 不通过）
python scripts/teachqa.py <pptx> --spec <spec>     # ② 七维教学评分（<8.0 重做）
python scripts/qa.py <pptx>                        # ③ 16 项技术质检（0 必须修复）
python scripts/colorqa.py <pptx>                   # ④ 用色纪律：主导性/色阶/表面（少色相多色阶）

# 辅助
python scripts/dna.py 参考.pptx --json out/dna.json   # 参考 PPT 的 Design DNA
python scripts/render.py <pptx> --out out/preview     # 渲染成 PNG
python scripts/sheet.py out/preview -o out/sheet.png --cols 3   # 拼总览图
node tests/test_skill.js                            # 生成层自检（含 Color Engine）
python scripts/pack.py                              # 打包分发
```

---

## 五、按需加载

| 你在做什么 | 读这个 |
|---|---|
| 定目标、判断课时容量、写 intent | `references/pedagogy.md` |
| 排顺序、写标题、跑 Ghost Deck | `references/narrative.md` |
| 判断这页该放什么、认知负荷超没超 | `references/cognitive.md` |
| 找案例、写数据、处理图片与事实边界 | `references/sources.md` |
| 用户给了参考 PPT，要学它的设计 | `references/design-dna.md` |
| 选页面类型（案例开场/冲突/任务页…） | `references/layout-library.md` |
| 选具体版式、写 spec 字段 | `references/layouts.md`、`references/spec.md` |
| 改文案后重建、处理 OOXML、字号工程 | `references/pptx-engine.md` |
| 评分不达标、要知道先修哪一项 | `references/teaching-qa.md` |
| 技术质检报错、已知限制 | `references/qa.md` |
| 选配色方向、看色阶/配比、从参考提取 C10 | `references/color-engine.md` |
| 旧主题（slate/academic 等）切换规则 | `references/themes.md` |
| 加图表 | `references/charts.md` |

---

## 六、交付定义

一份课件算"做完"，必须同时满足：

- [ ] Ghost Deck ≥75，且没有目录式标题
- [ ] Teaching QA ≥8.0，七维无"致命"
- [ ] `qa.py` 0 项必须修复；`colorqa.py` 无 error/warn（色相 ≤4、有主导、有表面）
- [ ] ≥10 页、≥6 种版式；有 1 页互动、1 页案例、1 页总结
- [ ] 每页右上角导航位置一致、当前章节正确
- [ ] 整册最小字号 ≥16pt，单页 ≤5 种字号
- [ ] 案例有模拟声明与适用边界
- [ ] 逐页看过渲染图，没有"程序通过但版面难看"的页
- [ ] 讲稿写的是"要说什么"，不是抄页面上的字

报告给用户：文件路径、页数与版式分布、三层质检结论、哪些是占位（图片/数据/待补）。

---

## 七、这些事不要做

- 没确认大纲就直接生成 20 页
- 把教材整段塞进一页；为塞下而缩字号
- 用 emoji、艺术字、PPT 自带剪贴画
- 手写 HEX 凑颜色、给页面铺纯白底、把强调色铺满一页
- 给所有形状加阴影，或给深色页加阴影（看不见，只会脏）
- 为了"看起来有图"插无关装饰图
- 照搬参考 PPT 的 logo、人物图、成组几何装饰
- 以"脚本跑通了"作为验收标准
