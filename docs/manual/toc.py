"""Finds the page each chapter starts on (pass 1 PDF) and writes toc.json for pass 2.
Chapters are matched by the exact heading text the contents page lists (data-h attributes in manual.html)."""
import json, re, sys
from pypdf import PdfReader

html = open('manual.html', encoding='utf8').read()
heads = re.findall(r'data-h="([^"]+)"', html)
reader = PdfReader('manual.pdf')
pages = [(p.extract_text() or '') for p in reader.pages]
norm = lambda s: re.sub(r'\s+', ' ', s).strip().lower()
toc = {}
for n, h in enumerate(heads, 1):
    # chapters render as "N. Heading"; matching the number too avoids hits in body text and on the contents page
    pat = re.compile(rf'(?<![\d.]){n}\.\s*{re.escape(norm(h))}')
    for i, t in enumerate(pages):
        if i < 2:
            continue
        if pat.search(norm(t)):
            toc[h] = i + 1
            break
missing = [h for h in heads if h not in toc]
json.dump(toc, open('toc.json', 'w'), indent=1)
print(f'{len(toc)} of {len(heads)} headings located; pages: {len(pages)}' + (f'; missing: {missing}' if missing else ''))
sys.exit(1 if missing else 0)
