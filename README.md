# Evidence – Hosting und erster Start

Eigenständige deutschsprachige Web-App für das TUHH-Hochschulprojekt zum ING-Anwendungsfall. Der Arbeitsbereich startet leer. Mitarbeitende stellen eigene Fragen zu den Dokumenten, für die sie Leserechte haben.

## Wo kann ich sie hosten?

| Hosting | Start |
|---|---|
| Node.js 24 mit persistentem Speicher (z. B. VPS, Container, Node-Webhosting) | Anleitung A. SQLite wird beim ersten Start angelegt. |
| Vercel mit externer libSQL-Datenbank | Anleitung B. Die ZIP enthält die Serverless-Funktion und die Vercel-Konfiguration. |
| Webspace nur für statische Dateien oder ausschließlich PHP | Für diese Ausgabe wird ein Node.js-Backend benötigt. |

Das fertige Frontend liegt in `public/`. Die gesamte Projektstruktur einschließlich `server/` und `api/` hochladen. Nur `public/` darf vom Webserver direkt als Dateien ausgeliefert werden. Frontend-Code, serverseitiger Code, Datenbankschema, gebündelter PDF-Reader und Tests liegen bei. Für den Betrieb ist keine npm-Installation erforderlich.

## A. Node.js-Hosting

1. Archiv entpacken und in den Ordner mit `package.json` wechseln. Node.js 24 verwenden.
2. `.env.example` nach `.env` kopieren oder die Variablen im Hosting-Dashboard setzen.
3. Einen zufälligen Setup-Code generieren, zum Beispiel mit `openssl rand -hex 32`. Den Code privat als `EVIDENCE_SETUP_TOKEN` setzen. Die Einrichtung benötigt mindestens 24 Zeichen.
4. Für den Betrieb im Internet `APP_ORIGIN` auf den exakten Ursprung setzen, z. B. `https://evidence.example.org` (ohne Unterpfad). HTTPS im Hosting aktivieren. `DATA_DIR` auf ein beschreibbares, dauerhaftes Verzeichnis außerhalb von `public/` setzen. Lokal verwendet Evidence `./data` und Port 3000.
5. `npm start` ausführen, lokal `http://localhost:3000` oder die Hosting-Adresse öffnen. Den Setup-Code, Namen, E-Mail und ein neues Passwort mit mindestens 12 Zeichen eingeben. Es gibt keine voreingestellten Passwörter. Sobald das erste Konto angelegt ist, ist die Einrichtung gesperrt. Anschließend kann der Setup-Code vom Hosting entfernt werden.
6. Über **Konten → Konto anlegen** getrennte Konten für Dokumentverantwortliche, Mitarbeitende und Fachprüfung erstellen. Passwörter über einen geeigneten privaten Kanal übergeben.

Docker ist ebenfalls möglich. `docker build -t evidence .`, anschließend beispielsweise `docker run --env-file .env -p 3000:3000 -v evidence-data:/app/data evidence`. Im Container /app/data bzw. ./data verwenden. Für den Betrieb eine HTTPS-Domain vorschalten. SQLite-Datei samt WAL konsistent sichern, etwa bei angehaltenem Prozess. Bei Container-Neustarts das Volume beibehalten.

## B. Vercel

1. Eine persistente libSQL-Datenbank (z. B. Turso) erstellen. URL und ein auf diese Datenbank beschränktes Schreib-/Lesetoken bereithalten.
2. Entpackte Projektdateien ohne `.env` oder lokale Datenbank in ein eigenes privates Git-Repository legen und dieses in Vercel importieren. Alternativ aus dem Projektordner mit der Vercel-CLI bereitstellen. Root Directory ist der Ordner mit `vercel.json`. Node.js 24.x, Framework „Other“. Die mitgelieferte Konfiguration veröffentlicht `public/` und `api/workspace.js`.
3. Im Hosting `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` und einen zufälligen `EVIDENCE_SETUP_TOKEN` setzen. `APP_ORIGIN` beim Einrichten der festen Produktionsdomain auf diese setzen. Die App ist für die Domainwurzel vorgesehen. Die lokale SQLite-Datei ist auf Vercel gesperrt.
4. Deployen bzw. nach Variablenänderungen neu deployen und das erste Konto wie in A anlegen. Für Preview- und Produktionsdeployments getrennte Datenbanken und Schlüssel verwenden.

