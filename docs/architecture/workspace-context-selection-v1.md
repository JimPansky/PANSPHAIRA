# Authentischer Kontext und semantische Auswahl v1 — früher DUI-02-Vertrag

## Liefergrenze

Dieses additive Inkrement gehört zu #548 und stellt ausschließlich den frühen DUI-02-Kontext-/Selectionvertrag bereit. PUI-07-Auftrags-/Laufansicht, dauerhafte Runprojektion, Viewmutation, gemeinsames Panel, Modelltoolloop, Audio und spätere Consumer sind hier NOT_DELIVERED. Implementierte Source-/Browserfähigkeit ist nicht mit bestandenem Review, kanonischer CI, geschütztem Merge oder qualifiziertem Release gleichzusetzen. Eine SOURCE_EVIDENCE_ONLY-Lieferung verwendet die exakten GitHub-Quellarchive, keinen neuen turnkey-Installer und keine behauptete Produktivfreigabe.

Reihenfolge: #548 Kontext → #546 native View-/Preview-/Bestätigungs-/CAS-/Readback-/Undoverträge → #548 Panel/erlaubter Textloop. Kein gegenseitiges CLOSED-Warten; Voice, Router und Training sind keine rückwirkenden Gates. Vor Integration bindet jeder tatsächliche Consumer denselben unveränderlichen Commit/Tree und die konkreten Vertragsbytes. Planung oder ähnliche Typen allein sind kein Consumer-PASS.

## Zuständigkeiten und geschlossene Verträge

- `packages/contracts/src/workspace-context-selection-v1.ts`: versionierte Typen und defensive Laufzeitvalidatoren für Claim, Readback, Snapshot, Tabbootstrap und Verify; extras, Accessors, exotische Prototypen, unsichere Zahlen und inkonsistente Objekt-/Fachrevisionen werden abgewiesen. Strukturvalidität oder ein kopierter Handle sind keine Authentifizierung.
- `src/pan548/native-context-selection.mjs`: authentischer, im Prozess gebrandeter Owner auf bestehenden PAN527-Sessions und PAN541-NativeERVreads. Das Origin-Gateway mountet ihn nur mit passender bestehender Session-/Runtimebindung. Kein zweiter Registryinstaller, Taskstore, Fachledger oder Writer.
- `packages/browser-shell/src/extended-context-owner-v1.ts`: gemeinsamer additiver Lifetimeguard für read/stt/model/render/preview, ohne selbst STT, Modell, Render- oder Previeweffekte zu implementieren. Bestehender `BrowserContextV1` bleibt v1.
- `packages/browser-workspace/src/context-selection-v1.ts`: vertrauenswürdiger Shelladapter, native Auswahlkontrollen und aktuellen deutschen Read-only-Scope; kein CSSselector, DOM-/Widget-/Modellwert als Authority.

DUI-02-AC01: Der Server stellt `contextHandle` nach aktueller HMAC-Sessionauthentifizierung, Tenant/Subject/Rolle, Origin, Instanz, Generation, SAFE_GUIDED und bestehenden effektiven Leserechten aus. `pan.setup.view` und `pan.erv.view` werden aus den vorhandenen code-owned Plugin-Deskriptoren gegen deren tatsächlichen Validator und native Factory-IDs aufgelöst. Semantic element/row IDs kommen ausschließlich aus dem aktuellen nativen Setup-/ERVread; erfundene IDs sind kein Claim-Grant.

DUI-02-AC02: Origin/Tenant/Subject/Session/Instanz/Generation/Tab/Epoch sind getrennt von `hostRevision`, nullable `domainRevision`, `viewRevision`, `catalogRevision`, `selectionRevision`. Setup und ERV unterstützen `primaryObject=null` mit `domainRevision=null`. Eine echte native ERVrevision bleibt die Fachrevision, nicht View-/Selectionrevision. Persönliche Profiländerungen und Catalogänderungen invalidieren unabhängig. Modul-/Objektwechsel invalidiert vorherige Handles/Selection; kopierte fremde Handles oder Tabproofs sind kein Zugang.

DUI-02-AC03: Der Guard prüft vor Invocation und nach jeder asynchronen Operation die konkrete lokale Lifetime, alle Versionsachsen und die Lease. Auch Ablauf oder Retirement während des synchronen Livepredicates und während führender nativer Reads muss vor Ausgabe erneut geprüft werden. Reads/Render-/Preview-/STT-/Modellantworte aus alten Lifetimes werden verworfen. Die optionale Contextbindung blockiert bestehende native Aktionen und Deep Links nicht. Requests sind auf fünf Sekunden begrenzt, laufende Bindreads werden bei Retirement abgebrochen und die lokale Epoch wird vor einem Claim sowie nach jedem Reply erneut geprüft; kein blinder Wiederholungsversuch nach Timeout. Auch eine verspätete Bootstrapantwort darf nach Close keinen Tabproof wiederherstellen. Der Browser serialisiert native Claims, verwirft echte verspätete Antworten nach Modulwechsel und lässt Navigation sowie eigenen Logout bestehen. SourceMap bleibt hier stets `null`; eine spätere ausdrücklich erlaubte Developerprojektion benötigt einen eigenen versionierten Vertrag, nie Widgetableitung.

