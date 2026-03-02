# Phase 34: Admin UI & Tracking — Research

**Researched:** 2026-03-02
**Domain:** React/TypeScript admin UI — RTK Query mutations, ReactFlow third-column nodes, badge components, confirmation modal pattern
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Trigger-Button "2. Anschreiben starten" in Client Detail — visible when IDLE, disabled (not hidden) when PENDING/FORM_SUBMITTED/SENT — with confirmation modal before triggering | `ConfirmActionDialog` component already exists and is the pattern. RTK Query mutation hooks follow the `useConfirmFirstPaymentMutation` pattern in `clientDetailApi.ts`. Button state logic reads `second_letter_status` from `ClientDetailData` (returned by existing `GET /api/clients/:clientId` — no backend changes needed for reading). `POST /api/admin/clients/:clientId/trigger-second-letter` is already implemented in Phase 29. |
| UI-02 | Status badge for `second_letter_status` in Client Detail and Client List — countdown when IDLE after 1. Anschreiben sent, "Wartet auf Formular" when PENDING, "Formular eingereicht" when FORM_SUBMITTED, "Gesendet" when SENT | New `SecondLetterStatusBadge` component needed (or extension of existing `StatusBadge`). `ClientDetailData` type must be extended with `second_letter_status`, `second_letter_triggered_at`, and creditor `email_sent_at` fields. `AdminClient` type and Client List API response must also include `second_letter_status` (backend `/api/admin/clients` may not expose it yet — investigate). |
| UI-03 | TrackingCanvas gets a 3rd column showing per-creditor 2. Anschreiben status — whether letter was sent and when | New `SecondLetterNode` ReactFlow node type in `tracking/nodes/`. `buildFlowElements()` in `TrackingCanvas.tsx` has a comment explicitly describing how to add a 3rd column. `ClientDetailCreditor` type needs `second_letter_sent_at`, `second_letter_email_sent_at`, `second_letter_document_filename` fields added. Layout: `START_X + 2*COL_WIDTH` for 3rd column. |
| UI-04 | Plan type (Ratenplan/Nullplan) admin override select in Client Detail before triggering send — override persists in snapshot | New `PATCH /api/admin/clients/:clientId/second-letter-plan-type` endpoint needed (or can reuse existing `recalculate-second-letter` + snapshot update pattern). Select component from `ui/select.tsx` is available. Must update `second_letter_financial_snapshot.plan_type` in DB. |
</phase_requirements>

---

## Summary

Phase 34 is a pure frontend phase with one new backend endpoint. All four requirements (UI-01 through UI-04) involve adding UI to the existing `MandantenPortalDesign/src/` admin portal that was built in phases 23–27. The tech stack is identical to every previous admin UI phase: React 18, Vite, Tailwind v4, RTK Query, ReactFlow (`@xyflow/react`).

The backend is 95% ready. Three trigger/send endpoints are already implemented: `POST /api/admin/clients/:clientId/trigger-second-letter` (Phase 29), `POST /api/admin/clients/:clientId/send-second-letter` (Phase 33), and `POST /api/admin/clients/:clientId/recalculate-second-letter` (Phase 31). The `GET /api/clients/:clientId` client detail endpoint already returns all `second_letter_*` fields because `clientService.getClient()` does an unfiltered `findOne()`. The only backend work needed is a new plan-type override endpoint (UI-04).

The primary risk is scope creep and type incompleteness. `ClientDetailData` and `ClientDetailCreditor` in `app/types.ts` do not yet declare `second_letter_*` fields — they must be added before any component can use them safely in TypeScript. The Client List (`AdminClient` type) may also be missing `second_letter_status` from the backend response — this needs a quick investigation.

**Primary recommendation:** Split into 3 implementation plans — P01: Types + RTK Query mutations + backend plan-type endpoint; P02: Client Detail trigger button + status badge + plan override UI; P03: Client List badge + TrackingCanvas 3rd column + SecondLetterNode.

---

## Standard Stack

