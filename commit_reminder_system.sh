#!/bin/bash

# Navigate to project directory
cd /Users/luka/Documents/Development/Mandanten-Portal

# Add all changes
git add -A

# Create commit with descriptive message
git commit -m "$(cat <<'EOF'
Implement automatic document reminder system for payment workflow

- Added DocumentReminderService to handle automatic reminders every 2 days
- Enhanced payment webhook to detect when documents are missing after payment
- Integrated with Zendesk to update tickets with internal comments
- Added scheduled task to check for reminders every hour
- Created database fields to track reminder state and count
- Added automatic detection when documents are uploaded after reminders
- Implemented progressive urgency levels for reminders (1-5+)
- Added admin endpoints to manually trigger reminder checks
- Created test script for the document reminder workflow

The system now automatically:
1. Detects when payment is confirmed but no documents exist
2. Sends reminders every 2 days via Zendesk internal comments
3. Tracks reminder count and escalates urgency
4. Stops reminders when documents are uploaded
5. Updates workflow status appropriately

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Push to remote
git push origin main

echo "✅ Changes committed and pushed successfully!"