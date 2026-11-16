# 开源选型与许可证说明

本项目自身以 **MIT** 发布。以下是全部第三方依赖的选型理由与许可证。
原则：**交付物只依赖可商用、可再分发的宽松许可组件**；copyleft 组件与评估版商业组件一律不进交付包。

---

## 一、运行时依赖（随包分发）

| 组件 | 版本 | 许可证 | 用途 | 选型理由 |
|---|---|---|---|---|
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | ^3.12 | **MIT** | 生成 .pptx | 纯 JS、无需 Office、原生 shape/text/chart/image，产出可编辑；比 python-pptx 更贴近前端模板生态 |
| [JSZip](https://github.com/Stuk/jszip) | ^3.10 | **MIT** 或 GPLv3（双许可，本项目取 MIT） | 解压/回写 pptx，做 OOXML 后处理 | 需要在不重写文件的前提下修正图表分类轴与图片裁切 |
| [Lucide](https://lucide.dev)（SVG 集） | — | **ISC** | 33 个课堂常用图标 | 线性风格统一、笔画干净、体积小、ISC 允许商用与修改 |

## 二、可选依赖

| 组件 | 版本 | 许可证 | 用途 | 缺失时的降级 |
|---|---|---|---|---|
| [sharp](https://github.com/lovell/sharp) | ^0.34 | **Apache-2.0** | SVG→PNG 栅格化、局部放大裁切、图片转码 | 图标降级为圆点/数字；`zoom` 页退化为整图填充（质检会提示） |

`sharp` 是可选依赖：`npm install` 失败不影响主体功能。

## 三、开发期工具（不参与交付文件生成）

| 组件 | 许可证 | 用途 | 说明 |
|---|---|---|---|
| [python-pptx](https://github.com/scanny/python-pptx) | **MIT** | 读取 pptx 做结构质检、拆册渲染 | 只读；不写入交付文件 |
| [Pillow](https://python-pillow.org) | **MIT-CMU** | 渲染图空白检测 | 可选 |
| Spire.Presentation（Free/Evaluation） | 商业评估版 | 本地渲染预览 PNG | **不随包分发、不参与生成**；评估版单册 10 页限制由 `render.py` 拆册绕过，导出图裁掉顶部 5% 水印。若用于商业交付，请自行购买授权或改用 LibreOffice |
| LibreOffice（`soffice`） | **MPL-2.0** | 渲染兜底 | 通过命令行调用，不链接、不分发 |
| PyMuPDF (`fitz`) | **AGPL-3.0** / 商业 | PDF→PNG 兜底 | **仅当本机已安装时调用**，本项目不分发、不作为依赖声明；如需商用请自行评估 AGPL 义务 |

## 四、内容素材

| 素材 | 来源 | 许可证 | 说明 |
|---|---|---|---|
| `examples/assets/consult.svg` / `.jpg` | 本项目自绘 | MIT（随本项目） | 扁平矢量插画，1600×1000，可自由修改 |
| 示例课件文案（《从卖产品到管健康》） | 本项目撰写 | MIT（随本项目） | 教学模拟数据，非真实机构经营数据；案例人物与机构均为虚构 |
| `assets/icons/svg/*.svg` | Lucide | ISC | 见上表 |

## 五、明确未使用

| 组件 | 未使用原因 |
|---|---|
| 商业 PPT 模板站素材 | 授权不可转让，无法随 Skill 分发 |
| 含 copyleft 的图表库（如部分 GPL 图表） | 与 MIT 交付冲突 |
| Office COM / Aspose.Slides | 需 Windows + Office 或商业授权，破坏跨平台与免费分发 |
| AI 生图 API | 课堂解剖/机制图需要专业准确，生成图不可控；改为"自绘矢量 + 专业素材"两条路 |

## 六、二次开发来源

本项目在教学设计规范、版式配方与质检思路上参考并二次开发自
[`camelmouse/jiaoxue-ppt`](https://github.com/camelmouse/jiaoxue-ppt)。
原项目的教学法沉淀保留其原有许可；本项目新增的代码、主题系统、版式引擎、
导航组件、图表索引与质检脚本均以 MIT 发布。

---

如发现任何许可证标注遗漏或冲突，请以组件官方仓库的 LICENSE 为准。
