// 文本主导版式：大字观点、互动问题、双方观点对照
const { MX, CW, RIGHT, header, footer, insightBar } = require('./common');
const { fitText, textWidth, blockHeight, wrapText, stepDown } = require('../measure');
const { RADIUS, SPACE, TYPE } = require('../design');
const { mix } = require('../color');

// 把文本按关键词切成富文本 runs（关键词用强调色）
function highlightRuns(text, marks, color) {
  const keys = (Array.isArray(marks) ? marks : [marks]).filter(Boolean);
  if (!keys.length) return text;
  const pattern = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return String(text).split(pattern).filter((s) => s !== '').map((s) => ({
    text: s,
    color: keys.includes(s) ? color : undefined,
    bold: keys.includes(s) ? true : undefined,
  }));
}

// 05 大字观点：一页只说一句话，靠字号和留白撑住，不靠装饰
function bigIdea(cv, page, deck) {
  const T = cv.T;
  if (page.kicker) {
    cv.rect(MX, 1.08, 0.13, 0.13, { fill: T.accent, name: 'decor.kicker.mark' });
    cv.kicker(MX + 0.26, 0.98, 7.4, page.kicker, { size: TYPE.small });
  }

  const runs = page.runs || null;
  const plainRaw = runs ? runs.map((r) => r.text).join('') : (page.text || '');
  const boxW = 10.55;
  const maxSize = page.size || TYPE.display;

  // 长句只在标点处断行。中文按宽度硬折会把词拆到两行（"…可以决 / 定。"），
  // 这是投影上最刺眼的一种排版错误——一句话被切成两个半截词。
  let plain = plainRaw;
  let sizeCap = maxSize;
  if (!runs) {
    const segs = plainRaw.split(/(?<=[，。；：！？])/).filter((s) => s !== '');
    if (segs.length > 1 && (textWidth(plainRaw, maxSize) / 72) > boxW) {
      while (sizeCap > TYPE.h2) {
        const widest = Math.max(...segs.map((s) => textWidth(s, sizeCap) / 72));
        if (widest <= boxW) break;
        sizeCap = stepDown(sizeCap) || TYPE.h2;
      }
      plain = segs.join('\n');
    }
  }

  const content = runs || (page.highlight ? highlightRuns(plain, page.highlight, T.accentText) : plain);
  const multiline = plain.includes('\n');
  const fitted = multiline
    ? { size: sizeCap, lines: plain.split('\n') }
    : fitText(plain, boxW, 3.30, { max: sizeCap, min: TYPE.h2 });
  const h = blockHeight(fitted.lines, fitted.size, 1.18);
  // 文字块在"标题下沿—出处行上沿"之间垂直居中：一句话页面如果死贴顶部，
  // 下半页会塌成一块空场；居中后上下留白对称，才读得成"一页就是这一句"。
  const y = 1.80 + Math.max(0, (5.94 - 1.80 - h) / 2 - 0.10);
  cv.text(MX, y, boxW, h + 0.20, content, {
    size: fitted.size, bold: true, color: T.ink, lh: 1.18, shrink: false, minSize: TYPE.h2,
  });
  // 左侧细竖线（装饰，允许越过左侧安全边距）
  cv.rect(MX - 0.46, y + 0.08, 0.06, Math.max(0.9, h), { fill: T.accent, name: 'decor.idea.rule' });

  if (page.source) {
    // 出处不写成一行灰字：金块 + 金线 + 文字，和大字页的"一句话"形成稳定的一行
    cv.rect(MX, 6.30, 0.13, 0.13, { fill: T.accent, name: 'decor.source.mark' });
    cv.text(MX + 0.30, 6.16, 9.4, 0.40, page.source, { size: TYPE.small, color: T.muted, shrink: false, minSize: TYPE.small });
  }
  footer(cv, page, deck);
}

