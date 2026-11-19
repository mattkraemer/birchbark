# Suomi! 🇫🇮 – Finnisch lernen (lokale App)

Eine kleine, komplett **offline** laufende Web-App, mit der du spielerisch Finnisch lernst. Kein Server, kein Internet, keine Installation nötig.

## Starten

Öffne die Datei **`index.html`** per Doppelklick – sie öffnet sich im Browser (Chrome, Firefox, Edge, Safari). Alternativ kannst du die Dateien von einem beliebigen lokalen Webserver ausliefern, z. B.:

```bash
cd birchbark   # geklonter Repo-Ordner
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

## Spielmodi

| Modus | Beschreibung |
|---|---|
| 🎯 **Quiz** | Multiple Choice, 10 Fragen pro Runde. Richtig = +10 XP. |
| ⌨️ **Schreiben** | Du tippst die Übersetzung selbst (mit Tipp-Button). Richtig = +15 XP. |
| 🃏 **Karteikarten** | Finnische Wörter als umdrehbare Karten; als „bekannt" markieren. |
| ⚡ **Blitzrunde** | 60 Sekunden, so viele richtige Antworten wie möglich. Rekord wird gespeichert. |

## Gamification

- **XP & Level:** Ab 150 XP steigst du auf – von *Aloittelija* (Anfänger) bis *Suomalainen* (Finnin/Finne) 🇫🇮
- **Streak-Bonus:** Ab 5 richtigen Antworten in Folge gibt es +5 XP extra
- **Tägliche Serie:** 🔥 zählt, an wie vielen Tagen in Folge du geübt hast
- **Soundeffekte** (abschaltbar) und Konfetti beim Levelaufstieg
- **Fehler-Review:** Nach jeder Runde siehst du die falsch beantworteten Wörter zum Nachschlagen

## Kategorien

Begrüßungen, Zahlen, Essen & Trinken, Tiere, Farben, Familie, Körper, nützliche Sätze, Adjektive, Verben und Alltagswörter – insgesamt über 300 Finnisch–Deutsch-Paare.

## Vokabeln erweitern

In **`data.js`** kannst du eigene Wörter ergänzen:

```js
add('food', [
  ['mansikka', 'Erdbeere'],   // schon vorhanden
  ['karpalo', 'Preiselbeere'], // neu
]);
```

Neues Kategorie-Icon in `CATEGORIES` eintragen und das Wort mit `add('<kategorie-id>', …)` hinzufügen.

## Dateien

```
├── index.html   – Einstiegspunkt (diese Datei öffnen)
├── style.css    – komplettes Design
├── data.js      – Vokabeln, Kategorien, Fun-Facts
├── app.js       – Spiellogik (Quiz, Tippen, Karten, Blitz, XP, Speicher)
└── README.md    – diese Anleitung
```

Der Fortschritt (XP, Level, Serie, bekannte Wörter, Blitz-Rekord) wird per `localStorage` im Browser gespeichert.
