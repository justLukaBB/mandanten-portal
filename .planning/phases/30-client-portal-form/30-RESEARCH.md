# Phase 30: Client Portal Form - Research

**Researched:** 2026-03-02
**Domain:** CRA Client Portal (React + RTK Query + axios) / Express backend
**Confidence:** HIGH — codebase is the primary source; all patterns verified by direct code inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Formular-Aufbau & Layout**
- Logische Abschnitte mit Überschriften: z.B. "Einkommensdaten", "Persönliche Daten", "Gläubiger-Informationen" — visuell getrennt
- Mobile-first Design — Mandanten öffnen den E-Mail-Link häufig am Smartphone
- Oben im Formular: Kanzlei-Branding (Name/Logo) + kurzer Erklärtext warum der Mandant das ausfüllt

**Submit-Flow**
- Vor dem Absenden: Bestätigungsdialog ("Ihre Daten können nach dem Absenden nicht mehr geändert werden.") mit Bestätigen/Abbrechen
- Beim Absenden: Submit-Button wird zum Spinner, Formular bleibt sichtbar aber nicht editierbar
- Nach erfolgreichem Submit: Formular verschwindet, Erfolgsmeldung mit Häkchen auf gleicher Seite
- Bei Fehler (Netzwerk etc.): Rote Fehlermeldung oben, Daten bleiben im Formular, erneut versuchen möglich

**Bereits-eingereicht-Ansicht**
- Nur Statusmeldung: "Ihre Daten wurden am [Datum] eingereicht." — keine Datenanzeige
- Gleiches Kanzlei-Branding wie im Formular (konsistentes Erscheinungsbild)
- Einreichungsdatum wird im Text angezeigt

**Zugangsschutz**
- Formular nur zugänglich wenn second_letter_status == PENDING
- Bei anderem Status: Freundliche Fehlermeldung "Dieses Formular ist derzeit nicht verfügbar." — keine technischen Details

**Bedingte Felder**
- "Neue Gläubiger" Toggle auf Ja → Felder für Name + Betrag gleiten smooth ein (Animation)
- Mehrere neue Gläubiger möglich: "Weiteren Gläubiger hinzufügen"-Button, dynamische Liste

**Validierung**
- Kombination: Inline-Validierung beim Verlassen des Feldes für offensichtliche Fehler (leere Pflichtfelder), restliche Validierung beim Submit
- Pflichtfelder gemäß FORM-02: Nettoeinkommen, Einkommensquelle, Familienstand, Unterhaltspflichten, Lohnpfändungen aktiv, neue Gläubiger, Richtigkeitsbestätigung

### Claude's Discretion
- Visuelle Unterscheidung vorausgefüllter vs. leerer Felder (dezenter Hinweis oder gleiches Styling)
- Fehlerdarstellung (Stil der Validierungsfehlermeldungen)
- Exaktes Spacing und Typografie innerhalb der Abschnitte
- Animationstiming für konditionelle Felder

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FORM-01 | Formular im alten Portal (/src/) mit vorausgefüllten Finanzdaten aus financial_data + extended_financial_data | Existing CRA portal at /src/. Pre-fill pattern: load client data in useEffect, map fields to formData state. Both subdocuments exist on Client model already. |
| FORM-02 | Pflichtfelder: Monatliches Nettoeinkommen, Einkommensquelle (Select), Familienstand (Select), Anzahl Unterhaltspflichten, Lohnpfändungen aktiv (Boolean), neue Gläubiger (Boolean + konditionell Name/Betrag), Bestätigung Richtigkeit (Checkbox) | 7 required fields. Einkommensquelle maps to extended_financial_data.berufsstatus (enum: angestellt/selbststaendig/arbeitslos/rentner/in_ausbildung). Lohnpfändungen maps to aktuelle_pfaendung (Boolean on top-level). Neue Gläubiger is new — needs schema field in second_letter_financial_snapshot (Phase 28). |
| FORM-03 | Bei Submit: financial_data in DB aktualisiert + immutabler Snapshot in second_letter_financial_snapshot erstellt | Backend: single safeClientUpdate call that (1) updates financial_data.monthly_net_income etc., (2) writes second_letter_financial_snapshot subdocument. Snapshot fields defined in Phase 28 schema. |
| FORM-04 | Status-Übergang PENDING → FORM_SUBMITTED nach erfolgreichem Submit | Same safeClientUpdate call: set second_letter_status = 'FORM_SUBMITTED' + second_letter_form_submitted_at = new Date(). Must guard: only allowed when current status === 'PENDING'. |
| FORM-05 | Formular nur sichtbar/zugänglich wenn second_letter_status == PENDING — clients mit anderen Status können nicht erneut einreichen | Backend route guard: check second_letter_status before processing. Frontend: new route /portal/second-letter-form with token-based auth + status check on load. |
</phase_requirements>

