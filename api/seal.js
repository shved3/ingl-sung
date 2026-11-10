// PROTOKOLL-SIEGEL: Jeder Eintrag wird mit dem Siegel des vorherigen Eintrags verkettet.
// Das Siegel berechnet der Server mit einem geheimen Schlüssel (HMAC-SHA256).
// Wer einen Eintrag im Browser ändert, kann das passende Siegel nicht nachbauen.
const crypto = require('crypto');
const { body, erlaubt } = require('../lib/http');

const geheim = () => process.env.LOG_SECRET || process.env.OPENAI_API_KEY || 'evidence-demo-siegel';
const kanon = e => JSON.stringify([e.nr, e.zeit, e.akteur, e.aktion, e.details, e.prev]);
const siegel = e => crypto.createHmac('sha256', geheim()).update(kanon(e)).digest('hex');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  if (!erlaubt(req)) return res.status(401).json({ fehler: 'Passwort erforderlich.' });
  const b = body(req);
  if (b.aktion === 'siegeln' && b.eintrag) {
    return res.status(200).json({ hash: siegel(b.eintrag) });
  }
  if (b.aktion === 'pruefen' && Array.isArray(b.eintraege)) {
    const falsch = b.eintraege.filter(e => siegel(e) !== e.hash).map(e => e.nr);
    return res.status(200).json({ falsch });
  }
  res.status(400).json({ fehler: 'Unbekannte Aktion.' });
};
