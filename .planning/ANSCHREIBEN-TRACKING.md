# Anschreiben Tracking — Feature Specification

> Canvas-basierte Visualisierung des Gläubiger-Anschreiben-Flows pro Mandant.
> Zeigt den Status aller Erstschreiben und Gläubiger-Antworten als interaktiven Node-Graph.

---

## 1. Übersicht

### Problem
Der Aktivität-Tab zeigt nur eine flache Timeline von Status-Events. Es gibt keine visuelle Darstellung davon, welche Erstschreiben an welche Gläubiger gesendet wurden und welche davon bereits beantwortet sind. Admins müssen sich den Stand mühsam aus Einzelfeldern zusammensuchen.

### Lösung
Eine eigene Route `/clients/:id/tracking` mit einer React Flow Canvas-Ansicht. Erreichbar über eine Figma-style "File Card" im Aktivität-Tab. Der Canvas zeigt pro Gläubiger den Kommunikations-Flow als Node-Graph: Erstschreiben gesendet → Antwort erhalten (oder ausstehend).

### Scope
- **In Scope:** 1. Runde (Erstschreiben + Gläubiger-Antworten)
- **Out of Scope:** Settlement Plan (2. Runde), Nullplan, Echtzeit-Updates

---

## 2. User Flow

```
Mandant Detail → Aktivität Tab
  ↓
  Tracking File Card (Thumbnail + "1. Anschreiben Tracking" + Status-Badge)
  ↓ Click
  /clients/:id/tracking (eigene Route, volle Seite)
  ↓
  Header: Back-Button + Mandantenname + Aktenzeichen
  ↓
  React Flow Canvas mit Dot-Background
    → Pro Gläubiger eine Zeile: [Email-Node] ──→ [Response-Node]
    → Interaktion: Pan, Zoom, Fit-to-View
    → Klick auf Node: Sidebar/Popover mit Details
```

---

## 3. Datenmodell

### Quelle: Bestehender Client Detail Endpoint
`GET /api/clients/:clientId` liefert `final_creditor_list[]` mit allen benötigten Feldern.

**Kein neuer API-Endpoint nötig.**

### Relevante Felder pro Creditor (Backend: `creditorSchema`)

| Feld | Typ | Zweck |
|------|-----|-------|
| `id` | String | Unique ID |
| `sender_name` | String | Gläubiger-Name (Anzeige) |
| `glaeubiger_name` | String | Alternativer Name |
| `reference_number` | String | Aktenzeichen beim Gläubiger |
| `claim_amount` | Number | Ursprüngliche Forderungshöhe |
| `contact_status` | Enum | **Kern-Status für Tracking** |
| `email_sent_at` | Date | Wann Erstschreiben gesendet |
| `document_sent_at` | Date | Wann Dokument gesendet |
| `first_round_document_filename` | String | Dateiname des DOCX |
| `side_conversation_id` | String | Zendesk SC-ID |
| `response_received_at` | Date | Wann Antwort eingegangen |
| `creditor_response_text` | String | Volltext der Antwort |
| `current_debt_amount` | Number | Neue Forderungshöhe aus Antwort |
| `amount_source` | Enum | Quelle des Betrags |
| `sender_email` | String | E-Mail des Gläubigers |

### `contact_status` Enum — Die Kern-Logik

```
'no_response'              → Kein Kontakt bisher (default)
'main_ticket_created'      → Zendesk-Ticket erstellt, E-Mail noch nicht raus
'email_sent_with_document' → Erstschreiben per E-Mail gesendet
'email_failed'             → Zustellung fehlgeschlagen
'responded'                → Gläubiger hat geantwortet
'no_email_manual_contact'  → Keine E-Mail vorhanden, manueller Kontakt nötig
```

### Fehlende Frontend-Types (MUSS ergänzt werden)

`ClientDetailCreditor` in `types.ts` fehlen diese Felder:

```typescript
// Creditor Contact Tracking Fields (1. Anschreiben)
contact_status?: 'no_response' | 'main_ticket_created' | 'email_sent_with_document'
  | 'email_failed' | 'responded' | 'no_email_manual_contact';
email_sent_at?: string;
document_sent_at?: string;
first_round_document_filename?: string;
first_round_document_url?: string;
side_conversation_id?: string;
side_conversation_created_at?: string;
last_contacted_at?: string;

// Response Data
current_debt_amount?: number;
creditor_response_amount?: number;
creditor_response_text?: string;
response_received_at?: string;
amount_source?: 'creditor_response' | 'original_document' | 'default_fallback';

// Zendesk
main_zendesk_ticket_id?: string;
```

