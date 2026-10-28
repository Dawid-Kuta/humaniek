# Humaniek — Atlas anatomii 3D (Work in progress)

Interaktywny atlas anatomii człowieka w przeglądarce (React + Vite, React Three
Fiber, Tailwind CSS) oparty na modelu [Z-Anatomy](https://www.z-anatomy.com/).
Kliknij dowolną strukturę — kość, mięsień, naczynie, nerw, narząd — aby zobaczyć
jej nazwę polską, łacińską i angielską, przyczepy, czynność, unerwienie,
unaczynienie oraz opis z Wikipedii.

## Funkcje

- **1709 struktur** (1657 z nazwą polską i łacińską) — w tym wszystkie
  272 mięśnie i 225 kości modelu, każda z nazwą PL / łac. / EN.
- **Mięśnie**: przyczep początkowy i końcowy, czynność, unerwienie, unaczynienie,
  antagoniści (po polsku), przyczepy odczytane z modelu 3D (klikalne), zdania z
  polskiej Wikipedii, części mięśnia (np. trzy części mięśnia naramiennego).
- **Kości**: połączenia stawowe, mięśnie przyczepiające się do kości (z modelu),
  ślady przyczepów wyświetlane na kości po jej zaznaczeniu.
- Opis z polskiej i angielskiej Wikipedii (+ definicje Z-Anatomy), ilustracje,
  synonimy łacińskie, identyfikatory TA2 i Wikidata.
- Wyszukiwarka PL / łac. / EN niewrażliwa na polskie znaki („miesien” = „mięsień”).
- Warstwy (układ kostny, mięśniowy, powięzie, przyczepy, stawy i więzadła, krążenie,
  nerwy i zmysły, narządy), „Pokaż tylko to”, „Ukryj”, „Prześwietl” (reszta
  półprzezroczysta — włącza się sama, gdy szukana struktura jest zasłonięta).
- Płynne przybliżanie kamery do zaznaczenia (z właściwej strony ciała), zoom do
  kursora, podpowiedź z nazwą pod kursorem, układ mobilny (panel od dołu).
- Tabele do pobrania: `public/data/export/miesnie.csv`, `public/data/export/kosci.csv`.

Skróty: klik = wybór, 2× klik = przybliż, `F` przybliż, `X` prześwietl,
`H` ukryj, `Esc` odznacz.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173/humaniek/
npm run build && npm run preview
```

## Dane anatomiczne

Dane powstają skryptem i leżą w `public/data/` (wczytywane w przeglądarce):

| Plik | Zawartość |
| --- | --- |
| `index.json` (~275 KB) | wszystkie struktury: id, nazwa PL / łac. / EN, układ, strony, części |
| `details/00…47.json` (~5 MB łącznie) | opisy, fakty, przyczepy — pobierane dopiero po kliknięciu |
| `export/*.csv` | mięśnie i kości jako arkusze (średnik, UTF-8) |

Źródła:

- **Nazewnictwo** — tabela terminologii TA2 projektu Z-Anatomy (polskie tłumaczenie:
  Jadwiga Palosz), pobierana z arkusza Google projektu.
- **Opisy** — Wikipedia PL i EN; artykuły dopasowane przez Wikidata (identyfikator
  TA2), definicje Z-Anatomy lub nazwę potwierdzoną w Wikidata (identyfikator FMA /
  TA98 / TA2 / UBERON), więc nie trafiają się przypadkowe artykuły.
- **Fakty** (przyczepy, unerwienie…) — infoboksy angielskiej Wikipedii, tłumaczone na
  polski słownikiem terminów TA2 i linkami językowymi Wikipedii; pozostałe pola mają
  tłumaczenie redakcyjne w `scripts/sources/translations-pl.json` (oryginał widać po
  najechaniu kursorem).
- **Przyczepy w modelu** — znaczniki przyczepów Z-Anatomy (`*.o*`, `*.e*`) i kości,
  na których leżą.

Odświeżenie danych:

```bash
npm run data:fetch   # pobiera arkusz TA2 Z-Anatomy do scripts/sources/
npm run data:build   # buduje public/data/ (odpowiedzi API są w scripts/.cache/)
node scripts/list-untranslated.mjs untranslated.json   # fakty mięśni/kości bez tłumaczenia
node scripts/show-structure.mjs femur "Deltoid muscle"  # podgląd danych struktury
```

## Model 3D

`public/model.glb` (7,1 MB) powstaje z eksportu Z-Anatomy
`scripts/sources/model-source.glb` (16,8 MB):

```bash
npm run model:optimize            # Draco (domyślnie)
node scripts/optimize-model.mjs --error=0.0001   # mniejsze uproszczenie
node scripts/optimize-model.mjs --meshopt        # EXT_meshopt_compression
```

Co robi `scripts/optimize-model.mjs`:

- usuwa 3 zaszyte światła kierunkowe (3415 / 2049 / 341 lx), które prześwietlały
  scenę do bieli, oraz 318 pustych węzłów (kotwice etykiet);
- zastępuje 154 materiały (biały kolor, `emissive = 1`, „metaliczne” kości,
  rozszerzenia `KHR_materials_*`) paletą anatomiczną z `scripts/model-style.mjs`;
- upraszcza siatki z bezwzględnym limitem błędu 0,15 mm: 5,36 → 1,14 mln trójkątów;
- zapisuje w każdym węźle `extras` (`sid`, `side`, `sys`, `mk`, `on`), dzięki czemu
  aplikacja nie zależy od nazw obiektów (GLTFLoader i tak je zmienia);
- spłaszcza hierarchię, by znaczniki przyczepów miały własną warstwę.

W aplikacji: wybieranie przez BVH (`three-mesh-bvh`, budowane leniwie i w czasie
bezczynności), renderowanie tylko przy zmianach (`frameloop="demand"`), niższa
rozdzielczość podczas obracania, wspólne materiały, lokalny dekoder Draco
(`public/draco/`) i oświetlenie bez pobierania HDR.

## Deploy na GitHub Pages

1. W `package.json` ustaw `homepage`, a w `vite.config.js` `base` (nazwa repo).
2. `npm run deploy` — buduje projekt i publikuje `dist` na gałęzi `gh-pages`.

Model ma 7 MB, więc mieści się w repozytorium; `VITE_MODEL_URL` pozwala mimo to
wskazać zewnętrzny plik (np. zasób z GitHub Releases).

## Licencje

Model i nazewnictwo: Z-Anatomy (na bazie BodyParts3D), CC BY-SA 4.0. Opisy:
Wikipedia, CC BY-SA 4.0. Wikidata: CC0. Szczegóły w oknie „Źródła i licencje”.
