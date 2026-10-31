/* Assembles the result text.

   Two things have to feel personal: why this aesthetic landed on top, and what
   your particular version of it would look like. Both are built from the
   profile — never from single answers, and never with numbers from the scoring. */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var FACETS = [
    { key: 'setting', label: 'Setting' },
    { key: 'architecture', label: 'Architecture' },
    { key: 'interior', label: 'Interior' },
    { key: 'technology', label: 'Technology' },
    { key: 'clothes', label: 'Clothes' },
    { key: 'music', label: 'Music' },
    { key: 'colours', label: 'Colours' },
    { key: 'everyday', label: 'Everyday life' }
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

  /* How much a dimension actually says about someone: distance from the middle,
     multiplied by how much data the quiz gathered for it. */
  function distinctive(profile, dimensionKeys) {
    return dimensionKeys
      .map(function (k) {
        var v = profile.value[k];
        var c = profile.confidence[k] || 0;
        return { key: k, value: v, confidence: c, strength: Math.abs(v - 0.5) * 2 * c };
      })
      .sort(function (a, b) { return b.strength - a.strength; });
  }

  function joinList(parts) {
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' and ' + parts[1];
    return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }

  /* "Drawn to solitude", "needs few people" and "avoids crowds" are three ways of
     saying one thing. One phrase per group in each sentence. */
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

    /* 1. Who the answers point to, independent of any aesthetic. */
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
      sentences.push(pick(narrative.openers, rng) + ' ' + joinList(lead) + '.');
    }

    /* 2. What actually decided the top aesthetic. */
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
      sentences.push(leadIn + ' ' + joinList(reasons) + '.');
    }

    /* 3. Where the profile departs from the pure version of the aesthetic. */
    var tension = (result.primary.parts || [])
      .filter(function (part) { return part.agreement < 0.55 && part.weight > 0.3; })
      .sort(function (a, b) { return a.agreement - b.agreement; })[0];
    if (tension) {
      var meta = data.dimensionMeta[tension.key];
      var side = tension.user >= 0.5 ? meta.high : meta.low;
      sentences.push(
        narrative.tension
          .replace('{side}', side.toLowerCase())
          .replace('{name}', result.primary.name)
      );
    }

    return sentences;
  }

  /* A runner-up set against the top result: one way it fits you better than the
     winner (or, failing that, what it shares with you), and the widest gap
     between it and you. Both come from the scoring parts, so they explain the
     ranking rather than restate the aesthetic's description.
     `skipGap` drops the second sentence: in a family quiz the targets are
     centred on the family (see AQ.familyData), so "it leans bright" would only
     mean brighter than its siblings. */
  function buildCompare(primary, other, data, rng, skipGap) {
    var narrative = data.narrative;
    var strings = narrative.compare;
    var primaryAgreement = {};
    (primary.parts || []).forEach(function (part) { primaryAgreement[part.key] = part.agreement; });

    var solid = (other.parts || []).filter(function (part) {
      return part.weight > 0.2 && part.agreement > 0.7;
    });
    var better = solid
      .map(function (part) {
        var theirs = primaryAgreement[part.key] === undefined ? 0.5 : primaryAgreement[part.key];
        return { part: part, gain: (part.agreement - theirs) * part.weight };
      })
      .filter(function (b) { return b.gain > 0.03; })
      .sort(function (a, b) { return b.gain - a.gain; });

    var sentences = [];
    var pull = better.length ? better[0].part : solid[0];
    var pullPhrase = pull && phraseFor(narrative, pull.key, pull.user, rng);
    if (pullPhrase) {
      sentences.push((better.length ? strings.better : strings.shared)
        .replace('{primary}', primary.name) + ' ' + pullPhrase + '.');
    }

    var gap = (other.parts || [])
      .filter(function (part) { return part.weight > 0.2 && part.agreement < 0.6; })
      .sort(function (a, b) {
        return (1 - a.agreement) * a.weight > (1 - b.agreement) * b.weight ? -1 : 1;
      })[0];
    if (gap && !skipGap) {
      var meta = data.dimensionMeta[gap.key];
      var its = gap.target >= 0.5 ? meta.high : meta.low;
      var yours = gap.user >= 0.5 ? meta.high : meta.low;
      /* Same side but different degree: say which of you goes further. */
      var template = its !== yours ? strings.apart
        : Math.abs(gap.target - 0.5) > Math.abs(gap.user - 0.5) ? strings.further : strings.beyond;
      sentences.push(template
        .replace('{it}', its.toLowerCase())
        .replace('{you}', yours.toLowerCase()));
    }

    return sentences;
  }

  /* The result in one line, for the end of the page. */
  function buildClosing(primaryName, otherNames, data) {
    return data.narrative.compare.closing
      .replace('{primary}', primaryName)
      .replace('{others}', joinList(otherNames));
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
    buildCompare: buildCompare,
    buildClosing: buildClosing,
    strengthLabel: strengthLabel,
    distinctive: distinctive
  };
})(typeof window !== 'undefined' ? window : globalThis);