---

## 4. Architektur

### Dateistruktur

```
MandantenPortalDesign/src/
├── app/
│   ├── App.tsx                                    ← Route hinzufügen
│   ├── types.ts                                   ← ClientDetailCreditor erweitern
│   ├── pages/
│   │   └── LetterTrackingPage.tsx                 ← NEU: Page-Wrapper
│   └── components/
│       ├── client-detail.tsx                      ← TrackingCard einbauen
│       └── tracking/                              ← NEU: Feature-Ordner
│           ├── TrackingCard.tsx                    ← Figma-Style Entry Card
│           ├── TrackingCanvas.tsx                  ← React Flow Container
│           ├── TrackingHeader.tsx                  ← Page Header mit Back-Nav
│           ├── CreditorDetailPanel.tsx             ← Seitenleiste bei Node-Klick
│           └── nodes/
│               ├── EmailNode.tsx                   ← Custom Node: Erstschreiben
│               └── ResponseNode.tsx                ← Custom Node: Gläubiger-Antwort
```

### Dependency

```
@xyflow/react  (React Flow v12 — TypeScript-first, tree-shakable, ~50kB gzip)
```

Installation: `cd MandantenPortalDesign && npm install @xyflow/react`

---

## 5. Komponenten-Spezifikation

### 5.1 TrackingCard — Entry Point im Aktivität-Tab

> Inspiriert von Figma's File Cards (Bild 1). Zeigt eine Mini-Vorschau des Tracking-Canvas.

**Position:** Oberhalb der bestehenden Activity-Timeline in `renderActivity()`.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │           (Thumbnail Preview Area)          │   │  ← #F3F4F6 background
│   │                                             │   │     Dots pattern
│   │     ┌──────┐ ─ ─ ─ ─ ┌──────┐              │   │     Mini-Nodes (vereinfacht)
│   │     │ ✉    │          │ ?    │              │   │
│   │     └──────┘          └──────┘              │   │
│   │     ┌──────┐ ─ ─ ─ ─ ┌──────┐              │   │
│   │     │ ✉    │          │ ✓    │              │   │
│   │     └──────┘          └──────┘              │   │
│   │                                             │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   ┌─ Icon ─┐                                        │
│   │ 📄     │  1. Anschreiben Tracking               │  ← DM Sans, 14px, semibold
│   │        │  3 von 5 beantwortet · vor 2 Tagen     │  ← 12px, --text-secondary
│   └────────┘                                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Styling:**
- Outer Container: `background: #FFFFFF`, `border: 1px solid #E5E7EB`, `border-radius: 12px`
- Thumbnail Area: `background: #F3F4F6`, `border-radius: 8px` (inner), Höhe ~140px
- Hover: `border-color: #D1D5DB` (--border-strong), `cursor: pointer`
- Transition: `border-color 100ms ease`
- Mini-Nodes im Thumbnail: Vereinfachte Rechtecke (6px radius, 1px border), keine Details
- Max-Width: `320px` (Card soll nicht die volle Breite einnehmen)

**Props:**
```typescript
interface TrackingCardProps {
  clientId: string;
  creditors: ClientDetailCreditor[];
  onNavigate: () => void;
}
```

**Berechnung Status-Badge:**
```typescript
const sent = creditors.filter(c =>
  c.contact_status === 'email_sent_with_document' || c.contact_status === 'responded'
).length;
const responded = creditors.filter(c => c.contact_status === 'responded').length;
const total = creditors.length;

// Badge-Text: "{responded} von {total} beantwortet"
// Wenn total === 0: "Noch keine Anschreiben"
```

**Sichtbarkeit:**
- Card wird nur angezeigt wenn `client.creditor_contact_started === true` ODER mindestens ein Creditor `contact_status !== 'no_response'` hat.

---

### 5.2 LetterTrackingPage — Route Wrapper

**Route:** `/clients/:id/tracking`

```typescript
function LetterTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading, error } = useGetClientDetailQuery(id!);

  // Loading / Error / Not Found states...

  return (
    <div style={{ backgroundColor: '#FAFAFA', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TrackingHeader
        clientName={`${client.firstName} ${client.lastName}`}
        aktenzeichen={client.aktenzeichen}
        onBack={() => navigate(`/clients/${id}`)}
      />
      <TrackingCanvas creditors={client.final_creditor_list} />
    </div>
  );
}
```

