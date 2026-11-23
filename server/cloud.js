import {createHash} from 'node:crypto';
import {fail} from './auth.js';
export function cloudConfig() {
  const client=process.env.MICROSOFT_CLIENT_ID, tenant=process.env.MICROSOFT_TENANT_ID;
  return client && tenant ? {client,tenant}:null;
}
export async function currentCloud(source, token) {
  if(!cloudConfig() || !token || !source || ![source.drive,source.item].every(v=>typeof v==='string' && /^[\w!.-]{1,250}$/.test(v))) return false;
  try {
    const url='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(source.drive)+'/items/'+encodeURIComponent(source.item)+'?$select=id,eTag,file';
    const res=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(7000)});
    if(!res.ok)return false;
    const item=await res.json();
    return !!item.file && item.eTag===source.tag;
  }catch{return false;}
}
export async function checkedCloud(source,token,files) {
  if(!await currentCloud(source,token))fail('Cloudzugriff oder Dateiversion geändert. Quelle erneut synchronisieren.',409);
  if(files?.length!==1)fail('Eine Cloudversion pro Import.');
  const url='https://graph.microsoft.com/v1.0/drives/'+encodeURIComponent(source.drive)+'/items/'+encodeURIComponent(source.item)+'/content';
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!response.ok||!response.body)fail('Cloudoriginal nicht erreichbar.',409);
  const hash=createHash('sha256');let size=0;
  for await(const bytes of response.body){
    size+=bytes.length;
    if(size>15000000)fail('Cloudoriginal zu groß.');
    hash.update(bytes);
  }
  if(hash.digest('hex')!==files[0].hash||!await currentCloud(source,token))fail('Cloudversion wurde geändert.',409);
  return {drive:source.drive,item:source.item,tag:source.tag};
}
