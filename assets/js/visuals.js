/* Mood plates.

   Aesthetics Wiki images are not freely licensed, so each plate is generated
   here instead: an SVG built from the aesthetic's own palette and dimensions,
   seeded so the same aesthetic always looks the same. Photographs, when they
   load, are layered on separately by images.js.                             */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var uid = 0;

  function rand(rng, lo, hi) { return lo + rng() * (hi - lo); }

  function dim(aesthetic, key, fallback) {
    var v = aesthetic.dimensions[key];
    return v === undefined ? (fallback === undefined ? 0.5 : fallback) : v;
  }

  function moodPlate(aesthetic, opts) {
    opts = opts || {};
    var rng = AQ.rng.rngFromSeed(aesthetic.key, opts.salt || 'plate');
    var p = aesthetic.palette;
    var id = 'mp' + (++uid);
    var W = 800, H = 520;

    var structured = dim(aesthetic, 'order') * 0.5 + dim(aesthetic, 'architecture') * 0.3 +
      dim(aesthetic, 'minimalism') * 0.2;
    var glow = dim(aesthetic, 'digital') * 0.4 + dim(aesthetic, 'technology') * 0.3 +
      dim(aesthetic, 'futurism') * 0.3;
    var busy = dim(aesthetic, 'maximalism') * 0.6 + dim(aesthetic, 'chaos') * 0.4;
    var light = 1 - dim(aesthetic, 'darkness', 0.5);

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" ' +
      'preserveAspectRatio="xMidYMid slice" role="img" aria-label="Generated mood plate for ' +
      aesthetic.name + '">');

    /* --- definitions --- */
    svg.push('<defs>');
    var angle = Math.round(rand(rng, 20, 160));
    svg.push('<linearGradient id="' + id + 'bg" gradientTransform="rotate(' + angle + ' 0.5 0.5)">' +
      '<stop offset="0%" stop-color="' + p[0] + '"/>' +
      '<stop offset="55%" stop-color="' + p[1] + '"/>' +
      '<stop offset="100%" stop-color="' + p[0] + '"/></linearGradient>');

    svg.push('<radialGradient id="' + id + 'glowA"><stop offset="0%" stop-color="' + p[2] +
      '" stop-opacity="' + (0.7 + glow * 0.28).toFixed(2) + '"/>' +
      '<stop offset="100%" stop-color="' + p[2] + '" stop-opacity="0"/></radialGradient>');
    svg.push('<radialGradient id="' + id + 'glowB"><stop offset="0%" stop-color="' + p[3] +
      '" stop-opacity="' + (0.34 + light * 0.34).toFixed(2) + '"/>' +
      '<stop offset="100%" stop-color="' + p[3] + '" stop-opacity="0"/></radialGradient>');
    svg.push('<radialGradient id="' + id + 'vig"><stop offset="45%" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="100%" stop-color="#000" stop-opacity="' + (0.24 + (1 - light) * 0.22).toFixed(2) +
      '"/></radialGradient>');

    svg.push('<filter id="' + id + 'soft" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feGaussianBlur stdDeviation="' + Math.round(rand(rng, 38, 74)) + '"/></filter>');
    svg.push('<filter id="' + id + 'grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" ' +
      'numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>');
    svg.push('</defs>');

    /* --- ground --- */
    svg.push('<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'bg)"/>');

    /* --- structure: geometric bands for the ordered, organic shapes for the rest --- */
    var bands = 3 + Math.round(busy * 4);
    if (structured > 0.6) {
      for (var i = 0; i < bands; i++) {
        var bh = rand(rng, 6, 46);
        var by = rand(rng, 0, H - bh);
        svg.push('<rect x="0" y="' + by.toFixed(1) + '" width="' + W + '" height="' + bh.toFixed(1) +
          '" fill="' + p[2] + '" opacity="' + rand(rng, 0.05, 0.16).toFixed(3) + '"/>');
      }
      var cx = rand(rng, 0.25, 0.75) * W;
      svg.push('<rect x="' + (cx - 1) + '" y="0" width="2" height="' + H + '" fill="' + p[3] +
        '" opacity="0.12"/>');
    } else {
      for (var j = 0; j < bands; j++) {
        var y0 = rand(rng, 0.15, 0.9) * H;
        var amp = rand(rng, 20, 90);
        svg.push('<path d="M0 ' + y0.toFixed(1) +
          ' C ' + (W * 0.3).toFixed(0) + ' ' + (y0 - amp).toFixed(1) +
          ', ' + (W * 0.65).toFixed(0) + ' ' + (y0 + amp).toFixed(1) +
          ', ' + W + ' ' + (rand(rng, 0.2, 0.85) * H).toFixed(1) +
          ' L ' + W + ' ' + H + ' L 0 ' + H + ' Z" fill="' + p[1] +
          '" opacity="' + rand(rng, 0.18, 0.42).toFixed(3) + '"/>');
      }
    }

    /* --- light sources --- */
    var blobs = 3 + Math.round(busy * 3);
    for (var k = 0; k < blobs; k++) {
      var gx = rand(rng, -0.1, 1.1) * W;
      var gy = rand(rng, -0.1, 1.1) * H;
      var r = rand(rng, 120, 330);
      var which = rng() < 0.55 ? 'glowA' : 'glowB';
      svg.push('<ellipse cx="' + gx.toFixed(0) + '" cy="' + gy.toFixed(0) + '" rx="' + r.toFixed(0) +
        '" ry="' + (r * rand(rng, 0.55, 1.05)).toFixed(0) + '" fill="url(#' + id + which +
        ')" filter="url(#' + id + 'soft)"/>');
    }

    /* --- horizon: a thin line that gives the image a direction --- */
    var hy = rand(rng, 0.45, 0.72) * H;
    svg.push('<rect x="0" y="' + hy.toFixed(0) + '" width="' + W + '" height="1" fill="' + p[3] +
      '" opacity="' + (0.1 + light * 0.18).toFixed(2) + '"/>');

    /* --- grain and vignette --- */
    svg.push('<rect width="' + W + '" height="' + H + '" filter="url(#' + id +
      'grain)" opacity="0.16" style="mix-blend-mode:overlay"/>');
    svg.push('<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'vig)"/>');
    svg.push('</svg>');

    return svg.join('');
  }

  /* Decorative strip along the top of a card: the pale end may fade out. */
  function swatch(aesthetic) {
    var p = aesthetic.palette;
    return 'linear-gradient(90deg, ' + p[1] + ' 0%, ' + p[2] + ' 55%, ' + p[3] + ' 100%)';
  }

  /* Meters carry a number, so they have to stay readable against the cream
     background — the lightest palette colour is left out on purpose. */
  function meterFill(aesthetic) {
    var p = aesthetic.palette;
    return 'linear-gradient(90deg, ' + p[1] + ' 0%, ' + p[2] + ' 100%)';
  }

  AQ.visuals = { moodPlate: moodPlate, swatch: swatch, meterFill: meterFill };
})(typeof window !== 'undefined' ? window : globalThis);
