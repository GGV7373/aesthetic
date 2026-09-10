/* Sjekker at datafilene henger sammen, og simulerer testen for å se at
   utvalg og scoring oppfører seg.

   Kjør:  node tools/validate.js                                            */
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

/* ---------- dimensjoner ---------- */

const dimKeys = new Set(config.dimensions.map((d) => d.key));
if (dimKeys.size !== config.dimensions.length) errors.push('Duplikate dimensjonsnøkler.');

/* ---------- spørsmål ---------- */

const ids = new Set();
const perGroup = {};
const clusterUse = {};

questions.forEach((q) => {
  if (ids.has(q.id)) errors.push(`Spørsmål-id ${q.id} finnes flere ganger.`);
  ids.add(q.id);
  if (!q.text || q.text.length < 20) errors.push(`Spørsmål ${q.id} mangler tekst.`);
  if (!q.group) errors.push(`Spørsmål ${q.id} mangler gruppe.`);
  if (!q.cluster) errors.push(`Spørsmål ${q.id} mangler cluster.`);
  perGroup[q.group] = (perGroup[q.group] || 0) + 1;
  clusterUse[q.cluster] = (clusterUse[q.cluster] || 0) + 1;

  const dims = Object.keys(q.dimensions || {});
  if (!dims.length) errors.push(`Spørsmål ${q.id} påvirker ingen dimensjoner.`);
  if (dims.length < 2) warnings.push(`Spørsmål ${q.id} påvirker bare én dimensjon.`);
  dims.forEach((d) => {
    if (!dimKeys.has(d)) errors.push(`Spørsmål ${q.id} bruker ukjent dimensjon "${d}".`);
    const w = q.dimensions[d];
    if (typeof w !== 'number' || Math.abs(w) > 3 || w === 0) {
      errors.push(`Spørsmål ${q.id}: vekt for "${d}" bør være -3..3 og ikke 0 (er ${w}).`);
    }
  });
});

/* ---------- grupper ---------- */

const quotaLow = config.groups.reduce((s, g) => s + g.min, 0);
const quotaHigh = config.groups.reduce((s, g) => s + g.max, 0);
if (config.questionsPerQuiz < quotaLow || config.questionsPerQuiz > quotaHigh) {
  errors.push(`Gruppene kan gi ${quotaLow}–${quotaHigh} spørsmål, men quizen skal ha ${config.questionsPerQuiz}.`);
}
config.groups.forEach((g) => {
  const have = perGroup[g.key] || 0;
  if (have < g.max) errors.push(`Gruppe "${g.key}": ${have} spørsmål, men kan trekke inntil ${g.max}.`);
  else if (have < g.max * 3) warnings.push(`Gruppe "${g.key}" har lite å variere med (${have}).`);
});
Object.keys(perGroup).forEach((k) => {
  if (!config.groups.some((g) => g.key === k)) errors.push(`Ukjent gruppe "${k}" i spørsmål.`);
});

/* Ingen cluster må være så stor at kvoten ikke kan fylles uten duplikater. */
Object.entries(clusterUse).forEach(([cluster, n]) => {
  if (n > 3) warnings.push(`Cluster "${cluster}" brukes ${n} ganger — sjekk at de ikke er for like.`);
});

/* ---------- dekning per dimensjon ---------- */

const coverage = {};
dimKeys.forEach((k) => (coverage[k] = 0));
questions.forEach((q) =>
  Object.entries(q.dimensions).forEach(([k, w]) => (coverage[k] += Math.abs(w)))
);
Object.entries(coverage).forEach(([k, v]) => {
  if (v === 0) errors.push(`Dimensjonen "${k}" måles ikke av noe spørsmål.`);
  else if (v < 8) warnings.push(`Dimensjonen "${k}" har tynn dekning (vektsum ${v}).`);
});

/* Både positive og negative formuleringer per dimensjon. */
dimKeys.forEach((k) => {
  const pos = questions.filter((q) => (q.dimensions[k] || 0) > 0).length;
  const neg = questions.filter((q) => (q.dimensions[k] || 0) < 0).length;
  if (pos && !neg && pos > 6) warnings.push(`"${k}" måles bare i én retning (${pos} positive).`);
});

/* ---------- estetikker ---------- */

const keys = new Set();
const FACETS = ['omgivelser', 'arkitektur', 'interior', 'teknologi', 'klaer', 'musikk', 'farger', 'hverdag'];

