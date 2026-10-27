/* Screens and flow. All quiz data lives in /data — this file knows nothing about
   which aesthetics exist, only how to present them.                          */
(function (global) {
  'use strict';
  var AQ = (global.AQ = global.AQ || {});

  /* Marks the beta deploy (beta branch) so it is never mistaken for the live
     site. Goes by hostname, so the same code ships to main untouched. */
  if (global.location.hostname.indexOf('beta.') === 0) {
    document.title = '[BETA] ' + document.title;
    document.addEventListener('DOMContentLoaded', function () {
      var badge = document.createElement('div');
      badge.className = 'env-badge';
      badge.textContent = 'BETA';
      document.body.appendChild(badge);
    });
  }

  /* Each page keeps its own unfinished run: index.html the full test,
     internet.html etc. their family quiz (set from <main data-quiz> in boot). */
  var STORE_SESSION = 'aq.session.v3';
  var STORE_HISTORY = 'aq.previousQuestionIds.v3';
  var STORE_PREFS = 'aq.preferences.v1';
  var PREFS_MAX_PICKS = 5;

  /* The three run lengths offered on the intro. 50 is the standard the group
     quotas in the data are sized for; selection.js scales them for the rest. */
  var LENGTHS = [
    { n: 30, label: 'Short', minutes: 5 },
    { n: 50, label: 'Standard', minutes: 8 },
    { n: 100, label: 'Long', minutes: 15 }
  ];

  var SWAP_MS = 170;   /* how long a question takes to move out of the way */
  var ADVANCE_MS = 240; /* pause after an answer before moving on */

  var data = null;
  var session = null;
  var root;
  var pageQuiz = null; /* the family quiz this page is for, or null on index.html */

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

  /* The topic groups a shared link was made with - unknown keys are dropped. */
  function urlGroups() {
    var known = {};
    data.config.groups.forEach(function (g) { known[g.key] = true; });
    return (queryParam('groups') || '').split(',').filter(function (k) { return known[k]; });
  }

  /* The run length a shared link was made with (`&n=`), or the standard one. */
  function urlLength() {
    var n = Number(queryParam('n'));
    return LENGTHS.some(function (l) { return l.n === n; }) ? n : data.config.questionsPerQuiz;
  }

  /* Picked on the intro, used when the preferences screen starts the run. */
  var chosenLength = null;

  /* ---------- history: don't serve the same fifty twice in a row ---------- */

  function historyIds(total) {
    var hist = readStore(STORE_HISTORY, []);
    var max = (data.config.selection && data.config.selection.maxHistorySessions) || 4;
    var seen = {};
    hist.slice(-max).forEach(function (run) {
      (run || []).forEach(function (id) { seen[id] = true; });
    });
    var ids = Object.keys(seen).map(Number);
    /* Nearly everything used up: fall back to excluding only the last run. */
    if (data.questions.length - ids.length < total) {
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
     cannot be filtered against what this browser has seen before. The topics the
     sharer picked travel in the link (`&groups=`) and are passed in here, rather
     than this browser's own saved preferences. */
  function startSession(seed, replay, preferredGroups, total) {
    total = total || data.config.questionsPerQuiz;
    var selection = AQ.selectQuestions(data, {
      seed: seed || AQ.rng.newSeedString(),
      excludeIds: replay ? [] : historyIds(total),
      preferredGroups: preferredGroups || [],
      total: total
    });
    session = {
      seed: selection.seed,
      groups: preferredGroups || [],
      questionIds: selection.questions.map(function (q) { return q.id; }),
      answers: {},
      index: 0,
      startedAt: Date.now()
    };
    rememberRun(selection.questions);
    persistSession();
    return session;
  }

  /* A family quiz (data/quizzes.json): its own statements, all asked in a
     seeded order, and only that family's aesthetics as possible answers. */
  function startFamilySession(key, seed) {
    seed = AQ.rng.normaliseSeed(seed) || AQ.rng.newSeedString();
    var rng = AQ.rng.rngFromSeed(seed, 'selection');
    session = {
      seed: seed,
      quiz: key,
      groups: [],
      questionIds: AQ.rng.shuffle(data.quizByKey[key].questions, rng).map(function (q) { return q.id; }),
      answers: {},
      index: 0,
      startedAt: Date.now()
    };
    persistSession();
    return session;
  }

  /* The data a family quiz scores against: only that family's aesthetics,
     balanced against each other (see AQ.familyData in scoring.js). */
  var familyData = {};
  function scoringDataFor(s) {
    var qz = s && s.quiz && data.quizByKey[s.quiz];
    if (!qz) return data;
    if (!familyData[qz.key]) familyData[qz.key] = AQ.familyData(data, qz);
    return familyData[qz.key];
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
    if ((saved.quiz || '') !== (pageQuiz ? pageQuiz.key : '')) return null; /* another page's run */
    var ok = saved.questionIds.every(function (id) { return !!data.questionsById[id]; });
    return ok ? saved : null;
  }

  /* ---------- browser history ---------- */

  /* Without this the browser's Back button (and Alt+Left, and the back gesture
     on a phone) leaves the test altogether, which after forty answered
     statements is the worst thing the page could do.

     So every screen, and every statement inside the quiz, gets a history entry.
     Back then steps back through the run and Forward returns, matching the
     on-screen buttons. The URL never changes — entries are told apart by their
     state object, not their address, so a `?seed=` link survives intact. */
  var restoringHistory = false;

  /* Set by the quiz screen while it is on show, so a history step between two
     statements can move the existing screen instead of rebuilding it. */
  var quizJumpTo = null;

  function pushStep(state) {
    if (restoringHistory) return;
    try { global.history.pushState(state, ''); } catch (e) { /* ignore */ }
  }

  function replaceStep(state) {
    if (restoringHistory) return;
    try { global.history.replaceState(state, ''); } catch (e) { /* ignore */ }
  }

  function routeTo(state) {
    var screen = state && state.screen;
    var haveRun = session && session.questionIds && session.questionIds.length;

    if (screen === 'quiz' && haveRun) {
      var last = session.questionIds.length - 1;
      var index = Math.max(0, Math.min(last, state.index || 0));
      if (quizJumpTo) quizJumpTo(index);
      else { session.index = index; screenQuiz(); }
      return;
    }
    if (screen === 'result' && haveRun) { screenResult(); return; }
    if (screen === 'preferences') { screenPreferences(); return; }
    screenIntro();
  }

  function onPopState(e) {
    restoringHistory = true;
    try { routeTo(e.state); } finally { restoringHistory = false; }
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
          ? 'Showing the gender-specific version: ' + renamed.length +
            ' aesthetics use the gendered name they are known by (' + examples +
            '), and ' + (affected.length - renamed.length) + ' are worded differently.'
          : 'Everything is gender-neutral: the test never asks, and no aesthetic belongs ' +
            'to one gender. ' + affected.length + ' of them have a gender-specific version ' +
            'on the Aesthetics Wiki (' + examples + ').'
      ]),
      button
    ]);
  }

  /* ---------- intro ---------- */

  function screenIntro() {
    replaceStep({ screen: 'intro' });

    var saved = restoreSession();
    var answered = saved ? Object.keys(saved.answers || {}).length : 0;
    var resumable = saved && answered > 0 && answered < saved.questionIds.length;
    var urlSeed = queryParam('seed');
    var urlQuiz = pageQuiz;

    function sectionHead(kicker, title) {
      return el('div', { class: 'intro__head' }, [
        el('p', { class: 'eyebrow', text: kicker }),
        el('h2', { class: 'intro__h2', text: title })
      ]);
    }

    var hero = el('div', { class: 'intro__hero' }, [
      el('p', { class: 'eyebrow', text: pageQuiz
        ? AQ.quizMembers(data, pageQuiz).length + ' aesthetics' : 'Aesthetic quizzes' }),
      pageQuiz
        ? el('h1', { class: 'display', text: pageQuiz.title })
        : el('h1', { class: 'display', html: 'Find the <em>world</em><br>you <em>belong</em> in.' }),
      el('p', { class: 'lede' }, [
        pageQuiz ? pageQuiz.blurb :
        'Short personality quizzes that match your temperament, meaning your relationship ' +
        'to nature, technology, history, order, solitude, darkness and beauty, to one ' +
        'aesthetic. Not what you like the look of, but how you are.'
      ]),
      urlSeed || resumable || pageQuiz
        ? el('div', { class: 'intro__actions' }, [
            pageQuiz && !urlSeed
              ? el('button', {
                  class: 'btn btn--primary', type: 'button',
                  onclick: function () {
                    clearStore(STORE_SESSION);
                    startFamilySession(pageQuiz.key);
                    screenQuiz();
                  }
                }, ['Start · ' + pageQuiz.questions.length + ' statements'])
              : null,
            urlSeed
              ? el('button', {
                  class: 'btn btn--primary', type: 'button',
                  onclick: function () {
                    /* A shared run is fixed by its seed and length - skip straight in. */
                    clearStore(STORE_SESSION);
                    if (urlQuiz) startFamilySession(urlQuiz.key, urlSeed);
                    else startSession(urlSeed, true, urlGroups(), urlLength());
                    screenQuiz();
                  }
                }, ['Start the shared run'])
              : null,
            resumable
              ? el('button', {
                  class: 'btn btn--ghost', type: 'button',
                  onclick: function () { session = saved; screenQuiz(); }
                }, ['Resume (' + answered + ' answered)'])
              : null
          ])
        : null,
      urlSeed
        ? el('p', { class: 'fineprint' }, [
            'You have opened a shared run (', el('code', { text: AQ.rng.normaliseSeed(urlSeed) }),
            '). You will get exactly the same ' +
            (urlQuiz ? urlQuiz.questions.length : urlLength()) +
            ' statements, in the same order, as the person who shared the link.'
          ])
        : null,
      !pageQuiz && AQ.compare.decode(queryParam('compare'), data)
        ? el('p', { class: 'fineprint', text: 'A friend sent you their result. Take the full test and ' +
            'your result will show how alike you are.' })
        : null
    ]);

    /* A family quiz page is just its own quiz. */
    if (pageQuiz) {
      render(el('section', { class: 'screen screen--intro' }, [
        hero,
        el('p', { class: 'fineprint' }, [
          'Rate each statement from strongly disagree to strongly agree. Everything is ' +
          'worked out in your own browser and nothing is sent anywhere.'
        ]),
        genderedNamesToggle(screenIntro)
      ]));
      return;
    }

    /* The full test: every aesthetic, three lengths. */
    var mainCard = el('article', { class: 'intro__card intro__card--main' }, [
      el('p', { class: 'eyebrow', text: 'The full test' }),
      el('h3', { class: 'intro__cardtitle', text: 'Which aesthetic are you?' }),
      el('p', { text: 'All ' + data.aesthetics.length + ' aesthetics, from Cottagecore to ' +
        'Cybergoth. Pick a few topics you care about, then answer. Longer runs give a more ' +
        'precise result.' }),
      el('div', { class: 'intro__lengths' }, LENGTHS.map(function (l) {
        return el('button', {
          class: 'btn ' + (l.n === data.config.questionsPerQuiz ? 'btn--primary' : 'btn--ghost'),
          type: 'button',
          onclick: function () {
            clearStore(STORE_SESSION);
            chosenLength = l.n;
            screenPreferences();
          }
        }, [l.label + ' · ' + l.n]);
      })),
      el('p', { class: 'fineprint' }, [
        LENGTHS.map(function (l) { return l.label + ' takes about ' + l.minutes + ' minutes'; }).join(', ') + '.'
      ])
    ]);

    /* One card per family quiz, each linking to its own page (internet.html, ...). */
    var familyCards = data.familyQuizzes.map(function (qz) {
      return el('article', { class: 'intro__card' }, [
        el('p', { class: 'eyebrow', text: AQ.quizMembers(data, qz).length + ' aesthetics' }),
        el('h3', { class: 'intro__cardtitle', text: qz.title }),
        el('p', { text: qz.blurb }),
        el('a', { class: 'btn btn--primary', href: qz.key + '.html' },
          ['Open · ' + qz.questions.length])
      ]);
    });

    var view = el('section', { class: 'screen screen--intro' }, [
      hero,
      el('section', { class: 'intro__section' }, [
        sectionHead('Start here', 'Pick a quiz'),
        el('div', { class: 'intro__grid' }, [mainCard].concat(familyCards))
      ]),
      el('section', { class: 'intro__section' }, [
        sectionHead('How it works', 'Three steps'),
        el('ol', { class: 'intro__steps' }, [
          el('li', {}, [el('h3', { text: 'Pick a quiz' }),
            el('p', { text: 'The full test covers every aesthetic. The smaller quizzes stay ' +
              'inside one family, like internet or goth.' })]),
          el('li', {}, [el('h3', { text: 'Answer honestly' }),
            el('p', { text: 'Rate each statement from strongly disagree to strongly agree. ' +
              'Go with your first instinct rather than the interesting answer.' })]),
          el('li', {}, [el('h3', { text: 'Meet your aesthetic' }),
            el('p', { text: 'You are never told what a statement measures until the result.' })])
        ])
      ]),
      el('ul', { class: 'intro__facts' }, [
        el('li', {}, [el('strong', { text: String(data.aesthetics.length) }), 'aesthetics']),
        el('li', {}, [el('strong', { text: String(1 + data.familyQuizzes.length) }), 'quizzes']),
        el('li', {}, [el('strong', { text: String(data.config.dimensions.length) }), 'hidden dimensions']),
        el('li', {}, [el('strong', { text: String(data.config.scale.length) }), 'answer levels per statement'])
      ]),
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
     most of the statements come from those themes, the rest get one or two
     each. See reshapeGroups / drawQuotas in selection.js. */
  function screenPreferences() {
    pushStep({ screen: 'preferences' });

    var categories = data.config.preferenceCategories || [];
    var selected = {};
    readStore(STORE_PREFS, []).forEach(function (k) { selected[k] = true; });

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
        return btn;
      })
    );

    note = el('p', { class: 'chips__note' });

    function begin() {
      var keys = Object.keys(selected).filter(function (k) { return selected[k]; });
      writeStore(STORE_PREFS, keys);
      startSession(null, false, groupsForPreferences(keys), chosenLength);
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
      el('h1', { class: 'display display--sub', html: 'What <em>matters</em><br>to you?' }),
      el('p', { class: 'lede' }, [
        'Pick what you care about and most of your questions will be about those ' +
        'things. Everything else still gets a question or two, so the result ' +
        'stays fair.'
      ]),
      chipsWrap,
      note,
      el('div', { class: 'intro__actions' }, [continueBtn, skipBtn])
    ]);

    render(view);
  }

  /* ---------- quiz ---------- */

  function screenQuiz() {
    pushStep({ screen: 'quiz', index: session.index });

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

    /* The run arrives in themed blocks — a theme's statements are asked
       together — and each statement says which theme it is in and where you are
       inside it. Read the blocks back off the order rather than passing them
       through the session, so a resumed run rebuilds them from the stored
       statement ids alone. */
    var blocks = [];
    questions.forEach(function (q, i) {
      var last = blocks[blocks.length - 1];
      if (last && last.group === q.group) { last.count++; return; }
      blocks.push({ group: q.group, start: i, count: 1 });
    });
    var blockAt = [];
    blocks.forEach(function (b) {
      for (var i = b.start; i < b.start + b.count; i++) blockAt[i] = b;
    });
    var groupLabels = {};
    data.config.groups.forEach(function (g) { groupLabels[g.key] = g.label; });
    data.familyQuizzes.forEach(function (qz) { groupLabels[qz.key] = qz.groupLabel; });

    var counter = el('p', { class: 'quiz__counter' });
    var themeTag = el('p', { class: 'quiz__theme' });
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
        el('div', { class: 'quiz__meta' }, [counter, themeTag])
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
      var block = blockAt[session.index];

      counter.textContent = 'Question ' + (session.index + 1) + ' of ' + total;
      themeTag.textContent = block
        ? groupLabels[block.group] + ' · ' +
          (session.index - block.start + 1) + ' of ' + block.count
        : '';
      progressFill.style.transform = 'scaleX(' + session.index / total + ')';
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
          /* On a short phone the page may be scrolled down to the last
             answers; bring the next statement back into view. */
          if (global.scrollY) global.scrollTo({ top: 0, behavior: 'auto' });
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

      /* Going back is handed to the browser so that the on-screen Back and the
         browser's own Back are the same motion. The popstate handler that comes
         back moves the screen; stepping back here as well would leave a
         forward entry behind and the two would drift apart. */
      if (delta < 0) {
        if (session.index > 0) global.history.back();
        return;
      }

      var target = session.index + delta;
      if (target >= total) { finish(); return; }
      transition(target, delta);
      pushStep({ screen: 'quiz', index: target });
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
        pushStep({ screen: 'quiz', index: jumpTo });
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
    quizJumpTo = function (index) {
      if (index === session.index) return;
      var direction = index > session.index ? 1 : -1;
      /* Mid-animation: let the current move land first, or it is dropped and
         the screen falls out of step with the history entry. */
      if (busy) {
        global.setTimeout(function () { transition(index, direction); }, SWAP_MS);
        return;
      }
      transition(index, direction);
    };

    view.addEventListener('aq:teardown', function () {
      document.removeEventListener('keydown', onKey);
      quizJumpTo = null;
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
    var target = 'scaleX(' + Math.max(2, Math.min(100, value)) / 100 + ')';

    var delay = options.delay || 40;

    /* The bar is built before the screen is in the document, so the starting
       scale has to be painted for real before it is changed - otherwise the
       browser collapses both values into one frame and the transition never
       runs. Two frames guarantee a layout in between. */
    fill.style.transform = 'scaleX(0)';
    global.requestAnimationFrame(function () {
      global.requestAnimationFrame(function () {
        global.setTimeout(function () { fill.style.transform = target; }, delay);
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
        fill.style.transform = target;
      }
    }, delay + 1400);

    return wrap;
  }

  /* Photographs are a bonus layer, fetched once and split two ways: the first
     (usually the strongest match) becomes the hero's background photo, layered
     over the generated mood plate once it loads; the rest fill the strip
     further down. Nothing here blocks anything else - a blocked or slow
     network just leaves the generated plate and skips the strip. */
  function photoStrip(aesthetic, heroBanner, mountBefore, skipCache) {
    if (!AQ.images) return;
    AQ.images.forAesthetic(aesthetic, data, { skipCache: skipCache }).then(function (photos) {
      if (!photos.length) return;

      if (heroBanner.isConnected) {
        var cover = photos[0];
        var photoImg = el('img', {
          class: 'hero__photo', src: cover.thumb, alt: '', decoding: 'async',
          onload: function (e) { e.target.classList.add('is-loaded'); },
          onerror: function (e) { e.target.remove(); }
        });
        heroBanner.insertBefore(photoImg, heroBanner.firstChild);
        heroBanner.appendChild(el('a', {
          class: 'hero__credit', href: cover.page, target: '_blank', rel: 'noopener noreferrer'
        }, [cover.credit + ' · ' + cover.license]));
      }

      var rest = photos.slice(1);
      if (!rest.length || !mountBefore.parentNode) return;

      var grid = el('div', { class: 'photos__grid' }, rest.map(function (p) {
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

  /* Plain links that open in a new tab - nothing is embedded, so the result
     page makes no request to YouTube and the privacy note stays true. */
  function trackCard(p, from) {
    return el('a', {
      class: 'track' + (from ? ' track--borrowed' : ''),
      href: 'https://www.youtube.com/watch?v=' + p.id + (p.list ? '&list=' + p.list : ''),
      target: '_blank', rel: 'noopener noreferrer'
    }, [
      el('span', { class: 'track__thumb' }, [
        el('img', {
          src: 'https://i.ytimg.com/vi/' + p.id + '/mqdefault.jpg', alt: '', loading: 'lazy',
          decoding: 'async', onerror: function (e) { e.target.remove(); }
        }),
        el('span', { class: 'track__play', 'aria-hidden': 'true', text: '▶' })
      ]),
      el('span', { class: 'track__body' }, [
        el('span', { class: 'track__title', text: p.title }),
        el('span', { class: 'track__mood', text: p.mood }),
        from ? el('span', { class: 'track__via', text: 'Borrowed from ' + from.name +
          ', a close neighbour' }) : null,
        el('span', { class: 'track__credit', text: 'YouTube · ' + p.author })
      ])
    ]);
  }

  function musicSection(aesthetic) {
    var found = AQ.music.playlistsFor(aesthetic, data);
    var sound = aesthetic.world && aesthetic.world.music;

    var cards = found.own.map(function (p) { return trackCard(p, null); })
      .concat(found.borrowed.map(function (b) { return trackCard(b.playlist, b.from); }));

    var lede = sound
      ? 'What ' + aesthetic.name + ' tends to sound like: ' + sound + '.'
      : 'Music that goes with ' + aesthetic.name + '.';
    if (found.borrowed.length) {
      lede += found.own.length
        ? ' A few more come from the aesthetics closest to it, for variety.'
        : ' It has no playlist of its own yet, so these come from the aesthetics ' +
          'closest to it.';
    }

    return el('section', { class: 'block block--music' }, [
      el('h2', { class: 'block__title', text: 'Something to listen to' }),
      el('p', { class: 'block__lede', text: lede }),
      cards.length ? el('div', { class: 'tracks' }, cards) : null,
      el('a', {
        class: 'btn btn--ghost music__search', href: AQ.music.searchUrl(aesthetic, data),
        target: '_blank', rel: 'noopener noreferrer'
      }, [cards.length ? 'Find more ' + aesthetic.name + ' playlists' : 'Find ' + aesthetic.name + ' playlists on YouTube']),
      el('p', { class: 'fineprint', text: 'Links open YouTube in a new tab. The thumbnails ' +
        'above are static images from YouTube’s own image server - nothing is embedded ' +
        'or tracked beyond loading those pictures.' })
    ]);
  }

  /* The wiki's own gallery for the aesthetic. Its images are not freely
     licensed, so they are linked to, never shown here. Pages go by the
     canonical (gendered) name; `wiki` in aesthetics.json overrides it where
     the page title differs. */
  function wikiUrl(a) {
    var title = a.wiki || (a.gendered && a.gendered.name) || a.neutral.name;
    return 'https://aesthetics.fandom.com/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
  }

  /* The generated mood plate as an <img> rather than inline SVG. Its blur and
     grain filters are heavy; as an image the browser runs them once and then
     only moves pixels, instead of re-running them on every scroll and hover. */
  function plate(a, cls) {
    return el('div', { class: cls }, [
      el('img', {
        src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AQ.visuals.moodPlate(a)),
        alt: '', decoding: 'async'
      })
    ]);
  }

  /* A link to an aesthetic's Aesthetics Wiki page, opened in a new tab. */
  function wikiSection(aesthetic) {
    return el('section', { class: 'block' }, [
      el('a', {
        class: 'btn btn--ghost', href: wikiUrl(aesthetic),
        target: '_blank', rel: 'noopener noreferrer'
      }, ['See ' + aesthetic.name + ' pictures on Aesthetics Wiki']),
      el('p', { class: 'fineprint', text: 'Opens the Aesthetics Wiki page in a new tab - ' +
        'the best place for real examples of the look.' })
    ]);
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

  /* A ghost button that copies `link` and says so for a moment. */
  function copyButton(label, link) {
    return el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function (e) {
        var btn = e.currentTarget;
        var done = function () {
          btn.textContent = 'Link copied';
          global.setTimeout(function () { btn.textContent = label; }, 2200);
        };
        if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(link).then(done, function () {
            global.prompt('Copy the link:', link);
          });
        } else {
          global.prompt('Copy the link:', link);
        }
      }
    }, [label]);
  }

  /* "You and a friend": shown under the hero when the page was opened from a
     ?compare= link and the friend's profile can be read. */
  function compareSection(mine) {
    var theirs = AQ.compare.decode(queryParam('compare'), data);
    var diff = theirs && AQ.compare.compare(mine, theirs, data);
    if (!diff) return null;

    var friendTop = data.aestheticsByKey[AQ.rankProfile(theirs, data).primary.key];
    function rows(list) {
      return el('div', { class: 'profile__grid' }, list.map(function (r) {
        return el('div', { class: 'profile__row' }, [
          el('span', { class: 'profile__label', text: r.meta.label }),
          meter(Math.round(r.mine * 100), { subtle: true, delay: 40 }),
          el('span', { class: 'profile__value', text: String(Math.round(r.mine * 100)) }),
          el('span', { class: 'profile__poles', text: 'friend: ' + Math.round(r.theirs * 100) })
        ]);
      }));
    }
    return el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'You and a friend' }),
      el('p', { class: 'block__lede', text: diff.percent + '% alike. Your friend got ' +
        friendTop.name + '.' }),
      el('h3', { class: 'block__title', text: 'Most alike' }),
      rows(diff.rows.slice(0, 3)),
      el('h3', { class: 'block__title', text: 'Furthest apart' }),
      rows(diff.rows.slice(-3).reverse())
    ]);
  }

  /* ---------- result ---------- */

  /* `preview`, when passed, is an already-scored result (see boot()'s local-only
     ?preview=<key> shortcut) - it skips the real quiz entirely, so nothing here
     may touch `session`. */
  function screenResult(preview) {
    pushStep({ screen: 'result' });

    var result = preview || AQ.score(sessionQuestions(), session.answers, scoringDataFor(session));
    var seed = preview ? 'preview' : session.seed;
    var rng = AQ.rng.rngFromSeed(seed, 'narrative');

    var primary = data.aestheticsByKey[result.primary.key];
    var runLength = preview ? data.config.questionsPerQuiz : session.questionIds.length;
    var familyQuiz = !preview && data.quizByKey[session.quiz];
    var why = AQ.narrative.buildWhy(result, data, rng);
    var world = AQ.narrative.buildWorld(primary, result.profile, data, rng);

    var welcome = el('div', { class: 'result__welcome' }, [
      el('p', { class: 'eyebrow', text: preview ? 'Preview - debug only'
        : familyQuiz ? familyQuiz.resultLabel : 'Your result' }),
      el('p', { class: 'result__greeting', text: runLength + ' statements later, here is the world ' +
        'your answers keep pointing towards.' })
    ]);

    var heroBanner = el('div', { class: 'hero__banner' }, [
      plate(primary, 'hero__plate'),
      el('h1', { class: 'hero__name', text: primary.name })
    ]);
    var hero = el('header', { class: 'hero' }, [
      heroBanner,
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

    var seedLink = global.location.origin + global.location.pathname + '?seed=' + seed +
      (!familyQuiz && runLength !== data.config.questionsPerQuiz ? '&n=' + runLength : '') +
      (!preview && session.groups && session.groups.length ? '&groups=' + session.groups.join(',') : '');
    var copyBtn = copyButton('Copy a link to this exact run', seedLink);

    var friendCode = !familyQuiz ? AQ.compare.encode(result.profile, data) : null;
    var friendLink = friendCode && global.location.origin + global.location.pathname + '?compare=' + friendCode;
    var cardBtn = el('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: function () {
        var a = el('a', { download: primary.key + '.png',
          href: AQ.card.draw(primary, result.primary.percent).toDataURL('image/png') });
        a.click();
      }
    }, ['Save result as image']);

    var footer = el('footer', { class: 'result__footer' }, [
      el('p', { class: 'fineprint' }, [
        preview ? 'Preview of ' : 'Run ', el('code', { text: seed }),
        preview ? '. Not a real result - nothing was answered.'
          : '. The same code gives the same ' + runLength + ' statements in the same order.'
      ]),
      el('div', { class: 'result__actions' }, [
        el('button', {
          class: 'btn btn--primary', type: 'button',
          onclick: function () {
            clearStore(STORE_SESSION);
            if (familyQuiz) { startFamilySession(familyQuiz.key); screenQuiz(); }
            else { chosenLength = runLength; screenPreferences(); }
          }
        }, [familyQuiz ? 'Take it again' : 'Take it again with new questions']),
        copyBtn,
        friendLink ? copyButton('Copy a link to compare with a friend', friendLink) : null,
        cardBtn
      ]),
      genderedNamesToggle(function () { screenResult(preview); }),
      el('p', { class: 'fineprint' }, [
        'The aesthetics use Aesthetics Wiki as a reference. Descriptions, dimensions and ' +
        'statements were written for this test, and the mood plates are generated by the ' +
        'code — no images are copied from the wiki, only linked to.'
      ])
    ]);

    var wikiBlock = wikiSection(primary);

    var view = el('section', { class: 'screen screen--result' }, [
      welcome, hero, !familyQuiz ? compareSection(result.profile) : null, musicSection(primary), wikiBlock, whyBlock,
      worldBlock, profileSection(result.profile), footer
    ]);

    if (!preview) clearStore(STORE_SESSION);
    render(view);
    photoStrip(primary, heroBanner, wikiBlock, !!preview);
  }

  /* ---------- boot ---------- */

  /* Gates debug-only shortcuts to a local checkout - matches tools/serve.js
     (localhost) and opening index.html straight from disk (file://), never the
     deployed site, so a preview link never leaks out as if it were a real result. */
  function isLocalDev() {
    var h = global.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || global.location.protocol === 'file:';
  }

  function boot() {
    root = document.getElementById('app');

    root.innerHTML = '';
    root.appendChild(el('p', { class: 'loading', text: 'Loading …' }));

    global.addEventListener('popstate', onPopState);

    AQ.loadData().then(function (loaded) {
      data = loaded;

      /* Old shared links were index.html?quiz=internet&seed=...; send them to the quiz's page. */
      var legacyQuiz = data.quizByKey[queryParam('quiz')];
      if (!root.dataset.quiz && legacyQuiz) {
        global.location.replace(legacyQuiz.key + '.html' +
          global.location.search.replace(/[?&]quiz=[^&#]*/, '').replace(/^&/, '?'));
        return;
      }
      pageQuiz = data.quizByKey[root.dataset.quiz] || null;
      if (pageQuiz) STORE_SESSION += '.' + pageQuiz.key;

      if (isLocalDev()) {
        var previewKey = queryParam('preview');
        if (previewKey) {
          var preview = AQ.scorePreview(previewKey, data);
          if (preview) { screenResult(preview); return; }
          global.console.warn(
            'aq debug: no aesthetic "' + previewKey + '". Valid keys:',
            Object.keys(data.aestheticsByKey).sort()
          );
        }
      }

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
