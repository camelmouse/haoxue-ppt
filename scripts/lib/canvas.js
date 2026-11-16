// Canvas：版式引擎与 pptxgenjs 之间的唯一出口。
// 每个绘制方法同时做两件事：
//   1) 真正写入幻灯片（全部为 PowerPoint 原生对象，保持可编辑）
//   2) 记录一条绘制指令（ops），供 HTML 预览与几何自检复用
// 这样"设计 → 渲染"只有一份几何来源，预览与成稿不会走形。

const { norm, shade, mix } = require('./color');
const { wrapText, blockHeight, textWidth, snap, stepDown } = require('./measure');
const { RADIUS, CARD_PAD, SHADOW, shadowOf, MIN_FONT, TYPE, ORN } = require('./design');

const W = 13.333;
const H = 7.5;

// ---------- 页内强调标记 ----------
// 语法：**关键词** → 主色加重；!!焦点!! → 强调色加重。
// 解析发生在 canvas.text 入口，所有版式自动获得该能力；
// 测量用剥掉标记的纯文本，避免 ** 两颗星被算进宽度。
// 深色上下文（文字色是 deepInk/deepMuted，或整册深色主题）自动换用深底安全色。
const EMPH_RE = /(\*\*[^*]+\*\*|!![^!]+!!)/g;

function stripEmph(s) {
  return String(s).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/!!([^!]+)!!/g, '$1');
}

function parseEmph(str, T, o) {
  const base = o.color ? String(o.color).toUpperCase() : null;
  const onDark = !!T.dark || base === String(T.deepInk).toUpperCase() || base === String(T.deepMuted).toUpperCase();
  const emC = onDark ? T.emOnDeep : (T.em || T.primaryText);
  const acC = onDark ? T.accentOnDeep : (T.emAccent || T.accentText);
  const parts = String(str).split(EMPH_RE).filter((x) => x !== '');
  const runs = parts.map((seg) => {
    if (seg.startsWith('**') && seg.endsWith('**')) return { text: seg.slice(2, -2), bold: true, color: emC };
    if (seg.startsWith('!!') && seg.endsWith('!!')) {
      // 焦点词：强调色 + 荧光笔底色（浅底才有；深底上底色会发脏，只留颜色）
      return { text: seg.slice(2, -2), bold: true, color: acC, hl: !onDark };
    }
    return { text: seg };
  });
  return { runs, plain: stripEmph(str) };
}

class Canvas {
  constructor(slide, pptx, ctx) {
    this.slide = slide;
    this.pptx = pptx;
    this.ctx = ctx; // { theme, pageNo, warnings, icons }
    this.ops = [];
  }

  get T() { return this.ctx.theme; }

  warn(kind, msg) {
    this.ctx.warnings.push({ page: this.ctx.pageNo, kind, msg });
  }

  // 光影纪律：只有显式声明 shadow 的对象才投影。
  // 默认给所有矩形都加阴影，会让分割线、色条、序号块全部"发脏"——
  // 立体感来自少数几个真正该浮起来的对象，而不是全页统一加灰边。
  _shadow(o) {
    if (!o.shadow) return undefined;
    if (this.T.dark) return undefined;   // 深底上阴影不可见，画了反而脏
    return shadowOf(o.shadow);
  }

