const num = (x) => +x || 0;
dash.calc('kpis', {
  inputs: ['monthly'],
  title: 'Headline figures by company and year',
  description: 'Sums each monthly column per company and financial year, with ALL for the group and for all years; average bill = service gross / service jobs; discount rate = discount / (net + discount); last month vs the one before.',
  fn: (monthly) => {
    const sum = (rows) => {
      const s = (k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
      const byMonth = {};
      rows.forEach(r => { byMonth[r.month] = (byMonth[r.month] || 0) + (+r.gross || 0); });
      const ms = Object.keys(byMonth).sort();
      const last = ms[ms.length - 1], prev = ms[ms.length - 2];
      return {
        gross: s('gross'), taxable: s('taxable'), gst: s('gst'), discount: s('discount'),
        discount_rate: s('discount') / (s('taxable') + s('discount')),
        invoices: s('invoices'), service_jobs: s('service_jobs'),
        avg_job: s('service_gross') / s('service_jobs'),
        last_month: last, last_gross: byMonth[last], prev_month: prev,
        mom: prev ? byMonth[last] / byMonth[prev] - 1 : null
      };
    };
    const codes = ['ALL', ...new Set(monthly.map(r => r.company))], fys = ['ALL', ...new Set(monthly.map(r => r.fy))];
    const out = [];
    codes.forEach(c => fys.forEach(f => {
      const rows = monthly.filter(r => (c === 'ALL' || r.company === c) && (f === 'ALL' || r.fy === f));
      if (rows.length) out.push({ company: c, fy: f, ...sum(rows) });
    }));
    return out;
  }
});
dash.calc('vt_avg', {
  inputs: ['voucher_types'],
  title: 'Average bill by voucher type',
  description: 'Gross value divided by number of bills, per company, year and voucher type.',
  fn: (voucher_types) => voucher_types.map(r => ({ company: r.company, fy: r.fy, voucher_type: r.voucher_type, avg_bill: +r.gross / +r.invoices }))
});
// Subtotals (per company and year) and grand totals (ALL), used by the tables' total rows.
const totalsBy = (rows, vals) => {
  const out = {};
  rows.forEach(r => [[r.company, r.fy], [r.company, 'ALL'], ['ALL', r.fy], ['ALL', 'ALL']].forEach(([c, f]) => {
    const k = c + '|' + f, o = out[k] || (out[k] = { company: c, fy: f, rows: 0 });
    o.rows++; vals.forEach(v => { o[v] = (o[v] || 0) + (+r[v] || 0); });
  }));
  return Object.values(out);
};
dash.calc('vt_totals', {
  inputs: ['voucher_types'],
  title: 'Voucher type totals',
  description: 'Bills, gross and net summed per company and year (subtotals) and for ALL (grand totals); average bill = gross / bills.',
  fn: (voucher_types) => totalsBy(voucher_types, ['invoices', 'gross', 'taxable']).map(o => ({ ...o, avg_bill: o.gross / o.invoices }))
});
dash.calc('item_totals', {
  inputs: ['items'],
  title: 'Top items totals',
  description: 'Quantity and value of the listed top items, summed per company and year (subtotals) and for ALL (grand totals).',
  fn: (items) => totalsBy(items, ['qty', 'value'])
});
dash.calc('company_totals', {
  inputs: ['companies', 'coverage'],
  title: 'Companies totals',
  description: 'Bills and gross summed across the companies loaded, with requested files received out of required.',
  fn: (companies, coverage) => [{
    company: 'ALL', companies: companies.length,
    bills: companies.reduce((a, r) => a + (+r.bills || 0), 0), gross: companies.reduce((a, r) => a + (+r.gross || 0), 0),
    received: coverage.reduce((a, r) => a + r.received, 0), required: coverage.reduce((a, r) => a + r.required, 0)
  }]
});
dash.calc('coverage', {
  inputs: ['completeness'],
  title: 'Requested files received',
  description: 'Per company, how many of the six requested files are marked Received.',
  fn: (completeness) => {
    const by = {};
    completeness.forEach(r => { by[r.company] = by[r.company] || { company: r.company, received: 0, required: 0 }; by[r.company].required++; if (r.status === 'Received') by[r.company].received++; });
    return Object.values(by);
  }
});

const inr = (v) => {
  const a = Math.abs(v), sg = v < 0 ? '−' : '';
  if (a >= 1e7) return sg + '₹' + (a / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return sg + '₹' + (a / 1e5).toFixed(1) + ' L';
  if (a >= 1e3) return sg + '₹' + (a / 1e3).toFixed(1) + 'K';
  return sg + '₹' + Math.round(a);
};
const inrFull = (v) => '₹' + Math.round(v).toLocaleString('en-IN');
const cnt = (v) => Math.round(v).toLocaleString('en-IN');
const pct = d3.format('.1%');
const monName = (m) => d3.utcFormat('%b')(new Date(m + '-01'));
const dayFmt = (d) => d3.utcFormat('%-d %b %Y')(new Date(d));
// Series colours come from the group palette (dashboard.css), so light and dark both follow it.
const SER = ['var(--hd-s1)', 'var(--hd-s2)', 'var(--hd-s3)', 'var(--hd-s4)', 'var(--hd-s5)', 'var(--hd-s6)'];
const STREAMS = ['Spare parts', 'Accessories', 'Labour & service charges', 'AMC & warranty', 'Branch transfers', 'Other sales'];

// The company filter lives in the page: every dataset carries a `company` column.
const picked = () => dash.params().company || null;
const pickedFy = () => dash.params().fy || null;
const rowsOf = (id) => {
  const d = dash.data(id); if (d.status !== 'ok') return [];
  const c = picked(), f = pickedFy();
  return d.data.filter(r => (!c || r.company === c) && (!f || r.fy === undefined || r.fy === f));
};
const fyLabel = (f) => 'FY ' + f.replace('-', '–');
const whereOf = (c, f) => 'company=' + encodeURIComponent(c) + '&fy=' + encodeURIComponent(f);
const sumBy = (rows, keys, vals) => {
  const m = new Map();
  rows.forEach(r => {
    const k = keys.map(x => r[x]).join('\u0001');
    const o = m.get(k) || Object.fromEntries(keys.map(x => [x, r[x]]).concat(vals.map(v => [v, 0])));
    vals.forEach(v => { o[v] += num(r[v]); });
    m.set(k, o);
  });
  return [...m.values()];
};
const sel = document.getElementById('company-sel');
sel.addEventListener('change', () => dash.setParams({ company: sel.value || null }));
const fySel = document.getElementById('fy-sel');
fySel.addEventListener('change', () => dash.setParams({ fy: fySel.value || null }));

function tipFor(box) {
  let t = box.querySelector('.hd-tip');
  if (!t) { t = document.createElement('div'); t.className = 'hd-tip'; box.appendChild(t); }
  return {
    show(ev, title, rows) {
      t.replaceChildren();
      const h = document.createElement('div'); h.className = 't'; h.textContent = title; t.appendChild(h);
      rows.forEach(([c, n, v]) => {
        const r = document.createElement('div'); r.className = 'r';
        if (c) { const i = document.createElement('i'); i.style.background = c; r.appendChild(i); }
        const s = document.createElement('span'); s.textContent = n; r.appendChild(s);
        const b = document.createElement('b'); b.textContent = v; r.appendChild(b);
        t.appendChild(r);
      });
      t.style.display = 'block';
      const bb = box.getBoundingClientRect(), [x, y] = [ev.clientX - bb.left, ev.clientY - bb.top];
      const w = t.offsetWidth, hh = t.offsetHeight;
      t.style.left = Math.max(0, Math.min(bb.width - w, x + 12 > bb.width - w ? x - w - 12 : x + 12)) + 'px';
      t.style.top = Math.max(0, y - hh - 8) + 'px';
    },
    hide() { t.style.display = 'none'; }
  };
}
function measure(svg, strs) {
  const t = svg.append('text');
  let m = 0; strs.forEach(s => { t.text(s); m = Math.max(m, t.node().getComputedTextLength()); });
  t.remove(); return m;
}
function fail(el) { el.replaceChildren(); const d = document.createElement('div'); d.className = 'hd-fail'; d.textContent = 'Failed to load'; el.appendChild(d); }
function gate(el, id) {
  const d = dash.data(id);
  if (d.status === 'error' || d.status === 'connect') { el.classList.remove('dash-skeleton'); fail(el); return false; }
  if (d.status !== 'ok') { el.replaceChildren(); return false; }
  el.classList.remove('dash-skeleton');
  return true;
}
function newSvg(el, h) {
  el.replaceChildren();
  const W = el.clientWidth || 600;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', h).attr('viewBox', `0 0 ${W} ${h}`);
  return { svg, W };
}
function yAxis(g, y, W, ml, fmt) {
  y.ticks(4).forEach(t => {
    g.append('line').attr('x1', ml).attr('x2', W).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)');
    g.append('text').attr('x', ml - 6).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt(t));
  });
}
function legend(el, items) {
  el.replaceChildren();
  items.forEach(([c, n]) => { const s = document.createElement('span'); const i = document.createElement('i'); i.style.background = c; s.appendChild(i); s.appendChild(document.createTextNode(n)); el.appendChild(s); });
}
function cell(tr, text, cls) { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; tr.appendChild(td); return td; }

