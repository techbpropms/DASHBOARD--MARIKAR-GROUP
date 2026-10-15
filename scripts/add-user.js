// Adds a hub account to assets/auth.js. Prints a generated temporary password once; only its salted
// PBKDF2 fingerprint is written to the file.   node scripts/add-user.js <user-id> "<Full name>" [role] [divisions]
// `divisions` limits a viewer to some divisions: comma-separated keys from data/divisions.json (HONDA,AMZES); omit for all.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [id, name, role = 'viewer', divisions = ''] = process.argv.slice(2);
const divs = divisions.split(/[\s,]+/).map((k) => k.trim().toUpperCase()).filter(Boolean);
const divsField = role === 'viewer' && divs.length && !divs.includes('ALL') ? `, divisions: [${divs.map((k) => `'${k}'`).join(', ')}]` : '';
if (!id || !name || !/^[a-z0-9._@-]+$/.test(id)) { console.error('usage: node scripts/add-user.js <user-id: a-z 0-9 . _ @ -> "<Full name>" [role]'); process.exit(1); }
const file = path.join(__dirname, '..', 'assets', 'auth.js');
let src = fs.readFileSync(file, 'utf8');
if (src.includes(`id: '${id}'`)) { console.error(`User ${id} already exists.`); process.exit(1); }
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const pick = (n) => Array.from(crypto.randomBytes(n), (b) => A[b % A.length]).join('');
const password = `MG-${pick(4)}-${pick(4)}-${pick(4)}`;
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 210000, 32, 'sha256').toString('hex');
const line = `    { id: '${id}', name: ${JSON.stringify(name)}, role: '${role}', salt: '${salt}', hash: '${hash}'${divsField} },\n`;
src = src.replace(/(\n  \];\n  const ROUNDS)/, `\n${line.trimEnd()}$1`);
fs.writeFileSync(file, src);
console.log(`Added ${id} (${name}, ${role}${divsField ? ', ' + divs.join(', ') : ''}). Temporary password, shown once: ${password}`);
