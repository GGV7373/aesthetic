# What Aesthetic Are You?

A personality test that finds which **aesthetic world** you belong to — not which
pictures you like. 360 statements, 50 per run, 35 hidden dimensions and 203 aesthetics
across 18 families, using Aesthetics Wiki as a reference.

No framework, no build step, no dependencies. Live at
[estetikk.netlify.app](https://estetikk.netlify.app).

## Running it locally

```bash
node tools/serve.js        # http://localhost:8123
```

`?preview=<aesthetic-key>` (e.g. `?preview=after-hours`) jumps straight to a result
screen. It only works on `localhost` and `file://`.

To open `index.html` straight from disk, run `node tools/build-bundle.js` first (and
after every change under `/data`). Browsers block `fetch` on local files, so the app
falls back to the generated, git-ignored `data/bundle.js`.

## Deploying

Netlify serves the repository root as-is (`netlify.toml`), after running
`tools/validate.js`: a data error stops the deploy. If you add a strict
`Content-Security-Policy`, allow `connect-src https://commons.wikimedia.org` and
`img-src https://upload.wikimedia.org https://i.ytimg.com`, or photos and track
thumbnails quietly stop appearing.

`og:image`, `og:url` and the canonical link in `index.html` point at
`https://estetikk.netlify.app`; change them if you deploy elsewhere. `assets/og.png` is
a 1200x630 screenshot of `tools/og-image.html`.

## How it works

```
answers  →  35 dimensions  →  match against 203 aesthetic profiles
```

No statement belongs to any one aesthetic. A question about old buildings moves
`history`, `nostalgia` and `architecture`, and the aesthetics fall out of the whole
profile, so you can't guess what a question measures.

- **Answers** are on a −3 to +3 scale. Part of each person's average answer is
  subtracted first, so someone who agrees with everything isn't scored differently
  from someone with the same taste who doesn't.
- **The profile** is stretched onto the catalogue's scale, so the result depends on the
  shape of your taste, not on how strongly you pressed the buttons.
- **The match** weights each dimension by how defining it is for the aesthetic and how
  well it was measured. Only the top match is shown.
- **Selection:** the statements sit in 20 themed groups. A run draws from every group and
  asks one theme at a time. The preferences screen can weight up to five topics. Runs
  come in 30, 50 or 100 statements.
- **Everything is seeded.** `?seed=ABC12XYZ` recreates a run exactly, and browser Back
  steps through the quiz one statement at a time.

### Family quizzes

Each short quiz has its own page (`internet.html`, `nature.html`, `goth.html`): a copy of `index.html` with `data-quiz="<key>"` on `<main>`, so keep
their `<head>` in step with it. The full test stays on `index.html`.

Each quiz is its own file in `data/quizzes/` (`internet.json`, `nature.json`,
`goth.json`); `data/quizzes.json` only lists their keys, in the order the home page
shows them. A new quiz needs a file there, its key in that list, and its own page. Each has
its own statements (ids from 9001) and returns an aesthetic from its `family`, or only
from its `members` list if it has one. The internet quiz uses `members` to keep just
the Frutiger and Y2K aesthetics. Members are centred on their group's average before
scoring, so the most neutral one doesn't win by default.

### Gender-neutral by default

The test never asks your gender. Aesthetics with gendered wiki names (Soft Girl, Mob
Wife…) show a neutral name by default; the original wording lives in a `gendered` block
and a switch on the page turns it on. Scoring is identical either way. `validate.js`
rejects gendered words anywhere else.

## Files

```
index.html, 404.html, netlify.toml
assets/css/styles.css
assets/js/
  main.js        the only script the pages include; loads the rest in order
  prng.js        seeded randomness
  data.js        loads the JSON (bundle fallback), applies name version
  selection.js   picks the statements for a run
  scoring.js     profile + matching, family-quiz balancing
  narrative.js   result text
  visuals.js     generated mood plates (SVG)
  images.js      optional Wikimedia Commons photos
  music.js       playlist matching for the result
  compare.js     friend comparison links (?compare=)
  card.js        "save result as image" PNG
  app.js         screens and flow
data/
  questions.json   main statement bank
  quizzes.json     which family quizzes exist (keys, in order)
  quizzes/         one file per family quiz and its statements
  aesthetics.json  aesthetics: profile, palette, keywords, "world"
  scoring.json     dimensions, groups, preferences, matching settings
  narrative.json   phrase banks for the result text
  playlists.json   hand-picked YouTube videos
  images.json      hand-picked Commons photos, search overrides
tools/
  serve.js, build-bundle.js, validate.js
  image-picker.html  pick photos for images.json
  og-image.html      source for assets/og.png
```

All content lives in `/data`. Adding aesthetics, statements, videos or photos needs no
JavaScript changes.

## Adding content

**An aesthetic:** add an entry to `data/aesthetics.json`:

```json
{
  "key": "my-aesthetic",
  "name": "My Aesthetic",
  "family": "Nature and Pastoral",
  "tagline": "One line that catches the mood",
  "description": "Two sentences on what this is.",
  "keywords": ["garden", "linen"],
  "palette": ["#0d1610", "#22392a", "#6d8459", "#cfc3a3"],
  "dimensions": { "nature": 0.95, "solitude": 0.9, "urban": 0.08 },
  "related": ["forestpunk"],
  "world": {
    "setting": "...", "architecture": "...", "interior": "...", "technology": "...",
    "clothes": "...", "music": "...", "colours": "...", "everyday": "..."
  }
}
```

Leave out dimensions that don't matter. Keep values between 0.05 and 0.95. Use one of
the existing 18 families. `keywords` double as photo search terms, so make them
concrete nouns.

**A statement:** add it to `data/questions.json` (or a quiz in `data/quizzes/`).
Weights run −3 to 3. Write both "agree pushes up" and "agree pushes down" statements for
each dimension.

```json
{ "id": 181, "group": "sound", "cluster": "unique-cluster",
  "text": "A statement that doesn't give away what it measures.",
  "dimensions": { "history": 2, "nostalgia": 2, "modernity": -1 } }
```

**A video:** append to `curated` in `data/playlists.json`. `id` is the 11 characters
after `v=`; add `"list": "PL…"` to open a whole playlist. Aesthetics without their own
video borrow from related ones (settings under `borrow`), and every result also gets a
YouTube search button.

```json
{ "id": "qhH4D251i4Q", "title": "pacific northwest playlist", "author": "Leaner",
  "mood": "One line on the feeling of it.", "aesthetics": ["forestpunk", "cabincore"] }
```

**A photo:** results search Wikimedia Commons with the aesthetic's `keywords`, at most
two photos per keyword. To pick exact photos, open `tools/image-picker.html` through
`node tools/serve.js`, pin the ones that fit, and download the new `images.json`.
Aesthetics Wiki images are not used (not freely licensed); each result links to the
wiki page instead.

Then run:

```bash
node tools/validate.js       # checks references, coverage, fairness, gendered wording
node tools/build-bundle.js   # only needed for opening from disk
```

## Privacy

Everything runs in the browser, with no tracking. The only outside requests are the
Commons photo search and YouTube thumbnails; music links open YouTube only when
clicked. `localStorage` keeps the run in progress, question history, topic preferences
and the name setting.

## License

MIT, see [LICENSE](LICENSE). Photos come from Wikimedia Commons under their own
licences, credited on each image. The aesthetic profiles are original, using Aesthetics
Wiki only as a reference for names and general character.
