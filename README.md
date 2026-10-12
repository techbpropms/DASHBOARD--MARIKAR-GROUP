# Dashboard — Marikar Group

The consolidated sales and inventory dashboard for Marikar Group companies, built from TallyPrime
exports as set out in the BPro *Data Request & Export Playbook*. It is also the standard monthly
review template for the HOD meetings: see [TEMPLATE.md](TEMPLATE.md).

**Loaded so far:** HD Attingal (Marikar Motors Ltd, Honda two-wheelers), 10 Apr – 30 Sep 2026, the
pilot company. Other companies appear in the company list as their exports are built.

It shows:

- **Headline figures:** gross billing, net revenue after discount and without GST, service jobs, average bill per service job, discounts given, and the latest month against the month before
- **Sales lens:**
  - billing by month and by day
  - revenue mix by month
  - every income ledger, ranked
  - totals by voucher type
  - top 150 items per company
- **Year on year and inventory lens:** these fill in once the FY 2025–26 register and the stock reports arrive. Until then they list the files still missing.
- **Control lens:** the companies loaded, and which of the six requested files each company has sent
- **A company selector:** the whole page shows the group or a single company

HD Attingal's totals reconcile to its register's own Grand Total (gross ₹1,02,52,514; item value ₹57,12,868).

### Run it

The page loads its CSVs with `fetch`, so serve the folder rather than opening the file directly:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

It also works as-is on GitHub Pages (Settings → Pages → deploy from branch, root folder).

### Layout

| Path | What it is |
| --- | --- |
| `index.html` | Page shell and markup |
| `assets/theme.css` | Colour, type and spacing tokens (light and dark) |
| `assets/dashboard.css` | Dashboard layout and chart styles |
| `assets/dash-shim.js` | Loads `data/*.csv` and gives the charts a small data and filter API |
| `assets/dashboard.js` | Charts, tables, filter and headline calculations |
| `data/companies/<CODE>/` | One company's summary, written by the build script |
| `data/*.csv` | Group files the page reads: every row carries a `company` column |
| `data/received.csv` | Requested files received besides the FY 2026–27 sales register (`company,file`) |
| `scripts/build_data.py` | Builds a company from its register export and rebuilds the group files |
| `TEMPLATE.md` | The standard monthly review layout (HOD action A2) |

### Adding or updating a company

Export the Service Bill Register from TallyPrime, item-wise (playbook section 04), then:

```sh
pip install openpyxl
python3 scripts/build_data.py path/to/register.xls --company PC01 --name "Company name"
```

Use the company code agreed with Finance. HD Attingal uses `HD-ATL` until its code is agreed. When
another requested file arrives (for example a stock summary), add a line to `data/received.csv`
with the file's name exactly as the completeness table shows it. Then run
`python3 scripts/build_data.py --merge-only`.

Tally's `.xls` export is actually an `.xlsx` file; the script handles that.

**Privacy:** only aggregated figures are committed. Raw register exports contain customer names, phone
numbers and vehicle numbers, so `*.xls` / `*.xlsx` are git-ignored. Keep them out of the repo.

### Notes on the numbers

- **Short months:** HD Attingal's register starts on 10 April, so April is short.
- **"Net revenue"** = the income ledgers minus the two discount ledgers, without GST.
- **Sign fix:** in 21 HD Attingal bills the discount was bigger than the bill, so the amount should be negative, but the export shows it as positive. The script finds such bills from each bill's ledger arithmetic and counts them as negative, which is what makes the totals match the Grand Total.
- **An item's "channel"** is where it mostly sold: in a service job (service or AMC service bill), over the counter (local sales or spare sale invoices), or as a branch transfer.
