// 结构型版式：分层、流程、时间轴、因果链、矩阵
const { MX, CW, RIGHT, header, footer, insightBar } = require('./common');
const { mix } = require('../color');
const { RADIUS, SPACE, TYPE } = require('../design');
const { wrapText, blockHeight } = require('../measure');

// 07 结构分层：每层一张浮起的卡片，层级靠"堆叠顺序 + 左侧色条"表达
function layers(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const items = page.layers || [];
  const n = items.length || 1;
  const bottom = page.insight ? 5.80 : 6.36;
  // 间距必须明显大于卡片内部行距，否则四张卡会"连成一条白带"，层次反而消失
  const gap = 0.28;
  const bandH = Math.min(1.22, (bottom - top - gap * (n - 1)) / n);
  const marks = [T.primary, T.accent];

  items.forEach((it, i) => {
    const y = top + i * (bandH + gap);
    const midY = y + bandH / 2;
    cv.card(MX, y, CW, bandH, {
      // 同一组层级用同一种纸：原来"首层浅蓝、偶数白、奇数浅灰"的斑马底
      // 会让人以为是三类不同的东西。层级只由左侧色条和位置表达。
      fill: T.surface,
      accent: marks[i % 2],
      pad: 0.24,
      name: `layer.${i + 1}`,
    });
    const hasIcon = it.icon && cv.ctx.icons && cv.ctx.icons.has(it.icon);
    if (hasIcon) cv.icon(it.icon, MX + 0.30, midY - 0.19, 0.38, { color: T.primaryText });
    cv.text(MX + (hasIcon ? 0.80 : 0.36), y, 0.80, bandH, it.label || `L${i + 1}`, {
      size: TYPE.small, bold: true, color: i === 0 ? T.primaryText : T.muted, valign: 'middle', shrink: false, tracking: 1,
    });
    // 标题与左侧小标之间留 0.19in：原起点 1.02 与 0.80 宽的小标框正好相切，
    // 「决策层机构负责人」会读成连在一起的一句话。
    cv.text(MX + (hasIcon ? 1.50 : 1.22), y + 0.10, 3.68, bandH - 0.20, it.title || '', {
      size: TYPE.h3, bold: true, color: T.ink, valign: 'middle', lh: 1.12, minSize: TYPE.body,
    });
    cv.text(MX + 5.02, y + 0.10, CW - 5.46, bandH - 0.20, it.body || '', {
      size: TYPE.body, color: T.body, valign: 'middle', lh: 1.32, minSize: TYPE.small,
    });
  });

  if (page.insight) insightBar(cv, 6.04, page.insight, { size: TYPE.body, h: 0.84 });
  footer(cv, page, deck);
}

// 08 流程图（横向主干 + 节点）
function flow(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const steps = page.steps || [];
  const n = steps.length || 1;
  const axisY = top + (page.insight ? 0.98 : 1.14);
  const slot = CW / n;
  const firstCx = MX + slot / 2;
  const lastCx = MX + CW - slot / 2;

  cv.line(firstCx, axisY, lastCx + 0.14, axisY, { color: T.muted, width: 2.0, arrow: true });
  steps.forEach((s, i) => {
    const cx = MX + (i + 0.5) * slot;
    const isKey = !!s.key;
    cv.circle(cx, axisY, 0.90, {
      fill: isKey ? T.primary : T.surface,
      line: isKey ? null : T.primary,
      lw: 1.6,
      shadow: isKey ? 'md' : 'sm',
      name: `flow.node.${i + 1}`,
    });
    cv.text(cx - 0.45, axisY - 0.45, 0.90, 0.90, String(i + 1), {
      size: TYPE.h3, bold: true, color: isKey ? T.bg : T.primaryText, align: 'center', valign: 'middle', shrink: false,
    });
    const w = slot - 0.28;
    cv.text(cx - w / 2, axisY + 0.66, w, 0.44, s.title || '', {
      size: TYPE.h3, bold: true, color: T.ink, align: 'center', valign: 'top', lh: 1.12, minSize: TYPE.body,
    });
    if (s.body) {
      cv.text(cx - w / 2, axisY + 1.16, w, page.insight ? 1.18 : 1.44, s.body, {
        size: TYPE.small, color: T.muted, align: 'center', lh: 1.32, minSize: TYPE.small,
      });
      if (s.out) {
        cv.text(cx - w / 2, axisY + (page.insight ? 2.42 : 2.68), w, 0.34, `产出 · ${s.out}`, {
          size: TYPE.small, bold: true, color: T.accentText, align: 'center', shrink: false,
        });
      }
    }
  });

  if (page.insight) insightBar(cv, 6.00, page.insight, { size: TYPE.body, h: 0.86 });
  footer(cv, page, deck);
}

