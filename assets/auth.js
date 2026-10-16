// Sign-in for the hub. A front door, not a lock: this is a static site, so the data files can still be fetched by
// anyone who knows their address. Real protection needs a server check (see README, "Sign-in").
// Passwords are never stored: each account keeps a salted PBKDF2-SHA-256 fingerprint (210,000 rounds).
// Add an account with: node scripts/add-user.js <user-id> "<Full name>" <role>
(() => {
  const USERS = [
    { id: 'tech@bpropms.com', name: 'BPro Tech', role: 'superadmin', salt: 'c9bffb8adcb0509aa306eec81fee55e8', hash: 'cce07b1663cff6fb7c61087e2f55f25978a730644b0f5375d45bc84768c2a774' },
    { id: 'gm@marikarautomobiles.in', name: "Shaheen Parvaz", role: 'viewer', salt: '9c1084acacc2f41bb11e757ef4f09bf9', hash: '83edc41120754f27a1b7c4ce32ca93fae33e8a09f5fa98134e62870c59c23ff4', divisions: ['CSPW', 'CANON'] },
    { id: 'hrmanager@marikarmotors.com', name: "Abhilash A G", role: 'viewer', salt: 'b766ac37667a692858b160fb3f92a990', hash: 'fb8ddc6dc646bbd3b9573892d1827d27f3cb030cc774254c58b8eefeac789629' },
    { id: 'manikuttan@marikar.in', name: "Manikuttan P", role: 'viewer', salt: 'b72fd5e5f9c3f0478fd45ea6faf2b509', hash: '2fe6c1a680e9a28fa549f975ae3b490542a0a9b952c23bf5eff34e6abea50ea5' },
    { id: 'mi.accounts@marikarindustries.in', name: "Vinod S", role: 'viewer', salt: 'd9a6091944d9be3ecdb53e9bd6a65f60', hash: 'bcd9d7c27007cf94848c720875a2bda2c72b59dfd0130d3a0313e09f93074a89' },
    { id: 'amul.verghese@marikar.in', name: "AMUL VERGHESE", role: 'viewer', salt: '5013e656bba12ff2a1ccb178eae7f094', hash: '3a705ba4118808a8475a70f40f97a13f9d86dab3ad3c55d8b7fb645f7cf5c092' },
    { id: 'gopakumar@marikarengineers.com', name: "GOPAKUMAR.H", role: 'viewer', salt: 'a3439ecb723114baaae4c26af37c3c26', hash: '1b0810c71fb20c30d1eae2d728809994414585682ecfa27e4851aa7b67e5eced' },
    { id: 'zmarikar@marikargroup.com', name: "Zulfiquar Marikar", role: 'viewer', salt: 'c717eeb942fc5828d4f5504607a49180', hash: 'f30fe27d236e5a4f4ffdf159688a98a962d86d79ebbb432e7a168deed1929a42' },
    { id: 'kintin@marikar.in', name: "Kintin", role: 'viewer', salt: '111923e54d350ab3a611f7d3487d4d33', hash: '9528295ebbde80f127f581fc83776b8e5421ad9af13c283941574d0236b92486' },
    { id: 'cspw@marikar.in', name: "Biju S", role: 'viewer', salt: '1833f91a408ba5969a444ff938fa5413', hash: 'e111d01925487acf07ecbd38c0eae01f77791b9ee0a09f0006cf47dcf12060be', divisions: ['CSPW'] },
    { id: 'serm@marikar.in', name: "Jayaprasad.G", role: 'viewer', salt: 'f675b0431a20e99ea98164545a09492d', hash: '4e7a312e5d1a249ad2ea621da7bcf8342df202025796b8a14ec93f93369dcd29', divisions: ['HONDA', 'AMZES', 'BIGWING', 'RE'] },
    { id: 'gmoperations@marikargroup.com', name: "JIJI R THOMAS", role: 'viewer', salt: 'b3c83a670bd934b9c0504ffa9a9f0b13', hash: '6381ffe5ebe6fd93e38155f467a203ed30a7ccaf395838ea2e25373b784f496b', divisions: ['GROUP', 'HONDA', 'AMZES', 'BIGWING', 'RE', 'NISSAN'] },
    { id: 'agm.oaip@gmail.com', name: "MAHESH", role: 'viewer', salt: '1160663270ca93d61a36cf26659f5d97', hash: 'a7a718aad998307052363e87640b5300ef9aa8567ad9f60d1a977233cce7f7e5', divisions: ['CANON'] },
    { id: 'seniormanager.re@marikar.in', name: "Cibin Jacob", role: 'viewer', salt: 'a74abc5afe88a0b18f1c8c07bfdf6236', hash: '7e3fcb0a6c07f9e7876a03307db7554effedc544f464bb7d5128e4a4f8b9e8de', divisions: ['RE'] },
    { id: 'seniormanager.sales@marikarnissan.co.in', name: "Satheesh Chandran BH", role: 'viewer', salt: 'c73884550cb50d8e85d4b73461ed7290', hash: '79e5bafdb94d299894fc1f0d3f739ce1eb623d1525035296570272d9fe6cedd3', divisions: ['BIGWING', 'NISSAN'] },
  ];
  const ROUNDS = 210000, KEY = 'mg-hub-session', DAY = 864e5;
  // Divisions an account can be limited to (keys as in data/divisions.json). An account line without a `divisions`
  // field, and every admin or super admin, sees all of them. Sales & inventory (TallyPrime companies) belongs to
  // the Honda divisions.
  const DIVISIONS = [['GROUP', 'Group vehicle sales'], ['HONDA', 'Honda Kerala'], ['AMZES', 'AMZES (Honda Tamil Nadu)'], ['BIGWING', 'BigWing'], ['RE', 'Royal Enfield'], ['NISSAN', 'Nissan'], ['CSPW', 'CSPW'], ['CANON', 'Canon / OAIP'], ['HR', 'HR']];
  const DIV_KEYS = DIVISIONS.map((d) => d[0]);
  const SALES_DIVS = ['HONDA', 'AMZES'];
  // Normalises a divisions value: 'all', or an array of known keys (empty means none).
  const normDivs = (v) => { if (v == null || v === 'all' || v === '' ) return 'all'; const a = (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).map((k) => String(k).trim().toUpperCase()).filter((k) => DIV_KEYS.includes(k)); return a.includes('ALL') ? 'all' : [...new Set(a)]; };
  const divNames = (v) => v === 'all' ? 'All divisions' : (v || []).map((k) => (DIVISIONS.find((d) => d[0] === k) || [k, k])[1]).join(', ') || 'No divisions';
  const scopeOf = (u) => (!u || u.role === 'admin' || u.role === 'superadmin') ? 'all' : normDivs(u.divisions);
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
      try {
        const s = JSON.parse(store.getItem(KEY) || 'null');
        if (s && s.exp > Date.now()) {
          // the account behind the session: removed means signed out; role, name and divisions follow the file
          const u = USERS.find((x) => x.id === s.id);
          // removed account, or a password changed since this session began (k = the fingerprint it was opened with): signed out
          if (!u || (s.k && s.k !== u.hash.slice(0, 8))) { store.removeItem(KEY); continue; }
          return { ...s, name: u.name, role: u.role, divisions: scopeOf(u) };
        }
        store.removeItem(KEY);
      } catch (e) { /* storage blocked */ }
    }
    return null;
  };
  // Access and password-reset requests. The hub is a static site, so a request travels as a signed-looking code:
  // by POST to REQUESTS.endpoint when one is configured (any form-to-mail service that accepts JSON), otherwise in
  // an e-mail the requester sends to REQUESTS.to. The super admin pastes the code into Settings > People to act on it.
  // `fields` is merged into every POST: for Web3Forms set endpoint 'https://api.web3forms.com/submit' and
  // fields { access_key: '<key issued to mml@bpropms.in>' }; for the relay in server/ leave fields empty.
  const REQUESTS = { to: 'mml@bpropms.in', direct: 'submit', endpoint: '', fields: {} };
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
      if (kind !== 'reset') { req.divisions = normDivs(req.divisions === undefined ? 'all' : req.divisions); if (req.divisions !== 'all' && !req.divisions.length) req.divisions = 'all'; req.scope = divNames(req.divisions); }
      const code = Requests.encode(req);
      const lines = kind === 'reset'
        ? [`Password reset request ${req.ref}`, '', `User ID: ${req.email}`, `Name: ${req.name || '-'}`, '', 'Request code (paste into Settings > People):', code]
        : [`Access request ${req.ref}`, '', `Name: ${req.name}`, `E-mail: ${req.email}`, `Company / division / function: ${req.unit || '-'}`, `Access needed for: ${req.scope || '-'}`, `Designation: ${req.title || '-'}`, `Phone: ${req.phone || '-'}`, `Reason: ${req.reason || '-'}`, '', 'Request code (paste into Settings > People):', code];
      const subject = kind === 'reset' ? `Marikar hub: password reset ${req.ref}` : `Marikar hub: access request ${req.ref} (${req.name})`;
      return { req, code, text: lines.join('\n'), mailto: `mailto:${REQUESTS.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}` };
    },
    // The set-password step (reset.html): the salted fingerprint of the password the person chose, with the one-time
    // token from their link, as a code the mailbox clerk verifies and writes. The password itself never leaves the browser.
    async buildSet(id, token, password) {
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      const hash = await derive(password, salt);
      const req = { v: 1, kind: 'setpw', id: String(id).trim().toLowerCase(), token, salt, hash, at: new Date().toISOString(), ref: ref('reset') };
      const code = 'MGP1.' + b64u(JSON.stringify(req));
      const lines = [`New password for ${req.id}`, '', 'This message carries the fingerprint of the password chosen on the hub, not the password. Send it as it is.', '', code];
      const subject = `Marikar hub: new password ${req.ref}`;
      return { req, code, text: lines.join('\n'), mailto: `mailto:${REQUESTS.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}` };
    },
    // Sends through the endpoint when there is one; resolves {sent:true} or {sent:false} (then the caller offers e-mail).
    async send(built) {
      // the hub's own server (the VPS) takes the code directly: nginx records it and the clerk reads it; on a copy
      // served elsewhere the address does not exist and the e-mail route below is offered instead
      if (REQUESTS.direct) {
        try { const r = await fetch(`${REQUESTS.direct}?code=${encodeURIComponent(built.code)}`, { cache: 'no-store' }); if (r.ok) return { sent: true }; } catch (e) { /* not served from the VPS */ }
      }
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
  // Sign-in log. Every successful sign-in is noted on this device (last 50) and sent as a beacon to SIGNINS.endpoint,
  // which on the VPS is an nginx location that writes one JSON line per sign-in (deploy/nginx-hub.conf); SIGNINS.report
  // serves that file, so Settings can show a report across users. Both are relative addresses: they work once the hub
  // is served from the VPS and are harmlessly ignored while it is served from GitHub Pages.
  const SIGNINS = { endpoint: 'signin-log', report: 'signins.log' };
  const device = () => { const ua = navigator.userAgent; const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'other'; const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'browser'; return `${br} on ${os}${matchMedia('(display-mode: standalone)').matches ? ' (app)' : ''}`; };
  const noteSignIn = (s) => {
    const row = { at: new Date().toISOString(), id: s.id, name: s.name, role: s.role, device: device() };
    try { const k = 'mg-signins'; const list = JSON.parse(localStorage.getItem(k) || '[]'); list.push(row); localStorage.setItem(k, JSON.stringify(list.slice(-50))); } catch (e) { /* storage blocked */ }
    // t makes each beacon a distinct address, so nothing between here and the server can answer it from a cache
    if (SIGNINS.endpoint) { try { const q = new URLSearchParams({ id: row.id, name: row.name, role: row.role, device: row.device, t: Date.now() }); fetch(`${SIGNINS.endpoint}?${q}`, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(() => {}); } catch (e) { /* offline */ } }
  };
  const Auth = {
    user: read,
    signins: {
      config: SIGNINS,
      local: () => { try { return JSON.parse(localStorage.getItem('mg-signins') || '[]'); } catch (e) { return []; } },
      // The report for the last `days` days: rows of {at, id, name, role, device}, newest first, from the JSON-lines log
      // the server keeps (one object per line; the server writes the time and the query fields).
      report: async (days) => {
        if (!SIGNINS.report) return null;
        const r = await fetch(SIGNINS.report, { cache: 'no-store' }); if (!r.ok) throw new Error('report ' + r.status);
        const since = Date.now() - (days || 30) * DAY; const rows = [];
        const un = (v) => { try { return decodeURIComponent(String(v || '').replace(/\+/g, ' ')); } catch (e) { return String(v || ''); } };   // nginx stores the query fields as sent
        (await r.text()).split('\n').forEach((line) => { if (!line.trim()) return; try { const o = JSON.parse(line); if (o.at && new Date(o.at).getTime() >= since && o.id) rows.push({ at: new Date(o.at).toISOString(), id: un(o.id).toLowerCase(), name: un(o.name), role: un(o.role), device: un(o.device) }); } catch (e) { /* a torn line */ } });
        return rows.sort((a, b) => b.at.localeCompare(a.at));
      },
    },
    requests: Requests,
    exists: (id) => USERS.some((u) => u.id === String(id || '').trim().toLowerCase()),
    ROUNDS,
    // Accounts without their secrets, for the People page.
    list: () => USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, divisions: scopeOf(u) })),
    DIVISIONS, SALES_DIVS, normDivs, divNames,
    // The signed-in person's division scope: 'all' or an array of keys. Older sessions (no field) see everything.
    scope: () => { const s = read(); if (!s) return []; const u = USERS.find((x) => x.id === s.id); return u ? scopeOf(u) : (s.divisions === undefined ? 'all' : normDivs(s.divisions)); },
    canSee: (key) => { const sc = Auth.scope(); return sc === 'all' || sc.includes(String(key).toUpperCase()); },
    // Sales & inventory (the TallyPrime dashboards, report builder and note) go with the Honda divisions.
    canSales: () => SALES_DIVS.some((k) => Auth.canSee(k)),
    pref,
    theme: (t) => { if (t !== undefined) pref('theme', t === 'system' ? null : t); applyTheme(); return pref('theme') || 'system'; },
    derive,
    async signIn(id, password, remember) {
      const u = USERS.find((x) => x.id === String(id).trim().toLowerCase());
      // derive even for an unknown ID, so both paths take the same time
      const h = await derive(password, u ? u.salt : '00'.repeat(16));
      if (!u || h !== u.hash) return null;
      const s = { id: u.id, name: u.name, role: u.role, divisions: scopeOf(u), k: u.hash.slice(0, 8), exp: Date.now() + (remember ? 7 * DAY : DAY / 2) };
      try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
      noteSignIn(s);
      return s;
    },
    signOut() {
      for (const store of [sessionStorage, localStorage]) { try { store.removeItem(KEY); store.removeItem('mg-gh-token'); } catch (e) { /* ignore */ } }
      location.replace('index.html');
    },
    // On every protected page: send visitors without a session to the sign-in page, then back here.
    guard(need) {
      if (read()) {
        const s = read();
        const ok = !need || (need === 'admin' ? ['admin', 'superadmin'].includes(s.role) : need === 'sales' ? Auth.canSales() : Auth.canSee(need));
        if (!ok) { document.documentElement.style.visibility = 'hidden'; location.replace('hub.html?denied=' + encodeURIComponent(need)); }
        return ok;
      }
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
