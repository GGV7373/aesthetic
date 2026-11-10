/* Runs every pair of aesthetics through the sentences on compare-aesthetics.html
   and checks each one against the numbers behind it.

   Run:  node tools/check-compare.js                                          */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('assets/js/compare.js'), sandbox);
vm.runInContext(read('assets/js/versus.js'), sandbox);
const AQ = sandbox.AQ;
const V = AQ.versus;

const aesthetics = JSON.parse(read('data/aesthetics.json'));
const config = JSON.parse(read('data/scoring.json'));
const data = { config, dimensionKeys: config.dimensions.map((d) => d.key) };

const errors = [];
let pairs = 0, sentences = 0, emptyShare = 0, emptyApart = 0;
const scores = [], verdicts = {};
const best = {}; /* aesthetic key -> { other, percent, related } */

for (let i = 0; i < aesthetics.length; i++) {
  for (let j = i + 1; j < aesthetics.length; j++) {
    const a = aesthetics[i], b = aesthetics[j];
    const diff = AQ.compare.compare(V.asProfile(a, data), V.asProfile(b, data), data);
    if (!diff) { errors.push(`${a.key} ~ ${b.key}: no dimensions in common`); continue; }
    pairs++;
    const tag = `${a.key} ~ ${b.key}`;

    /* The score: the same both ways round, and never pushed against 0 or 100. */
    const sc = V.pairScore(a, b, data);
    const back = V.pairScore(b, a, data);
    if (Math.abs(sc.raw - back.raw) > 1e-9) errors.push(`${tag}: score differs when swapped`);
    if (sc.raw <= 0.45 || sc.raw >= 0.95) errors.push(`${tag}: raw score ${sc.raw.toFixed(3)} is outside the 0.45..0.95 stretch, so it gets clamped`);
    const related = (a.related || []).includes(b.key) || (b.related || []).includes(a.key);
    scores.push({ percent: sc.percent, related });
    const v = V.verdictFor(sc.percent);
    verdicts[v] = (verdicts[v] || 0) + 1;
    [[a, b], [b, a]].forEach(([x, y]) => {
      if (!best[x.key] || sc.percent > best[x.key].percent) best[x.key] = { other: y.key, percent: sc.percent, related };
    });

    const share = V.sharedRows(diff.rows).slice(0, 4);
    if (!share.length) emptyShare++;
    share.forEach((r) => {
      sentences++;
      const s = V.shareSentence(r);
      const d = V.lean(r.mine);
      if (V.lean(r.theirs) !== d) errors.push(`${tag}: "${s}" but they lean different ways (${r.mine} / ${r.theirs})`);
      if (r.gap > 0.15) errors.push(`${tag}: "${s}" but they are ${Math.round(r.gap * 100)} points apart`);
    });

    const apart = V.apartRows(diff.rows).slice(0, 4);
    if (!apart.length) emptyApart++;
    apart.forEach((r) => {
      sentences++;
      const s = V.gapSentence(r, a, b);
      if (r.gap < 0.25) errors.push(`${tag}: "${s}" but only ${Math.round(r.gap * 100)} points apart`);
      /* Whatever each aesthetic is said to do must match its own value. */
      [[a, r.mine], [b, r.theirs]].forEach(([who, v]) => {
        const d = V.lean(v);
        const claim = d > 0 ? r.meta.high.toLowerCase() : d < 0 ? r.meta.low.toLowerCase() : 'sits in the middle';
        const both = s.indexOf('both lean ' + claim) >= 0;
        const own = s.indexOf(who.name + (d ? ' leans ' + claim : ' sits in the middle')) >= 0;
        if (!both && !own) errors.push(`${tag}: "${s}" does not match ${who.name} at ${v}`);
      });
    });

    const keys = share.concat(apart).map((r) => r.meta.key);
    if (new Set(keys).size !== keys.length) errors.push(`${tag}: a dimension is both shared and apart`);
  }
}

/* Listed relatives should, as a group, score higher than everything else. */
const median = (xs) => { const s = xs.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const relMedian = median(scores.filter((x) => x.related).map((x) => x.percent));
const otherMedian = median(scores.filter((x) => !x.related).map((x) => x.percent));
if (relMedian <= otherMedian) errors.push(`listed relatives (median ${relMedian}%) do not score above other pairs (${otherMedian}%)`);
const pcts = scores.map((x) => x.percent);
const closestIsRelative = Object.values(best).filter((x) => x.related).length;

console.log(`${pairs} pairs, ${sentences} sentences checked.`);
console.log(`Scores run from ${Math.min(...pcts)}% to ${Math.max(...pcts)}%, median ${median(pcts)}%.`);
console.log(`Listed relatives: median ${relMedian}%. Everything else: median ${otherMedian}%.`);
console.log(`Closest match is a listed relative for ${closestIsRelative} of ${Object.keys(best).length} aesthetics.`);
console.log('Verdicts:', Object.entries(verdicts).sort((p, q) => q[1] - p[1]).map(([k, n]) => `${k} ${n}`).join(', '));
console.log(`Pairs with nothing shared: ${emptyShare}. Pairs with nothing apart: ${emptyApart}.`);
if (errors.length) {
  console.log(`\n${errors.length} problems:`);
  errors.slice(0, 30).forEach((e) => console.log('  ' + e));
  process.exit(1);
}
console.log('Every sentence matches its numbers.');
