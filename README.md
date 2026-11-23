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
3. Im Hosting `EVIDENCE_DATABASE_URL`, `EVIDENCE_DATABASE_AUTH_TOKEN` und einen zufälligen `EVIDENCE_SETUP_TOKEN` setzen. URL und Token müssen zur selben dauerhaften Datenbank gehören. Wenn `EVIDENCE_DATABASE_URL` gesetzt ist, wird ausschließlich `EVIDENCE_DATABASE_AUTH_TOKEN` verwendet; ein anderer Integrationstoken wird nicht als Ersatz genutzt. Ohne diese explizite URL bleibt das bisherige Paar `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` unterstützt. `APP_ORIGIN` beim Einrichten der festen Produktionsdomain auf diese setzen. Die App ist für die Domainwurzel vorgesehen. Die lokale SQLite-Datei ist auf Vercel gesperrt.
4. Deployen bzw. nach Variablenänderungen neu deployen. Das erste Konto nur bei einer tatsächlich neuen Datenbank anlegen. Wenn eine bestehende Installation unerwartet die Einrichtung zeigt, zuerst die Verbindung prüfen. Für Preview- und Produktionsdeployments getrennte Datenbanken und Schlüssel verwenden.
5. Nach zwei Deployments müssen die Runtime-Logs denselben `databaseFingerprint` und dieselbe `storageIdentity.identity` zeigen. Diese Diagnose enthält keine Zugangsdaten oder Dokumentinhalte. Anschließend mit einem vorhandenen Konto anmelden und ein zuvor gespeichertes Dokument öffnen. Die Tabelle `evidence_storage_identity` enthält nur eine technische Kennung; bestehende Daten werden beim Start nicht gelöscht.

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

## Sichtbarer Prüfverlauf und Punkteschwelle

Jede neue Anfrage speichert ihren Prüfverlauf zusammen mit der Antwort. Im Chat
stehen die ausgeführten Schritte, die verwendete Schwelle, alle Einzelbewertungen,
ausgeschlossene Fundstellen und offene Nachweise. Während der Anfrage wird ein
Verarbeitungshinweis angezeigt; die tatsächlichen Schritte erscheinen nach Abschluss.
Alte Antworten behalten ihren bisherigen Inhalt und erhalten keinen nachträglich
erfundenen Prüfverlauf. Über „Erneut prüfen“ entsteht eine neue Bewertung.

Die Punkteschwelle kann vor jeder Anfrage im Chat von 0 bis 100 eingestellt werden.
Sie ändert keine bereits gespeicherte Bewertung. Optional setzt die serverseitige
Umgebungsvariable `EVIDENCE_SOURCE_THRESHOLD` den Standardwert (sonst 70).
Codepunkte bewerten Suchbezug (40), angegebenen Herausgeber (20), angegebenen
Prüfstatus (20), auffindbare Fundstelle (10) und verfügbaren Originaltext (10).
Sie sind keine Wahrheitswahrscheinlichkeit oder fachliche Freigabe. Importangaben
werden nicht unabhängig auf Echtheit geprüft.

Alle Absätze einer Quelle mit Worttreffern bleiben im KI-Kontext. Unterhalb der
Schwelle werden sie als mögliche Gegenbelege oder Kontext gekennzeichnet und müssen
von KI 2 einzeln bewertet werden. Die Ausnahme setzt den Codewert nicht herauf.
Auch regulär ausgewählte Fundstellen müssen auf Widersprüche geprüft werden.
Quellen ohne Suchbezug erscheinen mit Ausschlussgrund. Die wortbasierte Suche kann
sinngemäß relevante Quellen ohne Worttreffer übersehen; Fragen und Quellenbestand
müssen bei Bedarf ergänzt werden. Bei mehr als 200 relevanten Fundstellen oder
90.000 Zeichen wird die KI-Auswertung angehalten, statt Gegenbelege stillschweigend
abzuschneiden. Der Quellenverlauf bleibt sichtbar.

KI 1 erstellt einen belegten Antwortentwurf; Zitate werden zusätzlich per Code
gegen den Originaltext geprüft. KI 2 erhält die zugelassenen Fundstellen und den
Entwurf in einer separaten Modellabfrage, auch bei offenen Nachweisen. Fehlende
Prüfurteile, Ausfälle, Widersprüche und ungeklärte Gegenbelege führen zu keiner
positiven KI-Bewertung. Das ist eine Prüfung in zwei Modellaufrufen und keine
Garantie unabhängiger Fehler. Für Ollama kann optional `OLLAMA_MODEL_PRUEFER` ein
anderes Prüfmodell wählen; andernfalls wird `OLLAMA_MODEL` in beiden Aufrufen
verwendet. Für OpenAI gilt weiterhin `OPENAI_MODEL_PRUEFER`.

Wichtige Quellen im Auswertungskontext lösen weiterhin eine unabhängige menschliche
Fachprüfung aus, auch bei niedrigen Punkten, ausgelassenen Zitaten oder KI-Ausfällen.
Ausgeschlossene Quellen lösen allein keine Fachprüfung aus. Der ganze gespeicherte
Prüfverlauf unterliegt der bestehenden Zugriffskontrolle; wird eine darin enthaltene
Quelle entzogen, wird auch der Verlauf zurückgehalten.

### Geänderte Dateien ersetzen

Das Ergänzungs-ZIP enthält Pfade relativ zum Projektverzeichnis, in dem
`package.json` liegt: beispielsweise `server/evaluate.js`, `client/Workspace.jsx`
und `public/app.js`. Dort entpacken und vorhandene Dateien ersetzen. Das Frontend
in `public/app.js` ist bereits neu gebaut. Datenbank und bestehende
Umgebungsvariablen bleiben erhalten; es ist keine Datenbankmigration erforderlich.
Beim Selfhosting den Node-Prozess neu starten, bei Vercel das geänderte Projekt
neu deployen. Ein bloßer Austausch im Browser aktiviert keinen neuen Servercode.

Prüfung: `npm test`. Die Tests verwenden simulierte Modellantworten und prüfen
unter anderem Schwellen, Gegenbelege, fehlende Prüfurteile, Kontextgrenzen,
Zugriffswiderruf und die unabhängige menschliche Fachprüfung.
