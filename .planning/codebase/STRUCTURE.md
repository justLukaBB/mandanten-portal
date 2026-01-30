# Codebase Structure

**Analysis Date:** 2026-01-30

## Directory Layout

```
mandanten-portal/
├── .planning/                # GSD planning documents
│   └── codebase/            # Codebase analysis docs
├── server/                   # Node.js backend
│   ├── config/              # Environment config
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Auth, security, upload
│   ├── models/              # Mongoose schemas
│   ├── routes/              # API endpoints
│   ├── services/            # Business logic
│   ├── utils/               # Shared helpers
│   ├── workers/             # Queue workers
│   ├── templates/           # Document templates (Word/PDF)
│   ├── documents/           # Generated documents
│   ├── uploads/             # User-uploaded files
│   ├── scripts/             # Maintenance scripts
│   ├── migrations/          # Database migrations
│   ├── server.js            # Backend entry point
│   └── scheduler.js         # Scheduled task coordinator
├── src/                      # React frontend
│   ├── admin/               # Admin portal
│   │   ├── components/     # Admin-specific components
│   │   ├── pages/          # Admin pages
│   │   └── AdminApp.tsx    # Admin router
│   ├── agent/               # Agent portal
│   │   ├── components/     # Agent-specific components
│   │   ├── pages/          # Agent pages
│   │   └── AgentApp.tsx    # Agent router
│   ├── components/          # Shared/client components
│   ├── pages/               # Client portal pages
│   ├── store/               # Redux state management
│   │   ├── features/       # RTK Query slices
│   │   └── api/            # API endpoint definitions
│   ├── types/               # TypeScript types
│   ├── utils/               # Frontend utilities
│   ├── lib/                 # Third-party lib configs
│   ├── config/              # API configuration
│   ├── styles/              # Global styles
│   ├── App.tsx              # Main router
│   └── index.tsx            # React entry point
├── public/                   # Static assets
├── docs/                     # Documentation
├── scripts/                  # Development scripts
├── test-data/               # Test files
├── uploads/                  # Root-level uploads
├── node_modules/            # Frontend dependencies
├── package.json             # Frontend dependencies
├── tsconfig.json            # TypeScript config
├── tailwind.config.js       # Tailwind CSS config
└── README.md                # Project overview
```

## Directory Purposes

