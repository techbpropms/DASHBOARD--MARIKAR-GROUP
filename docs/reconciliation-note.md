# HD Attingal pilot export — reconciliation note

12 October 2026 · Dr. Babu B., BPro Consulting & Technologies

## Summary

The HD Attingal sales register for Apr–Sep 2026 works as the pilot export. It reconciles to Tally's own Grand Total to the rupee: ₹1,02,52,514 gross and ₹57,12,868 of item value.

The pilot passes 3 of the playbook's 8 checks outright, 2 in part, and 3 are pending on files not yet sent. Before rollout we need the FY 2025–26 register, the two stock summaries and the stock movement reports, plus an agreed company code for this unit.

## What was received

One file: `HD_ATL_01.04.26_to_30.09.26_sales_register_with_inventory.xls`, a Tally *Service Bill Register* for MARIKAR (MOTORS) LTD, Attingal (Honda two-wheelers). It is item-wise: one row per bill, then one row per item on it.

| Measure | Value |
| --- | --- |
| Period on the report header | 1 Apr – 30 Sep 2026 |
| First and last bill | 10 Apr – 30 Sep 2026 (147 billing days) |
| Bills | 7,677 |
| Item lines | 21,732 (1,345 distinct items) |
| Columns | 33 (date, party, voucher type and number, quantity, value, 25 ledger columns) |

| Voucher type | Bills | Number series |
| --- | --- | --- |
| Service Bill | 4,465 | KL07BB0126000001–4465 |
| Local Sales | 1,850 | HASBC26270001–1851 |
| Spare Sale Invoice | 681 | KL07BB0126C00001–681 |
| AMC Service Bill | 572 | KL07BB0126R00001–572 |
| Branch Transfer Out Spare | 106 | HABO26270001–107 |
| Extended Warranty Sales | 3 | KL07BB0126E00001–3 |

The file is really an Excel 2007+ (.xlsx) workbook with an .xls name. Excel opens it fine, but some tools reject it until it is renamed.

## Reconciliation results

Every total we rebuilt from the rows matches the register's Grand Total row.

| Check | Rebuilt from rows (₹) | Tally Grand Total (₹) | Result |
| --- | --- | --- | --- |
| Gross total, incl. GST | 1,02,52,514.46 | 1,02,52,514.46 | Match |
| Item value (sum of item lines) | 57,12,868.26 | 57,12,868.26 | Match |
| Sales – spare parts | 34,55,328.85 | 34,55,328.85 | Match |
| Sales – accessories | 19,84,079.64 | 19,84,079.64 | Match |
| CGST and SGST (each) | 7,68,334.93 | 7,68,334.93 | Match |
| Discounts (spares + labour) | 11,65,311.01 | 11,65,311.01 | Match |
| Other 19 income ledgers | each summed separately | each column | All match |

The export drops minus signs, so two things needed correcting before the totals tie:

- **21 service bills with a negative total.** On these the discount was bigger than the bill. Tally's Grand Total treats them as negative, but the rows show them as positive. Taken at face value they overstate gross by ₹14,057.44 (2 × ₹7,028.72). We detect these bills by checking each bill's ledger arithmetic and flip their sign.
- **Round-off.** Round-off amounts add up to ₹1,864.77 as shown, against a net of ₹27.11 in the Grand Total, because negative round-offs lose their sign. The effect on revenue is immaterial, but any model must not add the column at face value.

IGST is not a column here because all sales are intra-state, and the GSTIN column is filled on only 75 bills (B2B customers).

## Checklist against the playbook

Three checks pass, two pass in part and three wait on files not yet sent (playbook section 06).

