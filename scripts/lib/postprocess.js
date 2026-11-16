// 生成后处理（三件事）：
//   1) 图表分类轴的 multiLvlStrRef 压平为 strRef（跨软件稳定显示中文分类）
//   2) 卡片"抬升"：渐变填充 + 双层阴影
//   3) 图片遮罩：纯色 + 整体透明度 → 带 alpha 停靠点的纵向 gradFill
//
// 为什么第 2 件事必须在 XML 层做：
//   pptxgenjs 的 fill 只支持纯色、shadow 只支持单层 outerShdw。
//   而真实的立体感来自「上亮下暗的极轻渐变」+「接触阴影（近、短、稍实）+ 环境阴影（远、软、淡）」。
//   单层阴影 + 纯色的卡片，视觉上就是"贴了一张灰纸"，这正是一眼看去"平面化"的根因。
//   注入后仍是 PowerPoint 原生效果（effectLst / gradFill），可编辑、可在 WPS 里改。
const fs = require('fs');
const JSZip = require('jszip');
const { mix, shade, luminance, norm } = require('./color');
const { DEPTH } = require('./design');

// ---------- 1) 图表分类轴压平 ----------
function flattenCat(xml) {
  return xml.replace(/<c:multiLvlStrRef>([\s\S]*?)<\/c:multiLvlStrRef>/g, (m, body) => {
    const f = (body.match(/<c:f>([\s\S]*?)<\/c:f>/) || [, ''])[1];
    const lvl = (body.match(/<c:lvl>([\s\S]*?)<\/c:lvl>/) || [, ''])[1];
    if (!lvl) return m;
    const ptsArr = [...lvl.matchAll(/<c:pt idx="(\d+)">([\s\S]*?)<\/c:pt>/g)];
    const pts = ptsArr.map(([, idx, inner]) => `<c:pt idx="${idx}">${inner.trim()}</c:pt>`).join('');
    return `<c:strRef><c:f>${f}</c:f><c:strCache><c:ptCount val="${ptsArr.length}"/>${pts}</c:strCache></c:strRef>`;
  });
}

// ---------- 2) 卡片抬升 ----------
// 渐变幅度按底色亮度自适应。三停靠（顶部高光 / 本体 / 底部收暗）而不是两停靠：
// 两停靠的白卡从 #FFFFFF 再"提亮"没有任何变化，卡片就剩一个平白面——
// 这正是"卡片像纸片、页面像表格"的直接原因。顶停靠改为向强调色混 5%（微暖高光），
// 底停靠混 6% 墨色，白卡立刻有了"上下面"的区别，仍是可编辑的 gradFill。
function gradientFor(hex, accent = 'B4834A', ink = '101820') {
  const c = norm(hex);
  const lum = luminance(c);
  let top, bot;
  if (lum > 0.6) {
    top = mix(c, accent, 0.05);
    bot = mix(c, ink, 0.075);
  } else if (lum > 0.2) {
    top = shade(c, 0.12);
    bot = shade(c, -0.16);
  } else {
    top = mix(c, 'FFFFFF', 0.12);
    bot = mix(c, ink, 0.35);
  }
  if (top === c && bot === c) return null;
  return '<a:gradFill rotWithShape="1"><a:gsLst>'
    + `<a:gs pos="0"><a:srgbClr val="${top}"/></a:gs>`
    + `<a:gs pos="16000"><a:srgbClr val="${mix(top, c, 0.55)}"/></a:gs>`
    + `<a:gs pos="52000"><a:srgbClr val="${c}"/></a:gs>`
    + `<a:gs pos="100000"><a:srgbClr val="${bot}"/></a:gs>`
    + '</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>';
}

// 描边渐变：同一条线的上沿亮、下沿暗，读起来就是"板的厚度"，比再加一层形状干净。
function lineGradient(hex) {
  const c = norm(hex);
  const top = mix(c, 'FFFFFF', DEPTH.edgeLift);
  const bot = shade(c, -DEPTH.edgeDrop);
  if (top === c && bot === c) return null;
  return '<a:gradFill rotWithShape="1"><a:gsLst>'
    + `<a:gs pos="0"><a:srgbClr val="${top}"/></a:gs>`
    + `<a:gs pos="58000"><a:srgbClr val="${c}"/></a:gs>`
    + `<a:gs pos="100000"><a:srgbClr val="${bot}"/></a:gs>`
    + '</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>';
}

