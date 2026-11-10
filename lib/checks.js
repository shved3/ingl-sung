// CODE-CHECK: prüft alles, was sich eindeutig nachschlagen und nachrechnen lässt.
const T = require('./text');

const TYPEN = ['fakt', 'berechnung', 'schlussfolgerung', 'luecke', 'allgemein'];

function normTyp(t, hatBeleg) {
  const s = String(t || '').toLowerCase().replace('ü', 'ue');
  if (s.startsWith('fakt')) return 'fakt';
  if (s.startsWith('berech') || s.startsWith('rechn')) return 'berechnung';
  if (s.startsWith('schluss') || s.startsWith('bewert') || s.startsWith('interpret')) return 'schlussfolgerung';
  if (s.startsWith('lue') || s.startsWith('luck') || s.startsWith('fehl')) return 'luecke';
  if (s.startsWith('allg')) return 'allgemein';
  return hatBeleg ? 'fakt' : 'allgemein';
}

// Bringt die Rohantwort von KI 1 in eine feste Form. IDs vergibt das Programm, nicht die KI.
function normalisiereAussagen(raw) {
  const list = Array.isArray(raw) ? raw : (raw && (raw.aussagen || raw.claims || raw.statements)) || [];
  return list.slice(0, 25).map((a, i) => {
    const belege = (Array.isArray(a.belege) ? a.belege : []).slice(0, 6).map(b => ({
      abschnitt: String(b.abschnitt || b.id || '').trim(),
      zitat: String(b.zitat || b.quote || '')
    })).filter(b => b.abschnitt);
    let rechnung = null;
    if (a.rechnung && typeof a.rechnung === 'object') {
      rechnung = {
        art: String(a.rechnung.art || '').toLowerCase(),
        werte: (Array.isArray(a.rechnung.werte) ? a.rechnung.werte : []).slice(0, 12).map(w => ({
          abschnitt: String(w.abschnitt || '').trim(), zitat: String(w.zitat || '')
        })),
        ergebnis: String(a.rechnung.ergebnis == null ? '' : a.rechnung.ergebnis)
      };
    }
    const basis = (Array.isArray(a.basis) ? a.basis : []).map(x => {
      const n = parseInt(String(x).replace(/\D/g, ''), 10);
      return isFinite(n) ? 'A' + n : null;
    }).filter(Boolean);
    return {
      id: a.id && /^A\d+$/.test(a.id) ? a.id : 'A' + (i + 1),
      typ: normTyp(a.typ, belege.length > 0),
      text: T.squash(a.text || a.aussage || '').slice(0, 600),
      belege, rechnung, basis,
      wichtig: a.wichtig === true
    };
  }).filter(a => a.text);
}

const NEG = ['nicht', 'kein', 'keine', 'keinen', 'keiner', 'keinem', 'nie', 'weder'];
const EINSCHR = ['sofern', 'vorbehaltlich', 'ausgenommen', 'außer', 'nach berücksichtigung', 'unter der voraussetzung',
  'es sei denn', 'soweit', 'lediglich', 'bis auf', 'maßgeblich', 'nur wenn', 'bereinigt', 'vorläufig', 'ungeprüft'];

function pruefeBeleg(b, ctx) {
  const sec = ctx.abschnitte[b.abschnitt];
  const r = { abschnitt: b.abschnitt, zitat: b.zitat, status: 'fail', fehler: null };
  if (!sec) { r.fehler = 'Diese Quelle gibt es nicht.'; return r; }
  r.docId = sec.docId; r.seite = sec.seite; r.stufe = sec.stufe;
  if (!ctx.erlaubt.has(b.abschnitt)) { r.fehler = 'Quelle ist für diese Person nicht freigegeben.'; return r; }
  if (ctx.bereitgestellt && !ctx.bereitgestellt.has(b.abschnitt)) { r.fehler = 'Dieser Abschnitt wurde der KI gar nicht gegeben.'; return r; }
  const f = T.findQuote(sec.text, b.zitat);
  r.status = f.status; r.start = f.start; r.end = f.end; r.score = f.score;
  if (f.status === 'fail') r.fehler = 'Das Zitat steht nicht in diesem Abschnitt.';
  return r;
}