### Core (no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| RTK Query (via `@reduxjs/toolkit`) | Already installed | API mutations + cache invalidation | Same pattern as all Phase 23–33 admin UI work |
| `@xyflow/react` | Already installed | TrackingCanvas node graph | Already used for EmailNode + ResponseNode |
| React 18 | Already installed | Component logic | Project standard |
| Tailwind v4 | Already installed | Styling via design tokens | Project standard |
| `lucide-react` | Already installed | Icons | Already used everywhere |

**Installation:** No new packages needed. All dependencies are already present.

---

## Architecture Patterns

### Recommended File Structure for Phase 34
```
MandantenPortalDesign/src/
├── app/
│   ├── types.ts                            ← MODIFY: add second_letter_* fields to ClientDetailData, ClientDetailCreditor, AdminClient
│   ├── components/
│   │   ├── client-detail.tsx               ← MODIFY: trigger button, status badge, plan override select
│   │   ├── client-list.tsx                 ← MODIFY: add second_letter_status badge column (optional column)
│   │   ├── tracking/
│   │   │   ├── TrackingCanvas.tsx          ← MODIFY: add 3rd column in buildFlowElements(), register SecondLetterNode
│   │   │   └── nodes/
│   │   │       └── SecondLetterNode.tsx    ← NEW: node for 2. Anschreiben status per creditor
│   └── store/
│       └── api/
│           └── clientDetailApi.ts          ← MODIFY: add triggerSecondLetter, sendSecondLetter, overridePlanType mutations
```

### Pattern 1: RTK Query Mutation for Trigger Button (UI-01)

**What:** Add two mutations to `clientDetailApi.ts` — one for triggering PENDING (`trigger-second-letter`) and one for sending emails (`send-second-letter`).
**When to use:** Admin clicks "2. Anschreiben starten" (→ trigger) or a separate "Jetzt senden" button (→ send).

```typescript
// Source: MandantenPortalDesign/src/store/api/clientDetailApi.ts — existing pattern
triggerSecondLetter: builder.mutation<TriggerSecondLetterResponse, string>({
  query: (clientId) => ({
    url: `/api/admin/clients/${clientId}/trigger-second-letter`,
    method: 'POST',
  }),
  invalidatesTags: (_result, _error, clientId) => [
    { type: 'Client', id: clientId },
  ],
}),
sendSecondLetter: builder.mutation<SendSecondLetterResponse, string>({
  query: (clientId) => ({
    url: `/api/admin/clients/${clientId}/send-second-letter`,
    method: 'POST',
  }),
  invalidatesTags: (_result, _error, clientId) => [
    { type: 'Client', id: clientId },
  ],
}),
overrideSecondLetterPlanType: builder.mutation<void, { clientId: string; planType: 'RATENPLAN' | 'NULLPLAN' }>({
  query: ({ clientId, planType }) => ({
    url: `/api/admin/clients/${clientId}/second-letter-plan-type`,
    method: 'PATCH',
    body: { plan_type: planType },
  }),
  invalidatesTags: (_result, _error, { clientId }) => [
    { type: 'Client', id: clientId },
  ],
}),
```

### Pattern 2: Trigger Button with Status-Based Disabled State (UI-01)

**What:** Button reads `c.second_letter_status` and is always rendered — only disabled when status is not IDLE.
**Key constraint:** The button must be DISABLED (not hidden) when PENDING/FORM_SUBMITTED/SENT. This matches the existing "1. Rate bezahlt" button pattern in `QuickActions` which uses `disabled: firstPaymentReceived`.

```typescript
// In client-detail.tsx — follows QuickActions button pattern
const secondLetterStatus = c.second_letter_status as SecondLetterStatus | undefined;
const canTrigger = !secondLetterStatus || secondLetterStatus === 'IDLE';

// Button: always visible, disabled when not IDLE
<button
  onClick={() => setTriggerSecondLetterOpen(true)}
  disabled={!canTrigger || isTriggeringSecondLetter}
  style={{
    opacity: !canTrigger ? 0.4 : 1,
    cursor: !canTrigger ? 'not-allowed' : 'pointer',
    // ... orange accent styling when enabled, similar to ConfirmActionDialog confirm button
  }}
>
  {isTriggeringSecondLetter ? <Loader2 /> : null}
  2. Anschreiben starten
</button>

// Confirmation modal — reuse existing ConfirmActionDialog
<ConfirmActionDialog
  open={triggerSecondLetterOpen}
  onOpenChange={setTriggerSecondLetterOpen}
  title="2. Anschreiben starten?"
  description="Der Mandant wird per E-Mail benachrichtigt und aufgefordert, seine Finanzdaten zu bestätigen."
  confirmLabel="Starten"
  onConfirm={handleTriggerSecondLetter}
  isLoading={isTriggeringSecondLetter}
/>
```

