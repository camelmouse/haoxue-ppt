// 媒体型版式：全幅图片、错位图文、局部放大、案例叙事
const { MX, CW, RIGHT, header, footer, insightBar, imageOrVector } = require('./common');
const { RADIUS, TYPE, SPACE } = require('../design');
const { mix } = require('../color');
const { wrapText, blockHeight } = require('../measure');

// 把"原图归一化裁切框"换算到"画框内坐标"（cover 模式会裁掉多余边，必须补偿）
function frameRect(rect, frameW, frameH, imgAspect) {
  if (!rect) return null;
  const frameAspect = frameW / frameH;
  let kx = 1, ky = 1, ox = 0, oy = 0;
  if (imgAspect >= frameAspect) {
    kx = frameAspect / imgAspect;      // 横向只露出 kx 比例
    ox = (1 - kx) / 2;
  } else {
    ky = imgAspect / frameAspect;      // 纵向只露出 ky 比例
    oy = (1 - ky) / 2;
  }
  return {
    x: ((rect.x0 - ox) / kx) * frameW,
    y: ((rect.y0 - oy) / ky) * frameH,
    w: (rect.wf / kx) * frameW,
    h: (rect.hf / ky) * frameH,
  };
}

// 图片衬底：白卡比图大一圈，形成"相框"。图片本身是直角，卡片是圆角，
// 这比给图片加圆角简单，也比裸图贴页更有实体感。
function framedImage(cv, x, y, w, h, src, o = {}) {
  const T = cv.T;
  const pad = o.pad === undefined ? 0.16 : o.pad;
  cv.card(x - pad, y - pad, w + pad * 2, h + pad * 2, { fill: T.surface, pad: 0, name: o.name || 'frame' });
  imageOrVector(cv, x, y, w, h, src, {
    label: o.label, caption: null, size: o.size, fit: o.fit,
  });
  return this;
}

// 13 全幅图片
function fullImage(cv, page, deck) {
  const T = cv.T;
  cv.rect(0, 0, 13.333, 7.5, { fill: T.deep, name: 'bg' });
  if (page.image) {
    cv.image(0, 0, 13.333, 7.5, page.image, { fit: 'cover' });
  } else {
    imageOrVector(cv, 0, 0, 13.333, 7.5, null, { label: page.label || '全幅图', bg: T.deep, size: TYPE.display });
  }
  // 底部压暗：先做一段多级渐变过渡，再压实底，避免"两块硬边遮罩"留下一条横线
  cv.scrimFade(0, 2.56, 13.333, 1.40, T.deep, { from: 0.02, to: 0.90, steps: 12 });
  cv.rect(0, 3.94, 13.333, 3.56, { fill: T.deep, fillTransparency: 10, name: 'scrim.solid' });

  // 文字全部落进遮罩里：kicker 压在亮图上会糊成一片，字号再大也读不出来
  const kickerY = 4.02;
  if (page.kicker) {
    cv.kicker(MX, kickerY, 8.4, page.kicker, { color: mix(T.accent, 'FFFFFF', 0.34), size: TYPE.small, tracking: 2.4 });
  }
  const titleSize = page.size || TYPE.display;
  const titleY = kickerY + 0.40;
  const titleW = 10.4;
  const lines = wrapText(page.title || '', titleSize, titleW, { bold: true });
  cv.text(MX, titleY, titleW, Math.max(1.20, blockHeight(lines, titleSize, 1.14)), page.title || '', {
    size: titleSize, bold: true, color: T.deepInk, lh: 1.14, shrink: false, minSize: TYPE.h1, font: T.fonts.title,
  });
  if (page.line) {
    const lineY = Math.min(6.30, titleY + blockHeight(lines, titleSize, 1.14) + 0.26);
    cv.text(MX, lineY, 9.8, 0.90, page.line, { size: TYPE.body, color: T.deepMuted, lh: 1.40, minSize: TYPE.body });
  }
  if (page.credit) {
    cv.text(RIGHT - 3.6, 7.00, 3.6, 0.32, page.credit, { size: TYPE.small, color: T.deepMuted, align: 'right', shrink: false, name: 'credit.image' });
  }
}

