// 右上角课程进度导航（haoxue-ppt 核心组件）
// 原生文本 + 形状实现，全部可编辑；状态由页面所属章节自动推导。
// 三种设计语言：
//   chapters —— 深色"页码签"：序号 / 章节名 / 进度刻度同处一条深色胶囊（默认）
//   tabs     —— 章节胶囊：每章一枚，当前项实底高亮（≤4 章标准间距，5–6 章自动收紧，最像线下课表）
//   minimal  —— 只有序号与一根短金线（章节分隔页用，避免打断大字）
//
// 为什么默认项要放在深色底板上：
//   细灰刻度 + 灰字在浅色页上的对比度只有 2 左右，投影仪一开就"消失"了——
//   索引必须在任何底色上都被一眼看到。深色签同时成为页面右上角的视觉锚点，
//   与页脚的浅灰信息形成"上重下轻"的稳定结构。
const { textWidth } = require('./measure');
const { mix, shade } = require('./color');
const { NAV, RADIUS, TYPE } = require('./design');

const MODES = ['chapters', 'steps', 'minimal', 'hidden', 'tabs'];

const PLATE_H = 0.44;
const PLATE_Y = 0.34;
const TAB_H = NAV.TAB_H;
const TAB_Y = NAV.TAB_Y;
const TAB_MAX_W = NAV.TAB_MAX_W;
const TAB_GAP = NAV.TAB_GAP;
const RIGHT = 13.333 - 0.85;
const MAX_TABS = 6;   // 6 章以内都能完整列出；再多只能退回"刻度"形态

function chapterIndex(deck, page) {
  const chapters = deck.chapters || [];
  if (!chapters.length) return { idx: -1, total: 0, chapter: null };
  const cid = page.chapter;
  let idx = chapters.findIndex((c) => c.id === cid || c.title === cid || c.short === cid);
  if (idx < 0 && page._resolvedChapter) idx = chapters.findIndex((c) => c.id === page._resolvedChapter);
  return { idx, total: chapters.length, chapter: chapters[idx] || null };
}

// 按字号量出等宽胶囊的尺寸；等宽是为了让序号列对齐，读起来像一排按钮。
// compact（5–6 章）：收内边距与徽标宽度，把 6 枚塞进同一条索引里——
// 学生要能一眼看全"今天有几章、现在讲到第几章"，索引缺章比挤一点更糟。
function measureTabs(chapters, size, compact) {
  const k = size / 16;
  const numW = compact ? 0.30 : Math.max(0.34, 0.46 * k);
  const padL = compact ? 0.07 : 0.09;
  // 文字右侧留白略大于左侧徽标间距：胶囊才不会像被文字"顶到边"
  const padR = compact ? 0.15 : Math.max(0.28, 0.36 * k);
  const inner = compact ? 0.10 : Math.max(0.16, 0.22 * k);
  const gap = compact ? 0.09 : TAB_GAP;
  const widths = chapters.map((c) => {
    const label = c.short || c.title || '';
    return padL + numW + inner + textWidth(label, size) / 72 + padR;
  });
  const pillW = Math.max(...widths);
  return {
    numW, padL, padR, inner, pillW, gap,
    total: pillW * chapters.length + gap * (chapters.length - 1),
  };
}

// 选一个能塞下的字号；塞不下返回 null，由调用方退回刻度模式。
// 候选只有 16pt 一档——再小就违反"最小字号"纪律，宁可换导航形态。
function fitTabs(chapters) {
  const compact = chapters.length > 4;
  const m = measureTabs(chapters, TYPE.small, compact);
  return m.total <= TAB_MAX_W ? { size: TYPE.small, m, compact } : null;
}

