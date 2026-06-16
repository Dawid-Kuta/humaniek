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