**Loading State:** Skeleton mit pulsierendem `#F3F4F6` Background (kein Spinner).

---

### 5.3 TrackingHeader — Navigation & Context

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Zurück zu Viktoria Schlegel    AZ-2025-0042    3/5 beantwortet      │
│                                    └─ JetBrains Mono, 12px             │
└──────────────────────────────────────────────────────────────────────────┘
```

**Styling:**
- Container: `background: #FFFFFF`, `border-bottom: 1px solid #E5E7EB`, `padding: 16px 24px`
- Back-Link: `color: #6B7280`, hover `color: #111827`, `font-size: 14px`
  - Lucide `ArrowLeft` Icon (16px), gap 8px
- Client Name: Teil des Back-Links (kein separates Element)
- Aktenzeichen: `font-family: JetBrains Mono`, `font-size: 12px`, `color: #6B7280`
  - `background: #F3F4F6`, `padding: 2px 8px`, `border-radius: 4px`
- Status-Badge (rechts): Outlined + tinted pill
  - Responded > 0: `--success` green tinted
  - Alle pending: `--warning` amber tinted
  - Hat Failures: `--destructive` red tinted

---

### 5.4 TrackingCanvas — React Flow Container

> Die Kernkomponente. Zeigt den Node-Graph mit Dot-Background.

**React Flow Setup:**
```typescript
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

**Canvas Config:**
- `Background`: variant `dots`, color `#D1D5DB`, gap `20`, size `1.5`
- `Controls`: Position bottom-right, styled mit Design-Tokens
- `MiniMap`: Optional, nur bei > 8 Gläubigern anzeigen
- `fitView`: true (beim Laden automatisch alle Nodes sichtbar)
- `nodesDraggable`: false (feste Positionen)
- `nodesConnectable`: false (read-only)
- `panOnDrag`: true
- `zoomOnScroll`: true

**Node-Generierung aus Creditor-Daten:**

```typescript
function buildFlowElements(creditors: ClientDetailCreditor[]): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const ROW_HEIGHT = 140;        // Vertikaler Abstand zwischen Gläubiger-Lanes
  const COL_WIDTH = 320;         // Horizontaler Abstand zwischen Node-Spalten
  const START_X = 80;
  const START_Y = 60;

  creditors.forEach((creditor, index) => {
    const y = START_Y + index * ROW_HEIGHT;
    const emailNodeId = `email-${creditor.id}`;
    const responseNodeId = `response-${creditor.id}`;

    // Email Node (links) — Erstschreiben
    nodes.push({
      id: emailNodeId,
      type: 'emailNode',
      position: { x: START_X, y },
      data: {
        creditorName: creditor.glaeubiger_name || creditor.sender_name || 'Unbekannt',
        referenceNumber: creditor.reference_number,
        claimAmount: creditor.claim_amount,
        emailSentAt: creditor.email_sent_at || creditor.document_sent_at,
        contactStatus: creditor.contact_status || 'no_response',
        documentFilename: creditor.first_round_document_filename,
        senderEmail: creditor.sender_email,
      },
    });

    // Response Node (rechts) — Gläubiger-Antwort
    nodes.push({
      id: responseNodeId,
      type: 'responseNode',
      position: { x: START_X + COL_WIDTH, y },
      data: {
        creditorName: creditor.glaeubiger_name || creditor.sender_name || 'Unbekannt',
        contactStatus: creditor.contact_status || 'no_response',
        responseReceivedAt: creditor.response_received_at,
        responseText: creditor.creditor_response_text,
        currentDebtAmount: creditor.current_debt_amount,
        originalClaimAmount: creditor.claim_amount,
        amountSource: creditor.amount_source,
      },
    });

    // Edge: Email → Response
    edges.push({
      id: `edge-${creditor.id}`,
      source: emailNodeId,
      target: responseNodeId,
      type: 'default',
      style: {
        stroke: creditor.contact_status === 'responded' ? '#22C55E' : '#D1D5DB',
        strokeWidth: 1.5,
        strokeDasharray: creditor.contact_status === 'responded' ? 'none' : '6 4',
      },
      animated: creditor.contact_status === 'email_sent_with_document', // Pulsing für "wartet"
    });
  });

  return { nodes, edges };
}
```

