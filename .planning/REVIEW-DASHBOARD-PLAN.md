# Review Dashboard Rebuild - Detaillierter Implementierungsplan

> Ziel: Das alte Agent-Portal Review Dashboard (`src/agent/pages/ReviewDashboard.tsx`) wird komplett neu aufgebaut und ins MandantenPortalDesign (Admin-Portal) integriert.

---

## Inhaltsverzeichnis

1. [Ist-Zustand & Abhängigkeiten](#1-ist-zustand--abhängigkeiten)
2. [Neue Dateistruktur](#2-neue-dateistruktur)
3. [Phase 1: Foundation](#3-phase-1-foundation)
4. [Phase 2: Core Review Flow](#4-phase-2-core-review-flow)
5. [Phase 3: Queue-System](#5-phase-3-queue-system)
6. [Phase 4: Enhanced Viewer + Analytics](#6-phase-4-enhanced-viewer--analytics)
7. [Phase 5: Polish + Deprecation](#7-phase-5-polish--deprecation)
8. [API Referenz](#8-api-referenz)
9. [Design System Regeln](#9-design-system-regeln)
10. [Verifikation](#10-verifikation)

---

## 1. Ist-Zustand & Abhängigkeiten

### Bestehende Backend-Endpoints (agent-review)

Alle unter `server/routes/agent-review.js` mit `authenticateAgent` Middleware:

| Endpoint | Methode | Was es tut |
|----------|---------|------------|
| `/api/agent-review/available-clients` | GET | Clients die Review brauchen (paginiert, sortiert nach Priorität) |
| `/api/agent-review/:clientId` | GET | Volle Review-Daten: Client, Dokumente, Gläubiger (need_review/verified), Diffs |
| `/api/agent-review/:clientId/correct` | POST | Korrekturen speichern (action: correct/skip/confirm) |
| `/api/agent-review/:clientId/complete` | POST | Review abschließen → Status → awaiting_client_confirmation, E-Mail an Client |
| `/api/agent-review/:clientId/document/:fileIdOrName` | GET | Dokument-Datei streamen (GCS/lokal/mock) |

### Bestehende Auth-Middleware (`server/middleware/auth.js`)

- `authenticateAgent` — Nur Agent-Tokens
- `authenticateAdmin` — Nur Admin-Tokens
- `authenticateAdminOrAgent` — **Bereits vorhanden!** Akzeptiert beide Token-Typen
- `authenticateClient` — Client-Tokens (Admin-Tokens werden auch akzeptiert)

### Bestehender Frontend Store

```
MandantenPortalDesign/src/store/
├── index.ts          → configureStore({ api, auth })
├── hooks.ts          → useAppDispatch, useAppSelector
├── api/
│   ├── baseApi.ts    → tagTypes: ['Client', 'Clients', 'Document', 'Creditor', 'WorkflowStatus']
│   └── clientsApi.ts → injectEndpoints Pattern
└── slices/
    └── authSlice.ts  → token, loginTimestamp, isAuthenticated
```

### Bestehende UI-Komponenten (shadcn)

Alle unter `MandantenPortalDesign/src/app/components/ui/`:
- Table, Form, Input, Label, Select, Checkbox, Badge, Button
- Dialog, AlertDialog, Sheet, Drawer
- Progress, Slider, Tabs
- Resizable (ResizablePanelGroup!)
- Breadcrumb, Pagination
- Calendar, Popover (für DatePicker)
- Skeleton (Loading States)
- Tooltip, DropdownMenu

### Bestehende Animations (`motion-utils.tsx`)

- `pageVariants` — Seitenübergänge
- `staggerContainer` / `staggerItem` — Listen
- `kpiStaggerContainer` / `kpiCardVariants` — KPI-Cards
- `fadeInVariants`, `slideUpVariants`, `tabContentVariants`
- `useCountUp(target)` — Animierte Zahlen

### Bestehende Typen (`src/app/types.ts`)

- `ClientDetailCreditor` — Alle Gläubiger-Felder inkl. v7
- `ClientDetailDocument` — Dokument mit extracted_data
- `AdminClient` — Client-Listenansicht
- `WorkflowStatus` — Status-Enum

---

## 2. Neue Dateistruktur

```
MandantenPortalDesign/src/
├── app/
│   ├── pages/
│   │   ├── ReviewQueuePage.tsx          ← NEU (Phase 1)
│   │   ├── ReviewWorkspacePage.tsx       ← NEU (Phase 2)
│   │   ├── ReviewAnalyticsPage.tsx       ← NEU (Phase 4)
│   │   └── ReviewSettingsPage.tsx        ← NEU (Phase 4)
│   ├── components/
│   │   └── review/
│   │       ├── ReviewQueueStats.tsx      ← NEU (Phase 1) - 3 KPI Cards
│   │       ├── ReviewQueueToolbar.tsx    ← NEU (Phase 1) - Suche + Filter
│   │       ├── ReviewQueueTable.tsx      ← NEU (Phase 1) - Haupttabelle
│   │       ├── BatchActionBar.tsx        ← NEU (Phase 3) - Multi-Select Actions
│   │       ├── ReviewProgressHeader.tsx  ← NEU (Phase 2) - Progress + Client Info
│   │       ├── CreditorSelector.tsx      ← NEU (Phase 2) - Gläubiger-Dropdown
│   │       ├── ReviewCorrectionForm.tsx  ← NEU (Phase 2) - Formular
│   │       ├── ReviewActionBar.tsx       ← NEU (Phase 2) - Bestätigen/Korrigieren/Skip
│   │       ├── SkipReasonForm.tsx        ← NEU (Phase 2) - Skip-Gründe
│   │       ├── ReviewSummaryDialog.tsx   ← NEU (Phase 2) - Finale Zusammenfassung
│   │       ├── EnhancedDocumentViewer.tsx← NEU (Phase 2/4) - PDF Viewer
│   │       ├── DocumentViewerToolbar.tsx ← NEU (Phase 4) - Zoom/Rotate/OCR
│   │       ├── MultiDocumentTabs.tsx     ← NEU (Phase 4) - Tab-Bar Multi-Dok
│   │       ├── FieldDiffIndicator.tsx    ← NEU (Phase 2) - AI vs Manual Diff
│   │       ├── AnalyticsKPIRow.tsx       ← NEU (Phase 4) - 4 KPI Cards
│   │       ├── ReviewsPerDayChart.tsx    ← NEU (Phase 4) - Recharts Bar
│   │       ├── ConfidenceDistChart.tsx   ← NEU (Phase 4) - Recharts Histogram
│   │       ├── AgentPerformanceTable.tsx ← NEU (Phase 4) - Agent-Tabelle
│   │       ├── ReviewOutcomesChart.tsx   ← NEU (Phase 4) - Recharts Pie
│   │       ├── QueueSettingsCard.tsx     ← NEU (Phase 4) - Settings
│   │       └── ThresholdSettingsCard.tsx ← NEU (Phase 4) - Settings
│   └── types/
│       └── review.ts                    ← NEU (Phase 1) - Alle Review-Typen
├── store/
│   ├── api/
│   │   ├── baseApi.ts                   ← ÄNDERN (Phase 1) - Neue Tag Types
│   │   └── reviewApi.ts                 ← NEU (Phase 1) - RTK Query Slice
│   ├── slices/
│   │   └── reviewUiSlice.ts             ← NEU (Phase 2) - UI State
│   └── index.ts                         ← ÄNDERN (Phase 2) - reviewUi Slice

server/
├── routes/
│   ├── agent-review.js                  ← ÄNDERN (Phase 1) - Auth auf adminOrAgent
│   └── admin-review.js                  ← NEU (Phase 3) - Queue/Analytics/Settings Endpoints
├── controllers/
│   └── adminReviewController.js         ← NEU (Phase 3) - Queue/Analytics Logic
└── server.js                            ← ÄNDERN (Phase 3) - Route registrieren

Bestehende Dateien die sich ÄNDERN:
├── MandantenPortalDesign/src/app/components/sidebar.tsx  ← "Review" Nav-Item
└── MandantenPortalDesign/src/app/App.tsx                 ← Review-Routen
```

---

## 3. Phase 1: Foundation

### 3.1 Sidebar: "Review" Nav-Item hinzufügen

**Datei:** `MandantenPortalDesign/src/app/components/sidebar.tsx`

**Änderung:** Import `ClipboardCheck` aus lucide-react, neuen Eintrag in `navItems` zwischen "Mandanten" und "Gläubiger-DB":

```typescript
// Import ergänzen:
import { ..., ClipboardCheck } from 'lucide-react';

// navItems Array - neuer Eintrag an Position 2:
const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Briefcase, label: 'Mandanten', path: '/clients' },
  { icon: ClipboardCheck, label: 'Review', path: '/review' },        // ← NEU
  { icon: Users, label: 'Gläubiger-DB', path: '/creditors' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: FileText, label: 'Documents', path: '/documents' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];
```

**NavLink Anpassung:** `/review` soll auch für Sub-Routen aktiv bleiben:
```typescript
end={item.path === '/clients' || item.path === '/review' ? false : true}
```

---

### 3.2 Routing: Review-Routen in App.tsx

**Datei:** `MandantenPortalDesign/src/app/App.tsx`

**Neue Imports:**
```typescript
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { ReviewWorkspacePage } from './pages/ReviewWorkspacePage';
import { ReviewAnalyticsPage } from './pages/ReviewAnalyticsPage';
import { ReviewSettingsPage } from './pages/ReviewSettingsPage';
```

**Neue Routen in `AnimatedRoutes` (vor dem catch-all `*`):**
```typescript
<Route path="/review" element={<ReviewQueuePage />} />
<Route path="/review/analytics" element={<ReviewAnalyticsPage />} />
<Route path="/review/settings" element={<ReviewSettingsPage />} />
<Route path="/review/:clientId" element={<ReviewWorkspacePage />} />
```

> Reihenfolge wichtig: `/review/analytics` und `/review/settings` VOR `/review/:clientId`, sonst matcht der Param-Route zuerst.

---

### 3.3 Types: `src/app/types/review.ts`

Neue Datei mit allen Review-spezifischen Typen:

```typescript
import type { ClientDetailCreditor, ClientDetailDocument } from '../types';

// ─── Queue Types ────────────────────────────────────────────
export type PriorityLevel = 'high' | 'medium' | 'low';

export interface ReviewQueueItem {
  id: string;
  name: string;
  aktenzeichen: string;
  documents_to_review: number;
  total_documents: number;
  priority: PriorityLevel;
  payment_received_at?: string;
  days_since_payment: number;
  avg_confidence?: number;
  creditors_needing_review?: number;
  total_creditors?: number;
  review_assignment?: ReviewAssignment;
}

export interface ReviewAssignment {
  assigned_to?: string;
  assigned_at?: string;
  priority_score?: number;
  priority_level?: PriorityLevel;
}

export interface ReviewQueueResponse {
  success: boolean;
  clients: ReviewQueueItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  confidence_threshold: number;
}

export interface ReviewQueueParams {
  page?: number;
  limit?: number;
  search?: string;
  priority?: PriorityLevel | 'all';
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ─── Review Data (einzelner Client) ────────────────────────
export interface CreditorWithDocuments {
  creditor: ClientDetailCreditor;
  documents: ClientDetailDocument[];
  needs_manual_review: boolean;
  review_reasons: string[];
}

export interface ReviewDataResponse {
  success: boolean;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    aktenzeichen: string;
    current_status: string;
  };
  documents: {
    all: ClientDetailDocument[];
    need_review: ClientDetailDocument[];
    total_count: number;
    review_count: number;
  };
  creditors: {
    all: ClientDetailCreditor[];
    need_review: ClientDetailCreditor[];
    verified: ClientDetailCreditor[];
    total_count: number;
    review_count: number;
    with_documents: CreditorWithDocuments[];
    needing_review_with_docs: CreditorWithDocuments[];
    verified_with_docs: CreditorWithDocuments[];
  };
  review_state: { phase: 'manual' | 'summary' };
  review_diffs: ReviewDiff[];
  review_session: {
    status: string;
    progress: ReviewProgress;
  };
}

export interface ReviewDiff {
  docId: string;
  creditorId: string;
  key: string;
  name: string;
  creditor_name: string;
  original: Record<string, unknown>;
  updated: Record<string, unknown>;
  reviewed_at: string;
}

export interface ReviewProgress {
  total_items: number;
  completed_items: number;
  remaining_items: number;
}

// ─── Correction ─────────────────────────────────────────────
export type ReviewAction = 'correct' | 'skip' | 'confirm';

export interface CorrectionPayload {
  document_id?: string;
  creditor_id?: string;
  action: ReviewAction;
  corrections?: {
    sender_name?: string;
    sender_email?: string;
    sender_address?: string;
    reference_number?: string;
    claim_amount?: number;
    claim_amount_raw?: string;
    glaeubigervertreter_name?: string;
    glaeubigervertreter_adresse?: string;
    email_glaeubiger_vertreter?: string;
    notes?: string;
  };
  original?: Record<string, unknown>;
}

export interface CorrectionResponse {
  success: boolean;
  message: string;
  document_id: string;
  action: ReviewAction;
  creditors_count: number;
  progress: ReviewProgress;
  is_review_complete: boolean;
}

// ─── Complete Review ────────────────────────────────────────
export interface CompleteReviewResponse {
  success: boolean;
  message: string;
  client: { id: string; current_status: string; admin_approved: boolean };
  creditors_count: number;
  total_debt: number;
  client_email_sent: boolean;
  portal_url: string;
  next_step: string;
}

// ─── Analytics ──────────────────────────────────────────────
export interface ReviewAnalytics {
  total_reviews: number;
  avg_review_time_minutes: number;
  accuracy_rate: number;
  queue_backlog: number;
  reviews_per_day: { date: string; count: number }[];
  confidence_distribution: { range: string; count: number }[];
  outcomes: { confirmed: number; corrected: number; skipped: number };
}

export interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  reviews_completed: number;
  avg_review_time_minutes: number;
  accuracy_rate: number;
}

// ─── Settings ───────────────────────────────────────────────
export interface ReviewSettings {
  auto_assignment_enabled: boolean;
  max_workload_per_agent: number;
  confidence_threshold: number;
  priority_weights: {
    days_since_payment: number;
    confidence: number;
    creditor_count: number;
    creditor_review_status: number;
  };
}

// ─── Skip Reasons ───────────────────────────────────────────
export const SKIP_REASONS = [
  { value: 'not_creditor', label: 'Kein Gläubiger-Dokument' },
  { value: 'duplicate', label: 'Duplikat' },
  { value: 'unreadable', label: 'Dokument nicht lesbar' },
  { value: 'incomplete', label: 'Unvollständige Daten' },
  { value: 'other', label: 'Sonstiges' },
] as const;
```

---

### 3.4 baseApi.ts: Neue Tag Types

**Datei:** `MandantenPortalDesign/src/store/api/baseApi.ts`

**Änderung:** Tag Types erweitern:
```typescript
tagTypes: ['Client', 'Clients', 'Document', 'Creditor', 'WorkflowStatus',
           'ReviewQueue', 'ReviewData', 'ReviewAnalytics', 'ReviewSettings'],
```

---

### 3.5 RTK Query Slice: `store/api/reviewApi.ts`

Neue Datei - wrapped die bestehenden `/api/agent-review/*` Endpoints:

```typescript
import { baseApi } from './baseApi';
import type {
  ReviewQueueResponse, ReviewQueueParams,
  ReviewDataResponse, CorrectionPayload, CorrectionResponse,
  CompleteReviewResponse,
} from '../../app/types/review';

export const reviewApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({

    // Queue-Übersicht (wraps /api/agent-review/available-clients)
    getReviewQueue: builder.query<ReviewQueueResponse, ReviewQueueParams>({
      query: ({ page = 1, limit = 25, search, priority, sort_by, sort_order } = {}) => {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.append('search', search);
        if (priority && priority !== 'all') params.append('priority', priority);
        if (sort_by) params.append('sort_by', sort_by);
        if (sort_order) params.append('sort_order', sort_order);
        return { url: `/api/agent-review/available-clients?${params}`, method: 'GET' };
      },
      providesTags: ['ReviewQueue'],
    }),

    // Einzelner Case (wraps /api/agent-review/:clientId)
    getReviewData: builder.query<ReviewDataResponse, string>({
      query: (clientId) => ({ url: `/api/agent-review/${clientId}`, method: 'GET' }),
      providesTags: (_r, _e, clientId) => [{ type: 'ReviewData', id: clientId }],
    }),

    // Korrektur speichern (wraps /api/agent-review/:clientId/correct)
    saveCorrections: builder.mutation<CorrectionResponse, { clientId: string; payload: CorrectionPayload }>({
      query: ({ clientId, payload }) => ({
        url: `/api/agent-review/${clientId}/correct`,
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: (_r, _e, { clientId }) => [
        { type: 'ReviewData', id: clientId },
        'ReviewQueue',
      ],
    }),

    // Review abschließen (wraps /api/agent-review/:clientId/complete)
    completeReview: builder.mutation<CompleteReviewResponse, string>({
      query: (clientId) => ({
        url: `/api/agent-review/${clientId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, clientId) => [
        { type: 'ReviewData', id: clientId },
        'ReviewQueue',
      ],
    }),

  }),
});

export const {
  useGetReviewQueueQuery,
  useGetReviewDataQuery,
  useSaveCorrectionsMutation,
  useCompleteReviewMutation,
} = reviewApi;
```

> Phase 3/4 ergänzt: `getReviewAnalytics`, `getReviewSettings`, `updateReviewSettings`, `assignCase`, `batchConfirm`, etc.

---

### 3.6 agent-review.js: Auth-Middleware auf `authenticateAdminOrAgent`

**Datei:** `server/routes/agent-review.js`

**Änderung:** Alle `authenticateAgent` Aufrufe → `authenticateAdminOrAgent`:

```javascript
// Vorher:
const { authenticateAgent } = require('../middleware/auth');

// Nachher:
const { authenticateAdminOrAgent } = require('../middleware/auth');

// Alle Routen:
router.get('/available-clients', authenticateAdminOrAgent, ...);
router.get('/:clientId', authenticateAdminOrAgent, ...);
router.post('/:clientId/correct', authenticateAdminOrAgent, ...);
router.post('/:clientId/complete', authenticateAdminOrAgent, ...);
router.get('/:clientId/document/:fileIdOrName', authenticateAdminOrAgent, ...);
```

**Warum:** Das Admin-Portal verwendet `admin_token` (type: 'admin'), nicht Agent-Tokens. Die `authenticateAdminOrAgent` Middleware akzeptiert beide und setzt `req.adminId` oder `req.agentId` entsprechend.

**Achtung:** Im Controller wird `req.agentId` verwendet. Für Admin-Zugriff muss ein Fallback existieren:
```javascript
const agentId = req.agentId || req.adminId || 'admin';
const agentUsername = req.agentUsername || 'admin';
```

---

### 3.7 ReviewQueuePage: Basis-Implementierung

**Datei:** `MandantenPortalDesign/src/app/pages/ReviewQueuePage.tsx`

**Layout-Pattern** (folgt DashboardPage/ClientList):
```
┌─────────────────────────────────────────────────┐
│ Header: "Gläubiger-Prüfung" + Subtitle          │
│ [border-bottom: 1px solid #E5E7EB]              │
├─────────────────────────────────────────────────┤
│ KPI Cards Row (3 Cards)                          │
│ [Offen] [Hohe Priorität] [Ø Review-Zeit]        │
├─────────────────────────────────────────────────┤
│ Toolbar: [Suche] [Priorität-Filter] [Sort]       │
├─────────────────────────────────────────────────┤
│ Table                                            │
│  [ ] | Avatar+Name | Aktenzeichen | Gläubiger   │
│      | Priorität   | Alter (Tage) | Confidence  │
│      | [→ Review]                                │
├─────────────────────────────────────────────────┤
│ Pagination                                       │
└─────────────────────────────────────────────────┘
```

**Datenfluss:**
1. `useGetReviewQueueQuery({ page, limit, search, priority })` → Queue-Daten
2. URL-basiertes State Management mit `useSearchParams` (Pattern von ClientList)
3. Suche mit 300ms Debounce
4. Klick auf Row → `navigate(/review/${client.id})`

**Subkomponenten:**

#### ReviewQueueStats.tsx
- 3 KPI-Cards nebeneinander
- Pattern: `kpiStaggerContainer` + `kpiCardVariants` aus motion-utils
- Werte aus Queue-Response berechnen:
  - **Offen:** `total` aus Response
  - **Hohe Prio:** `clients.filter(c => c.priority === 'high').length`
  - **Ø Alter:** `Math.round(avg(clients.map(c => c.days_since_payment)))`
- Design: Weißer Card, border 1px #E5E7EB, radius 12px, Zahl groß (28px, DM Sans 700)

#### ReviewQueueToolbar.tsx
- shadcn `Input` mit Search-Icon für Suche
- shadcn `Select` für Priorität-Filter (Alle/Hoch/Mittel/Niedrig)
- Sort-Button (Alter/Priorität/Name)
- Props: `{ search, onSearchChange, priority, onPriorityChange, sortBy, onSortChange }`

#### ReviewQueueTable.tsx
- shadcn `Table` Komponente
- Spalten:
  - Checkbox (Phase 3 - Multi-Select)
  - Avatar + Name (GradientAvatar + Text)
  - Aktenzeichen (JetBrains Mono)
  - Gläubiger (x/y Format)
  - Priorität (Badge: rot/gelb/grün, outlined+tinted, pill)
  - Alter (Tage seit Zahlung)
  - Ø Confidence (Prozent-Badge)
  - Action (ChevronRight → navigiert zum Workspace)
- Row hover: `bg-black/[0.02]`
- Loading: Skeleton-Rows

**Prioritäts-Badge Styling:**
```
high:   border: 1px solid #FCA5A5, bg: #FEF2F2, color: #991B1B
medium: border: 1px solid #FCD34D, bg: #FFFBEB, color: #92400E
low:    border: 1px solid #86EFAC, bg: #F0FDF4, color: #166534
```

---

## 4. Phase 2: Core Review Flow

### 4.1 ReviewWorkspacePage

**Datei:** `MandantenPortalDesign/src/app/pages/ReviewWorkspacePage.tsx`

**Datenfluss:**
1. `useParams<{ clientId: string }>()` → clientId aus URL
2. `useGetReviewDataQuery(clientId)` → Alle Daten
3. Local State: `currentCreditorIndex` (welcher Gläubiger gerade bearbeitet wird)
4. Mutation: `useSaveCorrectionsMutation()` für Bestätigen/Korrigieren/Skip
5. Mutation: `useCompleteReviewMutation()` für finale Bestätigung

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│ Breadcrumb: Review > Max Mustermann (AZ-2024-001)    │
│ Progress: [========------] 6/14 Gläubiger geprüft    │
├──────────────────────────────────────────────────────┤
│ ResizablePanelGroup (horizontal)                      │
│ ┌────────────────────┐┌────────────────────────────┐ │
│ │ DOCUMENT VIEWER    ││ KORREKTUR-PANEL            │ │
│ │                    ││                            │ │
│ │ PDF/Image Display  ││ [Gläubiger-Selector]       │ │
│ │ (iframe zunächst,  ││ Gläubiger Name*            │ │
│ │  PDF.js in Phase 4)││ E-Mail                     │ │
│ │                    ││ Adresse                    │ │
│ │                    ││ Aktenzeichen               │ │
│ │                    ││ Forderungsbetrag*          │ │
│ │                    ││ Gläubigervertreter         │ │
│ │                    ││ Notizen                    │ │
│ │                    ││ [Confidence Badge]         │ │
│ └────────────────────┘└────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│ [<< Zurück] Gläubiger 6 von 14 [Weiter >>]          │
│ [Bestätigen] [Speichern & Weiter] [Überspringen]     │
└──────────────────────────────────────────────────────┘
```

**Kern-Logik:**
```typescript
const { data } = useGetReviewDataQuery(clientId);
const creditorsToReview = data?.creditors.needing_review_with_docs ?? [];
const [currentIndex, setCurrentIndex] = useState(0);
const currentItem = creditorsToReview[currentIndex];
const currentCreditor = currentItem?.creditor;
const currentDocuments = currentItem?.documents ?? [];
```

**Navigation zwischen Gläubigern:**
- "Weiter" → `setCurrentIndex(i => Math.min(i + 1, creditorsToReview.length - 1))`
- "Zurück" → `setCurrentIndex(i => Math.max(i - 1, 0))`
- Wenn `currentIndex === creditorsToReview.length` → Summary Phase

---

### 4.2 ReviewProgressHeader.tsx

- Client-Info: Name, Aktenzeichen
- shadcn `Progress` Bar: `value={(completedItems / totalItems) * 100}`
- Text: `{completedItems} von {totalItems} Gläubiger geprüft`
- Button "Zurück zur Queue" → `navigate('/review')`

---

### 4.3 EnhancedDocumentViewer.tsx (Phase 2: Basis)

**Phase 2 - Einfache Version:**
- `<iframe>` mit Dokument-URL: `/api/agent-review/${clientId}/document/${doc.name || doc.id}`
- Toolbar: Zoom-Buttons (öffnet in neuem Tab)
- Wenn kein Dokument: Placeholder "Kein Dokument vorhanden"

**Phase 4 - Enhanced Version:**
- PDF.js Canvas Rendering
- OCR-Overlay Layer
- Zoom/Pan mit CSS Transforms
- Multi-Dokument Tabs

**Dokument-URL Konstruktion:**
```typescript
const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
const token = localStorage.getItem('admin_token');
const docUrl = `${baseUrl}/api/agent-review/${clientId}/document/${encodeURIComponent(docName)}`;
// Token als Query-Param oder Authorization-Header
```

> **Achtung:** iframe kann nicht einfach Auth-Header senden. Optionen:
> 1. Token als Query-Param: `/document/:name?token=xxx` (Backend muss das unterstützen)
> 2. fetch() + Blob URL: Besser für Sicherheit
> 3. Phase 4: PDF.js mit fetch + ArrayBuffer

**Empfehlung Phase 2:** fetch() → Blob → `URL.createObjectURL(blob)` → iframe/embed

---

### 4.4 CreditorSelector.tsx

- shadcn `Select` Dropdown
- Zeigt alle Gläubiger die Review brauchen
- Format: `{sender_name} — {claim_amount}€`
- Aktiver Gläubiger ist vorausgewählt
- Änderung → `onCreditorChange(index)` → wechselt `currentCreditorIndex`

---

### 4.5 ReviewCorrectionForm.tsx

**shadcn Form mit folgenden Feldern:**

| Feld | Typ | Pflicht | Quelle |
|------|-----|---------|--------|
| Gläubiger Name | Input | Ja | `creditor.sender_name \|\| creditor.glaeubiger_name` |
| E-Mail | Input | Nein | `creditor.sender_email \|\| creditor.email_glaeubiger` |
| Adresse | Textarea | Nein | `creditor.sender_address \|\| creditor.glaeubiger_adresse` |
| Aktenzeichen/Referenz | Input | Nein | `creditor.reference_number` |
| Forderungsbetrag | Input (number) | Ja | `creditor.claim_amount` |
| Gläubigervertreter Name | Input | Nein | `creditor.glaeubigervertreter_name` |
| Gläubigervertreter Adresse | Textarea | Nein | `creditor.glaeubigervertreter_adresse` |
| Gläubigervertreter E-Mail | Input | Nein | `creditor.email_glaeubiger_vertreter` |
| Notizen | Textarea | Nein | frei |

**Confidence Badge:**
- Zeigt `creditor.confidence` als Prozent
- < 0.5: rot, 0.5-0.8: gelb, > 0.8: grün
- Tooltip mit `creditor.review_reasons`

**FieldDiffIndicator:**
- Kleiner Indikator neben jedem Feld
- Zeigt AI-extrahierten Wert vs. aktuellen Wert
- Wenn Wert geändert → orange Dot

**Form State:**
```typescript
const [formData, setFormData] = useState({
  sender_name: '',
  sender_email: '',
  sender_address: '',
  reference_number: '',
  claim_amount: 0,
  glaeubigervertreter_name: '',
  glaeubigervertreter_adresse: '',
  email_glaeubiger_vertreter: '',
  notes: '',
});

// Initialisierung wenn Gläubiger wechselt:
useEffect(() => {
  if (currentCreditor) {
    setFormData({
      sender_name: currentCreditor.sender_name || currentCreditor.glaeubiger_name || '',
      sender_email: currentCreditor.sender_email || currentCreditor.email_glaeubiger || '',
      // ... etc
    });
  }
}, [currentCreditor]);
```

---

### 4.6 ReviewActionBar.tsx

Drei Buttons am unteren Rand:

| Button | Variant | Farbe | Action |
|--------|---------|-------|--------|
| Bestätigen | outline | Grün border | `action: 'confirm'` - AI-Daten korrekt |
| Speichern & Weiter | default | Orange (CTA) | `action: 'correct'` + Formular-Daten |
| Überspringen | ghost | Grau | Öffnet SkipReasonForm |

**Logik nach Action:**
1. `saveCorrections()` API Call
2. Bei Erfolg: `setCurrentIndex(i + 1)` → nächster Gläubiger
3. Wenn letzter Gläubiger: Zeige `ReviewSummaryDialog`
4. Toast: "Gläubiger bestätigt" / "Korrektur gespeichert" / "Übersprungen"

---

### 4.7 SkipReasonForm.tsx

- Erscheint als Inline-Bereich oder Dialog wenn "Überspringen" geklickt
- shadcn `RadioGroup` mit 5 Gründen (aus `SKIP_REASONS`)
- "Überspringen" Button → `saveCorrections({ action: 'skip', corrections: { notes: reason } })`

---

### 4.8 ReviewSummaryDialog.tsx

- shadcn `Dialog` als Modal
- Zeigt Zusammenfassung aller bearbeiteten Gläubiger:
  - Liste: Gläubiger Name | Aktion (Bestätigt/Korrigiert/Übersprungen) | Badge
- Warnung wenn noch ungeprüfte Gläubiger existieren
- Buttons:
  - "Alle bestätigen und senden" (CTA, orange) → `completeReview(clientId)`
  - "Abbrechen" → Schließt Dialog

**Nach completeReview:**
1. Erfolg-Toast: "Review abgeschlossen. E-Mail an Mandanten gesendet."
2. `navigate('/review')` → Zurück zur Queue

---

### 4.9 reviewUiSlice.ts (UI State)

**Datei:** `MandantenPortalDesign/src/store/slices/reviewUiSlice.ts`

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ReviewUiState {
  currentCreditorIndex: number;
  documentZoom: number;
  panelSizes: [number, number]; // [left%, right%]
  showOCROverlay: boolean;
  selectedQueueItems: string[]; // Client IDs für Multi-Select
}

const initialState: ReviewUiState = {
  currentCreditorIndex: 0,
  documentZoom: 100,
  panelSizes: [50, 50],
  showOCROverlay: false,
  selectedQueueItems: [],
};

export const reviewUiSlice = createSlice({
  name: 'reviewUi',
  initialState,
  reducers: {
    setCurrentCreditorIndex: (state, action: PayloadAction<number>) => {
      state.currentCreditorIndex = action.payload;
    },
    setDocumentZoom: (state, action: PayloadAction<number>) => {
      state.documentZoom = action.payload;
    },
    setPanelSizes: (state, action: PayloadAction<[number, number]>) => {
      state.panelSizes = action.payload;
    },
    toggleOCROverlay: (state) => {
      state.showOCROverlay = !state.showOCROverlay;
    },
    toggleQueueItemSelection: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const idx = state.selectedQueueItems.indexOf(id);
      if (idx >= 0) state.selectedQueueItems.splice(idx, 1);
      else state.selectedQueueItems.push(id);
    },
    selectAllQueueItems: (state, action: PayloadAction<string[]>) => {
      state.selectedQueueItems = action.payload;
    },
    clearQueueSelection: (state) => {
      state.selectedQueueItems = [];
    },
    resetReviewUi: () => initialState,
  },
});
```

**Store registrieren in `store/index.ts`:**
```typescript
import { reviewUiSlice } from './slices/reviewUiSlice';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authSlice.reducer,
    reviewUi: reviewUiSlice.reducer,  // ← NEU
  },
  middleware: ...
});
```

---

## 5. Phase 3: Queue-System

### 5.1 Backend: `server/routes/admin-review.js` + Controller

**Neue Endpoints (alle unter `/api/admin/review/`):**

```
POST /assign              → Case einem Agent zuweisen
POST /unassign            → Assignment aufheben
POST /batch-confirm       → Bulk-Bestätigung
POST /batch-assign        → Bulk-Zuweisung
POST /batch-priority      → Bulk-Priorität
GET  /analytics           → Aggregierte Analytics
GET  /analytics/agents    → Per-Agent Performance
GET  /settings            → Review-Konfiguration
PUT  /settings            → Konfiguration updaten
GET  /export              → CSV/XLSX Export
```

**Auth:** Alle `authenticateAdmin` (nur Admin-Zugriff für Queue-Management)

**MongoDB-Feld auf Client (neues Feld):**
```javascript
review_assignment: {
  assigned_to: String,        // Agent ID
  assigned_at: Date,
  priority_score: Number,     // Berechneter Score
  priority_level: String,     // 'high' | 'medium' | 'low'
}
```

**Prioritäts-Berechnung:**
```javascript
const calculatePriorityScore = (client) => {
  const daysSincePayment = (Date.now() - new Date(client.payment_processed_at)) / (1000*60*60*24);
  const avgConfidence = /* avg of creditor confidences */;
  const reviewCreditorCount = /* creditors needing review */;
  const inCreditorReview = client.current_status === 'creditor_review';

  return (daysSincePayment * 10) +
         ((1 - avgConfidence) * 30) +
         (reviewCreditorCount * 5) +
         (inCreditorReview ? 20 : 0);
};
// Bänder: >= 50 = high, >= 20 = medium, else low
```

**server.js registrieren:**
```javascript
const createAdminReviewRouter = require('./routes/admin-review');
app.use('/api/admin/review', createAdminReviewRouter({ Client }));
```

---

### 5.2 BatchActionBar.tsx

- Erscheint als Sticky Bottom-Bar wenn `selectedQueueItems.length > 0`
- Buttons: "Bestätigen (X)", "Zuweisen", "Priorität ändern", "Abbrechen"
- Framer Motion: `slideUpVariants` für Einblenden
- Admin-only (prüfe User-Rolle)

### 5.3 ReviewQueueTable: Multi-Select erweitern

- Checkbox-Spalte in Header: "Alle auswählen"
- Checkbox pro Row: `toggleQueueItemSelection(clientId)`
- Selected Rows: Leichter blauer Hintergrund `bg-blue-50`

---

## 6. Phase 4: Enhanced Viewer + Analytics

### 6.1 PDF.js Document Viewer

Ersetzt iframe durch Canvas-Rendering:

```typescript
// PDF.js laden
import * as pdfjsLib from 'pdfjs-dist';

// Canvas rendern
const loadPage = async (pdf, pageNum) => {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: zoom / 100 });
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
};
```

**Zoom/Pan:**
- Toolbar: Fit Width, Zoom In (+), Zoom Out (-), Prozent-Anzeige
- Mausrad: Zoom in/out
- State in `reviewUiSlice.documentZoom`

### 6.2 OCR Overlay Layer (wenn Daten vorhanden)

- Farbige Rechtecke über erkannte Felder
- Name=blau, Betrag=grün, Adresse=amber
- Klick auf Overlay → Auto-Focus auf Formfeld
- Toggle via `showOCROverlay` State

### 6.3 Multi-Dokument Tabs

- Tab-Bar über dem Viewer
- Zeigt alle Dokumente des aktuellen Gläubigers
- `currentDocuments.map(doc => <Tab>{doc.name}</Tab>)`

### 6.4 Analytics Page

**ReviewAnalyticsPage.tsx** Layout:
```
┌───────────────────────────────────────────────┐
│ "Review Analytics"  [Zeitraum-Selector]        │
├───────────────────────────────────────────────┤
│ [Gesamt] [Ø Zeit] [Accuracy] [Queue-Größe]    │ ← AnalyticsKPIRow
├───────────────────────────────────────────────┤
│ [Bar: Reviews/Tag]  | [Histogram: Confidence]  │
├───────────────────────────────────────────────┤
│ [Table: Agent Perf] | [Pie: Ergebnisse]        │
└───────────────────────────────────────────────┘
```

**Recharts-Komponenten:**
- `ReviewsPerDayChart` → `<BarChart>` mit `<Bar fill="var(--rasolv-accent)" />`
- `ConfidenceDistChart` → `<BarChart>` als Histogram
- `ReviewOutcomesChart` → `<PieChart>` (Bestätigt/Korrigiert/Übersprungen)
- `AgentPerformanceTable` → shadcn Table

### 6.5 Settings Page (Admin-only)

**ReviewSettingsPage.tsx** — Nur für Admins:
- `QueueSettingsCard` → Auto-Assignment Toggle, Round-Robin Einstellungen
- `ThresholdSettingsCard` → Confidence-Schwellenwert (shadcn Slider)
- Speichern via `PUT /api/admin/review/settings`

---

## 7. Phase 5: Polish + Deprecation

### 7.1 Batch-Operationen fertigstellen
- Bulk Confirm: Alle High-Confidence Cases bestätigen
- Export: CSV/XLSX mit `xlsx`-Library (client-seitig)

### 7.2 Agent Management
- Agent-Liste mit Max-Workload
- Workload Balancing Dashboard

### 7.3 Real-time Queue Polling
- `pollingInterval: 30000` auf `getReviewQueue`
- Optisch: Badge auf Sidebar wenn neue Cases

### 7.4 Altes Agent-Portal Deprecation
- Redirect von `/agent/review` → `/review`
- Feature-Flag zum Deaktivieren des alten Portals

---

## 8. API Referenz

### Bestehende Endpoints (Phase 1 - Auth ändern)

| Endpoint | Auth vorher | Auth nachher |
|----------|-------------|--------------|
| `GET /api/agent-review/available-clients` | authenticateAgent | authenticateAdminOrAgent |
| `GET /api/agent-review/:clientId` | authenticateAgent | authenticateAdminOrAgent |
| `POST /api/agent-review/:clientId/correct` | authenticateAgent | authenticateAdminOrAgent |
| `POST /api/agent-review/:clientId/complete` | authenticateAgent | authenticateAdminOrAgent |
| `GET /api/agent-review/:clientId/document/:file` | authenticateAgent | authenticateAdminOrAgent |

### Neue Endpoints (Phase 3+)

| Endpoint | Method | Auth | Phase |
|----------|--------|------|-------|
| `/api/admin/review/assign` | POST | Admin | 3 |
| `/api/admin/review/unassign` | POST | Admin | 3 |
| `/api/admin/review/batch-confirm` | POST | Admin | 3 |
| `/api/admin/review/batch-assign` | POST | Admin | 3 |
| `/api/admin/review/batch-priority` | POST | Admin | 3 |
| `/api/admin/review/analytics` | GET | Admin | 4 |
| `/api/admin/review/analytics/agents` | GET | Admin | 4 |
| `/api/admin/review/settings` | GET | Admin | 4 |
| `/api/admin/review/settings` | PUT | Admin | 4 |
| `/api/admin/review/export` | GET | Admin | 5 |

---

## 9. Design System Regeln

| Element | Regel |
|---------|-------|
| Hintergrund | `#FAFAFA` / `var(--rasolv-bg-secondary)` |
| Cards | Weiß, `border: 1px solid var(--rasolv-border)`, `border-radius: 12px` |
| Buttons | `border-radius: 8px`, **max 1 orangener CTA pro Sektion** |
| Badges | Pill, outlined + tinted (NIE solid gefüllt) |
| Font | DM Sans (Text), JetBrains Mono (Aktenzeichen, Beträge) |
| Schatten | **KEINE** Shadows |
| Zebra-Striping | **NEIN** |
| Motion | 100-150ms, Framer Motion aus `motion-utils.tsx` |
| Touch-Targets | min 44x44px |
| Farben Priorität | High: rot (#991B1B bg #FEF2F2), Medium: gelb (#92400E bg #FFFBEB), Low: grün (#166534 bg #F0FDF4) |
| Header | 22px, fontWeight 700, color #111827, DM Sans |
| Subtitle | 13px, color #6B7280, fontWeight 400 |
| Border | `1px solid #E5E7EB` |
| Toast | `sonner` Library |

---

## 10. Verifikation

### Phase 1 Checks
- [ ] Sidebar zeigt "Review" zwischen "Mandanten" und "Gläubiger-DB"
- [ ] Klick auf "Review" → `/review` Route, aktiver State in Sidebar
- [ ] Queue-Seite lädt und zeigt Clients aus `available-clients` Endpoint
- [ ] KPI-Cards zeigen korrekte Zahlen
- [ ] Suche filtert Ergebnisse
- [ ] Priorität-Filter funktioniert
- [ ] Klick auf Row → navigiert zu `/review/:clientId`
- [ ] Admin-Token wird akzeptiert auf agent-review Endpoints

### Phase 2 Checks
- [ ] Workspace zeigt Dokument links + Formular rechts (ResizablePanelGroup)
- [ ] Gläubiger-Navigation (vor/zurück) funktioniert
- [ ] Formular-Felder sind mit AI-Daten vorausgefüllt
- [ ] "Bestätigen" → speichert mit `action: confirm`, nächster Gläubiger
- [ ] "Speichern & Weiter" → speichert mit `action: correct` + Formulardaten
- [ ] "Überspringen" → zeigt Grund-Auswahl, speichert mit `action: skip`
- [ ] Progress-Bar updated nach jeder Aktion
- [ ] Letzter Gläubiger → Summary Dialog erscheint
- [ ] "Alle bestätigen und senden" → `completeReview`, Toast, Redirect

### Phase 3 Checks
- [ ] Multi-Select in Queue funktioniert
- [ ] BatchActionBar erscheint bei Selektion
- [ ] Bulk-Confirm funktioniert
- [ ] Assignment Endpoints funktionieren

### Phase 4 Checks
- [ ] PDF.js rendert Dokumente korrekt
- [ ] Zoom/Pan funktioniert
- [ ] Analytics zeigt Charts mit echten Daten
- [ ] Settings-Page speichert Konfiguration

### Phase 5 Checks
- [ ] Export generiert valide CSV/XLSX
- [ ] Altes Agent-Portal redirected
- [ ] Real-time Polling aktualisiert Queue
