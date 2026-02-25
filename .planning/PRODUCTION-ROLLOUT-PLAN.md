# Production Rollout Plan

> **Datum:** 25.02.2026
> **Ziel:** Alle 3 Services auf GitHub pushen und auf Render.com live bringen
> **Platform:** Render.com (alle Services)

---

## Übersicht — 3 Services

| # | Service | Repo | Stack | Port | Status |
|---|---------|------|-------|------|--------|
| 1 | **Mandanten Portal** | `justLukaBB/mandanten-portal` | Node.js/Express + Vite/React | 10000 | Branch 73 Commits ahead → Squash Merge PR |
| 2 | **Creditor Email Matcher** | `justLukaBB/creditor-email-matcher` | FastAPI + PostgreSQL + Dramatiq | $PORT | Bug-Fixes uncommitted → Commit + PR |
| 3 | **Creditor Enrichment Service** | `justLukaBB/creditor-enrichment-service` *(NEU)* | FastAPI + Redis | 8001 | Kein Repo → Initial Commit + Push |

### Abhängigkeiten zwischen den Services

```
Portal (Node.js)
  ├── ruft auf: Enrichment Service (POST /api/v1/enrich-creditor)
  ├── ruft auf: Matcher (POST /api/v1/inquiries)
  └── empfängt: Matcher Webhook (POST /api/webhooks/matcher-response)

Matcher (FastAPI)
  ├── empfängt: Resend Inbound Webhooks
  ├── empfängt: Zendesk Webhooks
  ├── schreibt: MongoDB (gleiche DB wie Portal)
  └── ruft auf: Portal Webhook

Enrichment (FastAPI)
  ├── empfängt: Portal Requests
  ├── nutzt: Google Places API, Serper, Gemini
  └── cached: Redis (eigener Redis)
```

---

## Deployment-Reihenfolge

```
Phase 1: Git aufräumen (lokal)
Phase 2: Enrichment Service → GitHub + Render
Phase 3: Email Matcher → Bug-Fix PR + Render Redeploy
Phase 4: Mandanten Portal → Squash Merge PR + Render Redeploy
Phase 5: Integration testen
Phase 6: DNS / Frontend Deployment
```

---

## Phase 1 — Git aufräumen (alle 3 Repos lokal)

### 1.1 Mandanten Portal — Branch vorbereiten

```bash
cd "/Users/luka.s/Migration Mandanten Portal"

# Prüfen ob .env NICHT committed wird
grep -q "^server/.env$" .gitignore || echo "server/.env" >> .gitignore

# Sicherstellen dass generierte Dokumente nicht im Repo landen
grep -q "server/generated_documents/" .gitignore || echo "server/generated_documents/" >> .gitignore

# Planning-Docs und Scripts staged?
git add .gitignore
git status
```

**ACHTUNG:** `server/.env` enthält Production-Secrets (MongoDB URI, API Keys). Darf NIEMALS committed werden. Prüfe ob es in `.gitignore` steht.

### 1.2 Creditor Email Matcher — Fixes committen

```bash
cd "/Users/luka.s/creditor-email-matcher"

# __pycache__ in .gitignore sicherstellen
echo "__pycache__/" >> .gitignore
echo "*.pyc" >> .gitignore
echo ".env" >> .gitignore

# Alle Fixes committen
git add .gitignore
git add app/actors/email_processor.py
git add app/config.py
git add app/routers/inquiries.py
git add app/services/dual_write.py
git add app/services/matching/strategies.py
git add app/services/matching_engine_v2.py
git add app/services/mongodb_client.py
git add app/services/portal_notifier.py

git commit -m "fix: matching pipeline - dedup, scoring, gap calculation, mongodb db name

- Fix duplicate inquiries: normalize 'Last, First' → 'First Last' for dedup
- Fix false ambiguity: skip gap check when top-2 share same creditor_email
- Fix score cap: raise name-only multiplier from 0.7 → 0.85
- Fix MongoDB database: use correct 'test' db instead of 'mandanten_portal'
- Add portal_notifier service for webhook callbacks"

git push origin feat/domain-email-matching
```

### 1.3 Creditor Enrichment Service — Repo erstellen

