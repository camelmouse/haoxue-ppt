// Color Engine —— 把「4 个种子色」展开成一套有层次的配色（11 档色阶 + 表面体系 + 强调 + 语义）
//
// 设计立场（对应 references/color-engine.md）：
//   少色相、多色阶   一个色相从 50 到 950 分工，靠明度拉层级，而不是多塞颜色
//   少纯色、多表面   canvas / surface1 / surface2 三层，且都不许是 #FFFFFF
//   有主次           canvas 55%–70%，主色家族 25%–35%，强调 ≤10%
//   有温度           ink 是暖黑不是 #000，paper 是暖白不是 #FFF
//
// 色阶不是「把主色调亮/调暗」：直接 shade() 会把深色端压成脏黑、浅色端洗成灰。
// 这里在 HSL 里固定明度阶梯，同时按档位收敛饱和度（越靠两端越灰），
// 并把最浅三档往 paper 混合——所以浅色是「暖的浅」，不是「灰的浅」。

const fs = require('fs');
const path = require('path');
const { norm, rgb, hex, mix, contrast, luminance } = require('./color');

const COLORS_PATH = path.join(__dirname, '..', '..', 'assets', 'colors.json');

let CACHE = null;
function load() {
  if (!CACHE) CACHE = JSON.parse(fs.readFileSync(COLORS_PATH, 'utf8'));
  return CACHE;
}
function all() { return load().families; }
function guide() { return load().weightGuide || {}; }
function ladder() { return load().roleLadder || {}; }

// ---------- HSL ----------
function toHsl(c) {
  const { r, g, b } = rgb(c);
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === R) h = ((G - B) / d + (G < B ? 6 : 0));
    else if (mx === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rr = 0, gg = 0, bb = 0;
  if (hp < 1) [rr, gg, bb] = [c, x, 0];
  else if (hp < 2) [rr, gg, bb] = [x, c, 0];
  else if (hp < 3) [rr, gg, bb] = [0, c, x];
  else if (hp < 4) [rr, gg, bb] = [0, x, c];
  else if (hp < 5) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  const m = l - c / 2;
  return hex({ r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 });
}

// 明度阶梯：浅端固定（浅色需要稳定），深端围绕种子色的明度展开（600–950 跟着 seed 走）。
// 这样用户给的 HEX 基本就落在 700 档上——"我选的颜色"真的出现在标题里，而不是被调淡一档。
const LADDER_LIGHT = [
  [50, 0.958, 0.45, 0.42],
  [100, 0.912, 0.55, 0.26],
  [200, 0.836, 0.72, 0.12],
  [300, 0.735, 0.86, 0.00],
  [400, 0.620, 0.95, 0.00],
];
const DEEP_STEPS = [
  // [档位, 相对 700 的明度偏移, 饱和度系数]
  [500, 0.160, 1.00],
  [600, 0.090, 1.00],
  [700, 0.000, 1.00],
  [800, -0.075, 0.95],
  [900, -0.135, 0.88],
  [950, -0.200, 0.80],
];

// 生成 11 档。paper 用于给浅端「上温度」——同一套主色，纸白偏暖，浅档也跟着暖。
function tones(seed, paper) {
  const { h, s, l } = toHsl(norm(seed));
  const anchor = Math.max(0.15, Math.min(0.40, l));  // 700 档的明度
  const out = {};
  for (const [step, lt, satK, paperMix] of LADDER_LIGHT) {
    let c = fromHsl(h, Math.min(1, s * satK), lt);
    if (paperMix) c = mix(c, norm(paper || 'FFFFFF'), paperMix);
    out[step] = c;
  }
  // 深端按种子明度缩放偏移：极深的种子（炭黑类）偏移要整体收窄，
  // 否则 800/900/950 会被下限挤成一坨；700 档始终保持 = 种子。
  const dlK = Math.min(1, anchor / 0.32);
  for (const [step, dL, satK] of DEEP_STEPS) {
    const lt = Math.max(0.05, Math.min(0.62, anchor + dL * dlK));
    out[step] = fromHsl(h, Math.min(1, s * satK), lt);
  }
  return out;
}

// ---------- 家族解析 ----------
function family(idOrName) {
  if (!idOrName) return null;
  const raw = String(idOrName).trim();
  const k = raw.toLowerCase();
  return all().find((f) => f.id === k || String(f.code).toLowerCase() === k
    || f.name === raw || f.code === raw.toUpperCase()) || null;
}

// 按课程名挑家族（只在没显式指定时用）
function autoFamily(text) {
  const rules = load().autoRules || [];
  const s = String(text || '');
  let best = null, bestHits = 0;
  for (const r of rules) {
    const hits = (r.match || []).filter((w) => s.includes(w)).length;
    if (hits > bestHits) { best = r.family; bestHits = hits; }
  }
  return best;
}

