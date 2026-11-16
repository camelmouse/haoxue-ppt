# -*- coding: utf-8 -*-
"""Color Engine 落地检查：量化一本 PPT 的用色是否符合「少色相、多色阶；少纯色、多表面」。

用法：
    python scripts/colorqa.py deck.pptx [--json out/colorqa.json] [--strict]

原理：不逐页打分，而是整册统计——把所有形状填充（渐变取两端均值）与文字颜色
按色相聚成家族（45° 一簇），中性色（饱和度 <0.12）单独归为底/字系统。

检查项（整册层面）
 1 HUE       饱和色相家族数 >4 → warn，>5 → error（"花"的直接来源）
 2 DOMINANT  最大家族（不含中性）占比 <35% → warn（没有主导色，画面散）
 3 CANVAS    页面底 / 全幅铺底出现 #FFFFFF、#000000 → warn（"素"的直接来源）
 4 SURFACE   中性面层只有 1 种 → info（卡片与底没有层次差）
 5 TONAL     主家族内不同明度档 <3 → info（色阶没有用起来）
 6 ACCENT    次色相（强调色）面积占比 >12% → warn（强调变主流）

文字按字符量 × 字号² 估算面积权重；图片不参与统计（照片的色相不代表配色纪律）。

退出码：0 正常；--strict 时存在 error 返回 1。
"""
import argparse
import colorsys
import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

EMU = 914400.0
PAGE_AREA = 13.333 * 7.5
NEUTRAL_SAT = 0.12
HUE_CLUSTER = 45.0

ERROR, WARN, INFO = 'error', 'warn', 'info'
issues = []


def add(kind, level, msg):
    issues.append({'kind': kind, 'level': level, 'msg': msg})


def hx(c):
    try:
        return str(c).upper() if c else None
    except Exception:
        return None


def to_rgb(h):
    h = (h or '').lstrip('#')
    if len(h) != 6:
        return None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hsl_of(h):
    rgb = to_rgb(h)
    if not rgb:
        return None
    r, g, b = (x / 255 for x in rgb)
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    # HSV 饱和度：HLS 的 s 在近白/近黑上会虚高（F8F4F0 会被算成 s=0.36 的"彩色"），
    # 卡片渐变就全变成金色家族了。感知上的"彩不彩"要用 HSV 的 (max-min)/max。
    s_hsv = (max(rgb) - min(rgb)) / max(rgb) if max(rgb) else 0.0
    return {'h': hh * 360, 's': s_hsv, 'l': ll}


def fill_color(sh):
    """固体/渐变填充的代表色（渐变取 stop 均值）。"""
    try:
        f = sh.fill
        if f.type == 1 and f.fore_color.rgb is not None:
            return hx(f.fore_color.rgb)
        if f.type == 3:  # gradient
            stops = []
            for st in f.gradient_stops:
                c = hx(st.color.rgb) if st.color and st.color.rgb is not None else None
                if c:
                    stops.append(c)
            if stops:
                rgbs = [to_rgb(c) for c in stops if to_rgb(c)]
                if rgbs:
                    avg = tuple(round(sum(ch[i] for ch in rgbs) / len(rgbs)) for i in range(3))
                    return '%02X%02X%02X' % avg
    except Exception:
        pass
    return None


def cluster(colors):
    """colors: [(hex, weight)] → (neutral list, family dict)"""
    neutral, fams = {}, {}
    for c, w in colors:
        h = hsl_of(c)
        if not h:
            continue
        if h['s'] < NEUTRAL_SAT or h['l'] < 0.06 or h['l'] > 0.97:
            neutral[c] = neutral.get(c, 0) + w
            continue
        fam = int(round(h['h'] / HUE_CLUSTER)) % 8
        fams.setdefault(fam, {})
        fams[fam][c] = fams[fam].get(c, 0) + w
    return neutral, fams


def share_map(d, total):
    return sorted(((k, w / total) for k, w in d.items()), key=lambda x: -x[1])


