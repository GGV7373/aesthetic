/* Why an aesthetic loses to a neighbour.

   Answers 20 quizzes exactly the way the aesthetic's own profile reads and
   lists who wins instead (with the aesthetic's own rank in brackets). Name a
   rival as well and it shows, for the first run, the dimensions that tip the
   score the rival's way: the person's value next to each side's target,
   agreement and weight. Usually the fix is to move the losing profile toward
   the person's values on those dimensions - where its wiki page agrees.

   Run:  node tools/check-rivals.js <key> [rival-key]              */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const [key, rival] = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const questions = read('data/questions.json');
const aesthetics = read('data/aesthetics.json');
const config = read('data/scoring.json');

const sb = { window: {}, document: { addEventListener() {} }, console };
sb.globalThis = sb;
vm.createContext(sb);
['prng.js', 'selection.js', 'scoring.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), sb, { filename: f });
});
const AQ = sb.window.AQ;

const data = { questions, aesthetics, config, narrative: {} };
data.questionsById = {};
questions.forEach((q) => (data.questionsById[q.id] = q));
data.aestheticsByKey = {};
aesthetics.forEach((a) => (data.aestheticsByKey[a.key] = a));
data.dimensionKeys = config.dimensions.map((d) => d.key);

const a = data.aestheticsByKey[key];
if (!a || (rival && !data.aestheticsByKey[rival])) {
  console.error('Usage: node tools/check-rivals.js <key> [rival-key]  (unknown key)');
  process.exit(1);
}

const thieves = {};
let first = null;
for (let i = 0; i < 20; i++) {
  const sel = AQ.selectQuestions(data, { seed: 'SELF' + key + i });
  const ans = {};
  sel.questions.forEach((q) => {
    let s = 0;
    Object.entries(q.dimensions).forEach(([k, w]) => { s += w * ((a.dimensions[k] ?? 0.5) - 0.5); });
    ans[q.id] = Math.max(-3, Math.min(3, Math.round(s * 3)));
  });
  const r = AQ.score(sel.questions, ans, data);
  if (!first) first = r;
  const pos = r.ranked.findIndex((e) => e.key === key);
  if (pos) {
    const label = `${r.primary.key} (${key} #${pos + 1})`;
    thieves[label] = (thieves[label] || 0) + 1;
  }
}
const lost = Object.values(thieves).reduce((s, v) => s + v, 0);
console.log(`${key}: won ${20 - lost}/20 of its own runs.`);
Object.entries(thieves).sort((x, y) => y[1] - x[1]).forEach(([k, v]) => console.log(`  lost ${v}x to ${k}`));

if (rival) {
  const me = first.ranked.find((e) => e.key === key);
  const rv = first.ranked.find((e) => e.key === rival);
  console.log(`\nFirst run: ${key} ${me.similarity.toFixed(3)} vs ${rival} ${rv.similarity.toFixed(3)}. Dimensions favouring ${rival} most:`);
  const wSum = (p) => p.reduce((s, e) => s + e.weight, 0);
  const wm = wSum(me.parts), wr = wSum(rv.parts);
  const dims = {};
  me.parts.forEach((e) => ((dims[e.key] = dims[e.key] || {}).me = e));
  rv.parts.forEach((e) => ((dims[e.key] = dims[e.key] || {}).rv = e));
  const side = (e) => (e ? `${String(e.target).padEnd(5)} agree ${e.agreement.toFixed(2)} w ${e.weight.toFixed(2)}` : '(not defined)'.padEnd(26));
  console.log(`  ${'dimension'.padEnd(14)} person | ${key.padEnd(26)} | ${rival}`);
  Object.entries(dims)
    .map(([k, v]) => [k, v, (v.me ? v.me.weight * v.me.agreement / wm : 0) - (v.rv ? v.rv.weight * v.rv.agreement / wr : 0)])
    .sort((x, y) => x[2] - y[2])
    .slice(0, 12)
    .forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${(v.me || v.rv).user.toFixed(2).padStart(6)} | ${side(v.me).padEnd(26)} | ${side(v.rv)}`));
}
