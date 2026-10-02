# Benutzerarbeit in der Eingangsrechnungsverarbeitung

**Öffentliche Primärquellen, Abrufstand 2. Oktober 2026.** Die Matrix beschreibt dokumentierte Beispielsysteme und davon ausdrücklich getrennte synthetische Unternehmensregeln. Sie ist weder Produktempfehlung noch Rechts-/Steuerberatung noch Nachweis einer eigenen Implementierung oder ihres Laufzeitverhaltens.

## 1. Leseschlüssel und wichtigste Abgrenzungen

- **G – gesetzliche Rechnungsangabe:** nur im Anwendungsbereich der genannten Vorschrift; nicht automatisch ein Pflichtfeld jeder Softwaremaske.
- **S – Systempflicht/-verhalten:** nur für das benannte Produkt, Modul und Verfahren. **U – Unternehmensregel:** konfigurierbar oder hier als Entwurf festgelegt. **U→S:** eine gewählte Regel wird technisch verbindlich.
- **Vorgabe für alle Beispiele:** Die fachliche Freigabe erteilen die **Kostenstellenverantwortlichen (KSV)**, auch bei fehlerfreiem Bestellabgleich. Leistungsempfänger bestätigen die Leistung; **Projektverantwortliche (PV)** können zusätzlich prüfen. Projektprüfung ersetzt KSV-Freigabe nicht.
- **Approval ≠ Buchung ≠ Zahlung.** Business Central unterscheidet Freigabe und anschließende Bearbeitung/Buchung; D365 Finance hat einen gesonderten Zahlungsprozess. Ein automatisierter Zahlungsvorschlag bucht die Zahlung nicht automatisch.[8][16][10]
- **Größe ist Kontext, kein Prozessklassifikator:** Die folgenden Entwürfe unterscheiden sich durch Zuständigkeiten, Bestell-/Projektbezug, Verteilung und Ausnahmen. Ein kleiner Verbund kann komplexer arbeiten als ein großer Konzern bei einer einfachen Einzelrechnung.

**Rollen im Entwurf:** AP = Erfassung/Kreditorenbuchhaltung; LE = Besteller/Leistungsempfänger; KSV = Kostenstellenverantwortliche; PV = zusätzliche Projektprüfung; MAN = übergeordnete Freigabestelle; PAY = Zahlungsverantwortliche; CFG = Regel-/Stammdatenadministration. Rollen sind Aufgabenpakete, nicht zwingend sieben verschiedene Beschäftigte. Wo Vier-Augen-Kontrolle verlangt wird, sind verschiedene Personen erforderlich; dies ist hier eine Unternehmensregel.

## 2. Kompakte Workflow-/Feld-/Rollenmatrix

Die Belegkennung **E…** verweist im Quellenverzeichnis auf **URL, genauen Abschnitt und Originaltextstück**. Vollständige Feldbedingungen und Belegzuordnungen stehen außerdem maschinenlesbar in `workflow-field-role-matrix.json` und den beiden CSV-Dateien.

