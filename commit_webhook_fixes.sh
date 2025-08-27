#!/bin/bash

# Navigate to project directory
cd /Users/luka/Documents/Development/Mandanten-Portal

# Add all changes
git add -A

# Create commit with descriptive message
git commit -m "Fix webhook validation errors and undefined variables

- Added missing ticket_type enum values (payment_review, main_ticket) to Client schema
- Fixed undefined zendeskComment variable reference in payment-confirmed webhook
- Changed to use zendeskTicket variable that is properly defined
- Added safe update fallback when saving zendesk_tickets to handle validation errors
- Added ticket_scenario field to track specific workflow scenarios

This fixes the errors seen when processing payment confirmation webhooks.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push origin main

echo "✅ Webhook fixes committed and pushed successfully!"