# What Aesthetic Are You?

A personality test that finds which **aesthetic world** you belong to — not which
pictures you like. 200 statements in the bank, 50 per run, 35 hidden dimensions and
77 aesthetics, using Aesthetics Wiki as a reference.

No framework, no build step, no dependencies. Open `index.html`.
OR use the website at [estetikk.netlify.app](https://estetikk.netlify.app).

---

## Running it locally

```bash
node tools/serve.js
```

Opens at `http://localhost:8123`.

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
  sits alone under the progress bar.
* **Every tap target is at least 44px**, and taps get no 300ms delay and no grey flash.
* **Hover styling is gated behind `(hover: hover) and (pointer: fine)`**, so tapping an
  option on a touch screen never leaves a stuck hover state behind.
* **The photo strip scrolls sideways with snap points** instead of stacking three tall
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
answers  →  35 dimensions  →  match against 77 aesthetic profiles
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

The statement bank is also written with both directions in mind: for most
dimensions there are statements where "agree" pushes the value up *and*
statements where "agree" pushes it down, so no single response habit steers the
result.

### The match

Each aesthetic is compared dimension by dimension. Every dimension is weighted by

* **salience** — how defining it is for that aesthetic (0.5 is indifferent, 0 and 1 are strong)
* **confidence** — how well the dimension was measured

The top match gets an absolute percentage. The rest are placed by how far they fall
below the top, measured against your own spread — without that, all 77 would land
within ten points of each other and the ranking would say nothing.

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

## Question selection

The 200 statements sit in **20 themed groups of ten**. Each run draws **2–3 from every
group**, which is what makes two runs feel genuinely different while still covering
every theme.

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
* the order is spread, so two statements in a row rarely come from the same group
* everything is seeded. `?seed=ABC12XYZ` recreates a run exactly, and deliberately
  skips the history filter when it does

---

## Files

```
index.html
netlify.toml
assets/css/styles.css
assets/js/
  prng.js         seeded randomness (mulberry32)
  data.js         loads the JSON, falls back to the bundle
  selection.js    picks the 50 statements
  scoring.js      profile + matching (no text)
  narrative.js    result text (no numbers)
  visuals.js      generated mood plates
  images.js       optional Wikimedia Commons photos
  app.js          screens and flow
data/
  questions.json  200 statements with dimension weights
  aesthetics.json 77 aesthetics: profile, palette, search terms, "world"
  scoring.json    scale, groups, dimensions, matching parameters
  narrative.json  phrase banks
  bundle.js       GENERATED — fallback for file://
tools/
  build-bundle.js
  validate.js
  serve.js
```

The UI code knows nothing about which aesthetics exist. New statements and aesthetics
go into `/data` without touching any JavaScript.

### Adding an aesthetic

```json
{
  "key": "my-aesthetic",
  "name": "My Aesthetic",
  "tagline": "One line that catches the mood",
  "description": "Two sentences on what this is.",
  "keywords": ["...", "..."],
  "palette": ["#0d1610", "#22392a", "#6d8459", "#cfc3a3"],
  "imageQuery": ["english search term", "second search term"],
  "dimensions": { "nature": 0.95, "solitude": 0.9, "urban": 0.08 },
  "related": ["forestpunk"],
  "world": {
    "setting": "...", "architecture": "...", "interior": "...", "technology": "...",
    "clothes": "...", "music": "...", "colours": "...", "everyday": "..."
  }
}
```

Omitted dimensions are treated as irrelevant, not as neutral — they do not drag the
score down.

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
  statements used:            200 / 200
  duplicate clusters:         0
  same group twice in a row:  0.00 per quiz
  distinct quota shapes:      400 of 400 runs

— Scoring (600 simulated people) —
  distinct winners:           48 / 77
  distinct hidden picks:      60
  average top match:          81.1%
  combination shown:          34% of the time
```

---

## Images

Two layers, and only the first is guaranteed.

**Mood plates** are generated by `visuals.js`: an SVG per aesthetic built from its own
palette and dimensions — geometric bands for the ordered ones, organic shapes for the
rest, with grain and vignette. The same aesthetic always produces the same plate.

**Photographs** come from Wikimedia Commons, which is freely licensed and serves CORS
headers. Each aesthetic carries two English search terms; results are filtered against
maps, scanned book plates and the like, and every photo is shown with its creator and
licence. Aesthetics Wiki images are not used — they are not freely licensed.

The photo strip is progressive enhancement. If the request is slow, blocked or empty,
the section is simply never inserted. It is labelled honestly on the page: keyword
matches approximating the atmosphere, not official images of the aesthetic.

## Privacy

Everything is computed in the browser. No tracking, and the only outbound request is
the optional image search. `localStorage` holds the run in progress, the question
history and one preference.
