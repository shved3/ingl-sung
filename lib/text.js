// Textwerkzeuge für den Code-Check: Zitate wiederfinden, Zahlen lesen.
// Reiner Programmcode, keine KI.

function tokens(s) {
  const re = /[\p{L}\p{N}]+/gu;
  const out = [];
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0].toLowerCase(), i: m.index, e: m.index + m[0].length });
  return out;
}

function squash(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripQuotes(s) {
  return squash(s).replace(/^[„“"'»«‚‘’]+|[“”"'»«‘’]+$/g, '').replace(/^(\.\.\.|…)|(\.\.\.|…)$/g, '').trim();
}

// Sucht ein Zitat in einem Abschnitt.
// status: 'ok' (wörtlich), 'norm' (gleich bis auf Schreibweise/Zeichensetzung),
//         'fuzzy' (sehr ähnlich), 'fail' (nicht gefunden)
function findQuote(sectionText, quote) {
  const q = stripQuotes(quote);
  const st = tokens(sectionText);
  const qt = tokens(q);
  if (!qt.length || !st.length) return { status: 'fail', score: 0 };
  const n = qt.length;
  for (let i = 0; i + n <= st.length; i++) {
    let hit = true;
    for (let k = 0; k < n; k++) {
      if (st[i + k].t !== qt[k].t) { hit = false; break; }
    }
    if (hit) {
      const start = st[i].i, end = st[i + n - 1].e;
      const exact = squash(sectionText).includes(q);
      return { status: exact ? 'ok' : 'norm', start, end, score: 1 };
    }
  }
  if (n >= 4) {
    const need = {};
    qt.forEach(x => { need[x.t] = (need[x.t] || 0) + 1; });
    let best = { score: 0 };
    for (let i = 0; i + n <= st.length; i++) {
      const have = {};
      let overlap = 0;
      for (let k = 0; k < n; k++) {
        const t = st[i + k].t;
        have[t] = (have[t] || 0) + 1;
        if (need[t] && have[t] <= need[t]) overlap++;
      }
      const score = overlap / n;
      if (score > best.score) best = { score, start: st[i].i, end: st[i + n - 1].e };
    }
    if (best.score >= 0.8) return { status: 'fuzzy', start: best.start, end: best.end, score: best.score };
    return { status: 'fail', score: best.score };
  }
  return { status: 'fail', score: 0 };
}

const UNIT = [
  [/^(mrd|milliarde)/i, 1e9],
  [/^(mio|million)/i, 1e6],
  [/^(tsd|tausend|teur|t€)/i, 1e3]
];

function parseNum(raw) {
  let s = raw;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return parseFloat(s);
}

// Liest alle Zahlen aus einem Text, inklusive Einheit (%, Tsd., Mio., Mrd.).
function numbersIn(text) {
  let s = String(text || '');
  // Verweise sind keine inhaltlichen Zahlen
  s = s.replace(/\b[A-Z]\d+:v\d+:s\d+\b/g, ' ')
       .replace(/\b(Seite|Seiten|S\.|Abschnitt|Kapitel|Kap\.|Nr\.|Ziffer|Version|Aussage|Anlage|Tz\.)\s*\d+/gi, ' ')
       .replace(/§+\s*\d+[a-z]?/gi, ' ')
       .replace(/\b[AD]\d+\b/g, ' ');
  const re = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?:\s*(%|Prozent|Mrd\.?|Milliarden?|Mio\.?|Millionen?|Tsd\.?|Tausend|TEUR|T€))?/gi;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    const value = parseNum(m[1]);
    if (!isFinite(value)) continue;
    const u = m[2] || '';
    let mult = 1, percent = false;
    if (/^(%|prozent)/i.test(u)) percent = true;
    else for (const [rx, f] of UNIT) if (rx.test(u)) mult = f;
    const before = s.slice(Math.max(0, m.index - 14), m.index).toLowerCase();
    const approx = /(rund|etwa|ca\.?|circa|knapp|fast|gut|über|mehr als|ungefähr)\s*$/.test(before);
    out.push({ raw: squash(m[0]), value, scaled: value * mult, percent, hasUnit: mult !== 1, approx });
  }
  return out;
}

function near(a, b, tol) {
  if (a === b) return true;
  const d = Math.abs(a - b);
  return d <= Math.max(Math.abs(a), Math.abs(b)) * tol + 1e-9;
}

// Kommt die Zahl n in der Menge der belegten Zahlen vor?
function numberBacked(n, pool) {
  const tol = n.approx ? 0.06 : 1e-6;
  return pool.some(e =>
    near(n.scaled, e.scaled, tol) ||
    ((!n.hasUnit || !e.hasUnit) && near(n.value, e.value, tol))
  );
}

function fmtNum(x, percent) {
  if (percent) return (Math.round(x * 10) / 10).toLocaleString('de-DE') + ' %';
  const a = Math.abs(x);
  if (a >= 1e9) return (Math.round(x / 1e7) / 100).toLocaleString('de-DE') + ' Mrd.';
  if (a >= 1e6) return (Math.round(x / 1e4) / 100).toLocaleString('de-DE') + ' Mio.';
  return (Math.round(x * 100) / 100).toLocaleString('de-DE');
}

const STOP = new Set('der die das den dem des ein eine einer eines einem einen und oder aber auch als auf aus bei bis durch für gegen in im ist sind war waren wird werden wurde wurden mit nach nicht noch nur ohne über um unter von vom vor zu zum zur wie was wer dass sich sie er es wir ihr hat haben hatte kann können soll sollen sowie beträgt betrug lag liegt laut'.split(' '));

function contentTokens(s) {
  return tokens(s).map(x => x.t).filter(t => t.length > 2 && !STOP.has(t));
}

function stem(t) { return t.length > 6 ? t.slice(0, 6) : t; }

// Anteil der Inhaltswörter der Aussage, die im Belegtext vorkommen (0..1)
function coverage(claimText, evidenceText) {
  const c = contentTokens(claimText).map(stem);
  if (!c.length) return 1;
  const e = new Set(contentTokens(evidenceText).map(stem));
  return c.filter(t => e.has(t)).length / c.length;
}

module.exports = { tokens, squash, stripQuotes, findQuote, numbersIn, numberBacked, near, fmtNum, contentTokens, coverage, stem };
