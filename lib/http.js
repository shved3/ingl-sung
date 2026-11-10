// Kleine Helfer für die API-Funktionen
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

// Optionaler Passwortschutz (APP_PASSWORT), damit niemand Fremdes euer API-Guthaben nutzt
function erlaubt(req) {
  const p = (process.env.APP_PASSWORT || '').trim();
  if (!p) return true;
  return String(req.headers['x-evidence-pass'] || '') === p;
}

module.exports = { body, erlaubt };