## Fragen, KI und Punkte

**Ohne API-Schlüssel** funktioniert die lokale Stichwortsuche. Sie zeigt wörtliche Originalstellen aus zugänglichen Dokumenten. Der aufklappbare Quellennachweis bewertet vier nachvollziehbare Merkmale: Fundstelle, Wortlaut, angegebener Herausgeber und dokumentierter Prüfstatus. Dieser Wert misst die Quellenangaben; er ist keine fachliche Bewertung der Antwort. Fehlende Nachweise können angefragt werden.

**Mit KI** den eigenen `OPENAI_API_KEY` als geheime Hosting-Variable konfigurieren. `OPENAI_MODEL` und `OPENAI_MODEL_PRUEFER` können auf für das eigene API-Projekt verfügbare Chat-Completions-Modelle mit JSON-Ausgabe gesetzt werden. Beide Rollen können denselben Schlüssel nutzen. Im KI-Modus werden die Frage, der relevante Verlauf und ausgewählte lesbare Dokumentabschnitte an den konfigurierten OpenAI-Dienst übermittelt. Für das Hochschulprojekt fiktive oder dafür freigegebene Texte verwenden.

**Mit einem lokalen Modell** lässt sich die Schlussfolgerung auch ohne OpenAI-Schlüssel nutzen. Auf dem Rechner mit Ollama beispielsweise `ollama pull qwen2.5:7b` ausführen. In der Serverdatei `.env` den Eintrag `OLLAMA_MODEL=qwen2.5:7b` setzen. Evidence erwartet den laufenden Dienst unter `http://127.0.0.1:11434`. Läuft Evidence in einem Container oder auf einem anderen Server, muss `OLLAMA_URL` auf eine von dort erreichbare Ollama-Instanz zeigen. Ein gesetzter Ollama-Modellname hat Vorrang. Beide Modellabfragen gehen dann an diesen Dienst.

Nach Änderungen der Modellkonfiguration den Server neu starten bzw. auf Vercel erneut bereitstellen. Eine neue Frage stellen oder bei einem früheren Suchtreffer „Mit KI beantworten“ wählen.

Der Chat zeigt zuerst die **Schlussfolgerung**, danach die **Begründung** und die aufklappbaren **Belege**. Wenn Angaben fehlen, nennt er den offenen Punkt und gegebenenfalls ein belegbares Teilergebnis. Meldet die zweite Modellprüfung einen materiellen Widerspruch, zeigt der Chat den Klärungsbedarf an. Der Server sucht angeführte Zitate wörtlich im Original. Eine zweite Modellabfrage beurteilt bis zu 20 Kriterien in fünf Bereichen. Der Server prüft das Format, ergänzt überprüfbare Quellenmerkmale und berechnet den Anteil der erreichten Punkte an allen anwendbaren Kriterien. Bei fehlendem zwingendem Nachweis erscheint kein abschließender KI-Score. Die Modellprüfung ist eine Einschätzung. Die Dokumentwichtigkeit und der menschliche Prüfstatus werden auf dem Server festgelegt.

## Zuständigkeiten

| Rolle | Rechte |
|---|---|
| Mitarbeitende | Zugängliche Quellen lesen, Fragen stellen und Nachweise anfragen. |
| Dokumentverantwortliche | Zusätzlich PDF mit Textebene, TXT, MD oder CSV importieren bzw. Text einfügen, Wichtigkeit festlegen/ändern, eigene Dokumente bzw. wörtliche Auszüge befristet freigeben und widerrufen. |
| Fachprüfung | Fachlich bestätigen oder ablehnen; dafür sind Leserechte auf die verwendeten Quellen und bei Auszügen ein passender Umfang erforderlich. |
| Administration | Konten einrichten, eigene Dokumente verwalten und zulässige Fachprüfungen vornehmen. Der Zugriff auf fremde private Quellen bleibt an eine Freigabe gebunden. |