---

## Summary

Phase 30 builds a standalone token-authenticated form page inside the existing CRA portal (`/src/`). The form lives at a new route (e.g., `/portal/second-letter-form?token=<second_letter_form_token>`) — NOT inside the `PersonalPortal` wrapper, because the client arrives via a deep-link email without being logged in via the normal portal session. The token (`second_letter_form_token`) is a dedicated JWT with 14-day expiry added to the Client model in Phase 28.

The frontend pattern follows the existing `FinancialDataForm` and `ExtendedFinancialDataWizard` components: local `useState` for form fields, axios (`api.ts`) for HTTP, inline validation on blur + full validation on submit. The form pre-fills from data returned by a new backend endpoint (GET) and submits via a POST endpoint that enforces the PENDING status guard, writes the snapshot, updates financial_data, and transitions the state machine.

The backend adds two new routes to `client-portal.js`: a GET endpoint that validates the token and returns pre-fill data, and a POST endpoint that performs the atomic state transition and snapshot write. Both routes use a new `authenticateSecondLetterToken` middleware (distinct from `authenticateClient`, because the token type and payload differ). The confirmation dialog and "already submitted" state are managed entirely in the frontend.

**Primary recommendation:** Build a self-contained page component `SecondLetterForm.tsx` in `/src/pages/` with its own route in `App.tsx`. Token is read from the URL query string; no Redux auth is involved for this flow. Use `useState` + `api` (axios instance) directly, following the `FinancialDataForm` pattern.

---

## Standard Stack

### Core (verified by codebase inspection)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | 18.x (CRA) | UI rendering | Existing portal |
| axios (via `api.ts`) | existing | HTTP calls with interceptors | All existing portal HTTP calls use this axios instance |
| React Router v6 | 6.x | Route definition in App.tsx | Already in use, Route pattern at lines 109-151 |
| jsonwebtoken | existing (server) | JWT sign/verify | Already used in all auth middleware |
| Mongoose `safeClientUpdate` | existing (server) | Atomic client writes | Pattern for all financial-data writes in clientPortalController.js |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @heroicons/react | existing | Icons (CheckIcon, ExclamationTriangleIcon) | Use same icon set as FinancialDataForm |
| CSS transition (Tailwind) | existing | Conditional field animation | `transition-all duration-200 overflow-hidden` for new-creditor slide-in |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| useState + api | RTK Query mutation | RTK Query is heavier; FinancialDataForm uses useState+api directly — follow that pattern for consistency |
| Separate page component | Embed in PersonalPortal | PersonalPortal requires active portal session; deep-link tokens are independent |

---

## Architecture Patterns

### Recommended Project Structure

```
/src/
├── pages/
│   └── SecondLetterForm.tsx      # NEW: standalone form page, token from URL
├── components/
│   └── (no new shared components needed — logic is self-contained)
├── App.tsx                        # ADD: /portal/second-letter-form route (public, no ProtectedRoute)
/server/
├── controllers/
│   └── clientPortalController.js # ADD: handleGetSecondLetterFormData, handleSubmitSecondLetterForm
├── middleware/
│   └── auth.js                   # ADD: authenticateSecondLetterToken middleware
├── routes/
│   └── client-portal.js          # ADD: GET/POST /clients/:clientId/second-letter-form
```

