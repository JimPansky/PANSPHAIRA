# PAN516: freigegebene Bestellung und Verbindlichkeitsbasis

## Gebundener Umfang

P02 ergänzt den vorhandenen Beschaffung-/Wareneingang-/ERV-Pfad. Führender Store bleibt die bereits qualifizierte `PAN472_TARGET_SQLITE` mit dem bestehenden PAN473-Owner; `pan516_binding`, `pan516_events` und `pan516_target_orders` sind additive Tabellen in derselben Datei, keine neue Datenbank oder ERP-Plattform.

Bestellvorschlag, lokale synthetische Freigabe, lokale Übermittlung und Bestätigungsrevision sind getrennte Fakten. Das Codewort `LOCAL_SYNTHETIC_OWNER` ist kein menschlicher Freigabenachweis oder produktives Recht. Der konkrete externe Bestellkanal, dessen Rechte und Readback bleiben nicht ausgewählt. Die nachfolgende technische Ausführung wartet darauf nicht und behauptet keine externe Übermittlung.

## Ausführbarer bestehender Einstieg

Nach Installation der gelockten Abhängigkeiten und `npm run build`:

```sh
npm run pan516:test
node scripts/run-pan515-trade-state.mjs prepare --root "$OWNED_NATIVE_ROOT" --owner LOCAL_SYNTHETIC_OWNER --case COMMON-TRADE-01
node src/procurement-434/rechnungsabgleich-path-cli.mjs native init --root "$OWNED_NATIVE_ROOT"
node src/procurement-434/rechnungsabgleich-path-cli.mjs native apply --root "$OWNED_NATIVE_ROOT" --command "$OWNED_COMMAND_FILE"
node src/procurement-434/rechnungsabgleich-path-cli.mjs native read --root "$OWNED_NATIVE_ROOT"
node src/procurement-434/rechnungsabgleich-path-cli.mjs native liability --root "$OWNED_NATIVE_ROOT" --invoice AP-01 --confirmation-revision 1
```

`OWNED_NATIVE_ROOT` ist ein neuer `pan472-owned-v1`-Unterordner eines eigenen temporären Testverzeichnisses. `prepare` führt den unveränderten nativen Snapshot/Cutover aus; `native init` adoptiert keinen fremden oder produktiven Store und keine vorhandene P02-Historie. `apply` verlangt eine reguläre, höchstens 64 KiB große JSON-Datei, keine Symlinks oder FIFO. Unbekannte Optionen, ungültige Revisionen, gefälschte Grants, fremde zusammengesetzte IDs und unzulässige Historienmutation werden abgewiesen. Eine technische JSON-Ausgabe ist weder Human-Form noch produktiver Posting-/Zahlungsnachweis.

Jeder Befehl hat `schemaVersion=pansphaira.pan516/procurement-command/v1`, Effekt-ID, davon getrennte Transport-ID, erwartete native Revision, Bestell-/Positions-/Lieferanten-ID und stabilen synthetischen Quellbezug. Die genauen ausführbaren Eingaben und Abfolgen stehen in `tests/procurement-434/procurement-lifecycle.test.mjs`.

## Originalkriterien

