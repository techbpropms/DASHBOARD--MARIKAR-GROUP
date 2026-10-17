// Minimal data layer for the dashboard: loads the CSVs in data/ (or the folder the page names in DASH_DATA) and exposes
// dash.data / dash.onData / dash.calc / dash.params / dash.colors to assets/dashboard.js.
window.dash = (() => {
  const BASE = window.DASH_DATA || 'data/';
  const FILES = {
    monthly: BASE + 'monthly.csv',
    streams: BASE + 'streams.csv',
    heads: BASE + 'heads.csv',
    voucher_types: BASE + 'voucher_types.csv',
    daily: BASE + 'daily.csv',
    items: BASE + 'items.csv',
    companies: BASE + 'companies.csv',
    completeness: BASE + 'completeness.csv',
    stock: BASE + 'stock.csv',
    stock_items: BASE + 'stock_items.csv',
  };
  const DEFAULT_PARAMS = { company: null, fy: null };
  let params = { ...DEFAULT_PARAMS };
  const state = {};
  const calcs = {};
  const subs = [];

  const run = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  Object.entries(FILES).forEach(([id, url]) => {
    state[id] = { status: 'loading', data: [], columns: [] };
    d3.csv(url)
      .then((rows) => { state[id] = { status: 'ok', data: rows, columns: rows.columns || [] }; run(); })
      .catch((err) => { state[id] = { status: 'error', data: [], columns: [], message: String(err) }; run(); });
  });

  function data(id) {
    const c = calcs[id];
    if (c) {
      const ins = c.inputs.map(data);
      const bad = ins.find((d) => d.status !== 'ok');
      if (bad) return { status: bad.status, data: [] };
      try {
        const out = c.fn(...ins.map((d) => d.data));
        return { status: 'ok', data: Array.isArray(out) ? out : [out] };
      } catch (e) {
        console.error(e);
        return { status: 'error', data: [], message: String(e) };
      }
    }
    return state[id] || { status: 'missing', data: [] };
  }

  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(run, 120); });

  return {
    data,
    onData(fn) { subs.push(fn); fn(); },
    calc(id, def) { calcs[id] = { inputs: def.inputs, fn: def.fn }; },
    params() { return { ...params }; },
    setParams(p) { params = { ...params, ...p }; run(); },
    resetParams() { params = { ...DEFAULT_PARAMS }; run(); },
    colors: ['#3b6fd8', '#e0873a', '#2fa37a', '#9a5fd0', '#8a8f98', '#d6577a', '#c9a227', '#3fa5c4'],
  };
})();
