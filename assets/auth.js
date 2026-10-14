// Sign-in for the hub. A front door, not a lock: this is a static site, so the data files can still be fetched by
// anyone who knows their address. Real protection needs a server check (see README, "Sign-in").
// Passwords are never stored: each account keeps a salted PBKDF2-SHA-256 fingerprint (210,000 rounds).
// Add an account with: node scripts/add-user.js <user-id> "<Full name>" <role>
(() => {
  const USERS = [
    { id: 'tech@bpropms.com', name: 'BPro Tech', role: 'superadmin', salt: 'c9bffb8adcb0509aa306eec81fee55e8', hash: 'cce07b1663cff6fb7c61087e2f55f25978a730644b0f5375d45bc84768c2a774' },
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
  const Auth = {
    user: read,
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