aesthetics.forEach((a) => {
  if (keys.has(a.key)) errors.push(`Estetikk-nøkkel "${a.key}" finnes flere ganger.`);
  keys.add(a.key);
  if (!a.name || !a.tagline || !a.description) errors.push(`${a.key}: mangler navn/tagline/beskrivelse.`);
  if (!Array.isArray(a.palette) || a.palette.length !== 4) errors.push(`${a.key}: palette må ha 4 farger.`);
  (a.palette || []).forEach((c) => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) errors.push(`${a.key}: ugyldig farge "${c}".`);
  });
  if (!Array.isArray(a.keywords) || a.keywords.length < 3) warnings.push(`${a.key}: få nøkkelord.`);

  const dims = Object.keys(a.dimensions || {});
  if (dims.length < 10) warnings.push(`${a.key}: bare ${dims.length} dimensjoner definert.`);
  dims.forEach((d) => {
    if (!dimKeys.has(d)) errors.push(`${a.key}: ukjent dimensjon "${d}".`);
    const v = a.dimensions[d];
    if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`${a.key}: "${d}" må være 0–1 (er ${v}).`);
  });

  FACETS.forEach((f) => {
    if (!a.world || !a.world[f]) errors.push(`${a.key}: mangler world.${f}.`);
  });
});

aesthetics.forEach((a) => {
  (a.related || []).forEach((r) => {
    if (!keys.has(r)) errors.push(`${a.key}: related peker på ukjent nøkkel "${r}".`);
  });
});

/* ---------- narrativ ---------- */

dimKeys.forEach((k) => {
  const bank = narrative.dimensionPhrases[k];
  if (!bank) errors.push(`narrative: mangler dimensionPhrases for "${k}".`);
  else {
    if (!bank.high || !bank.high.length) errors.push(`narrative: "${k}" mangler high-varianter.`);
    if (!bank.low || !bank.low.length) errors.push(`narrative: "${k}" mangler low-varianter.`);
  }
});
Object.keys(narrative.facetModifiers).forEach((f) => {
  if (!FACETS.includes(f)) errors.push(`narrative: ukjent fasett "${f}".`);
  narrative.facetModifiers[f].forEach((m) => {
    if (!dimKeys.has(m.dim)) errors.push(`narrative: fasett "${f}" bruker ukjent dimensjon "${m.dim}".`);
  });
});

/* ---------- simulering ---------- */

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

/* 1. Utvalget: riktig antall, ingen duplikater, ingen dobbel cluster, spredte temaer. */
let sameGroupInARow = 0;
let duplicateClusters = 0;
const questionUse = {};
const quotaShapes = new Set();

for (let i = 0; i < 400; i++) {
  const sel = AQ.selectQuestions(data, { seed: 'SEED' + i });
  if (sel.questions.length !== config.questionsPerQuiz) {
    errors.push(`Utvalg ${i} ga ${sel.questions.length} spørsmål.`);
  }
  const seen = new Set();
  const clusters = new Set();
  sel.questions.forEach((q, idx) => {
    if (seen.has(q.id)) errors.push(`Utvalg ${i}: spørsmål ${q.id} kom med to ganger.`);
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
      errors.push(`Utvalg ${i}: gruppe "${g.key}" ga ${n} spørsmål (skal være ${g.min}–${g.max}).`);
    }
  });
  data.dimensionKeys.forEach((k) => {
    if (!sel.coverage[k]) errors.push(`Utvalg ${i}: dimensjonen "${k}" har null dekning.`);
  });
}

const useCounts = Object.values(questionUse);
if (useCounts.length !== questions.length) {
  warnings.push(`Bare ${useCounts.length} av ${questions.length} spørsmål ble brukt i 400 kjøringer.`);
}

/* 2. Determinisme: samme seed => samme quiz. */
const a1 = AQ.selectQuestions(data, { seed: 'REPEAT01' }).questions.map((q) => q.id).join(',');
const a2 = AQ.selectQuestions(data, { seed: 'REPEAT01' }).questions.map((q) => q.id).join(',');
if (a1 !== a2) errors.push('Samme seed ga ulike spørsmål.');

/* 3. Historikk: nye spørsmål når forrige runde utelates. */
const first = AQ.selectQuestions(data, { seed: 'HISTA' });
const second = AQ.selectQuestions(data, {
  seed: 'HISTB',
  excludeIds: first.questions.map((q) => q.id)
});
const overlap = second.questions.filter((q) => first.questions.some((f) => f.id === q.id)).length;
if (overlap > 6) errors.push(`For stort overlapp etter historikk-filter: ${overlap} spørsmål.`);

/* 4. Scoring: varierte svarprofiler skal gi varierte vinnere. */
const winners = {};
const percents = [];
const hiddenPicks = {};
let combos = 0;

function rngFor(seed) {
  return AQ.rng.rngFromSeed(seed, 'sim');
}

