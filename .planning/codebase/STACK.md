# Technology Stack

**Analysis Date:** 2026-01-30

## Languages

**Primary:**
- TypeScript 4.9.5 - Frontend application (`src/`)
- JavaScript (ES2021) - Backend server (`server/`)

**Secondary:**
- Python 3.x - Utility script (`server/cleanup_server.py`)

## Runtime

**Environment:**
- Node.js >=18.0.0 (required by server/package.json)
- Browser: Modern ES2020+ support (Chrome, Firefox, Safari latest versions)

**Package Manager:**
- npm (inferred from package-lock.json presence)
- Lockfile: Present for both root and server directories
  - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/package-lock.json`
  - `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/package-lock.json`

## Frameworks

**Core:**
- React 18.2.0 - UI framework
- React Router DOM 6.8.0 - Frontend routing (7.8.2 in server for unknown reason)
- Express 4.18.2 - Backend HTTP server
- Socket.IO 4.8.3 - Real-time bidirectional communication (client & server)

**State Management:**
- Redux Toolkit 2.11.2 - Client-side state management
- React Redux 9.2.0 - React-Redux bindings

**Styling:**
- Tailwind CSS 3.4.17 - Utility-first CSS framework
- PostCSS 8.5.6 - CSS processing
- Radix UI - Headless component library (Dialog component in use)
- Lucide React 0.544.0 - Icon library
- Class Variance Authority 0.7.1 - Variant-based styling

**Testing:**
- Jest - Test runner (via react-scripts 5.0.1)
- React Testing Library 13.3.0 - Component testing
- @testing-library/jest-dom 5.16.4 - Custom DOM matchers
- @testing-library/user-event 13.5.0 - User interaction simulation

**Build/Dev:**
- react-scripts 5.0.1 - Build tooling and webpack configuration
- nodemon 3.0.1 - Development server auto-restart (backend)
- TypeScript compiler (tsc) 4.9.5

## Key Dependencies

**Critical:**
- mongoose 8.0.0 - MongoDB ODM for data persistence
- jsonwebtoken 9.0.2 - JWT authentication (client & server)
- axios 1.6.0 (frontend), 1.10.0 (backend) - HTTP client
- dotenv 16.3.1 - Environment variable management

**Document Processing:**
- docxtemplater 3.67.6 (frontend), 3.66.4 (backend) - DOCX template filling
- pdf-lib 1.17.1 - PDF manipulation (client & server)
- pizzip 3.2.0 - ZIP handling for DOCX files (client & server)
- docx 9.5.1 - DOCX generation (server)
- mammoth 1.11.0 (frontend), 1.8.0 (backend) - DOCX to HTML conversion
- xlsx 0.18.5 - Excel file processing (client & server)
- xml2js 0.6.2 - XML parsing (server)
- pdf-parse 1.1.1 - PDF text extraction (server)
- pdf2pic 3.0.3 - PDF to image conversion (server)
- sharp 0.32.6 - Image processing (server)

**AI & External Services:**
- @anthropic-ai/sdk 0.56.0 - Claude AI integration (server)
- @google-cloud/documentai 8.0.0 - Google Document AI OCR (server)
- @google-cloud/storage 7.0.0 - Google Cloud Storage (server)
- google-auth-library 10.1.0 - Google Cloud authentication (server)
- resend 6.8.0 - Email sending service (server)

**Form & Validation:**
- react-hook-form 7.70.0 - Form state management
- @hookform/resolvers 5.2.2 - Form validation resolvers
- zod 4.3.5 - Schema validation
- express-validator 7.2.1 - Server-side validation

**Infrastructure:**
- bcryptjs 3.0.2 - Password hashing (server)
- cors 2.8.5 - CORS middleware (server)
- helmet 8.1.0 - Security headers (server)
- express-rate-limit 8.0.1 - Rate limiting (server)
- multer 1.4.5-lts.1 - File upload handling (server)
- archiver 7.0.1 - File compression (server)
- fs-extra 11.1.1 - Enhanced filesystem operations (server)
- uuid 9.0.0 - UUID generation (server)

**UI Components:**
- @heroicons/react 2.0.18 - Icon library
- sonner 2.0.7 - Toast notifications
- date-fns 4.1.0 - Date manipulation
- clsx 2.1.1 - Conditional class names
- tailwind-merge 3.4.0 - Tailwind class merging

## Configuration

**Environment:**
- Configuration file: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js`
- Example env: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/.env.example`
- Environment variables loaded via dotenv
- Key configs required:
  - `MONGODB_URI` - Database connection string (required)
  - `JWT_SECRET` - Token signing secret (required)
  - `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` - AI processing (production)
  - `GOOGLE_CLOUD_PROJECT_ID` - Document AI (production)
  - `ZENDESK_DOMAIN`, `ZENDESK_API_EMAIL`, `ZENDESK_API_TOKEN` - Ticket system
  - `RESEND_API_KEY` - Email service (optional, logs to console if missing)
  - `PORT` - Server port (default: 3001)
  - `NODE_ENV` - Environment mode (development/production)
  - `FASTAPI_URL` - External Python FastAPI service URL (default: http://localhost:8000)
  - `FASTAPI_API_KEY` - FastAPI authentication
  - `PORTAL_BASE_URL` or `FRONTEND_URL` - Frontend URL for webhooks

**Build:**
- Frontend: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/tsconfig.json`
  - Target: ES2020
  - Module: ESNext (bundler resolution)
  - JSX: react-jsx
  - Base path aliasing: `@/*` → `./*`
- Tailwind: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/tailwind.config.js`
- PostCSS: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/postcss.config.js`
- ESLint: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/.eslintrc.js`
  - TypeScript + React + React Hooks
  - Server files have relaxed console rules

## Platform Requirements

**Development:**
- Node.js 18+ (required by server)
- npm package manager
- MongoDB instance or MongoDB Atlas connection
- Optional: Google Cloud credentials for Document AI
- Optional: Anthropic API key for Claude AI
- Optional: Resend API key for emails
- Optional: Zendesk account for ticketing
- Frontend dev server: Port 4000 (configured in package.json start script)
- Backend dev server: Port 3001 (default)

**Production:**
- Deployment target: Docker container (Dockerfile exists at `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/Dockerfile`)
- Base image: node:18-slim with LibreOffice, Java, fonts, and locales
- Hosting: Render.com (inferred from CORS origins: mandanten-portal.onrender.com)
- Static frontend build: `npm run build` creates build/ with 404.html fallback
- Server: `npm start` runs `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/server.js`

---

*Stack analysis: 2026-01-30*
