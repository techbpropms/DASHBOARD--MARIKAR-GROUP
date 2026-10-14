// The hub's navigation shell, mounted on every signed-in page: the menu (as a top bar or a sidebar, each reader's
// choice), a Light / Dark / System theme switch, the signed-in name, Settings and Sign out. Phones get a drawer.
// Menu structure: main items -> submenus -> division groups (consolidations of several divisions).
(() => {
  // Division groups: a group page (divisions.html#g=KEY) shows those divisions together. Keep in step with
  // data/divisions.json "groups", which the divisions page reads.
  const GROUPS = [
    { key: 'AUTO', label: 'Automotive', divisions: [['GROUP', 'Group vehicle sales (consolidated)'], ['HONDA', 'Honda Kerala'], ['AMZES', 'AMZES (Honda Tamil Nadu)'], ['BIGWING', 'BigWing'], ['RE', 'Royal Enfield'], ['NISSAN', 'Nissan']] },
    { key: 'PARTS', label: 'Parts & distribution', divisions: [['CSPW', 'CSPW']] },
    { key: 'OA', label: 'Office automation', divisions: [['CANON', 'Canon / OAIP']] },
    { key: 'PEOPLE', label: 'People', divisions: [['HR', 'HR']] },
  ];
  const I = {
    hub: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    div: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sales: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    track: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    verify: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    auto: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    top: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="11" width="18" height="9" rx="1"/>',
    side: '<rect x="3" y="4" width="6" height="16" rx="1"/><rect x="12" y="4" width="9" height="16" rx="1"/>',
  };
  const MENU = [
    { label: 'Hub', href: 'hub.html', icon: 'hub', children: [
      { label: 'Landing page', href: 'hub.html' },
      { label: 'User manual (PDF)', href: 'docs/manual/manual.pdf' },
    ] },
    { label: 'Divisions', href: 'divisions.html', icon: 'div', children: [
      { label: 'All divisions', href: 'divisions.html' },
      ...GROUPS.map((g) => ({ label: g.label, href: 'divisions.html#g=' + g.key, group: true, children: g.divisions.map(([k, n]) => ({ label: n, href: 'divisions.html#' + k })) })),
    ] },
    { label: 'Sales & inventory', href: 'dashboard.html', icon: 'sales', children: [
      { label: 'Dashboard', href: 'dashboard.html' },
      { label: 'Report builder (PDF / Excel)', href: 'report.html' },
      { label: 'Reconciliation note', href: 'note.html' },
    ] },
    { label: 'HOD action tracker', href: 'tracker.html', icon: 'track' },
    { label: 'Verify a document', href: 'verify.html', icon: 'verify' },
    { label: 'Settings', href: 'settings.html', icon: 'gear', children: [
      { label: 'Appearance', href: 'settings.html#appearance' },
      { label: 'People', href: 'settings.html#people', role: 'superadmin' },
    ] },
  ];

  const svg = (paths, cls) => { const t = document.createElement('template'); t.innerHTML = `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`; return t.content.firstChild; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const here = () => (location.pathname.split('/').pop() || 'hub.html') + location.hash;
  const page = (h) => h.split('#')[0];
  const isHere = (href) => href.includes('#') ? here() === href : page(here()) === page(href) && !(href === 'divisions.html' && location.hash);
  const within = (item) => page(item.href) === page(here()) || (item.children || []).some(within);

  const Shell = {
    GROUPS, MENU,
    nav: (v) => { if (v !== undefined) MGAuth.pref('nav', v === 'top' ? null : v); return MGAuth.pref('nav') === 'side' ? 'side' : 'top'; },
    mount() {
      if (document.querySelector('.mg-bar')) return;
      const user = MGAuth.user();
      const mode = Shell.nav();
      document.body.classList.add('mg-nav-' + mode);

      // ----- bar
      const bar = el('header', 'mg-bar'); bar.setAttribute('role', 'banner');
      const burger = el('button', 'mg-ic mg-burger'); burger.type = 'button'; burger.setAttribute('aria-label', 'Open menu'); burger.setAttribute('aria-expanded', 'false'); burger.append(svg(I.menu));
      const brand = el('a', 'mg-brand'); brand.href = user ? 'hub.html' : 'index.html';
      const tile = el('span', 'tile'); const img = el('img'); img.src = 'assets/img/marikar-group.png'; img.alt = ''; img.width = 27; img.height = 40; tile.append(img);
      brand.append(tile, el('b', null, 'Marikar Group'), el('small', null, 'Performance hub'));
      const navTop = el('nav', 'mg-topnav'); navTop.setAttribute('aria-label', 'Main menu');
      const right = el('div', 'mg-right');
      bar.append(burger, brand, navTop, right);

      // ----- theme switch
      const themes = [['system', 'System', I.auto], ['light', 'Light', I.sun], ['dark', 'Dark', I.moon]];
      const tsw = el('div', 'mg-theme'); tsw.setAttribute('role', 'group'); tsw.setAttribute('aria-label', 'Theme');
      const paint = () => { const cur = MGAuth.theme(); tsw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === cur))); };
      themes.forEach(([k, n, ic]) => { const b = el('button'); b.type = 'button'; b.dataset.t = k; b.title = n + ' theme'; b.setAttribute('aria-label', n + ' theme'); b.append(svg(ic)); b.addEventListener('click', () => { MGAuth.theme(k); paint(); }); tsw.append(b); });
      paint();
      right.append(tsw);

      if (user) {
        const who = el('div', 'mg-who');
        const av = el('span', 'av', user.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()); av.title = user.name;
        const nm = el('span', 'nm'); nm.append(el('b', null, user.name), el('small', null, user.role === 'superadmin' ? 'Super admin' : user.role === 'admin' ? 'Admin' : 'Viewer'));
        who.append(av, nm);
        const out = el('button', 'mg-out'); out.type = 'button'; out.textContent = 'Sign out'; out.addEventListener('click', MGAuth.signOut);
        right.append(who, out);
      } else {
        const a = el('a', 'mg-out', 'Sign in'); a.href = 'index.html'; right.append(a);
      }

      // ----- menu items (the same tree feeds the top bar, the sidebar and the phone drawer)
      const allowed = (it) => !it.role || (user && user.role === it.role);
      const link = (it, cls) => { const a = el('a', cls, it.label); a.href = it.href; if (isHere(it.href)) a.setAttribute('aria-current', 'page'); return a; };
      const buildTop = () => {
        const ul = el('ul');
        MENU.filter((it) => user || it.href === 'verify.html').forEach((it) => {
          const li = el('li'); if (within(it)) li.classList.add('on');
          const a = link(it, 'mg-top-a'); a.title = it.label; a.replaceChildren(svg(I[it.icon], 'ic'), el('span', 'lbl', it.label));
          li.append(a);
          const kids = (it.children || []).filter(allowed);
          if (kids.length) {
            li.classList.add('has');
            a.append(svg(I.chev, 'chev'));
            const menu = el('div', 'mg-drop'); const ul2 = el('ul');
            kids.forEach((k) => {
              const li2 = el('li'); li2.append(link(k, k.group ? 'grp' : ''));
              if (k.children) { const ul3 = el('ul'); k.children.forEach((c) => { const li3 = el('li'); li3.append(link(c)); ul3.append(li3); }); li2.append(ul3); }
              ul2.append(li2);
            });
            menu.append(ul2); li.append(menu);
            // touch and keyboard: a tap on the parent opens the submenu first; a second tap follows the link
            a.addEventListener('click', (e) => { if (matchMedia('(hover: none)').matches && !li.classList.contains('open')) { e.preventDefault(); document.querySelectorAll('.mg-topnav li.open').forEach((o) => o !== li && o.classList.remove('open')); li.classList.add('open'); } });
          }
          ul.append(li);
        });
        return ul;
      };
      const buildSide = () => {
        const nav = el('nav', 'mg-sidenav'); nav.setAttribute('aria-label', 'Main menu');
        const ul = el('ul');
        MENU.filter((it) => user || it.href === 'verify.html').forEach((it) => {
          const li = el('li');
          const kids = (it.children || []).filter(allowed);
          const row = el('div', 'row');
          const a = link(it, 'mg-side-a'); a.prepend(svg(I[it.icon], 'ic')); row.append(a);
          li.append(row);
          if (kids.length) {
            const open = within(it) || !!MGAuth.pref('open-' + it.href);
            const tg = el('button', 'tg'); tg.type = 'button'; tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', (open ? 'Collapse ' : 'Expand ') + it.label); tg.append(svg(I.chev));
            row.append(tg);
            const sub = el('ul', 'sub'); sub.hidden = !open;
            kids.forEach((k) => {
              const li2 = el('li'); li2.append(link(k, k.group ? 'grp' : ''));
              if (k.children) { const ul3 = el('ul', 'sub3'); k.children.forEach((c) => { const li3 = el('li'); li3.append(link(c)); ul3.append(li3); }); li2.append(ul3); }
              sub.append(li2);
            });
            li.append(sub);
            tg.addEventListener('click', () => { const o = sub.hidden; sub.hidden = !o; tg.setAttribute('aria-expanded', String(o)); tg.setAttribute('aria-label', (o ? 'Collapse ' : 'Expand ') + it.label); MGAuth.pref('open-' + it.href, o ? '1' : null); });
          }
          ul.append(li);
        });
        nav.append(ul);
        // layout switch at the foot of the sidebar
        const foot = el('div', 'mg-side-foot');
        const sw = el('button', 'mg-layout'); sw.type = 'button';
        sw.append(svg(mode === 'side' ? I.top : I.side), el('span', null, mode === 'side' ? 'Menu on top' : 'Menu at the side'));
        sw.addEventListener('click', () => { Shell.nav(mode === 'side' ? 'top' : 'side'); location.reload(); });
        foot.append(sw); nav.append(foot);
        return nav;
      };

      const side = buildSide();
      side.classList.add(mode === 'side' ? 'is-side' : 'is-drawer');
      if (mode === 'top') navTop.append(buildTop());
      const scrim = el('div', 'mg-scrim');
      document.body.prepend(bar, side, scrim);

      // drawer (phones, and the top mode's hamburger)
      const toggle = (open) => { document.body.classList.toggle('mg-open', open); burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); burger.replaceChildren(svg(open ? I.close : I.menu)); };
      burger.addEventListener('click', () => toggle(!document.body.classList.contains('mg-open')));
      scrim.addEventListener('click', () => toggle(false));
      addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggle(false); document.querySelectorAll('.mg-topnav li.open').forEach((o) => o.classList.remove('open')); } });
      document.addEventListener('click', (e) => { if (!e.target.closest('.mg-topnav')) document.querySelectorAll('.mg-topnav li.open').forEach((o) => o.classList.remove('open')); });
      // keep highlights in step with hash changes (divisions, settings)
      addEventListener('hashchange', () => document.querySelectorAll('.mg-bar a, .mg-sidenav a').forEach((a) => { const h = a.getAttribute('href'); if (!h) return; if (isHere(h)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }));
    },
  };
  window.MGShell = Shell;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Shell.mount); else Shell.mount();
})();
