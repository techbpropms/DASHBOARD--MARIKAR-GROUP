#!/usr/bin/env python3
"""Reads access and password-reset requests out of the hub mailbox and lists them for Settings > People.

The sign-in page e-mails each request to mml@bpropms.in with a code starting MGQ1. (base64url JSON). This
script signs in to the mailbox over IMAP, finds those e-mails, decodes the codes and adds any request it has not
seen before to data/requests/inbox.json:

    { "updated": "...", "pending": [ {ref, kind, name, email, unit, scope, title, reason, at, received, from} ],
      "handled": { "AR-20261015-0F99": { "status": "approved", "at": "...", "by": "..." } } }

Settings > People shows `pending`, and moves a request to `handled` when the super admin approves or declines
it. The phone number in a request is left out of the file on purpose: the file is published with the site, and
the number is in the e-mail if it is needed. Nothing is deleted or marked in the mailbox.

Environment: MAIL_PASSWORD (required), MAIL_USER (default mml@bpropms.in), MAIL_HOST (default
imap.hostinger.com), MAIL_DAYS (how far back to look, default 60). For a test without a mailbox, pass
--eml <folder> with saved .eml files instead.
"""
import argparse
import base64
import datetime as dt
import email
import email.utils
import imaplib
import json
import os
import re
import sys

STORE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'requests', 'inbox.json')
CODE = re.compile(r'MGQ1\.([A-Za-z0-9_-]{20,})')
KEEP = ('ref', 'kind', 'name', 'email', 'unit', 'scope', 'title', 'reason', 'at')


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
    return out


def text_of(msg):
    parts = []
    for part in msg.walk():
        if part.get_content_type() in ('text/plain', 'text/html') and not part.get_filename():
            try:
                parts.append(part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', 'replace'))
            except Exception:
                pass
    return '\n'.join(parts)


def requests_in(msg):
    """Every request code in one e-mail, with when and from whom it arrived."""
    sender = email.utils.parseaddr(msg.get('From', ''))[1].lower()
    try:
        received = email.utils.parsedate_to_datetime(msg.get('Date', '')).astimezone(dt.timezone.utc).isoformat()
    except Exception:
        received = ''
    seen = set()
    for code in CODE.findall(text_of(msg)):
        req = decode(code)
        if req and req['ref'] not in seen:
            seen.add(req['ref'])
            req['received'] = received
            req['from'] = sender
            yield req


def from_mailbox(host, user, password, days):
    since = (dt.date.today() - dt.timedelta(days=days)).strftime('%d-%b-%Y')
    box = imaplib.IMAP4_SSL(host)
    box.login(user, password)
    box.select('INBOX', readonly=True)
    ok, data = box.search(None, 'SINCE', since, 'SUBJECT', '"Marikar hub"')
    ids = data[0].split() if ok == 'OK' else []
    for i in ids:
        ok, parts = box.fetch(i, '(BODY.PEEK[])')
        if ok != 'OK':
            continue
        raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
        if raw:
            yield from requests_in(email.message_from_bytes(raw))
    box.logout()
    return


def from_folder(folder):
    for name in sorted(os.listdir(folder)):
        if name.endswith('.eml'):
            with open(os.path.join(folder, name), 'rb') as f:
                yield from requests_in(email.message_from_bytes(f.read()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--eml', help='folder of .eml files to read instead of the mailbox')
    ap.add_argument('--store', default=STORE)
    args = ap.parse_args()

    try:
        with open(args.store, encoding='utf-8') as f:
            store = json.load(f)
    except (OSError, ValueError):
        store = {}
    pending = [p for p in store.get('pending', []) if isinstance(p, dict) and p.get('ref')]
    handled = store.get('handled', {}) if isinstance(store.get('handled'), dict) else {}
    known = {p['ref'] for p in pending} | set(handled)

    if args.eml:
        found = list(from_folder(args.eml))
    else:
        pw = os.environ.get('MAIL_PASSWORD', '')
        if not pw:
            sys.exit('MAIL_PASSWORD is not set: add the mailbox password as a repository secret named MAIL_PASSWORD')
        found = list(from_mailbox(os.environ.get('MAIL_HOST', 'imap.hostinger.com'), os.environ.get('MAIL_USER', 'mml@bpropms.in'), pw, int(os.environ.get('MAIL_DAYS', '60'))))

    added = []
    for req in found:
        if req['ref'] not in known:
            known.add(req['ref']); pending.append(req); added.append(req)
    pending.sort(key=lambda p: p.get('received') or p.get('at') or '')
    print(f"{len(found)} request(s) in the mailbox, {len(added)} new, {len(pending)} waiting, {len(handled)} handled")
    for r in added:
        print(f"  + {r['ref']} {r['kind']} {r['email']}")
    if not added:
        return
    out = {'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'pending': pending, 'handled': handled}
    os.makedirs(os.path.dirname(args.store), exist_ok=True)
    with open(args.store, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2); f.write('\n')


if __name__ == '__main__':
    main()
