# Architecture

**Analysis Date:** 2026-01-30

## Pattern Overview

**Overall:** Full-Stack Monorepo with Service-Oriented Backend and Role-Based Multi-Portal Frontend

**Key Characteristics:**
- Client-server architecture with React SPA frontend and Node.js/Express backend
- MongoDB document store for flexible schema evolution
- Queue-based asynchronous processing for document analysis and webhooks
- Role-based access control with three separate portal experiences (client, agent, admin)
- External service orchestration (AI processing, Zendesk ticketing, email, cloud storage)

## Layers

**Frontend Presentation Layer:**
- Purpose: Role-specific user interfaces for clients, agents, and administrators
- Location: `src/`
- Contains: React components, Redux state management, routing logic, UI components
- Depends on: Backend API (`server/`), localStorage for auth tokens
- Used by: End users (clients, agents, admins) via web browser

**Frontend State Management:**
- Purpose: Centralized application state with API caching
- Location: `src/store/`
- Contains: Redux Toolkit slices, RTK Query API definitions
- Depends on: React, Redux, backend API endpoints
- Used by: React components throughout the frontend

**Backend API Layer:**
- Purpose: RESTful HTTP endpoints for frontend communication
- Location: `server/routes/`
- Contains: Express route handlers grouped by feature (admin, agent, client, webhooks)
- Depends on: Controllers, middleware (auth, security, upload)
- Used by: Frontend applications, external webhooks (Zendesk)

**Backend Controller Layer:**
- Purpose: Request validation, response formatting, orchestration of service calls
- Location: `server/controllers/`
- Contains: Business logic coordination, request/response transformation
- Depends on: Services, models, utilities
- Used by: Route handlers

**Backend Service Layer:**
- Purpose: Core business logic and external integrations
- Location: `server/services/`
- Contains: Document processing, AI integration, Zendesk management, email sending, creditor contact workflows
- Depends on: Models, external APIs (Anthropic Claude, Google Document AI, Zendesk, Resend)
- Used by: Controllers, workers, scheduler

**Queue/Worker Layer:**
- Purpose: Asynchronous background job processing with retry logic
- Location: `server/workers/`, `server/services/webhookQueueService.js`, `server/services/documentQueueService.js`
- Contains: Webhook processing queue, document processing queue with concurrency control
- Depends on: MongoDB job models, services
- Used by: Backend routes (enqueue jobs), scheduler (poll and process)

**Data Access Layer:**
- Purpose: MongoDB document persistence with Mongoose ODM
- Location: `server/models/`
- Contains: Mongoose schemas for Client, Agent, CreditorDatabase, WebhookJob, DocumentProcessingJob
- Depends on: MongoDB, Mongoose
- Used by: Services, controllers, workers

**Middleware Layer:**
- Purpose: Cross-cutting concerns for request processing
- Location: `server/middleware/`
- Contains: Authentication (JWT), authorization (role-based), file upload (Multer), security (rate limiting, headers), validation
- Depends on: JWT library, Multer, Express validators
- Used by: Route handlers globally or per-route

**Utility Layer:**
- Purpose: Shared helper functions and integrations
- Location: `server/utils/`, `src/utils/`
- Contains: Address formatting, creditor deduplication, FastAPI client, sanitization, webhook validation
- Depends on: External APIs, core libraries
- Used by: Services, controllers, components

## Data Flow

**Client Document Upload Flow:**

1. Client uploads document via `CreditorUploadComponent.tsx` → POST `/api/client/:clientId/upload`
2. `upload` middleware saves file to disk/GCS → returns file metadata
3. Controller enqueues document processing job via `documentQueueService.enqueue()`
4. Worker polls queue → sends document to FastAPI/Gemini for AI extraction
5. FastAPI webhook delivers results → `portalWebhookController` processes
6. Results saved to `Client.documents` array → frontend refetches via RTK Query
7. Client sees extracted creditor data in `CreditorConfirmation.tsx`

**Creditor Email Contact Flow:**

1. Admin triggers first round → `firstRoundDocumentGenerator` creates Word documents
2. Document generation completes → `creditorContactService.sendCreditorEmails()`
3. For each creditor: creates Zendesk main ticket + side conversation with email
4. Zendesk webhooks notify on creditor responses → `zendeskWebhookController`
5. Response parsed by `settlementResponseProcessor` → updates creditor amount
6. Updated data synced to Client model → visible in admin dashboard

