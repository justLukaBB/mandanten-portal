---
phase: 21-client-list
verified: 2026-02-18T22:15:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 21: Client List Verification Report

**Phase Goal:** Admins see a paginated list of real clients from the backend, with working search, status filter, flow filter, and correctly rendered status and flow badges
**Verified:** 2026-02-18T22:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Admin opens client list and sees real client records loaded from GET /api/admin/clients — not mock data | VERIFIED | `clientsApi.ts` line 44: `url: /api/admin/clients?${params.toString()}` wired to `useGetClientsQuery` called in `client-list.tsx` line 146; `mockClients` import absent from all source files |
| 2  | Each client row shows the correct German-labeled Status-Badge for all 10 real backend workflow states | VERIFIED | `status-badge.tsx` has `STATUS_STYLES` map with all 10 keys; `WORKFLOW_STATUS_LABELS` from `types.ts` provides German text; `StatusBadge status={client.workflow_status}` at line 717 |
| 3  | Each client row shows Flow-Badges derived from the workflow_status field | VERIFIED | `deriveFlowBadges(client.workflow_status)` called at line 626 of `client-list.tsx`; `FlowBadge` rendered via `renderFlowBadges()` at line 722 |
| 4  | Unknown or unexpected status values render a gray fallback badge showing the raw value | VERIFIED | `status-badge.tsx` line 86: `STATUS_STYLES[status] ?? FALLBACK_STYLE`; line 87: `WORKFLOW_STATUS_LABELS[status] ?? status` — raw string shown for unknowns |
| 5  | Loading state shows skeleton rows while initial data is fetched | VERIFIED | `client-list.tsx` line 583: `isLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)` with animated pulse divs |
| 6  | The list auto-refreshes every 30 seconds via RTK Query polling | VERIFIED | `client-list.tsx` line 148: `{ pollingInterval: 30000 }` passed to `useGetClientsQuery` |
| 7  | API errors show a toast notification while the table stays in its last known state | VERIFIED | `client-list.tsx` lines 152–156: `useEffect` on `error` calls `toast.error('Fehler beim Laden der Mandanten')` |
| 8  | Admin types in search field and list updates after ~300ms debounce; URL updates to ?search=… | VERIFIED | `searchInput` local state at line 97; `setTimeout(..., 300)` debounce at line 131; `setParam('search', searchInput)` writes to URL |
| 9  | Admin selects a status filter and only clients with that workflow_status are shown; URL updates | VERIFIED | `setParam('status', option.value)` at line 375; RTK Query called with `status: statusFilter` at line 147 |
| 10 | Admin selects a flow filter and only clients whose derived flows include that flow are shown | VERIFIED | `filteredClients` useMemo at lines 159–165 applies `deriveFlowBadges(...).includes(flowFilter)` client-side |
| 11 | Filter state is synced to URL params — bookmarkable and survives page reload | VERIFIED | `useSearchParams` at line 87; all params (`search`, `status`, `flow`, `page`, `limit`) read from URL; default values omitted via `setParam` helper |
| 12 | Active filters shown as removable chips above the table | VERIFIED | Lines 482–533: renders status chip, flow chip, search chip conditionally; each has `<X>` button calling `setParam(key, 'all'/'')` |
| 13 | Changing any filter or search resets pagination to page 1 | VERIFIED | `setParam` helper lines 119–122: `next.delete('page')` when `key !== 'page' && key !== 'limit'` |
| 14 | Page size configurable via dropdown (25/50/100) | VERIFIED | `pageSizeOptions = [25, 50, 100]` at line 37; dropdown rendered at lines 791–810; `setParam('limit', size.toString())` |
| 15 | Zero-results state shows 'Keine Mandanten gefunden' with hints and 'Filter zurücksetzen' button | VERIFIED | Lines 586–623: `SearchX` icon, "Keine Mandanten gefunden" text, hint text, "Filter zurücksetzen" button calling `resetAllFilters()` |
| 16 | App compiles without TypeScript errors | VERIFIED | `npx tsc --noEmit` exits with zero output and zero errors |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact | Provides | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `MandantenPortalDesign/src/store/api/clientsApi.ts` | RTK Query endpoint for GET /api/admin/clients; exports `useGetClientsQuery`, `ClientListResponse` | YES | YES — 64 lines, full `injectEndpoints` with URLSearchParams, `transformResponse`, `providesTags` | YES — imported and used in `client-list.tsx` line 8 | VERIFIED |
| `MandantenPortalDesign/src/app/types.ts` | `WorkflowStatus` union of 10 states, `AdminClient` interface, `WORKFLOW_STATUS_LABELS`, `deriveFlowBadges` | YES | YES — all 4 exports present; 10-state union, full AdminClient shape, complete label map, flow derivation function | YES — imported by `client-list.tsx`, `status-badge.tsx`, `flow-badge.tsx`, `clientsApi.ts` | VERIFIED |
| `MandantenPortalDesign/src/app/components/status-badge.tsx` | StatusBadge rendering all 10 workflow states with colors and German labels; gray fallback | YES | YES — 127 lines; `STATUS_STYLES` map covers all 10 keys; `FALLBACK_STYLE` for unknowns; both `default` and `dot` variants | YES — used in `client-list.tsx` line 717 | VERIFIED |
| `MandantenPortalDesign/src/app/components/flow-badge.tsx` | FlowBadge with gray fallback for unknown values | YES | YES — 51 lines; `flowStyles` for 4 known flows; `FALLBACK_FLOW_STYLE` (#9CA3AF) for unknowns; `flow: string` prop type | YES — used in `client-list.tsx` via `renderFlowBadges()` | VERIFIED |
| `MandantenPortalDesign/src/app/components/client-list.tsx` | ClientList with RTK Query, badges, loading skeleton, error toasts, URL-synced filters, chips, page size, zero-results | YES | YES — 897 lines; fully implemented, no stubs | YES — rendered in `App.tsx` via `ClientListPage` | VERIFIED |
| `MandantenPortalDesign/src/app/App.tsx` | App routing compatible with new ClientList; no mock data | YES | YES — no `mockClients` import; `AdminClient` used; `ClientList` rendered without `clients` prop | YES — root component | VERIFIED |

---

### Key Link Verification

| From | To | Via | Pattern Checked | Status |
|------|----|-----|-----------------|--------|
| `client-list.tsx` | `clientsApi.ts` | `useGetClientsQuery` with `pollingInterval: 30000` | Line 146–149: `useGetClientsQuery({ page, limit, search, status: statusFilter }, { pollingInterval: 30000 })` | WIRED |
| `clientsApi.ts` | `/api/admin/clients` | RTK Query `fetchBaseQuery` | Line 44: `url: /api/admin/clients?${params.toString()}` | WIRED |
| `client-list.tsx` | `status-badge.tsx` | `StatusBadge` rendering `workflow_status` | Line 717: `<StatusBadge status={client.workflow_status} />` | WIRED |
| `client-list.tsx` | URL search params | `useSearchParams` from react-router | Line 87: `const [searchParams, setSearchParams] = useSearchParams()` | WIRED |
| `client-list.tsx` | `clientsApi.ts` | `useGetClientsQuery` with URL-derived params (`search`, `status`) | Line 147: `{ page, limit, search, status: statusFilter }` — all from `searchParams.get(...)` | WIRED |
| `clientsApi.ts` | `baseApi` | `baseApi.injectEndpoints` | Line 23: `export const clientsApi = baseApi.injectEndpoints(...)` | WIRED |
| `baseApi.ts` | Redux store | `baseApi.reducerPath` / `baseApi.middleware` | `store/index.ts` lines 6–8: `[baseApi.reducerPath]: baseApi.reducer` + middleware concat | WIRED |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LIST-01 | 21-01 | Admin sieht paginierte Client-Liste mit Echtdaten aus /api/admin/clients | SATISFIED | `clientsApi.ts` calls `/api/admin/clients`; `client-list.tsx` uses `useGetClientsQuery`; pagination from `data.pagination.totalPages`; mock data absent |
| LIST-02 | 21-02 | Admin kann Clients nach Name, Fall-ID oder Email durchsuchen | SATISFIED | `searchInput` local state with 300ms debounce synced to URL `?search=`; passed as `search` param to RTK Query |
| LIST-03 | 21-02 | Admin kann Clients nach Status filtern | SATISFIED | `statusOptions` array with all 10 real workflow states; `setParam('status', ...)` writes to URL; passed as `status` to RTK Query |
| LIST-04 | 21-02 | Admin kann Clients nach Flow filtern | SATISFIED | `flowOptions` array with 4 flows; `setParam('flow', ...)` writes to URL; `filteredClients` useMemo applies `deriveFlowBadges` client-side |
| LIST-05 | 21-01 | Client-Zeilen zeigen Status-Badge und Flow-Badges korrekt an | SATISFIED | `<StatusBadge status={client.workflow_status} />` renders German labels from `WORKFLOW_STATUS_LABELS`; `renderFlowBadges(deriveFlowBadges(...))` renders flow chips |

No orphaned requirements — all 5 LIST IDs declared in plans match REQUIREMENTS.md, none are unaccounted for.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `App.tsx` | 32, 86 | `// TODO: Phase 22 will replace...` comments for ClientDetail real data and Sidebar recentCases | Info | Intentional deferral; out of scope for Phase 21; does not affect client list functionality |

No blockers. No stub implementations. No empty handlers. No `return null` / `return {}` patterns in phase 21 files.

---

### Human Verification Required

#### 1. End-to-End Data Load

**Test:** Start the Vite dev server (`npm run dev` in MandantenPortalDesign) and FastAPI backend. Navigate to `/clients`.
**Expected:** Real client records appear — not the placeholder mock data. Each row shows firstName + lastName, email, aktenzeichen, a colored status badge with a German label, and flow badge pills.
**Why human:** Cannot verify network request returns real backend data programmatically without a running backend.

#### 2. Search Debounce UX

**Test:** Type "mueller" character by character in the search field.
**Expected:** The list does NOT update on every keystroke — only after ~300ms of inactivity. URL updates to `?search=mueller`.
**Why human:** Debounce timing requires real browser interaction to confirm.

#### 3. 30-Second Auto-Refresh

**Test:** Load the client list, wait 30+ seconds without interaction.
**Expected:** The "Aktualisiere..." indicator briefly appears and data silently refreshes. No user interaction required.
**Why human:** Requires waiting in a live browser; can't verify timing behavior statically.

#### 4. Error Toast Behavior

**Test:** Stop the backend while the client list is loaded. Wait for the next poll (30s) or force a refetch.
**Expected:** A toast notification "Fehler beim Laden der Mandanten" appears. The table remains showing the last known data — it does not clear to empty.
**Why human:** Requires a live network failure scenario.

#### 5. URL Bookmarkability

**Test:** Navigate to `/clients?status=created&search=test`, reload the page.
**Expected:** The page loads with status filter set to "Erstellt" and search field showing "test". Filter chips appear above the table.
**Why human:** Requires browser navigation to verify URL restoration.

---

### Notes

- `mock-data.ts` still exists as a file but is no longer imported anywhere in the application. It is an orphan file — safe to delete in a future cleanup pass but does not affect functionality.
- The `ClientDetailPage` in `App.tsx` uses a placeholder shape for the old `Client` type, but this is explicitly deferred to Phase 22. It does not affect the Phase 21 goal.
- `Sidebar` receives `recentCases={[]}` — also a Phase 22 concern per SUMMARY.md decision log.
- TypeScript compilation passes cleanly (`npx tsc --noEmit` exits with zero errors).
- `clientsApi` uses `baseApi.injectEndpoints` pattern — no separate store registration needed; it inherits the `baseApi` reducer path and middleware registered in `store/index.ts`.

---

_Verified: 2026-02-18T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