function pruefeRechnung(re, ctx) {
  const out = { art: re.art, ergebnisKI: re.ergebnis, ok: null, text: '', fehler: null, werte: [] };
  const vals = [];
  for (const w of re.werte) {
    const b = pruefeBeleg(w, ctx);
    const nums = T.numbersIn(w.zitat);
    out.werte.push({ ...b, zahl: nums[0] ? nums[0].raw : null });
    if (b.status === 'fail') { out.ok = false; out.fehler = 'Ein Rechenwert ist nicht belegt: ' + (b.fehler || ''); return out; }
    if (!nums.length) { out.fehler = 'Rechenwert enthält keine lesbare Zahl.'; return out; }
    vals.push(nums[0]);
  }
  const erg = T.numbersIn(re.ergebnis)[0];
  if (!erg) { out.fehler = 'Ergebnis der KI ist nicht lesbar.'; return out; }
  const v = vals.map(x => x.scaled);
  let calc = null, percent = false, formel = '';
  const raw = vals.map(x => x.raw);
  const art = re.art;
  if (/(veraender|veränder|wachstum|steiger|rueckgang|rückgang)/.test(art) && v.length === 2 && v[0] !== 0) {
    calc = (v[1] - v[0]) / Math.abs(v[0]) * 100; percent = true; formel = `(${raw[1]} − ${raw[0]}) ÷ ${raw[0]}`;
  } else if (/(anteil|quote)/.test(art) && v.length === 2 && v[1] !== 0) {
    calc = v[0] / v[1] * 100; percent = true; formel = `${raw[0]} ÷ ${raw[1]}`;
  } else if (/summe/.test(art) && v.length >= 2) {
    calc = v.reduce((a, b) => a + b, 0); formel = raw.join(' + ');
  } else if (/differenz/.test(art) && v.length === 2) {
    calc = v[0] - v[1]; formel = `${raw[0]} − ${raw[1]}`;
  } else if (/(quotient|verhaeltnis|verhältnis)/.test(art) && v.length === 2 && v[1] !== 0) {
    calc = v[0] / v[1]; formel = `${raw[0]} ÷ ${raw[1]}`;
  } else if (/durchschnitt|mittel/.test(art) && v.length >= 2) {
    calc = v.reduce((a, b) => a + b, 0) / v.length; formel = `(${raw.join(' + ')}) ÷ ${v.length}`;
  }
  if (calc === null) { out.fehler = 'Diese Rechenart kann das Programm nicht nachrechnen.'; return out; }
  out.formel = formel;
  out.ergebnisCode = T.fmtNum(calc, percent);
  out.calc = calc; out.percent = percent;
  if (percent) {
    const k = erg.percent || !erg.hasUnit ? erg.value : NaN;
    out.ok = Math.abs(Math.abs(k) - Math.abs(calc)) <= 0.5;
  } else {
    out.ok = T.near(erg.scaled, calc, 0.01) || (!erg.hasUnit && vals.some(x => x.hasUnit) && T.near(erg.value * (vals.find(x => x.hasUnit).scaled / vals.find(x => x.hasUnit).value), calc, 0.01));
  }
  out.text = `${formel} = ${out.ergebnisCode}`;
  if (!out.ok) out.fehler = `Nachgerechnet ergibt sich ${out.ergebnisCode}, die KI nennt ${re.ergebnis}.`;
  return out;
}

