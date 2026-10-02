# ERV: Benutzerworkflow, Szenarien und gemessenes PoC-Verhalten

## Ergebnis und Lesereihenfolge

Dieses Paket verbindet öffentlich recherchierte Benutzerarbeit mit tatsächlich ausgeführten, synthetischen Prüfungen der vorhandenen PANSPHAIRA-Eingangsrechnungsverarbeitung. Es ist kein neues Rechnungsfreigabeprogramm und keine Produktionsfreigabe.

1. `workflow-research.de.md`: herstellergebundene Recherche mit 18 Primärquellen, 12 Workflowstufen, 20 Feldgruppen und 7 Aufgabenrollen.
2. `workflow-field-role-matrix.json`, `workflow-matrix.csv`, `field-matrix.csv`: welche Rolle in welchem Schritt welche Daten prüfen, ergänzen oder entscheiden soll; gesetzliche Angaben, konkrete Systempflichten und Unternehmensregeln sind getrennt.
3. `scenario-catalog.json`: 12 Untersuchungsszenarien in vier ausdrücklich fiktiven Größenkontexten. Mitarbeiterzahlen steuern keinen Produktalgorithmus.
4. `native-evidence-v5/`: 23 tatsächlich ausgeführte Aufrufe bestehender Produktfunktionen samt vollständigen Ergebnissen und einem Index. Die Aufrufe prüfen Teilfunktionen und Grenzen. **Keines der zwölf vollständigen menschlichen Benutzerverfahren ist dadurch nachgewiesen.**
5. `native-adjudication-v5.json`: gesonderte Prüfung der gespeicherten Ergebnisse, Herkunftsbindungen und unabhängigen Betragsrechnungen.

## Sollprozess für die Beispiele

Die fachliche Grundfreigabe liegt bei den zuständigen Kostenstellenverantwortlichen. Leistungsbestätigung, optionale Projektmitprüfung, zusätzliche Betragsfreigabe und Zahlungsautorisierung sind unterschiedliche Aufgaben. Bei Verteilungen wird die Zustimmung aller betroffenen Zuständigen ausdrücklich verlangt; mehrere ausgewählte Personen bedeuten nicht automatisch eine UND-Regel. Dies ist eine festgelegte Beispielspezifikation, kein behaupteter universeller Herstellerstandard. Die produktspezifischen Belege und Unterschiede stehen in der Recherche.

Kopf- und Positionskontierung werden getrennt. Kostenstelle, Kostenträger, Projekt, Projektaufgabe sowie Bestell- und Wareneingangsbezug sind nicht austauschbar. Bei Vorbelegungen sollen Benutzer vorhandene Werte prüfen und bei Bedarf nachvollziehbar korrigieren, nicht dieselben Angaben grundlos erneut eintippen. Offene Rückfragen oder abgelehnte Rechnungen gelten nicht als freigegeben.

## Was am vorhandenen PoC tatsächlich ausgeführt wurde

Quelle ist der unveränderte veröffentlichte Stand `2026_10_02_v5`, Commit `b79686d1656aec89c8b8ad0bdb84e478ac5c856a`. Die genauen Modul-/Profilbindungen stehen in `native-evidence-v5/native-observations.json`.