def analyze(path):
    prs = Presentation(path)
    fills = []          # (hex, weight) 形状填充
    texts = []          # (hex, weight) 文字
    canvas = []         # 页面底 / 全幅铺底
    for slide in prs.slides:
        # 页面底
        try:
            bg = hx(slide.background.fill.fore_color.rgb) if slide.background.fill.type == 1 else None
        except Exception:
            bg = None
        if bg:
            canvas.append(bg)
            fills.append((bg, PAGE_AREA))
        for sh in slide.shapes:
            w = (sh.width or 0) / EMU
            hh = (sh.height or 0) / EMU
            area = w * hh
            if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                continue  # 照片的色相不进配色纪律
            c = fill_color(sh)
            if c and area > 0.04:
                if area >= PAGE_AREA * 0.92:
                    canvas.append(c)
                    fills.append((c, area * 0.9))  # 全幅铺底按 90% 计
                else:
                    fills.append((c, area))
            if sh.has_text_frame:
                for p in sh.text_frame.paragraphs:
                    for r in p.runs:
                        tc = None
                        try:
                            if r.font.color and r.font.color.rgb is not None:
                                tc = hx(r.font.color.rgb)
                        except Exception:
                            tc = None
                        if tc and r.text.strip():
                            pt = r.font.size.pt if r.font.size else 18
                            texts.append((tc, len(r.text.strip()) * (pt / 72.0) ** 2))

    total_fill = sum(w for _, w in fills) or 1
    total_text = sum(w for _, w in texts) or 1
    nf, ff = cluster(fills)
    nt, ft = cluster(texts)
    # 合并填充 + 文字（文字权重占比很小，只用来让主色相在统计里出现）
    fams = {}
    for src in (ff, ft):
        for fam, d in src.items():
            fams.setdefault(fam, {})
            for c, w in d.items():
                fams[fam][c] = fams[fam].get(c, 0) + (w if src is ff else w * 0.25)
    neutrals = {}
    for d in (nf, nt):
        for c, w in d.items():
            neutrals[c] = neutrals.get(c, 0) + w
    grand = sum(sum(d.values()) for d in fams.values()) + sum(neutrals.values()) or 1

    fam_share = {fam: sum(d.values()) for fam, d in fams.items()}
    sat_total = sum(fam_share.values()) or 1
    fam_top = sorted(((fam, w / sat_total) for fam, w in fam_share.items()), key=lambda x: -x[1])
    sat_total_fam = {fam: sum(d.values()) or 1 for fam, d in fams.items()}

    report = {
        'file': os.path.basename(path),
        'pages': len(prs.slides._sldIdLst),
        'canvas': sorted(set(canvas)),
        'neutral_count': len(neutrals),
        'neutral_top': [(c, round(w / grand, 3)) for c, w in share_map(neutrals, grand)[:4]],
        'families': [
            {
                'cluster': fam,
                'share': round(share, 3),   # 占饱和色的比例（主导度在这里算）
                'colors': [(c, round(w / sat_total_fam[fam], 3)) for c, w in share_map(fams[fam], sat_total_fam[fam])[:6]],
                'tone_steps': len({round(hsl_of(c)['l'] / 0.07) for c in fams[fam] if hsl_of(c)}),
            }
            for fam, share in fam_top
        ],
        'issues': issues,
    }
    return report


def check(rep):
    del issues[:]
    n_fam = len(rep['families'])
    if n_fam > 5:
        add('HUE', ERROR, f'饱和色相 {n_fam} 族（上限 5）：每多一个色相，统一感掉一档')
    elif n_fam > 4:
        add('HUE', WARN, f'饱和色相 {n_fam} 族：建议收敛到 4 族以内（含深浅变体）')
    else:
        print(f'  ✓ 色相家族 {n_fam} 族（≤4）')

    top = rep['families'][0]['share'] if rep['families'] else 0
    if rep['families'] and top < 0.35:
        add('DOMINANT', WARN, f'最大家族只占 {top * 100:.0f}%（需 ≥35%）：没有主导色，画面会散')
    elif rep['families']:
        print(f'  ✓ 主导色相占 {top * 100:.0f}%')

    bad_canvas = [c for c in rep['canvas'] if c in ('FFFFFF', '000000')]
    if bad_canvas:
        add('CANVAS', WARN, f"页面底出现 {'、'.join('#' + c for c in set(bad_canvas))}：换成带温度的纸白/暖黑")
    elif not rep['canvas']:
        add('CANVAS', INFO, '页面底没有显式设置（跟随母版，通常是纯白）：给每页铺一层带色温的纸白')
    else:
        print(f"  ✓ 页面底 {', '.join('#' + c for c in rep['canvas'][:3])}（带色温）")

    if rep['neutral_count'] < 2:
        add('SURFACE', INFO, '中性面层只有 1 种：卡片和底没有层次差，加一层 surface（比底亮或暗一档）')
    else:
        print(f"  ✓ 中性面层 {rep['neutral_count']} 种")

    if rep['families']:
        steps = rep['families'][0]['tone_steps']
        if steps < 3:
            add('TONAL', INFO, f'主色相只用了 {steps} 档明度：色阶没用起来，标题/色块/图标应来自不同档')
        else:
            print(f'  ✓ 主色相用了 {steps} 档明度')

    if len(rep['families']) > 1:
        second = rep['families'][1]['share']
        if second > 0.12:
            add('ACCENT', WARN, f'次色相占 {second * 100:.0f}%（需 ≤12%）：强调色面积超了，强调会变主流')
        else:
            print(f'  ✓ 强调色相占 {second * 100:.0f}%（≤12%）')


def main():
    ap = argparse.ArgumentParser(description='Color Engine 落地检查')
    ap.add_argument('src')
    ap.add_argument('--json', default='')
    ap.add_argument('--strict', action='store_true')
    args = ap.parse_args()
    if not os.path.exists(args.src):
        print(f'找不到文件：{args.src}')
        return 2

    rep = analyze(args.src)
    check(rep)

    print(f"\nColor QA · {rep['file']} · {rep['pages']} 页")
    for fam in rep['families'][:4]:
        cs = '  '.join(f'#{c}({s * 100:.1f}%)' for c, s in fam['colors'][:4])
        print(f"  色相族 {fam['cluster'] * 45:>3}°  占饱和色 {fam['share'] * 100:>4.0f}%  {fam['tone_steps']} 档明度  {cs}")
    print(f"  中性（底/面/字）：{'  '.join(f'#{c}({s * 100:.0f}%)' for c, s in rep['neutral_top'])}")

    if issues:
        print()
        for i in issues:
            mark = {'error': '✗', 'warn': '!', 'info': '·'}[i['level']]
            print(f"  {mark} [{i['kind']}] {i['msg']}")
    else:
        print('\n  全部通过：少色相、有主导、有表面、有色阶。')

    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)) or '.', exist_ok=True)
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(rep, f, ensure_ascii=False, indent=2)
        print(f"\nJSON：{args.json}")

    has_error = any(i['level'] == 'error' for i in issues)
    return 1 if (args.strict and has_error) else 0


if __name__ == '__main__':
    sys.exit(main())
