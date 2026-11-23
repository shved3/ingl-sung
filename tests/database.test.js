import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

test('Fixed database and matching token persist records across application restarts', async () => {
  const keys = ['VERCEL', 'EVIDENCE_DATABASE_URL', 'EVIDENCE_DATABASE_AUTH_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const storage = new DatabaseSync(':memory:');
  let requests = 0;
  try {
    process.env.VERCEL = '1';
    process.env.EVIDENCE_DATABASE_URL = ' libsql://fixed.example.invalid ';
    process.env.EVIDENCE_DATABASE_AUTH_TOKEN = ' fixed-test-token ';
    process.env.TURSO_DATABASE_URL = 'libsql://different.example.invalid';
    process.env.TURSO_AUTH_TOKEN = 'other-test-token';
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.equal(String(url), 'https://fixed.example.invalid/v2/pipeline');
      assert.equal(options.headers.Authorization, 'Bearer fixed-test-token');
      const { stmt } = JSON.parse(options.body).requests[0];
      const args = stmt.args.map(arg => arg.type === 'integer' ? Number(arg.value) : arg.type === 'null' ? null : arg.value);
      const prepared = storage.prepare(stmt.sql);
      const cols = prepared.columns().map(col => ({ name: col.name }));
      const rows = cols.length ? prepared.all(...args).map(row => cols.map(col => {
        const value = row[col.name];
        return value === null ? { type: 'null' } : { type: typeof value === 'number' ? 'integer' : 'text', value: String(value) };
      })) : [];
      const changes = cols.length ? 0 : Number(prepared.run(...args).changes);
      return Response.json({ results: [{ type: 'ok', response: { result: { cols, rows, affected_row_count: changes } } }] });
    };
    const first = await (await import('../server/database.js?instance=first')).database();
    await first.run('INSERT INTO users(id,email,name,role,password) VALUES (?,?,?,?,?)', ['test-user', 'user@example.invalid', 'Test', 'admin', 'test-hash']);
    const marker = await first.one('SELECT identity FROM evidence_storage_identity WHERE slot=1');
    const second = await (await import('../server/database.js?instance=second')).database();
    assert.deepEqual(await second.one('SELECT identity FROM evidence_storage_identity WHERE slot=1'), marker);
    assert.equal((await second.one('SELECT count(*) AS n FROM users')).n, 1);

    delete process.env.EVIDENCE_DATABASE_AUTH_TOKEN;
    const beforeMissingToken = requests;
    await assert.rejects((await import('../server/database.js?instance=missing-token')).database(), /Datenbankkonfiguration unvollständig/);
    assert.equal(requests, beforeMissingToken, 'Must not send an integration token to the fixed database');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    storage.close();
  }
});
