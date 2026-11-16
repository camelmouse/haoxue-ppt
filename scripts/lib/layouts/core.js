// 整页版式：封面、目录、章节分隔、总结
const { MX, CW, RIGHT, BOTTOM, header, footer, insightBar } = require('./common');
const { fitText, blockHeight, wrapText } = require('../measure');
const { RADIUS, TYPE, SPACE } = require('../design');
const { tabsAvailable } = require('../nav');

// 01 封面
function cover(cv, page, deck) {
  const T = cv.T;
  // 底色不是一块死色：对角渐变让深色有"方向"，再叠一层柔光当光源。
  // 纯色 + 一个大面积空白，就是"看着像没做完"的根源。
  cv.rect(0, 0, 13.333, 7.5, { fill: T.deep, name: 'grad.diag' });
  cv.hairGrid(9.30, 1.02, 3.20, 3.95, { cols: 4, color: T.deepEdge, alpha: 13 });

  // 右侧同心圆环：给版面一个重心。环用"线"而不是"面"，才不抢标题。
  cv.circle(12.55, 6.95, 5.2, { line: T.deepEdge, lw: 1.0, name: 'decor.ring.lg' });
  cv.circle(12.55, 6.95, 3.05, { line: T.deepEdge, lw: 1.0, name: 'decor.ring.sm' });

  const meta = deck.meta || {};
  const kicker = [meta.course, meta.lesson].filter(Boolean).join(' · ');
  // kicker 的钉：金色小方块 + 字距拉开的小字，与内容页页头同一套语言
  cv.rect(MX, 1.26, 0.13, 0.13, { fill: T.accent, name: 'decor.kicker.mark' });
  cv.kicker(MX + 0.26, 1.16, 8.2, kicker || '课程', { color: T.deepMuted, size: TYPE.small, tracking: 3 });

  const title = page.title || meta.title || '';
  const tw = 8.30;
  const fitted = fitText(title, tw, 2.30, { max: page.size || TYPE.display, min: TYPE.h1 });
  const th = (fitted.lines.length * fitted.size * 1.26) / 72;

  // 右侧副栏：一条细分栏线 + 标题首字的暗纹水印。
  // 深底大片空白靠"内容"填是错的（封面没那么多话要说），靠"肌理"填才是对的：
  // 暗纹只提供质感，不提供信息，字号再大也不会和标题抢。
  const splitX = 8.62;
  cv.rect(splitX, 1.10, 0.010, 3.86, { fill: T.deepEdge, name: 'decor.cover.split' });
  cv.rect(splitX - 0.05, 1.10, 0.12, 0.030, { fill: T.accent, name: 'grad.gold' });
  if (title) {
    cv.watermark(splitX + 0.12, 0.46, 13.333 - splitX - 0.55, 4.42, title.slice(0, 1), {
      size: 320, transparency: 93, align: 'center', valign: 'middle', color: T.deepInk,
    });
  }

  cv.text(MX, 1.62, tw, th + 0.12, title, { size: fitted.size, bold: true, color: T.deepInk, lh: 1.06, shrink: false, minSize: TYPE.h1 });

  // 标题下的"金线接灰线"：金色标结构、灰色标页边——一条短线引向一条更淡的长线，
  // 比一根等粗的横线更像"排版"而不是"下划线"。
  let y = 1.62 + th + 0.26;
  cv.rule(MX, y, 1.05, { h: 0.035 });
  cv.rect(MX + 1.15, y + 0.012, 4.6, 0.012, { fill: T.deepEdge, name: 'decor.lead.line' });
  y += 0.36;
  if (page.subtitle) {
    const lines = wrapText(page.subtitle, TYPE.body, 8.3);
    const sh = Math.max(0.36, blockHeight(lines, TYPE.body, 1.4));
    cv.text(MX, y, 8.3, sh, page.subtitle, { size: TYPE.body, color: T.deepMuted, lh: 1.4, minSize: TYPE.body });
  }

  // 章节目录条：让封面本身承载"今天走哪几条路"。
  // 深底上不做投影（看不见还会脏），改用"浅色玻璃卡 + 顶部金线"表达层次。
  // 6 章时槽宽仍有 1.8in，序号 + 两字短名放得下；再多就不硬排。
  const chapters = (deck.chapters || []).slice(0, 6);
  if (chapters.length) {
    const stripY = 5.24;
    const gap = 0.15;
    const slotW = (CW - gap * (chapters.length - 1)) / chapters.length;
    chapters.forEach((c, i) => {
      const x = MX + i * (slotW + gap);
      cv.rect(x, stripY, slotW, 1.00, { fill: T.deepAlt, radius: RADIUS.tag, name: 'grad.card' });
      // 顶部金线：整条卡片的"上沿"被点亮，像一本册子的分册书脊
      cv.rect(x + RADIUS.tag, stripY, slotW - RADIUS.tag * 2, 0.032, { fill: T.accent, name: 'grad.gold' });
      cv.text(x + 0.24, stripY, 0.62, 1.00, String(i + 1).padStart(2, '0'), {
        size: TYPE.h3, bold: true, color: T.accent, valign: 'middle', shrink: false, tracking: 1,
      });
      cv.text(x + 0.86, stripY, slotW - 1.12, 1.00, c.short || c.title || '', {
        size: TYPE.small, color: T.deepInk, valign: 'middle', lh: 1.2, minSize: TYPE.small,
      });
      // 右下角的"继续"箭头：极小的方向暗示，让一排卡片不是四个静止色块
      cv.text(x + slotW - 0.42, stripY, 0.26, 1.00, '›', {
        size: TYPE.h3, color: T.deepMuted, align: 'right', valign: 'middle', shrink: false, name: 'decor.chap.arrow',
      });
    });
  }

  // 底部信息行
  cv.rect(MX, 6.46, CW, 0.010, { fill: T.deepEdge, name: 'decor.meta.line' });
  const metas = page.meta || meta.meta || [];
  const items = (Array.isArray(metas) && metas.length ? metas : [meta.audience, meta.term]).filter(Boolean);
  cv.text(MX, 6.58, 8.6, 0.32, items.join('　·　'), { size: TYPE.small, color: T.deepMuted, shrink: false, name: 'meta.cover' });
  if (meta.institution) {
    cv.text(RIGHT - 3.4, 6.58, 3.4, 0.32, meta.institution, { size: TYPE.small, color: T.deepMuted, align: 'right', shrink: false, name: 'meta.cover' });
  }
}

