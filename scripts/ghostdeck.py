#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Ghost Deck Test：把正文、图片、装饰全部删掉，只留标题，连读一遍。

通过标准不是"每页标题好不好看"，而是：
  **只读这串标题，能不能把整堂课的逻辑讲下来。**

如果读出来是「管理概念 / 管理职能 / PDCA / 案例分析 / 小结」——
那只是目录，不是教学叙事。

用法：
  python scripts/ghostdeck.py examples/management-authority-v2.deck.json
  python scripts/ghostdeck.py out/deck.pptx          # 从成品反推（几何法找大字号标题）
  python scripts/ghostdeck.py <spec> --json out/gd.json --quiet

返回码：0 = 通过（≥75 分）；1 = 未通过；2 = 输入有误。
"""
import argparse
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

# ---------- 目录式标题（不是判断，只是给内容起个名字）----------
# 这些词单独成题时，读者拿不到任何信息：不知道结论、不知道立场、不知道和上一页什么关系。
CATALOG_PAT = re.compile(
    r'^(第?[一二三四五六七八九十\d]+[、.．]?\s*)?'
    r'([\u4e00-\u9fa5]{0,4})'
    r'(概述|简介|导论|概念|定义|分类|类型|种类|特点|特征|作用|意义|原则|方法|步骤|流程|'
    r'要素|构成|影响|因素|优缺点|利弊|案例分析|案例|课堂练习|练习|思考|讨论|小结|总结|'
    r'导入|目录|复习|作业|拓展)$'
)
# 明确不算"论证句"的页：封面、分隔页的标题本来就不是判断
SKIP_LAYOUTS = {'cover', 'divider', 'fullImage'}

# ---------- 判断句特征 ----------
# 命中任意一类就算"这标题在说事，不只是给名字"。
# 最后一类"断言"是兜底：中文里大量判断句靠"是/意味着/可以"承载，
# 不列进来会把本来合格的标题误判成目录（"授权交出去的，是四样东西"）。
SIGNALS = [
    ('对比转折', r'不是|而是|却|反而|其实|并不|不再|未必|不一定|才不|与其'),
    ('因果', r'因为|所以|才会|才能|导致|造成|于是|结果|才让|使|让[\u4e00-\u9fa5]{2,}'),
    ('否定纠错', r'不能|不会|不该|不必|不需要|没有|错|误解|假象|陷阱|坑'),
    ('数字', r'\d'),
    ('提问', r'[？?]$'),
    # 中文里"前半句立象、后半句下判断"的对仗句本身就是论证（"分权定格局，授权定动作"）。
    # 不认这一条，会把最好的那批标题误判成没信息。
    ('对仗', r'^[^，。；]{3,}，[^，。；]{3,}$'),
    ('断言', r'是|意味着|等于|可以|能|会|取决于|沿着|检验|回答|看|算|属于|叫|得'),
]


def strip_punct(s):
    return re.sub(r'[\s，。、；：！？“”"\'‘’（）()《》\-—…·:;!?]', '', s or '')


def info_signals(title):
    """返回 (strong, weak)：strong 是"真的有判断"的证据，weak 只是"像个句子"。"""
    t = title or ''
    strong, weak = [], []
    for name, pat in SIGNALS:
        if re.search(pat, t):
            (weak if name == '断言' else strong).append(name)
    return strong, weak


def has_judgement(title):
    """有强信号，或弱信号 + 够长（短标题光靠一个"是"撑不起判断）。"""
    strong, weak = info_signals(title)
    return bool(strong) or (bool(weak) and len(strip_punct(title)) >= 10)


def is_catalog(title):
    t = strip_punct(title)
    if not t:
        return False
    if CATALOG_PAT.match(t):
        return True
    # 短标题且完全没有判断痕迹（连"是/能/会"都没有）
    if len(t) <= 6 and not re.search(r'\d', t) and not re.search(r'[？?]', title or ''):
        if not has_judgement(title):
            return True
    return False


def parallel_nouns(title):
    """标题里用「和/与/及/、」并列了两件事——一页一件事，通常该拆。"""
    t = title or ''
    if re.search(r'为什么|怎么|如何|吗|？', t):
        return False
    return bool(re.search(r'[\u4e00-\u9fa5]{2}[和与及、][\u4e00-\u9fa5]{2}', t))


def similarity(a, b):
    a, b = strip_punct(a), strip_punct(b)
    if not a or not b:
        return 0.0
    return 1.0 if a == b else __import__('difflib').SequenceMatcher(None, a, b).ratio()


def longest_line(title):
    """多行标题按最长一行计长：换行是设计，不是超标。"""
    parts = [strip_punct(x) for x in (title or '').split('\n')]
    return max([len(p) for p in parts] + [0])


def load_pages(path):
    """返回 [{no, layout, title, cognitive, chapter}]"""
    if path.lower().endswith('.json'):
        with open(path, encoding='utf-8') as f:
            spec = json.load(f)
        pages = []
        for i, p in enumerate(spec.get('pages', []), 1):
            pages.append({
                'no': i,
                'layout': p.get('layout', ''),
                'title': (p.get('title') or p.get('text') or '').strip(),
                'cognitive': p.get('cognitive'),
                'chapter': p.get('chapter'),
            })
        return pages, spec.get('meta', {})

    # pptx：先读备注里的 [haoxue:layout=...] 标记（最可靠），
    # 再按几何找标题——顶部、够宽、字号最大。只靠字号会抓到 KPI 大数字。
    from pptx import Presentation
    prs = Presentation(path)
    pages = []
    for i, slide in enumerate(prs.slides, 1):
        layout, chapter, best, best_pt = '', None, '', 0
        try:
            notes = slide.notes_slide.notes_text_frame.text or ''
            m = re.search(r'\[haoxue:layout=([a-z]+)\]', notes)
            if m:
                layout = m.group(1)
            mc = re.search(r'\[chapter=([^\]]+)\]', notes)
            if mc and mc.group(1) != '-':
                chapter = mc.group(1)
        except Exception:
            pass
        for sh in slide.shapes:
            if not sh.has_text_frame:
                continue
            txt = sh.text_frame.text.strip()
            if not txt:
                continue
            sizes = [r.font.size.pt for p in sh.text_frame.paragraphs
                     for r in p.runs if r.font.size]
            if not sizes:
                continue
            mx = max(sizes)
            top = (sh.top or 0) / 914400
            w = (sh.width or 0) / 914400
            # 标题块：在上半页、够宽（排除右侧 KPI 大数字）、字号 ≥18
            if top > 2.9 or w < 4.0 or mx < 18:
                continue
            if mx > best_pt or (mx == best_pt and len(txt) > len(best)):
                best, best_pt = txt, mx
        pages.append({'no': i, 'layout': layout, 'title': best,
                      'cognitive': None, 'chapter': chapter})
    return pages, {}


def analyze(pages, meta):
    issues = []
    scored = [p for p in pages if p['layout'] not in SKIP_LAYOUTS and p['title']]
    if not scored:
        return {'score': 0, 'fatal': ['没有可评的标题'], 'warn': [], 'info': []}

    catalog = []
    lowinfo = []
    toolong = []
    dup = []
    parallel = []

    for p in scored:
        t = p['title']
        if is_catalog(t):
            catalog.append(p)
        elif not has_judgement(t):
            lowinfo.append(p)
        if longest_line(t) > 28:
            toolong.append(p)
        if parallel_nouns(t):
            parallel.append(p)

    for a, b in zip(scored, scored[1:]):
        if similarity(a['title'], b['title']) >= 0.62:
            dup.append((a, b))

    # ---- 扣分 ----
    n = len(scored)
    score = 100.0
    score -= (len(catalog) / n) * 55          # 目录式标题是致命项
    score -= (len(lowinfo) / n) * 30
    score -= (len(toolong) / n) * 12
    score -= len(dup) * 6
    score -= (len(parallel) / n) * 10

    # ---- 叙事推进（有 cognitive 才评）----
    acts = [p['cognitive'] for p in pages if p.get('cognitive')]
    narrative_notes = []
    if acts:
        if 'conflict' in acts and 'prediction' in acts:
            if acts.index('conflict') < acts.index('prediction'):
                narrative_notes.append('冲突页出现在预测页之前：学生还没下判断，就被纠正了')
                score -= 4
        if acts and acts[-1] in ('reflection', 'summary'):
            narrative_notes.append('结尾落在反思/收束，叙事闭合')
        else:
            narrative_notes.append('最后几页没有回到开场的问题，叙事没有闭合')
            score -= 5
        if 'curiosity' not in acts[:3]:
            narrative_notes.append('前三页没有制造好奇：开场可能在讲定义')
            score -= 4

    score = max(0, min(100, round(score)))

    fatal, warn, info = [], [], []
    if len(catalog) / n > 0.18:
        fatal.append(f'{len(catalog)} 页标题是目录式（"{catalog[0]["title"]}" 这类），只给名字不给结论')
    elif catalog:
        warn.append(f'{len(catalog)} 页标题偏目录式：' + '、'.join(f'P{p["no"]}' for p in catalog[:5]))
    if len(lowinfo) >= max(2, n * 0.25):
        fatal.append(f'{len(lowinfo)} 页标题没有判断力（无对比/因果/否定/数字/提问），连读不给信息')
    elif lowinfo:
        warn.append('标题缺判断：' + '、'.join(f'P{p["no"]}' for p in lowinfo[:5]))
    if dup:
        fatal.append('相邻页在说同一件事：' + '、'.join(f'P{a["no"]}↔P{b["no"]}' for a, b in dup[:3]))
    if toolong:
        warn.append('标题过长（>28 字，会折三行）：' + '、'.join(f'P{p["no"]}' for p in toolong[:4]))
    if parallel:
        info.append('标题并列了两件事（考虑拆页）：' + '、'.join(f'P{p["no"]}' for p in parallel[:4]))
    info.extend(narrative_notes)

    return {
        'score': score, 'fatal': fatal, 'warn': warn, 'info': info,
        'stats': {
            'scored': n, 'catalog': len(catalog), 'lowinfo': len(lowinfo),
            'toolong': len(toolong), 'dup': len(dup), 'parallel': len(parallel),
        },
    }


HINTS = {
    'catalog': '改成一句判断：写清「不是 A，而是 B」或「因为 X，所以 Y」',
    'lowinfo': '加一个具体的对比对象、数字或反问，让标题本身带结论',
    'dup': '后一页换一个动作：前一页解释完，后一页该给证据或让学生用一次',
    'toolong': '压到 20 字内，把定语挪到副标题或讲稿',
    'parallel': '并列的两件事拆成两页，或只留一件、另一件进讲稿',
}


def main():
    ap = argparse.ArgumentParser(description='Ghost Deck Test：只读标题，检验叙事')
    ap.add_argument('src', help='deck spec（.json）或成品（.pptx）')
    ap.add_argument('--json', default='', help='输出 JSON 报告')
    ap.add_argument('--quiet', action='store_true', help='不逐条列标题')
    ap.add_argument('--min', type=float, default=75, help='及格线（默认 75）')
    args = ap.parse_args()

    if not os.path.exists(args.src):
        print(f'找不到文件：{args.src}')
        return 2
    pages, meta = load_pages(args.src)
    if not pages:
        print('没有可读页面')
        return 2
    rep = analyze(pages, meta)

    print(f'Ghost Deck Test · {len(pages)} 页 · {os.path.basename(args.src)}')
    if meta.get('title'):
        print(f'课题：{meta["title"]}')
    print()

    if not args.quiet:
        print('— 连读标题 —')
        for p in pages:
            mark = '  ' if p['layout'] not in SKIP_LAYOUTS else '· '
            print(f'{mark}{p["no"]:02d}  {(p["title"] or "（无标题）").replace(chr(10), " / ")}')
        print()

    ok = rep['score'] >= args.min
    print(f'结论：{"通过" if ok else "未通过"}（{rep["score"]}/100，及格线 {args.min:.0f}）')
    st = rep['stats']
    print(f'  可评标题 {st["scored"]} 页｜目录式 {st["catalog"]}｜无判断 {st["lowinfo"]}｜'
          f'相邻重复 {st["dup"]}｜超长 {st["toolong"]}')
    print()

    def dump(items, label, hint_key):
        if not items:
            return
        print(f'— {label} —')
        for x in items:
            print(f'  · {x}')
        if hint_key:
            print(f'  改法：{HINTS[hint_key]}')
        print()

    dump(rep['fatal'], '不通过的原因', 'catalog')
    dump(rep['warn'], '需要改', 'lowinfo')
    dump(rep['info'], '参考', '')

    if ok and not rep['fatal']:
        print('只读标题就能讲下来：这套标题构成论证，不是目录。')

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump({'file': os.path.basename(args.src), 'pages': pages, **rep}, f,
                      ensure_ascii=False, indent=2)
        print(f'\nJSON 报告：{args.json}')

    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
