// 背景圆弧装饰层。
// 为什么需要它：整套版式语言是"方正"的——卡片、章节条、导航胶囊都是直角圆角的矩形，
// 全册翻下来秩序感很强，但也容易"素"。一两组大圆弧正好形成反差：
// 曲与直、边角与留白，页面立刻有了呼吸。
//
// 三条纪律（都为了"不要影响阅读"）：
//   1) 只画在页角外沿：圆心在画布外，露出的一小段贴着边角走，绝不进内容安全区
//   2) 颜色只取色阶浅档 / 深底的同族暗色：对比度天然低于正文一整个量级
//   3) 线宽 ≤1.5pt，且 postprocess 把两端渐隐——读内容时它不存在，翻页时它在
const { mix } = require('./color');

const W = 13.333; // 画布宽（LAYOUT_WIDE）
const H = 7.5;    // 画布高

// o: { dark, layout }  dark = 深色页（封面/章节页/小结/整图页或深色主题）
function bgArcs(cv, o = {}) {
  const T = cv.T;
  const dark = !!o.dark;
  // 颜色三档：主弧（色阶 300，浅页）/ 强调弧（accentSoft，点一点金或蓝）/ 暗页用深底同族
  const main = dark ? mix(T.deep, T.deepInk, 0.14) : (T.tone ? T.tone[300] : mix(T.bg, T.primary, 0.24));
  const soft = dark ? mix(T.deep, T.deepInk, 0.09) : (T.tone ? T.tone[200] : mix(T.bg, T.primary, 0.14));
  const glow = dark ? mix(T.deep, T.accent, 0.26) : (T.accentSoft || mix(T.bg, T.accent, 0.28));

  // 右上角：圆心在画布右上外侧，露出朝画布内的一小段（90°–180° = 西南象限）
  cv.arc(W + 0.85, -0.72, 3.55, { range: [90, 180], color: main, width: 1.5, name: 'grad.arc' });
  cv.arc(W + 0.85, -0.72, 3.05, { range: [90, 180], color: glow, width: 1.0, name: 'grad.arc' });

  // 左下角：反向一组（270°–360° = 东北象限），半径错开，避免四角对称的"图章感"
  cv.arc(-0.72, H + 0.82, 3.30, { range: [270, 360], color: soft, width: 1.5, name: 'grad.arc' });
  cv.arc(-0.72, H + 0.82, 2.78, { range: [270, 360], color: glow, width: 1.0, name: 'grad.arc' });
}

module.exports = { bgArcs };
