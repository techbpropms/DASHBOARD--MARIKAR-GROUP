# Dashboard — Marikar Group

Sales dashboards for Marikar Group dealerships.

## HD Attingal — sales register, Apr–Sep 2026

A static dashboard (HTML + [d3](https://d3js.org)) built from the Tally **Service Bill Register**
export of Marikar Motors Ltd, Attingal (Honda two-wheelers), for 10 Apr – 30 Sep 2026.

It shows:

- **Headline figures:** gross billing (₹1.03 Cr), net revenue after discount and without GST, service jobs, average bill per service job, discounts given, and the latest month against the month before
- **Gross billing by month** and **revenue mix by month** (spare parts, accessories, labour & service charges, AMC & warranty, branch transfers)
- **Daily billing**
- **Every income ledger**, ranked, with discounts shown as negatives
- **Totals by voucher type**, with average bill
- **Top 150 parts and accessories** by value, which you can search and sort

All totals reconcile to the register's own Grand Total (gross ₹1,02,52,514; item value ₹57,12,868).

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
| `assets/dash-shim.js` | Loads `data/*.csv` and gives the charts a small data API |
| `assets/dashboard.js` | Charts, tables and headline calculations |
| `data/*.csv` | Aggregated data the page reads |
| `scripts/build_data.py` | Rebuilds `data/` from a register export |

### Updating the data

Export the Service Bill Register from Tally (with inventory details), then:

```sh
pip install openpyxl
python3 scripts/build_data.py path/to/register.xls data
```

Tally's `.xls` export is actually an `.xlsx` file; the script handles that.

**Privacy:** only aggregated figures are committed. Raw register exports contain customer names, phone
numbers and vehicle numbers, so `*.xls` / `*.xlsx` are git-ignored. Keep them out of the repo.

### Notes on the numbers

- **April is short:** the register starts on 10 April.
- **"Net revenue"** = the income ledgers minus the two discount ledgers, without GST.
- **21 bills** have the wrong sign in the export: the discount was bigger than the bill, so the amount should be negative but shows as positive. The script counts them as negative, which is what makes the totals match the Grand Total.
- **An item's "channel"** is where it mostly sold: in a service job (service or AMC service bill), over the counter (local sales or spare sale invoices), or as a branch transfer.