// 10 互动问题（选择/判断）：选项做成浮起的卡片，答案用强调色描边而不是整块铺底
function question(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const opts = page.options || [];
  const two = opts.length > 3;
  const cols = two ? 2 : 1;
  const rows = Math.ceil(opts.length / cols);
  const gapX = 0.34;
  const gapY = 0.22;
  const colW = (CW - gapX * (cols - 1)) / cols;
  const avail = 6.18 - top - (page.hint ? 0.56 : 0);
  const rowH = Math.min(1.42, (avail - gapY * (rows - 1)) / rows);
  const blockTop = top + Math.max(0, (avail - (rowH * rows + gapY * (rows - 1))) / 2);


  opts.forEach((o, i) => {
    const col = two ? i % 2 : 0;
    const row = two ? Math.floor(i / 2) : i;
    const x = MX + col * (colW + gapX);
    const y = blockTop + row * (rowH + gapY);
    const isAns = !!o.ans;

    // 选项本体就是卡片：正确答案整块换成深色"重点卡"，一眼看出"答案浮起来了"。
    // 用深底而不是浅橙底——浅橙在暖白纸上会发灰，读起来像"选中态"而不是"答案"。
    cv.card(x, y, colW, rowH, {
      fill: isAns ? T.deep : T.surface,
      line: isAns ? mix(T.deep, T.accent, 0.34) : undefined,
      lw: isAns ? 1.1 : 0.9,
      pad: 0.24,
      name: `opt.${i}`,
    });
    const midY = y + rowH / 2;
    // 字母徽章：深圆 + 细金环。原来那个浅灰圆在暖白卡上几乎没有存在感，
    // 加一圈金环后它才成为"选项的把手"，视线有落点。
    if (!isAns) {
      cv.circle(x + 0.45, midY, 0.58, { line: mix(T.accent, T.surface, 0.55), lw: 1.1, name: `opt.${i}.ring` });
    }
    cv.circle(x + 0.45, midY, isAns ? 0.50 : 0.44, {
      fill: isAns ? T.accent : T.deep,
      name: `opt.${i}.badge`,
    });
    cv.text(x + 0.45 - 0.25, midY - 0.25, 0.50, 0.50, String.fromCharCode(65 + i), {
      size: TYPE.small, bold: true, color: isAns ? T.accentInk : T.deepInk, align: 'center', valign: 'middle', shrink: false,
    });
    const textX = x + 0.90;
    const textW = colW - 0.90 - (isAns ? 1.74 : 0.26);
    cv.text(textX, y, textW, rowH, o.text || '', {
      size: isAns ? TYPE.h3 : TYPE.body, color: isAns ? T.deepInk : T.body, valign: 'middle', lh: 1.24,
      minSize: TYPE.small, bold: isAns,
    });
    if (isAns) {
      cv.text(x + colW - 1.68, midY - 0.20, 1.44, 0.40, '✓ 正确答案', {
        size: TYPE.small, bold: true, color: T.accentOnDeep, align: 'right', shrink: false,
      });
    }
  });

  // 提示与计时器同一行：计时器放标题右侧会压住右上角的选项卡片
  if (page.hint) {
    cv.text(MX, 6.24, CW - (page.timer ? 3.0 : 0), 0.40, page.hint, { size: TYPE.small, color: T.muted, shrink: false, minSize: TYPE.small });
  }
  if (page.timer) {
    cv.text(RIGHT - 3.0, 6.24, 3.0, 0.40, page.timer, {
      size: TYPE.small, bold: true, color: T.accentText, align: 'right', shrink: false,
    });
  }
  footer(cv, page, deck);
}

// 06 双方观点对照
function debate(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const colW = 5.16;
  const leftX = MX;
  const rightX = RIGHT - colW;
  const midX = (leftX + colW + rightX) / 2;

  // 中轴线 + 对照标记（实心浅底比"空心圈+灰字"更明确）
  cv.line(midX, top + 0.78, midX, 5.86, { color: T.line, width: 1 });
  cv.circle(midX, top + 0.40, 0.80, { fill: T.primarySoft, name: 'decor.vs' });
  cv.text(midX - 0.40, top + 0.08, 0.80, 0.64, page.vs || '对照', {
    size: TYPE.small, bold: true, color: T.primaryText, align: 'center', valign: 'middle', shrink: false,
  });

  const side = (data, x, color, tag) => {
    if (!data) return;
    cv.kicker(x, top, colW, data.tag || tag, { color, size: TYPE.small, tracking: 2 });
    cv.text(x, top + 0.38, colW, 0.86, data.title || '', {
      size: TYPE.h2, bold: true, color: T.ink, lh: 1.18, shrink: false, minSize: TYPE.h3,
    });
    // 观点条数不定：按剩余高度均分，4 条时不会撞到底部结论条
    const ps = data.points || [];
    const pTop = top + 1.26;
    const pSlot = ps.length ? (5.80 - pTop) / ps.length : 1;
    ps.forEach((p, i) => {
      const y = pTop + i * pSlot;
      cv.rect(x, y + 0.14, 0.14, 0.14, { fill: color });
      cv.text(x + 0.34, y, colW - 0.30, Math.max(0.60, pSlot - 0.08), p, {
        size: TYPE.body, color: T.body, lh: 1.35, shrink: false, minSize: TYPE.small,
      });
    });
  };
  side(page.left, leftX, T.primary, '观点 A');
  side(page.right, rightX, T.accentText, '观点 B');

  if (page.verdict) insightBar(cv, 6.02, page.verdict, { size: TYPE.body, h: 0.86 });
  footer(cv, page, deck);
}

module.exports = { bigIdea, question, debate };