// 02 目录：左侧一列浮起的大卡（行内分割线），右侧数据栏直接排在底色上
function agenda(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const items = page.items || [];
  const n = items.length || 1;
  const listW = 7.62;
  const cardH = Math.min(4.72, 6.40 - top);
  const pad = 0.30;
  cv.card(MX, top, listW, cardH, { pad, name: 'agenda.list', accent: T.accent, accentSide: 'left' });

  const rowH = (cardH - pad * 2) / n;
  // 章节数不定：6 段时 rowH 只有 0.63in，硬塞"26pt 标题 + 16pt 说明"会压到下一行。
  // 按行高降档——每行都放得下 title(0.46) + desc(0.34) 才排 desc，否则只排标题。
  const tSize = rowH >= 0.98 ? TYPE.h2 : TYPE.h3;
  // 框高按"一行文字的实测行高"给：21pt 在 1.32 行距下要 0.39in，给 0.38 会被判溢出
  const tH = tSize === TYPE.h2 ? 0.50 : 0.42;
  const descH = 0.30;
  const withDesc = rowH >= tH + descH + 0.02;
  items.forEach((it, i) => {
    const y = top + pad + i * rowH;
    const blockH = tH + (withDesc && it.desc ? descH : 0);
    const by = y + (rowH - blockH) / 2;
    cv.text(MX + pad, y, 1.0, rowH, String(i + 1).padStart(2, '0'), {
      size: tSize === TYPE.h2 ? TYPE.h1 : TYPE.h2, bold: true, color: i === 0 ? T.accentText : T.muted, valign: 'middle', shrink: false,
    });
    cv.text(MX + pad + 1.02, by, listW - pad * 2 - 1.6, tH, it.title || '', {
      size: tSize, bold: true, color: T.ink, lh: 1.06, shrink: false, minSize: TYPE.h3, valign: 'middle',
    });
    if (it.desc && withDesc) {
      cv.text(MX + pad + 1.02, by + tH, listW - pad * 2 - 1.7, descH, it.desc, {
        size: TYPE.small, color: T.muted, shrink: false, minSize: TYPE.small,
      });
    }
    if (it.minutes) {
      cv.text(MX + listW - pad - 1.0, y + 0.08, 1.0, 0.34, it.minutes, {
        size: TYPE.small, color: T.muted, align: 'right', shrink: false,
      });
    }
    if (i < n - 1) cv.line(MX + pad, y + rowH - 0.02, MX + listW - pad, y + rowH - 0.02, { color: T.line, width: 0.9 });
  });

  // 右侧信息栏：与左侧卡片同高，三组数据均分，底部与卡片下沿对齐
  const rx = MX + listW + 0.52;
  const rw = RIGHT - rx;
  cv.kicker(rx, top + 0.02, rw, page.asideTitle || '本讲结构', { color: T.muted, size: TYPE.small, tracking: 1.6 });
  const stats = (page.stats || []).slice(0, 3);
  const statsTop = top + 0.56;
  const step = stats.length ? (top + cardH - statsTop) / stats.length : 1.4;
  stats.forEach((s, i) => {
    const y = statsTop + i * step;
    // 分隔线放在每组数据的"上方"，而不是下方：下方那一格是说明文字，
    // 线压进文字 1/3 处会被读成"删除线"（第一版就是这样翻车的）。
    // 这里原来有一组横线分隔三组数据，但行距只有 1.39in，"数值 + 金线 + 说明"
    // 之后剩下的缝隙不足以再放一条线——线必然压进说明文字。改用留白分组。
    cv.text(rx, y, rw, 0.82, s.value, { size: 42, bold: true, color: i === 0 ? T.accentText : T.primary, shrink: false, font: T.fonts.title });
    // 数值下的短金线：给每个数字一个"落脚点"，否则三个大数字会各自漂浮
    cv.rect(rx, y + 0.78, 0.46, 0.026, { fill: T.accent, name: 'grad.gold' });
    cv.text(rx, y + 0.84, rw, 0.50, s.label, { size: TYPE.small, color: T.muted, lh: 1.25, shrink: false, minSize: TYPE.small });
  });
  footer(cv, page, deck);
}

