# Gemeinsamer Browserarbeitsplatz und Pluginvertrag v1

## Umfang und Grenzen

Der Arbeitsplatz verbindet die vorhandene Setupanzeige und einen lesenden ERV-Einstieg in einer gemeinsamen Shell. Er ist eine optionale, ownerseitig montierte Erweiterung des vorhandenen PAN527-Origin-/Sessionadapters. Ohne ausdrückliches Opt-in bleiben die bisherigen Einstiegspunkte unverändert.

Der Vertrag heißt `pansphaira.browser-plugin/v1`, die Shellversion ist `1.0.0`. Zulässig sind ausschließlich geprüfte Deskriptoren mit codeeigenen Fabriken. `TRUSTED_IN_PROCESS_CODE_OWNED_FACTORIES` bezeichnet vertrauenswürdigen Code im selben Prozess, keine Sandbox. Deskriptoren laden weder fremden Code noch erteilen sie Backendrechte. Ein bösartiges bereits eingebundenes Modul wird durch diesen Vertrag nicht isoliert.

## Slots, Registrierung und Lebenszeit

Die Shell besitzt Navigation, Routen, Hauptansicht, Widgets, Informationspanels und Aktionen: `shell.navigation`, `shell.routes`, `shell.main`, `shell.widgets`, `shell.panels`, `shell.actions`. Beitragsarten und Slots sind typisiert gekoppelt; `shell` und der Namensraum `shell.*` bleiben reserviert. Unbekannte Felder, Accessorwerte, geerbte Deskriptoren, doppelte IDs und nicht passende Fabrikarten werden verweigert.

Versionen und Pflichtabhängigkeiten werden exakt geprüft. Deaktivierte, inkompatible oder von fehlenden Abhängigkeiten betroffene Module werden nicht als einsatzbereit dargestellt. Renderfehler erzeugen eine sichtbare Modulmeldung; andere Navigation und die vorhandene Abmeldeaktion bleiben erreichbar. Diagnostische Fehlerplugins sind ausschließlich eine explizite ownerseitige Testoption, keine URL-, Rollen- oder JSON-Freigabe.

Ein Kontextwechsel bricht ausstehende Reads ab, entfernt Listener und Beitragsinhalte und verwirft das vorherige Informationspanel. Eine verspätete Antwort oder ein nachträglicher Renderfehler des alten Kontextes darf den aktuellen Kontext nicht überschreiben. Der Kontextowner begrenzt ausstehende Reads und registrierte Entsorgungen.

## Backendbindung und Deep Links

`pansphaira.browser-context/v1` enthält Tenant, logische Sessionbindung, Objekt und Revision. Die Sessionbindung ist kein Zugangstoken. Authentifizierung und effektive Rechte bleiben beim vorhandenen Server; ein Frontendkontext, eine Rollenangabe oder ein Pluginbedarf ersetzt sie nicht.

Der Server montiert den Arbeitsplatz unter `/t/<tenant>/workspace`. Die Shell verwendet geschlossene Hashrouten `/workspace/setup` und `/workspace/erv`. Ein ERV-Link kann den vorhandenen Rechnungsvorgang und die erwartete native Revision binden. Fremde Tenants, fremde oder alte Sessionbindungen, unbekannte Parameter, unregistrierte Routen und ungültige Revisionen werden verweigert. Der interne Tastatur-Skiplink setzt den DOM-Fokus ohne Änderung dieser fachlichen Route.

Vor und nach einem fachlichen Read wird die aktuelle Sessionbindung über den vorhandenen Server geprüft. JSON-Reads des Arbeitsplatzes setzen kein neues Sessioncookie; eine verspätete Antwort einer ersetzten Session darf das aktuelle HttpOnly-Cookie nicht überschreiben. Die Abmeldung widerruft ausschließlich die authentifizierte eigene Session unter der vorhandenen Origin-/Schreibgrenze.

## Vorhandene fachliche Quelle

Die Setupansicht liest den bestehenden Backendstatus. Die ERV-Ansicht verwendet `createNativeErvReadAdapterV1` auf dem vorhandenen führenden PAN516-SQLite-Ziel und dessen bestehenden Prüfern. Sie legt keinen zweiten Belegspeicher an, führt keinen neuen Abgleich durch und erteilt keine Buchungs- oder Zahlungsrechte.

