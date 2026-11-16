#!/usr/bin/env python3
"""把单页 pptx 替换回整套课件的指定页（页眉页脚、页码、顺序保持不变）。

why：改一页不应该重生成整套。`build.js --only 8` 只产出第 8 页，
本脚本在 OOXML 包级别把这一页换回主文件，其余页原样不动。

用法：
    python scripts/splice.py deck.pptx page8.pptx 8 -o deck-fixed.pptx

实现要点：
- 递归克隆 slide part 及其关系（图片 / 图表 / notesSlide），保持 rId 不变，
  这样 slide XML 里 r:embed="rId2" 之类引用不需要改写。
- 替换 sldIdLst 里的 r:id，旧 slide 的关系被 drop，保存时不会写出（成为孤儿）。
"""
import argparse
import copy
import os
import re
import sys

from pptx import Presentation
from pptx.opc.package import _Relationship
from pptx.opc.packuri import PackURI
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn


def _name_template(partname):
    """'/ppt/slides/slide1.xml' → '/ppt/slides/slide%d.xml'（next_partname 需要模板）。

    扩展名必须沿用原 part，否则图片会被写成 .xml 导致内容类型错乱。
    """
    d, base = str(partname).rsplit('/', 1)
    ext = base.rsplit('.', 1)[-1] if '.' in base else 'xml'
    m = re.match(r'^(\D+)\d+\.\w+$', base)
    if m:
        return f'{d}/{m.group(1)}%d.{ext}'
    return f'{d}/part%d.{ext}'


def _unique_name(partname, used):
    """按模板分配一个未被占用的 partname。

    不能依赖 package.next_partname：克隆中的 part 还没进包索引，
    连续调用会反复返回同名，最终写出重复条目损坏文件。
    """
    tmpl = _name_template(partname)
    n = 1
    while True:
        cand = tmpl % n
        if cand not in used:
            used.add(cand)
            return PackURI(cand)
        n += 1


def _clone_part(part, package, cache, used):
    """把一个 part 及其所有内部关系复制进目标包，rId 保持不变。"""
    key = str(part.partname)
    if key in cache:
        return cache[key]
    new_name = _unique_name(part.partname, used)
    new = part.__class__.load(new_name, part.content_type, package, part.blob)
    cache[key] = new
    for rId, rel in part.rels.items():
        if rel.is_external:
            target = rel.target_ref          # 字符串，外部链接
        else:
            target = _clone_part(rel.target_part, package, cache, used)  # 内部关系必须传 Part 对象
        new.rels._rels[rId] = _Relationship(
            str(new.partname.baseURI), rId, rel.reltype, rel._target_mode, target
        )
    return new


def splice(deck_path, page_path, page_no, out_path):
    deck = Presentation(deck_path)
    single = Presentation(page_path)
    if len(single.slides) != 1:
        raise SystemExit(f'✗ {page_path} 含 {len(single.slides)} 页，单页文件应为 1 页')

    sld_ids = list(deck.slides._sldIdLst)
    if not 1 <= page_no <= len(sld_ids):
        raise SystemExit(f'✗ 页码 {page_no} 超出范围 1..{len(sld_ids)}')

    old_el = sld_ids[page_no - 1]
    old_rid = old_el.rId

    used = {str(p.partname) for p in deck.part.package.iter_parts()}
    new_part = _clone_part(single.slides[0].part, deck.part.package, {}, used)
    new_rid = deck.part.relate_to(new_part, RT.SLIDE)

    new_el = copy.deepcopy(old_el)
    new_el.set(qn('r:id'), new_rid)
    deck.slides._sldIdLst.insert(list(deck.slides._sldIdLst).index(old_el), new_el)
    deck.slides._sldIdLst.remove(old_el)
    deck.part.drop_rel(old_rid)

    deck.save(out_path)
    return len(deck.slides)


def main():
    ap = argparse.ArgumentParser(description='把单页 pptx 换回整套课件的第 N 页')
    ap.add_argument('deck', help='整套课件 .pptx')
    ap.add_argument('page', help='单页 .pptx（build.js --only N 的产物）')
    ap.add_argument('index', type=int, help='要替换的页码，从 1 开始')
    ap.add_argument('-o', '--out', default='', help='输出路径，默认 xxx-spliced.pptx')
    a = ap.parse_args()

    out = a.out or os.path.splitext(a.deck)[0] + '-spliced.pptx'
    n = splice(a.deck, a.page, a.index, out)
    print(f'✓ 第 {a.index} 页已替换，共 {n} 页 → {out}')
    print('  下一步：python scripts/qa.py ' + out)


if __name__ == '__main__':
    sys.exit(main())
