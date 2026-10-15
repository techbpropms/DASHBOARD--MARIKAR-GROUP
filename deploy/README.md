# Hosting the hub on the Hostinger VPS

The hub is a static site, so the VPS only needs a web server. Caddy serves the files and manages the HTTPS
certificate; GitHub Actions copies `main` to the server after every merge and after every commit the mailbox
clerk makes (new accounts, approvals, resets), so the VPS is always current.

## Set-up without a terminal (recommended, about five minutes)

1. In the Hostinger panel open **VPS → your server → SSH access**. Note the **IP address**, and set or reset the
   **root password** there if you do not have it.
2. In GitHub, repository **Settings → Secrets and variables → Actions → New repository secret**, add two secrets:
   `VPS_HOST` = the IP address, `VPS_PASSWORD` = the root password.
3. Open the **Actions** tab, choose **Set up VPS**, press **Run workflow**. It installs Caddy on the server, opens
   ports 80 and 443, copies the site, and ends with the line `The server answers ... HTTP 200`.
4. **DNS** (Hostinger panel → Domains → bpropms.in → DNS records): change the record `mmlpbi` to one **A** record
   pointing at the IP address (remove the GitHub Pages CNAME). Within a minute of the change Caddy fetches the
   certificate and https://mmlpbi.bpropms.in is served from the VPS.

From then on **Deploy to VPS** runs on every change by itself. GitHub Pages can stay on as a fallback.

## Set-up from the VPS terminal (alternative)

As root on the VPS (Hostinger panel → VPS → browser terminal, or any SSH client):

```sh
curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/vps-setup.sh | bash
```

It does the same, creates a `hub` deploy user and prints an SSH private key. Add `VPS_HOST` (the IP) and
`VPS_SSH_KEY` (the printed key, BEGIN to END lines) as repository secrets instead of the password, then run
**Deploy to VPS** once and change the DNS record as above.

To pause VPS deployments set a repository variable `VPS_DEPLOY` to `off`.

## What is and is not copied

Only the browser-facing files go to the server: pages, assets, data, docs, the manifest and service worker.
Git history, the mail relay (`server/`), the build and mailbox scripts and this folder are not copied. Raw
Tally files never leave the owner's computer. The root password or key lives only in the GitHub secret.

## Later: a real login

With the hub on the VPS it can be put behind a server-side login, so the data files are no longer readable
without signing in. That is the next step once the move is done (Caddy `forward_auth` or `basic_auth`).