### Pattern 3: SecondLetterStatusBadge Component (UI-02)

**What:** New component (or function) that takes `second_letter_status`, `second_letter_triggered_at`, and creditor `email_sent_at` timestamps. Returns a pill badge matching design system.
**Badge rules:**
- `IDLE` + 1. Anschreiben was sent: shows countdown (days until 30-day mark from `MAX(email_sent_at)`)
- `IDLE` + no 1. Anschreiben yet: no badge (or hidden)
- `PENDING`: "Wartet auf Formular" — warning amber `#F59E0B`
- `FORM_SUBMITTED`: "Formular eingereicht" — info blue `#3B82F6`
- `SENT`: "Gesendet" — success green `#22C55E`

```typescript
// New component in components/ (or inline in client-detail.tsx if small)
type SecondLetterStatus = 'IDLE' | 'PENDING' | 'FORM_SUBMITTED' | 'SENT';

function SecondLetterStatusBadge({
  status,
  triggeredAt,
  creditors,
}: {
  status: SecondLetterStatus | undefined;
  triggeredAt?: string;
  creditors: ClientDetailCreditor[];
}) {
  // Countdown logic: if IDLE, find MAX(email_sent_at) from creditors,
  // compute days since, show "In X Tagen fällig" or similar
  const maxEmailSentAt = useMemo(() => {
    return creditors.reduce<string | undefined>((max, c) => {
      const d = c.email_sent_at || c.document_sent_at;
      if (!d) return max;
      if (!max) return d;
      return new Date(d) > new Date(max) ? d : max;
    }, undefined);
  }, [creditors]);

  if (!status || status === 'IDLE') {
    if (!maxEmailSentAt) return null; // No 1. Anschreiben sent yet
    const daysSince = Math.floor((Date.now() - new Date(maxEmailSentAt).getTime()) / 86400000);
    const daysLeft = Math.max(0, 30 - daysSince);
    // Badge: outlined pill showing countdown
    return <Badge color="#F59E0B">In {daysLeft} Tagen</Badge>;
  }

  const CONFIG = {
    PENDING:         { label: 'Wartet auf Formular', color: '#F59E0B' },
    FORM_SUBMITTED:  { label: 'Formular eingereicht', color: '#3B82F6' },
    SENT:            { label: 'Gesendet',              color: '#22C55E' },
  };
  const cfg = CONFIG[status];
  // Outlined + tinted pill — design system rule
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 10px', borderRadius: '9999px',
      border: `1px solid ${cfg.color}60`,
      background: `${cfg.color}10`,
      color: cfg.color,
      fontSize: '12px', fontWeight: 600,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {cfg.label}
    </span>
  );
}
```

### Pattern 4: TrackingCanvas 3rd Column — SecondLetterNode (UI-03)

**What:** Add a new `SecondLetterNode` type to `tracking/nodes/`. Register it in `TrackingCanvas.tsx`'s `nodeTypes`. Extend `buildFlowElements()` to add a third node per creditor at `START_X + 2*COL_WIDTH` and connect `ResponseNode → SecondLetterNode`.

The code already has a comment in `buildFlowElements()` and `EmailNode.tsx` describing exactly this extension:
```
// To extend for a 2. Anschreiben round, add a third column of nodes at
// START_X + 2*COL_WIDTH and connect the ResponseNode to the new SecondRoundNode.
// The `creditor` data object can carry `second_round_*` fields for the additional round.
```

**SecondLetterNode data shape:**
```typescript
interface SecondLetterNodeData {
  creditorName: string;
  secondLetterSentAt?: string;       // from creditor.second_letter_sent_at
  secondLetterEmailSentAt?: string;  // from creditor.second_letter_email_sent_at
  documentFilename?: string;          // from creditor.second_letter_document_filename
  [key: string]: unknown;
}
```

