// Mail relay for the Marikar Group performance hub.
//
// The hub itself is a static site. This small service is the one piece that holds the mailbox credentials
// (mml@bpropms.in), so they never appear in the site's files. It receives the access and password-reset
// requests the sign-in page builds, e-mails them to the administrator, and sends the requester an
// acknowledgement. Later it can also send the temporary passwords the super admin issues.
//
// Configure with environment variables (see .env.example). Run: node server.js
'use strict';
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const CFG = {
  port: +env('PORT', 8787),
  origins: env('ALLOWED_ORIGINS', 'https://mmlpbi.bpropms.in').split(',').map((s) => s.trim()).filter(Boolean),
  adminTo: env('ADMIN_TO', 'mml@bpropms.in'),
  from: env('MAIL_FROM', 'Marikar Group performance hub <mml@bpropms.in>'),
  hubUrl: env('HUB_URL', 'https://mmlpbi.bpropms.in'),
  smtp: { host: env('SMTP_HOST', 'smtp.hostinger.com'), port: +env('SMTP_PORT', 465), secure: env('SMTP_SECURE', 'true') !== 'false', user: env('SMTP_USER', 'mml@bpropms.in'), pass: env('SMTP_PASS', '') },
  dryRun: env('DRY_RUN', '') === '1',
  rate: { perHour: +env('RATE_PER_HOUR', 5) },
};
if (!CFG.smtp.pass && !CFG.dryRun) { console.error('SMTP_PASS is not set. Set it in the environment (never in a file that is committed), or DRY_RUN=1 to log instead of sending.'); process.exit(1); }

const transport = CFG.dryRun
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({ host: CFG.smtp.host, port: CFG.smtp.port, secure: CFG.smtp.secure, auth: { user: CFG.smtp.user, pass: CFG.smtp.pass } });

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '16kb' }));

// CORS: only the hub's own origin may call this service from a browser.
app.use((req, res, next) => {
  const o = req.headers.origin;
  if (o && CFG.origins.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Max-Age', '600'); }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// A small per-address limit, so a stuck form or a script cannot flood the mailbox.
const seen = new Map();
function limited(ip) {
  const now = Date.now(), hour = 36e5;
  const hits = (seen.get(ip) || []).filter((t) => now - t < hour);
  if (hits.length >= CFG.rate.perHour) { seen.set(ip, hits); return true; }
  hits.push(now); seen.set(ip, hits);
  if (seen.size > 5000) seen.clear();
  return false;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, n) => String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.get('/healthz', (req, res) => res.json({ ok: true, dryRun: CFG.dryRun, at: new Date().toISOString() }));

// The sign-in page posts { kind, ref, name, email, subject, message, code }.
app.post('/api/requests', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const b = req.body || {};
  const kind = b.kind === 'reset' ? 'reset' : b.kind === 'access' ? 'access' : null;
  const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 80), ref = clean(b.ref, 24), code = clean(b.code, 4000), message = String(b.message || '').slice(0, 6000);
  if (!kind || !EMAIL.test(email) || !/^MGQ1\.[A-Za-z0-9_-]+$/.test(code) || !/^(AR|PR)-\d{8}-[0-9A-F]{4}$/.test(ref)) return res.status(400).json({ ok: false, error: 'The request is incomplete.' });
  if (kind === 'access' && name.length < 2) return res.status(400).json({ ok: false, error: 'The request is incomplete.' });
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'Too many requests from this address. Try again in an hour or send the request by e-mail.' });
  const id = crypto.randomBytes(4).toString('hex');
  const subject = kind === 'reset' ? `Marikar hub: password reset ${ref}` : `Marikar hub: access request ${ref} (${name})`;
  try {
    // 1. to the administrator, with the code the People page reads
    await transport.sendMail({
      from: CFG.from, to: CFG.adminTo, replyTo: email, subject,
      text: `${message}\n\nReceived ${new Date().toISOString()} from ${ip} (relay id ${id}).\nOpen ${CFG.hubUrl}/settings.html#people and paste the request code to act on it.`,
      html: `<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${esc(message)}</pre><p>Received ${esc(new Date().toISOString())} from ${esc(ip)} (relay id ${id}).</p><p><a href="${esc(CFG.hubUrl)}/settings.html#people">Open Settings &rsaquo; People</a> and paste the request code to act on it.</p>`,
    });
    // 2. acknowledgement to the requester (no details echoed back beyond the reference)
    const ack = kind === 'reset'
      ? `We received your password reset request (reference ${ref}).\n\nIf this address has an account on the Marikar Group performance hub, the administrator will send a new temporary password to it, usually within one working day. If you did not make this request, you can ignore this e-mail.`
      : `Thank you, ${name}. We received your access request for the Marikar Group performance hub (reference ${ref}).\n\nThe administrator reviews every request. When it is approved you will receive your user ID and a temporary password at this address, usually within one working day.`;
    await transport.sendMail({ from: CFG.from, to: email, subject: `${kind === 'reset' ? 'Password reset request' : 'Access request'} received: ${ref}`, text: `${ack}\n\n— Marikar Group performance hub\n${CFG.hubUrl}` });
    console.log(`[${new Date().toISOString()}] ${kind} ${ref} from ${email} (${ip}) relayed, id ${id}`);
    res.json({ ok: true, ref, id });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${kind} ${ref} failed:`, err.message);
    res.status(502).json({ ok: false, error: 'The mail server did not accept the message. Please send the request by e-mail instead.' });
  }
});

app.use((req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
app.listen(CFG.port, () => console.log(`Marikar hub mail relay on :${CFG.port}${CFG.dryRun ? ' (dry run: mails are logged, not sent)' : ''}; admin ${CFG.adminTo}; origins ${CFG.origins.join(', ')}`));
