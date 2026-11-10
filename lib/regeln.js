// FESTE REGELN DER BANK. Diese Datei liegt außerhalb der KI:
// Die KI kann sie weder lesen noch ändern. Änderungen nur durch die
// fachlich Verantwortlichen (Kreditrisikomanagement, Compliance), getestet und protokolliert.

const REGELN_VERSION = '2026-11-10';

// Wer darf welche Vertraulichkeitsstufe sehen? (Aufgabe, nicht Rang)
const NUTZER = {
  lena:     { name: 'Lena Weber',      rolle: 'Kreditberaterin',                         stufen: ['pub', 'int'] },
  jonas:    { name: 'Jonas Krüger',    rolle: 'Teamleiter (Zweitfreigabe)',              stufen: ['pub', 'int', 'sec'] },
  petra:    { name: 'Dr. Petra Haas',  rolle: 'Dateneigentümerin vertrauliche Berichte', stufen: ['pub', 'int', 'sec'] },
  revision: { name: 'Interne Revision', rolle: 'prüft nur das Protokoll',                stufen: [] }
};

// Die KI bekommt nur, was die fragende Person selbst sehen darf.
function darfSehen(nutzerId, doc, freigaben, jetzt) {
  const n = NUTZER[nutzerId];
  if (!n || !doc) return false;
  if (n.stufen.includes(doc.stufe)) return true;
  return (freigaben || []).some(f => f.nutzer === nutzerId && f.doc === doc.id && f.bis > (jetzt || Date.now()));
}

// PFLICHTPRÜF-KATALOG: Trifft eine Regel zu, schaut immer ein Mensch auf die Aussage.
const KATALOG = [
  { id: 'K1', text: 'Schlussfolgerung oder Bewertung der KI',
    trifft: c => c.typEffektiv === 'schlussfolgerung' || c.typEffektiv === 'interpretation' },
  { id: 'K2', text: 'Kreditbedingung oder Richtlinien-Schwelle',
    trifft: c => /(mindest|kreditrichtlinie|covenant|eigenkapitalquote|sicherheiten|bürgschaft|grenzwert|schwelle|kreditwürdig|bonität|rating|verschuldungsgrad|kapitaldienst)/i.test(c.text) },
  { id: 'K3', text: 'Quelle ist streng vertraulich',
    trifft: c => c.stufen.includes('sec') },
  { id: 'K4', text: 'Rechtliches Risiko',
    trifft: c => /(rechtsstreit|klage|sanktion|betrug|insolvenz|geldwäsche|strafverfahren|ermittlung|rückstellung|haftung)/i.test(c.text) },
  { id: 'K5', text: 'Information fehlt',
    trifft: c => c.typEffektiv === 'luecke' },
  { id: 'K6', text: 'Aussage ohne Beleg aus den Dokumenten',
    trifft: c => c.typEffektiv === 'allgemein' },
  { id: 'K7', text: 'Von der KI selbst als wichtig markiert (KI darf nur hochstufen)',
    trifft: c => c.wichtig === true }
];

function katalogTreffer(c) {
  return KATALOG.filter(k => k.trifft(c)).map(k => ({ id: k.id, text: k.text }));
}

// AMPEL nach fester Rangfolge. Die KI bestimmt ihre Ampel nicht selbst.
function ampel(c) {
  const gruende = [];
  if (!c.check.ok) {
    gruende.push('Das Prüfprogramm hat einen Fehler gefunden.');
    return { farbe: 'rot', gruende };
  }
  if (c.pruefer.urteil === 'widersprochen') {
    gruende.push('Die Prüfer-KI widerspricht der Aussage.');
    return { farbe: 'rot', gruende };
  }
  if (c.pruefer.urteil !== 'gestuetzt') gruende.push('Die Prüfer-KI hält die Aussage für nicht ausreichend belegt oder unklar.');
  c.check.hinweise.forEach(h => gruende.push(h));
  c.katalog.forEach(k => gruende.push('Pflichtprüfung: ' + k.text + '.'));
  if (gruende.length) return { farbe: 'gelb', gruende };
  return { farbe: 'grün', gruende: ['Beleg gefunden, Zahlen stimmen, Prüfer-KI stimmt zu, keine Pflichtprüf-Regel trifft zu.'] };
}

const STICHPROBE_ANTEIL = 0.2; // Anteil grüner Aussagen, die trotzdem ein Mensch prüft

module.exports = { REGELN_VERSION, NUTZER, darfSehen, KATALOG, katalogTreffer, ampel, STICHPROBE_ANTEIL };
