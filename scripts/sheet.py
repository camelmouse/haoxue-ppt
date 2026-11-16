#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把一叠渲染出来的 slide PNG 拼成一张"样张总览"图（给文档/交付物用）。

用法：
    python scripts/sheet.py out/main-preview -o out/预览-健康管理与营销.png
    python scripts/sheet.py out/themes-preview -o out/预览-主题.png --cols 5 --width 260

参数：
    --cols    每行几张（默认 3）
    --width   每张缩放到多宽（默认 340）
    --gap     图间距（默认 8）
    --bg      背景色（默认 #FFFFFF）
    --label   在图下方加文件名（默认不加）

只依赖 Pillow。按文件名自然排序（slide-2 排在 slide-10 之前）。
"""
import argparse
import os
import re
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    sys.exit('需要 Pillow：pip install pillow')


def nat_key(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='PNG 目录')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--cols', type=int, default=3)
    ap.add_argument('--width', type=int, default=340)
    ap.add_argument('--gap', type=int, default=8)
    ap.add_argument('--bg', default='#FFFFFF')
    ap.add_argument('--label', action='store_true')
    args = ap.parse_args()

    files = sorted(
        [f for f in os.listdir(args.src) if f.lower().endswith('.png')],
        key=nat_key,
    )
    if not files:
        sys.exit(f'{args.src} 里没有 PNG')

    imgs = []
    for f in files:
        im = Image.open(os.path.join(args.src, f)).convert('RGB')
        h = round(im.height * args.width / im.width)
        imgs.append((f, im.resize((args.width, h), Image.LANCZOS)))

    cell_h = max(im.height for _, im in imgs) + (20 if args.label else 0)
    cols = max(1, min(args.cols, len(imgs)))
    rows = (len(imgs) + cols - 1) // cols
    gap = args.gap
    W = cols * args.width + (cols + 1) * gap
    H = rows * cell_h + (rows + 1) * gap

    sheet = Image.new('RGB', (W, H), args.bg)
    draw = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(imgs):
        r, c = divmod(i, cols)
        x = gap + c * (args.width + gap)
        y = gap + r * (cell_h + gap)
        sheet.paste(im, (x, y))
        if args.label:
            draw.text((x + 2, y + im.height + 4), os.path.splitext(name)[0], fill='#666666')

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sheet.save(args.out, optimize=True)
    print(f'✓ {args.out}  {len(imgs)} 张 / {cols} 列  {sheet.width}×{sheet.height}')


if __name__ == '__main__':
    main()