// 14 左右错位图文
function offsetImageText(cv, page, deck) {
  const T = cv.T;
  const mirror = page.side === 'right';
  const top = header(cv, page, { size: TYPE.h1, width: mirror ? CW * 0.52 : CW });
  const imgW = 5.92;
  const imgX = mirror ? RIGHT - imgW : MX + 0.16;
  const imgY = Math.max(top + 0.06, 1.96);
  // 有统计块时图框要缩短：它必须落在图框正下方（数字压住图的左边界），
  // 而页脚之上只剩 1.2in——不缩图框，统计块就只能挤进右栏，把三个要点压成一团。
  const imgH = page.stat ? Math.min(3.74, Math.max(2.90, 5.68 - imgY)) : 3.74;
  const hasImg = page.image;
  framedImage(cv, imgX, imgY, imgW, imgH, page.image, {
    label: page.imageLabel || '示意图',
    size: TYPE.h2,
    name: 'frame.main',
  });
  // 图注与统计块抢同一块地方（图框下方 1.2in），二选一：有统计就只画统计。
  // 右栏要放 3 个要点，再挤一个 34pt 数字进去，每点之间的空隙就只剩 0.0x in 了。
  if (!hasImg && page.caption && !page.stat) {
    cv.text(imgX, imgY + imgH + 0.30, imgW, 0.30, page.caption, { size: TYPE.small, color: T.muted, shrink: false, name: 'caption' });
  }

  const tx = mirror ? MX : imgX + imgW + 0.72;
  const tw = mirror ? CW - imgW - 0.88 : RIGHT - tx;
  const { wrapText, blockHeight } = require('../measure');
  const pts = page.points || [];
  // 按条目数均分右栏高度：用累加 y 时，最后一条会被挤到页脚上（字号放大后必然发生）
  const areaTop = imgY - 0.08;
  const areaBot = 6.30;
  const slot = pts.length ? (areaBot - areaTop) / pts.length : 1;
  pts.forEach((p, i) => {
    const y = areaTop + i * slot;
    const inset = (p.icon && cv.ctx.icons && cv.ctx.icons.has(p.icon)) ? 0.46 : 0;
    const tLines = wrapText(p.title || '', TYPE.h3, tw - inset, { bold: true });
    const tH = Math.max(0.40, blockHeight(tLines, TYPE.h3, 1.12));
    // 每点在自己的 slot 里垂直居中：均分后各点高度不一，顶对齐会让段间忽宽忽窄
    const bLines = p.body ? wrapText(p.body, TYPE.small, tw) : [];
    const bH = blockHeight(bLines, TYPE.small, 1.28);
    // 正文框比正文多留 0.04：不留就会出现"框已经到底、字还往下溢"的重叠
    const totalH = tH + (p.body ? 0.12 + bH : 0);
    const y0 = y + Math.max(0, (slot - totalH) / 2);
    if (inset) cv.icon(p.icon, tx, y0 + 0.02, 0.34, { color: T.accentText });
    cv.text(tx + inset, y0, tw - inset, tH, p.title || '', {
      size: TYPE.h3, bold: true, color: T.ink, shrink: false, minSize: TYPE.body, lh: 1.12,
    });
    if (p.body) {
      // 三点均分时每点只有 ~0.8in 给正文，18pt 两行放不下，降到 16pt（仍在下限之上）
      cv.text(tx, y0 + tH + 0.08, tw, bH + 0.04, p.body, {
        size: TYPE.small, color: T.body, lh: 1.28, minSize: TYPE.small,
      });
    }
  });

  // 统计块落在图框正下方：数字压在图的左边缘上，和图的左边界对齐
  if (page.stat) {
    const sy = imgY + imgH + 0.26;
    cv.line(imgX, sy, imgX + 0.72, sy, { color: T.accent, width: 2 });
    cv.text(imgX, sy + 0.10, 1.5, 0.64, page.stat.value, { size: 34, bold: true, color: T.accentText, shrink: false, font: T.fonts.title });
    cv.text(imgX + 1.58, sy + 0.12, imgW - 1.58, 0.78, page.stat.label, { size: TYPE.small, color: T.muted, lh: 1.30, shrink: false, minSize: TYPE.small, name: 'note.stat' });
  }
  footer(cv, page, deck);
}