// 09 时间轴（上下交错，避免拥堵）
function timeline(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const nodes = page.nodes || [];
  const n = nodes.length || 1;
  // 轴线位置由"上下两排内容各需要多高"反推：固定 3.74 时下排正文会顶到底部结论条
  const axisY = top + (page.insight ? 1.72 : 1.88);
  const slot = CW / n;
  const upY = { label: -1.84, title: -1.46, body: -0.94 };
  const dnY = { label: 0.50, title: 0.88, body: 1.36 };

  cv.line(MX + 0.10, axisY, RIGHT - 0.14, axisY, { color: T.line, width: 1.8, arrow: true });

  nodes.forEach((nd, i) => {
    const cx = MX + (i + 0.5) * slot;
    const above = i % 2 === 0;
    cv.circle(cx, axisY, 0.34, { fill: T.bg, line: T.primary, lw: 1.8, name: `tl.node.${i + 1}` });
    cv.circle(cx, axisY, 0.15, { fill: i === 0 || i === n - 1 ? T.accent : T.primary });

    const w = slot - 0.14;
    const o = above ? upY : dnY;
    const dir = above ? -1 : 1;
    cv.line(cx, axisY + dir * 0.17, cx, axisY + dir * 0.46, { color: T.line, width: 1 });
    cv.text(cx - w / 2, axisY + o.label, w, 0.34, nd.label || '', { size: TYPE.small, bold: true, color: T.accentText, align: 'center', shrink: false });
    cv.text(cx - w / 2, axisY + o.title, w, 0.46, nd.title || '', { size: TYPE.h3, bold: true, color: T.ink, align: 'center', lh: 1.12, minSize: TYPE.body });
    if (nd.body) {
      cv.text(cx - w / 2, axisY + o.body, w, 0.82, nd.body, {
        size: TYPE.small, color: T.muted, align: 'center', lh: 1.30, minSize: TYPE.small,
      });
    }
  });

  if (page.insight) insightBar(cv, 6.02, page.insight, { size: TYPE.body, h: 0.86 });
  footer(cv, page, deck);
}