**Node variants:**
- Not sent (no `second_letter_sent_at`): dashed border, `#FAFAFA` bg, "Nicht versendet" gray badge
- Sent: solid border, `#FFFFFF` bg, "Gesendet · DD.MM.YYYY" green badge

**Edge style** between ResponseNode and SecondLetterNode:
```typescript
edges.push({
  id: `second-edge-${creditor.id}`,
  source: `response-${creditor.id}`,
  target: `second-${creditor.id}`,
  style: {
    stroke: creditor.second_letter_sent_at ? '#22C55E' : '#D1D5DB',
    strokeWidth: 1.5,
    strokeDasharray: creditor.second_letter_sent_at ? undefined : '6 4',
  },
  animated: false,
});
```

**Canvas width impact:** Adding COL_WIDTH (400px) makes the canvas 3 columns wide (1280px total). The viewport lock currently sets `x: 0` — this may need to be relaxed to allow horizontal scrolling, or an alternative approach (reduce `COL_WIDTH` for 3-col, e.g. 320px) must be chosen. Plan should address this explicitly.

### Pattern 5: Plan Type Override (UI-04)

**What:** Select control in Client Detail overview section. Only relevant/enabled when `second_letter_status === 'FORM_SUBMITTED'` (snapshot exists but letters not yet sent). The override patches `second_letter_financial_snapshot.plan_type` in the DB.

**Backend endpoint needed:**
```
PATCH /api/admin/clients/:clientId/second-letter-plan-type
Body: { plan_type: 'RATENPLAN' | 'NULLPLAN' }
```

This updates `second_letter_financial_snapshot.plan_type` using `findByIdAndUpdate`. Guard: return 400 if status is SENT (immutable after dispatch). The existing `recalculate-second-letter` endpoint already shows this pattern.

**Frontend:**
```typescript
// In client-detail.tsx overview section, show when snapshot exists
const snapshot = c.second_letter_financial_snapshot;
const canOverridePlanType = secondLetterStatus === 'FORM_SUBMITTED' && snapshot;

{canOverridePlanType && (
  <div>
    <label>Plan-Typ Override</label>
    <Select
      value={snapshot.plan_type || 'RATENPLAN'}
      onValueChange={(val) => handleOverridePlanType(val as 'RATENPLAN' | 'NULLPLAN')}
    >
      <SelectItem value="RATENPLAN">Ratenplan</SelectItem>
      <SelectItem value="NULLPLAN">Nullplan</SelectItem>
    </Select>
  </div>
)}
```

### Anti-Patterns to Avoid
- **Hiding the trigger button when status !== IDLE:** UI-01 explicitly says the button must be DISABLED, not hidden. This is the same pattern as `disabled: firstPaymentReceived` in QuickActions.
- **Triggering without confirmation modal:** Always use `ConfirmActionDialog` before calling the trigger mutation.
- **Updating plan_type client-side without invalidating cache:** The RTK Query mutation must invalidate `{ type: 'Client', id: clientId }` so the detail view re-fetches and shows the new plan_type.
- **Horizontal scroll blindness in TrackingCanvas:** The `onViewportChange` currently locks `x: 0`. A 3rd column makes the canvas wider — must test and potentially allow horizontal pan.
- **Polling on mutations:** Do NOT add `pollingInterval` to detail query for this feature. Cache invalidation after mutation is sufficient.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation modal | Custom modal | `ConfirmActionDialog` (already exists) | Already used for payment confirmation, dedup, delete |
| API mutations | Direct fetch() | RTK Query `builder.mutation` | Cache invalidation, loading state, type safety |
| Badge styling | Inline one-off styles | Design system token pattern (outlined+tinted pill) | Consistency, design rule: badges always outlined+tinted |
| Select component | Custom dropdown | `ui/select.tsx` (shadcn Select) | Already available, accessible |
| Date formatting | Custom date utils | Existing `formatDate`, `formatGermanDate` helpers | Already tested, consistent locale |
| Flow node structure | Custom SVG or div-based nodes | `@xyflow/react` Node types (memo wrapped) | Same pattern as `EmailNode`, `ResponseNode` |

---

## Common Pitfalls

