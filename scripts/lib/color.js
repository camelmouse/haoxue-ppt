// 颜色工具：统一 6 位十六进制、明暗调整、对比度计算

function norm(c) {
  if (!c) return '000000';
  let s = String(c).replace('#', '').trim().toUpperCase();
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  if (!/^[0-9A-F]{6}$/.test(s)) return '000000';
  return s;
}

function rgb(c) {
  const s = norm(c);
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

function hex({ r, g, b }) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  return f(r) + f(g) + f(b);
}

// amt > 0 变亮，< 0 变暗（0-1）
function shade(c, amt) {
  const { r, g, b } = rgb(c);
  if (amt >= 0) return hex({ r: r + (255 - r) * amt, g: g + (255 - g) * amt, b: b + (255 - b) * amt });
  return hex({ r: r * (1 + amt), g: g * (1 + amt), b: b * (1 + amt) });
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

function luminance(c) {
  const { r, g, b } = rgb(c);
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// 在候选色里挑与背景对比度最高的
function readable(bg, candidates, minRatio = 4.5) {
  let best = candidates[0], bestRatio = 0;
  for (const c of candidates) {
    const r = contrast(bg, c);
    if (r > bestRatio) { best = c; bestRatio = r; }
    if (r >= minRatio) return c;
  }
  return best;
}

module.exports = { norm, rgb, hex, shade, mix, luminance, contrast, readable };
