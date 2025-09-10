# System Architecture Diagram

## 🏗️ High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Web Browser]
        Mobile[Mobile Device]
    end
    
    subgraph "Frontend - React App"
        subgraph "Portals"
            ClientPortal[Client Portal<br/>- Document Upload<br/>- Status Tracking<br/>- Creditor Confirmation]
            AdminPortal[Admin Portal<br/>- Analytics Dashboard<br/>- User Management<br/>- System Control]
            AgentPortal[Agent Portal<br/>- Document Review<br/>- Manual Processing<br/>- Corrections]
        end
        
        subgraph "Shared Components"
            Auth[Authentication<br/>Components]
            UI[UI Components<br/>Tailwind CSS]
            API[API Client<br/>Axios]
        end
    end
    
    subgraph "Backend - Node.js/Express"
        subgraph "API Layer"
            REST[REST API<br/>Endpoints]
            MW[Middleware<br/>- Auth<br/>- Rate Limit<br/>- Validation]
        end
        
        subgraph "Business Logic"
            Services[Services<br/>- Document Processor<br/>- Zendesk Manager<br/>- Email Service<br/>- AI Integration]
            Tasks[Scheduled Tasks<br/>- Doc Reminders<br/>- Delayed Webhooks<br/>- Cleanup]
        end
        
        subgraph "Data Layer"
            Models[Mongoose Models<br/>- Client<br/>- Document<br/>- Creditor]
            DB[Database Service]
        end
    end
    
    subgraph "Storage"
        MongoDB[(MongoDB<br/>- Client Data<br/>- Documents Meta<br/>- Status History)]
        FileSystem[File System<br/>- Uploaded Docs<br/>- Temp Files]
    end
    
    subgraph "External Services"
        Zendesk[Zendesk API<br/>- Tickets<br/>- Users<br/>- Webhooks]
        AI[AI Services<br/>- Claude API<br/>- OpenAI API<br/>- Google Doc AI]
        Email[Email Service<br/>- SMTP<br/>- Templates]
    end
    
    Browser --> ClientPortal
    Browser --> AdminPortal
    Browser --> AgentPortal
    Mobile --> ClientPortal
    
    ClientPortal --> Auth
    AdminPortal --> Auth
    AgentPortal --> Auth
    
    Auth --> API
    UI --> API
    API --> REST
    
    REST --> MW
    MW --> Services
    MW --> Tasks
    
    Services --> Models
    Tasks --> Models
    Models --> DB
    DB --> MongoDB
    
    Services --> FileSystem
    Services --> Zendesk
    Services --> AI
    Services --> Email
```

## 🔄 Request Flow Example

```mermaid
sequenceDiagram
    participant C as Client
    participant F as Frontend
    participant A as API
    participant S as Service
    participant D as Database
    participant Z as Zendesk
    
    C->>F: Upload Document
    F->>A: POST /api/clients/:id/documents
    A->>A: Validate File
    A->>S: Process Document
    S->>D: Save Document Metadata
    S->>S: Queue for AI Processing
    S-->>F: Return Success
    F-->>C: Show Upload Success
    
    Note over S: Async Processing (3s delay)
    
    S->>AI: Extract Creditor Data
    AI-->>S: Return Extracted Data
    S->>D: Update Document with Results
    S->>D: Update Creditor List
    
    alt All Documents Processed
        S->>S: Schedule 24h Delay
        Note over S: Wait 24 hours
        S->>Z: Create Review Ticket
        Z-->>S: Ticket Created
        S->>D: Update Status
    end
```

## 📊 Component Dependencies

```mermaid
graph LR
    subgraph Frontend Dependencies
        React[React 18]
        TS[TypeScript]
        Router[React Router]
        Tailwind[Tailwind CSS]
        Axios[Axios]
        DateFNS[date-fns]
        Icons[Heroicons]
    end
    
    subgraph Backend Dependencies
        Node[Node.js]
        Express[Express]
        Mongoose[Mongoose]
        Multer[Multer]
        UUID[UUID]
        DotEnv[DotEnv]
        CORS[CORS]
    end
    
    subgraph External SDKs
        ZendeskSDK[Zendesk SDK]
        OpenAISDK[OpenAI SDK]
        AnthropicSDK[Anthropic SDK]
    end
