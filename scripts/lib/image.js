// 图片处理：按相对区域裁切（用于"局部放大解释"）
const fs = require('fs');
const path = require('path');
const os = require('os');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const CACHE = path.join(os.tmpdir(), 'haoxue-ppt-crops');

async function crop(src, rx, ry, rw, rh, outName) {
  if (!sharp || !src || !fs.existsSync(src)) return null;
  fs.mkdirSync(CACHE, { recursive: true });
  const meta = await sharp(src).metadata();
  const W = meta.width || 1, H = meta.height || 1;
  const left = Math.round(Math.max(0, Math.min(1, rx)) * W);
  const top = Math.round(Math.max(0, Math.min(1, ry)) * H);
  const width = Math.max(8, Math.round(Math.min(1 - rx, rw) * W));
  const height = Math.max(8, Math.round(Math.min(1 - ry, rh) * H));
  const out = path.join(CACHE, outName || `crop-${Date.now()}.png`);
  await sharp(src).extract({ left, top, width, height }).png().toFile(out);
  return out;
}

async function cropSyncSafe(...args) {
  try { return await crop(...args); } catch (e) { return null; }
}

// 读原图像素尺寸（用于把"面板宽高比"换算成裁切区域比例）
async function size(src) {
  if (!src || !fs.existsSync(src)) return null;
  if (sharp) {
    try {
      const m = await sharp(src).metadata();
      if (m.width && m.height) return { width: m.width, height: m.height, aspect: m.width / m.height };
    } catch (e) { /* 落到下面的手工解析 */ }
  }
  try {
    const buf = fs.readFileSync(src);
    const dim = require('./cropfix').imageSize(buf);
    if (dim && dim.w && dim.h) return { width: dim.w, height: dim.h, aspect: dim.w / dim.h };
  } catch (e) { /* ignore */ }
  return null;
}

module.exports = { crop, cropSyncSafe, size, hasSharp: !!sharp };
