/* Checks that the data files hang together, then simulates the test to see that
   selection and scoring behave.

   Run:  node tools/validate.js                                              */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const questions = read('data/questions.json');
const aesthetics = read('data/aesthetics.json');
const config = read('data/scoring.json');
const narrative = read('data/narrative.json');

const errors = [];
const warnings = [];

const FACETS = ['setting', 'architecture', 'interior', 'technology', 'clothes', 'music', 'colours', 'everyday'];

/* ---------- dimensions ---------- */

const dimKeys = new Set(config.dimensions.map((d) => d.key));
if (dimKeys.size !== config.dimensions.length) errors.push('Duplicate dimension keys.');

/* ---------- statements ---------- */

const ids = new Set();
const perGroup = {};
const clusterUse = {};

questions.forEach((q) => {
  if (ids.has(q.id)) errors.push(`Statement id ${q.id} appears more than once.`);
  ids.add(q.id);
  if (!q.text || q.text.length < 15) errors.push(`Statement ${q.id} has no usable text.`);
  if (!q.group) errors.push(`Statement ${q.id} has no group.`);
  if (!q.cluster) errors.push(`Statement ${q.id} has no cluster.`);
  perGroup[q.group] = (perGroup[q.group] || 0) + 1;
  clusterUse[q.cluster] = (clusterUse[q.cluster] || 0) + 1;

  const dims = Object.keys(q.dimensions || {});
  if (!dims.length) errors.push(`Statement ${q.id} affects no dimensions.`);
  if (dims.length < 2) warnings.push(`Statement ${q.id} affects only one dimension.`);
  dims.forEach((d) => {
    if (!dimKeys.has(d)) errors.push(`Statement ${q.id} uses unknown dimension "${d}".`);
    const w = q.dimensions[d];
    if (typeof w !== 'number' || Math.abs(w) > 3 || w === 0) {
      errors.push(`Statement ${q.id}: weight for "${d}" should be -3..3 and never 0 (is ${w}).`);
    }
  });
});

/* ---------- groups ---------- */

const quotaLow = config.groups.reduce((s, g) => s + g.min, 0);
const quotaHigh = config.groups.reduce((s, g) => s + g.max, 0);
if (config.questionsPerQuiz < quotaLow || config.questionsPerQuiz > quotaHigh) {
  errors.push(`Groups can yield ${quotaLow}-${quotaHigh} statements, but the quiz needs ${config.questionsPerQuiz}.`);
}
config.groups.forEach((g) => {
  const have = perGroup[g.key] || 0;
  if (have < g.max) errors.push(`Group "${g.key}": ${have} statements, but up to ${g.max} may be drawn.`);
  else if (have < g.max * 3) warnings.push(`Group "${g.key}" has little to vary with (${have}).`);
});
Object.keys(perGroup).forEach((k) => {
  if (!config.groups.some((g) => g.key === k)) errors.push(`Unknown group "${k}" on a statement.`);
});

Object.entries(clusterUse).forEach(([cluster, n]) => {
  if (n > 3) warnings.push(`Cluster "${cluster}" is used ${n} times - check they aren't too alike.`);
});

/* ---------- dimension coverage ---------- */

const coverage = {};
dimKeys.forEach((k) => (coverage[k] = 0));
questions.forEach((q) =>
  Object.entries(q.dimensions).forEach(([k, w]) => (coverage[k] += Math.abs(w)))
);
Object.entries(coverage).forEach(([k, v]) => {
  if (v === 0) errors.push(`Dimension "${k}" is measured by nothing.`);
  else if (v < 8) warnings.push(`Dimension "${k}" is thinly covered (weight sum ${v}).`);
});

/* Both positive and negative wordings per dimension. */
dimKeys.forEach((k) => {
  const pos = questions.filter((q) => (q.dimensions[k] || 0) > 0).length;
  const neg = questions.filter((q) => (q.dimensions[k] || 0) < 0).length;
  if (pos && !neg && pos > 6) warnings.push(`"${k}" is only measured in one direction (${pos} positive).`);
});

/* ---------- aesthetics ---------- */

const keys = new Set();