for (let i = 0; i < 600; i++) {
  const sel = AQ.selectQuestions(data, { seed: 'SIM' + i });
  const rng = rngFor('ANSWER' + i);
  /* Simulerer en person med tilfeldige, men indre konsistente preferanser. */
  const bias = {};
  data.dimensionKeys.forEach((k) => (bias[k] = rng() * 2 - 1));
  const answers = {};
  sel.questions.forEach((q) => {
    let pull = 0;
    let n = 0;
    Object.entries(q.dimensions).forEach(([k, w]) => {
      pull += bias[k] * (w / 3);
      n += Math.abs(w) / 3;
    });
    const raw = n ? pull / n : 0;
    const noise = (rng() - 0.5) * 0.8;
    answers[q.id] = Math.max(-3, Math.min(3, Math.round((raw + noise) * 3)));
  });

  const result = AQ.score(sel.questions, answers, data);
  winners[result.primary.key] = (winners[result.primary.key] || 0) + 1;
  hiddenPicks[result.hidden.key] = (hiddenPicks[result.hidden.key] || 0) + 1;
  percents.push(result.primary.percent);
  if (result.combination) combos++;

  if (result.hidden.key === result.primary.key || result.hidden.key === result.secondary.key) {
    errors.push(`Simulering ${i}: hidden er lik primary/secondary.`);
  }

  const why = AQ.narrative.buildWhy(result, data, rngFor('N' + i));
  if (!why.length) errors.push(`Simulering ${i}: tom "hvorfor"-tekst.`);
  const world = AQ.narrative.buildWorld(data.aestheticsByKey[result.primary.key], result.profile, data, rngFor('W' + i));
  if (world.length !== 8 || world.some((f) => f.text.length < 15)) {
    errors.push(`Simulering ${i}: mangelfull verdensbeskrivelse.`);
  }
}

const distinctWinners = Object.keys(winners).length;
const topWinner = Object.entries(winners).sort((a, b) => b[1] - a[1])[0];
const avgPct = percents.reduce((s, v) => s + v, 0) / percents.length;

if (distinctWinners < 15) {
  errors.push(`Bare ${distinctWinners} ulike vinnere på 600 simuleringer — scoringen er for grovkornet.`);
}
if (topWinner[1] / 600 > 0.2) {
  warnings.push(`"${topWinner[0]}" vinner ${((topWinner[1] / 600) * 100).toFixed(0)} % av simuleringene.`);
}

/* ---------- rapport ---------- */

console.log('\n— Datafiler —');
console.log(`  spørsmål:      ${questions.length}`);
console.log(`  estetikker:    ${aesthetics.length}`);
console.log(`  dimensjoner:   ${config.dimensions.length}`);
console.log(`  grupper:       ${config.groups.length} à ${questions.length / config.groups.length}`);
console.log(`  trekkes:       ${config.questionsPerQuiz} (2–3 per gruppe)`);

console.log('\n— Utvalg (400 kjøringer) —');
console.log(`  spørsmål i bruk:            ${useCounts.length} / ${questions.length}`);
console.log(`  dupliserte clustere:        ${duplicateClusters}`);
console.log(`  samme gruppe to på rad:     ${(sameGroupInARow / 400).toFixed(2)} per quiz`);
console.log(`  ulike kvotefordelinger:     ${quotaShapes.size} av 400 kjøringer`);
console.log(`  overlapp etter historikk:   ${overlap} spørsmål`);

console.log('\n— Scoring (600 simulerte personer) —');
console.log(`  ulike vinnere:              ${distinctWinners} / ${aesthetics.length}`);
console.log(`  vanligste vinner:           ${topWinner[0]} (${topWinner[1]})`);
console.log(`  ulike skjulte estetikker:   ${Object.keys(hiddenPicks).length}`);
console.log(`  snitt-match øverst:         ${avgPct.toFixed(1)} %`);
console.log(`  spenn:                      ${Math.min(...percents)}–${Math.max(...percents)} %`);
console.log(`  kombinasjon vist:           ${((combos / 600) * 100).toFixed(0)} % av gangene`);

if (warnings.length) {
  console.log('\n— Advarsler —');
  warnings.slice(0, 25).forEach((w) => console.log('  ! ' + w));
  if (warnings.length > 25) console.log(`  … og ${warnings.length - 25} til`);
}

if (errors.length) {
  console.log('\n— Feil —');
  [...new Set(errors)].slice(0, 30).forEach((e) => console.log('  ✗ ' + e));
  console.log(`\n${errors.length} feil.`);
  process.exit(1);
}

console.log('\nAlt henger sammen.\n');