// Prüft eine Aussage. ctx: { abschnitte: {id:{text,docId,docName,seite,stufe}}, erlaubt:Set, bereitgestellt:Set, alle: [aussagen] }
function pruefeAussage(a, ctx) {
  const punkte = [];   // [status, text] status: ok | no | wa
  const hinweise = []; // führen zu Gelb
  let ok = true;
  const fehler = t => { ok = false; punkte.push(['no', t]); };
  let typEffektiv = a.typ;

  const belege = a.belege.map(b => pruefeBeleg(b, ctx));
  const gefunden = belege.filter(b => b.status !== 'fail');

  if (a.typ === 'luecke') {
    punkte.push(['ok', 'Die KI erfindet nichts, sondern meldet eine Lücke.']);
  } else if (a.typ === 'allgemein') {
    punkte.push(['wa', 'Für diese Aussage gibt es keinen Beleg aus den Dokumenten.']);
  } else if (!belege.length && !(a.typ === 'schlussfolgerung' && a.basis.length) && !(a.typ === 'berechnung' && a.rechnung)) {
    fehler('Die Aussage hat keinen Beleg.');
  }

  belege.forEach(b => {
    const wo = b.docId ? `${ctx.abschnitte[b.abschnitt].docName}, Seite ${b.seite}` : b.abschnitt;
    if (b.status === 'ok') punkte.push(['ok', `Zitat steht wörtlich im Original (${wo}).`]);
    else if (b.status === 'norm') punkte.push(['ok', `Zitat gefunden, nur die Schreibweise weicht ab (${wo}).`]);
    else if (b.status === 'fuzzy') {
      punkte.push(['wa', `Zitat nur ungefähr gefunden (${Math.round(b.score * 100)} % Übereinstimmung, ${wo}).`]);
      hinweise.push('Ein Zitat stimmt nicht wörtlich mit dem Original überein.');
    } else fehler(`${b.fehler} (${wo})`);
  });

  // Rechnung nachrechnen
  let rechnung = null;
  if (a.rechnung) {
    rechnung = pruefeRechnung(a.rechnung, ctx);
    if (rechnung.ok === true) punkte.push(['ok', `Nachgerechnet: ${rechnung.text}. Stimmt mit der KI überein.`]);
    else if (rechnung.ok === false) fehler(rechnung.fehler);
    else { punkte.push(['wa', rechnung.fehler]); hinweise.push('Die Rechnung konnte nicht automatisch nachgerechnet werden.'); }
  }

  // Jede Zahl braucht eine Herkunft
  if (a.typ !== 'luecke' && a.typ !== 'allgemein') {
    const pool = [];
    const add = t => T.numbersIn(t).forEach(n => pool.push(n));
    const quellen = new Set();
    gefunden.forEach(b => quellen.add(b.abschnitt));
    if (rechnung) rechnung.werte.forEach(w => { if (w.status !== 'fail') quellen.add(w.abschnitt); });
    (a.basis || []).forEach(id => {
      const o = (ctx.alle || []).find(x => x.id === id);
      if (!o) return;
      add(o.text);
      o.belege.forEach(b => { if (ctx.abschnitte[b.abschnitt] && ctx.erlaubt.has(b.abschnitt)) quellen.add(b.abschnitt); });
    });
    quellen.forEach(id => { add(ctx.abschnitte[id].text); add(ctx.abschnitte[id].docName); });
    if (rechnung && rechnung.calc != null) {
      [0, 1, 2].forEach(d => {
        const f = Math.pow(10, d), v = Math.round(rechnung.calc * f) / f;
        pool.push({ value: v, scaled: v, hasUnit: false, percent: rechnung.percent });
        pool.push({ value: Math.abs(v), scaled: Math.abs(v), hasUnit: false, percent: rechnung.percent });
      });
      if (rechnung.ok === false) add(a.rechnung.ergebnis); // Fehler wird schon bei der Rechnung gemeldet
    }
    const ohne = T.numbersIn(a.text).filter(n => !T.numberBacked(n, pool));
    if (ohne.length) {
      const liste = ohne.map(n => n.raw).join(', ');
      if (a.typ === 'schlussfolgerung') {
        punkte.push(['wa', `Zahl ohne Herkunft in den Belegen: ${liste}.`]);
        hinweise.push(`Zahl ohne klare Herkunft: ${liste}.`);
      } else fehler(`Zahl ohne Herkunft: ${liste} steht in keinem Beleg und stammt aus keiner nachgerechneten Rechnung.`);
    } else if (T.numbersIn(a.text).length) {
      punkte.push(['ok', 'Alle Zahlen der Aussage stehen im Beleg oder wurden nachgerechnet.']);
    }
  }

  // Warnwörter: Verneinung oder Einschränkung im Original, die in der Aussage fehlt
  const aus = ' ' + T.tokens(a.text).map(x => x.t).join(' ') + ' ';
  const warn = new Set();
  gefunden.forEach(b => {
    const txt = ctx.abschnitte[b.abschnitt].text;
    const zitat = ' ' + T.tokens(txt.slice(b.start, b.end)).map(x => x.t).join(' ') + ' ';
    const umfeld = ' ' + T.tokens(txt.slice(Math.max(0, b.start - 150), Math.min(txt.length, b.end + 150))).map(x => x.t).join(' ') + ' ';
    if (NEG.some(w => zitat.includes(' ' + w + ' ')) && !NEG.some(w => aus.includes(' ' + w + ' '))) warn.add('Verneinung');
    EINSCHR.forEach(w => { if (umfeld.includes(' ' + w + ' ') && !aus.includes(' ' + w + ' ')) warn.add('„' + w + '“'); });
  });
  if (warn.size) {
    const l = [...warn].join(', ');
    punkte.push(['wa', `Im Original steht eine Einschränkung, die in der Aussage fehlt: ${l}.`]);
    hinweise.push(`Mögliche Einschränkung im Original übersehen (${l}).`);
  }

  // Ein "Fakt" muss nah am Wortlaut sein, sonst ist es eine Interpretation
  if (a.typ === 'fakt' && gefunden.length) {
    const ev = gefunden.map(b => ctx.abschnitte[b.abschnitt].text).join(' ');
    const cov = T.coverage(a.text, ev);
    if (cov < 0.5) {
      typEffektiv = 'interpretation';
      punkte.push(['wa', 'Die Aussage weicht stark vom Wortlaut ab. Sie gilt deshalb als Interpretation, nicht als Fakt.']);
    }
  }

  const stufen = [...new Set(gefunden.map(b => b.stufe))];
  const docs = [...new Set(belege.filter(b => b.docId).map(b => b.docId).concat(rechnung ? rechnung.werte.filter(w => w.docId).map(w => w.docId) : []))];
  return { ok, punkte, hinweise, belege, rechnung, typEffektiv, stufen, docs };
}

