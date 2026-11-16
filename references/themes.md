# 旧主题（legacy）：10 套配色与切换规则

> **新课件选色走 Color Engine（c01–c10）**，见 `references/color-engine.md`——
> 有 11 档色阶、三层表面和配比卡，是解决"颜色素/花"的正路。
> 本页的 10 套旧主题保留用于：复现已有课件、深色整册（`tech` / `darktalk`）、以及历史 deck 的再生成。
> 两套系统的 id 不冲突（`slate` vs `c03`），混用不报错但别在同一册里换。

一套主题 = 一组设计 token（颜色 / 字体 / 圆角 / 图表色）。
**同一份 deck spec 换主题，版式与内容完全不变，只换皮**——这是"换个配色重出"能一键完成的原因。

---

## 一、10 套主题

| id | 名称 | 主色 | 强调色 | 底色 | 深色底 | 气质 | 适合 |
|---|---|---|---|---|---|---|---|
| `slate` | 墨岩金 | `1E2A38` | `B4834A` | `F0EEE9` | `10161E` | 冷岩底 + 古金（默认） | 商业、管理、医学、正式课件 |
| `academic` | 学术青橙 | `06666E` | `E0923F` | `F6F8F7` | `073E42` | 冷静可信 | 理论、机制、医学、管理 |
| `cream` | 奶油暖棕 | `6B4630` | `C98E52` | `FAF3E6` | `3A2718` | 温和生活化 | 案例、服务场景、营养 |
| `tech` | 科技深蓝 | `4C86F0` | `3FD9C6` | `081222` | `050C18` | 理性前沿（深色） | 数据、算法、数字化 |
| `forest` | 自然森林 | `2C5A44` | `8FA854` | `F2F6EE` | `1A3A28` | 自然生长 | 生态、康养、可持续 |
| `editorial` | 编辑黑白 | `1A1A1A` | `D23F26` | `F6F4EE` | `121212` | 克制编辑感 | 讲座、评论、人文 |
| `wine` | 人文酒红 | `7A2438` | `BC9256` | `FAF3EB` | `47141E` | 典雅叙事 | 人文、医学史、思政 |
| `violet` | 清新蓝紫 | `4655B8` | `A283DC` | `F6F6FE` | `29336B` | 轻盈年轻 | 通识、入门、新生课 |
| `darktalk` | 深色演讲 | `EDEBE4` | `E9B45C` | `14161A` | `0C0D10` | 剧场感（深色） | 讲座、开题、路演 |
| `clay` | 陶土米 | `6A4636` | `BE6A38` | `F8F3EC` | `2F2019` | 温暖手工感 | 人文、生活服务、通识 |

配色原则：**底色带色温**（不是中性灰）→ 主色压深 → 强调色取金属/矿石色（古金、赤铜、赭石）。质感靠明度层次，不靠饱和度堆叠。

注意：旧主题的卡片面板仍可能是 `#FFFFFF`（Color Engine 已把这一条列为禁令），新课件请优先用色族。

深色主题（`tech` / `darktalk`）会自动切换：正文用 `deepInk`、次级信息用 `deepMuted`、导航变色、图表用亮色系。

---

## 二、怎么选

优先级从高到低：

1. **用户指定**：`"theme": "wine"` 或命令 `--theme wine`。
2. **按课程自动匹配**：不写 `theme` 时，用 `autoRules` 关键词匹配课程名 + 标题 + 学科（命中顺序即优先级），都不中则 `slate`（`assets/themes.json` 的 `default`）。
   `slate` / `clay` / `wine` 不在 `autoRules` 里——它们更适合显式指定（`--theme slate`），不靠猜。
3. **按场景微调**：同一门课尽量只用一套主题；系列讲座可以每讲换一次，但版式保持一致。

自动匹配规则（`assets/themes.json` 的 `autoRules`）：

```
口腔 / 牙 / 解剖 / 生理 / 病理 / 药理 / 护理 / 临床 / 医学 → academic
营销 / 市场 / 消费者 / 品牌 / 商业 / 管理 / 经济         → academic
数据 / 算法 / 编程 / 信息技术 / 人工智能 / 统计 / 数字化     → tech
营养 / 康养 / 生态 / 农业 / 可持续 / 社区卫生            → forest
文学 / 历史 / 哲学 / 伦理 / 人文 / 艺术 / 设计          → editorial
思政 / 党建 / 典礼 / 讲座 / 报告                    → darktalk
心理 / 新生 / 导论 / 创新 / 创业 / 通识               → violet
服务 / 沟通 / 礼仪 / 养老 / 照护                    → cream
```

---

## 三、token 结构

```
base        主色（色带、图标、图表主色）
primary     同 base，图表/形状用
primarySoft 主色 12% 浅底（分层页第一层、对照标记）
primaryText 主色压深到可读（浅底上的主色文字）
accent      强调色（结论条、数字、放大框）
accentSoft  强调色浅底（页底结论条）
accentText  强调色压深到可读
accentOnDeep 强调色在深底上的版本
bg          页面底色
surface     卡片/面板底（比 bg 略深一点）
surfaceAlt  交替行/面板底
ink         标题色
body        正文色
muted       次级信息
line        分隔线
deep        深色页底（封面/分隔/总结/全幅）
deepAlt     深色页上的装饰线
deepInk     深色页标题
deepMuted   深色页正文
dark        是否深色主题
fonts       { title, body }
chart[]     图表色序列（≥4）
```

`theme.complete()` 会自动派生 `primaryText / mutedText / accentText / accentOnDeep`，
按 WCAG 4.5:1（正文）/ 3.2:1（大字）自动压深或提亮，**不要手写这些值**。

---

## 四、自定义主色

```js
const themeMod = require('./scripts/lib/theme');
const t = themeMod.fromColor('7A4FBF');   // 只给一个主色，其余自动推导
```

命令行为：

```bash
node scripts/build.js spec.json -o out/x.pptx --theme academic   # 先说用哪套做底
```

然后在 `assets/themes.json` 里加一条自定义主题（推荐做法，便于复用）：

```json
"brand": {
  "name": "校本蓝绿", "base": "1F6F6B", "accent": "E2A03F",
  "bg": "F8FAFA", "deep": "0F2E2C", "mood": "校本 VI", "bestFor": ["校庆", "公开课"]
}
```

---

## 五、切换主题的代价

- 只换颜色与字体：**0 成本**，`--theme all` 一次出 10 套。
- 不要为了换主题去改版式代码；如果某套主题下可读性差，说明这个颜色需要走 `accentText/primaryText` 派生值。
- 深色主题页面上的图片需要自带亮度；暗图在深底上会糊，选图时注意。

---

## 六、检查

```bash
node scripts/build.js --list-themes                       # 列出 10 套
node tests/test_skill.js                                  # 会校验每套主题正文对比度 ≥4.5
python scripts/qa.py out/deck.pptx --preview out/preview   # 逐页查对比度不足
```