// ---------- 生成一套完整 token ----------
function build(fam) {
  if (!fam) throw new Error('缺少色族');
  if (fam.custom || !fam.primary) {
    throw new Error(`色族 ${fam.code} 需要先提取种子色：node scripts/palette.js from <纸白> <主色> <强调> <墨色>`);
  }
  const paper = norm(fam.paper || 'F5F2EA');
  const ink = norm(fam.ink || '241F1A');
  const accent = norm(fam.accent);
  const tone = tones(fam.primary, paper);

  const surface = mix(paper, 'FFFFFF', 0.70);        // 面板：比纸白亮，但不是纯白
  const surfaceAlt = mix(paper, tone[600], 0.10);    // 第二层：微带主色，卡片分区靠它
  const primary = tone[700];
  const deep = mix(tone[950], ink, 0.22);            // 深色页：主色最深档 + 一点墨，避免"纯色块"
  const deepAlt = mix(tone[900], ink, 0.12);
  const deepInk = norm(fam.deepInk || 'FBF8F2');
  const deepMuted = mix(deepInk, deep, 0.40);

  const t = {
    id: fam.id,
    code: fam.code,
    name: fam.name,
    base: fam.primary,
    family: { code: fam.code, id: fam.id, name: fam.name },
    tone,                       // 11 档：50/100/200/300/400/500/600/700/800/900/950
    // ---- 表面体系：三层，永远不用纯白 ----
    bg: paper,
    surface,
    surfaceAlt,
    veil: mix(paper, tone[600], 0.05),
    veilDeep: mix(paper, tone[600], 0.09),
    // ---- 主色体系 ----
    primary,
    // 主色浅底（结论条/强调卡/导航徽章底）：用 400 档而不是 600——
    // 600 偏暗，混出来是"灰粉"；400 鲜亮，混出来才是"干净的玫瑰 tint"。
    primarySoft: mix(paper, tone[400], 0.20),
    primaryLine: tone[300],
    // ---- 强调体系 ----
    accent,
    accentSoft: mix(paper, accent, 0.15),
    // 强调色块上的文字色（徽章字母）：在"深墨"和"纸白"里挑对比度更高的那个——
    // 中等明度的强调色（灰蓝/青绿）配白字只有 ~2.9:1，配深墨反而 5:1+。
    accentInk: contrast(deep, accent) >= contrast(deepInk, accent) ? deep : deepInk,
    // ---- 文字体系：暖黑而不是纯黑 ----
    ink,
    inkSoft: mix(ink, paper, 0.24),
    body: mix(ink, paper, 0.16),
    muted: mix(ink, paper, 0.44),
    line: mix(paper, ink, 0.14),
    lineSoft: mix(paper, ink, 0.07),
    // ---- 深色页 ----
    deep,
    deepAlt,
    deepInk,
    deepMuted,
    // ---- 语义色：从色族内部推导，保证不引入第 4 个色相 ----
    sem: {
      pos: mix(tone[600], '2F7A5B', 0.45),
      neg: mix(tone[700], '9E3B2E', 0.40),
      warn: mix(accent, 'C08A2E', 0.45),
      info: tone[600],
    },
    // ---- 图表：主色阶在前，强调色插在第二位，保证系列可分辨 ----
    chart: [tone[700], accent, tone[500], mix(tone[400], accent, 0.35), tone[300], mix(tone[600], paper, 0.35)],
    mood: fam.mood,
    bestFor: fam.bestFor || [],
    why: fam.why,
    radius: fam.radius === undefined ? 0.06 : fam.radius,
    fonts: Object.assign({ title: '微软雅黑', body: '微软雅黑', serifTitle: !!fam.serif }, fam.fonts || {}),
    dark: false,
  };
  return t;
}

// ---------- 配比卡：告诉用户这套色「目标面积」是多少 ----------
function plan(t) {
  const g = guide();
  const rows = [
    { role: '页面底 / 大留白', token: 'bg', hex: t.bg, share: g.canvas || 60, note: '暖白，不是 #FFFFFF' },
    { role: '面板 / 卡片', token: 'surface', hex: t.surface, share: 6, note: '比纸白亮一档' },
    { role: '信息区 / 交替面层', token: 'surfaceAlt', hex: t.surfaceAlt, share: 4, note: '微带主色' },
    { role: '主色色阶（标题 / 色块 / 图表）', token: 'primary', hex: t.primary, share: g.primary || 22, note: '700 做标题，600/500 做块' },
    { role: '浅主色（标签 / 重点底）', token: 'primarySoft', hex: t.primarySoft, share: 0, note: '100 档，算进主色家族' },
    { role: '深色页（封面 / 章节 / 结论）', token: 'deep', hex: t.deep, share: 0, note: '950 档' },
    { role: '强调（数字 / 关键线 / 图标）', token: 'accent', hex: t.accent, share: g.accent || 5, note: '≤10%，超了就是花' },
    { role: '强调浅底', token: 'accentSoft', hex: t.accentSoft, share: 0, note: '一小块，不铺满' },
    { role: '正文 / 标题文字', token: 'ink', hex: t.ink, share: g.semantic || 3, note: '暖黑' },
  ];
  return rows;
}