function drawTabs(cv, deck, idx, dark) {
  const T = cv.T;
  const chapters = deck.chapters || [];
  // 5–6 章用紧凑胶囊（仍能看全所有章节）；再往上就真的挤成小色块了，退回刻度模式
  if (!chapters.length || chapters.length > MAX_TABS) return false;
  const fitted = fitTabs(chapters);
  if (!fitted) return false;

  const { size, m } = fitted;
  const right = RIGHT;
  const numH = Math.min(fitted.compact ? 0.34 : 0.40, TAB_H - 0.08);

  // 当前项：实底 + 反白字；序号块换成强调色。深色页反过来，用亮底压深字。
  const curBg = dark ? T.accent : T.deep;
  const curLabel = dark ? T.deep : T.deepInk;
  const curNumBg = dark ? T.deep : T.accent;
  // 徽章文字用 accentInk（在深墨/纸白里按对比度择优）——
  // 强调色一提亮（香槟金），纸白字就只有 2.3:1，不能写死 deepInk。
  const curNum = dark ? T.accent : T.accentInk;

  const idleBg = dark ? T.deepAlt : T.surface;
  const idleLine = dark ? T.deepEdge : T.line;
  const idleNumBg = dark ? mix(T.deepAlt, T.deepMuted, 0.22) : T.primarySoft;
  const idleNum = dark ? T.deepMuted : T.primaryText;
  const idleLabel = dark ? T.deepMuted : T.muted;

  let x = right - m.total;
  chapters.forEach((c, i) => {
    const on = i === idx;
    const label = c.short || c.title || '';
    const tag = `nav.tab.${i + 1}${on ? '.on' : ''}`;
    cv.rect(x, TAB_Y, m.pillW, TAB_H, {
      radius: RADIUS.pill,
      fill: on ? curBg : idleBg,
      // 当前项也描同色边：lw:0 的无边框 roundRect 在部分渲染器（含 Spire）顶部会出现填充缺口
      line: on ? curBg : idleLine,
      lw: 1,
      name: tag,
    });
    // 序号块：胶囊左侧的"数字徽标"
    cv.rect(x + m.padL, TAB_Y + (TAB_H - numH) / 2, m.numW, numH, {
      radius: RADIUS.tag,
      fill: on ? curNumBg : idleNumBg,
      name: `${tag}.badge`,
    });
    cv.text(x + m.padL, TAB_Y + (TAB_H - numH) / 2, m.numW, numH, String(i + 1).padStart(2, '0'), {
      size: TYPE.small, bold: true, color: on ? curNum : idleNum,
      align: 'center', valign: 'middle', shrink: false, name: `${tag}.no`,
    });
    cv.text(x + m.padL + m.numW + m.inner, TAB_Y, m.pillW - m.padL - m.numW - m.inner - 0.04, TAB_H, label, {
      size, bold: on, color: on ? curLabel : idleLabel,
      valign: 'middle', shrink: false, minSize: TYPE.small, name: `${tag}.label`,
    });
    x += m.pillW + m.gap;
  });
  return true;
}

// 页码签的几何：drawNav 与页头（kicker 让位）共用同一份计算，避免两处对不上
function plateMetrics(cv, deck, page, mode) {
  const { idx, total, chapter } = chapterIndex(deck, page);
  if (idx < 0 || !total) return null;
  const minimal = mode === 'minimal';
  const label = chapter ? (chapter.short || chapter.title || '') : '';
  const showName = !minimal && !!label;
  const showTicks = !minimal && total >= 2 && total <= 8;
  const numW = 1.20;   // 「01 / 06」在 21pt+16pt 混排下的实测宽度，收窄就会折行
  const nameW = showName ? Math.min(2.05, Math.max(0.74, textWidth(label, TYPE.small) / 72 + 0.20)) : 0;
  const tickW = showTicks ? total * 0.13 + (total - 1) * 0.05 : 0;
  const padL = 0.20;
  const padR = 0.22;
  const sepGap = 0.16;
  let dataW = numW;
  if (showName) dataW += sepGap + nameW;
  if (showTicks) dataW += sepGap + tickW;
  return {
    idx, total, chapter, label, minimal, showName, showTicks,
    num: String(idx + 1).padStart(2, '0'),
    tot: String(total).padStart(2, '0'),
    numW, nameW, tickW, padL, padR, sepGap,
    w: (minimal ? 0 : padL + dataW + padR),
  };
}