// 装饰渐变：名字决定形态，颜色取自形状自身的填充色（调用方只给一个色）
//   grad.gold  金属横带（描金细线）      grad.goldv 金属竖带（卡片左侧金条）
//   grad.diag  对角大色块（深底方向感）  grad.edge  水平渐隐（从左淡入/淡出）
//   grad.veil  纵向薄雾（深底提亮一端）
function ornamentGradient(kind, hex, alpha) {
  const c = norm(hex);
  const light = mix(c, 'FFFFFF', 0.46);
  const dark = shade(c, -0.22);
  const a = (v) => `<a:alpha val="${Math.round(v * 1000)}"/>`;
  const gs = (pos, val, al) => `<a:gs pos="${pos}"><a:srgbClr val="${val}">${al === undefined ? '' : a(al)}</a:srgbClr></a:gs>`;
  if (kind === 'gold' || kind === 'goldv') {
    const ang = kind === 'gold' ? '0' : '5400000';
    return '<a:gradFill rotWithShape="1"><a:gsLst>'
      + gs(0, dark) + gs(32000, light) + gs(62000, c) + gs(100000, dark)
      + `</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`;
  }
  if (kind === 'diag') {
    return '<a:gradFill rotWithShape="1"><a:gsLst>'
      + gs(0, mix(c, 'FFFFFF', 0.12)) + gs(46000, c) + gs(100000, shade(c, -0.3))
      + '</a:gsLst><a:lin ang="2700000" scaled="0"/></a:gradFill>';
  }
  if (kind === 'edge') {
    const al = alpha === undefined ? 0.6 : alpha;
    return '<a:gradFill rotWithShape="1"><a:gsLst>'
      + gs(0, c, 0) + gs(22000, c, al * 0.75) + gs(100000, c, 1)
      + '</a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>';
  }
  // veil：顶部透、底部实（用于柔光/薄雾）
  const al2 = alpha === undefined ? 0.9 : alpha;
  return '<a:gradFill rotWithShape="1"><a:gsLst>'
    + gs(0, c, 0) + gs(55000, c, al2 * 0.55) + gs(100000, c, al2)
    + '</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>';
}

function effectLst(shadow) {
  if (!shadow) return '';
  const ink = DEPTH.inkColor;
  const c = DEPTH.contact;
  const a = DEPTH.ambient;
  // 环境阴影放第一个：万一某个渲染器只认第一个 outerShdw，也是柔和的那层
  return '<a:effectLst>'
    + `<a:outerShdw blurRad="${a.blur}" dist="${a.dist}" dir="5400000" rotWithShape="0"><a:srgbClr val="${ink}"><a:alpha val="${Math.round(a.alpha * 100000)}"/></a:srgbClr></a:outerShdw>`
    + `<a:outerShdw blurRad="${c.blur}" dist="${c.dist}" dir="5400000" rotWithShape="0"><a:srgbClr val="${ink}"><a:alpha val="${Math.round(c.alpha * 100000)}"/></a:srgbClr></a:outerShdw>`
    + '</a:effectLst>';
}

function liftShape(sp, opts) {
  const nameM = sp.match(/<p:cNvPr[^>]*\bname="([^"]*)"/);
  const name = nameM ? nameM[1] : '';
  // 只处理卡片本体：.mark 是叠在卡片上的强调条，做了渐变会变成一根亮条
  if (!/^card\./.test(name) || /\.mark$/.test(name)) return sp;

  const open = sp.match(/<p:spPr[^>]*>/);
  const closeAt = sp.indexOf('</p:spPr>');
  if (!open || closeAt < 0) return sp;
  const i0 = open.index;                       // spPr 开标签起点
  const i1 = closeAt + '</p:spPr>'.length;     // spPr 闭标签终点
  let body = sp.slice(i0 + open[0].length, closeAt);

  // 填充：替换 geometry 之后的第一个 solidFill
  const geoEnd = body.indexOf('</a:prstGeom>');
  if (geoEnd > 0) {
    const head = body.slice(0, geoEnd);
    const tail = body.slice(geoEnd);
    const fill = tail.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);
    if (fill) {
      const val = (fill[0].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/) || [, ''])[1];
      const g = val ? gradientFor(val, opts.accent || 'B4834A', opts.ink || '101820') : null;
      if (g) body = head + tail.replace(fill[0], g);
    }
  }

  // 描边：整条线做上亮下暗的渐变，读出"板的厚度"（宽度 0 的无边框跳过）
  const ln = body.match(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/);
  if (ln && !/\bw="0"/.test(ln[0])) {
    const lval = (ln[0].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/) || [, ''])[1];
    const lg = lval ? lineGradient(lval) : null;
    if (lg) body = body.replace(ln[0], ln[0].replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, lg));
  }

  // 阴影：整体替换 pptxgenjs 写的那层，换成双层
  if (opts.shadow !== false) {
    const eff = effectLst(true);
    body = body.replace(/<a:effectLst>[\s\S]*?<\/a:effectLst>/, '');
    if (body.includes('</a:ln>')) body = body.replace('</a:ln>', `</a:ln>${eff}`);
    else if (geoEnd > 0) {
      const i = body.indexOf('</a:prstGeom>') + '</a:prstGeom>'.length;
      body = body.slice(0, i) + eff + body.slice(i);
    }
  }

  // 只替换 spPr 内部，保留 <p:sp>/txBody 等外层结构
  return sp.slice(0, i0) + open[0] + body + '</p:spPr>' + sp.slice(i1);
}

