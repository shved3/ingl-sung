import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, assessSources, sourceThreshold } from '../server/evaluate.js';
const question = 'Wurde das Lieferziel erreicht?';
const sources = [
  { id: 'ok', name: 'Lieferziel Bericht', body: 'Das Lieferziel wurde erreicht.', issuer: 'Leitung', reviewed: true },
  { id: 'counter', name: 'Lieferziel Nachtrag', body: 'Das Lieferziel wurde nicht erreicht.', issuer: '', reviewed: false, importance: 'important' },
  { id: 'other', name: 'Kantine', body: 'Heute gibt es Suppe.', issuer: 'Küche', reviewed: true }
];
const draft = { fazit: sources[0].body, begruendung: 'Der Bericht nennt das erreichte Ziel.', refs: [{ id: 'ok#0', quote: sources[0].body }], missing: false, luecke: '' };
const criteria = () => Array.from({ length: 20 }, () => ({ wert: 2, grund: 'Im Test anhand des Wortlauts geprüft.' }));
function model(t, verify = () => {}) {
  let count = 0;
  return t.mock.method(globalThis, 'fetch', async (url, opts) => {
    const payload = JSON.parse(opts.body);
    const input = JSON.parse(payload.messages[1].content);
    count++;
    const output = verify(input, count, payload) || (count === 1 ? draft : {
      widerspruch: false, kriterien: criteria(),
      gegenbelege: input.pflichtpruefung.map(id => ({ id, urteil: 'stützt', grund: 'Testprüfung.' }))
    });
    return Response.json({ choices: [{ message: { content: JSON.stringify(output) } }] });
  });
}
test('Punkteschwelle grenzt reguläre Quellen ab, ohne niedrige Gegenbelege zu verlieren', () => {
  const low = assessSources(sources, question, 60);
  assert.equal(low.find(p => p.doc === 'counter').decision, 'accepted');
  const high = assessSources(sources, question, 61);
  assert.equal(high.find(p => p.doc === 'counter').decision, 'protected');
  assert.equal(high.find(p => p.doc === 'other').decision, 'excluded');
  assert.equal(high.find(p => p.doc === 'other').points, 60);
  for (const invalid of [-1, 101, 2.5, '', NaN, null, true]) assert.throws(() => sourceThreshold({}, invalid));
});
test('Anders formulierter Kontext bleibt erhalten, auch hinter mehr als 28 Fundstellen', async t => {
  const docs = [{ ...sources[0], name: 'Bericht', body: [...Array(35).fill(sources[0].body), 'Jedoch gilt die Zusage nur vorbehaltlich einer Bestätigung.'].join('\n') }];
  const call = model(t, (input, n) => {
    assert.equal(input.abschnitte.length, 36);
    assert(input.abschnitte.some(p => p.text.startsWith('Jedoch')));
  });
  const r = await answer({ OLLAMA_MODEL: 'test' }, docs, question, [], { threshold: 90 });
  assert.equal(call.mock.calls.length, 2);
  assert.equal(r.audit.sources.length, 36);
  assert.equal(r.audit.counterChecks.length, 1);
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'done');
});
test('Niedrig bewerteter wichtiger Gegenbeleg erreicht beide KIs und sperrt ein falsches Fazit', async t => {
  const call = model(t, (input, n) => {
    assert(input.abschnitte.some(p => p.id === 'counter#0' && p.auswahl === 'protected'));
    assert(!input.abschnitte.some(p => p.id === 'other#0'));
    if (n === 2) return { widerspruch: false, kriterien: criteria(), gegenbelege: [{ id: 'counter#0', urteil: 'widerspricht', grund: 'Der Nachtrag sagt ausdrücklich nicht erreicht.' }] };
  });
  const r = await answer({ OLLAMA_MODEL: 'writer', OLLAMA_MODEL_PRUEFER: 'reviewer' }, sources, question);
  assert.equal(call.mock.calls.length, 2);
  assert.equal(JSON.parse(call.mock.calls[1].arguments[1].body).model, 'reviewer');
  assert.equal(r.text, '');
  assert.equal(r.score, null);
  assert.equal(r.missing, true);
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'blocked');
  assert(r.contextDependencies.includes('counter'));
  assert(!r.contextDependencies.includes('other'));
  assert(r.dependencies.includes('other')); // Audit text also needs access protection.
  assert(r.audit.openEvidence.some(s => /nicht erreicht/.test(s)));
});
test('Fehlende Gegenbeleg-Einzelprüfung darf keine positive Bewertung erzeugen', async t => {
  model(t, (input, n) => n >= 2 ? { widerspruch: false, kriterien: criteria(), gegenbelege: [] } : undefined);
  const r = await answer({ OLLAMA_MODEL: 'test' }, sources, question);
  assert.equal(r.score, null);
  assert.match(r.warning, /1 von 1 möglichen Gegenbelegen/);
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'blocked');
});
test('Unklarer Gegenbeleg bleibt als offener Nachweis sichtbar', async t => {
  model(t, (input, n) => n === 2 ? { widerspruch: false, kriterien: criteria(), gegenbelege: [{ id: 'counter#0', urteil: 'unklar', grund: 'Der Zeitraum des Nachtrags ist offen.' }] } : undefined);
  const r = await answer({ OLLAMA_MODEL: 'test' }, sources, question);
  assert.equal(r.missing, true);
  assert.equal(r.score, null);
  assert(r.audit.openEvidence.some(s => s.includes('Zeitraum')));
});
test('KI-1-Ausfall erhält Codebewertung und tatsächlichen Fehlerstatus', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('timeout'); });
  const r = await answer({ OLLAMA_MODEL: 'test' }, sources, question);
  assert.equal(r.audit.sources.length, 3);
  assert.equal(r.audit.steps.find(s => s.id === 'ai1').status, 'failed');
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'skipped');
  assert.equal(r.score, null);
});
test('Keine stillschweigende Kürzung großer Gegenbelegmengen', async t => {
  const call = t.mock.method(globalThis, 'fetch', () => { throw Error('Darf nicht aufgerufen werden'); });
  const r = await answer({ OLLAMA_MODEL: 'test' }, [{ ...sources[0], body: Array(201).fill(sources[0].body).join('\n') }], question);
  assert.equal(call.mock.calls.length, 0);
  assert.equal(r.audit.sources.length, 201);
  assert.equal(r.audit.steps.find(s => s.id === 'ai1').status, 'blocked');
});
test('Ohne Modell werden keine KI-Schritte als abgeschlossen ausgegeben', async () => {
  const r = await answer({}, sources, question, [], { threshold: 100 });
  assert.equal(r.mode, 'Quellensuche');
  assert.equal(r.audit.threshold, 100);
  assert.equal(r.audit.steps.find(s => s.id === 'ai1').status, 'skipped');
  assert.equal(r.audit.steps.find(s => s.id === 'ai2').status, 'skipped');
});
test('Individuelle Gewichte verändern die Punkteschwelle und bleiben im Audit erhalten',async()=>{
 const weights=[10,50,20,10,10];
 const base={id:'x',name:'Vertrag',body:'Vertrag und Nachtrag',reviewed:0};
 const result=await answer({},[base],'Vertrag?',[],{threshold:45,weights});
 assert.deepEqual(result.audit.weights,weights);
 assert.equal(result.audit.sources[0].score,30);
 assert.equal(result.audit.sources[0].decision,'protected');
 await assert.rejects(()=>answer({},[base],'Vertrag?',[],{weights:[1,1,1,1,1]}));
});

test('Eine fehlende Einzelprüfung wird gezielt ergänzt',async t=>{
 const calls=model(t,(input,n)=>{
   if(n===2)return {widerspruch:false,kriterien:criteria(),gegenbelege:[]};
   if(n===3){assert.deepEqual(input.kriterien,[]);assert.deepEqual(input.pflichtpruefung,['counter#0']);return {gegenbelege:[{id:'counter#0',urteil:'stützt',grund:'Begründeter Testfall.'}]};}
 });
 const result=await answer({OLLAMA_MODEL:'test'},sources,question);
 assert.equal(calls.mock.calls.length,3);
 assert.equal(result.audit.steps.find(s=>s.id==='ai2').status,'done');
});
