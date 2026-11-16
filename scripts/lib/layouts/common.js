// 版式公共部件：页头、页脚、结论条、图片/矢量兜底、章节元信息
//
// 字号纪律：本文件只用 TYPE.h1(34) / TYPE.h3(21) / TYPE.body(18) / TYPE.small(16) 四档。
// 任何需要"再小一点"的地方，正确答案是删字或改布局，不是降字号。
const { fitText, textWidth, stepDown, wrapText, blockHeight } = require('../measure');
const { mix, shade } = require('../color');
const { NAV, RADIUS, SPACE, TYPE, MIN_FONT, ORN } = require('../design');
const { tabsAvailable, tabsWidth, navWidth } = require('../nav');

const MX = 0.85;
const CW = 13.333 - MX * 2;
const RIGHT = 13.333 - MX;
const BOTTOM = 6.86;

// 按宽度裁字（宁可截断也不缩到 16 以下；调用方应尽量避免走到这里）
function clip(str, size, w, track = 0) {
  const s0 = String(str);
  let s = s0;
  while (s.length > 1 && (textWidth(s, size) + s.length * track) / 72 + 0.14 > w) s = s.slice(0, -1);
  if (s === s0) return s;
  return `${s.slice(0, -1)}…`;
}

function header(cv, page, o = {}) {
  const T = cv.T;
  const deck = (cv.ctx && cv.ctx.deck) || {};
  const kColor = o.kickerColor || T.accentText;
  // 胶囊 / 页码签占掉右上角，页头必须整体下移避让，否则标题第一行会顶到导航底边。
  const navMode = (deck.meta && deck.meta.nav) || 'chapters';
  const tabs = navMode === 'tabs' && tabsAvailable(deck);
  const dy = tabs ? NAV.HEADER_CLEAR : 0;
  const size = TYPE.small;
  // 右上角被导航占掉的宽度：kicker 只能用到导航左侧 0.30 处，两处用同一份几何
  const reserve = o.navReserve === undefined ? navWidth(cv, deck, page, navMode) : o.navReserve;
  const kMax = Math.min(8.2, RIGHT - reserve - 0.34 - MX);

  if (page.kicker) {
    // kicker 与导航签同一水平中线（0.56）：一左一右咬合成一条"页眉带"
    const ky = tabs ? NAV.TAB_Y + (NAV.TAB_H - 0.34) / 2 : 0.39;
    const track = 2.2;
    // 金色小方块是 kicker 的"钉子"：没有它，孤零零一行小字会读成"没做完的标题"
    cv.rect(MX, ky + 0.10, 0.13, 0.13, { fill: T.accent, name: 'decor.kicker.mark' });
    cv.text(MX + 0.26, ky, Math.max(1.6, kMax - 0.26), 0.34, clip(page.kicker, size, kMax - 0.26, track), {
      size, bold: true, color: kColor, tracking: track, shrink: false, minSize: size, valign: 'middle',
      name: 'aux.kicker',
    });
  }

  const maxSize = o.size || TYPE.h1;
  const minSize = Math.max(MIN_FONT, o.minSize || TYPE.h2);
  const boxW = (o.width || CW) - 0.1;
  const fitted = fitText(page.title || '', boxW, 2.5, { max: maxSize, min: minSize });
  const th = (fitted.lines.length * fitted.size * 1.32) / 72;
  cv.text(MX, 0.90 + dy, boxW, th + 0.10, page.title, {
    size: fitted.size, bold: true, color: o.color || T.ink, lh: 1.0, shrink: false, minSize,
    wrap: fitted.lines.length > 1,
  });
  let y = 1.02 + dy + th;
  if (page.subtitle) {
    const sw = Math.min(CW * 0.82, 9.6);
    const lines = wrapText(page.subtitle, TYPE.body, sw);
    const sh = Math.max(0.36, blockHeight(lines, TYPE.body, 1.25));
    cv.text(MX, y + 0.10, sw, sh, page.subtitle, {
      size: TYPE.body, color: o.subColor || T.muted, lh: 1.25, minSize: TYPE.body,
    });
    y += 0.10 + sh;
  }
  // 内容区起点：标题区 + 固定呼吸量（不再靠 1.72 这种硬底，字号变了会撞）
  return Math.max(o.minTop || 2.02, y + (o.gap === undefined ? 0.34 : o.gap));
}