**Admin Impersonation Flow:**

1. Admin requests impersonation → POST `/api/admin/impersonation/generate`
2. Server generates one-time token → stores in `ImpersonationToken` model
3. Admin forwards magic link to client → `/auth/impersonate?token=...`
4. Client authenticates via token → receives JWT with `impersonated: true` flag
5. Client accesses portal → admin can "End Impersonation" to return to admin view

**State Management:**
- Frontend: Redux Toolkit for auth state, RTK Query for API caching with automatic refetch
- Backend: Stateless request handling, MongoDB for persistent state
- Queue: MongoDB-backed job queue with optimistic locking (findOneAndUpdate)

## Key Abstractions

**Client:**
- Purpose: Represents an insolvency case with all associated data
- Examples: `server/models/Client.js`
- Pattern: Mongoose schema with nested subdocuments for documents, creditors, financial data, status tracking

**Document Processing Job:**
- Purpose: Represents queued document for AI analysis with retry logic
- Examples: `server/models/DocumentProcessingJob.js`, `server/services/documentQueueService.js`
- Pattern: Job queue pattern with status states (pending → processing → completed/failed)

**Service Classes:**
- Purpose: Encapsulate complex business logic and external integrations
- Examples: `server/services/documentProcessor.js`, `server/services/creditorContactService.js`, `server/services/zendeskService.js`
- Pattern: Class-based services instantiated in `server.js`, injected into controllers/routes

**RTK Query API Slices:**
- Purpose: Type-safe API endpoints with automatic caching and refetching
- Examples: `src/store/features/adminApi.ts`, `src/store/features/clientApi.ts`
- Pattern: RTK Query endpoint definitions extending `baseApi`

**Middleware Pipeline:**
- Purpose: Request processing chain for auth, validation, security
- Examples: `server/middleware/auth.js` (authenticateClient, authenticateAdmin), `server/middleware/security.js`
- Pattern: Express middleware functions composed in route definitions

## Entry Points

**Frontend Entry:**
- Location: `src/index.tsx`
- Triggers: User navigates to application URL
- Responsibilities: Mounts React app with Redux Provider, renders `App.tsx` router

**Backend Entry:**
- Location: `server/server.js`
- Triggers: `npm start` or Render deployment
- Responsibilities: Initialize Express app, connect MongoDB, mount routes, start HTTP server, initialize Socket.IO, start queue workers, start scheduler

**Client Portal:**
- Location: `src/pages/PersonalPortal.tsx`
- Triggers: User logs in with Aktenzeichen + verification code
- Responsibilities: Document upload, creditor confirmation, financial data entry, address management

**Admin Portal:**
- Location: `src/admin/AdminApp.tsx`
- Triggers: Admin logs in at `/admin/login`
- Responsibilities: User management, analytics dashboard, document processing control, creditor database management

**Agent Portal:**
- Location: `src/agent/AgentApp.tsx`
- Triggers: Agent logs in at `/agent/login`
- Responsibilities: Manual document review for low-confidence AI extractions

## Error Handling

**Strategy:** Layered error handling with validation → try/catch → error response formatting

**Patterns:**
- Frontend: Axios interceptors catch 401 (redirect to login), toast notifications for errors via Sonner
- Backend Controllers: Try/catch blocks wrap service calls, return standardized error responses `{ success: false, error: "message" }`
- Backend Services: Throw errors with descriptive messages, logged to console
- Queue Workers: Failed jobs transition to `retrying` or `failed` status, exponential backoff retry logic
- Webhook Idempotency: Duplicate webhook detection via job_id to prevent double-processing

## Cross-Cutting Concerns

**Logging:** Console.log throughout with emoji prefixes for visibility (📋, ⚙️, ✅, ❌), custom logger in `server/utils/logger.js`

**Validation:** Express-validator rules in `server/middleware/security.js`, Zod schemas on frontend forms, Mongoose schema validation

**Authentication:** JWT tokens in localStorage, role-based middleware (`authenticateClient`, `authenticateAdmin`, `authenticateAgent`), impersonation tokens for admin-as-client access

---

*Architecture analysis: 2026-01-30*
