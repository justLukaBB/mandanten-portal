# Zendesk Integration Setup Guide

## Overview
This integration connects the Mandanten-Portal with Zendesk to automate creditor communications through a professional ticket-based system. Each creditor contact becomes a tracked Zendesk ticket with full audit trail.

## Features
- 🎫 **Automated Ticket Creation**: Each creditor gets a dedicated Zendesk ticket
- 📧 **Professional Email Templates**: Standardized legal communication
- 🔄 **Response Processing**: Automatic debt amount extraction from creditor replies
- 📊 **Full Audit Trail**: Complete communication history in Zendesk
- ⚡ **Real-time Updates**: Webhook integration for instant response processing

## Prerequisites

### 1. Zendesk Account Setup
- Active Zendesk account (trial or paid)
- Admin access to configure custom fields and webhooks
- API access enabled

### 2. Custom Fields Configuration
Create the following custom fields in your Zendesk instance:

**Navigate to:** Admin > Objects and rules > Tickets > Fields

| Field Name | Type | Key | Description |
|------------|------|-----|-------------|
| `Creditor Name` | Text | `creditor_name` | Name of the creditor | 28892969481245
| `Reference Number` | Text | `reference_number` | Creditor's reference number |29010052728733
| `Original Claim Amount` | Number | `original_claim_amount` | Original debt amount from document |29010090630045
| `Current Debt Amount` | Number | `current_debt_amount` | Current debt amount from creditor response |29010081527197
| `Amount Source` | Dropdown | `amount_source` | Source of final amount (creditor_response, original_document, fallback) |29010067871133
| `Client Reference` | Text | `client_reference` | Internal client reference |29010115438877

**Important:** Note down the custom field IDs (e.g., `custom_field_12345`) for your `.env` file.

### 3. API Token Generation
1. Go to **Admin > Apps and integrations > Zendesk API**
2. Enable **Token Access**
3. Generate a new API token
4. Copy the token for your `.env` file oludqO1aMiSTuhsUimWDfXcqTKIdtvcgiEzEhvIC

## Installation & Configuration

### 1. Environment Variables
Copy `.env.example` to `.env` and configure:

```bash
# Zendesk Configuration
ZENDESK_SUBDOMAIN=your-law-firm           # Your Zendesk subdomain
ZENDESK_EMAIL=api@your-law-firm.com       # API user email
ZENDESK_TOKEN=your-zendesk-api-token      # API token from step 3

# Custom Field IDs from step 2
ZENDESK_FIELD_CREDITOR_NAME=custom_field_12345
ZENDESK_FIELD_REFERENCE_NUMBER=custom_field_12346
ZENDESK_FIELD_ORIGINAL_CLAIM_AMOUNT=custom_field_12347
ZENDESK_FIELD_CURRENT_DEBT_AMOUNT=custom_field_12348
ZENDESK_FIELD_AMOUNT_SOURCE=custom_field_12349
ZENDESK_FIELD_CLIENT_REFERENCE=custom_field_12350
```

### 2. Webhook Configuration (Optional)
For automatic response processing, configure a webhook in Zendesk:

1. Go to **Admin > Apps and integrations > Webhooks**
2. Create new webhook with:
   - **Endpoint URL:** `https://your-api-domain.com/api/zendesk-webhook`
   - **Request method:** POST
   - **Authentication:** Bearer token or Basic auth

3. Create triggers for:
   - **Ticket comment created** (for creditor responses)
   - **Ticket status changed** (for status updates)

### 3. Start the Server
```bash
cd server
npm install
npm start
```

The server will start on `http://localhost:3001`

## Usage Workflow

### 1. Manual User Creation Required
**IMPORTANT**: Before starting the creditor contact process, you must manually create a Zendesk user for each client:

1. Go to **Zendesk Admin > People > Customers**
2. Click **Add customer**
3. Fill in:
   - **Name**: Client's full name (e.g., "Max Mustermann")
   - **Email**: Client's email address (e.g., "max.mustermann@example.com")
   - **Role**: End-user
4. Save the user

The system will **search for existing users only** - it will not create new users automatically.

### 2. Client Confirmation Complete
When a client confirms their creditor list (workflow_status = 'completed'), the system is ready for creditor contact.

### 3. Start Creditor Contact Process
**API Endpoint:** `POST /api/clients/{clientId}/start-creditor-contact`

**Admin Dashboard:** Use the "Gläubiger-Kontakt starten" button in the admin interface.

**What happens:**
1. Creates/retrieves Zendesk user for the client
2. Creates individual tickets for each confirmed creditor
3. Sends professional emails through Zendesk
4. Updates internal tracking system

