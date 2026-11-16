#!/usr/bin/env node
/**
 * Color Engine 命令行：
 *   node scripts/palette.js list                列出 10 套色族（含 11 档色阶条）
 *   node scripts/palette.js show c05            展开一套：色阶 / 表面 / 语义 / 配比 / 对比度自检
 *   node scripts/palette.js card [c05 c06 ...]  生成 out/palette.html 选色卡（浏览器打开对比）
 *   node scripts/palette.js from F5F2EA 6E2233 B08A4E 2A1A1C
 *                                               从参考 PPT 的取色结果反推一套色族（C10）
 */
const fs = require('fs');
const path = require('path');
const P = require('./lib/palette');
const T = require('./lib/theme');
const { contrast, norm } = require('./lib/color');

const OUT = path.resolve(__dirname, '../out/palette.html');
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function ansi(hex, text) {
  const { r, g, b } = require('./lib/color').rgb(norm(hex));
  return `\x1b[48;2;${r};${g};${b}m\x1b[38;2;${light(hex) ? '20;20;20' : '245;245;245'}m${text}\x1b[0m`;
}
function light(hex) {
  const { r, g, b } = require('./lib/color').rgb(norm(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
function pad(s, n) {
  const w = [...String(s)].reduce((a, ch) => a + (/[\u4e00-\u9fa5]/.test(ch) ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
}

function cmdList() {
  const g = P.guide();
  console.log('\nColor Families · 少色相、多色阶；少纯色、多表面\n');
  for (const f of P.all()) {
    const head = `${pad(f.code, 4)}${pad(f.id, 12)}${pad(f.name, 18)}`;
    if (f.custom) { console.log(`${head}（需提取：node scripts/palette.js from ...）`); continue; }
    const t = T.resolve(f.code);
    const strip = STEPS.map((s) => ansi(t.tone[s], '  ')).join('');
    console.log(`${head}${strip}`);
    console.log(`${' '.repeat(34)}主 ${f.primary}  强调 ${f.accent}  纸 ${f.paper}  ${f.mood.slice(0, 28)}`);
  }
  console.log(`\n配比目标：底 ${g.canvas}% / 主色家族 ${g.primary}% / 强调 ${g.accent}% / 语义 ${g.semantic}%（${g.note}）`);
  console.log('用法：node scripts/build.js spec.json --theme c05\n');
}

function cmdShow(id) {
  if (!id) { console.error('用法：node scripts/palette.js show c05'); process.exit(2); }
  const fam = P.family(id);
  if (!fam) { console.error(`没有这套色族：${id}`); process.exit(2); }
  const t = T.resolve(fam.code);
  const roles = P.ladder();
  console.log(`\n${t.code} ${t.name}  ·  ${fam.mood}\n`);
  console.log('色阶（一个色相，11 个档位，各司其职）');
  for (const s of STEPS) {
    console.log(`  ${pad(s, 5)}${ansi(t.tone[s], '        ')} #${t.tone[s]}  ${roles[s] || ''}`);
  }
  console.log('\n表面体系（三层，都不用纯白）');
  [['bg', '页面底 canvas'], ['veil', '薄雾底'], ['surface', '面板 surface1'], ['surfaceAlt', '信息区 surface2']]
    .forEach(([k, l]) => console.log(`  ${pad(l, 18)}${ansi(t[k], '        ')} #${t[k]}`));
  console.log('\n主色 / 强调 / 深色页');
  [['primary', '主色 700'], ['primarySoft', '浅主色 100'], ['accent', '强调色'], ['accentSoft', '强调浅底'],
    ['deep', '深色页 950'], ['deepAlt', '深色页第二层'], ['ink', '文字 暖黑'], ['body', '正文'], ['muted', '次级']]
    .forEach(([k, l]) => console.log(`  ${pad(l, 18)}${ansi(t[k], '        ')} #${t[k]}`));
  console.log('\n配比卡（目标面积占比）');
  for (const r of P.plan(t)) {
    console.log(`  ${pad(r.role, 34)}${ansi(r.hex, '      ')} #${r.hex}  ${r.share ? `${r.share}%` : '（计入家族）'}  ${r.note}`);
  }
  const issues = P.audit(t);
  console.log('\nContrast QA');
  [['正文 / 页面底', t.body, t.bg, 4.5], ['标题 / 页面底', t.ink, t.bg, 7], ['深底文字 / 深底', t.deepInk, t.deep, 7],
    ['强调 / 页面底', t.accent, t.bg, 2.2], ['正文 / 浅主色底', t.body, t.primarySoft, 4.5]]
    .forEach(([n, fg, bg, min]) => {
      const r = contrast(fg, bg);
      console.log(`  ${r >= min ? '✓' : '✗'} ${pad(n, 20)}${r.toFixed(2)}:1（需 ≥${min}）`);
    });
  if (issues.length) { console.log('  ! ' + issues.map((i) => i.msg).join('\n  ! ')); }
  else console.log('  全部通过。');
  console.log(`\n写进 deck.json：{ "meta": { "theme": "${fam.code.toLowerCase()}" } }\n`);
}

// 选色卡：让用户先看方向，再决定建不建
function cardHtml(list) {
  const card = (t) => {
    const f = P.family(t.code);
    return `
  <section class="card" style="background:#${t.bg}">
    <div class="mock">
      <div class="mockNum" style="color:#${t.accent}">01</div>
      <h3 style="color:#${t.primary}">把职权配置看成三张网</h3>
      <p style="color:#${t.body}">直线职权、参谋职权、职能职权——同一个组织里，三条线同时存在，谁听谁的，取决于哪条线在做决定。</p>
      <div class="mockRow">
        <div class="mini" style="background:#${t.surface};border-color:#${t.line}">
          <b style="color:#${t.ink}">集权</b><span style="color:#${t.muted}">决策上收</span>
        </div>
        <div class="mini" style="background:#${t.surfaceAlt};border-color:#${t.line}">
          <b style="color:#${t.ink}">分权</b><span style="color:#${t.muted}">决策下放</span>
        </div>
        <div class="mini" style="background:#${t.primarySoft};border-color:#${t.primaryLine}">
          <b style="color:#${t.accentText}">授权</b><span style="color:#${t.primaryText}">能力转移</span>
        </div>
      </div>
      <div class="band" style="background:#${t.accentSoft};border-left-color:#${t.accent}">
        <span style="color:#${t.accentText}">结论：职权是分配出来的，不是抢出来的</span>
      </div>
    </div>
    <header>
      <div class="tag" style="background:#${t.deep};color:#${t.deepInk}">${t.code}</div>
      <div class="meta">
        <b style="color:#${t.ink}">${t.name}</b>
        <span style="color:#${t.muted}">${f.id} · ${f.mood}</span>
      </div>
      <div class="use" style="color:#${t.muted}">${(f.bestFor || []).slice(0, 3).join(' / ')}</div>
    </header>
    <div class="ladder">
      ${STEPS.map((s) => `<i style="background:#${t.tone[s]}" title="${s} #${t.tone[s]}"></i>`).join('')}
    </div>
    <div class="share">
      <i style="background:#${t.bg};width:60%"></i><i style="background:#${t.primary};width:14%"></i>
      <i style="background:#${t.surfaceAlt};width:10%"></i><i style="background:#${t.primarySoft};width:8%"></i>
      <i style="background:#${t.accent};width:5%"></i><i style="background:#${t.deep};width:3%"></i>
    </div>
    <div class="sw">
      ${['bg', 'surface', 'surfaceAlt', 'primary', 'primarySoft', 'accent', 'deep', 'ink']
    .map((k) => `<span><i style="background:#${t[k]}"></i>${k} ${t[k]}</span>`).join('')}
    </div>
  </section>`;
  };
  const fams = (list && list.length ? list : P.all().filter((f) => !f.custom).map((f) => f.code))
    .map((x) => T.resolve(x));
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>haoxue-ppt · Color Engine 选色卡</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:36px 34px 60px;background:#E9E6DF;font-family:"Microsoft YaHei",system-ui,-apple-system,sans-serif;color:#26221C}
  h1{font-size:21px;margin:0 0 6px;letter-spacing:.02em}
  .sub{color:#6A635A;font-size:13px;margin:0 0 6px;line-height:1.7}
  .note{color:#8A8074;font-size:12px;margin:0 0 26px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(540px,1fr));gap:22px}
  .card{border-radius:14px;padding:20px 20px 16px;box-shadow:0 10px 28px rgba(30,25,18,.12),0 2px 6px rgba(30,25,18,.06)}
  .mock{border-radius:8px;padding:20px 22px 18px;margin-bottom:14px;position:relative;overflow:hidden}
  .mockNum{position:absolute;right:16px;top:10px;font-size:34px;font-weight:800;opacity:.9;letter-spacing:-.02em}
  .mock h3{margin:0 0 8px;font-size:19px;font-weight:800;letter-spacing:.01em}
  .mock p{margin:0 0 14px;font-size:12.5px;line-height:1.85;max-width:92%}
  .mockRow{display:flex;gap:9px;margin-bottom:12px}
  .mini{flex:1;border:1px solid;border-radius:5px;padding:8px 10px;display:flex;flex-direction:column;gap:3px}
  .mini b{font-size:12.5px}
  .mini span{font-size:10.5px}
  .band{padding:7px 11px;border-left:3px solid;border-radius:2px;font-size:11.5px}
  header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .tag{font-size:11px;font-weight:700;padding:3px 8px;border-radius:3px;letter-spacing:.04em}
  .meta{display:flex;flex-direction:column;line-height:1.35;flex:1;min-width:0}
  .meta b{font-size:13.5px}
  .meta span{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .use{font-size:10.5px;text-align:right;line-height:1.4;max-width:150px}
  .ladder{display:flex;height:22px;border-radius:3px;overflow:hidden;margin-bottom:6px}
  .ladder i{flex:1}
  .share{display:flex;height:5px;gap:2px;margin-bottom:10px;opacity:.9}
  .share i{display:block;border-radius:2px}
  .sw{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;color:#6A635A}
  .sw span{display:flex;align-items:center;gap:5px}
  .sw i{width:10px;height:10px;border-radius:2px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
  .legend{display:flex;gap:18px;font-size:11.5px;color:#6A635A;margin:0 0 24px}
  .legend b{color:#26221C}
</style></head><body>
<h1>Color Engine · 10 套 Color Families</h1>
<p class="sub">每套只给 4 个种子色，其余 11 档由引擎展开。<b>看的是层次，不是颜色数量</b>：同一页里底色、卡片、标题、数字各来自不同档位。</p>
<p class="note">选一套 → <code>"theme": "c05"</code>；要沿用学校 VI / 原系列课件 → C10 从参考 PPT 提取。</p>
<div class="legend">
  <span><b>色阶条</b> 50 → 950</span><span><b>配比条</b> 底 60% / 主色 22% / 强调 5%</span><span><b>色卡</b> 决定这套色如何落地</span>
</div>
<div class="grid">${fams.map(card).join('')}</div>
</body></html>`;
}

function cmdCard(ids) {
  const html = cardHtml(ids);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`✓ 已生成 ${OUT}`);
  if (process.argv.includes('--open')) {
    const { exec } = require('child_process');
    const c = process.platform === 'win32' ? `start "" "${OUT}"`
      : process.platform === 'darwin' ? `open "${OUT}"` : `xdg-open "${OUT}"`;
    exec(c);
  }
}

function cmdFrom(args) {
  const colors = args.map((h) => norm(h));
  const fam = P.fromColors(colors);
  const t = T.resolve(fam.primary); // 只为跑一次自检
  console.log(JSON.stringify({ family: fam }, null, 2));
  console.log('\n调用方式：node scripts/build.js spec.json --theme ' + fam.primary);
  console.log('或把上面这段 family 贴进 assets/colors.json 的 families，并用 code C10 引用。');
  const issues = P.audit(t);
  if (issues.length) console.log('提示：' + issues.map((i) => i.msg).join('；'));
}

function main() {
  const cmd = process.argv[2] || 'list';
  const rest = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  if (cmd === 'list') return cmdList();
  if (cmd === 'show') return cmdShow(rest[0]);
  if (cmd === 'card') return cmdCard(rest);
  if (cmd === 'from') return cmdFrom(rest);
  console.error('用法：node scripts/palette.js list | show <c05> | card [c05 ...] | from <hex...>');
  process.exit(2);
}

main();
