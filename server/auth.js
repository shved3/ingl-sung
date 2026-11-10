import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const uid = () => crypto.randomUUID();
export const hash = v => createHash('sha256').update(v).digest('hex');
export const fail = (message, status = 400) => {
  throw Object.assign(Error(message), {
    status
  });
};
export const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
export const roles = ['admin', 'manager', 'reviewer', 'employee'];
export const canUpload = u => ['manager', 'admin'].includes(u.role);
export const canReview = u => ['reviewer', 'admin'].includes(u.role);
export function emailOf(v) {
  const e = clean(v, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) fail('Bitte eine gültige E-Mail-Adresse angeben.');
  return e;
}
async function password(s, salt) {
  return Buffer.from(await scrypt(s, salt, 64)).toString('hex');
}
export async function passwordHash(s) {
  if (typeof s !== 'string' || s.length < 12 || s.length > 256) fail('Passwort: 12 bis 256 Zeichen.');
  const salt = randomBytes(20).toString('hex');
  return salt + ':' + (await password(s, salt));
}
export async function login(db, b) {
  const mail = emailOf(b.email),
    bucket = 'login:' + hash(mail),
    now = Date.now();
  await db.run('INSERT INTO limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET n=CASE WHEN until_ms<? THEN 1 ELSE n+1 END, until_ms=CASE WHEN until_ms<? THEN excluded.until_ms ELSE until_ms END', [bucket, now + 600000, now, now]);
  if ((await db.one('SELECT n FROM limits WHERE bucket=?', bucket)).n > 12) fail('Zu viele Versuche. In 10 Minuten erneut versuchen.', 429);
  const user = await db.one('SELECT * FROM users WHERE email=?', mail);
  const [salt, digest] = (user?.password || 'absent:' + '0'.repeat(128)).split(':');
  const actual = await password(typeof b.password === 'string' ? b.password.slice(0, 256) : '', salt);
  if (!user || !timingSafeEqual(Buffer.from(digest), Buffer.from(actual))) fail('Anmeldedaten ungültig.', 401);
  await db.run('DELETE FROM limits WHERE bucket=?', [bucket]);
  return user;
}
export function cookieToken(req) {
  return (/\bev_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie') || '') || [])[1] || '';
}
export async function person(db, req) {
  return db.one('SELECT u.id,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.uid WHERE token=? AND expires>?', hash(cookieToken(req)), Date.now());
}
export function sessionCookie(req, value, age) {
  return 'ev_session=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + age + ((process.env.APP_ORIGIN || req.url).startsWith('https:') ? '; Secure' : '');
}
export async function newSession(db, u, req) {
  const token = randomBytes(32).toString('hex');
  await db.run('INSERT INTO sessions VALUES (?,?,?)', [hash(token), u.id, Date.now() + 28800000]);
  return sessionCookie(req, token, 28800);
}