function drawFilter() {
  const c = dash.data('companies');
  const list = c.status === 'ok' ? c.data : [];
  if (document.activeElement !== sel) {
    sel.replaceChildren(new Option('All companies', ''), ...list.map(r => new Option(`${r.name} (${r.company})`, r.company)));
    sel.value = picked() || '';
  }
  const m = dash.data('monthly'), fys = [...new Set((m.status === 'ok' ? m.data : []).map(r => r.fy))].sort().reverse();
  if (document.activeElement !== fySel) {
    fySel.replaceChildren(new Option(fys.length > 1 ? 'All years' : 'All years loaded', ''), ...fys.map(f => new Option(fyLabel(f), f)));
    fySel.value = pickedFy() || '';
  }
  const note = document.getElementById('scope-note');
  note.textContent = c.status === 'ok' ? `${list.length} of the group's companies loaded so far · more appear as their exports arrive` : '';
  // Headline marks point at the picked company's row of the calculation.
  document.querySelectorAll('.hd-kpis [data-source="kpis"]').forEach(e => { e.dataset.where = whereOf(picked() || 'ALL', pickedFy() || 'ALL'); });
}

function drawKpis() {
  const k = dash.data('kpis');
  const vals = document.querySelectorAll('.hd-kpis [data-source="kpis"]');
  const tk = document.getElementById('takeaway'), sub = document.getElementById('sub-gross');
  const r = k.status === 'ok' ? k.data.find(x => x.company === (picked() || 'ALL') && x.fy === (pickedFy() || 'ALL')) : null;
  if (!r) {
    vals.forEach(e => { e.textContent = '—'; });
    if (k.status === 'error') { vals.forEach(e => e.classList.remove('dash-skeleton')); tk.textContent = ''; }
    return;
  }
  const f = { gross: inr, taxable: inr, gst: inr, discount: inr, service_jobs: cnt, avg_job: inrFull, discount_rate: pct };
  vals.forEach(e => { e.classList.remove('dash-skeleton'); e.textContent = f[e.dataset.field](r[e.dataset.field]); });
  const lm = monName(r.last_month), pm = r.prev_month ? monName(r.prev_month) : '';
  sub.replaceChildren();
  if (r.mom != null) {
    sub.append(`${lm} ${inr(r.last_gross)} · `);
    const s = document.createElement('span'); s.className = r.mom >= 0 ? 'hd-up' : 'hd-down';
    s.textContent = (r.mom >= 0 ? '+' : '−') + pct(Math.abs(r.mom)); sub.appendChild(s);
    sub.append(` vs ${pm}`);
  }
  const where = whereOf(r.company, r.fy);
  const b = (t, field) => { const e = document.createElement('b'); e.textContent = t; e.dataset.source = 'kpis'; e.dataset.field = field; e.dataset.where = where; return e; };
  const comps = dash.data('companies'), names = comps.status === 'ok' ? comps.data : [];
  const who = picked() ? ((names.find(x => x.company === picked()) || {}).name || picked()) : (names.length === 1 ? names[0].name + ', the only company loaded so far,' : 'The group');
  tk.replaceChildren(
    `${who} billed `, b(inr(r.gross), 'gross'), ' including GST, with ', b(cnt(r.service_jobs), 'service_jobs'), ' service jobs. ',
    ...(r.mom != null ? [lm + ' closed at ', b(inr(r.last_gross), 'last_gross'), ', ', b((r.mom >= 0 ? 'up ' : 'down ') + pct(Math.abs(r.mom)), 'mom'), ' on ' + pm + '. '] : []),
    'Discounts took ', b(pct(r.discount_rate), 'discount_rate'), ' of revenue before discount.'
  );
}