function pruefeAlle(aussagen, ctx) {
  const c = { ...ctx, alle: aussagen };
  return aussagen.map(a => ({ ...a, check: pruefeAussage(a, c) }));
}

// Sucht die passendsten Abschnitte (einfache Stichwortsuche). Kleine Dokumentmengen werden komplett übergeben.
function sucheAbschnitte(anfrage, abschnittsListe, budget) {
  const gesamt = abschnittsListe.reduce((s, x) => s + x.text.length, 0);
  if (gesamt <= budget) return { ids: abschnittsListe.map(x => x.id), vollstaendig: true };
  const q = [...new Set(T.contentTokens(anfrage).map(T.stem))];
  const N = abschnittsListe.length;
  const df = {};
  const toks = abschnittsListe.map(s => {
    const t = T.contentTokens(s.text + ' ' + s.docName).map(T.stem);
    new Set(t).forEach(x => { df[x] = (df[x] || 0) + 1; });
    return t;
  });
  const scored = abschnittsListe.map((s, i) => {
    let sc = 0;
    const tf = {};
    toks[i].forEach(x => { tf[x] = (tf[x] || 0) + 1; });
    q.forEach(w => { if (tf[w]) sc += Math.log(1 + N / df[w]) * (1 + Math.log(tf[w])); });
    return { id: s.id, sc, len: s.text.length, i };
  }).sort((a, b) => b.sc - a.sc || a.i - b.i);
  const ids = [];
  let used = 0;
  for (const s of scored) {
    if (used + s.len > budget) continue;
    ids.push(s.id); used += s.len;
  }
  const order = new Map(abschnittsListe.map((s, i) => [s.id, i]));
  ids.sort((a, b) => order.get(a) - order.get(b));
  return { ids, vollstaendig: false };
}

module.exports = { TYPEN, normalisiereAussagen, pruefeAussage, pruefeAlle, pruefeBeleg, sucheAbschnitte };
