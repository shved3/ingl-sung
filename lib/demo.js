// DEMO-MODUS (nur ohne API-Schlüssel und nur für die mitgelieferten Beispieldokumente):
// Liefert eine vorbereitete "KI-Antwort" mit absichtlich eingebauten Fehlern.
// Code-Check, Ampel und Protokoll laufen trotzdem echt.

function istBeispiel(docs) {
  return docs.some(d => d.id === 'B1' && d.beispiel) && docs.some(d => d.id === 'B2' && d.beispiel);
}

function assistent() {
  return { aussagen: [
    { typ: 'fakt', text: 'Nordwerk entwickelt und fertigt Verpackungsmaschinen für die Lebensmittelindustrie.',
      belege: [{ abschnitt: 'B1:v1:s1', zitat: 'entwickelt und fertigt Verpackungsmaschinen für die Lebensmittelindustrie' }] },
    { typ: 'fakt', text: 'Der Umsatz lag 2024 bei 8,0 Mio. Euro und 2025 bei 9,2 Mio. Euro.',
      belege: [{ abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse Vorjahr (2024): 8.0 Mio. Euro' }, { abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse aktuelles Jahr (2025): 9,2 Mio. Euro' }] },
    { typ: 'berechnung', text: 'Der Umsatz ist um 20 % gestiegen.',
      belege: [{ abschnitt: 'B1:v1:s2', zitat: 'Umsatzerlöse aktuelles Jahr (2025): 9,2 Mio. Euro' }],
      rechnung: { art: 'veraenderung_prozent', werte: [{ abschnitt: 'B1:v1:s2', zitat: '8,0 Mio. Euro' }, { abschnitt: 'B1:v1:s2', zitat: '9,2 Mio. Euro' }], ergebnis: '20 %' }, wichtig: true },
    { typ: 'fakt', text: 'Die Eigenkapitalquote beträgt zum 31.12.2025 34 %.',
      belege: [{ abschnitt: 'B1:v1:s3', zitat: 'Die Eigenkapitalquote beträgt damit 34 %.' }] },
    { typ: 'schlussfolgerung', text: 'Nordwerk erfüllt die Mindest-Eigenkapitalquote von 30 % der Kreditrichtlinie.',
      belege: [{ abschnitt: 'B2:v1:s1', zitat: 'gilt eine Mindest-Eigenkapitalquote von 30 %' }], basis: [4], wichtig: true },
    { typ: 'fakt', text: 'Die Kreditrichtlinie verlangt zusätzlich eine Bürgschaft der Gesellschafter.',
      belege: [{ abschnitt: 'B2:v1:s3', zitat: 'Zusätzlich ist eine Gesellschafterbürgschaft erforderlich.' }] },
    { typ: 'luecke', text: 'In den durchsuchten Abschnitten wurde keine Angabe zum Auftragsbestand für 2026 gefunden.', belege: [] }
  ] };
}

function pruefer(aussagen, bereitgestellt) {
  const hatBericht = bereitgestellt.has('B3:v1:s1');
  const u = {
    A1: { urteil: 'gestuetzt', begruendung: 'Die Stelle beschreibt das Geschäft von Nordwerk genau so.' },
    A2: { urteil: 'gestuetzt', begruendung: 'Beide Werte stehen in der Gewinn- und Verlustrechnung.' },
    A3: { urteil: 'widersprochen', begruendung: 'Aus 8,0 und 9,2 Mio. Euro ergibt sich ein Wachstum von 15 %, nicht 20 %.',
          korrektur: 'Der Umsatz ist um 15 % gestiegen (von 8,0 auf 9,2 Mio. Euro).' },
    A4: { urteil: 'gestuetzt', begruendung: 'Die Quote steht wörtlich in der Bilanz und passt zu Eigenkapital und Bilanzsumme.' },
    A5: hatBericht
      ? { urteil: 'widersprochen', begruendung: 'Die Richtlinie verlangt die Quote nach den Feststellungen des Abschlussprüfers. Laut Prüfungsbericht fehlt eine Rückstellung von 0,7 Mio. Euro. Mit dem bereinigten Eigenkapital von 3,55 Mio. Euro liegt die Quote bei 28,4 % und damit unter 30 %.',
          fundstellen: [{ abschnitt: 'B2:v1:s2', zitat: 'Maßgeblich ist die Eigenkapitalquote nach Berücksichtigung wesentlicher Feststellungen des Abschlussprüfers.' },
                        { abschnitt: 'B3:v1:s1', zitat: 'wurde keine Rückstellung gebildet' },
                        { abschnitt: 'B3:v1:s2', zitat: 'ergibt sich ein Eigenkapital von 3,55 Mio. Euro' }],
          korrektur: 'Nach den Feststellungen des Abschlussprüfers liegt die Eigenkapitalquote bei 28,4 % und damit unter der Mindestquote von 30 %. Laut Richtlinie ist eine Einzelfallprüfung durch die Teamleitung erforderlich.' }
      : { urteil: 'nicht_ausreichend', begruendung: 'Die Richtlinie verlangt die Quote nach Berücksichtigung der Feststellungen des Abschlussprüfers. Ein solcher Bericht liegt in den freigegebenen Unterlagen nicht vor. Die Schlussfolgerung ist deshalb nicht vollständig belegt.',
          fundstellen: [{ abschnitt: 'B2:v1:s2', zitat: 'Maßgeblich ist die Eigenkapitalquote nach Berücksichtigung wesentlicher Feststellungen des Abschlussprüfers.' }],
          korrektur: 'Die unbereinigte Eigenkapitalquote (34 %) liegt über 30 %. Ob die Mindestquote erfüllt ist, lässt sich erst nach Prüfung der Feststellungen des Abschlussprüfers beurteilen.' },
    A6: { urteil: 'widersprochen', begruendung: 'In der Kreditrichtlinie steht nichts von einer Bürgschaft. Der zitierte Satz existiert nicht.' },
    A7: { urteil: 'unklar', begruendung: 'Auch die eigene Suche findet keine Zahl. Der Jahresabschluss nennt nur eine allgemeine Erwartung.',
          fundstellen: [{ abschnitt: 'B1:v1:s4', zitat: 'erwartet für 2026 eine stabile Nachfrage' }] }
  };
  return { urteile: aussagen.map(a => ({ id: a.id, fundstellen: [], korrektur: null, ...(u[a.id] || { urteil: 'unklar', begruendung: 'Im Demo-Modus nicht geprüft.' }) })) };
}

module.exports = { istBeispiel, assistent, pruefer };
