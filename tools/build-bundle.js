/* Genererer data/bundle.js fra JSON-filene.
   Bundelen er kun en reserve for når siden åpnes rett fra disk (file://), der
   nettleseren nekter fetch mot lokale filer. JSON-filene er fasit.

   Kjør:  node tools/build-bundle.js                                        */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = {
  questions: 'data/questions.json',
  aesthetics: 'data/aesthetics.json',
  config: 'data/scoring.json',
  narrative: 'data/narrative.json'
};

const payload = {};
for (const [key, file] of Object.entries(SOURCES)) {
  payload[key] = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

const out =
  '/* GENERERT FIL — ikke rediger.\n' +
  '   Bygget fra /data/*.json med `node tools/build-bundle.js`.\n' +
  '   Brukes bare som reserve når siden kjører fra file://. */\n' +
  'window.__AQ_BUNDLE__ = ' + JSON.stringify(payload) + ';\n';

const target = path.join(ROOT, 'data/bundle.js');
fs.writeFileSync(target, out, 'utf8');

console.log(
  'Skrev data/bundle.js (' + (out.length / 1024).toFixed(1) + ' kB) — ' +
  payload.questions.length + ' spørsmål, ' + payload.aesthetics.length + ' estetikker.'
);
