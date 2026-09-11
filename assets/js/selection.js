/* Picks 50 statements out of the bank for each run.

   The statements sit in 20 themed groups of ten or more — sound and silence, food
   and the table, screens and the net, and so on. Every run draws 2-3 from each
   group. That buys two things at once: the themes are always covered, and which
   statements you actually get is new each time.

   The rest of the requirements:
   - never two near-identical statements (same "cluster") in one quiz
   - statements just seen are set aside while fresh ones remain
   - every dimension has to get at least some coverage
   - two statements in a row should come from different groups
   - a person can nudge which groups are more likely to get the extra slot
     (their "3" instead of "2") by saying what matters to them - every group
     still keeps its guaranteed minimum either way
   - everything is driven by the seed, so a run can be recreated              */
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

  /* Hands the 50 slots out to the groups. Everyone gets their minimum first, then
     the remainder goes out at random to groups with room — which is why some
     groups give two statements and others three, and why that shifts each run.

     weightOf(group), if given, biases who tends to pick up that extra slot —
     a group someone said mattered to them is more likely to land it, but
     never guaranteed to, and every group still keeps its minimum regardless. */
  function drawQuotas(groups, total, rng, weightOf) {
    var quota = {};
    var used = 0;
    groups.forEach(function (g) {
      quota[g.key] = g.min;
      used += g.min;
    });

    var room = groups.filter(function (g) { return quota[g.key] < g.max; });
    while (used < total && room.length) {
      var pool = weightOf ? AQ.rng.weightedShuffle(room, rng, weightOf) : AQ.rng.shuffle(room, rng);
      for (var i = 0; i < pool.length && used < total; i++) {
        quota[pool[i].key]++;
        used++;
      }
      room = groups.filter(function (g) { return quota[g.key] < g.max; });
    }

    /* Should the minimums exceed the total, trim back down at random. */
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

  /* Fresh statements first, then previously used ones — both halves shuffled. */
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
    /* Pass 1: respect the cluster lock. */
    for (i = 0; i < ordered.length && picked.length < quota; i++) {
      var q = ordered[i];
      if (chosenIds[q.id] || usedClusters[q.cluster]) continue;
      picked.push(q);
      chosenIds[q.id] = true;
      usedClusters[q.cluster] = true;
    }
    /* Pass 2: too few left — drop the cluster rule rather than deliver fewer. */
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

  /* Swaps in statements for dimensions that would otherwise get no coverage. */
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

      /* Drop the statement that matters least: preferably from the same group, and
         never one that is the only source for a dimension. */
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

  /* Spreads the groups out, so the order gives nothing away about what is measured. */
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

  /* options: { seed, excludeIds: [], total, preferredGroups: [] } */
  AQ.selectQuestions = function (data, options) {
    options = options || {};
    var config = data.config;
    var seed = AQ.rng.normaliseSeed(options.seed) || AQ.rng.newSeedString();
    var rng = AQ.rng.rngFromSeed(seed, 'selection');
    var total = options.total || config.questionsPerQuiz;

    var excluded = {};
    (options.excludeIds || []).forEach(function (id) { excluded[id] = true; });

    var preferred = null;
    if (options.preferredGroups && options.preferredGroups.length) {
      preferred = {};
      options.preferredGroups.forEach(function (key) { preferred[key] = true; });
    }
    var preferenceWeight = (config.selection && config.selection.preferenceWeight) || 3;
    var weightOf = preferred
      ? function (g) { return preferred[g.key] ? preferenceWeight : 1; }
      : null;

    var byGroup = groupByKey(data.questions);
    var quotas = drawQuotas(config.groups, total, rng, weightOf);
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

    /* Safety net if a group was too small to fill its quota. */
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
