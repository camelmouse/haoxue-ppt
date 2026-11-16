// 卡片栅格（bento）：用大小不一的浮起卡片组织同级信息。
// 为什么不是等分宫格：等分宫格把每块信息标成"同等重要"，读者没有视线入口；
// 一张大卡 + 两三张小卡，天然形成"先说结论、再看支撑"的阅读顺序。
const { MX, CW, RIGHT, header, footer, insightBar } = require('./common');
const { TYPE, RADIUS, SPACE } = require('../design');
const { mix } = require('../color');
const { wrapText, blockHeight } = require('../measure');

const G = 0.28; // 卡片间距：必须明显大于卡片内边距，否则块与块会"粘住"

// 按卡片数量给出几何：3 张 = 左大右二；4 张 = 2×2；5 张 = 上三下二；6 张 = 3×2
function cellsFor(n, top0, bottom0, even) {
  const W = CW;
  // 曾经试过给 5–6 格收 5% 高度来降填充率，结果卡片变矮、正文放不下，
  // 溢出比"密 1%"难看得多。密了就拆页，不要缩卡——这条和"不缩字号"是同一条原则。
  const shrink = 1;
  const avail = bottom0 - top0;
  const top = top0 + avail * (1 - shrink) * 0.45;
  const bottom = top + avail * shrink;
  const H = bottom - top;
  if (n <= 2) {
    const w = (W - G * (n - 1)) / Math.max(1, n);
    return Array.from({ length: n }, (_, i) => ({ x: MX + i * (w + G), y: top, w, h: H }));
  }
  if (n === 3 && even) {
    // 三个并列概念（三种职权、三个岗位）等分：一主两辅会谎报"有一个更重要"。
    // 高度要跟着可用高度走：之前封顶 3.10in，结果三张卡悬在上半屏，下半屏两英寸全空——
    // "留白"和"没排完"在观感上是两件完全不同的事。
    const w = (W - G * 2) / 3;
    return [0, 1, 2].map((i) => ({ x: MX + i * (w + G), y: top, w, h: H }));
  }
  if (n === 3) {
    const lw = W * 0.555 - G / 2;
    const rw = W - lw - G;
    const rh = (H - G) / 2;
    return [
      { x: MX, y: top, w: lw, h: H },
      { x: MX + lw + G, y: top, w: rw, h: rh },
      { x: MX + lw + G, y: top + rh + G, w: rw, h: rh },
    ];
  }
  if (n === 4) {
    const w = (W - G) / 2;
    const h = (H - G) / 2;
    return [0, 1, 2, 3].map((i) => ({
      x: MX + (i % 2) * (w + G), y: top + Math.floor(i / 2) * (h + G), w, h,
    }));
  }
  if (n === 5) {
    // 上 2 宽 + 下 3 窄：五格若按 3+2 分，上排会矮到放不下"标题 + 一行正文"
    const w2 = (W - G) / 2;
    const w3 = (W - G * 2) / 3;
    const hTop = H * 0.46;
    return [
      { x: MX, y: top, w: w2, h: hTop },
      { x: MX + w2 + G, y: top, w: w2, h: hTop },
      { x: MX, y: top + hTop + G, w: w3, h: H - hTop - G },
      { x: MX + w3 + G, y: top + hTop + G, w: w3, h: H - hTop - G },
      { x: MX + (w3 + G) * 2, y: top + hTop + G, w: w3, h: H - hTop - G },
    ];
  }
  const w = (W - G * 2) / 3;
  const h = (H - G) / 2;
  return Array.from({ length: n }, (_, i) => ({
    x: MX + (i % 3) * (w + G), y: top + Math.floor(i / 3) * (h + G), w, h,
  }));
}

