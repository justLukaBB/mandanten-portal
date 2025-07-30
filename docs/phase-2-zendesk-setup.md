# Phase 2: Zendesk Payment Confirmation Setup

## Overview
When an agent checks the "erste_rate_bezahlt" checkbox on a ticket, it triggers an automatic creditor review process.

## Zendesk Configuration

### 1. Create Ticket Custom Field

**Navigate to:** Admin Center → Objects and rules → Tickets → Fields

**Create new field:**
- Type: `Checkbox`
- Title: `Erste Rate bezahlt`
- Field key: `erste_rate_bezahlt`
- Description: `Mandant hat die erste Rate bezahlt`
- Permissions: Agents can edit

### 2. Create Webhook Target

**Navigate to:** Admin Center → Apps and integrations → Webhooks → Webhooks

**Create new webhook:**
- Name: `Mandanten Portal - Payment Confirmed`
- Endpoint URL: `https://mandanten-portal-backend.onrender.com/api/zendesk-webhook/payment-confirmed`
- Request method: `POST`
- Request format: `JSON`
- Authentication: `None` (handled via rate limiting)

### 3. Create Trigger

**Navigate to:** Admin Center → Objects and rules → Business rules → Triggers

**Create new trigger:**
- Name: `Payment Confirmed - Create Review Ticket`

**Conditions (ALL must be met):**
- Ticket: Is updated
- Ticket: Custom field "erste_rate_bezahlt" → Changes to → Checked

**Actions:**
1. **Notify target:** Mandanten Portal - Payment Confirmed
   
   **JSON body:**
   ```json
   {
     "aktenzeichen": "{{ticket.requester.aktenzeichen}}",
     "zendesk_ticket_id": "{{ticket.id}}",
     "agent_email": "{{current_user.email}}"
   }
   ```

2. **Add tags:** `payment-confirmed`, `ready-for-review`

3. **Add internal note:**
   ```
   ✅ Erste Rate bezahlt - Webhook an Mandanten Portal gesendet.
   
   Nächste Schritte:
   - Automatisches Review-Ticket wird erstellt
   - AI-Analyse der Gläubiger wird überprüft
   - Bei Bedarf manuelle Korrektur erforderlich
   ```

## Workflow After Checkbox

### 1. Automatic Analysis
The webhook response will include:
- Document count
- Creditor count
- Creditors needing manual review (confidence < 80%)
- Review ticket content ready for creation

### 2. Happy Path (No Manual Review Needed)
If all creditors have confidence ≥ 80%:
- Create new ticket with title: `Gläubiger-Review: [Name] - Bereit zur Bestätigung`
- Add tag: `auto-approved`
- Agent can directly send confirmation to client

### 3. Manual Review Path
If any creditor has confidence < 80%:
- Create new ticket with title: `Gläubiger-Review: [Name] - Manuelle Prüfung erforderlich`
- Add tag: `manual-review-needed`
- Ticket includes review dashboard URL
- Agent clicks link to correct AI extractions

## Creating the Review Ticket

After receiving the webhook response, create a new ticket with the API:

```javascript
// Example using Zendesk API
const reviewTicket = {
  ticket: {
    subject: `Gläubiger-Review: ${client_name} (${aktenzeichen})`,
    comment: {
      body: response.review_ticket_content, // From webhook response
      public: false
    },
    requester_id: zendesk_user_id,
    tags: response.manual_review_required 
      ? ['gläubiger-review', 'manual-review-needed']
      : ['gläubiger-review', 'auto-approved'],
    priority: response.manual_review_required ? 'normal' : 'low',
    type: 'task'
  }
};
```

## Testing the Setup

1. Find a ticket where documents have been uploaded
2. Check the "Erste Rate bezahlt" checkbox
3. Verify webhook fires (check logs)
4. Verify new review ticket is created
5. If manual review needed, verify dashboard link works

## Important Notes

- The webhook keeps the original ticket for reference
- A NEW ticket is created for the review process
- The original ticket can be closed after payment confirmation
- The review ticket handles the creditor confirmation flow