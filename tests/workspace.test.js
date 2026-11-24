import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { workspace } from '../server/workspace.js';
import { randomBytes } from 'node:crypto';
const origin = 'http://localhost:3000',
  secret = randomBytes(30).toString('hex'),
  pwd = randomBytes(18).toString('hex');
let temp;
before(async () => {
  temp = await mkdtemp(path.join(tmpdir(), 'evidence-test-'));
  process.env.DATA_DIR = temp;
  process.env.EVIDENCE_SETUP_TOKEN = secret;
  for (const key of ['VERCEL', 'EVIDENCE_DATABASE_URL', 'EVIDENCE_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'OPENAI_API_KEY', 'OLLAMA_MODEL', 'APP_ORIGIN']) delete process.env[key];
});
after(async () => rm(temp, {
  recursive: true,
  force: true
}));
async function send(cookie, payload, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    origin
  };
  if (cookie) headers.cookie = cookie;
  const r = await workspace(new Request(origin + '/api/workspace', {
    method: payload ? 'POST' : 'GET',
    headers,
    body: payload ? JSON.stringify(payload) : undefined
  }));
  const value = await r.json();
  assert.equal(r.status, status, JSON.stringify(value));
  return {
    value,
    cookie: r.headers.get('set-cookie')?.split(';')[0]
  };
}
let admin, manager, employee, reviewer, normal, privateId;
test('Einrichtung, Konten, Upload und Einstufung nur mit passenden Rechten', async () => {
  assert.equal((await send()).value.setup, true);
  await send('', {
    action: 'setup',
    token: 'wrong'
  }, 403);
  admin = (await send('', {
    action: 'setup',
    token: secret,
    name: 'Admin',
    email: 'admin@example.invalid',
    password: pwd
  }, 201)).cookie;
  await send('', {
    action: 'setup',
    token: secret,
    name: 'Again',
    email: 'other@example.invalid',
    password: pwd
  }, 409);
  const accounts = {};
  for (const role of ['manager', 'employee', 'reviewer']) {
    const email = role + '@example.invalid';
    await send(admin, {
      action: 'user',
      role,
      name: role,
      email,
      password: pwd
    });
    accounts[role] = (await send('', {
      action: 'login',
      email,
      password: pwd
    })).cookie;
  }
  ;
  ({
    manager,
    employee,
    reviewer
  } = accounts);
  await send(employee, {
    action: 'upload',
    name: 'X',
    text: 'X',
    importance: 'important'
  }, 403);
  await send(manager, {
    action: 'upload',
    name: 'Bericht',
    text: 'Der Auftrag umfasst 500 Geräte.',
    importance: 'normal',
    team: true,
    issuer: 'Leitung',
    reviewed: true
  });
  await send(manager, {
    action: 'upload',
    name: 'Vertraulich',
    text: 'Das Kennwort lautet Phlox. Interner Anhang nicht freigeben.',
    importance: 'important',
    issuer: 'Leitung',
    reviewed: true
  });
  const docs = (await send(manager)).value.docs;
  normal = docs.find(d => d.name === 'Bericht').id;
  privateId = docs.find(d => d.name === 'Vertraulich').id;
  const accessible = (await send(employee)).value.docs;
  assert.deepEqual(accessible.filter(d => !d.publishedUrl).map(d => d.id), [normal]);
  const published = accessible.find(d => d.publishedUrl);
  assert.equal(published.format, 'PDF');
  assert.equal((await send(employee,{action:'read',doc:published.id})).value.pages, 17);
  await send(employee, {
    action: 'read',
    doc: privateId
  }, 403);
  await send(employee, {
    action: 'classify',
    doc: normal,
    importance: 'important'
  }, 403);
});
test('100 Punkte bleiben bei wichtigen Quellen prüfpflichtig. Neubewertung und unabhängige Entscheidung.', async () => {
  await send(employee, {
    action: 'ask',
    question: 'Wie viele Geräte enthält der Auftrag?'
  });
  let row = (await send(employee)).value.history[0];
  assert.equal(row.result.score, 100);
  assert.equal(row.result.review, null);
  await send(manager, {
    action: 'classify',
    doc: normal,
    importance: 'important'
  });
  row = (await send(employee)).value.history[0];
  assert.equal(row.result.review.status, 'pending');
  let q = (await send(reviewer)).value.queue[0];
  assert.equal(q.id, row.id);
  const action = {
    action: 'review',
    id: q.id,
    signature: q.result.review.signature,
    decision: 'confirmed',
    note: 'Wortlaut anhand des Originals kontrolliert.'
  };
  await send(employee, action, 403);
  await send(reviewer, action);
  await send(reviewer, action, 409);
  assert.equal((await send(employee)).value.history[0].result.review.status, 'confirmed');
  assert.equal((await send(reviewer)).value.queue.length, 0);
  await send(admin, {
    action: 'ask',
    question: 'Geräte'
  });
  const own = (await send(admin)).value.history[0];
  await send(admin, {
    ...action,
    id: own.id,
    signature: own.result.review.signature
  }, 403);
  await send(manager, {
    action: 'classify',
    doc: normal,
    importance: 'normal'
  });
  assert.equal((await send(admin)).value.history[0].result.review.status, 'pending');
});
test('Vertrauliche Quelle, Auszug, unabhängige Prüfberechtigung, Widerruf und gesperrter Verlauf', async () => {
  await send(employee, {
    action: 'request',
    recipient: 'manager@example.invalid',
    purpose: 'Nachweis für Kennwort'
  });
  const req = (await send(manager)).value.requests[0];
  await send(employee, {
    action: 'approve',
    id: req.id,
    doc: privateId
  }, 403);
  await send(manager, {
    action: 'approve',
    id: req.id,
    doc: privateId,
    excerpt: 'Das Kennwort lautet Phlox.',
    days: 1
  });
  let state = (await send(employee)).value;
  const grant = state.docs.find(x => x.shared);
  assert.equal((await send(employee, {
    action: 'read',
    doc: grant.id
  })).value.text, 'Das Kennwort lautet Phlox.');
  await send(employee, {
    action: 'ask',
    question: 'Kennwort?'
  });
  const row = (await send(employee)).value.history[0];
  assert.equal(row.result.review.status, 'pending');
  assert(!(await send(reviewer)).value.queue.some(r => r.id === row.id));
  await send(reviewer, {
    action: 'request',
    recipient: 'manager@example.invalid',
    purpose: 'Fachprüfung des Auszugs'
  });
  const other = (await send(manager)).value.requests.find(q => q.purpose === 'Fachprüfung des Auszugs');
  await send(manager, {
    action: 'approve',
    id: other.id,
    doc: privateId,
    excerpt: 'Das Kennwort lautet Phlox.'
  });
  const review = (await send(reviewer)).value.queue.find(x => x.id === row.id);
  assert(review);
  assert.equal((await send(reviewer, {
    action: 'read',
    doc: review.result.refs[0].doc
  })).value.text, 'Das Kennwort lautet Phlox.');
  await send(reviewer, {
    action: 'review',
    id: row.id,
    signature: review.result.review.signature,
    decision: 'rejected',
    note: 'Ergänzende Belege fehlen.'
  });
  assert.equal((await send(employee)).value.history[0].result.review.status, 'rejected');
  await send(manager, {
    action: 'revoke',
    id: req.id
  });
  await send(employee, {
    action: 'read',
    doc: grant.id
  }, 403);
  state = (await send(employee)).value;
  assert(!JSON.stringify(state).includes('Phlox'));
});
test('KI-Pfad mit simuliertem Modell: wichtige Kontextquelle auch bei ausgelassenem Zitat; kein Live-Aufruf', async () => {
  await send(manager, {
    action: 'upload',
    name: 'Wichtige ergänzende Richtlinie',
    text: 'Beim Auftrag mit Geräten sind die Lieferbedingungen zu prüfen.',
    importance: 'important',
    team: true,
    issuer: 'Leitung',
    reviewed: true
  });
  const original = globalThis.fetch;
  let calls = 0;
  process.env.OPENAI_API_KEY = 'simulated-in-test';
  globalThis.fetch = async (url, opts) => {
    calls++;
    const messages = JSON.parse(opts.body).messages;
    const inputs = JSON.parse(messages[1].content);
    let output;
    if (calls === 1) {
      const source = inputs.abschnitte.find(p => p.quelle === 'Bericht');
      output = {
        fazit: 'Der Auftrag umfasst 500 Geräte.',
        begruendung: 'Der Bericht nennt die Stückzahl ausdrücklich.',
        luecke: '',
        missing: false,
        refs: [{
          id: source.id,
          quote: 'Der Auftrag umfasst 500 Geräte.'
        }]
      };
    } else {
      output = {
        widerspruch: false,
        kriterien: Array.from({
          length: 20
        }, () => ({
          wert: 2,
          grund: 'Im Test erfüllt.'
        }))
      };
    }
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify(output)
        }
      }]
    });
  };
  try {
    await send(employee, {
      action: 'ask',
      question: 'Wie viele Geräte umfasst der Auftrag?'
    });
    const r = (await send(employee)).value.history[0].result;
    assert.equal(calls, 2);
    assert.equal(r.text, 'Der Auftrag umfasst 500 Geräte.');
    assert.equal(r.reasoning, 'Der Bericht nennt die Stückzahl ausdrücklich.');
    assert.equal(r.score, 100);
    assert.equal(r.review.status, 'pending');
    assert(r.review.sources.includes('Wichtige ergänzende Richtlinie'));
  } finally {
    globalThis.fetch = original;
    delete process.env.OPENAI_API_KEY;
  }
});

