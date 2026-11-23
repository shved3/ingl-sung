import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer } from '../server/evaluate.js';
const docs = [{ id: 'test', name: 'Speichertest', body: 'Das Testunternehmen hat genau 137 Mitarbeitende.', issuer: 'Test', reviewed: true }];
const question = 'Wie viele Mitarbeitende hat das Testunternehmen?';
const draft = { fazit: 'Das Testunternehmen hat 137 Mitarbeitende.', begruendung: 'Die Anzahl steht ausdrücklich in der Quelle.', missing: false, luecke: '', refs: [{id: 'test#0', quote: docs[0].body}] };
for (const [status, error, expected] of [
  [401, {code:'invalid_api_key'}, 'authentication'],
  [429, {code:'insufficient_quota'}, 'quota'],
  [429, {code:'billing_hard_limit_reached',type:'insufficient_quota'}, 'quota'],
  [429, {code:'rate_limit_exceeded'}, 'rate_limit'],
  [429, {code:'organization_usage_limit_exceeded',type:'insufficient_quota'}, 'usage_limit'],
  [404, {code:'model_not_found'}, 'model_access'],
  [403, {}, 'permission'], [400, {}, 'request'], [503, {}, 'provider']
]) test(`Provider failure ${status}/${expected} is specific and redacted`, async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const call = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: {...error, message:'SECRET_PROMPT sk-private'} }, {status}));
  const r = await answer({OPENAI_API_KEY:'test-only'}, docs, question);
  assert.equal(r.text, '');
  assert.equal(r.audit.steps.find(s=>s.id==='ai2').status, 'skipped');
  assert.match(r.warning, new RegExp('Code: '+expected));
  assert.doesNotMatch(JSON.stringify(r)+JSON.stringify(logs.mock.calls), /SECRET_PROMPT|sk-private/);
  assert.equal(call.mock.calls.length, 1);
});
for (const [kind, expected] of [['network','network'],['timeout','timeout'],['json','invalid_json'],['empty','empty_response'],['length','truncated'],['refusal','refusal']]) test(`Model output or transport: ${kind}`, async t => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => {
    if (kind === 'network') throw new TypeError('fetch failed');
    if (kind === 'timeout') throw new DOMException('timeout','TimeoutError');
    return Response.json({choices:[{finish_reason:kind === 'length'?'length':'stop',message:{content:kind==='json'?'bad json':kind==='empty'?'':JSON.stringify(draft),refusal:kind==='refusal'?'refused':null}}]});
  });
  const r = await answer({OPENAI_API_KEY:'test-only'}, docs, question);
  assert.match(r.warning,new RegExp('Code: '+expected));
  assert.equal(r.text,'');
});
test('A failed reviewer preserves the first answer; whitespace is trimmed from configuration', async t => {
  t.mock.method(console, 'error', () => {});
  const call = t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    assert.equal(opts.headers.Authorization,'Bearer test-only');
    const body=JSON.parse(opts.body);
    assert.equal(body.model, call.mock.calls.length === 0 ? 'first-model':'review-model');
    return call.mock.calls.length === 0 ? Response.json({choices:[{message:{content:JSON.stringify(draft)}}]}) : Response.json({error:{code:'model_not_found'}},{status:404});
  });
  const r=await answer({OPENAI_API_KEY:' test-only\n',OPENAI_MODEL:' first-model ',OPENAI_MODEL_PRUEFER:' review-model '},docs,question);
  assert.equal(r.text,draft.fazit);
  assert.equal(r.score,null);
  assert.match(r.warning,/model_access/);
  assert.equal(r.audit.steps.find(s=>s.id==='ai1').status,'done');
});
