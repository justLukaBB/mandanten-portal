# 📚 Mandanten-Portal: Comprehensive Developer Guide

**Welcome to the Mandanten-Portal!** This guide will help you understand, develop, and maintain the German insolvency case management system.

## 📖 Table of Contents

1. [System Overview](#system-overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Tech Stack](#tech-stack)
6. [Core Workflows](#core-workflows)
7. [Key Features](#key-features)
8. [API Documentation](#api-documentation)
9. [Database Schema](#database-schema)
10. [Integration Guides](#integration-guides)
11. [Development Guidelines](#development-guidelines)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Troubleshooting](#troubleshooting)

---

## System Overview

**Mandanten-Portal** is a full-stack web application designed to streamline German insolvency (Insolvenz) case management through automation, AI-powered document processing, and seamless Zendesk integration.

### What It Does

- 🤖 **AI Document Processing**: Automatically extracts creditor information from uploaded documents using Claude/OpenAI
- 📊 **Workflow Automation**: Manages client lifecycle from case creation to completion
- 💰 **Settlement Calculation**: Computes German garnishment amounts (Pfändungstabelle) and generates settlement plans
- 🎫 **Zendesk Integration**: Creates tickets, manages creditor communications, and tracks responses
- 📄 **Document Generation**: Creates official legal documents (Insolvenzantrag, Schuldenbereinigungsplan, etc.)
- 👥 **Multi-Portal System**: Separate interfaces for clients, agents, and administrators

### Use Case

German law firms use this system to:
1. Collect client documents
2. Identify creditors automatically
3. Contact creditors for debt verification
4. Calculate settlement offers
5. Generate legal documents
6. Track case progress through completion

---

## Quick Start

### Prerequisites

- **Node.js** v18+
- **MongoDB** v4.4+ (local or Atlas)
- **npm** or **yarn**
- **Zendesk Account** (optional but recommended)
- **AI API Keys**: OpenAI or Anthropic Claude (for document processing)
- **LibreOffice** (for DOCX to PDF conversion) - optional but recommended

### Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd mandanten-portal

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd server
npm install

# 4. Set up environment variables
cp .env.example .env
# Edit .env with your configuration (see Environment Setup below)

# 5. Start MongoDB (if running locally)
# macOS with Homebrew:
brew services start mongodb-community

# 6. Start the backend server
npm start
# Backend runs on http://localhost:3001

# 7. Start the frontend (in a new terminal)
cd ..
npm start
# Frontend runs on http://localhost:3000
```

### Environment Setup

Create `/server/.env` with these values:

```bash
# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/mandanten-portal
# Or MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mandanten-portal

# Admin Credentials
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password

# Zendesk Integration (Optional)
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=api@your-firm.com
ZENDESK_API_TOKEN=your-api-token
ZENDESK_FIELD_AKTENZEICHEN=custom_field_id

# AI APIs (choose one or both)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# Google Cloud (Optional - for enhanced OCR)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### First Run Test

```bash
# Test backend connection
curl http://localhost:3001/api/health

# Test frontend
open http://localhost:3000

# Test admin login
open http://localhost:3000/admin
```

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client Layer                      │
│  (Web Browser / Mobile - React 18 + TypeScript)    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                Frontend - React App                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │Client Portal │ │Admin Portal  │ │Agent Portal  │ │
│ │- Doc Upload  │ │- Analytics   │ │- Review Docs │ │
│ │- Tracking    │ │- Management  │ │- Corrections │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│          Backend - Node.js/Express API              │
│ ┌──────────────────────────────────────────────┐   │
│ │  REST API Endpoints + Authentication         │   │
│ └──────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────┐   │
│ │  Business Logic Services:                    │   │
│ │  • Document Processor                        │   │
│ │  • AI Integration (Claude/OpenAI)            │   │
│ │  • Zendesk Manager                           │   │
│ │  • Document Generator                        │   │
│ │  • German Garnishment Calculator             │   │
│ │  • Creditor Contact Service                  │   │
│ └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                  Data Layer                         │
│ ┌──────────────┐        ┌──────────────┐           │
│ │  MongoDB     │        │ File System  │           │
│ │  - Clients   │        │ - Uploads    │           │
│ │  - Creditors │        │ - Generated  │           │
│ │  - Documents │        │   Documents  │           │
│ └──────────────┘        └──────────────┘           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│              External Integrations                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Zendesk  │  │  AI APIs │  │  Google Cloud    │  │
│  │  API     │  │(Claude/  │  │  Document AI     │  │
│  │          │  │ OpenAI)  │  │  (OCR)           │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Request Flow Example: Document Upload

```
1. Client uploads PDF → Frontend (React)
2. Frontend → POST /api/clients/:id/documents
3. API validates file → Multer middleware
4. File saved → /server/uploads/
5. Queue AI processing → documentProcessor.js
6. OCR extraction → Google Document AI (optional)
7. AI analysis → Claude API
8. Extract creditors → Save to MongoDB
9. Update UI → WebSocket or polling
10. After 24h → Create Zendesk ticket (or immediate via admin override)
```

---

## Project Structure

```
mandanten-portal/
│
├── src/                          # Frontend React Application
│   ├── admin/                    # Admin Portal
│   │   ├── components/          # Admin-specific components
│   │   │   ├── AdminCreditorContactManager.tsx
│   │   │   ├── AdminDocumentViewer.tsx
│   │   │   ├── InsolvenzantragDownloadButton.tsx
│   │   │   ├── PendingDocumentsMonitor.tsx
│   │   │   ├── SchuldenbereinigungsplanView.tsx
│   │   │   └── UserDetailView.tsx
│   │   ├── pages/               # Admin pages
│   │   │   ├── AnalyticsDashboard.tsx
│   │   │   ├── AdminLogin.tsx
│   │   │   ├── CreateUser.tsx
│   │   │   ├── UserList.tsx
│   │   │   └── Settings.tsx
│   │   └── AdminApp.tsx         # Admin root component
│   │
│   ├── agent/                    # Agent Portal
│   │   ├── components/          # Agent-specific components
│   │   │   ├── DocumentViewer.tsx
│   │   │   ├── CorrectionForm.tsx
│   │   │   └── HighConfidenceSummary.tsx
│   │   ├── pages/               # Agent pages
│   │   │   ├── AgentDashboard.tsx
│   │   │   ├── AgentLogin.tsx
│   │   │   └── ReviewDashboard.tsx
│   │   └── AgentApp.tsx         # Agent root component
│   │
│   ├── pages/                    # Client Portal Pages
│   │   ├── PersonalPortal.tsx   # Main client dashboard
│   │   ├── PortalLogin.tsx      # Client login
│   │   ├── ConfirmCreditors.tsx # Creditor confirmation
│   │   └── NotFound.tsx         # 404 page
│   │
│   ├── components/               # Shared Components
│   │   ├── ClientDataComponent.tsx
│   │   ├── ClientProgressTracker.tsx
│   │   ├── CreditorConfirmation.tsx
│   │   ├── CreditorDataTable.tsx
│   │   ├── CreditorUploadComponent.tsx
│   │   ├── DocumentExtractionViewer.tsx
│   │   ├── FinancialDataForm.tsx
│   │   └── ...
│   │
│   ├── App.tsx                   # Main app component & routing
│   └── index.tsx                 # Entry point
│
├── server/                       # Backend Node.js Application
│   ├── models/                   # MongoDB Schemas
│   │   ├── Client.js            # Main client/case schema
│   │   └── Agent.js             # Agent authentication schema
│   │
│   ├── routes/                   # API Route Handlers
│   │   ├── admin-delayed-processing.js
│   │   ├── agent-auth.js
│   │   ├── agent-review.js
│   │   ├── document-generation.js
│   │   ├── insolvenzantrag.js
│   │   ├── pending-documents-api.js
│   │   ├── portal-webhooks.js
│   │   ├── zendesk-webhooks.js
│   │   └── health.js
│   │
│   ├── services/                 # Business Logic Services
│   │   ├── claudeAI.js          # Claude API integration
│   │   ├── creditorContactService.js
│   │   ├── creditorDocumentPackageGenerator.js
│   │   ├── creditorResponseProcessor.js
│   │   ├── debtAmountExtractor.js
│   │   ├── delayedProcessingService.js
│   │   ├── documentConverter.js
│   │   ├── documentGenerator.js
│   │   ├── documentProcessor.js
│   │   ├── documentReminderService.js
│   │   ├── germanGarnishmentCalculator.js
│   │   ├── googleDocumentAI.js
│   │   ├── loginReminderService.js
│   │   ├── nullplanTemplateGenerator.js
│   │   ├── settlementResponseMonitor.js
│   │   ├── sideConversationMonitor.js
│   │   ├── wordTemplateProcessor.js
│   │   └── zendeskManager.js
│   │
│   ├── middleware/               # Express Middleware
│   │   ├── auth.js              # Authentication middleware
│   │   ├── security.js          # Security headers, rate limiting
│   │   └── upload.js            # File upload handling (Multer)
│   │
│   ├── config/                   # Configuration files
│   │   └── index.js
│   │
│   ├── templates/                # Document templates
│   │   ├── Nullplan-Template.docx
│   │   ├── Quotenplan-Template.docx
│   │   └── ...
│   │
│   ├── documents/                # Generated documents
│   ├── uploads/                  # User-uploaded files
│   ├── server.js                # Main server file
│   ├── package.json             # Backend dependencies
│   └── .env                     # Environment variables (NOT in git)
│
├── public/                       # Static Assets
│   ├── index.html
│   └── favicon.ico
│
├── docs/                         # Documentation
│   ├── VISUAL-FLOWCHART.html    # Interactive system flowchart (English)
│   ├── VISUAL-FLOWCHART-DE.html # Interactive flowchart (German)
│   ├── phase-1-zendesk-setup.md
│   └── phase-2-zendesk-setup.md
│
├── package.json                  # Frontend dependencies
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── .env                         # Frontend env (if needed)
├── .gitignore
└── README.md                    # Main readme
```

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.2 | UI framework |
| **TypeScript** | 4.7+ | Type safety |
| **React Router** | 6.8+ | Client-side routing |
| **Tailwind CSS** | 3.4+ | Styling framework |
| **Axios** | 1.6+ | HTTP client |
| **Heroicons** | 2.0+ | Icon library |
| **Lucide React** | Latest | Additional icons |
| **date-fns** | 4.1+ | Date manipulation |
| **pdf-lib** | 1.17+ | PDF generation/manipulation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Express.js** | 4.18+ | Web framework |
| **MongoDB** | 4.4+ | Database |
| **Mongoose** | 8.0+ | MongoDB ODM |
| **Multer** | 1.4+ | File upload handling |
| **JWT** | 9.0+ | Authentication tokens |
| **bcryptjs** | 3.0+ | Password hashing |
| **Helmet** | 8.1+ | Security headers |
| **Express Rate Limit** | 8.0+ | Rate limiting |
| **CORS** | 2.8+ | Cross-origin requests |

### AI & Document Processing

| Technology | Purpose |
|------------|---------|
| **Anthropic Claude SDK** | AI document analysis |
| **OpenAI SDK** | Alternative AI processing |
| **Google Document AI** | OCR and text extraction |
| **pdf-parse** | PDF text extraction |
| **pdf-lib** | PDF generation/manipulation |
| **docxtemplater** | Word document templating |
| **mammoth** | DOCX to HTML conversion |
| **sharp** | Image processing |
| **LibreOffice** | DOCX to PDF conversion (via Docker or local install) |

### External Integrations

- **Zendesk API**: Ticket management, creditor communications
- **Google Cloud**: Document AI for OCR

---

## Core Workflows

### 1. Complete Client Lifecycle

```mermaid
graph TB
    Start([Agent Creates Client]) --> Portal[Generate Portal Access]
    Portal --> SendEmail[Send Login Email]
    SendEmail --> ClientLogin{Client Logs In?}

    ClientLogin -->|After 7 days| Reminder1[Login Reminder]
    ClientLogin -->|Yes| Upload{Uploads Docs?}

    Upload -->|No, 7 days| Reminder2[Document Reminder]
    Upload -->|Yes| AIProcess[AI Processing]

    AIProcess --> Payment{Payment Made?}
    Payment -->|No| WaitPayment[Wait]
    Payment -->|Yes| Delay24h[24h Delay]

    Delay24h --> AdminOverride{Admin Override?}
    AdminOverride -->|Yes| CreateTicket[Create Zendesk Ticket]
    AdminOverride -->|No, wait| CreateTicket

    CreateTicket --> Review[Agent Review]
    Review --> ClientConfirm[Client Confirmation]
    ClientConfirm --> ContactCreditors[Contact Creditors]
    ContactCreditors --> Wait30[30-Day Response Period]
    Wait30 --> FinancialForm[Client Fills Financial Data]
    FinancialForm --> Calculate[Calculate Garnishment]
    Calculate --> AutoSelect{Auto-Select Plan}
    AutoSelect -->|Garnishable > 0| Quotenplan
    AutoSelect -->|Garnishable = 0| Nullplan
    Quotenplan --> GenerateDocs[Generate Documents]
    Nullplan --> GenerateDocs
    GenerateDocs --> SendCreditors[Send to Creditors]
    SendCreditors --> Complete([Complete])
```

### 2. Document Processing Pipeline

```mermaid
graph LR
    A[Upload] --> B[Validate]
    B --> C[Save to /uploads]
    C --> D[Queue Processing]
    D --> E[OCR - Google Doc AI]
    E --> F{Text Detected?}
    F -->|No| G[Mark 'No Text']
    F -->|Yes| H[AI Analysis]
    H --> I{Creditor Doc?}
    I -->|No| J[Mark Non-Creditor]
    I -->|Yes| K[Extract Data]
    K --> L{Confidence ≥ 80%?}
    L -->|Yes| M[Auto-Approve]
    L -->|No| N[Flag for Review]
    M --> O[(Save to DB)]
    N --> O
    J --> O
    G --> O
```

### 3. Financial Data & Settlement Plan Workflow

```
1. Creditor contact 30-day period expires
2. System processes responses:
   - Responded creditors: Use their stated amounts
   - No response: Use original document amounts
   - Unknown amounts: Default to €100
3. Client portal shows Financial Data Form
4. Client fills:
   - Monthly net income
   - Number of children
   - Marital status
5. System calculates garnishable income (Pfändungstabelle)
6. Auto-select plan:
   - If garnishable > €0 → Quotenplan
   - If garnishable = €0 → Nullplan
7. Generate settlement documents
8. Send second email round to creditors for plan approval
```

---

## Key Features

### 🤖 AI-Powered Document Processing

**Location**: [server/services/documentProcessor.js](server/services/documentProcessor.js)

- **OCR**: Google Document AI extracts text from scanned PDFs
- **AI Analysis**: Claude/OpenAI classifies documents and extracts creditor data
- **Confidence Scoring**: Each extraction has a confidence level (0-100%)
- **80% Threshold**: ≥80% = auto-approved, <80% = manual review

**Example**:
```javascript
// Extract creditor from document
const result = await processDocument(clientId, documentId);
// result.creditors = [{ name: "ABC Bank", amount: 5000, confidence: 92 }]
```

### 💰 German Garnishment Calculator

**Location**: [server/services/germanGarnishmentCalculator.js](server/services/germanGarnishmentCalculator.js)

Uses official **Pfändungstabelle 2025-2026** with 334 income brackets.

**Input**:
- Net monthly income
- Number of dependent children
- Marital status

**Output**:
- Garnishable amount (pfändbares Einkommen)
- Protected income (Schonbetrag)

**Example**:
```javascript
const garnishment = calculateGarnishment({
  netIncome: 2500,
  children: 2,
  maritalStatus: 'married'
});
// garnishment.garnishableAmount = 169.42
```

### 📄 Automatic Document Generation

**Locations**:
- [server/services/documentGenerator.js](server/services/documentGenerator.js)
- [server/services/nullplanTemplateGenerator.js](server/services/nullplanTemplateGenerator.js)
- [server/routes/insolvenzantrag.js](server/routes/insolvenzantrag.js)

**Generated Documents**:
1. **Schuldenbereinigungsplan** (Settlement Plan) - Word/PDF
2. **Forderungsübersicht** (Creditor Overview) - Word/PDF
3. **Ratenplan** (Payment Schedule) - Word/PDF
4. **Insolvenzantrag** (Insolvency Application) - PDF with form fields filled
5. **Complete Package** - Merged PDF of all documents

**Workflow**:
```javascript
// Check prerequisites
GET /api/insolvenzantrag/check-prerequisites/:clientId

// Generate complete package
GET /api/insolvenzantrag/generate/:clientId
```

### 🎫 Zendesk Integration

**Location**: [server/services/zendeskManager.js](server/services/zendeskManager.js)

**Features**:
- Create tickets for creditor contacts
- Side conversations for email communication
- Automatic response processing
- Tag management
- Custom fields for tracking

**Example**:
```javascript
// Start creditor contact
POST /api/clients/:clientId/start-creditor-contact

// Creates individual Zendesk tickets for each creditor
// Sends professional emails via side conversations
// Tracks responses and updates debt amounts
```

### ⏱️ 24-Hour Processing Delay

**Location**: [server/services/delayedProcessingService.js](server/services/delayedProcessingService.js)

- After document upload, system waits 24 hours before creating Zendesk ticket
- If client uploads more documents, delay resets
- Admin can override with "Immediate Review" button
- Scheduled task checks every 30 minutes for ready webhooks

### 📧 Automated Reminder System

**Locations**:
- [server/services/documentReminderService.js](server/services/documentReminderService.js)
- [server/services/loginReminderService.js](server/services/loginReminderService.js)

**Two Types**:

1. **Login Reminders** (7-day cycle)
   - Triggered if client doesn't log in after initial email

2. **Document Upload Reminders** (2-day cycle)
   - After payment confirmed but no documents
   - Escalating urgency (5 levels)
   - Stops when documents uploaded

---

## API Documentation

### Authentication

#### Client Portal Login
```http
POST /api/portal/verify-link
Content-Type: application/json

{
  "email": "client@example.com",
  "aktenzeichen": "MAND_2024_001"
}

Response:
{
  "success": true,
  "token": "session-token",
  "client": { ... }
}
```

#### Admin Login
```http
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password"
}

Response:
{
  "token": "jwt-token",
  "user": { email, role }
}
```

### Client Management

#### Get All Clients (Admin)
```http
GET /api/admin/clients
Authorization: Bearer <admin-token>

Response:
{
  "clients": [
    {
      "id": "client-id",
      "firstName": "Max",
      "lastName": "Mustermann",
      "email": "max@example.com",
      "current_status": "documents_uploaded",
      "financial_data": { ... },
      "creditors": [ ... ]
    }
  ]
}
```

#### Get Client Details
```http
GET /api/clients/:clientId
Authorization: Bearer <token>

Response:
{
  "id": "client-id",
  "aktenzeichen": "MAND_2024_001",
  "personal_data": { ... },
  "financial_data": { ... },
  "creditors": [ ... ],
  "documents": [ ... ],
  "workflow_status": "payment_confirmed"
}
```

### Document Management

#### Upload Document
```http
POST /api/clients/:clientId/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- document: <file>
- documentType: "creditor" | "other"

Response:
{
  "success": true,
  "documentId": "doc-id",
  "filename": "uploaded-file.pdf"
}
```

#### Get Client Documents
```http
GET /api/clients/:clientId/documents
Authorization: Bearer <token>

Response:
{
  "documents": [
    {
      "id": "doc-id",
      "filename": "creditor-invoice.pdf",
      "processing_status": "completed",
      "extracted_data": { ... },
      "confidence": 95,
      "uploadedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Creditor Management

#### Get Creditors
```http
GET /api/clients/:clientId/creditors
Authorization: Bearer <token>

Response:
{
  "creditors": [
    {
      "id": "creditor-id",
      "sender_name": "ABC Bank",
      "sender_email": "info@abcbank.de",
      "claim_amount": 5000,
      "status": "confirmed",
      "ai_confidence": 92,
      "zendesk_ticket_id": "12345"
    }
  ]
}
```

#### Start Creditor Contact
```http
POST /api/clients/:clientId/start-creditor-contact
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "tickets_created": 12,
  "emails_sent": 12
}
```

### Financial Data

#### Submit Financial Data
```http
POST /api/clients/:clientId/financial-data
Authorization: Bearer <token>
Content-Type: application/json

{
  "monthlyNetIncome": 2500,
  "numberOfChildren": 2,
  "maritalStatus": "married"
}

Response:
{
  "success": true,
  "garnishableAmount": 169.42,
  "selectedPlan": "quotenplan"
}
```

### Document Generation

#### Check Insolvenzantrag Prerequisites
```http
GET /api/insolvenzantrag/check-prerequisites/:clientId
Authorization: Bearer <admin-token>

Response:
{
  "ready": true,
  "checklist": {
    "personalInfo": true,
    "financialData": true,
    "settlementPlan": true,
    "creditorList": true
  }
}
```

#### Generate Insolvenzantrag
```http
GET /api/insolvenzantrag/generate/:clientId
Authorization: Bearer <admin-token>

Response: PDF file download
```

### Admin Operations

#### Immediate Review Override
```http
POST /api/admin/immediate-review/:clientId
Authorization: Bearer <admin-token>

Response:
{
  "success": true,
  "ticket_id": "12345",
  "message": "Zendesk ticket created immediately"
}
```

#### Dashboard Analytics
```http
GET /api/admin/dashboard-status
Authorization: Bearer <admin-token>

Response:
{
  "totalClients": 150,
  "activeClients": 45,
  "pendingDocuments": 12,
  "awaitingPayment": 8,
  "processingComplete": 85
}
```

### Webhooks

#### Zendesk Payment Confirmed
```http
POST /api/zendesk-webhooks/payment-confirmed
Content-Type: application/json

{
  "ticket_id": "12345",
  "client_id": "client-id"
}
```

#### Zendesk Processing Complete
```http
POST /api/zendesk-webhooks/processing-complete
Content-Type: application/json

{
  "ticket_id": "12345",
  "client_id": "client-id"
}
```

---

## Database Schema

### Client Model

**Location**: [server/models/Client.js](server/models/Client.js)

```javascript
{
  _id: ObjectId,
  id: String,                     // Unique client ID
  aktenzeichen: String,           // Case number (unique)

  // Personal Information
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: String
  },
  dateOfBirth: Date,

  // Financial Data
  financial_data: {
    monthlyNetIncome: Number,
    numberOfChildren: Number,
    maritalStatus: String,        // "ledig", "verheiratet", etc.
    garnishableAmount: Number,
    calculatedAt: Date
  },

  // Settlement Plan
  settlement_plan: {
    planType: String,              // "quotenplan" or "nullplan"
    monthlyPayment: Number,
    durationMonths: Number,
    totalPayment: Number,
    percentageOfDebt: Number,
    creditorQuotas: [{
      creditorId: String,
      creditorName: String,
      debtAmount: Number,
      monthlyQuota: Number,
      totalQuota: Number
    }],
    generatedDocumentPath: String,
    createdAt: Date
  },

  // Creditors
  creditors: [{
    id: String,
    sender_name: String,
    sender_email: String,
    claim_amount: Number,
    current_debt_amount: Number,
    amount_source: String,         // "creditor_response", "original_document", "fallback"
    status: String,                // "pending", "confirmed", "contacted", "responded"
    ai_confidence: Number,
    zendesk_ticket_id: String,
    created_at: Date,
    updated_at: Date
  }],

  // Documents
  documents: [{
    id: String,
    filename: String,
    path: String,
    processing_status: String,     // "pending", "processing", "completed", "failed"
    is_creditor_document: Boolean,
    extracted_data: Object,
    confidence: Number,
    uploadedAt: Date
  }],

  // Workflow Status
  current_status: String,          // See status list below
  workflow_history: [{
    status: String,
    timestamp: Date,
    triggeredBy: String,
    notes: String
  }],

  // Portal Access
  portal_link_sent: Boolean,
  portal_token: String,
  session_token: String,

  // Payment Tracking
  first_payment_received: Boolean,
  payment_confirmed_at: Date,

  // Processing Delays
  processing_complete_webhook_scheduled_at: Date,
  processing_complete_webhook_triggered: Boolean,

  // Reminders
  document_reminder_count: Number,
  last_document_reminder_sent: Date,
  login_reminder_sent: Boolean,

  // Zendesk Integration
  zendesk_user_id: String,
  zendesk_ticket_id: String,

  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

### Workflow Status Values

| Status | Description |
|--------|-------------|
| `created` | Client case created in system |
| `portal_access_sent` | Portal login link sent to client |
| `documents_uploaded` | Client has uploaded documents |
| `documents_processing` | AI processing documents |
| `waiting_for_payment` | Waiting for first payment |
| `payment_confirmed` | First payment received |
| `creditor_review` | Agent reviewing creditors |
| `awaiting_client_confirmation` | Waiting for client to confirm creditor list |
| `creditor_contact_active` | Actively contacting creditors (30-day period) |
| `financial_data_pending` | Waiting for client financial data |
| `settlement_plan_generated` | Settlement plan created |
| `plan_approval_pending` | Waiting for creditor approval of plan |
| `completed` | Case completed |

---

## Integration Guides

### Zendesk Setup

**Full Guide**: [ZENDESK_SETUP.md](ZENDESK_SETUP.md)

#### Quick Setup:

1. **Create Custom Fields** in Zendesk Admin:
   - Aktenzeichen (Text)
   - Creditor Name (Text)
   - Original Claim Amount (Number)
   - Current Debt Amount (Number)
   - Amount Source (Dropdown)

2. **Generate API Token**:
   - Admin → Apps and integrations → Zendesk API
   - Enable Token Access
   - Copy token to `.env`

3. **Configure Webhooks** (optional):
   - Endpoint: `https://your-domain.com/api/zendesk-webhook`
   - Triggers: Ticket comment created, status changed

4. **Update .env**:
```bash
ZENDESK_SUBDOMAIN=your-firm
ZENDESK_EMAIL=api@your-firm.com
ZENDESK_API_TOKEN=your-token
ZENDESK_FIELD_AKTENZEICHEN=custom_field_12345
```

### AI Integration (Claude/OpenAI)

**Claude Setup**:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI Setup**:
```bash
OPENAI_API_KEY=sk-...
```

The system will automatically use Claude if available, falling back to OpenAI.

### Google Cloud Document AI (Optional)

1. Create Google Cloud Project
2. Enable Document AI API
3. Create Service Account
4. Download credentials JSON
5. Update `.env`:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### LibreOffice for DOCX→PDF Conversion

**macOS**:
```bash
brew install libreoffice
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install libreoffice
```

**Docker** (recommended for production):
```bash
docker pull linuxserver/libreoffice
```

---

## Development Guidelines

### Code Style

- **Frontend**: TypeScript, functional components, React Hooks
- **Backend**: JavaScript (ES6+), async/await
- **Formatting**: Use consistent indentation (2 spaces)
- **Naming**:
  - Components: PascalCase (`UserDetailView`)
  - Files: kebab-case for utilities, PascalCase for components
  - Functions: camelCase (`calculateGarnishment`)

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes, commit frequently
git add .
git commit -m "feat: add settlement plan auto-selection"

# Push and create PR
git push origin feature/your-feature-name
```

**Commit Message Format**:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

### Adding a New API Endpoint

1. **Create route handler** in `server/routes/`:
```javascript
// server/routes/my-feature.js
const express = require('express');
const router = express.Router();

router.post('/api/my-feature', async (req, res) => {
  try {
    // Your logic here
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

2. **Register in server.js**:
```javascript
const myFeatureRoutes = require('./routes/my-feature');
app.use(myFeatureRoutes);
```

3. **Add frontend API call**:
```typescript
// In component
const handleMyFeature = async () => {
  const response = await axios.post('/api/my-feature', { data });
  console.log(response.data);
};
```

### Adding a New Service

1. Create in `server/services/`:
```javascript
// server/services/myService.js
class MyService {
  async doSomething(param) {
    // Business logic
    return result;
  }
}

module.exports = new MyService();
```

2. Use in routes:
```javascript
const myService = require('../services/myService');

router.post('/api/use-service', async (req, res) => {
  const result = await myService.doSomething(req.body.param);
  res.json(result);
});
```

---

## Testing

### Manual Testing

**Test Client Journey**:
```bash
# 1. Create test client in admin panel
open http://localhost:3000/admin

# 2. Login as client
open http://localhost:3000/login
# Email: test@example.com
# Aktenzeichen: MAND_TEST_001

# 3. Upload test documents
# Use PDFs from server/test-documents/ if available

# 4. Verify AI processing in logs
tail -f server/logs/app.log

# 5. Test admin immediate review
# Admin → Client Details → "Sofortige Prüfung"
```

### API Testing with cURL

**Test Health**:
```bash
curl http://localhost:3001/api/health
```

**Test Document Upload**:
```bash
curl -X POST http://localhost:3001/api/clients/12345/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "document=@test-invoice.pdf" \
  -F "documentType=creditor"
```

**Test Financial Data**:
```bash
curl -X POST http://localhost:3001/api/clients/12345/financial-data \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "monthlyNetIncome": 2500,
    "numberOfChildren": 2,
    "maritalStatus": "married"
  }'
```

### Automated Testing (Future)

```bash
# Run tests (when implemented)
npm test

# Run specific test file
npm test -- DocumentProcessor.test.js
```

---

## Deployment

### Production Deployment Checklist

- [ ] Set `NODE_ENV=production` in `.env`
- [ ] Use MongoDB Atlas (not local MongoDB)
- [ ] Enable SSL/HTTPS
- [ ] Configure production domain in CORS settings
- [ ] Set strong admin password
- [ ] Enable Zendesk webhooks
- [ ] Set up automated backups
- [ ] Configure monitoring (logs, uptime)
- [ ] Use PM2 or similar for process management
- [ ] Set up reverse proxy (Nginx)
- [ ] Remove test email override in Zendesk service
- [ ] Configure rate limiting appropriately
- [ ] Set up error tracking (Sentry, etc.)

### Docker Deployment (Recommended)

**Dockerfile** (example):
```dockerfile
FROM node:18-alpine

# Install LibreOffice for document conversion
RUN apk add --no-cache libreoffice

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application
COPY . .

# Build frontend
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/mandanten-portal
    depends_on:
      - mongo

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

**Deploy**:
```bash
docker-compose up -d
```

### PM2 Deployment

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server/server.js --name "mandanten-portal"

# Save process list
pm2 save

# Set up auto-restart on reboot
pm2 startup
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name portal.your-firm.de;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal.your-firm.de;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Frontend (React build)
    location / {
        root /var/www/mandanten-portal/build;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Troubleshooting

### Common Issues

#### MongoDB Connection Failed

**Error**: `MongooseServerSelectionError: connect ECONNREFUSED`

**Fix**:
```bash
# Check MongoDB is running
brew services list

# Start MongoDB
brew services start mongodb-community

# Or use systemctl (Linux)
sudo systemctl start mongod
```

#### Zendesk API Authentication Failed

**Error**: `401 Unauthorized`

**Fix**:
1. Verify credentials in `.env`
2. Check API token is active in Zendesk
3. Ensure email format is correct (email/token, not username)

#### Document Processing Stuck

**Symptoms**: Documents stay in "processing" status

**Fix**:
```bash
# Check logs
tail -f server/logs/app.log

# Verify AI API keys
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Manually trigger processing
curl -X POST http://localhost:3001/api/admin/reprocess-documents/:clientId
```

#### PDF Generation Fails

**Error**: `LibreOffice conversion failed`

**Fix**:
```bash
# Install LibreOffice
brew install libreoffice

# Verify installation
/opt/homebrew/bin/soffice --version

# Update path in .env if needed
LIBREOFFICE_PATH=/opt/homebrew/bin/soffice
```

#### Frontend Build Errors

**Error**: `Module not found` or TypeScript errors

**Fix**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear cache
npm cache clean --force

# Rebuild
npm run build
```

### Debug Mode

Enable detailed logging:

**Backend** (`server/.env`):
```bash
DEBUG=true
LOG_LEVEL=debug
```

**Frontend**:
```typescript
// Add to App.tsx
console.log('Debug mode enabled');
axios.defaults.headers.common['X-Debug'] = 'true';
```

### Database Inspection

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/mandanten-portal

# List collections
show collections

# Find clients
db.clients.find().pretty()

# Find specific client
db.clients.findOne({ aktenzeichen: "MAND_2024_001" })

# Update client status
db.clients.updateOne(
  { aktenzeichen: "MAND_2024_001" },
  { $set: { current_status: "payment_confirmed" } }
)
```

### Performance Issues

**Slow Document Processing**:
- Check AI API rate limits
- Verify network connection to Google Cloud
- Consider batch processing for large uploads

**High Memory Usage**:
- Limit concurrent document processing
- Use streaming for large file uploads
- Consider worker processes for AI tasks

**Slow Frontend**:
- Check bundle size: `npm run build` and analyze
- Lazy load heavy components
- Optimize images/assets

---

## Additional Resources

### Documentation Files

- **[README.md](README.md)** - Quick overview and installation
- **[SYSTEM-ARCHITECTURE.md](SYSTEM-ARCHITECTURE.md)** - Detailed architecture diagrams
- **[FLOWCHART.md](FLOWCHART.md)** - System workflows (Mermaid diagrams)
- **[FEATURES.md](FEATURES.md)** - Complete feature list
- **[ZENDESK_SETUP.md](ZENDESK_SETUP.md)** - Zendesk integration guide
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Production deployment
- **[TESTING_INSTRUCTIONS.md](TESTING_INSTRUCTIONS.md)** - Testing guide

### Interactive Flowcharts

Open in browser for interactive exploration:
- **[docs/VISUAL-FLOWCHART.html](docs/VISUAL-FLOWCHART.html)** - English version
- **[docs/VISUAL-FLOWCHART-DE.html](docs/VISUAL-FLOWCHART-DE.html)** - German version

### Key Services Documentation

**Document Processing**:
- [server/services/documentProcessor.js](server/services/documentProcessor.js)
- [server/services/claudeAI.js](server/services/claudeAI.js)
- [server/services/googleDocumentAI.js](server/services/googleDocumentAI.js)

**Settlement Calculations**:
- [server/services/germanGarnishmentCalculator.js](server/services/germanGarnishmentCalculator.js)
- [server/services/documentGenerator.js](server/services/documentGenerator.js)

**Zendesk Integration**:
- [server/services/zendeskManager.js](server/services/zendeskManager.js)
- [server/services/creditorContactService.js](server/services/creditorContactService.js)

---

## Contact & Support

### Project Maintainers

- **GitHub**: [@justLukaBB](https://github.com/justLukaBB)
- **Repository**: [mandanten-portal](https://github.com/justLukaBB/mandanten-portal)

### Getting Help

1. **Check this guide** and related documentation first
2. **Search existing issues** on GitHub
3. **Create new issue** with:
   - Clear description of problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Log outputs

### Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

---

## License

This project is private and proprietary.

---

**Last Updated**: October 2025
**Version**: 0.1.1
**Status**: Production-ready

---

## Quick Reference Commands

```bash
# Development
npm start                          # Start frontend
cd server && npm start             # Start backend
npm run build                      # Build frontend for production

# Database
mongosh mongodb://localhost:27017/mandanten-portal
db.clients.find().pretty()

# Docker
docker-compose up -d               # Start with Docker
docker-compose logs -f             # View logs

# PM2
pm2 start server/server.js
pm2 logs
pm2 restart all

# Testing
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/clients/:id/documents
```

---

**Happy Coding! 🚀**
