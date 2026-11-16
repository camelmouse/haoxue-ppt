// 生成后处理（二）：让图片真正"按比例裁切"，而不是被拉伸。
// pptxgenjs 的 sizing:'cover' 只改画框，不会写 srcRect，照片会被拉变形。
// 这里在 OOXML 层按画框比例补上 <a:srcRect>，任何播放器都能正确裁切。
const fs = require('fs');
const JSZip = require('jszip');

// 读取 PNG / JPEG 像素尺寸（避免为此引入依赖）
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf.slice(1, 4).toString('ascii') === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let o = 2;
      while (o < buf.length - 9) {
        if (buf[o] !== 0xFF) { o += 1; continue; }
        const marker = buf[o + 1];
        if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch (e) { /* 忽略解析失败 */ }
  return null;
}

const pct = (v) => Math.round(Math.max(0, Math.min(0.49, v)) * 100000);

async function fixImageCrops(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const sizeCache = {};
  let fixed = 0;

  for (const slideName of slides) {
    const relName = slideName.replace('slides/', 'slides/_rels/') + '.rels';
    if (!zip.file(relName)) continue;
    const rels = await zip.file(relName).async('string');
    const relMap = {};
    for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
      relMap[m[1]] = m[2].replace('../', 'ppt/');
    }

    let xml = await zip.file(slideName).async('string');
    const blocks = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/g) || [];
    let touched = false;

    for (const block of blocks) {
      const name = (block.match(/<p:cNvPr[^>]*name="([^"]*)"/) || [, ''])[1];
      if (!/^cover\./i.test(name)) continue;
      const ext = block.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      const embed = block.match(/r:embed="(rId\d+)"/);
      if (!ext || !embed) continue;
      const target = relMap[embed[1]];
      if (!target || !zip.file(target)) continue;

      if (!sizeCache[target]) {
        const buf = await zip.file(target).async('nodebuffer');
        sizeCache[target] = imageSize(buf);
      }
      const size = sizeCache[target];
      if (!size || !size.w || !size.h) continue;

      const frameAspect = Number(ext[1]) / Number(ext[2]);
      const imgAspect = size.w / size.h;
      let next = '<a:srcRect/>';
      if (imgAspect > frameAspect * 1.015) {
        const side = (1 - frameAspect / imgAspect) / 2;
        next = `<a:srcRect l="${pct(side)}" r="${pct(side)}"/>`;
      } else if (imgAspect < frameAspect / 1.015) {
        const side = (1 - imgAspect / frameAspect) / 2;
        next = `<a:srcRect t="${pct(side)}" b="${pct(side)}"/>`;
      }
      const newBlock = block.replace(/<a:srcRect[^/]*\/>/, next);
      if (newBlock !== block) {
        xml = xml.replace(block, newBlock);
        touched = true;
        fixed += 1;
      }
    }
    if (touched) zip.file(slideName, xml);
  }

  if (fixed) {
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, out);
  }
  return { fixed };
}

module.exports = { fixImageCrops, imageSize };
