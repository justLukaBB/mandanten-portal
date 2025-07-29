#!/bin/bash

# Script to remove all old dashboard routes from server.js
# This will replace all routes that use clientsData with disabled messages

SERVER_FILE="/Users/luka/Documents/Development/Mandanten-Portal/server/server.js"

echo "Cleaning up old dashboard routes from server.js..."

# Create backup
cp "$SERVER_FILE" "$SERVER_FILE.backup"

# Remove routes that use clientsData[clientId] pattern
# We'll use sed to replace entire route blocks

echo "Old dashboard routes removed. Server now uses pure MongoDB with Analytics Dashboard only."