// 03 章节分隔
function divider(cv, page, deck) {
  const T = cv.T;
  cv.rect(0, 0, 13.333, 7.5, { fill: T.deep, name: 'grad.diag' });
  cv.hairGrid(9.75, 1.42, 2.75, 4.05, { cols: 4, alpha: 13 });

  const num = String(page.num || '').padStart(2, '0');
  // 巨型序号：右下角一个近透明的同款数字，做"前后两层"的景深；
  // 只有一层数字时，页面会显得只有一个孤零零的符号。
  cv.watermark(7.30, 3.55, 5.05, 3.10, num, { size: 240, transparency: 96, align: 'right', valign: 'bottom' });

  // 序号左侧的细金竖条：把 96pt 数字"钉"在版面上，而不是漂着
  cv.rect(MX - 0.30, 1.42, 0.05, 1.62, { fill: T.accent, name: 'grad.goldv' });
  cv.text(MX, 1.24, 3.4, 1.95, num, { size: 96, bold: true, color: T.accent, shrink: false, font: T.fonts.title });
  cv.text(MX, 3.02, 9.4, 0.95, page.title || '', { size: TYPE.h1, bold: true, color: T.deepInk, lh: 1.12, shrink: false, minSize: TYPE.h2 });
  if (page.desc) {
    cv.text(MX, 4.16, 8.6, 1.2, page.desc, { size: TYPE.body, color: T.deepMuted, lh: 1.45, minSize: TYPE.body });
  }
  cv.rule(MX, 5.62, 3.2, { h: 0.035 });
  if (page.pages) {
    cv.text(MX, 5.82, 6.0, 0.34, page.pages, { size: TYPE.small, color: T.deepMuted, shrink: false });
  }
  // 右侧细竖线 + 端点金点，呼应封面的同心圆
  cv.rect(RIGHT - 0.02, 1.42, 0.012, 4.20, { fill: T.deepEdge, name: 'decor.divider.rule' });
  cv.circle(RIGHT - 0.014, 1.42, 0.16, { fill: T.accent });
  cv.circle(RIGHT - 0.014, 5.62, 0.09, { line: T.accent, lw: 1 });
}

