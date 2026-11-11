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

  /* The bridge: the aesthetic that is closest to both at once (its weaker link
     is as strong as possible; ties go to the better total). */
  function bridge(a, b, data) {
    var best = null;
    data.aesthetics.forEach(function (c) {
      if (c.key === a.key || c.key === b.key) return;
      var toA = pairScore(a, c, data).percent, toB = pairScore(b, c, data).percent;
      var low = Math.min(toA, toB), sum = toA + toB;
      if (!best || low > best.low || (low === best.low && sum > best.sum)) best = { c: c, toA: toA, toB: toB, low: low, sum: sum };
    });
    return best;
  }

  /* The split room: one room, left half in the first palette, right half in the second.
     The palette sorted dark to light gives {d} {m} {w} {l}. From those come the wall
     {a}, the floor {f} and the ink {k} that outlines are drawn in. A light room has the
     lightest colour on the wall and dark ink; an aesthetic that leans dark gets a dark
     wall and light ink, so Goth or Cyberpunk no longer sit in a pale room. The floor is
     never the pure darkest colour, or dark things standing on it would vanish. */
  var DARK_ROOM = 0.65; /* `darkness` from here up gets the dark room */

  function lightness(hex) {
    var n = parseInt(hex.slice(1), 16);
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  }
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), out = 0;
    [16, 8, 0].forEach(function (s) {
      out |= Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t) << s;
    });
    return '#' + ('00000' + out.toString(16)).slice(-6);
  }
  function shades(a) {
    var c = a.palette.slice().sort(function (x, y) { return lightness(x) - lightness(y); });
    var s = { d: c[0], m: c[1], w: c[2], l: c[3] };
    var dark = (a.dimensions.darkness || 0) >= DARK_ROOM;
    s.a = dark ? mix(s.d, s.m, 0.6) : s.l;
    s.f = mix(s.d, s.l, dark ? 0.14 : 0.2);
    s.k = dark ? s.l : s.d;
    return s;
  }
  function paintIn(svg, c) { return svg.replace(/\{([dmwlafk])\}/g, function (_, k) { return c[k]; }); }

  /* The floor bows gently towards the back of the room instead of meeting the wall
     in a ruler-straight line. */
  var ROOM = '<rect width="600" height="300" fill="{a}"/><path d="M0 214Q300 196 600 214V300H0z" fill="{f}"/>' +
    '<path d="M0 214Q300 196 600 214" stroke="{m}" stroke-width="6" fill="none"/><ellipse cx="300" cy="262" rx="190" ry="22" fill="{w}" opacity="0.8"/>' +
    '<ellipse cx="300" cy="262" rx="168" ry="16" fill="none" stroke="{l}" stroke-width="1.5" opacity="0.55"/>';
  /* Laid over both halves: warm light from above, the wall darkening a little towards
     the floor, and the seat's shadow. White and black at low opacity, so it works on
     every palette. */
  var SHADE = '<rect width="600" height="210" fill="url(#vs-shade)"/><ellipse cx="300" cy="70" rx="340" ry="190" fill="url(#vs-glow)"/>' +
    '<ellipse cx="300" cy="238" rx="150" ry="8" opacity="0.22"/>';

  /* The seam between the two halves is a soft wave rather than a hard cut. */
  var WAVE = 'M300 0' + new Array(6).join('q7 15 0 30q-7 15 0 30');

  /* Every rectangle in the props gets rounded corners, in proportion to its size,
     so a bookcase or a poster looks drawn rather than cut out of blocks. */
  function soften(svg) {
    return svg.replace(/<rect (?![^>]*\brx=)([^>]*?)\/>/g, function (all, attrs) {
      var w = /\bwidth="([\d.]+)"/.exec(attrs), h = /\bheight="([\d.]+)"/.exec(attrs);
      if (!w || !h) return all;
      var r = Math.min(6, Math.min(+w[1], +h[1]) * 0.2);
      return r < 1 ? all : '<rect rx="' + r.toFixed(1) + '" ' + attrs + '/>';
    });
  }

  /* Bits that need a loop, built once. */
  var BOOKS = (function () {
    var s = '', x = 46, i = 0, w = [8, 11, 7, 12, 9, 6, 10, 8, 13, 7, 9, 11];
    [62, 94, 122].forEach(function (shelf) {
      x = 46;
      while (x < 140) {
        var bw = w[i % w.length], h = 18 + (i * 7) % 10;
        s += '<rect x="' + x + '" y="' + (shelf - h) + '" width="' + Math.min(bw, 144 - x) + '" height="' + h + '" fill="{' + 'dwl'[i % 3] + '}"/>';
        x += bw + 1; i++;
      }
    });
    return s;
  })();
  var BULBS = (function () {
    var s = '';
    for (var t = 0.1; t < 1; t += 0.16) {
      var x = 150 * (1 - t) * (1 - t) + 440 * (1 - t) * t + 290 * t * t, y = 10 * (1 - t) * (1 - t) + 120 * (1 - t) * t + 10 * t * t;
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + (y + 5).toFixed(1) + '" r="9" fill="{w}" opacity="0.35"/>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + (y + 5).toFixed(1) + '" r="4" fill="{w}"/>';
    }
    return s;
  })();
  var BAT = 'l7-7l4 3l4-5l4 5l4-3l7 7l-8-1l-3 4l-4-3l-4 3l-3-4z';

  /* What each aesthetic brings into its half of the room. One per spot, picked by the
     dimension it leans on hardest (at least 15 points from the middle). Drawn for the
     left half; the right half is the mirror image. */
  var PROPS = [
    { spot: 'wall', name: 'a moonlit window', dim: 'mystery', high: true, svg: '<rect x="45" y="35" width="100" height="90" fill="{d}" stroke="{m}" stroke-width="5"/><circle cx="115" cy="62" r="14" fill="{l}"/><circle cx="121" cy="57" r="12" fill="{d}"/><circle cx="62" cy="50" r="2" fill="{l}"/><circle cx="80" cy="95" r="1.5" fill="{l}"/><circle cx="125" cy="105" r="2" fill="{l}"/><path d="M95 35v90M45 80h100" stroke="{m}" stroke-width="3"/>' },
    { spot: 'wall', name: 'a sunny window', dim: 'optimism', high: true, svg: '<rect x="45" y="35" width="100" height="90" fill="{w}" stroke="{k}" stroke-width="5"/><circle cx="72" cy="62" r="14" fill="{l}"/><path d="M72 40v-3M72 87v-3M50 62h-3M97 62h-3M56 46l-2-2M88 46l2-2M56 78l-2 2M88 78l2 2" stroke="{l}" stroke-width="3"/><path d="M95 35v90M45 80h100" stroke="{k}" stroke-width="4"/>' },
    { spot: 'wall', name: 'a bookcase', dim: 'intellect', high: true, svg: '<rect x="40" y="30" width="110" height="96" fill="{m}" stroke="{k}" stroke-width="4"/>' + BOOKS + '<path d="M42 62h106M42 94h106" stroke="{k}" stroke-width="3"/>' },
    { spot: 'wall', name: 'glowing screens', dim: 'technology', high: true, svg: '<rect x="40" y="45" width="64" height="44" rx="3" fill="{d}"/><rect x="45" y="50" width="54" height="34" fill="{w}" opacity="0.85"/><path d="M50 58h30M50 65h40M50 72h22" stroke="{d}" stroke-width="2"/><rect x="108" y="58" width="42" height="30" rx="3" fill="{d}"/><rect x="112" y="62" width="34" height="22" fill="{l}" opacity="0.8"/><path d="M72 89v10M129 88v11" stroke="{k}" stroke-width="3"/>' },
    { spot: 'wall', name: 'posters', dim: 'individualism', high: true, svg: '<rect x="42" y="38" width="44" height="60" fill="{w}" stroke="{k}" stroke-width="2" transform="rotate(-6 64 68)"/><circle cx="64" cy="62" r="11" fill="{d}"/><rect x="92" y="34" width="50" height="40" fill="{d}" transform="rotate(4 117 54)"/><path d="M98 64l12-16l10 12l8-8l10 14" stroke="{l}" stroke-width="3" fill="none"/><rect x="96" y="82" width="40" height="36" fill="{m}" stroke="{k}" stroke-width="2" transform="rotate(-3 116 100)"/>' },
    { spot: 'wall', name: 'a gilded mirror', dim: 'refinement', high: true, svg: '<ellipse cx="95" cy="80" rx="38" ry="46" fill="{l}" stroke="{w}" stroke-width="9"/><ellipse cx="95" cy="80" rx="44" ry="52" fill="none" stroke="{k}" stroke-width="2"/><circle cx="95" cy="27" r="7" fill="{w}" stroke="{k}" stroke-width="2"/><path d="M78 60q8-10 20-6" stroke="{w}" stroke-width="3" fill="none" opacity="0.6"/>' },
    { spot: 'wall', name: 'a patchwork quilt', dim: 'craft', high: true, svg: '<path d="M45 32h100" stroke="{k}" stroke-width="4"/><g stroke="{k}" stroke-width="1">' +
      [0, 1, 2, 3].map(function (cx) { return [0, 1, 2, 3].map(function (cy) {
        return '<rect x="' + (45 + cx * 25) + '" y="' + (34 + cy * 23) + '" width="25" height="23" fill="{' + 'wml'[(cx + cy * 2) % 3] + '}"/>'; }).join(''); }).join('') +
      '</g><path d="M57 45l6 6M107 68l6 6M82 103l6 6" stroke="{d}" stroke-width="1.5" stroke-dasharray="2 2"/>' },
    { spot: 'wall', name: 'one small artwork', dim: 'minimalism', high: true, svg: '<rect x="68" y="50" width="54" height="66" fill="{l}" stroke="{k}" stroke-width="2"/><circle cx="95" cy="80" r="13" fill="{w}"/><path d="M80 104h30" stroke="{d}" stroke-width="2"/>' },
    { spot: 'wall', name: 'a map of somewhere far', dim: 'adventure', high: true, svg: '<rect x="40" y="40" width="110" height="78" fill="{l}" stroke="{m}" stroke-width="3"/><path d="M50 60q15-12 30 0t25 15q10 10 0 20t-30 5q-25-8-25-40z" fill="{w}" opacity="0.8"/><path d="M60 100q20-30 45-25t30-25" stroke="{d}" stroke-width="2" stroke-dasharray="4 3" fill="none"/><path d="M130 45l8 8M138 45l-8 8" stroke="{d}" stroke-width="3"/>' },

    { spot: 'ceiling', name: 'fairy lights', dim: 'whimsy', high: true, svg: '<path d="M150 10Q220 120 290 10" stroke="{k}" stroke-width="1.5" fill="none"/>' + BULBS },
    { spot: 'ceiling', name: 'a chandelier', dim: 'ornament', high: true, svg: '<path d="M220 0v28" stroke="{k}" stroke-width="2"/><path d="M183 48q37 30 74 0M195 48q25 18 50 0" stroke="{w}" stroke-width="4" fill="none"/><circle cx="220" cy="62" r="5" fill="{w}"/>' +
      [183, 195, 220, 245, 257].map(function (x) { return '<rect x="' + (x - 3) + '" y="34" width="6" height="14" fill="{l}" stroke="{k}" stroke-width="1"/><ellipse cx="' + x + '" cy="29" rx="3" ry="5" fill="{w}"/>'; }).join('') },
    { spot: 'ceiling', name: 'hanging plants', dim: 'nature', high: true, svg: '<path d="M180 0v34M260 0v24" stroke="{k}" stroke-width="2"/><path d="M168 34h24l-4 16h-16z" fill="{w}" stroke="{k}" stroke-width="2"/><path d="M248 24h24l-4 16h-16z" fill="{w}" stroke="{k}" stroke-width="2"/><path d="M172 46q-8 20-2 40M188 46q8 16 4 30M252 36q-10 22-4 48M268 36q6 14 2 26" stroke="{m}" stroke-width="3" fill="none"/>' +
      [[170, 58], [168, 74], [192, 60], [250, 52], [248, 70], [270, 48]].map(function (p) { return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="5" ry="3" fill="{m}"/>'; }).join('') },
    { spot: 'ceiling', name: 'a disco ball', dim: 'social', high: true, svg: '<path d="M220 0v24" stroke="{k}" stroke-width="2"/><circle cx="220" cy="46" r="22" fill="{m}" stroke="{k}" stroke-width="2"/><path d="M198 46h44M202 34h36M202 58h36M220 24v44M208 27q-6 19 0 38M232 27q6 19 0 38" stroke="{k}" stroke-width="1" fill="none"/><path d="M180 70l4-8l4 8l-4 8zM258 30l3-6l3 6l-3 6zM250 82l3-6l3 6l-3 6z" fill="{w}"/>' },
    { spot: 'ceiling', name: 'a neon sign', dim: 'urban', high: true, svg: '<path d="M170 50l20-24l20 24l20-24l20 24l20-24" stroke="{w}" stroke-width="12" fill="none" opacity="0.3" stroke-linejoin="round"/><path d="M170 50l20-24l20 24l20-24l20 24l20-24" stroke="{w}" stroke-width="4" fill="none" stroke-linejoin="round"/>' },
    { spot: 'ceiling', name: 'bats', dim: 'darkness', high: true, svg: '<path d="M175 30' + BAT + 'M225 15' + BAT + 'M255 50' + BAT + '" fill="{k}"/>' },
    { spot: 'ceiling', name: 'a bare bulb', dim: 'industrial', high: true, svg: '<path d="M220 0v40" stroke="{k}" stroke-width="2"/><circle cx="220" cy="56" r="26" fill="{w}" opacity="0.25"/><rect x="214" y="38" width="12" height="9" fill="{d}"/><circle cx="220" cy="56" r="10" fill="{l}" stroke="{w}" stroke-width="2"/>' },
    { spot: 'ceiling', name: 'drying herbs', dim: 'rural', high: true, svg: '<path d="M160 18h120" stroke="{k}" stroke-width="4"/>' +
      [175, 200, 225, 250, 272].map(function (x, i) { return '<path d="M' + x + ' 18v8M' + (x - 7) + ' 26h14l-7 ' + (26 + (i % 2) * 10) + 'z" stroke="{k}" stroke-width="1.5" fill="{' + 'mw'[i % 2] + '}"/>'; }).join('') },
    { spot: 'ceiling', name: 'a planet mobile', dim: 'futurism', high: true, svg: '<path d="M220 0v20M185 20h70M185 20v24M255 20v34M220 20v14" stroke="{k}" stroke-width="1.5"/><circle cx="185" cy="54" r="10" fill="{w}"/><ellipse cx="185" cy="54" rx="17" ry="4" fill="none" stroke="{k}" stroke-width="2"/><circle cx="255" cy="60" r="6" fill="{m}"/><path d="M220 34l3 7h7l-6 4l2 7l-6-4l-6 4l2-7l-6-4h7z" fill="{w}"/>' },

    { spot: 'floor', name: 'a big leafy plant', dim: 'organic', high: true, svg: '<path d="M52 205h36l-5 31h-26z" fill="{w}" stroke="{k}" stroke-width="2"/><path d="M70 205q-2-30 -22-48M70 205q4-34 22-56M70 205q-10-20-34-22M70 205q12-14 36-14" stroke="{m}" stroke-width="3" fill="none"/>' +
      [[46, 154, -30], [92, 146, 25], [34, 182, -70], [106, 190, 70], [70, 160, 0]].map(function (p) { return '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="9" ry="17" fill="{m}" stroke="{k}" stroke-width="1" transform="rotate(' + p[2] + ' ' + p[0] + ' ' + p[1] + ')"/>'; }).join('') },
    { spot: 'floor', name: 'a record player', dim: 'nostalgia', high: true, svg: '<rect x="30" y="190" width="84" height="46" fill="{m}" stroke="{k}" stroke-width="2"/><path d="M36 236v-38M108 236v-38" stroke="{k}" stroke-width="1"/><rect x="34" y="174" width="76" height="16" fill="{d}"/><ellipse cx="66" cy="174" rx="26" ry="5" fill="{d}" stroke="{l}" stroke-width="1"/><ellipse cx="66" cy="174" rx="6" ry="1.5" fill="{w}"/><path d="M100 168l-18 8" stroke="{l}" stroke-width="2"/><rect x="40" y="200" width="6" height="30" fill="{w}"/><rect x="48" y="203" width="6" height="27" fill="{l}"/><rect x="56" y="198" width="6" height="32" fill="{d}"/>' },
    { spot: 'floor', name: 'an old TV', dim: 'retro', high: true, svg: '<rect x="36" y="218" width="72" height="18" fill="{d}"/><rect x="30" y="160" width="84" height="60" rx="10" fill="{m}" stroke="{k}" stroke-width="3"/><rect x="38" y="167" width="56" height="46" rx="10" fill="{d}"/><path d="M44 178h44M44 186h44M44 194h44M44 202h44" stroke="{w}" stroke-width="2" opacity="0.5"/><circle cx="104" cy="178" r="3" fill="{d}"/><circle cx="104" cy="190" r="3" fill="{d}"/><path d="M60 160l-12-22M72 160l14-20" stroke="{k}" stroke-width="2"/>' },
    { spot: 'floor', name: 'a candelabra', dim: 'darkness', high: true, svg: '<path d="M72 236v-70" stroke="{k}" stroke-width="5"/><ellipse cx="72" cy="234" rx="18" ry="4" fill="{k}"/><path d="M48 170q24 18 48 0M72 166v-6" stroke="{k}" stroke-width="4" fill="none"/>' +
      [48, 72, 96].map(function (x) { var y = x === 72 ? 140 : 150; return '<circle cx="' + x + '" cy="' + (y - 4) + '" r="9" fill="{w}" opacity="0.3"/><rect x="' + (x - 4) + '" y="' + y + '" width="8" height="' + (x === 72 ? 22 : 20) + '" fill="{l}"/><ellipse cx="' + x + '" cy="' + (y - 5) + '" rx="3" ry="5" fill="{w}"/>'; }).join('') },
    { spot: 'floor', name: 'a crystal ball', dim: 'fantasy', high: true, svg: '<path d="M55 236h34l-5-24h-24z" fill="{d}"/><rect x="50" y="198" width="44" height="14" fill="{m}" stroke="{k}" stroke-width="2"/><circle cx="72" cy="180" r="22" fill="{w}" opacity="0.85" stroke="{m}" stroke-width="2"/><ellipse cx="64" cy="172" rx="6" ry="4" fill="{l}"/><path d="M84 184l2-5l2 5l-2 5zM70 190l1.5-4l1.5 4l-1.5 4z" fill="{l}"/>' },
    { spot: 'floor', name: 'a basket of yarn', dim: 'comfort', high: true, svg: '<path d="M38 206h68l-8 30h-52z" fill="{w}" stroke="{k}" stroke-width="2"/><path d="M42 216h60M44 226h56" stroke="{d}" stroke-width="1"/><circle cx="58" cy="200" r="11" fill="{m}"/><circle cx="82" cy="198" r="12" fill="{l}" stroke="{k}" stroke-width="1"/><path d="M50 196q8 8 16-2M74 192q8 10 16 0" stroke="{d}" stroke-width="1" fill="none"/><path d="M88 206l18-40M94 206l20-36" stroke="{k}" stroke-width="2"/>' },
    { spot: 'floor', name: 'an arc lamp', dim: 'modernity', high: true, svg: '<ellipse cx="34" cy="233" rx="14" ry="4" fill="{k}"/><path d="M34 233Q30 120 120 132" stroke="{k}" stroke-width="3" fill="none"/><path d="M104 132a16 14 0 0 1 32 0z" fill="{w}" stroke="{k}" stroke-width="2"/><ellipse cx="120" cy="150" rx="22" ry="8" fill="{w}" opacity="0.25"/>' },
    { spot: 'floor', name: 'piles of stuff', dim: 'maximalism', high: true, svg: '<rect x="28" y="200" width="44" height="36" fill="{w}" stroke="{k}" stroke-width="2"/><rect x="74" y="210" width="40" height="26" fill="{m}" stroke="{k}" stroke-width="2"/><rect x="34" y="170" width="34" height="30" fill="{m}" stroke="{k}" stroke-width="2" transform="rotate(-5 51 185)"/><rect x="78" y="196" width="30" height="5" fill="{l}" stroke="{k}"/><rect x="80" y="191" width="26" height="5" fill="{w}" stroke="{k}"/><rect x="77" y="186" width="30" height="5" fill="{d}"/><circle cx="52" cy="160" r="8" fill="{l}" stroke="{k}" stroke-width="2"/><path d="M28 218h44M50 200v36" stroke="{k}" stroke-width="1"/>' },
    { spot: 'floor', name: 'a guitar and amp', dim: 'chaos', high: true, svg: '<rect x="26" y="196" width="44" height="40" rx="3" fill="{d}"/><circle cx="48" cy="219" r="11" fill="{m}"/><rect x="30" y="200" width="36" height="5" fill="{m}"/><rect x="92" y="130" width="6" height="56" fill="{k}" transform="rotate(12 95 186)"/><circle cx="90" cy="196" r="13" fill="{w}" stroke="{k}" stroke-width="2"/><circle cx="88" cy="218" r="17" fill="{w}" stroke="{k}" stroke-width="2"/><circle cx="89" cy="206" r="4" fill="{d}"/>' },
    { spot: 'floor', name: 'a typewriter', dim: 'technology', high: false, svg: '<rect x="40" y="202" width="64" height="8" fill="{m}" stroke="{k}" stroke-width="2"/><path d="M46 210v26M98 210v26" stroke="{k}" stroke-width="4"/><path d="M48 202l6-22h36l6 22z" fill="{d}"/><rect x="58" y="160" width="28" height="22" fill="{l}" stroke="{k}" stroke-width="1"/><path d="M62 168h20M62 174h14" stroke="{d}" stroke-width="1"/><path d="M56 194h32M58 198h28" stroke="{l}" stroke-width="2" stroke-dasharray="3 2"/>' },

    /* The seat stands across the middle of the room and is the same on both sides of
       its own centre, so each aesthetic shows the half on its side. */
    { spot: 'seat', name: 'a sofa buried in cushions', dim: 'comfort', high: true, svg: '<rect x="150" y="146" width="300" height="76" rx="22" fill="{m}" stroke="{k}" stroke-opacity="0.4"/>' +
      '<rect x="168" y="118" width="88" height="54" rx="16" fill="{w}"/><rect x="344" y="118" width="88" height="54" rx="16" fill="{w}"/><rect x="256" y="114" width="88" height="58" rx="16" fill="{l}" stroke="{k}" stroke-width="1"/>' +
      '<circle cx="192" cy="174" r="16" fill="{l}" stroke="{k}" stroke-width="1"/><circle cx="408" cy="174" r="16" fill="{l}" stroke="{k}" stroke-width="1"/>' +
      '<path d="M150 164q15-10 30 0v48q-15 8-30 0zM450 164q-15-10-30 0v48q15 8 30 0z" fill="{w}" stroke="{k}" stroke-width="1"/>' +
      '<rect x="170" y="220" width="14" height="14" rx="3" fill="{k}"/><rect x="416" y="220" width="14" height="14" rx="3" fill="{k}"/>' },
    { spot: 'seat', name: 'a low bench sofa', dim: 'minimalism', high: true, svg: '<rect x="165" y="150" width="270" height="30" rx="3" fill="{w}"/><rect x="165" y="182" width="270" height="24" rx="3" fill="{m}" stroke="{k}" stroke-opacity="0.4"/>' +
      '<path d="M180 206v30M420 206v30" stroke="{k}" stroke-width="3"/>' },
    { spot: 'seat', name: 'a velvet settee', dim: 'ornament', high: true, svg: '<path d="M165 215V165Q165 140 190 140Q245 140 300 112Q355 140 410 140Q435 140 435 165V215z" fill="{m}" stroke="{k}" stroke-width="2"/>' +
      [[230, 162], [265, 151], [300, 142], [335, 151], [370, 162]].map(function (p) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="{l}"/>'; }).join('') +
      '<rect x="178" y="180" width="244" height="30" rx="8" fill="{w}" stroke="{k}" stroke-width="1"/>' +
      '<circle cx="172" cy="172" r="14" fill="{w}" stroke="{k}" stroke-width="2"/><circle cx="428" cy="172" r="14" fill="{w}" stroke="{k}" stroke-width="2"/>' +
      '<path d="M180 215q-3 13-10 21M420 215q3 13 10 21" stroke="{k}" stroke-width="4" fill="none"/>' },
    { spot: 'seat', name: 'a pod sofa', dim: 'futurism', high: true, svg: '<ellipse cx="300" cy="236" rx="110" ry="5" fill="{w}" opacity="0.5"/><path d="M210 218v18M390 218v18" stroke="{k}" stroke-width="5"/>' +
      '<ellipse cx="300" cy="184" rx="140" ry="42" fill="{m}" stroke="{k}" stroke-width="2"/><ellipse cx="300" cy="192" rx="112" ry="25" fill="{w}"/>' +
      '<path d="M176 170q124-34 248 0" stroke="{l}" stroke-width="2" fill="none" opacity="0.7"/>' }
  ];
  var PLAIN = {
    seat: { name: 'a soft sofa', svg: '<rect x="160" y="150" width="280" height="70" rx="14" fill="{m}" stroke="{k}" stroke-opacity="0.4"/>' +
      '<rect x="180" y="128" width="115" height="45" rx="10" fill="{w}"/><rect x="305" y="128" width="115" height="45" rx="10" fill="{w}"/>' +
      '<rect x="172" y="218" width="10" height="18" fill="{k}"/><rect x="418" y="218" width="10" height="18" fill="{k}"/>' },
    wall: { name: 'a plain window', svg: '<rect x="45" y="35" width="100" height="90" fill="{w}" stroke="{k}" stroke-width="5"/><path d="M95 35v90M45 80h100" stroke="{k}" stroke-width="4"/>' },
    ceiling: { name: 'a lamp', svg: '<path d="M220 0v40" stroke="{k}" stroke-width="2"/><path d="M200 60h40l-8-20h-24z" fill="{w}" stroke="{k}" stroke-width="2"/>' },
    floor: { name: 'a side table', svg: '<rect x="40" y="195" width="60" height="7" fill="{m}" stroke="{k}" stroke-width="2"/><path d="M46 202v34M94 202v34" stroke="{k}" stroke-width="4"/><path d="M62 195q-6-14 4-24h8q10 10 4 24z" fill="{w}" stroke="{k}" stroke-width="2"/><circle cx="70" cy="160" r="7" fill="{l}" stroke="{k}" stroke-width="2"/>' }
  };

  function propsFor(a) {
    return ['wall', 'ceiling', 'floor', 'seat'].map(function (spot) {
      var best = PLAIN[spot], bestLean = 0.15;
      PROPS.forEach(function (p) {
        var v = a.dimensions[p.dim];
        if (p.spot !== spot || typeof v !== 'number') return;
        var by = p.high ? v - 0.5 : 0.5 - v;
        if (by >= bestLean) { best = p; bestLean = by; }
      });
      return best;
    });
  }

  function splitRoom(a, b) {
    var ca = shades(a), cb = shades(b);
    var pa = propsFor(a), pb = propsFor(b);
    var drawn = function (props, c) { return soften(props.map(function (p) { return paintIn(p.svg, c); }).join('')); };
    var box = el('div', { class: 'vs__room' });
    /* Round line joins and ends on everything, inherited by every shape inside. */
    box.innerHTML = '<svg viewBox="0 0 600 300" stroke-linejoin="round" stroke-linecap="round" role="img" aria-label="One room split down the middle. ' + a.name + ' brings ' +
      pa.map(function (p) { return p.name; }).join(', ') + '. ' + b.name + ' brings ' + pb.map(function (p) { return p.name; }).join(', ') + '.">' +
      '<defs><clipPath id="vs-left"><path d="' + WAVE + 'H0V0z"/></clipPath>' +
      '<clipPath id="vs-right"><path d="' + WAVE + 'H600V0z"/></clipPath>' +
      '<linearGradient id="vs-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-opacity="0"/><stop offset="1" stop-opacity="0.16"/></linearGradient>' +
      '<radialGradient id="vs-glow"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      paintIn(ROOM, ca) + '<g clip-path="url(#vs-right)">' + paintIn(ROOM, cb) + '</g>' + SHADE +
      '<g clip-path="url(#vs-left)">' + drawn(pa, ca) + '</g>' +
      '<g clip-path="url(#vs-right)"><g transform="translate(600 0) scale(-1 1)">' + drawn(pb, cb) + '</g></g>' +
      '<path d="' + WAVE + '" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.6"/></svg>';
    return { box: box, a: pa, b: pb };
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
    apartRows: apartRows, gapSentence: gapSentence, bridge: bridge };

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

        same ? null : (function () {
          var room = splitRoom(a, b);
          var brings = function (who, props) {
            return el('p', {}, [el('strong', { text: who.name + ' brings ' }), props.map(function (p) { return p.name; }).join(', ') + '. ',
              el('span', { class: 'vs__roomnote', text: (who.world && who.world.interior) || '' })]);
          };
          return el('section', { class: 'block' }, [
            el('h2', { class: 'block__title', text: 'One room, two aesthetics' }),
            el('p', { class: 'block__lede', text: 'They share a living room. ' + a.name + ' gets the left half, ' + b.name + ' the right, and each decorates it their way.' }),
            room.box,
            el('div', { class: 'vs__roomtext' }, [brings(a, room.a), brings(b, room.b)])
          ]);
        })(),

        same ? null : (function () {
          var br = bridge(a, b, data);
          var photo = data.photos && data.photos[br.c.key];
          return el('section', { class: 'block' }, [
            el('h2', { class: 'block__title', text: 'The bridge between them' }),
            el('p', { class: 'block__lede', text: 'The aesthetic closest to both at once.' }),
            el('div', { class: 'vs__bridge' }, [
              photo ? el('div', { class: 'vs__photo' }, [el('img', { src: photo.file, alt: '', decoding: 'async' })]) : null,
              el('div', {}, [
                el('h3', { class: 'vs__name', text: br.c.name }),
                el('p', { class: 'vs__tagline', text: br.c.tagline }),
                el('p', { text: br.toA + '% like ' + a.name + ' · ' + br.toB + '% like ' + b.name }),
                el('p', { class: 'fineprint' }, [
                  el('a', { href: '?a=' + a.key + '&b=' + br.c.key, text: 'Compare with ' + a.name }), ' · ',
                  el('a', { href: '?a=' + br.c.key + '&b=' + b.key, text: 'Compare with ' + b.name })
                ])
              ])
            ])
          ]);
        })(),

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