**Leerer Zustand:**
Wenn keine Creditors mit `contact_status !== 'no_response'`: Centered Message
"Noch keine Anschreiben gesendet. Der Gläubiger-Kontakt wurde noch nicht gestartet."

---

### 5.5 EmailNode — Custom Node: Erstschreiben

```
┌─────────────────────────────────────────┐
│  ✉  Erstschreiben                       │  ← 11px, uppercase, --text-secondary
│─────────────────────────────────────────│
│                                         │
│  Deutsche Bank AG                       │  ← 14px, semibold, --text-primary
│  AZ: DB-2024-883742                     │  ← 12px, JetBrains Mono, --text-secondary
│                                         │
│  Forderung: 4.230,00 €                  │  ← 12px, JetBrains Mono
│                                         │
│  ┌──────────────────────────────┐       │
│  │ ● Gesendet · 12.02.2026     │       │  ← Status-Badge, pill, outlined+tinted
│  └──────────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
     ○ ←── React Flow Handle (source, right)
```

**Größe:** ~240px breit, Höhe auto (min ~120px)

**Styling:**
- Container: `background: #FFFFFF`, `border: 1px solid #E5E7EB`, `border-radius: 12px`
- Padding: `16px 20px`
- Section Label: `11px`, uppercase, `letter-spacing: 0.08em`, `color: #6B7280`
- Gläubiger-Name: `14px`, `font-weight: 600`, `color: #111827`, `margin-top: 8px`
- Aktenzeichen: `12px`, `font-family: JetBrains Mono`, `color: #6B7280`
- Forderung: `12px`, `font-family: JetBrains Mono`, `color: #111827`

**Status-Badge Varianten:**

| `contact_status` | Badge-Text | Farbe |
|---|---|---|
| `email_sent_with_document` | "Gesendet · {datum}" | `--success` green, outlined+tinted |
| `main_ticket_created` | "Ticket erstellt" | `--info` blue, outlined+tinted |
| `email_failed` | "Zustellung fehlgeschlagen" | `--destructive` red, outlined+tinted |
| `no_email_manual_contact` | "Manueller Kontakt" | `--warning` amber, outlined+tinted |
| `no_response` | "Nicht gesendet" | Neutral gray, outlined |
| `responded` | "Gesendet · {datum}" | `--success` green, outlined+tinted |

**Badge Styling (alle Varianten):**
```css
font-size: 12px;
font-weight: 600;
padding: 2px 10px;
border-radius: 9999px;          /* Pill */
border: 1px solid {color}40;    /* 25% opacity border */
background: {color}10;          /* ~6% opacity fill */
color: {color-dark-variant};    /* Lesbarer Kontrast-Ton */
```

---

### 5.6 ResponseNode — Custom Node: Gläubiger-Antwort

**Variante A: Antwort erhalten (`contact_status === 'responded'`)**

```
         ○ ←── Handle (target, left)
┌─────────────────────────────────────────┐
│                                         │
│  ● Antwort eingegangen                  │  ← 11px, uppercase, --success color
│─────────────────────────────────────────│
│                                         │
│  Deutsche Bank AG                       │  ← 14px, semibold
│  Antwort am 18.02.2026                  │  ← 12px, JetBrains Mono
│                                         │
│  Neue Forderung: 3.890,50 €            │  ← 12px, JetBrains Mono, --success
│  Ursprünglich:   4.230,00 €            │  ← 12px, JetBrains Mono, --text-secondary, durchgestrichen
│                                         │
│  ┌──────────────────────────────┐       │
│  │ ✓ Beantwortet               │       │  ← Badge: --success, outlined+tinted
│  └──────────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
   ← border-left: 3px solid #22C55E (success accent)
```

**Variante B: Warten auf Antwort (`contact_status === 'email_sent_with_document'`)**

```
         ○ ←── Handle (target, left)
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐

   ◌ Warten auf Antwort                     ← 11px, uppercase, --text-secondary
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

   Deutsche Bank AG                          ← 14px, --text-secondary (dimmed)

   ┌──────────────────────────────┐
   │ ◌ Ausstehend                │          ← Badge: --warning, outlined+tinted
   └──────────────────────────────┘

└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
   ← Dashed border: 2px dashed #E5E7EB
```

**Variante C: Fehlgeschlagen (`contact_status === 'email_failed'`)**

