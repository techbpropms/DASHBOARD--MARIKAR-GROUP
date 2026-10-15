#!/usr/bin/env python3
"""The hub's mailbox clerk: reads mml@bpropms.in and settles access and password-reset requests on its own.

Every request from the sign-in page reaches the mailbox as an e-mail carrying a code that starts MGQ1.
(base64url JSON). This script, run by the "Mailbox requests" GitHub Action every few minutes, signs in to
the mailbox over IMAP and:

  1. lists every new access request in data/requests/inbox.json (`pending`), so Settings > People shows it;
  2. settles password-reset requests at once: if the ID has an account, a new temporary password is written
     to assets/auth.js and e-mailed to that ID; if not, the address is told how to request access;
  3. acts on one-word replies from an approver: a reply to a request e-mail whose first line is
     "approve" (optionally "approve admin" / "approve superadmin") creates the account, writes it to
     assets/auth.js and e-mails the user ID and temporary password to the requester; "decline" sends a
     courteous refusal. Either way the request moves to `handled`.

Who may approve: the super admin accounts in assets/auth.js, the hub mailbox itself, and any address in the
APPROVERS variable (comma separated). A reply counts only if it comes from one of those addresses AND either
it is a true reply (In-Reply-To names the request e-mail) or the mailbox's Authentication-Results header
shows the sender passed DKIM or SPF. A request's e-mail is never deleted or marked.

The repository is public, so `pending` holds only what an approval needs (phone numbers stay in the e-mail)
and assets/auth.js holds salted fingerprints, never passwords. Passwords exist only in the e-mail sent to the
requester, which this script does not keep.

Environment: MAIL_PASSWORD (required), MAIL_USER (default mml@bpropms.in), MAIL_HOST (IMAP, default
imap.hostinger.com), SMTP_HOST (default smtp.hostinger.com), MAIL_DAYS (default 60), APPROVERS,
HUB_URL (default https://mmlpbi.bpropms.in/), DRY_RUN=1 (print the mails instead of sending them).
Testing without a mailbox: --eml <folder> reads saved .eml files; --auth and --store point at copies.
"""
import argparse
import base64
import datetime as dt
import email
import email.utils
import hashlib
import html
import imaplib
import json
import os
import re
import secrets
import smtplib
import sys
from email.message import EmailMessage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, 'data', 'requests', 'inbox.json')
AUTH = os.path.join(ROOT, 'assets', 'auth.js')
CODE = re.compile(r'MGQ1\.([A-Za-z0-9_-]{20,})')
REF = re.compile(r'\b([AP]R-\d{8}-[0-9A-F]{4})\b')
COMMAND = re.compile(r'^\s*(approve|approved|decline|declined|reject|rejected)\b\s*(viewer|admin|superadmin)?\s*[.!]?\s*$', re.I)
KEEP = ('ref', 'kind', 'name', 'email', 'unit', 'scope', 'title', 'reason', 'at')
ROUNDS = 210000
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
MAIL_USER = os.environ.get('MAIL_USER', 'mml@bpropms.in')
HUB_URL = os.environ.get('HUB_URL', 'https://mmlpbi.bpropms.in/')
NOW = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


# ----- the account list (assets/auth.js)
LINE_RE = re.compile(r"\n[ \t]*\{ id: '([^']+)', name: (\"(?:[^\"\\]|\\.)*\"|'[^']*'), role: '([^']+)', salt: '([0-9a-f]+)', hash: '([0-9a-f]+)' \},")


class Accounts:
    def __init__(self, path):
        self.path = path
        self.src = open(path, encoding='utf-8').read()
        self.changed = False

    def find(self, uid):
        for m in LINE_RE.finditer(self.src):
            if m.group(1).lower() == uid.lower():
                return {'id': m.group(1), 'name': json.loads(m.group(2)) if m.group(2).startswith('"') else m.group(2)[1:-1], 'role': m.group(3)}
        return None

    def superadmins(self):
        return [m.group(1).lower() for m in LINE_RE.finditer(self.src) if m.group(3) == 'superadmin']

    @staticmethod
    def password():
        pick = lambda n: ''.join(secrets.choice(ALPHABET) for _ in range(n))
        return f'MG-{pick(4)}-{pick(4)}-{pick(4)}'

    def _line(self, uid, name, role, pw):
        salt = secrets.token_hex(16)
        h = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), ROUNDS, 32).hex()
        return f"    {{ id: '{uid}', name: {json.dumps(name, ensure_ascii=False)}, role: '{role}', salt: '{salt}', hash: '{h}' }},"

    def add(self, uid, name, role):
        """Adds an account (or replaces an existing one's password) and returns the new temporary password."""
        pw = self.password()
        line = self._line(uid, name, role, pw)
        existing = next((m for m in LINE_RE.finditer(self.src) if m.group(1).lower() == uid.lower()), None)
        if existing:
            self.src = self.src[:existing.start()] + '\n' + line + self.src[existing.end():]
        else:
            new, n = re.subn(r"\n(\s*\];\s*\n\s*const ROUNDS)", '\n' + line.replace('\\', '\\\\') + r'\n\1', self.src, count=1)
            if n != 1 or f"id: '{uid}'" not in new:
                raise SystemExit('could not place the account line; the layout of assets/auth.js has changed')
            self.src = new
        self.changed = True
        return pw

    def save(self):
        if self.changed:
            open(self.path, 'w', encoding='utf-8').write(self.src)