| Schritt | Benutzerarbeit und wesentliche Felder | Rollen | Pflichtart / dokumentierter Unterschied |
|---|---|---|---|
| **W01 Eingang** | Beleg erfassen; Lieferant, Empfänger, Nummer, Datum und Beträge gegen das Original prüfen. | AP | **S:** DocuWare US verlangt in der beschriebenen Erfassungsstrecke die Kontrolle/Ergänzung vorindexierter Daten. Das ist noch keine Leistungsfreigabe. E04a.[4] |
| **W02 Validierung** | Summen, Dublette, nicht verteilte Zuschläge und Fehlergrund bearbeiten. | AP | **U→S:** D365-Finance-Sperren vor Workfloweinreichung hängen von den jeweils dokumentierten Parametern ab. Nicht pauschal „immer gesperrt“ behaupten. E06b/c.[6] |
| **W03 Sachlich / Leistung** | Rechnung, Bestellung und Wareneingang bzw. Leistungsnachweis vergleichen; Mengen-/Preisabweichung klären. | LE → KSV; PV optional | **U/S:** D365 unterscheidet Zwei-/Drei-Wege-Abgleich und konfigurierbare Toleranzen/Abweichungsfreigabe. Dienstleistungsabnahme durch LE plus abschließende KSV-Entscheidung ist unsere **U**-Vorgabe. E07a–c.[7] |
| **W04 Kopfkontierung** | Gesellschaft, Kreditor, Währung, Buchungsdatum, Kopfdimensionen und Zuschläge prüfen. | AP | **S:** D365 trennt Kopf-/Positionsbeträge; bei Bestellbezug kommen Standarddimensionen aus Bestellpositionen. Kopfvorbelegung ist daher nicht gleich verbindliche Zuordnung sämtlicher Positionen. E01a/E06d.[1][6] |
| **W05 Positionskontierung** | Sachkonto, Steuerkey, Betrag, Buchungstext und wirtschaftliche Zuordnung je Kontierungszeile prüfen. | AP, KSV | **S/U:** DocuWare UK nennt `GL amount` ausdrücklich als Pflicht bei Kostenstellenfreigabe. BC kann Dimensionen über `Code Mandatory` zur Buchung verlangen. Nicht jede sichtbare Spalte ist stets Pflicht. E03b/E13a.[3][13] |
| **W06 Bezüge** | Kostenstelle, Kostenträger, Projekt/Projektaufgabe bzw. PSP sowie Bestellung/Position auseinanderhalten. | AP, KSV; PV optional | **S:** BC-Kostenrechnung ordnet Kostenposten Kostenstelle **oder** Kostenträger zu; das ist keine universelle ERP-Rechnungsregel. BC-Projekte haben eigene Projekt-/Aufgabenfelder. E11a–c/E14a.[11][14] |
| **W07 Split** | Teilbeträge oder Prozente, Netto-/Bruttobasis und Rundungsrest festlegen; jeden Anteil zuordnen. | AP → beteiligte KSV | **S:** DocuWare-US-Prozentvorbelegung muss 100 % ergeben. D365 dokumentiert bei Bestellbezug Splits für nicht lagergeführte Artikel und Einschränkungen für Zuschlags-/Steuer-/Rabattzeilen. **U:** alle betroffenen KSV müssen ihre Anteile freigeben. E04b/E01c/d.[4][1] |
| **W08 Fachfreigabe** | Beleg/Anteil, Zuständigkeit und Entscheidung prüfen; gegebenenfalls Projektmitprüfung. | KSV; PV zusätzlich | **S:** DocuWare UK verlangt im Kostenstellenpfad alle betroffenen Erstfreigeber/gegebenenfalls Manager. SAP kann Kostenstellen- und PSP-Verantwortliche über passende Vorbedingungen ermitteln. Unsere **U**-Regel ist ausdrücklich UND, nicht „irgendjemand genügt“. E03a/E18a/b/f.[3][18] |
| **W09 Kontrollregeln** | Grenzbetrag, Bezugswährung, Vertreter, Abwesenheit und Personenkonflikte pflegen. | CFG, KSV, MAN | **U→S:** BC-Limits beziehen sich auf lokale Währung; dieselbe Person als Anforderer/Genehmiger in einer Workflowgruppe kann zu automatischer Eigengenehmigung führen. SAP bietet Initiatorausschluss; DocuWare US Abwesenheitsvertretung. Vier-Augen-Prinzip nicht allein aus zwei Rollennamen ableiten. E02a–c/E18c/E04c.[2][18][4] |
| **W10 Ausnahme / Änderung** | Rückfrage mit Grund; Ablehnung oder Nacharbeit; Änderungen erneut beurteilen. | AP, LE, KSV, PV | **S:** BC beschreibt Abbruch laufender Anfrage und neue Einreichung; DocuWare UK noch Halten/Ablehnen im Abschluss; SAP einen Neustart nach Nacharbeit an vollständig vorerfassten Rechnungen. **U:** relevante Änderung **nach erteilter Freigabe** verlangt in unseren Fällen neue KSV-Freigabe – kein produktübergreifend belegter Automatismus. E08b/E03c/E18d.[8][3][18] |
| **W11 Buchung** | Kontierung abschließen; Buchungsauftrag und tatsächliches Ergebnis unterscheiden; Fehler korrigieren. | AP | **S:** DocuWare-Buchungsdatenexport ist nicht bereits die Finanzbuchung. BC aktualisiert bei Buchung Konten. Für gebuchte Rechnungen gelten gesonderte Korrekturverfahren, nicht schlicht „alte Rechnung überschreiben“. E03d/E16b/E15a/b.[3][16][15] |
| **W12 Zahlung** | Offene Posten auswählen, Fälligkeit/Zahlart/Bankdaten prüfen; Zahlung separat autorisieren und ausführen. | PAY | **S:** D365-Zahlungsvorschlag selektiert Rechnungen; Zahlungsgenerierung benötigt eine Zahlart; Vorschlagsautomatik bucht nicht automatisch. **U:** Bankausführung und Ausgleich als eigene Nachweise. E09a/b/E10a.[9][10] |