### Pattern 1: Token-Authenticated Standalone Page

**What:** Page reads `?token=` from URL query string, validates via backend, renders form or status message. No Redux auth, no ProtectedRoute.

**When to use:** When access is via email deep-link — user has no existing portal session.

**Example (frontend):**
```tsx
// Source: App.tsx lines 109-151 (existing pattern for public routes)

// App.tsx — add route (NO ProtectedRoute wrapping):
<Route path="/portal/second-letter-form" element={<SecondLetterForm />} />

// SecondLetterForm.tsx — read token from URL:
import { useSearchParams } from 'react-router-dom';

const [searchParams] = useSearchParams();
const token = searchParams.get('token');

useEffect(() => {
  if (!token) {
    setStatus('error');
    return;
  }
  api.get(`/api/second-letter-form`, { headers: { Authorization: `Bearer ${token}` } })
    .then(res => {
      setPreFillData(res.data);
      setStatus(res.data.second_letter_status === 'PENDING' ? 'form' : 'already_submitted');
    })
    .catch(() => setStatus('unavailable'));
}, [token]);
```

**Example (backend — new GET route):**
```javascript
// Source: clientPortalController.js handleSubmitFinancialData pattern (line 991-1046)
handleGetSecondLetterFormData: async (req, res) => {
  // req.clientId set by authenticateSecondLetterToken middleware
  const client = await Client.findOne({ id: req.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Return status + pre-fill data
  res.json({
    second_letter_status: client.second_letter_status,
    second_letter_form_submitted_at: client.second_letter_form_submitted_at,
    pre_fill: {
      monthly_net_income: client.financial_data?.monthly_net_income,
      marital_status: client.financial_data?.marital_status ?? client.familienstand,
      number_of_dependents: client.extended_financial_data?.anzahl_unterhaltsberechtigte,
      income_source: client.extended_financial_data?.berufsstatus,
      active_garnishments: client.aktuelle_pfaendung ?? false,
    }
  });
}
```

### Pattern 2: Snapshot Write + Status Transition (Backend)

**What:** Single `safeClientUpdate` call writes both the snapshot and the status transition atomically. Status guard is the FIRST check — if not PENDING, return 409.

**When to use:** Any write that must enforce state machine constraints.

**Example:**
```javascript
// Source: clientPortalController.js safeClientUpdate pattern (line 1010-1022)
handleSubmitSecondLetterForm: async (req, res) => {
  const client = await Client.findOne({ id: req.clientId });
  if (!client) return res.status(404).json({ error: 'Not found' });

  // Status guard FIRST — before any data changes
  if (client.second_letter_status !== 'PENDING') {
    return res.status(409).json({ error: 'Formular nicht verfügbar' });
  }

  const updatedClient = await safeClientUpdate(client.id, async (c) => {
    // 1. Update financial_data with corrections
    c.financial_data = {
      ...c.financial_data,
      monthly_net_income: parseFloat(req.body.monthly_net_income),
      marital_status: req.body.marital_status,
      // ...other fields
    };
    // 2. Write immutable snapshot
    c.second_letter_financial_snapshot = {
      monthly_net_income: parseFloat(req.body.monthly_net_income),
      income_source: req.body.income_source,
      marital_status: req.body.marital_status,
      number_of_dependents: parseInt(req.body.number_of_dependents),
      active_garnishments: req.body.active_garnishments === true,
      new_creditors: req.body.new_creditors,  // Array [{name, amount}]
      submitted_at: new Date()
    };
    // 3. Transition state machine
    c.second_letter_status = 'FORM_SUBMITTED';
    c.second_letter_form_submitted_at = new Date();
    return c;
  });

  res.json({ success: true, submitted_at: updatedClient.second_letter_form_submitted_at });
}
```

### Pattern 3: New Token Auth Middleware

**What:** `authenticateSecondLetterToken` validates a JWT where `type === 'second_letter'` (set in Phase 29 when generating the form token). This is separate from `authenticateClient` (type: 'client') to keep concerns isolated.

