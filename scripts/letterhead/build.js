// Fills the letterhead template: BPro logo, document ID, verification link and QR codes (as SVG).
const fs = require('fs');
const qrcode = require(require('path').join(__dirname, '../../assets/vendor/qrcode.js'));
const [src, out, id, base] = process.argv.slice(2);
const url = `${base}verify.html?d=${id}`;
const q = qrcode(0, 'M'); q.addData(url); q.make();
const n = q.getModuleCount(), quiet = 2, size = n + 2 * quiet;
let d = '';
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#14100c"/></svg>`;
const logo = 'data:image/jpeg;base64,' + fs.readFileSync(require('path').join(__dirname, '../../assets/img/bpro.jpg')).toString('base64');
let s = fs.readFileSync(src, 'utf8');
s = s.replaceAll('__LOGO__', logo).replaceAll('__QR__', svg).replaceAll('__DOCID__', id)
  .replaceAll('__VERIFY_SHORT__', url.replace(/^https?:\/\//, '').replace(/\?.*$/, '')).replaceAll('__VERIFY__', url);
fs.writeFileSync(out, s);
console.log('QR', n + 'x' + n, url);