### Pitfall 1: `second_letter_status` Missing from TypeScript Types
**What goes wrong:** `ClientDetailData` and `ClientDetailCreditor` in `app/types.ts` do not yet declare `second_letter_*` fields. Accessing `c.second_letter_status` will be a TypeScript error.
**Why it happens:** Types are manually maintained; Phase 28 added the DB schema but Phase 34 is the first to expose these fields in the admin frontend.
**How to avoid:** Add all needed fields to `ClientDetailData` and `ClientDetailCreditor` in the FIRST implementation plan before writing any component code.
**Fields to add to `ClientDetailData`:**
```typescript
second_letter_status?: 'IDLE' | 'PENDING' | 'FORM_SUBMITTED' | 'SENT';
second_letter_triggered_at?: string;
second_letter_form_submitted_at?: string;
second_letter_sent_at?: string;
second_letter_financial_snapshot?: {
  plan_type?: 'RATENPLAN' | 'NULLPLAN';
  garnishable_amount?: number;
  monthly_rate?: number;
  // ... other snapshot fields if needed
};
```
**Fields to add to `ClientDetailCreditor`:**
```typescript
second_letter_sent_at?: string;
second_letter_email_sent_at?: string;
second_letter_document_filename?: string;
```

### Pitfall 2: Client List (`AdminClient` Type) May Not Include `second_letter_status`
**What goes wrong:** The Client List API endpoint (`GET /api/admin/clients`) may not project `second_letter_status` in its response — this depends on the `adminDashboardController.getClients` query.
**Why it happens:** Client List uses a different DB query than Client Detail. If the query uses `.select(...)` with an explicit projection, `second_letter_status` might be excluded.
**How to avoid:** Before implementing the Client List badge, verify what the List API actually returns. Grep `adminDashboardController.js` for the projection or add a quick console check. If the field is missing, add it to the DB projection in the controller (minimal backend change — 1 line).
**Warning sign:** `AdminClient` does not declare `second_letter_status` in `app/types.ts`.

### Pitfall 3: TrackingCanvas Horizontal Scroll Lock
**What goes wrong:** The canvas `onViewportChange` currently enforces `x: 0` (no horizontal pan). A 3-column layout (1280px+ wide) requires horizontal scrolling to see the 3rd column.
**Why it happens:** The current 2-column layout fits within the panel width; the lock was intentional for the 1. Anschreiben phase.
**How to avoid:** Either (a) relax the x-lock to allow horizontal panning, or (b) reduce `COL_WIDTH` for the 3-column layout. Recommended: relax the x-lock (remove `x: 0` enforcement in `onViewportChange`, or set a reasonable x-clamp similar to the y-clamp logic).

### Pitfall 4: Trigger Response Handling — `alreadyTriggered` vs Error
**What goes wrong:** The trigger endpoint returns HTTP 200 with `{ success: false, alreadyTriggered: true }` when the client is already PENDING (not a 4xx error). RTK Query will NOT treat this as an error, so the UI must inspect the response body.
**Why it happens:** Per Phase 29 decision: "alreadyTriggered admin endpoint returns 200 (not 409) — idempotent by design."
**How to avoid:** After the trigger mutation resolves, check `result.data.alreadyTriggered` and `result.data.success`. Show a toast like `toast.info('Client ist bereits im Status PENDING')` when already triggered.

### Pitfall 5: Plan Type Override After SENT — No-Op Guard
**What goes wrong:** Admin tries to override plan type after letters are SENT — the snapshot should be immutable.
**Why it happens:** The UI might not gate the select on status.
**How to avoid:** Only render the plan type select when `second_letter_status === 'FORM_SUBMITTED'`. The backend endpoint also guards against SENT status (mirror the `recalculate-second-letter` guard: return 400 if `second_letter_status === 'SENT'`).

---

## Code Examples

