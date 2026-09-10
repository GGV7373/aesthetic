/* Velger 50 av ~150 spørsmål per gjennomføring.

   Krav som styrer algoritmen:
   - fast kvote per tema, slik at ingen enkelt-dimensjon dominerer
   - aldri to nesten like spørsmål (samme "cluster") i samme quiz
   - spørsmål brukeren nettopp har hatt, velges bort så lenge det finnes ferske
   - alle dimensjoner skal ha minst litt dekning
   - rekkefølgen randomiseres, og to spørsmål på rad kommer helst fra ulike temaer
   - alt styres av seed, slik at en gjennomføring kan gjenskapes                */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  function groupByCategory(questions) {
    var map = {};
    questions.forEach(function (q) {
      (map[q.category] = map[q.category] || []).push(q);
    });
    return map;
  }

  /* Ferske spørsmål først, deretter tidligere brukte — begge grupper stokket. */
  function prioritise(pool, excluded, rng) {
    var shuffled = AQ.rng.shuffle(pool, rng);
    var fresh = [];
    var used = [];
    shuffled.forEach(function (q) {
      (excluded[q.id] ? used : fresh).push(q);
    });
    return fresh.concat(used);
  }

  function takeFromCategory(ordered, quota, usedClusters, chosenIds) {
    var picked = [];
    var i;
    /* Runde 1: respekter cluster-sperren. */
    for (i = 0; i < ordered.length && picked.length < quota; i++) {
      var q = ordered[i];
      if (chosenIds[q.id]) continue;
      if (usedClusters[q.cluster]) continue;
      picked.push(q);
      chosenIds[q.id] = true;
      usedClusters[q.cluster] = true;
    }
    /* Runde 2: for få igjen — slipp cluster-kravet framfor å levere færre spørsmål. */
    for (i = 0; i < ordered.length && picked.length < quota; i++) {
      var q2 = ordered[i];
      if (chosenIds[q2.id]) continue;
      picked.push(q2);
      chosenIds[q2.id] = true;
    }
    return picked;
  }

  function coverageOf(questions, dimensionKeys) {
    var cov = {};
    dimensionKeys.forEach(function (k) { cov[k] = 0; });
    questions.forEach(function (q) {
      Object.keys(q.dimensions).forEach(function (k) {
        if (cov[k] === undefined) cov[k] = 0;
        cov[k] += Math.abs(q.dimensions[k]);
      });
    });
    return cov;
  }

  /* Bytter inn spørsmål for dimensjoner som ellers ville hatt null dekning. */
  function repairCoverage(selected, allQuestions, dimensionKeys, chosenIds, rng) {
    var cov = coverageOf(selected, dimensionKeys);
    var missing = dimensionKeys.filter(function (k) { return !cov[k]; });
    if (!missing.length) return selected;

    var out = selected.slice();
    var clusters = {};
    out.forEach(function (q) { clusters[q.cluster] = true; });
    var candidates = AQ.rng.shuffle(
      allQuestions.filter(function (q) { return !chosenIds[q.id]; }),
      rng
    );

    missing.forEach(function (dim) {
      var candidate = null;
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].dimensions[dim] && !clusters[candidates[i].cluster]) {
          candidate = candidates[i];
          break;
        }
      }
      if (!candidate) return;

      /* Kast ut spørsmålet som betyr minst: helst fra samme tema, og aldri et
         som er eneste kilde til en dimensjon. */
      var currentCov = coverageOf(out, dimensionKeys);
      var victimIndex = -1;
      var victimScore = Infinity;
      out.forEach(function (q, idx) {
        var breaksSomething = Object.keys(q.dimensions).some(function (k) {
          return currentCov[k] - Math.abs(q.dimensions[k]) <= 0;
        });
        if (breaksSomething) return;
        var score = Object.keys(q.dimensions).length;
        if (q.category !== candidate.category) score += 10;
        if (score < victimScore) { victimScore = score; victimIndex = idx; }
      });
      if (victimIndex < 0) return;

      clusters[out[victimIndex].cluster] = false;
      chosenIds[out[victimIndex].id] = false;
      out[victimIndex] = candidate;
      chosenIds[candidate.id] = true;
      clusters[candidate.cluster] = true;
      candidates = candidates.filter(function (q) { return q.id !== candidate.id; });
    });

    return out;
  }

  /* Sprer temaene, slik at rekkefølgen ikke avslører hva som måles. */
  function spread(selected, rng) {
    var buckets = {};
    AQ.rng.shuffle(selected, rng).forEach(function (q) {
      (buckets[q.category] = buckets[q.category] || []).push(q);
    });

    var out = [];
    var previous = null;
    var remaining = selected.length;

    while (remaining > 0) {
      var keys = Object.keys(buckets).filter(function (k) { return buckets[k].length; });
      var eligible = keys.filter(function (k) { return k !== previous; });
      if (!eligible.length) eligible = keys;

      var best = eligible[0];
      eligible.forEach(function (k) {
        if (buckets[k].length > buckets[best].length) best = k;
        else if (buckets[k].length === buckets[best].length && rng() < 0.5) best = k;
      });

      out.push(buckets[best].shift());
      previous = best;
      remaining--;
    }
    return out;
  }

  /* options: { seed, excludeIds: [], total } */
  AQ.selectQuestions = function (data, options) {
    options = options || {};
    var config = data.config;
    var seed = AQ.rng.normaliseSeed(options.seed) || AQ.rng.newSeedString();
    var rng = AQ.rng.rngFromSeed(seed, 'selection');
    var total = options.total || config.questionsPerQuiz;

    var excluded = {};
    (options.excludeIds || []).forEach(function (id) { excluded[id] = true; });

    var byCategory = groupByCategory(data.questions);
    var chosenIds = {};
    var usedClusters = {};
    var selected = [];

    /* Kvotene i seg selv stokkes, så samme tema ikke alltid plukkes først. */
    AQ.rng.shuffle(config.categories, rng).forEach(function (cat) {
      var pool = byCategory[cat.key] || [];
      var ordered = prioritise(pool, excluded, rng);
      selected = selected.concat(takeFromCategory(ordered, cat.quota, usedClusters, chosenIds));
    });

    /* Sikkerhetsnett hvis kvotene ikke summerer til ønsket antall. */
    if (selected.length < total) {
      var rest = prioritise(
        data.questions.filter(function (q) { return !chosenIds[q.id]; }),
        excluded,
        rng
      );
      for (var i = 0; i < rest.length && selected.length < total; i++) {
        selected.push(rest[i]);
        chosenIds[rest[i].id] = true;
      }
    }
    if (selected.length > total) selected = selected.slice(0, total);

    if (config.selection && config.selection.repairZeroCoverage) {
      selected = repairCoverage(selected, data.questions, data.dimensionKeys, chosenIds, rng);
    }

    var ordered2 =
      config.selection && config.selection.spreadCategories === false
        ? AQ.rng.shuffle(selected, rng)
        : spread(selected, rng);

    return {
      seed: seed,
      questions: ordered2,
      coverage: coverageOf(ordered2, data.dimensionKeys)
    };
  };

  AQ.selectionInternals = { coverageOf: coverageOf, spread: spread };
})(typeof window !== 'undefined' ? window : globalThis);
