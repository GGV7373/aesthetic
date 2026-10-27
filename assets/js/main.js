/* The one script the pages include. Loads the rest in order: async = false makes
   injected scripts run in the order they were added, like plain <script> tags.
   A new file only needs its name added here. */
(function () {
  var base = document.currentScript.src.replace(/main\.js.*$/, '');
  ['prng', 'data', 'selection', 'scoring', 'narrative', 'visuals', 'images',
    'music', 'compare', 'card', 'app'].forEach(function (name) {
    var s = document.createElement('script');
    s.src = base + name + '.js';
    s.async = false;
    document.body.appendChild(s);
  });
})();
