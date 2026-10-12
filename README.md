# Dashboard — Marikar Group

The Marikar Group performance hub. It has two pages:

- **Landing page** (`index.html`): the H1 FY 2026–27 review at a glance. It covers division highlights from the 9 October 2026 HOD meeting, the watch list, the FY 2025–26 baseline as at 31 March 2026, the road to 31 March 2027, and links to every review tool.
- **Sales & inventory dashboard** (`dashboard.html`): figures for each Marikar Group company, built from TallyPrime exports as set out in the BPro *Data Request & Export Playbook*. It is also the standard monthly review template for the HOD meetings: see [TEMPLATE.md](TEMPLATE.md).

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
# open http://localhost:8000 (landing page) or http://localhost:8000/dashboard.html
```

It also works as-is on GitHub Pages (Settings → Pages → deploy from branch, root folder).

### Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page (self-contained apart from the two logos) |
| `dashboard.html` | Dashboard page shell and markup |
| `assets/img/` | Marikar Group logo (from the group's Drive) and the BPro logo |
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

### Landing page figures

The landing page's highlights are typed into the page, unlike the dashboard's data-driven figures. Update them after each HOD meeting. Sources:

- **Division highlights, watch list and roadmap:** the HOD Review minutes, 9 Oct 2026 (Ref. MML/HOD/MoM/2026-10/01, v1.1).
- **FY 2025–26 baseline:** the Marikar (Motors) Ltd provisional financial statements for the year ended 31 March 2026.
  - Revenue from operations and the line-of-business split come from Notes 21 and 28.03.
  - The accounts report a single segment, so there is no split by brand.
- **CSPW projection:** "CSPW Performance Vs Projection.xlsx" (FY 2026–27 projection; FY 2025–26 target).
- **HD Attingal pilot:** this repository's data.

The tracker and reconciliation-note links point to claude.ai pages. They open only for people they have been shared with.
