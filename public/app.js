/* Evidence – Oberfläche. Die eigentliche Kontrolle (Rechte, Code-Check, Ampel, Siegel) läuft im Backend unter /api. */
'use strict';

const NUTZER = {
  lena:     { name: 'Lena Weber',       rolle: 'Kreditberaterin',                          stufen: ['pub', 'int'] },
  jonas:    { name: 'Jonas Krüger',     rolle: 'Teamleiter (Zweitfreigabe)',               stufen: ['pub', 'int', 'sec'] },
  petra:    { name: 'Dr. Petra Haas',   rolle: 'Dateneigentümerin vertrauliche Berichte',  stufen: ['pub', 'int', 'sec'] },
  revision: { name: 'Interne Revision', rolle: 'prüft nur das Protokoll',                  stufen: [] }
};
const EIGENTUEMER = 'petra'; // entscheidet über Zugriff auf streng vertrauliche Dokumente
const STUFE = { pub: 'öffentlich', int: 'intern', sec: 'streng vertraulich' };
const TYP = { fakt: 'Fakt', berechnung: 'Berechnung', schlussfolgerung: 'Schlussfolgerung', luecke: 'Lücke', allgemein: 'Ohne Beleg', interpretation: 'Interpretation' };
const URTEIL = { gestuetzt: 'gestützt', widersprochen: 'widersprochen', nicht_ausreichend: 'nicht ausreichend belegt', unklar: 'unklar' };
const KEY = 'evidence-v1';
const NULL = '0'.repeat(64);

const BEISPIELE = [
  { id: 'B1', name: 'Jahresabschluss 2025 – Nordwerk GmbH', datei: 'nordwerk_jahresabschluss_2025.pdf', stufe: 'int', sections: [
    [1, 'Die Nordwerk Maschinenbau GmbH mit Sitz in Hamburg entwickelt und fertigt Verpackungsmaschinen für die Lebensmittelindustrie.'],
    [3, 'Gewinn- und Verlustrechnung (Auszug). Umsatzerlöse Vorjahr (2024): 8,0 Mio. Euro. Umsatzerlöse aktuelles Jahr (2025): 9,2 Mio. Euro. Jahresüberschuss 2025: 0,6 Mio. Euro.'],
    [4, 'Bilanz zum 31.12.2025: Bilanzsumme 12,5 Mio. Euro, Eigenkapital 4,25 Mio. Euro. Die Eigenkapitalquote beträgt damit 34 %.'],
    [6, 'Ausblick: Die Geschäftsführung erwartet für 2026 eine stabile Nachfrage.']] },
  { id: 'B2', name: 'Kreditrichtlinie Firmenkunden KMU', datei: 'kreditrichtlinie_kmu.pdf', stufe: 'int', sections: [
    [2, 'Für Kredite an Unternehmen mit einem Jahresumsatz unter 50 Mio. Euro gilt eine Mindest-Eigenkapitalquote von 30 %.'],
    [2, 'Maßgeblich ist die Eigenkapitalquote nach Berücksichtigung wesentlicher Feststellungen des Abschlussprüfers.'],
    [3, 'Bei einer Unterschreitung der Mindestquote ist eine Einzelfallprüfung durch die Teamleitung erforderlich.']] },
  { id: 'B3', name: 'Prüfungsbericht Abschlussprüfer 2025', datei: 'pruefungsbericht_nordwerk_2025.pdf', stufe: 'sec', sections: [
    [7, 'Für einen laufenden Rechtsstreit mit einem Lieferanten wurde keine Rückstellung gebildet; wir schätzen das Risiko auf 0,7 Mio. Euro.'],
    [8, 'Unter Berücksichtigung dieser Feststellung ergibt sich ein Eigenkapital von 3,55 Mio. Euro.']] },
  { id: 'B4', name: 'Branchenreport Verpackungsmaschinen 2025', datei: 'branchenreport_2025.pdf', stufe: 'pub', sections: [
    [1, 'Der Verpackungsmaschinenbau in Deutschland verzeichnete 2025 ein leichtes Umsatzplus.']] }
];
const BEISPIELFRAGE = 'Wie hat sich der Umsatz von Nordwerk entwickelt, erfüllt Nordwerk die Eigenkapitalanforderung unserer Kreditrichtlinie und wie hoch ist der Auftragsbestand für 2026?';

let S = { role: 'lena', docs: [], freigaben: [], anfragen: [], run: null, reviews: {}, submit: null, log: [], tab: 'assistent', sel: null, selDoc: null, zweck: 'entscheidung', n: 0 };
let server = { erreichbar: false, ki: false };
let busy = false, fehler = '', verify = null, upInfo = '';

