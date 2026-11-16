// 编排：spec → 主题 → 逐页版式 → 原生 PPTX，同时产出 ops（供预览与自检）
const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');

const { Canvas } = require('./canvas');
const { get: getLayout, LAYOUTS } = require('./layouts');
const { drawNav } = require('./nav');
const themeMod = require('./theme');
const icons = require('./icons');
const img = require('./image');
const cognitive = require('./cognitive');

const IMAGE_MODES = ['auto', 'image-first', 'existing-only', 'none'];

function validateSpec(spec) {
  const errs = [];
  if (!spec || typeof spec !== 'object') errs.push('spec 必须是 JSON 对象');
  if (!spec.meta) errs.push('缺少 meta（课程名、标题等）');
  if (!Array.isArray(spec.pages) || !spec.pages.length) errs.push('pages 不能为空');
  if (spec.meta && spec.meta.imageMode && !IMAGE_MODES.includes(spec.meta.imageMode)) {
    errs.push(`meta.imageMode 只能是 ${IMAGE_MODES.join(' / ')}`);
  }
  (spec.pages || []).forEach((p, i) => {
    if (!p.layout) errs.push(`第 ${i + 1} 页缺少 layout`);
    else if (!LAYOUTS.find((l) => l.id === p.layout)) {
      errs.push(`第 ${i + 1} 页版式 "${p.layout}" 不存在`);
    }
    if (p.layout !== 'divider' && p.layout !== 'fullImage' && !p.title && !p.text) {
      errs.push(`第 ${i + 1} 页缺少 title`);
    }
    // cognitive 写错（拼错、用中文但不在词表里）必须当场拒绝：
    // 静默忽略会让"这页学生该做什么"整条检查失效，而那是本 skill 的核心。
    if (p.cognitive !== undefined && p.cognitive !== null && !cognitive.normalize(p.cognitive)) {
      errs.push(`第 ${i + 1} 页 cognitive="${p.cognitive}" 不可识别，可用：${cognitive.IDS.join(' / ')}（或中文：${cognitive.IDS.map((a) => cognitive.ACTIONS[a].zh).join('/')}）`);
    }
  });
  if (spec.meta && spec.meta.intent && typeof spec.meta.intent !== 'object') {
    errs.push('meta.intent 必须是对象（goal / audience / misconception / boundary / oneLine）');
  }
  return errs;
}

function resolveChapters(spec) {
  const chapters = spec.chapters || [];
  let current = chapters.length ? chapters[0].id : null;
  const pages = spec.pages.map((p, i) => {
    // --only 时保留原始页码，页脚仍显示"08 / 11"
    const onlyMap = spec.__onlyMap;
    const page = { ...p, index: onlyMap ? (onlyMap[i] || i + 1) : i + 1 };
    if (page.chapter) current = page.chapter;
    page._resolvedChapter = current;
    return page;
  });
  return { chapters, pages };
}

function applyImageMode(page, mode, baseDir) {
  const resolvePath = (p) => {
    if (!p) return null;
    const abs = path.isAbsolute(p) ? p : path.join(baseDir, p);
    return fs.existsSync(abs) ? abs : null;
  };
  let image = resolvePath(page.image);
  if (mode === 'none') image = null;
  if (mode === 'existing-only' && !image) image = null;
  const missing = page.image && !image && mode !== 'none';
  return { image, missing, warn: missing ? `第${page.index}页 图片未找到：${page.image}` : null };
}