- **Prüfen ohne Bestellbezug:** `native-lean.json` ergibt `MATCHED` im ausdrücklich auf Rechnungsvalidierung begrenzten Modus. Seine `NOT_REQUIRED`-Freigabe ist gerade **nicht** die gewünschte fachliche Kostenstellenfreigabe.
- **Bestellung, Rechnung und Wareneingang:** Abgleich, fehlender Wareneingang, Mengen- und Währungskonflikte wurden über `runOriginalErvVariantV1` ausgeführt. Fehlende oder widersprüchliche Daten blockieren die Entscheidung.
- **Toleranz:** Die bestehenden 200-Basispunkte-Fälle akzeptieren die Grenze und weisen einen Cent darüber als Konflikt aus. Das beweist diese Referenzbetragsregel, keine beliebige ERP-Positionspreisprüfung.
- **Zusätzliche Betragsfreigabe:** Die vorhandene Regel verlangt sie strikt über 10.000 EUR beobachtetem Bruttorechnungsbetrag; darunter und genau an der Grenze nicht. Das ist kein Branchenstandard und ersetzt nicht die gewünschte fachliche Grundfreigabe.
- **Freigaben:** Die zugelassenen vordefinierten Testakteure erzeugen nur `APPROVED_LOCAL_EVIDENCE_ONLY`. Ein frei benannter Kostenstellenverantwortlicher sowie Selbstfreigabe werden zurückgewiesen. Eine real angemeldete Person oder Kostenstellen-Zuständigkeitsverwaltung wurde nicht simuliert.
- **Eingang und Dublette:** Derselbe Inhalt wurde im tatsächlich verwendeten In-Memory-Store angenommen, bei Wiederholung zurückgewiesen und über dessen vorhandenen Leser wiedergefunden. Das ist kein Neustartnachweis und keine dauerhafte operative Rechnungsdatenbank.
- **Grenzen:** Neue Kostenstellen-, Projekt-, Verteilungs- und Gesellschaftsfelder werden an den untersuchten versionierten Eingängen nicht angenommen. Rückfrageaktionen sind dort kein unterstützter Eingangsauftrag. Veränderte Belegbytes und ein produktiver Buchungsauftrag werden abgewiesen.

Diese Aussagen sind über die genannten JSON-Ergebnisse nachvollziehbar. Sie beschreiben den geprüften Einstieg und Stand, nicht eine erschöpfende Nichtvorhandenseinsprüfung des gesamten Repositorys.

## Noch fehlende Benutzerstrecke

Im untersuchten Pfad fehlen die bedienbare Freigabemaske, editierbare Kontierung mit Kostenstelle/Projekt, zuständigkeitsgebundene menschliche Freigabe, Verteilungs-/Vertretungsrouting sowie Rückfrage-, Ablehnungs- und erneute Freigabeschleifen nach Änderungen. Ein JSON-Screenbaum ist keine Browseroberfläche. Die Szenariendatei führt die jeweiligen Lücken einzeln; ein erfolgreicher Ablehnungstest wird nicht zu einer verfügbaren Geschäftsfunktion umetikettiert.

## Zwei getrennte Fallmengen und Betragsbasen

`research-design-examples.json` enthält **acht zusätzliche Prozessentwürfe**, keine weiteren ausgeführten PoC-Fälle. Ihre Beispielgrenze von 5.000 EUR netto ist bewusst frei gewählt. Der native Katalog verwendet die vorhandene Produktregel von 10.000 EUR brutto. Die beiden Fallmengen und Grenzen werden weder vermischt noch als zwanzig erfolgreiche Simulationen gezählt. Die 60/40-Verteilung im nativen Katalog ist eine unabhängig berechnete Sollverteilung von Brutto-Freigabevolumen, keine ausgeführte Netto-/Steuerkontierung.

## Wiederholung und Persistenzgrenze

Der Forschungsrunner ruft unveränderte Produktfunktionen auf, erzeugt keine Ersatzantworten und schreibt Ausgaben ausschließlich in ein neues Evidenzverzeichnis. Für diese historische Wiederholung ist ein qualifizierter Quellbaum des oben genannten Standes mit passenden vorhandenen Abhängigkeiten und ausgeführtem Build erforderlich:

```sh
node probe-existing-poc.mjs /qualified/v5-source /new/evidence-directory scenario-catalog.json
```

Das Verzeichnis muss neu sein; bestehende Belege werden nicht überschrieben. Der Runner übernimmt den deklarierten Basisstand aus dem Katalog. Deshalb muss der Aufrufer die echte Quellidentität separat prüfen; die Angabe im Ergebnis allein authentifiziert sie nicht. Wiederholungen auf Nachfolgeständen benötigen eine neue nachvollziehbare Quellbindung, statt historische Ergebnisse umzubenennen.

Die JSON-Dateien persistieren den **Ausführungsbeleg**, nicht operative Benutzeraufgaben. Aufnahme in die normale Produktstruktur, kanonische Tests, unabhängiger Review und veröffentlichter Readback sind eigene Lieferstufen. Dieses vorbereitete Paket allein behauptet diese Stufen nicht.

Keine Kundendaten, keine produktive Buchung oder Zahlung, kein rechtliches oder steuerliches Zertifikat. Vollständige fremde Dokumentation ist nicht enthalten; kurze Belegstellen und Originalquellen sind in `research-sources.json` verzeichnet.
