/* Skjult scoring.

   Ingenting her handler om enkelt-estetikker. Svarene bygger først en profil på
   35 dimensjoner; deretter måles profilen mot hver estetikks egen profil. Et
   spørsmål om gamle bygninger gir altså aldri poeng til "Dark Academia" — det
   flytter history/nostalgia/architecture, og estetikkene faller ut av det.   */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* answers: { questionId: -3..3 } */
  function buildProfile(questions, answers, data) {
    var keys = data.dimensionKeys;
    var raw = {}, weightSum = {};
    keys.forEach(function (k) { raw[k] = 0; weightSum[k] = 0; });

    var answered = 0;
    questions.forEach(function (q) {
      var a = answers[q.id];
      if (a === undefined || a === null) return;
      answered++;
      var response = a / 3; /* -1 .. 1 */
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

  /* Hvor definerende en dimensjon er for en estetikk: 0.5 er likegyldig, 0 og 1 er sterkt. */
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

  /* Prosentene settes etter at alt er rangert.

     Toppen får en absolutt verdi — hvor godt estetikken faktisk passer profilen.
     Resten plasseres i forhold til hvor langt de faller under toppen, målt mot
     brukerens egen spredning. Uten det siste ville alle 65 landet innenfor ti
     prosentpoeng av hverandre, og rangeringen ville sagt ingenting.          */
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
      var relative = (best - entry.similarity) / span; /* 0 = best, 1 = svakest */
      var drop = (topPercent - tail) * Math.pow(relative, exponent);
      entry.percent = clamp(Math.round(topPercent - drop), matching.percentMin, matching.percentMax);
    });

    return ranked;
  }

  /* Likhet mellom to estetikker — brukes til å finne noe uventet, ikke bare nest beste. */
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