```

## 🗂️ Directory Structure

```
mandanten-portal/
├── src/                          # Frontend Source
│   ├── admin/                    # Admin Portal
│   │   ├── components/          # Admin Components
│   │   ├── pages/              # Admin Pages
│   │   └── AdminApp.tsx        # Admin Root
│   ├── agent/                   # Agent Portal
│   │   ├── components/         # Agent Components
│   │   ├── pages/             # Agent Pages
│   │   └── AgentApp.tsx       # Agent Root
│   ├── pages/                  # Client Portal Pages
│   ├── components/             # Shared Components
│   ├── config/                 # Configuration
│   └── App.tsx                # Main App Component
│
├── server/                     # Backend Source
│   ├── models/                # Database Models
│   │   └── Client.js         # Client Schema
│   ├── routes/               # API Routes
│   │   ├── portal-webhooks.js
│   │   ├── zendesk-webhooks.js
│   │   └── admin-delayed-processing.js
│   ├── services/             # Business Logic
│   │   ├── documentProcessor.js
│   │   ├── zendeskService.js
│   │   ├── delayedProcessingService.js
│   │   └── documentReminderService.js
│   ├── middleware/           # Express Middleware
│   ├── uploads/             # File Upload Directory
│   └── server.js           # Main Server File
│
├── public/                 # Static Assets
├── build/                 # Production Build
└── node_modules/         # Dependencies
```

## 🔐 Security Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        subgraph "Frontend Security"
            InputVal[Input Validation]
            XSS[XSS Protection]
            HTTPS[HTTPS Only]
        end
        
        subgraph "API Security"
            RateLimit[Rate Limiting]
            AuthMW[Auth Middleware]
            CORS[CORS Policy]
            Validation[Request Validation]
        end
        
        subgraph "Backend Security"
            FileVal[File Validation]
            SQLInj[NoSQL Injection Prevention]
            Secrets[Environment Variables]
            Crypto[Token Generation]
        end
        
        subgraph "Infrastructure"
            Firewall[Firewall Rules]
            SSL[SSL Certificates]
            Backup[Automated Backups]
        end
    end
    
    InputVal --> XSS
    XSS --> HTTPS
    HTTPS --> RateLimit
    RateLimit --> AuthMW
    AuthMW --> CORS
    CORS --> Validation
    Validation --> FileVal
    FileVal --> SQLInj
    SQLInj --> Secrets
    Secrets --> Crypto
    Crypto --> Firewall
    Firewall --> SSL
    SSL --> Backup
```

## 💾 Data Models

```mermaid
erDiagram
    Client ||--o{ Document : has
    Client ||--o{ Creditor : has
    Client ||--o{ StatusHistory : tracks
    Client ||--o{ ZendeskTicket : linked
    
    Client {
        string id PK
        string aktenzeichen UK
        string firstName
        string lastName
        string email
        string current_status
        boolean first_payment_received
        date processing_complete_webhook_scheduled_at
        boolean processing_complete_webhook_triggered
    }
    
    Document {
        string id PK
        string client_id FK
        string filename
        string processing_status
        boolean is_creditor_document
        json extracted_data
        float confidence
        date uploadedAt
    }
    
    Creditor {
        string id PK
        string client_id FK
        string sender_name
        string sender_email
        number claim_amount
        string status
        float ai_confidence
        date created_at
    }
    
    StatusHistory {
        string id PK
        string client_id FK
        string status
        string changed_by
        json metadata
        date created_at
    }
    
    ZendeskTicket {
        string ticket_id PK
        string client_id FK
        string ticket_type
        string status
        date created_at
    }
```

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        LB[Load Balancer<br/>Nginx]
        
        subgraph "Application Servers"
            App1[Node.js Instance 1<br/>PM2 Managed]
            App2[Node.js Instance 2<br/>PM2 Managed]
        end
        
        subgraph "Database Cluster"
            Primary[(MongoDB Primary)]
            Secondary1[(MongoDB Secondary)]
            Secondary2[(MongoDB Secondary)]
        end
        
        subgraph "File Storage"
            FS[Network File System<br/>Document Storage]
        end
        
        subgraph "Caching Layer"
            Redis[Redis Cache<br/>Session Storage]
        end
    end
    
    subgraph "External Services"
        CDN[CDN<br/>Static Assets]
        S3[S3 Backup<br/>Document Archive]
    end
    
    Users[Users] --> LB
    LB --> App1
    LB --> App2
    
    App1 --> Primary
    App2 --> Primary
    Primary --> Secondary1
    Primary --> Secondary2
    
    App1 --> FS
    App2 --> FS
    App1 --> Redis
    App2 --> Redis
    
    FS --> S3
    CDN --> Users
```

## 📈 Performance Considerations

1. **Database Indexing**
   - Compound indexes on frequently queried fields
   - Text indexes for search functionality

2. **Caching Strategy**
   - API response caching for analytics
   - Static asset caching with CDN
   - Database query result caching

3. **Async Processing**
   - Document processing in background
   - Email sending queued
   - Webhook processing non-blocking

4. **Resource Optimization**
   - Image compression for uploads
   - PDF optimization before storage
   - Pagination for large data sets

5. **Monitoring**
   - APM for performance tracking
   - Error tracking with Sentry
   - Log aggregation with ELK stack