// 主题解析：id / 中文名 / 自动匹配 → 完整 token 集
const fs = require('fs');
const path = require('path');
const { norm, shade, mix, contrast, luminance } = require('./color');
const palette = require('./palette');

const THEMES_PATH = path.join(__dirname, '..', '..', 'assets', 'themes.json');

let CACHE = null;
function load() {
  if (!CACHE) CACHE = JSON.parse(fs.readFileSync(THEMES_PATH, 'utf8'));
  return CACHE;
}

function all() { return load().themes; }

// Color Families（c01–c10）：色阶 + 表面体系的生成式配色，见 references/color-engine.md
function families() { return palette.all(); }

function autoTheme(text) {
  // 先走 Color Engine：新课件优先落到 c01–c09（有完整色阶与表面层）
  const fam = palette.autoFamily(text);
  if (fam) return fam;
  const rules = load().autoRules || [];
  const s = String(text || '');
  let best = null, bestHits = 0;
  for (const r of rules) {
    const hits = (r.match || []).filter((k) => s.includes(k)).length;
    if (hits > bestHits) { best = r.theme; bestHits = hits; }
  }
  return best || load().default;
}

function tuneText(color, bg, target = 4.5) {
  if (contrast(color, bg) >= target) return norm(color);
  const lighten = luminance(bg) < 0.45;
  let c = norm(color);
  for (let k = 0.08; k <= 0.9; k += 0.08) {
    c = shade(color, lighten ? k : -k);
    if (contrast(c, bg) >= target) return c;
  }
  return lighten ? 'FFFFFF' : '111111';
}

function complete(t) {
  const out = { ...t };
  out.fonts = Object.assign({ title: '微软雅黑', body: '微软雅黑', serifTitle: false }, t.fonts || {});
  out.primary = norm(out.primary || out.base);
  out.accent = norm(out.accent);
  out.bg = norm(out.bg);
  out.surface = norm(out.surface || (out.dark ? shade(out.bg, 0.06) : 'FFFFFF'));
  out.surfaceAlt = norm(out.surfaceAlt || mix(out.bg, out.primary, 0.12));
  out.ink = norm(out.ink);
  out.body = norm(out.body || out.ink);
  out.muted = norm(out.muted || mix(out.body, out.bg, 0.45));
  out.line = norm(out.line || mix(out.bg, out.ink, 0.15));
  out.deep = norm(out.deep || out.primary);
  out.deepAlt = norm(out.deepAlt || shade(out.deep, 0.12));
  out.deepInk = norm(out.deepInk || (out.dark ? out.ink : 'FFFFFF'));
  out.deepMuted = norm(out.deepMuted || mix(out.deepInk, out.deep, 0.35));
  out.primarySoft = norm(out.primarySoft || mix(out.bg, out.primary, 0.15));
  out.accentSoft = norm(out.accentSoft || mix(out.bg, out.accent, 0.18));
  // 金属质感三原色：金线的亮端 / 本色 / 暗端。装饰线不做纯色——纯色细线在投影下
  // 会读成"灰条"，三段金属渐变才有"描金"的分量。
  out.accentLight = norm(out.accentLight || mix(out.accent, 'FFFFFF', 0.42));
  out.accentDeep = norm(out.accentDeep || shade(out.accent, -0.28));
  // 版面底层的"薄雾"与大色块：比 bg 深一档、比 surfaceAlt 更淡，用来分出版心
  out.veil = norm(out.veil || mix(out.bg, out.primary, 0.06));
  out.veilDeep = norm(out.veilDeep || mix(out.bg, out.primary, 0.12));
  // 深色页的边界与柔光：deepAlt 直接画线会和底同色（"线消失"的根因）
  out.deepEdge = norm(out.deepEdge || shade(out.deep, 0.26));
  out.deepGlow = norm(out.deepGlow || mix(out.deep, out.accent, 0.08));
  out.inkSoft = norm(out.inkSoft || mix(out.ink, out.bg, 0.24));
  out.lineSoft = norm(out.lineSoft || mix(out.bg, out.line, 0.5));
  out.radius = out.radius === undefined ? 0.05 : out.radius;
  out.chart = (out.chart || []).map(norm);
  out.dark = !!out.dark;
  // 文本安全色：亮底上的强调色需要压深，深底上需要提亮
  out.accentText = tuneText(out.accent, out.bg, 4.5);
  // 强调色块（徽章/圆点）上的文字：强调色亮就用深墨，暗就用深底纸白
  out.accentInk = norm(out.accentInk
    || (contrast(out.deep, out.accent) >= contrast(out.deepInk, out.accent) ? out.deep : out.deepInk));
  out.primaryText = tuneText(out.primary, out.bg, 4.5);
  // ---- 页内强调 token（关键词高亮用）----
  // em：正文里 **关键词** 的颜色——就是主色，但必须对页底 ≥4.5；深色卡上换 emOnDeep。
  // emAccent：!!焦点!! 的颜色；深色卡上换 accentOnDeep。
  // 有了这两个 token，"重点在哪"由颜色自己说话，而不是靠加粗硬撑。
  // !!焦点!! 的荧光笔底色：比 accentSoft 更浅一档，只做"笔迹"不做色块
  out.hlMark = norm(out.hlMark || mix(out.accentSoft || out.accent, out.bg, 0.45));
  out.em = norm(out.em || out.primaryText);
  out.emAccent = norm(out.emAccent || out.accentText);
  out.emOnDeep = norm(out.emOnDeep || tuneText(mix(out.primary, 'FFFFFF', 0.55), out.deep, 4.5));
  out.mutedText = tuneText(out.muted, out.bg, 3.2);
  out.accentOnDeep = contrast(out.accent, out.deep) >= 3.2 ? out.accent : out.deepInk;
  return out;
}

