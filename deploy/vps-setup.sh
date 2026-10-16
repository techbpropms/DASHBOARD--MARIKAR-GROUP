#!/usr/bin/env bash
# Set-up of the Marikar hub on the Hostinger VPS, as one more site on the server's nginx (the VPS also serves
# other BPro products, so nothing else is touched: no other web server, no firewall change). Run as root, by the
# "Set up VPS" workflow or by hand:
#   curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/vps-setup.sh | bash
# Safe to run again. Pass 1 (before DNS points here): site folder, nginx server block on port 80.
# Pass 2 (after DNS points here): the HTTPS certificate through certbot, and the redirect to HTTPS.
set -euo pipefail

HOST=mmlpbi.bpropms.in
SITE_DIR=/srv/hub/site
REPO_RAW=https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main
CERT_MAIL=mml@bpropms.in

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== leftovers from the first attempt (Caddy must not hold the web ports on this server)"
if dpkg -l caddy 2>/dev/null | grep -q '^ii'; then
  systemctl disable --now caddy >/dev/null 2>&1 || true
  apt-get purge -y -qq caddy >/dev/null 2>&1 || true
  rm -f /etc/apt/sources.list.d/caddy-stable.list /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  echo "Caddy removed"
fi

echo "== packages"
apt-get update -qq
apt-get install -y -qq nginx rsync curl python3-certbot-nginx >/dev/null

echo "== site folder"
mkdir -p "$SITE_DIR"
if [ ! -f "$SITE_DIR/index.html" ]; then
  TMP=$(mktemp -d)
  curl -fsSL https://github.com/techbpropms/DASHBOARD--MARIKAR-GROUP/archive/refs/heads/main.tar.gz | tar -xz -C "$TMP"
  rsync -a --exclude '.github' --exclude 'server' --exclude 'scripts' --exclude 'deploy' "$TMP"/*/ "$SITE_DIR"/
  rm -rf "$TMP"
fi
chown -R root:root "$SITE_DIR"; chmod -R u=rwX,go=rX "$SITE_DIR"

echo "== sign-in log (nginx writes it, the Settings page reads it)"
mkdir -p /srv/hub/log && chmod 755 /srv/hub/log
touch /srv/hub/log/signins.log /srv/hub/log/submit.log && chmod 644 /srv/hub/log/signins.log && chmod 600 /srv/hub/log/submit.log
curl -fsSL "$REPO_RAW/deploy/hub-signins-format.conf" -o /etc/nginx/conf.d/hub-signins-format.conf
curl -fsSL "$REPO_RAW/deploy/hub-signins.logrotate" -o /etc/logrotate.d/hub-signins

echo "== nginx site"
CONF=/etc/nginx/sites-available/$HOST
if [ ! -f "$CONF" ] || ! grep -q 'listen 443' "$CONF"; then
  # not yet certified: (re)write the plain server block; once certbot has edited it, leave it alone
  curl -fsSL "$REPO_RAW/deploy/nginx-hub.conf" -o "$CONF"
else
  # certified earlier: certbot owns the file now, so missing locations are inserted into every server block
  grep -q 'signin-log' "$CONF" || sed -i 's#^\(\s*\)location / { try_files#\1location = /signin-log { access_log /srv/hub/log/signins.log hub_signins; add_header Cache-Control no-store; return 204; }\n\1location = /signins.log { alias /srv/hub/log/signins.log; default_type text/plain; add_header Cache-Control "no-cache, no-store, must-revalidate"; }\n\1location / { try_files#' "$CONF"
  grep -q 'error_page 404' "$CONF" || sed -i 's#^\(\s*\)location / { try_files#\1error_page 404 /404.html;\n\1location / { try_files#' "$CONF"
  grep -q 'clerk.json' "$CONF" || sed -i 's#^\(\s*\)location / { try_files#\1location = /clerk.json { alias /srv/hub/log/clerk.json; default_type application/json; add_header Cache-Control "no-store"; }\n\1location / { try_files#' "$CONF"
  grep -q '/submit ' "$CONF" || sed -i 's#^\(\s*\)location / { try_files#\1location = /submit { access_log /srv/hub/log/submit.log hub_submit; add_header Cache-Control no-store; return 204; }\n\1location / { try_files#' "$CONF"
fi
ln -sf "$CONF" /etc/nginx/sites-enabled/$HOST
nginx -t
systemctl reload nginx
echo "nginx serves $HOST from $SITE_DIR"

echo "== certificate"
MYIP=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
DNSIP=$(getent ahostsv4 "$HOST" 2>/dev/null | awk '{print $1; exit}' || true)
if [ -d "/etc/letsencrypt/live/$HOST" ]; then
  echo "certificate already in place; renewal is automatic"
elif [ "$DNSIP" = "$MYIP" ]; then
  certbot --nginx -d "$HOST" --non-interactive --agree-tos -m "$CERT_MAIL" --redirect
  nginx -t && systemctl reload nginx
  echo "HTTPS certificate issued; https://$HOST is served from this server"
else
  echo "DNS for $HOST points at ${DNSIP:-nothing yet}, this server is $MYIP: point the A record here, then run this again for the certificate."
fi

echo; echo "Done. Server IP: $MYIP. Check: curl -s http://$MYIP/version.json -H 'Host: $HOST'"