aesthetics.forEach((a) => {
  if (keys.has(a.key)) errors.push(`Aesthetic key "${a.key}" appears more than once.`);
  keys.add(a.key);
  if (!a.name || !a.tagline || !a.description) errors.push(`${a.key}: missing name/tagline/description.`);
  if (!Array.isArray(a.palette) || a.palette.length !== 4) errors.push(`${a.key}: palette must have 4 colours.`);
  (a.palette || []).forEach((c) => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) errors.push(`${a.key}: invalid colour "${c}".`);
  });
  if (!Array.isArray(a.keywords) || a.keywords.length < 3) warnings.push(`${a.key}: few keywords.`);
  if (!Array.isArray(a.imageQuery) || !a.imageQuery.length) errors.push(`${a.key}: no imageQuery terms.`);

  const dims = Object.keys(a.dimensions || {});
  if (dims.length < 10) warnings.push(`${a.key}: only ${dims.length} dimensions defined.`);
  dims.forEach((d) => {
    if (!dimKeys.has(d)) errors.push(`${a.key}: unknown dimension "${d}".`);
    const v = a.dimensions[d];
    if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`${a.key}: "${d}" must be 0-1 (is ${v}).`);
  });

  FACETS.forEach((f) => {
    if (!a.world || !a.world[f]) errors.push(`${a.key}: missing world.${f}.`);
  });
  Object.keys(a.world || {}).forEach((f) => {
    if (!FACETS.includes(f)) errors.push(`${a.key}: unknown world facet "${f}".`);
  });
});

aesthetics.forEach((a) => {
  (a.related || []).forEach((r) => {
    if (!keys.has(r)) errors.push(`${a.key}: related points at unknown key "${r}".`);
  });
});

/* ---------- gender-neutral by default ---------- */

/* What the reader sees unless they ask for the gender-specific version has to
   be neutral. The canonical gendered wording belongs in `gendered`, which is
   the only place these words are allowed. */
/* Bare "ma"/"pa" are left out on purpose — they collide with PA systems and
   the like, and grandma/grandpa below already cover the real cases. */
const GENDERED = /\b(girls?|boys?|m[ae]n|wom[ae]n|s?he|hers?|his|him|lad(?:y|ies)|gentlem[ae]n|feminine|masculine|femininity|masculinity|grand(?:mother|father|ma|pa)|mother|father|mum|mom|dad|wife|husband|sister|brother|daughter|sons?|guys?|blokes?|girlfriend|boyfriend|maiden|mistress)\b/i;
const VARIANT_FIELDS = ['name', 'tagline', 'description'];

aesthetics.forEach((a) => {
  ['name', 'tagline', 'description'].forEach((f) => {
    const hit = (a[f] || '').match(GENDERED);
    if (hit) errors.push(`${a.key}: default ${f} uses gendered wording "${hit[0]}" — move it to "gendered".`);
  });
  (a.keywords || []).forEach((k) => {
    const hit = k.match(GENDERED);
    if (hit) errors.push(`${a.key}: keyword "${k}" uses gendered wording "${hit[0]}".`);
  });
  Object.entries(a.world || {}).forEach(([f, v]) => {
    const hit = (v || '').match(GENDERED);
    if (hit) errors.push(`${a.key}: world.${f} uses gendered wording "${hit[0]}".`);
  });

  if (a.gendered === undefined) return;
  const extra = Object.keys(a.gendered).filter((f) => !VARIANT_FIELDS.includes(f));
  if (extra.length) errors.push(`${a.key}: "gendered" may only override ${VARIANT_FIELDS.join('/')} (found ${extra.join(', ')}).`);
  if (!Object.keys(a.gendered).length) errors.push(`${a.key}: "gendered" is empty — drop it.`);
  VARIANT_FIELDS.forEach((f) => {
    if (a.gendered[f] !== undefined && a.gendered[f] === a[f]) {
      errors.push(`${a.key}: gendered.${f} is identical to the neutral one.`);
    }
  });
});

/* The statements are asked of everyone, so they get the same rule. */
questions.forEach((q) => {
  const hit = (q.text || '').match(GENDERED);
  if (hit) errors.push(`Statement ${q.id} uses gendered wording "${hit[0]}".`);
});

/* ---------- narrative ---------- */

