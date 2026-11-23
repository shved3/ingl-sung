import {encode} from './Originals.jsx';
const local=name=>import(new URL('/import/'+name,location.origin).href);
export const formats='.pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.bmp,.doc,.docx,.xls,.xlsx';
export async function extractFiles(files,api,status) {
  if(!files.length || files.length>25 || files.some(f=>!f.size||f.size>15000000)) throw Error('1 bis 25 Dateien wählen, jeweils maximal 15 MB.');
  const images=files.every(f=>/\.(jpe?g|png|bmp|webp)$/i.test(f.name));
  if(files.length>1 && !images)throw Error('Für einen mehrseitigen Scan bitte nur Bilddateien wählen.');
  let worker,usedOCR=false;
  const parts=[];
  async function recognize(image){
    usedOCR=true;
    if(!worker){
      const {default:ocr}=await local('ocr.mjs');
      worker=await ocr.createWorker('deu',1,{workerPath:'/import/worker.min.js',corePath:'/import/tesseract-core-lstm.wasm.js',langPath:'/import',workerBlobURL:false});
    }
    return (await worker.recognize(image)).data.text.trim();
  }
  function add(text,page) {
    if(!text.trim())throw Error('Seite '+page+' ist leer oder unleserlich. Bitte erneut scannen.');
    parts.push('[Seite '+page+']\n'+text.trim());
    if(parts.join('\n').length>200000)throw Error('Maximal 200.000 Zeichen. Dokument aufteilen.');
  }
  try{
    for(let n=0;n<files.length;n++){
      const f=files[n],ext=f.name.split('.').pop().toLowerCase();
      status('Lese '+f.name+' …');
      if(images){add(await recognize(f),n+1);continue;}
      if(ext==='pdf'){
        const pdfjs=await import(new URL('/pdfjs/pdf.min.mjs',location.origin).href);
        pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
        const pdf=await pdfjs.getDocument({data:await f.arrayBuffer(),isEvalSupported:false}).promise;
        try{
          for(let i=1;i<=pdf.numPages;i++){
            status('Seite '+i+' / '+pdf.numPages);
            const page=await pdf.getPage(i);
            let text=(await page.getTextContent()).items.map(x=>(x.str||'')+(x.hasEOL?'\n':' ')).join('').trim();
            if(!text){
              const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2.5,2500/Math.max(base.width,base.height))});
              const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
              await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;text=await recognize(canvas);
            }
            add(text,i);page.cleanup();
          }
        } finally {await pdf.destroy();}
      }else if(ext==='docx'){
        const {default:word}=await local('word.mjs');add((await word.extractRawText({arrayBuffer:await f.arrayBuffer()})).value,1);
      }else if(ext==='doc'){
        if(f.size>3000000)throw Error('DOC maximal 3 MB. Größere Dateien als PDF exportieren.');
        add((await api({action:'legacyWord',bytes:encode(new Uint8Array(await f.arrayBuffer()))})).text,1);
      }else if(['xlsx','xls'].includes(ext)){
        const x=await local('xlsx.mjs'),book=x.read(await f.arrayBuffer(),{type:'array'});
        book.SheetNames.forEach((name,i)=>add(name+'\n'+x.utils.sheet_to_csv(book.Sheets[name]),i+1));
      }else if(['txt','md','csv'].includes(ext)){
        const buffer=await f.arrayBuffer();let text;
        try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('windows-1252').decode(buffer);}
        add(text,1);
      }else throw Error('Format nicht unterstützt. Eine lesbare Kopie als PDF bereitstellen.');
    }
    return {text:parts.join('\n\n'),ocr:usedOCR};
  }finally{if(worker)await worker.terminate();}
}
export async function cloudFile(token,path){
  const graph='https://graph.microsoft.com/v1.0/';
  const endpoint=/^drives\/[\w!.-]+\/items\/[\w!.-]+$/.test(path)?path:'me/drive/root:/'+path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const r=await fetch(graph+endpoint,{headers:{Authorization:'Bearer '+token}});
  if(!r.ok)throw Error('Datei mit diesem Microsoft-Konto nicht lesbar.');
  const item=await r.json(),url=item['@microsoft.graph.downloadUrl'];
  if(!item.file||!url||item.size>15000000)throw Error('Lesbare Datei bis 15 MB wählen.');
  const bytes=await fetch(url);
  if(!bytes.ok)throw Error('Cloud-Download fehlgeschlagen.');
  return {file:new File([await bytes.blob()],item.name),cloud:{drive:item.parentReference.driveId,item:item.id,tag:item.eTag}};
}
