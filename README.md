# Evidence – nachvollziehbare KI-Antworten

Hochschulprojekt (TUHH, „Ethics and Technology“) zum Use Case von ING Deutschland in der Digital Future Challenge.
Keine offizielle ING-Anwendung.

## Was ist was?

| Ordner / Datei | Inhalt |
|---|---|
| `public/index.html`, `app.js`, `style.css` | die Anwendung (Oberfläche) |
| `public/erklaerung.html` | geführte Erklärung mit 9 Szenarien („So funktioniert’s“) |
| `api/analyze.js` | der Harness: Rechteprüfung → KI 1 → Code-Check → KI 2 → Ampel |
| `api/seal.js` | Siegel für das Protokoll (verkettete HMAC-SHA256-Siegel) |
| `api/status.js` | meldet, ob ein API-Schlüssel hinterlegt ist |
| `lib/regeln.js` | **feste Regeln der Bank**: Rechte, Pflichtprüf-Katalog, Ampel |
| `lib/checks.js`, `lib/text.js` | Code-Check: Zitate wiederfinden, Zahlen prüfen, nachrechnen |
| `lib/prompts.js` | Aufgabenbeschreibung für KI 1 (Assistent) und KI 2 (Prüfer) |
| `lib/openai.js` | Anbindung ans KI-Modell (austauschbar) |
| `lib/demo.js` | vorbereitete Antwort für den Demo-Modus ohne Schlüssel |
| `test/run.js` | Selbsttest ohne Internet |
| `dev-server.js` | lokaler Testserver |

Es gibt keine Abhängigkeiten und keinen Build-Schritt. `npm install` ist nicht nötig.

## Auf Vercel hochladen

1. Den ganzen Ordner in ein GitHub-Repository legen (die Datei `.env` niemals mit hochladen).
2. In Vercel: **Add New → Project → Repository auswählen → Deploy**. Framework: „Other“, alle Einstellungen leer lassen.
   Alternativ im Ordner: `npx vercel` und danach `npx vercel --prod`.
3. Die Seite läuft sofort im **Demo-Modus** (Beispieldokumente, vorbereitete KI-Antwort).

## API-Schlüssel einbauen (später)

In Vercel unter **Settings → Environment Variables** eintragen und danach neu deployen (**Deployments → Redeploy**):

| Name | Pflicht | Bedeutung |
|---|---|---|
| `OPENAI_API_KEY` | ja | euer OpenAI-Schlüssel |
| `OPENAI_MODEL` | nein | Modell für KI 1, Standard `gpt-5.4-mini` |
| `OPENAI_MODEL_PRUEFER` | nein | Modell für KI 2 (am besten ein anderes als KI 1) |
| `APP_PASSWORT` | empfohlen | Passwort für die Seite, schützt euer API-Guthaben |
| `LOG_SECRET` | empfohlen | geheimer Schlüssel für die Protokoll-Siegel |
| `MAX_ZEICHEN` | nein | wie viel Dokumenttext pro Anfrage an die KI geht (Standard 48000) |

Den Schlüssel **nie** in den Code oder in den Chat schreiben. Oben rechts zeigt die Seite dann „KI aktiv“.

## Lokal ausprobieren

```
node dev-server.js      # dann http://localhost:3000 öffnen
node test/run.js        # Selbsttest
```
Für echte KI-Antworten lokal: `.env.example` nach `.env` kopieren und den Schlüssel eintragen.
Die Seite funktioniert nicht, wenn man `index.html` nur per Doppelklick öffnet (das Backend fehlt dann).

## Grenzen dieses Prototyps (ehrlich für die Präsentation)

- **Anmeldung simuliert:** Die Person wird oben rechts gewählt. Es gibt keine echten Benutzerkonten.
- **Daten im Browser:** Dokumente, Antworten und Protokoll liegen im Browser-Speicher, nicht in einer Datenbank.
  Die Rechteprüfung läuft im Backend-Code, die Daten dafür kommen aber vom Browser. In der Zielarchitektur liegt alles serverseitig in der Bank.
- **Keine lokale Verarbeitung:** Mit Schlüssel gehen Texte an OpenAI. Nur fiktive oder öffentliche Dokumente verwenden.
  In der Zielarchitektur laufen die Modelle innerhalb der Bank (`OPENAI_BASE_URL` zeigt, dass der Anbieter austauschbar ist).
- **KI 1 ist kein freier Agent:** Die Suche nach passenden Abschnitten macht das Programm (Stichwortsuche), nicht die KI über Werkzeuge.
- **Gescannte PDFs** (Bilder ohne Text) werden nicht gelesen. Tabellen in PDFs können beim Auslesen durcheinander geraten.
- **Protokoll:** Die Siegel berechnet der Server. Wer den Server-Schlüssel kennt, könnte die Kette neu berechnen. Deshalb gibt es „Belegpaket speichern“ (Kettenstand extern sichern).
- **Zwei KIs können sich gleich irren.** Dagegen stehen Stichproben auf Grün und der Pflichtprüf-Katalog.
