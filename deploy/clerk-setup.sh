#!/usr/bin/env bash
# Installs the hub's mailbox clerk on the VPS: /srv/hub/clerk (runner, deploy key, settings), a clone of the
# repository in /srv/hub/repo, a systemd path unit that runs it the moment a code is submitted on the hub, and a
# timer that runs it every minute for what arrives by e-mail. Run as root by the "Install
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

echo "== the clerk runs the moment a code is submitted on the hub (path unit), and every minute for the mailbox (timer)"
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
Description=Marikar hub mailbox clerk, every minute
[Timer]
OnCalendar=*:*:00
AccuracySec=5
Persistent=true
[Install]
WantedBy=timers.target
UNIT
# a request or a new password submitted on the hub lands in submit.log; nginx writing to it starts a run at once
touch /srv/hub/log/submit.log
cat > /etc/systemd/system/hub-clerk.path <<'UNIT'
[Unit]
Description=Marikar hub mailbox clerk: run as soon as a code is submitted on the hub
[Path]
PathModified=/srv/hub/log/submit.log
Unit=hub-clerk.service
[Install]
WantedBy=multi-user.target
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
systemctl enable --now hub-clerk.path >/dev/null
systemctl list-timers hub-clerk.timer --no-pager | sed -n 2p
systemctl is-active hub-clerk.path | sed 's/^/hub-clerk.path: /'

echo "== nginx: /clerk.json for the Settings page, /results.json for the sign-in and reset pages"
CONF=/etc/nginx/sites-available/mmlpbi.bpropms.in
# the account file, the service worker and the version file must never be cached (exact locations outrank /assets/)
if [ -f "$CONF" ]; then
  python3 - "$CONF" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
for f in ('/assets/auth.js', '/sw.js', '/version.json'):
    if 'location = %s ' % f not in s:
        s = re.sub(r'^(\s*)location / \{ try_files', lambda m: '%slocation = %s { add_header Cache-Control "no-cache, no-store, must-revalidate"; add_header X-Content-Type-Options nosniff; }\n%s' % (m.group(1), f, m.group(0)), s, flags=re.M)
open(p, 'w').write(s)
PY
  nginx -t && systemctl reload nginx
fi
if [ -f "$CONF" ] && ! grep -q 'results.json' "$CONF"; then
  sed -i 's#^\(\s*\)location / { try_files#\1location = /results.json { alias /srv/hub/log/results.json; default_type application/json; add_header Cache-Control "no-store"; }\n\1location / { try_files#' "$CONF"
  nginx -t && systemctl reload nginx
fi
if [ -f "$CONF" ] && ! grep -q 'clerk.json' "$CONF"; then
  sed -i 's#^\(\s*\)location / { try_files#\1location = /clerk.json { alias /srv/hub/log/clerk.json; default_type application/json; add_header Cache-Control "no-store"; }\n\1location / { try_files#' "$CONF"
  nginx -t && systemctl reload nginx
fi

echo; echo "Done. The clerk runs at once on each submission and every minute for the mailbox, once this public key is added to the repository with write access"
echo "(GitHub: Settings > Deploy keys > Add deploy key, tick 'Allow write access'):"
cat "$D/key.pub"
