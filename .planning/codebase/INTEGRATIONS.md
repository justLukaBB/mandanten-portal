# External Integrations

**Analysis Date:** 2026-01-30

## APIs & External Services

**AI Processing:**
- Anthropic Claude AI - Document classification and creditor data extraction
  - SDK/Client: `@anthropic-ai/sdk` 0.56.0
  - Implementation: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/claudeAI.js`
  - Auth: `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` env var
  - Purpose: Processes creditor documents to extract structured data (creditor name, amounts, reference numbers)

**Document AI:**
- Google Cloud Document AI - OCR and document processing
  - SDK/Client: `@google-cloud/documentai` 8.0.0
  - Implementation:
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/googleDocumentAI.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/googleDocumentAI_REST.js`
  - Auth: `GOOGLE_APPLICATION_CREDENTIALS` (service account key path)
  - Config:
    - `GOOGLE_DOCUMENT_AI_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT_ID`
    - `GOOGLE_DOCUMENT_AI_LOCATION` (default: 'eu')
    - `GOOGLE_DOCUMENT_AI_PROCESSOR_ID`
  - Purpose: Extract text and data from uploaded PDF/image documents

**Ticketing System:**
- Zendesk API v2 - Ticket creation and management
  - Client: axios with basic auth (`email/token` + API token)
  - Implementation: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/zendeskService.js`
  - Manager: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/zendeskManager.js`
  - Routes: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/routes/zendesk-webhooks-factory.js`
  - Auth:
    - `ZENDESK_DOMAIN` or `ZENDESK_SUBDOMAIN` (e.g., 'company.zendesk.com')
    - `ZENDESK_API_EMAIL` or `ZENDESK_EMAIL`
    - `ZENDESK_API_TOKEN` or `ZENDESK_TOKEN`
  - Custom Field IDs (env vars):
    - `ZENDESK_FIELD_CREDITOR_NAME`
    - `ZENDESK_FIELD_REFERENCE_NUMBER`
    - `ZENDESK_FIELD_ORIGINAL_CLAIM_AMOUNT`
    - `ZENDESK_FIELD_CURRENT_DEBT_AMOUNT`
    - `ZENDESK_FIELD_AMOUNT_SOURCE`
    - `ZENDESK_FIELD_CLIENT_REFERENCE`
    - `ZENDESK_FIELD_AKTENZEICHEN`
  - Purpose: Automatic ticket creation when clients upload creditor documents or complete processing

**External Python Service:**
- FastAPI Document Processing Server - Advanced document analysis
  - Client: Native fetch API (Node.js 18+)
  - Implementation: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/fastApiClient.js`
  - URL: `FASTAPI_URL` env var (default: http://localhost:8000)
  - Auth: `FASTAPI_API_KEY` env var
  - Features: Circuit breaker, exponential backoff, rate limiting, adaptive throttling
  - Config:
    - `FASTAPI_TIMEOUT` (default: 1200000ms / 20min)
    - `FASTAPI_RETRY_ATTEMPTS` (default: 3)
    - `FASTAPI_CIRCUIT_BREAKER_THRESHOLD` (default: 5 failures)
    - `FASTAPI_MAX_CONCURRENT_REQUESTS` (default: 2)
    - `FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE` (default: 12)
  - Purpose: Offload heavy document processing tasks to Python service

## Data Storage

**Databases:**
- MongoDB Atlas - Primary database
  - Connection: `MONGODB_URI` env var (mongodb+srv:// connection string)
  - Client: mongoose 8.0.0 ODM
  - Service: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/database.js`
  - Models:
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/Client.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/Agent.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/CreditorDatabase.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/DocumentProcessingJob.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/ImpersonationToken.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/UserDeletion.js`
    - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/WebhookJob.js`

**File Storage:**
- Google Cloud Storage - Document and file storage
  - SDK/Client: `@google-cloud/storage` 7.0.0
  - Service: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/gcs-service.js`
  - Auth: Same Google Cloud credentials as Document AI
  - Config: `GOOGLE_CLOUD_PROJECT_ID`
  - Purpose: Store uploaded documents, generated PDFs, and DOCX files with signed URL access

**Caching:**
- In-memory caching only
  - FastAPI health check cache (30s TTL by default)
  - No external cache service (Redis, Memcached) detected

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/middleware/auth.js`
  - Secret: `JWT_SECRET` env var
  - Library: jsonwebtoken 9.0.2
  - Password hashing: bcryptjs 3.0.2
  - User types: Client, Admin, Agent
  - Features:
    - Client token login (magic link flow)
    - Admin authentication
    - Agent authentication with session timeout (`AGENT_SESSION_TIMEOUT_HOURS`, default: 4)
    - Admin impersonation tokens (`/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/ImpersonationToken.js`)
    - Verification codes via email (5-minute expiry)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar integrations)

**Logs:**
- Console-based logging
  - Frontend: Custom logger at `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/src/utils/logger.ts`
    - Controlled by `REACT_APP_LOG_LEVEL` env var
  - Backend: Direct console logging with emoji prefixes
    - ✅ Success operations
    - ❌ Errors
    - 🔗 Webhook triggers
    - 🎫 Zendesk operations
    - ⚠️ Warnings

## CI/CD & Deployment

**Hosting:**
- Render.com (inferred from CORS origins)
  - Frontend: mandanten-portal-frontend.onrender.com
  - Backend: mandanten-portal.onrender.com

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, CircleCI configs found)

**Deployment:**
- Docker containerization available
  - Dockerfile: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/Dockerfile`
  - Base: node:18-slim with LibreOffice, Java, fonts for document processing

## Environment Configuration

**Required env vars (Server):**
- `MONGODB_URI` - MongoDB connection (required)
- `JWT_SECRET` - Token signing (required)

**Optional but recommended (Server):**
- `ANTHROPIC_API_KEY` - Claude AI (production warning if missing)
- `GOOGLE_CLOUD_PROJECT_ID` - Document AI (production warning if missing)
- `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` - Processor configuration
- `GOOGLE_APPLICATION_CREDENTIALS` - Service account key path
- `ZENDESK_DOMAIN` - Zendesk URL
- `ZENDESK_API_EMAIL` - Zendesk auth email
- `ZENDESK_API_TOKEN` - Zendesk API token
- `RESEND_API_KEY` - Email service (logs to console if missing)
- `FASTAPI_URL` - Python service URL
- `FASTAPI_API_KEY` - Python service auth
- `PORTAL_BASE_URL` or `FRONTEND_URL` - Frontend URL for webhook callbacks
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `AGENT_CREATION_KEY` - Agent account creation key (default: 'change-me-in-production')
- `MANUAL_REVIEW_CONFIDENCE_THRESHOLD` - AI confidence threshold (default: 0.8)

**Frontend env vars:**
- `REACT_APP_API_URL` - Backend API URL (auto-detected if not set)
- `REACT_APP_LOG_LEVEL` - Logging verbosity

**Secrets location:**
- Environment variables (no secrets manager integration detected)
- `.env.example` template at root: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/.env.example`

## Webhooks & Callbacks

**Incoming:**
- AI Processing Results Webhook
  - Endpoint: `POST /webhooks/ai-processing`
  - Source: FastAPI service
  - Route: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/routes/webhooks.js`
  - Controller: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/controllers/webhookController.js`
  - Validation: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/webhookValidation.js`
  - Worker: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/workers/webhookWorker.js`
  - Queue: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/webhookQueueService.js`
  - Purpose: Receive creditor deduplication results from external AI service

- Zendesk Processing Complete Webhook
  - Endpoint: Zendesk-specific routes (factory pattern)
  - Routes: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/routes/zendesk-webhooks-factory.js`
  - Purpose: Handle document processing completion notifications

- Health Check Endpoint
  - Endpoint: `GET /webhooks/health`
  - Purpose: Service health monitoring

**Outgoing:**
- Processing Complete Webhook Trigger
  - Utility: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/webhookUtils.js`
  - Function: `triggerProcessingCompleteWebhook(clientId, documentId)`
  - Target: `${PORTAL_BASE_URL}/api/zendesk-webhooks/processing-complete`
  - Purpose: Internal webhook to trigger Zendesk ticket updates

**Real-time Communication:**
- Socket.IO bidirectional events
  - Server: Socket.IO server in `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/server.js` (line 203+)
  - Client: socket.io-client 4.8.3
  - Events:
    - `connection` - Client connects
    - `socket_ready` - Server confirms connection with admin/client ID
  - Purpose: Real-time updates for document processing status, admin monitoring

---

*Integration audit: 2026-01-30*
