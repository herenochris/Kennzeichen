# Kennzeichen-Raten

Ein Ratespiel im Browser: Du siehst ein deutsches Kfz-Kennzeichen und tippst auf der Karte an, woher es kommt.

- **Tägliches Rätsel** – startet immer beim Öffnen der Seite. Jeden Tag 5 Kennzeichen, für alle gleich (Tageswechsel um Mitternacht deutscher Zeit). Von Runde zu Runde werden sie seltener. Mit Serie, Statistik und teilbarem Ergebnis.
- **Freier Modus** – wird nach dem Tagesrätsel freigeschaltet. Gespielt wird in Runden zu je 5 Kennzeichen; wer in einer Runde unter 2.500 Punkten bleibt, fliegt raus. Danach zeigt ein Fenster das Gesamtergebnis, und nur dort wählt man die Schwierigkeit für den nächsten Lauf: Leicht (Rang 1–100), Mittel (101–280), Schwer (281–450), Profi (451–697). Je mehr Autos ein Kennzeichen tragen, desto leichter.
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
| `plates.js` | 697 Unterscheidungszeichen mit Herkunftsort, Kreis, Bundesland, Koordinaten (`m: 1` = aktuelles Hauptkennzeichen, `r` = Häufigkeitsrang) |
| `germany.js` | Umrisse der Bundesländer |
| `vendor/leaflet/` | Leaflet 1.9.4 (Kartenbibliothek, BSD-2-Clause) |

## Quellen

- Kennzeichenliste: npm-Paket `german-license-plate-prefixes`
- Ortskoordinaten: GeoNames (über `all-the-cities`), CC BY 4.0
- Bundesländer: [isellsoap/deutschlandGeoJSON](https://github.com/isellsoap/deutschlandGeoJSON)

Der Häufigkeitsrang ist eine Schätzung: Die Einwohner aller Orte werden dem nächstgelegenen Kennzeichen-Ort zugeordnet, Alt-Kennzeichen bekommen davon etwa 20 %. Echte Fahrzeugzahlen pro Kürzel veröffentlicht das KBA nicht.

Als Ziel gilt jeweils der Ort, nach dem das Kürzel benannt ist (meist die heutige oder frühere Kreisstadt).
