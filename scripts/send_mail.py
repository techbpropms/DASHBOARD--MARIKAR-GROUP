#!/usr/bin/env python3
"""Sends a branded e-mail from the hub mailbox to the hub's users, one personalised message each.

    python3 scripts/send_mail.py --template docs/mail/launch-2026-10.html --subject "..." --to all
    python3 scripts/send_mail.py --template ... --subject ... --to a@b.in,c@d.in       # a test send
    DRY_RUN=1 python3 scripts/send_mail.py ...                                           # print, send nothing

--to all means every account in assets/auth.js except the BPro service accounts (*@bpropms.com). Placeholders in
the template: {{first}} (first name), {{name}}, {{id}} (user ID), {{form}} (feedback.html on the hub with the
person's name and ID prefilled; a score can be appended as &q1=4). The mail goes out as HTML with a plain-text
alternative made from the same template. Environment: MAIL_PASSWORD (required), MAIL_USER, SMTP_HOST, HUB_URL,
MAIL_FROM_NAME (default "Dr. Babu B, Marikar Group performance hub"), REPLY_TO (default the mailbox).
"""
import argparse
import html
import os
import re
import smtplib
import sys
import time
import urllib.parse
from email.message import EmailMessage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_requests import Accounts, AUTH, MAIL_USER, HUB_URL, mask  # noqa: E402


def to_text(h):
    """A readable plain-text version of the HTML: links kept as 'text (url)', tables as lines."""
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
    h = re.sub(r'<(style|script)[^>]*>.*?</\1>', '', h, flags=re.S | re.I)
    h = re.sub(r'<a [^>]*href="[^"]*&q\d=[^"]*"[^>]*>(.*?)</a>', r'\1 ', h, flags=re.S | re.I)   # the tap-a-score chips: just the labels
    h = re.sub(r'<a [^>]*href="(mailto:)?([^"]+)"[^>]*>(.*?)</a>', lambda m: m.group(3) if m.group(3).strip() in (m.group(2), m.group(2).replace('https://', '')) or m.group(2).startswith('{{') else f'{m.group(3)} ({m.group(2)})', h, flags=re.S | re.I)
    h = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', r'\1', h, flags=re.I)
    h = re.sub(r'</(p|h1|h2|h3|li|tr|div)>', '\n', h, flags=re.I)
    h = re.sub(r'<br\s*/?>', '\n', h, flags=re.I)
    h = re.sub(r'</t[dh]>', '  ', h, flags=re.I)
    h = re.sub(r'<li[^>]*>', '- ', h, flags=re.I)
    h = re.sub(r'<[^>]+>', '', h)
    h = html.unescape(h)
    h = re.sub(r'[ \t]+', ' ', h)
    h = re.sub(r' *\n *', '\n', h)
    h = re.sub(r'\n{3,}', '\n\n', h)
    return h.strip() + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--template', required=True)
    ap.add_argument('--subject', required=True)
    ap.add_argument('--to', required=True, help='"all" or a comma-separated list of hub user IDs')
    ap.add_argument('--auth', default=AUTH)
    args = ap.parse_args()
    dry = os.environ.get('DRY_RUN') == '1'
    pw = os.environ.get('MAIL_PASSWORD', '')
    if not pw and not dry:
        sys.exit('MAIL_PASSWORD is not set')
    accounts = Accounts(args.auth)
    people = {u['id'].lower(): u for u in accounts.list()}
    if args.to.strip().lower() == 'all':
        ids = [i for i in people if not i.endswith('@bpropms.com')]
    else:
        ids = [a.strip().lower() for a in args.to.split(',') if a.strip()]
    tpl = open(args.template, encoding='utf-8').read()
    hub = HUB_URL.rstrip('/') + '/'
    sent = 0
    for uid in ids:
        if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', uid):
            print(f'  skipped {uid!r}: not an address'); continue
        name = (people.get(uid) or {}).get('name') or uid.split('@')[0]
        first = re.split(r'[ .]', name)[0].strip(',') or 'colleague'
        if first.isupper():
            first = first.title()
        form = f"{hub}feedback.html?u={urllib.parse.quote(uid)}&n={urllib.parse.quote(name)}"
        body = tpl.replace('{{first}}', html.escape(first)).replace('{{name}}', html.escape(name)).replace('{{id}}', html.escape(uid)).replace('{{form}}', html.escape(form, quote=True))
        msg = EmailMessage()
        msg['From'] = f"{os.environ.get('MAIL_FROM_NAME', 'Dr. Babu B, Marikar Group performance hub')} <{MAIL_USER}>"
        msg['To'] = f'{name} <{uid}>'
        msg['Reply-To'] = os.environ.get('REPLY_TO', MAIL_USER)
        msg['Subject'] = args.subject
        msg.set_content(to_text(body))
        msg.add_alternative(body, subtype='html')
        if dry:
            print(f'--- would send to {mask(uid)} ({name}); form link {form[:60]}…')
            if sent == 0:
                print(to_text(body))
        else:
            with smtplib.SMTP_SSL(os.environ.get('SMTP_HOST', 'smtp.hostinger.com'), 465, timeout=30) as s:
                s.login(MAIL_USER, pw)
                s.send_message(msg)
            print(f'  sent to {mask(uid)}')
            time.sleep(2)   # gentle on the mail server
        sent += 1
    print(f'{sent} message(s) {"prepared" if dry else "sent"}')


if __name__ == '__main__':
    main()
