#!/bin/bash

# Navigate to project directory
cd /Users/luka/Documents/Development/Mandanten-Portal

# Add all changes
git add -A

# Create commit with descriptive message
git commit -m "$(cat <<'EOF'
Implement automatic email reminders via Zendesk side conversations

FEATURES ADDED:
✅ Automatic email when payment confirmed but no documents uploaded
✅ Side conversation integration for direct customer emails  
✅ Portal link and aktenzeichen included in all reminder emails
✅ Progressive urgency levels for follow-up reminders
✅ Customer-friendly email templates with clear instructions

TECHNICAL CHANGES:
- Added createSideConversation method to ZendeskService
- Enhanced payment webhook to automatically send document request email
- Updated DocumentReminderService to send emails via side conversations
- Added document_request_email_sent_at field to Client schema
- Created customer-focused email templates with portal access details

WORKFLOW:
1. Payment confirmed → Check for documents
2. If no documents → Create Zendesk ticket + send email immediately
3. Every 2 days → Send reminder emails with increasing urgency
4. When documents uploaded → Stop reminder loop automatically

EMAIL CONTENT INCLUDES:
- Personal greeting with client name and aktenzeichen
- Portal login link and credentials
- Step-by-step upload instructions
- List of required document types
- Contact information for support
- Escalating urgency for repeated reminders

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Push to remote
git push origin main

echo "✅ Email reminder system committed and pushed successfully!"