function drawMonthly() {
  const el = document.getElementById('ch-monthly');
  if (!gate(el, 'monthly')) return;
  const rows = sumBy(rowsOf('monthly'), ['month'], ['gross', 'invoices', 'service_jobs']).sort((a, b) => a.month < b.month ? -1 : 1)
    .map(r => ({ m: r.month, g: r.gross, inv: r.invoices, sj: r.service_jobs }));
  const H = 260, { svg, W } = newSvg(el, H);
  if (!rows.length) return;
  const y = d3.scaleLinear([0, d3.max(rows, r => r.g) * 1.12], [H - 24, 8]).nice();
  const ml = measure(svg, y.ticks(4).map(inr)) + 10;
  const x = d3.scaleBand(rows.map(r => r.m), [ml, W]).padding(0.3);
  yAxis(svg, y, W, ml, inr);
  const tip = tipFor(el);
  svg.selectAll('rect.b').data(rows).join('rect').attr('class', 'b')
    .attr('x', r => x(r.m) + Math.max(0, (x.bandwidth() - 32) / 2)).attr('width', Math.min(32, x.bandwidth()))
    .attr('y', r => y(r.g)).attr('height', r => y(0) - y(r.g)).attr('rx', 4).attr('fill', SER[0])
    .on('mousemove', (ev, r) => tip.show(ev, d3.utcFormat('%B %Y')(new Date(r.m + '-01')), [[null, 'Gross', inrFull(r.g)], [null, 'Bills', cnt(r.inv)], [null, 'Service jobs', cnt(r.sj)]]))
    .on('mouseleave', () => tip.hide());
  svg.selectAll('text.vlab').data(rows).join('text').attr('class', 'vlab').attr('text-anchor', 'middle')
    .attr('x', r => x(r.m) + x.bandwidth() / 2).attr('y', r => y(r.g) - 5).text(r => inr(r.g));
  svg.selectAll('text.xl').data(rows).join('text').attr('class', 'xl').attr('text-anchor', 'middle')
    .attr('x', r => x(r.m) + x.bandwidth() / 2).attr('y', H - 6).text(r => monName(r.m));
}

