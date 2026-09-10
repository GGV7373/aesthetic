/* Setter sammen resultatteksten.

   To ting skal føles personlige: forklaringen på hvorfor estetikken traff, og
   beskrivelsen av hvordan nettopp din versjon av den ser ut. Begge bygges av
   profilen — aldri av enkeltsvar, og aldri med tall fra scoringen.          */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var FACETS = [
    { key: 'omgivelser', label: 'Omgivelser' },
    { key: 'arkitektur', label: 'Arkitektur' },
    { key: 'interior', label: 'Interiør' },
    { key: 'teknologi', label: 'Teknologi' },
    { key: 'klaer', label: 'Klær' },
    { key: 'musikk', label: 'Musikk' },
    { key: 'farger', label: 'Farger' },
    { key: 'hverdag', label: 'Hverdagsliv' }
  ];

  var HIGH = 0.6;
  var LOW = 0.4;

  function pick(list, rng) {
    if (!list || !list.length) return '';
    return list[Math.floor(rng() * list.length) % list.length];
  }

  function upperFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function phraseFor(narrative, key, value, rng, variantHint) {
    var bank = narrative.dimensionPhrases[key];
    if (!bank) return null;
    var dir = value >= 0.5 ? 'high' : 'low';
    var options = bank[dir];
    if (!options || !options.length) return null;
    if (variantHint !== undefined) return options[variantHint % options.length];
    return pick(options, rng);
  }

  /* Hvor mye en dimensjon faktisk sier om brukeren: avstand fra midten × datagrunnlag. */
  function distinctive(profile, dimensionKeys) {
    return dimensionKeys
      .map(function (k) {
        var v = profile.value[k];
        var c = profile.confidence[k] || 0;
        return { key: k, value: v, confidence: c, strength: Math.abs(v - 0.5) * 2 * c };
      })
      .sort(function (a, b) { return b.strength - a.strength; });
  }

  function joinNorwegian(parts) {
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' og ' + parts[1];
    return parts.slice(0, -1).join(', ') + ' og ' + parts[parts.length - 1];
  }

  /* "Trekkes mot ensomhet", "trenger få mennesker" og "søker vekk fra folk" er tre
     måter å si det samme på. Én per gruppe i hver setning. */
  function groupOf(data, key) {
    var groups = data.narrative.phraseGroups || [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].indexOf(key) >= 0) return 'g' + i;
    }
    return key;
  }

  function buildWhy(result, data, rng) {
    var narrative = data.narrative;
    var profile = result.profile;
    var traits = distinctive(profile, data.dimensionKeys).filter(function (t) {
      return t.strength > 0.18;
    });

    var used = {};
    var sentences = [];

    /* 1. Hvem svarene peker mot, uavhengig av estetikk. */
    var lead = [];
    var leadGroups = {};
    for (var i = 0; i < traits.length && lead.length < 3; i++) {
      var g = groupOf(data, traits[i].key);
      if (leadGroups[g]) continue;
      var p = phraseFor(narrative, traits[i].key, traits[i].value, rng);
      if (!p) continue;
      leadGroups[g] = true;
      used[traits[i].key] = true;
      lead.push(p);
    }
    if (lead.length) {
      sentences.push(pick(narrative.openers, rng) + ' ' + joinNorwegian(lead) + '.');
    }

    /* 2. Hva som faktisk gjorde utslaget for toppestetikken. */
    var primaryParts = (result.primary.parts || []).filter(function (part) {
      return part.agreement > 0.72 && part.weight > 0.25;
    });
    var reasons = [];
    var reasonGroups = {};
    for (var j = 0; j < primaryParts.length && reasons.length < 3; j++) {
      var key = primaryParts[j].key;
      if (used[key]) continue;
      var rg = groupOf(data, key);
      if (reasonGroups[rg]) continue;
      var phrase = phraseFor(narrative, key, primaryParts[j].user, rng, 1);
      if (!phrase) continue;
      reasonGroups[rg] = true;
      used[key] = true;
      reasons.push(phrase);
    }
    if (!reasons.length) {
      for (var k = 0; k < primaryParts.length && reasons.length < 2; k++) {
        var ph = phraseFor(narrative, primaryParts[k].key, primaryParts[k].user, rng);
        if (ph) reasons.push(ph);
      }
    }
    if (reasons.length) {
      var leadIn = pick(narrative.matchLead, rng).replace('{name}', result.primary.name);
      sentences.push(leadIn + ' du ' + joinNorwegian(reasons) + '.');
    }

    /* 3. Der profilen din skiller seg fra den rene versjonen av estetikken. */
    var tension = (result.primary.parts || [])
      .filter(function (part) { return part.agreement < 0.55 && part.weight > 0.3; })
      .sort(function (a, b) { return a.agreement - b.agreement; })[0];
    if (tension) {
      var meta = data.dimensionMeta[tension.key];
      var side = tension.user >= 0.5 ? meta.high : meta.low;
      sentences.push(
        'Du er samtidig mer «' + side.toLowerCase() + '» enn den reneste versjonen av ' +
          result.primary.name + ' pleier å være, og det er dét som gjør varianten din til din egen.'
      );
    }

    return sentences;
  }

  function buildWorld(aesthetic, profile, data, rng) {
    var mods = data.narrative.facetModifiers;
    return FACETS.map(function (facet) {
      var base = (aesthetic.world && aesthetic.world[facet.key]) || '';
      var candidates = (mods[facet.key] || []).filter(function (m) {
        var v = profile.value[m.dim];
        var c = profile.confidence[m.dim] || 0;
        if (v === undefined || c < 0.15) return false;
        return m.dir === 'high' ? v >= HIGH : v <= LOW;
      });

      candidates.sort(function (a, b) {
        var sa = Math.abs(profile.value[a.dim] - 0.5) * (profile.confidence[a.dim] || 0);
        var sb = Math.abs(profile.value[b.dim] - 0.5) * (profile.confidence[b.dim] || 0);
        return sb - sa;
      });

      var text = upperFirst(base);
      if (candidates.length) {
        var chosen = candidates.length > 1 && rng() < 0.35 ? candidates[1] : candidates[0];
        text += ' — ' + chosen.text;
      }
      return { key: facet.key, label: facet.label, text: text + '.' };
    });
  }

  function buildHybrid(combination, data, rng, profile) {
    if (!combination) return null;
    var narrative = data.narrative;
    var a = data.aestheticsByKey[combination.a.key];
    var b = data.aestheticsByKey[combination.b.key];

    function twoKeywords(x) {
      var kws = AQ.rng.shuffle(x.keywords || [], rng).slice(0, 2);
      return kws.length ? joinNorwegian(kws) : x.tagline.toLowerCase();
    }

    var bridge = pick(narrative.hybrid.bridge, rng)
      .replace('{a}', a.name)
      .replace('{b}', b.name)
      .replace('{qa}', twoKeywords(a))
      .replace('{qb}', twoKeywords(b));

    /* Der de to trekker i hver sin retning — og hvilken vei du selv heller. */
    var contrasts = [];
    Object.keys(a.dimensions).forEach(function (k) {
      if (b.dimensions[k] === undefined) return;
      var diff = Math.abs(a.dimensions[k] - b.dimensions[k]);
      if (diff > 0.35) contrasts.push({ key: k, diff: diff, a: a.dimensions[k], b: b.dimensions[k] });
    });
    contrasts.sort(function (x, y) { return y.diff - x.diff; });

    var tension = null;
    if (contrasts.length) {
      var c = contrasts[0];
      var meta = data.dimensionMeta[c.key];
      var mine = profile && profile.value[c.key] !== undefined ? profile.value[c.key] : 0.5;
      var closerToA = Math.abs(c.a - mine);
      var closerToB = Math.abs(c.b - mine);
      var leaning = closerToA <= closerToB ? a.name : b.name;
      tension =
        'De trekker fra hverandre på ' + meta.label.toLowerCase() +
        ', og der lander du nærmest ' + leaning + '.';
    }

    return {
      label: combination.label,
      intro: pick(narrative.hybrid.intro, rng),
      bridge: bridge,
      tension: tension,
      note: combination.related ? narrative.hybrid.relatedNote : narrative.hybrid.unofficialNote
    };
  }

  function strengthLabel(percent, data) {
    var list = data.narrative.strengthLabels;
    for (var i = 0; i < list.length; i++) {
      if (percent >= list[i].min) return list[i].label;
    }
    return list[list.length - 1].label;
  }

  AQ.narrative = {
    facets: FACETS,
    buildWhy: buildWhy,
    buildWorld: buildWorld,
    buildHybrid: buildHybrid,
    hiddenIntro: function (data, rng) { return pick(data.narrative.hidden.intro, rng); },
    strengthLabel: strengthLabel,
    distinctive: distinctive
  };
})(typeof window !== 'undefined' ? window : globalThis);
