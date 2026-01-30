# Codebase Concerns

**Analysis Date:** 2026-01-30

## Tech Debt

**Hardcoded Admin Credentials:**
- Issue: Admin authentication relies on environment variables without proper user management system
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/controllers/adminAuthController.js:15-18`
- Impact: No admin user management, password rotation, or multi-admin support. Security risk if credentials are compromised.
- Fix approach: Implement proper admin user model with bcrypt password hashing, role-based access control, and database-backed authentication

**Hardcoded Database Credentials in Fallback:**
- Issue: MongoDB connection string with credentials hardcoded as fallback value
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js:9`
- Impact: Production credentials could be exposed in version control or if .env fails to load
- Fix approach: Remove hardcoded credentials, fail fast if MONGODB_URI not set in production

**Hardcoded JWT Secret Fallback:**
- Issue: JWT secret has insecure default value 'your-super-secret-jwt-key-change-in-production'
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/server.js:14`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js:6`
- Impact: All tokens can be forged if default secret is used
- Fix approach: Make JWT_SECRET required in production, validate on startup

**Missing Gender Detection:**
- Issue: Salutation defaults to "Herr" without proper gender detection from client data
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/wordTemplateProcessor.js:422-423`
- Impact: Incorrect salutation in generated legal documents (professional/legal concern)
- Fix approach: Add gender field to client model, implement salutation detection from name or add explicit field in client onboarding

**Auto-Generated PDF Checkbox Configuration:**
- Issue: 6,541 line configuration file with generic checkbox names like "Kontrollkästchen 1", "Kontrollkästchen 2"
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/pdf-checkbox-config.js`
- Impact: Unmaintainable mapping between PDF form fields and application logic, high risk of mapping errors
- Fix approach: Create semantic checkbox naming system, refactor to data-driven configuration with validation

