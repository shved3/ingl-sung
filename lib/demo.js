// DEMO-MODUS (nur ohne API-Schlüssel und nur für die mitgelieferten Beispieldokumente):
// Liefert eine vorbereitete "KI-Antwort" mit absichtlich eingebauten Fehlern, passend zu Stichwörtern der Frage.
// Code-Check, Ampel, Rechte und Protokoll laufen trotzdem echt.

function istBeispiel(docs) {
  return docs.some(d => d.id === 'B1' && d.beispiel) && docs.some(d => d.id === 'B2' && d.beispiel);
}

const T = {
  firma: 'Nordwerk entwickelt und fertigt Verpackungsmaschinen für die Lebensmittelindustrie.',
  umsatz: 'Der Umsatz lag 2024 bei 8,0 Mio. Euro und 2025 bei 9,2 Mio. Euro.',
  wachstum: 'Der Umsatz ist um 20 % gestiegen.',
  quote: 'Die Eigenkapitalquote beträgt zum 31.12.2025 34 %.',
  erfuellt: 'Nordwerk erfüllt die Mindest-Eigenkapitalquote von 30 % der Kreditrichtlinie.',
  buerg: 'Die Kreditrichtlinie verlangt zusätzlich eine Bürgschaft der Gesellschafter.',
  auftrag: 'In den durchsuchten Abschnitten wurde keine Angabe zum Auftragsbestand für 2026 gefunden.',
  berichtJa: 'Laut Prüfungsbericht wurde für einen laufenden Rechtsstreit keine Rückstellung gebildet; das Risiko wird auf 0,7 Mio. Euro geschätzt.',
  berichtNein: 'In den durchsuchten Abschnitten wurde kein Bericht des Abschlussprüfers gefunden. Dazu liegen mir keine Unterlagen vor.'
};

