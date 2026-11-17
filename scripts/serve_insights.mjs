import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest, cleanup } from '../services/insights/api.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8787);
const local = resolve(root, '.local');
await mkdir(local, { recursive: true });
const tokenPath = resolve(local, 'insights-admin-token.txt');
let token;
try { token = (await readFile(tokenPath, 'utf8')).trim(); }
catch { token = randomBytes(32).toString('hex'); await writeFile(tokenPath, token, { mode: 0o600 }); }
const db = new DatabaseSync(resolve(local, 'insights.sqlite'));
db.exec(await readFile(resolve(root, 'services/insights/schema.sql'), 'utf8'));
db.exec('PRAGMA journal_mode = WAL');
function statement(sql, args = []) {
  return {
    bind(...values) { return statement(sql, values); },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return db.prepare(sql).run(...args); }
  };
}
const env = { ADMIN_TOKEN: token, RATE_LIMIT_SECRET: token, ALLOWED_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`, DB: { prepare: statement, async batch(items) { return Promise.all(items.map(item => item.run())); } } };
await cleanup(env);
const cleanupTimer = setInterval(() => cleanup(env).catch(() => {}), 3600000);
cleanupTimer.unref();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.pdf': 'application/pdf', '.zip': 'application/zip', '.vcf': 'text/vcard; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 20000) { res.writeHead(413); res.end(); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      headers.delete('cf-connecting-ip');
      const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      const result = await handleRequest(request, env);
      res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer())); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    // Never expose .local, .git, secrets, scripts or server source through preview.
    if (!/^\/(index\.html|insights\.html|confidentialite\.html|assets\/[a-zA-Z0-9_./-]+|content\/profile\.json)$/.test(path) || path.split('/').some(part => part.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => {
  console.log(`Portfolio : http://127.0.0.1:${port}/`);
  console.log(`Tableau de bord : http://127.0.0.1:${port}/insights.html`);
  console.log('Clé privée : .local/insights-admin-token.txt (à saisir dans le tableau de bord).');
});
