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

  function draw(aesthetic, percent) {
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
    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 30px ' + sans;
    ctx.fillText('MY AESTHETIC', 90, 150);

    ctx.font = '500 ' + (aesthetic.name.length > 14 ? 120 : 150) + 'px ' + serif;
    var y = wrap(ctx, aesthetic.name, 90, 520, W - 180, aesthetic.name.length > 14 ? 130 : 160);

    ctx.font = 'italic 400 44px ' + serif;
    wrap(ctx, aesthetic.tagline, 90, y + 30, W - 180, 62);

    ctx.font = '500 200px ' + serif;
    ctx.fillText(percent + '%', 90, H - 230);
    var pw = ctx.measureText(percent + '%').width;
    ctx.font = '500 36px ' + sans;
    ctx.fillText('match', 90 + pw + 24, H - 230);

    ctx.font = '500 32px ' + sans;
    ctx.fillText('What Aesthetic Are You?  ·  ' + global.location.host, 90, H - 90);
    return c;
  }

  AQ.card = { draw: draw };
})(typeof window !== 'undefined' ? window : globalThis);
