# Creditor Email Contact Flow - Developer Documentation

## Overview
This document explains the complete flow from when a user confirms the creditor list to when emails are sent via Zendesk Side Conversations. **IMPORTANT: The system now intelligently chooses between creditor and representative emails.**

## Flow Diagram

```
User Confirms Creditor List
          ↓
[POST] /api/clients/:clientId/confirm-creditors
          ↓
clientCreditorController.confirmCreditors() [Line 113]
          ↓
Updates client status to 'creditor_contact_initiated'
          ↓
Calls creditorContactService.processClientCreditorConfirmation()
          ↓
Gets confirmed creditors via getConfirmedCreditorsForClient()
          ↓
🔥 CRITICAL LOGIC: Determine which email to use
          ↓
Creates Zendesk Side Conversations with selected email
          ↓
Starts monitoring for responses
```

## Key Files & Functions

### 1. **Controller: Client Confirmation**
**File:** `server/controllers/clientCreditorController.js`
**Function:** `confirmCreditors()` (Line 113)

**What it does:**
- Validates client status is `awaiting_client_confirmation`
- Updates client status to `creditor_contact_initiated`
- Triggers automatic creditor contact
- Starts Side Conversation monitoring

**Code snippet:**
```javascript
// Line 165
creditorContactResult = await this.creditorContactService
    .processClientCreditorConfirmation(client.aktenzeichen);
```

---

### 2. **Service: Creditor Contact Processing**
**File:** `server/services/creditorContactService.js`
**Function:** `processClientCreditorConfirmation()` (Line 36)

**What it does:**
- Fetches client data from MongoDB
- Tests Zendesk connection
- Gets all confirmed creditors
- Creates main Zendesk ticket
- Sends Side Conversation emails to each creditor/representative

---

### 3. **Service: Get Confirmed Creditors**
**File:** `server/services/creditorContactService.js`
**Function:** `getConfirmedCreditorsForClient()` (Line 275)

## 🔥 CRITICAL UPDATE: Representative Email Logic

### Problem Solved
Previously, the system **always** used `sender_email` field, which could be the wrong email when dealing with representatives (e.g., lawyers, debt collectors).

### Solution Implemented
The system now checks the `is_representative` flag and uses the appropriate email:

#### Decision Logic (Lines 348-382):

```javascript
if (creditor.is_representative) {
    // Representative case: Use representative's email
    emailToUse = creditor.email_glaeubiger_vertreter || creditor.sender_email;
    nameToUse = creditor.glaeubigervertreter_name || creditor.sender_name;
    addressToUse = creditor.glaeubigervertreter_adresse || creditor.sender_address;

    // Example: Lawyer representing a bank
    // - Sends email to: lawyer@lawfirm.com
    // - Name used: "Rechtsanwalt Müller"
    // - Actual creditor tracked: "Deutsche Bank"
} else {
    // Direct creditor case: Use creditor's email
    emailToUse = creditor.email_glaeubiger || creditor.sender_email;

    // Example: Direct creditor
    // - Sends email to: info@creditor.com
    // - Name used: "ABC GmbH"
}
```

### Data Structure

Each creditor in `final_creditor_list` has these fields:

| Field | Description | Example |
|-------|-------------|---------|
| `sender_name` | Name from document header | "Rechtsanwalt Müller" |
| `sender_email` | Email from document (fallback) | "contact@lawfirm.com" |
| `sender_address` | Address from document | "Bahnhofstr. 1, Berlin" |
| `is_representative` | Boolean flag | `true` |
| `actual_creditor` | Real creditor name | "Deutsche Bank AG" |
| `email_glaeubiger` | Direct creditor email | "service@deutschebank.de" |
| `email_glaeubiger_vertreter` | Representative email | "mueller@lawfirm.com" |
| `glaeubiger_name` | Creditor name | "Deutsche Bank AG" |
| `glaeubigervertreter_name` | Representative name | "Rechtsanwalt Müller" |
| `glaeubigervertreter_adresse` | Representative address | "Kanzlei Müller, Berlin" |

---

### 4. **Service: Send Side Conversation Emails**
**File:** `server/services/creditorContactService.js`
**Function:** `sendFirstRoundEmailsWithDocuments()` (Line 563)

**What it does:**
- Filters creditors with valid emails (now considers representative emails!)
- Creates individual Side Conversation for each creditor/representative
- Attaches relevant documents to each conversation
- Tracks manual contacts (those without any email)

**Email sending (Line 638):**
```javascript
const creditorData = {
    creditor_name: contactRecord.creditor_name,  // Resolved name (rep or direct)
    creditor_email: contactRecord.creditor_email, // Resolved email (rep or direct)
    creditor_address: contactRecord.creditor_address, // Resolved address
    // ... other fields
};
```

---

## Example Scenarios

### Scenario 1: Direct Creditor
```json
{
  "sender_name": "Vodafone GmbH",
  "sender_email": "info@vodafone.de",
  "email_glaeubiger": "service@vodafone.de",
  "is_representative": false
}
```
**Result:** Email sent to `service@vodafone.de` (email_glaeubiger)

---

