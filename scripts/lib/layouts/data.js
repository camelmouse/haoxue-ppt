// 数据图表版式：原生图表（可编辑）+ 关键指标 + 一句解释
const { MX, CW, RIGHT, header, footer, insightBar } = require('./common');
const { TYPE } = require('../design');
const { textWidth } = require('../measure');

function dataChart(cv, page, deck) {
  const T = cv.T;
  const top = header(cv, page, { size: TYPE.h1 });
  const full = page.layout === 'full';
  const chartW = full ? CW : 7.52;
  const hasSide = !full;
  const chartX = MX;
  // 图注单独占一行（约 0.42in），图表从它下方开始——图注压在图上会顶掉 Y 轴顶端刻度
  const chartY = top + 0.46;
  const bottom = page.insight ? 5.62 : 6.32;
  const chartH = Math.min(3.90, bottom - chartY);

  // 图注与数据来源同一行：左边说"这张图是什么"，右边说"数据哪来的"。
  // 原来 source 放在图表下方，字号放大后必定被底部结论条压住。
  const srcW = page.source ? 2.4 : 0;
  if (page.caption) {
    cv.text(MX, top + 0.02, chartW - srcW - 0.24, 0.32, page.caption, {
      size: TYPE.small, color: T.muted, shrink: false, minSize: TYPE.small, name: 'caption',
    });
  }
  if (page.source) {
    cv.text(MX + chartW - srcW, top + 0.02, srcW, 0.32, page.source, {
      size: TYPE.small, color: T.muted, align: 'right', shrink: false, italic: true, name: 'source',
    });
  }

  const chart = page.chart || {};
  const kind = page.chartType || 'bar';
  cv.chart(kind, chartX, chartY, chartW, chartH, chart, {
    showValue: page.showValue !== false,
    legend: page.legend,
    title: '',
    labelPos: page.labelPos,
    colors: page.colors || (chart.series && chart.series.length > 1 ? T.chart : [T.primary]),
    lineWidth: page.lineWidth,
    showTitle: false,
    formatCode: page.formatCode,
    grouping: page.grouping,
  });

  if (hasSide) {
    const kx = MX + chartW + 0.54;
    const kw = RIGHT - kx;
    const list = page.kpis || [];
    // KPI 列从图注那一行起排（不是从图表顶起），多出来的 0.4in 正好让三组都喘得上气。
    // 每组两行：大数字 + 贴在同一基线上的金色小标签 / 下面一行灰色说明。
    // 小标签原来单独占一行，三组就是九行——16pt 下限下九行塞不进半屏，只会挤成一团。
    // 标签行 0.36 是 16pt 单行（含行距余量）的实测高度；原来给 0.38 是浪费——
    // 3 组 KPI 时这 0.06in 正好卡在 42pt 与 34pt 的分界上。
    const HH = 0.36;
    const kpiTop = top + 0.02;
    const kpiBottom = page.insight ? 5.87 : 6.46;
    const n = list.length || 1;
    const avail = kpiBottom - kpiTop;
    // 三档而不是两档：52 / 42 / 34。判定用"整列能不能放下"，不是平均高度——
    // 平均高度在 3 组时过于保守：胶囊导航把页头压下 0.3in，42pt 明明放得下，
    // 却因均值差 0.01 掉到 34pt，数字就和页面标题一样大，"数据页"失去主角。
    const fitKpi = (vh) => {
      const cH0 = vh + HH;
      const step0 = Math.max(cH0 + 0.08, avail / n);
      return step0 * (n - 1) + cH0 <= avail + 0.005;
    };
    let VSize = 52, VH = 1.00;
    if (!fitKpi(1.00)) { VSize = 42; VH = 0.77; }
    if (!fitKpi(VH)) { VSize = 34; VH = 0.64; }
    const cH = VH + HH;
    const step = Math.max(cH + 0.08, avail / n);
    list.forEach((k, i) => {
      const y = kpiTop + i * step;
      cv.text(kx, y, kw, VH, k.value, {
        size: VSize, bold: true, color: i === 0 ? T.primary : T.ink, shrink: false, font: T.fonts.title, valign: 'top',
      });
      if (k.note) {
        const nw = Math.min(kw - 0.6, (textWidth(k.value, VSize, { bold: true }) / 72) + 0.10);
        cv.text(kx + nw + 0.14, y, kw - nw - 0.14, VH, k.note, {
          size: TYPE.small, bold: true, color: T.accentText, tracking: 1.2, shrink: false,
          valign: 'bottom', name: 'aux.kpi.note',
        });
      }
      cv.rect(kx, y + VH + 0.02, Math.min(0.52, kw * 0.3), 0.026, { fill: T.accent, name: 'grad.gold' });
      cv.text(kx, y + VH + 0.12, kw, HH, k.label, { size: TYPE.small, color: T.muted, lh: 1.2, shrink: false, minSize: TYPE.small });
    });
  }

  if (page.insight) insightBar(cv, 5.88, page.insight, { size: TYPE.body, h: 0.80 });
  footer(cv, page, deck);
}

module.exports = { dataChart };
