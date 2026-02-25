# Review Summary & Final View — Design Spec

> **Ziel:** Den Zusammenfassungs-Dialog und den Abschluss-Flow des Review Workspace
> von "funktional" auf "durchdacht & klar" heben. Zwei verschiedene UI-Patterns
> fuer zwei verschiedene Kontexte.
>
> **Stand:** 2026-02-24
> **Betrifft:** `review-summary-dialog.tsx` (Redesign) + `review-workspace-page.tsx` (neuer Final View)
> **Design-System:** rasolv.ai — Clean Enterprise SaaS x Editorial Precision

---

## Inhaltsverzeichnis

1. [Zwei Kontexte, zwei UIs](#1-zwei-kontexte-zwei-uis)
2. [Mid-Review Summary Modal (Redesign)](#2-mid-review-summary-modal-redesign)
3. [Final Completion View (Neuer Inline-View)](#3-final-completion-view-neuer-inline-view)
4. [Success State (Post-Completion)](#4-success-state-post-completion)
5. [Datenstruktur & State-Management](#5-datenstruktur--state-management)
6. [Transitions & Motion](#6-transitions--motion)
7. [Design-System Compliance](#7-design-system-compliance)
8. [Implementierungs-Plan](#8-implementierungs-plan)
9. [Dateien-Uebersicht](#9-dateien-uebersicht)

---

## 1. Zwei Kontexte, zwei UIs

| Kontext | Trigger | UI-Pattern | Zweck |
|---------|---------|------------|-------|
| **Mid-Review Check** | User klickt "Zusammenfassung" bei z.B. 5/19 | **Modal-Dialog** (Overlay) | Fortschritt pruefen, einzelne Glaeubieger revisieren, dann zurueck zum Workspace |
| **Finaler Abschluss** | Letzter Glaeubieger bearbeitet ODER alle Dots gefuellt | **Inline Full View** (ersetzt beide Workspace-Panels) | Gesamtuebersicht, Bestaetigung, Abschluss, Erfolgs-Feedback |

### Warum zwei verschiedene UIs?

- **Modal** = schnell oeffnen/schliessen, Workspace bleibt im Hintergrund intakt
- **Full View** = nach dem letzten Glaeubieger hat der Workspace (PDF + Form) keinen Zweck mehr.
  Der Reviewer braucht jetzt volle Aufmerksamkeit auf Zusammenfassung + Abschluss-Aktion.
  Mehr Platz fuer Glaeubieger-Liste mit Betraegen, Gesamtforderung, etc.

### State-Uebergang

```
Workspace (Review-Phase)
    |
    |-- Klick "Zusammenfassung" --> Modal (Mid-Review)
    |                                  |
    |                                  |-- "Zurueck" --> Workspace
    |                                  |-- Klick auf Glaeubieger --> Workspace (springt zu Index)
    |
    |-- Letzter Glaeubieger bearbeitet --> Final View (ersetzt Panels)
    |                                          |
    |                                          |-- "Zurueck zum Review" --> Workspace (letzter Index)
    |                                          |-- "Abschliessen" --> Confirmation Step
    |                                                                    |
    |                                                                    |-- "Jetzt abschliessen" --> API Call --> Success State
    |                                                                    |-- "Zurueck" --> Final View
```

---

## 2. Mid-Review Summary Modal (Redesign)

**Datei:** `review-summary-dialog.tsx`

### IST-Stand (Probleme)

- 3 grosse StatCards nehmen viel Platz ein, zeigen oft 0/0/0
- Flache Glaeubieger-Liste ohne Gruppierung — schwer scannbar bei 19+ Eintraegen
- Kein Forderungsbetrag pro Glaeubieger sichtbar
- Keine Gesamtforderung
- "Abschliessen" Button immer klickbar, auch bei offenen Glaeubiigern

### SOLL-Layout

```
+------------------------------------------------------+
|  Review-Zusammenfassung                            X  |
|  Pascal Ernemann                                      |
|                                                       |
|  === Fortschritt ===================================  |
|  ████████████░░░░░░░░░░░░░░░░░░░░  5 von 19 geprueft |
|                                                       |
|  3 Bestaetigt  ·  1 Korrigiert  ·  1 Uebersprungen   |
|  Gesamtforderung: EUR 12.450,00                       |
|                                                       |
|  /!\ 14 Glaeubieger noch nicht bearbeitet             |
|                                                       |
|  --- Ausstehend (14) -------------------------v----   |
|  | (o) Real Solutions Inkasso      EUR 1.200  >   |   |
|  | (o) KSP                         EUR 698    >   |   |
|  | (o) KSP Rechtsanwaelte          EUR 3.500  >   |   |
|  | ...                                            |   |
|  -------------------------------------------------   |
|                                                       |
|  --- Bearbeitet (5) --------------------------v----   |
|  | (V) Suedelbe Inkasso   Bestaetigt  EUR 800 >   |   |
|  | (#) Zaag               Korrigiert  EUR 450 >   |   |
|  | (>>) DKV               Ueberspr.  EUR 200 >   |   |
|  | ...                                            |   |
|  -------------------------------------------------   |
|                                                       |
|                               [Zurueck zum Review]    |
+------------------------------------------------------+
```

### Spezifikation

#### Header

| Element | Spec |
|---------|------|
| Titel "Review-Zusammenfassung" | 20px, weight 700, `#111827` |
| Client-Name | 14px, weight 400, `#6B7280` |
| X-Button | Bestehend, unveraendert |

#### Progress Bar (NEU — ersetzt StatCards)

| Element | Spec |
|---------|------|
| Container | margin-bottom 16px |
| Bar Track | height 6px, bg `#F3F4F6`, radius 9999px, width 100% |
| Bar Fill | height 6px, bg `#111827`, radius 9999px, transition width 300ms |
| Text rechts | 13px, `#6B7280`, weight 500. Format: "X von Y geprueft" |

#### Inline Stats (NEU — ersetzt StatCards)

Statt der 3 grossen farbigen StatCards: **Eine kompakte Textzeile**.

```
3 Bestaetigt  ·  1 Korrigiert  ·  1 Uebersprungen
Gesamtforderung: EUR 12.450,00
```

| Element | Spec |
|---------|------|
| Container | flex column, gap 4px, margin-bottom 12px |
| Zeile 1: Action-Counts | 13px, weight 400, `#6B7280` |
| Zahlen in Zeile 1 | weight 600, Farbe je nach Aktion (Bestaetigt: `#059669`, Korrigiert: `#2563EB`, Uebersprungen: `#D97706`) |
| Separator "·" | `#D1D5DB` |
| Zeile 2: Gesamtforderung | 14px, weight 600, `#111827`, JetBrains Mono |
| EUR-Prefix | 14px, weight 400, `#6B7280` |

#### Warning Banner

Nur sichtbar wenn `pending > 0`. Unveraendert zum IST-Stand (gelber Banner).

| Element | Spec |
|---------|------|
| Container | bg `#FFFBEB`, border 1px `#FDE68A`, radius 10px, padding 12px 14px |
| Icon | `AlertTriangle` 16px, `#D97706` |
| Text | 13px, `#92400E` |

#### Gruppierte Glaeubieger-Liste (NEU)

Statt einer flachen Liste: **Zwei collapsible Gruppen**.

**Gruppe 1: "Ausstehend"** (default expanded wenn pending > 0)
**Gruppe 2: "Bearbeitet"** (default expanded wenn pending === 0, sonst collapsed)

| Element | Spec |
|---------|------|
| Gruppen-Header | 12px, uppercase, weight 600, letter-spacing 0.04em, `#6B7280`, padding 10px 14px, bg `#F9FAFB`, border-bottom 1px `#E5E7EB` |
| Gruppen-Count | 12px, weight 400, `#9CA3AF`, nach dem Label in Klammern |
| Collapse-Toggle | `ChevronDown` 14px, `#9CA3AF`, rotation 0deg (open) / -90deg (closed), transition 100ms |
| Gruppen-Container | border 1px `#E5E7EB`, radius 10px, overflow hidden |
| Gruppen-Body | max-height 280px, overflow-y auto (scrollbar bei vielen Eintraegen) |

#### Glaeubieger-Row (ueberarbeitet)

```
(icon)  Glaeubieger-Name          Status-Label   EUR 1.200,00   >
```

| Element | Spec |
|---------|------|
| Container | flex row, align-items center, gap 12px, padding 12px 14px, border-bottom 1px `#F3F4F6` |
| Hover | bg `rgba(0,0,0,0.02)`, transition 100ms |
| Cursor | pointer (Klick geht zurueck zum Review bei diesem Index) |
| Status-Icon | Bestehende `StatusIcon`-Komponente, 18px |
| Glaeubieger-Name | 13px, weight 500, `#374151`, flex 1, text-overflow ellipsis |
| Status-Label | 11px, weight 500, Farbe nach Aktion. Nur bei "Bearbeitet"-Gruppe sichtbar. |
| Forderungsbetrag (NEU) | 13px, JetBrains Mono, weight 500, `#374151`, whiteSpace nowrap, flex-shrink 0 |
| EUR-Prefix | 11px, weight 400, `#9CA3AF`, margin-right 2px |
| Chevron | `ChevronRight` 14px, `#D1D5DB` |

#### Footer

| Element | Spec |
|---------|------|
| Container | padding 16px 24px, border-top 1px `#F3F4F6` |
| "Zurueck zum Review" Button | Outlined: border 1px `#E5E7EB`, bg white, text `#374151`, 14px weight 500, radius 8px, padding 9px 18px |
| KEIN "Abschliessen" Button im Modal | Der Abschluss passiert NUR im Final View — bewusste Trennung |

### Entfernte Elemente

- **StatCards** (3 grosse farbige Kaesten) → ersetzt durch Progress Bar + Inline Stats
- **"Abschliessen" Button** im Modal → nur noch im Final View
- **Ungroupierte Flat-Liste** → ersetzt durch gruppierte, collapsible Sektionen

---

## 3. Final Completion View (Neuer Inline-View)

**Datei:** `review-workspace-page.tsx` (neuer State `viewPhase: 'review' | 'final'`)

Der Final View **ersetzt beide Panels** (Document Viewer + Right Panel) des Workspace.
Der Header bleibt bestehen (Timer stoppt, Dot-Progress zeigt finalen Stand).

### Trigger

```typescript
// In review-workspace-page.tsx:
// Wenn letzter Glaeubieger bearbeitet wird -> handleActionComplete setzt viewPhase
const [viewPhase, setViewPhase] = useState<'review' | 'final' | 'success'>('review');

// In handleActionComplete:
if (isLastCreditor) {
  setViewPhase('final');  // statt setShowSummary(true)
}
```

### Layout

```
+----------------------------------------------------------------------+
| Header: [<-] Review: Name [AZ]  (t) 04:12  OOOOOOOOOOOO  19/19      |
| Subline: Heute 19 geprueft . Durchschnitt 1.8 min . Queue: 3 offen  |
+----------------------------------------------------------------------+
|                                                                      |
|          +-- Zentrierter Content (max-width 640px) ----+             |
|          |                                             |             |
|          |  Review abschliessen                        |             |
|          |  Pascal Ernemann · AZ 157_26                |             |
|          |                                             |             |
|          |  === Ergebnis ============================  |             |
|          |                                             |             |
|          |  +--------+  +--------+  +---------+       |             |
|          |  |   15   |  |   3    |  |    1    |       |             |
|          |  |Bestät. |  |Korrig. |  |Überspr. |       |             |
|          |  +--------+  +--------+  +---------+       |             |
|          |                                             |             |
|          |  Gesamtforderung                            |             |
|          |  EUR 24.850,00                              |             |
|          |                                             |             |
|          |  --- Glaeubieger (19) ----------------v--   |             |
|          |  | (V) Real Solutions Inkasso  EUR 1.2k |   |             |
|          |  | (#) KSP                    EUR 698   |   |             |
|          |  | (V) KSP Rechtsanwaelte     EUR 3.5k  |   |             |
|          |  | (>>) DKV                   EUR 200   |   |             |
|          |  | ...                                  |   |             |
|          |  --------------------------------------|   |             |
|          |                                             |             |
|          |  [Zurueck zum Review]  [Abschliessen ->]    |             |
|          |                                             |             |
|          +---------------------------------------------+             |
|                                                                      |
+----------------------------------------------------------------------+
```

### Spezifikation

#### Aeusserer Container

| Element | Spec |
|---------|------|
| Container | Ersetzt den gesamten `<ResizablePanelGroup>` Bereich |
| Background | `#FAFAFA` (Page-Hintergrund) |
| Inner | max-width 640px, margin 0 auto, padding 40px 24px |
| Vertikale Ausrichtung | flex column, gap 32px |

#### Section: Titel-Block

| Element | Spec |
|---------|------|
| "Review abschliessen" | 24px, weight 700, `#111827` |
| Client-Info | 14px, weight 400, `#6B7280`. Format: "Name · AZ Aktenzeichen" |
| AZ-Wert | JetBrains Mono, same size/color |

#### Section: Ergebnis-Stats

3 kompakte Stat-Karten in einer Reihe. Aehnlich wie vorher, aber **verfeinert**:

| Element | Spec |
|---------|------|
| Container | display grid, grid-template-columns 1fr 1fr 1fr, gap 12px |
| Card | border 1px solid [Farb-Border], radius 10px, padding 16px, text-align center |
| Card "Bestaetigt" | Border `#A7F3D0`, bg `#ECFDF5` |
| Card "Korrigiert" | Border `#BFDBFE`, bg `#EFF6FF` |
| Card "Uebersprungen" | Border `#FDE68A`, bg `#FFFBEB` |
| Zahl | 28px, weight 700, JetBrains Mono, Farbe je Aktion (`#065F46` / `#1E40AF` / `#92400E`) |
| Label | 12px, weight 500, Farbe je Aktion (gleich wie Zahl, aber 60% opacity) |

> **Unterschied zum alten Modal:** Im Final View haben die StatCards Berechtigung,
> weil sie das *finale Ergebnis* zeigen — nicht einen Zwischenstand mit 0/0/0.
> Im Mid-Review Modal werden sie durch die kompaktere Inline-Stats-Zeile ersetzt.

#### Section: Gesamtforderung

| Element | Spec |
|---------|------|
| Label "Gesamtforderung" | 11px, uppercase, weight 600, letter-spacing 0.04em, `#6B7280` |
| Betrag | 32px, weight 700, JetBrains Mono, `#111827` |
| EUR-Prefix | 16px, weight 400, `#6B7280`, margin-right 4px |
| Container | border-top 1px `#E5E7EB`, border-bottom 1px `#E5E7EB`, padding 20px 0 |

#### Section: Glaeubieger-Liste

Collapsible Liste aller Glaeubieger, **nach Aktion sortiert** (Bestaetigt zuerst, dann Korrigiert, Uebersprungen, zuletzt Ausstehend falls vorhanden).

| Element | Spec |
|---------|------|
| Container | border 1px `#E5E7EB`, radius 12px, overflow hidden, bg `#FFFFFF` |
| Header | 12px, uppercase, weight 600, letter-spacing 0.04em, `#6B7280`, padding 12px 16px, bg `#F9FAFB`, border-bottom 1px `#E5E7EB` |
| Count im Header | 12px, weight 400, `#9CA3AF` |
| Collapse-Toggle | `ChevronDown` 14px, `#9CA3AF`, transition 100ms |
| Max-Height Body | 320px, overflow-y auto |

**Glaeubieger-Row im Final View:**

```
(icon)  Glaeubieger-Name          Bestaetigt   EUR 1.200,00   >
```

| Element | Spec |
|---------|------|
| Row | flex row, align-items center, gap 12px, padding 12px 16px, border-bottom 1px `#F3F4F6` |
| Hover | bg `rgba(0,0,0,0.02)`, cursor pointer |
| Klick-Aktion | Geht zurueck zu `viewPhase: 'review'` und springt zum Index |
| Status-Icon | Bestehende `StatusIcon` Komponente, 16px |
| Name | 13px, weight 500, `#374151`, flex 1, overflow ellipsis |
| Status-Badge | Pill: 11px, weight 600, outlined+tinted (siehe Badge-Farbtabelle unten), radius 9999px, padding 2px 8px |
| Betrag | 13px, JetBrains Mono, weight 500, `#374151`, flex-shrink 0 |
| Chevron | `ChevronRight` 14px, `#D1D5DB`, opacity 0.5 default, opacity 1 on row hover, transition 100ms |

**Badge-Farbtabelle (Outlined + Tinted):**

| Status | Background | Border | Text |
|--------|-----------|--------|------|
| Bestaetigt | `#ECFDF5` | `#A7F3D0` | `#065F46` |
| Korrigiert | `#EFF6FF` | `#BFDBFE` | `#1E40AF` |
| Uebersprungen | `#FFFBEB` | `#FDE68A` | `#92400E` |
| Ausstehend | `#F9FAFB` | `#E5E7EB` | `#6B7280` |

#### Section: Action Buttons

| Element | Spec |
|---------|------|
| Container | display flex, justify-content flex-end, gap 12px, padding-top 8px |
| "Zurueck zum Review" | Outlined: border 1px `#E5E7EB`, bg `#FFFFFF`, text `#374151`, 14px weight 500, radius 8px, padding 9px 20px. Hover: border `#D1D5DB`, bg `#F9FAFB`. |
| "Abschliessen" | **CTA (orange)**: bg `#FF5001`, text white, 14px weight 600, radius 8px, padding 9px 20px, no border. Hover: bg `#E04500`. **Einziger orangener CTA im View.** |
| Disabled-State (Abschliessen) | opacity 0.5, cursor not-allowed. Disabled wenn API-Call laeuft. |
| Loading-State | `Loader2` Icon 14px animiert (spin) vor dem Text, Text wird "Wird abgeschlossen..." |

### Confirmation Step (Optional — Empfehlung: JA bauen)

Wenn der User "Abschliessen" klickt, wird **innerhalb des Final View** ein Confirmation-Block eingeblendet
(kein separater Dialog — bleibt im gleichen View, ersetzt die Buttons):

```
+--------------------------------------------------+
|  /!\  Sind Sie sicher?                            |
|                                                   |
|  19 Glaeubieger werden bestaetigt.                |
|  Der Mandant erhaelt eine E-Mail mit der          |
|  Glaeubieger-Liste und Portal-Zugang.             |
|                                                   |
|  [Abbrechen]  [Jetzt abschliessen]               |
+--------------------------------------------------+
```

| Element | Spec |
|---------|------|
| Container | bg `#FFFBEB`, border 1px `#FDE68A`, radius 12px, padding 20px 24px |
| Icon | `AlertTriangle` 18px, `#D97706`, inline vor Titel |
| Titel "Sind Sie sicher?" | 16px, weight 600, `#92400E` |
| Body-Text | 13px, weight 400, `#92400E`, line-height 1.5 |
| "Abbrechen" Button | Ghost: no border, no bg, text `#6B7280`, 13px weight 500 |
| "Jetzt abschliessen" | bg `#FF5001`, text white, 14px weight 600, radius 8px |

**Transition:** Der Confirmation-Block ersetzt die normalen Action-Buttons mit einer 150ms Fade-In Animation.

---

## 4. Success State (Post-Completion)

Nach erfolgreichem API-Call (`completeReview`) wird der Final View durch einen **Success State** ersetzt.
Kein Modal, kein Redirect — der Erfolg wird **im gleichen View** angezeigt.

### Layout

```
+----------------------------------------------------------------------+
| Header: [<-] Review: Name [AZ]  (t) 04:12  OOOOOOOOOOOO  19/19      |
+----------------------------------------------------------------------+
|                                                                      |
|          +-- Zentrierter Content (max-width 480px) ----+             |
|          |                                             |             |
|          |              (V)                             |             |
|          |                                             |             |
|          |       Review abgeschlossen                  |             |
|          |                                             |             |
|          |  19 Glaeubieger · EUR 24.850,00             |             |
|          |                                             |             |
|          |  ----------------------------------------   |             |
|          |                                             |             |
|          |  [V]  E-Mail an Mandant gesendet            |             |
|          |  [V]  Glaeubieger-Kontakt wird vorbereitet  |             |
|          |  [V]  Status auf "Warte auf Bestaetigung"   |             |
|          |                                             |             |
|          |  ----------------------------------------   |             |
|          |                                             |             |
|          |         [Naechster Fall ->]                  |             |
|          |         Zurueck zur Queue                    |             |
|          |                                             |             |
|          +---------------------------------------------+             |
|                                                                      |
+----------------------------------------------------------------------+
```

### Spezifikation

#### Aeusserer Container

| Element | Spec |
|---------|------|
| Container | max-width 480px, margin 0 auto, padding 60px 24px, text-align center |
| Vertikale Ausrichtung | flex column, align-items center, gap 24px |

#### Success-Icon

| Element | Spec |
|---------|------|
| Icon | `CheckCircle` (lucide), 48px |
| Farbe | `#22C55E` (success green) |
| Animation | scale 0 -> 1, spring (stiffness 300, damping 15), delay 100ms |

#### Titel & Summary

| Element | Spec |
|---------|------|
| "Review abgeschlossen" | 24px, weight 700, `#111827` |
| Summary-Zeile | 14px, weight 400, `#6B7280`. Format: "X Glaeubieger · EUR Y" |
| Betrag | JetBrains Mono, weight 600, `#111827` |

#### Divider

| Element | Spec |
|---------|------|
| Linie | width 100%, height 1px, bg `#E5E7EB`, margin 8px 0 |

#### Checklist (API-Ergebnis)

| Element | Spec |
|---------|------|
| Container | text-align left, width 100% |
| Row | flex row, align-items center, gap 10px, padding 6px 0 |
| Check-Icon | `Check` (lucide) 16px, `#22C55E`, bg `#ECFDF5`, padding 2px, border-radius 9999px |
| Text | 13px, weight 400, `#374151` |
| Stagger-Animation | Jede Zeile erscheint mit 80ms Delay (staggerItemVariants aus motion-utils) |

**Checklist-Items (dynamisch basierend auf API-Response):**

```typescript
const checklistItems = [
  {
    show: true, // immer
    text: `${result.creditors_count} Glaeubieger bestaetigt`,
  },
  {
    show: result.client_email_sent,
    text: 'E-Mail an Mandant gesendet',
  },
  {
    show: !result.client_email_sent,
    text: 'Glaeubieger-Liste im Portal sichtbar',
    isWarning: true, // amber statt gruen
  },
  {
    show: true,
    text: `Status: ${result.client?.current_status || 'Aktualisiert'}`,
  },
];
```

#### Action Buttons

| Element | Spec |
|---------|------|
| "Naechster Fall" | **CTA (orange)**: bg `#FF5001`, text white, 14px weight 600, radius 8px, padding 10px 24px. **Einziger orangener CTA.** |
| Icon im CTA | `ArrowRight` 14px, nach dem Text |
| "Zurueck zur Queue" | Ghost-Link: no border, no bg, 13px weight 500, `#6B7280`, text-decoration underline on hover |
| Abstand | gap 12px, flex column, align-items center |

**"Naechster Fall" Logik:**

```typescript
// Bereits bestehend in handleComplete():
// 1. Fetch naechsten Fall aus Queue
// 2. Wenn vorhanden: navigate(`/review/${nextClientId}`)
// 3. Wenn Queue leer: navigate('/review') + Toast "Keine weiteren Faelle"
```

---

## 5. Datenstruktur & State-Management

### Neuer State in `review-workspace-page.tsx`

```typescript
// Bestehend:
const [showSummary, setShowSummary] = useState(false);

// NEU:
type ViewPhase = 'review' | 'final' | 'success';
const [viewPhase, setViewPhase] = useState<ViewPhase>('review');
const [completionResult, setCompletionResult] = useState<CompleteReviewResponse | null>(null);
const [showConfirmation, setShowConfirmation] = useState(false);
```

### Aenderungen an `handleActionComplete`

```typescript
const handleActionComplete = useCallback((action: ReviewAction) => {
  if (currentCreditor) {
    dispatch(recordReviewAction({ creditorId: currentCreditor.id, action }));
  }
  completedTimesRef.current.push(timerSecondsRef.current);

  if (isLastCreditor) {
    setViewPhase('final');  // NEU: Final View statt Modal
  } else {
    dispatch(setCurrentCreditorIndex(currentCreditorIndex + 1));
  }
}, [currentCreditor, dispatch, isLastCreditor, currentCreditorIndex]);
```

### Neuer `handleAbschliessen` (im Final View)

```typescript
const handleAbschliessen = useCallback(async () => {
  try {
    const result = await completeReview(clientId).unwrap();
    setCompletionResult(result);
    setViewPhase('success');
    toast.success('Review abgeschlossen');
  } catch (err) {
    toast.error('Review konnte nicht abgeschlossen werden');
    setShowConfirmation(false); // Zurueck zu Action-Buttons
  }
}, [clientId, completeReview]);
```

### Berechnung der Gesamtforderung

```typescript
const totalClaimAmount = useMemo(() => {
  return activeCreditorList.reduce((sum, item) => {
    const amount = item.creditor.claim_amount;
    return sum + (typeof amount === 'number' && isFinite(amount) ? amount : 0);
  }, 0);
}, [activeCreditorList]);

const formatEuro = (value: number) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
```

### Sortierung fuer Final View

```typescript
const sortedCreditors = useMemo(() => {
  const order: Record<string, number> = { confirm: 0, correct: 1, skip: 2 };
  return [...activeCreditorList].sort((a, b) => {
    const actionA = reviewActions[a.creditor.id]?.action;
    const actionB = reviewActions[b.creditor.id]?.action;
    const orderA = actionA ? (order[actionA] ?? 3) : 3;
    const orderB = actionB ? (order[actionB] ?? 3) : 3;
    return orderA - orderB;
  });
}, [activeCreditorList, reviewActions]);
```

---

## 6. Transitions & Motion

### Workspace -> Final View

```typescript
// Der Uebergang vom 2-Panel Workspace zum Final View
// Nutze fadeInVariants aus motion-utils.tsx

<AnimatePresence mode="wait">
  {viewPhase === 'review' && (
    <motion.div key="review" {...fadeInVariants}>
      <ResizablePanelGroup>...</ResizablePanelGroup>
    </motion.div>
  )}
  {viewPhase === 'final' && (
    <motion.div key="final" {...fadeInVariants}>
      <FinalCompletionView ... />
    </motion.div>
  )}
  {viewPhase === 'success' && (
    <motion.div key="success" {...fadeInVariants}>
      <SuccessView ... />
    </motion.div>
  )}
</AnimatePresence>
```

### Success-Icon Animation

```typescript
// Spring-Animation fuer das grosse Checkmark
<motion.div
  initial={{ scale: 0, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
>
  <CheckCircle size={48} color="#22C55E" />
</motion.div>
```

### Checklist Stagger

```typescript
// Nutze staggerContainerVariants + staggerItemVariants aus motion-utils.tsx
<motion.div variants={staggerContainerVariants} initial="hidden" animate="show">
  {checklistItems.map((item) => (
    <motion.div key={item.text} variants={staggerItemVariants}>
      ...
    </motion.div>
  ))}
</motion.div>
```

### Confirmation-Block Einblenden

```typescript
// Einfacher Fade + Slide-Up
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.15 }}
>
  {/* Confirmation content */}
</motion.div>
```

### Alle Transitions

| Transition | Dauer | Easing | Typ |
|-----------|-------|--------|-----|
| View-Wechsel (review/final/success) | 200ms | ease-out | Fade |
| Confirmation-Block | 150ms | ease-out | Fade + Slide(8px) |
| Success-Icon | Spring | stiffness 300, damping 15 | Scale |
| Checklist-Items | 80ms stagger | ease-out | Fade + Slide |
| Collapse/Expand Gruppen | 150ms | ease-in-out | Height |

---

## 7. Design-System Compliance

| Aspekt | Konformitaet | Anmerkung |
|--------|-------------|-----------|
| Hintergrund | `#FAFAFA` fuer Page, `#FFFFFF` fuer Cards/Panels | Korrekt |
| Keine Shadows | Keine Shadows irgendwo | Korrekt |
| Keine Gradients | Keine Gradients (ausser Avatar) | Korrekt |
| Font | DM Sans Body, JetBrains Mono fuer Betraege/AZ | Korrekt |
| Max 1 Orange CTA | Pro View nur 1x `#FF5001` (Abschliessen / Naechster Fall) | Korrekt |
| Badges outlined+tinted | Alle Status-Badges folgen dem Pattern | Korrekt |
| Border-Radius | Cards 12px, Buttons 8px, Badges 9999px | Korrekt |
| Transitions | Alle <= 200ms, funktional | Korrekt |
| Touch-Targets | Alle Buttons >= 44px Hoehe | Pruefen |
| Farb-Tokens | Nur System-Farben verwendet | Korrekt |

---

## 8. Implementierungs-Plan

### Schritt 1: State-Erweiterung (Workspace)

**Datei:** `review-workspace-page.tsx`

- `viewPhase` State hinzufuegen (`'review' | 'final' | 'success'`)
- `completionResult` State hinzufuegen
- `showConfirmation` State hinzufuegen
- `handleActionComplete` aendern: `setViewPhase('final')` statt `setShowSummary(true)` bei letztem Glaeubieger
- `handleAbschliessen` als neuer Handler (API-Call + State-Transition)
- Conditional Rendering: `viewPhase === 'review'` zeigt Workspace, `'final'` zeigt Final View, `'success'` zeigt Success State

### Schritt 2: Final Completion View (Neue Komponente)

**Neue Datei:** `review-final-view.tsx`

Extrahierte Komponente fuer den Final View mit:
- Titel-Block, StatCards, Gesamtforderung
- Sortierte Glaeubieger-Liste
- Action-Buttons mit Confirmation-Step
- Props: `clientId`, `clientName`, `aktenzeichen`, `creditors`, `reviewActions`, `totalClaimAmount`, `onBack`, `onComplete`, `isCompleting`

### Schritt 3: Success View (Neue Komponente)

**Neue Datei:** `review-success-view.tsx`

Extrahierte Komponente fuer den Success State mit:
- Animiertes Checkmark
- Zusammenfassungs-Zeile
- Dynamische Checklist
- Navigation-Buttons (Naechster Fall / Queue)
- Props: `completionResult`, `onNextCase`, `onBackToQueue`

### Schritt 4: Mid-Review Modal Redesign

**Datei:** `review-summary-dialog.tsx`

- StatCards durch Progress Bar + Inline Stats ersetzen
- Glaeubieger-Liste gruppieren (Ausstehend / Bearbeitet)
- Forderungsbetrag pro Glaeubieger hinzufuegen
- "Abschliessen" Button entfernen
- Gesamtforderung hinzufuegen
- Collapsible Gruppen implementieren

### Schritt 5: Integration & Polish

- AnimatePresence fuer View-Wechsel
- Timer stoppt bei `viewPhase !== 'review'`
- Header-Subline passt sich an (zeigt finalen Stand)
- Keyboard Shortcuts deaktiviert in Final/Success View
- "Zusammenfassung" Button im Header aendert Verhalten:
  - In `review` Phase: Oeffnet Modal (wie bisher)
  - In `final` Phase: Versteckt (bereits im Final View)

---

## 9. Dateien-Uebersicht

### Neue Dateien

| Datei | Beschreibung |
|-------|-------------|
| `review-final-view.tsx` | Final Completion View Komponente (StatCards, Glaeubieger-Liste, Confirmation) |
| `review-success-view.tsx` | Success State Komponente (Checkmark, Checklist, Navigation) |

### Geaenderte Dateien

| Datei | Aenderungen |
|-------|-----------|
| `review-workspace-page.tsx` | `viewPhase` State, Conditional Rendering (review/final/success), AnimatePresence, `handleAbschliessen`, Timer-Stopp-Logik |
| `review-summary-dialog.tsx` | Progress Bar statt StatCards, Inline Stats, Gruppierte Liste, Forderungsbetraege, "Abschliessen" Button entfernt |

### Unveraenderte Dateien

| Datei | Grund |
|-------|-------|
| `review-action-bar.tsx` | Keine Aenderungen noetig |
| `review-correction-form.tsx` | Keine Aenderungen noetig |
| `creditor-selector.tsx` | Keine Aenderungen noetig |
| `enhanced-document-viewer.tsx` | Keine Aenderungen noetig |
| `reviewApi.ts` | `completeReview` Mutation bereits vorhanden |
| `reviewUiSlice.ts` | Evtl. minor: `viewPhase` koennte auch hier rein, aber lokaler State reicht |
