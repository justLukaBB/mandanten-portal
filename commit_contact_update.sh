#!/bin/bash

# Navigate to project directory
cd /Users/luka/Documents/Development/Mandanten-Portal

# Add all changes
git add -A

# Create commit with descriptive message
git commit -m "Update contact information in email templates

- Changed support email to info@ra-scuric.de
- Changed phone number to 0234 9136810
- Updated contact details in both payment confirmation emails and reminder emails

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to remote
git push origin main

echo "✅ Contact information updated and pushed successfully!"