// 图标：Lucide（ISC 许可）SVG → 按主题色栅格化为 PNG，带磁盘缓存。
// 有 sharp 时按需生成；无 sharp 时只读预置缓存（assets/icons/png/<color>/<name>.png）。
const fs = require('fs');
const path = require('path');
const { norm } = require('./color');

const os = require('os');
const ROOT = path.join(__dirname, '..', '..', 'assets', 'icons');
const SVG_DIR = path.join(ROOT, 'svg');
// 按需栅格化的结果放在临时缓存里，不随安装包分发
const PNG_DIR = process.env.HAOXUE_ICON_CACHE || path.join(os.tmpdir(), 'haoxue-icons');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

function svgPath(name) {
  const p = path.join(SVG_DIR, `${name}.svg`);
  return fs.existsSync(p) ? p : null;
}

function cachedPng(name, color) {
  const p = path.join(PNG_DIR, norm(color), `${name}.png`);
  return fs.existsSync(p) ? p : null;
}

async function ensurePng(name, color) {
  const hit = cachedPng(name, color);
  if (hit) return hit;
  const svg = svgPath(name);
  if (!svg || !sharp) return null;
  const dir = path.join(PNG_DIR, norm(color));
  fs.mkdirSync(dir, { recursive: true });
  const raw = fs.readFileSync(svg, 'utf8').replace(/currentColor/g, `#${norm(color)}`);
  const out = path.join(dir, `${name}.png`);
  await sharp(Buffer.from(raw)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
  return out;
}

function list() {
  if (!fs.existsSync(SVG_DIR)) return [];
  return fs.readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', '')).sort();
}

// 同步取图：只读缓存；缓存缺失且传入 generator 时才异步补
function makeResolver({ allowGenerate = true } = {}) {
  return {
    get(name, color) {
      if (!name) return null;
      const c = norm(color || '000000');
      const hit = cachedPng(name, c);
      if (hit) return hit;
      if (allowGenerate && sharp && svgPath(name)) {
        // 同步路径不可用，交由 prewarm 预热；此处返回 null 让版式降级
        return null;
      }
      return null;
    },
    has(name) { return !!svgPath(name); },
    list,
  };
}

async function prewarm(colors = [], names = null) {
  const icons = names || list();
  const out = [];
  for (const c of colors) {
    for (const n of icons) {
      const p = await ensurePng(n, c);
      if (p) out.push(p);
    }
  }
  return out;
}

module.exports = { makeResolver, prewarm, list, ensurePng, SVG_DIR, PNG_DIR };