function bento(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const cells = page.cells || [];
  // 栅格下沿不贴到页脚：整片卡片会读成"一块大色块"，留 0.5in 呼吸区才有纸面感
  const bottom = page.insight ? 5.82 : 6.24;
  // 3 格时左卡通高、内部只有一个缝，覆盖率天然最高——底部再收 0.12in，
  // 让 3 格页与 4/5/6 格页看起来是同一种"呼吸深度"，而不是两套边距。
  const gridBottom = bottom - (cells.length <= 3 ? 0.26 : 0);
  const rects = cellsFor(cells.length || 1, top, gridBottom, page.even === true);

  // chip 需要 0.44（chip）+ 标题 + 一行正文，净高不足 1.5in 的格子给不了这个空间；
  // 此时整页统一改"编号卡"，不做半页 chip 半页编号的混排。
  const minBoxH = Math.min(...rects.map((r) => r.h)) - 0.40;
  const useLabel = cells.every((c) => !!c.label) && minBoxH >= 1.50;

  cells.forEach((c, i) => {
    const r = rects[i];
    if (!r) return;
    const big = r.h > (bottom - top) * 0.6 || r.w > CW * 0.5;
    const isDark = c.tone === 'dark';
    // 强调卡（c.em / c.tone==='tint'）：主色浅底 + 主色描边 + 主色强调条。
    // 一页最多一张——强调卡一多，"哪张是重点"就又被抹平了。
    const isEm = !isDark && (c.em === true || c.tone === 'tint' || c.tone === 'accent');
    const box = cv.card(r.x, r.y, r.w, r.h, {
      tone: isDark ? 'dark' : (isEm ? 'tint' : undefined),
      // 同页同族：普通卡一律白面，层次交给尺寸、内外边距和阴影。
      // 混用 surface / surfaceAlt 会让三张卡像"用了三种纸"；强调卡是唯一的例外，
      // 它的职责就是把"本页主角"从一排白卡里抬出来。
      fill: isDark ? T.deep : (isEm ? T.primarySoft : T.surface),
      line: isDark ? mix(T.deep, T.accent, 0.30) : (isEm ? mix(T.primarySoft, T.primary, 0.40) : undefined),
      lw: isDark || isEm ? 1.0 : undefined,
      accent: isDark || isEm ? (isEm ? T.primary : T.accent) : null,
      // 强调条改走左侧竖条：原来压在上沿，会和 chip 抢同一块"头部空间"
      accentSide: 'left',
      // 小格（5/6 格、带结论条时只剩 1.3in 净高）内边距收到 0.20：
      // 0.26 会让"两行正文"差 0.04in 放不下，只能靠缩字号解决——那是错的方向。
      pad: big ? 0.30 : (r.h < 1.95 ? 0.20 : 0.26),
      name: `bento.${i + 1}`,
    });

    // 先算标题实际折行高度，再决定小标让不让位：
    // 格子只有 1.2in 时，"小标 + 标题 + 两行正文" 一定塞不下，此时砍小标而不是砍正文。
    // 4 格以内标题可以放到 26pt：卡高 1.76in 时 26pt 标题 + 两行正文仍然放得下，
    // 而 21pt 在大卡里会显得"标题不像标题"。
    const tSize = (big || (cells.length <= 4 && box.h >= 1.72)) ? TYPE.h2 : TYPE.h3;
    const tLines = c.title ? wrapText(c.title, tSize, box.w, { bold: true }) : [];
    const tH = c.title ? Math.max(0.40, blockHeight(tLines, tSize, 1.16)) : 0;
    const bSize = big ? TYPE.body : TYPE.small;
    const bodyLines = c.body ? wrapText(c.body, bSize, box.w) : [];
    const bodyH = c.body ? blockHeight(bodyLines, bSize, 1.34) : 0;
    const valueH = c.value ? 0.80 : 0;
    const labelH = 0.44;
    const contentNoLabel = valueH + tH + (c.body ? bodyH + 0.06 : 0);
    const withLabel = useLabel && !!c.label && (box.h - contentNoLabel >= labelH + 0.10);
    const blockH = (withLabel ? labelH : 0) + contentNoLabel;

    // 内容在卡内垂直居中：卡片撑满可用高度后，如果内容仍顶在上边，
    // 下半张卡就是一块死白——看起来像"没排完"，而不是"留白"。
    let y = box.y + Math.max(0, (box.h - blockH) / 2);
    if (withLabel) {
      // 小标不再是"一行灰字"，而是带金钉的深色 chip —— 每格都有一个明确的"信息头"
      cv.chip(box.x - 0.02, y, c.label, {
        h: 0.32, maxW: box.w + 0.02,
        fill: isDark ? T.deepAlt : undefined,
        size: TYPE.small,
      });
      y += labelH;
    }
    // 大数字做视觉锚点（一张卡里只允许一个）
    if (c.value) {
      cv.text(box.x, y, box.w, 0.80, c.value, {
        size: 42, bold: true, color: isDark ? T.accent : T.primary, shrink: false, font: T.fonts.title,
      });
      y += 0.80;
    }
    if (c.title) {
      // 标题框贴合"实际折行高度"：框留白过大时，正文会与标题框区域重叠，
      // 视觉上看不出、但版面检查会（也应该）报出来。
      cv.text(box.x, y, box.w, tH, c.title, {
        size: tSize, bold: true, color: isEm ? T.em : box.ink, lh: 1.16, minSize: TYPE.h3,
      });
      y += tH + 0.06;
    }
    if (c.body) {
      const rest = box.y + box.h - y;
      // 小格里只剩一条缝时不硬塞正文——那是布局该换，不是文字该挤
      if (rest >= 0.34) {
        cv.text(box.x, y, box.w, Math.min(rest, bodyH + 0.16), c.body, {
          size: bSize, color: box.body, lh: 1.34, minSize: TYPE.small,
        });
      } else if (!c.value) {
        // 有 value 的格子（KPI 卡）省略正文是设计意图：大数字 + 标题本身就是完整单元。
        // 没有 value 的格子丢正文才是问题——那说明文案该压，或者该换版式。
        cv.warn('CARD-DENSE', `第 ${i + 1} 格正文放不下，已省略（请压缩文字或换版式）`);
      }
    }
    // 没有小标的卡：右上角补一枚编号。四张卡里每张只有两行字时，卡面的右上角
    // 是大片空白又没有任何信息——编号是最便宜也最不抢的"锚"。
    if (!useLabel) {
      // 实底圆徽章：主色底 + 纸白数字。之前是右上角一颗小金数字，分量不够，
      // 一排白卡仍然"个个长得一样"——实底形状才能形成视线锚点。
      const d = 0.34;
      const bx = box.x + box.w - d - 0.04;
      const by = box.y + 0.06;
      cv.circle(bx + d / 2, by + d / 2, d, { fill: isEm ? T.primary : T.accent, name: 'aux.bento.badge' });
      cv.text(bx, by + 0.005, d, d - 0.01, String(i + 1), {
        size: TYPE.small, bold: true,
        color: isEm ? T.bg : (T.accentInk || T.deep), align: 'center', valign: 'middle',
        shrink: false, font: T.fonts.title, name: 'aux.bento.no', margin: 0,
      });
    }

    // 卡片底部收口：把"内容没写满"变成"内容写完了"。它同时给同页所有卡片
    // 一条共用的基线——一排卡片底部都有一道金线时，版面才像"排过的"。
    // 只有内容排完后仍剩 0.44in 以上才画，否则会和正文贴脸。
    if (box.y + box.h - (y + bodyH) > 0.44) {
      cv.rect(box.x, box.y + box.h - 0.26, 0.52, 0.026, { fill: T.accent, name: 'grad.gold' });
    }
  });

  if (page.insight) insightBar(cv, 6.00, page.insight, { size: TYPE.body, h: 0.86 });
  footer(cv, page, deck);
}

module.exports = { bento };
