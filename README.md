# Dashboard — Marikar Group

The Marikar Group performance hub. It opens on a sign-in page (`index.html`); after sign-in, the hub (`hub.html`) and its pages open. It installs on a phone as an app:

- **Hub landing page** (`hub.html`): the H1 FY 2026–27 review at a glance. It covers division highlights from the 9 October 2026 HOD meeting, the watch list, the FY 2025–26 baseline as at 31 March 2026, the road to 31 March 2027, and links to every review tool.
- **Division dashboards** (`divisions.html`): one view per division (group vehicle sales, CSPW, Honda Kerala, AMZES, Nissan, Royal Enfield, BigWing, Canon / OAIP, HR) with H1 FY 2026–27 against H1 FY 2025–26, the full year to 31 March 2026 and the FY 2026–27 target: KPI tiles, monthly charts, breakdown tables with totals, highlights, watch points, next actions, and the files each figure came from. Data: `data/divisions.json`, transcribed from the decks and reports uploaded for the 9 October 2026 HOD meeting.
- **Sales & inventory dashboard** (`dashboard.html`): figures for each Marikar Group company, built from TallyPrime exports as set out in the BPro *Data Request & Export Playbook*. It is also the standard monthly review template for the HOD meetings: see [TEMPLATE.md](TEMPLATE.md).
- **HOD action tracker** (`tracker.html`): the 31 actions from the 9 October minutes, the Action Points League and presentation-upload status. This is a read-only copy of the live tracker on claude.ai, where owners mark actions done.
- **Report builder** (`report.html`): pick companies, financial years, sections and measures (quantity, value, bills, gross, net, GST, discount), preview them, and download one PDF or Excel file. Every table has a subtotal per company and year and a grand total. With two years loaded, a year-on-year section compares them. Every download carries the Marikar and BPro logos, a document ID and a verification QR code.
- **Pilot reconciliation note** (`note.html`): how the HD Attingal export reconciled to Tally, the playbook checklist, and the files still needed from Accounts. The source text is `docs/reconciliation-note.md`. The editable version lives on claude.ai. A print-ready PDF on BPro letterhead, with a verification QR code, is in `docs/HD_Attingal_Reconciliation_Note_BPro.pdf` (document RN-HDATL-2026-01).
- **Document verification** (`verify.html`): enter a document ID or scan a document's QR code to confirm it was issued from the hub, and check a digital copy's SHA-256 fingerprint against the register.

**Loaded so far:** the five Honda two-wheeler service units of Marikar Motors Ltd: HD Attingal (`HD-ATL`),
HD Kulasekharam (`HD-KSR`), HD Marthandam (`HD-MDM`), HD Nedumangad (`HD-NDD`) and HD Varkala (`HD-VKL`).
Each has its FY 2026–27 register (April to September) and stock summaries at 31 March and 30 September 2026.
HD Kulasekharam, HD Nedumangad and HD Varkala also have their FY 2025–26 registers, so the year-on-year
lens covers those three; Attingal and Marthandam join it when their FY 2025–26 registers arrive.
Other companies appear in the company list as their
exports are built. The page opens on the latest year; pick "All years" to add the years together.

It shows:

- **Headline figures:** gross billing, net revenue after discount and without GST, service jobs, average bill per service job, discounts given, and the latest month against the month before
- **Sales lens:**
  - billing by month and by day
  - revenue mix by month
  - every income ledger, ranked
  - totals by voucher type
  - top 150 items per company
- **Year on year:** April–September 2026 against the same months of 2025, by month and by company, for each company whose FY 2025–26 register is in. It names the companies still waiting.
- **Inventory lens:** closing stock at cost on 31 March and 30 September, by company (or by stock group for one company), and how much of the September stock had no sale since April
- **Stock held but not sold:** the 40 costliest of those idle lines. Branch and warranty transfers do not count as sales. Item age needs the stock movement reports, which have not arrived yet.
- **Control lens:** the companies loaded, and which of the six requested files each company has sent
- **A company selector:** the whole page shows the group or a single company

Every register reconciles to its own Grand Total, and every stock summary to its own; the build stops if one does not.

### Run it

The page loads its CSVs with `fetch`, so serve the folder rather than opening the file directly:

```sh
python3 -m http.server 8000
# open http://localhost:8000 (landing page), /dashboard.html, /report.html, /tracker.html, /note.html or /verify.html
```

It also works as-is on GitHub Pages (Settings → Pages → deploy from branch, root folder).

### Layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/auth.js`, `scripts/add-user.js` | Landing and sign-in page, session check, and the tool that adds accounts |
| `hub.html` | Hub landing page (self-contained apart from the logo) |
| `dashboard.html` | Dashboard page shell and markup |
| `report.html`, `assets/report.js` | Report builder: Excel via ExcelJS (jsDelivr), PDF via jsPDF + AutoTable (cdnjs); also checks report QR codes |
| `divisions.html`, `assets/divisions.js`, `assets/divisions.css` | Division dashboards, drawn from `data/divisions.json` |
| `manifest.webmanifest`, `sw.js`, `assets/pwa.js`, `version.json` | Installable app and its update message |
| `verify.html` | Document verification for fixed documents, against `data/verify/registry.json` |
| `assets/brand.css` | The BPro credit block in every page's footer |
| `assets/vendor/qrcode.js` | QR code generator (qrcode-generator 1.4.4, MIT) |
| `note.html` | Pilot reconciliation note, rendered from `docs/reconciliation-note.md` |
| `docs/HD_Attingal_Reconciliation_Note_BPro.pdf` | The reconciliation note as a 5-page A4 PDF on BPro letterhead, for Finance |
| `tracker.html` | HOD action tracker: live on claude.ai, read-only here from `data/tracker/` |
| `assets/img/` | Marikar Group logo (from the group's Drive) and BPro logo (`bpro.png` for pages, `bpro.jpg` for downloads) |
| `assets/theme.css` | Colour, type and spacing tokens (light and dark) |
| `assets/dashboard.css` | Dashboard layout and chart styles |
| `assets/dash-shim.js` | Loads `data/*.csv` and gives the charts a small data and filter API |
| `assets/dashboard.js` | Charts, tables, filter and headline calculations |
| `data/companies/<CODE>/` | One company's summary, written by the build script |
| `data/*.csv` | Group files the pages read: every row carries `company` and financial year `fy` (e.g. `2026-27`) columns |
| `data/tracker/*.json` | Snapshot of the tracker's actions and upload status |
| `data/verify/registry.json` | Register of issued fixed documents: ID, title, issuer, file and SHA-256 |
| `data/received.csv` | Requested files received besides the FY 2026–27 sales register (`company,file`) |
| `scripts/letterhead/` | Builds the letterhead PDF of the reconciliation note (logo, document ID, QR codes) |
| `scripts/build_data.py` | Builds a company from its register export and rebuilds the group files |
| `server/` | Mail relay for access and reset requests (the one place the mailbox password lives) |
| `docs/manual/` | The user manual: `manual.html` (source), annotated screenshots, `build.js` + `toc.py` (two-pass PDF build with contents page numbers), `manual.pdf` (document UM-MGHUB-2026-01) |
| `TEMPLATE.md` | The standard monthly review layout (HOD action A2) |

### Adding or updating a company

Export from TallyPrime the Service Bill Register, item-wise (playbook section 04), one per financial
year, and the Stock Summary at each balance date. Then pass all of one company's files in one run:

```sh
pip install openpyxl
python3 scripts/build_data.py exports/HDKSR/*.xls --company HD-KSR --name "HD Kulasekharam"
```

The script tells registers from stock summaries by their contents, so file names do not matter. It
finds each register's columns by name, because every unit's ledgers are named and ordered differently.
Each run rewrites that company's folder, so always include all its files. Registers and stock summaries
mark themselves received in the completeness table. For any other requested file that arrives (the
stock movement reports), add a line to `data/received.csv` with the file's name exactly as the
completeness table shows it, then run `python3 scripts/build_data.py --merge-only`.

Use the company codes agreed with Finance; the `HD-` codes above stand until they are agreed.

Tally's `.xls` export is actually an `.xlsx` file; the script handles that.

**Privacy:** only aggregated figures are committed. Raw register exports contain customer names, phone
numbers and vehicle numbers, so `*.xls` / `*.xlsx` are git-ignored. Keep them out of the repo.

### Notes on the numbers

- **Short months:** every register starts on 9 or 10 April, in both years, so April is short but the year-on-year comparison is like for like.
- **"Net revenue"** = the income ledgers minus the two discount ledgers, without GST.
- **Sign fix:** in 21 HD Attingal bills the discount was bigger than the bill, so the amount should be negative, but the export shows it as positive. The script finds such bills from each bill's ledger arithmetic and counts them as negative, which is what makes the totals match the Grand Total.
- **Discount signs:** HD Marthandam's export shows discounts as negative amounts, while the others show them as positive. The script uses the amount's size, so both work.
- **Revenue groups:** each register column is put in a group by its name: spare parts, accessories, labour and service charges (including consumables and fitment labour), AMC and warranty, branch transfers (spares to branches and warranty transfers out), or other sales (scrap, polymer, miscellaneous receipts).
- **Idle stock** = a line held at 30 September with no counter, workshop or accessory sale from 1 April. Lines are matched to sales by their full Tally name, or by the code in brackets when the name was edited. For 31 March it is measured against the whole of FY 2025–26, so it shows only for companies whose FY 2025–26 register is in.
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
- **The footer** "D&D by Dr.Babu.B. Bpro Consulting & Technologies · www.drbabu.in | www.bpropms.com" appears on every hub page (beside the BPro logo), on every PDF page and on every Excel sheet. Its links are clickable.

### Branding, layout and verification of downloads

- **Look:** a warm palette (ivory surfaces, BPro navy and violet, copper and amber accents) across every page, in light and dark mode. The chart colours were checked for colour-blind separation and contrast in both modes.
- **Report PDF:** A4 landscape.
  - Page 1 has a cover band with both logos, a parameters card and a verification card.
  - Later pages have a running header with the BPro logo.
  - Tables have navy headers, banded rows, shaded subtotals and a ruled grand total. Rows never split across pages.
  - Every page has the credit, the document ID, its verification code, a QR code and "Page n of N".
- **Report Excel:**
  - A cover sheet holds the parameters and verification details, then one styled sheet per section.
  - Each sheet has both logos and the QR code, frozen header rows and hyperlinked credits.
  - Each sheet prints on A4 landscape, fitted to the page width, with repeating headings, a header and footer, and page numbers.
- **How reports verify:**
  - The document ID and code are the SHA-256 of the report's parameters, time of generation and every cell.
  - The QR code opens the report builder with those parameters. It rebuilds the report from the hub's data and shows **Verified** or **Not verified**.
  - A report verifies while the data it was built from is unchanged.
  - The QR link points at wherever the hub is served, so generate reports from the published hub (for example GitHub Pages).
- **How fixed documents verify:** the letterhead PDF's QR code opens `verify.html?d=<ID>`.
  - The page shows the registered details.
  - It checks the hub's copy against its fingerprint.
  - It compares a copy the reader chooses, in the browser, without uploading it.
  - The QR codes use the GitHub Pages address, so Pages must be on for them to open.
- **Re-issuing the letterhead PDF:** after changing `scripts/letterhead/note.html`, run the following (Playwright and pypdf needed), then update the file's `sha256` in `data/verify/registry.json`. A new issue should get a new document ID.

  ```sh
  cd scripts/letterhead
  node build.js note.html /tmp/note.html RN-HDATL-2026-01 https://mmlpbi.bpropms.in/
  node render.js /tmp/note.html /tmp/note.pdf
  python3 finish.py /tmp/note.pdf ../../docs/HD_Attingal_Reconciliation_Note_BPro.pdf RN-HDATL-2026-01
  sha256sum ../../docs/HD_Attingal_Reconciliation_Note_BPro.pdf
  ```

### Division dashboards: data

`data/divisions.json` holds, per division, KPI tiles (`h1_fy27`, `h1_fy26`, `fy26_full`, `fy27_target`), monthly series, breakdown tables and notes, each with its source file and slide. Figures are copied from the decks as stated; where decks disagree (they sometimes do), the tile tooltip and the "Still missing" list say so. Personal details are left out: sales reps in territory tables are numbered, and HR shows the plan only. To refresh after the next HOD meeting, re-extract the new uploads into the same shape and update the file.

### Mobile app and update message

The hub installs on a phone ("Add to Home Screen" / "Install app"). It works offline with the last data it saw, and checks for a new version when reopened and every 30 minutes. When one is published, a banner says "Update available" with the release notes from `version.json`; **Update** switches to it.

To publish an update: change `VERSION` in `sw.js` and `version` (plus `title` and `notes`) in `version.json` to the same new value, and push. Phones pick it up on their next check. This is an in-app message; notifications to a closed app would need a push server, which a static site does not have.

### Web address

The hub is published by GitHub Pages from `main` (root folder). Its own address is
**https://mmlpbi.bpropms.in**; the old `https://techbpropms.github.io/DASHBOARD--MARIKAR-GROUP/`
redirects there once the domain is live, so QR codes already printed keep working.

To connect it:

1. In the DNS panel for bpropms.in, add a **CNAME** record: name `mmlpbi`, target `techbpropms.github.io`
   (no path). Leave the `@` and `www` records alone.
2. In this repository, go to **Settings → Pages → Custom domain**, enter `mmlpbi.bpropms.in` and save.
   GitHub adds a `CNAME` file to `main`. Do not add that file before the DNS record exists, or the site
   redirects to an address that does not answer yet.
3. When the DNS check passes, tick **Enforce HTTPS** (the certificate can take up to an hour).
4. Recommended: verify `bpropms.in` under the account's **Settings → Pages → Verified domains** (a TXT record),
   so no one else can claim the subdomain on GitHub.

**Hostinger VPS.** The same site can be served from the group's Hostinger VPS instead: run
`deploy/vps-setup.sh` once on the server, add the `VPS_HOST` and `VPS_SSH_KEY` secrets, and point the
`mmlpbi` DNS record at the VPS (an A record in place of the CNAME). The "Deploy to VPS" workflow then copies
`main` there after every change, including the mailbox clerk's. Steps in `deploy/README.md`.

Downloads build their verification links from the address the page is open on, so nothing else needs
changing. A new address means fresh browser storage: everyone signs in once more, and phone users reinstall
the app from the new address.

### Menu, themes and settings

Every signed-in page carries the navigation bar (`assets/shell.js`, `assets/shell.css`): the menu, a Light / Dark /
System theme switch, the signed-in name and Sign out. The menu has main items, submenus and **division groups**
(Automotive, Parts & distribution, Office automation, People): a group opens `divisions.html#g=KEY`, which shows
that group's divisions together. Groups are defined in `data/divisions.json` (`groups`) and mirrored in the menu
in `shell.js`. In **Settings → Appearance** each reader picks the theme and whether the menu is a top bar or a
sidebar; both are saved in that browser only. On phones the menu is a drawer behind the ☰ button.

### Requesting access and resetting a password

The sign-in page has three panes: **Sign in**, **Request access** (name, work e-mail, company or division,
designation, phone, reason, a confirmation tick, and a hidden honeypot field against bots) and **Forgot
password?**. The hub is a static site with no server, so a request cannot be stored or acted on automatically.
Instead the page builds a request with a reference (`AR-…` for access, `PR-…` for reset) and a code starting
`MGQ1.` that carries the details, then:

- posts it to `MGAuth.requests.config.endpoint` when one is configured in `assets/auth.js` (any form-to-mail
  service that accepts JSON), so it reaches the administrator without further steps; otherwise
- opens the requester's mail app with the request addressed to mml@bpropms.in, with a "copy" fallback.

The super admin pastes the e-mail or code into **Settings → People → Access and reset requests**, reviews it,
picks a role and approves (which creates the account and shows the temporary password once) or declines (which
opens a reply). Approvals go live with "Publish to the site". Whether an ID exists is never revealed on the
reset pane; the administrator checks before issuing anything.

**Mailbox and relay.** The hub's address is `mml@bpropms.in`. Because a static site cannot send e-mail or hold a
password, `server/` contains a small Node relay that is the only place the mailbox credentials live: the
sign-in page posts requests to it, it e-mails them to the administrator and acknowledges the requester
(see `server/README.md` for running and deploying it on Hostinger). Once it is deployed, set
`REQUESTS.endpoint` in `assets/auth.js` to its address. Never put the mailbox password in the site's files.

Until the relay is hosted, a form-to-mail service does the same job with no server: sign up at
web3forms.com with `mml@bpropms.in`, confirm the e-mail it sends, and put the access key it issues in
`assets/auth.js` as `REQUESTS.endpoint = 'https://api.web3forms.com/submit'` and
`REQUESTS.fields = { access_key: '…' }`. Requests then arrive in the mailbox within seconds, with the
request code the super admin pastes into Settings > People. The access key is a public identifier for that
form, not a password, so it is safe in the page. With neither configured, the form can only open the
requester's own mail program ("Send by e-mail") or copy the request text.

**Mailbox clerk.** The GitHub Action "Mailbox requests" (`.github/workflows/mail-requests.yml`) runs
`scripts/read_requests.py` every 10 minutes and on demand. It signs in to the mailbox over IMAP and:

- lists every new access request in `data/requests/inbox.json`, which Settings > People shows;
- settles **password resets** at once: if the ID has an account, a new temporary password is written to
  `assets/auth.js` and e-mailed to that ID (one reset per address per day); otherwise the address is told
  how to request access;
- **acknowledges** every newly listed access request to the requester (reference, what happens next) and
  **reminds** the approvers once a day of requests that have waited more than a day;
- applies **account-management lines** e-mailed to the mailbox by a super admin (full rights) or an admin (may not
  touch super admin accounts or grant that role): `role <user id> <viewer|admin|superadmin>`, `remove <user id>`,
  `reset <user id>`, `add <user id> <Full name> as <role>`; the person concerned is e-mailed. The People page
  queues these and opens the e-mail ready to send; every change is kept in the store's `log` and shown under
  Settings > Account changes;
- acts on **one-word replies** to a request e-mail from an approver: "approve" (or "approve admin" /
  "approve superadmin") creates the account and e-mails the requester their user ID and temporary
  password; "decline" sends a courteous refusal. Approvers are the super admin accounts in `auth.js`, the
  mailbox itself, and any address in the `APPROVERS` repository variable. The clerk reads the mailbox's Sent
  folder as well as INBOX, so a reply made from the mailbox itself always counts; a reply from another
  approver address counts if it reaches the mailbox (keep `mml@bpropms.in` as a recipient) and is a real
  reply (In-Reply-To) or carries a DKIM/SPF pass.
  The People page's "Approve by e-mail" and "Decline by e-mail" buttons open that reply ready to send.

Set-up is one repository secret: GitHub > Settings > Secrets and variables > Actions > New repository
secret, `MAIL_PASSWORD` = the mailbox password. Optional variables: `MAIL_USER`, `MAIL_HOST` (IMAP),
`SMTP_HOST`, `APPROVERS`. "Run workflow" on the Actions tab runs it at once. The repository is public, so
the request list holds only what an approval needs (phone numbers stay in the e-mail), and `auth.js` holds
salted fingerprints only; a password exists solely in the e-mail sent to its owner. Nothing in the mailbox
is deleted or marked. "Approve here (needs token)" on the People page still works for a super admin who
holds a GitHub token.

**Sign-in report.** Every sign-in is noted on the device it happened on (Settings shows the last 20). For a report
across users, connect the small logging service in `server/signin-log.gs`: create a Google Sheet, paste the
script under Extensions > Apps Script, deploy it as a web app (execute as you, access "Anyone"), and put the
`/exec` URL in `assets/auth.js` as `SIGNINS.endpoint`. The hub then posts one row per sign-in and Settings >
Sign-in report shows, for admins and super admins, who signed in when and on what, with a CSV download. Anyone
who knows the URL could add a row or read the report, so treat it as an attendance register rather than evidence.

**Refresh.** The circular arrow in the bar checks for a new version of the app and reloads the page with fresh
data; it is the first thing to try when a figure looks stale.

Instant approvals, e-mailed reset links and first-sign-in password changes need a server. The practical next
step is a hosted auth service (Supabase or Firebase) or a small API on the Hostinger VPS; the page code is
written so the request transport can be swapped without changing the forms.

### Installing as an app

`manifest.webmanifest` (icons, shortcuts, screenshots) and `sw.js` make the hub installable. `assets/pwa.js` invites
every visitor to install it: on Android, Chrome and Edge it keeps the browser's install event and opens the native
dialog from an "Install the app" card and an "Install app" button in the bar; on iPhone and iPad it shows the
Share → Add to Home Screen steps. The card returns on each new visit until the app is installed ("Not now" hides it
for the session). The same script shows the "Update available" message with the notes from `version.json`.
Pages carry the iOS web-app metas and the bar respects the phone's safe areas.

### Sign-in

`index.html` is the landing and sign-in page. Every hub page except `verify.html` checks for a session (`assets/auth.js`) and sends visitors without one to sign in, then back to the page they asked for. Sessions last 12 hours, or 7 days with "Keep me signed in".

- **Accounts** live in `assets/auth.js` as salted PBKDF2-SHA-256 fingerprints (210,000 rounds); passwords are never stored. Add one with `node scripts/add-user.js <user-id> "<Full name>" [role]`, which prints a temporary password once. User IDs may be e-mail addresses (sign-in ignores capitals). The super admin is `tech@bpropms.com`. To remove an account, delete its line.
- **Settings → People** (super admin only) does the same from the browser: it creates the account's salted fingerprint, shows the temporary password once, and publishes the updated `assets/auth.js` to this repository through the GitHub API using a fine-grained token (Contents: read and write on this repository only) that is kept in the browser tab until sign-out. Without a token, "Send to BPro instead" copies the account lines (never passwords) into an e-mail to mml@bpropms.in.
- **What it protects, honestly:** it is a front door for a static site. It keeps casual visitors out and gives the hub a proper entrance, but the data files (`data/*.csv`, `data/*.json`) can still be fetched by anyone who knows their address while the repository and site are public. For real protection, serve the hub from the VPS behind a server-side login (for example Caddy `basic_auth` or forward-auth), or keep the repository private; the sign-in page can then hand over to that login.
- **Document verification** (`verify.html`) stays public, so anyone holding a document can check it. Report QR codes open the report builder, which asks staff to sign in first.
