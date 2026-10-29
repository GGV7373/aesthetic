/* Compare two people's results.

   A profile is packed into the share link as one character per dimension (0-35,
   base 36; "_" = not measured), so a friend's link carries their whole profile and
   nothing is stored or sent anywhere.                                       */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var LEVELS = 35;

  function encode(profile, data) {
    return data.dimensionKeys.map(function (k) {
      return profile.weightSum[k] > 0 ? Math.round(profile.value[k] * LEVELS).toString(36) : '_';
    }).join('');
  }

  /* Back to a rankable profile, or null if the code is not for this set of dimensions. */
  function decode(code, data) {
    if (!code || code.length !== data.dimensionKeys.length || /[^0-9a-z_]/.test(code)) return null;
    var value = {}, confidence = {};
    data.dimensionKeys.forEach(function (k, i) {
      var n = code[i] === '_' ? NaN : parseInt(code[i], 36);
      var ok = n >= 0 && n <= LEVELS;
      value[k] = ok ? n / LEVELS : 0.5;
      confidence[k] = ok ? 1 : 0;
    });
    return { value: value, confidence: confidence, weightSum: confidence, answered: 0, stretch: 1 };
  }

  /* Closeness over the dimensions both people were measured on, on the same
     percent scale the aesthetic matches use. `rows` is sorted closest first. */
  function compare(mine, theirs, data) {
    var m = data.config.matching;
    var rows = data.config.dimensions.filter(function (d) {
      return mine.confidence[d.key] > 0 && theirs.confidence[d.key] > 0;
    }).map(function (d) {
      return { meta: d, mine: mine.value[d.key], theirs: theirs.value[d.key],
        gap: Math.abs(mine.value[d.key] - theirs.value[d.key]) };
    });
    if (!rows.length) return null;
    var sim = 1 - rows.reduce(function (s, r) { return s + r.gap; }, 0) / rows.length;
    var percent = Math.round(100 * (sim - m.percentFloor) / (m.percentCeil - m.percentFloor));
    rows.sort(function (a, b) { return a.gap - b.gap; });
    return { percent: Math.max(0, Math.min(100, percent)), rows: rows };
  }

  AQ.compare = { encode: encode, decode: decode, compare: compare };
})(typeof window !== 'undefined' ? window : globalThis);