// 11 因果链：每一环都是一张卡片，最后一环（结果）用金色标记
function causalChain(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const nodes = page.nodes || [];
  const n = nodes.length || 1;
  const arrowW = 0.46;
  const nodeW = (CW - arrowW * (n - 1)) / n;
  const avail = (page.insight ? 5.92 : 6.40) - top;

  // 先量再画：卡片高度贴着内容走。原来的做法是先等分出 3.14in 的大框再把字塞进去，
  // 结果三张卡下半截各留一截白——看起来像"内容没写完"，而不是"留白"。
  const measured = nodes.map((nd) => {
    const tLines = wrapText(nd.title || '', TYPE.h3, nodeW - 0.44, { bold: true });
    const tH = Math.max(0.46, blockHeight(tLines, TYPE.h3, 1.14));
    const bLines = wrapText(nd.body || '', TYPE.body, nodeW - 0.44, {});
    const bH = blockHeight(bLines, TYPE.body, 1.36);
    return { tH, bH, blockH: 0.50 + tH + 0.14 + bH };
  });
  const maxBlock = Math.max(...measured.map((m) => m.blockH));
  const h = Math.min(avail, Math.max(maxBlock + 0.64, avail * 0.88));

  nodes.forEach((nd, i) => {
    const x = MX + i * (nodeW + arrowW);
    const last = i === n - 1;
    cv.card(x, top, nodeW, h, {
      fill: T.surface,
      accent: last ? T.accent : null,
      accentSide: 'top',
      pad: 0.22,
      name: `cause.${i + 1}`,
    });
    // 文字块在卡内垂直居中：三张卡等高、内容长短不一，靠"贴顶"排会让
    // 正文基线一张一个高度，读起来像三张不相干的卡。
    const { tH, blockH } = measured[i];
    const y0 = top + Math.max(0.18, (h - blockH) / 2);
    // 环节号做成一枚小 chip：卡片大、内容少时，卡里必须有一个"信息头"，
    // 否则上半截全是空的，读者找不到从哪里开始看。
    cv.chip(x + 0.20, y0 + 0.02, nd.label || `0${i + 1}`, { h: 0.32, maxW: nodeW - 0.44, tick: false });
    // 标题框按实际折行高度给，正文紧接其后：
    // 固定 1.50 的起点在"标题只有一行"时会在卡内留一条 0.5in 的空档，
    // 正文被推到卡片下半截，读起来像两张卡拼在一起。
    cv.text(x + 0.22, y0 + 0.50, nodeW - 0.44, tH, nd.title || '', {
      size: TYPE.h3, bold: true, color: T.ink, lh: 1.14, minSize: TYPE.body,
    });
    cv.text(x + 0.22, y0 + 0.50 + tH + 0.14, nodeW - 0.44, Math.max(0.60, measured[i].bH + 0.06), nd.body || '', {
      size: TYPE.body, color: T.body, lh: 1.36, minSize: TYPE.small,
    });
    // 卡底金线：一条卡内基线，把"内容写完了"和"还有空间"区分开
    cv.rect(x + 0.22, top + h - 0.24, 0.46, 0.026, { fill: T.accent, name: 'grad.gold' });
    if (!last) {
      // 箭头加粗、换成主色：浅灰 1.6pt 的线在暖白底上几乎看不见，
      // 而"因果"正是这一页最需要被看见的关系。
      cv.line(x + nodeW + 0.04, top + h / 2, x + nodeW + arrowW - 0.04, top + h / 2, {
        color: T.muted, width: 2.0, arrow: true,
      });
    }
  });

  if (page.insight) insightBar(cv, 6.00, page.insight, { size: TYPE.body, h: 0.86 });
  footer(cv, page, deck);
}