// 15 局部放大解释
function zoom(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const imgW = 7.42, imgH = 4.06;
  const imgX = MX + 0.14, imgY = Math.max(top + 0.04, 1.98);
  framedImage(cv, imgX, imgY, imgW, imgH, page.image, { label: page.imageLabel || '示意图', name: 'frame.zoom' });

  const d = page.detail || {};
  const hx = d.x === undefined ? 0.62 : d.x;
  const hy = d.y === undefined ? 0.45 : d.y;
  const hr = d.r === undefined ? 0.16 : d.r;

  // 放大框 = 实际裁切区域，映射到画框内（cover 会裁掉多余部分，需换算）
  const rect = page._detailRect || { x0: hx - hr, y0: hy - hr, wf: hr * 2, hf: hr * 2 };
  const boxRect = frameRect(rect, imgW, imgH, page._detailAspect || imgW / imgH);
  if (boxRect) {
    cv.rect(imgX + boxRect.x, imgY + boxRect.y, boxRect.w, boxRect.h, {
      line: T.accent, lw: 2.4, radius: RADIUS.tag, name: 'decor.zoom.box',
    });
  }

  // 右侧放大图（同样衬底，和主图是"同一张纸上的两块"）
  const px = imgX + imgW + 0.62;
  const pw = RIGHT - px;
  if (page._detailPath || page.image) {
    framedImage(cv, px, imgY, pw, 2.28, page._detailPath || page.image, {
      label: '局部', pad: 0.12, name: 'frame.detail',
      fit: page._detailPath ? 'fill' : 'cover',
    });
  }
  cv.text(px, imgY + 2.46, pw, 0.34, d.title || '局部放大', { size: TYPE.small, bold: true, color: T.accentText, tracking: 1.4, shrink: false });

  // 右列只放两条说明：3 条 × 两行会顶到页脚，宁可少说一句
  const notes = (d.notes || []).slice(0, 2);
  if ((d.notes || []).length > 2) cv.warn('NOTE-CLIPPED', '局部说明只显示前 2 条（多出的请移进讲稿）');
  notes.forEach((nt, i) => {
    const y = imgY + 2.94 + i * 0.94;
    cv.text(px, y, 0.36, 0.30, `${i + 1}`, { size: TYPE.small, bold: true, color: T.muted, shrink: false });
    cv.text(px + 0.36, y - 0.02, pw - 0.40, 0.88, nt, { size: TYPE.small, color: T.body, lh: 1.30, minSize: TYPE.small });
  });
  footer(cv, page, deck);
}