function drawMix() {
  const el = document.getElementById('ch-mix'), lg = document.getElementById('lg-mix');
  if (!gate(el, 'streams')) { lg.replaceChildren(); return; }
  const col = (s) => SER[STREAMS.indexOf(s)];
  legend(lg, STREAMS.map(s => [col(s), s]));
  const data = rowsOf('streams');
  const months = [...new Set(data.map(r => r.month))].sort();
  const wide = months.map(m => { const o = { m }; STREAMS.forEach(s => o[s] = 0); return o; });
  data.forEach(r => { if (STREAMS.includes(r.stream)) wide[months.indexOf(r.month)][r.stream] += num(r.amount); });
  const H = 260, { svg, W } = newSvg(el, H);
  if (!months.length) return;
  const stack = d3.stack().keys(STREAMS)(wide);
  const y = d3.scaleLinear([0, d3.max(wide, o => d3.sum(STREAMS, s => o[s]))], [H - 24, 8]).nice();
  const ml = measure(svg, y.ticks(4).map(inr)) + 10;
  const x = d3.scaleBand(months, [ml, W]).padding(0.3);
  yAxis(svg, y, W, ml, inr);
  const tip = tipFor(el), bw = Math.min(32, x.bandwidth()), off = Math.max(0, (x.bandwidth() - 32) / 2);
  stack.forEach(layer => {
    svg.append('g').selectAll('rect').data(layer).join('rect')
      .attr('x', p => x(p.data.m) + off).attr('width', bw)
      .attr('y', p => y(p[1])).attr('height', p => Math.max(0, y(p[0]) - y(p[1]) - 1)).attr('fill', col(layer.key))
      .on('mousemove', (ev, p) => tip.show(ev, d3.utcFormat('%B %Y')(new Date(p.data.m + '-01')), STREAMS.slice().reverse().map(s => [col(s), s, inr(p.data[s])])))
      .on('mouseleave', () => tip.hide());
  });
  svg.selectAll('text.xl').data(months).join('text').attr('class', 'xl').attr('text-anchor', 'middle')
    .attr('x', m => x(m) + x.bandwidth() / 2).attr('y', H - 6).text(monName);
}

function drawDaily() {
  const el = document.getElementById('ch-daily');
  if (!gate(el, 'daily')) return;
  const rows = sumBy(rowsOf('daily'), ['date'], ['gross', 'invoices', 'service_jobs'])
    .map(r => ({ d: new Date(r.date), g: r.gross, inv: r.invoices, sj: r.service_jobs }));
  const H = 260, { svg, W } = newSvg(el, H);
  if (!rows.length) return;
  const y = d3.scaleLinear([0, d3.max(rows, r => r.g)], [H - 24, 8]).nice();
  const ml = measure(svg, y.ticks(4).map(inr)) + 10;
  const x0 = d3.utcDay.floor(d3.min(rows, r => r.d)), x1 = d3.utcDay.offset(d3.max(rows, r => r.d), 1);
  const x = d3.scaleUtc([x0, x1], [ml, W]);
  const bw = Math.max(1, (W - ml) / d3.utcDay.count(x0, x1) - 1);
  yAxis(svg, y, W, ml, inr);
  const tip = tipFor(el);
  svg.selectAll('rect').data(rows).join('rect').attr('x', r => x(r.d)).attr('width', bw)
    .attr('y', r => y(r.g)).attr('height', r => y(0) - y(r.g)).attr('rx', Math.min(2, bw / 2)).attr('fill', SER[0])
    .on('mousemove', (ev, r) => tip.show(ev, d3.utcFormat('%a %-d %b')(r.d), [[null, 'Gross', inrFull(r.g)], [null, 'Bills', cnt(r.inv)], [null, 'Service jobs', cnt(r.sj)]]))
    .on('mouseleave', () => tip.hide());
  d3.utcMonth.range(d3.utcMonth.ceil(x0), x1).concat([x0]).forEach(m => {
    svg.append('text').attr('x', x(m) + 2).attr('y', H - 6).text(d3.utcFormat('%b')(m));
  });
}

function drawHeads() {
  const el = document.getElementById('ch-heads'), lg = document.getElementById('lg-heads');
  if (!gate(el, 'heads')) { lg.replaceChildren(); return; }
  const col = (g) => g === 'Discounts' ? 'var(--hd-crit)' : SER[STREAMS.indexOf(g)];
  const rows = sumBy(rowsOf('heads'), ['head', 'group'], ['amount'])
    .map(r => ({ h: r.head.charAt(0) + r.head.slice(1).toLowerCase(), g: r.group, v: r.amount })).sort((a, b) => b.v - a.v);
  const groups = STREAMS.filter(s => rows.some(r => r.g === s)).concat(rows.some(r => r.g === 'Discounts') ? ['Discounts'] : []);
  legend(lg, groups.map(g => [col(g), g]));
  const rh = 20, H = Math.max(40, rows.length * rh + 10), { svg, W } = newSvg(el, H);
  if (!rows.length) return;
  const ml = Math.min(W * 0.45, measure(svg, rows.map(r => r.h)) + 10);
  const vlw = measure(svg, rows.map(r => inr(r.v))) + 8;
  const x = d3.scaleLinear([d3.min(rows, r => Math.min(0, r.v)), d3.max(rows, r => r.v)], [ml + vlw, W - vlw]);
  const tip = tipFor(el);
  rows.forEach((r, i) => {
    const yy = i * rh + 5;
    svg.append('text').attr('x', ml - 8).attr('y', yy + rh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.h);
    svg.append('rect').attr('x', Math.min(x(0), x(r.v))).attr('width', Math.max(1, Math.abs(x(r.v) - x(0))))
      .attr('y', yy + 3).attr('height', rh - 6).attr('rx', 4).attr('fill', col(r.g))
      .on('mousemove', ev => tip.show(ev, r.h, [[col(r.g), r.g, inrFull(r.v)]])).on('mouseleave', () => tip.hide());
    svg.append('text').attr('class', 'vlab').attr('x', r.v >= 0 ? x(r.v) + 5 : x(r.v) - 5).attr('text-anchor', r.v >= 0 ? 'start' : 'end')
      .attr('y', yy + rh / 2).attr('dy', '0.32em').text(inr(r.v));
  });
  svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H).attr('stroke', 'var(--cds-chart-axis)');
  el.style.minHeight = H + 'px';
}

