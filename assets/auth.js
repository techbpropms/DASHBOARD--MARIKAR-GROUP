// Sign-in for the hub. A front door, not a lock: this is a static site, so the data files can still be fetched by
// anyone who knows their address. Real protection needs a server check (see README, "Sign-in").
// Passwords are never stored: each account keeps a salted PBKDF2-SHA-256 fingerprint (210,000 rounds).
// Add an account with: node scripts/add-user.js <user-id> "<Full name>" <role>
(() => {
  const USERS = [
    { id: 'tech@bpropms.com', name: 'BPro Tech', role: 'superadmin', salt: 'c9bffb8adcb0509aa306eec81fee55e8', hash: 'cce07b1663cff6fb7c61087e2f55f25978a730644b0f5375d45bc84768c2a774' },
    { id: 'gm@marikarautomobiles.in', name: "Shaheen Parvaz", role: 'viewer', salt: '21c5e1e10a13ae5a192093aa81b322ec', hash: '3d97c6a8780652da7340f27d926024aca7c099a4c19113da8963d11657118505' },
    { id: 'hrmanager@marikarmotors.com', name: "Abhilash A G", role: 'viewer', salt: '8a9cf8823db12db859a1a088baad8da2', hash: '5cec829ac472f73487ca14241da9141075cacf77069d1a13ba4742071cdd92dd' },
    { id: 'manikuttan@marikar.in', name: "Manikuttan P", role: 'viewer', salt: 'b72fd5e5f9c3f0478fd45ea6faf2b509', hash: '2fe6c1a680e9a28fa549f975ae3b490542a0a9b952c23bf5eff34e6abea50ea5' },
    { id: 'mi.accounts@marikarindustries.in', name: "Vinod S", role: 'viewer', salt: 'd9a6091944d9be3ecdb53e9bd6a65f60', hash: 'bcd9d7c27007cf94848c720875a2bda2c72b59dfd0130d3a0313e09f93074a89' },
    { id: 'amul.verghese@marikar.in', name: "AMUL VERGHESE", role: 'viewer', salt: 'c15129c39c0b574e179e36d83379be76', hash: '16faf51cf5cfad08ac8da0ad997e874fdc6a3658d3b76d3067156fa4b97684e7' },
    { id: 'gopakumar@marikarengineers.com', name: "GOPAKUMAR.H", role: 'viewer', salt: 'a3439ecb723114baaae4c26af37c3c26', hash: '1b0810c71fb20c30d1eae2d728809994414585682ecfa27e4851aa7b67e5eced' },
  ];
  const ROUNDS = 210000, KEY = 'mg-hub-session', DAY = 864e5;
  // Per-browser preferences (theme, menu position). Applied here, in <head>, so pages never flash the wrong theme.
  const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem('mg-' + k); if (v === null) localStorage.removeItem('mg-' + k); else localStorage.setItem('mg-' + k, v); } catch (e) { /* storage blocked */ } return v; };
  const applyTheme = () => { const t = pref('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  applyTheme();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  async function derive(password, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: ROUNDS }, base, 256));
  }
  const read = () => {
    for (const store of [sessionStorage, localStorage]) {
      try { const s = JSON.parse(store.getItem(KEY) || 'null'); if (s && s.exp > Date.now()) return s; store.removeItem(KEY); } catch (e) { /* storage blocked */ }
    }
    return null;
  };
  // Access and password-reset requests. The hub is a static site, so a request travels as a signed-looking code:
  // by POST to REQUESTS.endpoint when one is configured (any form-to-mail service that accepts JSON), otherwise in
  // an e-mail the requester sends to REQUESTS.to. The super admin pastes the code into Settings > People to act on it.
  // `fields` is merged into every POST: for Web3Forms set endpoint 'https://api.web3forms.com/submit' and
  // fields { access_key: '<key issued to mml@bpropms.in>' }; for the relay in server/ leave fields empty.
  const REQUESTS = { to: 'mml@bpropms.in', endpoint: '', fields: {} };
  const b64u = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - str.length % 4) % 4))));
  const ref = (kind) => { const d = new Date(); const ymd = d.toISOString().slice(0, 10).replace(/-/g, ''); const r = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); return `${kind === 'reset' ? 'PR' : 'AR'}-${ymd}-${r}`; };
  const Requests = {
    config: REQUESTS,
    encode(req) { return 'MGQ1.' + b64u(JSON.stringify(req)); },
    decode(text) {
      const m = String(text || '').match(/MGQ1\.([A-Za-z0-9_-]+)/);
      if (!m) return null;
      try { const r = JSON.parse(unb64u(m[1])); return r && r.kind && r.email ? r : null; } catch (e) { return null; }
    },
    build(kind, data) {
      const req = { v: 1, kind, ref: ref(kind), at: new Date().toISOString(), ...data };
      const code = Requests.encode(req);
      const lines = kind === 'reset'
        ? [`Password reset request ${req.ref}`, '', `User ID: ${req.email}`, `Name: ${req.name || '-'}`, '', 'Request code (paste into Settings > People):', code]
        : [`Access request ${req.ref}`, '', `Name: ${req.name}`, `E-mail: ${req.email}`, `Company / division / function: ${req.unit || '-'}`, `Access needed for: ${req.scope || '-'}`, `Designation: ${req.title || '-'}`, `Phone: ${req.phone || '-'}`, `Reason: ${req.reason || '-'}`, '', 'Request code (paste into Settings > People):', code];
      const subject = kind === 'reset' ? `Marikar hub: password reset ${req.ref}` : `Marikar hub: access request ${req.ref} (${req.name})`;
      return { req, code, text: lines.join('\n'), mailto: `mailto:${REQUESTS.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}` };
    },
    // Sends through the endpoint when there is one; resolves {sent:true} or {sent:false} (then the caller offers e-mail).
    async send(built) {
      if (!REQUESTS.endpoint) return { sent: false };
      try {
        const r = await fetch(REQUESTS.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...(REQUESTS.fields || {}), subject: built.text.split('\n')[0], ref: built.req.ref, kind: built.req.kind, name: built.req.name, email: built.req.email, message: built.text, code: built.code }) });
        if (!r.ok) return { sent: false };
        // Form-to-mail services answer 200 with {success:false} when the key is wrong: treat that as not sent.
        const j = await r.clone().json().catch(() => null);
        return { sent: !(j && j.success === false) };
      } catch (e) { return { sent: false }; }
    },
  };
  const Auth = {
    user: read,
    requests: Requests,
    exists: (id) => USERS.some((u) => u.id === String(id || '').trim().toLowerCase()),
    ROUNDS,
    // Accounts without their secrets, for the People page.
    list: () => USERS.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    pref,
    theme: (t) => { if (t !== undefined) pref('theme', t === 'system' ? null : t); applyTheme(); return pref('theme') || 'system'; },
    derive,
    async signIn(id, password, remember) {
      const u = USERS.find((x) => x.id === String(id).trim().toLowerCase());
      // derive even for an unknown ID, so both paths take the same time
      const h = await derive(password, u ? u.salt : '00'.repeat(16));
      if (!u || h !== u.hash) return null;
      const s = { id: u.id, name: u.name, role: u.role, exp: Date.now() + (remember ? 7 * DAY : DAY / 2) };
      try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
      return s;
    },
    signOut() {
      for (const store of [sessionStorage, localStorage]) { try { store.removeItem(KEY); store.removeItem('mg-gh-token'); } catch (e) { /* ignore */ } }
      location.replace('index.html');
    },
    // On every protected page: send visitors without a session to the sign-in page, then back here.
    guard() {
      if (read()) return true;
      const here = location.pathname.split('/').pop() + location.search + location.hash;
      document.documentElement.style.visibility = 'hidden';
      location.replace('index.html?next=' + encodeURIComponent(here));
      return false;
    },
    // A small "signed in as · Sign out" chip; pages that load assets/shell.js get the full bar instead.
    chip() {
      const s = read(); if (!s || window.MGShell) return;
      const c = document.createElement('div');
      c.className = 'mg-who';
      c.style.cssText = 'position:fixed;top:10px;right:12px;z-index:40;display:flex;gap:8px;align-items:center;background:rgba(19,28,56,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 6px 5px 12px;font:600 12px/1.2 "Plus Jakarta Sans",system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)';
      const who = document.createElement('span'); who.textContent = s.name;
      const out = document.createElement('button'); out.type = 'button'; out.textContent = 'Sign out';
      out.style.cssText = 'font:inherit;border:0;border-radius:999px;padding:5px 10px;background:#d49a3a;color:#1d1408;cursor:pointer';
      out.onclick = Auth.signOut;
      c.append(who, out); document.body.appendChild(c);
    },
  };
  window.MGAuth = Auth;
})();
