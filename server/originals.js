import {createHash} from 'node:crypto';
import {fail} from './auth.js';

export const originalSchema = [
  'CREATE TABLE IF NOT EXISTS original_parts(owner TEXT, hash TEXT, part INTEGER, bytes TEXT NOT NULL, staged INTEGER NOT NULL, PRIMARY KEY(owner,hash,part))',
  'CREATE TABLE IF NOT EXISTS source_versions(doc TEXT PRIMARY KEY, owner TEXT NOT NULL, manifest TEXT NOT NULL, cloud TEXT)'
];
const chunkSize = 192 * 1024;
export async function stagePart(db,u,b) {
  if (!/^[a-f0-9]{64}$/.test(b.hash) || !Number.isInteger(b.part) || b.part<0 || b.part>=77 ||
      typeof b.bytes!=='string' || b.bytes.length>chunkSize*4/3 || !b.bytes.length ||
      Buffer.from(b.bytes,'base64').toString('base64')!==b.bytes) fail('Ungültiger Dateiblock.');
  // A verified byte sequence stays immutable even across another import by its owner.
  const existing=await db.one('SELECT bytes FROM original_parts WHERE owner=? AND hash=? AND part=?',u.id,b.hash,b.part);
  if(existing && existing.bytes!==b.bytes) fail('Dateiblock stimmt nicht überein.',409);
  await db.run('INSERT OR IGNORE INTO original_parts VALUES(?,?,?,?,?)',[u.id,b.hash,b.part,b.bytes,Date.now()]);
}
export async function registerVersion(db,u,doc,files,cloud) {
  if (!Array.isArray(files)||!files.length||files.length>25) fail('1 bis 25 Originaldateien wählen.');
  const manifest=[];
  for(const f of files) {
    if(!f || !/^[a-f0-9]{64}$/.test(f.hash)||typeof f.name!=='string'||!Number.isSafeInteger(f.size)||f.size<=0||f.size>15000000) fail('Originaldatei ungültig.');
    const count=Math.ceil(f.size/chunkSize), digest=createHash('sha256');
    for(let i=0;i<count;i++) {
      const part=await db.one('SELECT bytes FROM original_parts WHERE owner=? AND hash=? AND part=?',u.id,f.hash,i);
      if(!part) fail('Upload unvollständig.',409);
      const bytes=Buffer.from(part.bytes,'base64');
      if(bytes.length!==Math.min(chunkSize,f.size-i*chunkSize)) fail('Dateigröße stimmt nicht überein.',409);
      digest.update(bytes);
    }
    if(digest.digest('hex')!==f.hash) fail('Prüfsumme stimmt nicht überein.',409);
    manifest.push({name:f.name.slice(0,180),size:f.size,hash:f.hash,count});
  }
  await db.run('INSERT INTO source_versions VALUES(?,?,?,?)',[doc,u.id,JSON.stringify(manifest),cloud?JSON.stringify(cloud):null]);
}