// 04 极简总结：三条要点做成深底上的"玻璃条"，比纯文字列表更有实体感
function summary(cv, page, deck) {
  const T = cv.T;
  cv.rect(0, 0, 13.333, 7.5, { fill: T.deep, name: 'grad.diag' });
  cv.hairGrid(9.90, 0.90, 2.60, 3.30, { cols: 3, alpha: 13 });
  // 深色页也画导航；胶囊模式下标题整体下移，避免与胶囊底边相切
  const shift = (deck.meta && deck.meta.nav === 'tabs' && tabsAvailable(deck)) ? 0.12 : 0;
  cv.rect(MX, 0.74 + shift, 0.13, 0.13, { fill: T.accent, name: 'decor.kicker.mark' });
  cv.kicker(MX + 0.26, 0.64 + shift, 6.0, page.kicker || '本讲小结', { color: T.accentOnDeep, size: TYPE.small, tracking: 3 });
  cv.text(MX, 0.98 + shift, 9.6, 0.80, page.title || '记住这三件事', {
    size: TYPE.h1, bold: true, color: T.deepInk, shrink: false, minSize: TYPE.h2, font: T.fonts.title,
  });
  cv.rule(MX, 1.86 + shift, 1.15, { h: 0.032 });

  const points = page.points || [];
  const top = 2.16 + shift;
  const step = points.length ? Math.min(1.40, (6.06 - top) / points.length) : 1.3;
  const cardH = step - 0.18;
  points.forEach((p, i) => {
    const y = top + i * step;
    cv.rect(MX, y, CW, cardH, { fill: T.deepAlt, radius: RADIUS.card, name: 'grad.card' });
    // 左侧金竖条：三条卡片的"装订边"，把散落的行连成一列
    cv.rect(MX + 0.02, y + 0.12, 0.06, cardH - 0.24, { fill: T.accent, name: 'grad.goldv' });
    cv.text(MX + 0.34, y, 0.9, cardH, String(i + 1).padStart(2, '0'), {
      size: TYPE.h3, bold: true, color: T.accent, valign: 'middle', shrink: false,
    });
    cv.text(MX + 1.18, y + 0.10, 4.0, cardH - 0.20, p.title, {
      size: TYPE.h3, bold: true, color: T.deepInk, shrink: false, minSize: TYPE.h3, lh: 1.15, valign: 'middle',
    });
    if (p.body) {
      cv.text(MX + 5.30, y + 0.10, CW - 5.70, cardH - 0.20, p.body, {
        size: TYPE.small, color: T.deepMuted, lh: 1.3, shrink: false, minSize: TYPE.small, valign: 'middle',
      });
    }
  });

  if (page.next) {
    cv.rule(MX, 6.46, 1.0, { h: 0.030 });
    cv.text(MX + 1.2, 6.30, 9.4, 0.40, page.next, { size: TYPE.small, color: T.deepMuted, shrink: false, minSize: TYPE.small });
  }
  if (page.note) {
    cv.text(RIGHT - 3.0, 6.30, 3.0, 0.40, page.note, { size: TYPE.small, color: T.deepMuted, align: 'right', shrink: false });
  }
}

module.exports = { cover, agenda, divider, summary };
