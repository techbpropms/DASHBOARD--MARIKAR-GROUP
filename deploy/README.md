# Hosting the hub on the Hostinger VPS

The hub is a static site, so it is one more site on the VPS's existing nginx (the server also runs other BPro
products, which the set-up never touches). Let's Encrypt provides the HTTPS certificate through certbot; GitHub
Actions copies `main` to the server after every merge and after every commit the mailbox clerk makes (new
accounts, approvals, resets), so the VPS is always current.

## Set-up without a terminal (recommended, about five minutes)

1. In the Hostinger panel open **VPS → your server → SSH access**. Note the **IP address**, and set or reset the
   **root password** there if you do not have it.
2. In GitHub, repository **Settings → Secrets and variables → Actions → New repository secret**, add two secrets:
   `VPS_HOST` = the IP address, `VPS_PASSWORD` = the root password.
3. Open the **Actions** tab, choose **Set up VPS**, press **Run workflow**. It adds the hub to nginx, copies the
   site, and ends with the line `The server answers ... HTTP 200`.
4. **DNS** (Hostinger panel → Domains → bpropms.in → DNS records): change the record `mmlpbi` to one **A** record
   pointing at the IP address (remove the GitHub Pages CNAME). Then run **Set up VPS** once more: it obtains the
   certificate and https://mmlpbi.bpropms.in is served from the VPS.

From then on **Deploy to VPS** runs on every change by itself. GitHub Pages can stay on as a fallback.

## Set-up from the VPS terminal (alternative)

As root on the VPS (Hostinger panel → VPS → browser terminal, or any SSH client):

```sh
curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/vps-setup.sh | bash
```

It does the same. For the deployment secrets use either `VPS_PASSWORD` (root password) or `VPS_SSH_KEY` (a
private key whose public half is added to the VPS under Settings → SSH keys), then change the DNS record as
above and run the script (or the workflow) once more for the certificate.

To pause VPS deployments set a repository variable `VPS_DEPLOY` to `off`.

## What is and is not copied

Only the browser-facing files go to the server: pages, assets, data, docs, the manifest and service worker.
Git history, the mail relay (`server/`), the build and mailbox scripts and this folder are not copied. Raw
Tally files never leave the owner's computer. The root password or key lives only in the GitHub secret. The
set-up changes nothing else on the server: no other web server, no firewall rules, no other site's configuration.

## Later: a real login

With the hub on the VPS it can be put behind a server-side login, so the data files are no longer readable
without signing in. That is the next step once the move is done (nginx `auth_request` or `auth_basic`).
