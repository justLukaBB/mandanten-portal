# Mandanten-Portal System Flowchart

## 🔄 Main System Flow

```mermaid
graph TB
    Start([Client Insolvency Case Starts]) --> CreateClient[Agent Creates Client in Zendesk]
    CreateClient --> WebhookReceived[Webhook: Client Created]
    
    WebhookReceived --> StoreDB[(Store in MongoDB)]
    StoreDB --> GeneratePortal[Generate Portal Access]
    GeneratePortal --> SendEmail[Send Portal Link Email]
    
    SendEmail --> ClientLogin{Client Logs In?}
    ClientLogin -->|Yes| UploadDocs[Client Uploads Documents]
    ClientLogin -->|No| WaitForLogin[Wait for Login]
    WaitForLogin --> SendEmail
    
    UploadDocs --> AIProcess[AI Document Processing]
    AIProcess --> ExtractCreditors[Extract Creditor Data]
    
    ExtractCreditors --> CheckPayment{First Payment Received?}
    CheckPayment -->|No| WaitPayment[Wait for Payment]
    CheckPayment -->|Yes| Schedule24h[Schedule 24h Delay]
    
    WaitPayment --> PaymentWebhook[Payment Confirmation Webhook]
    PaymentWebhook --> Schedule24h
    
    Schedule24h --> Wait24h{24 Hours Passed?}
    Wait24h -->|No| AdminOverride{Admin Override?}
    AdminOverride -->|Yes| CreateTicket
    AdminOverride -->|No| Wait24h
    Wait24h -->|Yes| CreateTicket[Create Zendesk Review Ticket]
    
    CreateTicket --> ReviewType{Review Type?}
    ReviewType -->|Auto Approved| ClientConfirm[Await Client Confirmation]
    ReviewType -->|Manual Review| AgentReview[Agent Reviews Creditors]
    ReviewType -->|No Creditors| ManualCheck[Manual Document Check]
    
    AgentReview --> ApproveCreditors[Agent Approves List]
    ManualCheck --> ApproveCreditors
    ApproveCreditors --> ClientConfirm
    
    ClientConfirm --> ClientConfirmed{Client Confirmed?}
    ClientConfirmed -->|Yes| StartContact[Start Creditor Contact]
    ClientConfirmed -->|No| FollowUp[Follow Up with Client]
    FollowUp --> ClientConfirm
    
    StartContact --> ContactCreditors[Send Emails to Creditors]
    ContactCreditors --> TrackResponses[Track Responses]
    TrackResponses --> GeneratePlan[Generate Settlement Plan]
    GeneratePlan --> Complete([Case Complete])
```

## 📊 Document Processing Flow

```mermaid
graph LR
    Upload([Document Upload]) --> Validate{Valid File?}
    Validate -->|No| Error[Show Error]
    Validate -->|Yes| Store[Store in /uploads]
    
    Store --> Queue[Add to Processing Queue]
    Queue --> AI[AI Processing]
    
    AI --> Classification{Is Creditor Doc?}
    Classification -->|No| MarkNonCreditor[Mark as Non-Creditor]
    Classification -->|Yes| Extract[Extract Data]
    
    Extract --> Confidence{Confidence > 80%?}
    Confidence -->|Yes| AutoApprove[Auto Approve]
    Confidence -->|No| FlagReview[Flag for Review]
    
    AutoApprove --> UpdateDB[(Update Database)]
    FlagReview --> UpdateDB
    MarkNonCreditor --> UpdateDB
    
    UpdateDB --> CheckAll{All Docs Processed?}
    CheckAll -->|No| NextDoc[Process Next]
    CheckAll -->|Yes| TriggerWebhook[Trigger Completion]
```

## 🔐 Authentication Flows

```mermaid
graph TD
    subgraph Client Portal
        CStart([Client Start]) --> CEmail[Enter Email]
        CEmail --> CAkten[Enter Aktenzeichen]
        CAkten --> CVerify{Verify Credentials?}
        CVerify -->|Valid| CSession[Create Session]
        CVerify -->|Invalid| CError[Show Error]
        CSession --> CPortal[Access Portal]
    end
    
    subgraph Admin Portal
        AStart([Admin Start]) --> ALogin[Enter Admin Credentials]
        ALogin --> AVerify{Verify Admin?}
        AVerify -->|Valid| AToken[Generate Token]
        AVerify -->|Invalid| AError[Show Error]
        AToken --> ADash[Access Dashboard]
    end
    
    subgraph Agent Portal
        GStart([Agent Start]) --> GLogin[Zendesk OAuth]
        GLogin --> GVerify{Verify Agent?}
        GVerify -->|Valid| GSession[Create Session]
        GVerify -->|Invalid| GError[Show Error]
        GSession --> GReview[Access Review Portal]
    end
```

## 🔄 Status Workflow

