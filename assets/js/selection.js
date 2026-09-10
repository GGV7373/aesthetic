/* Velger 50 av 180 spørsmål per gjennomføring.

   Spørsmålene ligger i 18 tematiske grupper med ti spørsmål i hver — hus og rom,
   vær og lys, skjerm og nett, og så videre. Hver gjennomføring trekker 2–3 fra
   hver gruppe. Det gir to ting samtidig: temaene er alltid dekket, og hvilke
   spørsmål du faktisk får er nytt hver gang.

   Resten av kravene:
   - aldri to nesten like spørsmål (samme "cluster") i samme quiz
   - spørsmål brukeren nettopp har hatt, velges bort så lenge det finnes ferske
   - alle dimensjoner skal ha minst litt dekning
   - to spørsmål på rad kommer helst fra ulike grupper
   - alt styres av seed, slik at en gjennomføring kan gjenskapes               */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  function groupByKey(questions) {
    var map = {};
    questions.forEach(function (q) {
      (map[q.group] = map[q.group] || []).push(q);
    });
    return map;
  }

  /* Fordeler de 50 plassene på gruppene. Alle får minimum først, så deles
     resten ut tilfeldig til grupper som har plass — derfor får noen grupper to
     spørsmål og andre tre, og hvilke det er varierer fra gang til gang. */
  function drawQuotas(groups, total, rng) {
    var quota = {};
    var used = 0;
    groups.forEach(function (g) {
      quota[g.key] = g.min;
      used += g.min;
    });

    var room = groups.filter(function (g) { return quota[g.key] < g.max; });
    while (used < total && room.length) {
      var pool = AQ.rng.shuffle(room, rng);
      for (var i = 0; i < pool.length && used < total; i++) {
        quota[pool[i].key]++;
        used++;
      }
      room = groups.filter(function (g) { return quota[g.key] < g.max; });
    }

    /* Skulle minimumene overstige totalen, trimmes de tilfeldig ned igjen. */
    while (used > total) {
      var over = AQ.rng.shuffle(
        groups.filter(function (g) { return quota[g.key] > 0; }),
        rng
      );
      if (!over.length) break;
      quota[over[0].key]--;
      used--;
    }

    return quota;
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

  function takeFromGroup(ordered, quota, usedClusters, chosenIds) {
    var picked = [];
    var i;
    /* Runde 1: respekter cluster-sperren. */
    for (i = 0; i < ordered.length && picked.length < quota; i++) {
      var q = ordered[i];
      if (chosenIds[q.id] || usedClusters[q.cluster]) continue;
      picked.push(q);
      chosenIds[q.id] = true;
      usedClusters[q.cluster] = true;
    }
    /* Runde 2: for få igjen — slipp cluster-kravet framfor å levere færre. */
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

      /* Kast ut spørsmålet som betyr minst: helst fra samme gruppe, og aldri et
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
        if (q.group !== candidate.group) score += 10;
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

  /* Sprer gruppene, slik at rekkefølgen ikke avslører hva som måles. */
  function spread(selected, rng) {
    var buckets = {};
    AQ.rng.shuffle(selected, rng).forEach(function (q) {
      (buckets[q.group] = buckets[q.group] || []).push(q);
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

    var byGroup = groupByKey(data.questions);
    var quotas = drawQuotas(config.groups, total, rng);
    var chosenIds = {};
    var usedClusters = {};
    var selected = [];

    AQ.rng.shuffle(config.groups, rng).forEach(function (group) {
      var pool = byGroup[group.key] || [];
      var ordered = prioritise(pool, excluded, rng);
      selected = selected.concat(
        takeFromGroup(ordered, quotas[group.key], usedClusters, chosenIds)
      );
    });

    /* Sikkerhetsnett hvis en gruppe var for liten til å fylle kvoten sin. */
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
      quotas: quotas,
      coverage: coverageOf(ordered2, data.dimensionKeys)
    };
  };

  AQ.selectionInternals = { coverageOf: coverageOf, spread: spread, drawQuotas: drawQuotas };
})(typeof window !== 'undefined' ? window : globalThis);
