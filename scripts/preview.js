// ops → 单文件 HTML 预览（零依赖，可直接双击打开）
// 几何与成稿一一对应，用来快速看版式；真实渲染以 scripts/render.py 输出的 PNG 为准。
const path = require('path');
const fs = require('fs');

const PX = 96; // 1 inch = 96 px

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function imgUrl(src, baseDir) {
  if (!src) return '';
  if (/^(https?:|data:)/.test(src)) return src;
  const abs = path.isAbsolute(src) ? src : path.resolve(baseDir || process.cwd(), src);
  return fs.existsSync(abs) ? `file:///${abs.replace(/\\/g, '/')}` : '';
}

function chartSvg(op) {
  const { kind, chart, colors } = op;
  const w = op.w * PX, h = op.h * PX;
  const labels = chart.labels || [];
  const series = chart.series || [{ name: '', values: chart.values || [] }];
  const max = Math.max(...series.flatMap((s) => s.values || [0]), 1);
  const padL = 34, padB = 26, padT = 12, padR = 8;
  const iw = w - padL - padR, ih = h - padB - padT;
  let body = '';
  if (kind === 'bar' || kind === 'column') {
    const gw = iw / labels.length;
    const bw = Math.min(26, (gw * 0.62) / series.length);
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const bh = (v / max) * ih;
        const x = padL + i * gw + gw / 2 - (series.length * bw) / 2 + si * bw;
        body += `<rect x="${x.toFixed(1)}" y="${(padT + ih - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="#${colors[si % colors.length]}"/>`;
        body += `<text x="${(x + bw / 2).toFixed(1)}" y="${(padT + ih - bh - 4).toFixed(1)}" font-size="9" fill="#666" text-anchor="middle">${esc(v)}</text>`;
      });
    });
    labels.forEach((l, i) => {
      body += `<text x="${(padL + i * gw + gw / 2).toFixed(1)}" y="${h - 8}" font-size="9" fill="#666" text-anchor="middle">${esc(l)}</text>`;
    });
  } else if (kind === 'line' || kind === 'area') {
    const step = labels.length > 1 ? iw / (labels.length - 1) : iw;
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${padL + i * step},${padT + ih - (v / max) * ih}`).join(' ');
      body += `<polyline points="${pts}" fill="none" stroke="#${colors[si % colors.length]}" stroke-width="3"/>`;
      s.values.forEach((v, i) => {
        body += `<circle cx="${padL + i * step}" cy="${padT + ih - (v / max) * ih}" r="3.2" fill="#${colors[si % colors.length]}"/>`;
      });
    });
    labels.forEach((l, i) => {
      body += `<text x="${padL + i * step}" y="${h - 8}" font-size="9" fill="#666" text-anchor="middle">${esc(l)}</text>`;
    });
  } else if (kind === 'pie' || kind === 'doughnut') {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 10;
    const vals = series[0].values;
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    let ang = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a2 = ang + (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const large = a2 - ang > Math.PI ? 1 : 0;
      body += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="#${colors[i % colors.length]}"/>`;
      ang = a2;
    });
    if (kind === 'doughnut') body += `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#fff"/>`;
  }
  body += `<line x1="${padL}" y1="${padT + ih}" x2="${w - padR}" y2="${padT + ih}" stroke="#ddd"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function opHtml(op, baseDir) {
  const box = (style, inner) => `<div style="position:absolute;${style}">${inner}</div>`;
  const base = `left:${(op.x * PX).toFixed(2)}px;top:${(op.y * PX).toFixed(2)}px;width:${(op.w * PX).toFixed(2)}px;height:${(op.h * PX).toFixed(2)}px;`;
  switch (op.t) {
    case 'rect': {
      const radius = op.radius ? op.radius * PX : 0;
      const bg = op.fill ? `background:#${op.fill};` : 'background:transparent;';
      const op2 = op.opacity !== undefined && op.opacity !== null ? `opacity:${op.opacity};` : '';
      const border = op.line ? `border:${((op.lw || 1) * PX) / 72}px solid #${op.line};` : '';
      return box(`${base}${bg}${op2}${border}border-radius:${radius}px;box-sizing:border-box;`, '');
    }
    case 'circle':
      return box(`left:${(op.cx * PX - (op.d * PX) / 2).toFixed(2)}px;top:${(op.cy * PX - (op.d * PX) / 2).toFixed(2)}px;width:${op.d * PX}px;height:${op.d * PX}px;border-radius:50%;${op.fill ? `background:#${op.fill};` : 'border:' + ((op.lw || 1) * PX) / 72 + 'px solid #' + (op.line || 'ccc') + ';'}${op.opacity !== undefined ? `opacity:${op.opacity};` : ''}`, '');
    case 'line': {
      const x1 = op.x1 * PX, y1 = op.y1 * PX, x2 = op.x2 * PX, y2 = op.y2 * PX;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const thick = ((op.width || 1) * PX) / 72;
      const arrow = op.arrow ? `<polygon points="${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}" fill="#${op.color}"/>` : '';
      return `<div style="position:absolute;left:${x1}px;top:${(y1 - thick / 2).toFixed(2)}px;width:${len}px;height:${thick}px;background:#${op.color};transform-origin:0 50%;transform:rotate(${ang}deg);"></div>${arrow}`;
    }
    case 'chevron': {
      const w = op.w * PX, h = op.h * PX;
      return box(base, `<svg width="${w}" height="${h}"><polygon points="0,0 ${w * 0.7},0 ${w},${h / 2} ${w * 0.7},${h} 0,${h} ${w * 0.3},${h / 2}" fill="#${op.fill}"/></svg>`);
    }
    case 'triangle': {
      const w = op.w * PX, h = op.h * PX;
      return box(base, `<svg width="${w}" height="${h}"><polygon points="${w / 2},0 ${w},${h} 0,${h}" fill="#${op.fill}"/></svg>`);
    }
    case 'text': {
      const size = op.size * PX / 72;
      const lh = (op.lh || 1) * 1.32;
      const alignItems = op.valign === 'middle' ? 'center' : op.valign === 'bottom' ? 'flex-end' : 'flex-start';
      const weight = op.bold ? 700 : 400;
      const style = `${base}display:flex;align-items:${alignItems};justify-content:${op.align === 'center' ? 'center' : op.align === 'right' ? 'flex-end' : 'flex-start'};font-size:${size.toFixed(2)}px;line-height:${lh};color:#${op.color};font-family:'${op.font}','Microsoft YaHei',sans-serif;font-weight:${weight};${op.italic ? 'font-style:italic;' : ''}${op.tracking ? `letter-spacing:${(op.tracking * PX) / 72}px;` : ''}text-align:${op.align};white-space:pre-wrap;word-break:break-word;overflow:visible;`;
      return box(style, `<div style="width:100%;">${esc(op.text)}</div>`);
    }
    case 'image': {
      const url = imgUrl(op.src, baseDir);
      if (!url) return '';
      const fit = op.fit === 'contain' ? 'contain' : 'cover';
      return box(`${base}background:url('${url}') center/100% 100% no-repeat;`, `<img src="${url}" style="width:100%;height:100%;object-fit:${fit};object-position:center;display:block;"/>`);
    }
    case 'chart':
      return box(base, chartSvg(op));
    default:
      return '';
  }
}

