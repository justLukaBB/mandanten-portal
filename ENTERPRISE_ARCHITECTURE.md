# Enterprise Document Processing Architecture

## Übersicht

Diese Branch implementiert eine Enterprise-Architektur für das Document Processing System mit Message Queue, Retry-Mechanismen, Monitoring und skalierbarer Architektur.

## Geplante Änderungen

### 1. Message Queue Setup (BullMQ + Redis)
- Queue-basierte Verarbeitung statt direkter FastAPI Calls
- Rate Limiting: Max 2 gleichzeitige Uploads
- Retry Logic mit exponential backoff
- Dead Letter Queue für fehlgeschlagene Jobs

### 2. Upload Flow Refactoring
- Upload-Endpoint erstellt Queue Jobs statt direkter FastAPI Calls
- GCS Upload bleibt in Node.js (wie bisher)
- Sofortige Response (202 Accepted) an Client

### 3. FastAPI Worker
- Worker verarbeitet Queue Jobs
- Handles Retries und Timeouts
- Circuit Breaker für FastAPI Health Checks

### 4. Webhook Enhancement
- Idempotency Checks
- Verbesserte Deduplication Merge Logic
- Creditor Enrichment aus Database

### 5. Monitoring & Observability
- Queue Metrics
- Processing Metrics
- Admin Dashboard für Queue Management

## Architektur

```
Frontend → Node.js (Upload) → GCS → Queue → Worker → FastAPI → Webhook → Node.js
```

## Status

- [ ] Redis Setup
- [ ] BullMQ Integration
- [ ] Queue Worker Implementation
- [ ] Upload Endpoint Refactoring
- [ ] Webhook Enhancement
- [ ] Monitoring Setup

## Siehe auch

- Plan: `/Users/luka.s/.cursor/plans/complete_enterprise_document_processing_flow_with_deduplication_282371b8.plan.md`
