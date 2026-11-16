#!/usr/bin/env node
/**
 * 图表检索：从索引里找"能用得上的那张图"。
 *
 * 用法：
 *   node scripts/chart-find.js                        # 列出全部（按类型分组统计）
 *   node scripts/chart-find.js --type bar             # 按类型
 *   node scripts/chart-find.js --tag 复购             # 按关键词（标题/系列/分类）
 *   node scripts/chart-find.js --color 087F87         # 按主色（复用同主题的图）
 *   node scripts/chart-find.js --type line --json     # 输出 JSON，供程序消费
 */
const fs = require('fs');
const path = require('path');

const IDX = path.resolve(__dirname, '../assets/charts/index.json');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      a[k] = v;
    }
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(IDX)) {
    console.log('还没有索引。先运行：node scripts/chart-index.js <素材目录>');
    process.exit(0);
  }
  const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  let rows = idx.charts || [];

  if (args.type) rows = rows.filter((r) => r.type === String(args.type).toLowerCase());
  if (args.color) {
    const c = String(args.color).replace('#', '').toUpperCase();
    rows = rows.filter((r) => (r.colors || []).some((x) => x.toUpperCase() === c));
  }
  if (args.tag) {
    const q = String(args.tag);
    rows = rows.filter((r) => `${r.title} ${(r.series || []).join(' ')} ${(r.categories || []).join(' ')} ${(r.tags || []).join(' ')}`.includes(q));
  }
  if (args.source) rows = rows.filter((r) => String(r.source).includes(String(args.source)));

  if (args.json) {
    console.log(JSON.stringify({ count: rows.length, charts: rows }, null, 2));
    return;
  }

  console.log(`索引共 ${idx.count || 0} 张，命中 ${rows.length} 张`);
  if (!rows.length) {
    console.log('没有命中。可以放宽条件，或按 references/charts.md 的降级链路自建图表。');
    return;
  }
  const byType = {};
  rows.forEach((r) => { byType[r.type] = (byType[r.type] || 0) + 1; });
  console.log(`类型分布：${Object.entries(byType).map(([k, v]) => `${k}×${v}`).join('，')}\n`);
  rows.slice(0, 40).forEach((r) => {
    console.log(`  [${r.type.padEnd(8)}] ${r.source} 第 ${r.slide} 页  ${r.title}`);
    console.log(`            系列：${(r.series || []).join(' / ') || '-'}   分类：${(r.categories || []).slice(0, 6).join(' / ') || '-'}`);
    console.log(`            配色：${(r.colors || []).slice(0, 4).join(' ')}   可编辑：${r.editable ? '原生图表' : '图片'}`);
  });
  if (rows.length > 40) console.log(`  …还有 ${rows.length - 40} 张`);
}

main();