  // ---------- 卡片（统一的"块"）----------
  // 卡片的立体感由三件事共同构成，缺一件就会"平":
  //   1) 上亮下暗的极轻渐变（postprocess.js 按名字注入 gradFill，三停靠）
  //   2) 双层阴影：接触阴影（贴边、短）+ 环境阴影（远、软）
  //   3) 大圆角 + 同族细边（描边本身也带渐变，读出"板的厚度"）
  // tone 决定配色家族，并把对应的文字色一起返回——调用方不需要自己猜深底该用什么字色：
  //   light（默认白卡）/ alt（浅灰卡）/ tint（强调浅底）/ dark（深底，深色页上的主角）/ glass（深底上的玻璃卡）
  // o: { fill, line, radius, shadow, pad, accent, accentSide, name, raise, tone }
  // 返回内容区（已扣掉内边距的矩形）+ 文字色令牌
  card(x, y, w, h, o = {}) {
    const T = this.T;
    const pad = o.pad === undefined ? CARD_PAD : o.pad;
    const tone = o.tone || 'light';
    const palette = {
      light: { fill: T.surface, ink: T.ink, body: T.body, muted: T.muted },
      alt: { fill: T.surfaceAlt, ink: T.ink, body: T.body, muted: T.muted },
      tint: { fill: T.accentSoft, ink: T.ink, body: T.body, muted: T.muted },
      dark: { fill: T.deep, ink: T.deepInk, body: T.deepMuted, muted: T.deepMuted },
      glass: { fill: T.deepAlt, ink: T.deepInk, body: T.deepMuted, muted: T.deepMuted },
    }[tone] || { fill: T.surface, ink: T.ink, body: T.body, muted: T.muted };
    const fill = o.fill || palette.fill;
    // 细边与底色同族：既避免无边框 roundRect 在部分渲染器上的顶部缺口，又不像"线框"
    const line = o.line || mix(fill, T.dark || tone === 'dark' || tone === 'glass' ? T.deepInk : T.ink, 0.09);
    const raise = o.raise !== false;
    // 统一加 card. 前缀：后处理按这个名字给卡片注入渐变与双层阴影
    const nm = o.name ? `card.${String(o.name).replace(/^card\./, '')}` : 'card.auto';
    this.rect(x, y, w, h, {
      fill,
      line,
      lw: o.lw === undefined ? 0.9 : o.lw,
      radius: o.radius === undefined ? RADIUS.card : o.radius,
      shadow: raise ? (o.shadow === undefined ? SHADOW.md : o.shadow) : false,
      name: nm,
      depth: raise,
    });
    if (o.accent) {
      // 强调条：叠在卡片左侧/上沿，不额外占内部空间。
      // 两端都按圆角内缩，否则直角的条会在卡片圆角处"露头"，像贴歪的胶带。
      const side = o.accentSide || 'left';
      if (side === 'left') {
        const inset = Math.min(0.18, h * 0.12);
        this.rect(x, y + inset, 0.075, h - inset * 2, { fill: o.accent, name: `${nm}.mark` });
      } else {
        const r = (o.radius === undefined ? RADIUS.card : o.radius) * 0.9;
        this.rect(x + r, y, w - r * 2, 0.075, { fill: o.accent, name: `${nm}.mark` });
      }
    }
    return { x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2, pad, ink: palette.ink, body: palette.body, muted: palette.muted };
  }

  // 地基块：卡片背后的浅色大色块，让浮起的卡片有"落点"。
  // 无阴影、无描边、圆角比卡片大一档——靠明度差表达层次，而不是靠线。
  slab(x, y, w, h, o = {}) {
    const T = this.T;
    this.rect(x, y, w, h, {
      fill: o.fill || (T.dark ? T.deepAlt : mix(T.bg, T.primary, 0.07)),
      radius: o.radius === undefined ? RADIUS.card + 0.04 : o.radius,
      name: o.name || 'slab',
    });
    return this;
  }

  // 渐变压暗（图片压字可读性）：真正的一条渐变，由 postprocess 在 XML 层注入 gradFill。
  //
  // 为什么不用"多段半透明矩形"堆出来：每段矩形在渲染器里都会因为边缘抗锯齿露出
  // 一条比周围浅的 hairline，十几段叠起来就是一片"梯田横纹"，比不压暗还难看。
  // 一条 gradFill 有 alpha 停靠点，跨软件都是平滑的，而且仍然可编辑。
  scrimFade(x, y, w, h, color, o = {}) {
    const to = o.to === undefined ? 0.90 : o.to;
    this.rect(x, y, w, h, {
      fill: color,
      fillTransparency: Math.round((1 - to) * 100),
      name: 'scrim.grad',
    });
    return this;
  }

  // ---------- 形状 ----------
  rect(x, y, w, h, o = {}) {
    const radius = o.radius !== undefined ? o.radius : 0;
    const shape = radius > 0 ? 'roundRect' : 'rect';
    const fill = o.fill ? { color: norm(o.fill) } : { color: 'FFFFFF', transparency: 100 };
    if (o.opacity !== undefined) fill.transparency = Math.round((1 - o.opacity) * 100);
    if (o.fillTransparency !== undefined) fill.transparency = o.fillTransparency;
    const line = o.line
      ? { color: norm(o.line), width: o.lw === undefined ? 1 : o.lw, dashType: o.dash || 'solid' }
      : { color: norm(o.fill || 'FFFFFF'), width: 0, transparency: 100 };
    this.slide.addShape(shape, {
      x, y, w, h, fill, line,
      rectRadius: radius || undefined,
      shadow: this._shadow(o),
      objectName: o.name,
    });
    this.ops.push({ t: 'rect', x, y, w, h, fill: o.fill || null, opacity: o.opacity, line: o.line || null, lw: o.lw, dash: o.dash, radius, name: o.name, depth: !!o.depth });
    return this;
  }