### Scenario 2: Representative (Lawyer)
```json
{
  "sender_name": "Kanzlei Müller",
  "sender_email": "info@mueller-recht.de",
  "is_representative": true,
  "actual_creditor": "Sparkasse Hamburg",
  "email_glaeubiger": "service@sparkasse-hamburg.de",
  "email_glaeubiger_vertreter": "mueller@mueller-recht.de",
  "glaeubigervertreter_name": "Rechtsanwalt Müller"
}
```
**Result:** Email sent to `mueller@mueller-recht.de` (representative's email)

---

### Scenario 3: Representative (Debt Collector)
```json
{
  "sender_name": "EOS Deutschland GmbH",
  "sender_email": "contact@eos-deutschland.de",
  "is_representative": true,
  "actual_creditor": "Telekom Deutschland GmbH",
  "email_glaeubiger_vertreter": "forderungen@eos-deutschland.de"
}
```
**Result:** Email sent to `forderungen@eos-deutschland.de` (debt collector's email)

---

## Zendesk Side Conversations

### What are Side Conversations?
Side Conversations are Zendesk's feature for having separate email threads within a main ticket. Think of them as "sub-tickets" that allow communication with external parties (creditors/representatives) while keeping everything organized under one main ticket.

### How They Work:
1. **Main Ticket**: Created for the client in Zendesk
2. **Side Conversation**: One per creditor/representative
   - Has its own email thread
   - Attached to main ticket for context
   - Monitored independently for responses

### Monitoring Flow:
**File:** `server/services/sideConversationMonitor.js`

After emails are sent, the system:
1. Waits 2 seconds for Side Conversations to be created
2. Fetches all Side Conversations for the main ticket
3. Stores conversation IDs in MongoDB
4. Periodically checks for new messages
5. Updates creditor `contact_status` based on responses

---

## Database Updates

### Client Model Updates
**File:** `server/models/Client.js`

When creditors are confirmed, the following updates occur:

```javascript
client.client_confirmed_creditors = true;
client.client_confirmed_at = new Date();
client.current_status = 'creditor_contact_initiated';

// Each creditor in final_creditor_list gets:
creditor.contact_status = 'email_sent' | 'responded' | 'no_response' | 'no_email_manual_contact';
creditor.side_conversation_id = '<zendesk_side_conv_id>';
creditor.contacted_at = new Date();
```

---

## Debugging & Logging

### Key Log Messages:

**Creditor Filtering:**
```
🔍 Total creditors in final_creditor_list: 15
🔍 Creditor 1: {
  name: "Rechtsanwalt Müller",
  is_representative: true,
  representative_email: "mueller@lawfirm.com",
  creditor_email: "service@bank.de",
  email_to_use: "mueller@lawfirm.com",  ← THE CHOSEN EMAIL
  willBeIncluded: true
}
```

**Representative Detection:**
```
📧 Representative detected: Rechtsanwalt Müller representing Deutsche Bank
   Using email: mueller@lawfirm.com
```

**Direct Creditor:**
```
📧 Direct creditor: Vodafone GmbH, email: service@vodafone.de
```

**Email Sending:**
```
📧 Creating Side Conversation 1/10 for Rechtsanwalt Müller with document...
✅ Side Conversation created: sc_abc123
```

---

## Error Handling

### No Email Available
If neither representative email nor creditor email exists:
```javascript
needs_manual_contact: true
contact_status: 'no_email_manual_contact'
```

Admin will see these creditors flagged for manual processing.

### Failed Email Send
If Side Conversation creation fails:
- Error logged with creditor details
- Creditor marked with failed status
- Admin notified via internal comment

---

## Testing the Flow

### Manual Test Steps:

1. **Create test client with confirmed creditors**
2. **Set one creditor as representative:**
   ```javascript
   {
     is_representative: true,
     email_glaeubiger_vertreter: "test-rep@example.com"
   }
   ```
3. **Trigger confirmation:**
   ```bash
   POST /api/clients/:clientId/confirm-creditors
   ```
4. **Check logs for:**
   - `📧 Representative detected`
   - `Using email: test-rep@example.com`
5. **Verify in Zendesk:**
   - Main ticket created
   - Side Conversation email sent to representative

---

## Configuration

### Required Environment Variables:
```bash
# Zendesk
ZENDESK_EMAIL=your-email@domain.com
ZENDESK_SUBDOMAIN=your-subdomain
ZENDESK_TOKEN=your-api-token

# MongoDB
MONGODB_URI=mongodb+srv://...

# FastAPI (for document processing)
FASTAPI_URL=https://your-fastapi-instance.com
FASTAPI_API_KEY=your-api-key
```

---

## Summary for Developer

### The Key Change:
**Before:** Always used `sender_email` (wrong for representatives)
**After:** Checks `is_representative` flag and uses appropriate email:
- If `is_representative = true` → Use `email_glaeubiger_vertreter`
- If `is_representative = false` → Use `email_glaeubiger`

### Why This Matters:
When a lawyer or debt collector represents a creditor, we must contact THEM, not the original creditor. This ensures:
- ✅ Legal compliance (representatives handle all communication)
- ✅ Proper documentation (responses go to the right party)
- ✅ Faster settlement (representatives have authority to negotiate)

### Files Modified:
1. `server/services/creditorContactService.js` - Lines 302-382
   - Updated filtering logic
   - Added representative email selection
   - Enhanced logging

---

## Questions?

If you need to modify this logic:
1. Search for `is_representative` in the codebase
2. Check `email_glaeubiger_vertreter` field usage
3. Review `getConfirmedCreditorsForClient()` function
4. Test with both direct creditors and representatives

For issues, check:
- MongoDB `final_creditor_list` structure
- Zendesk Side Conversation creation logs
- Email field mappings from document processor
