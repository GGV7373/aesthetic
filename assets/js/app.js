/* UI og flyt. All quizdata ligger i /data — denne filen vet ingenting om
   hvilke estetikker som finnes, bare hvordan de skal vises.                */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var STORE_SESSION = 'aq.session.v2';
  var STORE_HISTORY = 'aq.previousQuestionIds.v2';
  var STORE_PREFS = 'aq.prefs.v1';

  var data = null;
  var session = null;
  var prefs = { autoAdvance: true };
  var root;

  /* ---------- små hjelpere ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function readStore(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function writeStore(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* privat modus */ }
  }

  function clearStore(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* ignorer */ }
  }

  function queryParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(global.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- historikk: unngå de samme 50 spørsmålene på rad ---------- */

  function historyIds() {
    var hist = readStore(STORE_HISTORY, []);
    var max = (data.config.selection && data.config.selection.maxHistorySessions) || 4;
    var recent = hist.slice(-max);
    var seen = {};
    recent.forEach(function (run) {
      (run || []).forEach(function (id) { seen[id] = true; });
    });
    var ids = Object.keys(seen).map(Number);
    /* Er nesten alt brukt opp, nullstiller vi heller enn å låse utvalget. */
    if (data.questions.length - ids.length < data.config.questionsPerQuiz) {
      var lastRun = hist[hist.length - 1] || [];
      return lastRun.slice();
    }
    return ids;
  }

  function rememberRun(questions) {
    var hist = readStore(STORE_HISTORY, []);
    hist.push(questions.map(function (q) { return q.id; }));
    writeStore(STORE_HISTORY, hist.slice(-12));
  }

  /* ---------- sesjon ---------- */

  /* replay: en seed brukeren har fått tilsendt skal gi nøyaktig samme quiz, og
     kan derfor ikke filtreres mot hva denne nettleseren har sett før. */
  function startSession(seed, replay) {
    var selection = AQ.selectQuestions(data, {
      seed: seed || AQ.rng.newSeedString(),
      excludeIds: replay ? [] : historyIds()
    });
    session = {
      seed: selection.seed,
      questionIds: selection.questions.map(function (q) { return q.id; }),
      answers: {},
      index: 0,
      startedAt: Date.now()
    };
    rememberRun(selection.questions);
    persistSession();
    return session;
  }

  function persistSession() { writeStore(STORE_SESSION, session); }

  function sessionQuestions() {
    return session.questionIds.map(function (id) { return data.questionsById[id]; })
      .filter(Boolean);
  }

  function restoreSession() {
    var saved = readStore(STORE_SESSION, null);
    if (!saved || !saved.questionIds || !saved.questionIds.length) return null;
    var ok = saved.questionIds.every(function (id) { return !!data.questionsById[id]; });
    return ok ? saved : null;
  }

  /* ---------- skjermbytte ---------- */

  function render(node) {
    root.innerHTML = '';
    root.appendChild(node);
    node.classList.add('fade-in');
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------- intro ---------- */

  function screenIntro() {
    var saved = restoreSession();
    var resumable = saved && Object.keys(saved.answers || {}).length > 0 &&
      Object.keys(saved.answers).length < saved.questionIds.length;

    var actions = el('div', { class: 'intro__actions' }, [
      el('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: function () {
          var urlSeed = queryParam('seed');
          clearStore(STORE_SESSION);
          startSession(urlSeed, !!urlSeed);
          screenQuiz();
        }
      }, ['Start testen']),
      resumable
        ? el('button', {
            class: 'btn btn--ghost',
            type: 'button',
            onclick: function () { session = saved; screenQuiz(); }
          }, ['Fortsett der du slapp (' + Object.keys(saved.answers).length + ' svar)'])
        : null
    ]);

    var view = el('section', { class: 'screen screen--intro' }, [
      el('p', { class: 'eyebrow', text: 'En estetisk profil i 50 påstander' }),
      el('h1', { class: 'display', html: 'WHAT<br>AESTHETIC<br>ARE YOU?' }),
      el('p', { class: 'lede' }, [
        'Dette er ikke en quiz om hva du liker å se på. Det er en test av hvilken ' +
        'estetisk verden temperamentet ditt hører hjemme i — forholdet ditt til natur, ' +
        'teknologi, historie, orden, ensomhet, mørke og skjønnhet.'
      ]),
      el('p', { class: 'lede lede--muted' }, [
        'Du får 50 påstander trukket fra en bank på ' + data.questions.length +
        ', balansert på tvers av ni temaer. Ingen påstand hører til én bestemt estetikk, ' +
        'og du får ikke vite hva noe måler før resultatet. Svar ærlig heller enn ' +
        'interessant — det er da testen blir presis.'
      ]),
      actions,
      el('ul', { class: 'intro__facts' }, [
        el('li', {}, [el('strong', { text: String(data.aesthetics.length) }), ' estetikker vurderes']),
        el('li', {}, [el('strong', { text: String(data.config.dimensions.length) }), ' skjulte dimensjoner']),
        el('li', {}, [el('strong', { text: '7' }), ' svarnivåer per påstand'])
      ]),
      queryParam('seed')
        ? el('p', { class: 'fineprint' }, [
            'Du har åpnet en delt gjennomføring (', el('code', { text: AQ.rng.normaliseSeed(queryParam('seed')) }),
            '). Du får nøyaktig de samme 50 påstandene i samme rekkefølge som den som delte lenken.'
          ])
        : null,
      el('p', { class: 'fineprint' }, [
        'Alt regnes ut i nettleseren din. Ingenting sendes noe sted, og svarene lagres ' +
        'bare lokalt slik at du kan fortsette hvis du lukker fanen.'
      ])
    ]);

    render(view);
  }

  /* ---------- quiz ---------- */

  function screenQuiz() {
    var questions = sessionQuestions();
    var total = questions.length;

    var progressFill = el('div', { class: 'progress__fill' });
    var progressBar = el('div', {
      class: 'progress',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': '0',
      'aria-label': 'Framdrift'
    }, [progressFill]);

    var counter = el('p', { class: 'quiz__counter' });
    var statement = el('p', { class: 'quiz__statement' });
    var optionsWrap = el('div', {
      class: 'options',
      role: 'radiogroup',
      'aria-label': 'Hvor enig er du?'
    });

    var prevBtn = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function () { go(-1); }
    }, ['← Forrige']);

    var nextBtn = el('button', {
      class: 'btn btn--primary', type: 'button',
      onclick: function () { go(1); }
    }, ['Neste →']);

    var autoToggle = el('label', { class: 'toggle' }, [
      el('input', {
        type: 'checkbox', checked: prefs.autoAdvance ? 'checked' : null,
        onchange: function (e) {
          prefs.autoAdvance = e.target.checked;
          writeStore(STORE_PREFS, prefs);
        }
      }),
      el('span', { text: 'Gå videre automatisk' })
    ]);

    var live = el('div', { class: 'sr-only', 'aria-live': 'polite' });

    var view = el('section', { class: 'screen screen--quiz' }, [
      el('header', { class: 'quiz__head' }, [
        el('p', { class: 'eyebrow', text: 'WHAT AESTHETIC ARE YOU?' }),
        progressBar,
        counter
      ]),
      el('div', { class: 'quiz__card' }, [statement, optionsWrap]),
      el('nav', { class: 'quiz__nav' }, [prevBtn, autoToggle, nextBtn]),
      live
    ]);

    function paint() {
      var q = questions[session.index];
      var answered = Object.keys(session.answers).length;

      counter.textContent = 'Spørsmål ' + (session.index + 1) + ' / ' + total;
      progressFill.style.width = ((session.index) / total) * 100 + '%';
      progressBar.setAttribute('aria-valuenow', String(session.index));

      statement.textContent = q.text;
      statement.classList.remove('is-entering');
      /* tvinger reflow slik at animasjonen kjører på nytt */
      void statement.offsetWidth;
      statement.classList.add('is-entering');

      optionsWrap.innerHTML = '';
      data.config.scale.forEach(function (step, i) {
        var selected = session.answers[q.id] === step.value;
        var btn = el('button', {
          class: 'option' + (selected ? ' option--selected' : ''),
          type: 'button',
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
          'data-value': String(step.value),
          onclick: function () { answer(step.value); }
        }, [
          el('span', { class: 'option__dot' }),
          el('span', { class: 'option__label', text: step.label }),
          el('span', { class: 'option__key', text: String(i + 1) })
        ]);
        optionsWrap.appendChild(btn);
      });

      prevBtn.disabled = session.index === 0;
      nextBtn.textContent = session.index === total - 1 ? 'Se resultatet →' : 'Neste →';
      nextBtn.disabled = session.answers[q.id] === undefined;
      live.textContent = 'Spørsmål ' + (session.index + 1) + ' av ' + total + '. ' +
        (answered === total ? 'Alle besvart.' : '');
    }

    function answer(value) {
      var q = questions[session.index];
      var isNew = session.answers[q.id] === undefined;
      session.answers[q.id] = value;
      persistSession();
      paint();
      if (prefs.autoAdvance && isNew) {
        global.setTimeout(function () {
          if (session.index < total - 1) go(1);
          else finish();
        }, 380);
      }
    }

    function go(delta) {
      var target = session.index + delta;
      if (target < 0) return;
      if (target >= total) { finish(); return; }
      session.index = target;
      persistSession();
      paint();
    }

    function finish() {
      var unanswered = questions.filter(function (q) {
        return session.answers[q.id] === undefined;
      });
      if (unanswered.length) {
        session.index = questions.indexOf(unanswered[0]);
        persistSession();
        paint();
        live.textContent = 'Du har ' + unanswered.length + ' ubesvarte påstander igjen.';
        return;
      }
      screenResult();
    }

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= data.config.scale.length) {
        e.preventDefault();
        answer(data.config.scale[n - 1].value);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }

    document.addEventListener('keydown', onKey);
    view.addEventListener('aq:teardown', function () {
      document.removeEventListener('keydown', onKey);
    });

    render(view);
    paint();
  }

  /* ---------- resultat ---------- */

  function bar(value, options) {
    options = options || {};
    var fill = el('div', {
      class: 'bar__fill' + (options.subtle ? ' bar__fill--subtle' : ''),
      style: options.background ? 'background:' + options.background : null
    });
    var wrap = el('div', { class: 'bar' }, [fill]);
    global.requestAnimationFrame(function () {
      global.setTimeout(function () {
        fill.style.width = Math.max(2, Math.min(100, value)) + '%';
      }, options.delay || 30);
    });
    return wrap;
  }

  function aestheticCard(entry, kind, opts) {
    opts = opts || {};
    var a = data.aestheticsByKey[entry.key];
    var head = el('div', { class: 'card__head' }, [
      el('p', { class: 'eyebrow', text: opts.label || '' }),
      el('h3', { class: 'card__title', text: a.name }),
      el('p', { class: 'card__percent' }, [
        el('strong', { text: entry.percent + ' %' }),
        el('span', { text: ' ' + AQ.narrative.strengthLabel(entry.percent, data) })
      ])
    ]);

    return el('article', { class: 'card card--' + kind }, [
      el('div', { class: 'card__swatch', style: 'background:' + AQ.visuals.swatch(a) }),
      head,
      bar(entry.percent, { background: AQ.visuals.swatch(a) }),
      el('p', { class: 'card__tagline', text: a.tagline }),
      el('p', { class: 'card__body', text: a.description }),
      opts.note ? el('p', { class: 'card__note', text: opts.note }) : null
    ]);
  }

  function profileSection(profile) {
    var showAll = false;
    var list = el('div', { class: 'profile__grid' });

    function paint() {
      list.innerHTML = '';
      var dims = data.config.dimensions.filter(function (d) { return showAll || d.core; });
      dims
        .map(function (d) {
          return { meta: d, value: profile.value[d.key], strength: Math.abs(profile.value[d.key] - 0.5) };
        })
        .sort(function (a, b) { return b.strength - a.strength; })
        .forEach(function (row, i) {
          var pct = Math.round(row.value * 100);
          list.appendChild(el('div', { class: 'profile__row' }, [
            el('span', { class: 'profile__label', text: row.meta.label }),
            bar(pct, { subtle: true, delay: 40 + i * 18 }),
            el('span', { class: 'profile__value', text: pct + '' }),
            el('span', { class: 'profile__poles', text: row.meta.low + ' → ' + row.meta.high })
          ]));
        });
    }

    var toggle = el('button', {
      class: 'btn btn--link', type: 'button',
      onclick: function (e) {
        showAll = !showAll;
        e.target.textContent = showAll ? 'Vis bare hoveddimensjonene' : 'Vis alle ' +
          data.config.dimensions.length + ' dimensjoner';
        paint();
      }
    }, ['Vis alle ' + data.config.dimensions.length + ' dimensjoner']);

    paint();

    return el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'YOUR PROFILE' }),
      el('p', { class: 'block__lede', text: 'Dette er råmaterialet resultatet er regnet ut fra. ' +
        'Ingen av dem ble vist deg underveis.' }),
      list,
      toggle
    ]);
  }

  function screenResult() {
    var questions = sessionQuestions();
    var result = AQ.score(questions, session.answers, data);
    var rng = AQ.rng.rngFromSeed(session.seed, 'narrative');

    var primary = data.aestheticsByKey[result.primary.key];
    var why = AQ.narrative.buildWhy(result, data, rng);
    var world = AQ.narrative.buildWorld(primary, result.profile, data, rng);
    var hybrid = AQ.narrative.buildHybrid(result.combination, data, rng, result.profile);

    /* --- hero --- */
    var plate = el('div', { class: 'hero__plate', html: AQ.visuals.moodPlate(primary) });
    var heroPercent = el('div', { class: 'hero__match' }, [
      el('span', { class: 'hero__percentnum', text: result.primary.percent + '' }),
      el('span', { class: 'hero__percentsign', text: '%' }),
      el('span', { class: 'hero__matchword', text: 'MATCH' })
    ]);

    var hero = el('header', { class: 'hero' }, [
      plate,
      el('div', { class: 'hero__inner' }, [
        el('p', { class: 'eyebrow', text: 'YOUR AESTHETIC' }),
        el('h1', { class: 'hero__name', text: primary.name.toUpperCase() }),
        heroPercent,
        bar(result.primary.percent, { background: AQ.visuals.swatch(primary) }),
        el('p', { class: 'hero__tagline', text: primary.tagline }),
        el('p', { class: 'hero__strength', text: AQ.narrative.strengthLabel(result.primary.percent, data) })
      ])
    ]);

    /* --- hvorfor --- */
    var whyBlock = el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'HVORFOR?' }),
      el('div', { class: 'prose' }, why.map(function (s) { return el('p', { text: s }); })),
      el('p', { class: 'prose prose--muted', text: primary.description })
    ]);

    /* --- sekundær og skjult --- */
    var sideBySide = el('div', { class: 'cards' }, [
      aestheticCard(result.secondary, 'secondary', { label: 'SEKUNDÆR' }),
      aestheticCard(result.hidden, 'hidden', {
        label: 'HIDDEN',
        note: AQ.narrative.hiddenIntro(data, rng)
      })
    ]);

    /* --- kombinasjon --- */
    var comboBlock = null;
    if (hybrid) {
      comboBlock = el('section', { class: 'block block--combo' }, [
        el('h2', { class: 'block__title', text: 'KOMBINASJON' }),
        el('p', { class: 'combo__label', text: hybrid.label }),
        el('div', { class: 'prose' }, [
          el('p', { text: hybrid.intro }),
          el('p', { text: hybrid.bridge }),
          hybrid.tension ? el('p', { text: hybrid.tension }) : null,
          el('p', { class: 'prose--muted', text: hybrid.note })
        ])
      ]);
    }

    /* --- din versjon --- */
    var worldBlock = el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'DIN VERSJON AV ' + primary.name.toUpperCase() }),
      el('p', { class: 'block__lede', text: 'Slik ville estetikken sett ut om den ble bygget ' +
        'rundt akkurat din profil, ikke rundt gjennomsnittet.' }),
      el('div', { class: 'facets' }, world.map(function (f, i) {
        return el('div', { class: 'facet', style: 'animation-delay:' + (i * 60) + 'ms' }, [
          el('h4', { class: 'facet__label', text: f.label }),
          el('p', { class: 'facet__text', text: f.text })
        ]);
      }))
    ]);

    /* --- rangering --- */
    var top = result.ranked.slice(0, 10);
    var rankBlock = el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'HELE RANGERINGEN' }),
      el('p', { class: 'block__lede', text: 'Ingen passer inn i bare én verden. Dette er de ti ' +
        'nærmeste av ' + data.aesthetics.length + '.' }),
      el('ol', { class: 'rank' }, top.map(function (entry, i) {
        var a = data.aestheticsByKey[entry.key];
        return el('li', { class: 'rank__row' }, [
          el('span', { class: 'rank__num', text: String(i + 1).padStart(2, '0') }),
          el('span', { class: 'rank__name', text: a.name }),
          bar(entry.percent, { background: AQ.visuals.swatch(a), delay: 60 + i * 30 }),
          el('span', { class: 'rank__pct', text: entry.percent + ' %' })
        ]);
      }))
    ]);

    /* --- bunn --- */
    var seedLink = global.location.origin + global.location.pathname + '?seed=' + session.seed;
    var copyBtn = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function (e) {
        var btn = e.currentTarget;
        var done = function () {
          btn.textContent = 'Lenken er kopiert';
          global.setTimeout(function () { btn.textContent = 'Kopier lenke til denne gjennomføringen'; }, 2200);
        };
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(seedLink).then(done, function () {
            global.prompt('Kopier lenken:', seedLink);
          });
        } else {
          global.prompt('Kopier lenken:', seedLink);
        }
      }
    }, ['Kopier lenke til denne gjennomføringen']);

    var footer = el('footer', { class: 'result__footer' }, [
      el('p', { class: 'fineprint' }, [
        'Gjennomføring ', el('code', { text: session.seed }),
        '. Samme kode gir samme 50 påstander i samme rekkefølge.'
      ]),
      el('div', { class: 'result__actions' }, [
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: function () {
            clearStore(STORE_SESSION);
            startSession(null, false);
            screenQuiz();
          }
        }, ['Ta testen på nytt med nye spørsmål']),
        copyBtn
      ]),
      el('p', { class: 'fineprint' }, [
        'Estetikkene tar utgangspunkt i Aesthetics Wiki som referanse. Beskrivelser, ' +
        'dimensjoner og spørsmål er skrevet for denne testen, og stemningsbildene er ' +
        'generert av koden — ingen bilder er hentet fra wikien.'
      ])
    ]);

    var view = el('section', { class: 'screen screen--result' }, [
      hero,
      whyBlock,
      sideBySide,
      comboBlock,
      worldBlock,
      profileSection(result.profile),
      rankBlock,
      footer
    ]);

    clearStore(STORE_SESSION);
    render(view);
  }

  /* ---------- oppstart ---------- */

  function boot() {
    root = document.getElementById('app');
    prefs = readStore(STORE_PREFS, prefs) || prefs;

    /* Fjerner tastaturlyttere når en skjerm byttes ut. */
    var originalRender = render;
    render = function (node) {
      var current = root.firstChild;
      if (current && current.dispatchEvent) current.dispatchEvent(new Event('aq:teardown'));
      originalRender(node);
    };

    root.innerHTML = '';
    root.appendChild(el('p', { class: 'loading', text: 'Laster …' }));

    AQ.loadData().then(function (loaded) {
      data = loaded;
      /* En seed i URL-en gjenskaper en gjennomføring — den plukkes opp når testen startes. */
      if (queryParam('seed')) clearStore(STORE_SESSION);
      screenIntro();
    }).catch(function (err) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'screen' }, [
        el('h1', { class: 'display', text: 'Kunne ikke laste testen' }),
        el('p', { class: 'lede', text: String(err && err.message ? err.message : err) }),
        el('p', { class: 'lede lede--muted', text: 'Åpner du filen direkte fra disk, kjør ' +
          '"node tools/build-bundle.js" én gang, eller start en lokal server med ' +
          '"npx serve" i mappen.' })
      ]));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