// 16 案例叙事
function caseStory(cv, page, deck) {
  const T = cv.T;
  // 标题给足宽度：理论卡是从内容区顶部开始的，不占标题行，没必要把标题挤到折行
  // 标题行只在页头区间（面板从 y=1.9 才开始），可以比面板更宽：
  // 给 0.72·CW 时 14 字标题在部分渲染器上会被切掉末尾的标点。
  const top = header(cv, page, { size: TYPE.h1, width: CW * 0.88 });
  const leftW = 6.28;
  const rightX = MX + leftW + 0.56;
  const rightW = RIGHT - rightX;
  const panelY = top - 0.02;
  const panelH = 4.18;

  // 右：理论解释面板（浮起卡片，强调条叠在左沿）
  const box = cv.card(rightX, panelY, rightW, panelH, {
    fill: T.surface,
    accent: T.primary,
    accentSide: 'left',
    pad: 0.26,
    name: 'theory',
  });
  const th = page.theory || {};
  cv.text(box.x + 0.10, panelY + 0.26, box.w - 0.20, 0.34, th.tag || '理论解释', {
    size: TYPE.small, bold: true, color: T.primaryText, tracking: 1.6, shrink: false,
  });
  cv.text(box.x + 0.10, panelY + 0.64, box.w - 0.20, 0.82, th.title || '', {
    size: TYPE.h3, bold: true, color: T.ink, lh: 1.20, minSize: TYPE.body,
  });
  // 卡内最多两条机制说明：3 条 × 两行在 16pt 下需要 2.5in，会顶掉结论块。
  // 超出的条目由数据侧合并或改页，不在这里硬塞。
  const pts = (th.points || []).slice(0, 2);
  if ((th.points || []).length > 2) cv.warn('CARD-DENSE', `第${cv.ctx.pageNo}页 理论卡只显示前 2 条（共 ${th.points.length} 条）`);
  pts.forEach((p, i) => {
    const y = panelY + 1.46 + i * 0.92;
    cv.circle(box.x + 0.16, y + 0.16, 0.11, { fill: T.accent });
    cv.text(box.x + 0.38, y, box.w - 0.52, 0.86, p, { size: TYPE.small, color: T.body, lh: 1.40, minSize: TYPE.small });
  });
  // 结论就写在这张卡里：它本来就是"这个案例说明了什么"，拆到页脚再放一条全宽横条反而割裂
  if (page.takeaway) {
    const ty = panelY + panelH - 0.94;
    // 结论块做成深色：它在白卡里是"这一页的落点"，用浅米底压不住，
    // 而且浅米在暖白纸面上会显脏。深底 + 金色左钉，一眼就知道结论在哪。
    cv.rect(rightX + 0.18, ty, rightW - 0.36, 0.72, { fill: T.deep, radius: RADIUS.tag, name: 'case.takeaway' });
    cv.rect(rightX + 0.30, ty + 0.18, 0.05, 0.36, { fill: T.accent, name: 'grad.goldv' });
    cv.text(rightX + 0.46, ty, rightW - 0.86, 0.72, page.takeaway, {
      size: TYPE.small, bold: true, color: T.deepInk, valign: 'middle', lh: 1.3, minSize: TYPE.small,
    });
  }
  // 免责说明放在卡片正下方：卡内空间要留给"标题 + 两条机制 + 结论"
  if (th.note) {
    cv.text(rightX, panelY + panelH + 0.06, rightW, 0.32, th.note, {
      size: TYPE.small, color: T.muted, italic: true, shrink: false, name: 'note.theory',
    });
  }

  // 左：叙事幕（时间线感：细轴 + 节点 + 幕标）
  const acts = page.acts || [];
  const n = acts.length || 1;
  const step = Math.min(1.32, 4.18 / n);
  cv.line(MX + 0.08, top + 0.22, MX + 0.08, top + step * (n - 1) + 0.26, { color: T.lineSoft, width: 3.0 });
  acts.forEach((a, i) => {
    const y = top + i * step;
    cv.circle(MX + 0.08, y + 0.20, i === 0 ? 0.22 : 0.15, { fill: i === 0 ? T.accent : T.primary });
    cv.text(MX + 0.34, y, 1.05, 0.30, a.t || `第${i + 1}幕`, {
      size: TYPE.small, bold: true, color: T.muted, tracking: 0.8, shrink: false,
    });
    cv.text(MX + 1.42, y - 0.04, leftW - 1.46, Math.max(0.72, step - 0.10), a.text || '', {
      size: TYPE.body, color: T.body, lh: 1.40, minSize: TYPE.small,
    });
  });

  footer(cv, page, deck);
}

module.exports = { fullImage, offsetImageText, zoom, caseStory };
