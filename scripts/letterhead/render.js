const { chromium } = require('playwright');
(async () => {
  const [src, out] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const p = await b.newPage();
  await p.goto('file://' + require('path').resolve(src), { waitUntil: 'load' });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({
    path: out, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7px;color:#6b6157;padding:0 18mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact"><span>Ref: Data Request &amp; Export Playbook · Pilot reconciliation · HD Attingal</span><span>Confidential · Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
    margin: { top: '0', bottom: '9mm', left: '0', right: '0' },
  });
  await b.close();
})();
