# -*- coding: utf-8 -*-
"""haoxue-ppt 自动质检：16 项检查，输出可读报告 + JSON。

用法：
    python scripts/qa.py deck.pptx [--strict] [--json out/qa.json] [--preview out/preview]

检查项
 1 BOUNDS      元素越界（装饰圆允许出血，会标注 decor）
 2 OVERFLOW    文本溢出（按字符宽度估算，保守模型）
 3 IMAGE       图片拉伸/缺失
 4 OVERLAP     文本块异常重叠
 5 FONT        字号 <16pt / 单页字号种类 >5 / 字号层级混乱
 6 CONTRAST    文字与背景对比度不足
 7 CHART       图表分类与数值数量不一致、无分类标签
 8 NAV         进度导航状态错误（缺失、重复、越界、序号不符）
 9 PLACEHOLDER 残留占位文字
10 REPEAT      连续页面版式重复
11 FILE        文件结构完整性
12 RENDER      渲染结果非空白（需先运行 render.py）
13 DENSITY     页面填充率过高（留白不足，>55%）
14 SHADOW      阴影方向不一致或过重（光源逻辑）
15 HIERARCHY   标题与正文层级差不足（<1.5 倍）
16 MARGIN      元素贴页边（安全边距 <0.5in）

13–16 对应「旁门左道」排版方法论的量化版本：留白、光影、层级、安全边距。
字号下限 16pt、单页字号种类 ≤5 是硬规则（投影/录屏场景下 16pt 已是可读临界）。

退出码：默认 0；--strict 时存在 error 返回 1。
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata
import zipfile

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from pptx import Presentation
from pptx.util import Emu

CANVAS_W, CANVAS_H = 13.333, 7.5
# 字号下限：16pt。这是"投影/录屏还能读"的临界值，也是本引擎的硬约束——
# 版式如果只能在 12pt 下才排得下，那说明内容该删，而不是字号该缩。
MIN_FONT = 16.0
MIN_AUX_FONT = 16.0
MIN_CORE_FONT = 16.0
AUX = re.compile(r'^(footer|page\.|nav\.|caption|source|decor|credit|note\.|aux\.|meta\.)', re.I)
# 胶囊导航：nav.tab.3 / nav.tab.3.on / nav.tab.3.on.badge
TAB_RE = re.compile(r'^nav\.tab\.(\d+)(\.on)?(?:\.|$)', re.I)
# 设计规则阈值（与 scripts/lib/design.js 保持一致）
DENSITY_MAX = 0.55     # 页面填充率上限：字号放大后留白必须跟着增加，至少 45%
MARGIN_MIN = 0.50      # 安全边距：正文元素距页边不小于 0.5in
HIER_RATIO = 1.5       # 标题 / 正文层级差下限
FONT_KINDS_MAX = 5     # 一页最多几种字号（字号要统一，靠字重/颜色拉层次）
SHADOW_ALPHA_MAX = 0.26
SHADOW_DIR_TOL = 15    # 光源方向容差（度）
# 整幅铺底类元素：不参与密度与边距统计
BLEED = re.compile(r'^(bg|scrim|decor)', re.I)
TOL = 0.06

ERROR, WARN, INFO = 'error', 'warn', 'info'
issues = []


def add(page, kind, level, msg, detail=None):
    issues.append({'page': page, 'kind': kind, 'level': level, 'msg': msg, 'detail': detail or {}})


def inch(v):
    return Emu(v).inches if v is not None else 0.0


def is_wide(ch):
    return unicodedata.east_asian_width(ch) in ('W', 'F')


def text_w_pt(text, size, bold=False):
    w = 0.0
    for ch in text:
        if ch == '\n':
            continue
        if ch == ' ':
            w += size * 0.30
        elif is_wide(ch):
            w += size * (0.92 if ch in '，。；：！？（）“”‘’《》【】' else 1.0)
        elif ch in 'iljI.,:;\'"!|':
            w += size * 0.30
        elif ch in 'mwMW@%':
            w += size * 0.86
        else:
            w += size * 0.55
    return w * (1.04 if bold else 1.0)


def para_lines(para, box_w_pt):
    size = max([r.font.size.pt for r in para.runs if r.font.size] or [16])
    text = ''.join(r.text for r in para.runs) or para.text
    if not text.strip():
        return 0, size
    bold = any(r.font.bold for r in para.runs)
    w = text_w_pt(text, size, bold)
    return max(1, math.ceil(w / max(box_w_pt, 1))), size


def color_of(run):
    try:
        if run.font.color and run.font.color.rgb is not None:
            return str(run.font.color.rgb)
    except Exception:
        pass
    return None


def lum(hexstr):
    r, g, b = (int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _solid_rgb(sh):
    """取形状的代表填充色。

    渐变填充（本引擎的卡片一律是 gradFill）取"中段"停靠点作为代表色：
    只认 solidFill 的话，卡片上的文字会被判定成"压在页底色上"——
    浅色卡片上恰好看不出问题，深色卡片上的白字就会误报成 1.2:1。
    """
    from pptx.oxml.ns import qn
    try:
        spPr = sh._element.find(qn('p:spPr'))
        if spPr is None:
            return None
        sf = spPr.find(qn('a:solidFill'))
        if sf is not None:
            clr = sf.find(qn('a:srgbClr'))
            if clr is None:
                return None
            alpha = clr.find(qn('a:alpha'))
            if alpha is not None and int(alpha.get('val')) < 5000:
                return None
            return clr.get('val')
        gf = spPr.find(qn('a:gradFill'))
        if gf is None:
            return None
        gs = gf.findall(qn('a:gsLst') + '/' + qn('a:gs'))
        if not gs:
            return None
        # 取位置最接近 50% 的停靠点：三段渐变里它就是"卡片本色"
        best, best_d = None, 1e9
        for g in gs:
            clr = g.find(qn('a:srgbClr'))
            if clr is None:
                continue
            d = abs(int(g.get('pos', '0')) - 50000)
            if d < best_d:
                best, best_d = clr.get('val'), d
        return best
    except Exception:
        return None


def slide_bg(slide):
    """页面实际底色：先取母版背景，再看有没有整页覆盖的实心形状（封面/深色页）。"""
    base = 'FFFFFF'
    try:
        f = slide.background.fill
        if f.type == 1 and f.fore_color.rgb is not None:
            base = str(f.fore_color.rgb)
    except Exception:
        pass
    cover = None
    for sh in slide.shapes:
        if sh.left is None:
            continue
        if inch(sh.width) * inch(sh.height) < 0.7 * CANVAS_W * CANVAS_H:
            continue
        c = _solid_rgb(sh)
        if c:
            cover = c
    return cover or base


def bg_under(shapes, box):
    """文本实际压在哪块填充上（用于色带/色块上的文字对比度）。"""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    col = None
    for sh in shapes:
        if sh.left is None:
            continue
        x, y = inch(sh.left), inch(sh.top)
        if x <= cx <= x + inch(sh.width) and y <= cy <= y + inch(sh.height):
            c = _solid_rgb(sh)
            if c:
                col = c
    return col


def shape_text(sh):
    return sh.text_frame.text.strip() if sh.has_text_frame else ''


def notes_layout(slide):
    try:
        txt = slide.notes_slide.notes_text_frame.text
    except Exception:
        return None, None
    m = re.search(r'\[haoxue:layout=([a-zA-Z]+)\]', txt)
    c = re.search(r'\[chapter=([^\]]+)\]', txt)
    return (m.group(1) if m else None), (c.group(1) if c else None)


def bbox(sh):
    x, y = inch(sh.left), inch(sh.top)
    return x, y, x + inch(sh.width), y + inch(sh.height)


def overlap_ratio(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    area = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return inter / area if area > 0.0001 else 0


def check_file(path):
    if not os.path.exists(path):
        add(0, 'FILE', ERROR, f'文件不存在：{path}')
        return None
    try:
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
            if bad:
                add(0, 'FILE', ERROR, f'压缩包内文件损坏：{bad}')
    except Exception as e:
        add(0, 'FILE', ERROR, f'无法作为 OOXML 打开：{e}')
        return None
    try:
        prs = Presentation(path)
    except Exception as e:
        add(0, 'FILE', ERROR, f'python-pptx 打开失败：{e}')
        return None
    if len(prs.slides) == 0:
        add(0, 'FILE', ERROR, '文件没有幻灯片')
        return None
    ratio = prs.slide_width / prs.slide_height if prs.slide_height else 0
    if abs(ratio - 16 / 9) > 0.02:
        add(0, 'FILE', WARN, f'页面比例 {ratio:.2f} 不是 16:9')
    return prs


def check_slide(slide, idx, prs, preview_dir):
    bg = slide_bg(slide)
    texts = []
    sizes = []
    layout, chapter = notes_layout(slide)
    nav_current = []
    nav_ticks = []
    nav_tabs = set()
    chart_count = 0
    image_count = 0
    fill_rects = []      # 填充率统计材料
    shadow_bad = []      # (kind, name, value)
    margin_bad = []      # (name, side, gap)

    for sh in slide.shapes:
        name = sh.name or ''
        if sh.left is None:
            continue
        x, y, x2, y2 = bbox(sh)
        w, h = x2 - x, y2 - y

        # 1) 越界
        out = x < -TOL or y < -TOL or x2 > CANVAS_W + TOL or y2 > CANVAS_H + TOL
        if out:
            decor = (name.lower().startswith('decor') or name in ('bg', 'scrim')
                     or name == 'grad.arc')
            add(idx, 'BOUNDS', INFO if decor else ERROR,
                f'{"装饰出血" if decor else "元素越界"}：{name or "未命名"} ({x:.2f},{y:.2f})-({x2:.2f},{y2:.2f})')

        # 装饰弧：贴边出血的背景元素，越界是故意的，也不占任何密度
        if name == 'grad.arc':
            continue
        # 13/16) 设计规则的材料：铺底元素与页眉页脚不参与
        full_bleed = bool(BLEED.match(name)) or w * h > 0.6 * CANVAS_W * CANVAS_H
        aux_el = bool(AUX.match(name))
        has_body_text = sh.has_text_frame and bool(sh.text_frame.text.strip())
        if not full_bleed and not aux_el:
            # 密度只统计"实心块 / 图片 / 图表"：文字是内容本身，
            # 按文本框矩形算会把正常文字页也算成"塞满"。
            if not has_body_text:
                fill_rects.append((x, y, x2, y2))
            for side, gap in (('左', x), ('上', y), ('右', CANVAS_W - x2), ('下', CANVAS_H - y2)):
                if -TOL < gap < MARGIN_MIN:
                    margin_bad.append((name or '未命名', side, gap))
                    break

        # 14) 阴影：光源方向必须一致（向下 90°），不透明度不能太重
        try:
            for sm in re.finditer(r'<a:outerShdw([^>]*)>(.*?)</a:outerShdw>', sh._element.xml, re.S):
                attrs, body = sm.group(1), sm.group(2)
                dm = re.search(r'dir="(\d+)"', attrs)
                deg = int(dm.group(1)) / 60000 if dm else 90
                am = re.search(r'<a:alpha val="(\d+)"', body)
                alpha = int(am.group(1)) / 100000 if am else 1.0
                if abs(deg - 90) > SHADOW_DIR_TOL:
                    shadow_bad.append(('dir', name or '未命名', deg))
                elif alpha > SHADOW_ALPHA_MAX:
                    shadow_bad.append(('alpha', name or '未命名', alpha))
        except Exception:
            pass

        # 3) 图片
        if sh.shape_type == 13:
            image_count += 1
            try:
                img = sh.image
                iw, ih = img.size
                frame_ratio = w / h if h else 0
                img_ratio = iw / ih if ih else 0
                cropped = False
                try:
                    xml = sh._element.xml
                    m = re.search(r'<a:srcRect[^/]*/>', xml)
                    if m and re.search(r'(l|t|r|b)="[1-9]', m.group(0)):
                        cropped = True
                except Exception:
                    pass
                if frame_ratio and abs(frame_ratio - img_ratio) / img_ratio > 0.08 and not cropped:
                    # cover 裁切是允许的，只有明显拉伸才报（比例差 > 8% 且宽高都被撑满）
                    add(idx, 'IMAGE', WARN, f'图片比例可能被拉伸：{name} 画框 {frame_ratio:.2f} / 原图 {img_ratio:.2f}')
            except Exception:
                add(idx, 'IMAGE', WARN, f'图片对象缺少可用数据：{name}')

        if getattr(sh, 'has_chart', False) and sh.has_chart:
            chart_count += 1
            ch = sh.chart
            try:
                cats = list(ch.plots[0].categories)
                series = ch.plots[0].series
                for s in series:
                    vals = list(s.values)
                    if cats and len(vals) != len(cats):
                        add(idx, 'CHART', ERROR, f'图表分类数 {len(cats)} ≠ 数值数 {len(vals)}')
                if not cats or all(str(c).strip() == '' for c in cats):
                    add(idx, 'CHART', ERROR, '图表缺少分类标签，部分软件会显示为 1、2、3、4')
            except Exception as e:
                add(idx, 'CHART', WARN, f'图表结构读取失败：{e}')

        if not sh.has_text_frame:
            continue
        tf = sh.text_frame
        text = tf.text.strip()
        if not text:
            continue

        ml = inch(tf.margin_left) if tf.margin_left is not None else 0.1
        mr = inch(tf.margin_right) if tf.margin_right is not None else 0.1
        mt = inch(tf.margin_top) if tf.margin_top is not None else 0.05
        mb = inch(tf.margin_bottom) if tf.margin_bottom is not None else 0.05
        inner_w = max(w - ml - mr, 0.2)
        inner_h = max(h - mt - mb, 0.1)

        # 2) 溢出
        need_lines, max_size = 0, 0
        for p in tf.paragraphs:
            lines, size = para_lines(p, inner_w * 72)
            need_lines += lines
            max_size = max(max_size, size)
        lh = 1.32
        try:
            ls = tf.paragraphs[0].line_spacing
            if isinstance(ls, float) and ls > 0:
                lh = 1.32 * ls
        except Exception:
            pass
        need_in = need_lines * max_size * lh / 72
        if need_in > inner_h * 1.03:
            add(idx, 'OVERFLOW', WARN if need_in < inner_h * 1.2 else ERROR,
                f'文本可能溢出：{name or "未命名"} 需 {need_in:.2f}in / 框高 {inner_h:.2f}in「{text[:16]}」')

        aux = bool(AUX.match(name))
        est_w = min(inner_w, text_w_pt(tf.text.replace('\n', ''), max_size, False) / 72 + 0.12)
        texts.append((name, (x, y, x + max(0.3, est_w), y2), text, max_size))
        if not aux:
            sizes.append(max_size)

        # 5) 字号
        aux = bool(AUX.match(name))
        floor = MIN_AUX_FONT if aux else MIN_FONT
        for p in tf.paragraphs:
            for r in p.runs:
                if r.font.size and r.font.size.pt < floor - 0.01:
                    add(idx, 'FONT', ERROR, f'字号 {r.font.size.pt:.1f}pt 低于下限 {floor:.0f}pt：「{r.text[:14]}」')
                    break
                if (not aux) and r.font.size and r.font.size.pt < MIN_CORE_FONT and len(r.text) > 24:
                    add(idx, 'FONT', WARN, f'正文 {r.font.size.pt:.1f}pt 偏小（建议 ≥{MIN_CORE_FONT}pt）：「{r.text[:16]}」')
                    break

        # 6) 对比度（考虑文字所在的色块）
        local_bg = bg_under(slide.shapes, (x, y, x2, y2)) or bg
        for p in tf.paragraphs:
            for r in p.runs:
                c = color_of(r)
                if not c:
                    continue
                ratio = contrast(c, local_bg)
                if ratio < 2.2:
                    add(idx, 'CONTRAST', ERROR, f'文字与底色对比度 {ratio:.2f}:1（{c} on {local_bg}）「{r.text[:14]}」')
                elif ratio < 3.0 and (r.font.size and r.font.size.pt < 18):
                    add(idx, 'CONTRAST', WARN, f'对比度偏低 {ratio:.2f}:1「{r.text[:14]}」')
                break

        # 8) 导航采集
        mt = TAB_RE.match(name)
        if mt:
            nav_tabs.add((int(mt.group(1)), bool(mt.group(2))))
        if name.startswith('nav.current'):
            nav_current.append((name, text, (x, y, x2, y2)))
        elif name.startswith('nav.tick'):
            nav_ticks.append(name)
        elif name == 'nav.chapter':
            nav_ticks.append('chapter-name')

        # 9) 占位残留
        for pat in ['XXX', 'TODO', 'lorem', 'undefined', 'NaN', '待补', '占位符', '{{', '}}']:
            if pat.lower() in text.lower():
                add(idx, 'PLACEHOLDER', ERROR, f'疑似占位文字「{pat}」：{text[:24]}')
                break

    # 4) 文本块重叠
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            r = overlap_ratio(texts[i][1], texts[j][1])
            if r > 0.28:
                add(idx, 'OVERLAP', WARN,
                    f'文本块重叠 {r*100:.0f}%：「{texts[i][2][:12]}」×「{texts[j][2][:12]}」')

    # 5b) 字号层级
    if sizes:
        uniq = sorted(set(round(s, 1) for s in sizes), reverse=True)
        # 正文基准取"众数"而不是中位数：一页若有 3–4 个大数字（KPI 页、数据页），
        # 中位数会被这些数字占据，把"标题 / 正文 = 1.0"这种假警报刷出来。
        # 出现次数最多的字号才是这一页真正的正文基准；次数并列时取更小的那个。
        from collections import Counter
        cnt = Counter(round(s, 1) for s in sizes)
        body = sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        if len(uniq) > FONT_KINDS_MAX:
            add(idx, 'FONT', WARN, f'一页出现 {len(uniq)} 种字号（{uniq}），字号不够统一（建议 ≤{FONT_KINDS_MAX} 种）')
        if uniq and uniq[0] >= 20 and body < uniq[0] * 0.5:
            add(idx, 'FONT', INFO, f'标题 {uniq[0]:.0f}pt / 正文基准 {body:.0f}pt，层级对比强（正常）')
        # 15) 层级梯度：主标题必须显著大于正文，否则"没有重点"
        if len(sizes) >= 3 and uniq and uniq[0] >= 20 and body:
            ratio = uniq[0] / body
            if ratio < HIER_RATIO:
                add(idx, 'HIERARCHY', WARN,
                    f'层级差不足：最大 {uniq[0]:.0f}pt / 正文基准 {body:.0f}pt = {ratio:.2f}（建议 ≥{HIER_RATIO}）')

    # 8b) 导航状态
    if nav_current:
        name, label, box = nav_current[0]
        m = re.match(r'\s*(\d+)\s*/\s*(\d+)', label)
        if not m:
            add(idx, 'NAV', ERROR, f'导航序号格式异常：「{label}」')
        else:
            cur, total = int(m.group(1)), int(m.group(2))
            tick_cnt = len([t for t in nav_ticks if t.startswith('nav.tick')])
            if tick_cnt and tick_cnt != total:
                add(idx, 'NAV', ERROR, f'刻度数 {tick_cnt} 与章节总数 {total} 不一致')
            if not (1 <= cur <= total):
                add(idx, 'NAV', ERROR, f'当前章节 {cur} 超出 1..{total}')
        if box[0] < 6.5 or box[1] > 1.2:
            add(idx, 'NAV', ERROR, f'导航位置异常：({box[0]:.2f},{box[1]:.2f})，应在右上角')
        if len(nav_current) > 1:
            add(idx, 'NAV', ERROR, f'同一页出现 {len(nav_current)} 个当前章节标记')
    elif nav_tabs:
        # 胶囊导航：每个章节一个胶囊，当前项只有一个
        nums = {n for n, _ in nav_tabs}
        ons = {n for n, on in nav_tabs if on}
        if len(ons) != 1:
            add(idx, 'NAV', ERROR, f'胶囊导航当前项数量异常：{len(ons)} 个（应为 1）')
        if len(nums) < 2:
            add(idx, 'NAV', WARN, f'胶囊导航只检测到 {len(nums)} 个章节')
        elif max(nums) != len(nums):
            add(idx, 'NAV', WARN, f'胶囊序号不连续：{[n for n in sorted(nums)]}')
    elif layout not in ('cover', 'divider', 'fullImage'):
        add(idx, 'NAV', WARN, f'缺少进度导航（layout={layout}）')

    # 13) 页面填充率：栅格采样求并集，避免重叠元素重复累加
    if fill_rects:
        GX, GY = 96, 54
        grid = bytearray(GX * GY)
        for bx0, by0, bx1, by1 in fill_rects:
            i0 = max(0, int(bx0 / CANVAS_W * GX))
            i1 = min(GX, int(math.ceil(bx1 / CANVAS_W * GX)))
            j0 = max(0, int(by0 / CANVAS_H * GY))
            j1 = min(GY, int(math.ceil(by1 / CANVAS_H * GY)))
            for j in range(j0, j1):
                base = j * GX
                for i in range(i0, i1):
                    grid[base + i] = 1
        filled = sum(grid) / float(GX * GY)
        if filled > DENSITY_MAX:
            add(idx, 'DENSITY', WARN,
                f'页面填充率 {filled*100:.0f}%（建议 ≤{DENSITY_MAX*100:.0f}%）：元素过密，留白不足')

    # 17) 深色页质感配方：封面/章节页/小结的"高级感"来自一组固定肌理，
    #     任何一层缺失都会让深色页退回"一大块死色"——必须报警而不是悄悄退化。
    if layout in ('cover', 'divider', 'summary'):
        shape_names = [(sh.name or '') for sh in slide.shapes]
        has_diag = 'grad.diag' in shape_names
        has_grid = any(n.startswith('decor.grid.') for n in shape_names)
        has_glass = 'grad.card' in shape_names
        has_metal = any(n.startswith('grad.gold') for n in shape_names)
        has_soft = (any(n.startswith('decor.ring') for n in shape_names)
                    or any(n.startswith('decor.sheen') for n in shape_names)
                    or sum(1 for n in shape_names if n == 'grad.arc') >= 2)
        missing = []
        if not has_diag: missing.append('对角渐变底')
        if not has_grid: missing.append('网格肌理')
        if layout != 'divider' and not has_glass: missing.append('玻璃卡')
        if not has_metal: missing.append('金属饰线')
        if not has_soft: missing.append('柔光/圆环/装饰弧')
        if missing:
            add(idx, 'TEXTURE', WARN,
                f'深色页缺质感层：{"、".join(missing)}（见 layout-library.md「封面/封尾质感配方」）')

    # 14) 阴影方向 / 浓度
    if shadow_bad:
        kinds = {k for k, _, _ in shadow_bad}
        if 'dir' in kinds:
            bad = next(v for k, _, v in shadow_bad if k == 'dir')
            add(idx, 'SHADOW', WARN, f'阴影方向 {bad:.0f}°（应统一向下 90°），光源不一致会显脏')
        if 'alpha' in kinds:
            bad = next(v for k, _, v in shadow_bad if k == 'alpha')
            add(idx, 'SHADOW', WARN,
                f'阴影不透明度 {bad*100:.0f}%（建议 ≤{SHADOW_ALPHA_MAX*100:.0f}%），过重会发黑')

    # 16) 安全边距
    for nm_, side, gap in margin_bad[:3]:
        add(idx, 'MARGIN', WARN,
            f'元素贴边：{nm_} 距{side}边 {gap:.2f}in（建议 ≥{MARGIN_MIN:.2f}in，正文不要顶到页边）')

    # 当前章节序号（胶囊取 .on 的 N，进度条取 "03 / 04" 的 03），供跨页单调性检查
    nav_no = None
    if nav_tabs:
        ons_now = {n for n, on in nav_tabs if on}
        if len(ons_now) == 1:
            nav_no = next(iter(ons_now))
    elif nav_current:
        m2 = re.match(r'\s*(\d+)\s*/', nav_current[0][1])
        if m2:
            nav_no = int(m2.group(1))

    return layout, sizes, nav_no


def check_render(idx, preview_dir):
    if not preview_dir:
        return
    p = os.path.join(preview_dir, f'slide-{idx:02d}.png')
    if not os.path.exists(p):
        return
    try:
        from PIL import Image, ImageStat
        im = Image.open(p).convert('L')
        stat = ImageStat.Stat(im)
        if stat.stddev[0] < 3:
            add(idx, 'RENDER', ERROR, '渲染结果为空白页（灰度标准差过小）')
    except Exception:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pptx')
    ap.add_argument('--strict', action='store_true')
    ap.add_argument('--json', default='')
    ap.add_argument('--preview', default='')
    args = ap.parse_args()

    prs = check_file(args.pptx)
    if prs is None:
        print('\n'.join(f'[{i["level"]}] {i["kind"]}: {i["msg"]}' for i in issues))
        return 1

    layouts = []
    nav_seq = []
    for idx, slide in enumerate(prs.slides, 1):
        layout, _, nav_no = check_slide(slide, idx, prs, args.preview)
        layouts.append(layout)
        if nav_no:
            nav_seq.append((idx, nav_no))
        check_render(idx, args.preview)

    # 9b) 章节序号必须随页序单调不减（页落在错误章节会让导航"倒退"）
    for k in range(1, len(nav_seq)):
        if nav_seq[k][1] < nav_seq[k - 1][1]:
            add(nav_seq[k][0], 'NAV', WARN,
                f'章节序号倒退：第 {nav_seq[k][0]} 页标为第 {nav_seq[k][1]} 章，'
                f'上一页（第 {nav_seq[k-1][0]} 页）已是第 {nav_seq[k-1][1]} 章')

    # 10) 连续版式重复
    seq = [l for l in layouts if l]
    run = 1
    for i in range(1, len(seq)):
        if seq[i] == seq[i - 1]:
            run += 1
            if run >= 3:
                add(i + 1, 'REPEAT', WARN, f'连续 {run} 页使用同一版式「{seq[i]}」，课堂节奏会单调')
        else:
            run = 1
    if seq:
        from collections import Counter
        cnt = Counter(seq)
        top, n = cnt.most_common(1)[0]
        if n / len(seq) > 0.45 and len(seq) >= 6:
            add(0, 'REPEAT', WARN, f'版式「{top}」占 {n}/{len(seq)} 页，建议增加变化')

    errs = [i for i in issues if i['level'] == ERROR]
    warns = [i for i in issues if i['level'] == WARN]
    infos = [i for i in issues if i['level'] == INFO]

    print(f'页数：{len(prs.slides)}    版式：{len(set(seq))} 种（{"/".join(f"{k}×{v}" for k, v in __import__("collections").Counter(seq).most_common())}）')
    print(f'结论：{len(errs)} 项必须修复 / {len(warns)} 项需人工确认 / {len(infos)} 项提示\n')

    def dump(items, title):
        if not items:
            return
        print(f'— {title} —')
        cur = None
        for it in items:
            if it['page'] != cur:
                cur = it['page']
                print(f'  第 {cur} 页' if cur else '  全局')
            print(f'    [{it["kind"]}] {it["msg"]}')
        print()

    dump(errs, '必须修复')
    dump(warns, '人工确认')
    if '-v' in sys.argv:
        dump(infos, '提示')

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump({
                'file': os.path.basename(args.pptx), 'pages': len(prs.slides),
                'layouts': seq, 'issues': issues,
                'summary': {'error': len(errs), 'warn': len(warns), 'info': len(infos)},
            }, f, ensure_ascii=False, indent=2)
        print(f'JSON 报告：{args.json}')

    if not errs and not warns:
        print('全部检查通过。')
    return 1 if (args.strict and errs) else 0


if __name__ == '__main__':
    sys.exit(main())
