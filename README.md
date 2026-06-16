# Humaniek — Atlas anatomii 3D

Interaktywna przeglądarka modelu anatomicznego 3D zbudowana w **React + Vite**,
**React Three Fiber** i **Tailwind CSS**. Kliknij dowolną strukturę, aby zobaczyć
jej nazwę łacińską, polską oraz opis z Wikipedii.

## Funkcje

- Widok modelu 3D na całym ekranie (OrbitControls: obrót, zoom, przesuwanie)
- Model `.glb` skompresowany **Draco** (ładowany przez `DRACOLoader`)
- Kliknięcie na mesh → identyfikacja po nazwie obiektu i panel boczny z opisem
- Wyszukiwarka filtrująca struktury i podświetlająca pasujący mesh
- Responsywny layout (mobile + desktop)

## Wymagania wstępne

Umieść skompresowany model w katalogu `public/`:

```
public/model.glb
```

> Model musi być skompresowany Draco. Nazwy meshy w pliku `.glb` muszą odpowiadać
> polom `mesh_name` w `src/data/anatomy_db.json` (porównanie ignoruje wielkość
> liter i białe znaki na końcach).

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy na GitHub Pages

1. W `package.json` ustaw `homepage` na adres swojego repo, np.
   `https://twoj-login.github.io/humaniek`.
2. W `vite.config.js` ustaw `base` na `/humaniek/` (nazwa repo ze slashami).
3. Wdróż:

```bash
npm run deploy
```

Komenda zbuduje projekt (`predeploy`) i opublikuje katalog `dist` na gałęzi
`gh-pages` przy pomocy paczki `gh-pages`.

## Struktura danych

Każdy wpis w `src/data/anatomy_db.json`:

```json
{
  "mesh_name": "Acetabulum.j",
  "name_lat": "Acetabulum",
  "name_pl": "Panewka stawu biodrowego",
  "wikipedia": {
    "pl": { "title": "...", "description": "...", "extract": "...", "url": "..." },
    "en": null
  }
}
```

Panel boczny pokazuje opis z `wikipedia.pl`, a w razie jego braku — `wikipedia.en`.
