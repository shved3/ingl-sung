// DER HARNESS: Kontrollschicht um die KI.
// Schritt "assistent": Rechteprüfung -> Suche -> KI 1 -> Code-Check
// Schritt "pruefer":   Code-Check (erneut) -> KI 2 -> Code-Check der Fundstellen -> Ampel
const { body, erlaubt } = require('../lib/http');
const R = require('../lib/regeln');
const C = require('../lib/checks');
const P = require('../lib/prompts');
const KI = require('../lib/openai');
const DEMO = require('../lib/demo');

const BUDGET = () => parseInt(process.env.MAX_ZEICHEN || '48000', 10);

function kontext(b) {
  const docs = (Array.isArray(b.docs) ? b.docs : []).filter(d => d && d.id && Array.isArray(d.sections));
  const nutzer = String(b.nutzer || '');
  const abschnitte = {};
  const erlaubteListe = [];
  let gesperrt = 0;
  // RECHTEPRÜFUNG VOR DER SUCHE: gesperrte Dokumente erreichen die KI nie.
  docs.forEach(d => {
    const ok = R.darfSehen(nutzer, d, b.freigaben, Date.now());
    if (!ok) gesperrt++;
    d.sections.forEach(s => {
      const e = { id: String(s.id), text: String(s.text || ''), seite: s.page || 1, docId: d.id, docName: String(d.name || d.id), stufe: d.stufe };
      abschnitte[e.id] = e;
      if (ok) erlaubteListe.push(e);
    });
  });
  return { docs, nutzer, abschnitte, erlaubteListe, erlaubt: new Set(erlaubteListe.map(s => s.id)), gesperrt };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  if (!erlaubt(req)) return res.status(401).json({ fehler: 'Passwort erforderlich.' });
  const b = body(req);
  const frage = String(b.frage || '').trim().slice(0, 2000);
  if (!frage) return res.status(400).json({ fehler: 'Bitte eine Frage eingeben.' });
  if (!R.NUTZER[b.nutzer]) return res.status(400).json({ fehler: 'Unbekannte Person.' });

  const k = kontext(b);
  if (!k.erlaubteListe.length) return res.status(400).json({ fehler: 'Für diese Person ist kein Dokument freigegeben.' });

  const echt = KI.hatSchluessel();
  const demo = !echt && DEMO.istBeispiel(k.docs);
  if (!echt && !demo) {
    return res.status(503).json({ fehler: 'Es ist noch kein API-Schlüssel hinterlegt (OPENAI_API_KEY). Ohne Schlüssel funktioniert nur der Demo-Modus mit den Beispieldokumenten.' });
  }

  try {
    if (b.schritt === 'assistent') {
      const such = C.sucheAbschnitte(frage, k.erlaubteListe, BUDGET());
      const bereit = such.ids.map(id => k.abschnitte[id]);
      const roh = echt
        ? await KI.frageJSON({ system: P.SYSTEM_ASSISTENT, user: P.userAssistent(frage, bereit), modell: KI.MODELL_ASSISTENT() })
        : DEMO.assistent();
      const aussagen = C.pruefeAlle(C.normalisiereAussagen(roh), { abschnitte: k.abschnitte, erlaubt: k.erlaubt, bereitgestellt: new Set(such.ids) });
      if (!aussagen.length) return res.status(502).json({ fehler: 'Die KI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen.' });
      return res.status(200).json({
        modus: echt ? 'ki' : 'demo',
        modell: echt ? KI.MODELL_ASSISTENT() : 'Demo (vorbereitete Antwort)',
        prompt: P.PROMPT_VERSION, regeln: R.REGELN_VERSION,
        durchsuchbar: [...new Set(k.erlaubteListe.map(s => s.docId))],
        gesperrt: k.gesperrt,
        bereitgestellt: such.ids, vollstaendig: such.vollstaendig,
        abschnitteGesamt: k.erlaubteListe.length,
        aussagen
      });
    }

    if (b.schritt === 'pruefer') {
      const bereitK1 = new Set((Array.isArray(b.bereitgestellt) ? b.bereitgestellt : []).filter(id => k.erlaubt.has(id)));
      const ctx1 = { abschnitte: k.abschnitte, erlaubt: k.erlaubt, bereitgestellt: bereitK1 };
      // Code-Check wird hier erneut berechnet: Dem Browser wird nicht vertraut.
      const aussagen = C.pruefeAlle(C.normalisiereAussagen({ aussagen: b.aussagen }), ctx1);
      if (!aussagen.length) return res.status(400).json({ fehler: 'Keine Aussagen zum Prüfen.' });

      // KI 2 sucht unabhängig: Frage + Aussagen als Suchanfrage
      const such = C.sucheAbschnitte(frage + ' ' + aussagen.map(a => a.text).join(' '), k.erlaubteListe, BUDGET());
      const bereitK2 = new Set(such.ids);
      const roh = echt
        ? await KI.frageJSON({ system: P.SYSTEM_PRUEFER, user: P.userPruefer(frage, aussagen, such.ids.map(id => k.abschnitte[id])), modell: KI.MODELL_PRUEFER() })
        : DEMO.pruefer(aussagen, bereitK2);
      const urteile = Array.isArray(roh.urteile) ? roh.urteile : [];
      const ctx2 = { abschnitte: k.abschnitte, erlaubt: k.erlaubt, bereitgestellt: bereitK2 };

      let ersteGruene = true;
      const fertig = aussagen.map(a => {
        const u = urteile.find(x => String(x.id).toUpperCase() === a.id) || {};
        let urteil = String(u.urteil || '').toLowerCase().replace('ü', 'ue');
        if (!['gestuetzt', 'widersprochen', 'nicht_ausreichend', 'unklar'].includes(urteil)) urteil = 'unklar';
        // Auch die Verweise der Prüfer-KI werden per Code geprüft
        const fund = (Array.isArray(u.fundstellen) ? u.fundstellen : []).slice(0, 6)
          .map(f => C.pruefeBeleg({ abschnitt: String(f.abschnitt || '').trim(), zitat: String(f.zitat || '') }, ctx2));
        const pruefer = {
          urteil,
          begruendung: String(u.begruendung || (u.urteil ? '' : 'Die Prüfer-KI hat zu dieser Aussage kein Urteil geliefert.')).slice(0, 900),
          korrektur: u.korrektur ? String(u.korrektur).slice(0, 600) : null,
          fundstellen: fund.filter(f => f.status !== 'fail'),
          verworfen: fund.filter(f => f.status === 'fail').length
        };
        const stufen = [...new Set(a.check.stufen.concat(pruefer.fundstellen.map(f => f.stufe)))];
        const docs = [...new Set(a.check.docs.concat(pruefer.fundstellen.map(f => f.docId)))];
        const c = { ...a, pruefer, typEffektiv: a.check.typEffektiv, stufen, docs };
        c.katalog = R.katalogTreffer(c);
        const amp = R.ampel(c);
        c.ampel = amp.farbe; c.gruende = amp.gruende;
        c.stichprobe = false;
        if (c.ampel === 'grün') {
          c.stichprobe = echt ? Math.random() < R.STICHPROBE_ANTEIL : ersteGruene;
          ersteGruene = false;
        }
        return c;
      });
      return res.status(200).json({
        modus: echt ? 'ki' : 'demo',
        modell: echt ? KI.MODELL_PRUEFER() : 'Demo (vorbereitete Prüfung)',
        bereitgestellt: such.ids, vollstaendig: such.vollstaendig,
        aussagen: fertig
      });
    }
    return res.status(400).json({ fehler: 'Unbekannter Schritt.' });
  } catch (e) {
    return res.status(502).json({ fehler: e.message || 'Unbekannter Fehler.' });
  }
};
