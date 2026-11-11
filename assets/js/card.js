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


  /* ---- with photos: the winner's photo across the top, the runners as small tiles ---- */

  function cover(ctx, img, x, y, w, h) {
    var s = Math.max(w / img.width, h / img.height);
    var sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  function drawPhotoCard(aesthetic, percent, runners, imgs) {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var p = aesthetic.palette;
    var serif = '"Fraunces", Georgia, serif', sans = '"Inter", Arial, sans-serif';

    ctx.fillStyle = p[0];
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p[0]); g.addColorStop(0.6, p[1]); g.addColorStop(1, p[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var PH = 600;
    cover(ctx, imgs.main, 0, 0, W, PH);
    var fade = ctx.createLinearGradient(0, PH - 220, 0, PH);
    fade.addColorStop(0, p[0] + '00'); fade.addColorStop(1, p[0]);
    ctx.fillStyle = fade;
    ctx.fillRect(0, PH - 220, W, 220);

    var ink = luma(p[0]) + luma(p[1]) > 1.1 ? '#191c22' : '#fffcfa';
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 26px ' + sans;
    ctx.fillText('MY AESTHETIC', 90, 600);
    var long = aesthetic.name.length > 14;
    var size = long ? 92 : 116;
    ctx.font = '500 ' + size + 'px ' + serif;
    var y = wrap(ctx, aesthetic.name, 90, 715, W - 180, Math.round(size * 1.07));
    ctx.font = 'italic 400 36px ' + serif;
    wrap(ctx, aesthetic.tagline, 90, y + 4, W - 180, 48);

    ctx.font = '500 120px ' + serif;
    ctx.fillText(percent + '%', 90, 985);
    var pw = ctx.measureText(percent + '%').width;
    ctx.font = '500 34px ' + sans;
    ctx.fillText('match', 90 + pw + 24, 985);

    var n = runners.length;
    if (n) {
      var gap = 30, tw = Math.floor((W - 180 - gap * (n - 1)) / n), ty = 1040, th = 170;
      runners.forEach(function (r, i) {
        var x = 90 + i * (tw + gap);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, ty, tw, th); ctx.clip();
        if (imgs.runners[i]) cover(ctx, imgs.runners[i], x, ty, tw, th);
        else { ctx.fillStyle = p[1]; ctx.fillRect(x, ty, tw, th); }
        ctx.restore();
        ctx.fillStyle = ink;
        var name = r.name;
        ctx.font = '500 30px ' + serif;
        while (name.length > 3 && ctx.measureText(name).width > tw - 76) name = name.slice(0, -2);
        if (name !== r.name) name = name.replace(/s+$/, '') + '…';
        ctx.fillText(name, x, ty + th + 44);
        ctx.font = '500 28px ' + sans;
        ctx.textAlign = 'right';
        ctx.fillText(r.percent + '%', x + tw, ty + th + 44);
        ctx.textAlign = 'left';
      });
    }

    ctx.fillStyle = ink;
    ctx.font = '500 28px ' + sans;
    ctx.fillText('What Aesthetic Are You?  ·  ' + global.location.host, 90, H - 40);
    return c;
  }

  function load(src) {
    return new Promise(function (ok) {
      if (!src) { ok(null); return; }
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { ok(null); };
      im.src = src;
    });
  }

  /* Resolves to the finished canvas. `srcs`: { main, runners: [url|null] }. No main
     photo (or one that fails to load) gives the plain card. */
  function drawAsync(aesthetic, percent, runners, srcs) {
    srcs = srcs || {};
    return Promise.all([load(srcs.main)].concat((srcs.runners || []).map(load))).then(function (all) {
      if (!all[0]) return draw(aesthetic, percent, runners);
      return drawPhotoCard(aesthetic, percent, runners.slice(0, 3), { main: all[0], runners: all.slice(1) });
    });
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

  AQ.card = { draw: draw, drawAsync: drawAsync, ready: ready };
})(typeof window !== 'undefined' ? window : globalThis);