```
         ○ ←── Handle (target, left)
┌─────────────────────────────────────────┐
│                                         │
│  ✕ Zustellung fehlgeschlagen            │  ← 11px, uppercase, --destructive
│─────────────────────────────────────────│
│                                         │
│  Deutsche Bank AG                       │
│                                         │
│  ┌──────────────────────────────┐       │
│  │ ✕ Fehler                    │       │  ← Badge: --destructive, outlined+tinted
│  └──────────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
   ← border-left: 3px solid #EF4444 (destructive accent)
```

**Variante D: Kein Kontakt / Nicht gesendet**

```
         ○ ←── Handle (target, left)
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐

   Deutsche Bank AG                          ← 14px, --text-secondary (dimmed)

   ┌──────────────────────────────┐
   │ — Nicht kontaktiert          │          ← Badge: neutral gray
   └──────────────────────────────┘

└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
   ← Dashed border: 2px dashed #E5E7EB, opacity: 0.6
```

**Styling (alle Varianten):**
- Breite: ~240px (gleich wie EmailNode)
- `border-radius: 12px`
- Padding: `16px 20px`
- Responded: `border-left: 3px solid #22C55E`, Rest: `1px solid #E5E7EB`
- Pending/Nicht gesendet: `border: 2px dashed #E5E7EB` statt solid

---

### 5.7 CreditorDetailPanel — Seitenleiste bei Node-Klick

**Trigger:** Klick auf einen beliebigen Node öffnet ein rechtes Panel.

**Layout:**
```
┌──────────────────────────────────────────────────────────┬─────────────────────────────┐
│                                                          │                             │
│              Canvas (React Flow)                         │  GLÄUBIGER DETAILS          │
│                                                          │                             │
│                                                          │  Deutsche Bank AG           │
│                                                          │  AZ: DB-2024-883742         │
│                                                          │                             │
│                                                          │  ── Kontaktdaten ──         │
│                                                          │  inkasso@deutsche-bank.de   │
│                                                          │  Taunusanlage 12            │
│                                                          │  60325 Frankfurt            │
│                                                          │                             │
│                                                          │  ── Erstschreiben ──        │
│                                                          │  Gesendet: 12.02.2026       │
│                                                          │  Dokument: DB_Erst...docx   │
│                                                          │  Zendesk SC: #48291         │
│                                                          │                             │
│                                                          │  ── Antwort ──              │
│                                                          │  Eingegangen: 18.02.2026    │
│                                                          │  Forderung: 3.890,50 €      │
│                                                          │  (Urspr.: 4.230,00 €)       │
│                                                          │                             │
│                                                          │  ── Antworttext ──          │
│                                                          │  "Sehr geehrte Damen..."    │
│                                                          │  [Volltext expandierbar]     │
│                                                          │                             │
└──────────────────────────────────────────────────────────┴─────────────────────────────┘
```

**Panel Styling:**
- Breite: `320px` fixed
- `background: #FFFFFF`, `border-left: 1px solid #E5E7EB`
- Slide-in von rechts, `transition: transform 150ms ease`
- Close-Button oben rechts (Lucide `X` Icon)
- Section Labels: `11px`, uppercase, `letter-spacing: 0.08em`, `color: #6B7280`
- E-Mail + Adressen: `12px`, `font-family: JetBrains Mono`
- Antworttext: `12px`, `color: #6B7280`, max-height `200px` mit Scroll, oder Expandable

---

## 6. Routing & Navigation

### Neue Route in App.tsx

```typescript
// In AnimatedRoutes(), VOR /clients/:id (spezifischere Route zuerst):
<Route path="/clients/:id/tracking" element={<LetterTrackingPage />} />
<Route path="/clients/:id" element={<ClientDetailPage />} />
```

### Navigation Flow

```
/clients/:id  (Aktivität Tab)
  → TrackingCard onClick → navigate(`/clients/${id}/tracking`)

/clients/:id/tracking
  → TrackingHeader Back-Button → navigate(`/clients/${id}`)
```

Keine Sidebar-Navigation für die Tracking-Route — nur erreichbar über Activity Tab.

---

## 7. Design System Compliance Checklist

