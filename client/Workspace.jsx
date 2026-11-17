'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, FileText, FolderOpen, History, KeyRound, Layers, LockKeyhole, Menu, MessageSquare, Paperclip, Plus, Search, ShieldCheck, Upload, X } from 'lucide-react';
const nav = [['Chat', MessageSquare], ['Dokumente', FolderOpen], ['Freigaben', KeyRound], ['Fachprüfung', ShieldCheck], ['Prüfverlauf', History], ['Konten', LockKeyhole]];
const label = s => s >= 70 ? 'Gut belegt' : s >= 50 ? 'Teilweise belegt' : 'Unzureichend belegt';
const stateNames = {
  open: 'Offen',
  approved: 'Freigegeben',
  denied: 'Abgelehnt',
  revoked: 'Widerrufen'
};
const date = n => new Date(n).toLocaleDateString('de-DE', {
  day: '2-digit',
  month: 'short'
});
async function api(body) {
  const r = await fetch('/api/workspace', body ? {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  } : {
    cache: 'no-store'
  });
  const result = await r.json();
  if (!r.ok) throw Object.assign(Error(result.error || 'Verbindung fehlgeschlagen.'), {
    status: r.status
  });
  return result;
}
async function extractFile(f) {
  if (f.size > 15000000) throw Error('Bitte eine Datei unter 15 MB wählen.');
  if (f.name.toLowerCase().endsWith('.pdf')) {
    const moduleURL = new URL('/pdfjs/pdf.min.mjs', window.location.origin).href;
    const pdfjs = await import(/* @vite-ignore */moduleURL);
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({
      data: await f.arrayBuffer(),
      isEvalSupported: false
    }).promise;
    const parts = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const text = await (await pdf.getPage(i)).getTextContent();
        const lines = text.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('').trim();
        if (lines) parts.push('[Seite ' + i + ']\n' + lines);
        if (parts.join('\n').length > 200000) throw Error('Bitte auf 200.000 Zeichen kürzen.');
      }
    } finally {
      await pdf.destroy();
    }
    if (!parts.length) throw Error('Dieses PDF enthält keinen auslesbaren Text.');
    return parts.join('\n\n');
  }
  if (!/\.(txt|md|csv)$/i.test(f.name)) throw Error('Bitte PDF, TXT, MD oder CSV wählen.');
  return await f.text();
}
function Brand() {
  return <div className="brand"><img src="https://www.ing.de/binaries/content/gallery/ing-images/partnervertrieb/hilfe/diba_logo_2018_partner_3c_vers2.png" alt="ING" onError={e => {
      e.currentTarget.hidden = true;
      e.currentTarget.nextElementSibling.hidden = false;
    }} /><span hidden className="brandFallback">ING</span><i /><b>Evidence</b></div>;
}
function ReviewBadge({
  r
}) {
  const v = r.review;
  if (!v) return null;
  const text = {
    pending: 'Gelb · Fachprüfung erforderlich',
    confirmed: 'Fachlich bestätigt',
    rejected: 'Rot · Fachlich abgelehnt'
  }[v.status];
  return <div className={'reviewBadge ' + v.status}><b>{text}</b><span>{v.reason} · {v.sources.join(', ')}</span>{v.note && <span>{v.by}: {v.note}</span>}</div>;
}