### Feldpflichten: Rechnung, Verarbeitung und interne Zuordnung

| Feldgruppe | Ebene | Einordnung und Grenze |
|---|---|---|
| Namen/Anschriften von Leistendem und Empfänger; Steuernummer **oder** USt-ID; Ausstellungsdatum; Rechnungsnummer | Kopf | **G:** allgemeiner Katalog § 14 Abs. 4 Nr. 1–4 UStG. Interne Lieferanten-ID und Erfassungsnummer sind nicht dasselbe. E05a.[5] |
| Menge/Art bzw. Umfang/Art; Leistungszeitpunkt; aufgeschlüsseltes Entgelt/Minderungen; Steuersatz/-betrag bzw. Befreiungshinweis | Position/Leistungs- und Steuerdaten | **G:** § 14 Abs. 4 Nr. 5–8 mit den dortigen Bedingungen. Aufbewahrungshinweis und „Gutschrift“ nur in den Fällen Nr. 9–10. E05a/b.[5] |
| Kleinbetragsrechnung | Belegkontext | **G-Ausnahme:** § 33 UStDV nennt bis einschließlich **250 EUR Gesamtbetrag** einen abweichenden Mindestkatalog; Satz 3 enthält Ausnahmen. Kein einheitlicher Vollkatalog für jeden Beleg. E12a/b.[12] |
| Herkunft, Inhaltsintegrität, Lesbarkeit und Leistungsbezug | Dokument/Kontrolle | **G-Kontrolle:** § 14 Abs. 3 beschreibt unter anderem einen verlässlichen Prüfpfad, nicht eine bestimmte Kostenstellenmaske. E05c.[5] |
| Interne Gesellschaft, Kreditoren-ID, Eingangstag, Buchungsdatum, Fälligkeit, Währung, Bankdaten | Kopf/Stamm/Zahlung | **U/S:** nicht im allgemeinen Angabenverzeichnis des § 14 Abs. 4 genannt; keine Aussage über alle anderen rechtlichen/vertraglichen Sonderfälle. In der DocuWare-US-Mehrgesellschaftslösung ist `Subsidiary Name` hingegen ausdrücklich Systempflicht. E05a/E04d.[5][4] |
| Rechnungseigene Nummer vs. Erfassungspflicht | Kopf | **G** und **U→S** getrennt: BC kann das Buchen ohne externe Belegnummer über `Ext. Doc. No. Mandatory` verhindern. Ein ausgeschalteter Softwareparameter beseitigt keine einschlägige Rechnungsanforderung. E16a/E05a.[16][5] |
| Sachkonto, Kostenstelle, Kostenträger, Projekt, Bestellung, Verteilung, Genehmigende | Position/Workflow | **S/U**, keine pauschalen Rechnungsangaben aus § 14 Abs. 4. Ob verpflichtend, hängt vom Prozess und System ab; Kostenträger und Projekt dürfen nicht stillschweigend als Synonyme modelliert werden. E11a–c/E14a/E05a.[11][14][5] |

**Wichtiger Statusunterschied:** SAP S/4HANA Cloud Public Edition 2608 unterscheidet vollständig vorerfasste und gesperrte Rechnungen: nach den Workflow-Schritten wird im ersten Fall im Hintergrund gebucht, im zweiten freigegeben. Die Freigabe einer gesperrten Rechnung erfolgt auf Kopfebene zur Zahlung; der Sperrgrund auf Positionsebene kann bestehen bleiben. Das ist weder eine allgemeine fachliche Abnahme noch eine ausgeführte Zahlung. E18e/E17b/c.[18][17]

