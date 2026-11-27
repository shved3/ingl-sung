import React from 'react';

const labels = { dokumentiert: 'Dokumentiert', berechnet: 'Berechnung', einschaetzung: 'Einschätzung', offen: 'Nachweis offen' };

function printNote(row) {
  const preview = window.open('', '_blank');
  if (!preview) return;
  preview.opener = null;
  const page = preview.document;
  page.title = 'Evidence – Prüfnotiz';
  page.documentElement.lang = 'de';
  const style = page.createElement('style');
  style.textContent = '@page{size:A4;margin:16mm}body{font:11pt/1.4 system-ui;color:#182442;max-width:175mm;margin:auto}h1{font-size:20pt}h2{font-size:12pt;border-bottom:1px solid #ccc}p{white-space:pre-line}';
  page.head.append(style);
  const add = (tag, text) => {
    const element = page.createElement(tag);
    element.textContent = text;
    page.body.append(element);
  };
  const r = row.result;
  add('h1','Evidence · Prüfnotiz');
  add('p',new Date(row.created).toLocaleString('de-DE') + ' · ' + row.question);
  add('h2','Ergebnis und Prüfurteil');
  add('p',r.text || 'Kein abschließendes Ergebnis.');
  const decision = r.review;
  add('p',decision ? ({pending:'Fachprüfung ausstehend',confirmed:'Fachlich bestätigt',rejected:'Fachlich abgelehnt'}[decision.status]) : 'Keine menschliche Entscheidung erfasst.');
  if (decision?.note) add('p',decision.by + ' · ' + decision.note);
  if (decision?.correction) add('p','Korrigierte Aussage: ' + decision.correction.replacement + ' · ' + decision.correction.source);
  add('h2','Entscheidungsgrundlagen');
  if (r.claims?.length) r.claims.slice(0,5).forEach(c => add('p',labels[c.kind] + ' · ' + c.text));
  else add('p',(r.reasoning || 'Keine Herleitung gespeichert.').slice(0,1200));
  if (r.claims?.length > 5) add('p','Weitere Aussagen im vollständigen Prüfverlauf.');
  add('h2','Offene Nachweise');
  add('p',[r.gap,r.warning,...(r.claims || []).filter(c=>c.kind==='offen').map(c=>c.task)].filter(Boolean).join('\n') || 'Keine zusätzlichen Lücken erfasst.');
  add('h2','Belege');
  add('p',[...new Set([...r.refs,...(r.claims || []).flatMap(c=>c.refs)].map(v=>v.name+' · Abs. '+v.position))].join('\n') || 'Keine Fundstellen.');
  preview.focus();
  preview.print();
}

export function ReviewTools({row, previous, repeat, busy, allowRepeat}) {
  const r = row.result;
  if (r.mode === 'Zugriff abgelaufen') return null;
  return <section className="reviewTools">
    {!!r.claims?.length && <><h4>Einzelne Aussagen</h4>{r.claims.map((c,i)=><details key={i}><summary><b>{labels[c.kind]}</b> · {c.text}</summary><p>{[c.party,c.date].filter(Boolean).join(' · ')}</p>{c.refs.map((v,j)=><blockquote key={j}>{v.name} · Abs. {v.position}<br/>{v.quote}</blockquote>)}{c.task && <p><b>Prüffrage</b> · {c.task}</p>}</details>)}</>}
    {r.review?.correction && <aside><b>Fachliche Korrektur · {r.review.by}</b><p>Bisher: {r.review.correction.claim}</p><p>Neue Fassung: {r.review.correction.replacement}</p><p>{r.review.correction.source}</p></aside>}
    {previous && previous.result.mode !== 'Zugriff abgelaufen' && <details open><summary>Änderungen seit der letzten Prüfung</summary><b>Früheres Fazit</b><p>{previous.result.text || previous.result.gap}</p><b>Aktuelles Fazit</b><p>{r.text || r.gap}</p><b>Offene Punkte vorher / jetzt</b><p>{previous.result.gap || 'Keine erfasst'} / {r.gap || 'Keine erfasst'}</p><p>Neu zitierte Belege: {r.refs.filter(v=>!previous.result.refs.some(o=>o.doc===v.doc && o.position===v.position)).map(v=>v.name).join(', ') || 'Keine'}</p></details>}
    {allowRepeat && !!r.newSources?.length && <details open><summary>Neue Unterlagen seit dieser Antwort ({r.newSources.length})</summary><p>{r.newSources.join(' · ')}</p><button disabled={busy} onClick={()=>repeat(row.question,row.id)}>Auswirkungen prüfen und vergleichen</button></details>}
    <button onClick={()=>printNote(row)}>Prüfnotiz drucken / PDF</button>
  </section>;
}
