import {mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
const out='public/import';
await mkdir(out,{recursive:true});
for(const [source,name] of [
  ['tesseract.js/dist/tesseract.esm.min.js','ocr.mjs'],
  ['tesseract.js/dist/worker.min.js','worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz','deu.traineddata.gz'],
  ['xlsx/xlsx.mjs','xlsx.mjs']
]) await copyFile('node_modules/'+source,out+'/'+name);
await build({entryPoints:['mammoth'],platform:'browser',bundle:true,minify:true,format:'esm',outfile:out+'/word.mjs'});
await build({entryPoints:['client/cloudLogin.js'],platform:'browser',bundle:true,minify:true,format:'esm',outfile:out+'/cloud.mjs'});
await build({entryPoints:['client/main.jsx'],platform:'browser',bundle:true,minify:true,format:'esm',legalComments:'linked',outfile:'public/app.js'});

await import('./published-report.mjs');
