#!/usr/bin/env python3
"""Recursively sync a Feishu/Lark wiki tree into local markdown files.

Requires `lark-cli` to be authenticated before running. This script contains no
hardcoded tenant, token, or local production path.
"""
import argparse
import collections
import json
import pathlib
import re
import subprocess


def parse_args():
    parser = argparse.ArgumentParser(description='Sync a Feishu/Lark wiki tree to markdown')
    parser.add_argument('--root-token', required=True, help='Root wiki node/document token')
    parser.add_argument('--wiki-base-url', default='https://your-tenant.feishu.cn/wiki/', help='Base wiki URL ending with /wiki/')
    parser.add_argument('--outdir', default='local-data/wiki-sync', help='Output directory')
    parser.add_argument('--as-user', default='bot', help='lark-cli identity, usually bot or user')
    return parser.parse_args()


def run_json(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def safe_slug(text):
    text = re.sub(r'[^\w\-\u4e00-\u9fff]+', '-', str(text)).strip('-')
    return text or 'untitled'


def fetch_doc(token, as_user):
    return run_json(['lark-cli', 'docs', '+fetch', '--as', as_user, '--doc', token, '--format', 'json'])


def main():
    args = parse_args()
    outdir = pathlib.Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    base_url = args.wiki_base_url.rstrip('/') + '/'

    root_meta = run_json([
        'lark-cli', 'wiki', 'spaces', 'get_node', '--as', args.as_user,
        '--params', json.dumps({'token': args.root_token}, ensure_ascii=False), '--format', 'json'
    ])
    (outdir / 'root-meta.json').write_text(json.dumps(root_meta, ensure_ascii=False, indent=2), encoding='utf-8')
    space_id = root_meta['data']['node']['space_id']

    root_fetch = fetch_doc(args.root_token, args.as_user)
    (outdir / 'root-fetch.json').write_text(json.dumps(root_fetch, ensure_ascii=False, indent=2), encoding='utf-8')
    (outdir / '000-root.md').write_text(root_fetch.get('data', {}).get('markdown', ''), encoding='utf-8')

    queue = collections.deque([(args.root_token, 0)])
    seen = set()
    all_items = []
    seq = 1

    while queue:
        node_token, depth = queue.popleft()
        if node_token in seen:
            continue
        seen.add(node_token)
        res = run_json([
            'lark-cli', 'wiki', 'nodes', 'list', '--as', args.as_user,
            '--params', json.dumps({'space_id': space_id, 'parent_node_token': node_token}, ensure_ascii=False),
            '--format', 'json'
        ])
        items = res.get('data', {}).get('items', [])
        if depth == 0:
            (outdir / 'children.json').write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
        for item in items:
            tok = item['node_token']
            title = item.get('title') or 'untitled'
            prefix = f'd{depth + 1:02d}-{seq:03d}'
            seq += 1
            fetched = fetch_doc(tok, args.as_user)
            md_name = f'{prefix}-{safe_slug(title)}.md'
            (outdir / f'{prefix}-{safe_slug(title)}.fetch.json').write_text(json.dumps(fetched, ensure_ascii=False, indent=2), encoding='utf-8')
            (outdir / md_name).write_text(fetched.get('data', {}).get('markdown', ''), encoding='utf-8')
            all_items.append({
                'node_token': tok,
                'title': title,
                'obj_token': item.get('obj_token'),
                'obj_type': item.get('obj_type'),
                'has_child': item.get('has_child'),
                'parent_node_token': node_token,
                'depth': depth + 1,
                'markdown_file': md_name,
                'wiki_url': f'{base_url}{tok}',
            })
            if item.get('has_child'):
                queue.append((tok, depth + 1))

    (outdir / 'index-recursive.json').write_text(json.dumps(all_items, ensure_ascii=False, indent=2), encoding='utf-8')
    summary = {
        'root_url': f'{base_url}<redacted-root-token>',
        'total_recursive_docs': len(all_items),
        'with_children': sum(1 for x in all_items if x.get('has_child')),
        'max_depth': max([x.get('depth', 0) for x in all_items], default=0),
    }
    (outdir / 'recursive-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# wiki-sync', '', 'Recursive Feishu/Lark wiki export.', '', f'- Document count: {len(all_items)}', '', '## Index', '']
    for item in all_items:
        lines.append(f"- depth={item.get('depth', 0)} | {item['title']} | {item['wiki_url']} | {item['markdown_file']}")
    (outdir / 'README.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
