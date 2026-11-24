export function fileDescription(doc, sourceName = doc.name) {
  const title = doc.name.replace(/\.(txt|md|csv|xlsx?|pdf)$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' – ').trim() || 'Dokument';
  const tabular = !doc.excerpt && !/monatsbericht|jahresbericht|lagebericht/i.test(title)
    && (/\.(csv|xlsx?)$/i.test(sourceName) || /tabelle|bilanz|cashflow|kennzahlenblatt|kalkulation|budget|kostenübersicht|kostenaufstellung|umsatz|kosten(?:meldung)?(?:$|[_ -])|kennzahlen|inventar|preisliste|buchungsjournal|zahlungsplan|liquiditätsplan/i.test(title));
  const format = tabular ? 'XLSX' : 'PDF';
  return {format, fileName: title + (doc.excerpt ? ' – Auszug' : '') + '.' + format.toLowerCase()};
}