### 3. Monitor Progress
**API Endpoint:** `GET /api/clients/{clientId}/creditor-contact-status`

**Admin Dashboard:** View real-time status in the Zendesk Creditor Contact Manager component.

**Status tracking:**
- `pending`: Initial state
- `ticket_created`: Zendesk ticket created
- `email_sent`: Email sent to creditor
- `responded`: Creditor response received
- `timeout`: No response after 14 days

### 4. Creditor Responses
When creditors reply to emails:
- Responses are automatically threaded in Zendesk tickets
- System extracts debt amounts from responses
- Final debt amounts are calculated and stored
- Ticket status is updated to "solved"

### 5. Final Debt Summary
**API Endpoint:** `GET /api/clients/{clientId}/final-debt-summary`

Provides complete debt overview with:
- Total debt amount
- Per-creditor breakdown
- Response status summary
- Amount source tracking

## Testing

### 1. Test Zendesk Connection
```bash
curl http://localhost:3001/api/admin/test-zendesk
```

### 2. Test with Demo Client
1. Upload and process creditor documents for client `12345`
2. Confirm creditor list in admin panel
3. Start creditor contact process
4. Monitor in Zendesk interface

**Note:** During testing, all emails are sent to `justlukax@gmail.com` instead of actual creditor emails.

### 3. Process Timeout Creditors
```bash
curl -X POST http://localhost:3001/api/admin/process-timeout-creditors \
     -H "Content-Type: application/json" \
     -d '{"timeout_days": 1}'
```

## Email Template

The system generates professional emails with this structure:

```
Subject: Gläubiger-Anfrage: [CREDITOR_NAME] - Az: [REFERENCE_NUMBER]

Sehr geehrte Damen und Herren,

wir vertreten [CLIENT_NAME] in einem Privatinsolvenzverfahren und bitten Sie um Auskunft über die aktuelle Höhe Ihrer Forderung.

📋 MANDANTENDATEN:
• Name: [CLIENT_NAME]
• Ihr Aktenzeichen: [REFERENCE_NUMBER]

📊 BENÖTIGTE INFORMATIONEN:
1. Aktuelle Gesamtforderung (Hauptforderung + Zinsen + Kosten)
2. Detaillierte Aufschlüsselung der Forderungsbestandteile
3. Datum der letzten Zahlung (falls vorhanden)
4. Aktueller Verzugszinssatz (falls anwendbar)

Wir bitten um Übersendung einer aktuellen Forderungsaufstellung bis zum [DEADLINE].

Mit freundlichen Grüßen

Thomas Scuric Rechtsanwälte
Thomas Scuric, Rechtsanwalt
```

## Troubleshooting

### Common Issues

**1. Zendesk Connection Failed**
- Check API credentials in `.env`
- Verify API access is enabled in Zendesk
- Check subdomain spelling

**2. Custom Field Errors**
- Verify custom field IDs in Zendesk admin panel
- Update field IDs in `.env` file
- Ensure fields are of correct type

**3. Webhook Not Working**
- Check webhook URL is publicly accessible
- Verify authentication method
- Check trigger configuration

**4. No Creditors Found**
- Ensure client workflow_status is 'completed'
- Check for confirmed creditor documents
- Verify documents are not marked as duplicates

### Debug Mode
Enable detailed logging:
```javascript
// In zendeskManager.js or creditorContactService.js
console.log('Debug:', response.data);
```

## Security Considerations

- **API Credentials**: Store securely, never commit to version control
- **Webhook Security**: Use authentication for webhook endpoints
- **Test Mode**: Use `justlukax@gmail.com` for testing to prevent accidental emails
- **Access Control**: Limit Zendesk API permissions to necessary functions

## Production Deployment

### 1. Remove Test Email Override
In `zendeskManager.js`, replace:
```javascript
const testEmail = 'justlukax@gmail.com';
```
with:
```javascript
const testEmail = creditorData.creditor_email;
```

### 2. Configure Proper Domain
Update webhook URL to production domain in Zendesk settings.

### 3. Set Up SSL/HTTPS
Ensure all API endpoints are served over HTTPS for security.

### 4. Monitor Performance
- Set up monitoring for webhook endpoints
- Monitor Zendesk API rate limits (700 requests/minute)
- Set up alerting for failed operations

## Support

For technical support or questions about this integration:
1. Check the troubleshooting section above
2. Review Zendesk API documentation
3. Check server logs for detailed error messages
4. Contact system administrator

---

**Last Updated:** January 2025
**Version:** 1.0.0