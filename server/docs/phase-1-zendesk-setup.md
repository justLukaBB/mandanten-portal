# Phase 1: Zendesk Portal User Creation Setup

## Overview
When an agent uses the "Portal-Link senden" macro, it automatically creates a user in the Mandanten Portal system.

## Zendesk Configuration

### 1. Create Custom Field for Aktenzeichen

**Navigate to:** Admin Center → Objects and rules → Tickets → Fields

**Create new field:**
- Type: `Text`
- Title: `Aktenzeichen`
- Field key: `aktenzeichen`
- Description: `Eindeutige Mandanten-ID (z.B. MAND_2025_001)`
- Permissions: Agents can edit

**IMPORTANT:** Note down the field ID (e.g., `ticket_field_29010052728733`) - you'll need this for the webhook.

### 2. Create Webhook Target

**Navigate to:** Admin Center → Apps and integrations → Webhooks → Webhooks

**Create new webhook:**
- Name: `Mandanten Portal - Portal Link Sent`
- Endpoint URL: `https://mandanten-portal-backend.onrender.com/api/zendesk-webhook/portal-link-sent`
- Request method: `POST`
- Request format: `JSON`
- Authentication: `None` (handled via rate limiting)

### 3. Create Macro "Portal-Link senden"

**Navigate to:** Admin Center → Workspaces → Agent workspace → Macros

**Create new macro:**
- Name: `Portal-Link senden`
- Available for: All agents
- Actions to perform:

1. **Notify target:** Mandanten Portal - Portal Link Sent
   
   **JSON body:**
   ```json
   {
     "ticket": {
       "id": "{{ticket.id}}",
       "subject": "{{ticket.title}}",
       "external_id": "{{ticket.external_id}}",
       "requester": {
         "id": "{{ticket.requester.id}}",
         "name": "{{ticket.requester.name}}",
         "email": "{{ticket.requester.email}}",
         "phone": "{{ticket.requester.phone}}",
         "aktenzeichen": "{{ticket.ticket_field_29010052728733}}"
       }
     }
   }
   ```
   
   **Note:** Replace `ticket_field_29010052728733` with your actual Aktenzeichen field ID.

2. **Add tags:** `portal-link-sent`, `mandant-created`

3. **Set ticket status:** Pending

4. **Add comment:**
   ```
   Portal-Zugang wurde erstellt und an {{ticket.requester.email}} gesendet.
   
   Aktenzeichen: {{ticket.ticket_field_29010052728733}}
   
   Der Mandant kann sich jetzt unter https://mandanten-portal.onrender.com/login anmelden.
   ```

## Workflow

### 1. Agent Preparation
Before using the macro, the agent must:
1. Ensure the ticket has a requester with valid email
2. Fill in the Aktenzeichen custom field (e.g., MAND_2025_001)
3. Verify requester name is in format "Firstname Lastname"

### 2. Using the Macro
1. Open the ticket
2. Click "Apply macro" → "Portal-Link senden"
3. The macro will:
   - Send webhook to create user
   - Add tracking tags
   - Update ticket with confirmation

### 3. What Happens in the Backend
The webhook will:
1. Create a new user in the database (or update if exists)
2. Generate a unique portal token
3. Set status to "portal_access_sent"
4. Return success confirmation

### 4. Expected Response
```json
{
  "success": true,
  "message": "Portal access configured",
  "client_id": "uuid-here",
  "aktenzeichen": "MAND_2025_001",
  "portal_status": "active",
  "next_step": "Client should receive portal access email"
}
```

## Testing

1. Create a test ticket with:
   - Valid requester email
   - Aktenzeichen filled in (e.g., TEST_2025_001)
   - Requester name in "Firstname Lastname" format

2. Apply the "Portal-Link senden" macro

3. Check:
   - Webhook fires successfully
   - Tags are added to ticket
   - Comment is added
   - Backend creates user (check logs)

## Important Notes

- The Aktenzeichen MUST be unique across all clients
- The webhook expects the name in "Firstname Lastname" format
- If a user already exists with the same email or Aktenzeichen, it will be updated
- The portal token is generated automatically and stored securely

## Email Template (Optional)

After the webhook succeeds, you may want to send an email to the client with their portal access. This can be done via:
1. Zendesk trigger based on the `portal-link-sent` tag
2. Or manually by the agent
3. Or automatically from the backend (if email service is configured)