async function build(spec, opts = {}) {
  const errs = validateSpec(spec);
  if (errs.length) {
    const e = new Error(`spec 校验失败：\n- ${errs.join('\n- ')}`);
    e.validation = errs;
    throw e;
  }
  const baseDir = opts.baseDir || process.cwd();
  const meta = spec.meta || {};
  const themeId = opts.theme || meta.theme || themeMod.autoTheme(`${meta.course || ''}${meta.title || ''}${meta.discipline || ''}`);
  const theme = themeMod.resolve(themeId);
  const mode = opts.imageMode || meta.imageMode || 'auto';
  const { chapters, pages } = resolveChapters(spec);
  const deck = { meta, chapters, pages, totalPages: spec.__totalPages || pages.length };

  // 图标预渲染（缺失时自动降级为数字/圆点）
  const iconNames = new Set();
  pages.forEach((p) => {
    if (p.icon) iconNames.add(p.icon);
    (p.points || []).forEach((x) => x.icon && iconNames.add(x.icon));
    (p.items || []).forEach((x) => x.icon && iconNames.add(x.icon));
    (p.layers || []).forEach((x) => x.icon && iconNames.add(x.icon));
    (p.steps || []).forEach((x) => x.icon && iconNames.add(x.icon));
    (p.acts || []).forEach((x) => x.icon && iconNames.add(x.icon));
    if (p.theory && p.theory.icon) iconNames.add(p.theory.icon);
  });
  if (iconNames.size) {
    try {
      await icons.prewarm(
        [...new Set([theme.primary, theme.primaryText, theme.accent, theme.accentText, theme.muted, theme.bg, theme.deepInk])],
        [...iconNames],
      );
    } catch (e) { /* 图标失败不影响主流程 */ }
  }
  const iconResolver = icons.makeResolver();

  // 局部放大页的裁切图提前算好（sharp 可选）
  for (const p of pages) {
    if (p.layout === 'zoom' && p.image && p.detail) {
      const abs = path.isAbsolute(p.image) ? p.image : path.join(baseDir, p.image);
      if (fs.existsSync(abs) && img.hasSharp) {
        // 放大面板固定 3.58 x 2.5 in。裁切区域的"像素宽高比"必须等于面板宽高比，
        // 所以高度分数 = 宽度分数 × 原图宽高比 ÷ 面板宽高比（不能直接除）。
        const panelAspect = 3.58 / 2.5;
        const dim = await img.size(abs);
        const imgAspect = dim ? dim.aspect : panelAspect;
        const r = p.detail.r || 0.16;
        let wf = Math.min(1, r * 2);
        let hf = (wf * imgAspect) / panelAspect;
        if (hf > 1) { hf = 1; wf = (hf * panelAspect) / imgAspect; }
        if (wf > 1) { wf = 1; hf = (wf * imgAspect) / panelAspect; }
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const x0 = clamp((p.detail.x != null ? p.detail.x : 0.5) - wf / 2, 0, Math.max(0, 1 - wf));
        const y0 = clamp((p.detail.y != null ? p.detail.y : 0.5) - hf / 2, 0, Math.max(0, 1 - hf));
        p._detailPath = await img.cropSyncSafe(abs, x0, y0, wf, hf, `crop-${p.index}.png`);
        // 记录裁切区域（原图归一化坐标），供版式画"放大框"时精确对齐
        p._detailRect = { x0, y0, wf, hf };
        p._detailAspect = imgAspect;
      }
    }
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = meta.author || 'haoxue-ppt';
  pptx.company = meta.institution || '';
  pptx.title = meta.title || '';
  pptx.subject = meta.course || '';
  pptx.lang = 'zh-CN';
  pptx.theme = {
    headFontFace: theme.fonts.title,
    bodyFontFace: theme.fonts.body,
    lang: 'zh-CN',
  };

  const warnings = [];
  const pageOps = [];

  // 认知动作序列检查：这不是版面问题，是"这堂课有没有教学动作"的问题。
  // 放在构建期报，写 spec 的人当场就能看见，而不是等交付前才发现全是概念页。
  // 只推 warn：版式配对建议（info）留给 teachqa 汇总，不然构建日志会被"建议"淹没。
  for (const a of cognitive.auditSequence(pages, { skip: meta.purpose === 'showcase' })) {
    if (a.level !== 'warn') continue;
    warnings.push({ page: null, kind: 'COG-SEQUENCE', msg: a.msg });
  }

  for (const page of pages) {
    const lay = getLayout(page.layout);
    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };

    const imgRes = applyImageMode(page, mode, baseDir);
    if (imgRes.warn) warnings.push({ page: page.index, kind: 'MISSING-IMAGE', msg: imgRes.warn });
    const p = { ...page, image: imgRes.image, _imageMissing: !!imgRes.missing };

    const ctx = {
      theme, pageNo: page.index, warnings, icons: iconResolver, deck, pptx,
    };
    const cv = new Canvas(slide, pptx, ctx);
    lay.build(cv, p, deck);

    const navMode = page.nav === 'hidden' ? 'hidden' : (meta.nav || 'chapters');
    if (lay.nav !== false && navMode !== 'hidden') {
      const darkPage = theme.dark || ['cover', 'divider', 'summary', 'fullImage'].includes(lay.id);
      drawNav(cv, { ...p, nav: page.nav || (lay.nav === 'minimal' ? 'minimal' : undefined) }, deck, { mode: navMode, dark: darkPage });
    }

    const noteHead = `[haoxue:layout=${lay.id}] [chapter=${p._resolvedChapter || '-'}]`;
    slide.addNotes(`${noteHead}\n${page.notes || ''}`);

    pageOps.push({ index: page.index, layout: lay.id, name: lay.name, ops: cv.ops });
  }

  return {
    pptx, theme, deck, warnings, pages: pageOps, themeId: theme.id, imageMode: mode,
  };
}

async function write(result, outPath) {
  const abs = path.resolve(outPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await result.pptx.writeFile({ fileName: abs });
  try {
    // 深色底上投影不可见，反而会糊成脏边：只做渐变，不加阴影
    const info = await require('./postprocess').postprocess(abs, {
      shadow: !result.theme.dark,
      accent: result.theme.accent,
      ink: result.theme.ink,
    });
    if (info.fixed) result.postfixed = info.fixed;
    if (info.lifted) result.lifted = info.lifted;
  } catch (e) {
    // 后处理失败不影响主文件，但必须留痕——否则"立体化没生效"会变成静默问题
    if (process.env.DEBUG) console.error('后处理失败:', e.message);
    result.postError = e.message;
  }
  try {
    const crops = await require('./cropfix').fixImageCrops(abs);
    if (crops.fixed) result.cropfixed = crops.fixed;
  } catch (e) { /* 裁切修正失败不影响主文件 */ }
  return abs;
}

module.exports = { build, write, validateSpec, IMAGE_MODES };
