// Builds the user manual PDF from manual.html.
//   node build.js            -> pass 1 (no contents page numbers), writes manual.pdf and pages.json
//   node build.js --toc      -> pass 2 using toc.json (heading -> page) produced by toc.py
// Also stamps the document ID, date and a verification QR on the cover.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const qrcode = require(path.join(__dirname, '../../assets/vendor/qrcode.js'));
const DOC = JSON.parse(fs.readFileSync(path.join(__dirname, 'doc.json'), 'utf8'));
const url = `${DOC.base}verify.html?d=${DOC.id}`;
const q = qrcode(0, 'M'); q.addData(url); q.make();
const n = q.getModuleCount(), quiet = 2, size = n + 2 * quiet; let d = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
const qr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#131c38"/></svg>`;
let html = fs.readFileSync(path.join(__dirname, 'manual.html'), 'utf8')
  .replaceAll('__QR__', qr).replaceAll('__DOCID__', DOC.id).replaceAll('__DATE__', DOC.date).replaceAll('__VERSION__', DOC.version)
  .replaceAll('__VERIFY__', url).replaceAll('__VERIFY_SHORT__', url.replace(/^https?:\/\//, ''));
const toc = process.argv.includes('--toc') && fs.existsSync(path.join(__dirname, 'toc.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'toc.json'), 'utf8')) : {};
html = html.replace(/<span class="pg" data-h="([^"]+)"><\/span>/g, (m, h) => `<span class="pg">${toc[h] || ''}</span>`);
const tmp = path.join(__dirname, '.render.html'); fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print' });
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../../assets/img/marikar-group.png')).toString('base64');
  await p.pdf({
    path: path.join(__dirname, 'manual.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="width:100%;font:9px Inter,sans-serif;color:#6b6157;padding:0 14mm;display:flex;justify-content:space-between;align-items:center"><span style="display:flex;align-items:center;gap:6px"><img src="${logo}" style="height:14px"> Marikar Group performance hub · User manual v${DOC.version}</span><span>${DOC.id}</span></div>`,
    footerTemplate: `<div style="width:100%;font:9px Inter,sans-serif;color:#6b6157;padding:0 14mm;display:flex;justify-content:space-between"><span>D&amp;D by Dr.Babu.B · BPro Consulting &amp; Technologies · www.drbabu.in | www.bpropms.com</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '16mm', left: '14mm', right: '14mm' },
  });
  await b.close();
  fs.unlinkSync(tmp);
  console.log('wrote manual.pdf', process.argv.includes('--toc') ? '(with contents page numbers)' : '(pass 1)');
})();
