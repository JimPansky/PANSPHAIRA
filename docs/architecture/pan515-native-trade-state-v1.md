# PAN515: führender nativer Handelszustand

## Gebundener Umfang und Einstieg

P01 ergänzt ausschließlich den bereits qualifizierten PAN472-Zielstore mit dem vorhandenen PAN473-Schreib-/Ownerpfad. Führender Speicher bleibt `PAN472_TARGET_SQLITE`; die drei additiven Tabellen `pan515_binding`, `pan515_events` und `pan515_control` liegen in dieser vorhandenen SQLite-Datei. Keine neue Datenbank, kein Provider-Stub, keine ERP-Ablösung. Objekt-/Einheitenowner, Zielgeneration/-epoch, Mengenrevision und native Quellidentitäten sind im unveränderlichen Binding erklärt. Die Qualifikation betrifft nur den lokalen, synthetischen, ausdrücklich gebundenen Umfang.

Nach Installation der gelockten Abhängigkeiten mit der im Repository deklarierten Node-/npm-Version:

```sh
npm run build
npm run pan515:test
node scripts/run-pan515-trade-state.mjs prepare --root "$OWNED_NATIVE_ROOT" --owner LOCAL_SYNTHETIC_OWNER --case COMMON-TRADE-01
node scripts/run-pan515-trade-state.mjs apply-common --root "$OWNED_NATIVE_ROOT" --owner LOCAL_SYNTHETIC_OWNER
node scripts/run-pan515-trade-state.mjs read --root "$OWNED_NATIVE_ROOT" --as-of 2026-06-30T23:59:59+02:00
node scripts/run-pan515-trade-state.mjs read --root "$OWNED_NATIVE_ROOT" --as-of 2026-07-31T23:59:59+02:00
```

`OWNED_NATIVE_ROOT` ist ein neuer `pan472-owned-v1`-Unterordner eines eigenen temporären Testverzeichnisses. Vorhandene/fremde/native Produktivstores werden nicht adoptiert. `prepare` führt tatsächlich den bestehenden nativen Snapshot-/Cutoverpfad aus. `initialize` ergänzt alternativ einen bereits aktivierten, unabhängig diagnostizierten, exakt passenden synthetischen Scope. `write --input <regular-bounded-json-file>` autorisiert und verarbeitet einen einzelnen tatsächlichen Handelsbefehl. Bloße caller-gelieferte Rollen, kopierte JSON-Grants, andere Einheiten/Identitäten und ungeklärte Owner werden abgewiesen.

## Historische Regression ist nicht der gemeinsame Fall

`PAN515-LEGACY-DRAFT-06` behält sechs Stück, `SYN-ART-001` und `LAGER-01`. Dieser Test ist keine AC5-Abnahme. `COMMON-TRADE-01` benutzt unverändert die separat veröffentlichte Referenzrevision 1 aus `contracts/trade/common-trade-01-v1.json`: zehn Stück, `SO-01/1`, `ARTICLE-A`, `WH-01`, beide echten Receipt-Ereignisse, Reservierung, beide Versandereignisse und die quarantänisierte Rücknahme.

Die explizite `nativeIdentityMapping` bindet `synthetic:order-42`/`synthetic:line-1` an `SO-01`/`1`, die native Partneridentität sowie die native M3-Bestandsidentität `SYN-ART-001`/`LAGER-01` an den kanonischen Artikel-/Lagerumfang. Source, Tenant und Entity sind eigene Quellidentitäten; Positionsnummern werden nicht ohne Beleg-/Scopebezug gejoint. Zehn Stück müssen in den tatsächlichen nativen Auftragspositionsbytes liegen; das gemeinsame Case-Label auf einer Sechs-Stück-Position wird abgewiesen.

Der unveränderte PAN472-Draftdatumguard bleibt bestehen. `nativeDateMapping.nativeDateIsBusinessAcceptance=false` verhindert, dass dessen synthetisches Scaffolddatum als Geschäftsannahmedatum gilt. Die kanonische Annahme stammt ausdrücklich aus der veröffentlichten Referenz, und jedes wirkliche Handelsereignis führt separat `effectiveAt`. Das ist keine generische Migration beliebiger Bestelldaten und keine neue externe Zeitautorität.

## Tatsächliche Ereignisse, Revisionen und Stichtage

`GR-01`, `GR-02`, `RS-01`, `SH-01`, `SH-02`, `RET-01` sind sechs gespeicherte native Ereignisse. Versand enthält zusätzlich den stabilen Reservierungsänderungsbezug `RC-01` beziehungsweise `RC-02` mit Ursache, Order, Line und negativem Delta. Diese Ursache ist kein zweiter physischer Warenabgang und darf nicht als neue Bewegungsidentität wiederverwendet werden.

Stichtagslesen rekonstruiert aus derselben unveränderlichen Ereignisfolge; es schreibt keine neue Bewegung:

| Stichtag Europe/Berlin | native Revision | physisch | auftragsreserviert | quarantänisiert | frei |
| --- | --- | --- | --- | --- | --- |
| 2026-06-30 23:59:59 | 4 | 2 | 2 | 0 | 0 |
| 2026-07-31 23:59:59 | 6 | 1 | 0 | 1 | 0 |

