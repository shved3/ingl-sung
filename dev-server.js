// Lokaler Testserver ohne Installation:  node dev-server.js   ->  http://localhost:3000
// (Auf Vercel wird diese Datei nicht gebraucht.)
const http = require('http');
const fs = require('fs');
const path = require('path');

// .env einlesen, falls vorhanden
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (e) {}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const STATIC = ['index.html', 'erklaerung.html', 'app.js', 'style.css'];

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(__dirname, 'api', name + '.js');
    if (!fs.existsSync(file)) return res.status(404).json({ fehler: 'Nicht gefunden.' });
    let data = '';
    req.on('data', d => { data += d; });
    req.on('end', async () => {
      try { req.body = data ? JSON.parse(data) : {}; } catch (e) { req.body = {}; }
      try { await require(file)(req, res); } catch (e) { res.status(500).json({ fehler: e.message }); }
    });
    return;
  }
  const f = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!STATIC.includes(f)) { res.statusCode = 404; return res.end('Nicht gefunden'); }
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'text/plain');
  fs.createReadStream(path.join(__dirname, 'public', f)).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('Evidence läuft auf http://localhost:' + (process.env.PORT || 3000)));