**When to use:** GET and POST /api/second-letter-form routes only.

**Example:**
```javascript
// Source: server/middleware/auth.js lines 7-75 (authenticateClient pattern)
const authenticateSecondLetterToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'second_letter') {
      return res.status(403).json({ error: 'Invalid token type' });
    }
    req.clientId = decoded.clientId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### Pattern 4: Conditional Fields with Animation

**What:** "Neue Gläubiger" boolean toggle. When true, a container div slides in with `max-height` transition. Dynamic list with "add more" button.

**When to use:** Any conditional field group (CONTEXT.md decision: smooth animation).

**Example:**
```tsx
// Follow FinancialDataForm handleInputChange pattern (lines 88-101)
const [hasNewCreditors, setHasNewCreditors] = useState<boolean>(false);
const [newCreditors, setNewCreditors] = useState([{ name: '', amount: '' }]);

// JSX:
<div className={`transition-all duration-200 overflow-hidden ${hasNewCreditors ? 'max-h-96' : 'max-h-0'}`}>
  {newCreditors.map((creditor, index) => (
    <div key={index}>
      <input value={creditor.name} onChange={...} placeholder="Gläubiger Name" />
      <input value={creditor.amount} onChange={...} placeholder="Betrag €" />
    </div>
  ))}
  <button onClick={() => setNewCreditors([...newCreditors, { name: '', amount: '' }])}>
    + Weiteren Gläubiger hinzufügen
  </button>