dimKeys.forEach((k) => {
  const bank = narrative.dimensionPhrases[k];
  if (!bank) errors.push(`narrative: no dimensionPhrases for "${k}".`);
  else {
    if (!bank.high || !bank.high.length) errors.push(`narrative: "${k}" has no high variants.`);
    if (!bank.low || !bank.low.length) errors.push(`narrative: "${k}" has no low variants.`);
  }
});
FACETS.forEach((f) => {
  if (!narrative.facetModifiers[f]) errors.push(`narrative: no facetModifiers for "${f}".`);
});
Object.keys(narrative.facetModifiers).forEach((f) => {
  if (!FACETS.includes(f)) errors.push(`narrative: unknown facet "${f}".`);
  narrative.facetModifiers[f].forEach((m) => {
    if (!dimKeys.has(m.dim)) errors.push(`narrative: facet "${f}" uses unknown dimension "${m.dim}".`);
  });
});
dimKeys.forEach((k) => {
  const inGroup = (narrative.phraseGroups || []).some((g) => g.includes(k));
  if (!inGroup) warnings.push(`narrative: "${k}" is in no phrase group.`);
});

/* ---------- simulation ---------- */

const sandbox = { window: {}, document: { addEventListener() {} }, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['prng.js', 'selection.js', 'scoring.js', 'narrative.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), sandbox, { filename: f });
});
const AQ = sandbox.window.AQ;

const data = { questions, aesthetics, config, narrative };
data.questionsById = {};
questions.forEach((q) => (data.questionsById[q.id] = q));
data.aestheticsByKey = {};
aesthetics.forEach((a) => (data.aestheticsByKey[a.key] = a));
data.dimensionKeys = config.dimensions.map((d) => d.key);
data.dimensionMeta = {};
config.dimensions.forEach((d) => (data.dimensionMeta[d.key] = d));

/* 1. Selection: right count, no duplicates, no repeated cluster, spread groups. */
let sameGroupInARow = 0;
let duplicateClusters = 0;
const questionUse = {};
const quotaShapes = new Set();

for (let i = 0; i < 400; i++) {
  const sel = AQ.selectQuestions(data, { seed: 'SEED' + i });
  if (sel.questions.length !== config.questionsPerQuiz) {
    errors.push(`Selection ${i} produced ${sel.questions.length} statements.`);
  }
  const seen = new Set();
  const clusters = new Set();
  sel.questions.forEach((q, idx) => {
    if (seen.has(q.id)) errors.push(`Selection ${i}: statement ${q.id} appeared twice.`);
    seen.add(q.id);
    if (clusters.has(q.cluster)) duplicateClusters++;
    clusters.add(q.cluster);
    questionUse[q.id] = (questionUse[q.id] || 0) + 1;
    if (idx > 0 && sel.questions[idx - 1].group === q.group) sameGroupInARow++;
  });
  quotaShapes.add(config.groups.map((g) => sel.quotas[g.key]).join(''));
  config.groups.forEach((g) => {
    const n = sel.questions.filter((q) => q.group === g.key).length;
    if (n < g.min || n > g.max) {
      errors.push(`Selection ${i}: group "${g.key}" gave ${n} statements (should be ${g.min}-${g.max}).`);
    }
  });
  data.dimensionKeys.forEach((k) => {
    if (!sel.coverage[k]) errors.push(`Selection ${i}: dimension "${k}" got no coverage.`);
  });
}

const useCounts = Object.values(questionUse);

/* 2. Determinism: the same seed gives the same quiz. */
const a1 = AQ.selectQuestions(data, { seed: 'REPEAT01' }).questions.map((q) => q.id).join(',');
const a2 = AQ.selectQuestions(data, { seed: 'REPEAT01' }).questions.map((q) => q.id).join(',');
if (a1 !== a2) errors.push('The same seed produced different statements.');

/* 3. History: fresh statements when the previous run is excluded. */
const first = AQ.selectQuestions(data, { seed: 'HISTA' });
const second = AQ.selectQuestions(data, {
  seed: 'HISTB',
  excludeIds: first.questions.map((q) => q.id)
});
const overlap = second.questions.filter((q) => first.questions.some((f) => f.id === q.id)).length;
if (overlap > 6) errors.push(`Too much overlap after the history filter: ${overlap} statements.`);

/* 4. Scoring: varied answer profiles should produce varied winners. */
const winners = {};
const percents = [];
const hiddenPicks = {};
let combos = 0;

const rngFor = (seed) => AQ.rng.rngFromSeed(seed, 'sim');

