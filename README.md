# Kennzeichen-Raten

Ein Ratespiel im Browser: Du siehst ein deutsches Kfz-Kennzeichen und tippst auf der Karte an, woher es kommt.

- **Tägliches Rätsel** – jeden Tag 5 Kennzeichen, für alle gleich (Tageswechsel um Mitternacht deutscher Zeit). Mit Serie, Statistik und teilbarem Ergebnis.
- **Endlos** – beliebig viele Runden. Der Lauf endet, wenn du mehr als 200 km danebenliegst. Alt-Kennzeichen lassen sich ein- oder ausschalten.
- Punkte: bis zu 1000 pro Runde, je näher, desto mehr. Der Hinweis (Bundesland) halbiert die Punkte.

## Starten

Rein statische Seite ohne Build-Schritt. Einfach `index.html` öffnen oder lokal ausliefern:

```sh
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Zum Veröffentlichen genügt z. B. GitHub Pages (Branch auswählen, Ordner `/`).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css`, `app.js` | Seite und Spiellogik |
| `plates.js` | 697 Unterscheidungszeichen mit Herkunftsort, Kreis, Bundesland, Koordinaten (`m: 1` = aktuelles Hauptkennzeichen) |
| `germany.js` | Umrisse der Bundesländer |
| `vendor/leaflet/` | Leaflet 1.9.4 (Kartenbibliothek, BSD-2-Clause) |

## Quellen

- Kennzeichenliste: npm-Paket `german-license-plate-prefixes`
- Ortskoordinaten: GeoNames (über `all-the-cities`), CC BY 4.0
- Bundesländer: [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON)

Als Ziel gilt jeweils der Ort, nach dem das Kürzel benannt ist (meist die heutige oder frühere Kreisstadt).
