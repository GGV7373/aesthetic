/* The hidden scoring.

   Nothing here is about individual aesthetics. The answers first build a profile
   across 35 dimensions; the profile is then measured against each aesthetic's own
   profile. A question about old buildings therefore never scores points for
   "Dark Academia" — it moves history/nostalgia/architecture, and the aesthetics
   fall out of that.                                                          */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* answers: { questionId: -3..3 } */
  function buildProfile(questions, answers, data) {
    var keys = data.dimensionKeys;
    var raw = {}, weightSum = {};
    keys.forEach(function (k) { raw[k] = 0; weightSum[k] = 0; });

    /* Acquiescence guard. Some people lean towards "agree" (or "disagree") on
       almost everything, whatever the statement. Take most of each person's own
       average response out of every answer, so a yea-sayer and a nay-sayer with
       the same underlying taste land in nearly the same place. Kept partial
       (0.6) so a genuinely wide-ranging "yes" still reads as one. */
    var sum = 0, count = 0;
    questions.forEach(function (q) {
      var a = answers[q.id];
      if (a === undefined || a === null) return;
      sum += a / 3;
      count++;
    });
    var centre = count ? 0.6 * (sum / count) : 0;

    var answered = 0;
    questions.forEach(function (q) {
      var a = answers[q.id];
      if (a === undefined || a === null) return;
      answered++;
      var response = clamp(a / 3 - centre, -1, 1); /* -1 .. 1, de-biased */
      Object.keys(q.dimensions).forEach(function (k) {
        if (raw[k] === undefined) { raw[k] = 0; weightSum[k] = 0; }
        var w = q.dimensions[k];
        raw[k] += response * w;
        weightSum[k] += Math.abs(w);
      });
    });

    var value = {}, confidence = {};
    keys.forEach(function (k) {
      value[k] = weightSum[k] > 0 ? clamp(0.5 + 0.5 * (raw[k] / weightSum[k]), 0, 1) : 0.5;
      confidence[k] = clamp(weightSum[k] / (data.config.matching.confidenceFull || 3), 0, 1);
    });

    return { value: value, confidence: confidence, weightSum: weightSum, answered: answered };
  }

  /* How defining a dimension is for an aesthetic: 0.5 is indifferent, 0 and 1 are strong. */
  function salience(v, floor) {
    return Math.max(floor, Math.abs(v - 0.5) * 2);
  }

  function scoreAesthetic(aesthetic, profile, matching) {
    var dims = Object.keys(aesthetic.dimensions);
    var sum = 0, weight = 0;
    var parts = [];

    dims.forEach(function (k) {
      var target = aesthetic.dimensions[k];
      var user = profile.value[k];
      if (user === undefined) return;
      var w = salience(target, matching.minSalience) * (profile.confidence[k] || 0);
      if (w <= 0) return;
      var agreement = 1 - Math.abs(target - user); /* 0..1 */
      sum += w * agreement;
      weight += w;
      parts.push({ key: k, weight: w, agreement: agreement, target: target, user: user });
    });

    var similarity = weight > 0 ? sum / weight : 0.5;

    parts.sort(function (a, b) {
      return b.weight * (b.agreement - 0.5) - a.weight * (a.agreement - 0.5);
    });

    return {
      key: aesthetic.key,
      name: aesthetic.name,
      similarity: similarity,
      percent: 0,
      parts: parts
    };
  }

  /* Percentages are assigned after everything is ranked.

     The top gets an absolute value — how well the aesthetic actually fits the
     profile. The rest are placed by how far they fall below the top, measured
     against this person's own spread. Without that last part all 77 would land
     within ten points of each other and the ranking would say nothing.      */
  function assignPercentages(ranked, matching) {
    if (!ranked.length) return ranked;

    var best = ranked[0].similarity;
    var worst = ranked[ranked.length - 1].similarity;
    var span = Math.max(best - worst, 1e-6);

    var topPercent = clamp(
      Math.round(((best - matching.percentFloor) / (matching.percentCeil - matching.percentFloor)) * 100),
      matching.percentMin,
      matching.percentMax
    );
    var tail = matching.tailPercent === undefined ? 14 : matching.tailPercent;
    var exponent = matching.tailExponent === undefined ? 0.75 : matching.tailExponent;

    ranked.forEach(function (entry) {
      var relative = (best - entry.similarity) / span; /* 0 = best, 1 = weakest */
      var drop = (topPercent - tail) * Math.pow(relative, exponent);
      entry.percent = clamp(Math.round(topPercent - drop), matching.percentMin, matching.percentMax);
    });

    return ranked;
  }

  /* Similarity between two aesthetics — used to find something unexpected, not just second place. */
  function aestheticDistance(a, b) {
    var keys = {};
    Object.keys(a.dimensions).forEach(function (k) { keys[k] = true; });
    Object.keys(b.dimensions).forEach(function (k) { keys[k] = true; });
    var list = Object.keys(keys);
    if (!list.length) return 1;
    var sum = 0, weight = 0;
    list.forEach(function (k) {
      var av = a.dimensions[k] === undefined ? 0.5 : a.dimensions[k];
      var bv = b.dimensions[k] === undefined ? 0.5 : b.dimensions[k];
      var w = Math.max(salience(av, 0.1), salience(bv, 0.1));
      sum += w * Math.abs(av - bv);
      weight += w;
    });
    return weight > 0 ? sum / weight : 1;
  }

  function pickHidden(ranked, data) {
    var cfg = data.config.matching.hidden;
    var top1 = data.aestheticsByKey[ranked[0].key];
    var top2 = ranked[1] ? data.aestheticsByKey[ranked[1].key] : null;

    var blocked = {};
    blocked[ranked[0].key] = true;
    if (top2) blocked[top2.key] = true;
    (top1.related || []).forEach(function (k) { blocked[k] = true; });
    if (top2) (top2.related || []).forEach(function (k) { blocked[k] = true; });

    var slice = ranked.slice(cfg.minRank - 1, cfg.maxRank);
    var best = null;

    slice.forEach(function (entry) {
      var a = data.aestheticsByKey[entry.key];
      if (!a) return;
      var novelty = aestheticDistance(top1, a);
      if (top2) novelty = Math.min(novelty, aestheticDistance(top2, a));
      var fit = entry.percent / 100;
      var score =
        fit * (1 - cfg.noveltyWeight) + novelty * cfg.noveltyWeight - (blocked[entry.key] ? 0.25 : 0);
      if (entry.percent < cfg.minPercent) score -= 0.2;
      if (!best || score > best.score) best = { entry: entry, score: score, novelty: novelty };
    });

    return best ? best.entry : ranked[2] || ranked[ranked.length - 1];
  }

  function detectCombination(ranked, data) {
    var threshold = data.config.matching.combinationThreshold;
    if (!ranked[1]) return null;
    if (ranked[0].percent - ranked[1].percent > threshold) return null;
    var a = data.aestheticsByKey[ranked[0].key];
    var b = data.aestheticsByKey[ranked[1].key];
    var relatedAlready =
      (a.related || []).indexOf(b.key) >= 0 || (b.related || []).indexOf(a.key) >= 0;
    return {
      a: ranked[0],
      b: ranked[1],
      label: a.name + ' × ' + b.name,
      gap: ranked[0].percent - ranked[1].percent,
      related: relatedAlready,
      distance: aestheticDistance(a, b)
    };
  }

  AQ.score = function (questions, answers, data) {
    var profile = buildProfile(questions, answers, data);
    var matching = data.config.matching;

    var ranked = assignPercentages(
      data.aesthetics
        .map(function (a) { return scoreAesthetic(a, profile, matching); })
        .sort(function (x, y) { return y.similarity - x.similarity; }),
      matching
    );

    return {
      profile: profile,
      ranked: ranked,
      primary: ranked[0],
      secondary: ranked[1],
      hidden: pickHidden(ranked, data),
      combination: detectCombination(ranked, data)
    };
  };

  AQ.scoringInternals = {
    buildProfile: buildProfile,
    assignPercentages: assignPercentages,
    aestheticDistance: aestheticDistance,
    salience: salience
  };
})(typeof window !== 'undefined' ? window : globalThis);