**Weitere Produktgrenze:** In DocuWare UK genügt bei mehreren *Requestors* die Freigabe eines Einzelnen, während der Kostenstellenpfad die beteiligten Freigeber verlangt. SAP bietet explizite Ein-/Alle-Empfängerregeln. Die Zahl ausgewählter Personen beweist deshalb kein UND-Prinzip. E03a/e/E18f.[3][18]

## 3. Acht synthetische Anwendungsfälle

**Alle Zahlen, Firmenkontexte und Prozessentscheidungen unten sind frei entworfene U-Regeln, keine Herstellerdefaults und keine gesetzlichen Schwellen.** Gemeinsame Beispielregel: **über 5.000 EUR Nettorechnungssumme** zusätzlich MAN; nicht Betrag je Split. KSV bleibt fachlicher Entscheider. Nach erfolgreicher Fachfreigabe erfolgen **Buchung durch AP und separate Zahlung durch PAY**. Beträge/Splits wurden rechnerisch geprüft. Die Quellen begründen nur die verwendeten Prozessbausteine, nicht die konkrete Ausgestaltung dieser Fälle.

| Fall / Kontext | Beleg, Felder und Ablauf | Warum anders? / Ausnahme |
|---|---|---|
| **S01 – 7-köpfige Agentur** | Softwareabo, **800 EUR netto**, keine Bestellung, eine Verwaltungskostenstelle. AP erfasst/kontiert; LE bestätigt genutzten Zeitraum; KSV gibt frei. **PV aus.** AP bucht, PAY autorisiert/führt Zahlung aus. | Wenige Übergaben wegen eindeutiger Zuständigkeit, nicht wegen „klein“. Erfassende Person und fachlich freigebende Person sind verschieden. Bausteine: E04a/E08a/E02c.[4][8][2] |
| **S02 – 12-köpfiges Ingenieurteam** | Fremdleistung **4.800 EUR netto** für Projekt P-A/Aufgabe 30. LE bestätigt Meilenstein; **PV an**, danach KSV-Fachfreigabe. Projektkontierung und KSV-Zuordnung getrennt dokumentiert; dann AP/PAY. | Kleine Organisation, aber zusätzliche Projekt-/Meilensteinverantwortung. Fehlender Nachweis führt zur Rückfrage, nicht zur Zahlung. Bausteine: E14a/E18b.[14][18] |
| **S03 – Handelsbetrieb, 80 Personen** | Bestellung/Rechnung **20 Stück × 100 EUR = 2.000 EUR netto**, Eingang nur **18 Stück**. AP sieht Abweichung; LE klärt Empfang. Beispielausgang: korrigierte Rechnung **1.800 EUR**, KSV prüft/freigibt; dann AP/PAY. **PV aus.** | Bestell-/Wareneingangsbezug statt Projektprüfung; bei lagergeführten Artikeln kein blindes Übertragen des Kostenstellen-Splitmusters. Abweichung nicht durch Zahlungsfreigabe „heilen“. Bausteine: E07a–c/E01c.[7][1] |
| **S04 – Dienstleister, 150 Personen** | Standortkosten **6.000 EUR netto**, Verteilung **40/35/25 % = 2.400/2.100/1.500 EUR** auf drei Kostenstellen. Jede KSV bestätigt ihren Anteil; alle müssen zustimmen; zusätzliche MAN-Freigabe wegen Gesamtsumme. **PV aus**; dann AP/PAY. | Verteilung und mehrere Zuständigkeiten treiben den Aufwand. Urlaubsvertretung ausdrücklich hinterlegt; Rundungs-/Summenkontrolle vor Abschluss. Bausteine: E04b/c/E03a/E02a.[4][3][2] |
| **S05 – Kleiner Engineering-Verbund, 20 Personen** | **15.000 EUR netto**, eindeutig eine rechnungsempfangende Gesellschaft; Projektanteile P-A/P-B **60/40 % = 9.000/6.000 EUR**. **PV an** für beide Projektanteile, KSV-Freigaben nach verantwortlicher Kostenstelle, danach MAN, AP und PAY. | Trotz geringer Personalzahl mehrere Projekte, Zuständigkeiten und gemeinsamer Leistungseinkauf. Keine stillschweigende Verteilung auf andere Rechtsträger; Weiterverrechnung wäre ein eigener, hier nicht entworfener Prozess. Bausteine: E14a/E18a/b/E04d.[14][18][4] |
| **S06 – Verbund, 2.000 Personen / fünf Gesellschaften** | Gleiches einfaches **800-EUR-Abo** wie S01, aber eine von fünf Gesellschaften als Empfänger. Zentrale AP prüft Gesellschaft/Kreditorenstamm; lokale KSV gibt frei. **PV aus**, kein Split; AP bucht für richtigen Mandanten; PAY zahlt aus passender Zuständigkeit. | Organisatorischer Aufwand durch Mandant, Stammdaten und lokale Verantwortung; keine zusätzliche fachliche Stufe allein wegen Größe. Bausteine: E04d/E17a.[4][17] |
| **S07 – Gemeinnütziger Träger, 25 Personen** | Dienstleistungsrechnung **1.200 EUR netto**, unvollständiger Leistungsnachweis. LE beantwortet Rückfrage; KSV ist abwesend, benannte berechtigte Vertretung übernimmt. Bei weiter unklarer Leistung Ablehnung/Klärung, sonst Fachfreigabe und AP/PAY. **PV aus.** | Ausnahme und Vertretung bestimmen den Weg. Fristablauf ist keine Zustimmung; Ablehnung ist keine Stornobuchung. Bausteine: E04c/E08b/E03c.[4][8][3] |
| **S08 – Hersteller, 600 Personen: Änderung nach Approval** | Bereits fachlich freigegebene **4.800 EUR** werden vor Buchung auf **5.600 EUR netto** korrigiert. AP markiert neue Version; bisherige Freigabe gilt im Entwurf nicht für diese Fassung. KSV prüft neu; nun zusätzlich MAN. **PV aus**; erst dann AP/PAY. | Die Änderung überschreitet die Beispielgrenze. **Abzweig nach Buchung:** Systemkorrektur statt Überschreiben; BC nennt Gutschrift/neuen Beleg, bei bezahlten/aus kombinierten Empfängen entstandenen Rechnungen abweichende Schritte. Keine automatische Rückbuchung/Zahlungsrückholung unterstellen. Bausteine: E08b/E15a/b.[8][15] |

