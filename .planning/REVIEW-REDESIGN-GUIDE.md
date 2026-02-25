# Review Page Redesign — Full Design Guide

> **Ziel:** Die Review-Seiten (Queue + Workspace) von "funktional" auf "best-in-class Review-Tool"
> heben. Inspiriert von professionellen Document-Review-Tools mit AI-Validierung.
>
> **Kontext:** rasolv.ai Design System — Clean Enterprise SaaS x Editorial Precision
> **Stack:** React 18 + Vite 6 + Tailwind v4 + shadcn/ui + Framer Motion v12
> **Pfad:** `MandantenPortalDesign/src/app/components/`
> **Stand:** 2026-02-23

---

## Inhaltsverzeichnis

0. [Aktueller Status](#0-aktueller-status)
1. [Design-Philosophie](#1-design-philosophie)
2. [Layout-Architektur: Workspace](#2-layout-architektur-workspace)
3. [Komponente: Workspace Header](#3-komponente-workspace-header)
4. [Komponente: AI-Validierungs-Panel](#4-komponente-ai-validierungs-panel)
5. [Komponente: Creditor Dot-Progress](#5-komponente-creditor-dot-progress)
6. [Komponente: Correction Form (Redesign)](#6-komponente-correction-form-redesign)
7. [Komponente: Smart Action Bar](#7-komponente-smart-action-bar)
8. [Komponente: Document Viewer Verbesserungen](#8-komponente-document-viewer-verbesserungen)
9. [Komponente: Review Queue Page (Polish)](#9-komponente-review-queue-page-polish)
10. [Keyboard Shortcuts](#10-keyboard-shortcuts)
11. [Motion & Transitions](#11-motion--transitions)
12. [Farb-Tokens & Semantik](#12-farb-tokens--semantik)
13. [Responsive Verhalten](#13-responsive-verhalten)
14. [Implementierungs-Reihenfolge](#14-implementierungs-reihenfolge)
15. [Dateien die sich aendern](#15-dateien-die-sich-aendern)

---

## 0. Aktueller Status

### Was bereits gebaut ist

| Komponente | Datei | Status |
|-----------|-------|--------|
| **Workspace Layout** | `review-workspace-page.tsx` | Funktional. 2-Panel ResizablePanelGroup, Header mit Back-Button, Titel, AZ-Badge, CircularProgress, Summary-Button. Loading/Error-States vorhanden. |
| **Correction Form** | `review-correction-form.tsx` | Funktional. Flat-Scroll-Layout (kein Tabs), left-border Farbcodierung (blau=AI, amber=fehlend, gruen=editiert), Legend-Sektion, Pruefhinweise-Banner. Euro-Prefix fuer Betrag. |
| **Action Bar** | `review-action-bar.tsx` | Funktional. 3 Buttons (Bestaetigen/Korrigieren/Ueberspringen), Skip-Reasons-Panel mit 5 Gruenden + Sonstiges, Loading-States, korrekte API-Payload-Logik. |
| **Document Viewer** | `enhanced-document-viewer.tsx` | Ausgereift. PDF.js Rendering, Image-Viewer mit Zoom/Pan, Iframe-Fallback, Zoom-Controls, Download/Print, progressive PDF-Lade-States. |
| **Creditor Selector** | `creditor-selector.tsx` | Komplett. Prev/Next Navigation, expandierbare Liste, farbige Status-Dots, Review-Badges. Braucht keine Aenderungen. |
| **Summary Dialog** | `review-summary-dialog.tsx` | Komplett. Stat-Cards, Per-Creditor-Liste, Revise-Funktion. Braucht keine Aenderungen. |
| **Queue Page** | `review-queue-page.tsx` | Funktional. KPI-Metrics, Filterable Table, Batch-Operationen, Confidence-Badges, Priority-Badges. |
| **Analytics Page** | `review-analytics-page.tsx` | Komplett. KPI-Cards, Charts (Line/Bar/Pie), Agent Performance Table. |
| **Motion Utils** | `motion-utils.tsx` | Umfangreiche Library. Framer Motion v12, Easing Curves, Spring Configs, Page/Tab/Collapse/Dropdown Variants, CountUp Hook. |
| **Review API** | `store/api/reviewApi.ts` | Komplett. Alle Endpoints (Queue, Data, Correction, Complete, Admin-Queue, Assign, Batch, Analytics). Cache-Tags: ReviewQueue, ReviewData. |
| **Review UI Slice** | `store/slices/reviewUiSlice.ts` | Minimal. State: `currentCreditorIndex`, `actions` Record, `skipReasonsEnabled`. |

### Was komplett fehlt (MUSS gebaut werden)

| Feature | Beschreibung | Prioritaet |
|---------|-------------|-----------|
| **AI-Validierungs-Panel** | Neue Komponente `review-ai-validation-panel.tsx` | HOCH |
| **Keyboard Shortcuts** | Neuer Hook `use-review-shortcuts.ts` | HOCH |
| **Timer im Header** | mm:ss pro Glaeubieger, reset bei Wechsel | HOCH |
| **Dot-Progress** | Ersetzt CircularProgress im Header | HOCH |
| **Context Subline** | "Heute X geprueft / Durchschnitt X min / Queue: X offen" | MITTEL |
| **Form Tabs** | Tabbed Interface statt Flat-Scroll | MITTEL |
| **2-Column Grid** | Kurze Felder nebeneinander (AZ + Betrag) | MITTEL |
| **Smart Empfehlung** | Action Bar empfiehlt Bestaetigen/Korrigieren | MITTEL |
| **Shortcut-Labels** | Tastaturkuerzel-Badges auf Buttons | MITTEL |
| **Inline Field Status** | Dots statt left-border Farbcodierung | NIEDRIG |
| **Info-Popover** | Original-AI-Wert pro Feld | NIEDRIG |
| **Doc-Typ Badge** | "PDF" / "E-Mail" / "Bild" Badge | NIEDRIG |
| **Thumbnail Strip** | Horizontale Thumbnails unten im Viewer | NIEDRIG |
| **Queue Quick-Start** | Prominenter CTA fuer naechsten Review | NIEDRIG |

### Design-System Compliance (aktueller Stand)

| Aspekt | Status | Anmerkung |
|--------|--------|-----------|
| Farb-Tokens | Konform | #FAFAFA bg, #111827 text, #FF5001 accent korrekt verwendet |
| Typografie | Konform | DM Sans body, JetBrains Mono fuer Daten |
| Spacing | Konform | 16px padding, 12px gaps |
| Border-Radius | Konform | 12px cards, 8px buttons, 9999px pills |
| Keine Shadows | Konform | Nirgendwo Shadows verwendet |
| Keine Gradients | Konform | Nur in Avatar-Komponente |
| Transitions | Konform | Alle max 150ms |

---

## 1. Design-Philosophie

### Kernprinzipien fuer die Review-Seite

Die Review Page ist das **Arbeitswerkzeug** der Kanzlei-Mitarbeiter. Sie verbringen hier Stunden am Tag.
Jede Designentscheidung muss diese Frage beantworten: **"Macht das den Reviewer schneller oder langsamer?"**

| Prinzip | Umsetzung |
|---------|-----------|
| **Scannability** | AI-Checkliste mit Yes/No Indikatoren statt Fliesstexst-Warnungen |
| **Keyboard-First** | Alle Hauptaktionen per Shortcut erreichbar |
| **Progressive Disclosure** | Nur zeigen was gerade relevant ist. Details on demand. |
| **Kontext-Bewusstsein** | Timer, Tages-Stats, Progress — der Reviewer weiss immer wo er steht |
| **Smart Defaults** | Button-Empfehlung basierend auf Confidence + Aenderungen |
| **Ruhige Aesthetik** | Kein visuelles Rauschen. Farbe nur wo sie Information transportiert. |

### Was sich NICHT aendert

- Grundlayout: 2-Panel (Document + Form) via `ResizablePanelGroup` (shadcn/ui)
- Design-System Token (Farben, Radien, Fonts, Spacing)
- Keine Shadows, keine Gradients, DM Sans / JetBrains Mono
- Backend-Endpoints bleiben identisch (`reviewApi.ts` unveraendert)
- RTK Query Hooks bleiben identisch
- `creditor-selector.tsx` — funktioniert gut, bleibt wie ist
- `review-summary-dialog.tsx` — bereits gut designed, bleibt wie ist

---

## 2. Layout-Architektur: Workspace

### IST-Stand (aktuell gebaut)

```
+--------------------------------------------------------------+
| Header: [<-] Review: Name [AZ] .............. (O) 9/27 [Zsfg]|
+--------------------------------------------------------------+
|  +---- Document Viewer ----+  +---- Right Panel ------------+|
|  |                          |  | CreditorSelector             ||
|  |  PDF.js / Image / iframe |  | Pruefhinweise (gelber Banner)||
|  |  [Zoom Controls]         |  | Legend (Blau/Amber/Gruen)    ||
|  |                          |  | Form Fields (scroll)         ||
|  |                          |  | ...                          ||
|  |                          |  | ActionBar (fixed bottom)     ||
|  +--------------------------+  +------------------------------+|
+--------------------------------------------------------------+
```

### SOLL (Redesign-Ziel)

```
+----------------------------------------------------------------------+
| Header: [<-] Review: Name [AZ]   (t) 02:34   ........O....  9/27 [?]|
| Subline: Heute 8 geprueft . Durchschnitt 2.1 min . Queue: 18 offen  |
+----------------------------------------------------------------------+
|  +---- Document Viewer -------+  +---- Right Panel -----------------+|
|  |                             |  |                                   ||
|  |  [Dok-Typ Badge]           |  | +- AI Validation Panel ----------+||
|  |                             |  | | KI-Pruefung           72%      |||
|  |  PDF / Image                |  | | V Name     V Betrag            |||
|  |                             |  | | X E-Mail   X Adresse           |||
|  |                             |  | | ========........ 72%           |||
|  |                             |  | +--------------------------------+||
|  |                             |  |                                   ||
|  |                             |  | [Glaeubieger v] [Vertreter] [!]  ||
|  |                             |  | +- Form -------------------------+||
|  |                             |  | | Name          [TEVEO...   (i)] |||
|  |                             |  | | AZ    Betrag                   |||
|  |                             |  | | [___] [EUR 698]                |||
|  |                             |  | | Adresse  [_______    /!\]      |||
|  |                             |  | | E-Mail   [_______    /!\]      |||
|  |                             |  | +--------------------------------+||
|  |                             |  |                                   ||
|  |                             |  | +- Action Bar -------------------+||
|  |                             |  | | 0 Korrekturen                  |||
|  |                             |  | | [V Enter] [# CmdS] [>>] [Bin] |||
|  |                             |  | +--------------------------------+||
|  +-----------------------------+  +-----------------------------------+|
+----------------------------------------------------------------------+
```

### Strukturelle Aenderungen

| Bereich | IST | SOLL |
|---------|-----|------|
| Header | 1 Zeile, minimal. CircularProgress SVG rechts. | 2 Zeilen: Haupt + Kontext-Subline. Dot-Progress inline. Timer. |
| Right Panel Top | Pruefhinweise Banner (gelb) + Legend (3 Farben) | AI-Validierungs-Panel (interaktiv, collapsible) |
| Form | Scroll-Liste, 1 Column, left-border Farbcodierung | Tabbed Sections (Glaeubieger/Vertreter), 2-Column Grid, Inline-Dots |
| Action Bar | 3 gleiche Buttons + separates Skip-Reasons Panel | Smart Bar mit Empfehlung + Shortcut-Labels + vereinfachtem Skip |
| Timer | Nicht vorhanden | Laufender Timer pro Glaeubieger (mm:ss, JetBrains Mono) |

---

## 3. Komponente: Workspace Header

**Datei:** `review-workspace-page.tsx` (Header-Sektion)

### IST-Stand

Aktuell hat der Header:
- Back-Button (32x32px, `ArrowLeft` Icon)
- Titel "Review: {name}" (18px, weight 700)
- Aktenzeichen Badge (JetBrains Mono, pill)
- CircularProgress (SVG, rechts, zeigt X/Y)
- Summary-Button ("Zusammenfassung", ghost style)

### SOLL-Layout

```
+------------------------------------------------------------------+
| Row 1:                                                            |
| [<-]  Review: Madeleine Gayretli  [1523_25]   (t) 02:34          |
|                                  ........O..  9/27    [Zsfg.]    |
|                                                                   |
| Row 2 (subtle):                                                   |
| Heute: 8 geprueft  .  Durchschnitt 2.1 min/Glaeubieger  .  Queue: 18 offen |
+------------------------------------------------------------------+
```

### Spezifikation: Row 1

| Element | Spec |
|---------|------|
| Back-Button | 32x32px, border 1px `--border`, radius 8px, `ArrowLeft` 16px. **Bereits korrekt gebaut.** |
| Titel "Review: Name" | 18px, weight 700, `--text-primary`. **Bereits korrekt gebaut.** |
| Aktenzeichen Badge | JetBrains Mono, 12px, `--text-secondary`, bg `--muted`, border `--border`, pill (9999px), padding 3px 10px. **Bereits korrekt gebaut.** |
| Timer (NEU) | 14px, JetBrains Mono, weight 600, `--text-primary`. Icon: `Timer` 14px, `--text-secondary`. Startet bei 00:00 wenn Glaeubieger wechselt. |
| Dot-Progress (NEU) | Siehe [Sektion 5](#5-komponente-creditor-dot-progress). **Ersetzt** bisherige `CircularProgress`. |
| Counter "9/27" | 13px, `--text-secondary`, weight 500. **Bleibt, aber neben Dot-Progress statt neben CircularProgress.** |
| Zusammenfassung Button | Ghost-Button, `LayoutList` 14px + "Zusammenfassung", 13px, weight 500, border 1px `--border`, radius 8px. **Bereits korrekt gebaut.** |

### Spezifikation: Row 2 (Context Subline — NEU)

| Element | Spec |
|---------|------|
| Container | padding-top 6px, flex row, gap 16px, items-center |
| Text | 12px, weight 400, `--text-secondary` |
| Separator | `.` Zeichen, same style |
| Werte (Zahlen) | 12px, weight 600, `--text-primary` |
| Gesamte Row | Nur sichtbar wenn Daten geladen. `opacity: 0 -> 1` transition 150ms |

### Timer-Logik (NEU)

```typescript
// In ReviewWorkspacePage — lokaler Timer State
const [timerSeconds, setTimerSeconds] = useState(0);
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

// Reset timer when creditor changes
useEffect(() => {
  setTimerSeconds(0);
  timerRef.current = setInterval(() => {
    setTimerSeconds((s) => s + 1);
  }, 1000);
  return () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };
}, [currentCreditorIndex]);

// Format: mm:ss
const formatTimer = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
```

### Kontext-Stats Datenquellen

| Stat | Quelle | Berechnung |
|------|--------|------------|
| "Heute: X geprueft" | `reviewActions` aus `reviewUiSlice` | `Object.keys(reviewActions).length` — Aktionen der aktuellen Session |
| "Durchschnitt X min" | Timer-Tracking | Durchschnitt der Timer-Werte pro abgeschlossenem Glaeubieger (Session-lokal, Array von Timern) |
| "Queue: X offen" | `ReviewDataResponse.review_session.progress.remaining_items` oder separater Queue-Count | Verbleibende Items |

### Aenderungen am bestehenden Code

1. **Entferne** die `CircularProgress`-SVG-Komponente (oder inline SVG)
2. **Ersetze** durch `DotProgress`-Komponente (siehe Sektion 5)
3. **Fuege hinzu:** Timer-Display links neben Dot-Progress
4. **Fuege hinzu:** Subline-Row unter Header-Row 1
5. **Behalte:** Back-Button, Titel, AZ-Badge, Summary-Button unveraendert

---

## 4. Komponente: AI-Validierungs-Panel

**Neue Komponente:** `review-ai-validation-panel.tsx`

**Ersetzt:** Den bisherigen gelben `Pruefhinweise`-Banner UND die `Legend`-Sektion in der `review-correction-form.tsx`.

### Layout

```
+-----------------------------------------------+
|  KI-Pruefung                        72% Match  |
|  --------------------------------------------- |
|                                                |
|  V  Glaeubieger-Name erkannt                   |
|  V  Forderungsbetrag erkannt                   |
|  X  E-Mail-Adresse fehlt                       |
|  X  Postadresse fehlt                          |
|  -  Glaeubiegervertreter nicht geprueft         |
|                                                |
|  ============........... 72%                   |
+-----------------------------------------------+
```

### Spezifikation

| Element | Spec |
|---------|------|
| Container | bg `--surface` (#FFFFFF), border 1px `--border` (#E5E7EB), radius 12px, padding 16px |
| Header "KI-Pruefung" | 13px, weight 600, `--text-primary`, uppercase, letter-spacing 0.04em |
| Percentage Badge | 13px, JetBrains Mono, weight 600. Farbe nach Confidence: <50% `--destructive`, 50-80% `--warning`, >80% `--success` |
| Divider | 1px solid `--border`, margin 8px 0 |
| Check Items | 13px, weight 400 |
| V Icon | `Check` (lucide-react) 14px, Farbe `--success` (#22C55E) |
| X Icon | `X` (lucide-react) 14px, Farbe `--destructive` (#EF4444) |
| - Icon | `Minus` (lucide-react) 14px, Farbe `--text-secondary` (#6B7280) |
| V Text | `--text-primary` (#111827) |
| X Text | `--destructive` (#EF4444), weight 500 |
| - Text | `--text-secondary` (#6B7280), italic |
| Item Spacing | gap 6px between items |
| Progress Bar Container | margin-top 12px |
| Progress Bar Track | height 4px, bg `--muted` (#F3F4F6), radius 9999px |
| Progress Bar Fill | height 4px, bg nach Confidence-Farbe, radius 9999px, transition width 300ms |

### Props-Interface

```typescript
interface AIValidationPanelProps {
  creditor: ReviewCreditorWithDocs['creditor'];
  onFieldClick?: (fieldKey: string) => void;  // Scrollt zum Formfeld
  className?: string;
}
```

### Datenstruktur

```typescript
interface AIValidationCheck {
  field: string;         // Formfeld-Key (z.B. 'sender_name')
  label: string;         // Display-Label (z.B. 'Glaeubieger-Name')
  status: 'found' | 'missing' | 'unchecked';
  confidence?: number;   // 0-1, optional per field
}
```

### Ableitung der Checks aus bestehenden Creditor-Daten

Die Creditor-Daten kommen via `useGetReviewDataQuery` aus `reviewApi.ts`.
Das Response-Objekt hat `review_session.creditors_with_docs[].creditor` mit allen Feldern.

```typescript
function deriveValidationChecks(creditor: ReviewCreditorWithDocs['creditor']): AIValidationCheck[] {
  return [
    {
      field: 'sender_name',
      label: 'Glaeubieger-Name erkannt',
      status: (creditor.sender_name || creditor.glaeubiger_name) ? 'found' : 'missing',
    },
    {
      field: 'claim_amount',
      label: 'Forderungsbetrag erkannt',
      status: creditor.claim_amount != null && creditor.claim_amount > 0 ? 'found' : 'missing',
    },
    {
      field: 'sender_email',
      label: 'E-Mail-Adresse vorhanden',
      status: (creditor.sender_email || creditor.email_glaeubiger) ? 'found' : 'missing',
    },
    {
      field: 'sender_address',
      label: 'Postadresse vorhanden',
      status: (creditor.sender_address || creditor.glaeubiger_adresse) ? 'found' : 'missing',
    },
    {
      field: 'reference_number',
      label: 'Aktenzeichen vorhanden',
      status: creditor.reference_number ? 'found' : 'missing',
    },
    {
      field: 'glaeubigervertreter_name',
      label: 'Glaeubiegervertreter',
      status: creditor.glaeubigervertreter_name ? 'found' : 'unchecked',
    },
  ];
}

function calculateConfidence(checks: AIValidationCheck[]): number {
  const relevant = checks.filter(c => c.status !== 'unchecked');
  if (relevant.length === 0) return 0;
  const found = relevant.filter(c => c.status === 'found').length;
  return Math.round((found / relevant.length) * 100);
}
```

### Interaktion

- **Klick auf Check-Item** -> Ruft `onFieldClick(check.field)` auf -> Scrollt zum entsprechenden Formfeld + kurzer orange Highlight-Pulse (150ms)
- **Collapsed State:** Wenn Confidence > 90% -> Panel collapsed by default (nur Header-Zeile sichtbar)
- **Expand/Collapse:** Klick auf Header togglet den Body. `ChevronDown` Icon rotiert 0deg <-> 180deg (100ms transition).

### Collapse/Expand Verhalten

```
Collapsed:
+-------------------------------------------+
|  KI-Pruefung  VVXx-  72%            [v]   |
+-------------------------------------------+

Expanded:
+-------------------------------------------+
|  KI-Pruefung                  72%    [^]   |
|  ---------------------------------------- |
|  V Glaeubieger-Name erkannt                |
|  ...                                       |
|  ============........... 72%               |
+-------------------------------------------+
```

Collapsed-State zeigt eine **Mini-Zusammenfassung**: kleine farbige Dots in einer Reihe (gruen/rot/grau) neben dem Prozent-Badge.

### Integration in Workspace

```typescript
// In review-workspace-page.tsx — Right Panel, VOR dem CreditorSelector:
<AIValidationPanel
  creditor={currentCreditor.creditor}
  onFieldClick={(field) => {
    // Scroll to field in form + highlight
    const el = document.querySelector(`[data-field="${field}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('field-highlight');
      setTimeout(() => el.classList.remove('field-highlight'), 500);
    }
  }}
/>
```

---

## 5. Komponente: Creditor Dot-Progress

**Neue Sub-Komponente:** Inline im Header, **ersetzt** die bisherige `CircularProgress` SVG.

### Layout

```
  ........O...............
  ^ gruen  ^aktiv  ^offen

  9 von 27 Glaeubieger
```

### Spezifikation

| Element | Spec |
|---------|------|
| Container | flex row, gap 3px, items-center |
| Dot (completed - confirm) | 6x6px circle, bg `--success` (#22C55E) |
| Dot (completed - correct) | 6x6px circle, bg `--info` (#3B82F6) |
| Dot (completed - skip) | 6x6px circle, bg `--warning` (#F59E0B) |
| Dot (current) | 8x8px circle, border 2px solid `--text-primary` (#111827), bg transparent |
| Dot (pending) | 6x6px circle, bg `--border` (#E5E7EB) |
| Counter Text | 13px, `--text-secondary`, "9 von 27" |
| Max Dots angezeigt | Wenn > 30 Glaeubieger: Zeige erste 12 + "..." + letzte 3 |

### Props-Interface

```typescript
interface DotProgressProps {
  total: number;
  currentIndex: number;
  creditors: ReviewCreditorWithDocs[];
  reviewActions: Record<string, CreditorReviewAction>;
  onDotClick?: (index: number) => void;
  className?: string;
}
```

### Klick-Verhalten

- Klick auf einen Dot -> `onDotClick(dotIndex)` -> setzt `currentCreditorIndex` via Redux dispatch
- Hover auf Dot -> Tooltip (shadcn `Tooltip`) mit Glaeubieger-Name + Status
- Cursor: pointer auf allen Dots

### Datenableitung

```typescript
type DotStatus = 'confirm' | 'correct' | 'skip' | 'current' | 'pending';

function getDotStatus(
  index: number,
  currentIndex: number,
  reviewActions: Record<string, CreditorReviewAction>,
  creditors: ReviewCreditorWithDocs[]
): DotStatus {
  if (index === currentIndex) return 'current';
  const creditorId = creditors[index]?.creditor.id;
  if (!creditorId) return 'pending';
  const action = reviewActions[creditorId]?.action;
  return action ?? 'pending';
}
```

### Dot-Farben

```css
confirm:  bg #22C55E  (success green)
correct:  bg #3B82F6  (info blue)
skip:     bg #F59E0B  (warning amber)
current:  bg transparent, border 2px #111827
pending:  bg #E5E7EB  (border gray)
```

### Truncation bei vielen Glauebieger

Wenn `total > 30`:
```
[12 Dots] ... [3 Dots]  (9 von 27)
```

Die "..." wird als 3 graue Dots mit etwas mehr gap (8px) dargestellt.

---

## 6. Komponente: Correction Form (Redesign)

**Datei:** `review-correction-form.tsx`

### IST-Stand

- **Flat-Scroll-Layout** mit zwei Sektionen (H3-Headers: "Glaeubieger" und "Glaeubiegervertreter")
- **Left-Border Farbcodierung:** `borderLeft: 3px solid` in Blau (AI), Amber (fehlend), Gruen (editiert)
- **Legend-Sektion** oben mit 3 Farben erklaert
- **Pruefhinweise-Banner** (gelb, oben) bei review_reasons
- Alle Felder **full-width**, **1 Column**
- Euro-Prefix fuer Forderungsbetrag bereits korrekt

### Hauptaenderungen (SOLL)

1. **Tabbed Sections** statt Flat-Scroll mit H3-Headers
2. **2-Column Grid** fuer kurze Felder (AZ + Betrag)
3. **Inline Field Status** statt linker Borduere
4. **Info-Popover** pro Feld fuer Original-AI-Wert
5. **Pruefhinweise-Banner bleibt** (aber wird kompakter)
6. **Legend-Sektion entfernt** (wird durch AI-Validierungs-Panel ersetzt)

### Tab-Struktur

```
[Glaeubieger]  [Vertreter]
```

**Tab: Glaeubieger** (default aktiv)
- Glaeubieger Name (full width)
- Aktenzeichen + Forderungsbetrag (2-column grid)
- Adresse (full width, textarea)
- E-Mail (full width)

**Tab: Vertreter**
- Glaeubiegervertreter Name (full width)
- Glaeubiegervertreter Adresse (full width, textarea)
- AZ Glaeubiegervertreter + E-Mail Vertreter (2-column grid)

### Tab-Styling

| Element | Spec |
|---------|------|
| Tab Container | flex row, border-bottom 1px `--border`, margin-bottom 16px |
| Tab Button (inactive) | 13px, weight 500, `--text-secondary`, padding 8px 16px, no border-bottom, cursor pointer |
| Tab Button (active) | 13px, weight 600, `--text-primary`, border-bottom 2px solid `--text-primary` |
| Tab Transition | border-bottom color 100ms |
| Vertreter-Tab Zusatz | Kleiner "Optional" Badge: 10px, `--text-secondary`, bg `--muted`, radius 9999px, padding 1px 6px |

**Hinweis:** Nicht die shadcn/ui `Tabs`-Komponente verwenden (zu viel Overhead). Einfacher lokaler State mit `useState<'glaeubieger' | 'vertreter'>('glaeubieger')`.

### 2-Column Grid

```
+------------------+  +------------------+
| Aktenzeichen     |  | Forderungsbetrag |
| +--------------+ |  | +--------------+ |
| | Pos. 14      | |  | | EUR 698.04   | |
| +--------------+ |  | +--------------+ |
+------------------+  +------------------+
```

```css
.form-grid-2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
```

In Tailwind v4: `grid grid-cols-2 gap-4`

### Field-Status Indikatoren (Redesign)

Statt der bisherigen `borderLeft: 3px solid ...` -> **Subtiler Inline-Indicator**:

```
+-----------------------------------------+
| Glaeubieger Name                    [(i)]|
| +-------------------------------------+ |
| | TEVEO Official Store          . AI  | |
| +-------------------------------------+ |
+-----------------------------------------+
```

| Status | Indikator | Spec |
|--------|-----------|------|
| AI-prefilled, unveraendert | Kleiner Dot rechts im Input + "AI" Label | Dot 6px, bg `--info` (#3B82F6), Label 10px, `--info` |
| Fehlend (kein AI-Wert) | Warning-Icon rechts im Input | `AlertTriangle` (lucide) 14px, `--warning` (#F59E0B) |
| User-editiert | Kleiner Dot rechts im Input | Dot 6px, bg `--success` (#10B981) |

**Implementierung:** `position: relative` auf Input-Wrapper, Icon/Dot als `position: absolute; right: 12px; top: 50%; transform: translateY(-50%)`. Input bekommt `padding-right: 36px`.

### Info-Popover (Original-AI-Wert)

- Icon: `Info` (lucide), 14px, `--text-secondary`, neben dem Label (nicht im Input)
- Klick -> Popover (shadcn `Popover`) zeigt:
  ```
  +------------------------------+
  | KI-extrahierter Wert:        |
  | "TEVEO Official Store"       |
  |                              |
  | Confidence: 85%              |
  | Quelle: Dokument S.3         |
  +------------------------------+
  ```
- Popover: bg `--surface`, border 1px `--border`, radius 8px, padding 12px, max-width 280px
- Text: 12px, `--text-secondary`; Wert: 13px, JetBrains Mono, `--text-primary`

### Bestehende Form-Logik beibehalten

Die Form verwendet aktuell `formValues` State und vergleicht mit `originalValues` um Aenderungen zu erkennen. Diese Logik bleibt **komplett identisch**. Nur das visuelle Layout aendert sich.

```typescript
// Bestehend — nicht aendern:
const [formValues, setFormValues] = useState<Record<string, string>>({});
const handleFieldChange = (field: string, value: string) => { ... };
// onConfirm, onCorrect, onSkip Callbacks bleiben identisch
```

### `data-field` Attribut fuer AI-Panel Scroll-Link

Jedes Formfeld-Wrapper bekommt ein `data-field` Attribut:

```tsx
<div data-field="sender_name" className="...">
  <label>Glaeubieger Name</label>
  <input ... />
</div>
```

Dies ermoeglicht das Scroll-to-Field Feature vom AI-Validierungs-Panel.

---

## 7. Komponente: Smart Action Bar

**Datei:** `review-action-bar.tsx`

### IST-Stand

- 3 Buttons: Bestaetigen (gruen outlined), Korrigieren (blau outlined), Ueberspringen (amber outlined)
- Skip-Reasons Panel: Slides up bei Toggle, zeigt 5 vordefinierte Gruende + "Sonstiges" Textfeld
- Loading-States auf allen Buttons
- Korrekte API-Payload-Logik (nur geaenderte Felder senden)
- Fixed bottom Positioning innerhalb Right Panel

### SOLL-Layout

```
+------------------------------------------------------+
|  2 Korrekturen . 1 fehlend                            |
|                                                      |
|  [V Bestaetigen Enter] [# Korrigieren CmdS] [>>] [X] |
|       ^ empfohlen                                    |
+------------------------------------------------------+
```

### Spezifikation

| Element | Spec |
|---------|------|
| Container | bg `--surface`, border-top 1px `--border`, padding 12px 16px. **Bereits korrekt.** |
| Status-Zeile (NEU) | 12px, `--text-secondary`, margin-bottom 8px |
| Korrektur-Count | weight 600, `--text-primary` |
| "fehlend" Count | weight 500, `--warning` |

### Buttons (aktualisiert)

| Button | Default Style | Empfohlen Style | Shortcut |
|--------|--------------|-----------------|----------|
| **Bestaetigen** | bg `#ECFDF5`, border 1px `#A7F3D0`, text `#065F46`, 13px weight 600. **Bereits so gebaut.** | + border 2px statt 1px | `Enter` |
| **Korrigieren** | bg `#EFF6FF`, border 1px `#BFDBFE`, text `#1E40AF`, 13px weight 600. **Bereits so gebaut.** | + border 2px statt 1px | `Cmd+S` / `Ctrl+S` |
| **Ueberspringen** | icon-only, bg transparent, border 1px `--border`, `SkipForward` 16px, `--text-secondary` | --- | `Cmd+->` / `Ctrl+->` |
| **Papierkorb** (Skip mit Grund) | icon-only, bg transparent, `Trash2` 16px, `--text-secondary`, border 1px `--border` | --- | --- |

### Shortcut-Label Styling (NEU)

```
Innerhalb des Buttons, rechts vom Text:

[V Bestaetigen  Enter]
                ^
                Shortcut-Label
```

| Element | Spec |
|---------|------|
| Shortcut-Badge | 10px, JetBrains Mono, `--text-secondary`, bg `--muted`, padding 1px 5px, radius 4px, margin-left 8px |
| Opacity | 0.6 default, 1.0 bei Button-Hover |

### Smart-Empfehlungs-Logik (NEU)

```typescript
type RecommendedAction = 'confirm' | 'correct' | null;

function getRecommendedAction(
  formValues: Record<string, string>,
  originalValues: Record<string, string>,
  missingFields: number
): RecommendedAction {
  const hasChanges = Object.keys(formValues).some(
    (k) => formValues[k] !== originalValues[k]
  );

  // User hat Felder geaendert -> Korrigieren empfehlen
  if (hasChanges) return 'correct';

  // Keine fehlenden Felder + keine Aenderungen -> Bestaetigen empfehlen
  if (missingFields === 0) return 'confirm';

  // Sonst: keine Empfehlung
  return null;
}
```

### Empfohlener Button — Visueller Unterschied

Nur `border-width: 2px` statt 1px. **Kein Glow, kein Shadow.**
Konform mit Design-System: Depth durch Border-Gewicht, nicht durch Effekte.

### Skip-Workflow (vereinfacht)

Bisheriger Skip zeigt ein aufklappbares Panel. Neuer Ansatz:

1. **Quick-Skip** (Haupt-Button `>>` icon-only): Skippt sofort ohne Grund
2. **Skip mit Grund** (Papierkorb-Icon): Oeffnet `DropdownMenu` (shadcn) mit den 5 Gruenden + "Sonstiges"

```
+-------------------------+
| Kein Glaeubieger-Dokument|
| Duplikat                |
| Unleserlich             |
| Unvollstaendig          |
| ----------------------- |
| Sonstiges...            |  -> Oeffnet kleines Textfeld inline
+-------------------------+
```

**Aenderung am bestehenden Code:** Das aktuelle Skip-Reasons Panel (das hochslided) wird durch ein `DropdownMenu` ersetzt. Weniger visueller Overhead, gleiche Funktionalitaet.

---

## 8. Komponente: Document Viewer Verbesserungen

**Datei:** `enhanced-document-viewer.tsx`

### IST-Stand

Der Document Viewer ist bereits **sehr ausgereift**:
- PDF.js Canvas-Rendering mit progressivem Laden
- Image-Viewer mit Zoom/Pan
- Iframe-Fallback
- Zoom-Controls (Preset-Buttons + Dropdown)
- Download + Print
- Loading Skeleton + Error States mit Retry

### Aenderungen (SOLL)

| Feature | Spec |
|---------|------|
| **Dokument-Typ Badge** (NEU) | Top-left im Viewer-Bereich (ueber dem Content): "E-Mail" / "Brief" / "PDF" / "Bild". Pill Badge: 11px, weight 600, bg `--muted`, text `--text-secondary`, border `--border`, radius 9999px, padding 2px 8px |
| **Toolbar** | Bestehende Toolbar beibehalten, aber: Minimale Version: [Zoom -] [65%] [Zoom +] [Neues Tab]. Kein ueberfluesssiger Chrome. **Groessttenteils bereits so.** |
| **Loading State** | **Bereits korrekt:** Skeleton mit Pulse. |
| **Error State** | **Bereits korrekt:** Inline-Message mit Retry-Button. |
| **Thumbnail-Strip** (NEU) | Thumbnails UNTEN als horizontale Strip statt links. Spart horizontalen Platz. |

### Thumbnail Strip (Unten)

```
+---------------------------------------------+
|                                             |
|              [Main Document View]            |
|                                             |
+---------------------------------------------+
| [Doc 1] [Doc 2] [Doc 3] [Doc 4]  <- scroll |
+---------------------------------------------+
```

| Element | Spec |
|---------|------|
| Strip Container | height 64px, border-top 1px `--border`, bg `--surface`, flex row, gap 8px, padding 8px 12px, overflow-x auto |
| Thumbnail | 48x48px, border 1px `--border`, radius 6px, object-fit cover, cursor pointer |
| Active Thumbnail | border 2px `--accent` (#FF5001) |
| Page Number | Centered below thumbnail, 10px, `--text-secondary` |

### Dokument-Typ Erkennung

```typescript
function getDocumentType(filename: string): string {
  const name = (filename || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'Bild';
  if (name.includes('email') || name.includes('mail')) return 'E-Mail';
  return 'Dokument';
}
```

---

## 9. Komponente: Review Queue Page (Polish)

**Datei:** `review-queue-page.tsx`

Die Queue Page ist bereits gut gebaut. Folgende Verfeinerungen:

### 9.1 Session-Stats Badge im Header

Neben den bestehenden KPI-Metrics ("X offen", "Y hohe Prioritaet", "Durchschnitt Z Tage"):

```
Zusaetzlich rechts:
| Heute: 12 geprueft |
```

- Zeigt an wie viele Reviews der Admin heute abgeschlossen hat
- Datenquelle: Lokaler Session-Counter oder API-Endpunkt
- Style: Wie bestehende Metrics (13px, `--text-secondary`, Zahl in weight 600 `--text-primary`)

### 9.2 Quick-Start Button

Prominenter CTA oben rechts fuer "naechsten Fall starten":

```
[> Review starten]
```

| Element | Spec |
|---------|------|
| Button | bg `--accent` (#FF5001), text white, 14px weight 600, radius 8px, padding 8px 16px |
| Icon | `Play` (lucide) 14px, vor dem Text |
| Aktion | Navigiert zum ersten (hoechste Prioritaet) Client in der Queue |
| Position | Rechts neben dem Titel, Row 1 |
| Regel | Das ist der **einzige orangene CTA** auf der Queue Page (max 1 pro Section) |

### 9.3 Confidence-Spalte Verbesserung

Statt nur einem Badge -> **Mini Progress Bar** + Zahl:

```
| ======.. 72% |
```

| Element | Spec |
|---------|------|
| Bar Track | width 40px, height 4px, bg `--muted`, radius 9999px, inline neben Zahl |
| Bar Fill | Farbe nach Confidence-Band: <50% rot, 50-80% gelb, >80% gruen. Radius 9999px. |
| Zahl | 12px, JetBrains Mono, Farbe wie bisheriger Badge |

### 9.4 Row Hover Enhancement

Beim Hover ueber eine Row zusaetzlich:
- Der **Name wird leicht unterstrichen** (text-decoration: underline, `--accent` color)
- Ein **`->`-Icon** erscheint ganz rechts (animated, translateX -4px -> 0, opacity 0 -> 1, 100ms)

---

## 10. Keyboard Shortcuts

**Neue Datei:** `use-review-shortcuts.ts` (Custom Hook)

### Shortcut-Map

| Shortcut | Aktion | Scope |
|----------|--------|-------|
| `Enter` | Bestaetigen (confirm) | Workspace, wenn kein Input fokussiert |
| `Cmd+S` / `Ctrl+S` | Korrigieren (correct + save) | Workspace (auch in Inputs) |
| `Cmd+->` / `Ctrl+->` | Ueberspringen (skip) | Workspace |
| `Cmd+<-` / `Ctrl+<-` | Vorheriger Glaeubieger | Workspace |
| `Escape` | Zurueck zur Queue | Workspace |
| `Cmd+Enter` / `Ctrl+Enter` | Summary Dialog oeffnen | Workspace |
| `1` | Tab "Glaeubieger" aktivieren | Form, wenn kein Input fokussiert |
| `2` | Tab "Vertreter" aktivieren | Form, wenn kein Input fokussiert |
| `?` | Shortcut-Hint Overlay anzeigen | Global |

### Implementierung

```typescript
import { useEffect, useCallback } from 'react';

interface ReviewShortcutHandlers {
  onConfirm: () => void;
  onCorrect: () => void;
  onSkip: () => void;
  onPrev: () => void;
  onEscape: () => void;
  onSummary: () => void;
  onTabSwitch?: (tab: 'glaeubieger' | 'vertreter') => void;
  onShowShortcuts?: () => void;
}

export function useReviewShortcuts(handlers: ReviewShortcutHandlers, enabled = true) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+S — always works, even in inputs
      if (e.key === 's' && isMeta) {
        e.preventDefault();
        handlers.onCorrect();
        return;
      }

      // Cmd/Ctrl+Enter
      if (e.key === 'Enter' && isMeta) {
        e.preventDefault();
        handlers.onSummary();
        return;
      }

      // Cmd/Ctrl+Right
      if (e.key === 'ArrowRight' && isMeta) {
        e.preventDefault();
        handlers.onSkip();
        return;
      }

      // Cmd/Ctrl+Left
      if (e.key === 'ArrowLeft' && isMeta) {
        e.preventDefault();
        handlers.onPrev();
        return;
      }

      // Don't trigger the following when typing in inputs
      if (isInput) return;

      // Enter (only when not in input)
      if (e.key === 'Enter') {
        e.preventDefault();
        handlers.onConfirm();
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      // Tab switching: 1 = Glaeubieger, 2 = Vertreter
      if (e.key === '1' && handlers.onTabSwitch) {
        handlers.onTabSwitch('glaeubieger');
        return;
      }
      if (e.key === '2' && handlers.onTabSwitch) {
        handlers.onTabSwitch('vertreter');
        return;
      }

      // ? = Show shortcuts overlay
      if (e.key === '?' && handlers.onShowShortcuts) {
        handlers.onShowShortcuts();
        return;
      }
    },
    [handlers, enabled]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

### Integration in Workspace

```typescript
// In review-workspace-page.tsx:
useReviewShortcuts({
  onConfirm: () => handleConfirm(),
  onCorrect: () => handleCorrect(),
  onSkip: () => handleSkip(),
  onPrev: () => handlePrevCreditor(),
  onEscape: () => navigate('/review'),
  onSummary: () => setShowSummary(true),
  onTabSwitch: (tab) => setActiveFormTab(tab),
  onShowShortcuts: () => setShowShortcutsDialog(true),
}, !showSummary);  // Disable when dialog open
```

### Shortcut-Hint Overlay

Beim ersten Besuch der Review-Seite (oder via `?`-Taste):

```
+-------------------------------------+
|  Tastaturkuerzel                     |
|  ---------------------------------  |
|  Enter       Bestaetigen            |
|  Cmd+S       Korrigieren & Speichern|
|  Cmd+->      Ueberspringen          |
|  Cmd+<-      Vorheriger Glaeubieger  |
|  Cmd+Enter   Zusammenfassung        |
|  Esc         Zurueck zur Queue      |
|                                     |
|  [Verstanden]                       |
+-------------------------------------+
```

- Styled als shadcn `Dialog`, max-width 360px
- Shortcut-Keys: JetBrains Mono, 12px, `--text-secondary`, bg `--muted`, padding 2px 6px, radius 4px
- Beschreibung: 13px, `--text-primary`
- Einmalig anzeigen -> `localStorage.setItem('review-shortcuts-seen', 'true')`
- Erneut aufrufbar ueber `?`-Taste oder ein kleines `Keyboard`-Icon im Header

---

## 11. Motion & Transitions

Alle Animationen verwenden bestehende `motion-utils.tsx` Patterns. Die Datei hat bereits umfangreiche Variants:
- `standardEasing`, `entranceEasing`, `exitEasing`
- `pageTransitionVariants`, `tabContentVariants`
- `expandCollapseVariants`, `dropdownVariants`
- `fadeInVariants`, `slideVariants`, `scaleVariants`
- `staggerContainerVariants`, `staggerItemVariants`
- `badgeSpring` Config
- `useCountUp` Hook

### Neue Variants (hinzufuegen in motion-utils.tsx)

```typescript
// AI Validation Panel expand/collapse (speziell fuer height-Animation)
export const aiPanelCollapseVariants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.15, ease: standardEasing },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.15, ease: standardEasing },
  },
};

// Dot-Progress dot appear (fuer neu abgeschlossene Dots)
export const dotCompleteVariants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring', stiffness: 400, damping: 20 },
  },
};

// Action Bar recommendation border (VERY subtle)
export const recommendBorderVariants = {
  default: { borderWidth: '1px' },
  recommended: {
    borderWidth: '2px',
    transition: { duration: 0.15 },
  },
};
```

### Transition-Regeln (Reminder)

- Max 150ms fuer alle CSS Transitions
- Keine Bounce-Effekte
- Keine dekorativen Animationen
- Spring-Configs nur fuer Micro-Interactions (Dots)
- `overflow: hidden` auf collapse-Containern

---

## 12. Farb-Tokens & Semantik

### Review-spezifische Farb-Verwendung

| Kontext | Farbe | Token | Hex |
|---------|-------|-------|-----|
| Bestaetigt / AI korrekt | Gruen | `--success` | `#22C55E` |
| Korrigiert / User-editiert | Blau | `--info` | `#3B82F6` |
| Uebersprungen / Warnung | Amber | `--warning` | `#F59E0B` |
| Fehlt / Error | Rot | `--destructive` | `#EF4444` |
| Nicht geprueft / Neutral | Grau | `--text-secondary` | `#6B7280` |
| Aktiv / Aktuell | Schwarz | `--text-primary` | `#111827` |
| CTA (max 1 pro Section) | Orange | `--accent` | `#FF5001` |

### Badge-Varianten (Outlined + Tinted)

Alle Badges folgen dem **outlined + tinted** Pattern (nie solid gefuellt):

```css
/* Beispiel: Bestaetigt Badge */
background-color: #ECFDF5;    /* success/5% */
border: 1px solid #A7F3D0;    /* success/30% */
color: #065F46;                /* success/dark */
border-radius: 9999px;
padding: 2px 10px;
font-size: 12px;
font-weight: 600;
```

| Status | Background | Border | Text |
|--------|-----------|--------|------|
| Bestaetigt | `#ECFDF5` | `#A7F3D0` | `#065F46` |
| Korrigiert | `#EFF6FF` | `#BFDBFE` | `#1E40AF` |
| Uebersprungen | `#FFFBEB` | `#FDE68A` | `#92400E` |
| Fehler | `#FEF2F2` | `#FECACA` | `#991B1B` |
| Neutral | `#F9FAFB` | `#E5E7EB` | `#6B7280` |

**Diese Farben werden bereits korrekt in `review-action-bar.tsx` verwendet.**

---

## 13. Responsive Verhalten

### Breakpoints

| Breakpoint | Verhalten |
|-----------|-----------|
| `>= 1440px` | Volle 2-Panel Ansicht, 60/40 Split |
| `1024-1439px` | 2-Panel, aber Minimum-Sizes greifen. AI-Panel collapsed by default. |
| `768-1023px` | Stacked Layout: Document oben (50vh), Form unten (scroll). Tabs weiterhin. |
| `< 768px` | Nicht primaer unterstuetzt (Admin-Tool). Grundlegende Nutzbarkeit via stacked Layout. |

### Panel Minimum Sizes (bestehend)

```typescript
<ResizablePanel defaultSize={60} minSize={35}>  {/* Document */}
<ResizablePanel defaultSize={40} minSize={30}>  {/* Form */}
```

### AI-Panel Responsive

- >= 1440px: AI-Panel **expanded** by default (wenn Confidence < 90%)
- 1024-1439px: AI-Panel **collapsed** by default
- < 1024px: AI-Panel unter dem Document Viewer, vor der Form

---

## 14. Implementierungs-Reihenfolge

### Wave 1: Quick Wins (High Impact, Low Effort)

| # | Komponente | Aufwand | Dateien | Abhaengigkeiten |
|---|-----------|---------|---------|----------------|
| 1.1 | **Keyboard Shortcuts Hook** | Klein | Neue: `use-review-shortcuts.ts` | Keine |
| 1.2 | **Dot-Progress** | Klein | Neue: Inline-Komponente in `review-workspace-page.tsx` | Braucht `reviewActions` aus Slice |
| 1.3 | **Workspace Header Redesign** (Timer + Subline + Dot-Progress Integration) | Klein | `review-workspace-page.tsx` | 1.2 |
| 1.4 | **Smart Action Bar** (Shortcuts + Empfehlung + Skip-Simplification) | Mittel | `review-action-bar.tsx` | 1.1 |

### Wave 2: Core Redesign

| # | Komponente | Aufwand | Dateien | Abhaengigkeiten |
|---|-----------|---------|---------|----------------|
| 2.1 | **AI-Validierungs-Panel** | Mittel | Neue: `review-ai-validation-panel.tsx` | Keine |
| 2.2 | **Form Tabs + 2-Column Grid** | Mittel | `review-correction-form.tsx` | Keine |
| 2.3 | **Inline Field Status** (ersetzt left-border) | Klein | `review-correction-form.tsx` | 2.2 |
| 2.4 | **Info-Popover fuer Original-Werte** | Klein | `review-correction-form.tsx` | 2.3 |
| 2.5 | **AI-Panel + Form Integration** (data-field scroll-link) | Klein | `review-workspace-page.tsx` | 2.1 + 2.2 |

### Wave 3: Polish

| # | Komponente | Aufwand | Dateien | Abhaengigkeiten |
|---|-----------|---------|---------|----------------|
| 3.1 | **Document Viewer: Typ-Badge + Thumbnail Strip** | Mittel | `enhanced-document-viewer.tsx` | Keine |
| 3.2 | **Queue Page: Quick-Start + Confidence-Bar** | Klein | `review-queue-page.tsx` | Keine |
| 3.3 | **Shortcut-Hint Overlay** | Klein | Inline in `review-workspace-page.tsx` | 1.1 |
| 3.4 | **Motion Variants** (aiPanelCollapse, dotComplete, recommendBorder) | Klein | `motion-utils.tsx` | Keine |

### Parallelisierbar

Innerhalb jeder Wave koennen Items ohne Abhaengigkeiten parallel gebaut werden:
- Wave 1: 1.1 + 1.2 parallel, dann 1.3 + 1.4
- Wave 2: 2.1 + 2.2 parallel, dann 2.3, dann 2.4, dann 2.5
- Wave 3: Alle parallel moeglich

---

## 15. Dateien die sich aendern

### Neue Dateien

| Datei | Beschreibung |
|-------|-------------|
| `review-ai-validation-panel.tsx` | AI-Checklisten-Komponente mit Expand/Collapse |
| `use-review-shortcuts.ts` | Keyboard Shortcuts Hook fuer Review Workspace |

### Geaenderte Dateien

| Datei | Aenderungen |
|-------|-----------|
| `review-workspace-page.tsx` | Header Redesign (Timer, Subline, Dot-Progress), Integration AI-Panel, Shortcut-Hook, Summary Shortcuts-Dialog |
| `review-correction-form.tsx` | Tabs (Glaeubieger/Vertreter), 2-Column Grid, Inline Field Status, Info-Popover, `data-field` Attribute, Legend+Banner entfernen |
| `review-action-bar.tsx` | Smart-Empfehlung (border 2px), Shortcut-Labels auf Buttons, Skip-Reasons als DropdownMenu statt Panel |
| `enhanced-document-viewer.tsx` | Dokument-Typ Badge (pill, top-left), Thumbnail-Strip (horizontal, unten) |
| `review-queue-page.tsx` | Quick-Start Button (orange CTA), Session-Stats Badge, Confidence Mini-Bar, Row Hover Enhancement |
| `motion-utils.tsx` | 3 neue Variants: `aiPanelCollapseVariants`, `dotCompleteVariants`, `recommendBorderVariants` |

### Dateien die NICHT geaendert werden

| Datei | Grund |
|-------|-------|
| `creditor-selector.tsx` | Komplett und gut designed — keine Aenderungen noetig |
| `review-summary-dialog.tsx` | Komplett und gut designed — keine Aenderungen noetig |
| `reviewApi.ts` | Alle Endpoints vorhanden, keine API-Aenderungen noetig |
| `review-analytics-page.tsx` | Komplett — eigene Seite, nicht Teil des Redesigns |
| `reviewUiSlice.ts` | **Minimal:** Timer-Zeiten-Array fuer Durchschnittsberechnung hinzufuegen (optional, kann auch lokal in Workspace State) |
| `sidebar.tsx` | Nur in Wave 3 (optional, Collapsible im Review-Modus) — vorerst nicht |

---

## Appendix A: Design-System Checkliste

Vor jeder Aenderung pruefen:

- [ ] Hintergrund ist `#FAFAFA`, nicht `#FFFFFF` (Page-Level)
- [ ] Cards/Panels sind `#FFFFFF` mit border 1px `#E5E7EB`
- [ ] Kein Shadow, kein Gradient (ausser Avatar)
- [ ] Font ist DM Sans (Mono-Daten in JetBrains Mono)
- [ ] Max 1 orangener CTA (`#FF5001`) pro Section
- [ ] Badges sind outlined + tinted, nicht solid
- [ ] Border-Radius: Cards 12px, Buttons/Inputs 8px, Badges pill (9999px)
- [ ] Transitions max 150ms, funktional
- [ ] Touch-Targets min 44px
- [ ] Farben nur aus dem Token-System
- [ ] `cn()` fuer className-Merging (aus `ui/utils.ts`)
- [ ] Icons aus `lucide-react`, 14-16px

## Appendix B: Bestehende Imports & Dependencies

Die Review-Komponenten verwenden folgende gemeinsame Imports:

```typescript
// UI Components (shadcn/ui)
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from './ui/resizable';

// Icons (lucide-react)
import {
  ArrowLeft, Check, X, Minus, Timer, SkipForward, Trash2,
  ChevronDown, Info, AlertTriangle, Play, Keyboard, LayoutList,
  ArrowRight
} from 'lucide-react';

// Motion
import { motion, AnimatePresence } from 'framer-motion';
import { ... } from './motion-utils';

// State
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectCurrentCreditorIndex, selectReviewActions, setCurrentCreditorIndex } from '../../store/slices/reviewUiSlice';
import { useGetReviewDataQuery } from '../../store/api/reviewApi';

// Utils
import { cn } from './ui/utils';
```

## Appendix C: Type-Referenzen

Zentrale Typen aus `app/types.ts`:

```typescript
// ReviewCreditorWithDocs — das Hauptobjekt pro Glaeubieger
interface ReviewCreditorWithDocs {
  creditor: {
    id: string;
    sender_name?: string;
    glaeubiger_name?: string;
    claim_amount?: number;
    sender_email?: string;
    email_glaeubiger?: string;
    sender_address?: string;
    glaeubiger_adresse?: string;
    reference_number?: string;
    glaeubigervertreter_name?: string;
    glaeubigervertreter_adresse?: string;
    aktenzeichen_glaeubigervertreter?: string;
    email_glaeubigervertreter?: string;
    // ... weitere v7-Felder
  };
  documents: ClientDetailDocument[];
}

// CreditorReviewAction — gespeicherte Aktion
interface CreditorReviewAction {
  action: 'confirm' | 'correct' | 'skip';
  corrections?: Record<string, string>;
  skipReason?: string;
}
```
