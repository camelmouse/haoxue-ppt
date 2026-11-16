#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Design DNA：把一份参考 PPT 拆成"可迁移的设计参数"，而不是拷一份模板。

输出六段：
  visual      配色（面积加权的真实用色，不是版式主题里的名义色）
  typography  字体与字号层级
  layout      页面类型分布（全幅图 / 图文左右 / 卡片网格 / 图表 / 大字 / 纯文字）
  density     每页字数、填充率、最挤的一页
  image       图片密度、出血程度
  narrative   文字量节奏曲线、节拍页位置

铁律：**学习 ≠ 复制**。本脚本只输出数值与结构，不导出图片、不导出 logo、
不保存任何原始素材。要复用的是"它为什么这样排"，不是"它长什么样"。

用法：
  python scripts/dna.py 参考.pptx                    # 打印报告
  python scripts/dna.py 参考.pptx --json out/dna.json
  python scripts/dna.py 参考.pptx --quiet            # 只出建议
"""
import argparse
import json
import os
import sys
from collections import Counter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

EMU = 914400.0


# ---------------- 颜色工具 ----------------
def rgb_hex(c):
    try:
        return str(c).upper() if c else None
    except Exception:
        return None


def hex_to_rgb(h):
    h = (h or '').lstrip('#')
    if len(h) != 6:
        return None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def luminance(h):
    rgb = hex_to_rgb(h)
    if not rgb:
        return 0.5
    def f(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def sat(h):
    """饱和度（HSV）。底色多为低饱和的暖白/冷灰，靠面积统计会把它误判成主色。"""
    rgb = hex_to_rgb(h)
    if not rgb:
        return 0.0
    mx, mn = max(rgb), min(rgb)
    return 0.0 if mx == 0 else (mx - mn) / mx


def dist(a, b):
    ra, rb = hex_to_rgb(a), hex_to_rgb(b)
    if not ra or not rb:
        return 999
    return sum((x - y) ** 2 for x, y in zip(ra, rb)) ** 0.5


# ---------------- 主题库（用于推荐） ----------------
def load_themes():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, '..', 'assets', 'themes.json')
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f).get('themes', [])
    except Exception:
        return []


def load_families():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, '..', 'assets', 'colors.json')
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f).get('families', [])
    except Exception:
        return []


def suggest_family(bg, primary, accent):
    """就近匹配 Color Family（c01–c09）。强调色权重最高，和 suggest_theme 同一逻辑。"""
    fams = [f for f in load_families() if f.get('primary')]
    if not fams:
        return None
    best, best_d = None, 1e9
    for f in fams:
        d = 0.0
        if bg and f.get('paper'):
            d += dist(bg, f['paper']) * 1.0
        if primary and f.get('primary'):
            d += dist(primary, f['primary']) * 0.45
        if accent and f.get('accent'):
            d += dist(accent, f['accent']) * 1.3
        if d < best_d:
            best, best_d = f, d
    return best


def suggest_theme(bg, primary, accent):
    themes = load_themes()
    if not themes:
        return None
    best, best_d = None, 1e9
    # 强调色权重最高：它是一套配色的身份证，且几乎不会和别套撞。
    # 主色权重最低：从成品里反推的"主色"常常是文字上的深金色，不是真正的主题主色。
    for t in themes:
        d = 0.0
        if bg and t.get('bg'):
            d += dist(bg, t['bg']) * 1.0
        if primary and t.get('primary'):
            d += dist(primary, t['primary']) * 0.45
        if accent and t.get('accent'):
            d += dist(accent, t['accent']) * 1.3
        if d < best_d:
            best, best_d = t, d
    return best


# ---------------- 页面分类 ----------------
def card_shapes(page):
    """像"卡片"的形状：尺寸在合理区间。整页背景 rect 与细装饰条不算。"""
    out = []
    for s in page['shapes']:
        if s['kind'] != 'shape':
            continue
        # 上限要放到接近页宽：全宽卡（8–12in）也是卡，只排除整页背景板
        if 1.2 <= s['w'] <= 12.6 and 0.5 <= s['h'] <= 6.6:
            out.append(s)
    return out


def classify(page, area):
    """给一页打类型标签。启发式，不求精确，求"能不能指导复用"。"""
    pics = [s for s in page['shapes'] if s['kind'] == 'picture']
    charts = [s for s in page['shapes'] if s['kind'] == 'chart']
    texts = [s for s in page['shapes'] if s['kind'] == 'text']
    lines = [s for s in page['shapes'] if s['kind'] == 'line']
    pic_area = sum(s['area'] for s in pics) / area if area else 0
    chars, max_pt = page['chars'], page['max_pt']
    cards = card_shapes(page)

    # 判定顺序有讲究：先排除"一眼就能认出"的页，再看结构。
    # 反过来的话，页面上二十个装饰矩形会把所有页都吸进"卡片网格"。
    if charts:
        return '图表页'
    if pic_area > 0.60:
        return '全幅图'
    if chars < 100 and max_pt >= 40:
        return '大字观点'
    if chars < 45:
        return '分隔/留白'
    if lines and len(cards) >= 2:
        return '结构图'
    if pic_area > 0.12 and len(texts) >= 2:
        return '图文左右'
    if len(cards) >= 3:
        return '卡片网格'
    return '纯文字'


def fingerprint(page):
    """版式指纹：把"长什么样"量化成一串桶。同指纹 = 同一种页面。
    比语义分类客观——不猜它是 flow 还是 timeline，只问"这两种页面在结构上是不是一回事"。"""
    texts = [s for s in page['shapes'] if s['kind'] == 'text']
    cards = card_shapes(page)
    b = lambda v, step: int(v // step)  # noqa: E731
    return (
        page['pics'] > 0,
        any(s['kind'] == 'chart' for s in page['shapes']),
        b(len(texts), 3),
        b(len(cards), 3),
        b(page['chars'], 90),
        b(page['max_pt'], 10),
    )


def read_pptx(path):
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(path)
    W = prs.slide_width / EMU
    H = prs.slide_height / EMU
    area = W * H
    pages, color_area, fonts, sizes = [], Counter(), Counter(), Counter()
    text_color = Counter()

    for idx, slide in enumerate(prs.slides, 1):
        try:
            bf = slide.background.fill
            if bf.type == 1:                       # solid
                hx = rgb_hex(bf.fore_color.rgb)
                if hx:
                    color_area[hx] += area         # 背景按整页面积计权
        except Exception:
            pass
        shp = []
        chars = 0
        max_pt = 0
        pics = 0
        for s in slide.shapes:
            w = (s.width or 0) / EMU
            h = (s.height or 0) / EMU
            a = max(0.0, w * h)
            kind = 'shape'
            if s.shape_type == MSO_SHAPE_TYPE.PICTURE:
                kind, pics = 'picture', pics + 1
            elif getattr(s, 'has_chart', False) and s.has_chart:
                kind = 'chart'
            elif s.has_text_frame and s.text_frame.text.strip():
                kind = 'text'
            elif s.shape_type == MSO_SHAPE_TYPE.LINE:
                kind = 'line'

            # 填充色（面积加权）
            try:
                if s.fill and s.fill.type is not None and s.fill.type == 1:  # solid
                    hx = rgb_hex(s.fill.fore_color.rgb)
                    if hx and a > 0:
                        color_area[hx] += a
            except Exception:
                pass

            if s.has_text_frame:
                txt = s.text_frame.text or ''
                chars += len(txt.strip())
                for p in s.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.size:
                            pt = round(r.font.size.pt)
                            sizes[pt] += len(r.text or '') or 1
                            max_pt = max(max_pt, pt)
                        try:
                            hx = rgb_hex(r.font.color.rgb)
                            if hx:
                                text_color[hx] += len(r.text or '') or 1
                        except Exception:
                            pass
                        if r.font.name:
                            fonts[r.font.name] += len(r.text or '') or 1
            shp.append({'kind': kind, 'area': a, 'w': w, 'h': h,
                        'left': (s.left or 0) / EMU, 'top': (s.top or 0) / EMU})

        page = {'no': idx, 'chars': chars, 'max_pt': max_pt, 'pics': pics,
                'shapes': shp, 'kind': None}
        page['kind'] = classify(page, area)
        pages.append(page)

    return {'w': W, 'h': H, 'area': area, 'pages': pages,
            'color_area': color_area, 'text_color': text_color,
            'fonts': fonts, 'sizes': sizes}


def analyze(raw):
    pages = raw['pages']
    n = len(pages)
    total_area = raw['area'] * n or 1

    # 相对占比（不是占版面比）：底色会接近 100%，其余色按"用了多少"排，
    # 两者混在一张表里会互相矛盾，所以统一按"总用色量的份额"算。
    color_total = sum(raw['color_area'].values()) or 1
    colors = [(c, a / color_total) for c, a in raw['color_area'].most_common(8)
              if a / color_total > 0.004]

    tc_total = sum(raw['text_color'].values()) or 1
    text_colors = [(c, n / tc_total) for c, n in raw['text_color'].most_common(8)]

    # 底色 = 面积最大的那个（背景按整页计权，稳）
    bg = colors[0][0] if colors else None

    # 主色 / 强调色：面 + 字一起排，但要求"有色"（饱和度够）+ 与底色有明显差别。
    # 只看面积会把强调色永远判成 None —— 本 skill 的强调色本来就只用在细线和字上。
    cand = []
    for c, p in colors:
        if sat(c) > 0.10 and 0.06 < luminance(c) < 0.94 and dist(c, bg or 'FFFFFF') > 30:
            cand.append((c, p * 1.0, '面'))
    for c, p in text_colors:
        if sat(c) > 0.14 and 0.06 < luminance(c) < 0.94:
            cand.append((c, p * 0.55, '字'))
    cand.sort(key=lambda x: -x[1])
    primary = cand[0][0] if cand else None
    accent = next((c for c, _, _ in cand[1:] if dist(c, primary) > 55), None) if primary else None

    sizes = raw['sizes']
    top_sizes = [s for s, _ in sizes.most_common(6)]
    body_pt = sizes.most_common(1)[0][0] if sizes else None
    title_pt = max([s for s in top_sizes if s <= 60] or [0]) or None
    min_pt = min([s for s in sizes if s > 0] or [0]) or None

    kinds = Counter(p['kind'] for p in pages)
    prints = Counter(fingerprint(p) for p in pages)
    chars = [p['chars'] for p in pages]
    avg_chars = sum(chars) / n if n else 0
    densest = max(pages, key=lambda p: p['chars']) if pages else None
    pic_pages = sum(1 for p in pages if p['pics'])
    pic_area_avg = sum(sum(s['area'] for s in p['shapes'] if s['kind'] == 'picture')
                       for p in pages) / (total_area) if total_area else 0

    # 节奏：文字量曲线（把每页字数归一化成 0-9 的档位，方便一眼看起伏）
    peak = max(chars) or 1
    curve = [min(9, round(c / peak * 9)) for c in chars]

    # 节拍页：把讲台"停一下"的页——分隔、大字、或任何字号 ≥40 的页。
    # 这是参考 PPT 里最值得直接借的东西：不是某页怎么排，而是多久停一次。
    beats = [p['no'] for p in pages
             if p['kind'] in ('分隔/留白', '大字观点') or p['max_pt'] >= 40]

    theme = suggest_theme(bg, primary, accent)
    fam = suggest_family(bg, primary, accent)
    return {
        'pages': n,
        'size': f'{raw["w"]:.2f} × {raw["h"]:.2f} in',
        'ratio': '16:9' if abs(raw['w'] / raw['h'] - 16 / 9) < 0.06 else f'{raw["w"] / raw["h"]:.2f}:1',
        'visual': {
            'bg': bg,
            'primary': primary,
            'accent': accent,
            'palette': [{'hex': c, 'share': round(p, 3)} for c, p in colors],
            'text_colors': [{'hex': c, 'share': round(p, 3)} for c, p in text_colors[:4]],
            'dark_pages': sum(1 for p in pages if luminance(bg or 'FFFFFF') < 0.35),
            'distinct_colors': len(colors),
        },
        'typography': {
            'title_pt': title_pt, 'body_pt': body_pt, 'min_pt': min_pt,
            'top_sizes': top_sizes,
            'hierarchy_ratio': round(title_pt / body_pt, 2) if title_pt and body_pt else None,
            'fonts': [f for f, _ in raw['fonts'].most_common(4)],
        },
        'layout': {
            'kinds': dict(kinds.most_common()),
            'kinds_ratio': {k: round(v / n, 2) for k, v in kinds.most_common()},
            'distinct_kinds': len(kinds),
            'distinct_styles': len(prints),
            'styles_top': [c for c, _ in prints.most_common(6)],
        },
        'density': {
            'avg_chars': round(avg_chars),
            'max_chars': max(chars) if chars else 0,
            'densest_page': densest['no'] if densest else None,
            'over_dense_pages': [p['no'] for p in pages if p['chars'] > 220],
        },
        'image': {
            'pages_with_image': pic_pages,
            'image_ratio': round(pic_pages / n, 2) if n else 0,
            'avg_area_share': round(pic_area_avg, 3),
            'full_bleed_pages': sum(1 for p in pages if p['kind'] == '全幅图'),
        },
        'narrative': {
            'char_curve': curve,
            'beats': beats,
            'beat_interval': round(n / len(beats), 1) if beats else None,
        },
        'suggest': {
            'theme': theme.get('id') if theme else None,
            'theme_name': theme.get('name') if theme else None,
            'family': (fam.get('code', '').lower() if fam else None),
            'family_name': fam.get('name') if fam else None,
            'family_cmd': ('node scripts/palette.js from ' + ' '.join(
                x for x in [bg, primary, accent] if x)) if (bg and primary) else None,
            'nav': 'chapters' if n >= 8 else 'minimal',
            'note': '结构参数可迁移；配色只有在原 PPT 配色本身成立时才值得复用',
        },
    }


def advice(dna):
    """把数字翻译成"下一份课件该怎么用"。"""
    out = []
    t = dna['typography']
    if t['hierarchy_ratio']:
        if t['hierarchy_ratio'] < 1.6:
            out.append(f"层级偏弱：标题 {t['title_pt']}pt / 正文 {t['body_pt']}pt = {t['hierarchy_ratio']}。"
                       f"参考它时不要照搬字号差，本 skill 用 52/34/26/21/18/16 六级。")
        else:
            out.append(f"层级可用：标题 {t['title_pt']}pt / 正文 {t['body_pt']}pt。")
    if t['min_pt'] and t['min_pt'] < 16:
        out.append(f"它的最小字号是 {t['min_pt']}pt——低于投影可读线。学版式，不学这个。")
    if t['fonts']:
        out.append(f"字体：{'、'.join(t['fonts'][:3])}。中文字体优先思源黑/雅黑，不要为仿它装字体。")

    lay = dna['layout']
    if lay['distinct_styles'] <= 2:
        out.append(f"只有 {lay['distinct_styles']} 种版式指纹（{list(lay['kinds'])[0]}为主）："
                   "版式上没多少可学的，价值在内容组织，不在排版。")
    else:
        out.append('页面类型：' + '、'.join(f'{k}×{v}' for k, v in list(lay['kinds'].items())[:5]))

    d = dna['density']
    if d['avg_chars'] > 180:
        out.append(f"平均每页 {d['avg_chars']} 字，偏密。学它的结构可以，密度不要照抄"
                   "（本 skill 上限 55% 填充率）。")
    if d['over_dense_pages']:
        out.append(f"最挤的页：{'、'.join('P%d' % x for x in d['over_dense_pages'][:5])}"
                   f"（>220 字），这些页通常是一页讲了两件事。")

    im = dna['image']
    if im['image_ratio'] > 0.5:
        out.append(f"{int(im['image_ratio'] * 100)}% 的页有图，平均占版面 "
                   f"{im['avg_area_share'] * 100:.0f}%。如果你没有同等质量的素材，"
                   "不要强行配图——无图版排版是另一套结构，不能靠占位图撑。")

    nar = dna['narrative']
    if nar['beats']:
        out.append(f"节拍页（分隔/大字）在第 {'、'.join(str(b) for b in nar['beats'][:6])} 页，"
                   f"平均每 {nar['beat_interval']} 页一次。这是最值得直接借的东西：节奏。")
    else:
        out.append('没有明显的节拍页：它是一路平推的。这类 PPT 适合阅读，不适合课堂讲。')

    sug = dna['suggest']
    if sug.get('family'):
        out.append(f"配色就近映射到 Color Family `{sug['family']}`（{sug['family_name']}）。"
                   "要完整沿用原配色（含纸白与墨色），运行：" + sug.get('family_cmd', ''))
    elif sug['theme']:
        out.append(f"配色可映射到本 skill 主题 `{sug['theme']}`（{sug['theme_name']}），"
                   "再按需微调强调色。")
    return out


def main():
    ap = argparse.ArgumentParser(description='从参考 PPT 抽取可迁移的 Design DNA')
    ap.add_argument('src')
    ap.add_argument('--json', default='')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(args.src):
        print(f'找不到文件：{args.src}')
        return 2
    if not args.src.lower().endswith(('.pptx', '.pptm')):
        print('只支持 .pptx（.ppt 请先另存为 .pptx；PDF 无法取结构参数）')
        return 2

    try:
        raw = read_pptx(args.src)
    except Exception as e:
        print(f'读取失败：{e}')
        return 2
    dna = analyze(raw)

    print(f'Design DNA · {os.path.basename(args.src)} · {dna["pages"]} 页 · {dna["size"]}（{dna["ratio"]}）')
    print()

    if not args.quiet:
        v, t, lay, d, im, nar = dna['visual'], dna['typography'], dna['layout'], dna['density'], dna['image'], dna['narrative']
        print('— 视觉 —')
        print(f'  底色 {v["bg"]}  主色 {v["primary"]}  强调 {v["accent"]}  用色 {v["distinct_colors"]} 种')
        print(f'  调色板：' + '  '.join(f'{p["hex"]}({p["share"] * 100:.0f}%)' for p in v['palette'][:6]))
        print(f'— 字 —')
        print(f'  标题 {t["title_pt"]}pt / 正文 {t["body_pt"]}pt / 最小 {t["min_pt"]}pt'
              + (f'  层级比 {t["hierarchy_ratio"]}' if t['hierarchy_ratio'] else ''))
        print(f'  字号分布：{t["top_sizes"]}')
        print(f'  字体：{"、".join(t["fonts"]) or "（沿用主题）"}')
        print(f'— 版式 —')
        print(f'  {lay["distinct_kinds"]} 类：' + '、'.join(f'{k}×{n}' for k, n in lay['kinds'].items()))
        print(f'  版式指纹 {lay["distinct_styles"]} 种（同指纹 = 结构上是同一种页）')
        print(f'— 密度 —')
        print(f'  平均 {d["avg_chars"]} 字/页，最挤 P{d["densest_page"]}（{d["max_chars"]} 字）')
        print(f'— 图 —')
        print(f'  {im["pages_with_image"]} 页有图（{im["image_ratio"] * 100:.0f}%），'
              f'图占版面 {im["avg_area_share"] * 100:.0f}%，全出血 {im["full_bleed_pages"]} 页')
        print(f'— 节奏 —')
        print(f'  字数曲线 {"".join(str(x) for x in nar["char_curve"])}（0–9 档）')
        print(f'  节拍页：{nar["beats"] or "无"}')
        print()

    print('— 怎么用（学习 ≠ 复制）—')
    for line in advice(dna):
        print(f'  · {line}')
    print()
    print('  只迁移这几项：页面类型配比、节拍间隔、图文比、层级策略。')
    print('  不要迁移：logo、人物照片、成组的几何装饰、它的具体配色值。')

    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump({'file': os.path.basename(args.src), **dna,
                       'advice': advice(dna)}, f, ensure_ascii=False, indent=2)
        print(f'\nJSON：{args.json}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
