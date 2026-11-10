// Anbindung an das KI-Modell. Austauschbar: Wer ein anderes (z. B. bankintern betriebenes)
// Modell nutzen will, ändert nur diese Datei bzw. OPENAI_BASE_URL.

const MODELL_ASSISTENT = () => process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const MODELL_PRUEFER = () => process.env.OPENAI_MODEL_PRUEFER || process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const hatSchluessel = () => !!(process.env.OPENAI_API_KEY || '').trim();

async function frageJSON({ system, user, modell }) {
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 52000);
  let r;
  try {
    r = await fetch(base + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modell,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' }
      })
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Das KI-Modell hat zu lange gebraucht (Zeitlimit).' : 'KI-Modell nicht erreichbar: ' + e.message);
  } finally { clearTimeout(timer); }
  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 300);
    try { msg = JSON.parse(txt).error.message; } catch (e) {}
    throw new Error(`KI-Modell meldet Fehler ${r.status}: ${msg}`);
  }
  let content;
  try { content = JSON.parse(txt).choices[0].message.content; } catch (e) { throw new Error('Unerwartete Antwort des KI-Modells.'); }
  try { return JSON.parse(content); } catch (e) {
    const m = String(content).match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    throw new Error('Das KI-Modell hat kein gültiges JSON geliefert.');
  }
}

module.exports = { frageJSON, hatSchluessel, MODELL_ASSISTENT, MODELL_PRUEFER };
