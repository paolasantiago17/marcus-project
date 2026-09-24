// Local stand-in for `vercel dev` (npm run dev): serves the static site, runs api/*.js as
// functions, applies vercel.json rewrites, and swaps @vercel/blob for a
// folder on disk so the CMS can save/upload without a Blob token.
const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const BLOB_DIR = path.join(ROOT, '.dev-blob');
fs.mkdirSync(BLOB_DIR, { recursive: true });

process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'artup-local';
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'local-dev-secret';

// Fake @vercel/blob
const fakeBlob = {
  async put(pathname, body, opts = {}) {
    let name = pathname;
    if (opts.addRandomSuffix) {
      const ext = path.extname(name);
      name = name.slice(0, name.length - ext.length) + '-' + Math.random().toString(36).slice(2, 8) + ext;
    }
    const file = path.join(BLOB_DIR, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof body === 'string' ? body : Buffer.from(body));
    return { url: `http://localhost:${PORT}/__blob/${name}`, pathname: name };
  },
  async list({ prefix = '', limit = 1000 } = {}) {
    const out = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else {
          const rel = path.relative(BLOB_DIR, full).split(path.sep).join('/');
          if (rel.startsWith(prefix)) {
            out.push({ pathname: rel, url: `http://localhost:${PORT}/__blob/${rel}`, uploadedAt: fs.statSync(full).mtime });
          }
        }
      }
    };
    walk(BLOB_DIR);
    return { blobs: out.slice(0, limit) };
  },
  async del() {},
  async head() { return null; },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === '@vercel/blob') return '@vercel/blob';
  return origResolve.call(this, req, ...rest);
};
require.cache['@vercel/blob'] = { id: '@vercel/blob', filename: '@vercel/blob', loaded: true, exports: fakeBlob };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function sendFile(res, file) {
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

async function runApi(req, res, pathname) {
  const file = path.join(ROOT, pathname + '.js');
  if (!file.startsWith(path.join(ROOT, 'api')) || !isFile(file) || pathname.includes('/_lib/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"not_found"}');
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw || undefined; }
  catch { req.body = raw; }
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(b); return res; };
  delete require.cache[require.resolve(file)]; // pick up edits without restarting
  try { await require(file)(req, res); }
  catch (e) { console.error(pathname, e); if (!res.headersSent) res.status(500).json({ error: String(e.message) }); }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let p = decodeURIComponent(url.pathname);
  console.log(req.method, p);
  if (p.startsWith('/api/')) return runApi(req, res, p.replace(/\/$/, ''));
  if (p.startsWith('/__blob/')) {
    const f = path.join(BLOB_DIR, p.slice(8));
    return f.startsWith(BLOB_DIR) && isFile(f) ? sendFile(res, f) : (res.writeHead(404), res.end());
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (isFile(f)) return sendFile(res, f);
  if (isFile(path.join(f, 'index.html'))) {
    if (!p.endsWith('/')) { res.writeHead(308, { Location: p + '/' + url.search }); return res.end(); }
    return sendFile(res, path.join(f, 'index.html'));
  }
  // vercel.json rewrite: unknown single-segment slug -> catch-all page
  if (/^\/[^./]+\/?$/.test(p)) return sendFile(res, path.join(ROOT, 'page/index.html'));
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
}).listen(PORT, () => console.log(`ArtUP Life local: http://localhost:${PORT}  (admin / ${process.env.ADMIN_PASSWORD})`));
