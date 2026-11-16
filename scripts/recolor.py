#!/usr/bin/env python3
"""recolor.py —— 把一份现成 pptx 的整体配色迁到目标 Color Family（保住版式与内容）。

为什么需要它：已交付/被用户改过的 pptx 没有 deck spec，重新生成会丢掉改动；
但"换配色"本质是把每个颜色按它在版面上的**角色**重新落到新色族的 token 上，
不需要理解版式。

角色 = 色系 × 用途 × 亮度：
  · 色系：暖调高饱和（旧稿的金/铜/红）→ accent 家族；蓝调（藏青/钢蓝）→ primary 家族；
          近乎无彩（灰/米/白）→ neutral 家族
  · 用途：从 XML 结构判定 —— 在 a:rPr/defRPr 里 = 文字；在 a:ln 里 = 线条；其余 = 填充
          同一个 HEX 当文字和当填充，落到的 token 完全不同（#FFFFFF 当文字是深底上的纸白，
          当填充就是纯白面板——后者是硬约束禁止的）
  · 亮度：同族内按亮度排，落到目标 token 的对应档位，保持原稿的层次数量

用法：
  python scripts/recolor.py <in.pptx> --theme c03 -o <out.pptx>        # 迁移配色
  python scripts/recolor.py <in.pptx> --theme c03 -o out.pptx --dry    # 只看映射表
"""
import argparse
import colorsys
import json
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from collections import Counter, defaultdict

from lxml import etree

HERE = os.path.dirname(os.path.abspath(__file__))
NS = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'p': 'http://schemas.openxmlformats.org/presentationml/2006/main'}


# ---------- 颜色工具 ----------
def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def to_hex(t):
    return ''.join(f'{max(0, min(255, round(c))):02X}' for c in t)


def mix(a, b, k):
    ra, rb = rgb(a), rgb(b)
    return to_hex(tuple(ra[i] + (rb[i] - ra[i]) * k for i in range(3)))


def hls_l(h):
    r, g, b = (x / 255 for x in rgb(h))
    _hh, ll, _ss = colorsys.rgb_to_hls(r, g, b)
    return ll


def lum(h):
    """相对亮度（WCAG）。判定"深/浅"比 HSV 的 v 更接近人眼。"""
    def f(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x) for x in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def hsv(h):
    r, g, b = (x / 255 for x in rgb(h))
    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
    return hh * 360, ss, vv


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ---------- 目标 token（单一真源在 scripts/lib/palette.js） ----------
def theme_tokens(theme_id):
    js = (
        "const T=require('./scripts/lib/theme');"
        f"const t=T.resolve('{theme_id}');"
        "console.log(JSON.stringify({name:t.name,bg:t.bg,surface:t.surface,surfaceAlt:t.surfaceAlt,"
        "veil:t.veil,veilDeep:t.veilDeep,primary:t.primary,primarySoft:t.primarySoft,deep:t.deep,"
        "deepAlt:t.deepAlt,deepInk:t.deepInk,deepMuted:t.deepMuted,accent:t.accent,"
        "accentText:t.accentText,accentSoft:t.accentSoft,accentInk:t.accentInk,ink:t.ink,"
        "inkSoft:t.inkSoft,body:t.body,muted:t.muted,line:t.line,lineSoft:t.lineSoft,tone:t.tone}));"
    )
    root = os.path.dirname(HERE)
    out = subprocess.run(['node', '-e', js], cwd=root, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr[-900:])
    return json.loads(out.stdout)


# ---------- 提取颜色 + 用途 ----------
def kind_of(el):
    p = el.getparent()
    while p is not None:
        tag = etree.QName(p).localname
        if tag in ('rPr', 'defRPr', 'endParaRPr'):
            return 'text'
        if tag == 'ln':
            return 'line'
        if tag in ('spPr', 'bgPr', 'tcPr'):
            return 'fill'
        p = p.getparent()
    return 'fill'