for (let i = 0; i < 600; i++) {
  const opinionated = i % 2 === 0;
  const sel = AQ.selectQuestions(data, { seed: 'SIM' + i });
  const rng = rngFor('ANSWER' + i);

  /* A person with random but internally consistent preferences. */
  const bias = {};
  data.dimensionKeys.forEach((k) => {
    let b = rng() * 2 - 1;
    if (opinionated) b = Math.sign(b) * Math.pow(Math.abs(b), 0.45);
    bias[k] = b;
  });

  const answers = {};
  sel.questions.forEach((q) => {
    let pull = 0;
    let n = 0;
    Object.entries(q.dimensions).forEach(([k, w]) => {
      pull += bias[k] * (w / 3);
      n += Math.abs(w) / 3;
    });
    const raw = n ? pull / n : 0;
    const noise = (rng() - 0.5) * (opinionated ? 0.5 : 0.8);
    answers[q.id] = Math.max(-3, Math.min(3, Math.round((raw + noise) * 3)));
  });

  const result = AQ.score(sel.questions, answers, data);
  winners[result.primary.key] = (winners[result.primary.key] || 0) + 1;
  hiddenPicks[result.hidden.key] = (hiddenPicks[result.hidden.key] || 0) + 1;
  percents.push(result.primary.percent);
  if (result.combination) combos++;

  if (result.hidden.key === result.primary.key || result.hidden.key === result.secondary.key) {
    errors.push(`Simulation ${i}: hidden equals primary/secondary.`);
  }
  for (let r = 1; r < result.ranked.length; r++) {
    if (result.ranked[r].percent > result.ranked[r - 1].percent) {
      errors.push(`Simulation ${i}: percentages are not monotonic down the ranking.`);
      break;
    }
  }

  const why = AQ.narrative.buildWhy(result, data, rngFor('N' + i));
  if (!why.length) errors.push(`Simulation ${i}: empty "why" text.`);
  const world = AQ.narrative.buildWorld(
    data.aestheticsByKey[result.primary.key], result.profile, data, rngFor('W' + i)
  );
  if (world.length !== 8 || world.some((f) => f.text.length < 15)) {
    errors.push(`Simulation ${i}: incomplete world description.`);
  }
}

const distinctWinners = Object.keys(winners).length;
const topWinner = Object.entries(winners).sort((a, b) => b[1] - a[1])[0];
const avgPct = percents.reduce((s, v) => s + v, 0) / percents.length;

if (distinctWinners < 15) {
  errors.push(`Only ${distinctWinners} distinct winners across 600 simulations - the scoring is too blunt.`);
}
if (topWinner[1] / 600 > 0.2) {
  warnings.push(`"${topWinner[0]}" wins ${((topWinner[1] / 600) * 100).toFixed(0)}% of simulations.`);
}

/* ---------- report ---------- */

console.log('\n— Data —');
console.log(`  statements:    ${questions.length}`);
console.log(`  aesthetics:    ${aesthetics.length}`);
console.log(`  dimensions:    ${config.dimensions.length}`);
console.log(`  groups:        ${config.groups.length} of ${questions.length / config.groups.length}`);
console.log(`  drawn:         ${config.questionsPerQuiz} (${config.groups[0].min}-${config.groups[0].max} per group)`);

console.log('\n— Selection (400 runs) —');
console.log(`  statements used:            ${useCounts.length} / ${questions.length}`);
console.log(`  duplicate clusters:         ${duplicateClusters}`);
console.log(`  same group twice in a row:  ${(sameGroupInARow / 400).toFixed(2)} per quiz`);
console.log(`  distinct quota shapes:      ${quotaShapes.size} of 400 runs`);
console.log(`  overlap after history:      ${overlap} statements`);

console.log('\n— Scoring (600 simulated people) —');
console.log(`  distinct winners:           ${distinctWinners} / ${aesthetics.length}`);
console.log(`  most common winner:         ${topWinner[0]} (${topWinner[1]})`);
console.log(`  distinct hidden picks:      ${Object.keys(hiddenPicks).length}`);
console.log(`  average top match:          ${avgPct.toFixed(1)}%`);
console.log(`  range:                      ${Math.min(...percents)}-${Math.max(...percents)}%`);
console.log(`  combination shown:          ${((combos / 600) * 100).toFixed(0)}% of the time`);

if (warnings.length) {
  console.log('\n— Warnings —');
  [...new Set(warnings)].slice(0, 25).forEach((w) => console.log('  ! ' + w));
  if (warnings.length > 25) console.log(`  … and ${warnings.length - 25} more`);
}

if (errors.length) {
  console.log('\n— Errors —');
  [...new Set(errors)].slice(0, 30).forEach((e) => console.log('  x ' + e));
  console.log(`\n${errors.length} errors.`);
  process.exit(1);
}

console.log('\nEverything checks out.\n');
