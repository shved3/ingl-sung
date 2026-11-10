import { mkdirSync } from 'node:fs';
import path from 'node:path';
const schema = ['CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL)', 'CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,uid TEXT NOT NULL,expires INTEGER NOT NULL)', 'CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,n INTEGER NOT NULL,until_ms INTEGER NOT NULL)', 'CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,body TEXT NOT NULL,scope TEXT NOT NULL,issuer TEXT NOT NULL,reviewed INTEGER NOT NULL,importance TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL)', 'CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,requester TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,purpose TEXT NOT NULL,status TEXT NOT NULL,doc TEXT,excerpt TEXT,expires INTEGER,created INTEGER NOT NULL)', 'CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,user TEXT NOT NULL,thread TEXT NOT NULL,question TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL)', 'CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,message TEXT NOT NULL,signature TEXT NOT NULL,reviewer TEXT NOT NULL,name TEXT NOT NULL,decision TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(message,signature))', 'CREATE INDEX IF NOT EXISTS msg_user ON messages(user,created)', 'CREATE INDEX IF NOT EXISTS req_user ON requests(requester,status)', 'CREATE INDEX IF NOT EXISTS req_recipient ON requests(recipient,status)'];
async function open() {
  let execute;
  if (process.env.TURSO_DATABASE_URL) {
    const u = new URL(process.env.TURSO_DATABASE_URL.replace(/^libsql:/, 'https:'));
    if (u.protocol !== 'https:' || !process.env.TURSO_AUTH_TOKEN) throw Error('Datenbankkonfiguration unvollständig');
    const url = new URL('/v2/pipeline', u);
    execute = async (sql, args = []) => {
      const values = args.map(v => v === null ? {
        type: 'null'
      } : typeof v === 'number' ? {
        type: 'integer',
        value: String(v)
      } : {
        type: 'text',
        value: String(v)
      });
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + process.env.TURSO_AUTH_TOKEN
        },
        body: JSON.stringify({
          requests: [{
            type: 'execute',
            stmt: {
              sql,
              args: values,
              want_rows: true
            }
          }, {
            type: 'close'
          }]
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (!r.ok) throw Error('Datenbank nicht erreichbar');
      const payload = await r.json();
      const op = payload.results[0];
      if (op.type === 'error') throw Error(op.error?.message || 'Datenbankfehler');
      const data = op.response.result;
      return {
        changes: data.affected_row_count,
        rows: data.rows.map(row => Object.fromEntries(row.map((v, i) => [data.cols[i].name, v.type === 'integer' ? Number(v.value) : v.type === 'null' ? null : v.value])))
      };
    };
  } else {
    if (process.env.VERCEL) throw Error('Persistente Datenbank für Vercel fehlt');
    const {
      DatabaseSync
    } = await import('node:sqlite');
    const dir = path.resolve(process.env.DATA_DIR || 'data');
    mkdirSync(dir, {
      recursive: true,
      mode: 0o700
    });
    const db = new DatabaseSync(path.join(dir, 'evidence.sqlite'));
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    execute = async (sql, args = []) => {
      const stmt = db.prepare(sql);
      if (stmt.columns().length) return {
        rows: stmt.all(...args),
        changes: 0
      };
      return {
        rows: [],
        changes: stmt.run(...args).changes
      };
    };
  }
  for (const sql of schema) await execute(sql);
  return {
    run: execute,
    all: async (sql, ...args) => (await execute(sql, args)).rows,
    one: async (sql, ...args) => (await execute(sql, args)).rows[0]
  };
}
let ready;
export function database() {
  return ready ??= open().catch(e => {
    ready = null;
    throw e;
  });
}
