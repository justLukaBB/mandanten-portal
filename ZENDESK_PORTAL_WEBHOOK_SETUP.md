# Zendesk Portal-Link Webhook Setup

## Overview
This document explains how to configure Zendesk to automatically create portal users when the "Portal - Link" macro is used.

## Prerequisites
- Zendesk account with webhook permissions
- Custom field for "Aktenzeichen" created in Zendesk
- Portal server running and accessible from the internet

## Setup Steps

### 1. Create Custom Field for Aktenzeichen

1. Go to **Admin > Objects and rules > Tickets > Fields**
2. Create a new field:
   - **Field type**: Text
   - **Field title**: Aktenzeichen
   - **Field key**: `aktenzeichen`
   - **Required**: Yes
3. Note the field ID (e.g., `custom_field_12345`)  28985782473373

### 2. Configure Environment Variables

Add to your `.env` file:
```bash
ZENDESK_FIELD_AKTENZEICHEN=custom_field_12345  # Replace with your actual field ID
```

### 3. Create the Webhook in Zendesk

1. Go to **Admin > Apps and integrations > Webhooks**
2. Click **Create webhook**
3. Configure:
   - **Name**: Portal User Creation
   - **Endpoint URL**: `https://your-domain.com/api/zendesk-webhook/portal-link`
   - **Request method**: POST
   - **Request format**: JSON
   - **Authentication**: (Configure based on your security requirements)

### 4. Create the Trigger

1. Go to **Admin > Objects and rules > Business rules > Triggers**
2. Click **Add trigger**
3. Configure:

**Trigger title**: Create Portal User on Portal-Link Macro

**Conditions**:
- Ticket: Comment text... Contains the following string: `Portal-Link`
- Ticket: Update via... Is: Web service (API)
- Current user: Is: (Agent)

**Actions**:
- Notify webhook: Portal User Creation
- Webhook body:
```json
{
  "ticket": {
    "id": "{{ticket.id}}",
    "subject": "{{ticket.title}}",
    "custom_fields": [
      {
        "id": YOUR_AKTENZEICHEN_FIELD_ID,
        "value": "{{ticket.custom_field_YOUR_FIELD_ID}}"
      }
    ],
    "external_id": "{{ticket.external_id}}",
    "requester": {
      "id": "{{ticket.requester.id}}",
      "name": "{{ticket.requester.name}}",
      "email": "{{ticket.requester.email}}",
      "phone": "{{ticket.requester.phone}}"
    }
  }
}
```

### 5. Create the Portal-Link Macro

1. Go to **Admin > Workspaces > Agent workspace > Macros**
2. Click **Add macro**
3. Configure:

**Macro name**: Portal - Link

**Actions**:
- Comment/Description:
```
Betreff: Zugang zu Ihrem Mandantenportal – Rechtsanwalt Thomas Scuric

Sehr geehrte/r Frau/Herr {{ticket.requester.last_name}},

ab sofort können Sie Ihr persönliches Mandantenportal nutzen. Dort stellen wir Ihnen alle wichtigen Dokumente und Informationen zu Ihrem Verfahren zur Verfügung.

👉 Bitte laden Sie dort unbedingt auch Ihre Unterlagen hoch.
Dazu gehören insbesondere:
• Mahnungen und Mahnbescheide
• Schreiben von Inkassobüros
• unbezahlte Rechnungen
• anwaltliche Zahlungsaufforderungen
• gerichtliche Schreiben

⚠️ WICHTIG: Bitte laden Sie ALLE Dokumente hoch, in denen Geld von Ihnen gefordert wird.

Falls Sie keine Unterlagen vorliegen haben, können Sie uns alternativ eine einfache Gläubigerliste zur Verfügung stellen (z. B. auf einem Zettel oder in einer Datei). Bitte geben Sie jeweils Name und Anschrift des Gläubigers an. Haben Sie kein Aktenzeichen, notieren Sie bitte Ihr Geburtsdatum zur Zuordnung.

👉 So geht's:
1. Klicken Sie auf folgenden Link: https://portal.kanzlei.de/login [Jetzt Zugang aktivieren]
2. Legen Sie Ihr persönliches Passwort fest.
3. Laden Sie anschließend Ihre Unterlagen direkt im Portal hoch.

Der Link ist 14 Tage gültig. Sollten Sie ihn in dieser Zeit nicht nutzen, können Sie jederzeit über die Funktion „Passwort vergessen" einen neuen Link anfordern.

Mit freundlichen Grüßen
Rechtsanwalt Thomas Scuric
— Kanzlei für Insolvenzrecht
```

- Set ticket status: Pending
- Add tags: `portal-link-sent`, `phase-onboarding`

## Testing

### 1. Test the Webhook Endpoint
```bash
curl -X POST https://your-domain.com/api/zendesk-webhook/portal-link \
  -H "Content-Type: application/json" \
  -d '{
    "ticket": {
      "id": "12345",
      "subject": "Test Ticket",
      "custom_fields": [
        {
          "id": 12345,
          "value": "MAND_2024_TEST"
        }
      ],
      "requester": {
        "id": "67890",
        "name": "Test User",
        "email": "test@example.com"
      }
    }
  }'
```

### 2. Test in Zendesk
1. Create a test ticket
2. Set the Aktenzeichen field
3. Apply the "Portal - Link" macro
4. Check server logs for webhook receipt
5. Verify user creation in the database

## Portal User Flow

When the webhook is triggered:

1. **User Creation**: A new user is created in the system with:
   - Client ID based on Aktenzeichen
   - Email from Zendesk requester
   - Name parsed from Zendesk
   - Unique portal token
   - Portal link generation

2. **Zendesk Update**: The webhook adds an internal comment to the ticket with:
   - Confirmation of portal creation
   - Portal link
   - Client details

3. **Client Login**: The client can now:
   - Navigate to `/login`
   - Enter their email and Aktenzeichen
   - Access their personal portal
   - Upload creditor documents

## Security Considerations

1. **Webhook Authentication**: 
   - Use webhook signatures or API tokens
   - Validate the source IP is from Zendesk

2. **Data Validation**:
   - Validate all input data
   - Sanitize Aktenzeichen format
   - Verify email format

3. **Session Security**:
   - Use secure session tokens
   - Implement session expiration
   - Use HTTPS only

## Troubleshooting

### Webhook Not Firing
- Check trigger conditions
- Verify webhook is active
- Check Zendesk webhook logs

### User Not Created
- Check server logs for errors
- Verify Aktenzeichen field is populated
- Ensure requester has valid email

### Login Issues
- Verify portal link in email
- Check case sensitivity of Aktenzeichen
- Ensure portal_link_sent flag is set

## Production Checklist

- [ ] SSL certificate configured
- [ ] Webhook authentication enabled
- [ ] Error logging configured
- [ ] Database backup strategy
- [ ] Session management configured
- [ ] Rate limiting implemented
- [ ] Monitoring alerts set up