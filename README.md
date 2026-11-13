# Kennzeichen-Raten

Ein Ratespiel im Browser: Du siehst ein deutsches Kfz-Kennzeichen und tippst auf der Karte an, woher es kommt.

- **Rätsel** – startet immer beim Öffnen der Seite. Zweimal täglich (um 7 und 19 Uhr deutscher Zeit, einstellbar über `CHANGE_HOURS` in `app.js`) 5 neue Kennzeichen, für alle gleich. Von Runde zu Runde werden sie seltener. Mit Serie, Statistik und teilbarem Ergebnis.
- **Freier Modus** – wird nach dem Tagesrätsel freigeschaltet. Gespielt wird in Runden zu je 5 Kennzeichen; wer in einer Runde unter 2.500 Punkten bleibt, fliegt raus. Danach zeigt ein Fenster das Gesamtergebnis, und nur dort wählt man die Schwierigkeit für den nächsten Lauf: Leicht (über ca. 125.000 Autos), Mittel (50.000–125.000), Schwer (7.000–50.000), Profi (unter 7.000). Je mehr Autos ein Kennzeichen tragen, desto leichter.
- Punkte: bis zu 1000 pro Kennzeichen, je näher, desto mehr (50 km ≈ 757, 100 km ≈ 551, 200 km ≈ 266, 300 km ≈ 54, ab 400 km 0). Der Hinweis (Bundesland) halbiert die Punkte.

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
| `plates.js` | 697 Unterscheidungszeichen mit Herkunftsort, Kreis, Bundesland, Koordinaten (`m: 1` = aktuelles Hauptkennzeichen, `r` = Häufigkeitsrang) |
| `germany.js` | Umrisse der Bundesländer |
| `cities.js` | Großstädte zur Orientierung auf der Karte |
| `vendor/leaflet/` | Leaflet 1.9.4 (Kartenbibliothek, BSD-2-Clause) |

## Quellen

- Kennzeichenliste: npm-Paket `german-license-plate-prefixes`
- Ortskoordinaten: GeoNames (über `all-the-cities`), CC BY 4.0
- Bundesländer: [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON)

Der Häufigkeitsrang ist eine Schätzung (Autos ≈ 0,58 × Einwohner, wie im Bundesschnitt): Die Einwohner aller Orte werden dem nächstgelegenen Kennzeichen-Ort zugeordnet, Alt-Kennzeichen bekommen davon etwa 20 %. Echte Fahrzeugzahlen pro Kürzel veröffentlicht das KBA nicht.

Als Ziel gilt jeweils der Ort, nach dem das Kürzel benannt ist (meist die heutige oder frühere Kreisstadt).
