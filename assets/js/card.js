/* Result card: a 1080x1350 PNG of the result, drawn on a canvas in the aesthetic's
   own palette, for saving and posting. Returns the canvas.                    */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var W = 1080, H = 1350;

  function luma(hex) {
    var n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  /* Greedy word wrap; returns the y after the last line. */
  function wrap(ctx, text, x, y, maxW, lineH) {
    var line = '';
    text.split(' ').forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) {
        ctx.fillText(line, x, y);
        y += lineH;
        line = word;
      } else { line = test; }
    });
    ctx.fillText(line, x, y);
    return y + lineH;
  }

  /* `runners`: up to three [{ name, percent }] listed under the result as
     "Also close". Without them the layout is the original one. */
  function draw(aesthetic, percent, runners) {
    runners = (runners || []).slice(0, 3);
    var withRunners = runners.length > 0;

    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var p = aesthetic.palette;

    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p[0]); g.addColorStop(0.55, p[1]); g.addColorStop(1, p[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var glow = ctx.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, 700);
    glow.addColorStop(0, p[2] + 'cc'); glow.addColorStop(1, p[2] + '00');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    var ink = luma(p[0]) + luma(p[1]) > 1.1 ? '#191c22' : '#fffcfa';
    var serif = '"Fraunces", Georgia, serif', sans = '"Inter", Arial, sans-serif';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 30px ' + sans;
    ctx.fillText('MY AESTHETIC', 90, 150);

    /* With runners the name moves up and shrinks a little to make room. */
    var long = aesthetic.name.length > 14;
    var nameSize = withRunners ? (long ? 108 : 136) : (long ? 120 : 150);
    ctx.font = '500 ' + nameSize + 'px ' + serif;
    var y = wrap(ctx, aesthetic.name, 90, withRunners ? 360 : 520, W - 180, Math.round(nameSize * 1.07));

    ctx.font = 'italic 400 ' + (withRunners ? 40 : 44) + 'px ' + serif;
    wrap(ctx, aesthetic.tagline, 90, y + 20, W - 180, withRunners ? 56 : 62);

    var percentY = withRunners ? 900 : H - 230;
    ctx.font = '500 ' + (withRunners ? 170 : 200) + 'px ' + serif;
    ctx.fillText(percent + '%', 90, percentY);
    var pw = ctx.measureText(percent + '%').width;
    ctx.font = '500 36px ' + sans;
    ctx.fillText('match', 90 + pw + 24, percentY);

    if (withRunners) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(90, 960); ctx.lineTo(W - 90, 960);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.font = '600 26px ' + sans;
      ctx.fillText('ALSO CLOSE', 90, 1012);

      runners.forEach(function (r, i) {
        var ry = 1072 + i * 58;
        var label = r.percent + '%';
        ctx.font = '500 34px ' + sans;
        var lw = ctx.measureText(label).width;
        ctx.textAlign = 'right';
        ctx.fillText(label, W - 90, ry);
        ctx.textAlign = 'left';
        ctx.font = '500 42px ' + serif;
        var name = r.name;
        var room = W - 180 - lw - 40;
        /* A rare overlong name is trimmed rather than run into its percentage. */
        while (name.length > 3 && ctx.measureText(name).width > room) name = name.slice(0, -2);
        if (name !== r.name) name = name.replace(/\s+$/, '') + '…';
        ctx.fillText(name, 90, ry);
      });
    }

    ctx.font = '500 32px ' + sans;
    ctx.fillText('What Aesthetic Are You?  ·  ' + global.location.host, 90, H - (withRunners ? 60 : 90));
    return c;
  }

  /* Resolves once every face the card uses is loaded (or failed), so a card drawn
     early doesn't fall back to Georgia/Arial. The italic tagline face may not be
     on the page yet, so asking for it by name is what triggers its download. */
  function ready() {
    var fonts = global.document && global.document.fonts;
    if (!fonts || !fonts.load) return Promise.resolve();
    return Promise.all([
      '500 150px "Fraunces"', 'italic 400 44px "Fraunces"',
      '500 36px "Inter"', '600 30px "Inter"'
    ].map(function (f) { return fonts.load(f).catch(function () {}); }));
  }

  AQ.card = { draw: draw, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
