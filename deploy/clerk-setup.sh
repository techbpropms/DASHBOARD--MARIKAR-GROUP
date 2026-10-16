#!/usr/bin/env bash
# Installs the hub's mailbox clerk on the VPS: /srv/hub/clerk (runner, deploy key, settings), a clone of the
# repository in /srv/hub/repo, and a systemd timer that runs it every five minutes. Run as root by the "Install
# clerk on VPS" workflow (which then writes the settings file from the repository secrets), or by hand:
#   curl -fsSL https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main/deploy/clerk-setup.sh | bash
# Safe to run again. Afterwards add the printed public key to the repository (Settings > Deploy keys, "Allow write
# access"): until then the clerk on GitHub Actions carries on and this one waits.
set -euo pipefail
D=/srv/hub/clerk
REPO_RAW=https://raw.githubusercontent.com/techbpropms/DASHBOARD--MARIKAR-GROUP/main
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== packages"
apt-get install -y -qq git python3 openssh-client >/dev/null

echo "== clerk folder"
mkdir -p "$D" /srv/hub/log; chmod 700 "$D"
curl -fsSL "$REPO_RAW/deploy/clerk-run.sh" -o "$D/run.sh"; chmod 700 "$D/run.sh"
[ -f "$D/env" ] || { touch "$D/env"; chmod 600 "$D/env"; }
[ -f "$D/key" ] || ssh-keygen -q -t ed25519 -N '' -C "hub-clerk@vps" -f "$D/key"
chmod 600 "$D/key"

echo "== timer (every five minutes)"
cat > /etc/systemd/system/hub-clerk.service <<'UNIT'
[Unit]
Description=Marikar hub mailbox clerk (one run)
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/srv/hub/clerk/run.sh
TimeoutStartSec=600
UNIT
cat > /etc/systemd/system/hub-clerk.timer <<'UNIT'
[Unit]
Description=Marikar hub mailbox clerk, every five minutes
[Timer]
OnCalendar=*:0/5
RandomizedDelaySec=20
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/logrotate.d/hub-clerk <<'ROT'
/srv/hub/clerk/clerk.log {
    size 5M
    rotate 4
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
}
ROT
systemctl daemon-reload
systemctl enable --now hub-clerk.timer >/dev/null
systemctl list-timers hub-clerk.timer --no-pager | sed -n 2p

echo "== nginx: /clerk.json for the Settings page"
CONF=/etc/nginx/sites-available/mmlpbi.bpropms.in
if [ -f "$CONF" ] && ! grep -q 'clerk.json' "$CONF"; then
  sed -i 's#^\(\s*\)location / { try_files#\1location = /clerk.json { alias /srv/hub/log/clerk.json; default_type application/json; add_header Cache-Control "no-store"; }\n\1location / { try_files#' "$CONF"
  nginx -t && systemctl reload nginx
fi

echo; echo "Done. The clerk runs every five minutes once this public key is added to the repository with write access"
echo "(GitHub: Settings > Deploy keys > Add deploy key, tick 'Allow write access'):"
cat "$D/key.pub"
