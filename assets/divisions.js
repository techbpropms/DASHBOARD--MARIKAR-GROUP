// Division dashboards: reads data/divisions.json (figures transcribed from each division's 9 Oct 2026 deck) and
// draws an overview of all divisions, or one division's KPIs, monthly charts, breakdown tables and notes.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monLabel = (m) => MONTHS[+m.slice(5, 7) - 1];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const css = (name) => getComputedStyle(document.querySelector('.hd')).getPropertyValue(name).trim();

  // Amounts keep the unit the deck used; rupee amounts collapse to lakh / crore for reading.
  function fmt(v, unit = '') {
    if (!isNum(v)) return '—';
    const u = unit.toLowerCase();
    const rs = (x) => (Math.abs(x) >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : Math.abs(x) >= 1e5 ? `₹${(x / 1e5).toFixed(1)} L` : '₹' + Math.round(x).toLocaleString('en-IN'));
    if (u.includes('crore')) return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
    if (u.includes('lakh')) return Math.abs(v) >= 100 ? `₹${(v / 100).toFixed(2)} Cr` : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
    if (u === '₹' || u === 'rs' || u === 'inr' || u === 'rupees') return rs(v);
    if (u === '%' || u.startsWith('%') || u.includes('percent')) return `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
    if (u.includes('/10') || u.includes('rating') || u.includes('score')) return v.toLocaleString('en-IN', { maximumFractionDigits: 1 });
    return v.toLocaleString('en-IN', { maximumFractionDigits: Number.isInteger(v) ? 0 : 1 });
  }
  const unitHint = (unit) => (!unit || /₹|lakh|crore|%|rs|inr|rupee/i.test(unit) ? '' : ` (${unit})`);
  function change(cur, prev, unit) {
    if (!isNum(cur) || !isNum(prev) || prev === 0) return null;
    if (/%/.test(unit || '')) { const d = cur - prev; return { up: d >= 0, text: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)} pts` }; }
    const r = cur / prev - 1; return { up: r >= 0, text: `${r >= 0 ? '▲' : '▼'} ${Math.abs(r * 100).toFixed(1)}%` };
  }

  // ---------- tooltip ----------
  const tip = $('tip');
  const showTip = (ev, title, rows) => {
    tip.replaceChildren(el('div', 't', title), ...rows.map(([c, k, v]) => { const r = el('div', 'r'); if (c) { const i = el('i'); i.style.cssText = `width:9px;height:9px;border-radius:2px;background:${c};display:inline-block`; r.append(i); } r.append(`${k}: `, el('b', null, v)); return r; }));
    tip.style.display = 'block'; tip.style.position = 'fixed';
    const w = tip.offsetWidth; tip.style.left = Math.min(ev.clientX + 14, innerWidth - w - 8) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
  };
  const hideTip = () => { tip.style.display = 'none'; };

  // ---------- charts ----------
  function monthlyChart(box, s) {
    const months = Object.keys(s.months).sort();
    const rows = months.map((m) => ({ m, ...s.months[m] }));
    const hasPrior = rows.some((r) => isNum(r.prior_year)), hasTarget = rows.some((r) => isNum(r.target));
    const W = Math.max(320, box.clientWidth || 520), H = 240, mt = 18, mb = 26;
    const vals = rows.flatMap((r) => [r.actual, r.prior_year, r.target]).filter(isNum);
    const y = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), d3.max(vals) * 1.12 || 1]).nice().range([H - mb, mt]);
    const ml = 12 + Math.max(...y.ticks(4).map((t) => fmt(t, s.unit).length)) * 6.6;
    const x = d3.scaleBand().domain(months).range([ml, W - 8]).padding(0.28);
    const xi = d3.scaleBand().domain(hasPrior ? ['prior_year', 'actual'] : ['actual']).range([0, x.bandwidth()]).padding(0.12);
    const c1 = css('--hd-s1'), c2 = css('--hd-s2'), ink = css('--color-fg') || '#2a241f', grid = css('--cds-chart-grid');
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img')
      .attr('aria-label', `${s.metric} by month`);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', ml).attr('x2', W - 8).attr('y1', y).attr('y2', y).attr('stroke', grid);
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', ml - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').text((t) => fmt(t, s.unit));
    svg.append('g').selectAll('text').data(months).join('text').attr('x', (m) => x(m) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(monLabel);
    const bars = rows.flatMap((r) => xi.domain().filter((k) => isNum(r[k])).map((k) => ({ r, k, v: r[k] })));
    svg.append('g').selectAll('rect').data(bars).join('rect')
      .attr('x', (b) => x(b.r.m) + xi(b.k)).attr('width', xi.bandwidth())
      .attr('y', (b) => Math.min(y(b.v), y(0))).attr('height', (b) => Math.max(1, Math.abs(y(0) - y(b.v))))
      .attr('rx', 3).attr('fill', (b) => (b.k === 'actual' ? c1 : c2))
      .on('mousemove', (ev, b) => showTip(ev, `${monLabel(b.r.m)} ${b.r.m.slice(0, 4)}`, [
        [c1, 'FY 2026–27', fmt(b.r.actual, s.unit)], ...(hasPrior ? [[c2, 'FY 2025–26', fmt(b.r.prior_year, s.unit)]] : []),
        ...(isNum(b.r.target) ? [[null, 'Target', fmt(b.r.target, s.unit)]] : [])]))
      .on('mouseleave', hideTip);
    if (hasTarget) {
      svg.append('g').selectAll('line').data(rows.filter((r) => isNum(r.target))).join('line')
        .attr('x1', (r) => x(r.m) - 3).attr('x2', (r) => x(r.m) + x.bandwidth() + 3).attr('y1', (r) => y(r.target)).attr('y2', (r) => y(r.target))
        .attr('stroke', ink).attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
    }
    // label the latest actual only
    const last = rows.filter((r) => isNum(r.actual)).pop();
    if (last) svg.append('text').attr('class', 'vlab').attr('text-anchor', 'middle').attr('x', x(last.m) + xi('actual') + xi.bandwidth() / 2).attr('y', y(Math.max(0, last.actual)) - 5).text(fmt(last.actual, s.unit));
    const lg = el('div', 'hd-legend');
    const item = (c, t, dash) => { const sp = el('span'); const i = el('i'); if (dash) i.style.cssText = `height:0;border-top:2px dashed ${c};width:14px;border-radius:0`; else i.style.background = c; sp.append(i, t); return sp; };
    lg.append(item(c1, 'FY 2026–27'));
    if (hasPrior) lg.append(item(c2, 'FY 2025–26'));
    if (hasTarget) lg.append(item(ink, 'Target', true));
    box.before(lg);
  }

  // ---------- division view ----------
  let DATA = null;
  function kpiTile(k) {
    const t = el('div', 'hd-kpi');
    const main = isNum(k.h1_fy27) ? k.h1_fy27 : k.fy26_full;
    t.append(el('span', 'lbl', k.name + unitHint(k.unit) + (!isNum(k.h1_fy27) && isNum(k.fy26_full) ? ' · FY 2025–26' : '')), el('span', 'val', fmt(main, k.unit)));
    if (isNum(k.h1_fy27)) {
      const sub = el('span', 'sub');
      if (isNum(k.h1_fy26)) { const c = change(k.h1_fy27, k.h1_fy26, k.unit); sub.append(`H1 last year ${fmt(k.h1_fy26, k.unit)} `); if (c) sub.append(el('span', 'chg ' + (c.up !== !!k.lower_better ? 'up' : 'down'), c.text)); }
      else if (isNum(k.fy26_full)) sub.append(`FY 2025–26 full year ${fmt(k.fy26_full, k.unit)}`);
      if (sub.childNodes.length) t.append(sub);
    }
    if (isNum(k.fy27_target) && isNum(k.h1_fy27) && k.fy27_target > 0) {
      const p = k.h1_fy27 / k.fy27_target;
      const bar = el('div', 'dv-bar'); const i = el('i'); i.style.width = Math.min(100, p * 100) + '%'; bar.append(i);
      t.append(bar, el('span', 'sub', `${(p * 100).toFixed(0)}% of the FY 2026–27 target, ${fmt(k.fy27_target, k.unit)}`));
    }
    if (k.note) t.append(el('span', 'sub', k.note));
    t.title = 'Source: ' + (k.source || '—') + (k.detail ? '\n' + k.detail : '');
    return t;
  }
  function table(b) {
    const card = el('div', 'hd-card'); card.append(el('h2', null, b.title));
    if (b.note) card.append(el('p', 'note', b.note));
    const wrap = el('div', 'dv-tbl'), tb = el('table'), th = tb.createTHead().insertRow(), body = tb.createTBody();
    if (b.text) { // a list without figures, such as a plan's milestones
      b.rows.forEach((r) => { body.insertRow().insertCell().textContent = r.label; });
      wrap.append(tb); card.append(wrap, el('p', 'note', 'Source: ' + (b.source || '—'))); th.remove(); return card;
    }
    const hasPrior = b.rows.some((r) => isNum(r.prior));
    ['', b.value_label || 'FY 2026–27', ...(hasPrior ? [b.prior_label || 'FY 2025–26', 'Change'] : [])].forEach((h, i) => { const c = el('th', i ? 'n' : '', h); th.append(c); });
    const add = (r, cls) => {
      const tr = body.insertRow(); if (cls) tr.className = cls;
      tr.insertCell().textContent = r.label;
      const v = tr.insertCell(); v.className = 'n'; v.textContent = fmt(r.value, b.unit);
      if (hasPrior) { const p = tr.insertCell(); p.className = 'n'; p.textContent = fmt(r.prior, b.unit); const c = tr.insertCell(); c.className = 'n'; const ch = change(r.value, r.prior, b.unit); c.textContent = ch ? ch.text : '—'; }
    };
    b.rows.forEach((r) => add(r, r.total_row ? 'total' : ''));
    if (b.total && b.rows.length > 1) {
      const sum = (f) => (b.rows.every((r) => !isNum(r[f])) ? null : d3.sum(b.rows, (r) => (isNum(r[f]) ? r[f] : 0)));
      add({ label: 'Total', value: sum('value'), prior: sum('prior') }, 'total');
    }
    wrap.append(tb); card.append(wrap, el('p', 'note', 'Source: ' + (b.source || '—')));
    return card;
  }
  function list(id, items) { $(id).replaceChildren(...(items || []).map((t) => el('li', null, t))); }

  // ---------- vehicle divisions: Sales, and Service (labour & parts) ----------
  const REGION_NAME = { KER: 'Kerala', TN: 'Tamil Nadu' };
  const regionText = (r) => (r || '').split(/\s*&\s*/).map((k) => `${REGION_NAME[k] || k} (${k})`).join(' & ');
  const vehicle = (d) => (((DATA.groups || []).find((g) => g.key === 'AUTO') || {}).divisions || []).includes(d.key);
  // what a figure is about, from its own name: service work (labour, spares, job cards, workshop) or sales
  const isService = (t) => /service|workshop|labou?r|job card|spare|parts|\bAMC\b|\bVAS\b|repair/i.test(t || '');
  // Honda's service units report through Tally: labour and parts per unit, Apr-Sep, from data/streams.csv
  const TALLY = { HONDA: 'KER', AMZES: 'TN' };
  let tally = null;
  const loadTally = () => tally || (tally = Promise.all(['streams', 'regions', 'companies'].map((f) => d3.csv(`data/${f}.csv`))).catch(() => null));
  async function tallyCards(d) {
    const got = await loadTally(); if (!got) return [];
    const [streams, regions, companies] = got, region = TALLY[d.key];
    const units = regions.filter((r) => r.region === region).map((r) => r.company);
    const name = (c) => ((companies.find((r) => r.company === c) || {}).name || c).replace(/^HD /, '');
    const H = { cur: ['2026-04', '2026-09'], pre: ['2025-04', '2025-09'] };
    const COLS = [['Labour & service charges', 'Labour'], ['Spare parts', 'Parts'], ['Accessories', 'Accessories'], ['AMC & warranty', 'AMC & warranty']];
    const tot = (c, stream, h) => streams.filter((r) => r.company === c && r.stream === stream && r.month >= H[h][0] && r.month <= H[h][1]).reduce((a, r) => a + +r.amount, 0);
    const both = units.filter((c) => tot(c, 'Labour & service charges', 'pre') > 0);
    const sumOf = (stream, h, list) => list.reduce((a, c) => a + tot(c, stream, h), 0);
    const kpi = (stream, label) => ({ name: `${label}, Apr–Sep (Tally, ${units.length} units)`, unit: '₹', h1_fy27: sumOf(stream, 'cur', units),
      h1_fy26: both.length ? sumOf(stream, 'pre', both) : null, note: both.length < units.length ? `Last year: the ${both.length} units with both years.` : null,
      source: 'TallyPrime service bill registers of the ' + REGION_NAME[region] + ' units (Sales & inventory)' });
    const tiles = el('div', 'hd-kpis dv-kpis'); tiles.append(kpiTile(kpi('Labour & service charges', 'Labour')), kpiTile(kpi('Spare parts', 'Parts (spares)')));
    const card = el('div', 'hd-card'); card.append(el('h2', null, `Labour and parts by unit, Apr–Sep 2026 · ${regionText(region)}`),
      el('p', 'note', 'Ex-GST, before discounts, from each unit\'s Tally service bill register. Change compares Apr–Sep 2025, where the unit has that year.'));
    const wrap = el('div', 'dv-tbl'), tb = el('table'), th = tb.createTHead().insertRow(), body = tb.createTBody();
    ['Unit', ...COLS.map((c) => c[1]), 'Total', 'Change'].forEach((h, i) => th.append(el('th', i ? 'n' : '', h)));
    const T = { cur: COLS.map(() => 0), tc: 0, tp: 0 };
    const row = (label, vals, cur, pre, cls) => {
      const tr = body.insertRow(); if (cls) tr.className = cls; tr.insertCell().textContent = label;
      vals.forEach((v) => { const c = tr.insertCell(); c.className = 'n'; c.textContent = fmt(v, '₹'); });
      const t = tr.insertCell(); t.className = 'n'; t.textContent = fmt(cur, '₹');
      const ch = change(cur, pre, '₹'), c = tr.insertCell(); c.className = 'n'; c.textContent = ch ? ch.text : '—';
    };
    units.forEach((c) => {
      const v = COLS.map(([s]) => tot(c, s, 'cur')), cur = d3.sum(v), pre = d3.sum(COLS, ([s]) => tot(c, s, 'pre'));
      v.forEach((x, i) => { T.cur[i] += x; }); T.tc += cur; if (pre) T.tp += cur;
      row(name(c), v, cur, pre || null);
    });
    row('Total', T.cur, T.tc, both.length ? d3.sum(both, (c) => d3.sum(COLS, ([s]) => tot(c, s, 'pre'))) : null, 'total');
    if (both.length < units.length) body.lastChild.cells[body.lastChild.cells.length - 1].title = `Change for the ${both.length} units with both years`;
    wrap.append(tb); card.append(wrap, el('p', 'note', 'Source: TallyPrime registers, as on the Sales & inventory dashboard.'));
    return [tiles, card];
  }
  // one section (Sales, or Service) of a vehicle division: its tiles, charts and tables
  function section(title, kpis, monthly, breakdowns, extra) {
    const sec = el('section', 'dv-section'); sec.append(el('h2', 'hd-section-title', title));
    if (kpis.length) { const t = el('div', 'hd-kpis dv-kpis'); t.append(...kpis.map(kpiTile)); sec.append(t); }
    (extra || []).forEach((x) => sec.append(x));
    const charts = el('div', 'dv-grid'), boxes = monthly.map((m) => {
      const card = el('div', 'hd-card'); card.append(el('h2', null, m.metric + unitHint(m.unit)));
      if (m.note) card.append(el('p', 'note', m.note));
      const box = el('div', 'dv-chart'); card.append(box, el('p', 'note', 'Source: ' + (m.source || '—'))); charts.append(card); return [box, m];
    });
    if (monthly.length) sec.append(charts);
    if (breakdowns.length) { const g = el('div', 'dv-grid'); g.append(...breakdowns.map(table)); sec.append(g); }
    if (!kpis.length && !monthly.length && !breakdowns.length && !(extra || []).length) sec.append(el('p', 'note dv-none', 'No figures for this yet in the division\'s reports.'));
    return [sec, boxes];
  }
  let shown = 0;
  async function showSplit(d) {
    const me = ++shown, split = $('d-split'), K = d.kpis || [], M = d.monthly || [], B = d.breakdowns || [];
    const svc = (x) => isService(x.name || x.metric || x.title);
    const extra = TALLY[d.key] ? await tallyCards(d) : [];
    if (me !== shown) return;   // another division was opened meanwhile
    const [s1, b1] = section('Sales', K.filter((x) => !svc(x)), M.filter((x) => !svc(x)), B.filter((x) => !svc(x)));
    const [s2, b2] = section('Service · labour & parts', K.filter(svc), M.filter(svc), B.filter(svc), extra);
    split.replaceChildren(s1, s2);
    b1.concat(b2).forEach(([box, m]) => monthlyChart(box, m));
  }

  function showDivision(d) {
    $('overview').hidden = true; $('division').hidden = false;
    $('d-eyebrow').textContent = (d.region ? regionText(d.region) + ' · ' : '') + (d.what || '');
    $('d-name').textContent = d.name;
    $('d-tagline').textContent = d.tagline || '';
    // a division with its own Tally dashboard links to it (data/divisions.json "dashboard": {href, label})
    const dl = $('d-dash'); dl.replaceChildren(); dl.hidden = !d.dashboard;
    if (d.dashboard) { const a = el('a', 'btn', d.dashboard.label); a.href = d.dashboard.href; dl.append(a); }
    const st = $('d-status'); st.className = 'dv-status ' + (d.status || 'plan'); st.textContent = d.status_label || '';
    // vehicle divisions read as Sales, then Service (labour & parts); the others keep one block
    const split = vehicle(d);
    $('d-split').replaceChildren(); $('d-split').hidden = !split;
    ['d-kpis', 'd-charts', 'd-tables'].forEach((id) => { $(id).hidden = split; });
    if (split) showSplit(d); else shown++;
    $('d-kpis').replaceChildren(...(split ? [] : (d.kpis || []).map(kpiTile))); if (!split) $('d-kpis').hidden = !(d.kpis || []).length;
    $('d-charts').replaceChildren();
    // lay out every card first, so each chart is drawn at its final width
    const boxes = (split ? [] : (d.monthly || [])).map((s) => {
      const card = el('div', 'hd-card'); card.append(el('h2', null, s.metric + unitHint(s.unit)));
      if (s.note) card.append(el('p', 'note', s.note));
      const box = el('div', 'dv-chart'); card.append(box, el('p', 'note', 'Source: ' + (s.source || '—')));
      $('d-charts').append(card); return [box, s];
    });
    boxes.forEach(([box, s]) => monthlyChart(box, s));
    $('d-tables').replaceChildren(...(split ? [] : (d.breakdowns || []).map(table)));
    list('d-high', d.highlights); list('d-conc', d.concerns); list('d-act', d.actions); list('d-gaps', d.gaps);
    $('d-files').replaceChildren(...(d.files || []).map((f) => { const li = el('li', null, f.title + ' '); if (f.period) li.append(el('small', null, `(${f.period})`)); return li; }));
  }
  // The overview: every division, or one group's divisions (a consolidation: data/divisions.json "groups").
  function showOverview(group) {
    $('division').hidden = true; $('overview').hidden = false;
    const divs = group ? group.divisions.map((k) => DATA.divisions.find((x) => x.key === k)).filter(Boolean) : DATA.divisions;
    const head = $('overview-head');
    if (group) { head.hidden = false; $('g-name').textContent = group.name; $('g-what').textContent = group.what || ''; $('g-count').textContent = `${divs.length} division${divs.length === 1 ? '' : 's'}`; }
    else head.hidden = true;
    $('overview').replaceChildren(...divs.map((d) => {
      const c = el('button', 'dv-card'); c.type = 'button';
      const row = el('div', 'row'); row.append(el('span', 'nm', d.name), el('span', 'dv-status ' + (d.status || 'plan'), d.status_label || ''));
      c.append(row, el('span', 'what', (d.region ? d.region + ' · ' : '') + (d.what || '')));
      if (d.headline) c.append(el('span', 'big', isNum(d.headline.value) ? fmt(d.headline.value, d.headline.unit) : d.headline.text || '—'), el('span', 'cap', d.headline.caption || ''));
      c.addEventListener('click', () => { location.hash = d.key; });
      return c;
    }));
  }
  function route() {
    const key = decodeURIComponent(location.hash.slice(1));
    const d = DATA.divisions.find((x) => x.key === key);
    const g = key.startsWith('g=') ? (DATA.groups || []).find((x) => x.key === key.slice(2)) : null;
    document.querySelectorAll('.dv-chip').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.key === (d ? d.key : g ? 'g=' + g.key : ''))));
    hideTip();
    if (d) showDivision(d); else showOverview(g);
  }

  fetch('data/divisions.json').then((r) => r.json()).then((data) => {
    // Only the divisions the signed-in account may see (Settings > People sets each account's divisions).
    const may = (k) => !window.MGAuth || MGAuth.canSee(k);
    data.divisions = (data.divisions || []).filter((d) => may(d.key));
    data.groups = (data.groups || []).map((g) => ({ ...g, divisions: (g.divisions || []).filter(may) })).filter((g) => g.divisions.length);
    DATA = data;
    if (data.takeaway) $('takeaway').textContent = data.takeaway;
    const chip = (key, label) => { const b = el('button', 'dv-chip', label); b.type = 'button'; b.dataset.key = key; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { location.hash = key; if (!key) history.replaceState(null, '', location.pathname); route(); }); return b; };
    const gchips = (data.groups || []).map((g) => { const b = chip('g=' + g.key, g.name); b.classList.add('grp'); return b; });
    $('chips').replaceChildren(chip('', 'All divisions'), ...gchips, ...data.divisions.map((d) => chip(d.key, d.name)));
    addEventListener('hashchange', route);
    let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(route, 200); });
    route();
  }).catch(() => { $('overview').replaceChildren(el('p', 'note', 'The division data could not be loaded. Serve the folder over http (see README).')); });
})();
