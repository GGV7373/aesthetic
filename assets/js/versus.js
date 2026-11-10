/* Compare two aesthetics side by side: what each one is, what they share and
   where they differ. The pair lives in the URL (?a=key&b=key) so it can be sent. */
(function (global) {
  'use strict';
  var AQ = global.AQ;
  var doc = global.document;

  var FACETS = [
    ['setting', 'Setting'], ['architecture', 'Architecture'], ['interior', 'Interior'],
    ['technology', 'Technology'], ['clothes', 'Clothes'], ['music', 'Music'],
    ['colours', 'Colours'], ['everyday', 'Everyday life']
  ];
  var DEFAULT_A = 'cottagecore', DEFAULT_B = 'cyberpunk';

  function el(tag, attrs, kids) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') n[k] = v;
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(global.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function wikiUrl(a) {
    var title = a.wiki || (a.gendered && a.gendered.name) || (a.neutral && a.neutral.name) || a.name;
    return 'https://aesthetics.fandom.com/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }

  /* An aesthetic as a rankable profile, so compare.js can score two of them. */
  function asProfile(a, data) {
    var value = {}, confidence = {};
    data.dimensionKeys.forEach(function (k) {
      var v = a.dimensions && a.dimensions[k];
      value[k] = typeof v === 'number' ? v : 0.5;
      confidence[k] = typeof v === 'number' ? 1 : 0;
    });
    return { value: value, confidence: confidence, weightSum: confidence };
  }

  /* How alike two aesthetics are. Counts every dimension either one has: a
     dimension an aesthetic leaves out is not part of it, so it sits at 0.5 -
     the same reading the quiz scoring gives it. Each dimension counts by how
     defining it is to either of them, so two shrugs at 0.5 add little.
     The raw score lands between about 48 and 92 over all pairs; the
     percentage stretches 45..95 onto 0..100 so the words below spread out.
     tools/check-compare.js prints the spread if the data changes.          */
  var STRETCH_LOW = 0.45, STRETCH_HIGH = 0.95;

  function pairScore(a, b, data) {
    var sum = 0, weight = 0, shared = 0, oneSided = 0;
    var floor = data.config.matching.minSalience;
    data.dimensionKeys.forEach(function (k) {
      var x = a.dimensions[k], y = b.dimensions[k];
      var hasX = typeof x === 'number', hasY = typeof y === 'number';
      if (!hasX && !hasY) return;
      if (hasX && hasY) shared++; else oneSided++;
      var vx = hasX ? x : 0.5, vy = hasY ? y : 0.5;
      var w = Math.max(floor, Math.abs(vx - 0.5) * 2, Math.abs(vy - 0.5) * 2);
      sum += w * (1 - Math.abs(vx - vy));
      weight += w;
    });
    var raw = weight ? sum / weight : 0.5;
    var percent = Math.round(100 * (raw - STRETCH_LOW) / (STRETCH_HIGH - STRETCH_LOW));
    return { raw: raw, percent: Math.max(0, Math.min(100, percent)), shared: shared, oneSided: oneSided };
  }

  function verdictFor(pct) {
    return pct >= 85 ? 'Nearly the same thing' : pct >= 70 ? 'Close relatives' : pct >= 55 ? 'Quite alike'
      : pct >= 40 ? 'Some common ground' : pct >= 25 ? 'Quite different' : 'Almost opposites';
  }

  function dot(v, cls) {
    return el('span', { class: 'cmp__dot ' + cls, style: 'left:' + Math.round(v * 100) + '%' });
  }

  function dimRow(r, an, bn) {
    return el('div', { class: 'cmp__row' }, [
      el('div', { class: 'cmp__rowhead' }, [
        el('span', { class: 'cmp__label', text: r.meta.label }),
        el('span', { class: 'cmp__nums', text: Math.round(r.mine * 100) + ' · ' + Math.round(r.theirs * 100) })
      ]),
      el('div', { class: 'cmp__track' }, [dot(r.mine, 'cmp__dot--you'), dot(r.theirs, 'cmp__dot--friend')]),
      el('div', { class: 'cmp__poles' }, [
        el('span', { text: r.meta.low || '' }), el('span', { text: r.meta.high || '' })
      ])
    ]);
  }

  /* ---- the sentences: every one has to match the numbers, whichever two are picked ---- */

  /* Pairs of dimensions that say nearly the same thing; only the first of a pair is listed. */
  var TWINS = {
    order: 'chaos', chaos: 'order', minimalism: 'maximalism', maximalism: 'minimalism',
    social: 'solitude', solitude: 'social', optimism: 'melancholy', melancholy: 'optimism',
    fantasy: 'realism', realism: 'fantasy', rural: 'urban', urban: 'rural',
    nature: 'organic', organic: 'nature', history: 'modernity', modernity: 'history',
    technology: 'digital', digital: 'technology'
  };

  /* 1 = leans to the high end, -1 = the low end, 0 = in the middle. */
  function lean(v) { return v >= 0.6 ? 1 : v <= 0.4 ? -1 : 0; }
  function pole(r, dir) { return ((dir > 0 ? r.meta.high : r.meta.low) || '').toLowerCase(); }

  function dedupe(rows) {
    var seen = {};
    return rows.filter(function (r) {
      if (seen[TWINS[r.meta.key]]) return false;
      seen[r.meta.key] = true;
      return true;
    });
  }

  /* Shared: close together (15 points or less) and on the same side, or both in the middle. */
  function sharedRows(rows) {
    return dedupe(rows.filter(function (r) { return r.gap <= 0.15 && lean(r.mine) === lean(r.theirs); }));
  }
  function shareSentence(r) {
    var d = lean(r.mine);
    return r.meta.label + ': ' + (d ? 'both lean ' + pole(r, d) : 'both sit in the middle') + '.';
  }

  /* Apart: at least 25 points between them, biggest first. */
  function apartRows(rows) {
    return dedupe(rows.slice().reverse().filter(function (r) { return r.gap >= 0.25; }));
  }
  function gapSentence(r, a, b) {
    var hiA = r.mine > r.theirs;
    var hi = hiA ? a : b, lo = hiA ? b : a;
    var vh = Math.max(r.mine, r.theirs), vl = Math.min(r.mine, r.theirs);
    var dh = lean(vh), dl = lean(vl);
    /* Same side, different strength: say so instead of pretending they are opposites. */
    if (dh > 0 && dl > 0) return r.meta.label + ': both lean ' + pole(r, 1) + ', ' + hi.name + ' much more so.';
    if (dh < 0 && dl < 0) return r.meta.label + ': both lean ' + pole(r, -1) + ', ' + lo.name + ' much more so.';
    function part(who, v) { var d = lean(v); return who.name + (d ? ' leans ' + pole(r, d) : ' sits in the middle'); }
    return r.meta.label + ': ' + part(hi, vh) + ', ' + part(lo, vl) + '.';
  }

  /* For tools/check-compare.js. */
  AQ.versus = { asProfile: asProfile, pairScore: pairScore, verdictFor: verdictFor, lean: lean, sharedRows: sharedRows, shareSentence: shareSentence,
    apartRows: apartRows, gapSentence: gapSentence };

  function card(a, data, cls) {
    var photo = data.photos && data.photos[a.key];
    return el('article', { class: 'vs__card ' + cls }, [
      photo ? el('div', { class: 'vs__photo' }, [el('img', { src: photo.file, alt: '', decoding: 'async' })]) : null,
      el('p', { class: 'eyebrow', text: a.family }),
      el('h2', { class: 'vs__name', text: a.name }),
      el('p', { class: 'vs__tagline', text: a.tagline }),
      el('p', { class: 'vs__desc', text: a.description }),
      el('ul', { class: 'vs__keywords' }, (a.keywords || []).map(function (k) { return el('li', { text: k }); })),
      el('div', { class: 'vs__palette' }, (a.palette || []).map(function (c) {
        return el('span', { class: 'vs__swatch', style: 'background:' + c, title: c });
      })),
      el('a', { class: 'vs__wiki', href: wikiUrl(a), target: '_blank', rel: 'noopener noreferrer',
        text: 'Pictures on Aesthetics Wiki' })
    ]);
  }

  function picker(label, data, value, onChange) {
    var sel = el('select', { class: 'vs__select', 'aria-label': label });
    var fams = [];
    data.aesthetics.forEach(function (a) { if (fams.indexOf(a.family) < 0) fams.push(a.family); });
    fams.forEach(function (f) {
      var g = el('optgroup', { label: f });
      data.aesthetics.filter(function (a) { return a.family === f; })
        .sort(function (x, y) { return x.name.localeCompare(y.name); })
        .forEach(function (a) {
          var o = el('option', { value: a.key, text: a.name });
          if (a.key === value) o.selected = true;
          g.appendChild(o);
        });
      sel.appendChild(g);
    });
    sel.onchange = function () { onChange(sel.value); };
    return el('label', { class: 'vs__pick' }, [el('span', { class: 'vs__picklabel', text: label }), sel]);
  }

  function boot(data) {
    var root = doc.getElementById('app');
    var keyA = data.aestheticsByKey[param('a')] ? param('a') : DEFAULT_A;
    var keyB = data.aestheticsByKey[param('b')] ? param('b') : DEFAULT_B;
    var showAll = false;

    function go(a, b) {
      keyA = a; keyB = b;
      try { global.history.replaceState(null, '', '?a=' + a + '&b=' + b); } catch (e) { /* ignore */ }
      paint();
    }

    function paint() {
      var a = data.aestheticsByKey[keyA], b = data.aestheticsByKey[keyB];
      var diff = AQ.compare.compare(asProfile(a, data), asProfile(b, data), data);
      var same = keyA === keyB;
      var score = pairScore(a, b, data);
      var pct = same ? 100 : score.percent;
      var verdict = verdictFor(pct);
      var related = (a.related || []).indexOf(b.key) >= 0 || (b.related || []).indexOf(a.key) >= 0;
      var rows = diff ? diff.rows : [];
      var shareList = sharedRows(rows).slice(0, 4);
      var apartList = apartRows(rows).slice(0, 4);
      var apart =rows.slice().reverse().slice(0, Math.min(rows.length, showAll ? rows.length : 5));

      var view = el('section', { class: 'screen vs fade-in' }, [
        el('p', { class: 'eyebrow', text: 'Compare two aesthetics' }),
        el('h1', { class: 'display display--sub', text: a.name + ' or ' + b.name + '?' }),
        el('div', { class: 'vs__pickers' }, [
          picker('First', data, keyA, function (v) { go(v, keyB); }),
          el('button', { class: 'btn btn--ghost btn--small vs__swap', type: 'button',
            onclick: function () { go(keyB, keyA); } }, ['⇄ Swap']),
          picker('Second', data, keyB, function (v) { go(keyA, v); })
        ]),

        el('section', { class: 'block cmp' }, [
          el('p', { class: 'cmp__score' }, [el('span', { class: 'cmp__pct', text: pct + '%' }), ' alike']),
          el('p', { class: 'cmp__verdict', text: verdict + '.' +
            (related && !same ? ' The site lists them as related.' : '') }),
          same ? null : el('p', { class: 'fineprint', text: 'Based on ' + (score.shared + score.oneSided) +
            ' dimensions: ' + score.shared + ' that both have, and ' + score.oneSided + ' that only one of them ' +
            'has (the other is counted as neutral there). The ones that define each aesthetic count most.' })
        ]),

        el('div', { class: 'vs__cards' }, [card(a, data, 'vs__card--a'), card(b, data, 'vs__card--b')]),

        same ? el('p', { class: 'block__lede', text: 'These are the same aesthetic. Pick a different one to compare.' }) : null,

        !same && diff ? el('section', { class: 'block' }, [
          el('h2', { class: 'block__title', text: 'What they share' }),
          shareList.length
            ? el('ul', { class: 'vs__list' }, shareList.map(function (r) { return el('li', { text: shareSentence(r) }); }))
            : el('p', { class: 'block__lede', text: 'Not much: they are not close on any dimension.' }),
          el('h2', { class: 'block__title', text: 'What sets them apart' }),
          apartList.length
            ? el('ul', { class: 'vs__list' }, apartList.map(function (r) { return el('li', { text: gapSentence(r, a, b) }); }))
            : el('p', { class: 'block__lede', text: 'Very little: they are within 25 points of each other everywhere.' })
        ]) : null,

        el('section', { class: 'block' }, [
          el('h2', { class: 'block__title', text: 'Their worlds, side by side' }),
          el('div', { class: 'vs__facets' }, FACETS.map(function (f) {
            return el('div', { class: 'vs__facet' }, [
              el('p', { class: 'vs__facetlabel', text: f[1] }),
              el('p', { class: 'vs__facetcol', text: (a.world && a.world[f[0]]) || '–' }),
              el('p', { class: 'vs__facetcol', text: (b.world && b.world[f[0]]) || '–' })
            ]);
          }))
        ]),

        !same && rows.length ? el('section', { class: 'block' }, [
          el('h2', { class: 'block__title', text: 'Dimension by dimension' }),
          el('div', { class: 'cmp__legend' }, [
            el('span', { class: 'cmp__key' }, [el('i', { class: 'cmp__dot cmp__dot--you' }), ' ' + a.name]),
            el('span', { class: 'cmp__key' }, [el('i', { class: 'cmp__dot cmp__dot--friend' }), ' ' + b.name])
          ]),
          el('div', { class: 'cmp__rows' }, apart.map(function (r) { return dimRow(r, a, b); })),
          rows.length > 5 ? el('button', { class: 'btn btn--ghost btn--small', type: 'button',
            onclick: function () { showAll = !showAll; paint(); }
          }, [showAll ? 'Show fewer' : 'Show all ' + rows.length + ' dimensions']) : null,
          el('p', { class: 'fineprint', text: 'Biggest differences first. Each dot is where that aesthetic sits, from 0 to 100.' })
        ]) : null,

        el('p', { class: 'fineprint' }, [
          'Not sure which one you are? ', el('a', { href: 'index.html', text: 'Take the test' }), '.'
        ])
      ]);

      root.innerHTML = '';
      root.appendChild(view);
      doc.title = a.name + ' vs ' + b.name + ' · What Aesthetic Are You?';
    }

    paint();
  }

  if (!doc) return; /* loaded by tools/check-compare.js: only the sentences are wanted */
  AQ.loadData().then(boot).catch(function (err) {
    var root = doc.getElementById('app');
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'screen' }, [
      el('p', { text: 'Could not load the aesthetics. ' + (err && err.message ? err.message : '') })
    ]));
  });
})(window);
