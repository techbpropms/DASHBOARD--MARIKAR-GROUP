"""Turn TallyPrime "Service Bill Register" exports into the CSVs the group dashboard reads.

Usage:
    python3 scripts/build_data.py <register.xls|.xlsx> --company HD-ATL --name "HD Attingal" [--out data]
    python3 scripts/build_data.py --merge-only [--out data]

Each run summarises one company's register into <out>/companies/<CODE>/ and then rebuilds the
group files in <out>/ (every row carries a `company` column), plus:
  companies.csv     one row per company: name, register period, bills, gross
  completeness.csv  the six files the BPro data request asks of every company, received or pending

Files received other than the FY 2026-27 sales register are recorded by hand in <out>/received.csv
(company,file) - see README.

Tally's ".xls" export is really an .xlsx file, so it is opened by content, not extension.
Only aggregates are written; customer names, phones and vehicle numbers never leave the register.
"""
import argparse
import collections
import csv
import datetime
import glob
import json
import os
import re

SERVICE = {'Service Bill', 'AMC Service Bill'}
LABOUR_COLS = [13, 14, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30]
GROUP = {9: 'Spare parts', 23: 'Accessories', 31: 'AMC & warranty', 32: 'AMC & warranty', 24: 'Branch transfers'}
GROUP.update({i: 'Labour & service charges' for i in LABOUR_COLS})
DISCOUNT_COLS = [15, 16]

# The data request playbook (sections 02-03): six files per company.
REQUIRED = [
    ('Sales register', 'FY 2026-27 Apr-Sep', 'SalesRegister_FY2026-27_Apr-Sep'),
    ('Sales register', 'FY 2025-26', 'SalesRegister_FY2025-26'),
    ('Stock summary', 'As at 31 Mar 2026', 'StockSummary_2026-03-31'),
    ('Stock summary', 'As at 30 Sep 2026', 'StockSummary_2026-09-30'),
    ('Stock movement', 'FY 2025-26', 'StockMovement_FY2025-26'),
    ('Stock movement', 'FY 2026-27 Apr-Sep', 'StockMovement_FY2026-27_Apr-Sep'),
]

FILES = {
    'monthly': ['fy', 'month', 'invoices', 'service_jobs', 'gross', 'taxable', 'gst', 'discount', 'service_gross'],
    'streams': ['fy', 'month', 'stream', 'amount'],
    'heads': ['fy', 'head', 'group', 'amount'],
    'voucher_types': ['fy', 'voucher_type', 'invoices', 'gross', 'taxable'],
    'daily': ['fy', 'date', 'invoices', 'service_jobs', 'gross'],
    'items': ['fy', 'part_no', 'item', 'qty', 'value', 'lines', 'main_channel'],
}


def num(v):
    return v if isinstance(v, (int, float)) else 0


def fy_of(d):
    """Indian financial year label for a date: 1 Apr 2026 - 31 Mar 2027 is '2026-27'."""
    y = d.year if d.month >= 4 else d.year - 1
    return f'{y}-{(y + 1) % 100:02d}'


