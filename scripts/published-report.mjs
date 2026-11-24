import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {getDocumentProxy} from 'unpdf';

const filename = '3q2025-ing-press-release.pdf';
const publisher = 'https://ing.com/binaries/content/assets/documents/results/3q2025/' + filename;
const expected = 'ce00e3ecb8d52210bf8cfaebd9dab2250b6870b2564b70cc6442165cab4b1d47';
const directory = 'public/published';
const pdfPath = directory + '/' + filename;
await mkdir(directory, {recursive: true});
let bytes;
try { bytes = await readFile(pdfPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const checksum = buffer => createHash('sha256').update(buffer).digest('hex');
if (!bytes || checksum(bytes) !== expected) {
  const response = await fetch(publisher, {signal:AbortSignal.timeout(60000)});
  if (!response.ok) throw Error('ING-PDF nicht erreichbar (HTTP ' + response.status + ').');
  bytes = Buffer.from(await response.arrayBuffer());
}
if (checksum(bytes) !== expected) throw Error('Die veröffentlichte PDF stimmt nicht mit der geprüften Ausgabe überein.');
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const {items} = await page.getTextContent();
  // Group consecutive PDF lines on the same physical page into searchable passages.
  const blocks = [];
  let block = '';
  for (const item of items) {
    if (!item.str?.trim()) continue;
    block += (block ? ' ' : '') + item.str.trim();
    if (item.hasEOL && block.length >= 420) { blocks.push(block); block = ''; }
  }
  if (block) blocks.push(block);
  if (!blocks.length) throw Error('Kein Text auf PDF-Seite ' + i);
  pages.push('[Seite ' + i + ']\n' + blocks.join('\n'));
}
await writeFile(pdfPath, bytes);
await mkdir('server/published', {recursive:true});
await writeFile('server/published/report.json', JSON.stringify({
  id: 'published:' + expected, name: filename, issuer: 'ING Groep N.V.', body: pages.join('\n\n'),
  publishedUrl: '/published/' + filename, publisher, pages: pdf.numPages, created: Date.UTC(2025,9,30),
  importance: 'normal', reviewed: 0, revision: 1, scope: 'published', format: 'PDF'
}));
