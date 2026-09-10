/* Laster quizdata. JSON-filene i /data er fasit.
   Åpnes siden direkte fra filsystemet (file://) blokkerer nettleseren fetch mot
   lokale filer — da faller vi tilbake på data/bundle.js, som genereres fra de
   samme JSON-filene med `node tools/build-bundle.js`. */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var FILES = {
    questions: 'data/questions.json',
    aesthetics: 'data/aesthetics.json',
    config: 'data/scoring.json',
    narrative: 'data/narrative.json'
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Klarte ikke laste ' + src)); };
      document.head.appendChild(s);
    });
  }

  function fetchAll() {
    var keys = Object.keys(FILES);
    return Promise.all(
      keys.map(function (key) {
        return fetch(FILES[key], { cache: 'no-cache' }).then(function (res) {
          if (!res.ok) throw new Error(FILES[key] + ' ga ' + res.status);
          return res.json();
        });
      })
    ).then(function (values) {
      var out = {};
      keys.forEach(function (key, i) { out[key] = values[i]; });
      return out;
    });
  }

  function fromBundle() {
    if (global.__AQ_BUNDLE__) return Promise.resolve(global.__AQ_BUNDLE__);
    return loadScript('data/bundle.js').then(function () {
      if (!global.__AQ_BUNDLE__) throw new Error('bundle.js inneholdt ingen data');
      return global.__AQ_BUNDLE__;
    });
  }

  function index(data) {
    data.questionsById = {};
    data.questions.forEach(function (q) { data.questionsById[q.id] = q; });
    data.aestheticsByKey = {};
    data.aesthetics.forEach(function (a) { data.aestheticsByKey[a.key] = a; });
    data.dimensionKeys = data.config.dimensions.map(function (d) { return d.key; });
    data.dimensionMeta = {};
    data.config.dimensions.forEach(function (d) { data.dimensionMeta[d.key] = d; });
    return data;
  }

  AQ.loadData = function () {
    return fetchAll()
      .catch(function () { return fromBundle(); })
      .then(index);
  };
})(typeof window !== 'undefined' ? window : globalThis);