# ----- reading mail
def decode(code):
    pad = '=' * (-len(code) % 4)
    try:
        req = json.loads(base64.urlsafe_b64decode(code + pad).decode('utf-8'))
    except Exception:
        return None
    if not isinstance(req, dict) or req.get('kind') not in ('access', 'reset') or not req.get('email') or not req.get('ref'):
        return None
    out = {k: str(req[k])[:300] for k in KEEP if req.get(k)}
    out['email'] = out['email'].strip().lower()
    if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', out['email']):
        return None
    return out


def strip_html(s):
    s = re.sub(r'(?is)<(script|style).*?</\1>', ' ', s)
    s = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</tr>', '\n', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return html.unescape(s)


def text_of(msg):
    plain, rich = [], []
    for part in msg.walk():
        if part.get_filename():
            continue
        ct = part.get_content_type()
        if ct not in ('text/plain', 'text/html'):
            continue
        try:
            body = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', 'replace')
        except Exception:
            continue
        (plain if ct == 'text/plain' else rich).append(body)
    return '\n'.join(plain) if plain else strip_html('\n'.join(rich))


def first_line(text):
    """The first line the sender typed: quoted lines and the usual reply headers are skipped."""
    for ln in text.splitlines():
        s = ln.strip()
        if not s or s.startswith('>') or re.match(r'^(On .* wrote:|-{2,}|From:|Sent:|To:|Subject:)', s):
            continue
        return s
    return ''


def authenticated(msg):
    """True when the receiving server recorded a DKIM or SPF pass for the sender."""
    for h in msg.get_all('Authentication-Results', []) or []:
        if re.search(r'\b(dkim|spf)=pass\b', str(h), re.I):
            return True
    return False


def parse(msg):
    sender = email.utils.parseaddr(msg.get('From', ''))[1].lower()
    try:
        received = email.utils.parsedate_to_datetime(msg.get('Date', '')).astimezone(dt.timezone.utc).isoformat()
    except Exception:
        received = ''
    text = text_of(msg)
    subject = str(msg.get('Subject', ''))
    reqs, seen = [], set()
    for code in CODE.findall(text):
        r = decode(code)
        if r and r['ref'] not in seen:
            seen.add(r['ref'])
            r.update({'received': received, 'from': sender, 'mid': str(msg.get('Message-ID', '')).strip()})
            reqs.append(r)
    cmd = COMMAND.match(first_line(text))
    command = None
    if cmd:
        verb = cmd.group(1).lower()
        m = REF.search(subject) or REF.search(text)
        if m:
            command = {'ref': m.group(1), 'action': 'approve' if verb.startswith('approve') else 'decline', 'role': (cmd.group(2) or 'viewer').lower(),
                       'from': sender, 'in_reply_to': str(msg.get('In-Reply-To', '')).strip(), 'authenticated': authenticated(msg), 'received': received}
    return reqs, command


def sent_folders(box):
    """The mailbox's Sent folder(s): a reply the administrator sends from the mailbox lands there, not in INBOX."""
    ok, rows = box.list()
    found = []
    for row in (rows if ok == 'OK' else []):
        line = row.decode('utf-8', 'replace') if isinstance(row, bytes) else str(row)
        m = re.match(r'\((?P<flags>[^)]*)\) "?(?P<delim>[^" ]*)"? "?(?P<name>.+?)"?$', line)
        if not m:
            continue
        name = m.group('name').strip('"')
        if '\\Sent' in m.group('flags') or re.search(r'(^|[./])sent( items| mail)?$', name, re.I):
            found.append(name)
    return found