def collect(z):
    ctx = defaultdict(Counter)
    for n in z.namelist():
        if not n.endswith('.xml'):
            continue
        if not re.match(r'ppt/(slides/|slideMasters/|slideLayouts/|theme/|charts/|notesSlides/)', n):
            continue
        try:
            root = etree.fromstring(z.read(n))
        except etree.XMLSyntaxError:
            continue
        for el in root.iter('{%s}srgbClr' % NS['a']):
            v = (el.get('val') or '').upper()
            if re.fullmatch(r'[0-9A-F]{6}', v):
                ctx[v][kind_of(el)] += 1
    return ctx


# ---------- 角色 → token ----------
def family_of(hexstr, accent_hues, navy_hues):
    h, s, v = hsv(hexstr)
    if s < 0.14 or v < 0.04 or v > 0.99:
        return 'neutral'
    for lo, hi in accent_hues:
        if lo <= h <= hi or (lo + 360) <= h <= (hi + 360):
            return 'accent'
    for lo, hi in navy_hues:
        if lo <= h <= hi:
            return 'navy'
    return 'neutral'


def detect_hues(ctx):
    """从原稿里认出"强调色相"和"主色相"：按出现次数加权，取高饱和度的两大簇。"""
    warm, cool = Counter(), Counter()
    for c, kinds in ctx.items():
        n = sum(kinds.values())
        h, s, v = hsv(c)
        if s < 0.22 or v < 0.10 or v > 0.95:
            continue
        if 5 <= h <= 60 or h >= 330:
            warm[int(h // 10) * 10] += n
        elif 180 <= h <= 265:
            cool[int(h // 10) * 10] += n
    accent_hues = []
    if warm:
        top = warm.most_common(1)[0][0]
        accent_hues = [(max(0, top - 12), min(60, top + 12))]
    navy_hues = []
    if cool:
        top = cool.most_common(1)[0][0]
        navy_hues = [(max(180, top - 16), min(265, top + 16))]
    return accent_hues, navy_hues


def build_map(ctx, t):
    accent_hues, navy_hues = detect_hues(ctx)
    entries = []
    for c, kinds in ctx.items():
        entries.append({'hex': c, 'n': sum(kinds.values()), 'kinds': kinds,
                        'fam': family_of(c, accent_hues, navy_hues), 'L': lum(c)})

    m = {}

    # 逐色按"色系 × 用途 × 亮度"落位。
    # 为什么不用分位映射：文字色必须留在原来那头（深色文字变浅 = 纸上白字），
    # 分位映射会把"最深的那一族文字"推成浅蓝，代价是整页读不出来。
    def pick(kind, fam, L, e_hex='#000000'):
        if fam == 'accent':
            if kind == 'text':
                return t['accentText']
            if kind == 'line':
                return t['accent'] if L >= 0.25 else mix(t['accent'], t['deep'], 0.20)
            # fill
            if L >= 0.45:
                return t['accentSoft']
            if L >= 0.18:
                return t['accent']
            return mix(t['accent'], t['deep'], 0.18)
        if fam == 'navy':
            if kind == 'text':
                M = hls_l(e_hex)   # 文字档位用感知明度：深浅两用的灰不能被压到最深
                if M < 0.30:
                    return t['primary']
                if M < 0.55:
                    return t['tone']['600']
                return t['muted']
            if kind == 'line':
                if L >= 0.50:
                    return mix(t['primary'], t['bg'], 0.62)
                if L >= 0.15:
                    return t['primary']
                return t['deep']
            # fill
            if L >= 0.55:
                return mix(t['primary'], t['bg'], 0.82)
            if L >= 0.35:
                return t['tone']['400']
            if L >= 0.18:
                return t['tone']['600']
            if L >= 0.09:
                return t['primary']
            if L >= 0.04:
                return t['deepAlt']
            return t['deep']
        # neutral
        if kind == 'text':
            M = hls_l(e_hex)
            if M >= 0.72:
                return t['deepInk']
            if M >= 0.30:
                return t['muted']
            return t['ink']
        if kind == 'line':
            if L >= 0.80:
                return t['lineSoft']
            if L >= 0.55:
                return t['line']
            if L >= 0.30:
                return mix(t['bg'], t['ink'], 0.18)
            return mix(t['primary'], t['bg'], 0.35)
        # fill
        if L >= 0.92:
            return t['surface']
        if L >= 0.84:
            return t['bg']
        if L >= 0.70:
            return t['surfaceAlt']
        if L >= 0.52:
            return t['veil']
        if L >= 0.25:
            return t['inkSoft']
        if L >= 0.05:
            return t['deepAlt']
        return t['deep']

    for e in entries:
        # 用途：填充占三成以上就直接按填充走（大色块的观感由填充决定）
        total = sum(e['kinds'].values()) or 1
        if e['kinds'].get('fill', 0) >= 0.30 * total:
            kind = 'fill'
        elif e['kinds'].get('text', 0) >= 0.5 * total:
            kind = 'text'
        else:
            kind = e['kinds'].most_common(1)[0][0]
        m[e['hex']] = (pick(kind, e['fam'], e['L'], e['hex']), f'{e["fam"]}/{kind}')
    return m, entries, accent_hues, navy_hues


# ---------- 写回 ----------
def rewrite_tree(root, mapping):
    hits = 0
    for el in root.iter('{%s}srgbClr' % NS['a']):
        v = (el.get('val') or '').upper()
        hit = mapping.get(v)
        if hit and hit != v:
            el.set('val', hit)
            hits += 1
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--theme', default='c03')
    ap.add_argument('-o', '--out', required=False)
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    t = theme_tokens(args.theme)
    z = zipfile.ZipFile(args.src)
    ctx = collect(z)
    m, entries, accent_hues, navy_hues = build_map(ctx, t)

    print(f'目标：{args.theme} {t["name"]}   源色 {len(entries)} 种'
          f'   识别到强调色相 {accent_hues or "无"} / 主色相 {navy_hues or "无"}')
    for e in sorted(entries, key=lambda x: -x['n'])[:26]:
        new, role = m.get(e['hex'], (e['hex'], 'keep'))
        kinds = '/'.join(f'{k}{n}' for k, n in e['kinds'].most_common())
        print(f'  #{e["hex"]} → #{new}  {e["n"]:4d}次  L={e["L"]:.2f}  [{kinds}]  {role}')

    # 对比度体检：文字色对页面底不能塌
    page = t['bg']
    for e in entries:
        if e['kinds'].most_common(1)[0][0] == 'text':
            new = m.get(e['hex'], (e['hex'],))[0]
            c = contrast(new, page)
            if c < 2.4:
                print(f'  ! 警告 #{new} 对纸白仅 {c:.2f}:1（原 #{e["hex"]}）')

    if args.dry or not args.out:
        return

    tmp = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(args.src) as zin:
            for n in zin.namelist():
                if n.endswith('/'):
                    continue          # 目录条目：zip 里带斜杠，落盘时会变成非法路径
                data = zin.read(n)
                if n.endswith('.xml') and re.match(
                        r'ppt/(slides/|slideMasters/|slideLayouts/|theme/|charts/|notesSlides/)', n):
                    try:
                        root = etree.fromstring(data)
                        rewrite_tree(root, {k: v[0] for k, v in m.items()})
                        data = etree.tostring(root, xml_declaration=True,
                                              encoding='UTF-8', standalone=True)
                    except etree.XMLSyntaxError:
                        pass
                dst = os.path.join(tmp, n.replace('/', os.sep))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                with open(dst, 'wb') as f:
                    f.write(data)
        if os.path.exists(args.out):
            os.remove(args.out)
        with zipfile.ZipFile(args.out, 'w', zipfile.ZIP_DEFLATED) as zout:
            for root, _d, files in os.walk(tmp):
                for f in files:
                    full = os.path.join(root, f)
                    zout.write(full, os.path.relpath(full, tmp).replace(os.sep, '/'))
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'✓ {args.out}')


if __name__ == '__main__':
    main()