### Entwurfsentscheidungen, die nicht offen bleiben dürfen

1. **Betragsbasis:** netto/brutto, Gesamtbeleg/Teilbetrag, Währung und Wechselkursstichtag ausdrücklich definieren. Die Beispiele nutzen Nettogesamtsumme; aus der bloßen Bezeichnung Rechnungsbetrag folgt nicht automatisch eine Teilbetragsgrenze.
2. **Fehlende Zuständigkeit:** hier Klärungsaufgabe statt stiller Freigabe; Stellvertretungsbefugnis und Personenkonflikte mitprüfen.
3. **Änderung nach Freigabe:** relevante Felder und erneute Prüfermenge vorab festlegen; Reapproval nicht aus einem beliebigen „Reopen“-Knopf ableiten.
4. **Zahlungsabschluss:** „freigegeben“, „exportiert“, „gebucht“, „Zahlung erstellt“ und „ausgeführt/ausgeglichen“ im Entwurf getrennt halten.

## 4. Nachweisumfang und Grenzen

- **18 tatsächlich geöffnete Primärquellen:** Microsoft Learn, DocuWare Knowledge Center, SAP Help und die amtlich bereitgestellten deutschen Normtexte. Keine privaten Daten, Produktdateien oder Sitzungsverläufe verwendet.
- **Versionsprüfung:** SAP zeigte im Browser **2608**; der Herstellerverweis führte über `version=2608.500`. DocuWare US nennt die unten erfassten IPUS-Versionen. Für die UK-Seite war keine eindeutige Releasekennung sichtbar; keine Übertragung auf jede DocuWare-Installation. Microsofts sichtbare Änderungsdaten sind im Quellenregister gespeichert, kein Beweis einer installierten Version.
- **Rechtlicher Umfang:** allgemeiner Rechnungsangabenkatalog und benannte Ausnahme, keine abschließende Behandlung von Sonderumsätzen, Vorsteuerabzug, E-Rechnungsübergangsrecht oder Aufbewahrungsfristen.
- **Nicht verifiziert:** konkrete Implementierung, Einrichtung, Integrationen, Berechtigungsdurchsetzung, automatische Neuprüfung oder Bankausführung irgendeines eigenen Produkts. Recherche liefert Prozesswissen, keinen Runtime-Nachweis.
- **Abrufhürde gelöst:** SAP lieferte erst nach dynamischem Laden und Aufruf der vom Portal angebotenen Versionskennung den lesbaren Inhalt. Keine Login- oder Zugangsdaten verwendet.