## Geschützter nativer Transport und Grenzen

Expliziter Owner-opt-in: `enableWorkspaceBrowserV1({ ..., contextSelection: true })`. Der bisherige Installer/Compose-/Local-/Shellvertrag bleibt bestehen; fehlendes Inkrement wird nicht als vorhandene Fähigkeit angezeigt.

Alle relativen Routes liegen unter `/t/<tenant>/workspace/context-selection`:

- `POST /tab`: geschlossener leerer Body; Server erzeugt Tab-ID, privaten Proof und initialen Setup-Snapshot.
- `GET` Basis: frischer aktueller Snapshot und native semantische SelectionMap.
- `POST` Basis: Claim mit module/view/nullable object, allen erwarteten Revisionen/Epoch und nullable semantischer Selection. Aktuelle native Mitgliedschaft und CAS-artige Revisionsgleichheit müssen stimmen.
- `POST /verify`: vorhandenen exakt eigenen Handle gegen aktuelle Session, Lifetime, Rechte und native Revisionen prüfen.
- `POST /retire`: exakt eigene aktuelle Lifetime/Selection invalidieren. Unklarer oder alter Effekt wird nicht blind wiederholt; neuer Kontext braucht frische native Revalidierung.

`x-pan548-session`, `x-pan548-tab-id` und `x-pan548-tab` bleiben an die bestehende authentische HttpOnly-Secure-SameSite-Session gebunden. Der zufällige Tabproof liegt nur im vertrauenswürdigen Shellspeicher; der Server hält dessen Digest. Proof/Handle sind keine Modell-, Cookieexport-, URL-, LocalStorage- oder DOMcredentials. Maximal acht Tabs je Session und 128 im Owner; Tabdauer fünf Minuten, Kontextlease höchstens 60 Sekunden und nie über Tabexpiry. Expired Tabs werden bei neuer Aufnahme begrenzt entfernt. Kein automatischer Mutationretry oder Stillschweigen über Unknown/Denied.

Die beschreibenden Capability-IDs `ui.context.read` und `ui.selection.read` erteilen keine Executionrechte. Jeder Readback hat `sourceMap:null`, `executionAuthorityGranted:false`, `effectsProduced:false`. Keine freie Tool-/Shell-/URL-/Modellschlüsselroute, keine Inferenz-/Export-/Kauf-/Produktivbuchungsrechte. Persönliche Sichtbarkeit ist keine fachliche Authority. Kein Hostsandboxversprechen für vertrauenswürdigen In-process-Code.

## Reale technische Qualification

`npm run pan548:test` ist ein fester vollständiger Linux-x86_64-/Node24-Einstieg: TypeScriptbuild, vorhandener Browserbuild und sämtliche strukturellen Lifetime-, echten Native/TLS-, NativeExpiry-, Chromium- und Registrierungsfälle. Kein Filter, Shard, Skip, verschachtelter `NODE_TEST_CONTEXT` oder ausführbarer Startuphook wird angenommen. Der trusted Node/npm parent ist Voraussetzung: ein vor JSentry ausgeführter adversarial Preload kann nicht nachträglich zum Hostsandboxversprechen werden.

Vorhandene Toolbindungen: `TMPDIR` beziehungsweise `RUNNER_TEMP` für ausschließlich eigene Testressourcen; `PAN527_CERTUTIL`, `PAN527_BROWSER_MODULE` und gegebenenfalls `PLAYWRIGHT_BROWSERS_PATH` für echte zertifikatprüfende Chromiumtests. Keine `ignoreHTTPSErrors`-Abkürzung oder Skip bei fehlendem Tooling. `PAN548_BROWSER_EVIDENCE` legt den eigenen Ausgabeordner fest. Das geschützte Browserassetlimit bleibt exakt 131072 Bytes; ausschließlich Whitespace-Minification verkleinert das vorhandene Bundle, nicht der Ingressbound.

Positive Prüfungen: authentischer Setup-/ERVsnapshot, natives nullable Fachobjekt, echte Tastaturselection mit beobachtetem Request und aktuellen Serverhandles, Modulwechsel, eigener Logout und unveränderte führende Fachhistory. Direkte Negative: Tenant/Subject/Role/Tabspoof, erfundene Row/Element-ID, fremder kopierter Handle, Schema-/SourceMapdrift, aktuelle Rights-/Revisionsänderung und Leaseablauf während führendem Nativeprofilread. Echte verzögerte Chromium-Responsebytes werden über CDP angehalten, nicht durch plausible JSONantworten ersetzt.

Desktop-/390px-/CSS-zoom- und Keyboard/Fokusbilder plus DOMbounds sind technische synthetische Browserbelege. Jede tatsächlich zu qualifizierende PNG-Datei benötigt echte visuelle Sichtung oder vollständige PNGbytegleichheit mit einem direkt gebundenen qualifizierten Original. Keine Human-/Geräte-/Produktiv-/Wholecanonical-/CI-/Releaseakzeptanz aus einer lokalen Testzahl ableiten. Private Test-/Review-/Bildreceipts werden nicht ungeprüft öffentlich publiziert.
