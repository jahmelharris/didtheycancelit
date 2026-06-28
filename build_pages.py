#!/usr/bin/env python3
"""
Splits data.js into paginated page files under pages/
Run this whenever data.js is updated: python3 build_pages.py
"""

import re, json, os, math

PER_PAGE = 24
DATA_FILE = 'data.js'
OUT_DIR   = 'pages'

content = open(DATA_FILE).read()

# Split into individual show blocks
raw_blocks = re.split(r'(?=  \{\n    id: )', content)
show_blocks = [b for b in raw_blocks if re.match(r'\s*\{\n\s*id: \d+,', b)]

total = len(show_blocks)
print(f"Total shows: {total}")

# Compute global stats (handle both single and double quote string formats)
stats = {'total': total, 'cancelled': 0, 'cliffhanger': 0, 'ended': 0}
for b in show_blocks:
    if "status: 'cancelled'" in b or 'status: "cancelled"' in b: stats['cancelled'] += 1
    elif "status: 'ended'" in b or 'status: "ended"' in b:       stats['ended'] += 1
    if 'cliffhanger: true,' in b:                                  stats['cliffhanger'] += 1

print(f"Stats: {stats}")

total_pages = math.ceil(total / PER_PAGE)
print(f"Generating {total_pages} pages ({PER_PAGE} shows each)...\n")

os.makedirs(OUT_DIR, exist_ok=True)

for p in range(1, total_pages + 1):
    chunk = show_blocks[(p - 1) * PER_PAGE : p * PER_PAGE]

    joined = ''.join(chunk).rstrip()
    # Remove trailing comma from last entry so the array closes cleanly
    joined = re.sub(r',(\s*)$', r'\1', joined)

    meta = json.dumps({
        'page': p,
        'totalPages': total_pages,
        'perPage': PER_PAGE,
        'stats': stats,
    })

    page_js = f"window.pageShows = [\n{joined}\n];\nwindow.pageMetadata = {meta};\n"

    path = os.path.join(OUT_DIR, f'page-{p}.js')
    with open(path, 'w') as f:
        f.write(page_js)

    start = (p - 1) * PER_PAGE + 1
    end   = min(p * PER_PAGE, total)
    print(f"  {path}  (shows {start}–{end})")

print(f"\nDone. {total_pages} page files written to {OUT_DIR}/")
