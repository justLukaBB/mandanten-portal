# Mandanten-Portal

A comprehensive multi-portal system for German insolvency (Insolvenz) case management with AI-powered document processing and automated workflow management.

## 🚀 Overview

Mandanten-Portal is a full-stack application designed to streamline the insolvency process by:
- Automating document collection and creditor identification
- Managing client workflows from initial contact to completion
- Integrating with Zendesk for ticket management
- Providing separate portals for clients, agents, and administrators

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router v6** for navigation
- **Axios** for API communication
- **date-fns** for date handling
- **Heroicons** for icons

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **AI Integration** (OpenAI/Claude API)
- **Zendesk API** for ticket management
- **Multer** for file uploads
- **Custom authentication** system

### Document Processing
- AI-powered creditor extraction
- PDF parsing and analysis
- OCR capabilities
- Automated document classification

## 📁 Project Structure

```
mandanten-portal/
├── src/                      # Frontend React application
│   ├── admin/               # Admin portal components
│   ├── agent/               # Agent portal components
│   ├── pages/               # Client portal pages
│   ├── components/          # Shared components
│   └── config/              # Configuration files
├── server/                   # Backend Node.js application
│   ├── models/              # MongoDB schemas
│   ├── routes/              # API endpoints
│   ├── services/            # Business logic
│   ├── middleware/          # Express middleware
│   └── uploads/             # File upload directory
├── public/                   # Static assets
└── docs/                    # Documentation
```

## ✨ Key Features

### 1. **Multi-Portal System**
- **Client Portal**: Document upload, creditor confirmation
- **Admin Portal**: User management, analytics dashboard
- **Agent Portal**: Manual review, document processing

### 2. **Automated Workflow**
- Payment tracking and confirmation
- Document processing with 24-hour delay
- Automated reminders for missing documents
- Status-based workflow progression

### 3. **AI-Powered Processing**
- Automatic creditor identification from documents
- Data extraction (names, amounts, addresses)
- Confidence scoring for manual review
- Multi-language document support

### 4. **Zendesk Integration**
- Automatic ticket creation
- Status synchronization
- Comment and tag management
- Side conversation support

### 5. **Admin Features**
- Real-time analytics dashboard
- Immediate review override buttons
- Document processing monitoring
- User management system

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn
- Zendesk account (optional)
- OpenAI/Claude API key (for AI features)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/justLukaBB/mandanten-portal.git
cd mandanten-portal
```

2. **Install dependencies**
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
```

3. **Environment Setup**

Create a `.env` file in the server directory:
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/mandanten-portal

# Frontend URL
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001

# Zendesk Configuration (Optional)
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_EMAIL=your-email@example.com
ZENDESK_API_TOKEN=your-api-token

# AI Configuration
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# Admin Credentials
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
```

4. **Start the application**

In one terminal, start the backend:
```bash
cd server
npm start
```

In another terminal, start the frontend:
```bash
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 📖 Usage

### Client Portal
1. Clients receive a portal link via email
2. Login with email and case number (Aktenzeichen)
3. Upload creditor documents
4. Confirm extracted creditor list
5. Track case progress

### Admin Portal
Access at `/admin` with admin credentials:
- Monitor all client cases
- View analytics and statistics
- Trigger immediate document processing
- Manage system settings

### Agent Portal
Access at `/agent/login`:
- Review flagged documents
- Manually process unclear cases
- Correct AI-extracted data
- Manage client communications

## 🔧 API Documentation

### Key Endpoints

#### Client Authentication
```
POST /api/portal/verify-link
POST /api/portal/verify-session
```

#### Document Management
```
POST /api/clients/:clientId/documents
GET  /api/clients/:clientId/documents
POST /api/portal/process-document
```

#### Admin Operations
```
GET  /api/admin/dashboard-status
POST /api/admin/immediate-review/:clientId
GET  /api/admin/clients
```

#### Zendesk Webhooks
```
POST /api/zendesk-webhooks/payment-confirmed
POST /api/zendesk-webhooks/processing-complete
```

## 🔒 Security

- Token-based authentication
- Rate limiting on all endpoints
- CORS protection
- Input validation and sanitization
- Environment-based configuration
- Secure file upload handling

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is private and proprietary.

## 👥 Contact

- GitHub: [@justLukaBB](https://github.com/justLukaBB)
- Project Link: [https://github.com/justLukaBB/mandanten-portal](https://github.com/justLukaBB/mandanten-portal)

## 🙏 Acknowledgments

- Built with React and Node.js
- AI processing powered by OpenAI/Claude
- UI components from Heroicons
- Styling with Tailwind CSS