def from_mailbox(host, user, password, days):
    """Yields (message, sent_by_us) for every hub e-mail in INBOX and in the Sent folder(s)."""
    since = (dt.date.today() - dt.timedelta(days=days)).strftime('%d-%b-%Y')
    box = imaplib.IMAP4_SSL(host)
    box.login(user, password)
    for folder, ours in [('INBOX', False)] + [(f, True) for f in sent_folders(box)]:
        ok, _ = box.select(f'"{folder}"' if ' ' in folder else folder, readonly=True)
        if ok != 'OK':
            continue
        ok, data = box.search(None, 'SINCE', since, 'SUBJECT', '"Marikar hub"')
        for i in (data[0].split() if ok == 'OK' else []):
            ok, parts = box.fetch(i, '(BODY.PEEK[])')
            raw = next((p[1] for p in parts if isinstance(p, tuple)), None) if ok == 'OK' else None
            if raw:
                yield email.message_from_bytes(raw), ours
    box.logout()


def from_folder(folder):
    """Saved .eml files; a name starting with "sent-" stands for a message found in the Sent folder."""
    for name in sorted(os.listdir(folder)):
        if name.endswith('.eml'):
            with open(os.path.join(folder, name), 'rb') as f:
                yield email.message_from_bytes(f.read()), name.startswith('sent-')


# ----- sending mail
class Mailer:
    def __init__(self, host, user, password, dry):
        self.host, self.user, self.password, self.dry, self.sent = host, user, password, dry, 0

    def send(self, to, subject, body):
        msg = EmailMessage()
        msg['From'] = f'Marikar Group performance hub <{self.user}>'
        msg['To'] = to
        msg['Subject'] = subject
        msg.set_content(body)
        if self.dry:
            print(f'--- would send to {to}: {subject}\n{body}\n---')
        else:
            with smtplib.SMTP_SSL(self.host, 465, timeout=30) as s:
                s.login(self.user, self.password)
                s.send_message(msg)
        self.sent += 1


def welcome(name, uid, pw, reset=False):
    first = (name or '').split(' ')[0] or 'colleague'
    what = 'Your password has been reset.' if reset else 'Your access to the Marikar Group performance hub has been approved.'
    return (f'Dear {first},\n\n{what}\n\n'
            f'Address:   {HUB_URL}\nUser ID:   {uid}\nPassword:  {pw}\n\n'
            'This is a temporary password: sign in, then change it from the Settings page. Please do not forward this e-mail.\n'
            'The hub works best installed as an app: open the address on your phone or computer and accept the install invitation.\n\n'
            'Regards,\nMarikar Group performance hub\n(automated message from the hub mailbox; replies are read by the administrator)')


