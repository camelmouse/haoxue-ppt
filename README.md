# 耗学 PPT（haoxue-ppt）

**教学设计驱动的讲课课件生成器。** 输入一份结构化 JSON，输出原生可编辑的 16:9 `.pptx`。

**七层结构**：教学意图 → 叙事 → 认知 → 内容 → 设计 → PPTX → 质检。每一层都能单独拎出来看，也能单独换掉。

- **每页有一个认知动作**（好奇/预测/冲突/解释/概念/证据/应用/迁移/反思）：先定"学生此刻该做什么"，再选版式
- **三层质检**：Ghost Deck（只读标题，检验叙事）→ Teaching QA（七维评分，<8 分重做）→ 16 项技术质检
- **能学参考 PPT 而不照抄**：`dna.py` 抽出六维 Design DNA（配色/版式/字号/密度/图片/节奏），只迁结构不迁素材
- **Color Engine 色彩层级引擎**：10 套 Color Families（C01–C10），4 个种子色展开 11 档色阶 + 三层表面，"少色相、多色阶；少纯色、多表面"；**页内强调层级**：`**主色关键词**` / `!!焦点!!` / 强调卡 / 主色结论条，重点由颜色说出来；另有 10 套 legacy 主题兼容旧稿
- 内置 18 种版式、右上角课程进度导航、图片双模式
- 字号下限 **16pt**、单页字号种类 ≤5：投影和录屏场景下先保证看得清，再谈信息量
- 卡片不是画个框：**渐变填充 + 双层阴影**（接触阴影 + 环境阴影）在 OOXML 层注入，仍是原生可编辑形状
- 产出的 PPT 里，文字是真文本、图表是原生图表、形状是原生形状——**打开就能改**
- 基于 [`camelmouse/jiaoxue-ppt`](https://github.com/camelmouse/jiaoxue-ppt) 的教学规范二次开发

---

## 安装

```bash
cd haoxue-ppt
npm install                 # pptxgenjs + jszip
npm install sharp --include=optional   # 可选：局部放大页的真实裁切、图片转码
```

Python 部分（**只用于本地渲染校对与质检，不参与生成交付文件**）：

```bash
pip install python-pptx pillow
# 渲染预览二选一：
#   - Spire.Presentation（pip install Spire.Presentation）—— 本仓库默认
#   - LibreOffice（soffice 在 PATH 里）—— 自动兜底
```

---

## 快速开始

```bash
# 1. 生成示例课件（11 页《从卖产品到管健康》）
npm run build

# 2. 渲染成图，肉眼看一遍
python scripts/render.py out/健康管理与营销.pptx -o out/preview

# 3. 三层质检（顺序不要颠倒：先叙事，再教学，最后技术）
python scripts/ghostdeck.py examples/health-marketing.deck.json   # 只读标题能讲下来吗（≥75）
python scripts/teachqa.py out/健康管理与营销.pptx --spec examples/health-marketing.deck.json  # 七维（≥8.0）
python scripts/qa.py out/健康管理与营销.pptx --preview out/preview                            # 技术（0 必须修复）

# 4. 自检（不依赖 Python）
npm test
```

输出：

```
out/健康管理与营销.pptx          11 页    墨岩金主题，含配图
out/健康管理与营销-无图版.pptx    11 页    验证"没有素材也排得住"
out/健康管理与营销-胶囊导航版.pptx 11 页   右上角改成章节胶囊
out/gallery.pptx                 15 页    14 种版式样张（每种版式一页）
out/谁说了算-知识版.pptx           40 页  《管理学基础》第五章（知识主线版）：6 章、12 种版式、6 章胶囊索引、含讲稿备注
out/谁说了算-职权配置与授权管理.pptx 40 页  同一章的另一版：案例主线，6 个生活案例组织章节
out/palette.html                 Color Engine 选色卡（10 套，浏览器打开对比）
out/themes/*.pptx                10 套旧主题各一份
out/预览-*.png                    渲染后的样张总览图（3 列拼图）
```

---

## 目录结构

```
haoxue-ppt/
├── SKILL.md                  # Skill 入口：工作流、规则、命令
├── README.md
├── LICENSE / THIRD-PARTY.md  # MIT + 依赖许可证
├── package.json
├── TEST-REPORT.md            # 测试结果与已知限制
├── assets/
│   ├── colors.json           # Color Engine：10 套色族种子 + 配比 + 自动匹配
│   ├── themes.json           # 旧主题 token + 自动匹配规则（legacy）
│   ├── icons/svg/            # 33 个 Lucide 图标（ISC）
│   └── charts/index.json     # 图表素材索引（可用 chart-index.js 重建）
├── references/
│   ├── pedagogy.md           # ① 教学意图：intent 六字段、备课十问、课时容量
│   ├── narrative.md          # ② 叙事：六拍、Action Title、Ghost Deck 改写法、节奏
│   ├── cognitive.md          # ③ 认知：九种动作、五类知识→视觉语法、负荷三定律
│   ├── sources.md            # ④ 内容：教材提炼、案例四幕、事实边界、图片与数据
│   ├── design-dna.md         # ⑤ 设计：六维 DNA、学习≠复制、三方案对比
│   ├── layout-library.md     # 13 类教学页面配方 + 典型配比
│   ├── pptx-engine.md        # ⑥ PPTX：三条路、OOXML 立体化、字号工程、已知限制
│   ├── teaching-qa.md        # ⑦ 教学质检：七维权重、扣分细则、修复顺序
│   ├── spec.md               # deck JSON 全字段（含 intent 与 cognitive）
│   ├── layouts.md            # 18 版式 + 知识结构映射 + 反模式
│   ├── color-engine.md       # Color Engine：色阶/表面/配比/Contrast QA
│   ├── themes.md             # 旧主题（legacy）配色与切换
│   ├── charts.md             # 图表复用顺序、索引与检索
│   └── qa.md                 # 16 项技术质检、修法、已知限制
├── scripts/
│   ├── build.js              # CLI：spec → pptx
│   ├── lib/
│   │   ├── deck.js           # 编排：主题 → 逐页版式 → 写文件 → 后处理
│   │   ├── canvas.js         # 绘制层（几何唯一来源，同时产出 ops）
│   │   ├── cognitive.js      # 九种认知动作词表 + 序列校验（deck 与三个质检脚本共用）
│   │   ├── design.js         # 设计规则常量：间距/字号/圆角/阴影/密度（旁门左道方法论的可执行版）
│   │   ├── measure.js        # 文本度量、字号阶梯、中文断行禁则
│   │   ├── color.js          # 颜色唯一入口（保证 6 位十六进制）
│   │   ├── palette.js        # Color Engine：色阶生成、配比、审计、C10 提取
│   │   ├── theme.js          # 主题解析（色族优先）、自动匹配、对比度安全色派生
│   │   ├── nav.js            # 右上角课程进度导航（核心组件）
│   │   ├── icons.js          # Lucide SVG → 主题色 PNG
│   │   ├── image.js          # 局部放大裁切
│   │   ├── postprocess.js    # OOXML 后处理：分类轴压平 + 卡片渐变/双层阴影 + 遮罩渐变
│   │   ├── cropfix.js        # 为 cover 图片写真实 <a:srcRect>
│   │   └── layouts/          # 18 个版式实现（core / text / structure / data / media / grid）
│   ├── preview.js            # ops → 单文件 HTML 预览
│   ├── ghostdeck.py          # Ghost Deck Test：只读标题检验叙事
│   ├── teachqa.py            # 七维教学评分（含三级清单）
│   ├── dna.py                # 参考 PPT 的 Design DNA 提取
│   ├── qa.py                 # 16 项技术质检
│   ├── sheet.py              # 渲染图 → 样张总览拼图
│   ├── render.py             # 渲染 PNG（Spire / LibreOffice）
│   ├── splice.py             # 把单页换回整套（局部修改闭环）
│   ├── chart-index.js        # 扫描 PPTX 建图表索引
│   ├── chart-find.js         # 检索图表索引
│   ├── palette.js            # Color Engine 命令行：list/show/card/from
│   └── themes.js             # 旧主题列表 / 色卡
├── examples/
│   ├── health-marketing.deck.json   # 11 页示例课件（11 种版式）
│   └── assets/consult.svg|jpg       # 自绘矢量插画
├── tests/
│   ├── gallery.deck.json     # 15 页版式样张（14 种版式）
│   └── test_skill.js         # 120 项生成层自检
└── out/                      # 交付产物：课件 / 无图版 / 胶囊导航版 / 10 主题 / 样张 / 预览图
```

---

## 怎么改内容

只改 JSON，不碰代码。最小示例：

```json
{
  "meta": { "slug": "demo", "course": "健康管理与营销", "lesson": "第一讲",
            "title": "从卖产品到管健康", "theme": "slate" },
  "chapters": [{ "id": "c1", "title": "一个卖不动的套餐", "short": "问题" }],
  "pages": [
    { "layout": "cover", "chapter": "c1", "title": "从卖产品到管健康" },
    { "layout": "question", "chapter": "c1", "kicker": "课堂互动 · 先判断",
      "title": "2980 元的套餐三个月只卖出 17 份，最可能的原因是什么？",
      "options": [{ "text": "价格太贵" }, { "text": "顾客不知道自己需要", "ans": true }],
      "hint": "先投票，再看后面的数据。" }
  ]
}
```

```bash
node scripts/build.js my.deck.json -o out/my.pptx
```

字段全集见 `references/spec.md`。

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `node scripts/build.js <spec> -o <out.pptx>` | 生成整套 |
| `--only 8` / `--only 3,7,8` | 只重建指定页（改一页不必重生成整套，页码仍显示 08 / 11） |
| `python scripts/splice.py <deck> <p8.pptx> 8 -o <out>` | 把单页换回整套，页序与其余页不变 |
| `--theme c05` / `--theme slate` / `--theme all` | 指定配色（色族 c01–c10 或旧主题）/ 批量（`-o` 不带 `.pptx` 视为目录） |
| `--nav tabs` | 右上角改成「章节胶囊」（`[01 问题][02 机制]…`）；章节 >4 自动退回刻度条 |
| `--image none` | 无图版（验证没有素材时的排版） |
| `--html out/preview.html` | 额外产出 HTML 预览，不依赖办公软件 |
| `--list-themes` / `--list-layouts` | 列出配色（色族+旧主题）/ 版式 |
| `python scripts/qa.py <pptx> [--strict] [--preview DIR]` | 16 项质检（含 16pt 字号下限） |
| `python scripts/sheet.py <预览目录> -o out/预览.png` | 把渲染图拼成一张样张总览 |
| `python scripts/render.py <pptx> -o <dir>` | 渲染 PNG |
| `node scripts/chart-index.js <dir>` / `chart-find.js --type bar` | 图表索引 / 检索 |
| `npm test` | 120 项生成层自检 |
| `python scripts/pack.py` | 打包成 `dist/haoxue-ppt-skill.zip`（不含 node_modules） |

---

## 配色：Color Engine + 旧主题

新课件用 Color Families：`node scripts/palette.js card` 出选色卡，`--theme c05` 应用。
每个家族只有 4 个种子色（主色/强调/纸白/墨色），11 档色阶与三层表面由引擎生成；
"颜色丰富但不是颜色多"——丰富来自层次，纪律由 `colorqa.py` 验收。

## 旧主题（legacy）

`slate` 墨岩金（默认）· `academic` 学术青橙 · `cream` 奶油暖棕 · `tech` 科技深蓝（深）
`forest` 自然森林 · `editorial` 编辑黑白 · `wine` 人文酒红 · `violet` 清新蓝紫
`darktalk` 深色演讲（深）· `clay` 陶土米

换配色不改内容、不改版式。详见 `references/color-engine.md` 与 `references/themes.md`。

---

## 为什么不「平」

一眼看过去"平"，通常不是配色的问题，而是**所有东西都贴在同一个平面上**。pptxgenjs 只能写纯色填充和单层阴影，所以这家 skill 在生成之后多做一步 OOXML 后处理（`scripts/lib/postprocess.js`）：

| 层 | 做法 | 参数 |
|---|---|---|
| 填充 | 上亮下暗的极轻渐变，卡片有了"受光面" | 提亮 16%–55%（按底色亮度自适应） |
| 接触阴影 | 贴边、短、稍实，让卡片"落"在纸上 | blur 3pt / dist 1.5pt / 18% |
| 环境阴影 | 远而软，给大轮廓 | blur 26pt / dist 9.5pt / 12% |
| 图片遮罩 | 一条带 alpha 停靠点的纵向 `gradFill`（不是十几段半透明矩形——每段边缘都会露出 hairline，叠起来就是"梯田"横纹） | 0% → 72% → 90% |

全部是 PowerPoint 原生属性（`a:gradFill` / `a:outerShdw`），**WPS 里也能直接改**，不是贴图。
约束：光方向固定 90°（从正上方来）；只有显式声明阴影的对象才有影子——给所有矩形都加阴影，脏得比平更糟。

---

## 验收状态

| 项 | 结果 |
|---|---|
| 示例课件 | 11 页 / 11 种版式 / 4 章节 |
| 质检（有图版 / 无图版 / 深色主题） | 0 必须修复 · 0 需人工确认 |
| 自检 `npm test` | 120 项全通过 |
| 10 主题批量 | 10/10 成功，版式结构一致 |
| 版式样张 | 15 页 / 14 种版式，0 必须修复 |
| 已知限制 | 见 `TEST-REPORT.md` 第六节（图表素材、动画、实机验证等） |

---

## 许可

代码 MIT。第三方依赖与素材许可证见 `THIRD-PARTY.md`
（pptxgenjs MIT、JSZip MIT、Lucide ISC、sharp Apache-2.0、python-pptx MIT；
Spire.Presentation 仅本地渲染预览用，**不随包分发**）。
