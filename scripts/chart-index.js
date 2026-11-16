#!/usr/bin/env node
/**
 * 图表素材索引器：扫描一个目录下的 .pptx，把每一张原生图表登记成一条索引。
 *
 * 用法：
 *   node scripts/chart-index.js <目录> [--out assets/charts/index.json]
 *   node scripts/chart-index.js examples/            # 索引示例课件里的图表
 *
 * 为什么需要它：课件里"这里放张图"最容易变成随便找张图。先知道手里有什么图表，
 * 才能按"原生图表 → 引擎图表 → SVG → 局部图片"的顺序复用，而不是每次重画。
 *
 * 索引字段（对应任务书要求）：
 *   source 来源文件 / slide 页码 / chartId 部件ID / type 类型 / title 所在页标题 /
 *   categories 分类轴 / series 系列名 / colors 配色 / editable 可编辑性 /
 *   thumb 缩略图 / animation 是否带动画 / tags 场景标签 / size 数据规模
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const CHART_KINDS = [
  ['barChart', 'bar'], ['bar3DChart', 'bar'], ['lineChart', 'line'],
  ['pieChart', 'pie'], ['doughnutChart', 'doughnut'], ['areaChart', 'area'],
  ['scatterChart', 'scatter'], ['radarChart', 'radar'], ['bubbleChart', 'bubble'],
];

const txt = (xml, re) => [...xml.matchAll(re)].map((m) => m[1]);

function detectType(chartXml) {
  for (const [tag, kind] of CHART_KINDS) {
    if (chartXml.includes(`<c:${tag}`)) return kind;
  }
  return 'unknown';
}

function readPoints(xml, blockTag) {
  // 分类轴可能是 <c:strRef><c:strCache>、多级 <c:multiLvlStrRef><c:lvl>，或数值 <c:numCache>
  const block = (xml.split(`<c:${blockTag}>`)[1] || '').split(`</c:${blockTag}>`)[0];
  const fromCache = (tag) => {
    const seg = (block.split(`<c:${tag}>`)[1] || '').split(`</c:${tag}>`)[0];
    return txt(seg, /<c:v>([^<]*)<\/c:v>/g);
  };
  const str = fromCache('strCache');
  if (str.length) return str;
  if (block.includes('<c:lvl>')) {
    // 多级分类：取最内层所有点，按出现顺序
    const pts = txt(block, /<c:lvl[^>]*>[\s\S]*?<\/c:lvl>/g)
      .flatMap((lvl) => txt(lvl, /<c:v>([^<]*)<\/c:v>/g));
    if (pts.length) return pts;
  }
  return fromCache('numCache');
}

function seriesNames(xml) {
  // 每个 <c:ser> 里的第一个 <c:tx><c:v>
  const out = [];
  xml.split('<c:ser>').slice(1).forEach((chunk) => {
    const tx = chunk.split('<c:tx>')[1] || '';
    const v = (tx.match(/<c:v>([^<]*)<\/c:v>/) || [])[1];
    out.push(v || '');
  });
  return out;
}

async function indexDeck(file) {
  const buf = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buf);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));

  const rows = [];
  for (const name of slideNames) {
    const no = Number(name.match(/slide(\d+)\.xml/)[1]);
    const slideXml = await zip.file(name).async('string');
    const relName = name.replace('slides/', 'slides/_rels/') + '.rels';
    if (!zip.file(relName)) continue;
    const rels = await zip.file(relName).async('string');
    const charts = [...rels.matchAll(/Target="([^"]*charts\/(chart\d+\.xml))"/g)];
    if (!charts.length) continue;

    const title = (slideXml.match(/<a:t>([^<]*)<\/a:t>/) || [])[1] || '';
    const hasAnim = slideXml.includes('<p:timing>');

    for (const [, target, base] of charts) {
      const part = `ppt/charts/${base}`;
      if (!zip.file(part)) continue;
      const cx = await zip.file(part).async('string');
      const type = detectType(cx);
      const categories = readPoints(cx, 'cat');
      const series = seriesNames(cx);
      const values = readPoints(cx, 'val');
      const colors = [...new Set(txt(cx, /<a:srgbClr val="([0-9A-Fa-f]{6})"/g))];
      const hasEmbeddedWorkbook = zip.file(part.replace('charts/', 'charts/_rels/') + '.rels')
        && (await zip.file(part.replace('charts/', 'charts/_rels/') + '.rels').async('string')).includes('workbook');
      rows.push({
        source: path.basename(file),
        slide: no,
        chartId: base.replace('.xml', ''),
        type,
        title: title.slice(0, 40),
        categories: categories.slice(0, 12),
        series: series.slice(0, 6),
        points: values.length,
        colors: colors.slice(0, 8),
        editable: true,                                   // 原生图表：可在 PPT 里右键编辑数据
        dataEditable: !!hasEmbeddedWorkbook,
        thumb: null,                                      // 需要 render.py 渲染后回填
        animation: hasAnim,
        tags: [],
      });
    }
  }
  return rows;
}

async function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/node_modules|\.git|^out$|^dist$/.test(entry.name)) continue;
      out.push(...await walk(p));
    } else if (/\.pptx$/i.test(entry.name) && !entry.name.startsWith('~$')) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('-'));
  const outIdx = args.indexOf('--out');
  const outPath = path.resolve(outIdx >= 0 ? args[outIdx + 1] : 'assets/charts/index.json');

  if (!dir) {
    console.error('用法：node scripts/chart-index.js <课件或素材目录> [--out assets/charts/index.json]');
    process.exit(2);
  }
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) {
    console.error(`✗ 目录不存在：${root}`);
    process.exit(1);
  }

  const files = fs.statSync(root).isDirectory() ? await walk(root) : [root];
  const all = [];
  for (const f of files) {
    try {
      const rows = await indexDeck(f);
      if (rows.length) {
        all.push(...rows);
        console.log(`  ${path.basename(f)} → ${rows.length} 张图表`);
      }
    } catch (e) {
      console.log(`  ! ${path.basename(f)} 跳过：${e.message}`);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    scanned: files.length,
    count: all.length,
    charts: all,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\n索引 ${all.length} 张图表 → ${outPath}`);
  if (!all.length) {
    console.log('提示：没有发现原生图表。若素材是图片版图表，请按 charts.md 的"局部图片"路径登记。');
  }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