Die Leseberechtigung ist von der Wichtigkeit unabhängig. Beim Import sind Dokumente zunächst privat. „Für alle Nutzer dieser Website freigeben“ macht sie im gesamten Arbeitsbereich lesbar. Der Server speichert den extrahierten Text bis 200.000 Zeichen; Originaldateien und Scans ohne Textebene werden nicht archiviert. Die Freigabe-Anfragen laufen im integrierten Postfach. Es werden keine E-Mails verschickt.

## Pflichtprüfung bei wichtigen Quellen

1. Die dokumentverantwortliche Person setzt beim Upload **Wichtig · fachliche Prüfung erforderlich**. Die Einstufung lässt sich später in „Dokumente“ ändern.
2. Jede Antwort mit Belegen, die eine wichtige Quelle im verwendeten Auswertungskontext hatte, erhält **Gelb · Fachprüfung erforderlich**. Das gilt auch bei 100 Punkten oder wenn das Modell die wichtige Quelle im Fazit nicht zitiert. Um indirekte Ableitungen abzudecken, prüft Evidence die ganze Antwort. Auch wörtliche Treffer aus wichtigen Quellen werden entsprechend gekennzeichnet.
3. „Fachprüfung“ zeigt offenen Prüferinnen und Prüfern nur Antworten anderer Personen, deren Belege sie lesen dürfen. Belege öffnen, Entscheidung „Bestätigen“ oder „Ablehnen“ wählen und begründen. Ohne passende Fachprüferkonten oder Leserechte bleibt der Eintrag offen.
4. Eine bestätigte Antwort zeigt den Prüfnamen und die Begründung. Eine Ablehnung wird rot markiert. Der ursprüngliche Punktwert bleibt nachvollziehbar. Eine nachträgliche Hochstufung wirkt auf bereits gespeicherte Antworten. Ein beim Erstellen gesetzter Wichtigkeitsvermerk bleibt erhalten. Die Entscheidung ist an die Dokumentrevisionen gebunden.
5. Bei abgelaufenen oder widerrufenen Leserechten blendet die App den betroffenen gespeicherten Antworttext samt Zitaten bei der nächsten Serverabfrage aus. Bereits gesehene oder kopierte Inhalte lassen sich nicht zurückholen.

## Funktionsprüfung mit eigenen Konten

- Als Dokumentverantwortlicher einen fiktiven Text über 500 Geräte mit Einstufung „Wichtig“ hochladen und für den Arbeitsbereich teilen.
- Als Mitarbeiter nach der Gerätezahl fragen. Originalstelle und Punkte öffnen. Die Antwort muss als gelb/prüfpflichtig erscheinen.
- Als Fachprüfer die Belege öffnen und eine begründete Entscheidung speichern. Im Chat bzw. Prüfverlauf des Mitarbeiters erscheint diese nach Aktualisierung. Selbstfreigaben werden serverseitig abgewiesen.
- Separat ein privates Dokument verwenden. Vor der Freigabe bleibt es dem Mitarbeiter verborgen. Einen wörtlichen Auszug befristet freigeben, anschließend widerrufen und den Verlauf aktualisieren.

`npm test` startet die automatisierten Prüfungen mit einer temporären SQLite-Datenbank. Die Tests brauchen weder Netzwerk noch API-Schlüssel. Ein Test verwendet simulierte Modellantworten, um die Regel auch bei nicht zitierten wichtigen Quellen zu prüfen.

## Änderungen am Frontend

Im Ordner `client/` stehen die bearbeitbaren React-Komponenten. Nach Änderungen `npm install` und `npm run build:client` ausführen. Die fertigen JS-, CSS- und PDF-Lesedateien sind bereits enthalten. `server/` enthält Sitzungen, Datenbankadapter, Rechte, Prüfung und Quellenanalyse. `public/style.css` enthält das Erscheinungsbild. Das ING-Logo wird über die öffentliche ING-Logodatei geladen; ist sie nicht verfügbar, erscheint ein Schriftzug. Für eine rein lokal ausgelieferte Marke eine für das Projekt freigegebene Originaldatei nach `public/` legen und den Bildpfad in der Komponente Brand anpassen.

Diese Ausgabe ist ein eigenständiger Hochschulprototyp mit lokaler Kontoverwaltung. Ein bankinterner Produktivbetrieb mit SSO, revisionssicherem Audit und entsprechender Infrastruktur wäre ein eigenes Integrationsprojekt.