```bash
cd "/Users/luka.s/creditor-enrichment-service"

# .gitignore prüfen/erstellen
cat .gitignore
# Sollte enthalten: .env, .venv/, __pycache__/, *.pyc, .DS_Store, service-account.json

# Git initialisieren (falls nötig)
git init
git add .gitignore
git commit -m "chore: initial gitignore"

git add app/ tests/ requirements.txt Dockerfile docker-compose.yml .env.example SECURITY-AUDIT.md
git commit -m "feat: creditor enrichment service with source cascade

FastAPI microservice for automatic creditor data enrichment.
Sources: Google Places → Impressum Scraper → Handelsregister
Cache: Redis (30d positive, 7d negative)
LLM: Gemini 2.0 Flash for structured extraction"

# GitHub Repo erstellen
gh repo create justLukaBB/creditor-enrichment-service --private --source=. --remote=origin --push
```

**WICHTIG:** `service-account.json` und `.env` NICHT committen!

---

## Phase 2 — Enrichment Service auf Render deployen

### 2.1 Render Service erstellen

Auf [Render Dashboard](https://dashboard.render.com):

1. **New → Web Service**
2. Connect GitHub repo: `justLukaBB/creditor-enrichment-service`
3. Settings:

| Setting | Wert |
|---------|------|
| Name | `creditor-enrichment-service` |
| Region | Frankfurt (EU Central) |
| Branch | `main` |
| Runtime | Docker |
| Plan | Starter ($7/mo) |
| Health Check Path | `/health/ready` |

### 2.2 Render Redis erstellen

1. **New → Redis**
2. Settings:

| Setting | Wert |
|---------|------|
| Name | `enrichment-redis` |
| Region | Frankfurt |
| Plan | Starter (25MB, $7/mo) |
| Max Memory Policy | `allkeys-lru` |

→ Render gibt dir eine **Internal Redis URL**: `redis://red-xxxx:6379`

### 2.3 Environment Variables auf Render setzen

| Variable | Wert | Quelle |
|----------|------|--------|
| `PORT` | `8001` | Render setzt das automatisch |
| `ENVIRONMENT` | `production` | |
| `ENRICHMENT_API_KEY` | `openssl rand -hex 32` generieren | Neu erstellen |
| `REDIS_URL` | Internal Redis URL von Render | Aus Schritt 2.2 |
| `GOOGLE_PLACES_API_KEY` | Bestehender Key | Aus lokaler .env |
| `SERPER_API_KEY` | Bestehender Key | Aus lokaler .env |
| `USE_VERTEX_AI` | `true` | |
| `GOOGLE_CLOUD_PROJECT_ID` | `gen-lang-client-0997028989` | Aus lokaler .env |
| `GOOGLE_CLOUD_LOCATION` | `europe-west1` | |
| `LLM_MODEL` | `gemini-2.0-flash` | |
| `LOG_LEVEL` | `info` | |
| `CACHE_TTL_DAYS` | `30` | |
| `NEGATIVE_CACHE_TTL_DAYS` | `7` | |

**WICHTIG — Google Service Account auf Render:**
- Render kann keine Datei-Credentials laden (`GOOGLE_APPLICATION_CREDENTIALS` geht nicht)
- Option A: Service Account JSON als Base64 in Env-Var → App dekodiert es beim Start
- Option B: Auf Gemini API Key umstellen statt Vertex AI (`USE_VERTEX_AI=false`, `GEMINI_API_KEY=...`)
- **Empfehlung: Option B** — einfacher, kein Service Account nötig

Wenn Option B:
```
USE_VERTEX_AI=false
GEMINI_API_KEY=<dein-gemini-api-key>
```

### 2.4 Verifizieren

```bash
# Nach Deploy auf Render:
curl https://creditor-enrichment-service.onrender.com/health/ready
# Erwartung: {"ready": true}
```

---

## Phase 3 — Email Matcher Bug-Fixes live bringen

### 3.1 PR erstellen

```bash
cd "/Users/luka.s/creditor-email-matcher"

gh pr create \
  --title "fix: matching pipeline - dedup, scoring, gap, db name" \
  --body "$(cat <<'EOF'
## Summary
- Fix duplicate inquiries: normalize 'Last, First' → 'First Last' for dedup
- Fix false ambiguity: skip gap check when top-2 share same creditor_email
- Fix score cap: raise name-only multiplier from 0.7 → 0.85
- Fix MongoDB database: use correct db name instead of default
- Add portal_notifier service

## Impact
Creditor responses that previously always landed in needs_review will now
auto-match when email domain + name match with high confidence.

## Test Plan
- [ ] Verify inquiry dedup rejects "Last, First" duplicates (409 Conflict)
- [ ] Verify auto-match threshold reached for email+name matches
- [ ] Verify MongoDB updates hit correct database
- [ ] Monitor first 10 incoming emails for correct matching behavior

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Nach Review:
gh pr merge --squash
```

### 3.2 Render Redeploy

Render redeployed automatisch nach Merge auf `main`.

Falls nicht:
- Dashboard → `creditor-email-matcher` → Manual Deploy → Deploy latest commit

### 3.3 Matcher Environment Variables prüfen

Stelle sicher dass diese Vars auf Render gesetzt sind:

| Variable | Wert |
|----------|------|
| `PORTAL_WEBHOOK_URL` | `https://mandanten-portal-backend.onrender.com/api/webhooks/matcher-response` |
| `PORTAL_WEBHOOK_SECRET` | `61f0d91a254d...` (gleicher Secret wie im Portal) |
| `MONGODB_URL` | MongoDB Atlas Connection String (gleiche DB wie Portal) |
| `ANTHROPIC_API_KEY` | Claude API Key |
| `RESEND_API_KEY` | Resend Key |
| `DATABASE_URL` | PostgreSQL Connection String |

---

## Phase 4 — Mandanten Portal Squash Merge + Redeploy

### 4.1 Branch aufräumen

```bash
cd "/Users/luka.s/Migration Mandanten Portal"

# Prüfe was alles in den PR geht
git diff origin/main --stat
# → 553 files changed, 56k insertions, 35k deletions

# Untracked Files die NICHT committed werden sollen:
#   server/.env             → Secrets!
#   server/generated_documents/  → Runtime-Output
#   .claude/                → Lokale Claude Config
#   *.docx in root          → Temporäre Dateien
```

### 4.2 Was muss committed werden

**JA (committed):**
- `server/` — Alle Controller, Services, Models, Routes, Utils Änderungen
- `server/controllers/matcherWebhookController.js` — Neuer Controller
- `server/services/leineweberService.js` — Neuer Service
- `server/utils/enrichmentClient.js` — Neuer Client
- `server/scripts/` — Backfill und Fix-Scripts
- `server/templates/1.Schreiben.docx` — Aktualisiertes Template
- `src/` — Legacy Frontend Änderungen (Admin, Agent, Pages)
- `MandantenPortalDesign/` — Submodule Update
- `.planning/` — Dokumentation (optional aber empfohlen)
- `CLAUDE.md` — Projekt-Regeln

**NEIN (nicht committed):**
- `server/.env` → in .gitignore
- `server/generated_documents/` → in .gitignore
- `creditor-enrichment-blueprint.docx` → temporär
- `Start-Session-Design.md` → temporär
- `.claude/` → lokale Config

### 4.3 PR erstellen

```bash
cd "/Users/luka.s/Migration Mandanten Portal"

# Sicherstellen dass alles staged ist
git add -A  # ACHTUNG: Prüfe vorher dass .gitignore korrekt ist!
git status  # Review was staged wird

git commit -m "feat: v7 - webhook fields, settlement tracking, creditor enrichment

Major feature release including:
- Creditor enrichment integration (auto-research missing data)
- Matcher webhook receiver (creditor response processing)
- Settlement plan tracking & financial data
- Admin dashboard improvements
- Agent portal redirect to admin
- Document generation updates
- Review flow improvements
- Leineweber DB integration"

git push origin feat/v7-fastapi-webhook-fields-and-settlement

# PR erstellen
gh pr create \
  --title "feat: v7 - webhook fields, settlement, creditor enrichment" \
  --body "$(cat <<'EOF'
## Summary
Major release bringing together:
- Creditor enrichment service integration (auto-fills missing contact data)
- Matcher webhook receiver (processes creditor email responses)
- Settlement plan tracking and financial data management
- Admin dashboard and review flow improvements
- Agent portal → admin portal redirect
- Leineweber database integration
- Document template updates

## Services Affected
- **Portal Backend** — New controllers, services, routes
- **Portal Frontend** — Admin UI, agent redirect, review pages
- **Enrichment Service** — New integration via enrichmentClient.js
- **Email Matcher** — New webhook receiver (matcherWebhookController.js)

## Environment Variables Required
New vars to add on Render:
- `ENRICHMENT_SERVICE_URL` — URL of enrichment service on Render
- `ENRICHMENT_API_KEY` — Same key as set on enrichment service
- `ENRICHMENT_ENABLED` — `true`
- `MATCHER_API_URL` — Already set
- `WEBHOOK_SECRET` — Already set

## Test Plan
- [ ] Health check passes: /api/health/detailed
- [ ] Enrichment circuit breaker responds correctly when service is down
- [ ] Matcher webhook creates status_history entries
- [ ] Admin dashboard loads with new features
- [ ] Document generation works with updated template

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Squash Merge
gh pr merge --squash
```

### 4.4 Render Environment Variables aktualisieren

**Neue Vars auf Portal Backend hinzufügen:**

| Variable | Wert |
|----------|------|
| `ENRICHMENT_SERVICE_URL` | `https://creditor-enrichment-service.onrender.com` |
| `ENRICHMENT_API_KEY` | Gleicher Key wie in Phase 2.3 generiert |
| `ENRICHMENT_ENABLED` | `true` |
| `MATCHER_API_URL` | `https://creditor-email-matcher.onrender.com` |

**Bestehende Vars prüfen (sollten schon gesetzt sein):**

| Variable | Wert |
|----------|------|
| `MONGODB_URI` | MongoDB Atlas URI |
| `JWT_SECRET` | Secret |
| `ANTHROPIC_API_KEY` | Claude Key |
| `RESEND_API_KEY` | Resend Key |
| `GCS_KEY_BASE64` | Google Cloud Storage Service Account |
| `GCS_PROJECT_ID` | `automationscuric` |
| `GOOGLE_CLOUD_PROJECT_ID` | Document AI Project |
| `GOOGLE_DOCUMENT_AI_PROCESSOR_ID` | Processor ID |
| `ZENDESK_DOMAIN` | `scuric.zendesk.com` |
| `ZENDESK_API_TOKEN` | Zendesk Token |
| `WEBHOOK_SECRET` | Webhook HMAC Secret |

### 4.5 Render Redeploy

Automatisch nach Merge auf `main`. Falls nicht: Manual Deploy.

---

## Phase 5 — Integration testen

### 5.1 Health Checks (alle 3 Services)

```bash
# Portal Backend
curl https://mandanten-portal-backend.onrender.com/api/health/detailed
# → Erwartung: { status: "healthy", database: "connected", ... }

# Enrichment Service
curl https://creditor-enrichment-service.onrender.com/health/ready
# → Erwartung: { ready: true }

# Email Matcher
curl https://creditor-email-matcher.onrender.com/
# → Erwartung: 200 OK
```

### 5.2 Service-zu-Service Kommunikation

```bash
# Test: Portal → Enrichment (mit API Key)
curl -X POST https://creditor-enrichment-service.onrender.com/api/v1/enrich-creditor \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <ENRICHMENT_API_KEY>" \
  -d '{
    "creditor_name": "Deutsche Telekom AG",
    "known_data": {},
    "missing_fields": ["email", "address", "phone"],
    "case_id": "test_001"
  }'
# → Erwartung: { status: "complete"|"partial", enriched_data: {...} }
```

### 5.3 End-to-End Flow testen

1. **Enrichment Flow:**
   - Mandant mit fehlendem Gläubiger-Kontakt anlegen
   - Portal sollte automatisch Enrichment Service aufrufen
   - Prüfe: Kontaktdaten werden befüllt

2. **Matcher Flow:**
   - E-Mail an Creditor senden (über Portal)
   - Prüfe: Inquiry wird im Matcher erstellt
   - Simuliere Creditor-Antwort
   - Prüfe: Webhook kommt im Portal an, Status-History aktualisiert

### 5.4 Monitoring nach Go-Live

| Was prüfen | Wo | Wie oft |
|------------|-----|---------|
| Service Health | Render Dashboard | Alle 5 min (auto) |
| Error Logs | Render Logs | Erste 24h manuell |
| MongoDB Connections | Atlas Dashboard | Nach Deploy |
| Enrichment Cache Hit Rate | Enrichment Logs | Nach 1 Woche |
| Matcher Auto-Match Rate | Matcher Logs | Nach ersten 10 Emails |

---

## Phase 6 — Frontend Deployment

### 6.1 Aktueller Stand

| Frontend | Build | Deploy |
|----------|-------|--------|
| Legacy CRA (`/src/`) | `npm run build` → `/build/` | Render Static Site |
| Neues Design (`/MandantenPortalDesign/`) | `npm run build` → `/dist/` | **Noch nicht auf Render** |

### 6.2 Neues Frontend auf Render deployen

**Option A — Als Teil des Portal Repos (empfohlen):**

Render Static Site konfigurieren:

| Setting | Wert |
|---------|------|
| Name | `rasolv-admin` |
| Root Directory | `MandantenPortalDesign` |
| Build Command | `npm install && npm run build` |
| Publish Path | `dist` |
| Routes | `/*` → `/index.html` (SPA) |

**Environment Variables:**
| Variable | Wert |
|----------|------|
| `VITE_API_BASE_URL` | `https://mandanten-portal-backend.onrender.com` |
| `VITE_SOCKET_URL` | `https://mandanten-portal-backend.onrender.com` |

**Option B — Eigenes Repo:**
Falls MandantenPortalDesign ein eigenes Repo bekommt, separaten Static Site erstellen.

### 6.3 Legacy Frontend

Das alte CRA Frontend (`/src/`) bleibt vorerst auf Render als `mandanten-portal-frontend` für bestehende Client-Logins.

---

## Kosten-Übersicht (Render)

| Service | Typ | Plan | Kosten/Monat |
|---------|-----|------|-------------|
| Portal Backend | Web Service | Starter | $7 |
| Portal Frontend (Legacy) | Static Site | Free | $0 |
| Portal Frontend (Neu) | Static Site | Free | $0 |
| Email Matcher API | Web Service | Starter | $7 |
| Email Matcher Worker | Background Worker | Starter | $7 |
| Enrichment Service | Web Service | Starter | $7 |
| Enrichment Redis | Redis | Starter | $7 |
| Matcher PostgreSQL | PostgreSQL | Free/Starter | $0–$7 |
| **Gesamt** | | | **$35–$42/mo** |

> **Hinweis:** Render Starter Services schlafen nach 15min Inaktivität ein (Cold Start ~30s). Für Always-On: Standard Plan ($25/Service).

---

## Checkliste — Vor dem Go-Live

### Git
- [ ] `.gitignore` in allen 3 Repos korrekt (keine Secrets, kein __pycache__)
- [ ] Enrichment Service: GitHub Repo erstellt, Initial Commit gepusht
- [ ] Email Matcher: Bug-Fix Branch committed und gepusht
- [ ] Email Matcher: PR erstellt und gemergt
- [ ] Mandanten Portal: Feature Branch committed und gepusht
- [ ] Mandanten Portal: PR erstellt und squash-gemergt

### Render — Enrichment Service
- [ ] Web Service erstellt (Docker)
- [ ] Redis Instance erstellt
- [ ] Alle Env Vars gesetzt (inkl. ENRICHMENT_API_KEY)
- [ ] Gemini Auth konfiguriert (API Key oder Service Account)
- [ ] Health Check: `/health/ready` → `{ ready: true }`

### Render — Email Matcher
- [ ] Redeploy nach Merge ausgelöst
- [ ] PORTAL_WEBHOOK_URL korrekt gesetzt
- [ ] MONGODB_URL zeigt auf richtige DB (`test`)
- [ ] Health Check: `/` → 200 OK

### Render — Mandanten Portal
- [ ] Redeploy nach Squash Merge ausgelöst
- [ ] ENRICHMENT_SERVICE_URL gesetzt
- [ ] ENRICHMENT_API_KEY gesetzt (gleicher Key wie beim Service)
- [ ] Health Check: `/api/health/detailed` → healthy

### Integration
- [ ] Portal → Enrichment: API Call erfolgreich
- [ ] Portal → Matcher: Inquiry Sync erfolgreich
- [ ] Matcher → Portal: Webhook kommt an
- [ ] Resend → Matcher: Inbound Email verarbeitet
- [ ] MongoDB: Alle 3 Services verbinden auf gleiche DB

### Frontend
- [ ] Neues Frontend deployed oder Plan steht
- [ ] VITE_API_BASE_URL korrekt
- [ ] SPA Routing funktioniert (alle Routes → index.html)

---

## Rollback-Plan

Falls nach Deployment Probleme auftreten:

### Service-Level Rollback
```bash
# Render: Vorheriges Deployment wiederherstellen
# Dashboard → Service → Deploys → Revert to previous deploy
```

### Enrichment Service isolieren
```bash
# Im Portal: Enrichment deaktivieren ohne Redeploy
# Render → Portal Backend → Env Vars → ENRICHMENT_ENABLED = false
# → Service restart, Enrichment wird übersprungen
```

### Matcher auf alten Stand
```bash
# Revert Merge auf GitHub
gh pr list --state merged
git revert <merge-commit-hash>
git push origin main
# Render redeployed automatisch
```

---

## Zeitplan (geschätzt)

| Phase | Was | Dauer |
|-------|-----|-------|
| 1 | Git aufräumen (alle 3 Repos) | 30 min |
| 2 | Enrichment → GitHub + Render | 45 min |
| 3 | Matcher PR + Merge + Redeploy | 20 min |
| 4 | Portal PR + Squash Merge + Redeploy | 30 min |
| 5 | Integration testen | 30 min |
| 6 | Frontend Config | 20 min |
| **Gesamt** | | **~3h** |
