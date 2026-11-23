import {randomBytes} from 'node:crypto';
import {generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse} from '@simplewebauthn/server';
import {cookieToken, fail, hash} from './auth.js';

export const factorSchema = [
  'CREATE TABLE IF NOT EXISTS factors(uid TEXT PRIMARY KEY, id TEXT UNIQUE NOT NULL, pub TEXT NOT NULL, counter INTEGER NOT NULL, recovery TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS factor_challenges(id TEXT PRIMARY KEY, scope TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS factor_expiry ON factor_challenges(expires)',
  'CREATE TRIGGER IF NOT EXISTS factor_added AFTER INSERT ON factors BEGIN DELETE FROM sessions WHERE uid=NEW.uid; END',
  'CREATE TRIGGER IF NOT EXISTS factor_replaced AFTER UPDATE OF id ON factors BEGIN DELETE FROM sessions WHERE uid=NEW.uid; END'
];
export const factorFor=(db,u)=>db.one('SELECT * FROM factors WHERE uid=?',u.id);
export function sensitive(b){
  return ['user','review','approve','deny','revoke','classify','factorBegin'].includes(b.action) || (b.action==='upload' && !!b.team);
}
function relyingParty(req){
  const origin=new URL(process.env.APP_ORIGIN || (process.env.VERCEL_ENV==='production' && process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL : req.url)).origin;
  return {origin,rpID:new URL(origin).hostname};
}
function scope(u,req,purpose){
  return hash(JSON.stringify([u.id,hash(cookieToken(req)),purpose]));
}
async function issue(db,options,binding){
  const now=Date.now();
  await db.run('DELETE FROM factor_challenges WHERE expires<=?',[now]);
  await db.run('INSERT INTO factor_challenges VALUES(?,?,?)',[options.challenge,binding,now+180000]);
  return options;
}
async function consume(db,id,binding){
  if(typeof id!=='string' || id.length>200)fail('Bestätigung fehlt.',403);
  const used=await db.run('DELETE FROM factor_challenges WHERE id=? AND scope=? AND expires>?',[id,binding,Date.now()]);
  if(!used.changes)fail('Bestätigung abgelaufen. Bitte erneut beginnen.',403);
}
export async function confirmAction(db,u,req,b,factor){
  const {proof,...action}=b;
  const binding=scope(u,req,[factor.id,hash(JSON.stringify(action))]);
  const {origin,rpID}=relyingParty(req);
  if(!proof){
    const options=await generateAuthenticationOptions({rpID,allowCredentials:[{id:factor.id}],userVerification:'required'});
    return issue(db,options,binding);
  }
  await consume(db,proof.challenge,binding);
  if(typeof proof.recovery==='string'){
    const digest=hash(proof.recovery.trim().toLowerCase());
    const used=await db.run("UPDATE factors SET recovery=replace(recovery,?,'') WHERE uid=? AND id=? AND instr(recovery,?)>0",[digest,u.id,factor.id,digest]);
    if(!used.changes)fail('Wiederherstellungscode ungültig oder bereits verwendet.',403);
    return;
  }
  try{
    const check=await verifyAuthenticationResponse({response:proof.response,expectedChallenge:proof.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
      credential:{id:factor.id,publicKey:Buffer.from(factor.pub,'base64url'),counter:factor.counter}});
    if(!check.verified)throw Error();
    const updated=await db.run('UPDATE factors SET counter=? WHERE uid=? AND id=? AND counter=?',[check.authenticationInfo.newCounter,u.id,factor.id,factor.counter]);
    if(!updated.changes)throw Error();
  }catch{fail('Passkey-Bestätigung fehlgeschlagen. Bitte erneut versuchen.',403);}
}
export async function beginEnrollment(db,u,req,current){
  const options=await generateRegistrationOptions({rpName:'Evidence Hochschulprojekt',rpID:relyingParty(req).rpID,userName:u.email,userID:Buffer.from(u.id),attestationType:'none',authenticatorSelection:{userVerification:'required',residentKey:'preferred'}});
  return issue(db,options,scope(u,req,['register',current?.id||null]));
}
export async function enroll(db,u,req,b,current){
  await consume(db,b.challenge,scope(u,req,['register',current?.id||null]));
  const {origin,rpID}=relyingParty(req);
  let credential;
  try{
    const result=await verifyRegistrationResponse({response:b.response,expectedChallenge:b.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
    if(result.verified)credential=result.registrationInfo.credential;
  }catch{}
  if(!credential)fail('Passkey konnte nicht bestätigt werden.',403);
  const codes=Array.from({length:8},()=>randomBytes(12).toString('hex'));
  const fields=[credential.id,Buffer.from(credential.publicKey).toString('base64url'),credential.counter,codes.map(hash).join(','),u.id];
  const change=current ? await db.run('UPDATE factors SET id=?,pub=?,counter=?,recovery=? WHERE uid=? AND id=?',[...fields,current.id]) :
    await db.run('INSERT OR IGNORE INTO factors(id,pub,counter,recovery,uid) VALUES(?,?,?,?,?)',fields);
  if(!change.changes)fail('Kontoschutz wurde bereits geändert.',409);
  return codes;
}