**Excessive Console Logging:**
- Issue: 6,153 console.log/error/warn statements across 275 files instead of proper logging framework
- Files: Widespread across entire codebase (detected via grep)
- Impact: No log levels, no log filtering, performance overhead in production, difficult to debug
- Fix approach: Consolidate to existing logger utilities (`/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/logger.js`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/src/utils/logger.ts`), enforce via linting

**Large Service Files:**
- Issue: Multiple service files exceed 1,000 lines indicating complex, tangled responsibilities
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/documentGenerator.js:3398`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/creditorContactService.js:2013`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/zendeskManager.js:1938`
- Impact: Difficult to test, maintain, and reason about. High coupling risk.
- Fix approach: Extract smaller, focused services following Single Responsibility Principle

## Known Bugs

**Settlement Race Condition (Partially Fixed):**
- Symptoms: Settlement tracking fields overwritten during processing-complete webhook
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/SETTLEMENT_RACE_CONDITION_FIX.md`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/routes/zendesk-webhooks.js:1118-1202`
- Trigger: Webhook loads fresh client, modifies, and saves without preserving concurrent settlement updates
- Workaround: Quick fix preserves settlement fields before save (documented in SETTLEMENT_RACE_CONDITION_FIX.md)
- Complete Fix: Use safeClientUpdate() for atomic read-modify-write operations to prevent all race conditions

**FastAPI Connection Failures:**
- Symptoms: Connection timeouts, 429 rate limit errors from Google AI Studio, fetch failures
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/fastApiClient.js`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/.cursor/plans/fix_vertex_ai_429_rate_limit_errors_ca816644.plan.md`
- Trigger: Cold starts, API rate limits (15 RPM free tier), concurrent request overload
- Current mitigation: Retry logic with exponential backoff, circuit breaker, rate limiting (FASTAPI_MAX_CONCURRENT_REQUESTS=2, FASTAPI_RATE_LIMIT_REQUESTS_PER_MINUTE=12)
- Recommendations: Monitor 429 error rates, implement adaptive throttling based on error rate threshold (10%), respect Retry-After headers

**Document Processing Queue Race Conditions:**
- Symptoms: Duplicate job IDs, concurrent updates to same client
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/webhookQueueService.js:73-75`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/documentQueueService.js:137`
- Trigger: Concurrent webhook processing, duplicate webhook deliveries
- Current mitigation: Atomic findOneAndUpdate for job claiming, duplicate key error handling
- Test coverage: Gaps in concurrent webhook scenarios

## Security Considerations

**Missing Environment Variable Validation:**
- Risk: Application starts with missing critical API keys, fails at runtime instead of startup
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js:56-59`
- Current mitigation: Partial validation function exists but incomplete
- Recommendations: Add comprehensive startup validation for all required env vars (ANTHROPIC_API_KEY, GOOGLE_CLOUD_PROJECT_ID, ZENDESK_TOKEN, RESEND_API_KEY)

**Exposed Credentials in Config Defaults:**
- Risk: MongoDB credentials, admin passwords in fallback values could leak to logs or version control
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js:9`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/.env.example:2-3`
- Current mitigation: .env.example exists but contains placeholder text
- Recommendations: Remove all credential defaults, use environment-specific config files, implement secrets management

**Weak Agent Creation Key Default:**
- Risk: Agent accounts can be created if AGENT_CREATION_KEY not set
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/config/index.js:53`
- Current mitigation: Default value 'change-me-in-production' is weak but flags issue
- Recommendations: Require AGENT_CREATION_KEY in production, validate strength

**File Upload Without Virus Scanning:**
- Risk: Malicious file uploads could compromise system or users
- Files: Upload handling in `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/middleware/upload.js:3`
- Current mitigation: File type restrictions (pdf, jpg, jpeg, png, doc, docx), 10MB size limit
- Recommendations: Add virus scanning (ClamAV), content validation beyond extension checking

## Performance Bottlenecks

**Document Processing Timeout:**
- Problem: 20-minute FastAPI timeout indicates long-running document processing operations
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/fastApiClient.js:21`
- Cause: Synchronous AI processing, large document processing, API rate limits causing retries
- Improvement path: Move to async job queue with webhook callbacks, implement streaming responses, add progress tracking

**GCS Download Concurrency Issues:**
- Problem: Google Cloud Storage downloads timing out or failing under load
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/.cursor/plans/enterprise_gcs_download_optimization_c833abbe.plan.md`
- Cause: Unlimited concurrent downloads, connection pool exhaustion, missing retry logic
- Improvement path: Implement download manager with semaphore-based concurrency control (max 5 parallel), connection pooling, intelligent retry with exponential backoff

**Rate Limiting on Free-Tier AI:**
- Problem: Google AI Studio free tier limited to 15 RPM causes frequent 429 errors
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/fastApiClient.js:40-48`
- Cause: Using free-tier Gemini API with 15 requests/minute limit
- Current mitigation: Client-side rate limiting to 12 RPM with token bucket algorithm
- Improvement path: Upgrade to paid tier for higher limits, implement request batching, cache AI responses for duplicate requests

**Excessive Logging Overhead:**
- Problem: 6,153 console.log calls across codebase create I/O overhead
- Files: Widespread (grep found 275 files)
- Cause: Debug logging left in production code
- Improvement path: Use conditional logging based on LOG_LEVEL, remove debug logs from hot paths, implement async logging

## Fragile Areas

**Webhook Verification:**
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/webhookVerifier.js:31`
- Why fragile: Webhook signature validation critical for security, any changes to Zendesk API break integration
- Safe modification: Always test with Zendesk webhook test tool, maintain backward compatibility
- Test coverage: Gaps in signature validation edge cases

**Creditor Deduplication Logic:**
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/utils/creditorDeduplication.js:17`, `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/controllers/webhookController.js:9-10`
- Why fragile: Complex multi-field matching with confidence thresholds (0.8), manual review requirements
- Safe modification: Document all deduplication rules, add comprehensive unit tests for edge cases, version the deduplication algorithm
- Test coverage: Gaps in multi-creditor document splitting scenarios

**PDF Form Field Mapping:**
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/pdf-checkbox-config.js:6541`
- Why fragile: 6,541 lines of auto-generated checkbox mappings with non-semantic names
- Safe modification: Never edit manually, regenerate from PDF template analysis, validate mappings with test cases
- Test coverage: Gaps in checkbox mapping validation

**Client Model Schema Evolution:**
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/Client.js:17026`
- Why fragile: Large schema (17K lines) with many optional fields for legacy data compatibility
- Safe modification: Use Mongoose migrations, test with production data snapshots, maintain backward compatibility
- Test coverage: Gaps in legacy data migration scenarios

**Document Status Workflow:**
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/models/Client.js:23-27`
- Why fragile: Complex state machine with 6 processing statuses and 8 document statuses
- Safe modification: Document all valid state transitions, validate state changes, add state machine diagram
- Test coverage: Gaps in invalid state transition handling

## Scaling Limits

**MongoDB Connection Pooling:**
- Current capacity: Default Mongoose connection pool
- Limit: Will exhaust connections under high concurrent load
- Scaling path: Configure connection pool size, implement connection monitoring, consider MongoDB Atlas auto-scaling

**Single-Threaded Node.js Processing:**
- Current capacity: Single Node.js process per server instance
- Limit: CPU-bound operations (PDF processing, document generation) block event loop
- Scaling path: Implement worker threads for CPU-intensive tasks, scale horizontally with load balancer, move to serverless functions for document processing

**FastAPI Rate Limiting:**
- Current capacity: 12 requests/minute to Google AI Studio (conservative limit to avoid 429s)
- Limit: 15 RPM on free tier, blocks during high-volume document uploads
- Scaling path: Upgrade to Google AI paid tier, implement request queuing with priority, cache AI results

**File Storage:**
- Current capacity: Google Cloud Storage for document uploads
- Limit: Cost scales with storage and bandwidth
- Scaling path: Implement lifecycle policies to archive old documents, compress documents, use CDN for frequently accessed files

## Dependencies at Risk

**docx Package Optional Loading:**
- Risk: Document generation silently fails if docx package not installed
- Files: `/Users/luka.s/Cursor : Mandanten - Portal/mandanten-portal/server/services/documentGenerator.js:4-10`
- Impact: Generated documents are core functionality
- Migration plan: Make docx a required dependency, fail at startup if missing, add health check endpoint

**pdf-lib Version Pinning:**
- Risk: PDF manipulation library at 1.17.1, potential security vulnerabilities in older versions
- Files: `package.json:24`, `server/package.json:32`
- Impact: PDF form filling is critical for insolvency applications
- Migration plan: Audit for security updates, test thoroughly before upgrading due to API changes

**React Scripts 5.0.1:**
- Risk: Uses older Create React App, no longer actively maintained
- Files: `package.json:31`
- Impact: Missing modern React features, security updates, build optimizations
- Migration plan: Migrate to Vite or Next.js for better performance and ongoing support

**Multiple Deprecated Dependencies:**
- Risk: mongoose@8.0.0, axios@1.10.0 may have known vulnerabilities
- Files: `server/package.json:30`, `server/package.json:15`
- Impact: Security vulnerabilities, compatibility issues
- Migration plan: Run npm audit, update to latest stable versions with thorough testing

## Missing Critical Features

**Comprehensive Error Monitoring:**
- Problem: No centralized error tracking (Sentry, Rollbar, etc.)
- Blocks: Production debugging, error trend analysis, user impact assessment
- Priority: High - Essential for production operations

**Backup and Disaster Recovery:**
- Problem: No documented backup strategy for MongoDB, no disaster recovery plan
- Blocks: Business continuity, data loss prevention
- Priority: High - Critical for data protection

**API Documentation:**
- Problem: No OpenAPI/Swagger documentation for backend APIs
- Blocks: Frontend development efficiency, API versioning, third-party integrations
- Priority: Medium - Reduces development friction

**Feature Flags:**
- Problem: No feature flag system for gradual rollouts
- Blocks: Safe deployment of new features, A/B testing, quick rollback
- Priority: Medium - Enables safer deployments

**Audit Logging:**
- Problem: No comprehensive audit trail for admin actions, data modifications
- Blocks: Compliance requirements, security investigations, data lineage tracking
- Priority: Medium - Important for compliance and security

## Test Coverage Gaps

**No Unit Tests:**
- What's not tested: Core business logic in services, utilities, controllers
- Files: Entire codebase (no .test.ts or .spec.ts files found in src/ or server/)
- Risk: Regression bugs go undetected, refactoring is risky
- Priority: High - Critical for code quality

**No Integration Tests:**
- What's not tested: API endpoints, webhook handling, database operations
- Files: All routes in `server/routes/`, all controllers in `server/controllers/`
- Risk: End-to-end workflows can break without detection
- Priority: High - Essential for deployment confidence

**No E2E Tests:**
- What's not tested: User workflows (login, document upload, creditor confirmation)
- Files: Frontend pages in `src/pages/`, `src/admin/pages/`, `src/agent/pages/`
- Risk: UI breaks, user experience degradation
- Priority: Medium - Important for user-facing features

**Test Scripts in Production Dependencies:**
- What's not tested: scripts/tests/ directory contains test files but no test framework configured
- Files: `scripts/tests/test-*.js` (45+ test files)
- Risk: Tests may be outdated or not running in CI/CD
- Priority: Medium - Need to integrate with proper test runner

**Race Condition Testing:**
- What's not tested: Concurrent webhook processing, simultaneous client updates
- Files: `server/services/webhookQueueService.js`, `server/controllers/webhookController.js`
- Risk: Race conditions only surface in production under load
- Priority: High - Known area of concern

---

*Concerns audit: 2026-01-30*