</div>
```

### Pattern 5: Confirmation Dialog (inline, not a modal library)

**What:** Simple overlay div with Bestätigen/Abbrechen, triggered before the actual submit. Follows existing PersonalPortal modal pattern (lines 702-835) — no external modal library used.

**When to use:** The locked decision is a confirmation dialog before final submit.

**Example:**
```tsx
// Source: PersonalPortal.tsx lines 702-835 (inline modal pattern)
{showConfirmDialog && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
      <h3>Daten einreichen?</h3>
      <p>Ihre Daten können nach dem Absenden nicht mehr geändert werden.</p>
      <button onClick={handleConfirmSubmit}>Bestätigen</button>
      <button onClick={() => setShowConfirmDialog(false)}>Abbrechen</button>
    </div>
  </div>
)}
```

### Anti-Patterns to Avoid

- **Using ProtectedRoute for this route:** The deep-link user has no portal session — ProtectedRoute would redirect them to /login immediately. This route must be public.
- **Reading clientId from URL params instead of the token:** The clientId must come from the decoded JWT (req.clientId on backend, decoded token on frontend), not from URL params, to prevent IDOR.
- **Calling `client.save()` directly instead of `safeClientUpdate`:** The existing controller always uses `safeClientUpdate` for concurrent-write safety (see pattern in handleSubmitFinancialData, line 1010).
- **Pre-filling from live data after submit:** Once FORM_SUBMITTED, the source of truth for calculations is the snapshot — never re-read live financial_data in subsequent phases.
- **Using the existing `authenticateClient` middleware for second-letter routes:** The token type is `second_letter`, not `client` — existing middleware would reject it at line 46 of auth.js.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT validation | Custom token parsing | `jwt.verify()` from existing auth.js pattern | Already handles TokenExpiredError, JsonWebTokenError |
| Concurrent write safety | Read-then-write pattern | `safeClientUpdate()` (clientService) | Existing abstraction; avoids race conditions |
| Atomic status check + update | Two separate DB calls | Status guard inside `safeClientUpdate` callback | Must be atomic; two calls would allow race conditions |
| Animation | React state + CSS animation library | Tailwind `transition-all overflow-hidden max-h-0/max-h-96` | No new dependencies needed |
| Form validation | External library (Zod, Yup) | Local `validateForm()` function | FinancialDataForm.tsx already uses this pattern (lines 55-86) |

**Key insight:** The pattern for "validate token → load data → submit with guard" is fully implemented for the existing financial data flow. Phase 30 is a new application of the same pattern, not a new problem.

---

## Common Pitfalls

### Pitfall 1: Token Source Confusion
**What goes wrong:** Developer stores the second_letter_form_token in localStorage (like the regular portal session) and the api.ts interceptor picks it up for all requests, mixing auth contexts.
**Why it happens:** api.ts interceptor automatically attaches any stored token to every request (lines 158-206).
**How to avoid:** Do NOT store the second-letter token in localStorage. Read it from the URL query string on every render and pass it manually in the Authorization header for the two second-letter endpoints only. Use a separate axios call, not the shared `api` instance, OR pass the token explicitly.
**Warning signs:** Second-letter token appearing in unrelated API calls; other portal features breaking for users who arrived via deep-link.

### Pitfall 2: IDOR via clientId in URL
**What goes wrong:** Route is `/portal/second-letter-form/:clientId?token=...` — client modifies the clientId in URL to access another client's data.
**Why it happens:** Route parameter not cross-checked with token payload.
**How to avoid:** Backend must derive clientId exclusively from the decoded JWT (`req.clientId = decoded.clientId`). Never trust the clientId from URL params for authorization decisions. Cross-check: if route has a clientId param, verify it matches the decoded token's clientId.
**Warning signs:** Backend uses `req.params.clientId` for the authorization decision instead of `req.clientId` set by middleware.

### Pitfall 3: Snapshot Written Before Status Guard
**What goes wrong:** Code updates financial_data and writes snapshot BEFORE checking `second_letter_status === 'PENDING'`. A FORM_SUBMITTED or SENT client can re-overwrite their data.
**Why it happens:** Putting the guard after the data writes.
**How to avoid:** Status guard is the FIRST operation in the handler — before any data reads or writes. Return 409 immediately if not PENDING.
**Warning signs:** second_letter_financial_snapshot being overwritten; status staying FORM_SUBMITTED but data changing.

### Pitfall 4: Phase 28 Schema Not Yet Applied
**What goes wrong:** Phase 30 code references `client.second_letter_status` and `client.second_letter_financial_snapshot` — but if Phase 28 hasn't run yet, these fields don't exist on the model and MongoDB will silently ignore writes to them.
**Why it happens:** Phase ordering — 30 depends on 28 (schema) and 29 (token generation).
**How to avoid:** Verify Phase 28 is deployed before testing Phase 30. The pending todo in STATE.md confirms: "Confirm second_letter_form_token design against existing authenticateClient middleware before Phase 30."
**Warning signs:** `client.second_letter_status` is `undefined`; status guard never fires; snapshot writes silently discarded.

### Pitfall 5: Pre-fill Field Mapping Gaps
**What goes wrong:** Some FORM-02 fields don't have a clean source in the current data:
- `income_source` (Einkommensquelle) → must come from `extended_financial_data.berufsstatus` (confirmed in schema)
- `active_garnishments` (Lohnpfändungen aktiv) → must come from `aktuelle_pfaendung` (top-level Boolean, line 269 of Client.js)
- `number_of_dependents` (Unterhaltspflichten) → must come from `extended_financial_data.anzahl_unterhaltsberechtigte` (not `financial_data.number_of_children`)
- `new_creditors` → no existing source; will be empty/false pre-fill (new data)
**Why it happens:** FORM-02 fields span multiple subdocuments.
**How to avoid:** Backend GET endpoint explicitly maps each field from its correct source subdocument. Do not send the entire client object to the frontend.
**Warning signs:** Wrong field being pre-filled; anzahl_unterhaltsberechtigte showing as children count.

### Pitfall 6: "Bereits eingereicht" Date Formatting
**What goes wrong:** `second_letter_form_submitted_at` stored as ISO date string; displayed raw in UI looks technical.
**Why it happens:** No formatting step.
**How to avoid:** Frontend formats the date with `new Date(date).toLocaleDateString('de-DE')` for German locale format (e.g., "2.3.2026").

---

## Code Examples

Verified patterns from direct codebase inspection:

### Token Reading from URL (frontend)
```tsx
// Source: App.tsx (React Router v6 useSearchParams pattern, lines 30-46)
import { useSearchParams } from 'react-router-dom';
const [searchParams] = useSearchParams();
const token = searchParams.get('token');
// Pass directly to API call — do not store in localStorage
```

### Axios Call with Explicit Token (bypassing interceptor)
```tsx
// Source: src/config/api.ts — the interceptor auto-attaches stored tokens
// For second-letter form, pass token explicitly to avoid interceptor confusion:
const response = await axios.get(`${API_BASE_URL}/api/second-letter-form`, {
  headers: { Authorization: `Bearer ${token}` }
});
// OR: use the shared api instance but pass Authorization header explicitly
// (explicit header overrides the interceptor's auto-attach behavior in axios)
```

### safeClientUpdate (backend write pattern)
```javascript
// Source: clientPortalController.js lines 1010-1022 (handleSubmitFinancialData)
const updatedClient = await safeClientUpdate(clientId, async (c) => {
  c.financial_data = { ...c.financial_data, monthly_net_income: ... };
  c.second_letter_financial_snapshot = { ... };
  c.second_letter_status = 'FORM_SUBMITTED';
  c.second_letter_form_submitted_at = new Date();
  return c;
});
```

### Adding Route to App.tsx (public route pattern)
```tsx
// Source: App.tsx lines 111-114 (ConfirmCreditors route — also public, no ProtectedRoute)
<Route
  path="/portal/second-letter-form"
  element={<SecondLetterForm />}
