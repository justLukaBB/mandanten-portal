# Payment Webhook Enhancement - Integration Guide

## Integration Points

### 1. Import the new service in zendesk-webhooks.js:
```javascript
const ImmediateDocumentRequest = require('../services/immediateDocumentRequest');
const immediateDocRequest = new ImmediateDocumentRequest();
```

### 2. Modify the payment confirmation handler:

In `zendesk-webhooks.js`, after line 338 where `payment_ticket_type = 'document_request'` is set:

```javascript
if (!state.hasDocuments) {
  // No documents uploaded yet
  ticketType = 'document_request';
  nextAction = 'send_document_upload_request';
  client.payment_ticket_type = 'document_request';
  client.document_request_sent_at = new Date();
  
  // NEW: Send immediate document request email
  try {
    const immediateResult = await immediateDocRequest.sendImmediateDocumentRequest(client);
    if (immediateResult.success) {
      console.log('✅ Immediate document request sent after payment');
      // The service already updates the client record
    }
  } catch (error) {
    console.error('⚠️ Failed to send immediate document request:', error);
    // Continue with normal flow even if immediate email fails
  }
}
```

### 3. Also add to the main payment webhook handler (around line 672):

```javascript
if (!state.hasDocuments) {
  // SCENARIO 2: No documents uploaded yet
  ticketType = 'glaeubieger_process';
  nextAction = 'send_document_upload_request';
  client.payment_ticket_type = 'document_request';
  client.document_request_sent_at = new Date();
  
  // NEW: Send immediate document request
  try {
    await immediateDocRequest.sendImmediateDocumentRequest(client);
  } catch (error) {
    console.error('⚠️ Immediate document request failed:', error);
  }
  
  // ... rest of the existing code
}
```

## Benefits of This Enhancement

1. **Immediate Response**: Clients receive instructions within seconds of payment, not up to 1 hour later
2. **Better User Experience**: Payment confirmation + next steps in one communication
3. **Reduced Support Calls**: Clear instructions prevent confusion
4. **Maintains Existing Flow**: DocumentReminderService continues to work for follow-up reminders

## Testing the Enhancement

1. Create a test client with payment but no documents:
```javascript
// Test endpoint in server.js
app.post('/test/immediate-document-request/:clientId', authenticateAdmin, async (req, res) => {
  const client = await Client.findOne({ id: req.params.clientId });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  
  const result = await immediateDocRequest.sendImmediateDocumentRequest(client);
  res.json(result);
});
```

2. Monitor the Zendesk ticket for the side conversation email
3. Check client record for updated timestamps and status history