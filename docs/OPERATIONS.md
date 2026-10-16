# Operating the hub: practices for a production service

The hub is a static site on GitHub Pages (and, once set up, the Hostinger VPS) with one automated operator, the
mailbox clerk: it runs on the VPS every five minutes and, as the fallback, in GitHub Actions. This page is the runbook: who does what, which secrets exist, how changes are
released, how to recover, and what to do when something looks wrong. Keep it current when any of these change.

## Roles and responsibilities

| Role | Who | Does |
|---|---|---|
| Super admin | `tech@bpropms.com` (BPro) | Everything; holds the GitHub token route; owns releases and this runbook |
| Approvers | the super admins, the mailbox, `APPROVERS` (the owner's two Gmail addresses) | Approve or decline access requests, send account-management lines |
| Admin | accounts with role `admin` | People page: roles, divisions, resets, additions, removals (not over super admins) |
| Viewer | everyone else | Reads the divisions on their account |

Review the account list once a month from Settings → People against the sign-in report: remove leavers, narrow
divisions that are wider than the job, and confirm every admin is still meant to be one.

## Passwords and sessions

- Passwords are chosen by their owners on `reset.html`, reached by a one-time link (24 hours, single use)
  e-mailed to the account's own address. The hub never e-mails a password. The rule set on that page is the
  minimum: 10 characters, letters plus a number or symbol, not the user ID.
- A changed password ends every other session of that account. A removed account is signed out at once.
- Sessions last 12 hours, or 7 days with "Keep me signed in"; the sign-in page slows down after wrong attempts.
- Known limit: this is a front door on a static site. Data files are fetchable by anyone who knows their
  address. A server-side login (nginx `auth_request` on the VPS) is the step that closes this.

## Secrets: where they live, who rotates them

| Secret | Lives in | Rotate when | How |
|---|---|---|---|
| Mailbox password (`mml@bpropms.in`) | Hostinger e-mail; GitHub secret `MAIL_PASSWORD`; on the VPS `/srv/hub/clerk/env` (root only) | Every 6 months, or at once if typed anywhere but the hosting panel and the secret | Hostinger panel → Emails → change; then GitHub → Settings → Secrets → update `MAIL_PASSWORD`; then run "Install clerk on VPS" so the server gets it too |
| Clerk deploy key (VPS → GitHub) | `/srv/hub/clerk/key` on the VPS; public half under GitHub Settings → Deploy keys (write access) | Yearly, or when the VPS is rebuilt | Delete `/srv/hub/clerk/key*` on the server, run "Install clerk on VPS", add the new public key it prints, remove the old one from Deploy keys |
| VPS deploy key | the `hub` user on the VPS; GitHub secret `VPS_SSH_KEY` | Yearly, or when the VPS is rebuilt | Re-run `deploy/vps-setup.sh` (it keeps an existing key); to rotate, delete `/home/hub/.ssh/deploy_ed25519*` first |
| GitHub fine-grained token (People page token route) | the super admin's browser tab only | Expiry set at creation (90 days at most) | Create a new one with Contents read/write on this repository only |

Never put a secret in the repository, in chat, or in an e-mail. The public repository and the Actions logs are
written on that assumption: logs mask addresses and never print passwords or tokens.

## Releases

1. Every change goes through a pull request to `main`; nothing is pushed to `main` directly except the
   clerk's own commits (`Requests: settled from the hub mailbox`).
2. Bump `VERSION` in `sw.js` and the notes in `version.json` with every user-visible change; installed copies
   show the notes in their update message.
3. Before merging: `node --check` on changed scripts, the clerk's dry run on a sample set (`DRY_RUN=1
   python3 scripts/read_requests.py --eml <folder>`), and a browser pass of the pages touched.
4. After merging: confirm the Pages build is green, trigger "Mailbox requests" once and read its log.
5. Rebuild the manual (`docs/manual/`) when a screen it shows changes; update the registry entry.

Recommended GitHub settings (set by the repository owner in Settings → Branches / Settings → General):
require a pull request before merging to `main`, allow the `github-actions` app to push (the clerk needs it),
and require two-factor authentication for every collaborator. Two-factor on the Hostinger account and the
Gmail approver accounts matters as much: an approver's mailbox is an approval instrument.

## Monitoring

- Settings → Account changes shows when the clerk on the server last ran and its note (from `/clerk.json`).
  "Needs attention" there, or a last run older than 20 minutes, means that clerk is stuck: on the server,
  `journalctl -u hub-clerk -n 50` and `/srv/hub/clerk/clerk.log` say why; re-running "Install clerk on VPS" repairs
  the runner, the timer and the settings. Meanwhile the GitHub workflow settles requests, every 10 minutes at best.
- GitHub e-mails the repository owner when a workflow run fails. A failing "Mailbox requests" run while the server
  clerk is also down means no requests are settled: open the run, read the log, and fix the cause (usually the
  mailbox password).
- The clerk e-mails approvers once a day with requests waiting more than a day.
- Survey answers (feedback.html) arrive by e-mail at the mailbox and the approvers as they come in, and are listed
  under Settings → Feedback. To write to all users again, add a template under `docs/mail/` and run "Send mail to
  users" (dry run first, then a test send to yourself, then `all`).
- Settings → Account changes lists every change the hub made, with who asked. Settings → Sign-in report shows
  who signs in across users, from the log nginx keeps on the VPS (`/srv/hub/log/signins.log`).
- The VPS, once in use: `systemctl status nginx`, `/var/log/nginx/hub-access.log`, and `certbot certificates` for the certificate; the "VPS diagnostics" workflow shows all of it from GitHub.

## Backups and recovery

Everything the hub is, including the account file and the request store, is the git history of this
repository. There is no database.

- **Undo an account change**: `git revert <commit>` on `main` (or restore the previous `assets/auth.js` from
  history) and push through a pull request. The Account changes log names the commit time.
- **Lost mailbox access**: rotate the mailbox password (table above). Until the secret is updated, requests
  queue in the mailbox and are settled on the next successful run.
- **Lost super admin password**: run the "Mailbox requests" workflow with the `reset` input set to the super
  admin's ID; a link goes to that address.
- **Site down on Pages**: the repository still holds everything; the VPS copy (once set up) serves the same
  files. Point DNS at whichever is healthy.
- Keep a quarterly clone of the repository off GitHub (`git clone --mirror`) on BPro's own storage.

## Incidents

| Signal | First response |
|---|---|
| An approval or account change nobody made | Revert the commit, remove the account by e-mail line or People page, rotate the mailbox password, check which approver address sent it (the log says) |
| A set-password link reached the wrong person | The link only works for its own account and once; if in doubt, send a new reset for that account, which replaces the link |
| Mailbox compromised | Rotate its password, review the Account changes log for the period, re-issue links to affected accounts |
| A user reports a sign-in they did not make | Reset their password from the People page (link to their address) and check the sign-in report for the device |
| Workflow runs failing | Read the log; mask nothing, the log already does; fix the secret or the code through a pull request |

## Data handling

Only aggregated figures are published. Raw Tally exports (`*.xls`, `*.xlsx`) are git-ignored and never leave
the owner's computer; the stored request list carries no phone numbers; the store keeps the last 300 log
entries. Reports and PDFs carry a document ID and fingerprint that `verify.html` checks.