function renderHtml(spec, result) {
  const theme = result.theme;
  const baseDir = process.cwd();
  const slides = result.pages.map((p) => {
    const inner = p.ops.map((o) => opHtml(o, baseDir)).join('\n');
    return `<section class="slide" style="background:#${theme.bg}">
      <div class="idx">${p.index} · ${esc(p.name)}</div>
      ${inner}
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"/>
<title>${esc(spec.meta.title || '预览')} · 预览</title>
<style>
  :root { color-scheme: light; }
  body{margin:0;background:#eceeec;font-family:'Microsoft YaHei','微软雅黑',sans-serif;color:#222;}
  header.bar{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #ddd;padding:10px 22px;display:flex;gap:16px;align-items:baseline;}
  header.bar h1{font-size:15px;margin:0;font-weight:700;}
  header.bar span{font-size:12px;color:#777;}
  .stack{display:flex;flex-direction:column;gap:20px;padding:20px;align-items:center;}
  .slide{position:relative;width:1280px;height:720px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.14);flex:0 0 auto;}
  .idx{position:absolute;right:6px;top:6px;font-size:11px;color:#aaa;background:rgba(255,255,255,.8);padding:1px 5px;border-radius:3px;}
  @media (max-width:1360px){ .slide{transform:scale(.72);transform-origin:top center;margin-bottom:-200px;} }
  @media print{ body{background:#fff;} .stack{gap:0;padding:0;} .slide{box-shadow:none;page-break-after:always;} header.bar{display:none;} }
</style></head>
<body>
<header class="bar"><h1>${esc(spec.meta.course || '')} ${esc(spec.meta.title || '')}</h1>
<span>主题 ${esc(theme.name)} · ${result.pages.length} 页 · 版式 ${[...new Set(result.pages.map((p) => p.layout))].length} 种</span>
<span>HTML 预览仅用于版式核对，字体与换行以 PowerPoint 实际渲染为准</span></header>
<div class="stack">
${slides}
</div>
</body></html>`;
}

module.exports = { renderHtml };
