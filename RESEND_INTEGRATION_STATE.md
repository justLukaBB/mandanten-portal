# Resend Integration - Session State

## Datum: 2026-02-08

## Was wurde gemacht

### 1. Neue Dateien erstellt

#### `/server/services/creditorEmailService.js` (NEU)
- Resend SDK Integration für Gläubiger-E-Mails
- `sendFirstRoundEmail()` - Erstschreiben an Gläubiger
- `sendSecondRoundEmail()` - Schuldenbereinigungsplan
- HTML Templates für beide Runden
- Absender: `office@scuric.de`
- Pattern von `emailService.js` übernommen

### 2. Geänderte Dateien

#### `/server/config/index.js`
```javascript
// Neue Zeilen hinzugefügt:
RESEND_CREDITOR_FROM_EMAIL: process.env.RESEND_CREDITOR_FROM_EMAIL || 'office@scuric.de',
RESEND_CREDITOR_FROM_NAME: process.env.RESEND_CREDITOR_FROM_NAME || 'Thomas Scuric Rechtsanwälte',
```

#### `/server/services/creditorContactService.js`
- Import: `const creditorEmailService = require('./creditorEmailService');`
- `sendFirstRoundEmailsWithDocuments()` geändert:
  - Nutzt jetzt `creditorEmailService.sendFirstRoundEmail()` statt Zendesk Side Conversations
  - Fügt Zendesk interne Notiz für Audit-Trail hinzu
  - MongoDB speichert `resend_email_id` statt `side_conversation_id`

#### `/server/services/secondRoundEmailSender.js`
- Import: `const creditorEmailService = require('./creditorEmailService');`
- `sendIndividualCreditorEmail()` geändert:
  - Nutzt jetzt `creditorEmailService.sendSecondRoundEmail()` statt Zendesk Side Conversations
  - Fügt Zendesk interne Notiz für Audit-Trail hinzu

#### `/server/services/sync_inquiry_to_matcher.js`
- Neue Felder im Sync-Payload:
  ```javascript
  resend_email_id: creditor.resend_email_id || null,
  email_provider: creditor.email_provider || 'zendesk',
  ```
- Skip-Condition erweitert um `resend_email_id` Check

### 3. Python API Änderungen (NEW AI Creditor Answer Analysis)

#### `/app/models/creditor_inquiry.py`
- Neue Spalten hinzugefügt:
  ```python
  resend_email_id = Column(String(100), nullable=True, index=True)
  email_provider = Column(String(20), default="zendesk")  # 'zendesk' or 'resend'
  ```

## NOCH ZU TUN

### 1. Alembic Migration erstellen (Python API)
```bash
cd /Users/luka.s/NEW\ AI\ Creditor\ Answer\ Analysis
alembic revision --autogenerate -m "add resend_email_id and email_provider to creditor_inquiries"
alembic upgrade head
```

### 2. Branch & Commits

#### mandanten-portal (Node.js)
Aktueller Branch: `feat/update-creditor-email`
Letzte Änderungen: Resend Integration noch NICHT committed!

Zu committen:
```bash
cd /Users/luka.s/mandanten-portal
git add server/services/creditorEmailService.js \
        server/services/creditorContactService.js \
        server/services/secondRoundEmailSender.js \
        server/services/sync_inquiry_to_matcher.js \
        server/config/index.js
git commit -m "feat: replace Zendesk Side Conversations with Resend for creditor emails

- Add creditorEmailService.js for sending emails via Resend from office@scuric.de
- Modify creditorContactService.js to use Resend for first round emails
- Modify secondRoundEmailSender.js to use Resend for second round emails
- Add Zendesk internal notes for audit trail
- Update sync_inquiry_to_matcher.js to include resend_email_id
- Store resend_email_id instead of side_conversation_id in MongoDB"
```

#### NEW AI Creditor Answer Analysis (Python)
Aktueller Branch: `feat/domain-email-matching`
Änderung: `app/models/creditor_inquiry.py` - Neue Spalten

Zu committen:
```bash
cd /Users/luka.s/NEW\ AI\ Creditor\ Answer\ Analysis
git add app/models/creditor_inquiry.py
git commit -m "feat: add resend_email_id and email_provider columns to creditor_inquiries"
```

## Flow-Übersicht (Neu)

```
Gläubiger bestätigt
  → creditorContactService.sendFirstRoundEmailsWithDocuments()
    → creditorEmailService.sendFirstRoundEmail()  → Resend API (von office@scuric.de)
    → zendesk.addTicketComment()                  → Interne Notiz im Ticket
    → MongoDB Update (resend_email_id, email_provider: 'resend')
    → syncInquiryToMatcher()                      → PostgreSQL (mit resend_email_id)
```

## Wichtige Dateipfade

| Datei | Zweck |
|-------|-------|
| `/Users/luka.s/mandanten-portal/server/services/creditorEmailService.js` | Neuer Resend E-Mail Service |
| `/Users/luka.s/mandanten-portal/server/services/creditorContactService.js` | 1. Runde E-Mails |
| `/Users/luka.s/mandanten-portal/server/services/secondRoundEmailSender.js` | 2. Runde E-Mails |
| `/Users/luka.s/mandanten-portal/server/services/sync_inquiry_to_matcher.js` | PostgreSQL Sync |
| `/Users/luka.s/NEW AI Creditor Answer Analysis/app/models/creditor_inquiry.py` | PostgreSQL Model |

## Git Status

### mandanten-portal
```
Modified: server/config/index.js
Modified: server/services/creditorContactService.js
Modified: server/services/secondRoundEmailSender.js
Modified: server/services/sync_inquiry_to_matcher.js
New file: server/services/creditorEmailService.js
```

### NEW AI Creditor Answer Analysis
```
Modified: app/models/creditor_inquiry.py
```
