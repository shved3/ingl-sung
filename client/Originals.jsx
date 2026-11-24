import React,{useEffect,useRef,useState} from 'react';
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

function PdfReader({url, page: startPage = 1}) {
  const [pdf,setPdf] = useState(null);
  const [page,setPage] = useState(startPage);
  const [error,setError] = useState('');
  const canvas = useRef(null);
  const viewport = useRef(null);
  useEffect(() => {
    let active = true, loading;
    async function open() {
      const pdfjs = await import(new URL('/pdfjs/pdf.min.mjs', location.origin).href);
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      loading = pdfjs.getDocument({url, isEvalSupported:false});
      const document = await loading.promise;
      if (active) { setPage(Math.min(Math.max(1,startPage),document.numPages)); setPdf(document); }
    }
    open().catch(e => { if (active) setError(e.message); });
    return () => { active = false; loading?.destroy(); };
  }, [url,startPage]);
  useEffect(() => {
    if (!pdf) return;
    let active = true, rendering, sequence = 0;
    async function draw() {
      const request = ++sequence;
      const pdfPage = await pdf.getPage(page);
      if (!active || request !== sequence) return;
      const previous = rendering;
      previous?.cancel();
      await previous?.promise.catch(() => {});
      if (!active || request !== sequence) return;
      const base = pdfPage.getViewport({scale:1});
      const width = viewport.current.clientWidth;
      const scaled = pdfPage.getViewport({scale:Math.min(3, width * Math.min(window.devicePixelRatio || 1, 2) / base.width)});
      canvas.current.width = Math.ceil(scaled.width);
      canvas.current.height = Math.ceil(scaled.height);
      rendering = pdfPage.render({canvasContext:canvas.current.getContext('2d'),viewport:scaled});
      await rendering.promise;
    }
    let lastWidth;
    const observer = new ResizeObserver(() => {
      const width = viewport.current?.clientWidth;
      if (!width || width === lastWidth) return;
      lastWidth = width;
      draw().catch(e => { if (active && e.name !== 'RenderingCancelledException') setError(e.message); });
    });
    observer.observe(viewport.current);
    return () => { active = false; observer.disconnect(); rendering?.cancel(); };
  }, [pdf,page]);
  return <><div className="sourceToolbar">
    <a href={url + '#page=' + page} target="_blank" rel="noopener noreferrer">PDF in neuem Tab öffnen</a>
    {pdf && <nav aria-label="PDF-Seiten"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</button>
      <span aria-live="polite">Seite {page} / {pdf.numPages}</span>
      <button disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}>Weiter</button></nav>}
  </div>{error ? <p role="alert">PDF-Vorschau nicht verfügbar. Über den Link lässt sich die Datei öffnen.</p> :
    <div className="pdfCanvas" ref={viewport}>{!pdf && <p role="status">PDF wird geladen …</p>}<canvas ref={canvas} aria-label={'PDF-Seite ' + page}/></div>}</>;
}