function resolve(nameOrId) {
  if (!nameOrId) return complete(all().find((t) => t.id === load().default));
  const k = String(nameOrId).toLowerCase().trim();
  // 1) Color Family（c01–c10 / sage / 森林鼠尾草）—— 优先于旧主题
  const fam = palette.family(nameOrId);
  if (fam) {
    const t = complete(palette.build(fam));
    t.source = 'family';
    t.paletteIssues = palette.audit(t);
    return t;
  }
  const hit = all().find((t) => t.id === k || t.name === nameOrId);
  if (hit) { const t = complete(hit); t.source = 'legacy'; return t; }
  // 允许直接给主色
  if (/^#?[0-9a-f]{6}$/i.test(k)) return fromColor(k);
  throw new Error(`未知主题：${nameOrId}。色族：${palette.all().map((f) => `${f.code.toLowerCase()}(${f.name})`).join('、')}；旧主题：${all().map((t) => t.id).join('、')}`);
}

// 自定义主色：只给一个 HEX 时，也走色阶生成（C10 的简化路径），
// 纸白/墨色取中性暖底，强调色取主色相邻 +12° 的亮档——只引入半个色相，
// 避免"用户给一个蓝，结果自己又长出一个紫"。
function fromColor(color) {
  const c = norm(color);
  const { h, s } = palette.toHsl(c);
  const fam = {
    code: 'C10',
    id: 'custom',
    name: `自定义 ${c}`,
    primary: c,
    accent: palette.fromHsl(h + 12, Math.min(1, s * 0.92), 0.56),
    paper: 'F6F3EC',
    ink: '241F1A',
    mood: '单色自定义：以色阶拉开层次',
  };
  const t = complete(palette.build(fam));
  t.id = 'custom';
  t.source = 'family';
  t.paletteIssues = palette.audit(t);
  return t;
}

// 主题自检：返回语义对比度不达标的项
function audit(t) {
  const issues = [];
  const pairs = [
    ['ink/bg 标题', t.ink, t.bg, 4.5],
    ['body/bg 正文', t.body, t.bg, 4.5],
    ['muted/bg 次级', t.muted, t.bg, 3.0],
    ['ink/surface 标题', t.ink, t.surface, 4.5],
    ['deepInk/deep 深底文字', t.deepInk, t.deep, 4.5],
    ['deepMuted/deep 深底次级', t.deepMuted, t.deep, 3.0],
    ['accent/bg 强调', t.accent, t.bg, 2.2],
    ['primary/bg 主色', t.primary, t.bg, 2.2],
  ];
  for (const [name, fg, bg, min] of pairs) {
    const r = contrast(fg, bg);
    if (r < min) issues.push({ name, fg, bg, ratio: +r.toFixed(2), min });
  }
  return issues;
}

module.exports = { all, families, resolve, autoTheme, audit, complete, THEMES_PATH };
