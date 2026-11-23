import React,{useEffect,useState} from 'react';
export const digest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
export function encode(bytes) {
  let raw='';
  for(let i=0;i<bytes.length;i+=8192) raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(raw);
}
export async function stageFiles(files,api) {
  const manifest=[];
  for(const file of files) {
    const bytes=new Uint8Array(await file.arrayBuffer()),hash=await digest(bytes),size=192*1024;
    for(let i=0;i<bytes.length;i+=size) await api({action:'stage',hash,part:i/size,bytes:encode(bytes.subarray(i,i+size))});
    manifest.push({name:file.name,size:file.size,hash});
  }
  return manifest;
}
export function Originals({doc,api}) {
  const [view,setView]=useState(null),[message,setMessage]=useState('');
  useEffect(()=>()=>{if(view)URL.revokeObjectURL(view.url);},[view]);
  async function load(f) {
    setMessage('Original wird geprüft …');
    try {
      const parts=[];
      for(let i=0;i<f.count;i++) {
        const {bytes}=await api({action:'original',doc:doc.key,hash:f.hash,part:i});
        parts.push(Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)));
      }
      const pdf=/\.pdf$/i.test(f.name),img=/\.(png|jpg|jpeg|webp)$/i.test(f.name);
      const blob=new Blob(parts,{type:pdf?'application/pdf':img?'image/'+f.name.split('.').pop().replace(/jpg/i,'jpeg'):'application/octet-stream'});
      if(await digest(await blob.arrayBuffer())!==f.hash)throw Error('Originalprüfung fehlgeschlagen.');
      setView({url:URL.createObjectURL(blob),f,pdf,img});setMessage('');
    }catch(e){setMessage(e.message);}
  }
  return <>{doc.files?.length>0 && <section><p>Importiert von {doc.author} · {new Date(doc.created).toLocaleString('de-DE')} · Version {doc.version}</p>
  {doc.files.map((f,i)=><details key={i}><summary>{f.name}</summary><small style={{overflowWrap:'anywhere'}}>SHA-256 · {f.hash}</small> <button className="textBtn" onClick={()=>load(f)}>Original prüfen und öffnen</button></details>)}
  {message && <p role="status">{message}</p>}{view && <><a href={view.url} download={view.f.name}>Original herunterladen</a>{view.pdf && <iframe title="Originalseite" style={{width:'100%',height:'50vh'}} src={view.url+'#page='+(doc.page||1)}/>}
  {view.img && <img alt="Originalscan" style={{maxWidth:'100%'}} src={view.url}/>}</>}</section>}<pre>{doc.text}</pre></>;
}
