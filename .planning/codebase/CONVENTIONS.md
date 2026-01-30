# Coding Conventions

**Analysis Date:** 2026-01-30

## Naming Patterns

**Files:**
- React components: PascalCase - `ClientDataComponent.tsx`, `AdminApp.tsx`, `PersonalPortal.tsx`
- Utility modules: camelCase - `uploadQueue.ts`, `urlHelpers.ts`, `logger.ts`
- Server services: camelCase - `documentProcessor.js`, `creditorContactService.js`
- Server models: PascalCase - `Client.js`, `Agent.js`
- Configuration: camelCase or kebab-case - `index.js`, `api.ts`, `tailwind.config.js`

**Functions:**
- camelCase for functions and methods - `processDocument()`, `formatMessage()`, `handleSubmit()`
- React components: PascalCase function names - `const ClientDataComponent: React.FC = () => {}`

**Variables:**
- camelCase for local variables - `clientData`, `isLoading`, `extractedData`
- SCREAMING_SNAKE_CASE for constants - `API_BASE_URL`, `JWT_SECRET`, `LOG_LEVELS`
- Prefix boolean variables with `is`, `has`, `should` - `isLoading`, `hasNewVersion`, `shouldLog`

**Types:**
- PascalCase for TypeScript interfaces and types - `Client`, `CreditorFormData`, `ClientDataComponentProps`
- Use `Props` suffix for component props interfaces - `AddCreditorFormProps`

## Code Style

**Formatting:**
- No explicit Prettier config detected
- Indentation: 2 spaces (observed in React components) or 4 spaces (observed in server code)
- Semicolons: Not enforced (mixture in codebase)
- Line length: Not explicitly enforced
- Quotes: Single quotes preferred in JSX/TSX, mixed in server code

**Linting:**
- Tool: ESLint
- Config: `.eslintrc.js`
- Key rules enforced:
  - `no-var`: error - Use `const` or `let` instead of `var`
  - `prefer-const`: warn - Prefer `const` for variables that are never reassigned
  - `eqeqeq`: error - Require strict equality (`===` and `!==`)
  - `curly`: error - Require curly braces for all control statements
  - `@typescript-eslint/no-explicit-any`: warn - Warn on `any` type usage
  - `@typescript-eslint/no-unused-vars`: warn - Warn on unused variables (ignore if prefixed with `_`)
  - `no-console`: warn - Warn on `console.log`, allow `console.warn` and `console.error`
  - React rules: `react/react-in-jsx-scope` disabled (React 17+), `react/prop-types` disabled (using TypeScript)

## Import Organization

**Order:**
1. External React imports - `import React, { useState, useEffect } from 'react';`
2. External library imports - `import { useParams, useNavigate } from 'react-router-dom';`
3. Icon imports - `import { UserIcon, EnvelopeIcon } from '@heroicons/react/24/outline';`
4. Internal store/state imports - `import { useDispatch } from 'react-redux';`
5. Internal component imports - `import CreditorUploadComponent from '../components/CreditorUploadComponent';`
6. Config/utility imports - `import api from '../config/api';`

**Path Aliases:**
- `@/*` configured in `tsconfig.json` to resolve from project root
- Relative imports used throughout codebase - `'../components/ClientDataComponent'`, `'../../config/api'`

## Error Handling

**Patterns:**
- Frontend: Try-catch blocks with typed error handling
```typescript
try {
  const response = await api.post('/endpoint', data);
  // success handling
} catch (error: any) {
  console.error('Operation failed:', error);
  // user feedback via toast or state
}
```

- Backend: Try-catch with structured error responses
```javascript
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('ERROR:', error.message);
  return { error: true, message: error.message };
}
```

- Use `throw new Error()` for exceptional conditions in server code at `server/services/documentGenerator.js`, `server/services/delayedProcessingService.js`
- RTK Query handles API errors automatically via `baseQueryWithReauth` in `src/store/api/baseApi.ts`

## Logging