## 5. Quellenbelege

Je Quelle werden die kurzen Originalfragmente nur hier gesammelt zitiert; zusammen **höchstens 25 Wörter je Quelle**. Jede E-Kennung bezeichnet den genauen Abschnitt. Die Quellenliste darunter enthält die zugehörigen Original-URLs. `research-sources.json` verbindet dieselben Angaben strukturiert und nennt Abruf-/Versionsgrenzen.

### Quelle [1] — Accounting distributions and journal entries for vendor invoices - Finance | Dynamics 365 | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-05-28.[1]
- **E01a · Accounting distributions:** „Modify vendor invoice header amounts“[1]
- **E01b · Accounting distributions:** „Modify vendor invoice line amounts.“[1]
- **E01c · Accounting distributions:** „an item that isn't stocked“[1]
- **E01d · Accounting distributions:** „can't split or delete“[1]

### Quelle [2] — Set up approval users - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-06-17.[2]
- **E02a · To set up an approval user > Purchase Amount Approval Limit:** „maximum purchase amount in LCY“[2]
- **E02b · To set up an approval user > Substitute:** „the direct approver, or the approval administrator“[2]
- **E02c · To set up an approval user > warning about requestor/approver:** „Their requests are always approved automatically.“[2]

### Quelle [3] — Invoice Processing for UK and other countries
**Geltungsbereich:** Vorkonfigurierte UK-Lösung; keine eindeutige Releasekennung auf der geöffneten Seite sichtbar.[3]
- **E03a · Approval by requestor and/or cost centre > Approval by cost centre department approvers:** „all first approvers and, if applicable,“[3]
- **E03b · GL coding:** „GL amount (mandatory field“[3]
- **E03c · Completion:** „rejected, re-requested or put on hold“[3]
- **E03d · Completion:** „transfer it to the financial system“[3]
- **E03e · Approval by requestor and/or cost centre > Approval by requestor:** „one of them“[3]

### Quelle [4] — Invoice Processing for US
**Geltungsbereich:** Seite nennt IPUS7.9T0 + IPUS 7.8T1 + IPUS7.8T0 + IPUS7.7T1; Lösungs- und DocuWare-Version sind getrennt.[4]
- **E04a · How to store an invoice from tray to file cabinet > Storing by using standard indexing:** „checked and, if necessary, filled in or corrected“[4]
- **E04b · How to GL code invoices > GL Table prefill options:** „The percentage amounts must total 100%.“[4]
- **E04c · How does the cost center approval work?:** „substitute approver“[4]
- **E04d · Using the solution with multi-subsidiaries:** „mandatory field “Subsidiary Name”“[4]

### Quelle [5] — § 14 UStG - Einzelnorm
**Geltungsbereich:** Amtlich bereitgestellter konsolidierter Normtext am Abrufdatum; keine Einzelfallprüfung oder vollständige Übergangsrechtsanalyse.[5]
- **E05a · § 14 Abs. 4 Nr. 1–10 UStG:** „Eine Rechnung muss folgende Angaben enthalten:“[5]
- **E05b · § 14 Abs. 4 Nr. 6 UStG:** „den Zeitpunkt der Lieferung oder sonstigen Leistung“[5]
- **E05c · § 14 Abs. 3 UStG:** „verlässlichen Prüfpfad zwischen Rechnung und Leistung“[5]

### Quelle [6] — Vendor invoices overview - Finance | Dynamics 365 | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-05-06.[6]
- **E06a · Submitting a vendor invoice for review:** „header, the invoice line, or both“[6]
- **E06b · Preventing invoice submission to workflow:** „Prohibit submission to workflow“[6]
- **E06c · Preventing invoice submission to workflow:** „Reject duplicate“[6]
- **E06d · Default financial dimension in vendor invoice lines:** „default financial dimension comes from the corresponding purchase order lines“[6]

### Quelle [7] — Three-way matching policies - Finance | Dynamics 365 | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-06-04.[7]
- **E07a · Example: Three-way matching for items > Scenario:** „the quantity on the invoice line matches the quantity received.“[7]
- **E07b · Example: Three-way matching for item and vendor combinations > Scenario:** „If approval is required“[7]
- **E07c · Example: Three-way matching for items > Scenario:** „within the tolerance percentage“[7]

### Quelle [8] — Approve or reject documents in workflows - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2025-10-16.[8]
- **E08a · Request a record approval:** „remains locked for processing until all approvers approve the record.“[8]
- **E08b · Cancel approval requests:** „make the necessary changes to the order, and request approval again.“[8]
- **E08c · Approve or reject approval requests:** „Released“[8]

### Quelle [9] — Vendor payment overview - Finance | Dynamics 365 | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2025-08-27.[9]
- **E09a · Vendor payment overview > payment proposal steps:** „The payment proposal is a query used to select invoices for payment.“[9]
- **E09b · Vendor payment overview > method of payment step:** „the method of payment must be defined.“[9]

### Quelle [10] — Automate vendor payment proposals - Finance | Dynamics 365 | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-08-04.[10]
- **E10a · Automate vendor payment proposals > introductory paragraphs:** „Payment proposal automations don't automatically post the payments.“[10]

### Quelle [11] — Set up cost accounting - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2024-07-25.[11]
- **E11a · Setting Up Cost Centers:** „departments that are responsible for costs and income“[11]
- **E11b · Setting Up Cost Objects:** „Cost objects are projects, products, or services of a company.“[11]
- **E11c · Balances between Cost Type, Cost Center, and Cost Object:** „but never in both places“[11]

### Quelle [12] — § 33 UStDV - Einzelnorm
**Geltungsbereich:** Amtlich bereitgestellter konsolidierter Normtext am Abrufdatum; keine Einzelfallprüfung oder vollständige Übergangsrechtsanalyse.[12]
- **E12a · § 33 Satz 1 UStDV:** „Eine Rechnung, deren Gesamtbetrag 250 Euro nicht übersteigt“[12]
- **E12b · § 33 Satz 3 UStDV:** „Die Sätze 1 und 2 gelten nicht“[12]

### Quelle [13] — Work with dimensions to track and analyze data - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-04-09.[13]
- **E13a · To set up default dimensions for customers, vendors, and other accounts > Tip:** „Code Mandatory“[13]
- **E13b · To set up default dimensions for customers, vendors, and other accounts:** „you can delete or change the code on the line if needed.“[13]
- **E13c · Use dimensions:** „both an individual document line and the document itself“[13]

### Quelle [14] — Manage project supplies - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2025-04-01.[14]
- **E14a · Replenish a project manually:** „In the Project No. and Project Task No. fields“[14]
- **E14b · To post a project-related expense:** „Project G/L Journal“[14]

### Quelle [15] — Amend or cancel unpaid purchase invoices - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2025-10-03.[15]
- **E15a · Correct a posted purchase invoice:** „A new purchase invoice with the same information is created“[15]
- **E15b · Correct or cancel unpaid purchase invoices > introductory paragraphs:** „you must manually create a purchase credit memo“[15]

### Quelle [16] — Record purchases with purchase invoices - Business Central | Microsoft Learn
**Geltungsbereich:** Laufende Herstellerdokumentation, kein installierter Produktstand nachgewiesen. Sichtbares Änderungsdatum: 2026-06-17.[16]
- **E16a · External document number:** „Ext. Doc. No. Mandatory“[16]
- **E16b · Posting purchases:** „the vendor's account, the general ledger (G/L)“[16]

### Quelle [17] — Workflows für Lieferantenrechnungen verwalten
**Geltungsbereich:** SAP S/4HANA Cloud Public Edition: sichtbare Version 2608; über Herstellerverweis version=2608.500 geöffnet.[17]
- **E17a · Workflows für Lieferantenrechnungen verwalten > Einleitung:** „Genehmigung durch den Kostenstellenverantwortlichen“[17]
- **E17b · Funktionsumfang > Hinweis zum Sperrgrund:** „auf Kopfebene zur Zahlung freigegeben“[17]
- **E17c · Funktionsumfang > Hinweis zum Sperrgrund:** „auf Positionsebene bleibt das Kennzeichen für den Sperrgrund gesetzt.“[17]

### Quelle [18] — Konfiguration von Workflow-Schritten
**Geltungsbereich:** SAP S/4HANA Cloud Public Edition: sichtbare Version 2608; über Herstellerverweis version=2608.500 geöffnet.[18]
- **E18a · Tabelle > Empfänger:** „Verantwortliche für alle verwendeten Kostenstellen“[18]
- **E18b · Tabelle > Vorbedingungen:** „Verantwortliche für alle verwendeten PSP-Elemente“[18]
- **E18c · Tabelle > Schritteigenschaften:** „Workflow-Initiator ausschließen“[18]
- **E18d · Tabelle > Ausnahmebehandlung > vollständig vorerfasste Rechnung:** „wird ein neuer Workflow gestartet.“[18]
- **E18e · Tabelle > Bestimmen der Reihenfolge:** „oder gebucht“[18]
- **E18f · Tabelle > Empfänger:** „von allen Empfängern“[18]

## Sources

[1] https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/accounting-distributions-subledger-journal-entries-vendor-invoices — Accounting distributions and journal entries for vendor invoices - Finance | Dynamics 365 | Microsoft Learn
[2] https://learn.microsoft.com/en-us/dynamics365/business-central/across-how-to-set-up-approval-users — Set up approval users - Business Central | Microsoft Learn
[3] https://knowledgecenter.docuware.com/docs/preconfigured-solutions-invoice-processing-uk — Invoice Processing for UK and other countries
[4] https://knowledgecenter.docuware.com/docs/preconfigured-solutions-invoice-processing-usa — Invoice Processing for US
[5] https://www.gesetze-im-internet.de/ustg_1980/__14.html — § 14 UStG - Einzelnorm
[6] https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/vendor-invoices-overview — Vendor invoices overview - Finance | Dynamics 365 | Microsoft Learn
[7] https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/three-way-matching-policies — Three-way matching policies - Finance | Dynamics 365 | Microsoft Learn
[8] https://learn.microsoft.com/en-us/dynamics365/business-central/across-how-use-approval-workflows — Approve or reject documents in workflows - Business Central | Microsoft Learn
[9] https://learn.microsoft.com/en-us/dynamics365/finance/cash-bank-management/tasks/vendor-payment-overview — Vendor payment overview - Finance | Dynamics 365 | Microsoft Learn
[10] https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/automate-vendor-payment-proposal — Automate vendor payment proposals - Finance | Dynamics 365 | Microsoft Learn
[11] https://learn.microsoft.com/en-ca/dynamics365/business-central/finance-set-up-cost-accounting — Set up cost accounting - Business Central | Microsoft Learn
[12] https://www.gesetze-im-internet.de/ustdv_1980/__33.html — § 33 UStDV - Einzelnorm
[13] https://learn.microsoft.com/en-us/dynamics365/business-central/finance-dimensions — Work with dimensions to track and analyze data - Business Central | Microsoft Learn
[14] https://learn.microsoft.com/en-gb/dynamics365/business-central/projects-how-manage-project-supplies — Manage project supplies - Business Central | Microsoft Learn
[15] https://learn.microsoft.com/en-us/dynamics365/business-central/purchasing-how-correct-cancel-unpaid-purchase-invoices — Amend or cancel unpaid purchase invoices - Business Central | Microsoft Learn
[16] https://learn.microsoft.com/en-us/dynamics365/business-central/purchasing-how-record-purchases — Record purchases with purchase invoices - Business Central | Microsoft Learn
[17] https://help.sap.com/docs/SAP_S4HANA_CLOUD/0e602d466b99490187fcbb30d1dc897c/9bd9a6b4124446a5b31ddfecbff07508.html?locale=de-DE&version=2608.500 — Workflows für Lieferantenrechnungen verwalten
[18] https://help.sap.com/docs/SAP_S4HANA_CLOUD/0e602d466b99490187fcbb30d1dc897c/81da6d475c614991aade9bfcdb864846.html?locale=de-DE&version=2608.500 — Konfiguration von Workflow-Schritten
