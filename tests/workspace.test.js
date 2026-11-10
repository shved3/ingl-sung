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
  for (const key of ['VERCEL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'OPENAI_API_KEY', 'APP_ORIGIN']) delete process.env[key];
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
  assert.equal((await send(employee)).value.docs.length, 1);
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
        text: 'Der Auftrag umfasst 500 Geräte.',
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
    assert.equal(r.score, 100);
    assert.equal(r.review.status, 'pending');
    assert(r.review.sources.includes('Wichtige ergänzende Richtlinie'));
  } finally {
    globalThis.fetch = original;
    delete process.env.OPENAI_API_KEY;
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
