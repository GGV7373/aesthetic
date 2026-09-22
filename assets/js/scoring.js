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

  /* How far the catalogue's own profiles sit from neutral, on average.

     This matters because the two sides of the match are not on the same scale.
     An aesthetic says "nature 0.95"; a person answering fifty statements never
     produces a 0.95 — their values pile up near the middle, because every
     statement moves several dimensions at once and they pull against each
     other. Compared directly, a vaguely drawn aesthetic (everything near 0.5)
     agrees with everyone, and a sharply drawn one (Cottagecore, Dark Academia)
     can lose to it even for a person who is unmistakably that aesthetic.

     Measured from the data rather than hard-coded, so adding aesthetics keeps
     it honest. */
  function catalogueSpread(data) {
    if (data.catalogueSpread !== undefined) return data.catalogueSpread;
    var sum = 0, n = 0;
    (data.aesthetics || []).forEach(function (a) {
      Object.keys(a.dimensions || {}).forEach(function (k) {
        sum += Math.abs(a.dimensions[k] - 0.5);
        n++;
      });
    });
    data.catalogueSpread = n ? sum / n : 0.22;
    return data.catalogueSpread;
  }

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

    /* Put the profile on the same scale as the aesthetics it is about to be
       compared with (see catalogueSpread). The person's own spread is measured
       confidence-weighted, so a dimension that got one thin statement does not
       decide how far everything else is stretched, and the whole profile is
       then scaled by one factor. That keeps the shape — which dimensions are
       high relative to which — and only changes the range it is expressed in.

       It cuts both ways: someone who answered nearly everything neutrally gets
       opened out, and someone more extreme than the catalogue gets pulled in,
       so the ranking is decided by the shape of a taste rather than by how
       strongly the person happened to press the buttons. */
    var stretch = 1;
    var devSum = 0, devWeight = 0;
    keys.forEach(function (k) {
      var c = confidence[k] || 0;
      if (weightSum[k] <= 0 || c <= 0) return;
      devSum += Math.abs(value[k] - 0.5) * c;
      devWeight += c;
    });
    var own = devWeight > 0 ? devSum / devWeight : 0;
    if (own > 0.01) {
      var m = data.config.matching;
      stretch = clamp(
        catalogueSpread(data) / own,
        m.stretchMin === undefined ? 0.5 : m.stretchMin,
        m.stretchMax === undefined ? 3 : m.stretchMax
      );
      keys.forEach(function (k) {
        if (weightSum[k] <= 0) return;
        value[k] = clamp(0.5 + (value[k] - 0.5) * stretch, 0, 1);
      });
    }

    return {
      value: value,
      confidence: confidence,
      weightSum: weightSum,
      answered: answered,
      stretch: stretch
    };
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
     against this person's own spread. Without that last part every aesthetic
     would land within ten points of the next and the ranking would say
     nothing.                                                               */
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

  /* Debug shortcut (see app.js's local-only ?preview=<key>): scores as if
     someone answered every statement exactly the way this aesthetic's own
     dimensions read, so its result screen can be inspected without taking the
     quiz. Not reachable from real answers - it is not a possible profile. */
  AQ.scorePreview = function (aestheticKey, data) {
    var aesthetic = data.aestheticsByKey[aestheticKey];
    if (!aesthetic) return null;

    var value = {}, confidence = {};
    data.dimensionKeys.forEach(function (k) {
      var has = aesthetic.dimensions[k] !== undefined;
      value[k] = has ? aesthetic.dimensions[k] : 0.5;
      confidence[k] = has ? 1 : 0;
    });
    var profile = { value: value, confidence: confidence, weightSum: confidence, answered: 0, stretch: 1 };
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