// Paired bars: for each key, one bar per series (e.g. last year and this year), values from series[i].v(key).
function pairedBars(el, keys, series, label) {
  const H = 240, { svg, W } = newSvg(el, H);
  if (!keys.length) return;
  const y = d3.scaleLinear([0, d3.max(keys, k => d3.max(series, s => s.v(k))) * 1.12 || 1], [H - 24, 8]).nice();
  const ml = measure(svg, y.ticks(4).map(inr)) + 10;
  const x = d3.scaleBand(keys, [ml, W]).padding(0.25), xi = d3.scaleBand(series.map((s, i) => i), [0, x.bandwidth()]).padding(0.08);
  yAxis(svg, y, W, ml, inr);
  const tip = tipFor(el);
  keys.forEach(k => series.forEach((s, i) => {
    const v = s.v(k);
    svg.append('rect').attr('x', x(k) + xi(i)).attr('width', xi.bandwidth()).attr('y', y(Math.max(0, v))).attr('height', Math.abs(y(0) - y(v)))
      .attr('rx', 3).attr('fill', s.c)
      .on('mousemove', ev => tip.show(ev, label(k), series.map(t => [t.c, t.n, inrFull(t.v(k))]))).on('mouseleave', () => tip.hide());
  }));
  const short = (t) => t.length > 14 ? t.slice(0, 13) + '…' : t;
  svg.selectAll('text.xl').data(keys).join('text').attr('class', 'xl').attr('text-anchor', 'middle')
    .attr('x', k => x(k) + x.bandwidth() / 2).attr('y', H - 6).text(k => short(label(k)));
}
const chg = (a, b) => (a ? b / a - 1 : null);
function chgCell(tr, a, b) {
  const v = chg(a, b), td = cell(tr, v == null ? '—' : (v >= 0 ? '+' : '−') + pct(Math.abs(v)), 'num');
  if (v != null) td.classList.add(v >= 0 ? 'hd-up' : 'hd-down');
  return td;
}
const nameOf = (code) => { const c = dash.data('companies'); return ((c.status === 'ok' ? c.data : []).find(r => r.company === code) || {}).name || code; };

// Year on year: Apr-Sep of each year, for the companies that have both.
function drawYoy() {
  const el = document.getElementById('ch-yoy'), lg = document.getElementById('lg-yoy');
  const tb = document.querySelector('#tb-yoy tbody'), tf = document.querySelector('#tb-yoy tfoot'), wait = document.getElementById('yoy-wait');
  tb.replaceChildren(); tf.replaceChildren(); lg.replaceChildren(); wait.textContent = '';
  if (!gate(el, 'monthly')) return;
  const PRE = ['2025-04', '2025-09'], CUR = ['2026-04', '2026-09'];
  const inR = (m, r) => m >= r[0] && m <= r[1];
  const all = dash.data('monthly').data.filter(r => !picked() || r.company === picked());
  const by = {};
  all.forEach(r => {
    const side = inR(r.month, PRE) ? 0 : inR(r.month, CUR) ? 1 : -1; if (side < 0) return;
    const o = by[r.company] || (by[r.company] = [{ g: 0, j: 0, m: {} }, { g: 0, j: 0, m: {} }]);
    o[side].g += num(r.gross); o[side].j += num(r.service_jobs); o[side].m[r.month.slice(5)] = (o[side].m[r.month.slice(5)] || 0) + num(r.gross);
  });
  const pairs = Object.keys(by).filter(c => by[c][0].g && by[c][1].g).sort();
  const cm = dash.data('completeness');
  const missing = (cm.status === 'ok' ? cm.data : []).filter(r => r.file === 'Sales register FY 2025-26' && r.status !== 'Received' && (!picked() || r.company === picked())).map(r => nameOf(r.company));
  if (missing.length) wait.textContent = `Waiting for the FY 2025–26 register from ${missing.join(', ')}.`;
  if (!pairs.length) { el.replaceChildren(); const d = document.createElement('div'); d.className = 'hd-wait'; d.textContent = 'No company has both years loaded yet.'; el.appendChild(d); return; }
  const months = ['04', '05', '06', '07', '08', '09'];
  const sumM = (side, mm) => pairs.reduce((a, c) => a + (by[c][side].m[mm] || 0), 0);
  const ser = [{ n: 'Apr–Sep 2025', c: SER[5], v: k => sumM(0, k) }, { n: 'Apr–Sep 2026', c: SER[0], v: k => sumM(1, k) }];
  legend(lg, ser.map(s => [s.c, s.n]));
  lg.append(pairs.length === 1 ? nameOf(pairs[0]) : `${pairs.length} companies`);
  pairedBars(el, months, ser, k => monName('2026-' + k));
  const T = [{ g: 0, j: 0 }, { g: 0, j: 0 }];
  pairs.forEach(c => {
    const [p, q] = by[c]; T[0].g += p.g; T[1].g += q.g; T[0].j += p.j; T[1].j += q.j;
    const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(c);
    cell(tr, nameOf(c)); cell(tr, inr(p.g), 'num'); cell(tr, inr(q.g), 'num'); chgCell(tr, p.g, q.g);
    const td = cell(tr, `${cnt(p.j)} → ${cnt(q.j)}`, 'num hide-sm nw'); td.title = 'Service jobs, 2025 → 2026';
    tb.appendChild(tr);
  });
  if (pairs.length > 1) {
    const tr = Object.assign(document.createElement('tr'), { className: 'hd-total' });
    const th = document.createElement('th'); th.scope = 'row'; th.textContent = 'Total'; tr.appendChild(th);
    cell(tr, inr(T[0].g), 'num'); cell(tr, inr(T[1].g), 'num'); chgCell(tr, T[0].g, T[1].g); cell(tr, `${cnt(T[0].j)} → ${cnt(T[1].j)}`, 'num hide-sm nw');
    tf.appendChild(tr);
  }
}

