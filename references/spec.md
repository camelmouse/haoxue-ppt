# deck spec 数据结构

一份课件 = 一个 JSON 文件。这是**唯一内容源**：改内容只改 JSON，不碰排版代码。
生成前先过 `validateSpec()`（`node scripts/build.js` 会自动校验，出错直接拒绝）。

```json
{ "meta": {...}, "chapters": [...], "pages": [...] }
```

---

## 一、meta

| 字段 | 必填 | 说明 |
|---|---|---|
| `slug` | 推荐 | 输出文件名与多主题命名（英文/拼音，不含空格） |
| `course` | ✓ | 课程名，出现在页脚 |
| `lesson` | | 讲次，如"第一讲" |
| `title` | ✓ | 本讲标题 |
| `subtitle` | | 副标题（封面） |
| `audience` | | 授课对象，如"健康服务与管理专业 · 二年级" |
| `institution` | | 单位，封面右下 |
| `term` | | 学期 |
| `theme` | | 配色：`c01`–`c10`（Color Families，新课件默认，见 color-engine.md）、旧主题 id（slate 等，见 themes.md）、或直接给 6 位 HEX（走 C10 单色展开）。缺省按课程关键词自动匹配 |
| `nav` | | 全局导航模式：`chapters`（默认，刻度+序号）/`tabs`（章节胶囊）/`steps`（进度条）/`minimal`/`hidden`。`tabs` 支持 3–6 章（5–6 章自动收紧间距），塞不下时自动退回 `chapters`（不硬挤）；6 章以内学生都能看全所有章节与当前位置 |
| `imageMode` | | `auto`（默认）/`image-first`/`existing-only`/`none` |
| `meta` | | 封面底部信息数组，覆盖 `audience/term` |
| `author` | | 写入 PPT 属性 |
| `intent` | 推荐 | 教学意图对象，见下节。**它决定这堂课能不能被检验**，不写就只能靠感觉 |
| `purpose` | | `course`（默认）/ `showcase`（版式样张）。`showcase` 跳过认知动作检查与教学评分 |

### meta.intent（教学意图）

```json
"intent": {
  "goal": "拿到一个新情境，能判断这件事该由谁定，并说清依据",
  "audience": "高职一年级 · 健康管理专业，无管理岗经验",
  "misconception": "以为「职位高就能管所有事」、「有责任就自然该有权」",
  "boundary": "紧急专业处置不能等审批；三人小公司只能上补偿性控制",
  "oneLine": "让合适的人在写清的权限内作决定，再用制度兜住",
  "minutes": 90
}
```

| 字段 | 要求 | 用途 |
|---|---|---|
| `goal` | 用**动词**写学生下课能做的事（判断/写出/选出/改），不写"了解/掌握" | 校验全册是否每一页都在服务这一件事 |
| `audience` | 学生的专业、年级、有无实践经验 | 决定案例身份与用语深度 |
| `misconception` | 学生**现在**的错误做法，越具体越好 | 冲突页要正面回应它，否则学生点头回去照旧 |
| `boundary` | 这套结论**什么时候不成立** | 迁移页与结论页的边界句从这里取 |
| `oneLine` | 全课唯一记忆句，≤30 字 | 大字观点页与总结页**必须措辞一致** |
| `minutes` | 课时长度 | 容量控制：90 分钟 ≤18 页正文，45 分钟 ≤10 页 |

## 二、chapters

```json
[{ "id": "c1", "title": "一个卖不动的套餐", "short": "问题" }]
```

- `id` 与页面 `chapter` 对应；`short` 用于导航（2–4 字，超长会挤），缺省用 `title`
- 章节数建议 3–6：`nav: "tabs"` 时 6 章以内都完整列出，> 6 时导航自动紧凑
- 封面、目录、总结页的"章节条/刻度"都从这里取

## 三、pages 通用字段

| 字段 | 说明 |
|---|---|
| `layout` | ✓ 版式 id（见 layouts.md） |
| `chapter` | 所属章节 id；改变它导航状态随之改变 |
| `title` | 页面标题，**支持 `\n` 显式换行**（长标题想控制断点时用） |
| `kicker` | 左上小标（如「案例 · 一个做了三次体检的人」） |
| `notes` | 讲稿，写入 PPT 备注；不显示在页面上 |
| `nav` | 单页覆盖：`tabs` / `chapters` / `steps` / `minimal` / `hidden` |
| `image` | 图片路径（相对 spec 文件） |
| `imageLabel` | 无图时色板上的字（缺省"示意图"） |
| `caption` | 图片说明 |
| `insight` | 页底结论条（一句可复述的话） |
| `cognitive` | 这一页学生**大脑要发生什么**，九选一，见下节。不填会报构建告警 |

### page.cognitive（认知动作）

写英文 id 或中文都行（`"概念"` 等价 `"concept"`）。**先定动作，再选版式**——版式是动作的结果，不是起点。

| id | 中文 | 学生此刻 | 配什么版式（推荐，非强制） |
|---|---|---|---|
| `curiosity` | 好奇 | 咦？为什么会这样 | cover / bigIdea / fullImage / caseStory |
| `prediction` | 预测 | 我觉得是 A，还是 B？ | question / debate / caseStory |
| `conflict` | 冲突 | 我原来想错了 | debate / matrix / caseStory |
| `explanation` | 解释 | 原来是因为这个 | causalChain / layers / flow / timeline |
| `concept` | 概念 | 这个现象叫「职权」 | layers / bento / matrix / flow |
| `evidence` | 证据 | 有数据，我信了 | dataChart / caseStory / zoom |
| `application` | 应用 | 换我会怎么做 | question / flow / bento |
| `transfer` | 迁移 | 换个行业还成立吗 | debate / offsetImageText / matrix |
| `reflection` | 反思 | 回头看，我哪里想错了 | summary / question / bigIdea |