test('Schwellenvalidierung und persistierter Prüfverlauf', async () => {
  for (const threshold of [-1, 101, 1.5, null, '']) {
    await send(employee, { action: 'ask', question: 'Auftrag?', threshold }, 400);
  }
  await send(employee, { action: 'ask', question: 'Auftrag?', threshold: 91 });
  const r = (await send(employee)).value.history[0].result;
  assert.equal(r.audit.threshold, 91);
  assert(r.audit.sources.length);
  assert.equal(r.audit.steps.find(s => s.id === 'ai1').status, 'skipped');
});
test('Auch ausgeschlossene Audit-Fundstellen werden bei Widerruf verborgen', async () => {
  await send(employee, { action: 'request', recipient: 'manager@example.invalid', purpose: 'Temporärer Audit-Test' });
  const req = (await send(manager)).value.requests.find(r => r.purpose === 'Temporärer Audit-Test');
  await send(manager, { action: 'approve', id: req.id, doc: privateId, excerpt: 'Das Kennwort lautet Phlox.', days: 1 });
  await send(employee, { action: 'ask', question: 'Wie viele Geräte umfasst der Auftrag?' });
  let row = (await send(employee)).value.history[0];
  assert(row.result.audit.sources.some(s => s.decision === 'excluded' && s.quote.includes('Phlox')));
  await send(manager, { action: 'revoke', id: req.id });
  row = (await send(employee)).value.history.find(r => r.id === row.id);
  assert(!JSON.stringify(row).includes('Phlox'));
  assert.equal(row.result.audit, undefined);
});
test('Wichtige Quelle bleibt bei niedrigen Punkten und ohne KI-Zitat fachprüfpflichtig', async t => {
  await send(manager, { action: 'upload', name: 'Abweichungsnachtrag', text: 'Der Auftrag wurde storniert.', importance: 'important', team: true });
  process.env.OLLAMA_MODEL = 'test-only';
  const call = t.mock.method(globalThis, 'fetch', async () => { throw Error('KI-Ausfall'); });
  try {
    await send(employee, { action: 'ask', question: 'Wie viele Geräte umfasst der Auftrag?', threshold: 95 });
    const row = (await send(employee)).value.history[0];
    assert.equal(call.mock.calls.length, 1);
    assert.equal(row.result.refs.length, 0);
    assert.equal(row.result.review.status, 'pending');
    assert(row.result.review.sources.includes('Abweichungsnachtrag'));
    assert(row.result.audit.sources.some(s => s.name === 'Abweichungsnachtrag' && s.decision === 'protected'));
    assert((await send(reviewer)).value.queue.some(r => r.id === row.id));
  } finally { delete process.env.OLLAMA_MODEL; }
});
test('Originalquellen zitieren das veröffentlichte PDF mit der zugehörigen physischen Seite', async () => {
  const question = 'ING 3Q2025 net result';
  await send(employee,{action:'ask',question,sourceScope:'originals'});
  const row = (await send(employee)).value.history.find(h => h.question === question);
  assert.ok(row.result.refs.length);
  const {readFile} = await import('node:fs/promises');
  const source = JSON.parse(await readFile(new URL('../server/published/report.json',import.meta.url)));
  const {createHash} = await import('node:crypto');
  const bytes = await readFile(new URL('../public' + source.publishedUrl,import.meta.url));
  assert.equal('published:' + createHash('sha256').update(bytes).digest('hex'), source.id);
  for (const ref of row.result.refs) {
    assert.equal(ref.doc,source.id);
    assert.ok(ref.page >= 1 && ref.page <= source.pages);
    const text = source.body.split('[Seite ' + ref.page + ']')[1].split('[Seite ')[0];
    assert.ok(text.includes(ref.quote));
  }
});
test('Abmeldung beendet die Serversitzung', async () => {
  await send(employee, {
    action: 'logout'
  });
  assert.equal((await send(employee)).value.auth, false);
  await send(employee, {
    action: 'ask',
    question: 'Unbefugt?'
  }, 401);
});
test('Originaldatei ist bytegenau, getrennt vom Auszug und serverseitig geprüft', async ()=>{
  const bytes=Buffer.from('Rechnung 180,00 Euro'), {createHash}=await import('node:crypto');
  const hash=createHash('sha256').update(bytes).digest('hex'), part={action:'stage',hash,part:0,bytes:bytes.toString('base64')};
  await send(manager,part);
  await send(manager,{action:'upload',name:'Archivtest',text:'Rechnung 180,00 Euro',importance:'normal',files:[{name:'Rechnung.txt',hash,size:bytes.length}]});
  const doc=(await send(manager)).value.docs.find(d=>d.name==='Archivtest').id;
  const read=(await send(manager,{action:'read',doc})).value;
  assert.equal(read.files[0].hash,hash);
  assert.equal((await send(manager,{action:'original',hash,part:0,doc})).value.bytes,part.bytes);
  await send(reviewer,{action:'original',hash,part:0,doc},403);
  await send(reviewer,{action:'request',recipient:'manager@example.invalid',purpose:'Archivtest Auszug'});
  const request=(await send(manager)).value.requests.find(r=>r.purpose==='Archivtest Auszug');
  await send(manager,{action:'approve',id:request.id,doc,excerpt:'180,00 Euro',days:1});
  const grant=(await send(reviewer)).value.docs.find(d=>d.name==='Archivtest').id;
  const limited = (await send(reviewer,{action:'read',doc:grant})).value;
  assert.deepEqual(limited.files,[]);
  const {getDocumentProxy} = await import('unpdf');
  const excerptPdf = await getDocumentProxy(new Uint8Array(Buffer.from(limited.excerptFile,'base64')));
  const content = await (await excerptPdf.getPage(1)).getTextContent();
  assert.ok(content.items.some(item => item.str === '180,00 Euro'));
  assert.ok(!content.items.some(item => item.str?.includes('Rechnung 180,00 Euro')));
  await send(reviewer,{action:'original',hash,part:0,doc:grant},403);
});