// Inventory: closing stock at the two balance dates, per company (or per category for one company).
function drawStock() {
  const el = document.getElementById('ch-stock'), lg = document.getElementById('lg-stock');
  const tb = document.querySelector('#tb-stock tbody'), tf = document.querySelector('#tb-stock tfoot');
  tb.replaceChildren(); tf.replaceChildren(); lg.replaceChildren();
  if (!gate(el, 'stock')) return;
  const rows = rowsOf('stock'), dates = [...new Set(rows.map(r => r.as_at))].sort();
  const [d0, d1] = [dates[0], dates[dates.length - 1]];
  const keyOf = picked() ? (r => r.category) : (r => r.company);
  document.getElementById('stock-key').textContent = picked() ? 'Category' : 'Company';
  const by = {};
  rows.forEach(r => {
    const o = by[keyOf(r)] || (by[keyOf(r)] = { a: 0, b: 0, idle: 0, idleKnown: false });
    if (r.as_at === d0) o.a += num(r.value);
    if (r.as_at === d1) { o.b += num(r.value); if (r.idle_value !== '') { o.idle += num(r.idle_value); o.idleKnown = true; } }
  });
  const keys = Object.keys(by).sort((p, q) => by[q].b - by[p].b);
  if (!keys.length) { el.replaceChildren(); return; }
  const dl = (d) => dayFmt(d);
  const ser = [{ n: dl(d0), c: SER[5], v: k => by[k].a }, { n: dl(d1), c: SER[2], v: k => by[k].b }];
  legend(lg, ser.map(s => [s.c, s.n]));
  pairedBars(el, keys, ser, k => picked() ? k : nameOf(k));
  const T = { a: 0, b: 0, idle: 0 };
  keys.forEach(k => {
    const o = by[k]; T.a += o.a; T.b += o.b; T.idle += o.idle;
    const tr = document.createElement('tr'); tr.dataset.key = encodeURIComponent(k);
    cell(tr, picked() ? k : nameOf(k)); cell(tr, inr(o.a), 'num'); cell(tr, inr(o.b), 'num'); chgCell(tr, o.a, o.b);
    cell(tr, o.idleKnown ? `${inr(o.idle)} · ${pct(o.b ? o.idle / o.b : 0)}` : '—', 'num nw');
    tb.appendChild(tr);
  });
  const tr = Object.assign(document.createElement('tr'), { className: 'hd-total' });
  const th = document.createElement('th'); th.scope = 'row'; th.textContent = 'Total'; tr.appendChild(th);
  cell(tr, inr(T.a), 'num'); cell(tr, inr(T.b), 'num'); chgCell(tr, T.a, T.b); cell(tr, `${inr(T.idle)} · ${pct(T.b ? T.idle / T.b : 0)}`, 'num nw');
  tf.appendChild(tr);
}