const auditStates = { done: 'Abgeschlossen', failed: 'Fehlgeschlagen', blocked: 'Klärung nötig', skipped: 'Nicht ausgeführt' };
function AuditTrail({ r, openDoc, request, question }) {
  const a = r.audit;
  if (!a) return null;
  const counts = status => a.sources.filter(s => s.decision === status);
  const human = r.review;
  const needs = [...a.openEvidence];
  if (human?.status === 'pending') needs.push('Menschliche Fachprüfung wichtiger Quellen: ' + human.sources.join(', '));
  if (human?.status === 'rejected') needs.push('Fachlich abgelehnt: ' + human.note);
  const time = v => new Date(v).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return <section className="auditTrail" aria-label="Prüfverlauf">
    <div className="auditTitle"><h4>Prüfverlauf</h4><span>Schwelle: <b>{a.threshold}/100</b></span></div>
    <p className="auditHint">Gespeicherter Ablauf dieser Anfrage · {date(a.startedAt)} · {time(a.startedAt)}</p>
    <ol className="auditSteps">{a.steps.map(step => <li key={step.id} className={step.status}>
      <div><b>{step.label}</b><span className="auditState">{auditStates[step.status]}{step.at ? ' · ' + time(step.at) : ''}</span></div><p>{step.detail}</p>
    </li>)}<li className={human ? human.status === 'confirmed' ? 'done' : 'blocked' : 'skipped'}>
      <div><b>6 · Menschliche Fachprüfung</b><span className="auditState">{human ? { pending: 'Ausstehend', confirmed: 'Bestätigt', rejected: 'Abgelehnt' }[human.status] : 'Keine Pflichtprüfung ausgelöst'}</span></div>
      <p>{human ? human.sources.join(', ') + (human.note ? ' · ' + human.by + ': ' + human.note : ' · Eine andere fachprüfberechtigte Person muss entscheiden, unabhängig von den Punkten.') : 'Keine als wichtig eingestufte Quelle im Auswertungskontext.'}</p>
    </li></ol>
    <p className="auditHint">{a.limitation}</p>
    {[
      ['accepted', 'Schwelle erreicht'], ['protected', 'Trotz niedriger Punkte berücksichtigt'], ['excluded', 'Ausgeschlossene Fundstellen']
    ].map(([status, title]) => <details className="auditBucket" key={status}>
      <summary>{title} <b>{counts(status).length}</b></summary>
      {counts(status).length ? counts(status).map(source => <details className="auditSource" key={source.id}>
        <summary><span>{source.name} · S. {source.page}, Abs. {source.position}{source.important ? ' · Wichtig' : ''}</span><b>{source.score}/100</b></summary>
        <p>{source.reason}</p><blockquote>{source.quote}</blockquote>
        <div className="auditTable"><table><thead><tr><th>Kriterium</th><th>Punkte</th><th>Codeprüfung</th></tr></thead><tbody>{source.criteria.map(c => <tr key={c.label}><td>{c.label}</td><td>{c.points}/{c.max}</td><td>{c.reason}</td></tr>)}</tbody></table></div>
        {status === 'protected' && <p className="auditCounter"><b>Einzelprüfung durch KI 2: </b>{(() => { const check = a.counterChecks.find(c => c.id === source.id); return check ? check.urteil + ' · ' + check.grund : 'Offen – kein vollständiges Prüfurteil vorhanden.'; })()}</p>}
        <button className="textBtn" onClick={() => openDoc(source.doc)}>Quelle öffnen <ArrowRight size={14} /></button>
      </details>) : <p>Keine Fundstellen in dieser Gruppe.</p>}
    </details>)}
    {!!r.groups.length && <details className="auditBucket"><summary>Einzelbewertungen {r.mode === 'KI' ? 'durch KI 2' : 'der Quellensuche'}</summary>{r.groups.map(g => <section key={g.name}><h5>{g.name}</h5>{g.items.map(c => <p key={c.label}><b>{c.label} · {c.wert === null ? 'Entfällt' : c.wert + '/2'}</b><br />{c.grund}</p>)}</section>)}</details>}
    <div className="auditNeeds"><h5>Offene Nachweise und Prüfungen · {needs.length}</h5>{needs.length ? <><ul>{needs.map((need, i) => <li key={i}>{need}</li>)}</ul><button className="textBtn" onClick={() => request(question + '\n\nOffene Nachweise:\n' + needs.join('\n'))}>Nachweise anfragen</button></> : <p>Im Prüfablauf keine offenen Nachweise gemeldet. Das ist keine Garantie für Vollständigkeit.</p>}</div>
  </section>;
}
function Result({
  row,
  openDoc,
  request,
  repeat,
  busy,
  aiEnabled
}) {
  const r = row.result;
  const heading = r.mode === 'KI'
    ? (r.missing ? (r.reasoning && r.text ? 'Teilergebnis' : 'Klärungsbedarf') : r.warning ? 'KI-Entwurf · Prüfung offen' : r.review?.status === 'pending' ? 'Schlussfolgerung · Fachprüfung ausstehend' : r.review?.status === 'rejected' ? 'Fachlich abgelehnte Schlussfolgerung' : 'Schlussfolgerung')
    : r.mode === 'Quellensuche' ? 'Ergebnis der Quellensuche' : 'Zugriff';
  return <div className="turn"><div className="bubble">{row.question}</div><div className="answername"><span className="smallMark"><Layers size={16} /></span>Evidence <small>{r.mode}</small></div><ReviewBadge r={r} /><h3 className="resultHeading">{heading}</h3>
 {r.text && <p className="answer">{r.text}</p>}
 {r.reasoning && <><h4 className="resultSubheading">Begründung</h4><p className="answer">{r.reasoning}</p></>}
 {r.gap && <p className="answer"><b>Offener Punkt</b><br />{r.gap}</p>}
 {r.mode === 'Quellensuche' && aiEnabled && <button className="textBtn" disabled={busy} onClick={() => repeat(row.question)}>Mit KI beantworten</button>}
 {r.refs.length > 0 && <h4 className="resultSubheading">Belege</h4>}
 {r.refs.map((v, i) => <details className="quote" key={i}><summary><FileText size={15} />{v.name} <small>Abs. {v.position}</small><ChevronDown size={14} /></summary><blockquote>{v.quote}</blockquote><button className="textBtn" onClick={() => openDoc(v.doc)}>Quelle öffnen <ArrowRight size={14} /></button></details>)}
 {r.warning && <p className="warning">{r.warning}</p>}
 {r.score != null && <details className="rating"><summary><span className={'dot ' + (r.review?.status === 'pending' ? 'yellow' : r.review?.status === 'rejected' ? 'red' : r.score >= 70 ? 'green' : r.score >= 50 ? 'yellow' : 'red')} /><b>{r.score}/100</b> {r.mode === 'Quellensuche' ? 'Quellennachweis' : label(r.score)}<ChevronDown size={15} /></summary>{r.groups.map(g => <details key={g.name}><summary>{g.name}<ChevronDown size={14} /></summary>{g.items.map(c => <p key={c.label}><b>{c.label}</b> · {c.wert === null ? 'Entfällt' : c.wert + '/2'}<br />{c.grund}</p>)}</details>)}<small>Anteil der erreichten Punkte aus allen anwendbaren Kriterien.</small></details>}
 <AuditTrail r={r} openDoc={openDoc} request={request} question={row.question} />
 {r.missing && <div className="need"><LockKeyhole size={17} /><span>Nachweis offen</span><button onClick={() => request(row.question)}>Nachweis anfragen</button><button disabled={busy} onClick={() => repeat(row.question)}>Erneut prüfen</button></div>}</div>;
}
export default function Workspace() {
  const [view, V] = useState('Chat'),
    [data, D] = useState({
      docs: [],
      requests: [],
      history: [],
      me: null
    }),
    [thread, T] = useState(''),
    [question, Q] = useState(''),
    [threshold, setThreshold] = useState(null),
    [modal, M] = useState(''),
    [form, F] = useState({}),
    [busy, B] = useState(false),
    [reading, R] = useState(false),
    [error, E] = useState(''),
    [auth, A] = useState(false),
    [setup, S] = useState(false),
    [menu, U] = useState(false),
    [loaded, L] = useState(false);
  const end = useRef(null),
    input = useRef(null);
  async function refresh() {
    try {
      const next = await api();
      if (next.auth === false) {
        A(true);
        S(next.setup);
        D({
          docs: [],
          history: [],
          requests: [],
          me: null
        });
        L(true);
        return;
      }
      D(next);
      A(false);
      L(true);
    } catch (e) {
      if (e.status === 401) A(true);else E(e.message);
      L(true);
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, []);
  const manager = ['manager', 'admin'].includes(data.me?.role),
    reviewer = ['reviewer', 'admin'].includes(data.me?.role);
  const rows = data.history.filter(r => r.thread === thread).slice().reverse();
  useEffect(() => {
    if (rows.length) end.current?.scrollIntoView({
      block: 'nearest'
    });
  }, [rows.length, thread]);
  useEffect(() => {
    function close(e) {
      if (e.key === 'Escape' && !busy) {
        M('');
        U(false);
      }
    }
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy]);
  const field = (k, v) => F(f => ({
    ...f,
    [k]: v
  }));
  const go = v => {
    V(v);
    U(false);
    E('');
  };
  const recent = [...new Map(data.history.map(r => [r.thread, r])).values()].slice(0, 8);
  const pop = (m, f = {}) => {
    E('');
    F(f);
    M(m);
  };
  async function run(fn) {
    if (busy) return;
    E('');
    B(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      E(e.message);
    } finally {
      B(false);
    }
  }
  const ask = value => {
    if (!value.trim()) return;
    const selectedThreshold = threshold ?? data.sourceThreshold ?? 70;
    if (!Number.isInteger(selectedThreshold) || selectedThreshold < 0 || selectedThreshold > 100) {
      E('Bitte eine ganze Punkteschwelle zwischen 0 und 100 eingeben.');
      return;
    }
    run(async () => {
      const result = await api({
        action: 'ask',
        question: value,
        threshold: threshold ?? data.sourceThreshold ?? 70,
        thread
      });
      T(result.thread);
      Q('');
      V('Chat');
    });
  };
  const openDoc = doc => run(async () => {
    const d = await api({
      action: 'read',
      doc
    });
    pop('source', d);
  });
  const request = q => pop('request', {
    purpose: q,
    recipient: ''
  });
  const openThread = t => {
    T(t);
    Q('');
    go('Chat');
  };
  const requestStatus = q => q.status === 'approved' && q.expires < Date.now() ? 'Abgelaufen' : stateNames[q.status];
  async function submit(e) {
    e.preventDefault();
    await run(async () => {
      if (modal === 'upload') {
        await api({
          action: 'upload',
          importance: 'normal',
          ...form
        });
      }
      if (modal === 'classify' || modal === 'user' || modal === 'check') {
        await api({
          action: modal === 'check' ? 'review' : modal,
          ...form
        });
      }
      if (modal === 'request') {
        await api({
          action: 'request',
          ...form
        });
        V('Freigaben');
      }
      if (modal === 'review') {
        await api({
          action: 'approve',
          ...form
        });
      }
      M('');
    });
  }
  const pending = data.requests.filter(r => r.status === 'open' && r.recipient === data.me?.email).length;
  if (!loaded && !error) return <div className="login"><header><Brand /></header><main><p role="status">Arbeitsbereich wird geladen …</p></main></div>;
  if (loaded && !auth && !data.me && error) return <div className="login"><header><Brand /></header><main><div className="loginBox"><h1>Arbeitsbereich nicht erreichbar</h1><p>{error}</p><button className="primary" onClick={refresh}>Erneut verbinden</button></div></main></div>;
  if (auth) return <Login key={setup ? 'setup' : 'login'} setup={setup} success={() => {
    E('');
    F({});
    refresh();
  }} />;
  return <div className="app"><header><button className="mobile icon" aria-label="Navigation" onClick={() => U(!menu)}><Menu /></button><Brand /><div className="topEnd"><span>TUHH · Hochschulprojekt</span><button onClick={() => run(async () => {
          await api({
            action: 'logout'
          });
          T('');
          Q('');
          V('Chat');
          M('');
        })}>Abmelden</button><div className="avatar" title={data.me?.email}>{(data.me?.name || 'E').slice(0, 1).toUpperCase()}</div></div></header>
 <aside className={menu ? 'shown' : ''}><button className="newChat" onClick={() => {
        openThread('');
        input.current?.focus();
      }}><Plus size={18} /> Neuer Chat</button><div className="nav">{nav.filter(([v]) => (v !== 'Konten' || data.me?.role === 'admin') && (v !== 'Fachprüfung' || reviewer)).map(([v, I]) => <button key={v} className={view === v ? 'active' : ''} onClick={() => go(v)}><I size={18} />{v}{v === 'Freigaben' && pending > 0 && <em>{pending}</em>}{v === 'Fachprüfung' && data.queue?.length > 0 && <em>{data.queue.length}</em>}</button>)}</div><div className="sideRecent"><small>LETZTE CHATS</small>{recent.length ? recent.map(r => <button key={r.thread} onClick={() => openThread(r.thread)}>{r.question}</button>) : <p>Noch keine Gespräche</p>}</div><div className="sideFooter"><LockKeyhole size={15} /> Privater Arbeitsbereich</div></aside>
 {menu && <button className="scrim" aria-label="Navigation schließen" onClick={() => U(false)} />}
 <main><div className="crumb">Arbeitsbereich <ChevronRight size={13} /><b>{view}</b></div>
 {error && !modal && <p role="alert" className="error">{error} <button onClick={() => E('')}>Schließen</button></p>}
 {view === 'Chat' && <div className={'chatPane ' + (!rows.length ? 'empty' : '')}>
 {!rows.length ? <div className="welcome"><span className="heroMark"><Layers size={32} strokeWidth={1.7} /></span><h1>Dokumente befragen.</h1><p>Stellen Sie eine Frage zu Ihren Unterlagen.<br />{data.aiEnabled ? 'Evidence leitet eine Antwort aus Ihren Quellen ab und zeigt die Belege.' : 'Aktuell ist die Quellensuche aktiv. Für KI-Schlussfolgerungen muss ein Modell verbunden sein.'}</p></div> : <div className="conversation">{rows.map(r => <Result key={r.id} row={r} aiEnabled={data.aiEnabled} busy={busy} request={request} openDoc={openDoc} repeat={ask} />)}<div ref={end} /></div>}
 <div className="composerWrap"><label className="thresholdControl">Punkteschwelle für die nächste Anfrage<input type="number" min="0" max="100" step="1" aria-label="Punkteschwelle" disabled={busy} value={threshold ?? data.sourceThreshold ?? 70} onChange={e => setThreshold(e.target.value === '' ? '' : Number(e.target.value))} /> / 100</label><p className="thresholdHelp">Mögliche Gegenbelege bleiben auch unterhalb der Schwelle im Prüfkontext.</p><form className="composer" onSubmit={e => {
            e.preventDefault();
            ask(question);
          }}><textarea ref={input} aria-label="Frage" placeholder="Was möchten Sie wissen?" value={question} maxLength={2500} onChange={e => Q(e.target.value)} onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (!busy && !auth) ask(question);
              }
            }} /><div className="composerLine"><button type="button" className="attach" onClick={() => manager ? pop('upload') : go('Dokumente')}><Paperclip size={16} />{manager ? 'Dokument hinzufügen' : 'Quellen ansehen'}</button><button aria-label="Frage senden" className="send" disabled={busy || auth || !question.trim()}><ArrowUp size={19} /></button></div></form>
 <div className="under"><span><span className={'tinyDot ' + (data.live ? 'green' : '')} />{data.live ? 'KI-Analyse aktiv' : 'Quellensuche'}</span><button onClick={() => go('Dokumente')}>{data.docs.length} zugängliche Dokumente <ChevronRight size={12} /></button></div>{busy && <p role="status" className="wait">Quellenbewertung und gegebenenfalls KI-Prüfungen laufen. Der tatsächliche Prüfverlauf erscheint mit dem Ergebnis …</p>}</div>
 {!rows.length && <div className="startCards"><button onClick={() => go('Dokumente')}><span className="square"><FolderOpen /></span><div><b>Dokumente</b><small>Quellen verwalten</small></div><ArrowRight size={16} /></button><button onClick={() => go('Freigaben')}><span className="square"><KeyRound /></span><div><b>Freigaben</b><small>Nachweise anfragen</small></div><ArrowRight size={16} /></button></div>}
 </div>}
 {view !== 'Chat' && <section className="workspace"><div className="sectionTitle"><div><h1>{view}</h1><p>{{
                Dokumente: 'Ihre Quellen und freigegebenen Auszüge.',
                Freigaben: 'Anfragen stellen und Nachweise freigeben.',
                Prüfverlauf: 'Ihre bisherigen Fragen mit Quellen und Prüfung.',
                Fachprüfung: 'Offene Aussagen aus wichtigen Quellen. Eine zweite Person entscheidet.',
                Konten: 'Anmeldekonten und Zuständigkeiten im Arbeitsbereich.'
              }[view]}</p></div>{view === 'Konten' ? <button className="primary" onClick={() => pop('user', {
            role: 'employee'
          })}>Konto anlegen</button> : view === 'Dokumente' && manager ? <button className="primary" onClick={() => pop('upload')}><Plus size={16} /> Dokument hinzufügen</button> : view === 'Freigaben' ? <button className="primary" onClick={() => request('')}>Nachweis anfragen</button> : null}</div>
 {view === 'Dokumente' && (data.docs.length ? data.docs.map(d => <div className="docItem" key={d.id}><button className="listRow" onClick={() => openDoc(d.id)}><FileText /><div><b>{d.name}</b><small>{d.importance === 'important' ? 'Wichtig · Pflichtprüfung' : 'Normal'} · {d.shared ? 'Befristet freigegeben' : d.scope === 'team' ? 'Im Arbeitsbereich geteilt' : 'Privat'} · {d.issuer || 'Herausgeber offen'}</small></div><ChevronRight /></button>{d.mine && manager && <button className="textBtn" onClick={() => pop('classify', {
            doc: d.id,
            importance: d.importance === 'important' ? 'normal' : 'important'
          })}>Einstufung ändern</button>}</div>) : <Empty icon={FolderOpen} title="Noch keine Dokumente" text={manager ? "Laden Sie ein Text-PDF hoch oder fügen Sie einen Text ein." : "Bitten Sie die zuständige Person um einen Nachweis."} />)}
 {view === 'Konten' && data.users?.map(u => <div className="listRow" key={u.email}><div><b>{u.name}</b><small>{u.email} · {roleLabel[u.role]}</small></div></div>)}
 {view === 'Fachprüfung' && (data.queue?.length ? data.queue.map(row => <article className="requestRow" key={row.id}><p>{row.author} · {date(row.created)}</p><Result row={row} busy={busy} request={request} openDoc={openDoc} repeat={ask} /><button className="primary" onClick={() => pop('check', {
            id: row.id,
            signature: row.result.review.signature,
            decision: 'confirmed',
            note: ''
          })}>Entscheidung erfassen</button></article>) : <Empty icon={ShieldCheck} title="Keine offenen Fachprüfungen" text="Hier erscheinen prüfpflichtige Antworten anderer Personen, für deren Quellen Sie Leserechte haben." />)}
 {view === 'Prüfverlauf' && (data.history.length ? data.history.map(h => <button className="listRow" key={h.id} onClick={() => openThread(h.thread)}><History /><div><b>{h.question}</b><small>{date(h.created)} · {h.result.mode}{h.result.score != null ? ' · ' + h.result.score + '/100' : ''}</small></div><ChevronRight /></button>) : <Empty icon={History} title="Noch keine Prüfungen" text="Ihre beantworteten Fragen erscheinen hier." />)}
 {view === 'Freigaben' && (data.requests.length ? data.requests.map(q => <article className="requestRow" key={q.id}><span className="tag">{requestStatus(q)}</span><h3>{q.purpose}</h3><p>{q.recipient === data.me?.email ? 'Von ' + q.sender : 'An ' + q.recipient} · {date(q.created)}</p>{q.recipient === data.me?.email && q.status === 'open' && <div className="actions"><button className="primary" onClick={() => pop('review', {
              id: q.id,
              doc: '',
              excerpt: '',
              days: 1
            })}>Freigabe prüfen</button><button disabled={busy} onClick={() => run(() => api({
              action: 'deny',
              id: q.id
            }))}>Ablehnen</button></div>}{q.recipient === data.me?.email && q.status === 'approved' && q.expires > Date.now() && <button onClick={() => run(() => api({
            action: 'revoke',
            id: q.id
          }))}>Zugriff widerrufen</button>}{q.recipient !== data.me?.email && q.status === 'approved' && q.expires > Date.now() && <button onClick={() => {
            openThread('');
            Q(q.purpose);
          }}>Frage erneut öffnen</button>}</article>) : <Empty icon={KeyRound} title="Keine Freigabeanfragen" text="Hier sehen Sie eingehende und gesendete Anfragen." />)}
 </section>}</main>
 {modal && <div className="back" onClick={e => {
      if (e.target === e.currentTarget && !busy) M('');
    }}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="dialog"><button className="close icon" aria-label="Schließen" onClick={() => M('')}><X size={19} /></button><h2 id="dialog-title">{{
            upload: 'Dokument hinzufügen',
            source: form.name,
            request: 'Nachweis anfragen',
            review: 'Nachweis freigeben',
            classify: 'Wichtigkeit ändern',
            user: 'Konto anlegen',
            check: 'Fachprüfung abschließen'
          }[modal]}</h2>{error && <p className="error" role="alert">{error}</p>}
 {modal === 'source' ? <pre>{form.text}</pre> : <form onSubmit={submit}>
 {modal === 'user' && <><label>Name<input autoFocus required onChange={e => field('name', e.target.value)} /></label><label>E-Mail<input type="email" required onChange={e => field('email', e.target.value)} /></label><label>Passwort (mindestens 12 Zeichen)<input required type="password" minLength={12} autoComplete="new-password" onChange={e => field('password', e.target.value)} /></label><label>Rolle<select value={form.role} onChange={e => field('role', e.target.value)}>{Object.entries(roleLabel).map(([val, txt]) => <option key={val} value={val}>{txt}</option>)}</select></label></>}
 {modal === 'check' && <><label>Entscheidung<select value={form.decision} onChange={e => field('decision', e.target.value)}><option value="confirmed">Fachlich bestätigen</option><option value="rejected">Ablehnen</option></select></label><label>Begründung<textarea required rows={4} onChange={e => field('note', e.target.value)} /></label></>}
 {modal === 'classify' && <p>Neue Einstufung: <b>{form.importance === 'important' ? 'Wichtig – Fachprüfung erforderlich' : 'Normal'}</b>. Bereits erstellte Antworten aus ehemals wichtigen Quellen behalten ihre Prüfpflicht.</p>}
 {modal === 'upload' && <><label className="fileBox"><Upload size={18} /> {reading ? 'Datei wird gelesen …' : 'PDF, TXT, MD oder CSV auswählen'}<input type="file" accept=".pdf,.txt,.md,.csv" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                R(true);
                try {
                  const t = await extractFile(file);
                  if (t.length > 200000) throw Error('Maximal 200.000 Zeichen.');
                  F(f => ({
                    ...f,
                    text: t,
                    name: file.name
                  }));
                  E('');
                } catch (err) {
                  E(err.message);
                } finally {
                  R(false);
                }
              }} /></label><label>Titel<input autoFocus required maxLength={150} value={form.name || ''} onChange={e => field('name', e.target.value)} /></label><label>Dokumenttext<textarea required rows="5" maxLength={200000} value={form.text || ''} onChange={e => field('text', e.target.value)} /></label><label>Wichtigkeit<select value={form.importance || 'normal'} onChange={e => field('importance', e.target.value)}><option value="normal">Normal</option><option value="important">Wichtig · fachliche Prüfung erforderlich</option></select></label><label>Herausgeber (optional)<input maxLength={160} onChange={e => field('issuer', e.target.value)} /></label><label className="check"><input type="checkbox" onChange={e => field('reviewed', e.target.checked)} /> Prüfstatus ist dokumentiert</label><label className="check"><input type="checkbox" onChange={e => field('team', e.target.checked)} /> Für alle Nutzer dieser Website freigeben</label></>}
 {modal === 'request' && <><label>E-Mail der zuständigen Person<input type="email" autoFocus required value={form.recipient} onChange={e => field('recipient', e.target.value)} /></label><label>Welchen Nachweis benötigen Sie und wofür?<textarea required rows="4" value={form.purpose} onChange={e => field('purpose', e.target.value)} /></label><p className="muted">Die Anfrage erscheint im Freigabepostfach dieser Person, sobald sie Zugang zu dieser Website hat.</p></>}
 {modal === 'review' && <><label>Eigenes Dokument<select required value={form.doc} onChange={e => field('doc', e.target.value)}><option value="">Dokument auswählen</option>{data.docs.filter(d => d.mine).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Wörtlicher Auszug<textarea rows="4" value={form.excerpt} onChange={e => field('excerpt', e.target.value)} placeholder="Leer lassen, um das gesamte Dokument freizugeben." /></label><label>Dauer<select value={form.days} onChange={e => field('days', Number(e.target.value))}><option value={1}>1 Tag</option><option value={7}>7 Tage</option></select></label></>}
 <button className="primary" disabled={busy || reading || auth || !loaded}>{busy ? 'Wird gespeichert …' : {
              upload: 'Dokument speichern',
              review: 'Befristet freigeben',
              request: 'Anfrage senden',
              classify: 'Einstufung speichern',
              user: 'Konto speichern',
              check: 'Entscheidung speichern'
            }[modal]}</button></form>}</section></div>}</div>;
}
function Empty({
  icon: Icon,
  title,
  text
}) {
  return <div className="emptyList"><Icon size={30} /><h3>{title}</h3><p>{text}</p></div>;
}
const roleLabel = {
  employee: 'Mitarbeitende',
  manager: 'Dokumentverantwortliche',
  reviewer: 'Fachprüfung',
  admin: 'Administration'
};
function Login({
  setup,
  success
}) {
  const [f, F] = useState({}),
    [busy, B] = useState(false),
    [err, E] = useState('');
  const field = (k, v) => F(old => ({
    ...old,
    [k]: v
  }));
  return <div className="login"><header><Brand /><small>TUHH · Hochschulprojekt</small></header><main><div className="loginBox"><div className="heroMark"><LockKeyhole /></div><h1>{setup ? 'Arbeitsbereich einrichten' : 'Bei Evidence anmelden'}</h1><p>{setup ? 'Legen Sie das erste Administrationskonto an.' : 'Melden Sie sich mit Ihrem Firmenkonto für Evidence an.'}</p><form onSubmit={async e => {
          e.preventDefault();
          B(true);
          E('');
          try {
            await api({
              action: setup ? 'setup' : 'login',
              ...f
            });
            await success();
          } catch (x) {
            E(x.message);
          } finally {
            B(false);
          }
        }}>
 {setup && <><label>Setup-Code<input type="password" required onChange={e => field('token', e.target.value)} /></label><label>Name<input required onChange={e => field('name', e.target.value)} /></label></>}
 <label>E-Mail<input type="email" autoComplete="username" autoFocus={!setup} required onChange={e => field('email', e.target.value)} /></label><label>Passwort<input type="password" minLength={setup ? 12 : 1} autoComplete={setup ? 'new-password' : 'current-password'} required onChange={e => field('password', e.target.value)} /></label>{err && <p role="alert" className="error">{err}</p>}<button className="primary" disabled={busy}>{busy ? 'Bitte warten …' : setup ? 'Arbeitsbereich einrichten' : 'Anmelden'}<ArrowRight size={16} /></button></form></div></main></div>;
}
