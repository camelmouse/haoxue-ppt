#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 skill 打成一个可直接分发的 zip（不含 node_modules / out / dist）。

用法：
    python scripts/pack.py                     # → dist/haoxue-ppt-skill.zip
    python scripts/pack.py -o dist/x.zip

只依赖标准库。包含：文档、assets、references、scripts、tests、examples、package.json。
`node_modules` 不进包——装依赖是使用者 `npm install` 的事，进包只会让压缩包变成几十 MB。
"""
import argparse
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP = 'haoxue-ppt'

INCLUDE_DIRS = ['assets', 'references', 'scripts', 'tests', 'examples']
INCLUDE_FILES = ['LICENSE', 'README.md', 'SKILL.md', 'TEST-REPORT.md', 'THIRD-PARTY.md',
                 'package.json', 'package-lock.json']
SKIP_DIRS = {'__pycache__', 'node_modules', '.git', 'out', 'dist'}
SKIP_EXT = {'.pyc', '.pyo'}


def walk():
    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            yield p
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        for cur, dirs, files in os.walk(base):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for name in sorted(files):
                if os.path.splitext(name)[1].lower() in SKIP_EXT:
                    continue
                yield os.path.join(cur, name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out', default=os.path.join(ROOT, 'dist', 'haoxue-ppt-skill.zip'))
    args = ap.parse_args()

    files = sorted(set(walk()))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with zipfile.ZipFile(args.out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            rel = os.path.relpath(p, ROOT).replace('\\', '/')
            z.write(p, f'{TOP}/{rel}')

    size = os.path.getsize(args.out)
    print(f'✓ {os.path.relpath(args.out, ROOT)}  {len(files)} 个文件  {size/1024:.0f} KB')
    missing = [f for f in ('scripts/sheet.py', 'scripts/lib/layouts/grid.js') if not os.path.exists(os.path.join(ROOT, f))]
    if missing:
        print('注意：包内缺少 ' + ', '.join(missing))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
