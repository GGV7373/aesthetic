/* Screens and flow. All quiz data lives in /data — this file knows nothing about
   which aesthetics exist, only how to present them.                          */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  var STORE_SESSION = 'aq.session.v3';
  var STORE_HISTORY = 'aq.previousQuestionIds.v3';
  var STORE_PREFS = 'aq.preferences.v1';
  var PREFS_MAX_PICKS = 5;

  var SWAP_MS = 170;   /* how long a question takes to move out of the way */
  var ADVANCE_MS = 240; /* pause after an answer before moving on */

  var data = null;
  var session = null;
  var root;

  /* ---------- helpers ---------- */

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
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function clearStore(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  function queryParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(global.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- history: don't serve the same fifty twice in a row ---------- */

  function historyIds() {
    var hist = readStore(STORE_HISTORY, []);
    var max = (data.config.selection && data.config.selection.maxHistorySessions) || 4;
    var seen = {};
    hist.slice(-max).forEach(function (run) {
      (run || []).forEach(function (id) { seen[id] = true; });
    });
    var ids = Object.keys(seen).map(Number);
    /* Nearly everything used up: fall back to excluding only the last run. */
    if (data.questions.length - ids.length < data.config.questionsPerQuiz) {
      return (hist[hist.length - 1] || []).slice();
    }
    return ids;
  }

  function rememberRun(questions) {
    var hist = readStore(STORE_HISTORY, []);
    hist.push(questions.map(function (q) { return q.id; }));
    writeStore(STORE_HISTORY, hist.slice(-12));
  }

  /* Turns the categories someone picked on the preferences screen ("Food & the
     table", "Technology", ...) into the underlying statement groups they cover. */
  function groupsForPreferences(categoryKeys) {
    var wanted = {};
    (categoryKeys || []).forEach(function (k) { wanted[k] = true; });
    var groups = {};
    (data.config.preferenceCategories || []).forEach(function (cat) {
      if (!wanted[cat.key]) return;
      cat.groups.forEach(function (g) { groups[g] = true; });
    });
    return Object.keys(groups);
  }

  /* ---------- session ---------- */

  /* replay: a seed somebody was given has to produce exactly the same quiz, so it
     cannot be filtered against what this browser has seen before, or biased by
     whatever this browser's own owner said mattered to them. */
  function startSession(seed, replay, preferredGroups) {
    var selection = AQ.selectQuestions(data, {
      seed: seed || AQ.rng.newSeedString(),
      excludeIds: replay ? [] : historyIds(),
      preferredGroups: replay ? [] : (preferredGroups || [])
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
    return session.questionIds
      .map(function (id) { return data.questionsById[id]; })
      .filter(Boolean);
  }

  function restoreSession() {
    var saved = readStore(STORE_SESSION, null);
    if (!saved || !saved.questionIds || !saved.questionIds.length) return null;
    var ok = saved.questionIds.every(function (id) { return !!data.questionsById[id]; });
    return ok ? saved : null;
  }

  /* ---------- screen swapping ---------- */

  function render(node) {
    var current = root.firstChild;
    if (current && current.dispatchEvent) current.dispatchEvent(new Event('aq:teardown'));
    root.innerHTML = '';
    root.appendChild(node);
    node.classList.add('fade-in');
    global.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------- intro ---------- */

  /* ---------- gendered names ---------- */

  /* A few aesthetics are known by a name that assumes a gender. The test itself
     never asks and nothing in the scoring changes, so the neutral name is the
     default; this offers the canonical wording to anyone who prefers it.
     `redraw` re-renders whichever screen the switch was used on. */
  function genderedNamesToggle(redraw) {
    var affected = AQ.names.affected(data);
    if (!affected.length) return null;

    var on = data.genderedNames;

    var button = el('button', {
      class: 'btn btn--ghost btn--small', type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      onclick: function () {
        AQ.names.set(data, !data.genderedNames);
        redraw();
      }
    }, [on ? 'Use neutral names' : 'Use gender-specific names']);

    var renamed = affected.filter(function (a) { return a.gendered.name; });
    var examples = renamed.slice(0, 3).map(function (a) {
      return on ? a.name : a.neutral.name + ' → ' + a.gendered.name;
    }).join(', ');

    return el('div', { class: 'namemode' }, [
      el('p', { class: 'fineprint' }, [
        on
          ? 'Showing the gender-specific version — ' + renamed.length +
            ' aesthetics use the gendered name they are known by (' + examples +
            '), and ' + (affected.length - renamed.length) + ' are worded differently.'
          : 'Everything is gender-neutral: the test never asks, and no aesthetic belongs ' +
            'to one gender. ' + affected.length + ' of them have a gender-specific version ' +
            'on the Aesthetics Wiki (' + examples + ').'
      ]),
      button
    ]);
  }

  function screenIntro() {
    var saved = restoreSession();
    var answered = saved ? Object.keys(saved.answers || {}).length : 0;
    var resumable = saved && answered > 0 && answered < saved.questionIds.length;
    var urlSeed = queryParam('seed');

    var view = el('section', { class: 'screen screen--intro' }, [
      el('p', { class: 'eyebrow', text: 'An aesthetic profile in 50 statements' }),
      el('h1', { class: 'display', html: 'WHAT<br>AESTHETIC<br>ARE YOU?' }),
      el('p', { class: 'lede' }, [
        'This is not a quiz about what you like the look of. It is a test of which ' +
        'aesthetic world your temperament belongs to — your relationship to nature, ' +
        'technology, history, order, solitude, darkness and beauty.'
      ]),
      el('p', { class: 'lede lede--muted' }, [
        'The questions sit in ' + data.config.groups.length + ' themed groups — music, ' +
        'weather, screens, the unexplained, and so on — and each run draws two or three ' +
        'from every group. No statement belongs to any one aesthetic, and you are never ' +
        'told what something measures until the result. Answer honestly rather than ' +
        'interestingly; that is when the test gets precise.'
      ]),
      el('div', { class: 'intro__actions' }, [
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: function () {
            clearStore(STORE_SESSION);
            if (urlSeed) {
              /* A shared run is fixed by its seed alone - skip straight in. */
              startSession(urlSeed, true);
              screenQuiz();
            } else {
              screenPreferences();
            }
          }
        }, ['Start the test']),
        resumable
          ? el('button', {
              class: 'btn btn--ghost', type: 'button',
              onclick: function () { session = saved; screenQuiz(); }
            }, ['Resume (' + answered + ' answered)'])
          : null
      ]),
      el('ul', { class: 'intro__facts' }, [
        el('li', {}, [el('strong', { text: String(data.questions.length) }), 'statements in the bank']),
        el('li', {}, [el('strong', { text: String(data.aesthetics.length) }), 'aesthetics considered']),
        el('li', {}, [el('strong', { text: String(data.config.dimensions.length) }), 'hidden dimensions']),
        el('li', {}, [el('strong', { text: '7' }), 'answer levels per statement'])
      ]),
      urlSeed
        ? el('p', { class: 'fineprint' }, [
            'You have opened a shared run (', el('code', { text: AQ.rng.normaliseSeed(urlSeed) }),
            '). You will get exactly the same 50 statements, in the same order, as the ' +
            'person who shared the link.'
          ])
        : null,
      el('p', { class: 'fineprint' }, [
        'Everything is worked out in your own browser. Nothing is sent anywhere, and your ' +
        'answers are stored locally only so you can pick up where you left off.'
      ]),
      genderedNamesToggle(screenIntro)
    ]);

    render(view);
  }

  /* ---------- preferences ---------- */

  /* A short screen between the intro and the quiz: pick a handful of things that
     matter to you (living space, music, food, other people, technology, ...) and
     the statements you get lean a little more towards those themes. Every theme
     is still covered - this only nudges which groups win the "extra" slot,
     see AQ.selectQuestions / drawQuotas in selection.js. */
  function screenPreferences() {
    var categories = data.config.preferenceCategories || [];
    var selected = {};
    readStore(STORE_PREFS, []).forEach(function (k) { selected[k] = true; });

    var chipButtons = {};
    var continueBtn, note;

    function pickedCount() {
      return Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    }

    function refresh() {
      var n = pickedCount();
      continueBtn.textContent = n ? 'Continue (' + n + ' chosen)' : 'Continue without choosing';
      note.textContent = n >= PREFS_MAX_PICKS
        ? 'That is five - the most you can pick at once.'
        : 'Pick up to ' + PREFS_MAX_PICKS + '. None chosen is fine too.';
    }

    var chipsWrap = el('div', { class: 'chips', role: 'group', 'aria-label': 'What matters to you' },
      categories.map(function (cat) {
        var btn = el('button', {
          class: 'chip' + (selected[cat.key] ? ' chip--selected' : ''),
          type: 'button',
          'aria-pressed': selected[cat.key] ? 'true' : 'false',
          onclick: function () {
            if (!selected[cat.key] && pickedCount() >= PREFS_MAX_PICKS) return;
            selected[cat.key] = !selected[cat.key];
            btn.classList.toggle('chip--selected', !!selected[cat.key]);
            btn.setAttribute('aria-pressed', selected[cat.key] ? 'true' : 'false');
            refresh();
          }
        }, [
          el('span', { class: 'chip__label', text: cat.label }),
          el('span', { class: 'chip__hint', text: cat.hint })
        ]);
        chipButtons[cat.key] = btn;
        return btn;
      })
    );

    note = el('p', { class: 'chips__note' });

    function begin() {
      var keys = Object.keys(selected).filter(function (k) { return selected[k]; });
      writeStore(STORE_PREFS, keys);
      startSession(null, false, groupsForPreferences(keys));
      screenQuiz();
    }

    continueBtn = el('button', {
      class: 'btn btn--primary', type: 'button', onclick: begin
    }, ['Continue']);

    var skipBtn = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function () {
        selected = {};
        begin();
      }
    }, ['Skip — surprise me']);

    refresh();

    var view = el('section', { class: 'screen screen--preferences' }, [
      el('p', { class: 'eyebrow', text: 'Before you start' }),
      el('h1', { class: 'display display--sub', html: 'WHAT MATTERS<br>TO YOU?' }),
      el('p', { class: 'lede' }, [
        'Living space, music, food, other people, technology - what you care about ' +
        'shapes which statements you get more of. The test still covers every theme ' +
        'either way, and no single choice steers the result on its own.'
      ]),
      chipsWrap,
      note,
      el('div', { class: 'intro__actions' }, [continueBtn, skipBtn])
    ]);

    render(view);
  }

  /* ---------- quiz ---------- */

  function screenQuiz() {
    var questions = sessionQuestions();
    var total = questions.length;
    var busy = false;
    var optionButtons = [];

    var progressFill = el('div', { class: 'progress__fill' });
    var progressBar = el('div', {
      class: 'progress', role: 'progressbar',
      'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': '0',
      'aria-label': 'Progress'
    }, [progressFill]);

    var counter = el('p', { class: 'quiz__counter' });
    var statement = el('p', { class: 'quiz__statement' });
    var optionsWrap = el('div', {
      class: 'options', role: 'radiogroup', 'aria-label': 'How much do you agree?'
    });
    var body = el('div', { class: 'quiz__body' }, [statement, optionsWrap]);

    var prevBtn = el('button', {
      class: 'btn btn--ghost', type: 'button', onclick: function () { go(-1); }
    }, ['← Back']);

    var nextBtn = el('button', {
      class: 'btn btn--primary', type: 'button', onclick: function () { go(1); }
    }, ['Next →']);

    var live = el('div', { class: 'sr-only', 'aria-live': 'polite' });

    var view = el('section', { class: 'screen screen--quiz' }, [
      el('header', { class: 'quiz__head' }, [
        el('p', { class: 'eyebrow', text: 'What aesthetic are you?' }),
        progressBar,
        el('div', { class: 'quiz__meta' }, [counter])
      ]),
      el('div', { class: 'quiz__card' }, [body]),
      el('nav', { class: 'quiz__nav' }, [prevBtn, nextBtn]),
      live
    ]);

    /* Only the selected state changes here — no rebuilding, so nothing flickers. */
    function markSelection(value) {
      optionButtons.forEach(function (btn) {
        var on = Number(btn.getAttribute('data-value')) === value;
        btn.classList.toggle('option--selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      nextBtn.disabled = value === undefined;
    }

    function paintQuestion() {
      var q = questions[session.index];

      counter.textContent = 'Question ' + (session.index + 1) + ' of ' + total;
      progressFill.style.width = (session.index / total) * 100 + '%';
      progressBar.setAttribute('aria-valuenow', String(session.index));

      statement.textContent = q.text;

      optionsWrap.innerHTML = '';
      optionButtons = data.config.scale.map(function (step, i) {
        var btn = el('button', {
          class: 'option', type: 'button', role: 'radio',
          'aria-checked': 'false',
          'data-value': String(step.value),
          onclick: function () { answer(step.value); }
        }, [
          el('span', { class: 'option__dot' }),
          el('span', { class: 'option__label', text: step.label }),
          el('span', { class: 'option__key', text: String(i + 1) })
        ]);
        optionsWrap.appendChild(btn);
        return btn;
      });

      markSelection(session.answers[q.id]);
      prevBtn.disabled = session.index === 0;
      nextBtn.textContent = session.index === total - 1 ? 'See result →' : 'Next →';
      live.textContent = 'Question ' + (session.index + 1) + ' of ' + total + '.';
    }

    /* Moves the whole block out, swaps the content while it is invisible, and
       lets it settle back. One motion instead of a jump. */
    function transition(targetIndex, direction, done) {
      if (busy) return;
      busy = true;
      body.classList.add(direction < 0 ? 'is-out-back' : 'is-out');
      global.setTimeout(function () {
        if (targetIndex !== null) {
          session.index = targetIndex;
          persistSession();
          paintQuestion();
        }
        body.classList.remove('is-out', 'is-out-back');
        busy = false;
        if (done) done();
      }, SWAP_MS);
    }

    function answer(value) {
      if (busy) return;
      var q = questions[session.index];
      var isNew = session.answers[q.id] === undefined;
      session.answers[q.id] = value;
      persistSession();
      markSelection(value);

      /* Answering a fresh statement always carries you to the next one. */
      if (isNew) {
        global.setTimeout(function () {
          if (session.index < total - 1) go(1);
          else finish();
        }, ADVANCE_MS);
      }
    }

    function go(delta) {
      if (busy) return;
      var target = session.index + delta;
      if (target < 0) return;
      if (target >= total) { finish(); return; }
      transition(target, delta);
    }

    function finish() {
      var unanswered = questions.filter(function (q) {
        return session.answers[q.id] === undefined;
      });
      if (unanswered.length) {
        var jumpTo = questions.indexOf(unanswered[0]);
        transition(jumpTo, jumpTo < session.index ? -1 : 1, function () {
          live.textContent = unanswered.length + ' statements still unanswered.';
        });
        return;
      }
      transition(null, 1, screenResult);
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
    paintQuestion();
  }

  /* ---------- result pieces ---------- */

  function meter(value, options) {
    options = options || {};
    var fill = el('div', {
      class: 'bar__fill' + (options.subtle ? ' bar__fill--subtle' : ''),
      style: options.background ? 'background:' + options.background : null
    });
    var wrap = el('div', { class: 'bar' }, [fill]);
    var target = Math.max(2, Math.min(100, value)) + '%';

    var delay = options.delay || 40;

    /* The bar is built before the screen is in the document, so the starting
       width has to be laid out for real before it is changed - otherwise the
       browser collapses both values into one frame and the transition never
       runs. Two frames guarantee a layout in between. */
    fill.style.width = '0%';
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        global.setTimeout(function () { fill.style.width = target; }, delay);
      });
    });

    /* A transition started while the tab is throttled can be registered and then
       never ticked - the bar would sit at zero for good, showing a number that
       isn't the one in the text. If it hasn't moved by the time it should have
       finished, drop the animation and pin the real value. */
    global.setTimeout(function () {
      if (!wrap.isConnected) return;
      if (fill.getBoundingClientRect().width < 1 && value > 2) {
        fill.style.transition = 'none';
        fill.style.width = target;
      }
    }, delay + 1400);

    return wrap;
  }

  function aestheticCard(entry, kind, opts) {
    opts = opts || {};
    var a = data.aestheticsByKey[entry.key];
    return el('article', { class: 'card card--' + kind }, [
      el('div', { class: 'card__swatch', style: 'background:' + AQ.visuals.swatch(a) }),
      el('div', { class: 'card__head' }, [
        el('p', { class: 'eyebrow', text: opts.label || '' }),
        el('h3', { class: 'card__title', text: a.name }),
        el('p', { class: 'card__percent' }, [
          el('strong', { text: entry.percent + '%' }),
          el('span', { text: AQ.narrative.strengthLabel(entry.percent, data) })
        ])
      ]),
      meter(entry.percent, { background: AQ.visuals.meterFill(a) }),
      el('p', { class: 'card__tagline', text: a.tagline }),
      el('p', { class: 'card__body', text: a.description }),
      opts.note ? el('p', { class: 'card__note', text: opts.note }) : null
    ]);
  }

  /* Photographs are a bonus layer. The block is only inserted if something
     actually came back, so a blocked or slow network changes nothing. */
  function photoStrip(aesthetic, mountBefore) {
    if (!AQ.images) return;
    AQ.images.forAesthetic(aesthetic).then(function (photos) {
      if (!photos.length || !mountBefore.parentNode) return;

      var grid = el('div', { class: 'photos__grid' }, photos.map(function (p) {
        var img = el('img', {
          src: p.thumb, alt: p.title, loading: 'lazy', decoding: 'async',
          onload: function (e) { e.target.classList.add('is-loaded'); },
          onerror: function (e) { e.target.closest('.photo').remove(); }
        });
        return el('a', {
          class: 'photo', href: p.page, target: '_blank', rel: 'noopener noreferrer'
        }, [
          img,
          el('span', { class: 'photo__credit', text: p.credit + ' · ' + p.license })
        ]);
      }));

      var block = el('section', { class: 'photos' }, [
        el('h2', { class: 'block__title', text: 'The mood, roughly' }),
        el('p', { class: 'block__lede', text: 'Freely licensed photographs from Wikimedia ' +
          'Commons, found by keyword. They are a rough approximation of the atmosphere, ' +
          'not official images of the aesthetic.' }),
        grid
      ]);

      mountBefore.parentNode.insertBefore(block, mountBefore);
    });
  }

  function profileSection(profile) {
    var showAll = false;
    var list = el('div', { class: 'profile__grid' });

    function paint() {
      list.innerHTML = '';
      data.config.dimensions
        .filter(function (d) { return showAll || d.core; })
        .map(function (d) {
          return { meta: d, value: profile.value[d.key], strength: Math.abs(profile.value[d.key] - 0.5) };
        })
        .sort(function (a, b) { return b.strength - a.strength; })
        .forEach(function (row, i) {
          var pct = Math.round(row.value * 100);
          list.appendChild(el('div', { class: 'profile__row' }, [
            el('span', { class: 'profile__label', text: row.meta.label }),
            meter(pct, { subtle: true, delay: 40 + i * 16 }),
            el('span', { class: 'profile__value', text: String(pct) }),
            el('span', { class: 'profile__poles', text: row.meta.low + ' → ' + row.meta.high })
          ]));
        });
    }

    var toggle = el('button', {
      class: 'btn btn--link', type: 'button',
      onclick: function (e) {
        showAll = !showAll;
        e.target.textContent = showAll
          ? 'Show the main dimensions only'
          : 'Show all ' + data.config.dimensions.length + ' dimensions';
        paint();
      }
    }, ['Show all ' + data.config.dimensions.length + ' dimensions']);

    paint();

    return el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'Your profile' }),
      el('p', { class: 'block__lede', text: 'This is the raw material the result was ' +
        'calculated from. None of it was shown to you along the way.' }),
      list,
      toggle
    ]);
  }

  var RANK_SHORT = 10;

  function rankingSection(result) {
    var total = result.ranked.length;
    var showAll = false;
    var list = el('ol', { class: 'rank' });
    var lede = el('p', { class: 'block__lede' });

    function paint() {
      list.innerHTML = '';
      lede.textContent = showAll
        ? 'Nobody fits inside only one world. All ' + total + ', closest match first.'
        : 'Nobody fits inside only one world. These are the ' + RANK_SHORT + ' closest of ' + total + '.';
      result.ranked.slice(0, showAll ? total : RANK_SHORT).forEach(function (entry, i) {
        var a = data.aestheticsByKey[entry.key];
        list.appendChild(el('li', { class: 'rank__row' }, [
          el('span', { class: 'rank__num', text: String(i + 1).padStart(2, '0') }),
          el('span', { class: 'rank__name', text: a.name }),
          meter(entry.percent, { background: AQ.visuals.meterFill(a), delay: 40 + i * 12 }),
          el('span', { class: 'rank__pct', text: entry.percent + '%' })
        ]));
      });
    }

    var toggle = el('button', {
      class: 'btn btn--link', type: 'button',
      onclick: function (e) {
        showAll = !showAll;
        e.target.textContent = showAll
          ? 'Show the ' + RANK_SHORT + ' closest only'
          : 'Show all ' + total + ' aesthetics';
        paint();
      }
    }, ['Show all ' + total + ' aesthetics']);

    paint();

    return el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'The full ranking' }),
      lede,
      list,
      toggle
    ]);
  }

  /* ---------- result ---------- */

  function screenResult() {
    var questions = sessionQuestions();
    var result = AQ.score(questions, session.answers, data);
    var rng = AQ.rng.rngFromSeed(session.seed, 'narrative');

    var primary = data.aestheticsByKey[result.primary.key];
    var why = AQ.narrative.buildWhy(result, data, rng);
    var world = AQ.narrative.buildWorld(primary, result.profile, data, rng);
    var hybrid = AQ.narrative.buildHybrid(result.combination, data, rng, result.profile);

    var welcome = el('div', { class: 'result__welcome' }, [
      el('p', { class: 'eyebrow', text: 'Your result' }),
      el('p', { class: 'result__greeting', text: 'Fifty statements later, here is the world ' +
        'your answers keep pointing towards.' })
    ]);

    var hero = el('header', { class: 'hero' }, [
      el('div', { class: 'hero__banner' }, [
        el('div', { class: 'hero__plate', html: AQ.visuals.moodPlate(primary) }),
        el('h1', { class: 'hero__name', text: primary.name })
      ]),
      el('div', { class: 'hero__foot' }, [
        el('div', { class: 'hero__score' }, [
          el('span', { class: 'hero__percentnum', text: String(result.primary.percent) }),
          el('span', { class: 'hero__percentsign', text: '%' }),
          el('span', { class: 'hero__scorelabel', text: 'match' })
        ]),
        el('div', {}, [
          el('p', { class: 'hero__tagline', text: primary.tagline }),
          el('div', { class: 'hero__meter' }, [
            meter(result.primary.percent, { background: AQ.visuals.meterFill(primary), delay: 200 })
          ]),
          el('p', { class: 'fineprint', text: AQ.narrative.strengthLabel(result.primary.percent, data) })
        ])
      ])
    ]);

    var whyBlock = el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'Why' }),
      el('div', { class: 'prose' }, why.map(function (s) { return el('p', { text: s }); })),
      el('p', { class: 'prose prose--muted', text: primary.description })
    ]);

    var sideBySide = el('div', { class: 'cards' }, [
      aestheticCard(result.secondary, 'secondary', { label: 'Runner-up' }),
      aestheticCard(result.hidden, 'hidden', {
        label: 'Hidden', note: AQ.narrative.hiddenIntro(data, rng)
      })
    ]);

    var comboBlock = hybrid
      ? el('section', { class: 'block block--combo' }, [
          el('h2', { class: 'block__title', text: 'Combination' }),
          el('p', { class: 'combo__label', text: hybrid.label }),
          el('div', { class: 'prose' }, [
            el('p', { text: hybrid.intro }),
            el('p', { text: hybrid.bridge }),
            hybrid.tension ? el('p', { text: hybrid.tension }) : null,
            el('p', { class: 'prose--muted', text: hybrid.note })
          ])
        ])
      : null;

    var worldBlock = el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'Your version of ' + primary.name }),
      el('p', { class: 'block__lede', text: 'How the aesthetic would look if it were built ' +
        'around your profile rather than around the average.' }),
      el('div', { class: 'facets' }, world.map(function (f, i) {
        return el('div', { class: 'facet', style: 'animation-delay:' + (i * 55) + 'ms' }, [
          el('h4', { class: 'facet__label', text: f.label }),
          el('p', { class: 'facet__text', text: f.text })
        ]);
      }))
    ]);

    var seedLink = global.location.origin + global.location.pathname + '?seed=' + session.seed;
    var copyBtn = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function (e) {
        var btn = e.currentTarget;
        var label = 'Copy a link to this exact run';
        var done = function () {
          btn.textContent = 'Link copied';
          global.setTimeout(function () { btn.textContent = label; }, 2200);
        };
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(seedLink).then(done, function () {
            global.prompt('Copy the link:', seedLink);
          });
        } else {
          global.prompt('Copy the link:', seedLink);
        }
      }
    }, ['Copy a link to this exact run']);

    var footer = el('footer', { class: 'result__footer' }, [
      el('p', { class: 'fineprint' }, [
        'Run ', el('code', { text: session.seed }),
        '. The same code gives the same 50 statements in the same order.'
      ]),
      el('div', { class: 'result__actions' }, [
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: function () {
            clearStore(STORE_SESSION);
            screenPreferences();
          }
        }, ['Take it again with new questions']),
        copyBtn
      ]),
      genderedNamesToggle(screenResult),
      el('p', { class: 'fineprint' }, [
        'The aesthetics use Aesthetics Wiki as a reference. Descriptions, dimensions and ' +
        'statements were written for this test, and the mood plates are generated by the ' +
        'code — no images are taken from the wiki.'
      ])
    ]);

    var view = el('section', { class: 'screen screen--result' }, [
      welcome, hero, whyBlock, sideBySide, comboBlock,
      worldBlock, profileSection(result.profile), rankingSection(result), footer
    ]);

    clearStore(STORE_SESSION);
    render(view);
    photoStrip(primary, whyBlock);
  }

  /* ---------- boot ---------- */

  function boot() {
    root = document.getElementById('app');

    root.innerHTML = '';
    root.appendChild(el('p', { class: 'loading', text: 'Loading …' }));

    AQ.loadData().then(function (loaded) {
      data = loaded;
      /* A seed in the URL recreates a run — it is picked up when the test starts. */
      if (queryParam('seed')) clearStore(STORE_SESSION);
      screenIntro();
    }).catch(function (err) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'screen' }, [
        el('h1', { class: 'display', text: 'Could not load the test' }),
        el('p', { class: 'lede', text: String(err && err.message ? err.message : err) }),
        el('p', { class: 'lede lede--muted', text: 'If you opened the file straight from ' +
          'disk, run "node tools/build-bundle.js" once, or start a local server with ' +
          '"node tools/serve.js".' })
      ]));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
