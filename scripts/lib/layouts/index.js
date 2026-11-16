// 版式注册表：id → 名称 / 使用场景 / 知识结构信号 / 渲染函数
const core = require('./core');
const text = require('./text');
const structure = require('./structure');
const media = require('./media');
const data = require('./data');
const grid = require('./grid');

const LAYOUTS = [
  {
    id: 'cover', name: '封面', group: 'frame', build: core.cover, nav: false, footer: false,
    useWhen: '整套课件第 1 页；课程名 + 本讲标题 + 对象 + 单位',
    signal: '—',
  },
  {
    id: 'agenda', name: '课程导览', group: 'frame', build: core.agenda,
    useWhen: '2–5 个章节，需要让学生一开始知道"今天走哪几条路"',
    signal: '并列 / 线性',
  },
  {
    id: 'divider', name: '章节分隔', group: 'frame', build: core.divider, nav: 'minimal',
    useWhen: '每 3–5 页内容后换气；深底大字，给课堂节拍',
    signal: '—',
  },
  {
    id: 'bigIdea', name: '大字观点页', group: 'text', build: text.bigIdea,
    useWhen: '一个必须被记住的判断，信息量小、冲击力优先',
    signal: '观点 / 命题',
  },
  {
    id: 'question', name: '互动问题页', group: 'interactive', build: text.question,
    useWhen: '先让学生判断，再揭示答案；选择题、判断题、投票',
    signal: '决策点',
  },
  {
    id: 'debate', name: '双方观点对照', group: 'structure', build: text.debate,
    useWhen: '两种立场/两种方案需要被并置比较，最后给结论',
    signal: '二元对照',
  },
  {
    id: 'layers', name: '结构分层', group: 'structure', build: structure.layers,
    useWhen: '概念有层级（表层/机制/底层），或从现象到本质的堆叠',
    signal: '层级 / 包含',
  },
  {
    id: 'flow', name: '流程图', group: 'structure', build: structure.flow,
    useWhen: '3–6 步的操作流程、服务链路、实验步骤',
    signal: '时序 / 因果链',
  },
  {
    id: 'timeline', name: '时间轴', group: 'structure', build: structure.timeline,
    useWhen: '有明确时间标记的演化、病程、顾客旅程、历史脉络',
    signal: '时间序列',
  },
  {
    id: 'causalChain', name: '因果链', group: 'structure', build: structure.causalChain,
    useWhen: 'A 导致 B、B 导致 C 的机制推演，最后落到结果',
    signal: '因果',
  },
  {
    id: 'bento', name: '卡片栅格', group: 'structure', build: grid.bento,
    useWhen: '3–6 个同级要点，需要一主多辅的阅读顺序（结论 + 支撑）',
    signal: '并列 / 权重不等',
  },
  {
    id: 'matrix', name: '二维矩阵', group: 'structure', build: structure.matrix,
    useWhen: '两个维度交叉定位（重要-紧急、渗透-复购）',
    signal: '二维分类',
  },
  {
    id: 'dataChart', name: '数据图表页', group: 'data', build: data.dataChart,
    useWhen: '需要用原生图表说话：趋势、构成、对比',
    signal: '数量关系',
  },
  {
    id: 'offsetImageText', name: '左右错位图文', group: 'media', build: media.offsetImageText,
    useWhen: '有真实场景图/实物图，需要图文互证',
    signal: '图文对应',
  },
  {
    id: 'fullImage', name: '全幅图片页', group: 'media', build: media.fullImage, nav: false,
    useWhen: '情绪或场景优先的过渡页；一句标题压在图上',
    signal: '—',
  },
  {
    id: 'zoom', name: '局部放大解释', group: 'media', build: media.zoom,
    useWhen: '一张图里有必须看清的细节：解剖、结构、界面、报表',
    signal: '细节定位',
  },
  {
    id: 'caseStory', name: '案例叙事页', group: 'case', build: media.caseStory,
    useWhen: '有过程、有转折的真实案例，右侧落到理论机制',
    signal: '事件序列 + 机制',
  },
  {
    id: 'summary', name: '极简总结页', group: 'frame', build: core.summary,
    useWhen: '全课收束：三条以内、可复述、带下讲预告',
    signal: '—',
  },
];

const MAP = Object.fromEntries(LAYOUTS.map((l) => [l.id, l]));

function get(id) {
  const hit = MAP[id];
  if (!hit) throw new Error(`未知版式：${id}。可用：${Object.keys(MAP).join(', ')}`);
  return hit;
}

module.exports = { LAYOUTS, MAP, get };
