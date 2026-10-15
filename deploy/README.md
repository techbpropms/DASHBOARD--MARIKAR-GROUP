# Hosting the hub on the Hostinger VPS

The hub is a static site, so the VPS only needs a web server. Caddy serves the files and manages the HTTPS
certificate; GitHub Actions copies `main` to the server after every merge and after every commit the mailbox
clerk makes (new accounts, approvals, resets), so the VPS stays as current as GitHub Pages was.

## One-time set-up (about ten minutes)

1. **On the VPS**, as root (Hostinger panel > VPS > SSH access, or the browser terminal):
   ```sh
   curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/vps-setup.sh | bash
   ```
   It installs Caddy, creates the `hub` deploy user, copies the site once, and prints an SSH private key.
2. **In GitHub** (repository Settings > Secrets and variables > Actions), add two secrets:
   `VPS_HOST` (the server's IP address) and `VPS_SSH_KEY` (the printed key, BEGIN to END lines included).
   Optional: `VPS_USER` and `VPS_PATH` if the defaults (`hub`, `/srv/hub/site`) were changed.
3. **Run** Actions > "Deploy to VPS" > Run workflow once, and check the log ends with "deployed".
   Before DNS moves, the server can be checked at `https://<ip>/version.json` (self-signed certificate).
4. **DNS** (where bpropms.in is managed): change `mmlpbi` from the GitHub Pages records to one **A** record
   pointing at the VPS IP. Within a minute of the change Caddy obtains the certificate and
   https://mmlpbi.bpropms.in is served from the VPS. GitHub Pages can stay enabled as a fallback.

To pause VPS deployments set a repository variable `VPS_DEPLOY` to `off`.

## What is and is not copied

Only the browser-facing files go to the server: pages, assets, data, docs, the manifest and service worker.
Git history, the mail relay (`server/`), the build and mailbox scripts and this folder are not copied. Raw
Tally files never leave the owner's computer.

## Later: a real login

With the hub on the VPS it can be put behind a server-side login, so the data files are no longer readable
without signing in. That is the next step once the move is done (Caddy `forward_auth` or `basic_auth`).
