# Testing Patterns

**Analysis Date:** 2026-01-30

## Test Framework

**Runner:**
- Jest (via react-scripts)
- Config: Built into `react-scripts` (no custom `jest.config.js` detected)
- Version: Determined by react-scripts 5.0.1

**Assertion Library:**
- Jest built-in matchers
- `@testing-library/jest-dom` ^5.16.4 for DOM assertions

**Run Commands:**
```bash
npm test                # Run tests in watch mode
npm test -- --coverage  # Run with coverage
```

## Test File Organization

**Location:**
- No test files found in `src/` directory
- Testing libraries installed but tests not yet implemented
- Expected pattern: Co-located with source files based on CRA conventions

**Naming:**
- Expected: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`
- Expected: `__tests__/` directories for test collections

**Structure:**
```
src/
  components/
    ClientDataComponent.tsx
    ClientDataComponent.test.tsx  # Expected location
  utils/
    logger.ts
    logger.test.ts                # Expected location
```

## Test Structure

**Suite Organization:**
Based on installed libraries and CRA conventions, expected pattern:

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComponentName from './ComponentName';

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const user = userEvent.setup();
    render(<ComponentName />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

**Patterns:**
- Use `describe()` for grouping related tests
- Use `it()` or `test()` for individual test cases
- Setup: Render components before assertions
- Cleanup: Automatic cleanup via `@testing-library/react`

## Mocking

**Framework:** Jest built-in mocking

**Patterns:**
Expected patterns based on installed libraries:

```typescript
// Mock API calls
jest.mock('../config/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

// Mock Redux store
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mockStore = configureStore({
  reducer: { /* test reducers */ },
});

// In tests:
render(
  <Provider store={mockStore}>
    <Component />
  </Provider>
);
```

**What to Mock:**
- External API calls (axios, fetch)
- Browser APIs (localStorage, sessionStorage)
- Third-party services (document processors, image handlers)
- Redux store for isolated component tests

**What NOT to Mock:**
- Internal utilities (test actual implementation)
- React hooks (use actual implementation)
- Simple pure functions

## Fixtures and Factories

**Test Data:**
Server-side test data service exists at `server/services/testDataService.js`:

```javascript
class TestDataService {
  constructor() {
    this.financialProfiles = null;
    this.creditorResponses = null;
    // Loads test data from JSON files
  }

  getFinancialProfile(profileId) {
    // Returns test financial profiles
  }

  runFinancialProfileTests() {
    // Validates financial calculations
  }
}
```

**Location:**
- Test data directory: `/test-data/` (exists at root)
- Expected pattern for frontend: Create fixtures in `__fixtures__/` or `test-utils/`

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
npm test -- --coverage
```

**Configuration:**
- Coverage configuration inherited from react-scripts defaults
- Typical thresholds: Not configured

## Test Types

**Unit Tests:**
- Expected for utilities in `src/utils/`
- Expected for individual components
- Expected for Redux slices and selectors
- Not currently implemented

**Integration Tests:**
- Expected for component interactions
- Expected for RTK Query endpoints
- Expected for form workflows
- Not currently implemented

**E2E Tests:**
- Framework: Not configured
- No Cypress, Playwright, or Selenium detected
- Not implemented

## Common Patterns

**Async Testing:**
Expected pattern with React Testing Library:

```typescript
it('should load data asynchronously', async () => {
  render(<Component />);

  // Wait for element to appear
  const element = await screen.findByText('Loaded Data');
  expect(element).toBeInTheDocument();
});
```

**Error Testing:**
Expected pattern:

```typescript
it('should handle errors gracefully', async () => {
  // Mock API to throw error
  jest.spyOn(api, 'get').mockRejectedValue(new Error('API Error'));

  render(<Component />);

  // Verify error message displayed
  const errorMsg = await screen.findByText(/error/i);
  expect(errorMsg).toBeInTheDocument();
});
```

## Testing Libraries Present

**Installed:**
- `@testing-library/react` ^13.3.0 - Component testing utilities
- `@testing-library/user-event` ^13.5.0 - User interaction simulation
- `@testing-library/jest-dom` ^5.16.4 - Custom DOM matchers
- `@types/jest` ^27.5.2 - TypeScript types for Jest

**Available Utilities:**
- `render()` - Render components for testing
- `screen` - Query rendered output
- `userEvent` - Simulate user interactions
- `waitFor()` - Wait for async changes
- `fireEvent()` - Low-level event triggering
- Custom matchers: `toBeInTheDocument()`, `toHaveTextContent()`, etc.

## ESLint Test Configuration

From `.eslintrc.js`:

```javascript
{
  // Test files
  files: ['**/*.test.{js,jsx,ts,tsx}', '**/__tests__/**/*.{js,jsx,ts,tsx}'],
  env: {
    jest: true,
  },
  rules: {
    'no-console': 'off', // Allow console in tests
  },
}
```

## Current State

**Test Coverage:**
- Zero test files found in `src/` directory
- Testing infrastructure fully installed
- Ready for test implementation

**Next Steps:**
- Create test files for critical utilities (`src/utils/logger.ts`)
- Add component tests for key components (`ClientDataComponent`, `AddCreditorForm`)
- Test Redux slices and RTK Query endpoints
- Configure coverage thresholds

**Server-Side Testing:**
- `testDataService.js` provides financial calculation validation
- No Jest/Mocha configuration detected for server tests
- Server testing infrastructure not set up

---

*Testing analysis: 2026-01-30*