# ----- the run
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--eml', help='folder of .eml files to read instead of the mailbox')
    ap.add_argument('--store', default=STORE)
    ap.add_argument('--auth', default=AUTH)
    args = ap.parse_args()
    dry = os.environ.get('DRY_RUN') == '1'

    try:
        store = json.load(open(args.store, encoding='utf-8'))
    except (OSError, ValueError):
        store = {}
    pending = [p for p in store.get('pending', []) if isinstance(p, dict) and p.get('ref')]
    handled = store.get('handled', {}) if isinstance(store.get('handled'), dict) else {}
    accounts = Accounts(args.auth)
    approvers = set(accounts.superadmins()) | {MAIL_USER.lower()} | {a.strip().lower() for a in os.environ.get('APPROVERS', '').split(',') if a.strip()}

    if args.eml:
        messages = list(from_folder(args.eml))
        pw = os.environ.get('MAIL_PASSWORD', '')
    else:
        pw = os.environ.get('MAIL_PASSWORD', '')
        if not pw:
            sys.exit('MAIL_PASSWORD is not set: add the mailbox password as a repository secret named MAIL_PASSWORD')
        messages = list(from_mailbox(os.environ.get('MAIL_HOST', 'imap.hostinger.com'), MAIL_USER, pw, int(os.environ.get('MAIL_DAYS', '60'))))
    mailer = Mailer(os.environ.get('SMTP_HOST', 'smtp.hostinger.com'), MAIL_USER, pw, dry)

    # 1. new requests and commands
    known = {p['ref'] for p in pending} | set(handled)
    mids = {p.get('mid') for p in pending if p.get('mid')}
    commands, added, changed = [], [], False
    for msg, ours in messages:
        reqs, cmd = parse(msg)
        if cmd and ours:
            # sent from the mailbox itself: the administrator signed in to it, which is proof enough
            cmd['from'] = MAIL_USER.lower(); cmd['authenticated'] = True
        for r in reqs:
            if r['ref'] not in known:
                known.add(r['ref']); pending.append(r); added.append(r)
                if r.get('mid'):
                    mids.add(r['mid'])
            else:
                # listed by an earlier version without the e-mail's Message-ID: record it so a reply is recognised
                for p in pending:
                    if p['ref'] == r['ref'] and not p.get('mid') and r.get('mid'):
                        p['mid'] = r['mid']; mids.add(r['mid']); changed = True
        if cmd:
            commands.append(cmd)
    changed = changed or bool(added)

    def settle(req, status, **extra):
        nonlocal changed
        handled[req['ref']] = {'status': status, 'at': NOW, **extra}
        changed = True

    # 2. resets: settled at once, the new password goes only to the account's own address
    def recent_reset(addr):
        for h in handled.values():
            if h.get('status') == 'reset' and h.get('email') == addr:
                try:
                    if dt.datetime.fromisoformat(h['at']) > dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24):
                        return True
                except ValueError:
                    pass
        return False

    for req in [p for p in pending if p['kind'] == 'reset']:
        acct = accounts.find(req['email'])
        if acct and recent_reset(acct['id'].lower()):
            # one reset a day per address: a second request within the day is noted, not acted on, so nobody can
            # keep changing someone else's password from the sign-in page
            settle(req, 'throttled', by='automatic', email=acct['id'].lower())
            print(f"  reset {req['ref']} for {acct['id']}: already reset in the last 24 hours, skipped")
        elif acct:
            newpw = accounts.add(acct['id'], acct['name'], acct['role'])
            mailer.send(acct['id'], 'Marikar hub: your new password', welcome(acct['name'], acct['id'], newpw, reset=True))
            settle(req, 'reset', by='automatic', email=acct['id'].lower())
            print(f"  reset {req['ref']} for {acct['id']}: new password e-mailed")
        else:
            mailer.send(req['email'], 'Marikar hub: password reset request', f"A password reset was requested for {req['email']}, but no hub account uses this ID. To get access, open {HUB_URL} and choose Request access.\n\nIf you did not ask for this, you can ignore this e-mail.\n\nRegards,\nMarikar Group performance hub")
            settle(req, 'no-account', by='automatic')
            print(f"  reset {req['ref']}: no account for {req['email']}; told them how to request access")

    # 3. approvals and declines by reply
    for cmd in commands:
        req = next((p for p in pending if p['ref'] == cmd['ref'] and p['kind'] == 'access' and p['ref'] not in handled), None)
        if not req:
            continue
        ok_sender = cmd['from'] in approvers
        ok_proof = (cmd['in_reply_to'] and cmd['in_reply_to'] in mids) or cmd['authenticated']
        if not (ok_sender and ok_proof):
            print(f"  ignored '{cmd['action']}' for {cmd['ref']} from {cmd['from']}: {'not an approver' if not ok_sender else 'not a verified reply'}")
            continue
        if cmd['action'] == 'approve':
            role = cmd['role'] if cmd['role'] in ('viewer', 'admin', 'superadmin') else 'viewer'
            existed = accounts.find(req['email'])
            newpw = accounts.add(existed['id'] if existed else req['email'], existed['name'] if existed else req.get('name', req['email']), existed['role'] if existed else role)
            mailer.send(req['email'], 'Marikar hub: your access', welcome(req.get('name'), req['email'], newpw, reset=bool(existed)))
            settle(req, 'approved', by=cmd['from'], role=existed['role'] if existed else role)
            print(f"  approved {req['ref']} ({req['email']}, {existed['role'] if existed else role}) on {cmd['from']}'s reply; password e-mailed")
        else:
            mailer.send(req['email'], f"Marikar hub: access request {req['ref']}", f"Dear {(req.get('name') or 'colleague').split(' ')[0]},\n\nThank you for your request ({req['ref']}). We are not able to approve it at this time. If you believe this is a mistake, reply to this e-mail with your reporting manager copied.\n\nRegards,\nMarikar Group performance hub administrator")
            settle(req, 'declined', by=cmd['from'])
            print(f"  declined {req['ref']} ({req['email']}) on {cmd['from']}'s reply")
        # the same person sometimes sends twice: the other copies are settled with this one
        for twin in pending:
            if twin['kind'] == 'access' and twin['email'] == req['email'] and twin['ref'] not in handled:
                settle(twin, handled[req['ref']]['status'], by=cmd['from'], note=f"same address as {req['ref']}")

    pending = [p for p in pending if p['ref'] not in handled]
    pending.sort(key=lambda p: p.get('received') or p.get('at') or '')
    print(f"{len(messages)} e-mail(s) read, {len(added)} new request(s), {len(commands)} reply command(s), {mailer.sent} e-mail(s) sent, {len(pending)} waiting, {len(handled)} handled")
    for r in added:
        print(f"  + {r['ref']} {r['kind']} {r['email']}")
    if not changed:
        return
    os.makedirs(os.path.dirname(args.store), exist_ok=True)
    with open(args.store, 'w', encoding='utf-8') as f:
        json.dump({'updated': NOW, 'pending': pending, 'handled': handled}, f, ensure_ascii=False, indent=2); f.write('\n')
    accounts.save()


if __name__ == '__main__':
    main()