function footer(cv, page, deck) {
  const T = cv.T;
  const lesson = (deck.meta && (deck.meta.lesson || deck.meta.course)) || '';
  // 页脚分隔：一条极细实线（不是渐隐）——它要和上方的"金线"区分开，
  // 金色只标结构，灰色只标页边。两者混用会让页面失去层次。
  cv.rect(MX, 6.90, CW, 0.010, { fill: T.line, name: 'decor.footline' });
  if (lesson) {
    cv.text(MX, 6.98, 7.2, 0.32, lesson, { size: TYPE.small, color: T.muted, shrink: false, name: 'footer.lesson' });
  }
  const total = deck.totalPages || deck.pages.length;
  // 页码前的小金块：让"页码"也属于同一套标记语言
  cv.rect(RIGHT - 1.42, 7.06, 0.09, 0.09, { fill: T.accent, name: 'decor.page.mark' });
  cv.text(RIGHT - 1.26, 6.98, 1.26, 0.32, `${String(cv.ctx.pageNo).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, {
    size: TYPE.small, color: T.muted, align: 'right', shrink: false, name: 'page.number',
  });
}

// 页底结论条：主色浅底 + 左侧强调条。
// 为什么不再是白卡：整页都是白卡时，结论条再是白卡，"本页最重要的一句话"
// 就和普通卡片平权了——重点必须由颜色层级说出来。primarySoft 只在这一处
// 大面积出现，全册扫过去时它是"每页的落点"。
function insightBar(cv, y, text, o = {}) {
  const T = cv.T;
  const h = o.h || 0.92;
  const box = cv.card(MX, y, o.w || CW, h, {
    fill: o.fill || T.primarySoft,
    line: o.line || mix(T.primarySoft, T.primary, 0.35),
    accent: o.mark || T.primary,
    accentSide: 'left',
    pad: 0.26,
    name: 'insight',
  });
  cv.text(box.x + 0.10, y, box.w - 0.10, h, text, {
    size: o.size || TYPE.body, bold: o.bold !== false, color: o.color || T.em,
    valign: 'middle', lh: 1.25, minSize: TYPE.small, name: 'insight.text',
  });
  return y + h;
}

// 图片缺失时的矢量兜底：不是"灰色占位框"，而是一块排得住的文字色板。
// 注意：兜底图形必须完全落在画框内，不能越界压到旁边的正文。
function imageOrVector(cv, x, y, w, h, src, o = {}) {
  const T = cv.T;
  if (src) {
    cv.image(x, y, w, h, src, { fit: o.fit || 'cover' });
    return true;
  }
  const tint = o.bg || mix(T.bg, T.primary, 0.10);
  cv.rect(x, y, w, h, { fill: tint, radius: RADIUS.card, name: 'media.panel' });

  // 右下角"段落示意"：三条递减横线，完全在框内，不抢正文
  const lw = Math.min(1.9, w * 0.32);
  const ly = y + h - 0.76;
  [1, 0.72, 0.44].forEach((k, i) => {
    cv.line(x + w - 0.48 - lw * k, ly + i * 0.21, x + w - 0.48, ly + i * 0.21, {
      color: i === 0 ? T.accent : T.line, width: i === 0 ? 2.4 : 1.4,
    });
  });

  cv.rect(x + 0.44, y + 0.48, 0.08, 1.2, { fill: T.accent, name: 'media.mark' });
  const label = o.label || '';
  if (label) {
    cv.text(x + 0.78, y + 0.44, w - 1.45, Math.min(h - 1.6, 2.4), label, {
      size: o.size || TYPE.h3, bold: true, color: T.primaryText, lh: 1.25, minSize: TYPE.body,
    });
  }
  if (o.caption) {
    cv.text(x + 0.78, y + h - 0.58, w - 1.9, 0.36, o.caption, { size: TYPE.small, color: T.muted, shrink: false });
  }
  return false;
}

// 章节小标（左上角竖排序号 + 名称），用于内容页
function sectionTag(cv, x, y, num, name, o = {}) {
  const T = cv.T;
  cv.text(x, y, 0.95, 0.32, num, { size: TYPE.small, bold: true, color: o.color || T.accentText, shrink: false });
  cv.text(x + 0.55, y, 3.6, 0.32, name, { size: TYPE.small, color: o.nameColor || T.muted, shrink: false });
}

module.exports = { MX, CW, RIGHT, BOTTOM, header, footer, insightBar, imageOrVector, sectionTag, clip };
