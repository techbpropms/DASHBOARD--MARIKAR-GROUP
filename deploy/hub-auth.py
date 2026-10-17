#!/usr/bin/env python3
"""Server-side sign-in for the Marikar hub, behind nginx on 127.0.0.1:8790 (installed by deploy/auth-setup.sh).

The hub checks passwords in the browser against the fingerprints in assets/auth.js; this service makes the same
check on the server and issues a signed session cookie, so nginx can serve protected files only to signed-in people
(auth_request). Nothing new is stored: it reads the account file the site already serves.

  POST /auth/login   {"id", "password", "remember"}  -> 204 + cookie, or 401
  POST /auth/logout                                   -> 204, cookie cleared
  GET  /auth/check[?need=admin]                       -> 204 signed in (and an administrator, if asked), else 401/403

The cookie carries the account, the first 8 characters of its fingerprint (a changed password or a removed account
ends the session at once, as in the browser), the role at sign-in and an expiry, signed with HMAC-SHA256 under a
key kept in /srv/hub/auth/secret. Passwords are never logged or stored; attempts are recorded in
/srv/hub/log/auth.log (account and outcome only).
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AUTH_JS = os.environ.get('HUB_AUTH_JS', '/srv/hub/site/assets/auth.js')
SECRET = open(os.environ.get('HUB_AUTH_SECRET', '/srv/hub/auth/secret'), 'rb').read().strip()
LOG = os.environ.get('HUB_AUTH_LOG', '/srv/hub/log/auth.log')
COOKIE = 'hub_s'
ROUNDS = 210000
DAY = 86400
LINE = re.compile(r"\{ id: '([^']+)', name: (?:\"(?:[^\"\\\\]|\\\\.)*\"|'[^']*'), role: '([a-z]+)', salt: '([0-9a-f]+)', hash: '([0-9a-f]{64})'")


def accounts():
    """The accounts as the site serves them now: id -> (role, salt, hash)."""
    try:
        text = open(AUTH_JS, encoding='utf-8').read()
    except OSError:
        return {}
    return {m.group(1).lower(): (m.group(2), m.group(3), m.group(4)) for m in LINE.finditer(text)}


def b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def sign(payload):
    body = b64(json.dumps(payload, separators=(',', ':')).encode())
    return body + '.' + b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())


def session(cookie_header):
    """The signed-in account behind a request's cookie, or None."""
    for part in (cookie_header or '').split(';'):
        k, _, v = part.strip().partition('=')
        if k != COOKIE or '.' not in v:
            continue
        body, mac = v.rsplit('.', 1)
        if not hmac.compare_digest(mac, b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())):
            return None
        try:
            s = json.loads(unb64(body))
        except ValueError:
            return None
        acct = accounts().get(str(s.get('id', '')).lower())
        if not acct or s.get('exp', 0) < time.time() or acct[2][:8] != s.get('k'):
            return None   # expired, removed, or the password changed since
        return {'id': s['id'], 'role': acct[0]}
    return None


def log(**kw):
    try:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'at': time.strftime('%Y-%m-%dT%H:%M:%S%z'), **kw}) + '\n')
    except OSError:
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = 'hub-auth'

    def log_message(self, *a):   # requests carry passwords: nothing about them goes to the console
        pass

    def reply(self, code, cookie=None):
        self.send_response(code)
        self.send_header('Cache-Control', 'no-store')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.path.startswith('/auth/check'):
            return self.reply(404)
        s = session(self.headers.get('Cookie'))
        if not s:
            return self.reply(401)
        if 'need=admin' in self.path and s['role'] not in ('admin', 'superadmin'):
            return self.reply(403)
        self.reply(204)

    def do_POST(self):
        if self.path == '/auth/logout':
            return self.reply(204, f'{COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0')
        if self.path != '/auth/login':
            return self.reply(404)
        n = int(self.headers.get('Content-Length') or 0)
        if n <= 0 or n > 4096:
            return self.reply(400)
        try:
            d = json.loads(self.rfile.read(n))
            uid, pw, remember = str(d['id']).strip().lower(), str(d['password']), bool(d.get('remember'))
        except (ValueError, KeyError, TypeError):
            return self.reply(400)
        acct = accounts().get(uid)
        ip = self.headers.get('X-Real-IP', '')
        # the same derivation as the browser (PBKDF2-SHA256, 210,000 rounds); unknown IDs cost the same time
        salt = bytes.fromhex(acct[1]) if acct else b'\0' * 16
        got = hashlib.pbkdf2_hmac('sha256', pw.encode(), salt, ROUNDS).hex()
        if not acct or not hmac.compare_digest(got, acct[2]):
            log(id=uid[:120], ok=False, ip=ip)
            return self.reply(401)
        life = 30 * DAY if remember else DAY // 2
        cookie = sign({'id': uid, 'k': acct[2][:8], 'role': acct[0], 'exp': int(time.time()) + life})
        log(id=uid, ok=True, ip=ip)
        self.reply(204, f'{COOKIE}={cookie}; Path=/; HttpOnly; Secure; SameSite=Lax' + (f'; Max-Age={life}' if remember else ''))


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('HUB_AUTH_PORT', '8790'))), Handler).serve_forever()