// 12 矩阵（四象限）：白底圆角面板 + 两个"高价值"象限的浅色块，
// 象限色块必须内缩，否则直角会顶出面板圆角，看起来像贴纸没对齐。
function matrix(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const mw = 7.70, mh = 3.62;
  const x0 = MX, y0 = top + 0.22;
  const cx = x0 + mw / 2, cy = y0 + mh / 2;
  const ins = 0.07;

  // 面板本身当一张卡片做：渐变 + 双层阴影，矩阵才有"贴在纸面上"的厚度
  cv.card(x0, y0, mw, mh, { pad: 0, radius: RADIUS.card, name: 'matrix.panel' });
  cv.rect(cx, y0 + ins, mw / 2 - ins, mh / 2 - ins, { fill: mix(T.bg, T.accent, 0.16), radius: 0.06, name: 'quad.tr' });
  cv.rect(x0 + ins, cy, mw / 2 - ins, mh / 2 - ins, { fill: mix(T.bg, T.primary, 0.05), radius: 0.06, name: 'quad.bl' });
  cv.line(cx, y0 + ins, cx, y0 + mh - ins, { color: T.line, width: 1 });
  cv.line(x0 + ins, cy, x0 + mw - ins, cy, { color: T.line, width: 1 });

  // 轴上只写"轴向 + 方向"：纵轴名贴左上角（高在顶），纵轴低端贴左下角，
  // 横轴范围写右下角。四个方向标记拆两行会读成一段乱码，压成两行才干净。
  const ax = page.axes || {};
  cv.text(x0, y0 - 0.42, 3.6, 0.34, ax.top || '', { size: TYPE.small, color: T.muted, shrink: false, name: 'axis.top' });
  cv.text(x0, y0 + mh + 0.10, 3.0, 0.34, ax.bottom || '', { size: TYPE.small, color: T.muted, shrink: false, name: 'axis.bottom' });
  cv.text(x0 + mw - 3.4, y0 + mh + 0.10, 3.4, 0.34, ax.right || '', { size: TYPE.small, color: T.muted, align: 'right', shrink: false, name: 'axis.right' });

  // 先算点的位置（象限名要避让它们），再画点：象限名固定贴角时，
  // 落在角上的热点标签一定会被压住——矩阵图的价值就在于"点落在哪个角"。
  const LW = 1.86;
  const pts = (page.points || []).map((p) => {
    const px = x0 + Math.min(0.97, Math.max(0.03, p.x)) * mw;
    const py = y0 + mh - Math.min(0.97, Math.max(0.03, p.y)) * mh;
    const flip = px > x0 + mw - LW - 0.30;
    const lx = flip ? px - LW - 0.18 : px + 0.16;
    return { p, px, py, flip, lx, box: { x: lx, y: py - 0.16, w: LW, h: 0.32 } };
  });
  const area = (a, b) => {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 0 && oy > 0 ? ox * oy : 0;
  };
  // 每个象限名有两个候选位：贴该象限的外角，或贴中心十字的内角。
  // 选"与所有点标签重叠面积最小"的那个——数据在哪个角，名字就自动让到另一边。
  const qW = mw * 0.44, qH = 0.34;
  (page.quadrants || []).forEach((q) => {
    const xL = x0 + 0.26;
    const xR = cx + 0.20;
    const cands = q.y > 0.5
      ? [y0 + 0.16, cy - 0.44]
      : [y0 + mh - 0.50, cy + 0.12];
    let best = { x: q.x > 0.5 ? xR : xL, y: cands[0] }, bestScore = Infinity;
    cands.forEach((cyy) => {
      const x = q.x > 0.5 ? xR : xL;
      const box = { x, y: cyy, w: qW, h: qH };
      const inside = (cyy >= y0 + 0.06 && cyy + qH <= y0 + mh - 0.06) ? 0 : 1e6;
      const score = inside + pts.reduce((acc, t) => acc + area(box, t.box), 0);
      if (score < bestScore) { bestScore = score; best = { x, y: cyy }; }
    });
    cv.text(best.x, best.y, qW, qH, q.text, {
      size: TYPE.small, color: mix(T.muted, T.ink, 0.25), tracking: 0.6, shrink: false, bold: true,
    });
  });

  pts.forEach(({ p, px, py, flip, lx }) => {
    const col = p.hi ? T.accent : T.primary;
    cv.circle(px, py, p.hi ? 0.34 : 0.26, { fill: col, shadow: p.hi ? 'md' : 'sm' });
    // 靠右边界时标签翻到点的左侧，避免伸出面板压到右侧解读栏。
    // 标签宽 1.86in 是按 16pt 下 7 个汉字算的——1.40in 只够 5 个字，"突发医疗安全事件"会被截。
    cv.text(lx, py - 0.16, LW, 0.32, p.label || '', {
      size: TYPE.small, bold: true, color: T.ink, shrink: false, align: flip ? 'right' : 'left',
    });
  });

  // 右侧解读
  const rx = x0 + mw + 0.54;
  const rw = RIGHT - rx;
  cv.kicker(rx, top + 0.22, rw, page.asideTitle || '怎么读这张图', { color: T.accentText, size: TYPE.small, tracking: 1.4 });
  const asides = page.aside || [];
  const slot = asides.length ? (6.24 - (top + 0.72)) / asides.length : 1.2;
  asides.forEach((t, i) => {
    const y = top + 0.72 + i * slot;
    cv.text(rx, y, 0.46, 0.34, `0${i + 1}`, { size: TYPE.small, bold: true, color: T.muted, shrink: false });
    cv.text(rx + 0.48, y - 0.02, rw - 0.52, Math.max(0.60, slot - 0.10), t, { size: TYPE.small, color: T.body, lh: 1.34, minSize: TYPE.small });
  });
  footer(cv, page, deck);
}

module.exports = { layers, flow, timeline, causalChain, matrix };
