// 文本度量：不依赖 canvas 的保守估算模型。
// 目的不是精确复制 PowerPoint 的排版，而是提前发现"明显放不下"的文本，
// 并给版式引擎一个稳定的断行依据。实测时以渲染图为准（scripts/render.py）。

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

// 微软雅黑在不同字号下的单字宽度系数（相对 em）
function charFactor(ch) {
  if (ch === ' ') return 0.30;
  if (ch === '\u3000') return 1.0;
  if (WIDE.test(ch)) {
    // 全角标点比汉字略窄
    if (/[\u3001\u3002\uFF0C\uFF1B\uFF1A\uFF01\uFF1F\uFF08\uFF09\u201C\u201D\u2018\u2019\u300A\u300B\u3010\u3011]/.test(ch)) return 0.92;
    return 1.0;
  }
  if (/[iljI.,:;'"!|]/.test(ch)) return 0.30;
  if (/[mwMW@%]/.test(ch)) return 0.86;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[a-z]/.test(ch)) return 0.53;
  return 0.55;
}

const LINE_RATIO = 1.32; // 微软雅黑单倍行高 ≈ 1.32em（保守取值）

// 字号阶梯：全站只用这些值，避免出现 13.2 / 13.5 / 14 这种"看起来差不多"的噪声字号。
// 下限 16pt——投影/录屏场景下 16pt 已经是可读的临界值，再小就只能靠放大屏幕。
// 刻度故意稀疏（相邻比 ≥1.12），这样"字号统一"是结构上保证的，不是靠自觉。
const SCALE = [16, 18, 21, 26, 34, 42, 52, 64, 80, 96];
const MIN_FONT = SCALE[0];

function snap(size, mode = 'near') {
  const v = Number(size) || 16;
  if (mode === 'down') {
    const lower = SCALE.filter((s) => s <= v + 0.01);
    return lower.length ? lower[lower.length - 1] : SCALE[0];
  }
  let best = SCALE[0], dist = Infinity;
  for (const s of SCALE) {
    const d = Math.abs(s - v);
    if (d < dist) { dist = d; best = s; }
  }
  return best;
}
// 从 size 往下取一个更小的阶梯值
function stepDown(size) {
  const lower = SCALE.filter((s) => s < size - 0.01);
  return lower.length ? lower[lower.length - 1] : null;
}

function textWidth(text, size, opts = {}) {
  const boldFactor = opts.bold ? 1.04 : 1.0;
  let w = 0;
  for (const ch of String(text)) {
    if (ch === '\n') continue;
    w += charFactor(ch);
  }
  return w * size * boldFactor; // pt
}

// 断行禁则（简易中文排版规则）
// 右引号/右括号不许出现在行首，左引号/左括号不许留在行尾——漏掉引号会排成
// 「……“感觉 / ”变成“证据”」，一行以孤零零的右引号开头，一眼就是机器排的。
const NO_LINE_START = /^[，。、；：？！）］｝」』】》〉”’·…‰%！？,.;:!?)\]}]$/;
const NO_LINE_END = /^[（［｛「『【《〈“‘([{]$/;
const ASCII_WORD = /[A-Za-z0-9\-_/.@%&+#'’]/;

// 切成"不可再分"的小块：连续 ASCII 词整体一块，其余逐字
function tokenize(str) {
  const toks = [];
  let buf = '';
  const push = (s, space) => toks.push({ s, w: s.length > 1 ? textWidth(s, 1) : charFactor(s), space: !!space });
  for (const ch of str) {
    if (ASCII_WORD.test(ch)) { buf += ch; continue; }
    if (buf) { push(buf); buf = ''; }
    push(ch, ch === ' ');
  }
  if (buf) push(buf);
  return toks;
}

// 返回按宽度折行后的行数组
// 规则：ASCII 词不拆；标点不出现在行首、开括号不留在行尾；优先在"空格"处断行，
// 但数字/字母后面的空格（如 "17 份"）不拆开，避免"17 / 份"这种断法。
function wrapText(text, size, widthIn, opts = {}) {
  const bold = opts.bold ? 1.04 : 1.0;
  const limit = (widthIn * 72) / (size * bold); // 以 em 计
  const out = [];
  for (const raw of String(text).split('\n')) {
    if (raw === '') { out.push(''); continue; }
    const toks = tokenize(raw);
    const widthOf = (a, b) => { let w = 0; for (let k = a; k < b; k += 1) w += toks[k].w; return w; };
    const join = (a, b) => toks.slice(a, b).map((t) => t.s).join('').replace(/ +$/, '');

    let i = 0;
    while (i < toks.length) {
      let j = i, w = 0, lastSpace = -1;
      while (j < toks.length) {
        if (w + toks[j].w > limit && j > i) break;
        w += toks[j].w;
        if (toks[j].space && (j === i || !ASCII_WORD.test(toks[j - 1].s))) lastSpace = j;
        j += 1;
      }
      if (j >= toks.length) { out.push(join(i, toks.length)); break; }

      let cut = j;
      if (NO_LINE_START.test(toks[cut].s) && cut - 1 > i) cut -= 1;
      else if (NO_LINE_END.test(toks[cut - 1].s) && cut - 1 > i) cut -= 1;
      if (lastSpace > i && lastSpace < cut && widthOf(i, lastSpace) >= limit * 0.55) cut = lastSpace;
      if (cut <= i) cut = j;

      out.push(join(i, cut));
      i = cut;
      while (i < toks.length && toks[i].space) i += 1;
    }
  }
  return out;
}

function blockHeight(lines, size, spacing = 1.0) {
  return (lines.length * size * LINE_RATIO * spacing) / 72; // inch
}

// 在给定框内找到能放下的最大字号（返回 { size, lines, overflow }）
function fitText(text, boxWidthIn, boxHeightIn, opts = {}) {
  const max = opts.max || 32;
  const min = Math.max(MIN_FONT, opts.min || MIN_FONT);
  let size = max;
  while (size >= min) {
    const lines = wrapText(text, size, boxWidthIn, opts);
    const h = blockHeight(lines, size, opts.spacing || 1.0);
    if (h <= boxHeightIn) return { size, lines, overflow: false };
    size -= 0.5;
  }
  const lines = wrapText(text, min, boxWidthIn, opts);
  return { size: min, lines, overflow: blockHeight(lines, min, opts.spacing || 1.0) > boxHeightIn };
}

module.exports = { textWidth, wrapText, blockHeight, fitText, LINE_RATIO, charFactor, SCALE, MIN_FONT, snap, stepDown };
