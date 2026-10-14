# Mail relay

The hub is a static site, so it cannot send e-mail or keep a password. This small Node service is the one
place that holds the `mml@bpropms.in` mailbox credentials. The sign-in page posts access and password-reset
requests to it; it e-mails them to the administrator and sends the requester an acknowledgement.

```
POST /api/requests   { kind, ref, name, email, subject, message, code }   -> { ok, ref, id }
GET  /healthz                                                             -> { ok, dryRun, at }
```

Only the hub's own origin may call it from a browser (`ALLOWED_ORIGINS`), each address gets at most
`RATE_PER_HOUR` requests, bodies are limited to 16 kB, and every field is checked before anything is sent.

## Run it

```sh
cd server
npm install
cp .env.example .env          # then put the mailbox password in SMTP_PASS; .env is git-ignored
set -a; . ./.env; set +a
node server.js                # or: DRY_RUN=1 node server.js  to log mails instead of sending
```

Check: `curl -s http://localhost:8787/healthz`.

## Deploy on Hostinger

**VPS (recommended):** install Node 20+, copy this folder, `npm ci --omit=dev`, create `.env`, then keep it
running with pm2 (`pm2 start server.js --name hub-mail && pm2 save && pm2 startup`). Put nginx in front with
a certificate for a host such as `api.bpropms.in`, proxying to `127.0.0.1:8787`.

**Hostinger Node.js web hosting:** create a Node application from this folder with `server.js` as the entry
point, and add the variables from `.env.example` in the panel's environment settings (the password goes
there, nowhere else).

Then point the hub at it: in `assets/auth.js` set `REQUESTS.endpoint` to `https://api.bpropms.in/api/requests`
(whatever host you chose). From that moment requests go straight to the mailbox and the requester gets an
acknowledgement; the e-mail button on the sign-in page stays as a fallback.

## The mailbox

Hostinger mailboxes use `smtp.hostinger.com`, port 465 (SSL), user name = the full address. If sending
fails with an authentication error, check the password in the hosting panel under Emails, and that the
mailbox is not locked for suspicious activity.