  circle(cx, cy, d, o = {}) {
    const fill = o.fill ? { color: norm(o.fill) } : { color: 'FFFFFF', transparency: 100 };
    if (o.opacity !== undefined) fill.transparency = Math.round((1 - o.opacity) * 100);
    this.slide.addShape('ellipse', {
      x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill,
      line: o.line ? { color: norm(o.line), width: o.lw || 1 } : { color: norm(o.fill || 'FFFFFF'), width: 0, transparency: 100 },
      shadow: this._shadow(o),
      objectName: o.name,
    });
    this.ops.push({ t: 'circle', cx, cy, d, fill: o.fill || null, opacity: o.opacity, line: o.line || null, lw: o.lw });
    return this;
  }

  // 圆弧线：装饰层专用。range 是 [起角, 终角]（0°=3点钟方向，顺时针，y 轴向下）。
  // 命名一律 grad.arc——postprocess 会把线的纯色换成两端渐隐的渐变，
  // "进页面时是气质，读到内容时已经忘了它"。线宽纪律 ≤1.5pt，画在内容之前（压底）。
  arc(cx, cy, r, o = {}) {
    const [a0, a1] = o.range || [90, 180];
    this.slide.addShape('arc', {
      x: cx - r, y: cy - r, w: r * 2, h: r * 2,
      angleRange: [a0, a1],
      fill: { color: 'FFFFFF', transparency: 100 },
      line: { color: norm(o.color || this.T.accent), width: o.width || 1.25 },
      objectName: o.name || 'grad.arc',
    });
    this.ops.push({ t: 'arc', cx, cy, r, range: [a0, a1], color: o.color || this.T.accent });
    return this;
  }