test('Bestehende Übungsunterlagen liefern unter derselben ID PDF-Seiten und Excel-Zellen', async () => {
  const {database} = await import('../server/database.js');
  const {getDocumentProxy} = await import('unpdf');
  const XLSX = await import('xlsx');
  const db = await database();
  const state = (await send(manager)).value;
  const lines = Array.from({length:85},(_,i) => 'Belegposition ' + (i + 1) + ' im Monatsabschluss.');
  const insert = async (id,name,body) => db.run(
    'INSERT INTO documents(id,owner,name,body,scope,issuer,reviewed,importance,created) VALUES(?,?,?,?,?,?,?,?,?)',
    [id,state.me.id,name,body,'private','Beispielunternehmen (fiktiv)',0,'normal',Date.now()]);
  await insert('legacy-report','NHAT M08 | Monatsbericht',lines.join('\n'));
  await insert('legacy-sheet','BETA02_Umsatz_2025.txt','Nettoumsatz im Geschäftsjahr 2025 genau 10.000.000 EUR.');
  const docs = (await send(manager)).value.docs;
  assert.equal(docs.find(d => d.id === 'legacy-report').format,'PDF');
  assert.equal(docs.find(d => d.id === 'legacy-sheet').fileName,'BETA02_Umsatz_2025.xlsx');
  const reads = await Promise.all([1,2].map(() => send(manager,{action:'read',doc:'legacy-report',position:63})));
  assert.deepEqual(reads[0].value.files,reads[1].value.files);
  const bytes = async (id,file) => {
    const parts = [];
    for(let part=0;part<file.count;part++) {
      const r = await send(manager,{action:'original',doc:id,hash:file.hash,part});
      parts.push(Buffer.from(r.value.bytes,'base64'));
    }
    return Buffer.concat(parts);
  };
  const first = reads[0].value;
  assert.ok(first.location > 1);
  const pdf = await getDocumentProxy(new Uint8Array(await bytes('legacy-report',first.files[0])));
  const page = await pdf.getPage(first.location);
  assert.ok((await page.getTextContent()).items.some(item => item.str?.includes('Belegposition 63')));
  const sheetFile = (await send(manager,{action:'read',doc:'legacy-sheet'})).value.files[0];
  const book = XLSX.read(await bytes('legacy-sheet',sheetFile));
  assert.equal(book.Sheets.Nachweis.C5.v,10000000);
  assert.equal(book.Sheets.Nachweis.D5.v,'EUR');
  await send(reviewer,{action:'original',doc:'legacy-sheet',hash:sheetFile.hash,part:0},403);
});
test('Kontoschutz verlangt die Bestätigung für jede sensible Operation',async()=>{
  const {database}=await import('../server/database.js');
  const {hash}=await import('../server/auth.js');
  const db=await database();
  const owner=await db.one('SELECT id FROM users WHERE role=?','admin');
  const code='local-test-only';
  await db.run('INSERT INTO factors VALUES(?,?,?,?,?)',[owner.id,'ZmFrZQ','ZmFrZQ',0,hash(code)]);
  assert.equal((await send(admin)).value.auth,false);
  const login={action:'login',email:'admin@example.invalid',password:pwd};
  const challenge=(await send('',login,428)).value.options.challenge;
  const account=(await send('',{...login,proof:{challenge,recovery:code}})).cookie;
  for(const action of ['approve','deny','revoke','review','user','classify','upload']){
    const payload={action,team:true};
    assert((await send(account,payload,428)).value.options.challenge);
  }
  const next=(await send('',login,428)).value.options.challenge;
  await send('',{...login,proof:{challenge:next,recovery:code}},403);
});
