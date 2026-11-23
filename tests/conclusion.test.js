import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer } from '../server/evaluate.js';

const docs = [
  { id: 'regel', name: 'Ziel', body: 'Das Lieferziel beträgt 98 Prozent.', reviewed: true, issuer: 'Logistik' },
  { id: 'bericht', name: 'Ergebnis', body: 'Die Lieferquote im Mai betrug 96 Prozent.', reviewed: true, issuer: 'Logistik' }
];
const question = 'Wurde das Lieferziel im Mai erreicht?';
const refs = docs.map(d => ({ id: d.id + '#0', quote: d.body }));
const draft = {
  fazit: 'Nein. Im Mai wurde das Lieferziel um zwei Prozentpunkte verfehlt.',
  begruendung: '98 Prozent Ziel minus 96 Prozent Ist ergeben zwei Prozentpunkte.',
  refs, missing: false, luecke: ''
};

function simulate(t, replies) {
  return t.mock.method(globalThis, 'fetch', async () => {
    const reply = replies.shift();
    assert.ok(reply, 'Unerwartete zusätzliche Modellabfrage');
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  });
}

test('Lokales Modell leitet Fazit aus Ziel und Ist ab, beide Fundstellen bleiben lesbar', async t => {
  const call = simulate(t, [draft, { widerspruch: false, kriterien: Array.from({ length: 20 }, () => ({ wert: 2, grund: 'Belegt.' })) }]);
  const r = await answer({ OLLAMA_MODEL: 'lokaler-test', OPENAI_API_KEY: 'test-only' }, docs, question);
  assert.equal(r.text, draft.fazit);
  assert.equal(r.reasoning, draft.begruendung);
  assert.equal(r.refs.length, 2);
  assert.equal(r.missing, false);
  for (const { arguments: [url, opts] } of call.mock.calls) {
    assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(opts.headers.Authorization, undefined);
    assert.equal(JSON.parse(opts.body).model, 'lokaler-test');
  }
});

test('Bei fehlender Zielvorgabe bleibt der konkrete Nachweisbedarf sichtbar', async t => {
  const gap = 'Für die Entscheidung fehlt die Zielvorgabe für Mai.';
  const call = simulate(t, [{ fazit: '', begruendung: '', missing: true, luecke: gap, refs: [] }, { widerspruch: false, kriterien: Array.from({ length: 20 }, () => ({ wert: 0, grund: 'Nachweis fehlt.' })), gegenbelege: [] }]);
  const r = await answer({ OPENAI_API_KEY: 'test-only' }, docs.slice(1), question);
  assert.equal(call.mock.calls.length, 2);
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'done');
  assert.equal(r.gap, gap);
  assert.equal(r.text, '');
  assert.equal(r.score, null);
});

test('Ein erfundenes Zitat sperrt das Fazit', async t => {
  simulate(t, [{ ...draft, refs: [{ id: 'bericht#0', quote: 'Tatsächlich waren es 99 Prozent.' }] }]);
  const r = await answer({ OLLAMA_MODEL: 'test' }, docs, question);
  assert.equal(r.missing, true);
  assert.notEqual(r.text, draft.fazit);
  assert.equal(r.score, null);
});

test('Ein fachlicher Widerspruch wird vor der Ausgabe des Fazits berücksichtigt', async t => {
  simulate(t, [draft, { widerspruch: true, hinweis: 'Der Gültigkeitszeitraum der Zielvorgabe ist strittig.' }]);
  const r = await answer({ OLLAMA_MODEL: 'test' }, docs, question);
  assert.equal(r.missing, true);
  assert.equal(r.text, '');
  assert.match(r.gap, /Gültigkeitszeitraum/);
  assert.equal(r.score, null);
  assert.equal(r.refs.length, 2);
});

for(const [party,source,expected] of [
  ['Elbbank','Die Hafenbank muss den Kredit A-17 ablehnen.','offen'],
  ['ING','Die Hafenbank muss den Kredit A-17 ablehnen. ING erhält eine Kopie.','offen'],
  ['ING','ING muss den Kredit A-17 ablehnen, falls keine Bürgschaft vorliegt.','Wortlaut'],
  ['ING','ING muss den Kredit A-17 ablehnen.','direkt']
]){
  test('Geltungsbereich der Kreditregel: '+source+' / '+party,async t=>{
    const claim=party+' muss den Kredit A-17 ablehnen.';
    const doc={id:'vertrag',name:'Kreditvertrag A-17',body:source,reviewed:true,issuer:'Kreditausschuss'};
    simulate(t,[{fazit:claim,begruendung:'Die Regel gilt.',refs:[{id:'vertrag#0',quote:source}],missing:false,luecke:''},
      {widerspruch:false,kriterien:Array.from({length:20},()=>({wert:2,grund:'Geprüft.'})),gegenbelege:[],
      thesen:[{aussage:claim,art:'dokumentiert',ids:['vertrag#0']}]}]);
    const r=await answer({OLLAMA_MODEL:'test'},[doc],'Darf '+party+' den Kredit A-17 genehmigen?');
    if(expected==='direkt'){assert.equal(r.text,claim);assert.equal(r.missing,false);}
    else{assert.equal(r.score,null);assert.equal(r.missing,true);
      if(expected==='offen'){assert.match(r.text,/bleibt offen/);assert.equal(r.claims[0].kind,'offen');}
      else assert(r.text.includes(source));
    }
  });
}
