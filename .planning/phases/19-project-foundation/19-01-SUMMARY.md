---
phase: 19-project-foundation
plan: 01
subsystem: ui
tags: [vite, react, typescript, tailwind, redux, rtk-query]

# Dependency graph
requires: []
provides:
  - Vite dev server starts cleanly with npm run dev
  - TypeScript configured (relaxed strict=false for Figma-generated code)
  - React/react-dom moved to real dependencies (not peerDeps)
  - @reduxjs/toolkit and react-redux installed for RTK Query in plan 19-03
  - Vite proxy for /api/* -> localhost:3001 configured
  - VITE_API_BASE_URL environment variable documented
  - figma:asset import replaced with @/assets alias
affects: [20-authentication, 19-02, 19-03]

# Tech tracking
tech-stack:
  added: [typescript@5.4, @reduxjs/toolkit@2.2, react-redux@9.1, @types/react, @types/react-dom]
  patterns: [Vite proxy for API in dev, @/* path alias for src, relaxed TS config for Figma-gen code]

key-files:
  created:
    - MandantenPortalDesign/tsconfig.json
    - MandantenPortalDesign/tsconfig.node.json
    - MandantenPortalDesign/.env.example
    - MandantenPortalDesign/.env.development
    - MandantenPortalDesign/.gitignore
    - MandantenPortalDesign/src/vite-env.d.ts
  modified:
    - MandantenPortalDesign/package.json
    - MandantenPortalDesign/vite.config.ts
    - MandantenPortalDesign/src/app/components/sidebar.tsx
    - MandantenPortalDesign/index.html

key-decisions:
  - "Package renamed from @figma/my-make-file to rasolv-admin per project naming decision"
  - "TypeScript strict=false to accommodate Figma-generated code with implicit anys"
  - "Vite proxy for /api/* -> localhost:3001 avoids CORS in dev; VITE_API_BASE_URL empty in dev"
  - "tsconfig.node.json uses composite=true (required for project references)"
  - ".gitignore added to MandantenPortalDesign to prevent committing node_modules/env files"

patterns-established:
  - "Vite proxy pattern: /api calls proxied to backend port 3001, no CORS issues in dev"
  - "PNG/image imports declared in src/vite-env.d.ts with module type declaration"
  - "@/* alias maps to src/* for clean imports throughout the app"

requirements-completed: [SETUP-01]

# Metrics
duration: 7min
completed: 2026-02-18
---

# Phase 19 Plan 01: Project Foundation — Vite Setup Summary

**Figma prototype reconfigured as a proper TypeScript Vite project with react/react-dom in dependencies, RTK Query packages installed, dev proxy to backend port 3001, and all Figma-specific imports replaced**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-02-18T21:13:46Z
- **Completed:** 2026-02-18T21:20:15Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- package.json renamed to rasolv-admin, react/react-dom promoted from peerDependencies to dependencies, Redux packages added
- TypeScript fully configured with relaxed settings appropriate for Figma-generated code (no blocking errors)
- Vite dev server starts cleanly at localhost:5173 and serves the existing app UI
- figma:asset protocol import replaced with standard @/assets path alias
- Vite proxy configured for /api/* -> localhost:3001, eliminating CORS issues in development

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix package.json, add tsconfig, configure environment variables** - `c703131` (chore)
2. **Task 2: Configure Vite proxy and fix Figma-specific imports** - `4fa2286` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `MandantenPortalDesign/package.json` - Renamed package, moved react/react-dom to deps, added Redux packages, added preview/typecheck scripts
- `MandantenPortalDesign/tsconfig.json` - TypeScript config with bundler module resolution, strict=false, @/* paths alias
- `MandantenPortalDesign/tsconfig.node.json` - Vite config TS config with composite=true for project references
- `MandantenPortalDesign/.env.example` - Documents VITE_API_BASE_URL
- `MandantenPortalDesign/.env.development` - Dev env (empty VITE_API_BASE_URL, uses Vite proxy)
- `MandantenPortalDesign/.gitignore` - Excludes node_modules, dist, env files
- `MandantenPortalDesign/index.html` - Title updated to "Rasolv Admin"
- `MandantenPortalDesign/vite.config.ts` - Added server.proxy for /api/* -> localhost:3001
- `MandantenPortalDesign/src/app/components/sidebar.tsx` - figma:asset import replaced with @/assets alias
- `MandantenPortalDesign/src/vite-env.d.ts` - Vite client types + PNG/image module declarations

## Decisions Made
- Package name `rasolv-admin` as per user decision in plan
- TypeScript `strict: false` to accommodate Figma-generated code that has implicit anys and loose types
- `tsconfig.node.json` uses `composite: true` instead of `noEmit: true` — required by TypeScript project references
- `.gitignore` added as auto-fix (Rule 2) since MandantenPortalDesign had its own nested git repo with no gitignore
- `src/vite-env.d.ts` added (Rule 2) to provide PNG type declarations needed for TypeScript to resolve image imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tsconfig.node.json project reference incompatibility**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** tsconfig.node.json had `noEmit: true` but was referenced as a project reference, which requires `composite: true` and disallows `noEmit`
- **Fix:** Set `composite: true` and removed `noEmit: true` from tsconfig.node.json
- **Files modified:** MandantenPortalDesign/tsconfig.node.json
- **Verification:** `npx tsc --noEmit` passed without the TS6306/TS6310 errors
- **Committed in:** c703131 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added .gitignore to MandantenPortalDesign**
- **Found during:** Task 1 (commit preparation)
- **Issue:** MandantenPortalDesign has its own nested git repo with no .gitignore — node_modules would be committed
- **Fix:** Created .gitignore excluding node_modules/, dist/, .env files, tsbuildinfo
- **Files modified:** MandantenPortalDesign/.gitignore
- **Verification:** Git status correctly shows only source files as untracked after adding gitignore
- **Committed in:** c703131 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Added src/vite-env.d.ts with image type declarations**
- **Found during:** Task 2 (TypeScript check after fixing sidebar.tsx)
- **Issue:** TypeScript error TS2307 — cannot find module '@/assets/*.png' because no type declaration for PNG modules
- **Fix:** Created src/vite-env.d.ts with vite/client reference and PNG/image module declarations
- **Files modified:** MandantenPortalDesign/src/vite-env.d.ts
- **Verification:** `npx tsc --noEmit` completes with zero errors
- **Committed in:** 4fa2286 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. tsconfig fix required for TS project references. gitignore prevents accidental large commits. PNG declarations enable TypeScript to understand asset imports. No scope creep.

## Issues Encountered
- MandantenPortalDesign has its own nested git repo (separate from root project repo). All commits were made within the nested repo at MandantenPortalDesign/.git.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Vite dev server is ready: `cd MandantenPortalDesign && npm run dev`
- TypeScript configured with zero errors
- Redux/RTK Query packages installed and ready for plan 19-03
- Vite proxy ready to forward /api/* calls to backend on port 3001
- No blockers for plan 19-02 (route structure) or 19-03 (API integration)

---
*Phase: 19-project-foundation*
*Completed: 2026-02-18*
