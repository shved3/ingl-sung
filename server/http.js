import { workspace } from './workspace.js';
export default async function api(req, res) {
  try {
    const origin = process.env.APP_ORIGIN || (process.env.VERCEL ? 'https://' : 'http://') + req.headers.host;
    let body;
    if (req.method === 'POST') {
      if (req.body !== undefined) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (Buffer.byteLength(body) > 1100000) throw Error('size');
      } else {
        const parts = [];
        let len = 0;
        for await (const buf of req) {
          len += buf.length;
          if (len > 1100000) throw Error('size');
          parts.push(buf);
        }
        body = Buffer.concat(parts).toString('utf8');
      }
    }
    const r = await workspace(new Request(new URL('/api/workspace', origin), {
      method: req.method,
      headers: req.headers,
      body
    }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  } catch {
    res.writeHead(400, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
      error: 'Ungültige oder zu große Anfrage.'
    }));
  }
}