### Adding Second Letter Fields to Types
```typescript
// Source: MandantenPortalDesign/src/app/types.ts — extend existing interfaces

export interface ClientDetailData {
  // ... existing fields ...

  // ── 2. Anschreiben State Machine ──
  second_letter_status?: 'IDLE' | 'PENDING' | 'FORM_SUBMITTED' | 'SENT';
  second_letter_triggered_at?: string;
  second_letter_form_submitted_at?: string;
  second_letter_sent_at?: string;
  second_letter_financial_snapshot?: {
    plan_type?: 'RATENPLAN' | 'NULLPLAN';
    garnishable_amount?: number;
    monthly_rate?: number;
    total_debt?: number;
    calculation_status?: string;
  };
}

export interface ClientDetailCreditor {
  // ... existing fields ...

  // ── 2. Anschreiben Tracking ──
  second_letter_sent_at?: string;
  second_letter_email_sent_at?: string;
  second_letter_document_filename?: string;
}
```

### SecondLetterNode (Minimal Implementation)
```typescript
// Source: Mirror of EmailNode.tsx pattern from tracking/nodes/EmailNode.tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Send, Minus } from 'lucide-react';
import { formatDate } from '../tracking-utils';

export interface SecondLetterNodeData {
  creditorName: string;
  secondLetterSentAt?: string;
  secondLetterEmailSentAt?: string;
  documentFilename?: string;
  [key: string]: unknown;
}

function SecondLetterNodeComponent({ data }: NodeProps) {
  const d = data as unknown as SecondLetterNodeData;
  const isSent = !!d.secondLetterSentAt;
  const sentDate = d.secondLetterSentAt || d.secondLetterEmailSentAt;

  return (
    <div style={{
      background: isSent ? '#FFFFFF' : '#FAFAFA',
      border: isSent ? '1px solid #E5E7EB' : '2px dashed #E5E7EB',
      borderRadius: '12px',
      padding: '16px 20px',
      width: '280px',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {/* Section label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
        <Send size={12} color={isSent ? '#16A34A' : '#6B7280'} />
        <span style={{
          fontSize: '11px', fontWeight: 600,
          color: isSent ? '#16A34A' : '#6B7280',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          2. Anschreiben
        </span>
      </div>

      {/* Creditor name */}
      <div style={{
        fontSize: '14px', fontWeight: isSent ? 600 : 400,
        color: isSent ? '#111827' : '#6B7280',
        marginBottom: '12px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {d.creditorName}
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', fontWeight: 600, padding: '2px 10px',
        borderRadius: '9999px',
        border: `1px solid ${isSent ? '#22C55E40' : '#D1D5DB'}`,
        background: isSent ? '#22C55E10' : 'transparent',
        color: isSent ? '#16A34A' : '#6B7280',
      }}>
        {isSent ? (
          <>Gesendet{sentDate ? ` · ${formatDate(sentDate)}` : ''}</>
        ) : (
          'Nicht versendet'
        )}
      </div>

      <Handle type="target" position={Position.Left} style={{
        width: '8px', height: '8px',
        background: '#D1D5DB', border: '2px solid #FFFFFF',
      }} />
    </div>
  );
}

export const SecondLetterNode = memo(SecondLetterNodeComponent);
```

