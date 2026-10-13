// Report builder: reads the hub's CSVs, builds the chosen report sections with subtotals
// (per company and financial year) and grand totals, and exports them to Excel and PDF.
(() => {
  const CREDIT = 'D&D by Dr.Babu.B. Bpro Consulting & Technologies';
  const LINKS = [['www.drbabu.in', 'https://www.drbabu.in'], ['www.bpropms.com', 'https://www.bpropms.com']];
  const STREAMS = ['Spare parts', 'Accessories', 'Labour & service charges', 'AMC & warranty', 'Branch transfers'];
  const MEASURES = {
    invoices: ['Bills', 'int'], service_jobs: ['Service jobs', 'int'], gross: ['Gross incl. GST', 'money'],
    taxable: ['Net ex-GST', 'money'], gst: ['GST', 'money'], discount: ['Discount', 'money'],
    qty: ['Qty', 'int'], value: ['Value', 'money'], lines: ['Bill lines', 'int'], avg: ['Avg bill', 'money'],
  };
  const num = (x) => +x || 0;
  const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
  const fyLabel = (f) => 'FY ' + f.replace('-', '–');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monLabel = (m) => MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  const fmt = {
    int: (v) => Math.round(v).toLocaleString('en-IN'),
    money: (v) => Math.round(v).toLocaleString('en-IN'),
    pct: (v) => (v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%'),
    text: (v) => (v == null ? '' : String(v)),
  };
  const $ = (id) => document.getElementById(id);
  const status = (t) => { $('status').textContent = t; };
  let D = null, names = {}, logo = null;

  // ---------- data ----------
  const FILES = ['companies', 'monthly', 'streams', 'heads', 'voucher_types', 'items'];
  Promise.all(FILES.map((f) => d3.csv('data/' + f + '.csv'))).then((res) => {
    D = Object.fromEntries(FILES.map((f, i) => [f, res[i]]));
    D.companies.forEach((c) => { names[c.company] = c.name; });
    const fys = [...new Set(D.monthly.map((r) => r.fy))].sort().reverse();
    const box = (name, value, label) => {
      const l = document.createElement('label'), i = document.createElement('input');
      i.type = 'checkbox'; i.name = name; i.value = value; i.checked = true; i.id = name + '-' + value;
      l.append(i, ' ' + label); return l;
    };
    $('opt-companies').replaceChildren(...D.companies.map((c) => box('co', c.company, `${c.name} (${c.company})`)));
    $('opt-fys').replaceChildren(...fys.map((f) => box('fy', f, fyLabel(f))));
    document.querySelectorAll('#params input').forEach((i) => i.addEventListener('change', syncControls));
    syncControls();
    status(`${D.companies.length} ${D.companies.length === 1 ? 'company' : 'companies'} and ${fys.length} ${fys.length === 1 ? 'year' : 'years'} loaded.`);
    preview();
  }).catch(() => status('The data files could not be loaded. Serve the folder over http (see README).'));

  fetch('assets/img/marikar-group.png').then((r) => r.blob()).then((b) => new Promise((ok) => {
    const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b);
  })).then((u) => { logo = u; }).catch(() => {});

  const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  function syncControls() {
    document.querySelectorAll('#opt-sections .inline[data-for]').forEach((el) => {
      const on = $(el.dataset.for).checked;
      el.classList.toggle('disabled', !on);
      el.querySelectorAll('input, select').forEach((i) => { i.disabled = !on; });
    });
    const two = checked('fy').length >= 2;
    $('s-yoy').disabled = !two; if (!two) $('s-yoy').checked = false;
    $('yoy-label').classList.toggle('disabled', !two);
    $('yoy-note').textContent = two ? 'Uses the monthly summary measures chosen above.' : 'Needs two financial years selected.';
  }

  // ---------- building sections ----------
  // rows -> [{type:'row'|'sub'|'total', cells:[]}] with a subtotal per company and year (when there is more
  // than one such group) and a grand total.
  function withTotals(rows, labels, values, opts = {}) {
    const out = [];
    const groups = d3.groups(rows, (r) => r.company, (r) => r.fy)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .flatMap(([c, fs]) => fs.sort((a, b) => b[0].localeCompare(a[0])).map(([f, rs]) => [c, f, rs]));
    const blank = labels.length - 1;
    groups.forEach(([c, f, rs]) => {
      (opts.sort ? rs.slice().sort(opts.sort) : rs).forEach((r) => out.push({ type: 'row', cells: [...labels.map((l) => l.get(r)), ...values.map((v) => v.get(r))] }));
      if (groups.length > 1) out.push({ type: 'sub', cells: [`Subtotal · ${names[c] || c} · ${fyLabel(f)}${opts.subNote || ''}`, ...Array(blank).fill(''), ...values.map((v) => v.total(rs))] });
    });
    if (rows.length) out.push({ type: 'total', cells: [`Grand total${opts.subNote || ''}`, ...Array(blank).fill(''), ...values.map((v) => v.total(rows))] });
    return { columns: [...labels.map((l) => ({ label: l.label, kind: 'text' })), ...values.map((v) => ({ label: v.label, kind: v.kind }))], rows: out };
  }
  const measure = (key) => ({ label: MEASURES[key][0], kind: MEASURES[key][1], get: (r) => num(r[key]), total: (rs) => sum(rs, (r) => num(r[key])) });
  const avgBill = { label: MEASURES.avg[0], kind: 'money', get: (r) => num(r.gross) / num(r.invoices), total: (rs) => sum(rs, (r) => num(r.gross)) / sum(rs, (r) => num(r.invoices)) };
  const L = {
    company: { label: 'Company', get: (r) => names[r.company] || r.company },
    fy: { label: 'Year', get: (r) => fyLabel(r.fy) },
    month: { label: 'Month', get: (r) => monLabel(r.month) },
  };

  function sections(p) {
    const inScope = (r) => p.companies.includes(r.company) && p.fys.includes(r.fy);
    const out = [];
    if ($('s-monthly').checked) {
      const ms = checked('m-monthly');
      if (ms.length) out.push({ id: 'Monthly', title: 'Monthly summary', note: 'Bills and billing per month.',
        ...withTotals(D.monthly.filter(inScope), [L.company, L.fy, L.month], ms.map(measure)) });
    }
    if ($('s-streams').checked) {
      const piv = d3.rollups(D.streams.filter(inScope), (rs) => Object.fromEntries(rs.map((r) => [r.stream, num(r.amount)])), (r) => r.company, (r) => r.fy, (r) => r.month)
        .flatMap(([c, fs]) => fs.flatMap(([f, ms]) => ms.map(([m, v]) => ({ company: c, fy: f, month: m, ...v }))))
        .sort((a, b) => a.month.localeCompare(b.month));
      const cols = [...STREAMS, 'Discounts'].map((s) => ({ label: s, kind: 'money', get: (r) => num(r[s]), total: (rs) => sum(rs, (r) => num(r[s])) }));
      const net = { label: 'Net ex-GST', kind: 'money', get: (r) => sum([...STREAMS, 'Discounts'], (s) => num(r[s])), total: (rs) => sum(rs, (r) => sum([...STREAMS, 'Discounts'], (s) => num(r[s]))) };
      out.push({ id: 'Streams', title: 'Revenue streams by month', note: 'Income ledgers grouped by stream, ex-GST; discounts as negatives.',
        ...withTotals(piv, [L.company, L.fy, L.month], [...cols, net]) });
    }
    if ($('s-heads').checked) {
      const order = [...STREAMS, 'Discounts'];
      out.push({ id: 'Ledgers', title: 'Revenue by ledger', note: 'Each income and discount ledger, ex-GST. Totals are net of discounts.',
        ...withTotals(D.heads.filter(inScope), [L.company, L.fy, { label: 'Group', get: (r) => r.group }, { label: 'Ledger', get: (r) => r.head }],
          [{ label: 'Amount', kind: 'money', get: (r) => num(r.amount), total: (rs) => sum(rs, (r) => num(r.amount)) }],
          { sort: (a, b) => order.indexOf(a.group) - order.indexOf(b.group) || num(b.amount) - num(a.amount) }) });
    }
    if ($('s-types').checked) {
      const ms = checked('m-types');
      if (ms.length) out.push({ id: 'Voucher types', title: 'Voucher types', note: 'Bills and value by voucher type. Average bill = gross ÷ bills.',
        ...withTotals(D.voucher_types.filter(inScope), [L.company, L.fy, { label: 'Voucher type', get: (r) => r.voucher_type }], ms.map((k) => (k === 'avg' ? avgBill : measure(k))),
          { sort: (a, b) => num(b.gross) - num(a.gross) }) });
    }
    if ($('s-items').checked) {
      const ms = checked('m-items'), n = +$('items-n').value, by = $('items-by').value;
      const rows = d3.groups(D.items.filter(inScope), (r) => r.company + '|' + r.fy)
        .flatMap(([, rs]) => rs.slice().sort((a, b) => num(b[by]) - num(a[by])).slice(0, n));
      if (ms.length) out.push({ id: 'Top items', title: `Top ${n} items by ${by === 'qty' ? 'quantity' : 'value'}`, note: 'Value ex-GST, before discount. Totals cover the items listed.',
        ...withTotals(rows, [L.company, L.fy, { label: 'Item', get: (r) => r.item }, { label: 'Part no.', get: (r) => r.part_no }, { label: 'Channel', get: (r) => r.main_channel }],
          ms.map(measure), { sort: (a, b) => num(b[by]) - num(a[by]), subNote: ' (items listed)' }) });
    }
    if ($('s-yoy').checked && p.fys.length >= 2) {
      const fys = p.fys.slice().sort(), ms = checked('m-monthly').length ? checked('m-monthly') : ['gross'];
      const val = (c, f, k) => sum(D.monthly.filter((r) => (c === 'ALL' || r.company === c) && r.fy === f), (r) => num(r[k]));
      const rows = [];
      ms.forEach((k) => {
        const line = (c, type) => {
          const vs = fys.map((f) => val(c, f, k)), first = vs[0], last = vs[vs.length - 1];
          rows.push({ type, cells: [c === 'ALL' ? 'All selected companies' : (names[c] || c), MEASURES[k][0], ...vs, last - first, first ? last / first - 1 : null] });
        };
        p.companies.forEach((c) => line(c, 'row'));
        if (p.companies.length > 1) line('ALL', 'sub');
      });
      out.push({ id: 'Year on year', title: 'Year-on-year comparison', note: `Full-period totals per year; change is ${fyLabel(fys[fys.length - 1])} against ${fyLabel(fys[0])}. A part year compares part periods.`,
        columns: [{ label: 'Company', kind: 'text' }, { label: 'Measure', kind: 'text' }, ...fys.map((f) => ({ label: fyLabel(f), kind: MEASURES[ms[0]][1] === 'int' ? 'int' : 'money' })), { label: 'Change', kind: 'money' }, { label: 'Change %', kind: 'pct' }], rows });
    }
    return out;
  }

  function params() {
    const p = { companies: checked('co'), fys: checked('fy') };
    if (!p.companies.length) return [null, 'Choose at least one company.'];
    if (!p.fys.length) return [null, 'Choose at least one financial year.'];
    const secs = sections(p);
    if (!secs.length) return [null, 'Choose at least one section, with at least one measure.'];
    p.summary = [
      ['Companies', p.companies.map((c) => `${names[c] || c} (${c})`).join(', ')],
      ['Financial years', p.fys.slice().sort().map(fyLabel).join(', ')],
      ['Sections', secs.map((s) => s.title).join('; ')],
      ['Generated', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
    ];
    return [{ p, secs }, null];
  }

  // ---------- preview ----------
  function preview() {
    const [r, err] = params(); const out = $('out');
    if (err) { out.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: err })); status(err); return null; }
    out.replaceChildren(...r.secs.map((s) => {
      const sec = document.createElement('div'); sec.className = 'section';
      const h = document.createElement('h3'); h.textContent = s.title;
      const nt = document.createElement('p'); nt.className = 'sub-note'; nt.textContent = s.note;
      const wrap = document.createElement('div'); wrap.className = 'tbl';
      const t = document.createElement('table'), th = t.createTHead().insertRow(), tb = t.createTBody();
      s.columns.forEach((c) => { const e = document.createElement('th'); e.textContent = c.label; if (c.kind !== 'text') e.className = 'n'; th.appendChild(e); });
      s.rows.forEach((row) => {
        const tr = tb.insertRow(); if (row.type !== 'row') tr.className = row.type;
        row.cells.forEach((v, i) => { const td = tr.insertCell(); const k = s.columns[i].kind; td.textContent = fmt[k](v); if (k !== 'text') td.className = 'n'; });
      });
      wrap.appendChild(t); sec.append(h, nt, wrap); return sec;
    }));
    status(`Preview ready: ${r.secs.length} ${r.secs.length === 1 ? 'section' : 'sections'}.`);
    return r;
  }
  $('btn-preview').addEventListener('click', preview);

  const fileBase = (p) => `Marikar_Report_${p.companies.join('-')}_FY${p.fys.slice().sort().join('_')}_${new Date().toISOString().slice(0, 10)}`;

  // ---------- Excel ----------
  $('btn-xlsx').addEventListener('click', () => {
    const r = preview(); if (!r) return;
    if (!window.XLSX) { status('The Excel library did not load. Check the connection and reload.'); return; }
    const wb = XLSX.utils.book_new();
    const creditRow = [CREDIT, LINKS[0][0], LINKS[1][0]];
    const link = (ws, rowIdx) => LINKS.forEach(([, url], i) => { const a = XLSX.utils.encode_cell({ r: rowIdx, c: i + 1 }); if (ws[a]) ws[a].l = { Target: url, Tooltip: url }; });
    // Cover sheet with the parameters used.
    const cover = [['Marikar Group — report'], [], ...r.p.summary, [], creditRow];
    const cws = XLSX.utils.aoa_to_sheet(cover); link(cws, cover.length - 1);
    cws['!cols'] = [{ wch: 18 }, { wch: 70 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, cws, 'Parameters');
    r.secs.forEach((s) => {
      const head = [[s.title], [s.note], [`${r.p.summary[0][1]} · ${r.p.summary[1][1]}`], [], s.columns.map((c) => c.label + (c.kind === 'money' ? ' (₹)' : ''))];
      const body = s.rows.map((row) => row.cells.map((v, i) => (s.columns[i].kind === 'text' ? v : (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100))));
      const aoa = [...head, ...body, [], creditRow];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      body.forEach((row, ri) => row.forEach((v, ci) => {
        const k = s.columns[ci].kind, a = XLSX.utils.encode_cell({ r: head.length + ri, c: ci });
        if (ws[a] && k !== 'text') ws[a].z = k === 'int' ? '#,##0' : k === 'pct' ? '0.0%' : '#,##0.00';
      }));
      link(ws, aoa.length - 1);
      ws['!cols'] = s.columns.map((c) => ({ wch: c.kind === 'text' ? Math.min(40, Math.max(12, ...s.rows.map((row) => String(row.cells[s.columns.indexOf(c)] ?? '').length))) : 16 }));
      XLSX.utils.book_append_sheet(wb, ws, s.id.slice(0, 31));
    });
    XLSX.writeFile(wb, fileBase(r.p) + '.xlsx');
    status('Excel file downloaded.');
  });

  // ---------- PDF ----------
  const pdfText = (s) => String(s).replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/÷/g, '/');
  $('btn-pdf').addEventListener('click', () => {
    const r = preview(); if (!r) return;
    if (!window.jspdf) { status('The PDF library did not load. Check the connection and reload.'); return; }
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    const navy = [22, 36, 74], muted = [88, 97, 116];
    const header = () => {
      doc.setFillColor(...navy); doc.rect(0, 0, W, 26, 'F');
      doc.setFillColor(46, 49, 146); doc.rect(0, 0, W * 0.72, 3, 'F'); doc.setFillColor(117, 120, 123); doc.rect(W * 0.72, 0, W * 0.28, 3, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('MARIKAR GROUP · REPORT', M, 17);
      doc.setFont('helvetica', 'normal'); doc.text(pdfText(r.p.summary[1][1]), W - M, 17, { align: 'right' });
    };
    const footer = (page, pages) => {
      const y = H - 18; doc.setDrawColor(226, 229, 235); doc.line(M, y - 12, W - M, y - 12);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted);
      let x = M; doc.text(CREDIT + '  ·  ', x, y); x += doc.getTextWidth(CREDIT + '  ·  ');
      doc.setTextColor(46, 49, 146); doc.textWithLink(LINKS[0][0], x, y, { url: LINKS[0][1] }); x += doc.getTextWidth(LINKS[0][0]);
      doc.setTextColor(...muted); doc.text('  |  ', x, y); x += doc.getTextWidth('  |  ');
      doc.setTextColor(46, 49, 146); doc.textWithLink(LINKS[1][0], x, y, { url: LINKS[1][1] });
      doc.setTextColor(...muted); doc.text(`Page ${page} of ${pages}`, W - M, y, { align: 'right' });
    };
    // Title block on the first page.
    header();
    let y = 50;
    if (logo) { try { doc.addImage(logo, 'PNG', M, y, 44, 64); } catch (e) { /* logo is optional */ } }
    const tx = logo ? M + 58 : M;
    doc.setTextColor(16, 24, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Marikar Group - report', tx, y + 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...muted);
    r.p.summary.forEach(([k, v], i) => { doc.text(pdfText(`${k}: ${v}`), tx, y + 38 + i * 13, { maxWidth: W - tx - M }); });
    y += 38 + r.p.summary.length * 13 + 14;
    r.secs.forEach((s) => {
      if (y > H - 140) { doc.addPage(); header(); y = 50; }
      doc.setTextColor(16, 24, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.text(pdfText(s.title), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(pdfText(s.note), M, y + 13);
      const numIdx = s.columns.map((c, i) => (c.kind === 'text' ? null : i)).filter((i) => i !== null);
      doc.autoTable({
        startY: y + 20, margin: { left: M, right: M, top: 40, bottom: 44 },
        head: [s.columns.map((c) => pdfText(c.label + (c.kind === 'money' ? ' (Rs.)' : '')))],
        body: s.rows.map((row) => row.cells.map((v, i) => pdfText(fmt[s.columns[i].kind](v)))),
        theme: 'plain', styles: { font: 'helvetica', fontSize: 8, cellPadding: 3.5, textColor: [16, 24, 40], lineColor: [226, 229, 235], lineWidth: { bottom: 0.5 } },
        headStyles: { fontStyle: 'bold', textColor: muted, fontSize: 7.5, lineWidth: { bottom: 0.8 } },
        columnStyles: Object.fromEntries(numIdx.map((i) => [i, { halign: 'right' }])),
        didParseCell: (d) => {
          if (d.section === 'head' && numIdx.includes(d.column.index)) d.cell.styles.halign = 'right';
          if (d.section !== 'body') return;
          const type = s.rows[d.row.index].type;
          if (type === 'sub') { d.cell.styles.fillColor = [242, 244, 248]; d.cell.styles.fontStyle = 'bold'; }
          if (type === 'total') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.lineWidth = { top: 1.2, bottom: 0 }; d.cell.styles.lineColor = [16, 24, 40]; }
        },
        didDrawPage: () => header(),
      });
      y = doc.lastAutoTable.finalY + 30;
    });
    // Every page gets the header and the D&D footer with its links and page number.
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); header(); footer(i, pages); }
    doc.save(fileBase(r.p) + '.pdf');
    status('PDF downloaded.');
  });
})();
