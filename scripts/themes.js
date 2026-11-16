#!/usr/bin/env node
/**
 * 主题工具（legacy）：
 *   node scripts/palette.js list           Color Families（新课件默认）——色阶选色在这边
 *   node scripts/themes.js list            列出 10 套旧主题（表格）
 *   node scripts/themes.js preview         生成 out/themes.html 色卡预览（浏览器打开即可对比）
 *   node scripts/themes.js preview --open  生成并尝试打开
 */
const fs = require('fs');
const path = require('path');
const themeMod = require('./lib/theme');
const { contrast } = require('./lib/color');

const OUT = path.resolve(__dirname, '../out/themes.html');

function swatchRow(theme) {
  const keys = [
    ['bg', '底色'], ['surface', '面板'], ['surfaceAlt', '交替面板'], ['line', '分隔线'],
    ['primary', '主色'], ['primarySoft', '主色浅底'], ['accent', '强调'], ['accentSoft', '强调浅底'],
    ['ink', '标题'], ['body', '正文'], ['muted', '次级'], ['deep', '深色底'], ['deepInk', '深色页标题'],
  ];
  return keys.map(([k, label]) => `
      <div class="sw">
        <div class="chip" style="background:#${theme[k]}"></div>
        <div class="meta"><b>${label}</b><span>#${theme[k]}</span></div>
      </div>`).join('');
}

function card(theme) {
  const isDark = !!theme.dark;
  const textC = isDark ? theme.deepInk : theme.ink;
  const mutedC = isDark ? theme.deepMuted : theme.muted;
  return `
  <section class="card" style="background:#${theme.bg};color:${textC}">
    <header>
      <div>
        <h2 style="color:${textC}">${theme.name}</h2>
        <p style="color:${mutedC}">${theme.id} · ${theme.mood || ''}</p>
      </div>
      <div class="badge" style="background:#${theme.primarySoft};color:#${theme.primaryText}">
        正文对比度 ${contrast(theme.body, theme.bg).toFixed(1)}:1
      </div>
    </header>
    <div class="demo">
      <div class="band" style="background:#${theme.accentSoft};border-left:5px solid #${theme.accent}">
        <span style="color:#${theme.accentText}">结论条 · ${theme.bestFor ? theme.bestFor.join(' / ') : ''}</span>
      </div>
      <div class="bars">
        ${(theme.chart || []).slice(0, 5).map((c, i) => `<i style="background:#${c};height:${40 + i * 14}px"></i>`).join('')}
      </div>
    </div>
    <div class="swatches">${swatchRow(theme)}</div>
  </section>`;
}

function main() {
  const cmd = process.argv[2] || 'list';
  const themes = themeMod.all();

  if (cmd === 'list') {
    console.log('id'.padEnd(12), 'name'.padEnd(8), 'base'.padEnd(8), 'accent'.padEnd(8), 'dark', ' 气质');
    themes.forEach((t) => {
      console.log(
        t.id.padEnd(12), (t.name || '').padEnd(8), t.base.padEnd(8), t.accent.padEnd(8),
        (t.dark ? 'yes' : ' - '), ` ${t.mood || ''}`,
      );
    });
    console.log(`\n共 ${themes.length} 套。用法：node scripts/build.js <spec> --theme <id>`);
    return;
  }

  if (cmd === 'preview') {
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>haoxue-ppt 主题色卡</title>
<style>
  body{margin:0;padding:32px;background:#eceae6;font-family:"Microsoft YaHei",system-ui,sans-serif}
  h1{font-size:20px;margin:0 0 6px;color:#222}
  .sub{color:#666;margin:0 0 24px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:20px}
  .card{border-radius:14px;padding:20px;box-shadow:0 2px 14px rgba(0,0,0,.08)}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  h2{margin:0;font-size:19px}
  header p{margin:4px 0 0;font-size:12px}
  .badge{font-size:11px;padding:4px 9px;border-radius:20px;white-space:nowrap}
  .demo{margin:16px 0}
  .band{padding:9px 12px;font-size:12px;border-radius:2px}
  .bars{display:flex;align-items:flex-end;gap:8px;height:70px;margin-top:14px}
  .bars i{flex:1;border-radius:2px 2px 0 0;display:block}
  .swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-top:8px}
  .sw .chip{height:26px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
  .sw .meta{display:flex;flex-direction:column;font-size:10px;margin-top:3px;opacity:.75;line-height:1.3}
</style></head><body>
<h1>haoxue-ppt · 旧主题（legacy）色卡</h1>
<p class="sub">旧主题仅用于复现已有课件；新课件选色走 Color Engine：node scripts/palette.js card</p>
<div class="grid">${themes.map(card).join('')}</div>
</body></html>`;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, html);
    console.log(`✓ 已生成 ${OUT}`);
    if (process.argv.includes('--open')) {
      const { exec } = require('child_process');
      const cmdOpen = process.platform === 'win32' ? `start "" "${OUT}"`
        : process.platform === 'darwin' ? `open "${OUT}"` : `xdg-open "${OUT}"`;
      exec(cmdOpen);
    }
    return;
  }

  console.error('用法：node scripts/themes.js list | preview [--open]');
  process.exit(2);
}

main();
