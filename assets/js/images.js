/* Reference photographs for the result page.

   Aesthetics Wiki images are not freely licensed, so they are not used here.
   Instead each aesthetic carries a couple of English search terms, and those are
   run against Wikimedia Commons, which serves freely licensed media with CORS
   enabled and hands back the credit line in the same response.

   This is decoration, not infrastructure: the generated mood plates are always
   drawn first, and if the request is slow, blocked or empty the page simply
   never shows a photo strip. Nothing waits on it.                            */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
  var TIMEOUT = 8000;
  var WANTED = 6;
  var CACHE_PREFIX = 'aq.img.v2.';

  /* Commons search happily returns maps, coats of arms and scanned book plates.
     None of those say anything about a mood. Filtering the results works far
     better than excluding them in the query, which wrecks the ranking. */
  var REJECT_TITLE = /(\bmap\b|logo|coat of arms|\bflag\b|\bseal\b|diagram|chart|\bicon\b|blazon|signature|postage|banknote|\bstamp\b|title page|\bplan\b|catalog|catalogue|\(IA |annual report|\bpage \d|\bpl\.\s*\d|\bfig\.\s*\d)/i;
  var REJECT_CREDIT = /(internet archive book images|british library|smithsonian libraries)/i;

  function readCache(key) {
    try {
      var raw = global.sessionStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(key, value) {
    try { global.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch (e) { /* full or blocked */ }
  }

  /* extmetadata fields arrive as HTML fragments. */
  function plainText(html) {
    if (!html) return '';
    var el = document.createElement('div');
    el.innerHTML = String(html);
    return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  function fetchWithTimeout(url) {
    if (!global.fetch) return Promise.reject(new Error('no fetch'));
    var controller = global.AbortController ? new global.AbortController() : null;
    var timer = global.setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT);
    return fetch(url, controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        global.clearTimeout(timer);
        if (!res.ok) throw new Error('commons ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        global.clearTimeout(timer);
        throw err;
      });
  }

  function search(term) {
    var url = ENDPOINT +
      '?action=query&format=json&origin=*' +
      '&generator=search&gsrnamespace=6&gsrlimit=20' +
      '&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + term) +
      '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=720';

    return fetchWithTimeout(url).then(function (json) {
      var pages = json && json.query && json.query.pages;
      if (!pages) return [];
      return Object.keys(pages)
        .map(function (id) { return pages[id]; })
        .filter(function (page) {
          var info = page.imageinfo && page.imageinfo[0];
          if (!info || !info.thumburl) return false;
          if (REJECT_TITLE.test(page.title)) return false;
          var artist = (info.extmetadata && info.extmetadata.Artist && info.extmetadata.Artist.value) || '';
          if (REJECT_CREDIT.test(String(artist))) return false;
          if (info.width < 600) return false;
          var ratio = info.width / info.height;
          return ratio > 0.85 && ratio < 2.4;
        })
        .map(function (page) {
          var info = page.imageinfo[0];
          var meta = info.extmetadata || {};
          return {
            thumb: info.thumburl,
            page: info.descriptionurl,
            title: page.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
            credit: plainText(meta.Artist && meta.Artist.value) || 'Unknown photographer',
            license: plainText(meta.LicenseShortName && meta.LicenseShortName.value) || 'See file page'
          };
        });
    });
  }

  /* Runs the search terms in order and stops as soon as there are enough. */
  function forAesthetic(aesthetic) {
    var terms = aesthetic.imageQuery || [];
    if (!terms.length) return Promise.resolve([]);

    var cached = readCache(aesthetic.key);
    if (cached) return Promise.resolve(cached);

    var found = [];
    var seen = {};

    function next(i) {
      if (i >= terms.length || found.length >= WANTED) {
        var result = found.slice(0, WANTED);
        if (result.length) writeCache(aesthetic.key, result);
        return result;
      }
      return search(terms[i])
        .catch(function () { return []; })
        .then(function (hits) {
          hits.forEach(function (hit) {
            if (found.length >= WANTED || seen[hit.thumb]) return;
            seen[hit.thumb] = true;
            found.push(hit);
          });
          return next(i + 1);
        });
    }

    return Promise.resolve(next(0)).catch(function () { return []; });
  }

  AQ.images = { forAesthetic: forAesthetic };
})(typeof window !== 'undefined' ? window : globalThis);