function drawNav(cv, page, deck, opts = {}) {
  const T = cv.T;
  const mode = page.nav || opts.mode || 'chapters';
  if (mode === 'hidden') return;
  const { idx } = chapterIndex(deck, page);
  if (idx < 0) return;

  const dark = !!opts.dark;

  // 胶囊模式：章节数过多或名字太长塞不下时，自动退回刻度模式（不硬挤）
  if (mode === 'tabs') {
    if (drawTabs(cv, deck, idx, dark)) return;
  }

  const m = plateMetrics(cv, deck, page, mode);
  if (!m) return;

  const colNum = dark ? T.accent : T.accent;
  const colRest = dark ? T.deepMuted : mix(T.deepInk, T.deep, 0.34);
  const colName = dark ? T.deepInk : T.deepInk;
  const colSep = mix(T.deepInk, dark ? T.deepAlt : T.deep, 0.76);
  const colTickIdle = mix(T.deepInk, dark ? T.deepAlt : T.deep, 0.76);
  const colTickOn = T.accent;

  if (m.minimal) {
    // 极简：只有序号和一根短金线，右对齐（分隔页上不抢大字）
    const w = 1.05;
    cv.text(RIGHT - w, PLATE_Y + 0.02, w, 0.40, [
      { text: m.num, color: colNum, bold: true, size: TYPE.h3 },
      { text: ` / ${m.tot}`, color: dark ? T.deepMuted : T.muted, size: TYPE.small },
    ], { size: TYPE.h3, align: 'right', valign: 'middle', shrink: false, minSize: TYPE.small, name: 'nav.current' });
    cv.rect(RIGHT - w - 0.46, PLATE_Y + 0.20, 0.34, 0.028, { fill: T.accent, name: 'grad.gold' });
    return;
  }

  const x0 = RIGHT - m.w;
  // 底板：整条"页码签"。浅色页用最深的墨色（页面上唯一的重色块），
  // 深色页用高一级的 deepAlt —— 否则与底同色，索引等于没有。
  cv.rect(x0, PLATE_Y, m.w, PLATE_H, {
    fill: dark ? T.deepAlt : T.deep,
    line: dark ? T.deepEdge : mix(T.deep, T.accent, 0.22),
    lw: 0.75,
    radius: RADIUS.pill,
    name: 'nav.plate',
  });
  // 底板左沿的金色细条：让签的"起点"清楚，不是一块悬空的深色
  cv.rect(x0, PLATE_Y + 0.14, 0.05, PLATE_H - 0.28, { fill: T.accent, name: 'nav.plate.mark' });

  // 1) 序号 / 总数
  let cx = x0 + m.padL + 0.06;
  cv.text(cx, PLATE_Y, m.numW, PLATE_H, [
    { text: m.num, color: colNum, bold: true, size: TYPE.h3 },
    { text: ` / ${m.tot}`, color: colRest, size: TYPE.small },
  ], { size: TYPE.h3, align: 'left', valign: 'middle', shrink: false, minSize: TYPE.small, name: 'nav.current' });
  cx += m.numW;

  // 2) 分隔竖线
  if (m.showName || m.showTicks) {
    cv.rect(cx + m.sepGap / 2, PLATE_Y + 0.13, 0.012, PLATE_H - 0.26, { fill: colSep, name: 'nav.sep' });
    cx += m.sepGap;
  }

  // 3) 章节名
  if (m.showName) {
    cv.text(cx, PLATE_Y, m.nameW, PLATE_H, m.label, {
      size: TYPE.small, color: colName, valign: 'middle', shrink: false,
      minSize: TYPE.small, name: 'nav.chapter',
    });
    cx += m.nameW + m.sepGap;
  }

  // 4) 进度刻度：当前段金实、其余反白 24%
  if (m.showTicks) {
    const tw = 0.13, gap = 0.05;
    const ty = PLATE_Y + (PLATE_H - 0.055) / 2;
    for (let i = 0; i < m.total; i += 1) {
      cv.rect(cx + i * (tw + gap), ty, tw, 0.055, {
        fill: i === idx ? colTickOn : colTickIdle,
        name: `nav.tick.${i + 1}`,
      });
    }
  }
}

// 该 deck 是否真的会画出胶囊（页头要据此决定让位多少）
function tabsAvailable(deck) {
  const chapters = (deck && deck.chapters) || [];
  if (!chapters.length || chapters.length > MAX_TABS) return false;
  return !!fitTabs(chapters);
}

// 胶囊整组宽度：页头的 kicker 要按这个宽度让位，避免标题区与胶囊相撞
function tabsWidth(deck) {
  const chapters = (deck && deck.chapters) || [];
  if (!chapters.length || chapters.length > MAX_TABS) return 0;
  const f = fitTabs(chapters);
  return f ? f.m.total : 0;
}

// 页码签宽度（tabs 模式下取胶囊组宽度）：页头据此算 kicker 可用宽度
function navWidth(cv, deck, page, mode) {
  if (mode === 'tabs' && tabsAvailable(deck)) return tabsWidth(deck);
  if (mode === 'minimal' || mode === 'hidden') return 0;
  const m = plateMetrics(cv, deck, page, mode);
  return m ? m.w : 0;
}

module.exports = {
  drawNav, chapterIndex, tabsAvailable, tabsWidth, navWidth, plateMetrics, MODES,
  PLATE_Y, PLATE_H,
};
