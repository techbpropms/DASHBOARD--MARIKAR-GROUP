#!/usr/bin/env python3
"""The hub's mailbox clerk: reads mml@bpropms.in and settles access and password-reset requests on its own.

Every request from the sign-in page reaches the mailbox as an e-mail carrying a code that starts MGQ1.
(base64url JSON). This script, run by the "Mailbox requests" GitHub Action every few minutes, signs in to
the mailbox over IMAP and:

  1. lists every new access request in data/requests/inbox.json (`pending`), so Settings > People shows it;
  2. settles password-reset requests at once: if the ID has an account, a one-time link (24 hours, single use)
     is e-mailed to that ID; the person opens reset.html, chooses their own password, and the page sends the
     salted fingerprint back to the mailbox as a code starting MGP1., which this script writes to assets/auth.js
     (the "set-password" step). If the ID has no account, the address is told how to request access. Passwords
     never travel by e-mail. Approvals and administrator resets send the same link;
  3. acts on one-word replies from an approver: a reply to a request e-mail whose first line is
     "approve" (optionally "approve admin" / "approve superadmin") creates the account, writes it to
     assets/auth.js and e-mails the user ID and temporary password to the requester; "decline" sends a
     courteous refusal. Either way the request moves to `handled`.

  4. acts on account-management lines from a super admin or an admin: "role <user id> <viewer|admin|superadmin>",
     "remove <user id>", "reset <user id>", "add <user id> <Full name> [as admin] [for HONDA,AMZES]" and
     "divisions <user id> <all | HONDA,AMZES,...>" (which divisions a viewer may open; admins see all). The person
     concerned is told by e-mail; an admin may not touch super admin accounts or grant that role. Every change is
     logged in the store's `log`, which Settings > People shows. An approval may also name the divisions:
     "approve viewer for HONDA,AMZES"; otherwise the divisions ticked on the request form apply.

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
import urllib.parse
from email.message import EmailMessage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, 'data', 'requests', 'inbox.json')
AUTH = os.path.join(ROOT, 'assets', 'auth.js')
SETPW = re.compile(r'MGP1\.([A-Za-z0-9_-]{40,})')
FEEDBACK = re.compile(r'MGF1\.([A-Za-z0-9_-]{20,})')
FB_QUESTIONS = {'q1': 'Signing in and resetting the password', 'q2': 'Figures correct and current', 'q2t': 'Which figure / month', 'q3': 'Clarity of reports and charts', 'q4': 'Speed and ease on the phone', 'q5': 'Looked for first', 'q6': 'Missing every month', 'q7': 'Would help most (top three)', 'q8': 'Other suggestion'}
LINK_HOURS = 24
CODE = re.compile(r'MGQ1\.([A-Za-z0-9_-]{20,})')
REF = re.compile(r'\b([AP]R-\d{8}-[0-9A-F]{4})\b')
COMMAND = re.compile(r'^\W*(approve|approved|ok|okay|yes|decline|declined|reject|rejected)\b(?P<rest>.*)$', re.I)
ROLE = re.compile(r'\b(viewer|admin|superadmin|super admin)\b', re.I)
MGMT = re.compile(r'^\W*(role|remove|reset|add|divisions?)\s+<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?\s*(.*?)\s*$', re.I)
KEEP = ('ref', 'kind', 'name', 'email', 'unit', 'scope', 'title', 'reason', 'at', 'divisions')
# Division keys an account can be limited to; read from data/divisions.json when it is there (keep both in step).
DIV_KEYS = ['GROUP', 'HONDA', 'AMZES', 'BIGWING', 'RE', 'NISSAN', 'CSPW', 'CANON', 'HR']
try:
    DIV_KEYS = [d['key'] for d in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'divisions.json'), encoding='utf-8'))['divisions']] or DIV_KEYS
except (OSError, ValueError, KeyError, TypeError):
    pass


def parse_divs(text, default=None):
    """'all', a list of known division keys named in the text (after 'for' if present), or `default` if none."""
    if isinstance(text, list):
        text = ' '.join(str(t) for t in text)
    t = str(text or '')
    m = re.search(r'\bfor\b(.*)$', t, re.I)
    if m:
        t = m.group(1)
    toks = [w.upper() for w in re.split(r'[\s,;/]+', t) if w]
    if 'ALL' in toks:
        return 'all'
    keys = [k for k in toks if k in DIV_KEYS]
    return list(dict.fromkeys(keys)) if keys else default


def divs_text(d):
    return 'all divisions' if d == 'all' else ', '.join(d) if d else 'no divisions'
ROUNDS = 210000
ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # the typed reset code: no 0/O, 1/I/L confusion
MAIL_USER = os.environ.get('MAIL_USER', 'mml@bpropms.in')
HUB_URL = os.environ.get('HUB_URL', 'https://mmlpbi.bpropms.in/')
NOW = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def mask(addr):
    """An address as the run log shows it (the log of a public repository is public): first letter and domain."""
    a = str(addr or '')
    return (a[0] + '…@' + a.split('@', 1)[1]) if '@' in a else a


# ----- the account list (assets/auth.js)
LINE_RE = re.compile(r"\n[ \t]*\{ id: '([^']+)', name: (\"(?:[^\"\\]|\\.)*\"|'[^']*'), role: '([^']+)', salt: '([0-9a-f]+)', hash: '([0-9a-f]+)'(?:, divisions: (\[[^\]\n]*\]|'all'))? \},")


class Accounts:
    def __init__(self, path):
        self.path = path
        self.src = open(path, encoding='utf-8').read()
        self.changed = False

    def find(self, uid):
        for m in LINE_RE.finditer(self.src):
            if m.group(1).lower() == uid.lower():
                return {'id': m.group(1), 'name': json.loads(m.group(2)) if m.group(2).startswith('"') else m.group(2)[1:-1], 'role': m.group(3),
                        'divisions': self._divs(m.group(6)) if m.group(3) == 'viewer' else 'all'}
        return None

    def list(self):
        """Every account: id, name, role, divisions."""
        return [{'id': m.group(1), 'name': json.loads(m.group(2)) if m.group(2).startswith('"') else m.group(2)[1:-1], 'role': m.group(3),
                 'divisions': self._divs(m.group(6)) if m.group(3) == 'viewer' else 'all'} for m in LINE_RE.finditer(self.src)]

    @staticmethod
    def _divs(field):
        if not field or field == "'all'":
            return 'all'
        return [k.strip().strip("'\"").upper() for k in field.strip('[]').split(',') if k.strip()]

    def set_secret(self, uid, salt, h):
        m = next((m for m in LINE_RE.finditer(self.src) if m.group(1).lower() == uid.lower()), None)
        if not m:
            return False
        line = self.src[m.start():m.end()]
        line = line.replace(f"salt: '{m.group(4)}', hash: '{m.group(5)}'", f"salt: '{salt}', hash: '{h}'", 1)
        self.src = self.src[:m.start()] + line + self.src[m.end():]
        self.changed = True
        return True

    def set_divisions(self, uid, divs):
        m = next((m for m in LINE_RE.finditer(self.src) if m.group(1).lower() == uid.lower()), None)
        if not m:
            return False
        line = self.src[m.start():m.end()]
        line = re.sub(r", divisions: (\[[^\]\n]*\]|'all')", '', line, count=1)
        if divs != 'all':
            line = line.replace(" },", f", divisions: [{', '.join(repr(k) for k in divs)}] }},", 1)
        self.src = self.src[:m.start()] + line + self.src[m.end():]
        self.changed = True
        return True

    def superadmins(self):
        return [m.group(1).lower() for m in LINE_RE.finditer(self.src) if m.group(3) == 'superadmin']

    def admins(self):
        return [m.group(1).lower() for m in LINE_RE.finditer(self.src) if m.group(3) == 'admin']

    def set_role(self, uid, role):
        m = next((m for m in LINE_RE.finditer(self.src) if m.group(1).lower() == uid.lower()), None)
        if not m:
            return False
        line = self.src[m.start():m.end()]
        self.src = self.src[:m.start()] + line.replace(f"role: '{m.group(3)}'", f"role: '{role}'", 1) + self.src[m.end():]
        self.changed = True
        return True

    def remove(self, uid):
        m = next((m for m in LINE_RE.finditer(self.src) if m.group(1).lower() == uid.lower()), None)
        if not m:
            return False
        self.src = self.src[:m.start()] + self.src[m.end():]
        self.changed = True
        return True

    @staticmethod
    def password():
        pick = lambda n: ''.join(secrets.choice(ALPHABET) for _ in range(n))
        return f'MG-{pick(4)}-{pick(4)}-{pick(4)}'

    def _line(self, uid, name, role, pw, divs='all'):
        salt = secrets.token_hex(16)
        h = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), ROUNDS, 32).hex()
        extra = '' if divs == 'all' or role != 'viewer' else f", divisions: [{', '.join(repr(k) for k in divs)}]"
        return f"    {{ id: '{uid}', name: {json.dumps(name, ensure_ascii=False)}, role: '{role}', salt: '{salt}', hash: '{h}'{extra} }},"

    def add(self, uid, name, role, divs='all'):
        """Adds an account (or replaces an existing one's password, keeping its divisions) and returns the new temporary password."""
        pw = self.password()
        line = self._line(uid, name, role, pw, divs)
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
    out = {k: str(req[k])[:300] for k in KEEP if req.get(k) and k != 'divisions'}
    if req.get('divisions'):
        out['divisions'] = parse_divs(req['divisions'] if isinstance(req['divisions'], list) else str(req['divisions']), 'all')
    out['email'] = out['email'].strip().lower()
    if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', out['email']):
        return None
    return out


def decode_setpw(code):
    pad = '=' * (-len(code) % 4)
    try:
        d = json.loads(base64.urlsafe_b64decode(code + pad).decode('utf-8'))
    except Exception:
        return None
    if not isinstance(d, dict) or d.get('kind') != 'setpw':
        return None
    uid = str(d.get('id', '')).strip().lower(); token = str(d.get('token', '')); salt = str(d.get('salt', '')); h = str(d.get('hash', ''))
    if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', uid) or not re.fullmatch(r'[0-9a-f]{32}', salt) or not re.fullmatch(r'[0-9a-f]{64}', h) or not re.fullmatch(r'[A-Za-z0-9_-]{8,}', token):
        return None
    return {'id': uid, 'token': token, 'salt': salt, 'hash': h, 'at': str(d.get('at', ''))[:40], 'ref': str(d.get('ref', ''))[:40]}


def decode_feedback(code):
    """A code from feedback.html (MGF1.): who answered and the answers, every value trimmed to a safe length."""
    pad = '=' * (-len(code) % 4)
    try:
        d = json.loads(base64.urlsafe_b64decode(code + pad).decode('utf-8'))
    except Exception:
        return None
    if not isinstance(d, dict) or d.get('kind') != 'feedback' or not isinstance(d.get('a'), dict):
        return None
    uid = str(d.get('id', '')).strip().lower()
    if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', uid) or not re.fullmatch(r'FB-\d{8}-[0-9A-F]{4}', str(d.get('ref', ''))):
        return None
    a = {}
    for k in FB_QUESTIONS:
        v = d['a'].get(k)
        if k == 'q7':
            a[k] = [str(x)[:60] for x in v][:3] if isinstance(v, list) else []
        else:
            a[k] = str(v or '')[:600].strip()
    return {'ref': d['ref'], 'id': uid, 'name': str(d.get('name', ''))[:80].strip(), 'at': str(d.get('at', ''))[:40], 'a': a}


def feedback_text(fb):
    lines = [f"Feedback {fb['ref']} from {fb['name'] or '-'} ({fb['id']}), {fb['at'][:16].replace('T', ' ')} UTC", '']
    for k, label in FB_QUESTIONS.items():
        v = fb['a'].get(k)
        v = ', '.join(v) if isinstance(v, list) else v
        if v:
            lines.append(f"{label}: {v}")
    return '\n'.join(lines)


def feedback_thanks(fb):
    first = (fb.get('name') or '').split(' ')[0] or 'colleague'
    return (f"Dear {first},\n\nThank you for your feedback on the Marikar Group performance hub (reference {fb['ref']}). "
            "It has reached Dr. Babu B and the hub team, and goes into the review that decides the next release.\n\n"
            "If you asked for a correction to a figure or to your divisions, it will be looked at and you will hear back by e-mail. "
            "Further suggestions are welcome at any time: simply reply to this e-mail.\n\n"
            "With warm regards,\nDr. Babu B\nCo-founder, BPro Consulting & Technologies\nwww.bpropms.com · www.drbabu.in\n\n"
            "Marikar Group performance hub · " + HUB_URL)


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


def typed_lines(text, n=5):
    """The first few lines the sender typed: quoted lines and the usual reply or forward headers are skipped, and
    reading stops at the start of a quoted or forwarded message."""
    out = []
    for ln in text.splitlines():
        s = ln.strip()
        if re.match(r'^(On .* wrote:?)$', s, re.I) or s.startswith('>'):
            break                      # the quoted original follows
        if not s or re.match(r'^(-{2,}.*Forwarded message.*|Begin forwarded message.*|-{5,}|_{5,}|(From|Sent|To|Cc|Date|Subject):.*)$', s, re.I):
            continue                   # forwarding headers: the forwarded reply's own text comes after them
        out.append(s)
        if len(out) >= n:
            break
    return out


def first_line(text):
    lines = typed_lines(text, 1)
    return lines[0] if lines else ''


def command_in(text):
    """The first typed line that starts with a command word, with the role it names (default viewer)."""
    for s in typed_lines(text):
        m = COMMAND.match(s)
        if m:
            verb = m.group(1).lower()
            role = (ROLE.search(m.group('rest')) or ROLE.search(s))
            role = role.group(1).lower().replace(' ', '') if role else 'viewer'
            fm = re.search(r'\bfor\b(.*)$', m.group('rest'), re.I)
            return ('approve' if verb in ('approve', 'approved', 'ok', 'okay', 'yes') else 'decline'), role, (parse_divs(fm.group(1)) if fm else None)
    return None


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
    setpw = [d for d in (decode_setpw(c) for c in SETPW.findall(text)) if d]
    for code in CODE.findall(text):
        r = decode(code)
        if r and r['ref'] not in seen:
            seen.add(r['ref'])
            r.update({'received': received, 'from': sender, 'mid': str(msg.get('Message-ID', '')).strip()})
            reqs.append(r)
    # A command word in the subject or the first typed lines applies to every request reference the e-mail names
    # (a reply's subject names one; a composed e-mail can list several in its body).
    cmd = command_in(re.sub(r'^\s*(re|fwd?|fw):\s*', '', subject, flags=re.I)) or command_in(text)
    commands = []
    if cmd:
        refs = []
        for r in REF.findall(subject) + REF.findall('\n'.join(typed_lines(text, 20))):
            if r not in refs:
                refs.append(r)
        if not refs:
            m = REF.search(text)
            refs = [m.group(1)] if m else []
        for r in refs:
            commands.append({'ref': r, 'action': cmd[0], 'role': cmd[1], 'divisions': cmd[2], 'from': sender, 'in_reply_to': str(msg.get('In-Reply-To', '')).strip(),
                             'authenticated': authenticated(msg), 'received': received})
    # account-management lines: "role x@y admin", "remove x@y", "reset x@y", "add x@y Full Name as admin"
    mgmt = []
    for line in typed_lines(text, 40):
        m = MGMT.match(line)
        if m:
            mgmt.append({'action': m.group(1).lower(), 'target': m.group(2).lower(), 'arg': m.group(3), 'from': sender,
                         'authenticated': authenticated(msg), 'received': received})
    return reqs, commands, mgmt, setpw


def folders(box):
    """Every selectable folder as (name, is_sent). A reply the administrator sends from the mailbox lands in Sent,
    a forwarded approval may be filed under spam or junk, so the clerk reads them all (Trash excepted)."""
    ok, rows = box.list()
    out = []
    for row in (rows if ok == 'OK' else []):
        line = row.decode('utf-8', 'replace') if isinstance(row, bytes) else str(row)
        m = re.match(r'\((?P<flags>[^)]*)\) "?(?P<delim>[^" ]*)"? "?(?P<name>.+?)"?$', line)
        if not m:
            continue
        name, flags = m.group('name').strip('"'), m.group('flags')
        if '\\Noselect' in flags or '\\Trash' in flags or re.search(r'(^|[./])(trash|deleted( items| messages)?)$', name, re.I):
            continue
        is_sent = '\\Sent' in flags or bool(re.search(r'(^|[./])sent( items| mail)?$', name, re.I))
        out.append((name, is_sent))
    out.sort(key=lambda f: (f[0].upper() != 'INBOX', f[0]))
    return out


def from_mailbox(host, user, password, days):
    """Yields (message, sent_by_us) for every e-mail of the last `days` days in every folder; the caller decides
    which ones concern the hub (a request code, or a command naming a request)."""
    since = (dt.date.today() - dt.timedelta(days=days)).strftime('%d-%b-%Y')
    box = imaplib.IMAP4_SSL(host)
    box.login(user, password)
    all_folders = folders(box)
    print('folders read: ' + ', '.join(f"{n}{' (sent)' if s_ else ''}" for n, s_ in all_folders))
    for folder, ours in all_folders:
        ok, _ = box.select(f'"{folder}"', readonly=True)
        if ok != 'OK':
            print(f"  {folder}: could not open")
            continue
        ok, data = box.search(None, 'SINCE', since)
        ids = data[0].split() if ok == 'OK' else []
        print(f"  {folder}: {len(ids)} e-mail(s) since {since}")
        for i in ids:
            ok, parts = box.fetch(i, '(BODY.PEEK[])')
            raw = next((p[1] for p in parts if isinstance(p, tuple)), None) if ok == 'OK' else None
            if raw:
                yield email.message_from_bytes(raw), ours
    box.logout()


def from_submissions(path):
    """Codes submitted on the hub itself (reset.html and the sign-in page post them to /submit on the VPS, nginx
    writes one JSON line each). Each becomes a message with no sender, so only requests and set-password codes
    count; approvals and management lines need a verified sender and are never read from here."""
    try:
        lines = open(path, encoding='utf-8', errors='replace').read().splitlines()
    except OSError:
        return
    for line in lines:
        try:
            o = json.loads(line)
        except ValueError:
            continue
        code = urllib.parse.unquote(str(o.get('code', '')).replace('+', ' ')).strip()
        if not code:
            continue
        msg = EmailMessage()
        msg['From'] = 'hub-submission@localhost'
        msg['Subject'] = 'Submitted on the hub'
        msg['Date'] = email.utils.format_datetime(dt.datetime.fromisoformat(o['at'])) if o.get('at') else email.utils.formatdate()
        msg.set_content(code)
        yield msg, False


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


def acknowledgement(req):
    first = (req.get('name') or '').split(' ')[0] or 'colleague'
    return (f'Dear {first},\n\nYour request for access to the Marikar Group performance hub has been received.\n\n'
            f'Reference: {req["ref"]}\nUser ID:   {req["email"]}\n\n'
            'The administrator reviews every request. Once it is approved you will receive a separate e-mail from this address with your '
            'user ID and a link to choose your password; most requests are answered within one working day. If you need to follow up, quote the reference.\n\n'
            'Regards,\nMarikar Group performance hub\n(automated message from the hub mailbox; replies are read by the administrator)')


def reminder(waiting, approvers_to):
    lines = [f"  {p['ref']}  {p.get('name') or p['email']}  ({p['email']}; {p.get('unit') or '-'}; {p.get('scope') or '-'})" for p in waiting]
    return ('The following access requests are waiting for a decision:\n\n' + '\n'.join(lines) +
            f'\n\nTo approve, send an e-mail to {MAIL_USER} with the subject "approve" and the reference(s) in the body '
            '(add "admin" after approve for an admin account, or "for HONDA,AMZES" to limit a viewer to those divisions; '
            'otherwise the divisions ticked on the request apply). To refuse, use "decline" the same way. '
            f'The list is also on the People page of {HUB_URL}settings.html.\n\nMarikar Group performance hub')


def link_mail(name, uid, url, why, divs='all', code=''):
    """The one-time permission to choose a password (a link, and the same as a code to type on the sign-in page): for a
    new account, a reset the person asked for, or an administrator's reset."""
    first = (name or '').split(' ')[0] or 'colleague'
    what = {'approved': 'Your access to the Marikar Group performance hub has been approved. Choose your password now.',
            'forgot': 'You asked for a new password on the Marikar Group performance hub. Choose it now.',
            'admin': 'The administrator has reset your password on the Marikar Group performance hub. Choose a new one now.'}[why]
    scope = '' if divs == 'all' else f'Divisions: {divs_text(divs)}\n'
    how = (f'Either way works:\n\n  1. On the sign-in page ({HUB_URL}) press "Forgot password?", enter your user ID and this code with your new password:\n\n     {code}\n\n  2. Or open this link and choose the password there:\n\n     {url}\n\n' if code
           else f'{url}\n\n')
    return (f'Dear {first},\n\n{what}\n\n{how}'
            f'User ID:   {uid}\n{scope}'
            f'The code and the link work once and expire in {LINK_HOURS} hours. If you did not ask for this, ignore this e-mail; your password stays as it is.\n'
            'Your new password is live within a minute of being set; the page tells you, and the hub confirms by e-mail.\n\n'
            'Regards,\nMarikar Group performance hub\n(automated message from the hub mailbox; replies are read by the administrator)')


def password_set_mail(name, uid):
    first = (name or '').split(' ')[0] or 'colleague'
    return (f'Dear {first},\n\nYour new password on the Marikar Group performance hub is live. Sign in at {HUB_URL} with your user ID {uid}.\n\n'
            'Every earlier sign-in on other devices has been ended. If you did not set this password, write to the administrator at once.\n\n'
            'Regards,\nMarikar Group performance hub')


# ----- the run
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--eml', help='folder of .eml files to read instead of the mailbox')
    ap.add_argument('--submissions', help='JSON-lines file of codes submitted on the hub itself (fetched from the VPS)')
    ap.add_argument('--store', default=STORE)
    ap.add_argument('--auth', default=AUTH)
    ap.add_argument('--results', help='file the pages read to show the outcome of a submission by its reference (results.json on the VPS)')
    args = ap.parse_args()
    dry = os.environ.get('DRY_RUN') == '1'

    try:
        store = json.load(open(args.store, encoding='utf-8'))
    except (OSError, ValueError):
        store = {}
    pending = [p for p in store.get('pending', []) if isinstance(p, dict) and p.get('ref')]
    handled = store.get('handled', {}) if isinstance(store.get('handled'), dict) else {}
    # one-time set-password links: id -> {hash of the token, expiry, why}; only the hash is kept, so the public file is harmless
    links = store.get('links', {}) if isinstance(store.get('links'), dict) else {}
    accounts = Accounts(args.auth)
    # outcomes by reference, for the page that submitted: {ref: {ok, msg, at}}; references are random, no personal data
    results = {}
    if args.results:
        try:
            results = json.load(open(args.results, encoding='utf-8'))
        except (OSError, ValueError):
            results = {}

    def result(ref, ok, msg):
        if ref and ref not in results:   # the first outcome stands: a code re-read on a later run is not judged again
            results[ref] = {'ok': ok, 'msg': msg, 'at': NOW}
    approvers = set(accounts.superadmins()) | {MAIL_USER.lower()} | {a.strip().lower() for a in os.environ.get('APPROVERS', '').split(',') if a.strip()}

    if args.eml:
        messages = list(from_folder(args.eml))
        pw = os.environ.get('MAIL_PASSWORD', '')
    else:
        pw = os.environ.get('MAIL_PASSWORD', '')
        if not pw:
            sys.exit('MAIL_PASSWORD is not set: add the mailbox password as a repository secret named MAIL_PASSWORD')
        messages = list(from_mailbox(os.environ.get('MAIL_HOST', 'imap.hostinger.com'), MAIL_USER, pw, int(os.environ.get('MAIL_DAYS', '60'))))
    if args.submissions:
        subs = list(from_submissions(args.submissions))
        print(f"submissions made on the hub: {len(subs)}")
        messages.extend(subs)
    mailer = Mailer(os.environ.get('SMTP_HOST', 'smtp.hostinger.com'), MAIL_USER, pw, dry)

    # 1. new requests and commands
    known = {p['ref'] for p in pending} | set(handled)
    mids = {p.get('mid') for p in pending if p.get('mid')}
    commands, management, setpws, added, changed = [], [], [], [], False
    log = [e for e in store.get('log', []) if isinstance(e, dict)] if isinstance(store.get('log'), list) else []

    def note(action, who, by, detail=''):
        nonlocal changed
        log.append({'at': NOW, 'action': action, 'who': who, 'by': by, 'detail': detail}); changed = True
    from_approvers = hub_mails = 0
    feedback = [f for f in store.get('feedback', []) if isinstance(f, dict) and f.get('ref')] if isinstance(store.get('feedback'), list) else []
    new_feedback = []
    for msg, ours in messages:
        reqs, cmds, mg, spw = parse(msg)
        setpws.extend(spw)
        fb_here = False
        for m in FEEDBACK.finditer(text_of(msg)):
            fb = decode_feedback(m.group(1))
            if fb:
                fb_here = True
                if fb['ref'] not in {f['ref'] for f in feedback + new_feedback}:
                    new_feedback.append(fb)
        if email.utils.parseaddr(msg.get('From', ''))[1].lower() in approvers | set(accounts.admins()):
            from_approvers += 1
            # what the approver's e-mail looked like to the clerk (first typed line only, shortened)
            print(f"  approver e-mail: {len(cmds)} reference(s) with a command, {len(mg)} management line(s), first line {first_line(text_of(msg))[:40]!r}")
        if reqs or cmds or mg or spw or fb_here:
            hub_mails += 1
        else:
            # a mail the clerk cannot act on (no request code, no command): named here, masked, so an access request
            # written in plain words is noticed by the administrator rather than lost
            subj = re.sub(r'\s+', ' ', str(msg.get('Subject', '')))[:60]
            print(f"  not actionable: from {mask(email.utils.parseaddr(msg.get('From', ''))[1])}, subject {subj!r}, first line {first_line(text_of(msg))[:50]!r}")
        if ours:
            for cmd in cmds + mg:
                # sent from the mailbox itself: the administrator signed in to it, which is proof enough
                cmd['from'] = MAIL_USER.lower(); cmd['authenticated'] = True
        management.extend(mg)
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
        commands.extend(cmds)
    changed = changed or bool(added)

    def settle(req, status, **extra):
        nonlocal changed
        handled[req['ref']] = {'status': status, 'at': NOW, **extra}
        changed = True

    def issue_link(acct, why, ref=None):
        """E-mails a one-time set-password link to the account's own address and remembers the token's hash."""
        nonlocal changed
        token = secrets.token_urlsafe(24)
        # the same permission as a short code to type on the sign-in page (no need to open the link on the same device)
        code = ''.join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        exp = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=LINK_HOURS)).isoformat(timespec='seconds')
        links[acct['id'].lower()] = {'hash': hashlib.sha256(token.encode()).hexdigest(), 'code': hashlib.sha256(code.encode()).hexdigest(), 'exp': exp, 'why': why, 'ref': ref or '', 'at': NOW}
        url = f"{HUB_URL}reset.html#u={urllib.parse.quote(acct['id'].lower())}&t={token}"
        subject = {'approved': 'Marikar hub: your access', 'forgot': 'Marikar hub: choose a new password', 'admin': 'Marikar hub: your password was reset'}[why]
        mailer.send(acct['id'], subject, link_mail(acct['name'], acct['id'], url, why, acct.get('divisions', 'all'), f"{code[:4]}-{code[4:]}"))
        changed = True

    def links_today(addr):
        n = 0
        for h in handled.values():
            if h.get('status') in ('reset', 'link') and h.get('email') == addr:
                try:
                    if dt.datetime.fromisoformat(h['at']) > dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24):
                        n += 1
                except ValueError:
                    pass
        return n

    # 1b. passwords chosen through a link: the token must match an unexpired link for that account
    for d in setpws:
        link = links.get(d['id'])
        typed = hashlib.sha256(d['token'].upper().replace('-', '').encode()).hexdigest()   # the code typed on the sign-in page
        if not link:
            result(d['ref'], False, 'No code is open for this account: the code was already used, or it has expired. Press "Send me a new code".')
            print(f"  ignored a set-password code for {mask(d['id'])}: no matching link (already used, or not issued)"); continue
        if link['hash'] != hashlib.sha256(d['token'].encode()).hexdigest() and link.get('code') != typed:
            result(d['ref'], False, 'That code does not match the latest one sent. Each new code replaces the earlier ones: use the code in your most recent e-mail, or press "Send me a new code".')
            print(f"  ignored a set-password code for {mask(d['id'])}: not the latest code"); continue
        try:
            expired = dt.datetime.fromisoformat(link['exp']) < dt.datetime.now(dt.timezone.utc)
        except ValueError:
            expired = True
        if expired:
            del links[d['id']]; changed = True
            result(d['ref'], False, 'That code has expired (codes last 24 hours). Press "Send me a new code".')
            print(f"  ignored a set-password code for {mask(d['id'])}: link expired"); continue
        acct = accounts.find(d['id'])
        if not acct:
            del links[d['id']]; changed = True
            print(f"  ignored a set-password code for {mask(d['id'])}: no such account"); continue
        accounts.set_secret(acct['id'], d['salt'], d['hash'])
        result(d['ref'], True, 'Your password is live.')
        del links[d['id']]; changed = True
        mailer.send(acct['id'], 'Marikar hub: your password is live', password_set_mail(acct['name'], acct['id']))
        note('password', acct['id'].lower(), 'the account owner, by link', link.get('why', ''))
        print(f"  password set for {mask(acct['id'])} through the {link.get('why', '')} link; confirmation e-mailed")

    # 2. resets: settled at once, the new password goes only to the account's own address
    for req in [p for p in pending if p['kind'] == 'reset']:
        acct = accounts.find(req['email'])
        if acct and links_today(acct['id'].lower()) >= 3:
            # three links a day per address: the link only ever goes to the account's own address, so this is a
            # cap on nuisance mail, not a security boundary
            settle(req, 'throttled', by='automatic', email=acct['id'].lower())
            result(req['ref'], False, 'Three codes were already sent to this address in the last 24 hours. Use the code in the most recent e-mail, or try again tomorrow.')
            print(f"  reset {req['ref']} for {mask(acct['id'])}: three links already sent in the last 24 hours, skipped")
        elif acct:
            issue_link(acct, 'forgot', req['ref'])
            result(req['ref'], True, 'A code is on its way to your mailbox.')
            settle(req, 'link', by='automatic', email=acct['id'].lower()); note('reset link', acct['id'].lower(), 'forgot password', req['ref'])
            print(f"  reset {req['ref']} for {mask(acct['id'])}: set-password link e-mailed")
        else:
            mailer.send(req['email'], 'Marikar hub: password reset request', f"A password reset was requested for {req['email']}, but no hub account uses this ID. To get access, open {HUB_URL} and choose Request access.\n\nIf you did not ask for this, you can ignore this e-mail.\n\nRegards,\nMarikar Group performance hub")
            settle(req, 'no-account', by='automatic')
            result(req['ref'], False, 'No account uses this user ID. Check the spelling, or use Request access.')
            print(f"  reset {req['ref']}: no account for {mask(req['email'])}; told them how to request access")

    # 3. approvals and declines by reply
    for cmd in commands:
        req = next((p for p in pending if p['ref'] == cmd['ref'] and p['kind'] == 'access' and p['ref'] not in handled), None)
        if not req:
            continue
        ok_sender = cmd['from'] in approvers
        ok_proof = (cmd['in_reply_to'] and cmd['in_reply_to'] in mids) or cmd['authenticated']
        if not (ok_sender and ok_proof):
            print(f"  ignored '{cmd['action']}' for {cmd['ref']} from {mask(cmd['from'])}: {'not an approver' if not ok_sender else 'not a verified reply'}")
            continue
        if cmd['action'] == 'approve':
            role = cmd['role'] if cmd['role'] in ('viewer', 'admin', 'superadmin') else 'viewer'
            # the divisions: named in the reply ("approve viewer for HONDA,AMZES"), else ticked on the request form
            divs = 'all' if role != 'viewer' else (cmd.get('divisions') or req.get('divisions') or 'all')
            existed = accounts.find(req['email'])
            if existed:
                role, divs = existed['role'], existed['divisions']
            accounts.add(existed['id'] if existed else req['email'], existed['name'] if existed else req.get('name', req['email']), role, divs)   # secret discarded: the link sets it
            issue_link({'id': existed['id'] if existed else req['email'], 'name': existed['name'] if existed else req.get('name', req['email']), 'divisions': divs}, 'approved', req['ref'])
            settle(req, 'approved', by=cmd['from'], role=role, divisions=divs); note('approved', req['email'], cmd['from'], f"{req['ref']} as {role} ({divs_text(divs)})")
            print(f"  approved {req['ref']} ({mask(req['email'])}, {role}, {divs_text(divs)}) on {mask(cmd['from'])}'s reply; set-password link e-mailed")
        else:
            mailer.send(req['email'], f"Marikar hub: access request {req['ref']}", f"Dear {(req.get('name') or 'colleague').split(' ')[0]},\n\nThank you for your request ({req['ref']}). We are not able to approve it at this time. If you believe this is a mistake, reply to this e-mail with your reporting manager copied.\n\nRegards,\nMarikar Group performance hub administrator")
            settle(req, 'declined', by=cmd['from']); note('declined', req['email'], cmd['from'], req['ref'])
            print(f"  declined {req['ref']} ({mask(req['email'])}) on {mask(cmd['from'])}'s reply")
        # the same person sometimes sends twice: the other copies are settled with this one
        for twin in pending:
            if twin['kind'] == 'access' and twin['email'] == req['email'] and twin['ref'] not in handled:
                settle(twin, handled[req['ref']]['status'], by=cmd['from'], note=f"same address as {req['ref']}")

    # 3b. an administrator's immediate reset (the RESET_NOW input of the workflow): no guard, settled at once
    forced = os.environ.get('RESET_NOW', '').strip().lower()
    if forced:
        acct = accounts.find(forced)
        if acct:
            ref = f"PR-{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(2).upper()}"
            issue_link(acct, 'admin', ref)
            handled[ref] = {'status': 'link', 'at': NOW, 'by': 'administrator', 'email': acct['id'].lower()}; changed = True; note('reset link', acct['id'].lower(), 'administrator (Actions tab)', ref)
            print(f"  reset {ref} for {mask(acct['id'])} on the administrator's instruction: set-password link e-mailed")
        else:
            print(f"  reset requested for {mask(forced)}: no such account")

    # 3c. account management by e-mail: super admins and the mailbox may do anything; an admin may not touch a super
    #     admin account or grant that role. A line is acted on once (same action, target and sender are skipped).
    ROLES = ('viewer', 'admin', 'superadmin')
    done_keys = {(e.get('action'), e.get('who'), e.get('by'), e.get('detail')) for e in log}
    admin_senders = set(accounts.admins())
    for m in management:
        sender, target, act = m['from'], m['target'], m['action']
        full = sender in approvers
        limited = sender in admin_senders and not full
        if not (full or limited):
            print(f"  ignored '{act} {mask(target)}' from {mask(sender)}: not an administrator"); continue
        if not m['authenticated']:
            print(f"  ignored '{act} {mask(target)}' from {mask(sender)}: sender not verified"); continue
        acct = accounts.find(target)
        arg = m['arg'].strip()
        if act == 'role':
            rm = ROLE.search(arg); role = rm.group(1).lower().replace(' ', '') if rm else ''
            if not acct or role not in ROLES:
                print(f"  ignored 'role {mask(target)}': {'no such account' if not acct else 'no such role'}"); continue
            if limited and (acct['role'] == 'superadmin' or role == 'superadmin'):
                print(f"  ignored 'role {mask(target)}' from {mask(sender)}: an admin cannot change super admin access"); continue
            if acct['role'] == role or ('role', target, sender, f"{acct['role']} -> {role}") in done_keys:
                continue
            accounts.set_role(acct['id'], role)
            mailer.send(acct['id'], 'Marikar hub: your access level', f"Dear {acct['name'].split(' ')[0]},\n\nYour access level on the Marikar Group performance hub is now: {role}. It applies from your next sign-in.\n\nRegards,\nMarikar Group performance hub")
            note('role', acct['id'].lower(), sender, f"{acct['role']} -> {role}")
            print(f"  role {mask(acct['id'])}: {acct['role']} -> {role} on {mask(sender)}'s instruction")
        elif act == 'remove':
            if not acct:
                print(f"  ignored 'remove {mask(target)}': no such account"); continue
            if limited and acct['role'] == 'superadmin':
                print(f"  ignored 'remove {mask(target)}' from {mask(sender)}: an admin cannot remove a super admin"); continue
            if acct['id'].lower() == sender or (acct['role'] == 'superadmin' and len(accounts.superadmins()) == 1):
                print(f"  ignored 'remove {mask(target)}': cannot remove yourself or the last super admin"); continue
            accounts.remove(acct['id'])
            mailer.send(acct['id'], 'Marikar hub: access removed', f"Dear {acct['name'].split(' ')[0]},\n\nYour account on the Marikar Group performance hub has been removed. If you believe this is a mistake, write to {MAIL_USER}.\n\nRegards,\nMarikar Group performance hub")
            note('removed', acct['id'].lower(), sender, acct['role'])
            print(f"  removed {mask(acct['id'])} on {mask(sender)}'s instruction")
        elif act == 'reset':
            if not acct:
                print(f"  ignored 'reset {mask(target)}': no such account"); continue
            if limited and acct['role'] == 'superadmin':
                print(f"  ignored 'reset {mask(target)}' from {mask(sender)}: an admin cannot reset a super admin"); continue
            key = ('reset link', acct['id'].lower(), sender, m['received'][:16])
            if key in done_keys:
                continue
            issue_link(acct, 'admin')
            note('reset link', acct['id'].lower(), sender, m['received'][:16])
            print(f"  reset {mask(acct['id'])} on {mask(sender)}'s instruction: set-password link e-mailed")
        elif act == 'add':
            fm = re.search(r'\s+for\s+([A-Za-z, /;]+)\s*$', arg, re.I)
            divs = parse_divs(fm.group(1), 'all') if fm else 'all'
            arg = arg[:fm.start()] if fm else arg
            rm = re.search(r'\s+as\s+(viewer|admin|superadmin|super admin)\s*$', arg, re.I)
            role = rm.group(1).lower().replace(' ', '') if rm else 'viewer'
            name = (arg[:rm.start()] if rm else arg).strip().strip('"\'') or target
            if acct:
                print(f"  ignored 'add {mask(target)}': account exists (use role or reset)"); continue
            if any(e.get('action') == 'added' and e.get('who') == target and e.get('by') == sender for e in log):
                continue   # this line was carried out before; the account has since been removed or re-created on purpose
            if limited and role == 'superadmin':
                print(f"  ignored 'add {mask(target)}' from {mask(sender)}: an admin cannot create a super admin"); continue
            accounts.add(target, name, role, divs)
            issue_link({'id': target, 'name': name, 'divisions': divs}, 'approved')
            note('added', target, sender, f"{name} as {role} ({divs_text(divs)})")
            print(f"  added {mask(target)} as {role} ({divs_text(divs)}) on {mask(sender)}'s instruction; set-password link e-mailed")
        elif act in ('division', 'divisions'):
            divs = parse_divs(arg)
            if not acct or divs is None:
                print(f"  ignored 'divisions {mask(target)}': {'no such account' if not acct else 'no division named (use all, or keys such as HONDA,AMZES)'}"); continue
            if acct['role'] != 'viewer':
                print(f"  ignored 'divisions {mask(target)}': {acct['role']} accounts see all divisions"); continue
            if acct['divisions'] == divs or ('divisions', acct['id'].lower(), sender, f"{divs_text(acct['divisions'])} -> {divs_text(divs)}") in done_keys:
                continue
            accounts.set_divisions(acct['id'], divs)
            mailer.send(acct['id'], 'Marikar hub: your divisions', f"Dear {acct['name'].split(' ')[0]},\n\nYour access on the Marikar Group performance hub now covers: {divs_text(divs)}. It applies from your next sign-in.\n\nRegards,\nMarikar Group performance hub")
            note('divisions', acct['id'].lower(), sender, f"{divs_text(acct['divisions'])} -> {divs_text(divs)}")
            print(f"  divisions {mask(acct['id'])}: {divs_text(acct['divisions'])} -> {divs_text(divs)} on {mask(sender)}'s instruction")

    # 3c2. returned mail: when a link or notice could not be delivered, the failed address goes into the change log,
    #      so Settings > Account changes shows it and the administrator can correct the ID
    seen_bounces = {e.get('detail') for e in log if e.get('action') == 'bounce'}
    for msg, ours in messages:
        subj = str(msg.get('Subject', ''))
        if not re.search(r'undeliver|delivery (status|failure)|returned to sender|mail delivery failed', subj, re.I):
            continue
        body = text_of(msg)
        failed = re.findall(r'<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?[^\n]*?(?:said|rejected|does not exist|unknown|not found|550|no such)', body, re.I)
        failed = [f.lower() for f in failed if f.lower() != MAIL_USER.lower()]
        mid = str(msg.get('Message-ID', '')).strip()
        for addr in dict.fromkeys(failed):
            key = f"{addr} ({mid[:40]})" if mid else addr
            if key in seen_bounces:
                continue
            seen_bounces.add(key)
            note('bounce', addr, 'mail system', key)
            print(f"  returned mail for {mask(addr)}: the address does not accept mail; correct the ID or ask for another")

    # 3d. a request whose ID now has an account (added from Settings > People rather than approved on the request) is
    #     settled as approved, so it stops showing as waiting; the person has their link from the add already
    for req in [p for p in pending if p['kind'] == 'access' and p['ref'] not in handled and accounts.find(p['email'])]:
        acct = accounts.find(req['email'])
        settle(req, 'approved', by='account added by an administrator', role=acct['role'], divisions=acct['divisions'])
        note('approved', req['email'], 'administrator (account added)', f"{req['ref']} as {acct['role']} ({divs_text(acct['divisions'])})")
        print(f"  {req['ref']} settled: {mask(req['email'])} already has an account")

    # 4. acknowledge every newly listed access request, once per request, once per address, at most ten a run:
    #    the sign-in form accepts any address, so this must never become a way to send mail to strangers in bulk
    acked_addrs = {p['email'] for p in pending if p.get('acked')}
    sent_acks = 0
    for req in [p for p in pending if p['kind'] == 'access' and p['ref'] not in handled and not p.get('acked')]:
        if req['email'] in acked_addrs:
            req['acked'] = 'same address already acknowledged'; changed = True
            continue
        if sent_acks >= 10:
            break
        mailer.send(req['email'], f"Marikar hub: your access request {req['ref']}", acknowledgement(req))
        req['acked'] = NOW; acked_addrs.add(req['email']); sent_acks += 1; changed = True
        print(f"  acknowledged {req['ref']} to {mask(req['email'])}")

    # 4b. survey answers from feedback.html: kept in the store (Settings > Feedback), the person thanked, the answers
    #     mailed to the hub mailbox and the approvers; at most one thank-you per address per run, the page being public
    thanked = set()
    fb_to = sorted({MAIL_USER.lower()} | {a for a in approvers if not a.endswith('@bpropms.com')})
    for fb in new_feedback[:20]:
        fb['received'] = NOW
        feedback.append(fb); changed = True
        note('feedback', fb['id'], fb['id'], f"survey answers {fb['ref']}")
        for addr in fb_to:
            mailer.send(addr, f"Marikar hub: feedback {fb['ref']} from {fb['name'] or fb['id']}", feedback_text(fb))
        if fb['id'] not in thanked:
            mailer.send(fb['id'], 'Marikar hub: thank you for your feedback', feedback_thanks(fb)); thanked.add(fb['id'])
        print(f"  feedback {fb['ref']} from {mask(fb['id'])} recorded and acknowledged")

    # 5. once a day, remind the approvers of anything that has waited more than a day
    waiting = []
    for p in pending:
        if p['kind'] != 'access' or p['ref'] in handled:
            continue
        try:
            if dt.datetime.fromisoformat(p.get('received') or p['at'].replace('Z', '+00:00')) < dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24):
                waiting.append(p)
        except ValueError:
            pass
    last = store.get('reminded_at', '')
    due = not last or dt.datetime.fromisoformat(last) < dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)
    reminded_at = last
    if waiting and due:
        to = sorted(a for a in approvers if a != MAIL_USER.lower() and not a.endswith('@bpropms.com')) or [MAIL_USER]
        for addr in to:
            mailer.send(addr, f"Marikar hub: {len(waiting)} access request{'s' if len(waiting) > 1 else ''} waiting", reminder(waiting, to))
        reminded_at = NOW; changed = True
        print(f"  reminded {', '.join(mask(a) for a in to)} of {len(waiting)} waiting request(s)")

    for uid in [u for u, l in links.items() if dt.datetime.fromisoformat(l.get('exp', '2000-01-01T00:00:00+00:00')) < dt.datetime.now(dt.timezone.utc)]:
        del links[uid]; changed = True
    pending = [p for p in pending if p['ref'] not in handled]
    pending.sort(key=lambda p: p.get('received') or p.get('at') or '')
    print(f"{len(messages)} e-mail(s) read ({hub_mails} about the hub, {from_approvers} from approver addresses), {len(added)} new request(s), {len(commands)} reply command(s), {mailer.sent} e-mail(s) sent, {len(pending)} waiting, {len(handled)} handled")
    for r in added:
        print(f"  + {r['ref']} {r['kind']} {mask(r['email'])}")
    if args.results:
        keep = dict(sorted(results.items(), key=lambda kv: kv[1].get('at', ''))[-300:])
        tmp = args.results + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(keep, f, ensure_ascii=False)
        os.replace(tmp, args.results)
        os.chmod(args.results, 0o644)
    if not changed:
        return
    os.makedirs(os.path.dirname(args.store), exist_ok=True)
    with open(args.store, 'w', encoding='utf-8') as f:
        json.dump({'updated': NOW, 'reminded_at': reminded_at, 'pending': pending, 'handled': handled, 'links': links, 'feedback': feedback[-500:], 'log': log[-300:]}, f, ensure_ascii=False, indent=2); f.write('\n')
    accounts.save()


if __name__ == '__main__':
    main()