| Regel | Umsetzung |
|-------|-----------|
| Page Background: `#FAFAFA` | `LetterTrackingPage` Container |
| Surface: `#FFFFFF` | Nodes, Header, Detail Panel |
| No `#FFFFFF` Page BG | Immer `#FAFAFA` als Page |
| No Gradients | Keine |
| No Shadows | Keine — Depth via borders |
| No Zebra Striping | Keine |
| Font: DM Sans | Body, Labels, Headings |
| Mono: JetBrains Mono | Aktenzeichen, Daten, Beträge |
| Badges: outlined + tinted | Alle Status-Badges |
| Border-Radius Cards: 12px | Nodes + Cards |
| Border-Radius Badges: 9999px | Pill-shape |
| Border-Radius Buttons: 8px | Back-Button |
| Max 1 Orange CTA/Section | Kein Orange CTA auf Canvas |
| Transitions: ≤ 150ms | Panel slide-in, hover states |
| Touch Target: ≥ 44px | Back-Button, Controls |
| Section Labels: 11px uppercase | Node headers, Panel sections |

---

## 8. Type-Erweiterungen

### `types.ts` — ClientDetailCreditor ergänzen

```typescript
export interface ClientDetailCreditor {
  // ... bestehende Felder ...

  // ── Creditor Contact Tracking (1. Anschreiben) ──
  contact_status?: 'no_response' | 'main_ticket_created' | 'email_sent_with_document'
    | 'email_failed' | 'responded' | 'no_email_manual_contact';
  email_sent_at?: string;
  document_sent_at?: string;
  first_round_document_filename?: string;
  first_round_document_url?: string;
  side_conversation_id?: string;
  side_conversation_created_at?: string;
  last_contacted_at?: string;
  main_zendesk_ticket_id?: string;

  // ── Response Data ──
  current_debt_amount?: number;
  creditor_response_amount?: number;
  creditor_response_text?: string;
  response_received_at?: string;
  amount_source?: 'creditor_response' | 'original_document' | 'default_fallback';
}
```

---

## 9. Implementierungs-Reihenfolge

### Phase 1: Foundation
1. `@xyflow/react` installieren
2. `ClientDetailCreditor` Types erweitern in `types.ts`
3. `LetterTrackingPage.tsx` erstellen (Page Wrapper)
4. Route in `App.tsx` hinzufügen

### Phase 2: Canvas Core
5. `TrackingHeader.tsx` — Back-Navigation + Context
6. `TrackingCanvas.tsx` — React Flow Setup + Node-Generierung
7. `nodes/EmailNode.tsx` — Custom Email Node
8. `nodes/ResponseNode.tsx` — Custom Response Node

### Phase 3: Integration
9. `TrackingCard.tsx` — Entry Card Komponente
10. `client-detail.tsx` — TrackingCard in `renderActivity()` einbauen

### Phase 4: Detail Panel
11. `CreditorDetailPanel.tsx` — Slide-in Detail-Ansicht bei Node-Klick

### Phase 5: Polish
12. Loading/Error States, Empty States
13. Responsive: Canvas Controls für kleinere Screens
14. TypeScript Build-Check: `npx tsc --noEmit`

---

## 10. Edge Cases & Leere Zustände

| Szenario | Verhalten |
|----------|-----------|
| 0 Creditors in `final_creditor_list` | TrackingCard nicht anzeigen |
| Creditors vorhanden aber kein Kontakt gestartet | TrackingCard zeigt "Noch nicht gestartet" |
| Alle `no_response` | Canvas mit leeren/dashed Response-Nodes |
| 1 Creditor | Canvas zentriert auf eine Zeile |
| 20+ Creditors | MiniMap einblenden, Fit-to-View |
| Creditor ohne Name | Fallback: "Unbekannter Gläubiger" |
| Creditor ohne E-Mail | EmailNode Badge: "Manueller Kontakt" |
| Betrag 0 oder undefined | "Betrag unbekannt" anzeigen |
| `email_failed` | Roter Node, Fehlermeldung im Detail Panel |

---

## 11. Formatierungs-Helfer

```typescript
// Beträge: Deutsche Notation
function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

// Datum: Deutsches Format
function formatDate(dateString: string | undefined): string {
  if (!dateString) return '–';
  return new Date(dateString).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

// Relative Zeit: "vor 2 Tagen"
function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}
```

---

## 12. Nicht in Scope (Bewusst ausgeklammert)

- Settlement Plan (2. Runde) Nodes
- Nullplan-Tracking
- Echtzeit-Updates / Polling
- Export als PDF/Bild
- Drag-and-Drop von Nodes
- Bearbeitbare Nodes (z.B. Betrag ändern)
- Sidebar-Navigation für Tracking-Route
- Mobile-optimierte Canvas-Ansicht (Desktop-first für Admin-Tool)