- AC1: Zehn Stück aus der unveränderten `COMMON-TRADE-01`-Bestellung, tatsächliche Teilzugänge acht und zwei, genau zehn angenommene Stück und Restmengenhistorie `10 → 2 → 0`. Die vorhandenen Beschaffungs-/Receipt-Verträge berechnen Mengen und Denials.
- AC2: Bestätigung enthält Revision, Vorgängerdigest, Preis, Währung, Einheit, zugesagten Termin und Bestätigungszeitpunkt. Neue Bestätigungen hängen an, überschreiben weder die ursprüngliche Freigabe noch frühere Zusagen. Nach angenommenen Zugängen ist ein rückwirkender Währungs-/Einheitenwechsel verweigert. Veränderte Bestätigungsbedingungen ersetzen nicht die ursprüngliche Freigabe; externe Bestätigungsautorität wird nicht behauptet.
- AC3: Codegebundene Originalrechnung `AP-01` hat 62.000 Minor gegenüber bestätigten 60.000 Minor, also 2.000 Minor Abweichung. Der unveränderte echte ERV-Kern entscheidet unter `STRICT_ZERO_V1` `CONFLICT`; die Basis bleibt ungeklärt mit Quellbezug. Zwei explizit getrennte synthetische Eingabefälle ergänzen eine passende Vollrechnung und eine passende Fünf-Stück-Teilrechnung. Die Vollrechnung ergibt nur `RELEASED_LOCAL_SYNTHETIC`, die Teilrechnung bleibt `UNRESOLVED_PARTIAL_INVOICE`. Niemals automatischer Zahlungsauftrag, produktive Buchung oder Postingautorität.
- AC4: Ein realer Client wird nach dem lokalen nativen Übermittlungscommit per `SIGKILL` beendet, bevor er einen Beleg ausgeben kann. Retry liest den exakten gespeicherten Zielauftrag vor jedem neuen Bestelleffekt. Gleicher fachlicher Auftrag bleibt auch mit neuer Transport-/Effekt-ID ohne Duplikat. Ein beschädigter oder unklarer Zielzustand ist kein Anlass für blindes Redispatch. `LOCAL_TARGET_PERSISTED_EXTERNAL_UNPROVEN` ist ausdrücklich kein externer Kanalbeleg.

Alle fünf ursprünglichen Negativen laufen gegen echte native Tabellen: gleiche Positionsnummer in fremder Bestellung, falscher Lieferant, doppelter Receipt, Teilrechnungs-Join-Vervielfachung und Überlieferung ohne explizite separat gebundene Toleranz. Keine Toleranz wird aus caller-Metadaten abgeleitet. Receipts werden zuerst im gebundenen Ledger aggregiert; die einzelne Rechnungsposition wird dann einmal vom vorhandenen ERV-Kern ausgewertet, nicht mit jedem Receipt multipliziert.

## Wiederverwendung und Liefergrenzen

Die historische Zwei-Stück-Regression von Procurement434, der eingefrorene AP04-Fallpack, der ERV-Matcher, seine Varianten/Toleranzen und die gemeinsame Referenz bleiben unverändert. Die zusätzliche synthetische Teil-/Vollrechnung ist weder die ursprüngliche Rechnung noch ein zweiter genehmigter Kontext, Holdout oder private Quellfreigabe. Codeeigene Abbildung verbindet `PO-01/1` mit `bestellung:pan516-common/position:common-01` und dem lokalen synthetischen Lieferanten; sie ist kein Beleg für beliebige Mandanten oder externe Parteien.

Unveränderliche SQL-Guards erhalten Binding, Events und Zielauftrag. Vorhandene STOP-/Revoke-Fences und der bestehende Ownerlease gelten weiter. Fehlgeschlagene Übergänge rollen nur die eigene Transaktion zurück; keine rückwirkende Löschung, keine automatische finanzielle Rückbuchung und keine Entfernung fremder Ressourcen. Die letzte qualifizierte Generation bleibt erhalten.

Ein kuratierter technischer Entwicklungsbericht unter `verification/pan516-native-procurement-evidence-v1.json` enthält tatsächlich ausgeführte CLI-Fakten und Quelldigests, keine rohen Runtime-, Grant-, Schlüssel- oder Reviewerzustände. `finalAcceptance=false` und `closureEligible=false` kennzeichnen diesen Bericht als Entwicklungsevidenz; unabhängige Originalkriterienabnahme, exaktes CI, Merge, neuer Release und anonymer exakter Archivconsumer sind getrennte Liefergates. Distribution ist `SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE`, keine Turnkey-Produkt- oder Produktionsfreigabe. PAN→KS-P06-Pairing und Providerprofil-PAN524 bleiben eigene spätere Aufgaben; keine zweite PAN-WIP oder gegenseitige CLOSED-Wartebedingung.