function drawIdle() {
  const tb = document.querySelector('#tb-idle tbody'), sum = document.getElementById('idle-sum');
  tb.replaceChildren(); sum.textContent = '';
  const st = dash.data('stock_items'); if (st.status !== 'ok') return;
  const rows = rowsOf('stock_items'), last = rows.map(r => r.as_at).sort().pop();
  const idle = rows.filter(r => r.as_at === last && r.sold_qty !== '' && num(r.sold_qty) <= 0 && num(r.value) > 0).sort((p, q) => num(q.value) - num(p.value));
  const s = rowsOf('stock').filter(r => r.as_at === last && r.idle_value !== '');
  const iv = s.reduce((a, r) => a + num(r.idle_value), 0), ii = s.reduce((a, r) => a + num(r.idle_items), 0), tv = s.reduce((a, r) => a + num(r.value), 0);
  if (s.length) sum.textContent = `${cnt(ii)} lines worth ${inr(iv)} (${pct(tv ? iv / tv : 0)} of stock) had no sale from April to September. The 40 costliest are listed.`;
  idle.slice(0, 40).forEach(r => {
    const tr = document.createElement('tr'); tr.dataset.key = [r.company, r.part_no].map(encodeURIComponent).join(',');
    cell(tr, r.company, 'hide-sm'); cell(tr, r.item); cell(tr, r.part_no, 'part hide-sm'); cell(tr, r.category, 'hide-sm');
    cell(tr, cnt(num(r.qty)), 'num'); cell(tr, inrFull(num(r.value)), 'num');
    tb.appendChild(tr);
  });
}

// A total row: marked cell by cell against a totals calculation, so each figure is checkable.
function totalRow(tbody, cls, calcId, where, label, cells, span) {
  const tr = document.createElement('tr'); tr.className = cls;
  const th = document.createElement('th'); th.scope = 'row'; th.colSpan = span; th.textContent = label; tr.appendChild(th);
  cells.forEach(([text, field, c]) => {
    const td = cell(tr, text, c);
    if (field) { td.dataset.source = calcId; td.dataset.field = field; td.dataset.where = where; }
  });
  tbody.appendChild(tr);
}
const groupOrder = (a, b) => a.company.localeCompare(b.company) || String(b.fy).localeCompare(String(a.fy));

function drawTypes() {
  const tb = document.querySelector('#tb-types tbody'), tf = document.querySelector('#tb-types tfoot');
  const a = dash.data('vt_avg'), tt = dash.data('vt_totals');
  tb.replaceChildren(); tf.replaceChildren();
  const avg = new Map((a.status === 'ok' ? a.data : []).map(r => [r.company + '|' + r.fy + '|' + r.voucher_type, r.avg_bill]));
  const tot = new Map((tt.status === 'ok' ? tt.data : []).map(r => [r.company + '|' + r.fy, r]));
  const rows = rowsOf('voucher_types').slice().sort((p, q) => groupOrder(p, q) || num(q.gross) - num(p.gross));
  const groups = [...new Set(rows.map(r => r.company + '|' + r.fy))];
  const sumCells = (o) => [[cnt(o.invoices), 'invoices', 'num'], [inr(o.gross), 'gross', 'num'], [inr(o.taxable), 'taxable', 'num hide-sm'], [inrFull(o.avg_bill), 'avg_bill', 'num']];
  groups.forEach(g => {
    rows.filter(r => r.company + '|' + r.fy === g).forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.key = [r.company, r.fy, r.voucher_type].map(encodeURIComponent).join(',');
      cell(tr, r.company); cell(tr, fyLabel(r.fy), 'hide-sm nw'); cell(tr, r.voucher_type); cell(tr, cnt(num(r.invoices)), 'num'); cell(tr, inr(num(r.gross)), 'num');
      cell(tr, inr(num(r.taxable)), 'num hide-sm');
      const k = r.company + '|' + r.fy + '|' + r.voucher_type; cell(tr, avg.has(k) ? inrFull(avg.get(k)) : '—', 'num');
      tb.appendChild(tr);
    });
    const [c, f] = g.split('|'), o = tot.get(g);
    if (groups.length > 1 && o) totalRow(tb, 'hd-subtotal', 'vt_totals', whereOf(c, f), `Subtotal · ${c} · ${fyLabel(f)}`, sumCells(o), 3);
  });
  const all = tot.get((picked() || 'ALL') + '|' + (pickedFy() || 'ALL'));
  if (rows.length && all) totalRow(tf, 'hd-total', 'vt_totals', whereOf(all.company, all.fy), 'Grand total', sumCells(all), 3);
}

