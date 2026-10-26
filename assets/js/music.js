/* Music for the result. Hand-picked videos (data/playlists.json) are shown
   where one fits the aesthetic; every aesthetic also gets a YouTube search
   for its own name, so there is always somewhere to go.

   An aesthetic with no video of its own borrows from its closest neighbours.
   "Closest" is the hand-written `related` lists first, then the same family,
   then how alike the two profiles are; anything beyond the cutoff is left with
   the search button rather than a poor fit. */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var playlistIndex = null;
  var relatedIndex = null;

  function playlistsByAesthetic(data) {
    if (playlistIndex) return playlistIndex;
    playlistIndex = {};
    ((data.playlists && data.playlists.curated) || []).forEach(function (p) {
      p.aesthetics.forEach(function (k) {
        (playlistIndex[k] = playlistIndex[k] || []).push(p);
      });
    });
    return playlistIndex;
  }

  /* `related` is written one way round in the data; treat it as mutual. */
  function relatedTo(key, data) {
    if (!relatedIndex) {
      relatedIndex = {};
      data.aesthetics.forEach(function (a) {
        (a.related || []).forEach(function (r) {
          (relatedIndex[a.key] = relatedIndex[a.key] || {})[r] = true;
          (relatedIndex[r] = relatedIndex[r] || {})[a.key] = true;
        });
      });
    }
    return relatedIndex[key] || {};
  }

  /* Mean gap between two profiles over the dimensions both define; null when
     they share none. */
  function profileGap(a, b) {
    var sum = 0, n = 0;
    Object.keys(a.dimensions || {}).forEach(function (k) {
      if (b.dimensions && b.dimensions[k] !== undefined) {
        sum += Math.abs(a.dimensions[k] - b.dimensions[k]);
        n++;
      }
    });
    return n ? sum / n : null;
  }

  /* -> { own: [playlist], borrowed: [{ playlist, from: aesthetic }] }
     Bonus picks from the closest neighbours are always added on top, not only
     when an aesthetic has none of its own - one or two tracks feels thin. */
  function playlistsFor(aesthetic, data) {
    var index = playlistsByAesthetic(data);
    var own = index[aesthetic.key] || [];

    var cfg = (data.playlists && data.playlists.borrow) || null;
    if (!cfg) return { own: own, borrowed: [] };

    var seen = {};
    own.forEach(function (p) { seen[p.id] = true; });

    var related = relatedTo(aesthetic.key, data);
    var near = [];
    Object.keys(index).forEach(function (key) {
      var other = data.aestheticsByKey[key];
      if (!other || key === aesthetic.key) return;
      var gap = profileGap(aesthetic, other);
      if (gap === null) return;
      if (related[key]) gap -= cfg.relatedBonus;
      if (other.family === aesthetic.family) gap -= cfg.familyBonus;
      if (gap <= cfg.cutoff) near.push({ gap: gap, from: other });
    });
    near.sort(function (x, y) { return x.gap - y.gap; });

    /* One video per neighbour, and never one already shown. */
    var borrowed = [];
    near.forEach(function (n) {
      if (borrowed.length >= cfg.max) return;
      var pick = index[n.from.key].filter(function (p) { return !seen[p.id]; })[0];
      if (!pick) return;
      seen[pick.id] = true;
      borrowed.push({ playlist: pick, from: n.from });
    });
    return { own: own, borrowed: borrowed };
  }

  /* Search on the name the aesthetic is known by - the gender-neutral wording is
     what is shown, but "Soft Girl" finds playlists and "Soft Pastel" does not. */
  function searchUrl(aesthetic, data) {
    var cfg = (data.playlists && data.playlists.search) || {};
    var name = aesthetic.gendered && aesthetic.gendered.name
      ? aesthetic.gendered.name
      : (aesthetic.neutral ? aesthetic.neutral.name : aesthetic.name);
    return (cfg.base || 'https://www.youtube.com/results?search_query=') +
      encodeURIComponent(name + ' ' + (cfg.suffix || 'aesthetic playlist'));
  }

  AQ.music = { playlistsFor: playlistsFor, searchUrl: searchUrl };
})(typeof window !== 'undefined' ? window : globalThis);