def summarise(path):
    import openpyxl
    ws = openpyxl.load_workbook(open(path, 'rb'), read_only=True, data_only=True).worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    hdr_at = next(i for i, r in enumerate(rows) if r and r[0] == 'Date' and r[1] == 'Particulars')
    hdr = [re.sub(r'\s+', ' ', (h or '').replace('_x000D_', '')).strip() for h in rows[hdr_at]]
    body = [r for r in rows[hdr_at + 1:] if r[1] != 'Grand Total']

    mon = collections.defaultdict(lambda: collections.defaultdict(float))
    stream = collections.defaultdict(float)
    heads = collections.defaultdict(float)
    vt = collections.defaultdict(lambda: [0, 0.0, 0.0])
    day = collections.defaultdict(lambda: [0, 0, 0.0])
    items = collections.defaultdict(lambda: [0, 0.0, 0, collections.Counter()])
    cur, cur_fy = None, None
    for r in body:
        if r[0] is not None:
            d, t = r[0], r[2]
            m = d.strftime('%Y-%m')
            fy = fy_of(d)
            plus = sum(num(r[i]) for i in GROUP)
            disc = sum(num(r[i]) for i in DISCOUNT_COLS)
            gst = num(r[10]) + num(r[11])
            g, ro = num(r[8]), num(r[12])
            res = g - (plus - disc + gst)
            # The export drops minus signs: a bill whose discount exceeds it shows a positive total.
            if not (abs(res - ro) < 0.02 or abs(res + ro) < 0.02):
                g = -g
            taxable = plus - disc
            M = mon[m]
            M['invoices'] += 1; M['gross'] += g; M['taxable'] += taxable; M['gst'] += gst; M['discount'] += disc
            if t in SERVICE:
                M['service_jobs'] += 1; M['service_gross'] += g
            for i, grp in GROUP.items():
                if num(r[i]):
                    stream[(m, grp)] += num(r[i]); heads[(fy, hdr[i], grp)] += num(r[i])
            stream[(m, 'Discounts')] -= disc
            for i in DISCOUNT_COLS:
                if num(r[i]):
                    heads[(fy, hdr[i], 'Discounts')] -= num(r[i])
            V = vt[(fy, t)]; V[0] += 1; V[1] += g; V[2] += taxable
            D = day[d.strftime('%Y-%m-%d')]; D[0] += 1; D[1] += t in SERVICE; D[2] += g
            cur, cur_fy = t, fy
        elif r[1]:
            mm = re.match(r'^(.*)\[([^\]]+)\]\s*$', r[1])
            name, pn = (mm.group(1).strip(), mm.group(2).strip()) if mm else (r[1].strip(), '')
            I = items[(cur_fy, pn, name)]
            I[0] += num(r[6]); I[1] += num(r[7]); I[2] += 1; I[3][cur] += 1

    def chan(c):
        n = sum(c.values())
        if c['Service Bill'] + c['AMC Service Bill'] >= n / 2:
            return 'Service'
        if c['Branch Transfer Out Spare'] >= n / 2:
            return 'Branch transfer'
        return 'Counter sale'

    months = sorted(mon)
    fym = lambda m: fy_of(datetime.date(int(m[:4]), int(m[5:7]), 1))
    top = []
    for fy in sorted({k[0] for k in items}):  # each year's top 150 items by value
        top += sorted([kv for kv in items.items() if kv[0][0] == fy], key=lambda kv: -kv[1][1])[:150]
    out = {
        'monthly': [[fym(m), m, int(mon[m]['invoices']), int(mon[m]['service_jobs'])] +
                    [round(mon[m][k], 2) for k in ['gross', 'taxable', 'gst', 'discount', 'service_gross']] for m in months],
        'streams': [[fym(m), m, s, round(v, 2)] for (m, s), v in sorted(stream.items())],
        'heads': sorted([[fy, h, g, round(v, 2)] for (fy, h, g), v in heads.items()], key=lambda x: (x[0], -x[3])),
        'voucher_types': sorted([[fy, k, v[0], round(v[1], 2), round(v[2], 2)] for (fy, k), v in vt.items()], key=lambda x: (x[0], -x[3])),
        'daily': [[fym(k[:7]), k, v[0], v[1], round(v[2], 2)] for k, v in sorted(day.items())],
        'items': [[fy, pn or nm, nm, q, round(v, 2), l, chan(c)] for (fy, pn, nm), (q, v, l, c) in top],
    }
    dates = sorted(day)
    info = {'register_from': dates[0], 'register_to': dates[-1],
            'fys': sorted({r[0] for r in out['monthly']}),
            'bills': sum(v[0] for v in vt.values()), 'gross': round(sum(v[1] for v in vt.values()), 2),
            'item_value': round(sum(v[1] for v in items.values()), 2), 'distinct_items': len(items)}
    return out, info


def write_csv(path, cols, rows):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(rows)


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


def merge(out):
    companies = []
    for meta_path in sorted(glob.glob(os.path.join(out, 'companies', '*', 'company.json'))):
        with open(meta_path) as f:
            companies.append(json.load(f))
    for fid, cols in FILES.items():
        rows = []
        for c in companies:
            for r in read_csv(os.path.join(out, 'companies', c['code'], fid + '.csv')):
                rows.append([c['code']] + [r[k] for k in cols])
        write_csv(os.path.join(out, fid + '.csv'), ['company'] + cols, rows)
    write_csv(os.path.join(out, 'companies.csv'),
              ['company', 'name', 'register_from', 'register_to', 'bills', 'gross', 'fys'],
              [[c['code'], c['name'], c['register_from'], c['register_to'], c['bills'], c['gross'], ' '.join(c.get('fys', []))] for c in companies])
    received = {(r['company'], r['file']) for r in read_csv(os.path.join(out, 'received.csv'))}
    comp = []
    for c in companies:
        for report, period, stem in REQUIRED:
            key = f'{report} {period}'
            got = key == 'Sales register FY 2026-27 Apr-Sep' or (c['code'], key) in received
            comp.append([c['code'], key, report, period, f"{c['code']}_{stem}.xlsx", 'Received' if got else 'Pending'])
    write_csv(os.path.join(out, 'completeness.csv'), ['company', 'file', 'report', 'period', 'filename', 'status'], comp)
    return companies


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('register', nargs='?', help='Tally Service Bill Register export (.xls/.xlsx)')
    ap.add_argument('--company', help='agreed company code, e.g. PC01 (letters, digits, - and _)')
    ap.add_argument('--name', help='company name as shown on the dashboard')
    ap.add_argument('--out', default='data')
    ap.add_argument('--merge-only', action='store_true', help='only rebuild the group files')
    a = ap.parse_args()
    if not a.merge_only:
        if not (a.register and a.company and a.name):
            ap.error('register, --company and --name are required unless --merge-only')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,32}', a.company):
            ap.error('--company may only use letters, digits, - and _')
        data, info = summarise(a.register)
        d = os.path.join(a.out, 'companies', a.company)
        os.makedirs(d, exist_ok=True)
        for fid, cols in FILES.items():
            write_csv(os.path.join(d, fid + '.csv'), cols, data[fid])
        with open(os.path.join(d, 'company.json'), 'w') as f:
            json.dump({'code': a.company, 'name': a.name, **info}, f, indent=2)
        print(f"{a.company}: {info['bills']:,} bills, gross {info['gross']:,.2f}, "
              f"item value {info['item_value']:,.2f}, {info['register_from']} to {info['register_to']} (FY {', '.join(info['fys'])})")
    companies = merge(a.out)
    print(f"group files rebuilt in {a.out}/ for {len(companies)} compan{'y' if len(companies) == 1 else 'ies'}")


if __name__ == '__main__':
    main()