| # | Check | Status | Finding |
| --- | --- | --- | --- |
| 01 | Correct company and reporting period | Partial | Company is right. The header says 1 Apr, but every number series starts at 1 on 10 Apr: Accounts to confirm no bills were raised 1–9 Apr (or say where they are). |
| 02 | Sales totals reconciled to TallyPrime | Pass | Ties to the register's Grand Total to the paisa. Still to do: tie to the sales ledgers in Tally's P&L and to GSTR-1 for the same months. |
| 03 | Returns, credit notes, discounts and taxes treated consistently | Partial | Discounts and CGST/SGST are present. No sales returns or credit notes appear, and the export drops minus signs (see above). |
| 04 | Item-wise details included | Pass | 21,732 item lines with name, part number, quantity and value. |
| 05 | Stock closing quantities and values reconciled | Pending | No stock summary was sent. |
| 06 | Company code in every export and folder | Pending | File uses "HD_ATL", not an agreed PC code. |
| 07 | No records deleted or manually changed | Pass | No duplicate numbers. Two numbers are missing: Local Sales HASBC26270623 and Branch Transfer HABO26270049. Accounts to confirm these were cancelled. |
| 08 | All periods and report types supplied | Pending | 1 of 6 files received (see the next section). |

## Files still needed from Accounts

Five of the six playbook files for this unit are outstanding. Without them there is no year-on-year comparison and no inventory view. `PCxx` stands for the company code still to be agreed.

- [x] `PCxx_SalesRegister_FY2026-27_Apr-Sep.xlsx` — received as the HD_ATL file; rename once the code is agreed
- [ ] `PCxx_SalesRegister_FY2025-26.xlsx` — 1 Apr 2025 – 31 Mar 2026, same report and layout as the pilot; this is what makes the Apr–Sep year-on-year comparison possible
- [ ] `PCxx_StockSummary_2026-03-31.xlsx` — item-wise closing quantity and value, stock group, UOM, godown
- [ ] `PCxx_StockSummary_2026-09-30.xlsx` — same layout
- [ ] `PCxx_StockMovement_FY2025-26.xlsx` — inventory vouchers: date, voucher reference, item, inward and outward quantity, rate, value, godown
- [ ] `PCxx_StockMovement_FY2026-27_Apr-Sep.xlsx` — same layout
- [ ] Monthly month-end stock snapshots, Apr 2025 – Sep 2026 (preferred, not required)

Open questions for Accounts:

1. Which company code does HD Attingal get?
2. Were any bills raised 1–9 Apr 2026, perhaps in another company or series?
3. Were HASBC26270623 and HABO26270049 cancelled?
4. Are sales returns and credit notes kept in a separate register? If so, please export it for both periods.

## Export notes for the other companies

The pilot shows what to ask for up front so later exports need no rework:

- **Keep the pilot's layout.** Use the register's item-wise view (bill row, then item rows) with every ledger as its own column. That is what lets totals tie column by column.
- **Export minus signs, or use Dr/Cr columns.** If Tally's Excel export drops signs, also send the register as XML or with separate debit and credit columns, so negative bills and round-offs keep their sign.
- **Save as real .xls or .xlsx.** Avoid exporting as .xlsx under an .xls name.
- **Separate customer from vehicle.** "Particulars" combines the customer's name with the vehicle number, and some phone numbers are in it too. The dashboard needs neither, so the files can be shared with fewer people if the party ledger is exported cleanly or masked.
- **Include the Grand Total row.** It is the reconciliation anchor for check 02.
- **One period per file, whole months.** Name it by company code and period exactly as in playbook section 05.

## Next steps

If the outstanding files arrive by 23 Oct, the pilot dashboard can show the year-on-year view at the 3 Nov HOD meeting. That is also the date for HOD action A2, the standard review template.

| Step | Owner | Due |
| --- | --- | --- |
| Agree company codes for all units | Finance Head | 16 Oct 2026 |
| Answer the four open questions | Accounts | 16 Oct 2026 |
| Send the five outstanding HD Attingal files | Accounts | 23 Oct 2026 |
| Tie the pilot to the Tally P&L sales ledgers and GSTR-1 (check 02) | Accounts, with BPro | 23 Oct 2026 |
| Add YoY and stock views to the pilot dashboard; issue it as the A2 template, alongside AMZES (A10) | BPro | 3 Nov 2026 |
| Roll the export out to the other companies | Accounts, all units | after sign-off on 3 Nov |

The pilot dashboard already shows Apr–Sep 2026 sales for HD Attingal, and the files in this note are what complete it.

*The live, editable version of this note is on claude.ai.*
