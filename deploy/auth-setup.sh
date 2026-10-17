#!/usr/bin/env bash
# Installs the hub's server-side sign-in (deploy/hub-auth.py) on the VPS and puts the sign-in log behind it.
# Run as root by the "Install sign-in service on VPS" workflow, which first copies hub-auth.py to
# /srv/hub/auth/hub-auth.py. Safe to run again: every step checks before it changes anything, and the nginx site
# file is put back as it was if the new one does not pass nginx -t.
#   - a system user (hubauth) that can read the site and write only /srv/hub/log
#   - /srv/hub/auth/secret: the key that signs session cookies (made once, kept across runs)
#   - hub-auth.service on 127.0.0.1:8790
#   - nginx: /auth/login (rate-limited per address) and /auth/logout, and /signins.log served only to signed-in
#     super admins and admins (auth_request)
set -euo pipefail
D=/srv/hub/auth
CONF=/etc/nginx/sites-available/mmlpbi.bpropms.in
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
[ -f "$D/hub-auth.py" ] || { echo "copy deploy/hub-auth.py to $D/hub-auth.py first"; exit 1; }
nginx -V 2>&1 | grep -q http_auth_request_module || { echo "this nginx has no auth_request module; nothing changed"; exit 1; }

echo "== user, key and log"
id hubauth >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin hubauth
mkdir -p "$D" /srv/hub/log
[ -s "$D/secret" ] || head -c 48 /dev/urandom | base64 > "$D/secret"
chown -R hubauth:hubauth "$D"; chmod 700 "$D"; chmod 600 "$D/secret"; chmod 644 "$D/hub-auth.py"
touch /srv/hub/log/auth.log; chown hubauth:hubauth /srv/hub/log/auth.log; chmod 600 /srv/hub/log/auth.log

echo "== service"
cat > /etc/systemd/system/hub-auth.service <<'UNIT'
[Unit]
Description=Marikar hub server-side sign-in (session cookies for nginx auth_request)
After=network.target
[Service]
User=hubauth
Group=hubauth
ExecStart=/usr/bin/python3 -I /srv/hub/auth/hub-auth.py
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/hub/log
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/logrotate.d/hub-auth <<'ROT'
/srv/hub/log/auth.log {
    size 5M
    rotate 4
    compress
    missingok
    copytruncate
}
ROT
systemctl daemon-reload
systemctl enable --now hub-auth.service >/dev/null
systemctl restart hub-auth.service
for i in 1 2 3 4 5; do code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/auth/check || true); [ "$code" = 401 ] && break; sleep 1; done
echo "service answers: $code (401 = up, no session)"
[ "$code" = 401 ] || { systemctl status hub-auth.service --no-pager | tail -15; exit 1; }

echo "== nginx"
# one shared rate limit for sign-in attempts: 10 a minute per address, short bursts allowed
echo 'limit_req_zone $binary_remote_addr zone=hub_auth:1m rate=10r/m;' > /etc/nginx/conf.d/hub-auth.conf
cp "$CONF" "$CONF.before-auth"
python3 - "$CONF" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
AUTH = ['location = /auth/login { limit_req zone=hub_auth burst=5 nodelay; proxy_pass http://127.0.0.1:8790; proxy_set_header X-Real-IP $remote_addr; add_header Cache-Control no-store; }',
        'location = /auth/logout { proxy_pass http://127.0.0.1:8790; add_header Cache-Control no-store; }',
        'location = /auth/admin { internal; proxy_pass http://127.0.0.1:8790/auth/check?need=admin; proxy_pass_request_body off; proxy_set_header Content-Length ""; }',
        'location = /auth/user { internal; proxy_pass http://127.0.0.1:8790/auth/check; proxy_pass_request_body off; proxy_set_header Content-Length ""; }']
if 'location = /auth/login' not in s:
    s = re.sub(r'^(\s*)location / \{ try_files', lambda m: ''.join(m.group(1) + a + '\n' for a in AUTH) + m.group(0), s, flags=re.M)
# the sign-in log (names, addresses, IPs): signed-in super admins and admins only
s = re.sub(r'location = /signins\.log \{(?! auth_request)', 'location = /signins.log { auth_request /auth/admin;', s)
open(p, 'w').write(s)
PY
if nginx -t 2>/tmp/nginx-t.log; then
  systemctl reload nginx; echo "nginx reloaded with the sign-in rules"
else
  cat /tmp/nginx-t.log; cp "$CONF.before-auth" "$CONF"; rm -f /etc/nginx/conf.d/hub-auth.conf; nginx -t && systemctl reload nginx
  echo "nginx refused the new rules; the previous site file is back"; exit 1
fi
grep -c 'auth_request /auth/admin' "$CONF" | sed 's/^/protected locations: /'