Je Receipt-Lot gilt `reserved + blocked <= physical`. Reservierungen, tatsächliche Versandallokationen und Rücknahmen referenzieren dieselben Lots. Die Rücknahme ist an `SH-01` gebunden und hat `creditRef=CN-01`; der Kreditbezug führt hier keine Finanzbuchung aus. Reine Gutschrift ist keine Lagerbewegung. Die veröffentlichten Sollwerte sind Testvorgaben, keine menschliche Studie, kein Holdout und kein zweiter genehmigter Kontext.

## Originalkriterien und ausgeführte technische Prüfungen

- AC1: `native-trade-state.test.mjs` verbindet Auftrag, Receipt, Reservierung und begründete Forwardkorrektur über stabile Identitäten und native Revisionen.
- AC2: gleicher Effekt/gleiche Revision bleibt auch mit neuer Transport-ID idempotent. Inhaltskonflikte und stale revision werden abgewiesen. `native-process-compatibility.test.mjs` startet zwei echte native Clients; nur ein konkurrierender Commit wird zugelassen.
- AC3: Receiptkorrektur/Inventurdifferenz erzeugt ein neues begründetes Ereignis, nie UPDATE/DELETE der ursprünglichen Historie. Spätere Reservierungen bleiben erhalten; Mengenunterdeckung gegenüber später gültiger Arbeit wird abgewiesen. Physischer Zählwert null ist bei `COUNT_ADJUSTMENT` erlaubt, ohne andere Allokationen zu löschen.
- AC4: derselbe vorhandene PAN473-Writer arbeitet nach der Handelsinitialisierung weiter; native Diagnose sowie der bestehende M3-Bestands-/Frischeconsumer sind tatsächlich ausgeführt. Mengen-/Einheitenänderung der gebundenen Position wird nicht still übernommen. Eine anderweitige gültige Partneränderung verliert keine Handelsereignisse.
- AC5: `common-trade-binding.test.mjs`, `common-native-events.test.mjs` und `native-cli.test.mjs` führen die gemeinsame Zehn-Stück-Quelle mit expliziter ID-/Datumabbildung am nativen Produktpfad aus. Beide Stichtage stammen aus den identischen tatsächlichen Ereignissen; Quarantäne und Auftragsreservierung haben überschneidungsfreie Allokationen.

`native-trade-negative.test.mjs` erhält die Originaldenials: stale revision, doppelte Bewegung unter anderer Transport-ID, Einheitenwechsel, Reservierung über nutzbarem Bestand und historische Korrektur gegen spätere Arbeit. Hinzu kommen falsche zusammengesetzte Identität, gefälschte Autorität, unzulässige Historienmutation und Wiederverwendung einer Reservierungsänderungs-ID.

Die bestehende M3-Struktur besitzt keinen eigenen Quarantäneslot. Der hier erzeugte konservative Verfügbarkeitsadapter setzt dessen `reserviert` ausschließlich für diese Bestandsverfügbarkeitsberechnung auf `reserved + blocked`; dieses Feld ist ausdrücklich **keine** kanonische Auftragsreservierung und darf dafür nicht weiterprojiziert werden. Die getrennten fachlichen Fakten liegen in `quantities.reserved`, `quantities.blocked` und den Receipt-Lotallokationen. M3-Bestandsidentitäten bleiben nativ; sie werden nicht als COMMON-Artikel-/Lageridentitäten umetikettiert. Fehlende externe Frischeprovenienz bleibt `UNPROVEN`, trotz tatsächlich eigener nativer Mengen.

## Spezifischer Rückfall und Liefergrenzen

```sh
node scripts/run-pan515-trade-state.mjs stop --root "$OWNED_NATIVE_ROOT" --owner LOCAL_SYNTHETIC_OWNER --reason 'Retain this exact qualified history'
```

`stop` deaktiviert nur neue PAN515-Übergänge mit einem unveränderlichen begründeten Kontrollereignis. Lesen, vorhandener PAN473-Writer und sämtliche Historie bleiben erhalten. Keine rückwirkende automatische Rückbuchung, kein Datenbank-Rollback.

`verification/pan515-native-trade-evidence-v1.json` ist ein kuratierter Bericht tatsächlicher synthetischer CLI-Ausführung mit Quelldigests; keine Veröffentlichung roher Runtime-/Grant-/Reviewerzustände. `finalAcceptance=false` und `closureEligible=false` bleiben absichtlich gesetzt: Entwicklungslauf, Originalkriterienabnahme, CI, Merge, Release und öffentlicher exakter Consumer sind getrennte Gates. Die Distribution bleibt `SOURCE_EVIDENCE_ONLY_NOT_RUNNABLE_PRODUCT_PACKAGE` im realen GitHub-Quellarchiv, nicht als neuer turnkey-Produkt-/Container-Installer.

Keine Produktionsbuchung, Billing-/Human-Usability-/Gesamtmodellkostenbehauptung, Erweiterungs-, Provider-, Quell-, Hostsandbox- oder Publikationsautorität. Kein echter PAN→KS-Pairnachweis aus dieser P01-Abnahme; dieser bleibt das eigene P06-Kriterium.
