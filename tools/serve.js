/* Tiny static server for local development.
   Run:  node tools/serve.js  ->  http://localhost:8123          */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8123;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

/* The headers Cloudflare adds to every response (the /* block in _headers), so
   the Content-Security-Policy is the same here as on the live site. */
const HEADERS = {};
let inAll = false;
fs.readFileSync(path.join(ROOT, '_headers'), 'utf8').split(/\r?\n/).forEach((line) => {
  if (/^[^\s#]/.test(line)) { inAll = line === '/*'; return; }
  const m = inAll && line.match(/^\s+([\w-]+):\s*(.+)$/);
  if (m) HEADERS[m[1]] = m[2];
});

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) {
      /* Same as Cloudflare: any missing path gets /404.html with a 404 status. */
      fs.readFile(path.join(ROOT, '404.html'), (e, page) => {
        res.writeHead(404, { 'Content-Type': e ? 'text/plain' : TYPES['.html'] }).end(e ? '404' : page);
      });
      return;
    }
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));
