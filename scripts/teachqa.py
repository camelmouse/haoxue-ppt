#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Teaching QA：七维评分。不是"好不好看"，是"这堂课立不立得住"。

维度与权重（教学优先，审美其次）：
  教学逻辑 25  认知负荷 20  视觉层级 15  课堂互动 15
  案例有效性 10  视觉完成度 10  技术合规 5

< 8.0 分 = 必须重做，不给"先交付再改"的余地。
每个扣分项带等级：⚠️ 致命（不改不能讲）/ ⚡ 重要（下次一定改）/ 💡 优化。

用法：
  python scripts/teachqa.py out/deck.pptx --spec examples/x.deck.json
  python scripts/teachqa.py out/deck.pptx --spec ... --json out/tqa.json
  python scripts/teachqa.py out/deck.pptx --spec ... --min 8

有 spec 才能评"教学设计"（认知动作、意图、案例声明都在 spec 里）；
只给 pptx 时，教学逻辑/互动/案例三维会降级为"按版面推断"，并在报告里注明。
"""
import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
from collections import Counter

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

EMU = 914400.0

WEIGHTS = [
    ('teaching', '教学逻辑', 25),
    ('load', '认知负荷', 20),
    ('hierarchy', '视觉层级', 15),
    ('interaction', '课堂互动', 15),
    ('case', '案例有效性', 10),
    ('visual', '视觉完成度', 10),
    ('tech', '技术合规', 5),
]

FATAL, MAJOR, MINOR = '致命', '重要', '优化'
ICON = {FATAL: '⚠️', MAJOR: '⚡', MINOR: '💡'}


# ---------------- 读取 ----------------
def read_pptx(path):
    from pptx import Presentation
    from pptx.oxml.ns import qn
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(path)
    pages = []
    for i, slide in enumerate(prs.slides, 1):
        notes, layout = '', ''
        try:
            notes = slide.notes_slide.notes_text_frame.text or ''
            m = re.search(r'\[haoxue:layout=([A-Za-z]+)\]', notes)
            if m:
                layout = m.group(1)
        except Exception:
            pass

        chars, sizes, texts = 0, [], []
        imgs = charts = grads = shadows = 0
        for sh in slide.shapes:
            if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                imgs += 1
            if getattr(sh, 'has_chart', False) and sh.has_chart:
                charts += 1
            try:
                spPr = sh._element.find(qn('p:spPr'))
                if spPr is not None:
                    if spPr.find(qn('a:gradFill')) is not None:
                        grads += 1
                    if spPr.find('.//' + qn('a:outerShdw')) is not None:
                        shadows += 1
            except Exception:
                pass
            if sh.has_text_frame:
                t = sh.text_frame.text.strip()
                if len(t) >= 2:
                    texts.append(t)
                chars += len(t)
                for p in sh.text_frame.paragraphs:
                    for r in p.runs:
                        if r.font.size:
                            sizes.append(round(r.font.size.pt, 1))
        pages.append({
            'no': i, 'layout': layout, 'notes': notes,
            'chars': chars, 'sizes': sizes, 'texts': texts,
            'imgs': imgs, 'charts': charts, 'grads': grads, 'shadows': shadows,
        })
    return pages


def load_spec(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def run_qa(pptx, explicit=None):
    if explicit and os.path.exists(explicit):
        with open(explicit, encoding='utf-8') as f:
            return json.load(f)
    here = os.path.dirname(os.path.abspath(__file__))
    qa = os.path.join(here, 'qa.py')
    if not os.path.exists(qa):
        return None
    tmp = os.path.join(tempfile.gettempdir(), 'tqa-qa.json')
    try:
        subprocess.run([sys.executable, qa, pptx, '--json', tmp],
                       capture_output=True, timeout=240)
        if os.path.exists(tmp):
            with open(tmp, encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return None


# ---------------- 评分 ----------------
def score_teaching(pages, spec, issues):
    """教学逻辑：有没有把学生从"不知道"带到"会用、知道边界"。"""
    s = 10.0
    if not spec:
        issues.append((MAJOR, '没有 deck spec：认知动作、教学意图都无法核验，教学逻辑只能按版面推断'))
        return 5.5
    intent = (spec.get('meta') or {}).get('intent') or {}
    sp = spec.get('pages', [])

    acts = [p.get('cognitive') for p in sp if p.get('cognitive')]
    have = set(acts)
    required = ['prediction', 'conflict', 'application']
    if len(sp) >= 12:
        required.append('transfer')
    lack = [a for a in required if a not in have]
    for a in lack:
        s -= 1.8
        issues.append((FATAL if a in ('conflict', 'application') else MAJOR,
                       f'缺少「{a}」页：' +
                       {'prediction': '学生没有先判断，后面的解释就没有靶子',
                        'conflict': '没有推翻原有做法的页，学生点头回去照旧',
                        'application': '没有"换你会怎么做"，考不出会不会用',
                        'transfer': '没有边界页，学生把方法当万能钥匙'}[a]))

    # 连续三页同动作
    for k in range(2, len(acts)):
        if acts[k] == acts[k - 1] == acts[k - 2]:
            s -= 1.2
            issues.append((MAJOR, f'连续三页都是「{acts[k]}」，节奏塌了：中间该插一次动作变化'))
            break

    # 叙事闭合：开场制造好奇、结尾回到反思
    head = acts[:3]
    if 'curiosity' not in head:
        s -= 0.8
        issues.append((MINOR, '前三页没有 curiosity：开场可能直接进了定义'))
    if acts and acts[-1] not in ('reflection', 'summary'):
        s -= 1.2
        issues.append((MAJOR, '结尾没有回到开场的问题（reflection/summary 收束）'))

    if len(have) >= 6:
        s += 0.4
    for k, pen in (('goal', 0.9), ('misconception', 0.9), ('oneLine', 0.6), ('boundary', 0.6)):
        if not intent.get(k):
            s -= pen
            issues.append((MAJOR if k in ('goal', 'misconception') else MINOR,
                           f'meta.intent 缺 `{k}`：' +
                           {'goal': '目标不可检验，全册无法对齐同一件事',
                            'misconception': '不知道学生现在错在哪，冲突页写不出来',
                            'oneLine': '没有唯一记忆句，总结页会变成要点罗列',
                            'boundary': '没有边界句，结论会被当万能钥匙'}[k]))
    return max(0.0, min(10.0, s))


def score_load(pages, spec, issues):
    """认知负荷：一页一件事、字数、密度。"""
    s = 10.0
    chars = [p['chars'] for p in pages if p['layout'] not in ('cover', 'divider')]
    if not chars:
        return 5.0
    med = statistics.median(chars)
    if med > 200:
        s -= 2.4
        issues.append((FATAL, f'每页字数中位数 {med:.0f}：一页塞了两三件事，学生读不完也听不进去'))
    elif med > 150:
        s -= 1.3
        issues.append((MAJOR, f'每页字数中位数 {med:.0f}，偏密（教学页建议 ≤150）'))

    dense = [p['no'] for p in pages if p['chars'] > 260]
    if dense:
        s -= min(2.0, len(dense) * 0.5)
        issues.append((MAJOR, f'{len(dense)} 页超过 260 字：P' + '、P'.join(str(x) for x in dense[:6]) +
                       '——不是排版问题，是该拆页'))

    # 一号多事：标题里并列
    if spec:
        for i, p in enumerate(spec.get('pages', []), 1):
            t = (p.get('title') or '').replace('\n', '')
            if re.search(r'[\u4e00-\u9fa5]{2}[和与及、][\u4e00-\u9fa5]{2}', t) and not re.search(r'？|\?', t):
                s -= 0.35
                issues.append((MINOR, f'第 {i} 页标题并列了两件事，考虑拆页或只留一件'))
    # 字号种类过多
    for p in pages:
        u = set(p['sizes'])
        if len(u) > 5:
            s -= 0.4
            issues.append((MAJOR, f'第 {p["no"]} 页出现 {len(u)} 种字号（上限 5）'))
            break
    return max(0.0, min(10.0, s))


def score_hierarchy(pages, issues):
    """视觉层级：标题是否明显大于正文。"""
    s = 10.0
    bad = []
    for p in pages:
        if not p['sizes'] or p['layout'] in ('divider',):
            continue
        mx = max(p['sizes'])
        # 正文 = "比标题小的那些字号"里最常见的。直接取全场众数，
        # 在整页只有一种大字的观点页上会拿标题自己当正文，永远报层级不足。
        below = [x for x in p['sizes'] if x < mx]
        body = Counter(below).most_common(1)[0][0] if below else None
        if mx < 24:
            bad.append(p['no'])
            continue
        if body and mx / body < 1.35:
            bad.append(p['no'])
    if bad:
        s -= min(3.5, len(bad) * 0.6)
        issues.append((MAJOR, f'{len(bad)} 页标题与正文层级差不足（<1.35）：P' +
                       '、P'.join(str(x) for x in bad[:6])))
    mins = [min(p['sizes']) for p in pages if p['sizes']]
    if mins and min(mins) < 16:
        s -= 3.0
        issues.append((FATAL, f'最小字号 {min(mins)}pt < 16pt：投影/录屏看不清，违反硬下限'))
    return max(0.0, min(10.0, s))


def score_interaction(pages, spec, issues):
    """课堂互动：学生有没有"先想一下"的机会。"""
    qs = [p for p in pages if p['layout'] == 'question']
    ask = [p for p in pages if re.search(r'提问|让学生|请学生|先想|讨论|投票|举手', p['notes'])]
    n = len(pages) or 1

    if not qs:
        issues.append((FATAL, '一页互动题都没有：全程讲授，学生不会暴露误解'))
        s = 2.5
    elif len(qs) == 1:
        s = 6.5
        issues.append((MAJOR, '只有 1 页互动题：90 分钟的课至少 2 次"先判断"'))
    else:
        s = 9.0
        if len(qs) / n > 0.35:
            s -= 1.5
            issues.append((MINOR, f'{len(qs)} 页互动（占 {len(qs) / n * 100:.0f}%）：题太多会变成刷题课'))

    if len(ask) / n < 0.25:
        s -= 1.2
        issues.append((MAJOR, f'只有 {len(ask)} 页讲稿写了提问：互动不只发生在 question 页，'
                              '讲解页也要留追问'))
    if spec:
        answers = [p for p in spec.get('pages', []) if p.get('layout') == 'question']
        if answers and not any(any(o.get('ans') for o in (p.get('options') or [])) for p in answers):
            s -= 1.0
            issues.append((MAJOR, '互动题没有标正确答案：课堂上要能立刻给结论'))
    return max(0.0, min(10.0, s))


def score_case(pages, spec, issues):
    """案例有效性：有没有具体的人、具体的数、以及"这是模拟"的声明。"""
    cases = [p for p in pages if p['layout'] == 'caseStory']
    s = 8.0
    if not cases:
        issues.append((MAJOR, '没有 caseStory 页：纯理论课学生记不住场景'))
        s = 5.0
    else:
        s = 7.5
        with_num = [p for p in cases if re.search(r'\d', ''.join(p['texts']))]
        s += min(1.5, len(with_num) * 0.5)
        if len(with_num) < len(cases):
            issues.append((MINOR, '有案例页没有具体数字（金额/次数/天数）：抽象案例说服力弱'))

    # 模拟声明
    alltext = ' '.join(p['notes'] for p in pages)
    if spec:
        alltext += json.dumps(spec, ensure_ascii=False)
    if re.search(r'教学模拟|虚构|模拟案例|为教学', alltext):
        s += 0.8
    else:
        s -= 1.4
        issues.append((FATAL, '案例没有"教学模拟/虚构"声明：会被当成真实企业事件引用'))

    # 边界
    boundary = ((spec or {}).get('meta') or {}).get('intent', {}).get('boundary', '')
    if not boundary and not re.search(r'不适用|边界|例外|什么时候不', alltext):
        s -= 1.2
        issues.append((MAJOR, '没有适用边界：学生会把结论套到所有场景'))
    return max(0.0, min(10.0, s))


def score_visual(pages, issues):
    """视觉完成度：版式是否够多样、卡片是否真的"浮起来"。"""
    s = 10.0
    kinds = [p['layout'] for p in pages if p['layout']]
    if kinds:
        if len(set(kinds)) < 6:
            s -= 1.6
            issues.append((MAJOR, f'只用了 {len(set(kinds))} 种版式（建议 ≥6）：版面会读成一份文档'))
        for a, b, c in zip(kinds, kinds[1:], kinds[2:]):
            if a == b == c:
                s -= 1.2
                issues.append((MAJOR, '连续三页同一版式：节奏会塌'))
                break
    grads = sum(1 for p in pages if p['grads'])
    shad = sum(1 for p in pages if p['shadows'])
    n = len(pages) or 1
    if grads / n < 0.4:
        s -= 1.6
        issues.append((MAJOR, f'只有 {grads}/{n} 页有渐变填充：卡片会读成"贴在纸上的色块"'))
    if shad / n < 0.4:
        s -= 1.2
        issues.append((MINOR, f'只有 {shad}/{n} 页有阴影：立体感不足'))
    noimg = [p['no'] for p in pages if p['layout'] in ('fullImage', 'offsetImageText', 'zoom') and not p['imgs']]
    if noimg:
        s -= min(2.0, len(noimg) * 0.8)
        issues.append((FATAL, f'图片版式没有图：P' + '、P'.join(str(x) for x in noimg[:5]) +
                       '（占位图撑不住版面）'))
    return max(0.0, min(10.0, s))


def score_tech(qa, issues):
    """技术合规：直接吃 qa.py 的结论，不自造一套。"""
    if not qa:
        issues.append((MINOR, '未取得 qa.py 结果（技术合规按 8 分计）'))
        return 8.0
    sm = qa.get('summary', {})
    e, w = sm.get('error', 0), sm.get('warn', 0)
    s = 10.0 - e * 3.0 - w * 0.4
    for it in qa.get('issues', []):
        if it.get('level') == 'error':
            issues.append((FATAL, f'第 {it.get("page") or "-"} 页 [{it.get("kind")}] {it.get("msg")}'))
    if e:
        issues.append((FATAL, f'qa.py 报 {e} 项必须修复：技术不合格，内容再好也不能交付'))
    return max(0.0, min(10.0, s))


# ---------------- 输出 ----------------
def main():
    ap = argparse.ArgumentParser(description='Teaching QA：七维评分')
    ap.add_argument('pptx')
    ap.add_argument('--spec', default='', help='deck spec（评教学设计必需）')
    ap.add_argument('--qa', default='', help='已有的 qa.py --json 结果')
    ap.add_argument('--json', default='')
    ap.add_argument('--min', type=float, default=8.0)
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(args.pptx):
        print(f'找不到文件：{args.pptx}')
        return 2

    pages = read_pptx(args.pptx)
    spec = load_spec(args.spec)
    showcase = bool((spec or {}).get('meta', {}).get('purpose') == 'showcase')
    qa = run_qa(args.pptx, args.qa or None)

    if showcase:
        print(f'Teaching QA · {os.path.basename(args.pptx)} · {len(pages)} 页')
        print('这是版式样张（meta.purpose="showcase"）：不走教学评分，只核视觉与合规。')
        print()
        dummy = []
        v = score_visual(pages, dummy)
        t = score_tech(qa, dummy)
        print(f'  视觉完成度 {v:.1f} / 10    技术合规 {t:.1f} / 10')
        for lvl in (FATAL, MAJOR, MINOR):
            items = [m for l, m in dummy if l == lvl]
            if items:
                print(f'\n— {ICON[lvl]} {lvl} —')
                for m in items:
                    print(f'  · {m}')
        return 0 if (v >= 8 and t >= 8) else 1

    issues = []
    scores = {
        'teaching': score_teaching(pages, spec, issues),
        'load': score_load(pages, spec, issues),
        'hierarchy': score_hierarchy(pages, issues),
        'interaction': score_interaction(pages, spec, issues),
        'case': score_case(pages, spec, issues),
        'visual': score_visual(pages, issues),
        'tech': score_tech(qa, issues),
    }
    total = sum(scores[k] * w for k, _, w in WEIGHTS) / sum(w for _, _, w in WEIGHTS)

    ok = total >= args.min
    print(f'Teaching QA · {os.path.basename(args.pptx)} · {len(pages)} 页'
          + ('' if spec else '（无 spec，教学维度降级）'))
    print()
    print(f'{"维度":<10}{"得分":>6}{"权重":>6}{"加权":>7}')
    for k, name, w in WEIGHTS:
        print(f'{name:<10}{scores[k]:>6.1f}{w:>5}%{scores[k] * w / 100:>7.2f}')
    print(f'{"总分":<10}{total:>6.2f}  （及格线 {args.min:.1f}）')
    print()
    print(f'结论：{"通过" if ok else "不通过 —— 需重做，不要带病交付"}')
    print()

    for lvl in (FATAL, MAJOR, MINOR):
        items = [m for l, m in issues if l == lvl]
        if not items:
            continue
        print(f'— {ICON[lvl]} {lvl}（{len(items)}）—')
        for m in items:
            print(f'  · {m}')
        print()

    if not issues:
        print('七维全过：教学设计、认知负荷、层级、互动、案例、完成度、技术都站得住。')

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump({
                'file': os.path.basename(args.pptx), 'pages': len(pages),
                'scores': {k: round(v, 2) for k, v in scores.items()},
                'weights': {k: w for k, _, w in WEIGHTS},
                'total': round(total, 2), 'pass': ok, 'min': args.min,
                'issues': [{'level': l, 'msg': m} for l, m in issues],
            }, f, ensure_ascii=False, indent=2)
        print(f'\nJSON：{args.json}')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