let itemSort = { k: 'value', dir: -1 };
function drawItems() {
  const tb = document.querySelector('#tb-items tbody'), tf = document.querySelector('#tb-items tfoot'), tt = dash.data('item_totals');
  tb.replaceChildren(); tf.replaceChildren();
  const all = rowsOf('items');
  const q = document.getElementById('item-search').value.trim().toLowerCase();
  const numeric = ['qty', 'value'];
  const rows = all.filter(r => !q || (r.item + ' ' + r.part_no).toLowerCase().includes(q));
  rows.sort((a, b) => numeric.includes(itemSort.k) ? (num(a[itemSort.k]) - num(b[itemSort.k])) * itemSort.dir : String(a[itemSort.k]).localeCompare(String(b[itemSort.k])) * itemSort.dir);
  const max = d3.max(all, r => num(r.value)) || 1;
  const chCol = { 'Service': SER[0], 'Counter sale': SER[1], 'Branch transfer': SER[4] };
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.key = [r.company, r.fy, r.part_no].map(encodeURIComponent).join(',');
    cell(tr, r.company, 'hide-sm'); cell(tr, fyLabel(r.fy), 'hide-sm nw'); cell(tr, r.item); cell(tr, r.part_no, 'part hide-sm'); cell(tr, r.main_channel, 'hide-sm');
    cell(tr, cnt(num(r.qty)), 'num'); cell(tr, inrFull(num(r.value)), 'num');
    const td = cell(tr, '', 'barc hide-sm');
    const o = document.createElement('div'); o.className = 'inbar'; const i = document.createElement('div');
    i.style.width = (num(r.value) / max * 100) + '%'; i.style.background = chCol[r.main_channel] || SER[0];
    o.appendChild(i); td.appendChild(o);
    tb.appendChild(tr);
  });
  const tot = new Map((tt.status === 'ok' ? tt.data : []).map(r => [r.company + '|' + r.fy, r]));
  const groups = [...new Set(all.map(r => r.company + '|' + r.fy))].sort((x, y) => { const [xc, xf] = x.split('|'), [yc, yf] = y.split('|'); return xc.localeCompare(yc) || yf.localeCompare(xf); });
  const cellsOf = (o) => [[cnt(o.qty), 'qty', 'num'], [inrFull(o.value), 'value', 'num'], ['', null, 'hide-sm']];
  if (groups.length > 1) groups.forEach(g => { const [c, f] = g.split('|'), o = tot.get(g); if (o) totalRow(tf, 'hd-subtotal', 'item_totals', whereOf(c, f), `Subtotal · ${c} · ${fyLabel(f)} (${o.rows} items)`, cellsOf(o), 5); });
  const gt = tot.get((picked() || 'ALL') + '|' + (pickedFy() || 'ALL'));
  if (all.length && gt) totalRow(tf, 'hd-total', 'item_totals', whereOf(gt.company, gt.fy), `Grand total · ${gt.rows} items listed${q ? ' (before search)' : ''}`, cellsOf(gt), 5);
  document.querySelectorAll('#tb-items th').forEach(th => {
    const bt = th.querySelector('button');
    if (bt) th.setAttribute('aria-sort', bt.dataset.k === itemSort.k ? (itemSort.dir > 0 ? 'ascending' : 'descending') : 'none');
  });
}
document.getElementById('item-search').addEventListener('input', drawItems);
document.querySelectorAll('#tb-items th button').forEach(bt => bt.addEventListener('click', () => {
  const k = bt.dataset.k;
  itemSort = itemSort.k === k ? { k, dir: -itemSort.dir } : { k, dir: ['qty', 'value'].includes(k) ? -1 : 1 };
  drawItems();
}));

function drawCompanies() {
  const tb = document.querySelector('#tb-companies tbody'), cv = dash.data('coverage');
  tb.replaceChildren();
  const cov = new Map((cv.status === 'ok' ? cv.data : []).map(r => [r.company, r]));
  rowsOf('companies').forEach(r => {
    const tr = document.createElement('tr');
    cell(tr, r.company); cell(tr, r.name); cell(tr, dayFmt(r.register_from), 'hide-sm'); cell(tr, dayFmt(r.register_to), 'hide-sm');
    cell(tr, cnt(num(r.bills)), 'num'); cell(tr, inr(num(r.gross)), 'num');
    const c = cov.get(r.company); cell(tr, c ? `${c.received} of ${c.required}` : '—', 'num');
    tb.appendChild(tr);
  });
  const tf = document.querySelector('#tb-companies tfoot'), ct = dash.data('company_totals');
  tf.replaceChildren();
  const o = ct.status === 'ok' ? ct.data[0] : null;
  if (o && !picked()) totalRow(tf, 'hd-total', 'company_totals', 'company=ALL', `Total · ${o.companies} ${o.companies === 1 ? 'company' : 'companies'}`,
    [[cnt(o.bills), 'bills', 'num'], [inr(o.gross), 'gross', 'num'], [`${o.received} of ${o.required}`, 'received', 'num']], 4);
}

function drawCompleteness() {
  const tb = document.querySelector('#tb-completeness tbody');
  tb.replaceChildren();
  rowsOf('completeness').forEach(r => {
    const tr = document.createElement('tr');
    cell(tr, r.company); cell(tr, r.file); cell(tr, r.filename, 'mono hide-sm');
    const td = cell(tr, '');
    const p = document.createElement('span'); p.className = 'hd-pill ' + (r.status === 'Received' ? 'ok' : 'wait'); p.textContent = r.status; td.appendChild(p);
    tb.appendChild(tr);
  });
}

// Open on the latest year: adding up a full FY 2025-26 for one company with half-years for the rest misleads.
let fyDefaulted = false;
dash.onData(() => {
  const md = dash.data('monthly');
  if (!fyDefaulted && md.status === 'ok') {
    fyDefaulted = true;
    const fys = [...new Set(md.data.map(r => r.fy))].sort();
    if (fys.length > 1 && !pickedFy()) { dash.setParams({ fy: fys[fys.length - 1] }); return; }
  }
  drawFilter(); drawKpis(); drawMonthly(); drawMix();
  drawYoy(); drawStock(); drawIdle();
  drawDaily(); drawHeads(); drawTypes(); drawItems(); drawCompanies(); drawCompleteness();
});
