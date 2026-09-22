# What Aesthetic Are You?

A personality test that finds which **aesthetic world** you belong to — not which
pictures you like. 360 statements in the bank, 50 per run, 35 hidden dimensions and
176 aesthetics across 18 families, using Aesthetics Wiki as a reference.

No framework, no build step, no dependencies. Open `index.html`.
OR use the website at [estetikk.netlify.app](https://estetikk.netlify.app).

---

## Contents

* [Running it locally](#running-it-locally)
* [Deploying to Netlify](#deploying-to-netlify)
* [Built for the phone first](#built-for-the-phone-first)
* [How the test works](#how-the-test-works)
* [The 18 families](#the-18-families)
* [The back button](#the-back-button)
* [Gender-neutral by default](#gender-neutral-by-default)
* [Question selection](#question-selection)
* [Files](#files)
* [Validation](#validation)
* [Images](#images)
* [Music](#music)
* [Privacy](#privacy)
* [License](#license)

---

## Running it locally

```bash
node tools/serve.js
```

Opens at `http://localhost:8123`.

**Preview any result without taking the quiz:** `?preview=<aesthetic-key>` (e.g.
`?preview=after-hours`) jumps straight to that aesthetic's result screen — useful for
checking the photos/music/layout across aesthetics. Gated to `localhost` and `file://`
in `app.js`'s `isLocalDev()`, so it does nothing on the deployed site. An unknown key
logs the full list of valid ones to the console.

The page also works opened straight from disk. The browser blocks `fetch` against
local files there, so the app falls back to `data/bundle.js` — a generated copy of
the JSON:

```bash
node tools/build-bundle.js
```

Run that after every change under `/data`.

## Deploying to Netlify

It is a static site, so there is nothing to build. `netlify.toml` sets
`publish = "."` with an empty build command; point Netlify at the repository and it
serves the root as-is.

Two things to keep in mind:

- **Commit `data/bundle.js`.** It is generated, but there is no build step on Netlify
  to regenerate it. Run `node tools/build-bundle.js` before pushing whenever `/data`
  changes.
- **The photo strip calls Wikimedia Commons from the visitor's browser.** It is
  optional — if you add a strict `Content-Security-Policy`, allow
  `connect-src https://commons.wikimedia.org` and
  `img-src https://upload.wikimedia.org`, or the strip just quietly stops appearing.
- **Track thumbnails load from `https://i.ytimg.com`.** Allow it under `img-src` too, or
  the thumbnail images silently fail and cards fall back to a plain colour tile.

---

## Built for the phone first

The stylesheet is mobile first: the base rules are the phone layout and the wider
breakpoints add to it. Concretely, on a phone:

* **The whole quiz is pinned to one viewport.** On a 360x640 handset the buttons used
  to sit 216px below the fold, so every one of 50 questions needed a scroll before it
  could be answered. Now the screen is locked to `100dvh`, the option list flexes to
  fill whatever height is left, and the Back / Next bar rides along the bottom with a
  blurred backdrop — Next is the wider of the two because it is pressed 50 times.
* **Answering a statement advances on its own.** There is no switch for it; the counter
  and the current theme share one line under the progress bar, and the theme name
  truncates rather than pushing the counter off a narrow screen.
* **Every tap target is at least 44px**, and taps get no 300ms delay and no grey flash.
* **Hover styling is gated behind `(hover: hover) and (pointer: fine)`**, so tapping an
  option on a touch screen never leaves a stuck hover state behind.
* **The photo strip scrolls sideways with snap points** instead of stacking tall
  images that would push the rest of the result off the screen.
* **The profile rows restack** — label and value on one line, meter under it — instead
  of squeezing four columns into 360px.
* Safe-area insets are respected, so nothing hides under a notch or a home indicator,
  and `100dvh` is used so the mobile browser chrome doesn't crop the layout.

Nothing about the desktop layout changed: past 40rem the bar goes static, the photos
return to a three-column grid, and the hero foot goes back to two columns.

## How the test works

The point is that no statement belongs to any one aesthetic. The chain is:

```
answers  →  35 dimensions  →  match against 176 aesthetic profiles
```

A question about old buildings never scores points for "Dark Academia". It moves
`history`, `nostalgia`, `architecture` and `modernity`, and the aesthetics fall out
of the whole. That is why you cannot guess what a question measures, and why you
cannot play the test.

### The profile

Every answer sits on a 7-point scale from +3 (Strongly agree) to −3 (Strongly
disagree). Before anything is scored, 0.6 of each person's *own average response*
is subtracted from every answer — an acquiescence guard, so someone who leans
"agree" (or "disagree") on almost everything lands in the same place as someone
with the same taste who doesn't. Then, for each dimension, `answer × weight` is
summed and normalised against the sum of absolute weights, giving a value between
0 and 1 — plus a *confidence* saying how much evidence that dimension got.

The profile is then **stretched onto the catalogue's own scale**. The two sides of
the match are not naturally comparable: an aesthetic says `nature: 0.95`, but fifty
statements pulling on 35 dimensions never produce a 0.95 — real profiles pile up
near the middle, about 1.85× closer to neutral than the aesthetics they are measured
against. Compared directly, a vaguely drawn aesthetic agrees with everyone and a
sharply drawn one loses even to the person who unmistakably *is* it. So each
person's own spread is measured (confidence-weighted, so a thinly covered dimension
does not set the scale) and the whole profile is scaled by one factor to match. That
keeps the shape — which dimensions sit high relative to which — and changes only the
range it is expressed in. It cuts both ways: a cautious answerer is opened out, and
someone more extreme than the catalogue is pulled in, so the ranking turns on the
shape of a taste rather than on how hard the buttons were pressed. Bounded by
`stretchMin` / `stretchMax` in `scoring.json`.

The statement bank is written with both directions in mind: **every** dimension
has statements where "agree" pushes the value up *and* statements where "agree"
pushes it down, so no single response habit steers the result. The weaker
direction is never less than a quarter of a dimension's statements — without
that floor, a dimension measured only one way turns into a test of how agreeable
somebody is feeling. `validate.js` warns when a dimension drifts one-sided.

Every dimension is also carried by at least 18 statements, so none of them comes
down to a single lucky draw: the thinnest dimension now gets **2.6 statements per
run**, where the thinnest used to get 1.4.

### The match

Each aesthetic is compared dimension by dimension. Every dimension is weighted by

* **salience** — how defining it is for that aesthetic (0.5 is indifferent, 0 and 1 are strong)
* **confidence** — how well the dimension was measured

The top match gets an absolute percentage. The rest are placed by how far they fall
below the top, measured against your own spread — without that, every aesthetic
would land within ten points of the next and the ranking would say nothing. The
result page shows the closest 10 by default, with a toggle underneath the list for
anyone who wants the full ranking rather than just the top of it.

### The hidden aesthetic

Picked from places 4–18 and scored on *fit × novelty*: it has to fit reasonably well
while sitting far from the top two in dimension space, and it is blocked if it
appears in either one's `related` list. That is why it feels unexpected rather than
just being number three.

### The combination

If second place is within 4 points, the result is described as a hybrid (`A × B`).
The system never pretends a hybrid name is official — the text says explicitly that
the combination was assembled from your profile.

---

## The 18 families

`family` on every aesthetic groups the catalogue. It is metadata for browsing only —
the scoring never reads it, so moving an aesthetic between families cannot change
anyone's result.

| Family | n | Examples |
|---|---|---|
| Internet and Liminal | 21 | After Hours, Analog Horror, Doomer, Draincore, … |
| Subculture | 18 | Beatnik, Dark Cabaret, Emo, Greaser, … |
| Art and Period | 16 | Art Deco, Art Nouveau, Arts and Crafts, Baroque, … |
| Witchy and Folk | 14 | Appalachian Gothic, Cryptidcore, Dark Fantasy, Dark Naturalism, … |
| Punk and Futurism | 12 | Atompunk, Cassette Futurism, Cyberpunk, Decopunk, … |
| Soft and Romantic | 12 | Angelcore, Balletcore, Clean Minimal, Coquette, … |
| Goth | 11 | Cybergoth, Dark Romanticism, Goth, Industrial Gothic, … |
| Japanese Street and Kawaii | 11 | City Pop, Decora, Fairy Kei, Gyaru, … |
| Global and Regional | 10 | Afrofuturism, Afropunk, Brazilcore, Gulf Futurism, … |
| Design and Everyday | 8 | Brutalism, Eclectic Vintage, Maximalism, Mid-Century Modern, … |
| Sport and Utility | 8 | Equestrian, Gorpcore, Jock, Racing, … |
| Americana and Screen | 7 | 50s Suburbia, Americana, Diner, Film Noir, … |
| Nature and Pastoral | 7 | Cabincore, Cottagecore, Forestpunk, Granola, … |
| Status and Money | 7 | Corpcore, Dandy, Hypebeast, Mob Glamour, … |
| Cosy and Home | 5 | Cluttercore, Coastal Linen, Coffee House, Grandmillennial, … |
| Academia | 3 | Dark Academia, Light Academia, Romantic Academia |
| Adventure and Frontier | 3 | Adventure Pulp, Adventurecore, Western |
| Sea and Coast | 3 | Nautical, Ocean Grunge, Oceanpunk |

---

## The back button

Browser **Back** — the toolbar button, `Alt`+`←`, and the back gesture on a phone —
steps back through the test instead of leaving it. Every screen gets a history
entry, and so does every statement, so Back and Forward move through a run exactly
the way the on-screen buttons do:

```
intro → preferences → statement 1 → statement 2 → … → statement 50 → result
```

The URL never changes. Entries are told apart by their `history.state` object
rather than their address, so a shared `?seed=` link is still intact after fifty
steps back.

Two details worth keeping if this code is touched:

* **The on-screen Back calls `history.back()`** rather than moving the index
  itself. If it stepped back directly it would leave a forward entry stranded and
  the two Backs would drift apart after a few presses.
* **`quizJumpTo` moves the existing quiz screen** instead of rebuilding it, so
  stepping between statements does not re-run selection. It is set while the quiz
  is on screen and cleared on teardown; with no quiz on screen the router falls
  back to rendering one.

Where the run is gone — a reload after finishing, since the result clears the saved
session — Back lands on the intro rather than a broken screen.

---

## Gender-neutral by default

The test never asks your gender, nothing in the scoring knows about it, and no
aesthetic belongs to one — so what you see is gender-neutral throughout. The
statement bank and all the result text are written that way, and `validate.js`
fails the build if a gendered word appears in a statement or in an aesthetic's
default name, tagline, description, keywords or world.

Nine aesthetics are known on the Aesthetics Wiki by wording that assumes a
gender. The neutral form is what the data carries; the canonical wording sits in
a `gendered` block beside it:

| Neutral (default) | Gender-specific |
|---|---|
| Soft Pastel | Soft Girl |
| Older Siblingcore | Olderbrothercore |
| Clean Minimal | Clean Girl |
| Coastal Linen | Coastal Grandmother |
| Eclectic Vintage | Eclectic Grandpa |
| Mob Glamour | Mob Wife |
| Terracecore | Blokecore |
| Coquette | *(description only)* |
| Princesscore | *(description only)* |

A switch at the foot of the intro screen and of the result page turns the
gender-specific version on. It is remembered in `aq.genderedNames.v1` and applied
in `data.js` when the data loads, so the rest of the app reads `a.name` and
`a.description` without knowing the feature exists. **Nothing about the ranking
changes** — only the words. The same run produces the same result either way.

```json
{
  "key": "soft-girl",
  "name": "Soft Pastel",
  "gendered": { "name": "Soft Girl" }
}
```

`gendered` may override `name`, `tagline` and `description`, and nothing else.

---

## Question selection

The 360 statements sit in **20 themed groups of eighteen**. Each run draws **2–3 from
every group**, which is what makes two runs feel genuinely different while still
covering every theme, and each group is then asked as one block (see below).

| Group | Group |
|---|---|
| Sound and silence | Making and mending |
| Music and taste | Money and possessions |
| Nature and wilderness | People and solitude |
| Weather, light and seasons | The unexplained |
| Home and buildings | Imagination and play |
| Food and the table | Order and mess |
| The past | Clothes and style |
| Tradition and belonging | Travel and adventure |
| Screens and the net | Temperament |
| The future | Values and self-image |

On top of that:

* two statements with the same `cluster` (near-identical wording) never appear together
* dimensions with no coverage are repaired by swapping a statement in
* statements from recent runs are set aside while fresh ones remain — stored locally
  in `aq.previousQuestionIds.v3`
* everything is seeded. `?seed=ABC12XYZ` recreates a run exactly, and deliberately
  skips the history filter when it does

### Themed blocks

The run is **asked one theme at a time**. All the statements drawn from a theme are
asked together as a block, one statement per screen as usual, with the theme and your
place in it shown beside the running count:

```
  Question 8 of 50        Music and taste · 2 of 3
```

So a run is always 20 blocks of 2–3, and picking **Sound & music** on the preferences
screen makes that block more likely to be a 3 than a 2.

The block order and the order within each block are both drawn off the seed, so no
two runs open on the same theme but a shared `?seed=` link still reproduces
everything exactly. Set by `selection.order` in `scoring.json`:

| `order` | Behaviour |
|---|---|
| `"blocks"` | **default** — one theme at a time |
| `"spread"` | the old behaviour: consecutive statements pushed into different themes |
| `"shuffle"` | no ordering at all |

The blocks are read back off the statement order rather than stored in the session,
so a resumed run rebuilds them from the saved statement ids alone.

### Preferences

Before a fresh run (not a shared `?seed=` link, which must stay reproducible), a
short screen asks what matters to you — living space, sound and music, food, human
connection, technology, nature, history, style, mystery, craft and order, travel —
grouped in `data/scoring.json` under `preferenceCategories`, each mapped to one or
more of the 20 statement groups above.

Picking up to five nudges `drawQuotas()` in `assets/js/selection.js`: groups behind a
chosen category get a higher chance of winning the "extra" slot (three statements
instead of two), via a weighted, seeded draw (`AQ.rng.weightedShuffle`). Every group
still keeps its guaranteed minimum regardless of what is picked, so the theme
coverage and the "no statement belongs to any one aesthetic" scoring are unaffected —
this only shifts which topics you see slightly more of. Skipping the screen (or
picking nothing) reproduces the old, unweighted draw exactly. The choice is
remembered locally in `aq.preferences.v1` and offered again on every retake.

---

## Files

```
index.html
netlify.toml
assets/css/styles.css
assets/js/
  prng.js         seeded randomness (mulberry32)
  data.js         loads the JSON, falls back to the bundle, applies the name version
  selection.js    picks the 50 statements
  scoring.js      profile + matching (no text)
  narrative.js    result text (no numbers)
  visuals.js      generated mood plates
  images.js       optional Wikimedia Commons photos
  app.js          screens and flow
data/
  questions.json  360 statements with dimension weights
  aesthetics.json 176 aesthetics: profile, palette, "world"
  scoring.json    scale, groups, dimensions, preference categories, matching parameters
  narrative.json  phrase banks
  playlists.json  hand-picked YouTube videos per aesthetic, plus the search fallback
  images.json     curated Wikimedia Commons photos per aesthetic, plus the search fallback
  bundle.js       GENERATED — fallback for file://
tools/
  build-bundle.js
  validate.js
  serve.js
  image-picker.html  dev tool for curating data/images.json
```

The UI code knows nothing about which aesthetics exist. New statements and aesthetics
go into `/data` without touching any JavaScript.

### Adding an aesthetic

```json
{
  "key": "my-aesthetic",
  "name": "My Aesthetic",
  "family": "Nature and Pastoral",
  "tagline": "One line that catches the mood",
  "description": "Two sentences on what this is.",
  "keywords": ["...", "..."],
  "palette": ["#0d1610", "#22392a", "#6d8459", "#cfc3a3"],
  "dimensions": { "nature": 0.95, "solitude": 0.9, "urban": 0.08 },
  "related": ["forestpunk"],
  "world": {
    "setting": "...", "architecture": "...", "interior": "...", "technology": "...",
    "clothes": "...", "music": "...", "colours": "...", "everyday": "..."
  }
}
```

Also add a `"my-aesthetic": ["english search term", "second search term"]` entry under `search`
in `data/images.json` (see [Images](#images)), or it will never show a photo.

Omitted dimensions are treated as irrelevant, not as neutral — they do not drag the
score down.

`family` groups the catalogue for browsing; it takes no part in scoring. Use one of
the existing 18 rather than inventing a new one unless the aesthetic genuinely sits
outside all of them.

Write the profile at roughly the sharpness of the rest of the catalogue. Values
below 0.05 or above 0.95 sit beyond what any profile reaches even after stretching,
so they cost accuracy without buying identity.

### Adding a statement

```json
{
  "id": 181,
  "group": "sound",
  "cluster": "unique-cluster",
  "text": "A statement that doesn't give away what it measures.",
  "dimensions": { "history": 2, "nostalgia": 2, "modernity": -1 }
}
```

Weights run from −3 to 3. Write both positive and negative wordings per dimension, or
someone can answer the same thing to everything and still get a strong reading. Adding
statements to a group is free; adding a **new** group means updating `groups` in
`scoring.json` so the min/max range still brackets 50.

---

## Validation

```bash
node tools/validate.js
```

It checks references, group sizes, dimension coverage and phrase banks, then simulates
400 selections and 600 people to confirm the draw is balanced and the scoring
discriminates:

```
— Selection (400 runs) —
  statements used:            360 / 360
  duplicate clusters:         0
  themed blocks per quiz:     20.0
  distinct opening themes:    20 of 20
  distinct quota shapes:      400 of 400 runs

— Scoring (600 simulated people) —
  distinct winners:           115 / 176
  distinct hidden picks:      141
  average top match:          84.0%
  combination shown:          40% of the time
```

Two further checks are worth running by hand when the catalogue or the scoring
changes, because they catch what the validator cannot:

* **Recovery** — build a respondent whose answers follow an aesthetic's own profile
  and confirm the test returns it. Currently **77%** come back first, **95%** in the
  top three, **100%** in the top ten, and **no aesthetic is unreachable**. An entry
  that cannot win for its own ideal respondent is shadowed by a neighbour and needs
  its distinguishing dimensions sharpened.
* **Winner spread** over a few thousand simulated people. The top ten should hold
  roughly a quarter of all results (currently 24%); if a handful of aesthetics hold
  most of the outcomes, something is drawn too vaguely and is absorbing its
  neighbours.

---

## Images

Two layers, and only the first is guaranteed.

**Mood plates** are generated by `visuals.js`: an SVG per aesthetic built from its own
palette and dimensions — geometric bands for the ordered ones, organic shapes for the
rest, with grain and vignette. The same aesthetic always produces the same plate.

**Photographs** come from Wikimedia Commons, which is freely licensed and serves CORS
headers, in `data/images.json` — laid out the same way `data/playlists.json` groups
videos, so aesthetics and their photos live in one dedicated file, separate from the
scoring-focused `data/aesthetics.json`:

* **`curated`** — exact Commons files a person has checked, each tagged with the
  aesthetics it fits (`{ thumb, page, title, credit, license, aesthetics: [...] }`).
  When an aesthetic has any curated photos, those are used as-is — no live search, so
  no chance of a keyword technically matching but showing the wrong thing (a search for
  `"Xbox 360"` surfacing six product photos of the controller, say, instead of anything
  resembling a bedroom).
* **`search`** — a couple of fallback English keywords per aesthetic, run live against
  Commons for whichever aesthetics nobody has curated a photo for yet. Results are
  filtered against maps, scanned book plates and the like, and every photo is shown with
  its creator and licence.

Aesthetics Wiki images are not used anywhere — they are not freely licensed.

Commons' search is closer to an AND of every word than a fuzzy match, so a long,
descriptive search phrase (`"2000s bedroom crt television games"`) routinely returns
nothing, while two or three concrete, photographable nouns (`"CRT television"`) do well
— though "well" can still mean technically-on-topic but tonally wrong, which is what
curating is for. **`tools/image-picker.html`** (open it through `node tools/serve.js`,
not straight from disk) lets you pick an aesthetic, try out search phrases, and see the
exact Commons results and filtering the real result page would use — same
`AQ.images.searchTerm()`. Click **Pin this photo** on any result that actually fits to
add it to `curated`, then **Download images.json** to save the whole file over
`data/images.json`.

The photo strip is progressive enhancement. If the request is slow, blocked or empty,
the section is simply never inserted. It is labelled honestly on the page: keyword
matches approximating the atmosphere, not official images of the aesthetic.

## Music

The result page ends its main section with **Something to listen to**, for the top
aesthetic. It has three parts:

* the aesthetic's own `world.music` line, so the sound matches the rest of the result;
* any hand-picked videos from `data/playlists.json` that are attached to it;
* a button that searches YouTube for `"<name> aesthetic playlist"`, so every one of the
  176 aesthetics has somewhere to go even without a curated pick. It searches on the
  wiki's own name (`gendered.name` when there is one), because "Soft Girl" finds
  playlists and the neutral "Soft Pastel" does not.

Every link opens YouTube in a new tab; nothing is embedded. Each track card shows a
thumbnail loaded from YouTube's own image CDN (`i.ytimg.com`) — the only request this
page makes to a YouTube-owned host, and it is a static image, not a player.

**Similar aesthetics share videos.** A video's `aesthetics` list is where it belongs
directly, and one video can serve as many as you like. On top of its own video(s), every
aesthetic also gets up to `borrow.max` bonus picks from its closest neighbours, so a
result never rides on just one or two tracks; those cards say "Borrowed from …".
Closeness is the aesthetic's hand-written `related` list first, then the same family,
then how alike the two dimension profiles are. Anything past `borrow.cutoff` is left out,
on the view that no video is better than a wrong one. The four numbers live under
`borrow` in `data/playlists.json`:

| Field | Meaning |
|---|---|
| `max` | most bonus videos borrowed from neighbours |
| `cutoff` | how far apart two profiles may be and still share (lower = stricter) |
| `relatedBonus` | how much being in each other's `related` list counts for |
| `familyBonus` | how much sharing a family counts for |

Every one of the 176 aesthetics already has at least one video of its own in
`curated`.

To add a video, append to `curated` in `data/playlists.json` and run
`node tools/build-bundle.js`:

```json
{
  "id": "qhH4D251i4Q",
  "title": "pacific northwest playlist",
  "author": "Leaner",
  "mood": "One line on the feeling of it.",
  "aesthetics": ["forestpunk", "cabincore"]
}
```

`id` is the 11 characters after `v=` in the URL (drop any `&t=` timestamp). If the link
is part of a YouTube playlist (`&list=PL…`), add it as `"list": "PL…"` and the card
opens the whole playlist instead of one video.
`node tools/validate.js` checks the id format and that every aesthetic key exists. One
video can serve many aesthetics; an aesthetic can have several videos.

## Privacy

Everything is computed in the browser. No tracking, and the only outbound request is
the optional image search — the music links only go to YouTube if you click them.
`localStorage` holds the run in progress, the question
history, the topic preferences and the gender-neutral / gender-specific choice.

---

## License

MIT — see [LICENSE](LICENSE). The photographs in the results come from Wikimedia
Commons under their own licences, shown with each image's creator and licence as
described under [Images](#images); the aesthetic profiles are original, written
using Aesthetics Wiki only as a reference for names and general character.
