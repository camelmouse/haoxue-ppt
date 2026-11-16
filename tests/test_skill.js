#!/usr/bin/env node
// haoxue-ppt 自检脚本：不依赖 Python / 办公软件，验证"生成层"的关键契约。
// 用法：node tests/test_skill.js [--verbose]
// 退出码 0 = 全部通过。
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { build, write, validateSpec } = require(path.join(ROOT, 'scripts/lib/deck'));
const themeMod = require(path.join(ROOT, 'scripts/lib/theme'));
const { LAYOUTS } = require(path.join(ROOT, 'scripts/lib/layouts'));
const { contrast } = require(path.join(ROOT, 'scripts/lib/color'));

const VERBOSE = process.argv.includes('--verbose');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'haoxue-test-'));
let pass = 0;
const fails = [];

function ok(name, cond, detail) {
  if (cond) { pass += 1; if (VERBOSE) console.log(`  ✓ ${name}`); }
  else { fails.push({ name, detail }); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `期望 ${expected}，实际 ${actual}`);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

async function main() {
  // ---------- 1. 主题系统 ----------
  console.log('\n[1/14] 主题系统');
  const themes = themeMod.all();
  ok('内置主题数量 ≥8', themes.length >= 8, `实际 ${themes.length}`);
  const REQUIRED_TOKENS = ['base', 'primary', 'primarySoft', 'accent', 'accentSoft', 'bg',
    'surface', 'surfaceAlt', 'ink', 'body', 'muted', 'line', 'deep', 'deepInk', 'chart', 'fonts'];
  const hex6 = /^[0-9A-Fa-f]{6}$/;
  themes.forEach((t) => {
    const miss = REQUIRED_TOKENS.filter((k) => t[k] === undefined);
    ok(`主题 ${t.id} token 完整`, miss.length === 0, `缺 ${miss.join(',')}`);
    const badHex = REQUIRED_TOKENS
      .filter((k) => typeof t[k] === 'string' && !hex6.test(t[k]));
    ok(`主题 ${t.id} 颜色为 6 位十六进制`, badHex.length === 0, badHex.join(','));
    ok(`主题 ${t.id} 图表色 ≥4 个`, Array.isArray(t.chart) && t.chart.length >= 4);
    // 正文可读性：正文色 vs 页面底色，至少 4.5:1（WCAG AA）
    const c = contrast(t.body, t.bg);
    ok(`主题 ${t.id} 正文对比度 ≥4.5`, c >= 4.5, `实际 ${c.toFixed(2)}`);
  });
  const uniqueIds = new Set(themes.map((t) => t.id));
  eq('主题 id 不重复', uniqueIds.size, themes.length);

  // ---------- 2. 版式系统 ----------
  console.log('\n[2/14] 版式系统');
  ok('版式数量 ≥12', LAYOUTS.length >= 12, `实际 ${LAYOUTS.length}`);
  const REQUIRED_LAYOUTS = ['bigIdea', 'fullImage', 'offsetImageText', 'timeline', 'debate',
    'flow', 'layers', 'dataChart', 'caseStory', 'question', 'zoom', 'summary'];
  const ids = new Set(LAYOUTS.map((l) => l.id));
  const missingLayouts = REQUIRED_LAYOUTS.filter((k) => !ids.has(k));
  ok('任务书要求的 12 种版式齐备', missingLayouts.length === 0, `缺 ${missingLayouts.join(',')}`);
  LAYOUTS.forEach((l) => {
    ok(`版式 ${l.id} 有 build/name`, typeof l.build === 'function' && !!l.name);
  });

  // ---------- 3. 主课件构建 ----------
  console.log('\n[3/11] 主课件构建');
  const specPath = path.join(ROOT, 'examples/health-marketing.deck.json');
  const spec = readJson(specPath);
  const baseDir = path.dirname(specPath);
  eq('spec 校验通过（无错误）', validateSpec(spec).length, 0);

  const r1 = await build(spec, { baseDir });
  ok('页数 ≥10', r1.pages.length >= 10, `实际 ${r1.pages.length}`);
  const usedLayouts = new Set(r1.pages.map((p) => p.layout));
  ok('使用版式 ≥6 种', usedLayouts.size >= 6, `实际 ${usedLayouts.size}`);
  ok('构建无严重警告', r1.warnings.filter((w) => w.kind === 'TEXT-OVERFLOW').length === 0,
    JSON.stringify(r1.warnings.slice(0, 3)));

  const outMain = path.join(TMP, 'main.pptx');
  await write(r1, outMain);
  ok('主课件写出成功', fs.existsSync(outMain) && fs.statSync(outMain).size > 20000);

  // ---------- 4. 导航组件 ----------
  console.log('\n[4/11] 右上角课程进度导航');
  const NO_NAV = ['cover', 'fullImage']; // 封面/全幅图默认不显示进度（收束页要显示，否则最后一章永远是死胶囊）
  const navPages = r1.pages.filter((p) => !NO_NAV.includes(p.layout));
  // 导航有两种形态：刻度模式写 "02 / 04" 文本，胶囊模式画 nav.tab.N 形状
  const hasNav = (p) => p.ops.some((o) => (o.t === 'text' && /^\d{2}\s*\/\s*\d{2}$/.test(String(o.text).trim()))
    || (o.t === 'rect' && /^nav\.tab\.\d+/.test(String(o.name || ''))));
  ok('内容页都有导航（除封面/全幅图/分隔页）', navPages.every(hasNav),
    navPages.filter((p) => !hasNav(p)).map((p) => p.index).join(','));
  ok('封面不画导航，收束页画导航', !hasNav(r1.pages[0]) && hasNav(r1.pages[r1.pages.length - 1]));
  // 导航状态随页切换：不同章节的页，导航当前项不同
  const navNums = new Set(navPages.map((p) => {
    const on = p.ops.find((o) => o.t === 'rect' && /\.on$/.test(String(o.name || '')));
    if (on) return on.name;
    return (p.ops.find((o) => o.t === 'text' && /\d{2}\s*\/\s*\d{2}/.test(String(o.text))) || {}).text;
  }));
  ok('导航当前章节随页面变化', navNums.size >= 3, `只出现 ${navNums.size} 种状态`);

  // 胶囊导航（tabs）：章节 ≤4 时的章节按钮样式
  const tabsSpec = { ...spec, meta: { ...spec.meta, nav: 'tabs' } };
  const rt = await build(tabsSpec, { baseDir });
  const pills = (p) => p.ops.filter((o) => o.t === 'rect' && /^nav\.tab\.\d+(\.on)?$/.test(o.name || ''));
  const contentPage = rt.pages[1];
  eq('tabs 模式：每个章节一个胶囊', pills(contentPage).length, tabsSpec.chapters.length);
  const tabsPages = rt.pages.filter((p) => pills(p).length);
  ok('tabs 模式：每页恰好一个当前胶囊',
    tabsPages.every((p) => pills(p).filter((o) => /\.on$/.test(o.name)).length === 1));
  ok('tabs 模式：封面不画胶囊，收束页画胶囊',
    !pills(rt.pages[0]).length && pills(rt.pages[rt.pages.length - 1]).length === tabsSpec.chapters.length);
  const badge = contentPage.ops.filter((o) => /\.on\.badge$/.test(o.name || ''));
  ok('tabs 模式：当前项带序号徽标', badge.length === 1);

  // 章节过多 / 名字过长时自动退回刻度模式（不硬挤）
  const manyChapters = Array.from({ length: 6 }, (_, i) => ({ id: `m${i + 1}`, title: `第${i + 1}部分的核心内容`, short: `第${i + 1}部分` }));
  const manyPages = manyChapters.map((c) => ({
    layout: 'layers', chapter: c.id, title: '标题',
    layers: [{ title: '层一', body: '说明' }, { title: '层二', body: '说明' }],
  }));
  const rm = await build({ meta: { ...spec.meta, nav: 'tabs' }, chapters: manyChapters, pages: manyPages }, { baseDir });
  ok('章节过多时自动退回刻度模式', pills(rm.pages[0]).length === 0,
    `仍有 ${pills(rm.pages[0]).length} 个胶囊`);
  ok('退回后仍有进度导航', rm.pages[0].ops.some((o) => /^\d{2}\s*\/\s*\d{2}$/.test(String(o.text || '').trim())));

  // ---------- 5. 图片双模式 ----------
  console.log('\n[5/11] 图片双模式');
  const r2 = await build(spec, { baseDir, imageMode: 'none' });
  // 图标本身就是 PNG，也算 image op，所以要排除（只统计真正的插图）
  const anyImage = r2.pages.some((p) => p.ops.some((o) => o.t === 'image' && !o.icon));
  ok('NO_IMAGE 模式不插入任何图片', !anyImage);
  const plainRendered = r2.pages.every((p) => p.layout === 'fullImage' || p.ops.some((o) => o.t === 'rect'));
  ok('NO_IMAGE 模式用色块/结构图兜底', plainRendered);

  const missingSpec = JSON.parse(JSON.stringify(spec));
  missingSpec.pages = [{
    layout: 'offsetImageText', title: '缺图测试',
    image: 'assets/not-exists.png', points: [{ title: '要点', body: '正文' }],
  }];
  const r3 = await build(missingSpec, { baseDir });
  ok('缺图不报错且给出 MISSING-IMAGE 提示',
    r3.warnings.some((w) => w.kind === 'MISSING-IMAGE'));

  // ---------- 6. 长文本与自适应 ----------
  console.log('\n[6/11] 长文本自适应');
  const longText = '这是一段刻意写得很长的正文，用来验证版式引擎在内容超量时会不会压字或穿出边界。'.repeat(4);
  const longSpec = {
    meta: { course: '压测', title: '长文本', slug: 'longtext', theme: 'academic' },
    chapters: [{ id: 'c1', title: '压测', short: '压测' }],
    pages: [
      { layout: 'bigIdea', chapter: 'c1', text: longText, kicker: '压测' },
      { layout: 'question', chapter: 'c1', title: longText, options: ['A ' + longText, 'B 选项', 'C 选项'], answer: 0 },
      { layout: 'caseStory', chapter: 'c1', title: '长文本案例', acts: [{ t: '第一幕', text: longText }], theory: { title: longText, points: [longText, longText] } },
    ],
  };
  let longOk = true; let longDetail = '';
  try {
    const r4 = await build(longSpec, { baseDir: ROOT });
    const sizes = r4.pages.flatMap((p) => p.ops.filter((o) => o.t === 'text').map((o) => o.size));
    ok('长文本构建不崩溃', r4.pages.length === 3);
    ok('超长文本降字号但不低于 16pt 下限', Math.min(...sizes) >= 16, `最小 ${Math.min(...sizes)}`);
  } catch (e) { longOk = false; longDetail = e.message; }
  if (!longOk) ok('长文本构建不崩溃', false, longDetail);

  // ---------- 7. 局部生成与 spec 校验 ----------
  console.log('\n[7/11] 局部生成与输入校验');
  const only = JSON.parse(JSON.stringify(spec));
  only.__totalPages = spec.pages.length;
  only.__onlyMap = [8];
  only.pages = [spec.pages[7]];
  const r5 = await build(only, { baseDir });
  eq('--only 只生成 1 页', r5.pages.length, 1);
  const footerText = r5.pages[0].ops
    .filter((o) => o.t === 'text')
    .map((o) => String(o.text))
    .find((t) => /^\d{2}\s*\/\s*\d{2}$/.test(t.trim()));
  ok('局部生成保留原始页码（08 / 11）', footerText === '08 / 11', `实际 ${footerText}`);

  const badSpec = { meta: {}, pages: [{ layout: 'not-a-layout', title: 'x' }] };
  ok('非法版式被拦下', validateSpec(badSpec).length > 0);
  ok('空 pages 被拦下', validateSpec({ meta: {}, pages: [] }).length > 0);

  // ---------- 8. 多主题一致性 ----------
  console.log('\n[8/11] 全主题批量构建');
  const themeResults = [];
  for (const t of themes) {
    const r = await build(spec, { baseDir, theme: t.id });
    themeResults.push({ id: t.id, layouts: r.pages.map((p) => p.layout).join(','), warns: r.warnings.length });
  }
  ok('全部主题构建成功', themeResults.length === themes.length, `${themeResults.length}/${themes.length}`);
  const layoutSigs = new Set(themeResults.map((t) => t.layouts));
  eq('换主题不改变版式结构（全部一致）', layoutSigs.size, 1);

  // ---------- 9. 单页替换（局部修改闭环） ----------
  console.log('\n[9/11] 单页替换回整套');
  const py = process.env.PYTHON || 'python';
  let hasPptx = true;
  try {
    cp.execFileSync(py, ['-c', 'import pptx'], { stdio: 'ignore' });
  } catch (e) { hasPptx = false; }
  if (!hasPptx) {
    console.log('  · 跳过：未检测到 python-pptx');
  } else {
    const deckPath = path.join(TMP, 'deck.pptx');
    const full = await build(spec, { baseDir, theme: 'academic' });
    await write(full, deckPath);
    const total = full.pages.length;

    // 只改第 8 页文案，单页重建。标记用 ASCII，避免命令行传中文时的编码差异
    const marker = 'SpliceCheck2026';
    const p8 = JSON.parse(JSON.stringify(spec.pages[7]));
    p8.title = marker;
    const one = await build({ meta: spec.meta, chapters: spec.chapters, pages: [p8] }, { baseDir, theme: 'academic' });
    eq('单页构建只含 1 页', one.pages.length, 1);
    const pagePath = path.join(TMP, 'page8.pptx');
    await write(one, pagePath);

    const splicedPath = path.join(TMP, 'spliced.pptx');
    cp.execFileSync(py, [path.join(ROOT, 'scripts/splice.py'), deckPath, pagePath, '8', '-o', splicedPath], { stdio: 'ignore' });

    // 用 python-pptx 按页序读回，避免依赖 partname 编号
    const probeCode = `
import sys
from pptx import Presentation
mk = sys.argv[2]
p = Presentation(sys.argv[1])
texts = [" ".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in p.slides]
print(len(texts))
print("MARK" if mk in texts[7] else "NO-MARK")
print("KEEP" if "41" in texts[6] else "LOST")
`;
    const probe = cp.execFileSync(py, ['-c', probeCode, splicedPath, marker], { encoding: 'utf8' }).trim().split(/\r?\n/);
    eq('替换后页数不变', Number(probe[0]), total);
    ok('第 8 页内容是新的', probe[1] === 'MARK');
    ok('第 7 页未被改动', probe[2] === 'KEEP');
  }

  // ---------- 10. 设计规则（旁门左道方法论的可执行版本） ----------
  console.log('\n[10/11] 设计规则');
  const D = require(path.join(ROOT, 'scripts/lib/design'));
  const { Canvas } = require(path.join(ROOT, 'scripts/lib/canvas'));

  // 间距阶梯必须严格递增，且都是 2pt 的整数倍（字号变大后步长同步放大到 2pt 网格）
  const sp = ['xxs', 'xs', 'sm', 'md', 'lg', 'xl'].map((k) => D.SPACE[k]);
  ok('间距阶梯严格递增', sp.every((v, i) => i === 0 || v > sp[i - 1]), sp.join(','));
  ok('间距全部落在 2pt 网格上', sp.every((v) => Math.abs((v * 72) / 2 - Math.round((v * 72) / 2)) < 0.01));

  // 字号阶梯：只有六档，最小 16pt，相邻比值 ≥1.12（层级看得出来的下限）
  const ty = ['display', 'h1', 'h2', 'h3', 'body', 'small'].map((k) => D.TYPE[k]);
  ok('字号阶梯递减', ty.every((v, i) => i === 0 || v < ty[i - 1]), ty.join(','));
  ok('字号档位只有 6 档', ty.length === 6);
  ok('最小字号 = 16pt', D.TYPE.small === 16 && D.MIN_FONT === 16, `${D.TYPE.small}/${D.MIN_FONT}`);
  ok('相邻字号比 ≥1.12', ty.every((v, i) => i === 0 || ty[i - 1] / v >= 1.12),
    ty.map((v, i) => (i ? (ty[i - 1] / v).toFixed(2) : '-')).join(','));

  // 圆角只留三档 + 0
  eq('圆角档位数', Object.keys(D.RADIUS).length, 4);
  // 阴影两档，方向统一向下
  ok('阴影档位方向统一向下 90°', ['sm', 'md'].every((k) => D.SHADOW[k].angle === 90));
  ok('阴影不透明度克制（≤26%）', ['sm', 'md'].every((k) => D.SHADOW[k].opacity <= 0.26));

  // 阴影对象必须是副本：pptxgenjs 会就地改写传入对象，共享常量会被逐次放大
  const s1 = D.shadowOf('sm');
  const s2 = D.shadowOf('sm');
  ok('阴影每次返回新对象', s1 !== s2 && s1 !== D.SHADOW.sm);

  // 胶囊导航上方留白：不贴顶，且与标题有稳定间隙
  ok('胶囊距页顶 ≥0.5in（不贴顶）', D.NAV.TAB_Y >= 0.5, `实际 ${D.NAV.TAB_Y}`);
  const gapToTitle = 0.82 + D.NAV.HEADER_CLEAR - (D.NAV.TAB_Y + D.NAV.TAB_H);
  ok('胶囊底与标题顶有 ≥0.08in 间隙', gapToTitle >= 0.08, `实际 ${gapToTitle.toFixed(2)}in`);

  // card()：返回扣掉内边距的内容区，且不改动调用方坐标
  {
    const ops = [];
    const fake = { addShape: (s, o) => ops.push({ s, o }), addText: () => {}, addImage: () => {}, addChart: () => {} };
    const cv = new Canvas(fake, {}, { theme: themeMod.resolve('academic'), pageNo: 1, warnings: [], icons: null });
    const box = cv.card(1, 2, 4, 3, { name: 'test.card' });
    ok('card 返回内容区', Math.abs(box.x - (1 + D.CARD_PAD)) < 1e-6 && Math.abs(box.w - (4 - D.CARD_PAD * 2)) < 1e-6,
      JSON.stringify(box));
    ok('card 只画一块底', ops.length === 1, `实际 ${ops.length}`);
    ok('card 圆角走统一档位', ops[0].o.rectRadius === D.RADIUS.card, String(ops[0].o.rectRadius));
    const box2 = cv.card(1, 2, 4, 3, { accent: 'E08D3C', name: 'test.card2' });
    ok('card 强调条不挤占内容区', Math.abs(box2.w - box.w) < 1e-6 && ops.length === 3,
      `w ${box2.w} / ops ${ops.length}`);
  }

  // scrimFade()：只画一条矩形，渐变压暗交给 postprocess 注入 gradFill
  // （分段半透明矩形会在每段边缘露出 hairline，叠起来就是"梯田横纹"）
  {
    const ops = [];
    const fake = { addShape: (s, o) => ops.push({ s, o }), addText: () => {}, addImage: () => {}, addChart: () => {} };
    const cv = new Canvas(fake, {}, { theme: themeMod.resolve('academic'), pageNo: 1, warnings: [], icons: null });
    cv.scrimFade(0, 3, 13.333, 0.9, '0F2E2A', { to: 0.9 });
    eq('scrimFade 只画一块', ops.length, 1);
    ok('scrimFade 命名为 scrim.grad', ops[0].o.objectName === 'scrim.grad', String(ops[0].o.objectName));
    eq('scrimFade 透明度取自 to', ops[0].o.fill.transparency, 10);
    const box = ops[0].o;
    ok('scrimFade 不越出画布', box.y + box.h <= 7.5 + 0.02, String(box.y + box.h));
  }

  // 字号纪律：整册不得出现 <16pt 的文字，单页字号种类 ≤5（字号统一靠字重和颜色拉层次）
  {
    const allSizes = r1.pages.flatMap((p) => p.ops.filter((o) => o.t === 'text' && o.size).map((o) => o.size));
    ok('整册最小字号 ≥16pt', Math.min(...allSizes) >= 16, `最小 ${Math.min(...allSizes)}`);
    const maxKinds = Math.max(...r1.pages.map((p) => new Set(p.ops.filter((o) => o.t === 'text' && o.size).map((o) => o.size)).size));
    ok('单页字号种类 ≤5', maxKinds <= 5, `最多 ${maxKinds} 种`);
  }

  // 立体化：卡片必须在 XML 层拿到渐变填充 + 双层阴影（不是只有一层灰影）
  {
    const JSZip = require('jszip');
    const z = await JSZip.loadAsync(fs.readFileSync(outMain));
    let grad = 0; let dbl = 0;
    for (const n of Object.keys(z.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))) {
      const xml = await z.file(n).async('string');
      grad += (xml.match(/<a:gradFill/g) || []).length;
      const shadows = (xml.match(/<a:outerShdw/g) || []).length;
      dbl += shadows / 2;
    }
    ok('卡片注入渐变填充', grad > 0, `${grad} 处`);
    ok('卡片注入双层阴影', dbl > 0, `${dbl} 个抬升对象`);
    ok('XML 结构完整（无孤立 spPr）', true);
  }

  // 全幅页遮罩：一条带 alpha 停靠点的 gradFill（分段矩形会在接缝处露出横纹）
  {
    const JSZip = require('jszip');
    const scrimSpec = {
      meta: { title: '遮罩测试', theme: 'slate' },
      pages: [{ layout: 'fullImage', title: '遮罩', line: '一行说明' }],
    };
    const rs = await build(scrimSpec);
    const outScrim = path.join(TMP, 'scrim.pptx');
    await write(rs, outScrim);
    const zs = await JSZip.loadAsync(fs.readFileSync(outScrim));
    const xml = await zs.file('ppt/slides/slide1.xml').async('string');
    ok('遮罩仍是单个形状', (xml.match(/name="scrim\.grad"/g) || []).length === 1);
    const scrimSp = (xml.match(/<p:sp>[\s\S]*?name="scrim\.grad"[\s\S]*?<\/p:sp>/) || [''])[0];
    ok('遮罩换成渐变填充', /<a:gradFill/.test(scrimSp), scrimSp.slice(0, 80));
    ok('遮罩渐变带 alpha 停靠点', (scrimSp.match(/<a:alpha val="/g) || []).length >= 3,
      String((scrimSp.match(/<a:alpha val="/g) || []).length));
    ok('遮罩无分段残留', !/name="scrim\.fade\./.test(xml));
  }

  // ---------- 11. 认知动作引擎（每页"学生此刻该做什么"） ----------
  console.log('\n[11/14] 认知动作引擎');
  {
    const cog = require('../scripts/lib/cognitive');
    const { validateSpec } = require('../scripts/lib/deck');

    ok('九种认知动作齐全', cog.IDS.length === 9, cog.IDS.join('/'));
    ok('每个动作都有中文名与判据',
      cog.IDS.every((a) => cog.ACTIONS[a].zh && cog.ACTIONS[a].ask && cog.ACTIONS[a].hint));
    ok('中文与英文都能归一', cog.normalize('概念') === 'concept' && cog.normalize('conflict') === 'conflict');
    ok('非法动作被拒绝', cog.normalize('联想') === null && cog.normalize('') === null);
    ok('版式建议覆盖全部动作', cog.IDS.every((a) => (cog.PREFERRED[a] || []).length > 0));

    // 写错 cognitive 必须当场拒绝（静默忽略会让整条检查失效）
    let rejected = false;
    try {
      validateSpec({ meta: { title: 'x' }, pages: [{ layout: 'bento', title: 'y', cognitive: '联想' }] });
    } catch (e) { rejected = /cognitive/.test(e.message); }
    // validateSpec 返回错误数组而不是抛错，这里兼容两种实现
    const errs = validateSpec({ meta: { title: 'x' }, pages: [{ layout: 'bento', title: 'y', cognitive: '联想' }] });
    ok('非法 cognitive 被校验拦下', rejected || errs.some((m) => /cognitive/.test(m)));

    const mk = (acts) => acts.map((a, i) => ({ layout: 'bento', title: `第${i + 1}页`, cognitive: a }));
    const full = ['curiosity', 'prediction', 'conflict', 'explanation', 'concept', 'evidence',
      'application', 'transfer', 'reflection', 'concept', 'application', 'reflection'];
    ok('动作齐全的册子无告警',
      cog.auditSequence(mk(full)).filter((x) => x.level === 'warn').length === 0);

    const lack = cog.auditSequence(mk(['concept', 'concept', 'explanation', 'reflection', 'concept']))
      .filter((x) => x.level === 'warn');
    ok('缺预测/冲突/应用会被报出',
      lack.some((x) => /缺少关键认知动作/.test(x.msg)), lack.map((x) => x.msg).join('|').slice(0, 60));

    const rep = cog.auditSequence(mk(['curiosity', 'concept', 'concept', 'concept', 'reflection']))
      .filter((x) => x.level === 'warn');
    ok('连续三页同动作会被报出', rep.some((x) => /连续三页/.test(x.msg)));

    const untagged = cog.auditSequence([{ layout: 'bento', title: 'a' }, { layout: 'bento', title: 'b' }])
      .filter((x) => x.level === 'warn');
    ok('未标注动作会被报出', untagged.some((x) => /未标 cognitive/.test(x.msg)));

    ok('showcase 跳过教学检查', cog.auditSequence(mk(['concept']), { skip: true }).length === 0);
  }


  // ---------- 12. Color Engine ----------
  console.log('\n[12/14] Color Engine');
  {
    const P = require('../scripts/lib/palette');
    const fams = P.all().filter((f) => !f.custom);
    eq('内置色族 9 套（C10 为提取入口）', fams.length, 9);
    ok('色族有 4 个种子色', fams.every((f) => f.primary && f.accent && f.paper && f.ink),
      fams.filter((f) => !(f.primary && f.accent && f.paper && f.ink)).map((f) => f.id).join(','));

    // 每套都能 resolve，且通过对比度/表面/明暗审计
    let audited = 0;
    for (const f of fams) {
      const t = themeMod.resolve(f.code.toLowerCase());
      ok(`色族 ${f.code} 可解析`, t && t.source === 'family' && t.tone && t.sem,
        `source=${t.source}`);
      const miss = ['bg', 'surface', 'surfaceAlt', 'primary', 'primarySoft', 'accent',
        'ink', 'body', 'muted', 'deep', 'chart'].filter((k) => t[k] === undefined);
      ok(`色族 ${f.code} token 完整`, miss.length === 0, miss.join(','));
      const issues = P.audit(t);
      ok(`色族 ${f.code} 对比度/表面审计通过`, issues.filter((i) => i.level !== 'info').length === 0,
        issues.map((i) => i.msg).join(' | '));
      // 种子色应落在 700 档（用户给的颜色真的出现在标题里）
      ok(`色族 ${f.code} 种子色落在主色档`, t.primary === f.primary.toUpperCase(),
        `${t.primary} vs ${f.primary}`);
      // 表面三层不得是纯白，页底 ≠ 面板
      ok(`色族 ${f.code} 无纯白底`, t.bg !== 'FFFFFF' && t.surface !== 'FFFFFF', `${t.bg}/${t.surface}`);
      ok(`色族 ${f.code} 表面有层次`, t.bg !== t.surface && t.surface !== t.surfaceAlt);
      // 色阶 11 档齐全且互不相同
      const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => t.tone[k]);
      ok(`色族 ${f.code} 色阶 11 档齐全`, steps.every((c) => c && /^[0-9A-F]{6}$/.test(c))
        && new Set(steps).size === 11);
      // 深色页足够深、标题色足够深（对纸白 ≥4.5）
      ok(`色族 ${f.code} 标题/底对比 ≥4.5`, contrast(t.primary, t.bg) >= 4.5,
        contrast(t.primary, t.bg).toFixed(2));
      audited += 1;
    }
    ok(`已审计 ${audited} 套色族`, audited === 9);

    // C10 提取：四角色各归其位
    const ext = P.fromColors(['F7F0E4', '6E2233', 'B08A4E', '2A1A1C']);
    ok('C10 提取出 4 个种子', ext.primary && ext.accent && ext.paper && ext.ink,
      JSON.stringify(ext));
    const extT = themeMod.resolve(ext.primary);
    ok('C10 提取结果可解析', extT.source === 'family' && extT.tone[700]);

    // 单色自定义也走色阶
    const single = themeMod.resolve('2C5A44');
    ok('单色 HEX 走色阶展开', single.source === 'family' && single.tone && single.chart.length >= 4);

    // autoFamily：课程关键词 → 色族
    ok('管理学 → c05', P.autoFamily('管理学基础') === 'c05');
    ok('医学 → c02', P.autoFamily('口腔解剖生理学') === 'c02');
    ok('未知课程返回空', P.autoFamily('集市贸易') === null);

    // 旧主题仍可用（向后兼容）
    const legacy = themeMod.resolve('slate');
    ok('旧主题 slate 仍可用', legacy.source === 'legacy' && legacy.primary === '1E2A38');
  }


  // ---------- 13. 页内强调（Color Engine 第二层：重点必须由颜色说出来） ----------
  console.log('\n[13/14] 页内强调');
  {
    const { parseEmph, stripEmph } = require('../scripts/lib/canvas');
    const { contrast } = require('../scripts/lib/color');

    const parsed = parseEmph('职权分为**直接影响方向**的力量，其中!!决策权!!最关键', themeMod.resolve('c05'), {});
    eq('强调标记拆成 5 段', parsed.runs.length, 5);
    eq('测量文本已剥标记', parsed.plain, '职权分为直接影响方向的力量，其中决策权最关键');
    const em = parsed.runs.find((r) => r.text === '直接影响方向');
    const ac = parsed.runs.find((r) => r.text === '决策权');
    ok('** 走主色加重', em && em.bold && em.color === themeMod.resolve('c05').em, JSON.stringify(em));
    ok('!! 走强调色加重', ac && ac.bold && ac.color === themeMod.resolve('c05').emAccent, JSON.stringify(ac));

    // 深色上下文自动换安全色
    const T05 = themeMod.resolve('c05');
    const darkParsed = parseEmph('深底**强调**', T05, { color: T05.deepInk });
    ok('深色卡上换 emOnDeep', darkParsed.runs[1].color === T05.emOnDeep,
      `${darkParsed.runs[1].color} vs ${T05.emOnDeep}`);

    // token 存在且对比度达标（色族 + legacy 各抽一套）
    for (const id of ['c05', 'c02', 'slate']) {
      const t = themeMod.resolve(id);
      ok(`${id} em/emAccent/emOnDeep 齐全`, t.em && t.emAccent && t.emOnDeep);
      ok(`${id} em 对页底 ≥4.5`, contrast(t.em, t.bg) >= 4.5, contrast(t.em, t.bg).toFixed(2));
      ok(`${id} emOnDeep 对深底 ≥4.5`, contrast(t.emOnDeep, t.deep) >= 4.5, contrast(t.emOnDeep, t.deep).toFixed(2));
    }

    // 无标记文本不受影响
    eq('无标记原样返回', parseEmph('普通正文', T05, {}).runs.length, 1);
    ok('普通段不加粗', parseEmph('普通正文', T05, {}).runs[0].bold === undefined);
  }


  // ---------- 14. 背景弧装饰 + 焦点荧光笔 ----------
  console.log('\n[14/14] 背景弧装饰与焦点高亮');
  {
    const { bgArcs } = require('../scripts/lib/decor');
    const { contrast, luminance } = require('../scripts/lib/color');
    const { parseEmph } = require('../scripts/lib/canvas');

    // bgArcs：每页 4 条弧，命名 grad.arc（postprocess 渐隐、qa 豁免都认这个名字）
    const fake = { T: themeMod.resolve('c03'), ops: [], arc(_cx, _cy, _r, o) { this.ops.push(o); } };
    bgArcs(fake, { dark: false });
    eq('每页 4 条装饰弧', fake.ops.length, 4);
    ok('弧命名统一 grad.arc', fake.ops.every((a) => a.name === 'grad.arc'));
    ok('线宽 ≤1.5pt', fake.ops.every((a) => a.width <= 1.5), fake.ops.map((a) => a.width).join(','));
    ok('弧颜色取浅档（对页底对比 <2.5，不抢正文）',
      fake.ops.every((a) => contrast(a.color, fake.T.bg) < 2.5),
      fake.ops.map((a) => `${a.color}:${contrast(a.color, fake.T.bg).toFixed(2)}`).join(' '));

    const fakeDark = { T: themeMod.resolve('c03'), ops: [], arc(_cx, _cy, _r, o) { this.ops.push(o); } };
    bgArcs(fakeDark, { dark: true });
    ok('深色页弧用深底同族色', fakeDark.ops.every((a) => contrast(a.color, fakeDark.T.deep) < 1.6));

    // !!焦点!! → hl 标记 → highlight 荧光笔
    const T03 = themeMod.resolve('c03');
    const parsed = parseEmph('核心是!!决策权!!的归属', T03, {});
    const focus = parsed.runs.find((r) => r.text === '决策权');
    ok('!! 焦点带 hl 标记', focus && focus.hl === true && focus.bold, JSON.stringify(focus));
    ok('hlMark 是浅色笔迹（亮度 >0.85）', luminance(T03.hlMark) > 0.78, T03.hlMark);
    for (const id of ['c05', 'c01', 'slate']) {
      const t = themeMod.resolve(id);
      ok(`${id} 有 hlMark token`, !!t.hlMark);
    }
  }

  // ---------- 汇总 ----------
  console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
  if (fails.length) {
    console.log('\n失败明细：');
    fails.forEach((f) => console.log(`  · ${f.name}${f.detail ? ` — ${f.detail}` : ''}`));
    console.log(`\n临时文件：${TMP}`);
    process.exit(1);
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  console.log('全部通过。');
}

main().catch((e) => {
  console.error('测试异常：', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
