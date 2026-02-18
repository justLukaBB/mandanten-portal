---
phase: 22-client-detail
plan: "01"
subsystem: client-detail-api
tags: [rtk-query, client-detail, refactor, real-data]
dependency_graph:
  requires:
    - "19-03: baseApi RTK Query foundation with tagTypes"
    - "21-01: AdminClient types and StatusBadge component"
  provides:
    - "clientDetailApi.ts with useGetClientDetailQuery and useGetWorkflowStatusQuery hooks"
    - "ClientDetailData, ClientDetailCreditor, ClientDetailDocument, StatusHistoryEntry, WorkflowStatusResponse types"
    - "ClientDetail component fetching real API data by clientId"
  affects:
    - "22-02: Documents tab (will use client.documents from clientDetailApi)"
    - "22-03: Creditors tab (will use client.final_creditor_list from clientDetailApi)"
    - "22-04: Activity tab (will use client.status_history from clientDetailApi)"
tech_stack:
  added:
    - "clientDetailApi.ts (RTK Query injectEndpoints pattern)"
  patterns:
    - "baseApi.injectEndpoints for feature-scoped API slices"
    - "RTK Query providesTags with clientId for cache invalidation"
    - "Client-side computation of KPIs from raw API data"
    - "derivePhases helper mapping workflow_status to phase timeline"
key_files:
  created:
    - "MandantenPortalDesign/src/store/api/clientDetailApi.ts"
  modified:
    - "MandantenPortalDesign/src/app/types.ts"
    - "MandantenPortalDesign/src/app/components/client-detail.tsx"
    - "MandantenPortalDesign/src/app/App.tsx"
decisions:
  - "ClientDetail props changed from client: Client to clientId: string — component now owns data fetching"
  - "Loading/error/not-found states handled inside ClientDetail; App.tsx remains thin adapter"
  - "totalAmount computed client-side via Intl.NumberFormat from final_creditor_list.claim_amount sum"
  - "derivePhases maps workflow_status string to 3-phase timeline (Phase 1 complete when creditor_contact_active or later)"
  - "Manuell bestätigen button removed — rate confirmation is read-only from backend (Phase 22 enhancement if needed)"
  - "Documents/creditors/activity tabs use real data arrays even if rendering is basic — data flow established for 22-02/03/04"
  - "FlowBadge import removed from App.tsx — no longer needed after placeholder client removed"
metrics:
  duration: "5m"
  completed: "2026-02-18"
  tasks_completed: 2
  files_modified: 4
---

# Phase 22 Plan 01: Client Detail API Integration Summary

RTK Query endpoints for single client data plus full ClientDetail refactor from mock props to real API fetching with Übersicht and Profil tabs wired to live backend data.

## What Was Built

**Task 1: RTK Query client detail endpoints and types**

Created `clientDetailApi.ts` using `baseApi.injectEndpoints` with two endpoints:
- `getClientDetail` — GET `/api/clients/:clientId` returning full `ClientDetailData`
- `getWorkflowStatus` — GET `/api/admin/clients/:clientId/workflow-status` returning `WorkflowStatusResponse`

Added to `types.ts`:
- `ClientDetailDocument` — document shape with processing_status, ai_confidence, manual_review_required
- `ClientDetailCreditor` — full creditor shape including all 5 v7 fields (aktenzeichen_glaeubigervertreter, address_source, llm_address_original, glaeubiger_adresse_ist_postfach, glaeubiger_vertreter_adresse_ist_postfach)
- `StatusHistoryEntry` — status history with changed_by, metadata, created_at
- `ClientDetailData` — full client object with documents, final_creditor_list, status_history arrays
- `WorkflowStatusResponse` — workflow status with stats (needs_manual_review count)

**Task 2: Refactor ClientDetail component**

Props changed from `client: Client` to `clientId: string`. Component now:
- Fetches data via `useGetClientDetailQuery(clientId)` and `useGetWorkflowStatusQuery(clientId)`
- Shows centered spinner during loading, error message on failure, "Mandant nicht gefunden" if no data
- Übersicht tab: real KPI cards (totalCreditors, totalAmount in German EUR format, totalDocuments), dynamic phase timeline from `derivePhases(workflow_status)`, Phase 1 prerequisites from `first_payment_received` and `client_confirmed_creditors`
- Profil tab: real Stammdaten — fullName, email, address, phone, aktenzeichen, StatusBadge with workflow_status, created_at/updated_at formatted in German locale, portal access date from status_history
- Documents/creditors/activity tabs wired to real data arrays for 22-02/03/04 to enhance
- Header shows `${firstName} ${lastName}`, `aktenzeichen`, relative German time from `updated_at`
- `App.tsx` `ClientDetailPage` simplified to pass `clientId={id}` — placeholder mock client removed

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Verified files exist:
- `MandantenPortalDesign/src/store/api/clientDetailApi.ts` — created
- `MandantenPortalDesign/src/app/types.ts` — updated with 5 new interfaces
- `MandantenPortalDesign/src/app/components/client-detail.tsx` — refactored
- `MandantenPortalDesign/src/app/App.tsx` — ClientDetailPage updated

Verified commits exist:
- `00aec69` — feat(22-01): create RTK Query client detail endpoints and update types
- `f72ea71` — feat(22-01): refactor ClientDetail to fetch real data, wire Übersicht and Profil tabs

TypeScript: `npx tsc --noEmit` — PASS (0 errors)

## Self-Check: PASSED
