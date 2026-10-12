const num = (x) => +x || 0;
dash.calc('kpis', {
  inputs: ['monthly'],
  title: 'Headline figures by company',
  description: 'Sums each monthly column per company and for the group (company ALL); average bill = service gross / service jobs; discount rate = discount / (net + discount); last month vs the one before.',
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
    const codes = [...new Set(monthly.map(r => r.company))];
    return [{ company: 'ALL', ...sum(monthly) }].concat(codes.map(c => ({ company: c, ...sum(monthly.filter(r => r.company === c)) })));
  }
});
dash.calc('vt_avg', {
  inputs: ['voucher_types'],
  title: 'Average bill by voucher type',
  description: 'Gross value divided by number of bills, per company and voucher type.',
  fn: (voucher_types) => voucher_types.map(r => ({ company: r.company, voucher_type: r.voucher_type, avg_bill: +r.gross / +r.invoices }))
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
const STREAMS = ['Spare parts', 'Accessories', 'Labour & service charges', 'AMC & warranty', 'Branch transfers'];

// The company filter lives in the page: every dataset carries a `company` column.
const picked = () => dash.params().company || null;
const rowsOf = (id) => { const d = dash.data(id); if (d.status !== 'ok') return []; const c = picked(); return c ? d.data.filter(r => r.company === c) : d.data; };
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
  const note = document.getElementById('scope-note');
  note.textContent = c.status === 'ok' ? `${list.length} of the group's companies loaded so far · more appear as their exports arrive` : '';
  // Headline marks point at the picked company's row of the calculation.
  document.querySelectorAll('.hd-kpis [data-source="kpis"]').forEach(e => { e.dataset.where = 'company=' + encodeURIComponent(picked() || 'ALL'); });
}

function drawKpis() {
  const k = dash.data('kpis');
  const vals = document.querySelectorAll('.hd-kpis [data-source="kpis"]');
  const tk = document.getElementById('takeaway'), sub = document.getElementById('sub-gross');
  const r = k.status === 'ok' ? k.data.find(x => x.company === (picked() || 'ALL')) : null;
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
  const where = 'company=' + encodeURIComponent(r.company);
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
    .attr('y', r => y(r.g)).attr('height', r => y(0) - y(r.g)).attr('rx', 4).attr('fill', dash.colors[0])
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
  const col = (s) => dash.colors[STREAMS.indexOf(s)];
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
    .attr('y', r => y(r.g)).attr('height', r => y(0) - y(r.g)).attr('rx', Math.min(2, bw / 2)).attr('fill', dash.colors[0])
    .on('mousemove', (ev, r) => tip.show(ev, d3.utcFormat('%a %-d %b')(r.d), [[null, 'Gross', inrFull(r.g)], [null, 'Bills', cnt(r.inv)], [null, 'Service jobs', cnt(r.sj)]]))
    .on('mouseleave', () => tip.hide());
  d3.utcMonth.range(d3.utcMonth.ceil(x0), x1).concat([x0]).forEach(m => {
    svg.append('text').attr('x', x(m) + 2).attr('y', H - 6).text(d3.utcFormat('%b')(m));
  });
}

function drawHeads() {
  const el = document.getElementById('ch-heads'), lg = document.getElementById('lg-heads');
  if (!gate(el, 'heads')) { lg.replaceChildren(); return; }
  const col = (g) => g === 'Discounts' ? 'var(--cds-chart-status-critical)' : dash.colors[STREAMS.indexOf(g)];
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

function drawWaiting(elId, files, what) {
  const el = document.getElementById(elId), d = dash.data('completeness');
  el.replaceChildren();
  if (d.status === 'error' || d.status === 'connect') return fail(el);
  if (d.status !== 'ok') return;
  const need = rowsOf('completeness').filter(r => files.includes(r.file));
  const missing = need.filter(r => r.status !== 'Received');
  const comps = new Set(need.map(r => r.company)), ready = [...comps].filter(c => !missing.some(r => r.company === c));
  const big = document.createElement('div'); big.className = 'big';
  big.textContent = `${ready.length} of ${comps.size} ${comps.size === 1 ? 'company' : 'companies'} ready`;
  el.appendChild(big);
  const p = document.createElement('div');
  p.textContent = missing.length ? `${what} will appear here once these arrive:` : `All files are in; ${what.toLowerCase()} is the next build step.`;
  el.appendChild(p);
  if (missing.length) {
    const ul = document.createElement('ul');
    missing.forEach(r => { const li = document.createElement('li'); li.textContent = r.filename; ul.appendChild(li); });
    el.appendChild(ul);
  }
}

function drawTypes() {
  const tb = document.querySelector('#tb-types tbody'), a = dash.data('vt_avg');
  tb.replaceChildren();
  const avg = new Map((a.status === 'ok' ? a.data : []).map(r => [r.company + '|' + r.voucher_type, r.avg_bill]));
  rowsOf('voucher_types').slice().sort((p, q) => num(q.gross) - num(p.gross)).forEach(r => {
    const tr = document.createElement('tr');
    cell(tr, r.company); cell(tr, r.voucher_type); cell(tr, cnt(num(r.invoices)), 'num'); cell(tr, inr(num(r.gross)), 'num');
    cell(tr, inr(num(r.taxable)), 'num hide-sm');
    const k = r.company + '|' + r.voucher_type; cell(tr, avg.has(k) ? inrFull(avg.get(k)) : '—', 'num');
    tb.appendChild(tr);
  });
}

let itemSort = { k: 'value', dir: -1 };
function drawItems() {
  const tb = document.querySelector('#tb-items tbody');
  tb.replaceChildren();
  const all = rowsOf('items');
  const q = document.getElementById('item-search').value.trim().toLowerCase();
  const numeric = ['qty', 'value'];
  const rows = all.filter(r => !q || (r.item + ' ' + r.part_no).toLowerCase().includes(q));
  rows.sort((a, b) => numeric.includes(itemSort.k) ? (num(a[itemSort.k]) - num(b[itemSort.k])) * itemSort.dir : String(a[itemSort.k]).localeCompare(String(b[itemSort.k])) * itemSort.dir);
  const max = d3.max(all, r => num(r.value)) || 1;
  const chCol = { 'Service': dash.colors[0], 'Counter sale': dash.colors[1], 'Branch transfer': dash.colors[4] };
  rows.forEach(r => {
    const tr = document.createElement('tr');
    cell(tr, r.company, 'hide-sm'); cell(tr, r.item); cell(tr, r.part_no, 'part hide-sm'); cell(tr, r.main_channel, 'hide-sm');
    cell(tr, cnt(num(r.qty)), 'num'); cell(tr, inrFull(num(r.value)), 'num');
    const td = cell(tr, '', 'barc hide-sm');
    const o = document.createElement('div'); o.className = 'inbar'; const i = document.createElement('div');
    i.style.width = (num(r.value) / max * 100) + '%'; i.style.background = chCol[r.main_channel] || dash.colors[0];
    o.appendChild(i); td.appendChild(o);
    tb.appendChild(tr);
  });
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

dash.onData(() => {
  drawFilter(); drawKpis(); drawMonthly(); drawMix();
  drawWaiting('yoy', ['Sales register FY 2025-26'], 'The year-on-year comparison');
  drawWaiting('stock', ['Stock summary As at 31 Mar 2026', 'Stock summary As at 30 Sep 2026', 'Stock movement FY 2025-26', 'Stock movement FY 2026-27 Apr-Sep'], 'The inventory lens');
  drawDaily(); drawHeads(); drawTypes(); drawItems(); drawCompanies(); drawCompleteness();
});
