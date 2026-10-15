#!/usr/bin/env bash
# One-time set-up of the Marikar hub on a fresh Hostinger VPS (Ubuntu 22.04 or 24.04). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/vps-setup.sh | bash
# It installs Caddy (web server with automatic HTTPS), creates the "hub" deploy user with an SSH key that
# GitHub Actions uses to copy the site, places the Caddyfile, opens ports 80/443, and prints the private key
# to store as the VPS_SSH_KEY repository secret. Safe to run again.
set -euo pipefail

SITE_USER=hub
SITE_DIR=/srv/hub/site
REPO_RAW=https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl rsync ufw >/dev/null
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

echo "== deploy user and site folder"
id -u "$SITE_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$SITE_USER"
mkdir -p "$SITE_DIR" && chown -R "$SITE_USER:$SITE_USER" /srv/hub
KEY=/home/$SITE_USER/.ssh/deploy_ed25519
if [ ! -f "$KEY" ]; then
  sudo -u "$SITE_USER" mkdir -p "/home/$SITE_USER/.ssh"
  sudo -u "$SITE_USER" ssh-keygen -q -t ed25519 -N '' -C 'marikar-hub-deploy' -f "$KEY"
  sudo -u "$SITE_USER" sh -c "cat '$KEY.pub' >> /home/$SITE_USER/.ssh/authorized_keys"
  chmod 700 "/home/$SITE_USER/.ssh" && chmod 600 "/home/$SITE_USER/.ssh/authorized_keys"
fi

echo "== first copy of the site (so the address answers before the first deployment)"
if [ ! -f "$SITE_DIR/index.html" ]; then
  TMP=$(mktemp -d)
  curl -fsSL https://github.com/techbpropms/DASHBOARD--MARIKAR-GROUP/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP"
  rsync -a --exclude '.github' --exclude 'server' --exclude 'scripts' --exclude 'deploy' "$TMP"/*/ "$SITE_DIR"/
  chown -R "$SITE_USER:$SITE_USER" "$SITE_DIR"; rm -rf "$TMP"
fi

echo "== caddy"
curl -fsSL "$REPO_RAW/deploy/Caddyfile" -o /etc/caddy/Caddyfile
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

echo "== firewall"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

IP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
cat <<MSG

Done. Now, in the GitHub repository (Settings > Secrets and variables > Actions > New repository secret):
  VPS_HOST     $IP
  VPS_SSH_KEY  the whole block below, including the BEGIN and END lines

$(cat "$KEY")

Then point DNS for mmlpbi.bpropms.in at $IP (an A record; remove the GitHub Pages CNAME/A records). Caddy
fetches the certificate itself within a minute of the DNS change. Check: https://mmlpbi.bpropms.in/version.json
MSG