**Frontend:**
- Framework: Custom logger utility at `src/utils/logger.ts`
- Levels: DEBUG, INFO, WARN, ERROR
- Pattern:
```typescript
import { logger, createLogger } from '../utils/logger';
logger.info('Message', ...args);
logger.error('Error message', ...args);
const moduleLogger = createLogger('ModuleName');
moduleLogger.debug('Debug info');
```
- Production: Logs at WARN level and above
- Development: Logs at DEBUG level and above
- Format: `${timestamp} ${level} [${module}] ${message}`

**Backend:**
- Framework: Custom logger class at `server/utils/logger.js`
- Levels: ERROR, WARN, INFO, DEBUG
- Pattern:
```javascript
const Logger = require('./utils/logger');
const logger = new Logger('ServiceName');
logger.info('Operation completed', { metadata });
logger.error('Operation failed', error, { additionalContext });
```
- Production: JSON format for parsing
- Development: Emoji-prefixed human-readable format
- Supports child loggers: `logger.child('SubContext')`
- Heavy use of direct `console.log` with emoji prefixes in server code (legacy pattern)

## Comments

**When to Comment:**
- JSDoc for exported functions and components (limited usage observed)
- Inline comments for complex business logic
- Section headers in large files using comment blocks:
```javascript
// =============================================================================
// 2. MODELS
// =============================================================================
```

**JSDoc/TSDoc:**
- Minimal usage in codebase
- Example from `src/utils/logger.ts`:
```typescript
/**
 * Structured logging utility for client-side code
 * Replaces console.log/error/warn with proper logging levels
 */
```

## Function Design

**Size:** No strict limit enforced; functions range from 10-200 lines

**Parameters:**
- TypeScript: Use interfaces for complex parameter objects
- Destructuring preferred for function parameters:
```typescript
const Component: React.FC<{ clientId: string; onClose: () => void }> = ({ clientId, onClose }) => {
```

**Return Values:**
- Frontend: Return JSX elements from components
- Backend services: Return objects with `{ success, data }` or `{ error, message }` pattern
- Async functions: Return promises, use async/await syntax

## Module Design

**Exports:**
- Default export for main component/class: `export default ClientDataComponent;`
- Named exports for utilities: `export const logger = { ... };`
- Named exports for types: `export type RootState = ...;`

**Barrel Files:**
- Not extensively used
- Store index exports types: `src/store/index.ts` exports `RootState`, `AppDispatch`

## State Management

**Redux Toolkit:**
- Store configured in `src/store/index.ts`
- RTK Query for API calls via `src/store/api/baseApi.ts`
- Feature slices in `src/store/features/` - `authSlice.ts`, `creditorApi.ts`, etc.
- Use typed hooks from `src/store/hooks.ts` - `useAppDispatch()`, `useAppSelector()`

**React State:**
- `useState` for component-local state
- `useEffect` for side effects and data fetching
- React Hook Form with Zod for form validation (seen in `src/components/AddCreditorForm.tsx`)

## TypeScript Usage

**Compiler Options:**
- `strict: true` - All strict type-checking enabled
- `target: es2020` - Modern JavaScript features
- `jsx: "react-jsx"` - New JSX transform (no React import needed)

**Type Patterns:**
- Interface for component props and data shapes
- Type aliases for union types and complex types
- Enum for log levels: `enum LogLevel { DEBUG = 0, INFO = 1, ... }`
- Avoid `any` where possible (ESLint warns on usage)
- Use type annotations for function parameters: `(error: any)` common pattern

## Server-Side Patterns

**CommonJS Modules:**
- Use `require()` for imports
- Use `module.exports` for exports
- Mongoose schemas for data models at `server/models/`

**Service Classes:**
- Classes with constructor: `class DocumentProcessor { constructor() { ... } }`
- Instance methods for operations
- Instantiate services in `server/server.js`

**Middleware:**
- Express middleware in `server/middleware/`
- Authentication: `authenticateClient`, `authenticateAdmin` in `server/middleware/auth.js`
- Security middleware in `server/middleware/security.js`

---

*Convention analysis: 2026-01-30*
