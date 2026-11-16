# 图表与图标：复用顺序、索引与检索

课件的"图"分三种：**数据图（图表）**、**结构图（版式自带）**、**图标**。
这里管的是数据图与图标；结构图由版式引擎直接画，见 `layouts.md`。

---

## 一、复用顺序（不要跳级）

```
① 原生图表（PowerPoint 图表，可在 PPT 里右键"编辑数据"）
② 引擎原生图表（PptxGenJS chart ← dataChart 版式默认走这条）
③ SVG 结构图（矢量、可改色，适合示意与流程）
④ HTML 渲染图（复杂排版，仅在 ①②③ 都做不到时）
⑤ 局部图片（截图/扫描件，必须标注来源，且不可编辑）
```

原则：**能编辑的优先**。一张漂亮但不可改的图，在课堂上改一个数字就要重做，不值。

---

## 二、图表索引（520 页素材的接入方式）

素材目录里有一批历史 PPT，里面躺着几百张做好的图表。先建索引，再谈复用：

> 仓库里的 `assets/charts/index.json` 是**自举示例**：用本项目自己产出的课件扫出来的，
> 用来证明扫描器可用，不代表真实素材库。拿到 520 页源 PPT 后，把下面第 2 步重跑一次即可覆盖。

```bash
# 1. 把源 PPT 放进 assets/charts/src/（或任意目录）
# 2. 建索引
node scripts/chart-index.js assets/charts/src --out assets/charts/index.json

# 3. 检索
node scripts/chart-find.js                      # 全量 + 类型分布
node scripts/chart-find.js --type line          # 按图表类型
node scripts/chart-find.js --tag 复购            # 按标题/系列/分类关键词
node scripts/chart-find.js --color 087F87       # 按主色（找同主题的图）
node scripts/chart-find.js --type bar --json    # 交给程序消费
```

### 索引字段

| 字段 | 含义 |
|---|---|
| `source` | 来源文件名 |
| `slide` | 在源文件中的页码 |
| `chartId` | 图表部件 ID（`chart3`） |
| `type` | `bar`/`line`/`pie`/`doughnut`/`area`/`scatter`/`radar`/`bubble` |
| `title` | 所在页的首行文字（通常是页标题） |
| `categories` | 分类轴标签（已兼容多级分类） |
| `series` | 系列名 |
| `points` | 数据点数量 |
| `colors` | 图表里出现的颜色（用于判断是否与当前主题冲突） |
| `editable` | 是否原生可编辑 |
| `dataEditable` | 是否带内嵌数据表（有则可直接改数） |
| `thumb` | 缩略图路径（需 `render.py` 渲染后回填，当前为 `null`） |
| `animation` | 该页是否带动画 |

### 素材尚未提供时

`assets/charts/` 为空是**正常状态**，不要因此停工：

- 需要数据图 → 用 `dataChart` 版式，图表由引擎生成，天然可编辑
- 需要结构图 → 用 `flow`/`layers`/`timeline`/`matrix`/`causalChain`
- 需要"看起来有图" → 用 `fullImage` + 自绘矢量图（`examples/assets/consult.svg` 是范例）

索引器只做登记，不搬运文件。真要用某张图时，按 `source + slide` 去源文件里复制。

---

## 三、什么时候用什么图表

| 你要说明的事 | 图表 | 备注 |
|---|---|---|
| 几个类别的数值对比 | 柱状图（`bar`） | 分类 ≤ 6 个；按数值排序 |
| 随时间变化的趋势 | 折线图（`line`） | 时间点 ≥ 5 个才有"趋势"感 |
| 构成占比 | 饼图/环形图（`pie`/`doughnut`） | 扇区 ≤ 5 个，超过改用柱状图 |
| 累计/面积变化 | 面积图（`area`） | 只在需要强调"总量"时用 |
| 两个变量的关系 | 散点图（`scatter`） | 点 ≤ 30，否则改矩阵 |
| 多维评分 | 雷达图（`radar`） | 维度 5–8 个；课堂慎用，学生读不懂 |

规则：**一张图只讲一个结论**，结论写在 `insight` 里；图表不写标题（页面标题就是它的标题）。

---

## 四、图标

- 来源：Lucide（ISC 许可证），已内置 33 个常用图标在 `assets/icons/svg/`
- 用法：版式字段里写 `icon: "heart-pulse"`，引擎按主题色栅格化到 PNG
- 缺失自动降级：找不到图标 → 画圆点/数字，**不会报错也不会留空**
- 色彩：跟随主题 `primary/primaryText/accent/accentText/muted`
- 尺寸：正文图标 0.30–0.34in，不要放大当插图

新增图标：把 Lucide 的 `.svg` 丢进 `assets/icons/svg/`（文件名即 `icon` 值），无需改代码。

```bash
node scripts/build.js --list-layouts   # 看哪些版式支持 icon
ls assets/icons/svg                    # 看现有图标
```

---

## 五、自绘矢量图（没有素材时的正解）

`examples/assets/consult.svg` 是一张 1600×1000 的手绘扁平插画，四条经验：

1. **只画结构**：人物用几何块，不画五官细节；场景用色块分区
2. **用主题色**：填色取 `primary/primarySoft/accent/surfaceAlt`，换主题时整图协调
3. **留白给文字**：主体偏左或偏右，给压字留出干净区域
4. **导出 JPG/PNG**：`sharp` 转码后再插，避免部分办公软件对 SVG 支持不一致

```js
// 转码示例
const sharp = require('sharp');
await sharp('consult.svg').jpeg({ quality: 92 }).toFile('consult.jpg');
```
