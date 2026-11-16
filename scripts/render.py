# -*- coding: utf-8 -*-
"""把 PPTX 逐页渲染为 PNG —— "看真实效果"的验收手段。

默认用本机离线渲染库（Spire.Presentation，评估版单册 10 页，自动分册）。
需要时退回 LibreOffice；都不可用则提示用 out/*.html 预览。

用法：
    python scripts/render.py deck.pptx -o out/preview [--max N] [--no-crop|--crop]

默认抹掉 Spire 评估版水印并保留完整画幅；--crop 才是裁掉顶部 5%（会切版面）。
"""
import argparse
import os
import shutil
import sys
import tempfile

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BATCH = 10  # 评估版单册上限


def _count_slides(path):
    try:
        from pptx import Presentation as P3
        return len(P3(path).slides)
    except Exception:
        return 0


def _split_batch(path, start, end, tmpdir, tag):
    """复制一份，并删除 start..end 之外的页，返回临时文件路径。"""
    from pptx import Presentation as P3
    prs = P3(path)
    sldIdLst = prs.slides._sldIdLst
    ids = list(sldIdLst)
    rel_ns = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    for idx in reversed(range(len(ids))):
        if not (start <= idx < end):
            rId = ids[idx].get(rel_ns)
            prs.part.drop_rel(rId)
            sldIdLst.remove(ids[idx])
    out = os.path.join(tmpdir, f'batch-{tag}.pptx')
    prs.save(out)
    return out


def _plan(path, max_pages):
    total = _count_slides(path)
    limit = total if not max_pages else min(total, max_pages)
    if total <= BATCH:
        return [(path, 0, limit)], total
    tmpdir = tempfile.mkdtemp(prefix='haoxue-split-')
    plan = []
    for start in range(0, limit, BATCH):
        end = min(start + BATCH, limit)
        plan.append((_split_batch(path, start, end, tmpdir, start), start, end - start))
    return plan, total


def _crop_top(out, ratio=0.05):
    try:
        from PIL import Image
        im = Image.open(out)
        w, h = im.size
        im.crop((0, int(h * ratio), w, h)).save(out)
    except Exception:
        pass


def _thin_only(mask, max_run=18):
    """只保留"细笔画"像素：同一行内连续长度 < max_run 的像素段。

    水印是文字，笔画窄；导航胶囊、色块是实心块，一行内连续几十上百像素。
    用这个区分，就能在两条带重叠时只擦水印、不动版面元素。
    """
    import numpy as np
    out = np.zeros_like(mask)
    for y in range(mask.shape[0]):
        row = mask[y]
        if not row.any():
            continue
        idx = np.flatnonzero(row)
        for seg in np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1):
            if len(seg) <= max_run:
                out[y, seg] = True
    return out


def _clean_watermark(out, ratio=0.048):
    """抹掉顶部评估版水印，但保留完整画幅。

    裁掉顶部会把真实版面（y<0.375 in 的元素）一起切掉，预览就失真了。
    水印是半透明文字，颜色随底色变化（浅色页偏粉、深色页偏亮白），
    因此按两步判定：先找"与条带背景色差异大"的像素，再只保留细笔画部分。
    """
    try:
        import numpy as np
        from PIL import Image
        im = Image.open(out).convert('RGB')
        w, h = im.size
        band = max(1, int(h * ratio))
        a = np.array(im)
        top = a[:band, :, :].astype(int)
        bg = np.median(top.reshape(-1, 3), axis=0)
        # 水印是白色（深色页）或浅粉（浅色页），三个通道都很亮；
        # 橙色徽标 min 只有 83，靠这一条避免削掉胶囊圆角。
        bright = top.min(axis=2) > 150
        mask = (np.abs(top - bg).max(axis=2) > 20) & bright
        if mask.mean() < 0.001:
            return
        mask = _thin_only(mask)
        if mask.mean() > 0.3:          # 条带本身是画面（全幅图），放弃清理
            return
        region = a[:band, :, :]
        region[mask] = bg.astype(np.uint8)
        a[:band, :, :] = region
        Image.fromarray(a).save(out)
    except Exception:
        pass


def render_with_spire(path, outdir, max_pages=None, crop=True):
    from spire.presentation import Presentation
    plan, total = _plan(path, max_pages)
    tmpdir = tempfile.mkdtemp(prefix='haoxue-render-')
    outs = []
    for src, start, count in plan:
        local = os.path.join(tmpdir, f'r-{start}.pptx')
        shutil.copy2(src, local)  # 避开工作目录的文件占用
        prs = Presentation()
        prs.LoadFromFile(local)
        for i in range(min(count, len(prs.Slides))):
            img = prs.Slides[i].SaveAsImage()
            out = os.path.join(outdir, f'slide-{start + i + 1:02d}.png')
            img.Save(out)
            if crop == 'clean':
                _clean_watermark(out)
            elif crop:
                _crop_top(out)
            outs.append(out)
        prs.Dispose()
    shutil.rmtree(tmpdir, ignore_errors=True)
    return outs, total


def render_with_soffice(path, outdir):
    import subprocess
    exe = shutil.which('soffice') or shutil.which('libreoffice')
    if not exe:
        return None, 0
    subprocess.run([exe, '--headless', '--convert-to', 'pdf', '--outdir', outdir, path], check=True)
    pdf = os.path.join(outdir, os.path.splitext(os.path.basename(path))[0] + '.pdf')
    try:
        import fitz
        doc = fitz.open(pdf)
        outs = []
        for i, page in enumerate(doc):
            out = os.path.join(outdir, f'slide-{i + 1:02d}.png')
            page.get_pixmap(dpi=110).save(out)
            outs.append(out)
        return outs, len(doc)
    except Exception:
        return [], 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pptx')
    ap.add_argument('-o', '--out', default='out/preview')
    ap.add_argument('--max', type=int, default=0)
    ap.add_argument('--no-crop', action='store_true', help='保留水印，不做任何处理')
    ap.add_argument('--mode', choices=['cut', 'clean', 'raw'], default='cut',
                    help='cut=裁掉顶部水印条（默认，画幅略矮）；clean=抹水印保画幅；raw=保留水印')
    args = ap.parse_args()

    if not os.path.exists(args.pptx):
        print(f'文件不存在：{args.pptx}', file=sys.stderr)
        return 2
    os.makedirs(args.out, exist_ok=True)
    maxp = args.max or None
    try:
        mode = 'raw' if args.no_crop else args.mode
        crop_arg = {'raw': False, 'cut': True, 'clean': 'clean'}[mode]
        outs, total = render_with_spire(args.pptx, args.out, maxp, crop=crop_arg)
        print(f'渲染完成：{len(outs)}/{total} 页 → {os.path.abspath(args.out)}')
        for o in outs:
            print('  ' + os.path.basename(o))
        return 0
    except ImportError:
        pass
    except Exception as e:
        print(f'本地渲染库不可用：{e}', file=sys.stderr)

    outs, total = render_with_soffice(args.pptx, args.out)
    if outs:
        print(f'渲染完成（LibreOffice）：{len(outs)} 页 → {os.path.abspath(args.out)}')
        return 0

    print('未找到可用渲染器：可先打开 out/*.html 核对版式，或安装 LibreOffice / Spire.Presentation。', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main())