**server/**
- Purpose: Complete Node.js/Express backend application
- Contains: All backend code, API routes, business logic, database models
- Key files: `server.js` (entry point), `scheduler.js` (cron jobs)

**server/routes/**
- Purpose: Express route definitions grouped by feature and role
- Contains: Route handlers for admin, agent, client, webhooks
- Key files: `admin-*.js` (admin endpoints), `client-portal.js`, `webhooks.js`, `zendesk-webhooks-factory.js`

**server/controllers/**
- Purpose: Request handling and orchestration logic
- Contains: Controllers that coordinate service calls and format responses
- Key files: `adminDashboardController.js`, `clientPortalController.js`, `zendeskWebhookController.js`, `webhookController.js`

**server/services/**
- Purpose: Core business logic and external API integrations
- Contains: Document processing, AI integration, Zendesk management, email sending, queue services
- Key files: `documentProcessor.js`, `claudeAI.js`, `zendeskService.js`, `emailService.js`, `documentQueueService.js`, `webhookQueueService.js`

**server/models/**
- Purpose: MongoDB/Mongoose data models
- Contains: Schema definitions for all database collections
- Key files: `Client.js` (main data model), `Agent.js`, `CreditorDatabase.js`, `WebhookJob.js`, `DocumentProcessingJob.js`

**server/middleware/**
- Purpose: Express middleware for cross-cutting concerns
- Contains: Authentication, authorization, security, file upload, validation
- Key files: `auth.js`, `security.js`, `upload.js`

**server/utils/**
- Purpose: Shared utility functions
- Contains: Formatting, validation, deduplication, external API clients
- Key files: `fastApiClient.js`, `creditorDeduplication.js`, `addressFormatter.js`, `webhookValidation.js`

**server/workers/**
- Purpose: Background job processors
- Contains: Queue worker implementations
- Key files: `webhookWorker.js`

**server/templates/**
- Purpose: Document templates for generation
- Contains: Word/PDF templates for creditor letters, payment plans, insolvency forms
- Key files: Various `.docx` and `.pdf` template files

**src/**
- Purpose: React frontend application root
- Contains: All frontend code organized by portal type
- Key files: `index.tsx` (entry), `App.tsx` (main router)

**src/admin/**
- Purpose: Admin portal application
- Contains: Admin-specific components and pages
- Key files: `AdminApp.tsx`, `pages/Dashboard.tsx`, `components/ClientManagement.tsx`

**src/agent/**
- Purpose: Agent portal for manual review
- Contains: Agent-specific components and pages
- Key files: `AgentApp.tsx`, `pages/AgentDashboard.tsx`, `pages/AgentLogin.tsx`

**src/pages/**
- Purpose: Client portal pages
- Contains: Main client-facing pages
- Key files: `PersonalPortal.tsx`, `PortalLogin.tsx`, `ConfirmCreditors.tsx`, `ImpersonationAuth.tsx`

**src/components/**
- Purpose: Shared React components (primarily used by client portal)
- Contains: Reusable UI components, forms, data displays
- Key files: `CreditorUploadComponent.tsx`, `CreditorConfirmation.tsx`, `FinancialDataForm.tsx`, `ClientAddressForm.tsx`, `AddCreditorForm.tsx`

**src/store/**
- Purpose: Redux state management with RTK Query
- Contains: Redux slices and API endpoint definitions
- Key files: `index.ts` (store config), `features/authSlice.ts`, `features/adminApi.ts`, `api/baseApi.ts`

**src/types/**
- Purpose: TypeScript type definitions
- Contains: Shared types and interfaces
- Key files: Type definition files for Client, Creditor, Document entities

**src/utils/**
- Purpose: Frontend utility functions
- Contains: Helper functions for formatting, validation, upload queue management
- Key files: `uploadQueue.ts`

## Key File Locations

**Entry Points:**
- `src/index.tsx`: React app entry, mounts Redux Provider
- `server/server.js`: Express server entry, initializes all services and routes
- `src/App.tsx`: React Router configuration with role-based routing
- `src/admin/AdminApp.tsx`: Admin portal router
- `src/agent/AgentApp.tsx`: Agent portal router

**Configuration:**
- `server/config/index.js`: Environment variables and configuration
- `src/config/api.ts`: API base URL and axios configuration
- `tsconfig.json`: TypeScript compiler options
- `tailwind.config.js`: Tailwind CSS configuration
- `.eslintrc.js`: ESLint rules
- `package.json`: Frontend dependencies and scripts
- `server/package.json`: Backend dependencies and scripts

**Core Logic:**
- `server/services/documentProcessor.js`: Main document processing orchestration
- `server/services/documentQueueService.js`: Document processing queue with concurrency control
- `server/services/webhookQueueService.js`: Webhook processing queue with idempotency
- `server/services/claudeAI.js`: Anthropic Claude API integration
- `server/services/zendeskService.js`: Zendesk API wrapper
- `server/services/creditorContactService.js`: First-round creditor email workflow
- `server/services/firstRoundDocumentGenerator.js`: Document generation for creditor letters
- `server/utils/fastApiClient.js`: FastAPI service client for AI processing
- `server/utils/creditorDeduplication.js`: Creditor matching and deduplication logic

**Testing:**
- `server/routes/test-*.js`: Test endpoints for development
- `server/controllers/testDataController.js`: Test data generation
- `scripts/tests/`: Frontend test scripts
- `test-data/`: Test documents and files

## Naming Conventions

**Files:**
- Backend: `kebab-case.js` for routes/services/utils (e.g., `admin-dashboard.js`, `creditor-contact-service.js`)
- Backend: `PascalCase.js` for models/classes (e.g., `Client.js`, `DocumentProcessor.js`)
- Frontend: `PascalCase.tsx` for components (e.g., `PersonalPortal.tsx`, `CreditorUploadComponent.tsx`)
- Frontend: `camelCase.ts` for utilities/config (e.g., `uploadQueue.ts`, `api.ts`)

**Directories:**
- `kebab-case` for multi-word directories (e.g., `test-data`, `pdf-form-test`)
- Single-word lowercase for standard directories (e.g., `server`, `services`, `components`)

**API Routes:**
- Pattern: `/api/{role}/{resource}/{action}`
- Examples: `/api/admin/dashboard/clients`, `/api/client/:clientId/upload`, `/api/webhooks/ai-processing`

**Components:**
- Pattern: `{Feature}{Type}.tsx`
- Examples: `CreditorUploadComponent.tsx`, `FinancialDataForm.tsx`, `ClientAddressForm.tsx`

## Where to Add New Code

**New Feature:**
- Primary code: Determine role (client/agent/admin)
  - Client: `src/pages/*.tsx` or `src/components/*.tsx`
  - Admin: `src/admin/pages/*.tsx` or `src/admin/components/*.tsx`
  - Agent: `src/agent/pages/*.tsx` or `src/agent/components/*.tsx`
- Backend route: `server/routes/{role}-{feature}.js`
- Backend controller: `server/controllers/{role}{Feature}Controller.js`
- Backend service: `server/services/{feature}Service.js`
- Tests: `server/routes/test-{feature}.js` for integration testing

**New Component/Module:**
- Implementation:
  - Shared/reusable: `src/components/{ComponentName}.tsx`
  - Role-specific: `src/{role}/components/{ComponentName}.tsx`
  - Backend service: `server/services/{serviceName}.js`

**Utilities:**
- Shared helpers:
  - Frontend: `src/utils/{utilityName}.ts`
  - Backend: `server/utils/{utilityName}.js`

**New API Endpoint:**
- Route definition: `server/routes/{role}-{feature}.js` or create new route file
- Controller logic: `server/controllers/{role}{Feature}Controller.js`
- Update `server/server.js` to mount new routes if creating new route file

**New Database Model:**
- Schema definition: `server/models/{ModelName}.js` (PascalCase)
- Import in controllers/services that use it

**New Background Job:**
- Worker implementation: `server/workers/{jobType}Worker.js`
- Queue service: Use existing `webhookQueueService` or `documentQueueService`
- Scheduler integration: Add to `server/scheduler.js` if periodic

**New External Integration:**
- Service wrapper: `server/services/{serviceName}.js` (e.g., `zendeskService.js`, `emailService.js`)
- Configuration: Add credentials to `server/config/index.js` and `.env`

## Special Directories

**server/uploads/**
- Purpose: Temporary storage for uploaded files before processing
- Generated: Yes (by multer middleware)
- Committed: No (in .gitignore)

**server/generated_documents/**
- Purpose: Stores generated Word/PDF documents (creditor letters, payment plans)
- Generated: Yes (by document generation services)
- Committed: No (generated at runtime)

**server/documents/**
- Purpose: Template documents and static document files
- Generated: No
- Committed: Yes

**node_modules/**
- Purpose: NPM dependencies for frontend and backend
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)

**uploads/** (root level)
- Purpose: Alternative upload directory
- Generated: Yes (by upload services)
- Committed: No (in .gitignore)

**.planning/**
- Purpose: GSD (Get Shit Done) codebase mapping and planning documents
- Generated: Yes (by GSD commands)
- Committed: Yes (documentation)

**public/**
- Purpose: Static assets served by React app
- Generated: No
- Committed: Yes

**docs/**
- Purpose: Project documentation including flowcharts
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-01-30*
