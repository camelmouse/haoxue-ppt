// 九种认知动作：每页 PPT 的"隐藏属性"
//
// 这一层不解决"第 7 页放什么"，而解决"第 7 页学生的大脑应该发生什么"。
// 先定动作，再选版式：curiosity 适合全幅图/大字，concept 适合分层/卡片，
// application 适合 question/flow，transfer 适合 debate/offsetImageText。
//
// 唯一真源：deck 校验、ghostdeck、teachqa 都从这里取词表与规则，不要各写一份。

const ACTIONS = {
  curiosity: { zh: '好奇', ask: '咦？为什么会这样', hint: '用具体反差（数字、场景）开场，不给结论' },
  prediction: { zh: '预测', ask: '你觉得会是哪个', hint: '先让学生投票/口头判断，答案压到下一页' },
  conflict: { zh: '冲突', ask: '你想的和事实不一样', hint: '正面写出"多数人以为是 X，其实是 Y"' },
  explanation: { zh: '解释', ask: '原来是因为这个', hint: '给出机制，一条因果链，不要罗列' },
  concept: { zh: '概念', ask: '这个现象叫什么', hint: '定义 + 特征 + 边界，三件齐；结构用分层' },
  evidence: { zh: '证据', ask: '凭什么相信', hint: '数据、案例结果、制度原文，指向一个结论' },
  application: { zh: '应用', ask: '换你会怎么做', hint: '给情境让学生做决定，必须有判断标准' },
  transfer: { zh: '迁移', ask: '换个场景还成立吗', hint: '换行业/换角色/换规模，暴露适用边界' },
  reflection: { zh: '反思', ask: '回头看，哪里想错了', hint: '回到开场的判断，让学生自己改答案' },
};

const IDS = Object.keys(ACTIONS);

// 这几类页面本来就不承担认知动作：封面是入口，分隔页是呼吸，全幅图是停顿。
// 把它们计入"未标注"，会让每一份正常课件都背上几条假告警。
const SKIP_LAYOUTS = new Set(['cover', 'divider', 'fullImage']);

// 一份课件最起码要有的认知动作：制造张力 → 暴露误解 → 会用。
// 缺任何一个，这堂课就会退化成"知识点串讲"。
const REQUIRED_BASE = ['prediction', 'conflict', 'application'];
// 12 页以上的完整课时再加"知道边界"（transfer）：
// 45 分钟的短课硬塞迁移页，会挤掉本来就紧的案例，反而更糟。
const REQUIRED_LONG = [...REQUIRED_BASE, 'transfer'];
const LONG_DECK = 12;

// 认知动作 → 可用版式（只是建议，不是强制；版式本身还受内容结构约束）。
// 这张表要"宽"：它报的是"完全反直觉的搭配"，不是"换一个更好"——
// 建议太窄，作者就会为了消警告去改本来正确的版式。
const PREFERRED = {
  curiosity: ['cover', 'bigIdea', 'fullImage', 'offsetImageText', 'caseStory', 'layers', 'timeline'],
  prediction: ['question', 'debate', 'bigIdea', 'caseStory'],
  conflict: ['debate', 'caseStory', 'matrix', 'bigIdea', 'question'],
  explanation: ['causalChain', 'layers', 'flow', 'timeline', 'debate', 'bento'],
  concept: ['layers', 'bento', 'matrix', 'flow', 'bigIdea', 'causalChain', 'timeline'],
  evidence: ['dataChart', 'caseStory', 'timeline', 'zoom', 'bento', 'matrix'],
  application: ['question', 'flow', 'caseStory', 'bento', 'matrix'],
  transfer: ['debate', 'offsetImageText', 'matrix', 'dataChart', 'question'],
  reflection: ['summary', 'bigIdea', 'question', 'debate'],
};

function isAction(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, v);
}

// 允许写中文：页面上写 "概念" 比写 "concept" 更接近老师的语言
const ZH2ID = IDS.reduce((m, id) => {
  m[ACTIONS[id].zh] = id;
  return m;
}, {});

function normalize(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (isAction(s)) return s;
  if (ZH2ID[s]) return ZH2ID[s];
  return null;
}

// 序列检查：返回 [{level:'warn'|'info', msg}]
// 只报"会真的伤到课"的问题，不做礼仪性检查。
// opts.skip=true 用于版式样张（purpose:"showcase"）——样张没有教学逻辑，不该被教学规则评分。
function auditSequence(pages, opts = {}) {
  const out = [];
  if (opts.skip) return out;
  const auditable = pages.filter((p) => !SKIP_LAYOUTS.has(p.layout));
  const tagged = pages
    .map((p, i) => ({ i: i + 1, act: normalize(p.cognitive), layout: p.layout }))
    .filter((x) => x.act && !SKIP_LAYOUTS.has(x.layout));

  const missing = auditable.length - tagged.length;
  if (missing > 0) {
    out.push({
      level: 'warn',
      msg: `${missing} 页未标 cognitive（学生在这一页该做什么）。标了才知道该配什么版式、该不该放图`,
    });
  }
  if (!tagged.length) return out;

  // 连续 3 页同一动作 = 节奏塌了
  for (let k = 2; k < tagged.length; k += 1) {
    if (tagged[k].act === tagged[k - 1].act && tagged[k].act === tagged[k - 2].act) {
      out.push({
        level: 'warn',
        msg: `第 ${tagged[k - 2].i}–${tagged[k].i} 页连续三页都是「${ACTIONS[tagged[k].act].zh}」，节奏会塌；中间插一页别的动作`,
      });
    }
  }

  const have = new Set(tagged.map((x) => x.act));
  const required = auditable.length >= LONG_DECK ? REQUIRED_LONG : REQUIRED_BASE;
  const lack = required.filter((a) => !have.has(a));
  if (lack.length) {
    out.push({
      level: 'warn',
      msg: `缺少关键认知动作：${lack.map((a) => `${ACTIONS[a].zh}(${a})`).join('、')}。${
        lack.includes('conflict') ? '没有冲突页，学生不会推翻原有做法；' : ''
      }${lack.includes('transfer') ? '没有迁移页，学生把方法当万能钥匙。' : ''}`.trim(),
    });
  }
  if (have.size < 6 && auditable.length >= 10) {
    out.push({
      level: 'warn',
      msg: `全册只用 ${have.size} 种认知动作（≥10 页建议 ≥6 种）：${[...have].map((a) => ACTIONS[a].zh).join('/')}`,
    });
  }

  // 版式与动作明显拧着来：concept 页用 question 版式，学生还没被问到就先答题
  tagged.forEach((x) => {
    const pref = PREFERRED[x.act] || [];
    if (pref.length && !pref.includes(x.layout)) {
      out.push({
        level: 'info',
        msg: `第 ${x.i} 页动作是「${ACTIONS[x.act].zh}」，版式 ${x.layout} 不常配；常用：${pref.join(' / ')}`,
      });
    }
  });

  return out;
}

module.exports = {
  ACTIONS, IDS, REQUIRED_BASE, REQUIRED_LONG, LONG_DECK, PREFERRED,
  isAction, normalize, auditSequence,
};
