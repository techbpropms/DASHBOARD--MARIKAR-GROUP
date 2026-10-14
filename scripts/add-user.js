// Adds a hub account to assets/auth.js. Prints a generated temporary password once; only its salted
// PBKDF2 fingerprint is written to the file.   node scripts/add-user.js <user-id> "<Full name>" [role]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [id, name, role = 'viewer'] = process.argv.slice(2);
if (!id || !name || !/^[a-z0-9._-]+$/.test(id)) { console.error('usage: node scripts/add-user.js <user-id: a-z 0-9 . _ -> "<Full name>" [role]'); process.exit(1); }
const file = path.join(__dirname, '..', 'assets', 'auth.js');
let src = fs.readFileSync(file, 'utf8');
if (src.includes(`id: '${id}'`)) { console.error(`User ${id} already exists.`); process.exit(1); }
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const pick = (n) => Array.from(crypto.randomBytes(n), (b) => A[b % A.length]).join('');
const password = `MG-${pick(4)}-${pick(4)}-${pick(4)}`;
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 210000, 32, 'sha256').toString('hex');
const line = `    { id: '${id}', name: ${JSON.stringify(name)}, role: '${role}', salt: '${salt}', hash: '${hash}' },\n`;
src = src.replace(/(\n  \];\n  const ROUNDS)/, `\n${line.trimEnd()}$1`);
fs.writeFileSync(file, src);
console.log(`Added ${id} (${name}, ${role}). Temporary password, shown once: ${password}`);
