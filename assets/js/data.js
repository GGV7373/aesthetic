/* Loads the quiz data. The JSON files in /data are the source of truth.
   When the page is opened straight from the file system (file://) the browser
   blocks fetch against local files, so we fall back to data/bundle.js, which is
   generated from those same JSON files by `node tools/build-bundle.js`. */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var FILES = {
    questions: 'data/questions.json',
    aesthetics: 'data/aesthetics.json',
    config: 'data/scoring.json',
    narrative: 'data/narrative.json',
    playlists: 'data/playlists.json',
    quizzes: 'data/quizzes.json' /* just the keys; each quiz is data/quizzes/<key>.json */
  };

  function getJSON(url) {
    /* No cache option here: it would make the browser skip the preloaded
       copy from index.html. Freshness comes from the server's
       Cache-Control header instead (see _headers). */
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' returned ' + res.status);
      return res.json();
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function fetchAll() {
    var keys = Object.keys(FILES);
    return Promise.all(
      keys.map(function (key) { return getJSON(FILES[key]); })
    ).then(function (values) {
      var out = {};
      keys.forEach(function (key, i) { out[key] = values[i]; });
      return Promise.all(out.quizzes.quizzes.map(function (k) {
        return getJSON('data/quizzes/' + k + '.json');
      })).then(function (list) {
        out.quizzes = { quizzes: list };
        return out;
      });
    });
  }

  function fromBundle() {
    if (global.__AQ_BUNDLE__) return Promise.resolve(global.__AQ_BUNDLE__);
    return loadScript('data/bundle.js').then(function () {
      if (!global.__AQ_BUNDLE__) throw new Error('bundle.js contained no data');
      return global.__AQ_BUNDLE__;
    });
  }

  /* Gendered names.

     A handful of aesthetics are known on the Aesthetics Wiki by a name that
     assumes a gender — Soft Girl, Mob Wife, Eclectic Grandpa. Nothing about the
     taste itself is gendered, and the test never asks, so the neutral name is
     what the data carries and what everyone sees by default. The canonical
     wording lives in the entry's `gendered` block and is swapped in only when
     the reader turns it on.

     Applied here, on the loaded data, so the rest of the app can go on reading
     a.name / a.tagline / a.description without knowing any of this exists. */
  var STORE_GENDERED = 'aq.genderedNames.v1';

  function readFlag() {
    try { return global.localStorage.getItem(STORE_GENDERED) === 'true'; }
    catch (e) { return false; }
  }

  function applyNames(data, gendered) {
    data.aesthetics.forEach(function (a) {
      if (!a.neutral) {
        a.neutral = { name: a.name, tagline: a.tagline, description: a.description };
      }
      var use = gendered && a.gendered ? a.gendered : {};
      a.name = use.name || a.neutral.name;
      a.tagline = use.tagline || a.neutral.tagline;
      a.description = use.description || a.neutral.description;
    });
    data.genderedNames = !!gendered;
    return data;
  }

  AQ.names = {
    /* Which aesthetics actually differ between the two versions. */
    affected: function (data) {
      return data.aesthetics.filter(function (a) { return a.gendered; });
    },

    /* Switch version and re-apply to already-loaded data. The caller re-renders. */
    set: function (data, gendered) {
      try { global.localStorage.setItem(STORE_GENDERED, gendered ? 'true' : 'false'); }
      catch (e) { /* private mode: the choice just does not persist */ }
      return applyNames(data, gendered);
    }
  };

  function index(data) {
    applyNames(data, readFlag());
    data.questionsById = {};
    data.questions.forEach(function (q) { data.questionsById[q.id] = q; });
    /* The family quizzes (internet, nature, ...) have their own statements:
       findable by id, but kept out of data.questions so the main test never
       draws them. */
    data.familyQuizzes = (data.quizzes && data.quizzes.quizzes) || [];
    data.quizByKey = {};
    data.familyQuizzes.forEach(function (qz) {
      data.quizByKey[qz.key] = qz;
      qz.questions.forEach(function (q) { data.questionsById[q.id] = q; });
    });
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