/* ---------- Helfer ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const me = () => NUTZER[S.role];
const docById = id => S.docs.find(d => d.id === id);
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { fehler = 'Der Browser-Speicher ist voll. Bitte weniger oder kleinere Dokumente verwenden.'; } }
function load() { try { const x = JSON.parse(localStorage.getItem(KEY)); if (x && x.docs) S = Object.assign(S, x); } catch (e) {} }
function darfSehen(uid, doc) {
  if (!doc) return false;
  if (NUTZER[uid].stufen.includes(doc.stufe)) return true;
  return S.freigaben.some(f => f.nutzer === uid && f.doc === doc.id && f.bis > Date.now());
}
async function sha(buf) {
  if (!(window.crypto && crypto.subtle)) return 'nicht-verfuegbar';
  const b = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const shaText = t => sha(new TextEncoder().encode(t));
async function api(path, body) {
  const pw = sessionStorage.getItem('evidence-pass') || '';
  const r = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-evidence-pass': pw }, body: JSON.stringify(body) } : {});
  if (r.status === 401) {
    const p = window.prompt('Diese Seite ist passwortgeschützt. Bitte Passwort eingeben:');
    if (p) { sessionStorage.setItem('evidence-pass', p); return api(path, body); }
    throw new Error('Passwort erforderlich.');
  }
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((j && j.fehler) || (r.status === 413 ? 'Die Dokumente sind zu groß für eine Anfrage.' : r.status === 504 ? 'Zeitlimit überschritten. Bitte erneut versuchen.' : 'Fehler ' + r.status));
  return j;
}

/* ---------- Protokoll mit verketteten Siegeln ---------- */
let kette = Promise.resolve();
const kanon = e => JSON.stringify([e.nr, e.zeit, e.akteur, e.aktion, e.details, e.prev]);
function log(akteur, aktion, details) {
  kette = kette.then(async () => {
    const prev = S.log.length ? S.log[S.log.length - 1].hash : NULL;
    const e = { nr: S.log.length + 1, zeit: new Date().toISOString(), akteur, aktion, details: String(details || '').slice(0, 700), prev };
    try {
      if (!server.erreichbar) throw 0;
      e.hash = (await api('seal', { aktion: 'siegeln', eintrag: e })).hash; e.art = 'server';
    } catch (x) { e.hash = await shaText(kanon(e)); e.art = 'lokal'; }
    S.log.push(e); save();
    if (S.tab === 'protokoll') renderMain();
  });
  return kette;
}
async function pruefeKette() {
  await kette;
  const bad = new Set();
  let prev = NULL;
  for (const e of S.log) { if (e.prev !== prev) bad.add(e.nr); prev = e.hash; }
  for (const e of S.log.filter(x => x.art !== 'server')) if (await shaText(kanon(e)) !== e.hash) bad.add(e.nr);
  const sv = S.log.filter(x => x.art === 'server');
  let hinweis = '';
  if (sv.length) {
    try { (await api('seal', { aktion: 'pruefen', eintraege: sv })).falsch.forEach(n => bad.add(n)); }
    catch (x) { hinweis = 'Server nicht erreichbar: Server-Siegel konnten nicht geprüft werden.'; }
  }
  const first = bad.size ? Math.min(...bad) : null;
  verify = { ok: !bad.size, first, hinweis, zeit: new Date().toLocaleTimeString('de-DE') };
  renderMain();
}