/>
```

### Form Submit State (isSubmitting pattern)
```tsx
// Source: FinancialDataForm.tsx lines 103-152
const [isSubmitting, setIsSubmitting] = useState(false);
const handleSubmit = async (e) => {
  e.preventDefault();
  const validationErrors = validateForm();
  if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
  setIsSubmitting(true);
  try {
    const response = await api.post(`/api/...`, submitData);
    if (response.data.success) { setStatus('submitted'); }
  } catch (error) {
    setErrors({ submit: error.response?.data?.error || 'Netzwerkfehler' });
  } finally {
    setIsSubmitting(false);
  }
};
```

### Route Registration in client-portal.js
```javascript
// Source: client-portal.js lines 59-68 (existing financial-form-status pattern)
router.get('/second-letter-form',
  authenticateSecondLetterToken,
  controller.handleGetSecondLetterFormData
);
router.post('/second-letter-form',
  authenticateSecondLetterToken,
  controller.handleSubmitSecondLetterForm
);
```

---

## Pre-fill Field Mapping Reference

This table is critical for FORM-01 — planner must ensure every pre-fill field is sourced from the correct subdocument:

| Form Field | DB Source | Path |
|------------|-----------|------|
| monthly_net_income | financial_data | `client.financial_data.monthly_net_income` |
| marital_status | financial_data OR top-level | `client.financial_data?.marital_status ?? client.familienstand` |
| income_source | extended_financial_data | `client.extended_financial_data?.berufsstatus` |
| number_of_dependents | extended_financial_data | `client.extended_financial_data?.anzahl_unterhaltsberechtigte` |
| active_garnishments | top-level | `client.aktuelle_pfaendung ?? false` |
| new_creditors | none | Always false/empty (new data this form collects) |

**Note:** If `financial_data` or `extended_financial_data` is null/undefined (client has not filled earlier forms), pre-fill should show empty fields — do not crash. Use optional chaining throughout.

---

## State Machine Integration

### What Phase 30 Transitions

```
IDLE → [Phase 29 admin/scheduler trigger] → PENDING
PENDING → [Phase 30 form submit] → FORM_SUBMITTED   ← THIS PHASE
FORM_SUBMITTED → [Phase 33 send] → SENT
```

### Guards Required in This Phase

| Guard | Where | What |
|-------|-------|-------|
| Status === 'PENDING' | Backend POST handler | First check before any write |
| Token type === 'second_letter' | `authenticateSecondLetterToken` middleware | Reject if wrong type |
| Token not expired | `jwt.verify()` in middleware | 14-day expiry enforced |
| All required fields present | Backend validation | Reject 400 if any FORM-02 field missing |

---

## Open Questions

1. **Does Phase 28 add `second_letter_form_token` to the Client model?**
   - What we know: STATE.md confirms "Token: dedicated second_letter_form_token (short-lived, 14 days) — NOT the onboarding portal_token" and it is listed as a schema field to add in Phase 28 context.
   - What's unclear: The 28-CONTEXT.md does not explicitly name `second_letter_form_token` in the schema decisions (it focuses on snapshot fields, status enum, and timestamps). The token field may be implicit.
   - Recommendation: Before planning Phase 30, confirm `second_letter_form_token` is explicitly included in Phase 28's PLAN.md. If not, it must be added there — Phase 30 cannot generate or validate the token without the schema field.

2. **URL structure of the deep-link: token in query string vs. path segment?**
   - What we know: STATE.md says "Email enthält Deep-Link zum Portal-Formular (mit Token für Authentifizierung)". CONTEXT.md doesn't specify.
   - What's unclear: Whether the route is `/portal/second-letter-form?token=<jwt>` or `/portal/second-letter-form/<token>`.
   - Recommendation: Use query string (`?token=`) — this is the standard pattern for magic links and it's simpler to handle with `useSearchParams`. Path segment would require a route param and complicates routing.

3. **Should the form use the shared `api` axios instance or a separate axios instance?**
   - What we know: The shared `api` instance (src/config/api.ts) has an interceptor that auto-attaches stored tokens (auth_token, portal_session_token, admin_token). The second-letter user may have no stored token. If they also have a regular portal session, the interceptor might attach the wrong token.
   - Recommendation: For the two second-letter endpoints, pass the `Authorization` header explicitly in the axios config rather than relying on the interceptor. Explicit headers in axios override interceptor-set headers. No separate axios instance needed.

---

## Sources

### Primary (HIGH confidence)
- `/Users/luka.s/Migration Mandanten Portal/server/controllers/clientPortalController.js` — handleSubmitFinancialData pattern, safeClientUpdate usage, authorization check pattern
- `/Users/luka.s/Migration Mandanten Portal/server/middleware/auth.js` — authenticateClient pattern to mirror for authenticateSecondLetterToken
- `/Users/luka.s/Migration Mandanten Portal/server/routes/client-portal.js` — route registration pattern
- `/Users/luka.s/Migration Mandanten Portal/server/models/Client.js` — all pre-fill field paths verified
- `/Users/luka.s/Migration Mandanten Portal/src/components/FinancialDataForm.tsx` — full form pattern (state, validation, submit, error handling)
- `/Users/luka.s/Migration Mandanten Portal/src/pages/PersonalPortal.tsx` — confirmation dialog pattern, portal layout
- `/Users/luka.s/Migration Mandanten Portal/src/App.tsx` — route registration pattern, public vs protected routes
- `/Users/luka.s/Migration Mandanten Portal/src/config/api.ts` — interceptor behavior, token precedence
- `/Users/luka.s/Migration Mandanten Portal/src/store/api/baseApi.ts` — RTK Query base, existing tag types
- `/Users/luka.s/Migration Mandanten Portal/.planning/phases/30-client-portal-form/30-CONTEXT.md` — locked decisions
- `/Users/luka.s/Migration Mandanten Portal/.planning/STATE.md` — v10 key decisions
- `/Users/luka.s/Migration Mandanten Portal/.planning/REQUIREMENTS.md` — FORM-01 through FORM-05 definitions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by direct codebase inspection; all libraries already in use
- Architecture: HIGH — exact patterns from clientPortalController.js and FinancialDataForm.tsx
- Pitfalls: HIGH — derived from actual code behavior (interceptor logic, auth middleware, safeClientUpdate)
- Pre-fill field mapping: HIGH — verified against Client.js schema line by line
- Phase dependency risk: MEDIUM — Phase 28 schema must exist; schema not yet applied (Phase 28 not started per STATE.md)

**Research date:** 2026-03-02
**Valid until:** Stable — CRA portal is legacy, no active churn expected. Valid until Phase 28 schema diverges from current design.
