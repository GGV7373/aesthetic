# What Aesthetic Are You?

En personlighetstest som finner hvilken **estetisk verden** du hører hjemme i — ikke hvilke
bilder du liker. 156 påstander i banken, 50 per gjennomføring, 35 skjulte dimensjoner og
65 estetikker med utgangspunkt i Aesthetics Wiki som referansegrunnlag.

Ingen rammeverk, ingen byggesteg, ingen avhengigheter. Åpne `index.html`.

---

## Kjøre lokalt

```bash
node tools/serve.js
```

Åpner på `http://localhost:8123`.

Siden fungerer også ved å åpne `index.html` rett fra disk. Nettleseren blokkerer da `fetch`
mot lokale filer, og appen faller automatisk tilbake på `data/bundle.js` — en generert kopi
av JSON-filene:

```bash
node tools/build-bundle.js
```

Kjør den etter hver endring i `/data`.

---

## Slik virker testen

Poenget er at ingen påstand tilhører én estetikk. Kjeden er:

```
svar  →  35 dimensjoner  →  match mot 65 estetikk-profiler
```

Et spørsmål om gamle bygninger gir aldri poeng til «Dark Academia». Det flytter
`history`, `nostalgia`, `architecture` og `modernity` — og estetikkene faller ut av
helheten. Derfor kan man ikke gjette hva et spørsmål måler, og derfor kan man ikke
spille testen.

### Profilen

Hvert svar ligger på en 7-punkts skala fra +3 (Helt enig) til −3 (Veldig uenig). For hver
dimensjon summeres `svar × vekt`, normalisert mot summen av absoluttvekter. Resultatet er
en verdi mellom 0 og 1, pluss en *confidence* som sier hvor mye datagrunnlag dimensjonen
faktisk fikk i denne gjennomføringen.

### Matchen

For hver estetikk sammenlignes profilen dimensjon for dimensjon. Hver dimensjon vektes med

* **salience** — hvor definerende den er for estetikken (0.5 er likegyldig, 0 og 1 er sterkt)
* **confidence** — hvor godt dimensjonen ble målt

Toppmatchen får en absolutt prosent. Resten plasseres relativt til hvor langt de faller under
toppen, målt mot brukerens egen spredning — uten det siste ville alle 65 landet innenfor ti
prosentpoeng av hverandre.

### Skjult estetikk

Velges fra plass 4–18, og scores på *fit × novelty*: den må passe rimelig godt, men samtidig
ligge langt fra de to øverste i dimensjonsrommet, og er sperret hvis den står i `related` hos
en av dem. Det er derfor den føles uventet i stedet for å bare være nummer tre.

### Kombinasjon

Er nummer to innenfor 4 prosentpoeng, beskrives resultatet som en hybrid (`A × B`). Systemet
later aldri som om et hybridnavn er offisielt — teksten sier eksplisitt at kombinasjonen er
satt sammen ut fra profilen.

---

## Spørsmålsutvalget

Hver gjennomføring trekker 50 av 156 etter faste kvoter:

| Tema | Kvote | I banken |
|---|---|---|
| Natur og miljø | 9 | 27 |
| Historie og nostalgi | 7 | 21 |
| Teknologi og framtid | 7 | 22 |
| Arkitektur og rom | 6 | 19 |
| Sosialitet og ensomhet | 5 | 15 |
| Mystikk og fantasi | 5 | 15 |
| Orden og kaos | 4 | 12 |
| Farger, lys og materialer | 4 | 12 |
| Verdier og temperament | 3 | 13 |

I tillegg:

* to spørsmål med samme `cluster` (nesten samme påstand) kommer aldri i samme quiz
* dimensjoner uten dekning repareres ved å bytte inn et spørsmål som dekker dem
* spørsmål fra de siste gjennomføringene velges bort så lenge det finnes ferske —
  lagres lokalt i `aq.previousQuestionIds.v2`
* rekkefølgen spres, så to påstander på rad sjelden kommer fra samme tema
* alt styres av en seed. `?seed=ABC12XYZ` gjenskaper en gjennomføring nøyaktig, og
  hopper da bevisst over historikkfilteret

---

## Filer

```
index.html
assets/css/styles.css
assets/js/
  prng.js         seedet tilfeldighet (mulberry32)
  data.js         laster JSON, faller tilbake på bundle
  selection.js    utvalg av 50 spørsmål
  scoring.js      profil + match (ingen tekst)
  narrative.js    resultattekst (ingen tall)
  visuals.js      genererte stemningsbilder
  app.js          skjermer og flyt
data/
  questions.json  156 påstander med dimensjonsvekter
  aesthetics.json 65 estetikker med profil, palett og «verden»
  scoring.json    skala, kvoter, dimensjoner, matching-parametre
  narrative.json  formuleringsbanker
  bundle.js       GENERERT — reserve for file://
tools/
  build-bundle.js
  validate.js
  serve.js
```

UI-koden vet ingenting om hvilke estetikker som finnes. Nye spørsmål og estetikker legges
til i `/data` uten å røre JavaScript.

### Legge til en estetikk

```json
{
  "key": "min-estetikk",
  "name": "Min Estetikk",
  "tagline": "En linje som fanger stemningen",
  "description": "To setninger om hva dette er.",
  "keywords": ["...", "..."],
  "palette": ["#0d1610", "#22392a", "#6d8459", "#cfc3a3"],
  "dimensions": { "nature": 0.95, "solitude": 0.9, "urban": 0.08 },
  "related": ["forestpunk"],
  "world": {
    "omgivelser": "...", "arkitektur": "...", "interior": "...", "teknologi": "...",
    "klaer": "...", "musikk": "...", "farger": "...", "hverdag": "..."
  }
}
```

Utelatte dimensjoner tolkes som irrelevante, ikke som nøytrale — de trekker ikke ned.

### Legge til et spørsmål

```json
{
  "id": 157,
  "category": "nature",
  "cluster": "unik-cluster",
  "text": "En påstand som ikke røper hva den måler.",
  "dimensions": { "history": 2, "nostalgia": 2, "modernity": -1 }
}
```

Vekter er −3 til 3. Skriv både positive og negative formuleringer per dimensjon, ellers
kan brukeren svare det samme på alt og likevel få utslag.

---

## Validering

```bash
node tools/validate.js
```

Sjekker referanser, kvoter, dimensjonsdekning og formuleringsbanker — og simulerer 400
utvalg og 600 personer for å måle at utvalget faktisk er balansert og at scoringen skiller:

```
— Utvalg (400 kjøringer) —
  spørsmål i bruk:            156 / 156
  dupliserte clustere:        0
  samme tema to på rad:       0.00 per quiz

— Scoring (600 simulerte personer) —
  ulike vinnere:              37 / 65
  ulike skjulte estetikker:   50
  snitt-match øverst:         79.5 %
  kombinasjon vist:           35 % av gangene
```

---

## Bilder

Ingen bilde-API er koblet til. Bilder fra Aesthetics Wiki brukes ikke — de er ikke fritt
tilgjengelige. I stedet genererer `visuals.js` et SVG per estetikk av dens egen palett og
dimensjoner: strukturerte bånd for de ordnede, organiske former for resten, med korn og
vignett. Samme estetikk gir alltid samme bilde.

Skal ekte foto inn senere, er `AQ.visuals.moodPlate()` det eneste stedet som må endres.

## Personvern

Alt regnes ut i nettleseren. Ingen forespørsler ut, ingen sporing. `localStorage` brukes til
pågående sesjon, spørsmålshistorikk og én innstilling.