function assistent(frage, bereitgestellt) {
  const f = String(frage || '').toLowerCase();
  const hatBericht = bereitgestellt && bereitgestellt.has('B3:v1:s1');
  const alle = [
    { k: 'firma', wenn: /herstell|stellt|produ|geschäft|tätig|branche|was macht|wer ist/, typ: 'fakt', text: T.firma,
      belege: [{ abschnitt: 'B1:v1:s1', zitat: 'entwickelt und fertigt Verpackungsmaschinen für die Lebensmittelindustrie' }] },
    { k: 'umsatz', wenn: /umsatz|wachs|gewachsen|entwick/, typ: 'fakt', text: T.umsatz,
      belege: [{ abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse Vorjahr (2024): 8.0 Mio. Euro' }, { abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse aktuelles Jahr (2025): 9,2 Mio. Euro' }] },
    { k: 'wachstum', wenn: /umsatz|wachs|gewachsen|entwick/, typ: 'berechnung', text: T.wachstum, wichtig: true,
      belege: [{ abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse aktuelles Jahr (2025): 9,2 Mio. Euro' }],
      rechnung: { art: 'veraenderung_prozent', werte: [{ abschnitt: 'B1:v1:s2', zitat: '8,0 Mio. Euro' }, { abschnitt: 'B1:v1:s2', zitat: '9,2 Mio. Euro' }], ergebnis: '20 %' } },
    { k: 'quote', wenn: /eigenkapital|quote|mindest|erfüll/, typ: 'fakt', text: T.quote,
      belege: [{ abschnitt: 'B1:v1:s3', zitat: 'Die Eigenkapitalquote beträgt damit 34 %.' }] },
    { k: 'erfuellt', wenn: /eigenkapital|quote|mindest|erfüll/, typ: 'schlussfolgerung', text: T.erfuellt, wichtig: true, basisK: ['quote'],
      belege: [{ abschnitt: 'B2:v1:s1', zitat: 'gilt eine Mindest-Eigenkapitalquote von 30 %' }] },
    { k: 'buerg', wenn: /sicherheit|bürgschaft|verlangt/, typ: 'fakt', text: T.buerg,
      belege: [{ abschnitt: 'B2:v1:s3', zitat: 'Zusätzlich ist eine Gesellschafterbürgschaft erforderlich.' }] },
    { k: 'auftrag', wenn: /auftrag/, typ: 'luecke', text: T.auftrag, belege: [] },
    hatBericht
      ? { k: 'bericht', wenn: /prüfungsbericht|abschlussprüfer|rechtsstreit|rückstellung/, nurWenn: true, typ: 'fakt', text: T.berichtJa,
          belege: [{ abschnitt: 'B3:v1:s1', zitat: 'wurde keine Rückstellung gebildet; wir schätzen das Risiko auf 0,7 Mio. Euro' }] }
      : { k: 'bericht', wenn: /prüfungsbericht|abschlussprüfer|rechtsstreit|rückstellung/, nurWenn: true, typ: 'luecke', text: T.berichtNein, belege: [] }
  ];
  let wahl = alle.filter(a => a.wenn.test(f));
  if (!wahl.length) wahl = alle.filter(a => !a.nurWenn);
  const pos = {};
  wahl.forEach((a, i) => { pos[a.k] = i + 1; });
  return { aussagen: wahl.map(a => ({ typ: a.typ, text: a.text, belege: a.belege, rechnung: a.rechnung || null, wichtig: !!a.wichtig,
    basis: (a.basisK || []).map(k => pos[k]).filter(Boolean) })) };
}

function pruefer(aussagen, bereitgestellt) {
  const hatBericht = bereitgestellt.has('B3:v1:s1');
  const u = {};
  u[T.firma] = { urteil: 'gestuetzt', begruendung: 'Die Stelle beschreibt das Geschäft von Nordwerk genau so.' };
  u[T.umsatz] = { urteil: 'gestuetzt', begruendung: 'Beide Werte stehen in der Gewinn- und Verlustrechnung.' };
  u[T.wachstum] = { urteil: 'widersprochen', begruendung: 'Aus 8,0 und 9,2 Mio. Euro ergibt sich ein Wachstum von 15 %, nicht 20 %.',
    korrektur: 'Der Umsatz ist um 15 % gestiegen (von 8,0 auf 9,2 Mio. Euro).' };
  u[T.quote] = { urteil: 'gestuetzt', begruendung: 'Die Quote steht wörtlich in der Bilanz und passt zu Eigenkapital und Bilanzsumme.' };
  u[T.erfuellt] = hatBericht
    ? { urteil: 'widersprochen', begruendung: 'Die Richtlinie verlangt die Quote nach den Feststellungen des Abschlussprüfers. Laut Prüfungsbericht fehlt eine Rückstellung von 0,7 Mio. Euro. Mit dem bereinigten Eigenkapital von 3,55 Mio. Euro liegt die Quote bei 28,4 % und damit unter 30 %.',
        fundstellen: [{ abschnitt: 'B2:v1:s2', zitat: 'Maßgeblich ist die Eigenkapitalquote nach Berücksichtigung wesentlicher Feststellungen des Abschlussprüfers.' },
                      { abschnitt: 'B3:v1:s1', zitat: 'wurde keine Rückstellung gebildet' },
                      { abschnitt: 'B3:v1:s2', zitat: 'ergibt sich ein Eigenkapital von 3,55 Mio. Euro' }],
        korrektur: 'Nach den Feststellungen des Abschlussprüfers liegt die Eigenkapitalquote bei 28,4 % und damit unter der Mindestquote von 30 %. Laut Richtlinie ist eine Einzelfallprüfung durch die Teamleitung erforderlich.' }
    : { urteil: 'nicht_ausreichend', begruendung: 'Die Richtlinie verlangt die Quote nach Berücksichtigung der Feststellungen des Abschlussprüfers. Ein solcher Bericht liegt in den freigegebenen Unterlagen nicht vor.',
        fundstellen: [{ abschnitt: 'B2:v1:s2', zitat: 'Maßgeblich ist die Eigenkapitalquote nach Berücksichtigung wesentlicher Feststellungen des Abschlussprüfers.' }],
        korrektur: 'Die unbereinigte Eigenkapitalquote (34 %) liegt über 30 %. Ob die Mindestquote erfüllt ist, lässt sich erst nach Prüfung der Feststellungen des Abschlussprüfers beurteilen.' };
  u[T.buerg] = { urteil: 'widersprochen', begruendung: 'In der Kreditrichtlinie steht nichts von einer Bürgschaft. Der zitierte Satz existiert nicht.' };
  u[T.auftrag] = { urteil: 'unklar', begruendung: 'Auch die eigene Suche findet keine Zahl. Der Jahresabschluss nennt nur eine allgemeine Erwartung.',
    fundstellen: [{ abschnitt: 'B1:v1:s4', zitat: 'erwartet für 2026 eine stabile Nachfrage' }] };
  u[T.berichtJa] = { urteil: 'gestuetzt', begruendung: 'Die Feststellung steht so im Prüfungsbericht.' };
  u[T.berichtNein] = { urteil: 'unklar', begruendung: 'In den freigegebenen Unterlagen gibt es keinen solchen Bericht.' };
  return { urteile: aussagen.map(a => ({ id: a.id, fundstellen: [], korrektur: null, ...(u[a.text] || { urteil: 'unklar', begruendung: 'Im Demo-Modus nicht geprüft.' }) })) };
}

module.exports = { istBeispiel, assistent, pruefer };