/* ---------- Dokumente ---------- */
function chunk(text, max) {
  const out = [];
  String(text).replace(/\r/g, '').replace(/([A-Za-zÄÖÜäöüß])-\n([a-zäöüß])/g, '$1$2').split(/\n\s*\n|\n(?=[A-ZÄÖÜ0-9•\-–])/).forEach(p => {
    p = p.replace(/\s+/g, ' ').trim();
    if (!p) return;
    while (p.length > max) {
      let cut = p.lastIndexOf('. ', max);
      if (cut < max * 0.4) cut = p.lastIndexOf(' ', max);
      if (cut < 1) cut = max;
      out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim();
    }
    if (p) { if (out.length && (out[out.length - 1] + ' ' + p).length <= max * 0.6) out[out.length - 1] += ' ' + p; else out.push(p); }
  });
  return out;
}
function script(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Bibliothek konnte nicht geladen werden.')); document.head.appendChild(s); });
}
async function lesePDF(buf) {
  if (!window.pdfjsLib) {
    await script('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    let t = '', lastY = null;
    tc.items.forEach(it => {
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) t += '\n';
      t += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    });
    pages.push([i, t]);
  }
  return pages;
}
async function leseDOCX(buf) {
  if (!window.mammoth) await script('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  return [[1, (await window.mammoth.extractRawText({ arrayBuffer: buf })).value]];
}
async function ladeDatei(file, stufe) {
  const ext = file.name.split('.').pop().toLowerCase();
  const buf = await file.arrayBuffer();
  const hash = await sha(buf);
  let pages;
  if (ext === 'pdf') pages = await lesePDF(buf.slice(0));
  else if (ext === 'docx') pages = await leseDOCX(buf);
  else if (['txt', 'md', 'csv'].includes(ext)) pages = [[1, new TextDecoder('utf-8').decode(buf)]];
  else throw new Error('Dateityp nicht unterstützt. Möglich sind PDF, DOCX, TXT, MD und CSV.');
  const teile = [];
  pages.forEach(([p, t]) => chunk(t, 800).forEach(c => teile.push([p, c])));
  if (!teile.length) throw new Error('In der Datei wurde kein Text gefunden. Gescannte PDFs (Bilder) werden nicht unterstützt.');
  const alt = S.docs.find(d => d.datei === file.name && !d.beispiel);
  let doc;
  if (alt) {
    if (alt.hash === hash) throw new Error('Genau diese Datei ist schon vorhanden.');
    alt.verlauf = (alt.verlauf || []).concat({ ver: alt.ver, hash: alt.hash });
    alt.ver += 1; alt.hash = hash; alt.stufe = stufe; doc = alt;
  } else {
    S.n += 1;
    doc = { id: 'D' + S.n, name: file.name.replace(/\.[^.]+$/, ''), datei: file.name, ver: 1, stufe, hash, von: S.role };
    S.docs.push(doc);
  }
  doc.sections = teile.map(([p, t], i) => ({ id: `${doc.id}:v${doc.ver}:s${i + 1}`, page: p, text: t }));
  save();
  log(me().name, `Dokument hochgeladen: ${doc.id} v${doc.ver} (${STUFE[stufe]})`, `${doc.datei} · ${doc.sections.length} Abschnitte · Fingerabdruck ${hash.slice(0, 16)}…`);
  return doc;
}
async function ladeBeispiele() {
  for (const b of BEISPIELE) {
    if (docById(b.id)) continue;
    const sections = b.sections.map(([p, t], i) => ({ id: `${b.id}:v1:s${i + 1}`, page: p, text: t }));
    const hash = await shaText(sections.map(s => s.text).join('\n'));
    S.docs.push({ id: b.id, name: b.name, datei: b.datei, ver: 1, stufe: b.stufe, hash, beispiel: true, von: b.stufe === 'sec' ? 'petra' : 'jonas', sections });
    log(b.stufe === 'sec' ? NUTZER.petra.name : 'Fachbereich', `Dokument hochgeladen: ${b.id} v1 (${STUFE[b.stufe]})`, `${b.datei} · Fingerabdruck ${hash.slice(0, 16)}…`);
  }
  save(); render();
}

/* ---------- Frage stellen ---------- */
async function fragen(frage) {
  if (busy) return;
  busy = true; fehler = ''; verify = null;
  const uid = S.role;
  const run = { frage, zweck: S.zweck, by: uid, zeit: Date.now(), steps: [], claims: null };
  S.run = run; S.reviews = {}; S.submit = null; S.sel = null; S.selDoc = null;
  const step = t => { run.steps.push(t); render(); };
  const basis = { frage, nutzer: uid, docs: S.docs.map(d => ({ id: d.id, name: d.name, stufe: d.stufe, beispiel: !!d.beispiel, sections: d.sections })), freigaben: S.freigaben };
  try {
    render();
    log(me().name, 'Frage gestellt', frage);
    const a = await api('analyze', Object.assign({ schritt: 'assistent' }, basis));
    run.modus = a.modus; run.modellK1 = a.modell; run.prompt = a.prompt; run.regeln = a.regeln;
    run.bereitK1 = a.bereitgestellt; run.gesperrt = a.gesperrt; run.durchsuchbar = a.durchsuchbar;
    step(`Rechte geprüft: ${a.durchsuchbar.length} Dokument(e) durchsuchbar` + (a.gesperrt ? `, ${a.gesperrt} gesperrt. Gesperrte Dokumente bekommt die KI nicht.` : '.'));
    log('System', 'Rechteprüfung vor der Suche', `Suchraum für ${me().name}: ${a.durchsuchbar.join(', ')} · gesperrt: ${a.gesperrt}`);
    step(`KI 1 hat geantwortet: ${a.aussagen.length} Aussagen aus ${a.bereitgestellt.length} von ${a.abschnitteGesamt} Abschnitten.`);
    log(`KI 1 · ${a.modell} · Prompt ${a.prompt}`, `Antwort mit ${a.aussagen.length} Aussagen`, `bereitgestellt: ${a.bereitgestellt.length} Abschnitte · ` + a.aussagen.map(x => `${x.id}: ${x.text}`).join(' | '));
    const f1 = a.aussagen.filter(x => !x.check.ok).length;
    step(`Prüfprogramm: ${f1 ? f1 + ' Aussage(n) mit Fehler gefunden.' : 'keine formalen Fehler.'}`);
    log('Prüfprogramm', 'Code-Check', a.aussagen.map(x => `${x.id}:${x.check.ok ? 'ok' : 'FEHLER'}`).join(', '));
    const p = await api('analyze', Object.assign({ schritt: 'pruefer', aussagen: a.aussagen, bereitgestellt: a.bereitgestellt }, basis));
    run.modellK2 = p.modell; run.bereitK2 = p.bereitgestellt;
    run.claims = p.aussagen;
    step(`KI 2 hat jede Aussage unabhängig geprüft (${p.bereitgestellt.length} Abschnitte gelesen).`);
    log(`KI 2 · ${p.modell} · Prompt ${a.prompt}`, 'Urteile', p.aussagen.map(x => `${x.id}:${URTEIL[x.pruefer.urteil]}`).join(', '));
    step('Ampel nach festen Regeln der Bank berechnet.');
    log(`System · Regeln ${a.regeln}`, 'Ampel', p.aussagen.map(x => `${x.id}:${x.ampel}${x.stichprobe ? ' (Stichprobe)' : ''}`).join(', '));
    const erste = p.aussagen.find(x => x.ampel === 'rot') || p.aussagen.find(x => x.ampel === 'gelb') || p.aussagen[0];
    S.sel = erste.id;
  } catch (e) {
    fehler = e.message;
    log('System', 'Fehler', e.message);
  }
  busy = false; save(); render();
}

/* ---------- Regeln der Oberfläche ---------- */
const pflicht = c => c.ampel !== 'grün' || c.stichprobe;
const sichtbar = c => S.role !== 'revision' && c.docs.every(id => darfSehen(S.role, docById(id)));
const brauchtZweit = r => r.claims.some(c => c.ampel === 'rot');
function endText(c) { const rv = S.reviews[c.id]; return rv && rv.aktion === 'korrigiert' ? rv.text : c.text; }
function markiere(text, ranges, cls) {
  const rs = ranges.filter(r => r && r.start != null).sort((a, b) => a.start - b.start);
  let out = '', pos = 0;
  rs.forEach(r => { if (r.start < pos) return; out += esc(text.slice(pos, r.start)) + `<mark class="${cls || ''}">` + esc(text.slice(r.start, r.end)) + '</mark>'; pos = r.end; });
  return out + esc(text.slice(pos));
}
function findeAbschnitt(id) { for (const d of S.docs) { const s = d.sections.find(x => x.id === id); if (s) return { s, d }; } return null; }

/* ---------- Darstellung ---------- */
function render() { renderKopf(); renderLinks(); renderTabs(); renderMain(); renderRechts(); }
function renderKopf() {
  $('role').innerHTML = Object.entries(NUTZER).map(([k, u]) => `<option value="${k}" ${k === S.role ? 'selected' : ''}>${esc(u.name)} – ${esc(u.rolle)}</option>`).join('');
  const st = $('status');
  if (!server.erreichbar) { st.className = 'status off'; st.textContent = 'Backend nicht erreichbar'; }
  else if (server.ki) { st.className = 'status ki'; st.textContent = 'KI aktiv · ' + server.modellAssistent; }
  else { st.className = 'status demo'; st.textContent = 'Demo-Modus (kein API-Schlüssel)'; }
  $('banner').innerHTML = !server.erreichbar
    ? '<div class="banner r">Das Backend (/api) ist nicht erreichbar. Die Seite muss über Vercel oder „node dev-server.js“ laufen, nicht als lokal geöffnete Datei.</div>'
    : !server.ki ? '<div class="banner">Demo-Modus: Es ist noch kein API-Schlüssel hinterlegt. Mit den Beispieldokumenten kommt eine vorbereitete KI-Antwort mit eingebauten Fehlern. Prüfprogramm, Ampel, Rechte und Protokoll arbeiten echt.</div>' : '';
  $('ver').textContent = server.regeln ? ` · Regeln ${server.regeln} · Prompt ${server.prompt}` : '';
}
function renderLinks() {
  const r = S.run;
  let h = '<h2>Dokumente</h2>';
  if (!S.docs.length) h += '<div class="note">Noch keine Dokumente. Lade eigene Dateien hoch oder starte mit den Beispielen.</div>';
  S.docs.forEach(d => {
    const offen = S.role !== 'revision' && darfSehen(S.role, d);
    const fg = S.freigaben.find(f => f.nutzer === S.role && f.doc === d.id && f.bis > Date.now());
    if (!offen && d.stufe === 'sec') {
      h += `<div class="doc locked ${S.selDoc === d.id ? 'sel' : ''}" data-act="doc" data-id="${d.id}"><div class="n">🔒 Vertrauliches Dokument</div><div class="m">Titel verborgen · verantwortlich: ${esc(NUTZER[EIGENTUEMER].name)}</div><div class="chips"><span class="chip sec">streng vertraulich</span></div></div>`;
      return;
    }
    let nutz = '';
    if (r && r.claims && offen) {
      const k1 = (r.bereitK1 || []).filter(s => s.startsWith(d.id + ':')).length;
      const zit = new Set(r.claims.flatMap(c => c.check.belege.filter(b => b.docId === d.id && b.status !== 'fail').map(b => b.abschnitt))).size;
      nutz = `<span class="chip">KI bereitgestellt ${k1}/${d.sections.length}</span><span class="chip ${zit ? 'or' : ''}">zitiert ${zit}</span>`;
    }
    h += `<div class="doc ${S.selDoc === d.id ? 'sel' : ''}" data-act="doc" data-id="${d.id}"><div class="n">${offen ? '' : '🔒 '}${esc(d.name)}</div>
      <div class="m">${esc(d.datei)} · Version ${d.ver}</div>
      <div class="chips"><span class="chip ${d.stufe}">${STUFE[d.stufe]}</span>${fg ? `<span class="chip or">befristet bis ${new Date(fg.bis).toLocaleDateString('de-DE')}</span>` : ''}${nutz}</div></div>`;
  });
  if (S.role !== 'revision') {
    h += `<div class="up"><b>Dokument hochladen</b><div class="note">PDF, DOCX, TXT, MD oder CSV</div>
      <select id="upStufe" aria-label="Vertraulichkeit"><option value="int">intern</option><option value="pub">öffentlich</option><option value="sec">streng vertraulich</option></select>
      <input type="file" id="upFile" accept=".pdf,.docx,.txt,.md,.csv">
      ${upInfo ? `<div class="${upInfo.startsWith('✓') ? 'note' : 'err'}">${esc(upInfo)}</div>` : ''}
      <div class="note" style="margin-top:6px">Im Zweifel die höhere Stufe wählen. Die Stufe legt ein Mensch fest, nicht die KI.</div></div>`;
    if (!docById('B1')) h += '<button class="btn sm" style="margin-top:10px;width:100%" data-act="beispiele">Beispieldokumente laden</button>';
  }
  $('left').innerHTML = h;
}
function renderTabs() {
  const offen = S.anfragen.filter(q => q.status === 'offen' && S.role === EIGENTUEMER).length;
  const tabs = [['assistent', 'Assistent'], ['anfragen', 'Zugriffsanfragen' + (offen ? `<span class="badge">${offen}</span>` : '')], ['protokoll', 'Protokoll']];
  $('tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-act="tab" data-id="${k}">${l}</button>`).join('');
}
function renderMain() {
  $('main').innerHTML = S.tab === 'protokoll' ? vProtokoll() : S.tab === 'anfragen' ? vAnfragen() : vAssistent();
}

function vAssistent() {
  if (S.role === 'revision') return '<div class="empty">Die Revision stellt keine Fragen und sieht keine Dokumentinhalte. Sie prüft das <b>Protokoll</b>.</div>';
  const r = S.run;
  let h = '';
  if (!r) {
    h += `<div class="empty"><b>So geht’s:</b> Dokumente links auswählen oder hochladen, unten eine Frage stellen.<br>Die Antwort kommt in einzelnen Aussagen, jede mit Beleg und Ampel.</div>`;
  } else {
    h += `<div class="q">${esc(r.frage)}</div>`;
    h += '<div class="steps">' + r.steps.map(s => `<div class="step"><span class="ic">✓</span><span>${esc(s)}</span></div>`).join('') + (busy ? '<div class="step wait"><span class="ic">⏳</span><span>arbeitet … (kann bis zu einer Minute dauern)</span></div>' : '') + '</div>';
    if (r.claims) h += vAussagen(r);
  }
  if (fehler) h += `<div class="alert r">${esc(fehler)}</div>`;
  const kann = S.docs.some(d => darfSehen(S.role, d));
  h += `<div class="ask"><textarea id="frage" placeholder="Frage an die Dokumente …" ${busy ? 'disabled' : ''}>${esc(r ? '' : (docById('B1') ? BEISPIELFRAGE : ''))}</textarea>
    <div class="row"><label><input type="radio" name="zweck" value="entscheidung" ${S.zweck === 'entscheidung' ? 'checked' : ''}> Für eine Entscheidung (mit Prüfung und Freigabe)</label>
    <label><input type="radio" name="zweck" value="recherche" ${S.zweck === 'recherche' ? 'checked' : ''}> Nur nachlesen</label><span class="sp"></span>
    <button class="btn pri" data-act="fragen" ${busy || !kann || !server.erreichbar ? 'disabled' : ''}>Fragen</button></div>
    <div class="err hidden" id="frageErr">Bitte eine Frage eingeben.</div>
    ${kann ? '' : '<div class="note">Es ist noch kein Dokument für dich freigegeben.</div>'}</div>`;
  return h;
}
function vAussagen(r) {
  const cnt = { grün: 0, gelb: 0, rot: 0 };
  r.claims.forEach(c => cnt[c.ampel]++);
  let h = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><b style="color:var(--bl)">Antwort in ${r.claims.length} prüfbaren Aussagen</b><span class="pill grün">${cnt.grün} grün</span><span class="pill gelb">${cnt.gelb} gelb</span><span class="pill rot">${cnt.rot} rot</span>${r.modus === 'demo' ? '<span class="pill blau">Demo-Antwort</span>' : ''}</div>`;
  if (r.gesperrt && S.role === r.by) h += `<div class="alert b">${r.gesperrt} vertrauliche(s) Dokument(e) wurden nicht durchsucht, weil sie für dich nicht freigegeben sind. Wenn du sie brauchst, kannst du links den Zugriff begründet anfragen.</div>`;
  r.claims.forEach(c => {
    if (!sichtbar(c)) { h += `<div class="claim masked"><span class="typ">${c.id}</span> 🔒 Diese Aussage beruht auf einer vertraulichen Quelle, die für dich nicht freigegeben ist.</div>`; return; }
    const rv = S.reviews[c.id];
    const st = rv ? `<span class="rv done">✓ ${esc(rv.aktion)} von ${esc(NUTZER[rv.by].name)}</span>`
      : r.zweck === 'recherche' ? '' : pflicht(c) ? `<span class="rv">${c.ampel === 'grün' ? 'Stichprobe: ' : ''}Mensch muss prüfen</span>` : '<span class="rv">keine Prüfung nötig</span>';
    const quellen = [...new Set(c.check.belege.filter(b => b.docId).map(b => `${docById(b.docId) ? docById(b.docId).name : b.docId}, S. ${b.seite}`))];
    h += `<div class="claim ${c.ampel} ${S.sel === c.id ? 'sel' : ''}" data-act="claim" data-id="${c.id}">
      <div class="top"><span class="light ${c.ampel}"><i></i><i></i><i></i></span><span class="typ">${c.id} · ${TYP[c.typEffektiv] || c.typ}</span><span class="note">Prüfer-KI: ${URTEIL[c.pruefer.urteil]}</span>${c.stichprobe ? '<span class="chip or">Stichprobe</span>' : ''}</div>
      <div class="${rv && rv.aktion === 'gestrichen' ? 'struck' : ''}">${esc(endText(c))}</div>
      ${rv && rv.aktion === 'korrigiert' ? `<div class="note struck">${esc(c.text)}</div>` : ''}
      ${quellen.length ? `<div class="srcl">📄 ${esc(quellen.join(' · '))}</div>` : ''}<div>${st}</div></div>`;
  });
  h += vFreigabe(r);
  return h;
}
function vFreigabe(r) {
  if (r.zweck === 'recherche') return `<div class="bar"><span class="note">Nur zum Nachlesen: keine Freigabe nötig. Die Ampel zeigt trotzdem, worauf du dich verlassen kannst.</span><button class="btn sm" data-act="zweck">Doch für eine Entscheidung verwenden</button></div>`;
  const pfl = r.claims.filter(pflicht), done = pfl.filter(c => S.reviews[c.id]).length;
  const zw = brauchtZweit(r), s = S.submit;
  const darfAlle = r.claims.every(sichtbar);
  let h = `<div class="bar"><span>Geprüft: <b>${done} von ${pfl.length}</b>${zw ? ' · Weil etwas rot ist, schaut eine <b>zweite Person</b> drauf.' : ''}</span>`;
  if (!s) h += `<button class="btn pri" data-act="einreichen" ${done < pfl.length || S.role !== r.by ? 'disabled' : ''}>${zw ? 'An zweite Person weitergeben' : 'Antwort freigeben'}</button>`;
  else if (s.status === 'wartet') {
    if (S.role !== s.by && ['lena', 'jonas'].includes(S.role) && darfAlle) h += `<span><button class="btn pri" data-act="zweit">Zweitfreigabe erteilen</button> <button class="btn danger" data-act="zurueck">Zurückgeben</button></span>`;
    else h += `<span class="pill gelb">Wartet auf zweite Person${S.role === s.by ? ' (nicht du selbst)' : ''}</span>`;
  } else if (s.status === 'frei') h += `<span class="pill grün">Freigegeben${s.zweit ? ' (vier Augen)' : ''}</span>`;
  else h += '<span class="pill rot">Zurückgegeben zur Überarbeitung</span>';
  h += '</div>';
  if (s && s.status === 'frei') {
    const t = r.claims.filter(c => sichtbar(c) && !(S.reviews[c.id] && S.reviews[c.id].aktion === 'gestrichen')).map(endText);
    h += `<div class="alert g"><b>Freigegebene Fassung:</b><br>${t.map(esc).join('<br>')}<div class="note" style="margin-top:5px">Die ursprünglichen KI-Aussagen bleiben im Protokoll erhalten.</div></div>`;
  }
  return h;
}

function renderRechts() {
  const el = $('right');
  if (S.selDoc) { el.innerHTML = vDokument(docById(S.selDoc)); return; }
  const c = S.run && S.run.claims && S.run.claims.find(x => x.id === S.sel);
  if (!c || !sichtbar(c)) { el.innerHTML = '<h2>Beleg prüfen</h2><div class="empty">Klicke auf eine Aussage, um sie neben der Originalstelle zu sehen.</div>'; return; }
  el.innerHTML = vAussage(c, S.run);
}
function vAussage(c, r) {
  const k = c.check;
  let h = `<h2>${c.id} prüfen <span class="pill ${c.ampel}">${c.ampel}</span></h2>`;
  h += `<div class="box"><div class="lb">Das sagt die KI (${TYP[k.typEffektiv] || c.typ})</div>${esc(c.text)}${c.basis.length ? `<div class="note" style="margin-top:5px">Beruht auf: ${c.basis.join(', ')}</div>` : ''}</div>`;
  // Originalstellen
  const proAbschnitt = {};
  k.belege.concat(k.rechnung ? k.rechnung.werte : []).forEach(b => { if (b.status && b.status !== 'fail') (proAbschnitt[b.abschnitt] = proAbschnitt[b.abschnitt] || []).push(b); });
  const ids = Object.keys(proAbschnitt);
  if (ids.length) h += '<h3>Das steht im Original</h3>';
  ids.forEach(id => { const f = findeAbschnitt(id); if (!f) return; h += `<div class="secbox"><div class="lb"><span>📄 ${esc(f.d.name)}</span><span>Seite ${f.s.page}</span><span class="chip ${f.d.stufe}">${STUFE[f.d.stufe]}</span></div>${markiere(f.s.text, proAbschnitt[id])}</div>`; });
  k.belege.filter(b => b.status === 'fail').forEach(b => { h += `<div class="alert r"><b>Zitat der KI nicht gefunden:</b> „${esc(b.zitat)}“<br>${esc(b.fehler || '')}</div>`; });
  if (c.typ === 'luecke') h += `<div class="alert b">Durchsucht wurden ${r.bereitK1.length} Abschnitte aus: ${esc(r.durchsuchbar.map(id => docById(id) ? docById(id).name : id).join(', '))}.${r.gesperrt ? ` ${r.gesperrt} gesperrte(s) Dokument(e) wurden nicht durchsucht.` : ''}</div>`;
  if (k.rechnung && k.rechnung.formel) h += `<div class="calc"><div class="note">Das Programm rechnet selbst nach</div><div class="eq">${esc(k.rechnung.formel)} = ${esc(k.rechnung.ergebnisCode)}</div><div>KI sagt: <b>${esc(k.rechnung.ergebnisKI)}</b> ${k.rechnung.ok ? '✓' : '✗'}</div></div>`;
  h += '<h3>Prüfprogramm (kein KI-Urteil, nur Nachschlagen und Nachrechnen)</h3>' + k.punkte.map(p => `<div class="chk ${p[0]}"><b>${p[0] === 'ok' ? '✓' : p[0] === 'no' ? '✗' : '!'}</b><span>${esc(p[1])}</span></div>`).join('');
  h += `<h3>Zweite KI (Prüfer)</h3><div><b>${URTEIL[c.pruefer.urteil]}</b>${c.pruefer.begruendung ? ' – ' + esc(c.pruefer.begruendung) : ''}</div>`;
  c.pruefer.fundstellen.forEach(f => { const x = findeAbschnitt(f.abschnitt); if (!x) return; h += `<div class="secbox" style="margin-top:6px"><div class="lb"><span>🕵️ Fundstelle: ${esc(x.d.name)}</span><span>Seite ${x.s.page}</span><span class="chip ${x.d.stufe}">${STUFE[x.d.stufe]}</span></div>${markiere(x.s.text, [f], c.pruefer.urteil === 'gestuetzt' ? '' : 'gegen')}</div>`; });
  if (c.pruefer.verworfen) h += `<div class="note">${c.pruefer.verworfen} Fundstelle(n) der Prüfer-KI verworfen: Zitat nicht im Original gefunden.</div>`;
  h += `<h3>Warum ${c.ampel}?</h3>` + c.gruende.map(g => `<div class="chk wa"><b style="background:${c.ampel === 'rot' ? 'var(--re)' : c.ampel === 'gelb' ? 'var(--ye)' : 'var(--gr)'}">›</b><span>${esc(g)}</span></div>`).join('') + (c.stichprobe ? '<div class="note">Zufällig als Stichprobe gezogen: So lässt sich messen, wie oft „grün“ wirklich stimmt.</div>' : '');
  // Menschliche Entscheidung
  h += '<h3>Deine Entscheidung</h3>';
  const rv = S.reviews[c.id];
  if (rv) {
    h += `<div class="alert g">✓ ${esc(rv.aktion)} von ${esc(NUTZER[rv.by].name)}${rv.aktion === 'korrigiert' ? `: „${esc(rv.text)}“` : ''}${rv.begr ? `<br>Begründung: ${esc(rv.begr)}` : ''}</div>`;
    if (!S.submit && rv.by === S.role) h += '<button class="btn sm" data-act="undo">Entscheidung zurücknehmen</button>';
  } else if (S.submit) h += '<div class="note">Bereits eingereicht.</div>';
  else if (S.role !== r.by) h += `<div class="note">Die Prüfung macht ${esc(NUTZER[r.by].name)}, die die Frage gestellt hat.</div>`;
  else {
    const rot = c.ampel === 'rot';
    h += `<label class="note">Berichtigte Aussage (nur für „Korrigieren“)</label><textarea id="korr">${esc(c.pruefer.korrektur || c.text)}</textarea>
      <label class="note">Begründung ${rot ? '(Pflicht)' : '(Pflicht bei Korrigieren und Streichen)'}</label><textarea id="begr" placeholder="Kurz: Warum?"></textarea><div class="err hidden" id="rvErr"></div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn sm ${rot ? '' : 'pri'}" data-act="rv" data-id="bestätigt">${rot ? 'Trotzdem bestätigen' : 'Stimmt so'}</button><button class="btn sm ${rot ? 'pri' : ''}" data-act="rv" data-id="korrigiert">Korrigieren</button><button class="btn sm danger" data-act="rv" data-id="gestrichen">Streichen</button></div>
      <div class="note" style="margin-top:5px">${rot ? 'Rot: Jede Entscheidung braucht eine Begründung und eine zweite Person.' : 'Gelb und Stichprobe: kurz mit dem Original vergleichen, dann ein Klick.'}</div>`;
  }
  return h;
}
function vDokument(d) {
  if (!d) return '';
  const offen = S.role !== 'revision' && darfSehen(S.role, d);
  if (S.role === 'revision') return `<h2>${esc(d.name)}</h2><div class="alert b">Die Revision sieht nur Stammdaten und das Protokoll, keine Inhalte.</div><div class="mono">Fingerabdruck (SHA-256): ${esc(d.hash)}</div>`;
  if (!offen) {
    const q = S.anfragen.find(x => x.doc === d.id && x.von === S.role && x.status === 'offen');
    let h = `<h2>🔒 Vertrauliches Dokument</h2><div class="alert r">Für dich gesperrt. Auch die KI bekommt dieses Dokument nicht, wenn du fragst.</div>`;
    if (q) return h + `<div class="alert y">Deine Anfrage liegt bei ${esc(NUTZER[EIGENTUEMER].name)}. Nur sie wird benachrichtigt.</div>`;
    return h + `<h3>Zugriff anfragen</h3><div class="note">Die Anfrage geht an genau eine verantwortliche Person: <b>${esc(NUTZER[EIGENTUEMER].name)}</b>.</div>
      <label class="note">Wofür brauchst du das Dokument? (Pflicht)</label><textarea id="qbegr" placeholder="z. B. Kreditprüfung Nordwerk: Die Richtlinie verlangt die Feststellungen des Abschlussprüfers."></textarea><div class="err hidden" id="qErr">Bitte eine Begründung eingeben.</div>
      <label class="note">Wie lange?</label><br><select id="qdauer"><option value="1">1 Tag</option><option value="7" selected>7 Tage</option></select>
      <div style="margin-top:8px"><button class="btn pri" data-act="anfrage">Anfrage senden</button></div>`;
  }
  const r = S.run;
  let h = `<h2>${esc(d.name)}</h2><div class="chips" style="margin-bottom:8px"><span class="chip ${d.stufe}">${STUFE[d.stufe]}</span><span class="chip">Version ${d.ver}</span><span class="chip">${d.sections.length} Abschnitte</span></div>
    <div class="mono">Fingerabdruck (SHA-256): ${esc(d.hash)}</div><div class="note">Ändert sich die Datei, ändert sich der Fingerabdruck. So ist belegbar, welche Fassung die KI gelesen hat.</div><h3>Inhalt in Abschnitten</h3>`;
  d.sections.forEach(s => {
    const k1 = r && r.bereitK1 && r.bereitK1.includes(s.id), zit = r && r.claims && r.claims.some(c => c.check.belege.some(b => b.abschnitt === s.id && b.status !== 'fail'));
    h += `<div class="secbox"><div class="lb"><span>Seite ${s.page}</span>${r && r.claims ? `<span class="chip">${k1 ? 'der KI bereitgestellt' : 'nicht bereitgestellt'}</span>${zit ? '<span class="chip or">zitiert</span>' : ''}` : ''}</div>${esc(s.text)}</div>`;
  });
  return h;
}

function vAnfragen() {
  let h = '<h2>Zugriffsanfragen</h2>';
  if (S.role === EIGENTUEMER) {
    if (!S.anfragen.length) h += '<div class="empty">Keine Anfragen.</div>';
    S.anfragen.slice().reverse().forEach(q => {
      const d = docById(q.doc);
      h += `<div class="secbox"><div class="lb"><span>${esc(NUTZER[q.von].name)} (${esc(NUTZER[q.von].rolle)})</span><span>${esc(d ? d.name : q.doc)}</span><span>${q.dauer} Tag(e)</span></div><b>Begründung:</b> ${esc(q.begr)}
        ${q.status === 'offen' ? `<div style="margin-top:7px;display:flex;gap:6px"><button class="btn sm pri" data-act="qok" data-id="${q.id}">Befristet freigeben</button><button class="btn sm danger" data-act="qno" data-id="${q.id}">Ablehnen</button></div>` : `<div style="margin-top:6px"><span class="pill ${q.status === 'freigegeben' ? 'grün' : 'rot'}">${q.status}</span></div>`}</div>`;
    });
    h += '<div class="note">Benachrichtigt wird nur die verantwortliche Person, nicht alle Kolleg:innen. So ist die Zuständigkeit klar, und niemand wird bloßgestellt.</div>';
  } else {
    const mine = S.anfragen.filter(q => q.von === S.role);
    if (!mine.length) h += '<div class="empty">Keine eigenen Anfragen. Gesperrte Dokumente (🔒) links anklicken, um Zugriff anzufragen.</div>';
    mine.slice().reverse().forEach(q => { h += `<div class="secbox"><div class="lb"><span>an ${esc(NUTZER[EIGENTUEMER].name)}</span><span>${q.dauer} Tag(e)</span></div>${esc(q.begr)} <span class="pill ${q.status === 'freigegeben' ? 'grün' : q.status === 'offen' ? 'gelb' : 'rot'}">${q.status}</span></div>`; });
  }
  return h;
}
function vProtokoll() {
  let h = `<h2>Protokoll</h2><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button class="btn pri sm" data-act="verify">Echtheit prüfen</button><button class="btn sm danger" data-act="tamper">Test: Eintrag heimlich ändern</button><button class="btn sm" data-act="export">Belegpaket speichern</button></div>`;
  if (verify) h += verify.ok ? `<div class="alert g">✓ Alle ${S.log.length} Siegel passen (${verify.zeit}). ${esc(verify.hinweis)}</div>` : `<div class="alert r">✗ Ab Eintrag ${verify.first} passen die Siegel nicht mehr. Dort wurde nachträglich etwas verändert. ${esc(verify.hinweis)}</div>`;
  h += '<div class="note" style="margin-bottom:8px">Jeder Eintrag ist mit dem vorherigen versiegelt. Das Siegel berechnet der Server mit einem geheimen Schlüssel. Wer einen Eintrag ändert, bricht die Kette.</div>';
  if (!S.log.length) return h + '<div class="empty">Noch keine Einträge.</div>';
  h += '<div style="max-height:560px;overflow:auto"><table><tr><th>#</th><th>Zeit</th><th>Wer</th><th>Was</th><th>Details</th><th>Siegel</th></tr>' +
    S.log.map(e => `<tr class="${verify && !verify.ok && e.nr >= verify.first ? 'broken' : ''}"><td>${e.nr}</td><td>${new Date(e.zeit).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td>${esc(e.akteur)}</td><td>${esc(e.aktion)}</td><td>${esc(e.details)}</td><td class="h" title="${e.hash}">${e.hash.slice(0, 8)}…${e.art === 'lokal' ? ' (lokal)' : ''}</td></tr>`).join('') + '</table></div>';
  return h;
}

/* ---------- Aktionen ---------- */
const AKT = {
  tab: id => { S.tab = id; save(); renderTabs(); renderMain(); },
  doc: id => { S.selDoc = id; S.sel = null; renderLinks(); renderRechts(); },
  claim: id => { const c = S.run.claims.find(x => x.id === id); if (!c || !sichtbar(c)) return; S.sel = id; S.selDoc = null; renderLinks(); renderMain(); renderRechts(); },
  beispiele: () => ladeBeispiele(),
  fragen: () => { const f = $('frage').value.trim(); if (!f) { $('frageErr').classList.remove('hidden'); return; } fragen(f); },
  zweck: () => { S.run.zweck = 'entscheidung'; log(me().name, 'Zweck geändert', 'Antwort soll für eine Entscheidung verwendet werden'); save(); render(); },
  rv: aktion => {
    const c = S.run.claims.find(x => x.id === S.sel), begr = $('begr').value.trim(), korr = $('korr').value.trim(), err = $('rvErr');
    const zeig = t => { err.textContent = t; err.classList.remove('hidden'); };
    if ((c.ampel === 'rot' || aktion !== 'bestätigt') && !begr) return zeig('Bitte kurz begründen.');
    if (aktion === 'korrigiert' && (!korr || korr === c.text)) return zeig('Bitte die berichtigte Aussage eintragen.');
    S.reviews[c.id] = { aktion, text: korr, begr, by: S.role };
    log(me().name, `Aussage ${c.id} ${aktion}`, (aktion === 'korrigiert' ? `neu: „${korr}“ · ` : '') + `KI-Original: „${c.text}“ · Ampel: ${c.ampel}` + (begr ? ` · Begründung: ${begr}` : ''));
    const next = S.run.claims.find(x => pflicht(x) && !S.reviews[x.id] && sichtbar(x));
    if (next) S.sel = next.id;
    save(); render();
  },
  undo: () => { const id = S.sel; delete S.reviews[id]; log(me().name, `Entscheidung zu ${id} zurückgenommen`, ''); save(); render(); },
  einreichen: () => { const zw = brauchtZweit(S.run); S.submit = { by: S.role, status: zw ? 'wartet' : 'frei', zweit: false }; log(me().name, zw ? 'An zweite Person weitergegeben' : 'Antwort freigegeben', `${Object.keys(S.reviews).length} Entscheidungen`); save(); render(); },
  zweit: () => { S.submit.status = 'frei'; S.submit.zweit = true; log(me().name, 'Zweitfreigabe erteilt', 'Vier-Augen-Prinzip erfüllt'); save(); render(); },
  zurueck: () => { S.submit = null; log(me().name, 'Zurückgegeben', 'Antwort geht zur Überarbeitung zurück'); save(); render(); },
  anfrage: () => {
    const begr = $('qbegr').value.trim(); if (!begr) { $('qErr').classList.remove('hidden'); return; }
    const q = { id: S.anfragen.length + 1, von: S.role, doc: S.selDoc, begr, dauer: +$('qdauer').value, status: 'offen' };
    S.anfragen.push(q); log(me().name, 'Zugriff angefragt', `Dokument ${q.doc} · an ${NUTZER[EIGENTUEMER].name} · ${q.dauer} Tag(e) · Begründung: ${begr}`); save(); render();
  },
  qok: id => { const q = S.anfragen.find(x => x.id == id); q.status = 'freigegeben'; const bis = Date.now() + q.dauer * 864e5; S.freigaben.push({ nutzer: q.von, doc: q.doc, bis }); log(me().name, 'Zugriff freigegeben', `Dokument ${q.doc} für ${NUTZER[q.von].name} bis ${new Date(bis).toLocaleDateString('de-DE')}`); save(); render(); },
  qno: id => { const q = S.anfragen.find(x => x.id == id); q.status = 'abgelehnt'; log(me().name, 'Zugriff abgelehnt', `Dokument ${q.doc} für ${NUTZER[q.von].name}`); save(); render(); },
  verify: () => pruefeKette(),
  tamper: async () => { await kette; const e = S.log[Math.max(0, Math.floor(S.log.length / 2) - 1)]; if (!e) return; e.details = (e.details + ' [nachträglich geändert]').slice(0, 700); verify = null; save(); renderMain(); },
  export: async () => {
    await kette;
    const r = S.run;
    const paket = { erstellt: new Date().toISOString(), hinweis: 'Belegpaket aus dem Evidence-Prototyp (Hochschulprojekt).', kettenstand: S.log.length ? S.log[S.log.length - 1].hash : null,
      dokumente: S.docs.map(d => ({ id: d.id, datei: d.datei, version: d.ver, stufe: STUFE[d.stufe], sha256: d.hash, fruehere: d.verlauf || [] })),
      vorgang: r && r.claims ? { frage: r.frage, von: NUTZER[r.by].name, modellAssistent: r.modellK1, modellPruefer: r.modellK2, prompt: r.prompt, regeln: r.regeln,
        aussagen: r.claims.map(c => ({ id: c.id, typ: c.typEffektiv, text: c.text, belege: c.check.belege.map(b => ({ abschnitt: b.abschnitt, zitat: b.zitat, status: b.status })), rechnung: c.check.rechnung, pruefer: c.pruefer.urteil, ampel: c.ampel, gruende: c.gruende, mensch: S.reviews[c.id] || null })), freigabe: S.submit } : null,
      protokoll: S.log };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(paket, null, 2)], { type: 'application/json' })); a.download = 'evidence-belegpaket.json'; a.click();
    log(me().name, 'Belegpaket gespeichert', 'Kettenstand ' + (paket.kettenstand || '').slice(0, 16) + '…');
  },
  reset: () => { if (window.confirm('Alle Dokumente, Antworten und das Protokoll in diesem Browser löschen?')) { localStorage.removeItem(KEY); location.reload(); } }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const f = AKT[el.dataset.act];
  if (f) f(el.dataset.id);
});
document.addEventListener('change', async e => {
  if (e.target.id === 'role') {
    S.role = e.target.value; S.selDoc = null; verify = null;
    if (S.role === 'revision') S.tab = 'protokoll';
    else if (S.role === EIGENTUEMER && S.anfragen.some(q => q.status === 'offen')) S.tab = 'anfragen';
    else if (S.tab !== 'protokoll') S.tab = 'assistent';
    log(me().name, 'Anmeldung', me().rolle); save(); render();
  } else if (e.target.name === 'zweck') { S.zweck = e.target.value; save(); }
  else if (e.target.id === 'upFile' && e.target.files[0]) {
    const stufe = $('upStufe').value, file = e.target.files[0];
    upInfo = 'Datei wird gelesen …'; renderLinks();
    try { const d = await ladeDatei(file, stufe); upInfo = `✓ ${d.name}: ${d.sections.length} Abschnitte gelesen.`; S.selDoc = d.id; S.sel = null; }
    catch (x) { upInfo = x.message; }
    render();
  }
});
document.addEventListener('input', e => { if (['begr', 'korr'].includes(e.target.id)) { const x = $('rvErr'); if (x) x.classList.add('hidden'); } if (e.target.id === 'qbegr') $('qErr').classList.add('hidden'); if (e.target.id === 'frage') $('frageErr').classList.add('hidden'); });

/* ---------- Start ---------- */
(async () => {
  load(); render();
  try { const r = await fetch('/api/status'); if (!r.ok) throw 0; server = Object.assign({ erreichbar: true }, await r.json()); } catch (e) { server = { erreichbar: false, ki: false }; }
  if (!S.log.length) log(me().name, 'Anmeldung', me().rolle);
  render();
})();