// 装饰形状：按名字前缀注入渐变（只换填充，不碰描边/阴影）
// 命名约定 grad.<kind>：kind 决定停靠点与角度，颜色取自形状自身填充，调用方只传一个色。
function ornShape(sp, opts = {}) {
  const nameM = sp.match(/<p:cNvPr[^>]*\bname="grad\.([a-z]+)"/);
  if (!nameM) return sp;
  const kind = nameM[1];
  const open = sp.match(/<p:spPr[^>]*>/);
  const closeAt = sp.indexOf('</p:spPr>');
  if (!open || closeAt < 0) return sp;
  const i0 = open.index;
  const i1 = closeAt + '</p:spPr>'.length;
  const body = sp.slice(i0 + open[0].length, closeAt);
  const fill = body.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);
  if (!fill) return sp;
  const val = (fill[0].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/) || [, ''])[1];
  if (!val) return sp;
  const aVal = (fill[0].match(/<a:alpha val="(\d+)"/) || [, ''])[1];
  // grad.card：与卡片同款的三停靠渐变，但不加阴影——深色页上的"玻璃卡"用它
  const g = kind === 'card'
    ? gradientFor(val, opts.accent || 'B4834A', opts.ink || '101820')
    : ornamentGradient(kind, val, aVal ? Number(aVal) / 100000 : undefined);
  if (!g) return sp;
  return sp.slice(0, i0) + open[0] + body.replace(fill[0], g) + '</p:spPr>' + sp.slice(i1);
}

function applyDepth(xml, opts = {}) {
  let n = 0;
  const out = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
    if (/name="scrim\.grad"/.test(sp)) {
      const next = fadeScrim(sp);
      if (next !== sp) n += 1;
      return next;
    }
    if (/name="grad\./.test(sp)) {
      const next = ornShape(sp, opts);
      if (next !== sp) n += 1;
      return next;
    }
    if (!/name="card\./.test(sp)) return sp;
    const next = liftShape(sp, opts);
    if (next !== sp) n += 1;
    return next;
  });
  return { xml: out, count: n };
}

// ---------- 2b) 遮罩渐变 ----------
// 图片上压字的遮罩：底部实、顶部透。pptxgenjs 只会写纯色 + 整体透明度，
// 这里换成一条纵向 gradFill，两端用 alpha 停靠点收口，渲染出来没有分段痕迹。
function fadeScrim(sp) {
  const open = sp.match(/<p:spPr[^>]*>/);
  const closeAt = sp.indexOf('</p:spPr>');
  if (!open || closeAt < 0) return sp;
  const i0 = open.index;
  const i1 = closeAt + '</p:spPr>'.length;
  const body = sp.slice(i0 + open[0].length, closeAt);

  const fill = body.match(/<a:solidFill>[\s\S]*?<\/a:solidFill>/);
  if (!fill) return sp;
  const val = (fill[0].match(/<a:srgbClr val="([0-9A-Fa-f]{6})"/) || [, ''])[1];
  if (!val) return sp;
  const aVal = (fill[0].match(/<a:alpha val="(\d+)"/) || [, '90000'])[1];

  const g = '<a:gradFill rotWithShape="1"><a:gsLst>'
    + `<a:gs pos="0"><a:srgbClr val="${val}"><a:alpha val="0"/></a:srgbClr></a:gs>`
    + `<a:gs pos="60000"><a:srgbClr val="${val}"><a:alpha val="${Math.round(Number(aVal) * 0.72)}"/></a:srgbClr></a:gs>`
    + `<a:gs pos="100000"><a:srgbClr val="${val}"><a:alpha val="${aVal}"/></a:srgbClr></a:gs>`
    + '</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>';
  const nextBody = body.replace(fill[0], g);
  return sp.slice(0, i0) + open[0] + nextBody + '</p:spPr>' + sp.slice(i1);
}

async function postprocess(filePath, opts = {}) {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  let changed = 0;

  // 图表
  const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  for (const name of charts) {
    const xml = await zip.file(name).async('string');
    if (!xml.includes('multiLvlStrRef')) continue;
    const next = flattenCat(xml);
    if (next !== xml) { zip.file(name, next); changed += 1; }
  }

  // 卡片抬升
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  let lifted = 0;
  for (const name of slides) {
    const xml = await zip.file(name).async('string');
    if (!xml.includes('name="card.') && !xml.includes('name="scrim.grad"')) continue;
    const r = applyDepth(xml, opts);
    if (r.xml !== xml) { zip.file(name, r.xml); lifted += r.count; }
  }

  if (changed || lifted) {
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, out);
  }
  return { fixed: changed, charts: charts.length, lifted };
}

module.exports = { postprocess, applyDepth, gradientFor, lineGradient, ornamentGradient };
