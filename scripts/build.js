#!/usr/bin/env node
// 命令行入口：spec.json → .pptx（+ ops.json / preview.html）
const fs = require('fs');
const path = require('path');
const { build, write, validateSpec } = require('./lib/deck');
const themeMod = require('./lib/theme');
const { LAYOUTS } = require('./lib/layouts');
const { renderHtml } = require('./preview');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') { args.out = argv[++i]; } else if (a === '--theme') { args.theme = argv[++i]; } else if (a === '--image') { args.image = argv[++i]; } else if (a === '--ops') { args.ops = argv[++i]; } else if (a === '--html') { args.html = argv[++i]; } else if (a === '--only') { args.only = argv[++i]; } else if (a === '--nav') { args.nav = argv[++i]; } else if (a === '--quiet') { args.quiet = true; } else if (a === '--list-themes') { args.listThemes = true; } else if (a === '--list-layouts') { args.listLayouts = true; } else if (a.startsWith('-')) { args[a.replace(/^--?/, '')] = true; } else { args._.push(a); }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.listLayouts) {
    console.log('可用版式：');
    LAYOUTS.forEach((l) => console.log(`  ${l.id.padEnd(16)} ${l.name.padEnd(10)} ${l.useWhen}`));
    return;
  }
  if (args.listThemes) {
    const P = require('./lib/palette');
    console.log('Color Families（新课件默认走这套，见 references/color-engine.md）：');
    P.all().forEach((f) => {
      if (f.custom) return console.log(`  ${f.code.toLowerCase()}  ${f.name}  （从参考 PPT 提取：node scripts/palette.js from <hex...>）`);
      console.log(`  ${f.code.toLowerCase()}  ${f.name.padEnd(6)} ${f.primary} / ${f.accent} / 纸 ${f.paper}  ${f.mood}`);
    });
    console.log('\n旧主题（legacy，复现已有课件用）：');
    themeMod.all().forEach((t) => console.log(`  ${t.id.padEnd(12)} ${t.name.padEnd(8)} ${t.base} / ${t.accent}  ${t.mood}`));
    return;
  }

  const specPath = args._[0];
  if (!specPath) {
    console.error('用法：node scripts/build.js spec.json -o out/deck.pptx [--theme academic] [--image auto] [--nav tabs] [--html out/preview.html]');
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(path.resolve(specPath), 'utf8'));
  const baseDir = path.dirname(path.resolve(specPath));

  // --nav tabs / --nav chapters：覆盖右上角导航样式（tabs = 章节胶囊）
  if (args.nav) {
    spec.meta = spec.meta || {};
    spec.meta.nav = args.nav;
  }

  // --only 8 / --only 3,7,8：只重建指定页（改一页不必重生成整套）
  if (args.only) {
    const want = String(args.only).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
    const bad = want.filter((n) => n > spec.pages.length);
    if (bad.length) {
      console.error(`✗ 页码超出范围：${bad.join(',')}（共 ${spec.pages.length} 页）`);
      process.exit(1);
    }
    const picked = spec.pages.filter((_, i) => want.includes(i + 1));
    spec.__totalPages = spec.pages.length;
    spec.__onlyMap = spec.pages.map((_, i) => i + 1).filter((n) => want.includes(n));
    spec.pages = picked;
    if (!args.quiet) console.log(`  局部生成：第 ${want.join('、')} 页（共 ${picked.length} 页）`);
  }

  const themes = args.theme === 'all' ? themeMod.all().map((t) => t.id) : [args.theme];

  // -o 若不带 .pptx 后缀，视为输出目录（多主题时必须如此，否则互相覆盖）
  let outPath;
  if (args.out && !/\.pptx$/i.test(args.out)) {
    const dir = path.resolve(args.out);
    fs.mkdirSync(dir, { recursive: true });
    outPath = path.join(dir, `${spec.meta.slug || 'deck'}.pptx`);
  } else {
    outPath = path.resolve(args.out || path.join(baseDir, `${spec.meta.slug || 'deck'}.pptx`));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  const errs = validateSpec(spec);
  if (errs.length) {
    console.error('✗ spec 校验失败：\n- ' + errs.join('\n- '));
    process.exit(1);
  }

  const results = [];

  for (const themeId of themes.length ? themes : [null]) {
    const result = await build(spec, { theme: themeId, imageMode: args.image, baseDir });
    const target = themes.length > 1
      ? outPath.replace(/\.pptx$/, `-${result.theme.id}.pptx`)
      : outPath;
    await write(result, target);

    if (args.ops) {
      const opsPath = themes.length > 1 ? args.ops.replace(/\.json$/, `-${result.theme.id}.json`) : args.ops;
      fs.writeFileSync(opsPath, JSON.stringify({
        meta: spec.meta, theme: result.theme, pages: result.pages,
      }, null, 0));
    }
    if (args.html) {
      const htmlPath = themes.length > 1 ? args.html.replace(/\.html$/, `-${result.theme.id}.html`) : args.html;
      fs.writeFileSync(htmlPath, renderHtml(spec, result));
    }

    results.push({ target, result });
    if (!args.quiet) {
      console.log(`✓ ${path.basename(target)}  ${result.pages.length} 页  主题=${result.theme.name}(${result.theme.id})  图片模式=${result.imageMode}`);
    }
    const w = result.warnings;
    if (w.length && !args.quiet) {
      const byKind = {};
      w.forEach((x) => { byKind[x.kind] = (byKind[x.kind] || 0) + 1; });
      console.log(`  ⚠ ${w.length} 条构建提示：${Object.entries(byKind).map(([k, v]) => `${k}×${v}`).join('，')}`);
      w.slice(0, 6).forEach((x) => console.log(`    · ${x.page ? `第${x.page}页` : '全局'} ${x.msg}`));
    }
  }

  if (!args.quiet && results.length === 1) {
    console.log(`  版式：${[...new Set(results[0].result.pages.map((p) => p.layout))].length} 种 / ${results[0].result.pages.length} 页`);
  }
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
