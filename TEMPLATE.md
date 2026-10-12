# Standard monthly review template

The layout every division uses to present at the monthly HOD review (HOD minutes, 9 Oct 2026, action A2).
It is the group dashboard in this repository, filtered to one company, so every division presents
the same figures, defined the same way, in the same order.

The AMZES dashboard (action A10, due 16 Oct) is the agreed reference. When it arrives, compare it with
this layout and fold in any view it has that this one lacks before the template is issued on 23 Oct.

## Order of the review

Each division presents these sections, top to bottom, for the month just closed and the year to date.

| # | Section | What it answers | Source |
| --- | --- | --- | --- |
| 1 | Headline figures | Gross billing, net revenue after discount (ex-GST), service jobs, average bill per service job, discounts given, and the month against the month before | Sales register |
| 2 | Billing by month | Is the trend up or down, and is any month short? | Sales register |
| 3 | Revenue mix | What share comes from spares, accessories, labour, AMC and warranty | Sales register |
| 4 | Year on year | Apr–Sep 2026 against Apr–Sep 2025 | FY 2025–26 sales register |
| 5 | Inventory | Closing stock value, movement, slow-moving items | Stock summary and stock movement |
| 6 | Revenue by ledger | Which income ledgers carry the business, and how much discount costs | Sales register |
| 7 | Top items | The parts and accessories that sell, and through which channel | Sales register (item-wise) |
| 8 | Divisional P&L | Margin, from Accounts (action A3) | Divisional P&L |
| 9 | Actions | This division's open actions, overdue first, from the HOD Action Tracker | Action tracker |
| 10 | One improvement | The system, process or technology improvement for the month (action A24) | Presenter |

Sections 4 and 5 fill in automatically once the files in the data request arrive. Until then the
dashboard lists the missing files instead of showing a blank chart.

## Rules that keep divisions comparable

- **Same definitions.** Gross includes GST. Net revenue is the income ledgers minus discount ledgers, without GST. A service job is a Service Bill or an AMC Service Bill.
- **Same period labels.** Name the month and the year to date, for example "September 2026 · YTD Apr–Sep".
- **Figures from Tally, not retyped.** Every number comes from the TallyPrime export through `scripts/build_data.py`, so it ties to the register's Grand Total.
- **No customer details.** Show aggregates only. Customer names, phone numbers and vehicle numbers stay in the exports.
- **Upload the deck.** Upload it through the presentation form before the meeting, named `Division_Month_Year`, for example `Canon_Nov2026.pptx`.

## Adding a division's data

1. Agree the company code with Finance (for example `PC03`).
2. Export the Service Bill Register as in the BPro data request, item-wise, for the period.
3. Run `python3 scripts/build_data.py <export.xls> --company PC03 --name "<company name>"`.
4. Record any other requested files that arrived in `data/received.csv`.
5. Commit the updated `data/` folder. The company then appears in the dashboard's company list.