  line(x1, y1, x2, y2, o = {}) {
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1) || 0.0001, h = Math.abs(y2 - y1) || 0.0001;
    this.slide.addShape('line', {
      x, y, w, h,
      flipH: x2 < x1, flipV: y2 < y1,
      line: {
        color: norm(o.color || this.T.line),
        width: o.width === undefined ? 1 : o.width,
        dashType: o.dash || 'solid',
        endArrowType: o.arrow ? 'triangle' : undefined,
        beginArrowType: o.arrowStart ? 'triangle' : undefined,
      },
      objectName: o.name,
    });
    this.ops.push({ t: 'line', x1, y1, x2, y2, color: o.color || this.T.line, width: o.width === undefined ? 1 : o.width, dash: o.dash, arrow: !!o.arrow });
    return this;
  }

  chevron(x, y, w, h, o = {}) {
    this.slide.addShape('chevron', {
      x, y, w, h,
      fill: { color: norm(o.fill || this.T.primary) },
      line: { color: norm(o.fill || this.T.primary), width: 0 },
      objectName: o.name,
    });
    this.ops.push({ t: 'chevron', x, y, w, h, fill: o.fill || this.T.primary });
    return this;
  }

  triangle(x, y, w, h, o = {}) {
    this.slide.addShape(o.dir || 'triangle', {
      x, y, w, h,
      fill: { color: norm(o.fill || this.T.accent) },
      line: { color: norm(o.fill || this.T.accent), width: 0 },
      transparency: 0,
      objectName: o.name,
    });
    this.ops.push({ t: 'triangle', x, y, w, h, fill: o.fill || this.T.accent, dir: o.dir });
    return this;
  }

  // ---------- 文本 ----------
  /**
   * o: { size, bold, color, align, valign, font, tracking, lh, italic,
   *      shrink(默认 true), minSize, margin, name, bullet }
   * 返回实际使用的字号；自动缩字号时会记一条 warn。
   */
  // str 可以是字符串，也可以是 rich runs: [{text, color, bold, italic}]
  text(x, y, w, h, str, o = {}) {
    let runs = Array.isArray(str) ? str : null;
    let text = runs ? runs.map((r) => r.text).join('') : (str === undefined || str === null ? '' : String(str));
    // 强调标记：**主色加重** / !!强调色加重!! —— 剥掉标记后测量，解析成 runs 绘制
    let marked = null;
    if (!runs && /\*\*[^*]+\*\*|!![^!]+!!/.test(text)) {
      marked = parseEmph(text, this.T, o);
      runs = marked.runs;
      text = marked.plain;
    }
    if (!text.trim()) return o.size || TYPE.body;
    const font = o.font || this.T.fonts.body;
    const align = o.align || 'left';
    const valign = o.valign || 'top';
    const spacing = o.lh || 1.0;
    // 字号下限：16pt。传进来的 11/12.5 一律被抬到 16——宁可让文本框溢出报警，
    // 也不让页面上出现"投影看不清"的小字。溢出由 minSize + 版式框高负责收敛。
    const minSize = Math.max(MIN_FONT, o.minSize || TYPE.small);
    let size = Math.max(MIN_FONT, snap(o.size || TYPE.body, o.shrink === false ? 'down' : 'near'));

    const innerW = Math.max(0.2, w - (o.padX || 0) * 2);
    const innerH = Math.max(0.1, h);

    if (o.shrink !== false) {
      let guard = 0;
      while (guard < 40) {
        const lines = wrapText(text, size, innerW, { bold: o.bold });
        if (blockHeight(lines, size, spacing) <= innerH || size <= minSize) break;
        const next = stepDown(size);
        if (!next || next < minSize) { size = minSize; break; }
        size = next;
        guard += 1;
      }
      const lines = wrapText(text, size, innerW, { bold: o.bold });
      if (blockHeight(lines, size, spacing) > innerH * 1.02) {
        this.warn('TEXT-OVERFLOW', `第${this.ctx.pageNo}页 文本框 ${w.toFixed(2)}x${h.toFixed(2)} "${text.slice(0, 18)}" 估算溢出`);
      }

      // 孤儿字：末行明显短于首行时，试降一级字号；能少一行就用新字号
      if (o.avoidOrphan !== false && lines.length > 1 && size > MIN_FONT) {
        const lastW = textWidth(lines[lines.length - 1], size, { bold: o.bold });
        const firstW = textWidth(lines[0], size, { bold: o.bold });
        if (lastW < firstW * 0.45) {
          const smaller = stepDown(size);
          if (smaller && smaller >= minSize) {
            const alt = wrapText(text, smaller, innerW, { bold: o.bold });
            if (alt.length < lines.length && blockHeight(alt, smaller, spacing) <= innerH * 1.02) {
              size = smaller;
            }
          }
        }
      }
    }

    // 富文本里换行必须走 breakLine：pptx 的 run 不识别 \n 字符
    const expand = (list) => {
      const out = [];
      list.forEach((r) => {
        const opt = {
          color: norm(r.color || o.color || this.T.ink),
          bold: r.bold === undefined ? !!o.bold : !!r.bold,
          italic: r.italic === undefined ? !!o.italic : !!r.italic,
          fontSize: snap(r.size || size, 'down'),
          fontFace: font,
          // !!焦点!! 的荧光笔：整页唯一的视觉焦点位，比纯颜色更"跳"但仍是主题色
          highlight: r.hl ? norm(this.T.hlMark || this.T.accentSoft) : undefined,
        };
        const parts = String(r.text).split('\n');
        parts.forEach((part, idx) => {
          out.push({ text: part, options: { ...opt } });
          if (idx < parts.length - 1) out.push({ text: '', options: { ...opt, breakLine: true } });
        });
      });
      return out;
    };
    const payload = runs ? expand(runs) : text;

    this.slide.addText(payload, {
      x: x + (o.padX || 0), y, w: innerW, h,
      fontSize: size,
      fontFace: font,
      color: norm(o.color || this.T.ink),
      bold: !!o.bold,
      italic: !!o.italic,
      align,
      valign,
      margin: o.margin === undefined ? 0 : o.margin,
      // 单行标题传 wrap:false：折行会把最后两个字（常是问号）挤到框外被裁掉，
      // 而标题只有一行时"溢出但完整"永远好过"折行后被切"。
      wrap: o.wrap === undefined ? true : o.wrap,
      lineSpacingMultiple: spacing,
      charSpacing: o.tracking || undefined,
      transparency: o.transparency,
      isTextBox: true,
      objectName: o.name,
    });
    this.ops.push({
      t: 'text', x, y, w, h, text, size, bold: !!o.bold, italic: !!o.italic,
      color: o.color || this.T.ink, align, valign, font, tracking: o.tracking, lh: spacing,
      name: o.name,
    });
    return size;
  }

  // 多段落：items = [{text, size, bold, color, bullet, spaceBefore, lh}]
  paragraphs(x, y, w, h, items, o = {}) {
    const font = o.font || this.T.fonts.body;
    const arr = [];
    items.forEach((it, i) => {
      const base = {
        fontSize: Math.max(MIN_FONT, it.size || o.size || TYPE.body),
        bold: it.bold !== undefined ? it.bold : !!o.bold,
        color: norm(it.color || o.color || this.T.body),
        fontFace: font,
        breakLine: i < items.length - 1,
        paraSpaceAfter: it.spaceAfter === undefined ? (o.spaceAfter === undefined ? 6 : o.spaceAfter) : it.spaceAfter,
        bullet: it.bullet ? { code: '25AA', indent: 14 } : false,
        italic: !!it.italic,
      };
      if (/\*\*[^*]+\*\*|!![^!]+!!/.test(it.text)) {
        // 带标记的段落：解析成 runs；bullet 挂首 run，breakLine 归末 run
        const rs = parseEmph(it.text, this.T, { color: it.color || o.color || this.T.body }).runs;
        rs.forEach((r, j) => {
          arr.push({
            text: r.text,
            options: {
              ...base,
              bold: r.bold === undefined ? base.bold : true,
              color: norm(r.color || base.color),
              bullet: j === 0 ? base.bullet : false,
              breakLine: j === rs.length - 1 ? i < items.length - 1 : false,
            },
          });
        });
      } else {
        arr.push({ text: it.text, options: base });
      }
    });
    this.slide.addText(arr, {
      x, y, w, h,
      align: o.align || 'left',
      valign: o.valign || 'top',
      margin: 0,
      lineSpacingMultiple: o.lh || 1.05,
      objectName: o.name,
    });
    // 预览用：合并为一条带换行的文本
    this.ops.push({
      t: 'text', x, y, w, h,
      text: items.map((it) => (it.bullet ? '· ' : '') + it.text).join('\n'),
      size: o.size || 16, bold: !!o.bold, color: o.color || this.T.body,
      align: o.align || 'left', valign: o.valign || 'top', font, lh: o.lh || 1.05,
    });
    return this;
  }

  // ---------- 图片 ----------
  image(x, y, w, h, src, o = {}) {
    if (!src) return this;
    const fit = o.fit || 'cover';
    this.slide.addImage({
      path: src,
      x, y, w, h,
      sizing: fit === 'contain' ? { type: 'contain', w, h } : { type: 'cover', w, h },
      objectName: o.name || (fit === 'cover' ? 'cover.image' : 'contain.image'),
      transparency: o.transparency,
    });
    this.ops.push({ t: 'image', x, y, w, h, src, fit });
    return this;
  }

  // 纯色遮罩（用于图片压字）
  scrim(x, y, w, h, color, transparency) {
    this.slide.addShape('rect', {
      x, y, w, h,
      fill: { color: norm(color), transparency: transparency === undefined ? 30 : transparency },
      line: { color: norm(color), width: 0 },
      objectName: 'scrim',
    });
    this.ops.push({ t: 'rect', x, y, w, h, fill: color, opacity: 1 - (transparency === undefined ? 30 : transparency) / 100, line: null });
    return this;
  }

  // ---------- 图表 ----------
  chart(kind, x, y, w, h, chart, o = {}) {
    const colors = o.colors || this.T.chart;
    const labels = chart.labels || [];
    let data;
    if (kind === 'pie' || kind === 'doughnut') {
      data = [{ name: chart.title || '占比', labels, values: chart.values }];
    } else if (kind === 'scatter') {
      data = chart.series.map((s, i) => ({ name: s.name, values: s.points, color: colors[i % colors.length] }));
    } else {
      data = chart.series.map((s, i) => ({
        name: s.name,
        labels,
        values: s.values,
        color: colors[i % colors.length],
      }));
    }
    const base = {
      x, y, w, h,
      chartColors: colors,
      showTitle: !!o.showTitle,
      title: o.title || '',
      titleFontSize: TYPE.small,
      titleColor: norm(this.T.muted),
      showLegend: o.legend === undefined ? chart.series.length > 1 : o.legend,
      legendPos: o.legendPos || 'b',
      legendFontSize: TYPE.small,
      legendColor: norm(this.T.muted),
      showValue: o.showValue !== false,
      dataLabelFontSize: o.dataLabelSize || TYPE.small,
      dataLabelColor: norm(o.dataLabelColor || this.T.body),
      dataLabelPosition: o.labelPos || (kind === 'line' ? 't' : 'outEnd'),
      catAxisLabelColor: norm(this.T.muted),
      catAxisLabelFontSize: TYPE.small,
      valAxisLabelColor: norm(this.T.muted),
      valAxisLabelFontSize: TYPE.small,
      catAxisLineShow: false,
      valAxisLineShow: false,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      border: { pt: 0, color: norm(this.T.bg) },
      plotArea: { fill: { color: norm(o.plotBg || this.T.bg), transparency: 0 } },
      barGapWidthPct: 55,
      barGrouping: o.grouping || 'clustered',
      holeSize: kind === 'doughnut' ? 55 : undefined,
      showPercent: kind === 'pie' || kind === 'doughnut',
      dataLabelFormatCode: o.formatCode,
    };
    if (kind === 'line') {
      base.lineSize = o.lineWidth || 2.5;
      base.lineSmooth = false;
      base.lineDataSymbol = 'circle';
      base.lineDataSymbolSize = 7;
    }
    this.slide.addChart(kind, data, base);
    this.ops.push({ t: 'chart', kind, x, y, w, h, chart, colors });
    return this;
  }

  // ---------- 复合小件 ----------
  // —— 装饰语汇：少量、克制、在整套课件里重复出现。以下六件构成"这套课件的笔迹"：
  //    金线（结构分界）/ 渐隐引线（标题）/ 小标签（信息头）/ 角标（取景框）/
  //    水印（深色页肌理）/ 柔光（深色页光源）。
  //    全部以 decor. 或 grad. 开头命名：前者被验收脚本排除在密度统计外，后者由后处理注入渐变。
  rule(x, y, w, o = {}) {
    this.rect(x, y, w, o.h || ORN.rule, {
      fill: o.color || this.T.accent,
      name: o.name || 'grad.gold',
    });
    return this;
  }

  // 渐隐引线：从透明淡入到实色。用于标题右侧——把视线从标题"引"向页码，
  // 但不在页面上留下一条生硬的横线。
  edgeRule(x, y, w, o = {}) {
    this.rect(x, y, w, o.h || ORN.rule, {
      fill: o.color || this.T.accent,
      name: o.name || 'grad.edge',
    });
    return this;
  }

  // 小标签：深色小底 + 左侧金色细块。比灰色小字更抓眼睛，且对比度天然达标。
  // 返回实际宽度，方便调用方接着排同一行的元素。
  chip(x, y, label, o = {}) {
    const T = this.T;
    const size = o.size || TYPE.small;
    const txt = String(label === undefined || label === null ? '' : label);
    const h = o.h || ORN.chipH;
    const tick = o.tick !== false;
    // 宽度按 1.1 倍实测值取整：微软雅黑的实际字宽比测量模型略大，
    // 只给 1.0 倍会让"01 房间"这种短标在 chip 里折成两行。
    const w = o.w || Math.min(o.maxW || 6.0, this.measure(txt, size) * 1.12 + (tick ? 0.60 : 0.32));
    const fill = o.fill || (T.dark ? T.surfaceAlt : T.deep);
    this.rect(x, y, w, h, { fill, radius: RADIUS.tag, name: o.name || 'chip' });
    if (tick) this.rect(x + 0.15, y + h * 0.30, 0.10, h * 0.40, { fill: o.tickColor || T.accent });
    this.text(x + (tick ? 0.34 : 0.17), y, w - (tick ? 0.42 : 0.24), h, txt, {
      size, bold: true, color: o.color || T.deepInk, valign: 'middle', shrink: false,
      tracking: 0.6, minSize: size, name: o.name ? `${o.name}.t` : 'chip.t',
    });
    return w;
  }

  // 角标：四角各一个 L。作用是让方框读成"取景框"，而不是又加一条边框线。
  bracket(x, y, w, h, o = {}) {
    const T = this.T;
    const c = o.color || mix(T.accent, T.bg, 0.3);
    const L = o.len || ORN.bracket;
    const lw = o.width || ORN.bracketW;
    const g = 0.012;
    const seg = [
      [x, y + L, x, y], [x, y, x + L, y],
      [x + w - L, y, x + w, y], [x + w - g, y, x + w - g, y + L],
      [x, y + h - L, x, y + h], [x, y + h - g, x + L, y + h - g],
      [x + w - L, y + h - g, x + w, y + h - g], [x + w - g, y + h - L, x + w - g, y + h],
    ];
    seg.forEach((s, i) => this.line(s[0], s[1], s[2], s[3], { color: c, width: lw, name: `decor.bracket.${i + 1}` }));
    return this;
  }

  // 水印大字：深色页上的暗纹，只做肌理不做信息。必须叫 decor.* ——
  // 它字号远大于正文，若计入"单页字号种类"会误报。
  watermark(x, y, w, h, txt, o = {}) {
    const T = this.T;
    this.text(x, y, w, h, String(txt === undefined || txt === null ? '' : txt), {
      size: o.size || 200, bold: true, color: o.color || T.deepInk,
      align: o.align || 'right', valign: o.valign || 'bottom', shrink: false, lh: 0.86,
      transparency: o.transparency === undefined ? ORN.watermark : o.transparency,
      font: T.fonts.title, name: o.name || 'decor.watermark',
    });
    return this;
  }

  // 柔光：三层同心椭圆递减不透明度。pptx 没有径向渐变，单层实心椭圆的边缘
  // 硬得像贴纸，三层叠起来才散得开——这是深色页唯一的"光源"。
  sheen(cx, cy, d, o = {}) {
    const c = o.color || this.T.deepGlow;
    const rings = o.alpha || ORN.sheenAlpha;
    rings.forEach((a, i) => {
      this.circle(cx, cy, d * (1 - i * 0.24), {
        fill: c, opacity: Math.max(0.02, 1 - a / 100), name: `decor.sheen.${i + 1}`,
      });
    });
    return this;
  }

  // 网格：深色页的"坐标纸"肌理。只画竖线（横线会和正文基线打架），
  // 而且不满版——从右侧起铺，形成"结构从右边淡入"的方向感。
  hairGrid(x, y, w, h, o = {}) {
    const n = o.cols || 6;
    const step = w / n;
    const c = o.color || this.T.deepEdge;
    for (let i = 1; i <= n; i += 1) {
      this.rect(x + i * step, y, 0.008, h, {
        fill: c, opacity: (o.alpha === undefined ? ORN.gridAlpha : o.alpha) / 100,
        name: `decor.grid.${i}`,
      });
    }
    return this;
  }

  // 数字徽章（圆 + 数字），返回右侧 x
  badge(x, y, d, label, o = {}) {
    const fill = o.fill || this.T.primary;
    const txt = o.color || this.T.bg;
    this.circle(x + d / 2, y + d / 2, d, { fill });
    this.text(x, y + (o.dy || 0), d, d, String(label), {
      size: o.size || Math.round(d * 44), bold: true, color: txt,
      align: 'center', valign: 'middle', shrink: false, font: o.font,
    });
    return x + d;
  }

  // 细标签（英文/序号），字距拉开
  kicker(x, y, w, txt, o = {}) {
    return this.text(x, y, w, o.h || 0.30, txt, {
      size: o.size || TYPE.small, bold: true, color: o.color || this.T.accentText,
      tracking: o.tracking === undefined ? 2.2 : o.tracking, shrink: false, font: o.font,
      name: o.name,
    });
  }

  // 图标（PNG 由 sharp 预渲染，缺失时降级为圆点）
  icon(name, x, y, size, o = {}) {
    const icons = this.ctx.icons;
    const path = icons && icons.get ? icons.get(name, o.color || this.T.primary) : null;
    if (path) {
      this.slide.addImage({ path, x, y, w: size, h: size, objectName: o.name });
      this.ops.push({ t: 'image', x, y, w: size, h: size, src: path, fit: 'contain', icon: name });
    } else {
      this.circle(x + size / 2, y + size / 2, size * 0.55, { fill: o.color || this.T.primary, opacity: 0.9 });
    }
    return this;
  }

  measure(str, size, o = {}) { return textWidth(str, size, o) / 72; }
}

module.exports = { parseEmph, stripEmph, Canvas, W, H };
