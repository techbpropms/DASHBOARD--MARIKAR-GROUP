# Dashboard — Marikar Group

The Marikar Group performance hub. It has five pages:

- **Landing page** (`index.html`): the H1 FY 2026–27 review at a glance. It covers division highlights from the 9 October 2026 HOD meeting, the watch list, the FY 2025–26 baseline as at 31 March 2026, the road to 31 March 2027, and links to every review tool.
- **Sales & inventory dashboard** (`dashboard.html`): figures for each Marikar Group company, built from TallyPrime exports as set out in the BPro *Data Request & Export Playbook*. It is also the standard monthly review template for the HOD meetings: see [TEMPLATE.md](TEMPLATE.md).
- **HOD action tracker** (`tracker.html`): the 31 actions from the 9 October minutes, the Action Points League and presentation-upload status. This is a read-only copy of the live tracker on claude.ai, where owners mark actions done.
- **Report builder** (`report.html`): pick companies, financial years, sections and measures (quantity, value, bills, gross, net, GST, discount), preview them, and download one PDF or Excel file. Every table has a subtotal per company and year and a grand total. With two years loaded, a year-on-year section compares them.
- **Pilot reconciliation note** (`note.html`): how the HD Attingal export reconciled to Tally, the playbook checklist, and the files still needed from Accounts. The source text is `docs/reconciliation-note.md`. The editable version lives on claude.ai.

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
# open http://localhost:8000 (landing page), /dashboard.html, /report.html, /tracker.html or /note.html
```

It also works as-is on GitHub Pages (Settings → Pages → deploy from branch, root folder).

### Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page (self-contained apart from the logo) |
| `dashboard.html` | Dashboard page shell and markup |
| `report.html`, `assets/report.js` | Report builder: Excel via SheetJS, PDF via jsPDF + AutoTable (loaded from cdnjs) |
| `note.html` | Pilot reconciliation note, rendered from `docs/reconciliation-note.md` |
| `tracker.html` | HOD action tracker: live on claude.ai, read-only here from `data/tracker/` |
| `assets/img/` | Marikar Group logo (from the group's Drive) |
| `assets/theme.css` | Colour, type and spacing tokens (light and dark) |
| `assets/dashboard.css` | Dashboard layout and chart styles |
| `assets/dash-shim.js` | Loads `data/*.csv` and gives the charts a small data and filter API |
| `assets/dashboard.js` | Charts, tables, filter and headline calculations |
| `data/companies/<CODE>/` | One company's summary, written by the build script |
| `data/*.csv` | Group files the pages read: every row carries `company` and financial year `fy` (e.g. `2026-27`) columns |
| `data/tracker/*.json` | Snapshot of the tracker's actions and upload status |
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

### Tracker snapshot

`tracker.html` is the same page as the live tracker. Outside claude.ai it has no database, so it reads `data/tracker/actions.json`, `uploads.json` and `upload_meta.json` and shows them read-only, with a link to the live tracker.

To refresh the snapshot, export the tracker's `actions`, `uploads` and `upload_meta` collections and commit the JSON. Leave out viewer IDs. Owners' names in the actions come from the minutes.

### Totals and report outputs

- **Totals in tables:**
  - The dashboard's voucher-type and top-item tables show a subtotal per company and year when more than one is in view, and always a grand total.
  - The companies table has a total.
  - The tracker's league table and upload panel show totals.
- **A year filter** on the dashboard selects one financial year or all of them.
- **Report outputs:**
  - The Excel file has a Parameters sheet, then one sheet per section with numbers formatted as numbers.
  - The PDF is A4 landscape with the parameters on page 1, one table per section, and page numbers.
- **The footer** "D&D by Dr.Babu.B. Bpro Consulting & Technologies · www.drbabu.in | www.bpropms.com" appears on every hub page, on every PDF page and on every Excel sheet. Its links are clickable.
