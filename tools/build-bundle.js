/* Generates data/bundle.js from the JSON files.
   The bundle is only a fallback for opening the page straight from disk
   (file://), where the browser refuses fetch against local files. The JSON
   files are the source of truth.

   Run:  node tools/build-bundle.js                                         */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = {
  questions: 'data/questions.json',
  aesthetics: 'data/aesthetics.json',
  config: 'data/scoring.json',
  narrative: 'data/narrative.json',
  playlists: 'data/playlists.json'
};

const payload = {};
for (const [key, file] of Object.entries(SOURCES)) {
  payload[key] = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

const out =
  '/* GENERATED FILE - do not edit.\n' +
  '   Built from /data/*.json by `node tools/build-bundle.js`.\n' +
  '   Used only as a fallback when the page runs from file://. */\n' +
  'window.__AQ_BUNDLE__ = ' + JSON.stringify(payload) + ';\n';

const target = path.join(ROOT, 'data/bundle.js');
fs.writeFileSync(target, out, 'utf8');

console.log(
  'Wrote data/bundle.js (' + (out.length / 1024).toFixed(1) + ' kB) - ' +
  payload.questions.length + ' statements, ' + payload.aesthetics.length + ' aesthetics.'
);