引擎会检查三件事（构建时告警，不阻断）：未标注的页数、连续三页同动作、
关键动作缺失（`prediction`/`conflict`/`application` 必须有；≥12 页还要 `transfer`）。

---

## 四、各版式专属字段

### cover 封面
`title` `subtitle` `meta[]`
自动叠加：课程名·讲次（左上）、章节目录条、底部信息行、单位（右下）。

### agenda 课程导览
`items[{title, desc, minutes}]` `asideTitle` `stats[{value, label}]`

### divider 章节分隔
`num`（两位数字，如 `"02"`）`title` `desc` `pages`（如"第 3–5 页"）

### bigIdea 大字观点
`text` `highlight[]`（要高亮的关键词，自动变强调色）`source`（页底小注）
`runs[]`（高级：直接给富文本 `[{text, color, bold}]`，此时忽略 `highlight`）

### question 互动问题
`options[{text, ans}]` `timer`（如"限时 60 秒"）`hint`
选项 > 3 个自动两栏；`ans: true` 的选项会被高亮并标"✓ 正确答案"。

### debate 双方观点对照
`vs`（中间标记，默认"对照"）`left{tag,title,points[]}` `right{...}` `verdict`（结论条）

### layers 结构分层
`layers[{label, title, body, icon}]` `insight`
`label` 是左侧小标（表层/机制/底层），`title` 是这一层的判断句。

### flow 流程图
`steps[{title, body, out, icon}]` `insight`
`out` 是这一步的产出（如"风险清单"），显示在节点下方。3–6 步最佳。

### timeline 时间轴
`nodes[{label, title, body}]` `insight`（上下交错排布）

### causalChain 因果链
`nodes[{label, title, body, hi}]` `insight`
`hi: true` 标出链条终点（结果）。3–4 环最佳。

### matrix 二维矩阵
`axes{top,bottom,right}` `quadrants[{x,y,text}]` `points[{x,y,label,hi}]` `asideTitle` `aside[]`
`aside` 是右侧解读栏（3–4 条），`quadrants` 可省：轴名已经说明两个维度，点标签说明结论，
象限名只在"四个区域各有专名"时才需要；有象限名时它会自动避让点标签。
`x/y` 为 0–1 归一化坐标（左下为 0,0）。
`axes` 只写"轴向 + 方向"：`top` 贴左上角（纵轴高端）、`bottom` 贴左下角（纵轴低端）、
`right` 贴右下角（横轴范围，如 `"客户价值 低 → 高"`）。四个方向标签各占一行会读成一段乱码。

### bento 卡片栅格
`cells[{title, body, value, label, tone, em}]` `even`：3 个 = 一大两小（`even: true` 改等分三列），
4 个 = 2×2，5 个 = 上二下三，6 个 = 3×2。`tone: "accent"` / `tone: "tint"` / `em: true` 的那张是**强调卡**
（主色浅底 + 主色标题 + 深色徽章），**一页最多一张**——强调卡一多，重点就又被抹平了。
卡片标题框高度按实际折行算；格子放不下"小标 + 标题 + 两行正文"时先砍小标，不砍正文。
（并列关系的三个概念用 `even: true`——一主两辅会谎报"有一个更重要"。）

### 页内强调标记
`title` / `body` / `insight` / 列表项里可直接写：`**关键词**` → 主色加重；`!!焦点!!` → 强调色加重（**每页 ≤1 处**）。
标记不参与测宽；深色卡/深色页上自动换深底安全色。详见 color-engine.md「页内强调层级」。

### dataChart 数据图表
`chart{labels[], series[{name, values[]}]}` `chartType`（`bar`/`line`/`pie`/`doughnut`/`area`）
`labels` 是分类轴（**不是** `categories`，写错会退化成 1/2/3/4）；纵轴量级尽量压在一位数以内，两位数刻度在部分渲染器里会被截成一位。
`kpis[{value, label, note}]`（右侧指标：`value` 是大数字，`note` 是贴在同一基线上的金色小标，`label` 是下方灰字说明）。3 组是上限——16pt 下限下再多就换页`caption` `source` `insight` `formatCode`
图表是**原生图表**，可在 PowerPoint 里右键编辑数据。

### offsetImageText 左右错位图文
`image` `caption` `points[{title, body, icon}]` `stat{value,label}` `side`（`"right"` 图右文左）

### fullImage 全幅图片
`image` `title` `line`（一句副文）`credit`（图注）

### zoom 局部放大解释
`image` `detail{x, y, r, title, notes[]}`
`x/y` 是放大中心（0–1，相对**原图**），`r` 是半宽比例（0.1–0.2 合适）。
生成时会按面板比例真实裁切，并自动画出放大框。

### caseStory 案例叙事
`acts[{t, text}]`（四幕）`theory{tag, title, points[], note}` `takeaway`

### summary 极简总结
`points[{title, body}]`（≤3 条）`next`（下讲预告）`note`（右下一句）

---

## 五、写 spec 的几条经验

1. **一页一件事**。内容塞不下不是排版问题，是该拆页。
2. **标题写成判断句**："价格战打在表层，利润藏在底层" 优于 "健康管理的三个层次"。
3. **数字要具体**："三个月只卖出 17 份" 优于 "销量不佳"。
4. **`insight` 是给学生记的**，不是给老师总结的：一句话、能复述、不超 30 字。
5. 想让标题在特定处换行，直接写 `\n`；否则交给引擎自动折行（已按中文禁则处理）。