### Backend Plan Type Override Endpoint
```javascript
// Source: Pattern from existing recalculate-second-letter in admin-second-letter.js
router.patch('/clients/:clientId/second-letter-plan-type', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { plan_type } = req.body;

    if (!['RATENPLAN', 'NULLPLAN'].includes(plan_type)) {
      return res.status(400).json({ error: 'plan_type must be RATENPLAN or NULLPLAN' });
    }

    const client = await Client.findById(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.second_letter_status === 'SENT') {
      return res.status(400).json({ error: 'Cannot override plan_type after letters are sent' });
    }
    if (!client.second_letter_financial_snapshot) {
      return res.status(400).json({ error: 'No snapshot exists — client must submit form first' });
    }

    await Client.findByIdAndUpdate(client._id, {
      $set: { 'second_letter_financial_snapshot.plan_type': plan_type }
    });

    res.json({ success: true, plan_type });
  } catch (error) {
    console.error('[SecondLetter] Plan type override error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual fetch() for mutations | RTK Query `builder.mutation` with `invalidatesTags` | Phase 23 (admin UI foundation) | Automatic cache invalidation, loading state |
| Custom modal components | `ConfirmActionDialog` (AlertDialog-based) | Phase 23–24 | Single reusable pattern for all destructive actions |
| Two-column ReactFlow | Two-column + extensible comment | Phase 26 (TrackingCanvas built) | 3rd column is pre-planned, documented in code comment |

---

## Open Questions

1. **Does `GET /api/admin/clients` (Client List) return `second_letter_status`?**
   - What we know: `clientService.getClient()` returns all fields. But Client List uses `adminDashboardController.getClients()` which may project differently.
   - What's unclear: Whether `AdminClient` API response already includes `second_letter_status`.
   - Recommendation: In P01, verify by checking `adminDashboardController.js` projection. If missing, add it (1-line backend change). Do not assume it's present.

2. **Where in Client Detail should the trigger button live? (Overview tab vs. dedicated section?)**
   - What we know: The trigger button (UI-01) is described as being in "Client Detail" — but client-detail has tabs (Overview, Profile, Documents, Creditors, Activity).
   - What's unclear: Whether it goes in QuickActions grid (Overview tab), or a new "2. Anschreiben" section.
   - Recommendation: Add it to the Overview tab in a dedicated "2. Anschreiben" card section (below QuickActions), not inside QuickActions grid (grid already has 7 items, adding an 8th would break the 4-column layout). The 2. Anschreiben section can show: status badge + trigger button + plan type override + sent timestamp.

3. **Client List badge: which column?**
   - What we know: Client List uses a configurable `TABLE_COLUMNS_CONFIG` pattern with `ColumnId` types and a `getColumnValue` helper.
   - What's unclear: Whether to add `second_letter_status` as a new optional column or surface it in the existing "flows" column.
   - Recommendation: Add as a new optional column in `TABLE_COLUMNS_CONFIG` — consistent with existing column system. Name it `secondLetterStatus`.

4. **TrackingCanvas horizontal scroll: lock or clamp?**
   - What we know: Current `onViewportChange` enforces `x: 0`. 3rd column requires horizontal space.
   - Recommendation: Relax x-lock entirely (remove `x: 0, y: clampedY` enforcement for x; keep y-clamping). The `panOnDrag: false` + `panOnScroll: true` settings already prevent accidental pan; horizontal scroll via trackpad will work naturally.

---

## Sources

### Primary (HIGH confidence)
- `MandantenPortalDesign/src/app/components/tracking/TrackingCanvas.tsx` — buildFlowElements comment explicitly describes 3rd column extension point
- `MandantenPortalDesign/src/app/components/tracking/nodes/EmailNode.tsx` — comment describes extending for 2. Anschreiben
- `MandantenPortalDesign/src/store/api/clientDetailApi.ts` — RTK Query mutation patterns verified
- `MandantenPortalDesign/src/app/components/confirm-action-dialog.tsx` — ConfirmActionDialog pattern confirmed
- `server/routes/admin-second-letter.js` — all three trigger/recalculate/send endpoints confirmed implemented
- `server/models/Client.js` — `second_letter_financial_snapshot.plan_type` confirmed as mutable field
- `server/services/clientService.js` — `getClient()` confirmed as unfiltered findOne (all fields returned)
- `MandantenPortalDesign/src/app/types.ts` — confirmed `second_letter_*` fields are NOT yet declared (must be added)
- `.planning/REQUIREMENTS.md` — all four UI requirements (UI-01 through UI-04) confirmed
- `.planning/STATE.md` — v10 Phase 28 decision on UPPERCASE enum values confirmed

### Secondary (MEDIUM confidence)
- `MandantenPortalDesign/src/app/components/overview-sections.tsx` — QuickActions disabled button pattern — verified as the model for UI-01 button behavior
- `MandantenPortalDesign/src/app/components/client-list.tsx` — table column pattern with `TABLE_COLUMNS_CONFIG` — implied but not fully read; column addition should follow existing config pattern

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — No new dependencies; all libraries already present and in use
- Architecture patterns: HIGH — All patterns directly verified in existing code (TrackingCanvas comment, clientDetailApi.ts patterns, ConfirmActionDialog)
- Pitfalls: HIGH — Type gaps and viewport issue verified by reading actual source files; trigger idempotency confirmed from STATE.md decisions
- Backend requirements: HIGH — Plan-type endpoint pattern directly verified from existing recalculate endpoint code

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (stable codebase, no fast-moving dependencies)