```mermaid
stateDiagram-v2
    [*] --> Created: Client Created
    Created --> PortalAccessSent: Send Portal Link
    PortalAccessSent --> DocumentsUploaded: Client Uploads Docs
    DocumentsUploaded --> DocumentsProcessing: AI Processing
    DocumentsProcessing --> WaitingForPayment: Docs Complete
    WaitingForPayment --> PaymentConfirmed: Payment Received
    PaymentConfirmed --> CreditorReview: 24h Delay or Override
    CreditorReview --> AwaitingClientConfirmation: Creditors Approved
    AwaitingClientConfirmation --> CreditorContactActive: Client Confirms
    CreditorContactActive --> Completed: All Creditors Contacted
    Completed --> [*]
```

## 🚀 Scheduled Tasks Flow

```mermaid
graph TB
    subgraph Document Reminders - Every Hour
        DR1[Check Clients] --> DR2{Payment but No Docs?}
        DR2 -->|Yes| DR3{Time for Reminder?}
        DR3 -->|Yes| DR4[Send Reminder Email]
        DR3 -->|No| DR5[Skip Client]
        DR2 -->|No| DR5
        DR4 --> DR6[Update Reminder Count]
    end
    
    subgraph Delayed Webhooks - Every 30 Min
        DW1[Check Scheduled Webhooks] --> DW2{Time Reached?}
        DW2 -->|Yes| DW3{Recent Upload?}
        DW3 -->|No| DW4[Trigger Webhook]
        DW3 -->|Yes| DW5[Postpone 24h]
        DW2 -->|No| DW6[Skip]
    end
```

## 🎯 Admin Actions Flow

```mermaid
graph LR
    Admin([Admin Dashboard]) --> View{Select Action}
    
    View -->|Analytics| Stats[View Statistics]
    View -->|User List| List[Browse Users]
    View -->|Settings| Config[System Config]
    
    List --> User[Select User]
    User --> Actions{User Actions}
    
    Actions -->|View Details| Details[Show Full Info]
    Actions -->|Immediate Review| Override{Has Docs & Payment?}
    
    Override -->|Yes| Trigger[Trigger Zendesk Ticket]
    Override -->|No| ShowError[Show Requirements]
    
    Trigger --> Update[Update Status]
    Update --> Refresh[Refresh Dashboard]
```

## 💾 Data Flow

```mermaid
graph TB
    subgraph External Systems
        Zendesk[Zendesk API]
        AI[Claude/OpenAI API]
        Email[Email Service]
    end
    
    subgraph Backend
        API[Express API]
        Services[Service Layer]
        Models[Mongoose Models]
    end
    
    subgraph Database
        MongoDB[(MongoDB)]
        Files[File Storage]
    end
    
    subgraph Frontend
        React[React App]
        Admin[Admin Portal]
        Agent[Agent Portal]
        Client[Client Portal]
    end
    
    React --> API
    Admin --> API
    Agent --> API
    Client --> API
    
    API --> Services
    Services --> Models
    Models --> MongoDB
    Services --> Files
    
    Services <--> Zendesk
    Services <--> AI
    Services <--> Email
```

## 🔧 Error Handling Flow

```mermaid
graph TD
    Action([User Action]) --> Try{Try Operation}
    
    Try -->|Success| Complete[Return Success]
    Try -->|Error| Catch[Catch Error]
    
    Catch --> ErrorType{Error Type?}
    
    ErrorType -->|Validation| ValError[400 Bad Request]
    ErrorType -->|Auth| AuthError[401 Unauthorized]
    ErrorType -->|NotFound| NotFound[404 Not Found]
    ErrorType -->|Server| ServerError[500 Server Error]
    
    ValError --> Log[Log Error]
    AuthError --> Log
    NotFound --> Log
    ServerError --> Log
    
    Log --> Response[Send Error Response]
    Response --> Client[Display to User]
```

## 📱 Component Interaction

```mermaid
graph TB
    subgraph User Interface
        UserList[User List View]
        UserDetail[User Detail Modal]
        DocUpload[Document Upload]
        Analytics[Analytics Dashboard]
    end
    
    subgraph State Management
        LocalState[Component State]
        APIState[API Response Cache]
        AuthState[Auth Token Storage]
    end
    
    subgraph API Layer
        Axios[Axios Client]
        Interceptors[Request Interceptors]
        ErrorHandler[Error Handler]
    end
    
    UserList --> LocalState
    UserDetail --> LocalState
    DocUpload --> LocalState
    Analytics --> LocalState
    
    LocalState --> Axios
    AuthState --> Interceptors
    Axios --> Interceptors
    Interceptors --> ErrorHandler
    
    ErrorHandler --> Backend[Backend API]
```

## 🎨 Key Decision Points

1. **Document Processing Trigger**
   - Immediate after upload (3-second delay per doc)
   - Zendesk notification after 24 hours (or admin override)

2. **Review Type Decision**
   - Auto-approved: All creditors > 80% confidence
   - Manual review: Any creditor < 80% confidence
   - No creditors: Special handling required

3. **Reminder Escalation**
   - Day 1: Friendly reminder
   - Day 3: Urgent reminder
   - Day 5+: Critical with escalation

4. **Status Transitions**
   - Automatic: Based on system events
   - Manual: Agent/Admin actions
   - Webhook: External system triggers

## 📝 Notes

- All flows include error handling and logging
- Database operations use transactions where critical
- Rate limiting applied to all public endpoints
- Authentication required for all data access
- Audit trail maintained for all status changes