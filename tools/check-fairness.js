/* How evenly the full test hands out results, per aesthetic.

   Simulates N people the same way validate.js does (random but consistent
   tastes, half of them opinionated), then for every aesthetic prints:
   - wins:  how often it came out on top, and as a multiple of its fair share
   - self:  out of 20 runs answered exactly the way its own profile reads, how
            many it won. Below ~15 means a neighbour is taking its people;
            run tools/check-rivals.js on it to see which one and why.
   - sal:   how sharply its profile is drawn (mean distance from 0.5, x2).
            Vague profiles (low sal) win random people they don't really fit.

   Run:  node tools/check-fairness.js [N=6000] [all]
   With "all" every aesthetic is listed; otherwise the top 15 and bottom 20. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const N = +(process.argv[2] || 6000);
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

/* Answers someone whose taste is exactly this aesthetic's profile would give. */
function selfAnswers(a, qs) {
  const ans = {};
  qs.forEach((q) => {
    let s = 0;
    Object.entries(q.dimensions).forEach(([k, w]) => { s += w * ((a.dimensions[k] ?? 0.5) - 0.5); });
    ans[q.id] = Math.max(-3, Math.min(3, Math.round(s * 3)));
  });
  return ans;
}

const wins = {};
aesthetics.forEach((a) => (wins[a.key] = 0));
let pctSum = 0;
for (let i = 0; i < N; i++) {
  const opinionated = i % 2 === 0;
  const sel = AQ.selectQuestions(data, { seed: 'FAIR' + i });
  const rng = AQ.rng.rngFromSeed('FAIRANS' + i, 'sim');
  const bias = {};
  data.dimensionKeys.forEach((k) => {
    let b = rng() * 2 - 1;
    if (opinionated) b = Math.sign(b) * Math.pow(Math.abs(b), 0.45);
    bias[k] = b;
  });
  const ans = {};
  sel.questions.forEach((q) => {
    let pull = 0, n = 0;
    Object.entries(q.dimensions).forEach(([k, w]) => { pull += bias[k] * (w / 3); n += Math.abs(w) / 3; });
    const noise = (rng() - 0.5) * (opinionated ? 0.5 : 0.8);
    ans[q.id] = Math.max(-3, Math.min(3, Math.round(((n ? pull / n : 0) + noise) * 3)));
  });
  const r = AQ.score(sel.questions, ans, data);
  wins[r.primary.key]++;
  pctSum += r.primary.percent;
}

const rows = aesthetics.map((a) => {
  let self = 0;
  for (let i = 0; i < 20; i++) {
    const sel = AQ.selectQuestions(data, { seed: 'SELF' + a.key + i });
    if (AQ.score(sel.questions, selfAnswers(a, sel.questions), data).primary.key === a.key) self++;
  }
  const d = Object.values(a.dimensions);
  const sal = d.reduce((s, v) => s + Math.abs(v - 0.5) * 2, 0) / d.length;
  return { key: a.key, wins: wins[a.key], self, sal, dims: d.length };
}).sort((x, y) => y.wins - x.wins);

const fair = N / aesthetics.length;
const selfAll = rows.reduce((s, r) => s + r.self, 0) / (20 * rows.length);
console.log(`${N} simulated people, fair share ${fair.toFixed(1)} wins each`);
console.log(`  top winner:          ${rows[0].key} (${(rows[0].wins / fair).toFixed(1)}x fair)`);
console.log(`  ever win:            ${rows.filter((r) => r.wins).length} / ${rows.length}`);
console.log(`  under 1/4 of fair:   ${rows.filter((r) => r.wins < fair / 4).length}`);
console.log(`  own profile wins:    ${(100 * selfAll).toFixed(0)}%`);
console.log(`  average top match:   ${(pctSum / N).toFixed(1)}%`);
const weak = rows.filter((r) => r.self < 15);
console.log(`  weak self (<15/20):  ${weak.length ? weak.map((r) => `${r.key} ${r.self}`).join(', ') : 'none'}\n`);

const show = process.argv[3] === 'all' ? rows : [...rows.slice(0, 15), null, ...rows.slice(-20)];
show.forEach((r) => console.log(r ? `${r.key.padEnd(22)} wins ${String(r.wins).padStart(4)} ${(r.wins / fair).toFixed(2).padStart(5)}x  self ${String(r.self).padStart(2)}/20  sal ${r.sal.toFixed(2)}  dims ${r.dims}` : '  ...'));
