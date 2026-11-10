import { database } from './database.js';
import { uid, hash, fail, clean, roles, canUpload, canReview, emailOf, passwordHash, login, person, cookieToken, newSession, sessionCookie } from './auth.js';
import { answer } from './evaluate.js';
import { timingSafeEqual } from 'node:crypto';
function json(payload, status = 200, cookie) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  if (cookie) h['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(payload), {
    status,
    headers: h
  });
}
async function documents(db, u) {
  const full = await db.all("SELECT * FROM documents WHERE owner=? OR scope='team' ORDER BY created DESC", u.id);
  const granted = await db.all("SELECT d.*,r.id AS grantId,r.excerpt FROM requests r JOIN documents d ON d.id=r.doc WHERE r.requester=? AND r.status='approved' AND r.expires>?", u.id, Date.now());
  for (const d of granted) {
    if (full.some(x => x.id === d.id)) continue;
    full.push({
      ...d,
      sourceId: d.id,
      id: 'grant:' + d.grantId,
      body: d.excerpt || d.body
    });
  }
  return full;
}
function provenance(result, docs) {
  return [...new Set(result.dependencies)].map(key => {
    const d = docs.find(d => d.id === key);
    if (!d) fail('Zugriff hat sich geändert.', 409);
    return {
      key,
      source: d.sourceId || d.id,
      scopeHash: hash(d.body),
      important: d.importance === 'important'
    };
  });
}
function applyPolicy(row, docs, decisions) {
  const r = JSON.parse(row.result);
  const prov = r.provenance || [];
  const current = prov.map(p => docs.find(d => d.id === p.key || d.id === p.source || d.sourceId === p.source && hash(d.body) === p.scopeHash));
  if (current.some(d => !d)) return null;
  const important = prov.filter((p, i) => p.important || current[i].importance === 'important');
  const mark = important.length && r.refs.length > 0;
  const signature = mark ? hash(JSON.stringify(current.map((d, i) => [prov[i].source, d.revision, prov[i].important]))) : null;
  const decision = signature && decisions.find(x => x.message === row.id && x.signature === signature);
  const review = mark ? {
    status: decision?.decision || 'pending',
    reason: 'Wichtige Quelle im Auswertungskontext',
    sources: [...new Set(important.map(p => current[prov.indexOf(p)].name))],
    by: decision?.name,
    note: decision?.note,
    signature
  } : null;
  // A reviewer may see the same source through ownership rather than the author's grant.
  const refs = r.refs.map(ref => {
    const index = prov.findIndex(p => p.key === ref.doc);
    return index < 0 ? ref : {
      ...ref,
      doc: current[index].id
    };
  });
  return {
    ...row,
    result: {
      ...r,
      refs,
      review
    }
  };
}
const withheld = row => ({
  ...row,
  result: {
    text: 'Eine verwendete Quelle ist für Sie nicht mehr freigegeben.',
    refs: [],
    groups: [],
    score: null,
    missing: true,
    mode: 'Zugriff abgelaufen',
    dependencies: []
  }
});
async function handle(req) {
  const db = await database();
  const u = await person(db, req);
  if (req.method !== 'GET' && req.method !== 'POST') fail('Methode nicht unterstützt.', 405);
  if (req.method === 'POST') {
    if (!req.headers.get('content-type')?.startsWith('application/json')) fail('JSON erforderlich.', 415);
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(process.env.APP_ORIGIN || req.url).origin) fail('Fremder Ursprung.', 403);
  }
  const b = req.method === 'POST' ? await req.json() : {};
  const now = Date.now();
  if (!u) {
    if (req.method === 'GET') return json({
      auth: false,
      setup: !(await db.one('SELECT id FROM users LIMIT 1'))
    });
    if (b.action === 'setup') {
      const token = process.env.EVIDENCE_SETUP_TOKEN || '';
      if (token.length < 24 || !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(hash(String(b.token || ''))))) fail('Setup-Code fehlt oder ist ungültig.', 403);
      const email = emailOf(b.email),
        name = clean(b.name, 120);
      if (!name) fail('Name fehlt.');
      const admin = {
        id: uid()
      };
      const created = await db.run("INSERT INTO users SELECT ?,?,?,'admin',? WHERE NOT EXISTS(SELECT 1 FROM users)", [admin.id, email, name, await passwordHash(b.password)]);
      if (!created.changes) fail('Das erste Konto wurde bereits angelegt.', 409);
      return json({
        ok: true
      }, 201, await newSession(db, admin, req));
    }
    if (b.action === 'login') {
      const user = await login(db, b);
      return json({
        ok: true
      }, 200, await newSession(db, user, req));
    }
    fail('Bitte anmelden.', 401);
  }
  if (b.action === 'logout') {
    await db.run('DELETE FROM sessions WHERE token=?', [hash(cookieToken(req))]);
    return json({
      ok: true
    }, 200, sessionCookie(req, '', 0));
  }
  if (b.action === 'user') {
    if (u.role !== 'admin') fail('Nur die Administration kann Konten anlegen.', 403);
    const mail = emailOf(b.email);
    if (!roles.includes(b.role) || !clean(b.name, 120)) fail('Name oder Rolle fehlt.');
    if (await db.one('SELECT id FROM users WHERE email=?', mail)) fail('Diese Adresse ist bereits vergeben.', 409);
    await db.run('INSERT INTO users VALUES (?,?,?,?,?)', [uid(), mail, clean(b.name, 120), b.role, await passwordHash(b.password)]);
    return json({
      ok: true
    });
  }
  const docs = await documents(db, u);
  if (req.method === 'GET') {
    const decisions = await db.all('SELECT * FROM reviews ORDER BY created DESC');
    const history = (await db.all('SELECT * FROM messages WHERE user=? ORDER BY created DESC LIMIT 240', u.id)).map(row => applyPolicy(row, docs, decisions) || withheld(row));
    const queue = canReview(u) ? (await db.all("SELECT m.*,u.name AS author FROM messages m JOIN users u ON u.id=m.user WHERE m.user<>? ORDER BY created DESC", u.id)).map(row => applyPolicy(row, docs, decisions)).filter(row => row?.result.review?.status === 'pending') : [];
    const requests = await db.all('SELECT id,requester,sender,recipient,purpose,status,expires,created FROM requests WHERE requester=? OR recipient=? ORDER BY created DESC', u.id, u.email);
    const users = u.role === 'admin' ? await db.all('SELECT name,email,role FROM users ORDER BY name') : [];
    return json({
      auth: true,
      me: u,
      docs: docs.map(({
        body,
        owner,
        excerpt,
        grantId,
        ...d
      }) => ({
        ...d,
        mine: owner === u.id,
        shared: !!grantId
      })),
      history,
      queue,
      requests,
      users,
      live: !!process.env.OPENAI_API_KEY
    });
  }
  if (b.action === 'read') {
    const d = docs.find(d => d.id === b.doc);
    if (!d) fail('Keine Leseberechtigung.', 403);
    return json({
      name: d.name,
      text: d.body
    });
  }
  if (b.action === 'upload') {
    if (!canUpload(u)) fail('Dokumentverantwortliche Rolle erforderlich.', 403);
    const title = clean(b.name, 150),
      body = clean(b.text, 200001);
    if (!title || !body || body.length > 200000) fail('Titel und maximal 200.000 Zeichen Dokumenttext erforderlich.');
    if (!['normal', 'important'].includes(b.importance)) fail('Wichtigkeit auswählen.');
    await db.run('INSERT INTO documents(id,owner,name,body,scope,issuer,reviewed,importance,created) VALUES(?,?,?,?,?,?,?,?,?)', [uid(), u.id, title, body, b.team ? 'team' : 'private', clean(b.issuer, 160), b.reviewed ? 1 : 0, b.importance, now]);
  } else if (b.action === 'classify') {
    if (!canUpload(u) || !['normal', 'important'].includes(b.importance)) fail('Keine Berechtigung.', 403);
    const updated = await db.run('UPDATE documents SET importance=?,revision=revision+1 WHERE id=? AND owner=? AND importance<>?', [b.importance, b.doc, u.id, b.importance]);
    if (!updated.changes) fail('Keine Änderung möglich.', 409);
  } else if (b.action === 'ask') {
    const question = clean(b.question, 2500);
    if (!question) fail('Bitte eine Frage eingeben.');
    const thread = clean(b.thread, 80) || uid();
    const rows = await db.all('SELECT * FROM messages WHERE user=? AND thread=? ORDER BY created DESC LIMIT 3', u.id, thread);
    const history = rows.reverse().map(x => applyPolicy(x, docs, [])).filter(Boolean).map(h => ({
      frage: h.question,
      antwort: h.result.text,
      dependencies: h.result.dependencies
    }));
    const r = await answer(process.env, docs, question, history);
    r.provenance = provenance(r, docs);
    if (!applyPolicy({
      result: JSON.stringify(r)
    }, await documents(db, u), [])) fail('Berechtigung wurde geändert.', 409);
    await db.run('INSERT INTO messages VALUES(?,?,?,?,?,?)', [uid(), u.id, thread, question, JSON.stringify(r), now]);
    return json({
      thread
    });
  } else if (b.action === 'review') {
    if (!canReview(u)) fail('Fachprüferrolle erforderlich.', 403);
    const row = await db.one('SELECT * FROM messages WHERE id=?', b.id);
    if (!row || row.user === u.id) fail('Unabhängige Fachprüfung erforderlich.', 403);
    const current = applyPolicy(row, docs, []);
    const rev = current?.result.review;
    if (!rev || rev.signature !== b.signature) fail('Quelle oder Berechtigung hat sich geändert.', 409);
    const note = clean(b.note, 2000);
    if (!note || !['confirmed', 'rejected'].includes(b.decision)) fail('Begründung und Entscheidung erforderlich.');
    const inserted = await db.run('INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?,?,?,?)', [uid(), row.id, rev.signature, u.id, u.name, b.decision, note, now]);
    if (!inserted.changes) fail('Bereits geprüft.', 409);
  } else if (b.action === 'request') {
    const recipient = emailOf(b.recipient),
      purpose = clean(b.purpose, 1600);
    if (!purpose || recipient === u.email) fail('Zweck und andere zuständige Person erforderlich.');
    if (!(await db.one("SELECT id FROM users WHERE email=? AND role IN ('admin','manager')", recipient))) fail('Für diese Adresse ist kein Dokumentverantwortlicher hinterlegt.');
    await db.run('INSERT INTO requests(id,requester,sender,recipient,purpose,status,created) VALUES(?,?,?,?,?,?,?)', [uid(), u.id, u.email, recipient, purpose, 'open', now]);
  } else if (['approve', 'deny', 'revoke'].includes(b.action)) {
    const q = await db.one('SELECT * FROM requests WHERE id=? AND recipient=?', b.id, u.email);
    if (!q || !canUpload(u)) fail('Keine Berechtigung.', 403);
    const old = b.action === 'revoke' ? 'approved' : 'open';
    let doc = null,
      excerpt = null,
      expires = null;
    if (b.action === 'approve') {
      const d = docs.find(d => d.owner === u.id && d.id === b.doc);
      if (!d) fail('Eigenes Dokument wählen.');
      doc = d.id;
      excerpt = clean(b.excerpt, 200000) || null;
      if (excerpt && !d.body.includes(excerpt)) fail('Auszug muss wörtlich im Dokument stehen.');
      expires = now + (b.days === 7 ? 7 : 1) * 86400000;
    }
    const op = await db.run('UPDATE requests SET status=?,doc=?,excerpt=?,expires=? WHERE id=? AND recipient=? AND status=?', [{
      approve: 'approved',
      deny: 'denied',
      revoke: 'revoked'
    }[b.action], doc, excerpt, expires, q.id, u.email, old]);
    if (!op.changes) fail('Anfrage bereits bearbeitet.', 409);
  } else fail('Unbekannte Aktion.');
  return json({
    ok: true
  });
}
export async function workspace(req) {
  try {
    return await handle(req);
  } catch (e) {
    if (!e.status) console.error('Evidence:', e.name, e.message?.slice(0, 160));
    return json({
      error: e.status ? e.message : 'Dienst derzeit nicht verfügbar. Serverkonfiguration und Protokoll prüfen.'
    }, e.status || 503);
  }
}