const mediaTypes = {pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', bmp:'image/bmp', txt:'text/plain', csv:'text/csv', md:'text/plain', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};

function SheetReader({blob, page, position, generated}) {
  const [data,setData] = useState(null), [error,setError] = useState('');
  const [selected,setSelected] = useState(Math.max(0,(page || 1) - 1));
  const [offset,setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    async function open() {
      const xlsx = await import(new URL('/import/xlsx.mjs',location.origin).href);
      const book = xlsx.read(await blob.arrayBuffer(), {type:'array'});
      if (!active) return;
      const sheet = Math.min(selected,book.SheetNames.length - 1);
      const rows = xlsx.utils.sheet_to_json(book.Sheets[book.SheetNames[sheet]],{header:1,raw:false,blankrows:true});
      const target = generated && position ? rows.findIndex((row,i) => i >= 4 && Number(row[0]) === position) : -1;
      setOffset(Math.max(0, Math.floor(target / 40)) * 40);
      setData({names:book.SheetNames,sheet,rows,target});
    }
    open().catch(() => { if (active) setError('Die Vorschau ist nicht verfügbar. Die Arbeitsmappe kann heruntergeladen werden.'); });
    return () => { active = false; };
  }, [blob,selected,position,generated]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Tabellenblatt wird geladen …</p>;
  return <><div className="sourceToolbar">
    <label>Tabellenblatt <select value={data.sheet} onChange={e => setSelected(Number(e.target.value))}>{data.names.map((name,i) => <option key={name} value={i}>{name}</option>)}</select></label>
    {data.rows.length > 40 && <nav aria-label="Tabellenzeilen"><button disabled={!offset} onClick={() => setOffset(offset-40)}>Zurück</button>
      <span>{offset+1}–{Math.min(offset+40,data.rows.length)} / {data.rows.length}</span><button disabled={offset+40>=data.rows.length} onClick={() => setOffset(offset+40)}>Weiter</button></nav>}
  </div><div className="sourceSheet"><table aria-label={data.names[data.sheet]}><tbody>{data.rows.slice(offset,offset+40).map((row,i) =>
    <tr key={offset+i} className={data.target===offset+i ? 'citedRow' : ''}><th scope="row">{offset+i+1}</th>{Array.from(row,(cell,j) => <td key={j}>{cell}</td>)}</tr>
  )}</tbody></table></div></>;
}

export function Originals({doc,api}) {
  const files = doc.files || [];
  const [index,setIndex] = useState(Math.min(Math.max(0,(doc.page || 1) - 1),Math.max(0,files.length - 1)));
  const file = files[index];
  const [view,setView] = useState(null), [error,setError] = useState('');
  useEffect(() => {
    let active = true, url;
    setView(null); setError('');
    async function open() {
      if (doc.publishedUrl) return;
      let blob;
      if (file) {
        const parts = [];
        for (let part = 0; part < file.count && active; part++) {
          const result = await api({action:'original', doc:doc.key, hash:file.hash, part});
          parts.push(Uint8Array.from(atob(result.bytes), c => c.charCodeAt(0)));
        }
        if (!active) return;
        const type = mediaTypes[file.name.split('.').pop().toLowerCase()] || 'application/octet-stream';
        blob = new Blob(parts,{type});
        if (await digest(await blob.arrayBuffer()) !== file.hash) throw Error('Die Prüfsumme des Originals stimmt nicht überein.');
      } else {
        if (!doc.excerptFile) throw Error('Die Quelldatei ist nicht verfügbar.');
        blob = new Blob([Uint8Array.from(atob(doc.excerptFile), c => c.charCodeAt(0))],{type:'application/pdf'});
      }
      if (!active) return;
      url = URL.createObjectURL(blob);
      setView({url,type:blob.type,blob});
    }
    open().catch(e => { if (active) setError(e.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [doc, file, api]);
  const url = doc.publishedUrl || view?.url;
  const type = doc.publishedUrl ? 'application/pdf' : view?.type;
  return <>{files.length > 1 && <label>Originaldatei<select value={index} onChange={e => setIndex(Number(e.target.value))}>{files.map((f,i) => <option key={i} value={i}>{f.name}</option>)}</select></label>}
    {doc.publisher && <p className="sourceMeta">Herausgeber · <a href={doc.publisher} target="_blank" rel="noreferrer">ING Groep N.V.</a></p>}
    {doc.excerptOnly && <p className="notice">Freigegebener Auszug</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {!error && !url && <p role="status">Originaldatei wird geladen und geprüft …</p>}
    {url && <>{type === 'application/pdf' && <PdfReader key={url} url={url} page={doc.page || 1}/>}
      {view && [mediaTypes.xls,mediaTypes.xlsx].includes(type) && <SheetReader blob={view.blob} page={doc.page} position={doc.position} generated={doc.generated}/>}
      {type?.startsWith('image/') && <img className="sourceImage" src={url} alt={file.name}/>}
      <a className="sourceDownload" href={url} download={file?.name || doc.name}>{file?.name || doc.name} herunterladen</a>
      {type?.startsWith('text/') && <pre>{doc.text}</pre>}</>}
  </>;
}
