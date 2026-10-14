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
  let D = null, names = {};
  const IMG = {}; // logos as data URLs, with their pixel size

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
    if (location.hash.startsWith('#v=')) verifyFromHash(); else preview();
  }).catch(() => status('The data files could not be loaded. Serve the folder over http (see README).'));

  const loadImg = (key, src) => fetch(src).then((r) => r.blob()).then((b) => new Promise((ok) => {
    const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b);
  })).then((url) => new Promise((ok) => {
    const im = new Image(); im.onload = () => { IMG[key] = { url, w: im.naturalWidth, h: im.naturalHeight }; ok(); }; im.onerror = ok; im.src = url;
  })).catch(() => {});
  loadImg('marikar', 'assets/img/marikar-group.png');
  loadImg('bpro', 'assets/img/bpro.jpg');

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

  function params(when) {
    const p = { companies: checked('co'), fys: checked('fy'), when: when || new Date() };
    if (!p.companies.length) return [null, 'Choose at least one company.'];
    if (!p.fys.length) return [null, 'Choose at least one financial year.'];
    const secs = sections(p);
    if (!secs.length) return [null, 'Choose at least one section, with at least one measure.'];
    p.summary = [
      ['Companies', p.companies.map((c) => `${names[c] || c} (${c})`).join(', ')],
      ['Financial years', p.fys.slice().sort().map(fyLabel).join(', ')],
      ['Sections', secs.map((s) => s.title).join('; ')],
      ['Generated', p.when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
    ];
    return [{ p, secs }, null];
  }

  // ---------- preview ----------
  function preview(when) {
    const [r, err] = params(when instanceof Date ? when : undefined); const out = $('out');
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
  $('btn-preview').addEventListener('click', () => { $('verify').hidden = true; preview(); });

  // ---------- document identity and verification ----------
  // Every download carries a document ID and a verification code: the first 16 hex digits of the SHA-256 of
  // its parameters, time of generation and every table cell. Its QR code opens this page with those
  // parameters; the page rebuilds the report from the hub's data and checks that the code still matches.
  const OPTS = () => [...document.querySelectorAll('#opt-sections input[type="checkbox"]')];
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const stamp = (d) => d.toISOString().slice(0, 16).replace(/[-:]/g, ''); // 20261013T0615, UTC, to the minute
  const unstamp = (t) => new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(9, 11), +t.slice(11, 13)));
  const nowMinute = () => unstamp(stamp(new Date()));

  async function identify(r) {
    const bits = OPTS().map((i) => (i.checked ? '1' : '0')).join('');
    const state = { c: r.p.companies.join(','), y: r.p.fys.slice().sort().join(','), o: parseInt('1' + bits, 2).toString(36), n: $('items-n').value, b: $('items-by').value, t: stamp(r.p.when) };
    const cells = r.secs.map((s) => [s.title, s.columns.map((c) => c.label), s.rows.map((row) => [row.type, ...row.cells.map((v) => (typeof v === 'number' ? (isFinite(v) ? Math.round(v * 100) / 100 : null) : v))])]);
    const code = (await sha256(JSON.stringify([state, cells]))).slice(0, 16);
    const base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return {
      id: `MGR-${state.t.slice(0, 8)}-${code.slice(0, 6).toUpperCase()}`, code,
      codeShow: code.toUpperCase().match(/.{4}/g).join(' '),
      url: `${base}report.html#${new URLSearchParams({ v: '1', ...state, h: code })}`,
    };
  }

  async function verifyFromHash() {
    const q = new URLSearchParams(location.hash.slice(1)), box = $('verify');
    const show = (ok, parts) => {
      box.hidden = false; box.className = 'verify ' + (ok ? 'ok' : 'bad');
      const icon = Object.assign(document.createElement('span'), { className: 'v-icon', textContent: ok ? '✓' : '!' });
      const p = document.createElement('p');
      parts.forEach((x) => p.append(Array.isArray(x) ? Object.assign(document.createElement('b'), { textContent: x[0] }) : x));
      box.replaceChildren(icon, p);
    };
    try {
      const cs = (q.get('c') || '').split(','), ys = (q.get('y') || '').split(',');
      const known = cs.every((c) => names[c]) && ys.every((y) => $('fy-' + y));
      document.querySelectorAll('input[name="co"]').forEach((i) => { i.checked = cs.includes(i.value); });
      document.querySelectorAll('input[name="fy"]').forEach((i) => { i.checked = ys.includes(i.value); });
      const bits = parseInt(q.get('o'), 36).toString(2).slice(1);
      OPTS().forEach((i, k) => { i.checked = bits[k] === '1'; });
      $('items-n').value = q.get('n'); $('items-by').value = q.get('b');
      syncControls();
      const r = preview(unstamp(q.get('t')));
      const idn = r && known ? await identify(r) : null;
      if (idn && idn.code === q.get('h')) {
        show(true, [['Verified: authentic document. '], 'Document ', [idn.id], ` (code ${idn.codeShow}), generated ${r.p.summary[3][1]}, matches a report rebuilt from the hub's data. The tables below are its exact content.`]);
      } else {
        show(false, [['Not verified. '], 'This document does not match a report rebuilt from the hub\'s current data. Either it was altered after it was generated, or the data has been updated since. Ask BPro for a fresh copy if in doubt.']);
      }
    } catch (e) {
      show(false, [['Not verified. '], 'The verification link is incomplete or damaged.']);
    }
    box.scrollIntoView({ block: 'start' });
  }

  // ---------- QR codes ----------
  function qrMatrix(text) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
  }
  function qrPdf(doc, m, x, y, size, quiet) { // vector modules on a white square
    const cell = size / (m.n + 2 * quiet);
    doc.setFillColor(255, 255, 255); doc.rect(x, y, size, size, 'F'); doc.setFillColor(20, 16, 12);
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.05, cell + 0.05, 'F');
  }
  function qrPng(m, px) {
    const quiet = 4, cell = Math.max(2, Math.floor(px / (m.n + 2 * quiet))), size = cell * (m.n + 2 * quiet);
    const cv = Object.assign(document.createElement('canvas'), { width: size, height: size }), g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size); g.fillStyle = '#14100c';
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return cv.toDataURL('image/png');
  }

  // ---------- shared look ----------
  const TITLE = 'Sales & Revenue Report';
  const C = {
    navy: [19, 28, 56], navy2: [31, 43, 85], violet: [91, 79, 158], amber: [212, 154, 58], copper: [184, 97, 43],
    ink: [42, 36, 31], muted: [107, 97, 87], line: [232, 223, 209], ivory: [250, 246, 239], sub: [248, 233, 220], total: [238, 234, 246],
  };
  const fileBase = (p, idn) => `Marikar_Report_${p.companies.join('-')}_FY${p.fys.slice().sort().join('_')}_${idn.id}`;
  const libsMissing = (need) => {
    const gone = need.filter(([g]) => !window[g]).map(([, n]) => n);
    if (gone.length) status(`The ${gone.join(' and ')} library did not load. Check the connection and reload.`);
    return gone.length > 0;
  };

  // ---------- Excel ----------
  $('btn-xlsx').addEventListener('click', async () => {
    const r = preview(nowMinute()); if (!r) return;
    if (libsMissing([['ExcelJS', 'Excel'], ['qrcode', 'QR code']])) return;
    status('Building the Excel file…');
    const idn = await identify(r);
    const wb = new ExcelJS.Workbook();
    Object.assign(wb, { creator: CREDIT, lastModifiedBy: CREDIT, company: 'Bpro Consulting & Technologies', title: `Marikar Group ${TITLE} ${idn.id}`, subject: `Verification code ${idn.codeShow}`, keywords: `${idn.id} ${idn.code}`, description: `Verify: ${idn.url}`, created: r.p.when, modified: r.p.when });
    const im = { qr: wb.addImage({ base64: qrPng(qrMatrix(idn.url), 320), extension: 'png' }) };
    if (IMG.marikar) im.marikar = wb.addImage({ base64: IMG.marikar.url, extension: 'png' });
    if (IMG.bpro) im.bpro = wb.addImage({ base64: IMG.bpro.url, extension: 'jpeg' });
    const argb = (rgb) => 'FF' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const fill = (rgb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(rgb) } });
    const font = (o = {}) => ({ name: 'Calibri', size: 10, color: { argb: argb(o.rgb || C.ink) }, ...o, rgb: undefined });
    const hf = (s) => s.replace(/&/g, '&&');
    const setup = (ws, titleRow) => {
      ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
        margins: { left: 0.4, right: 0.4, top: 0.65, bottom: 0.75, header: 0.25, footer: 0.3 }, ...(titleRow ? { printTitlesRow: `${titleRow}:${titleRow}` } : {}) };
      ws.headerFooter = {
        oddHeader: `&L&"Calibri,Bold"&10Marikar Group · ${hf(TITLE)}&R&"Calibri"&9Document ${idn.id}`,
        oddFooter: `&L&"Calibri"&8${hf(CREDIT)} · www.drbabu.in | www.bpropms.com&C&"Calibri"&8Verification code ${idn.codeShow}&R&"Calibri,Bold"&9Page &P of &N`,
      };
    };
    const credit = (ws, row, col = 1) => { // the credit on one row, its two links underneath
      const t = ws.getCell(row, col); t.value = CREDIT; t.font = font({ size: 9, rgb: C.muted });
      LINKS.forEach(([text, url], i) => { const cell = ws.getCell(row + 1, col + i); cell.value = { text, hyperlink: url, tooltip: url }; cell.font = font({ size: 9, rgb: C.violet, underline: true }); });
    };
    // Brand strip: Marikar logo, title, notes, a copper rule, and the BPro logo and QR code in a right-hand gutter.
    const brand = (ws, ncols, title, lines) => {
      ws.getRow(1).height = 46;
      if (im.marikar) ws.addImage(im.marikar, { tl: { col: 0.08, row: 0.1 }, ext: { width: 30, height: 44 }, editAs: 'oneCell' });
      const t = ws.getCell(1, 2); t.value = title; t.font = font({ size: 17, bold: true, rgb: C.navy }); t.alignment = { vertical: 'middle' };
      lines.forEach((text, i) => { const c = ws.getCell(2 + i, 2); c.value = text; c.font = font({ size: 10, rgb: C.muted, italic: i === 0 }); });
      const ruleRow = 2 + lines.length; ws.getRow(ruleRow).height = 5;
      for (let c = 1; c <= ncols; c++) ws.getCell(ruleRow, c).fill = fill(C.copper);
      ws.getColumn(ncols + 1).width = 3; ws.getColumn(ncols + 2).width = 17;
      if (im.bpro) ws.addImage(im.bpro, { tl: { col: ncols + 1.05, row: 0.1 }, ext: { width: 104, height: 61 }, editAs: 'oneCell', hyperlinks: { hyperlink: 'https://www.bpropms.com', tooltip: 'www.bpropms.com' } });
      ws.addImage(im.qr, { tl: { col: ncols + 1.1, row: ruleRow + 0.4 }, ext: { width: 104, height: 104 }, editAs: 'oneCell', hyperlinks: { hyperlink: idn.url, tooltip: 'Verify this report' } });
      const cap = ws.getCell(ruleRow + 7, ncols + 2); cap.value = { text: 'Scan to verify', hyperlink: idn.url }; cap.font = font({ size: 8, rgb: C.violet, underline: true });
      return ruleRow;
    };

    // Cover sheet
    const cv = wb.addWorksheet('Report', { properties: { tabColor: { argb: argb(C.copper) } }, views: [{ showGridLines: false }] });
    cv.getColumn(1).width = 6; cv.getColumn(2).width = 22; cv.getColumn(3).width = 70;
    let row = brand(cv, 3, `Marikar Group — ${TITLE}`, ['Prepared from the Marikar Group performance hub', `Document ${idn.id}`]) + 2;
    const label = (text) => { const c = cv.getCell(row, 2); c.value = text.toUpperCase(); c.font = font({ size: 9, bold: true, rgb: C.copper }); row++; };
    const kv = (k, v, opts = {}) => {
      const a = cv.getCell(row, 2), b = cv.getCell(row, 3);
      a.value = k; a.font = font({ bold: true, rgb: C.muted }); a.fill = fill(C.ivory); a.alignment = { vertical: 'top' };
      b.value = v; b.font = font(opts.font || {}); b.alignment = { wrapText: true, vertical: 'top' };
      [a, b].forEach((c) => { c.border = { bottom: { style: 'hair', color: { argb: argb(C.line) } } }; });
      row++;
    };
    label('Report parameters');
    r.p.summary.forEach(([k, v]) => kv(k, v));
    row++; label('Verification');
    kv('Document ID', idn.id, { font: { bold: true, rgb: C.navy } });
    kv('Verification code', idn.codeShow, { font: { name: 'Consolas', bold: true } });
    kv('Verify online', { text: 'Open the verification page', hyperlink: idn.url, tooltip: idn.url }, { font: { rgb: C.violet, underline: true } });
    kv('How to verify', 'Scan the QR code, or open the link. The hub rebuilds this report from its data and confirms the code matches. A document that was altered, or that predates a data update, will not verify.');
    row++; credit(cv, row, 2);
    setup(cv);

    // One sheet per section
    r.secs.forEach((s) => {
      const n = s.columns.length;
      const ws = wb.addWorksheet(s.id.slice(0, 31), { properties: { tabColor: { argb: argb(C.violet) } } });
      const rule = brand(ws, n, s.title, [s.note, `${r.p.summary[0][1]} · ${r.p.summary[1][1]} · Document ${idn.id}`]);
      const hr = rule + 2;
      const head = ws.getRow(hr); head.height = 30;
      s.columns.forEach((c, i) => {
        const cell = head.getCell(i + 1);
        cell.value = c.label + (c.kind === 'money' ? ' (₹)' : '');
        cell.font = font({ bold: true, rgb: [255, 255, 255] }); cell.fill = fill(C.navy2);
        cell.alignment = { vertical: 'middle', wrapText: true, horizontal: c.kind === 'text' ? 'left' : 'right' };
      });
      s.rows.forEach((rw, ri) => {
        const x = ws.getRow(hr + 1 + ri);
        rw.cells.forEach((v, ci) => {
          const k = s.columns[ci].kind, cell = x.getCell(ci + 1);
          cell.value = k === 'text' ? v : (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
          if (k !== 'text') { cell.numFmt = k === 'int' ? '#,##0' : k === 'pct' ? '0.0%' : '#,##0.00'; cell.alignment = { horizontal: 'right' }; }
          cell.font = font(rw.type === 'row' ? {} : { bold: true, rgb: rw.type === 'total' ? C.navy : C.ink });
          cell.fill = fill(rw.type === 'sub' ? C.sub : rw.type === 'total' ? C.total : ri % 2 ? C.ivory : [255, 255, 255]);
          cell.border = rw.type === 'total'
            ? { top: { style: 'medium', color: { argb: argb(C.violet) } }, bottom: { style: 'thin', color: { argb: argb(C.violet) } } }
            : { bottom: { style: 'hair', color: { argb: argb(C.line) } } };
        });
      });
      s.columns.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.kind === 'text'
          ? Math.min(44, Math.max(12, c.label.length + 2, ...s.rows.map((rw) => String(rw.cells[i] ?? '').length + 1)))
          : Math.max(14, c.label.length + 6);
      });
      credit(ws, hr + s.rows.length + 2);
      ws.views = [{ state: 'frozen', ySplit: hr, showGridLines: false }];
      setup(ws, hr);
    });

    const buf = await wb.xlsx.writeBuffer();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), download: fileBase(r.p, idn) + '.xlsx' });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    status(`Excel file downloaded: document ${idn.id}.`);
  });

  // ---------- PDF ----------
  const pdfText = (s) => String(s).replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/÷/g, '/').replace(/[‘’]/g, "'");
  $('btn-pdf').addEventListener('click', async () => {
    const r = preview(nowMinute()); if (!r) return;
    if (libsMissing([['jspdf', 'PDF'], ['qrcode', 'QR code']])) return;
    status('Building the PDF…');
    const idn = await identify(r), qm = qrMatrix(idn.url);
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
    doc.setProperties({ title: `Marikar Group ${TITLE} ${idn.id}`, subject: `Verification code ${idn.codeShow}`, author: CREDIT, creator: 'Marikar Group performance hub', keywords: `${idn.id} ${idn.code}` });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
    const TOP = 58, BOTTOM = 76; // running header and footer zones
    const img = (k, x, y, h) => {
      const i = IMG[k]; if (!i) return 0; const w = h * i.w / i.h;
      try { doc.addImage(i.url, k === 'bpro' ? 'JPEG' : 'PNG', x, y, w, h, k); } catch (e) { return 0; }
      return w;
    };
    const ink = (rgb) => doc.setTextColor(...rgb);
    const strip = (h) => { doc.setFillColor(...C.violet); doc.rect(0, 0, W * 0.72, h, 'F'); doc.setFillColor(...C.amber); doc.rect(W * 0.72, 0, W * 0.28, h, 'F'); };

    // Page 1: cover band, parameters and verification panel.
    const BAND = 104;
    doc.setFillColor(...C.navy); doc.rect(0, 0, W, BAND, 'F'); strip(4);
    doc.setFillColor(255, 255, 255); doc.roundedRect(M, 18, 56, 74, 6, 6, 'F');
    img('marikar', M + 7, 23, 64);
    const bw = IMG.bpro ? 64 * IMG.bpro.w / IMG.bpro.h : 0;
    if (bw) { img('bpro', W - M - bw, 22, 64); doc.link(W - M - bw, 22, bw, 64, { url: 'https://www.bpropms.com' }); }
    const tx = M + 72;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); ink(C.amber); doc.text('MARIKAR GROUP  ·  PERFORMANCE HUB', tx, 38, { charSpace: 1.2 });
    doc.setFontSize(23); ink([255, 255, 255]); doc.text(TITLE, tx, 64);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(222, 214, 236);
    doc.text(pdfText(`${r.p.summary[0][1]}  ·  ${r.p.summary[1][1]}`), tx, 82, { maxWidth: W - tx - M - bw - 20 });

    const VW = 236, gap = 16, PW = W - 2 * M - VW - gap, y0 = BAND + 20;
    const kvs = [...r.p.summary];
    doc.setFontSize(9.5);
    const lines = kvs.map(([, v]) => doc.splitTextToSize(pdfText(v), PW - 148));
    const QS = 96, PH = Math.max(34 + QS + 30, 34 + lines.reduce((a, l) => a + l.length * 12.5 + 6, 0)); // both cards share this height
    const card = (x, w, h, title) => {
      doc.setFillColor(...C.ivory); doc.setDrawColor(...C.line); doc.setLineWidth(0.8); doc.roundedRect(x, y0, w, h, 8, 8, 'FD');
      doc.setFillColor(...C.copper); doc.rect(x + 14, y0 + 15, 3, 10, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); ink(C.copper); doc.text(title, x + 22, y0 + 23, { charSpace: 1 });
    };
    card(M, PW, PH, 'REPORT PARAMETERS');
    let ky = y0 + 44;
    kvs.forEach(([k], i) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); ink(C.muted); doc.text(k.toUpperCase(), M + 16, ky, { charSpace: 0.4 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ink(C.ink); doc.text(lines[i], M + 128, ky);
      ky += lines[i].length * 12.5 + 6;
    });
    const vx = M + PW + gap;
    card(vx, VW, PH, 'VERIFICATION');
    qrPdf(doc, qm, vx + 12, y0 + 34, QS, 4); doc.link(vx + 12, y0 + 34, QS, QS, { url: idn.url });
    const ix = vx + 12 + QS + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ink(C.muted); doc.text('DOCUMENT ID', ix, y0 + 46);
    doc.setFontSize(10); ink(C.navy); doc.text(idn.id, ix, y0 + 59);
    doc.setFontSize(7.5); ink(C.muted); doc.text('VERIFICATION CODE', ix, y0 + 76);
    doc.setFont('courier', 'bold'); doc.setFontSize(9); ink(C.ink); doc.text(idn.codeShow.slice(0, 9), ix, y0 + 88); doc.text(idn.codeShow.slice(10), ix, y0 + 99);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ink(C.violet); doc.textWithLink('Verify online >', ix, y0 + 118, { url: idn.url });
    doc.setFontSize(7.5); ink(C.muted);
    doc.text(doc.splitTextToSize('Scan to confirm this document matches the hub\'s data.', VW - 24), vx + 12, y0 + 34 + QS + 14);

    let y = y0 + PH + 30;
    r.secs.forEach((s) => {
      if (y > H - BOTTOM - 110) { doc.addPage(); y = TOP + 26; }
      doc.setFillColor(...C.copper); doc.rect(M, y - 9, 4, 12, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); ink(C.ink); doc.text(pdfText(s.title), M + 11, y + 1);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ink(C.muted); doc.text(pdfText(s.note), M + 11, y + 15, { maxWidth: W - 2 * M - 11 });
      const numIdx = s.columns.map((c, i) => (c.kind === 'text' ? null : i)).filter((i) => i !== null);
      doc.autoTable({
        startY: y + 24, margin: { left: M, right: M, top: TOP + 8, bottom: BOTTOM + 6 },
        head: [s.columns.map((c) => pdfText(c.label + (c.kind === 'money' ? ' (Rs.)' : '')))],
        body: s.rows.map((row) => row.cells.map((v, i) => pdfText(fmt[s.columns[i].kind](v)))),
        theme: 'plain', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 4.2, bottom: 4.2, left: 6, right: 6 }, textColor: C.ink, lineColor: C.line, lineWidth: { bottom: 0.5 }, valign: 'middle' },
        headStyles: { fontStyle: 'bold', textColor: [255, 255, 255], fillColor: C.navy2, fontSize: 8, lineWidth: 0 },
        alternateRowStyles: { fillColor: C.ivory },
        columnStyles: Object.fromEntries(numIdx.map((i) => [i, { halign: 'right' }])),
        didParseCell: (d) => {
          if (d.section === 'head' && numIdx.includes(d.column.index)) d.cell.styles.halign = 'right';
          if (d.section !== 'body') return;
          const type = s.rows[d.row.index].type;
          if (type === 'sub') { d.cell.styles.fillColor = C.sub; d.cell.styles.fontStyle = 'bold'; }
          if (type === 'total') { d.cell.styles.fillColor = C.total; d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = C.navy; d.cell.styles.lineWidth = 0; }
        },
        didDrawCell: (d) => {
          if (d.section === 'body' && s.rows[d.row.index].type === 'total') {
            doc.setDrawColor(...C.violet); doc.setLineWidth(1.4); doc.line(d.cell.x, d.cell.y, d.cell.x + d.cell.width, d.cell.y);
          }
        },
      });
      y = doc.lastAutoTable.finalY + 34;
    });

    // Running header (pages 2+) and footer with credit, document ID, QR code and page number (every page).
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      if (i > 1) {
        doc.setFillColor(...C.navy); doc.rect(0, 0, W, TOP - 22, 'F'); strip(3);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ink([255, 255, 255]); doc.text(`MARIKAR GROUP  ·  ${TITLE.toUpperCase()}`, M, 23, { charSpace: 0.6 });
        const hb = IMG.bpro ? 26 * IMG.bpro.w / IMG.bpro.h : 0;
        if (hb) img('bpro', W - M - hb, 6, 26);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(222, 214, 236); doc.text(`Document ${idn.id}`, W - M - hb - 10, 23, { align: 'right' });
      }
      const fy = H - BOTTOM + 6, QF = 52;
      doc.setDrawColor(...C.line); doc.setLineWidth(0.8); doc.line(M, fy, W - M, fy);
      doc.setFillColor(...C.copper); doc.rect(M, fy - 1, 40, 2, 'F');
      qrPdf(doc, qm, W - M - QF, fy + 6, QF, 2); doc.link(W - M - QF, fy + 6, QF, QF, { url: idn.url });
      let x = M, ty = fy + 20;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ink(C.muted);
      doc.text(CREDIT + '  ·  ', x, ty); x += doc.getTextWidth(CREDIT + '  ·  ');
      ink(C.violet); doc.textWithLink(LINKS[0][0], x, ty, { url: LINKS[0][1] }); x += doc.getTextWidth(LINKS[0][0]);
      ink(C.muted); doc.text('  |  ', x, ty); x += doc.getTextWidth('  |  ');
      ink(C.violet); doc.textWithLink(LINKS[1][0], x, ty, { url: LINKS[1][1] });
      doc.setFontSize(7.5); ink(C.muted);
      doc.text(`Document ${idn.id}  ·  Verification code ${idn.codeShow}  ·  Scan the QR code to verify  ·  Internal circulation`, M, ty + 14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ink(C.ink);
      doc.text(`Page ${i} of ${pages}`, W - M - QF - 12, ty, { align: 'right' });
    }
    doc.save(fileBase(r.p, idn) + '.pdf');
    status(`PDF downloaded: document ${idn.id}.`);
  });
})();