// ---------- 对比度自检（Color Engine 的 Contrast QA）----------
function audit(t) {
  const issues = [];
  const pairs = [
    ['正文 / 页面底', t.body, t.bg, 4.5, 'error'],
    ['标题 / 页面底', t.ink, t.bg, 7.0, 'error'],
    ['正文 / 面板', t.body, t.surface, 4.5, 'error'],
    ['标题 / 浅主色底', t.ink, t.primarySoft, 4.5, 'error'],
    ['次级 / 页面底', t.muted, t.bg, 3.0, 'warn'],
    ['深底文字 / 深底', t.deepInk, t.deep, 7.0, 'error'],
    ['深底次级 / 深底', t.deepMuted, t.deep, 3.0, 'warn'],
    ['强调 / 页面底', t.accent, t.bg, 2.2, 'warn'],
  ];
  for (const [name, fg, bg, min, level] of pairs) {
    const r = contrast(fg, bg);
    if (r < min) issues.push({ level, name, ratio: +r.toFixed(2), min, msg: `${name} 对比度 ${r.toFixed(2)}:1（需 ≥${min}）` });
  }
  // 纯白 / 纯黑 / 只有一层表面 —— 这三条是「页面显素」的真正原因
  if (norm(t.bg) === 'FFFFFF') issues.push({ level: 'warn', name: '纯白底', msg: '页面底是 #FFFFFF：换成带温度的纸白（C01–C09 都有），一改就厚' });
  if (norm(t.ink) === '000000') issues.push({ level: 'warn', name: '纯黑字', msg: '正文是 #000000：换成带色相的暖黑/冷黑' });
  if (norm(t.surface) === norm(t.bg)) issues.push({ level: 'warn', name: '无面层', msg: '面板与页面底同色：卡片会消失，至少差一档明度' });
  const span = Math.abs(luminance(t.deep) - luminance(t.bg));
  if (span < 0.35) issues.push({ level: 'warn', name: '无深浅', msg: '深色页与页面底明度差不足：封面/章节页立不起来' });
  return issues;
}

// ---------- C10：从参考 PPT 的取色结果反推种子 ----------
// 输入是「hex + 面积占比」的列表（dna.py 输出的 palette），输出一套 family。
// 关键：不是取最饱和的那个当主色，而是按角色分工各取一个。
function fromColors(colors) {
  const list = (colors || [])
    .map((c) => ({ hex: norm(typeof c === 'string' ? c : c.hex), share: typeof c === 'string' ? 1 : (c.share || 1) }))
    .filter((c) => c.hex && c.hex !== '000000');
  if (list.length < 2) throw new Error('至少需要 2 个颜色（纸白 + 主色）');
  const hsl = list.map((c) => ({ ...c, ...toHsl(c.hex), lum: luminance(c.hex) }));
  const byLum = [...hsl].sort((a, b) => a.lum - b.lum);
  // 纸白：最亮的、且不是纯白的那一档
  const paper = (byLum.filter((c) => c.lum > 0.72 && c.hex !== 'FFFFFF').pop() || byLum[byLum.length - 1]).hex;
  // 墨色：最暗的，且饱和度低（有色的深色留给主色）
  const ink = byLum[0].hex;
  // 主色：饱和且偏暗的那个（压得住标题）
  const primary = [...hsl].filter((c) => c.s > 0.12 && c.lum < 0.55).sort((a, b) => b.share - a.share)[0]
    || [...hsl].sort((a, b) => b.s - a.s)[0];
  // 强调：与主色色相相差 ≥25°、饱和且够亮的那个
  const accent = [...hsl]
    .filter((c) => c.hex !== primary.hex && c.hex !== paper && c.hex !== ink && c.s > 0.15)
    .filter((c) => Math.abs(((c.h - primary.h + 540) % 360) - 180) < 155)
    .sort((a, b) => (b.s * b.lum) - (a.s * a.lum))[0] || primary;
  return {
    code: 'C10',
    id: 'custom',
    name: '自定义（提取）',
    primary: primary.hex,
    accent: accent.hex,
    paper,
    ink,
    mood: '从参考 PPT / 学校 VI 提取',
    bestFor: ['沿用原系列', '学校 VI', '品牌指定'],
    why: `主色 ${primary.hex} / 强调 ${accent.hex} / 纸白 ${paper} / 墨色 ${ink}，再展开成 11 档`,
  };
}

module.exports = {
  all, family, autoFamily, tones, build, plan, audit, fromColors,
  guide, ladder, toHsl, fromHsl, LADDER_LIGHT, DEEP_STEPS, COLORS_PATH,
};