Der geschlossene ERV-Readvertrag heißt `pansphaira.browser-erv-read/v1`. Die vorhandenen lokalen synthetischen Vorgänge `AP-PAN516-MATCHED-01` und `AP-PAN516-PARTIAL-01` liefern Beträge, Mengen, Objektversion, Prüferentscheidung und Quelldigests. Session-, Tenant-, Objekt- und Versionsabweichungen werden verweigert. Das Informationspanel bleibt an denselben aktuell gelesenen Rechnungsvorgang gebunden. Die lokale Anzeige ist keine externe Fiskal-, Archiv- oder FiBuqualifikation.

## Darstellung und Prüfbarkeit

Die Oberfläche unterscheidet Laden, empfangenen Readback, verweigerten beziehungsweise veralteten Kontext und nicht verfügbares Backend. Ein HTTP- oder JSON-Ergebnis wird nicht als Ready, fachlicher Schreibabschluss oder Berechtigung ausgegeben. Sichtbare fachliche Inhalte entstehen aus dem tatsächlichen Backendread; diese Erweiterung bietet keinen fachlichen Writer und keine Proposal-Apply-Freigabe.

Die technischen Browserprüfungen umfassen Desktop und 390px, Fokusnavigation, dasselbe ERV-Informationspanel, CSS-Zoomfaktor 2, native Versionskonflikte und native Sessionabläufe. Ein CSS-Zoomtest ist keine Betriebssystem-/Browserchrome-Zoomprüfung, kein Smartphonegerät und keine menschliche Gebrauchstauglichkeitsabnahme.

## Aufbau und vollständiger Pflichtläufer

Die unterstützte Testumgebung ist Linux x86-64 mit dem im Repository festgelegten Node-/npm-Profil. Nach Installation aus dem vorhandenen Lockfile:

    npm run build
    npm run pan541:test

`pan541:test` besitzt eine feste vollständige Testdateimenge. `node scripts/run-pan541-shared-browser-shell-tests.mjs --list` zeigt sie; callergewählte Dateien, Skipoptionen und Namefilter sind unzulässig. Fehlendes Browser-/Nativetooling wird nicht als Skip akzeptiert. `npm run build` prüft und kompiliert TypeScript; der Pflichtläufer baut das Browserbundle vor der Ausführung neu. Für scratchgebundene Nativefixtures muss ein eigenes `TMPDIR` oder `RUNNER_TEMP` vorhanden sein.

Die echte Browserprüfung benötigt die bestehenden, explizit bereitgestellten Pfade `PAN527_BROWSER_MODULE`, `PAN527_CERTUTIL` und `PLAYWRIGHT_BROWSERS_PATH`; `PAN541_BROWSER_EVIDENCE` kann ein eigenes Evidenzverzeichnis wählen. Chromium verifiziert die testlokale CA. Kein Zertifikats- oder Authentifizierungsbypass ist Bestandteil der Abnahme.

## Integritäts- und Liefergrenze

`pan541-shared-browser-shell-v1` ist ein additiver Verification-DAG-Owner mit den bestehenden nativen Abhängigkeiten PAN516 und PAN527. Seine eigenen Tests sind `npm run pan541:test`; vorhandene fremde Owner und harte Gates bleiben bestehen. Die Aufnahme erweitert betroffene Descendantmengen, den bisherigen Integritätsgenerator und die mit unverändertem Scanner beobachtete Inventur. Sie eröffnet keine globalen Invalidierungs- oder Frameworkrechte.

Browser-/Nativetests, Typecheck, Integritätsprüfungen, vollständige Canonicalausführung, Pflicht-CI, geschützter Merge, Release und anonymes Artefaktreadback sind getrennte Nachweise. Ein lokales Entwicklungsarchiv oder erfolgreiches Browserbild ist weder Publikation noch vollständige Lieferung. Der unveränderliche Pluginvertrag kann ein exakter Entwicklungsgegenpart für weitere Module sein; gegenseitige CLOSED-Status sind kein technisches Capabilitygate.
