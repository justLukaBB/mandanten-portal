# Project Milestones: Mandanten Portal — Creditor Processing

## v1 Manual Review & Payment Status Flow Fix (Shipped: 2026-01-30)

**Delivered:** Fixed the creditor review status flow so the payment handler respects `needs_manual_review` flags and deduplication runs immediately after document processing, ensuring creditors flagged for review actually go through agent review.

**Phases completed:** 1-2 (4 plans total)

**Key accomplishments:**

- Converted dedup scheduler from 30-minute delay to immediate event-driven execution with atomic MongoDB guards
- Preserved manual review flags during AI deduplication in both scheduler and admin-triggered paths
- Added payment handler dedup coordination — polls dedup_in_progress flag before evaluating creditors
- Payment handler now checks creditor.needs_manual_review flag and routes to creditor_review
- Added name validation and empty creditor list guard to payment handler

**Stats:**

- 7 files created/modified
- 2 phases, 4 plans, 7 tasks
- 1 day from start to ship (2026-01-30)

**Git range:** `6639579` → `b032aca`

---

## v2 Robust Dedup (Shipped: 2026-02-01)

**Delivered:** Rebuilt deduplication to handle large creditor lists reliably. LLM identifies duplicate groups only (minimal tokens), merging happens deterministically in Python code. Retry + flag on failure prevents silent duplicate pass-through.

**Phases completed:** 3-6 (7 plans total)

**Key accomplishments:**

- LLM prompt optimization: minimal payload to avoid token limits
- Code-based merge logic: deterministic creditor merging after LLM identifies groups
- Failure handling: retry once, flag for manual review on repeated failure
- Path consistency: admin manual trigger and auto pipeline use identical logic

**Stats:**

- 4 phases, 7 plans
- Shipped 2026-02-01

---

## v2.1 Aktenzeichen Display Fix (Shipped: 2026-02-02)

**Delivered:** First Anschreiben Word template displays empty string instead of "N/A" for missing Aktenzeichen.

**Phases completed:** 7 (1 plan)

**Key accomplishments:**

- Applied isUsableValue filter to Aktenzeichen fallback chain
- Consistent with existing Creditor and Address field patterns

**Stats:**

- 1 phase, 1 plan
- Shipped 2026-02-02

---

## v2.2 Resend Email Attachments (Shipped: 2026-02-09)

**Delivered:** Replaced Zendesk Side Conversations with Resend for creditor emails. Emails now include PDF attachments instead of links. Sent emails auto-synced to creditor-email-matcher.

**Phases completed:** Branch `feat/resend-email-attachments`

**Key accomplishments:**

- Replaced Zendesk Side Conversations with Resend SDK v6
- Creditor emails redesigned with PDF attachments instead of download links
- Auto-sync of sent emails to creditor-email-matcher
- getClientName supports camelCase fields

**Stats:**

- Shipped 2026-02-09

---
